import { CONTROL_STATES, SQUARESIZE } from "../constants";
import { Map as GameMap } from "../map";
import { Teams } from "../Teams";

const PRIMARY_RING_OFFSETS = [
    { key: "n",  dx: 0,  dy: -1 },
    { key: "ne", dx: 1,  dy: -1 },
    { key: "e",  dx: 1,  dy: 0 },
    { key: "se", dx: 1,  dy: 1 },
    { key: "s",  dx: 0,  dy: 1 },
    { key: "sw", dx: -1, dy: 1 },
    { key: "w",  dx: -1, dy: 0 },
    { key: "nw", dx: -1, dy: -1 },
];

const COMBAT_STATES = new Set([
    CONTROL_STATES.TRACK_TARGET,
    CONTROL_STATES.ATTACK_MODE,
]);

const ROAM_RESERVATION_MS = 2200;
const ROAM_NEIGHBOR_RADIUS = SQUARESIZE * 0.9;
const OVERFLOW_HOLD_RADIUS = SQUARESIZE * 0.55;
const FRONTLINE_NEARBY_RADIUS = SQUARESIZE * 1.2;

function worldDistance(a, b) {
    if (!a || !b) return Infinity;
    return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));
}

function toWorld(gx, gy) {
    return {
        x: gx * SQUARESIZE + SQUARESIZE / 2,
        y: gy * SQUARESIZE + SQUARESIZE / 2,
    };
}

export class CombatSpacingCoordinator {
    static _roamReservations = new Map();

    static clearTroopFocus(troop) {
        if (!troop) return;
        troop._combatFocusTarget = null;
        troop._combatFocusTargetId = null;
        troop._combatForcedFocus = false;
        troop._combatApproachKey = null;
        troop._combatApproachMode = null;
        troop._combatApproachTargetId = null;
        troop._combatApproachDest = null;
    }

    static setTroopFocusTarget(troop, target, opts = {}) {
        if (!troop || !target?.active || !target?.body) {
            this.clearTroopFocus(troop);
            return null;
        }

        troop._combatFocusTarget = target;
        troop._combatFocusTargetId = this._targetId(target);
        troop._combatForcedFocus = !!opts.forced;
        return target;
    }

    static getTroopFocusTarget(troop) {
        if (!troop) return null;

        const direct = troop._combatFocusTarget;
        if (direct?.active && direct?.body) return direct;

        const forced = troop.forcedTarget;
        if (forced?.active && forced?.body) {
            this.setTroopFocusTarget(troop, forced, { forced: true });
            return forced;
        }

        const tracked = troop.track?.[0]?.gameObject;
        if (tracked?.active && tracked?.body) {
            this.setTroopFocusTarget(troop, tracked, { forced: troop.forcedTarget === tracked });
            return tracked;
        }

        this.clearTroopFocus(troop);
        return null;
    }

    static clearRoamReservation(troop) {
        if (!troop?.id) return;
        this._roamReservations.delete(troop.id);
    }

    static chooseRoamDestination(troop, candidates = []) {
        if (!troop || !candidates.length) return null;
        const now = this._getNow(troop.scene);
        this._pruneRoamReservations(now);

        let best = null;
        let bestScore = Infinity;

        for (const candidate of candidates) {
            if (!candidate) continue;
            const score = this._scoreRoamCandidate(troop, candidate, now);
            if (score < bestScore) {
                bestScore = score;
                best = candidate;
            }
        }

        if (best) {
            this._roamReservations.set(troop.id, {
                team: troop.body?.team,
                x: best.x,
                y: best.y,
                expiresAt: now + ROAM_RESERVATION_MS,
            });
        }

        return best;
    }

    static getTargetAssignmentCounts(teamNumber, target, opts = {}) {
        const excludeTroop = opts.excludeTroop ?? null;
        const focused = this._getFocusedTroopsForTarget(teamNumber, target)
            .filter(troop => troop !== excludeTroop);
        let primary = 0;
        let overflow = 0;

        for (const troop of focused) {
            if (troop._combatApproachTargetId !== this._targetId(target)) continue;
            if (troop._combatApproachMode === "slot") primary += 1;
            else if (troop._combatApproachMode === "overflow") overflow += 1;
        }

        return {
            total: focused.length,
            primary,
            overflow,
        };
    }

