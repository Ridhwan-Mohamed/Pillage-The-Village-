import { Teams } from "../../Teams";
import { CONTROL_STATES } from "../../constants";
import { CombatSpacingCoordinator } from "../CombatSpacingCoordinator";
import { StorageManager } from "../../Manager/StorageManager";
import { AudioManager } from "../../Manager/AudioManager";

export class InterruptController {
    static interruptTroop(troop, reason = "generic_interrupt", targetState = null) {
        if (!troop || !troop.active) return false;

        const ctx = this._snapshot(troop, reason, targetState);
        const shouldDeferCarry = this._isDeferredCarryTask(ctx);

        if (ctx.task && !shouldDeferCarry) {
            this.releaseTaskClaim(ctx);
        }
        if (ctx.task && shouldDeferCarry) {
            this.deferCarryTask(ctx);
        }

        if (troop.timer) {
            troop.timer.remove(false);
            troop.timer = null;
        }

        troop.roam = false;
        troop._combatRoamDest = null;
        CombatSpacingCoordinator.clearRoamReservation(troop);
        CombatSpacingCoordinator.clearTroopFocus(troop);
        if (troop.currentPath?.length) troop.currentPath.length = 0;
        troop.body?.setVelocity?.(0, 0);

        troop.task = null;
        troop.taskMeta = null;

        this._cleanupRoleLocalRefs(troop, shouldDeferCarry);

        if (targetState !== null && targetState !== undefined) {
            Teams.movePlayerState(troop, targetState);
        } else if (troop.state === CONTROL_STATES.FLEE_MODE) {
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
        }

        return true;
    }

    static releaseTaskClaim(ctx) {
        const { task, troop, meta } = ctx;
        if (!task) return;

        if (task.taskType === "storagePickup" && task.storage && task.item) {
            task.storage.releasePickup?.(task.item, 1);
        }

        if (typeof task.assigned === "number" && task.assigned > 0) {
            task.assigned -= 1;
        }

        if (meta?.arrayKey) {
            const team = Teams.teamLists[troop.body.team];
            const arr = team?.[meta.arrayKey];
            if (Array.isArray(arr) && !arr.includes(task)) {
                arr.push(task);
            }
        }

        if (troop.isFarmer && troop.pendingFarmSpot?.reservedBy === troop) {
            troop.pendingFarmSpot.reservedBy = null;
            troop.pendingFarmSpot = null;
        }

    }

    static deferCarryTask(ctx) {
        const { troop, task, meta, reason } = ctx;
        troop.deferredCarry = {
            reason,
            task,
            meta,
            item: troop.carrying ?? null,
            pendingFuelJob: troop.pendingFuelJob ?? null,
            pendingOvenJob: troop.pendingOvenJob ?? null,
            createdAt: Date.now(),
        };
    }

    static _snapshot(troop, reason, targetState) {
        return {
            troop,
            task: troop.task || null,
            meta: troop.taskMeta || null,
            reason,
            targetState,
        };
    }

    static _isDeferredCarryTask(ctx) {
        const troop = ctx.troop;
        const isCarrying = !!troop?.carrying;
        if (!isCarrying) return false;

        if (troop.isFireman && (troop.pendingFuelJob || troop.pendingOvenJob)) {
            return true;
        }

        if (troop.isBuilder && ctx.meta?.phase === "post_pickup") {
            return true;
        }

        return false;
    }

    static _releaseFiremanPending(troop) {
        if (troop.pendingFuelJob?.assigned > 0) troop.pendingFuelJob.assigned -= 1;
        if (troop.pendingOvenJob?.assigned > 0) troop.pendingOvenJob.assigned -= 1;
        troop.pendingFuelJob = null;
        troop.pendingOvenJob = null;
    }

    static _cleanupRoleLocalRefs(troop, deferred) {
        if (troop.isBuilder) {
            AudioManager.setConstructionActive(troop, false);
            if (troop.buildSwingTween) {
                troop.buildSwingTween.remove();
                troop.buildSwingTween = null;
            }
            if (troop.buildSwingFx) {
                troop.buildSwingFx.destroy();
                troop.buildSwingFx = null;
            }
        }
        if (troop.isFireman && !deferred) {
            this._releaseFiremanPending(troop);
            troop.skip = false;
        }
        if (troop.gatherSwingTween) {
            troop.gatherSwingTween.remove();
            troop.gatherSwingTween = null;
        }
        if (troop.gatherSwingFx) {
            troop.gatherSwingFx.destroy();
            troop.gatherSwingFx = null;
        }
        if (troop.isForager) {
            AudioManager.setHarvestActive(troop, "wood", false);
            AudioManager.setHarvestActive(troop, "rock", false);
        }
        if (troop.isFarmer && troop.pendingFarmSpot?.reservedBy === troop) {
            troop.pendingFarmSpot.reservedBy = null;
            troop.pendingFarmSpot = null;
        }
        if (!troop.carrying) {
            StorageManager.releaseDeliveryReservation(troop);
        }
    }
}
