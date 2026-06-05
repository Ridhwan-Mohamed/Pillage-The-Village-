import { CONTROL_STATES } from "../../constants";
import { Manager } from "../../Manager/Manager";
import { StorageManager } from "../../Manager/StorageManager";
import { UI_ITEM_TYPES } from "../../UI/UIConstants";
import { Player } from "../../players/Player";
import { TaskBoard } from "../tasks/TaskBoard";
import { POLICIES } from "../policies";

export class Scheduler {
    static enabledRoles = {
        Builder: true,
        Forager: true,
        Blademaster: true,
        Brawler: true,
        Gunslinger: true,
        Farmer: true,
        Fireman: true,
    };

    static stepUnit(troop) {
        if (!troop?.active || troop.task || troop?._sleepQueued) return false;
        if (troop._buildEvacuating) {
            if (troop.currentPath?.length) return false;
            troop._buildEvacuating = false;
        }
        const role = this._roleForTroop(troop);
        if (!role || !this.enabledRoles[role]) return false;

        if (this._tryCarryRecovery(troop)) return true;

        const policy = POLICIES[role];
        if (!policy) return false;

        const tickets = TaskBoard.fromTeam(troop.body.team);
        const candidates = policy.collectCandidates(troop, tickets);
        if (!candidates.length) return false;

        candidates.sort((a, b) => policy.score(troop, b) - policy.score(troop, a));

        const triedAssignmentGroups = new Set();
        for (const candidate of candidates) {
            const groupKey = this._assignmentGroupKey(candidate);
            if (triedAssignmentGroups.has(groupKey)) continue;
            triedAssignmentGroups.add(groupKey);

            const ok = this._assignCandidate(troop, candidate, candidates);
            if (ok) return true;
        }

        return false;
    }

    static hasAvailableBuilderBuildWork(troop) {
        if (!troop?.active || !troop.isBuilder) return false;
        const policy = POLICIES.Builder;
        if (!policy) return false;

        const tickets = TaskBoard.fromTeam(troop.body.team);
        const candidates = policy.collectCandidates(troop, tickets);
        return candidates.some((candidate) =>
            candidate?.kind === "build_block" || candidate?.kind === "build_tile"
        );
    }

    static _tryCarryRecovery(troop) {
        if (troop.isFarmer) {
            if (troop.pendingFarmSpot && StorageManager.isCarryingItem(troop, UI_ITEM_TYPES.seedCrop)) {
                const plot = troop.pendingFarmSpot;
                if (plot.reservedBy === troop) delete plot.reservedBy;
                troop.pendingFarmSpot = null;
                return Manager.assignTaskToTroop(troop, plot, CONTROL_STATES.FARM_MODE);
            }
        }

        if (troop.isFireman && troop.carrying) {
            if (troop.pendingFuelJob && StorageManager.isCarryingItem(troop, UI_ITEM_TYPES.wood)) {
                return troop.type?.goRefuelOven?.(troop, troop.pendingFuelJob) || false;
            }
            if (troop.pendingOvenJob) {
                return troop.type?.maybeAssignOvenJobDelivery?.(troop, troop.pendingOvenJob, troop.carrying) || false;
            }
        }

        if (troop.deferredCarry && troop.carrying) {
            if (troop.isFireman) {
                const item = troop.deferredCarry.item ?? troop.carrying;
                if (troop.deferredCarry.pendingFuelJob && item?.name === "wood") {
                    const ok = troop.type?.goRefuelOven?.(troop, troop.deferredCarry.pendingFuelJob);
                    if (ok) {
                        troop.deferredCarry = null;
                        return true;
                    }
                } else if (troop.deferredCarry.pendingOvenJob) {
                    const ok = troop.type?.maybeAssignOvenJobDelivery?.(troop, troop.deferredCarry.pendingOvenJob, item);
                    if (ok) {
                        troop.deferredCarry = null;
                        return true;
                    }
                }
            }
        }

        if (StorageManager.isCarrying(troop) && !troop.task) {
            return StorageManager.tryCreateStorageDeliveryTask(troop);
        }
        return false;
    }