    static getAssignmentPressure(teamNumber, target, opts = {}) {
        const counts = this.getTargetAssignmentCounts(teamNumber, target, opts);
        return counts.total * (SQUARESIZE * 1.5) + counts.primary * (SQUARESIZE * 0.5);
    }

    static chooseBestEnemyTarget(troop, targets = [], opts = {}) {
        if (!troop || !targets.length) return null;

        const currentTarget = opts.currentTarget ?? this.getTroopFocusTarget(troop);
        const anchor = opts.anchor ?? troop;
        const priorityFn = typeof opts.priorityFn === "function" ? opts.priorityFn : null;
        const assignmentPriorityFn = typeof opts.assignmentPriorityFn === "function"
            ? opts.assignmentPriorityFn
            : null;
        const teamNumber = troop.body?.team ?? 1;
        const priorityWeight = Number.isFinite(opts.priorityWeight) ? Number(opts.priorityWeight) : 100000;
        const assignmentWeight = Number.isFinite(opts.assignmentWeight) ? Number(opts.assignmentWeight) : 10000;
        const pressureWeight = Number.isFinite(opts.pressureWeight) ? Number(opts.pressureWeight) : 1;
        const anchorWeight = Number.isFinite(opts.anchorWeight) ? Number(opts.anchorWeight) : 1;
        const troopWeight = Number.isFinite(opts.troopWeight) ? Number(opts.troopWeight) : 0.2;
        const keepFocusWeight = Number.isFinite(opts.keepFocusWeight) ? Number(opts.keepFocusWeight) : 1.5;

        let viable = targets.filter(target =>
            target?.active &&
            target?.body &&
            target.body.team !== troop.body?.team
        );
        if (!viable.length) return null;

        if (opts.strictTargetSpread) {
            const unassigned = viable.filter(target =>
                this.getTargetAssignmentCounts(teamNumber, target, { excludeTroop: troop }).total <= 0
            );
            if (unassigned.length) {
                let spreadViable = unassigned;
                const maxExtraDistance = Number(opts.strictTargetSpreadMaxExtraDistance);
                const maxRatio = Number(opts.strictTargetSpreadMaxRatio);
                if (Number.isFinite(maxExtraDistance) || Number.isFinite(maxRatio)) {
                    const closestDistance = viable.reduce((best, target) => {
                        const dist = worldDistance(troop, target);
                        return dist < best ? dist : best;
                    }, Infinity);
                    const maxDistance = Math.min(
                        Number.isFinite(maxExtraDistance) ? closestDistance + Math.max(0, maxExtraDistance) : Infinity,
                        Number.isFinite(maxRatio) ? closestDistance * Math.max(1, maxRatio) : Infinity
                    );
                    const capped = unassigned.filter(target => worldDistance(troop, target) <= maxDistance);
                    if (capped.length) spreadViable = capped;
                    else spreadViable = viable;
                }
                viable = spreadViable;
            }
        }

        let best = null;
        let bestScore = Infinity;

        for (const target of viable) {
            const priorityScore = Number(priorityFn?.(target) ?? 0);
            const assignmentPriorityScore = Number(assignmentPriorityFn?.(target) ?? 0);
            const pressureScore = this.getAssignmentPressure(teamNumber, target, { excludeTroop: troop });
            const anchorScore = worldDistance(anchor, target);
            const troopScore = worldDistance(troop, target) * troopWeight;
            const keepFocusBonus = target === currentTarget ? -(SQUARESIZE * keepFocusWeight) : 0;

            const score =
                priorityScore * priorityWeight +
                assignmentPriorityScore * assignmentWeight +
                pressureScore * pressureWeight +
                anchorScore * anchorWeight +
                troopScore +
                keepFocusBonus;

            if (score < bestScore) {
                bestScore = score;
                best = target;
            }
        }

        return best;
    }

