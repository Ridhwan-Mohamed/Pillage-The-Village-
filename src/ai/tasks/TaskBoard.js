import { Teams } from "../../Teams";
import { SQUARESIZE } from "../../constants";
import { TaskTicket } from "./TaskTicket";

export class TaskBoard {
    static LEGACY_MAPPINGS = [
        { arrayKey: "fightingList", kind: "enemy_unit", roles: ["Blademaster", "Brawler", "Gunslinger"], maxAssigned: 8 },
        { arrayKey: "enemyDestroyTileStates", kind: "enemy_destroy_tile", roles: ["Blademaster", "Brawler", "Gunslinger"], maxAssigned: 1 },
        { arrayKey: "enemyDestroyStates", kind: "enemy_destroy_block", roles: ["Blademaster", "Brawler", "Gunslinger"], maxAssigned: 5 },

        { arrayKey: "destroyTileStates", kind: "destroy_tile", roles: ["Builder"], maxAssigned: 1 },
        { arrayKey: "destroyStates", kind: "destroy_block", roles: ["Builder"], maxAssigned: 5 },
        { arrayKey: "blockBuildingStates", kind: "build_block", roles: ["Builder"], maxAssigned: 5 },
        { arrayKey: "buildingTileStates", kind: "build_tile", roles: ["Builder"], maxAssigned: 1 },
        { arrayKey: "buildingFixTasks", kind: "fix", roles: ["Builder"], maxAssigned: 1 },

        { arrayKey: "foragerQueue", kind: "forage", roles: ["Forager"], maxAssigned: 1 },
        { arrayKey: "TeamFarmSpots", kind: "harvest", roles: ["Farmer"], maxAssigned: 1 },
        { arrayKey: "tileList", kind: "seed", roles: ["Farmer"], maxAssigned: 1 },
        { arrayKey: "ovenPickupJobs", kind: "oven_unload", roles: ["Fireman"], maxAssigned: 1 },
        { arrayKey: "ovenFuelJobs", kind: "oven_fuel", roles: ["Fireman"], maxAssigned: 1 },
        { arrayKey: "ovenJobs", kind: "oven_fill", roles: ["Fireman"], maxAssigned: 1 },
    ];

    static _ticketId(kind, team, x, y, idx) {
        return `${team}:${kind}:${x},${y}:${idx}`;
    }

    static fromTeam(teamNumber) {
        const team = Teams.teamLists[teamNumber];
        if (!team) return [];

        const out = [];
        for (const map of this.LEGACY_MAPPINGS) {
            const arr = team[map.arrayKey];
            if (!Array.isArray(arr) || !arr.length) continue;

            for (let i = 0; i < arr.length; i++) {
                const task = arr[i];
                if (!task) continue;
                if (task.canceled) continue;
                if (map.kind === "build_block" && task.awaitingSiteClear) continue;
                if (map.kind === "forage" && task.directOrderId) continue;
                if (map.kind === "forage" && (task.forageType === "block" || task.forageType === "seed")) {
                    const node = task.value;
                    const nodeActive = !!(
                        node &&
                        node.active !== false &&
                        node.sprite?.active !== false &&
                        node.container?.active !== false
                    );
                    if (!nodeActive) continue;
                    if (Math.max(0, Number(node.health ?? task.remaining ?? 0)) <= 0) continue;
                }

                if (map.kind === "enemy_unit") {
                    const go = task?.gameObject || task?.target || task;
                    if (!go?.active || !go?.body) continue;
                }
                if (map.kind === "enemy_destroy_tile" && task.breachPlanId && task.breachTargetId && task.breachTargetTeam != null) {
                    const targetTeam = Teams.teamLists?.[`${task.breachTargetTeam}`] ?? Teams.teamLists?.[task.breachTargetTeam];
                    const activeTargetExists = (targetTeam?.playerList || []).some(unit => {
                        if (!unit?.active) return false;
                        const unitId = unit.id ?? unit.body?.id ?? `${Math.floor((unit.x ?? 0) / SQUARESIZE)},${Math.floor((unit.y ?? 0) / SQUARESIZE)}`;
                        return unitId != null && String(unitId) === String(task.breachTargetId);
                    });
                    if (!activeTargetExists) continue;
                }

                const x = task.x ?? task.tx ?? 0;
                const y = task.y ?? task.ty ?? 0;
                const assignedCount = Number(task.assigned || 0);
                const maxAssigned = this._deriveMaxAssigned(task, map.maxAssigned);

                if (assignedCount >= maxAssigned) continue;

                out.push(new TaskTicket({
                    id: this._ticketId(map.kind, teamNumber, x, y, i),
                    kind: map.kind,
                    team: teamNumber,
                    x,
                    y,
                    roleMask: map.roles,
                    hardPriority: task.forced ? 1000 : 0,
                    softPriority: 0,
                    urgency: this._deriveUrgency(task, map.kind),
                    phase: task.phase || "pre_pickup",
                    source: task.forced ? "player_forced" : "queue",
                    assignedCount,
                    maxAssigned,
                    reservationKey: task.reservationKey || null,
                    ref: task,
                    arrayKey: map.arrayKey,
                    payload: task,
                }));
            }
        }

        const needsWater = Teams.getCropsNeedingWater?.(teamNumber) || [];
        for (let i = 0; i < needsWater.length; i++) {
            const task = needsWater[i];
            if (!task || task.canceled) continue;
            const assignedCount = Number(task.assigned || 0);
            const maxAssigned = this._deriveMaxAssigned(task, 1);
            if (assignedCount >= maxAssigned) continue;

            out.push(new TaskTicket({
                id: this._ticketId("water", teamNumber, task.x ?? 0, task.y ?? 0, i),
                kind: "water",
                team: teamNumber,
                x: task.x ?? 0,
                y: task.y ?? 0,
                roleMask: ["Farmer"],
                hardPriority: task.forced ? 1000 : 0,
                softPriority: 0,
                urgency: this._deriveUrgency(task, "water"),
                phase: task.phase || "pre_pickup",
                source: task.forced ? "player_forced" : "queue",
                assignedCount,
                maxAssigned,
                reservationKey: task.reservationKey || null,
                ref: task,
                arrayKey: null,
                payload: task,
            }));
        }

        return out;
    }

    static _deriveMaxAssigned(task, fallback) {
        if (typeof task.workerCapacity === "number" && task.workerCapacity > 0) {
            return task.workerCapacity;
        }
        if (typeof task.amount === "number" && task.amount > 0) return task.amount;
        if (typeof task.remaining === "number") return Math.max(1, task.remaining);
        return fallback;
    }

    static _deriveUrgency(task, kind) {
        if (typeof task.urgency === "number") return task.urgency;
        if (kind === "oven_unload") return 50;
        if (kind === "harvest") return 35;
        if (kind === "enemy_destroy_tile") return 25;
        return 0;
    }
}