    static _assignmentGroupKey(candidate) {
        if (candidate?.kind === "build_tile") {
            return `${candidate.kind}:${candidate.arrayKey ?? ""}`;
        }
        if (candidate?.ref?.breachPlanId) {
            return `${candidate.kind}:breach:${candidate.ref.breachPlanId}`;
        }
        return candidate?.id ?? `${candidate?.kind}:${candidate?.x},${candidate?.y}`;
    }

    static _taskListForCandidate(candidate, candidatePool = []) {
        if (candidate?.ref?.breachPlanId && Array.isArray(candidatePool)) {
            const tasks = candidatePool
                .filter(other =>
                    other?.kind === candidate.kind &&
                    other.ref?.breachPlanId === candidate.ref.breachPlanId
                )
                .map(other => other.ref)
                .filter(Boolean);

            return tasks.length ? tasks : [candidate.ref].filter(Boolean);
        }

        if (candidate?.kind !== "build_tile" || !Array.isArray(candidatePool)) {
            return [candidate?.ref].filter(Boolean);
        }

        const tasks = candidatePool
            .filter(other =>
                other?.kind === candidate.kind &&
                other.arrayKey === candidate.arrayKey
            )
            .map(other => other.ref)
            .filter(Boolean);

        return tasks.length ? tasks : [candidate.ref].filter(Boolean);
    }

    static _assignCandidate(troop, candidate, candidatePool = []) {
        if (!candidate?.kind) return false;

        switch (candidate.kind) {
            case "seed":
                return troop.type?.tryAssignSeedFlow?.(troop, candidate.ref) || false;
            case "water":
                return troop.type?.tryAssignWaterWork?.(troop, candidate.ref) || false;
            case "oven_fuel":
                return troop.type?.assignFromOvenFuelJobs?.(troop) || false;
            case "oven_fill":
                return troop.type?.assignFromOvenJobs?.(troop) || false;
            case "enemy_unit": {
                const target = candidate.ref?.gameObject || candidate.ref?.target || candidate.ref;
                if (!target?.active || !target?.body) return false;
                return Manager.assignOneTroopToAction(troop, [candidate.ref], CONTROL_STATES.TRACK_TARGET);
            }
            case "enemy_destroy_block": {
                const ok = Manager.assignOneTroopToAction(troop, [candidate.ref], CONTROL_STATES.DESTROY_MODE);
                if (ok) return true;

                const target = candidate.ref?.value?.buildingRef || candidate.ref?.value || candidate.ref;
                if (Player._planBreachTicketsForTarget?.(troop, target)) return true;
                return false;
            }
            default: {
                const state = this._stateForTicket(candidate.kind);
                if (state == null) return false;
                return Manager.assignOneTroopToAction(
                    troop,
                    this._taskListForCandidate(candidate, candidatePool),
                    state
                );
            }
        }
    }

    static _roleForTroop(troop) {
        if (troop.isBuilder) return "Builder";
        if (troop.isForager) return "Forager";
        if (troop.isFarmer) return "Farmer";
        if (troop.isFireman) return "Fireman";
        if (troop.isBlademaster) return "Blademaster";
        if (troop.isBrawler) return "Brawler";
        if (troop.isGunslinger) return "Gunslinger";
        return null;
    }

    static _stateForTicket(kind) {
        switch (kind) {
            case "enemy_destroy_tile":
            case "destroy_tile":
                return CONTROL_STATES.DESTROY_MODE_T;
            case "enemy_unit":
                return CONTROL_STATES.TRACK_TARGET;
            case "enemy_destroy_block":
            case "destroy_block":
                return CONTROL_STATES.DESTROY_MODE;
            case "build_block":
                return CONTROL_STATES.BUILD_MODE_B;
            case "build_tile":
                return CONTROL_STATES.BUILD_MODE_T;
            case "fix":
                return CONTROL_STATES.FIX_BUILDING;
            case "forage":
                return CONTROL_STATES.TRACK_MODE;
            case "harvest":
                return CONTROL_STATES.R_FARM_MODE;
            case "seed":
                return CONTROL_STATES.FARM_MODE;
            case "water":
                return CONTROL_STATES.WATER_CROPS_MODE;
            case "oven_unload":
                return CONTROL_STATES.GET_FROM_OVEN;
            case "oven_fuel":
            case "oven_fill":
                return CONTROL_STATES.SEND_TO_OVEN;
            default:
                return null;
        }
    }
}