    static pickBestCombatTask(troop, taskList = []) {
        if (!troop || !taskList.length) return null;

        const teamNumber = troop.body?.team ?? 1;
        const currentTarget = this.getTroopFocusTarget(troop);
        let bestTask = null;
        let bestScore = Infinity;

        for (const task of taskList) {
            const target = this.getTaskTarget(task);
            if (!target?.active || !target?.body) continue;

            const pressureScore = this.getAssignmentPressure(teamNumber, target, { excludeTroop: troop });
            const distanceScore = worldDistance(troop, target);
            const forcedBonus = task?.forced ? -(SQUARESIZE * 4) : 0;
            const keepFocusBonus = target === currentTarget ? -(SQUARESIZE * 2) : 0;
            const score = pressureScore + distanceScore + forcedBonus + keepFocusBonus;

            if (score < bestScore) {
                bestScore = score;
                bestTask = task;
            }
        }

        return bestTask;
    }

    static getTaskTarget(task) {
        return task?.target || task?.body?.gameObject || null;
    }

    static getCombatApproach(troop, target) {
        if (!troop || !target?.active || !target?.body) return null;

        this.setTroopFocusTarget(troop, target, { forced: troop.forcedTarget === target });

        const targetId = this._targetId(target);
        const focusedTroops = this._getFocusedTroopsForTarget(troop.body?.team, target);
        if (!focusedTroops.includes(troop)) focusedTroops.push(troop);

        const primarySlots = this._buildRingCandidates(troop, target, 1);
        const overflowSlots = this._buildRingCandidates(troop, target, 2);

        const assignments = this._assignTroopsToSlots(targetId, focusedTroops, primarySlots, overflowSlots);
        const fallback = this._buildFallbackSupportPoint(troop, target);
        const result = assignments.get(troop.id) ?? {
            mode: "overflow",
            key: `fallback:${targetId}:${troop.id}`,
            destination: fallback,
        };

        troop._combatApproachTargetId = targetId;
        troop._combatApproachKey = result.key;
        troop._combatApproachMode = result.mode;
        troop._combatApproachDest = result.destination ? { x: result.destination.x, y: result.destination.y } : null;

        return result;
    }

    static shouldHoldCombatPosition(troop, target, approach = null) {
        if (!troop || !target?.active) return false;
        const plan = approach ?? this.getCombatApproach(troop, target);
        if (!plan || plan.mode !== "overflow" || !plan.destination) return false;

        if (worldDistance(troop, plan.destination) <= OVERFLOW_HOLD_RADIUS) {
            return true;
        }

        const frontline = this._getFocusedTroopsForTarget(troop.body?.team, target).filter(other =>
            other !== troop &&
            other._combatApproachTargetId === this._targetId(target) &&
            other._combatApproachMode === "slot"
        );

        const nearFrontline = frontline.some(other => worldDistance(other, troop) <= FRONTLINE_NEARBY_RADIUS);
        if (!nearFrontline) return false;

        const supportRange = Math.max(SQUARESIZE * 2.4, Number(troop.weapon?.range || 0) * 0.55);
        return worldDistance(troop, target) <= supportRange;
    }

    static _assignTroopsToSlots(targetId, troops, primarySlots, overflowSlots) {
        const entries = troops
            .filter(troop => troop?.active && troop?.body)
            .map(troop => ({
                troop,
                keepSlot: troop._combatApproachTargetId === targetId && troop._combatApproachMode === "slot",
                keepOverflow: troop._combatApproachTargetId === targetId && troop._combatApproachMode === "overflow",
                currentKey: troop._combatApproachTargetId === targetId ? troop._combatApproachKey : null,
                forced: troop.forcedTarget === this.getTroopFocusTarget(troop) || troop._combatForcedFocus,
                dist: worldDistance(troop, this.getTroopFocusTarget(troop)),
            }))
            .sort((a, b) => {
                if (a.keepSlot !== b.keepSlot) return a.keepSlot ? -1 : 1;
                if (a.keepOverflow !== b.keepOverflow) return a.keepOverflow ? -1 : 1;
                if (a.forced !== b.forced) return a.forced ? -1 : 1;
                if (a.dist !== b.dist) return a.dist - b.dist;
                return (a.troop.id ?? 0) - (b.troop.id ?? 0);
            });

        const assignments = new Map();
        const remainingPrimary = new Map(primarySlots.map(slot => [slot.key, slot]));
        const remainingOverflow = new Map(overflowSlots.map(slot => [slot.key, slot]));

        for (const entry of entries) {
            const slot = this._pickBestSlotForTroop(entry.troop, [...remainingPrimary.values()], entry.currentKey);
            if (!slot) continue;
            remainingPrimary.delete(slot.key);
            assignments.set(entry.troop.id, {
                mode: "slot",
                key: slot.key,
                destination: slot.world,
            });
        }

        for (const entry of entries) {
            if (assignments.has(entry.troop.id)) continue;
            const slot = this._pickBestSlotForTroop(entry.troop, [...remainingOverflow.values()], entry.currentKey);
            if (!slot) continue;
            remainingOverflow.delete(slot.key);
            assignments.set(entry.troop.id, {
                mode: "overflow",
                key: slot.key,
                destination: slot.world,
            });
        }

        return assignments;
    }

    static _pickBestSlotForTroop(troop, slots, currentKey = null) {
        if (!slots.length) return null;

        let best = null;
        let bestScore = Infinity;

        for (const slot of slots) {
            const stabilityBonus = slot.key === currentKey ? -(SQUARESIZE * 2.5) : 0;
            const rangedOverflowBias =
                troop.weapon?.projectile && slot.ring === "overflow"
                    ? -(SQUARESIZE * 0.5)
                    : 0;
            const score =
                worldDistance(troop, slot.world) +
                stabilityBonus +
                rangedOverflowBias;

            if (score < bestScore) {
                bestScore = score;
                best = slot;
            }
        }

        return best;
    }

    static _buildRingCandidates(troop, target, radiusTiles = 1) {
        const footprint = this._computeTargetFootprint(target);
        const midX = Math.round(footprint.x + (footprint.w - 1) / 2);
        const midY = Math.round(footprint.y + (footprint.h - 1) / 2);
        const minX = footprint.x - radiusTiles;
        const maxX = footprint.x + footprint.w - 1 + radiusTiles;
        const minY = footprint.y - radiusTiles;
        const maxY = footprint.y + footprint.h - 1 + radiusTiles;

        const raw = [
            { name: "n",  gx: midX, gy: minY },
            { name: "ne", gx: maxX, gy: minY },
            { name: "e",  gx: maxX, gy: midY },
            { name: "se", gx: maxX, gy: maxY },
            { name: "s",  gx: midX, gy: maxY },
            { name: "sw", gx: minX, gy: maxY },
            { name: "w",  gx: minX, gy: midY },
            { name: "nw", gx: minX, gy: minY },
        ];

        const seen = new Set();
        const out = [];

        for (const slot of raw) {
            const key = `${slot.gx},${slot.gy}`;
            if (seen.has(key)) continue;
            seen.add(key);

            if (!this._isWalkableTileForTroop(troop, slot.gx, slot.gy)) continue;
            out.push({
                key: `${radiusTiles}:${slot.name}:${slot.gx},${slot.gy}`,
                ring: radiusTiles === 1 ? "primary" : "overflow",
                gx: slot.gx,
                gy: slot.gy,
                world: toWorld(slot.gx, slot.gy),
            });
        }

        return out;
    }

    static _buildFallbackSupportPoint(troop, target) {
        const dx = troop.x - target.x;
        const dy = troop.y - target.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const guess = {
            x: target.x + ux * SQUARESIZE * 2,
            y: target.y + uy * SQUARESIZE * 2,
        };
        const gx = Math.floor(guess.x / SQUARESIZE);
        const gy = Math.floor(guess.y / SQUARESIZE);

        if (this._isWalkableTileForTroop(troop, gx, gy)) {
            return toWorld(gx, gy);
        }

        return troop._combatApproachDest || { x: troop.x, y: troop.y };
    }

    static _computeTargetFootprint(target) {
        const building = target?.buildingRef;
        if (building && Number.isFinite(building.x) && Number.isFinite(building.y)) {
            const w = Number(building.tileType?.lenX ?? building.lenX ?? 1);
            const h = Number(building.tileType?.lenY ?? building.lenY ?? 1);
            return { x: building.x, y: building.y, w, h };
        }

        if (
            Number.isFinite(target?.x) &&
            Number.isFinite(target?.y) &&
            !target?.body &&
            (Number.isFinite(target?.tileType?.lenX) || Number.isFinite(target?.lenX))
        ) {
            return {
                x: target.x,
                y: target.y,
                w: Number(target.tileType?.lenX ?? target.lenX ?? 1),
                h: Number(target.tileType?.lenY ?? target.lenY ?? 1),
            };
        }

        const tx = Math.floor((target?.x ?? 0) / SQUARESIZE);
        const ty = Math.floor((target?.y ?? 0) / SQUARESIZE);
        return { x: tx, y: ty, w: 1, h: 1 };
    }

    static _isWalkableTileForTroop(troop, gx, gy) {
        const navGrid = troop.body?.team === 0 ? GameMap.enemyNavGrid : GameMap.navGrid;
        if (!navGrid?.length) return false;
        if (gy < 0 || gy >= navGrid.length) return false;
        if (gx < 0 || gx >= (navGrid[0]?.length ?? 0)) return false;
        return navGrid[gy][gx] === 1;
    }

    static _getFocusedTroopsForTarget(teamNumber, target) {
        const team = Teams.teamLists?.[`${teamNumber}`];
        const fighters = team?.fighterList || [];
        return fighters.filter(troop => this._isTroopFocusedOnTarget(troop, target));
    }

    static _isTroopFocusedOnTarget(troop, target) {
        if (!troop?.active || !troop?.body || !target?.active || !target?.body) return false;
        if (!troop.weapon && !troop.isFortGrunt) return false;

        const focused = this.getTroopFocusTarget(troop);
        if (focused !== target) return false;

        return COMBAT_STATES.has(troop.state) || troop.forcedTarget === target;
    }

    static _scoreRoamCandidate(troop, candidate, now) {
        const team = Teams.teamLists?.[`${troop.body?.team}`];
        const allies = team?.playerList || [];
        const distFromTroop = worldDistance(troop, candidate);

        let occupancy = 0;
        for (const ally of allies) {
            if (!ally?.active || ally === troop) continue;
            if (worldDistance(ally, candidate) <= ROAM_NEIGHBOR_RADIUS) occupancy += 1;

            const finalPos = ally.finalPos;
            if (finalPos && worldDistance(finalPos, candidate) <= ROAM_NEIGHBOR_RADIUS) {
                occupancy += 0.8;
            }
        }

        let reservationPenalty = 0;
        for (const reservation of this._roamReservations.values()) {
            if (!reservation || reservation.expiresAt <= now) continue;
            if (reservation.team !== troop.body?.team) continue;
            if (worldDistance(reservation, candidate) <= ROAM_NEIGHBOR_RADIUS) {
                reservationPenalty += 3;
            }
        }

        const lastDest = troop._combatRoamDest;
        const stabilityBonus = lastDest && worldDistance(lastDest, candidate) <= SQUARESIZE * 0.25
            ? -(SQUARESIZE * 0.2)
            : 0;

        return occupancy * (SQUARESIZE * 2) + reservationPenalty * (SQUARESIZE * 3) + distFromTroop + stabilityBonus;
    }

    static _pruneRoamReservations(now) {
        for (const [troopId, reservation] of this._roamReservations.entries()) {
            if (!reservation || reservation.expiresAt <= now) {
                this._roamReservations.delete(troopId);
            }
        }
    }

    static _targetId(target) {
        if (!target) return null;
        return target.id ?? target.body?.id ?? `${Math.floor((target.x ?? 0) / SQUARESIZE)},${Math.floor((target.y ?? 0) / SQUARESIZE)}`;
    }

    static _getNow(scene) {
        return Number(scene?.getSimulationNow?.() ?? scene?.simNowMs ?? Date.now());
    }
}
