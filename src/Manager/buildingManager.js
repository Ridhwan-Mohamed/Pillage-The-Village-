import { Player } from "../players/Player"
import { Teams } from "../Teams"
import { Map } from "../map"
import { BLOCKDEPTH, colorFor, CONTROL_STATES, removeFromArray, showAlert, showGhostText, SQUARESIZE, TILE_MAP, TILE_TYPES, UIDEPTH } from "../constants"
import { Manager } from "./Manager"
import { buildingArray } from "../town"
import { ClayOven } from "../buildings/ClayOven"
import { StorageBuilding } from "../buildings/Storage"
import { House } from "../buildings/House"
import { Turret } from "../buildings/Turret"
import { Catapult } from "../buildings/Catapult"
import { TowerBuilding } from "../buildings/Tower"
import { DailyNeedsTracker } from "../UI/DailyNeedsTracker"
import { UI_ITEM_TYPES } from "../UI/UIConstants"
import { AudioManager } from "./AudioManager"
import { StorageManager } from "./StorageManager"
import { PathRegistry } from "../lib/navmesh/PathRegistry"
import { PathRepair } from "../lib/navmesh/PathRepair"
import { Wall } from "../buildings/Wall"
import { Builder } from "../players/Builder"
import { Raider } from "../players/Raider"
import { Brawler } from "../players/Brawler"
import { Blademaster } from "../players/Blademaster"
import { Gunslinger } from "../players/Gunslinger"
import { Projectile } from "../Projectile"
import { Scheduler } from "../ai/scheduler/Scheduler"
import { InterruptController } from "../ai/scheduler/InterruptController"
import { updateDirectionalAnimationFromVelocity } from "../players/PlayerDirectionalAnimator"
import { fightManager } from "./fightManager"
import { getMarketWorkDuration } from "../Cards/MarketBuffs"

export class buildingManager{

    static NavMeshUpdater;
    static EnemyNavMeshUpdater;
    static scene;
    static blockBuildingDuration = 250;
    static tileBuildingDuration = 1000;
    static repairTickDuration = 1000;
    static playerWallDemolitionDamage = 45;
    static playerBuildingDemolitionDamage = 45;
    static _selectedWallJobId = null;
    static _selectedWallJobTeamNumber = 1;
    static _hoveredWallJobId = null;
    static _hoveredWallJobTeamNumber = 1;
    static _selectedDestroyJobId = null;
    static _selectedDestroyJobTeamNumber = 1;
    static _hoveredDestroyJobId = null;
    static _hoveredDestroyJobTeamNumber = 1;
    static _selectedConstructionTask = null;
    static _selectedConstructionTeamNumber = 1;

    static _destroyTargetForTask(task) {
        return task?.value?.buildingRef || task?.value || null;
    }

    static _destroyTargetHealth(target) {
        if (!target) return { current: 0, max: 1, key: "health" };
        const key = ("health" in target) ? "health" : (("hp" in target) ? "hp" : "health");
        const rawMax = Number(target.maxHealth ?? target.maxHp ?? target[key] ?? 1);
        const max = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 1;
        const rawCurrent = Number(target[key] ?? max);
        const current = Number.isFinite(rawCurrent) ? Math.max(0, rawCurrent) : max;
        return { current, max, key };
    }

    static _isDestroyTargetAlive(taskOrTarget) {
        const target = taskOrTarget?.value ? this._destroyTargetForTask(taskOrTarget) : taskOrTarget;
        if (!target || target._destroyed || target._isDestroyed || target.sprite?._destroyed) return false;
        if (target.sprite && target.sprite.active === false) return false;
        if (target.baseSprite && target.baseSprite.active === false) return false;
        return this._destroyTargetHealth(target).current > 0;
    }

    static _syncDestroyTaskHealth(task) {
        const target = this._destroyTargetForTask(task);
        if (!target) return null;
        const health = this._destroyTargetHealth(target);
        task.duration = health.current;
        task.totalDuration = health.max;
        return { target, ...health };
    }

    static applyDestroyDamage(task, damage) {
        const target = this._destroyTargetForTask(task);
        if (!target || !this._isDestroyTargetAlive(target)) {
            if (task) task.duration = 0;
            return { target, destroyed: true, current: 0, max: 1 };
        }

        const amount = Math.max(0, Number(damage) || 0);
        let { current, max, key } = this._destroyTargetHealth(target);
        let destroyed = false;

        if (typeof target.takeDamage === "function") {
            destroyed = !!target.takeDamage(amount);
            ({ current, max, key } = this._destroyTargetHealth(target));
        } else {
            const next = Math.max(0, current - amount);
            target[key] = next;
            if ("maxHealth" in target) target.maxHealth = max;
            else if ("maxHp" in target) target.maxHp = max;
            target.onDamaged?.(amount, next, max);
            current = next;
            destroyed = current <= 0;
        }

        if (task) {
            task.duration = Math.max(0, current);
            task.totalDuration = max;
        }

        return { target, destroyed: destroyed || current <= 0, current, max };
    }

    static _clearInvalidDestroyTask(sprite, task) {
        if (sprite?.timer) {
            sprite.timer.remove(false);
            sprite.timer = null;
        }
        const teamNumber = sprite?.body?.team;
        if (teamNumber != null && task) {
            this._clearQueuedDestroyTaskVisual(task);
            const team = Teams.teamLists?.[teamNumber] ?? Teams.teamLists?.[`${teamNumber}`];
            const removeDirect = (arrayKey) => {
                const arr = team?.[arrayKey];
                if (!Array.isArray(arr)) return;
                const idx = arr.indexOf(task);
                if (idx !== -1) arr.splice(idx, 1);
            };
            if (task.queueKey) removeDirect(task.queueKey);
            else {
                removeDirect("destroyStates");
                removeDirect("destroyTileStates");
                removeDirect("enemyDestroyStates");
                removeDirect("enemyDestroyTileStates");
            }
            if (task?.destroyJobId) this.refreshQueuedDestroyJobVisuals(teamNumber);
        }
        if (sprite) {
            if (sprite.task === task) sprite.task = null;
            sprite.taskMeta = null;
            sprite.play?.(sprite.idle);
            Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_MODE);
        }
        if (teamNumber != null && task?.destroyJobId) {
            this._activateLinkedBuildsIfDestroyJobComplete(task.destroyJobId, teamNumber);
        }
    }
    static _wallJobSeed = 1;
    static _destroyJobSeed = 1;
    static _buildTaskSeed = 1;

    static createBuildTileStateArray(tiles, teamNumber, buildTypeName = null) {
        const team = Teams.teamLists[teamNumber];
        if (!Array.isArray(team.buildingTileStates)) team.buildingTileStates = [];

        let queuedAny = false;
        tiles.forEach(tile => {
                const typeName = tile.buildTypeName ?? buildTypeName ?? "wall";
                const buildType = TILE_TYPES[typeName] ?? TILE_TYPES.wall;
                if (Map.isPlacementTooCloseToShore?.(tile.x, tile.y, 1, 1, { placementType: buildType }, buildType)) {
                    this._refundQueuedBuildCost({
                        type: buildType,
                        buildType,
                        refundCost: tile.refundCost ?? buildType.cost ?? buildType.price ?? null,
                        prepaid: !!tile.prepaid,
                    }, teamNumber);
                    return;
                }

                const task = {
                x: tile.x,
                y: tile.y,
                assigned: 0,
                type: buildType,
                buildType,
                buildTypeName: typeName,
                teamNumber: Number(teamNumber),
                refundCost: tile.refundCost ?? buildType.cost ?? buildType.price ?? null,
                prepaid: !!tile.prepaid,
                wallJobId: tile.wallJobId ?? null,
                wallJobOrder: tile.wallJobOrder ?? team.buildingTileStates.length,
                queueKey: "buildingTileStates",
                };
                team.buildingTileStates.push(task);
                queuedAny = true;
        });

        if (!queuedAny) return;
        this.prepareQueuedWallJobPlans(teamNumber);
        this.refreshQueuedTileBuildGhosts(teamNumber);
        this.assingTroopsToBuildTile?.(teamNumber);
    }

    static createWallJobId(teamNumber = 1) {
        const seed = this._wallJobSeed++;
        return `wall-job-${Number(teamNumber) || 1}-${seed}`;
    }

    static createDestroyJobId(teamNumber = 1) {
        const seed = this._destroyJobSeed++;
        return `destroy-job-${Number(teamNumber) || 1}-${Date.now()}-${seed}`;
    }

    static createBuildTaskId(teamNumber = 1) {
        const seed = this._buildTaskSeed++;
        return `build-task-${Number(teamNumber) || 1}-${Date.now()}-${seed}`;
    }

    static getSelectedBuilders(teamNumber = 1) {
        const normalizedTeam = Number(teamNumber);
        return Player.selected
            .filter(troop => troop?.active && troop.isBuilder && troop.body?.team === normalizedTeam);
    }

    static _taskCenterWorld(task) {
        if (task?.value?.sprite?.getBounds) {
            const bounds = task.value.sprite.getBounds();
            return {
                x: bounds.centerX,
                y: bounds.centerY,
            };
        }
        const lenX = task?.type?.lenX ?? task?.buildType?.lenX ?? 1;
        const lenY = task?.type?.lenY ?? task?.buildType?.lenY ?? 1;
        return {
            x: (task.x + lenX / 2) * SQUARESIZE,
            y: (task.y + lenY / 2) * SQUARESIZE,
        };
    }

    static _sortedBuildersForTask(builders, task) {
        const center = this._taskCenterWorld(task);
        return [...builders].sort((a, b) =>
            Phaser.Math.Distance.Between(a.x, a.y, center.x, center.y) -
            Phaser.Math.Distance.Between(b.x, b.y, center.x, center.y)
        );
    }

    static _releaseBuildersOnTask(task, keepIds = new Set()) {
        if (!task) return;
        const teamNumber = task?.value?.teamNumber ?? task?.value?.team ?? 1;
        const team = Teams.teamLists[teamNumber];
        const builders = team?.builderList || [];

        for (const troop of builders) {
            if (!troop?.active || troop.task !== task) continue;
            if (keepIds.has(troop.id)) continue;
            Player.handleStateIntteruptStart(troop, CONTROL_STATES.TRACK_MODE);
            troop.play?.(troop.idle);
            Scheduler.stepUnit(troop);
        }
    }

    static interruptBuilderFixForQueuedBuild(troop) {
        if (!troop?.active || troop.state !== CONTROL_STATES.FIX_BUILDING || !troop.task) return false;

        const task = troop.task;
        Player.handleStateIntteruptStart(troop, CONTROL_STATES.TRACK_MODE);
        this._clearBuilderBuildPresentation(troop);
        AudioManager.setConstructionActive(troop, false);
        troop.play?.(troop.idle);
        this.ensureFixTaskVisual(task);
        return true;
    }

    static _sameQueuedBuildTask(a, b) {
        if (!a || !b) return false;
        if (a === b) return true;
        const aType = a.buildType?.name ?? a.type?.name ?? a.buildTypeName ?? null;
        const bType = b.buildType?.name ?? b.type?.name ?? b.buildTypeName ?? null;
        return a.x === b.x && a.y === b.y && aType === bType;
    }

    static _clearBuilderQueuedBuildState(troop, {
        queueKey = null,
        removeQueueTask = false,
        clearGhost = false,
    } = {}) {
        if (!troop?.active || !troop?.body) return;

        const teamNumber = troop.body.team;
        const team = Teams.teamLists[teamNumber];
        const task = troop.task;
        const resolvedQueueKey = queueKey ?? troop.taskMeta?.arrayKey ?? task?.queueKey ?? null;

        if (task && typeof task.assigned === "number" && task.assigned > 0) {
            task.assigned -= 1;
        }
        if (removeQueueTask && resolvedQueueKey && task) {
            Teams.removeFromStateArray(teamNumber, resolvedQueueKey, task);
        }
        if (task && resolvedQueueKey === "buildingTileStates" && !removeQueueTask) {
            task._constructionStarted = false;
            task._buildStartedAt = null;
            this._stopConstructionTaskUiTicker(task);
            this.updateConstructionHoverText(task);
        }
        if (clearGhost && task) {
            if (resolvedQueueKey === "blockBuildingStates") this.clearQueuedBlockBuildGhost(task);
            else this.clearQueuedTileBuildGhost(task);
        }

        if (troop.timer) {
            troop.timer.remove(false);
            troop.timer = null;
        }

        this._clearBuilderBuildPresentation(troop);

        AudioManager.setConstructionActive(troop, false);
        troop.task = null;
        troop.taskMeta = null;
        troop.buildType = null;
        troop.destX = null;
        troop.destY = null;
        troop.currentPath?.splice?.(0);
        troop.body?.setVelocity?.(0, 0);
        troop.play?.(troop.idle);
        Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
    }

    static _releaseOtherBuildersForQueuedBuild(task, teamNumber, keepTroop = null, queueKey = null) {
        const team = Teams.teamLists[teamNumber];
        const builders = team?.builderList || [];
        for (const troop of builders) {
            if (!troop?.active || troop === keepTroop || !troop.task) continue;
            if (!this._sameQueuedBuildTask(troop.task, task)) continue;
            this._clearBuilderQueuedBuildState(troop, {
                queueKey,
                removeQueueTask: false,
                clearGhost: false,
            });
        }
    }

    static assignSelectedBuildersToTask(task, state, selectedBuilders = this.getSelectedBuilders()) {
        if (!task || !selectedBuilders.length) return false;
        if (state === CONTROL_STATES.BUILD_MODE_B && this._isBlockBuildAwaitingSiteClear(task)) return false;
        const keepIds = new Set(selectedBuilders.map(troop => troop.id));
        this._releaseBuildersOnTask(task, keepIds);

        let assigned = false;
        for (const troop of this._sortedBuildersForTask(selectedBuilders, task)) {
            if (!troop?.active) continue;
            if (troop.task === task) return true;
            Player.handleStateIntteruptStart(troop, CONTROL_STATES.TRACK_MODE);
            if (Manager.assignTaskToTroop(troop, task, state)) {
                assigned = true;
                if (Manager.tooManyAssigned(task, state)) break;
            }
        }
        return assigned;
    }

    static ensureFixTask(building, teamNumber = 1) {
        teamNumber = Number(teamNumber);
        if (!building) return null;
        const team = Teams.teamLists[teamNumber];
        if (!team) return null;
        if (!Array.isArray(team.buildingFixTasks)) team.buildingFixTasks = [];
        const taskType = building.buildType ?? building.type ?? building.tileType ?? TILE_TYPES.house1;

        let task = team.buildingFixTasks.find(existing =>
            existing?.value === building ||
            (existing?.x === (building.gridX ?? building.x) &&
             existing?.y === (building.gridY ?? building.y))
        );

        if (!task) {
            task = {
                x: building.gridX ?? building.x,
                y: building.gridY ?? building.y,
                type: taskType,
                value: building,
                assigned: 0,
                queueKey: "buildingFixTasks",
            };
            team.buildingFixTasks.push(task);
        }

        task.x = building.gridX ?? building.x;
        task.y = building.gridY ?? building.y;
        task.type = taskType;

        this.ensureFixTaskVisual(task);
        return task;
    }

    static queueAutoFixForBuilding(building, teamNumber = building?.teamNumber ?? building?.team ?? building?.body?.team ?? 1) {
        if (!building || building._destroyed || building.sprite?._destroyed) return null;

        teamNumber = Number(teamNumber);
        const team = Teams.teamLists[teamNumber];
        if (!team) return null;
        if (teamNumber !== 1 && !team.builderList?.some(builder => builder?.active !== false)) return null;

        const maxHp = Number(building.maxHealth ?? 0);
        const hp = Number(building.health ?? building.hp ?? maxHp);
        if (!Number.isFinite(maxHp) || maxHp <= 0) return null;
        if (!Number.isFinite(hp) || hp <= 0 || hp >= maxHp) return null;

        return this.ensureFixTask(building, teamNumber);
    }

    static requestBuildingFix(building, teamNumber = 1, selectedBuilders = this.getSelectedBuilders(teamNumber)) {
        teamNumber = Number(teamNumber);
        if (!building) return { ok: false, reason: "missing" };
        const maxHp = (building.maxHealth ?? 100);
        const hp = (building.health ?? building.hp ?? 0);
        if (hp >= maxHp) {
            showAlert(this.scene, "No repair needed", "#a7f3d0");
            return { ok: false, reason: "full" };
        }

        const task = this.ensureFixTask(building, teamNumber);
        if (!task) return { ok: false, reason: "task" };

        if (selectedBuilders.length) {
            const assigned = this.assignSelectedBuildersToTask(task, CONTROL_STATES.FIX_BUILDING, selectedBuilders);
            return { ok: assigned, reason: assigned ? "assigned" : "unreachable", task };
        }

        return { ok: true, reason: "queued", task };
    }

    static handleBuildingClickForBuilders(building, openFallback, teamNumber = 1) {
        teamNumber = Number(teamNumber);
        const selectedBuilders = this.getSelectedBuilders(teamNumber);
        if (!selectedBuilders.length) {
            openFallback?.();
            return false;
        }

        this.requestBuildingFix(building, teamNumber, selectedBuilders);
        return true;
    }

    static _wallFamilyForTypeName(typeName) {
        if (typeName === "wall" || typeName === "wall_door") return "stone";
        if (typeName === "woodWall" || typeName === "woodWall_door") return "wood";
        return null;
    }

    static _isQueuedWallTask(task) {
        const typeName = task?.buildTypeName ?? task?.buildType?.name ?? task?.type?.name ?? null;
        return this._wallFamilyForTypeName(typeName) != null;
    }

    static _tileKey(x, y) {
        return `${x},${y}`;
    }

    static _taskTileKey(task) {
        return this._tileKey(task?.x, task?.y);
    }

    static _wallApproachDirections() {
        return [
            [0, -1], [0, 1], [1, 0], [-1, 0],
        ];
    }

    static _cardinalDirections() {
        return [[0, -1], [1, 0], [0, 1], [-1, 0]];
    }

    static _teamForBuildQueue(teamNumber = 1) {
        return Teams.teamLists?.[teamNumber] ?? Teams.teamLists?.[`${teamNumber}`] ?? null;
    }

    static _queuedTileTaskAt(x, y, teamNumber = 1) {
        const team = this._teamForBuildQueue(teamNumber);
        const queue = Array.isArray(team?.buildingTileStates) ? team.buildingTileStates : [];
        return queue.find((task) => task?.x === x && task?.y === y) || null;
    }

    static isTileReservedForWallBuild(x, y, teamNumber = 1) {
        const task = this._queuedTileTaskAt(x, y, teamNumber);
        return !!(task && this._isQueuedWallTask(task));
    }

    static isTileReservedForFarm(x, y, teamNumber = 1) {
        const team = Teams.teamLists?.[teamNumber] ?? Teams.teamLists?.[`${teamNumber}`];
        const tillList = Array.isArray(team?.tileList) ? team.tileList : [];
        return tillList.some((task) => task?.x === x && task?.y === y);
    }

    static isFarmTileBlockedByBuildReservation(x, y, teamNumber = 1) {
        if (Map.navGrid?.[y]?.[x] !== 1) return true;
        if (this.isTileReservedForWallBuild(x, y, teamNumber)) return true;
        if (this._queuedBlockBuildCovers(x, y, teamNumber)) return true;
        return false;
    }

    static isFarmTaskBlockedByBuildReservation(task, teamNumber = 1) {
        if (!task) return true;
        return this.isFarmTileBlockedByBuildReservation(task.x, task.y, teamNumber);
    }

    static _queuedBlockBuildCovers(x, y, teamNumber = null) {
        const teams = teamNumber == null
            ? Object.values(Teams.teamLists || {})
            : [this._teamForBuildQueue(teamNumber)];

        for (const team of teams) {
            const queue = Array.isArray(team?.blockBuildingStates) ? team.blockBuildingStates : [];
            for (const task of queue) {
                const lenX = Math.max(1, Number(task?.type?.lenX ?? task?.buildType?.lenX ?? 1));
                const lenY = Math.max(1, Number(task?.type?.lenY ?? task?.buildType?.lenY ?? 1));
                if (
                    x >= task.x &&
                    x < task.x + lenX &&
                    y >= task.y &&
                    y < task.y + lenY
                ) {
                    return true;
                }
            }
        }
        return false;
    }

    static _wallJobTasks(wallJobId, teamNumber = 1) {
        if (!wallJobId) return [];
        const team = this._teamForBuildQueue(teamNumber);
        const queue = Array.isArray(team?.buildingTileStates) ? team.buildingTileStates : [];
        return queue.filter((task) => task?.wallJobId === wallJobId && this._isQueuedWallTask(task));
    }

    static prepareQueuedWallJobPlans(teamNumber = 1) {
        const team = this._teamForBuildQueue(teamNumber);
        const queue = Array.isArray(team?.buildingTileStates) ? team.buildingTileStates : [];
        const grouped = new globalThis.Map();

        for (const task of queue) {
            if (!task?.wallJobId || !this._isQueuedWallTask(task)) continue;
            if (!grouped.has(task.wallJobId)) grouped.set(task.wallJobId, []);
            grouped.get(task.wallJobId).push(task);
        }

        for (const tasks of grouped.values()) {
            if (tasks.every((task) => Number.isFinite(Number(task._wallBuildDepth)))) {
                continue;
            }
            const depthByKey = this._computeWallJobDepths(tasks);
            for (const task of tasks) {
                if (Number.isFinite(Number(task._wallBuildDepth))) continue;
                const key = this._taskTileKey(task);
                task._wallBuildDepth = depthByKey.get(key) ?? 0;
            }
        }
    }

    static _computeWallJobDepths(tasks = []) {
        const taskByKey = new globalThis.Map();
        for (const task of tasks) {
            taskByKey.set(this._taskTileKey(task), task);
        }

        const depthByKey = new globalThis.Map();
        const queue = [];
        const dirs = this._wallApproachDirections();

        for (const task of tasks) {
            const touchesOutside = dirs.some(([dx, dy]) =>
                !taskByKey.has(this._tileKey(task.x + dx, task.y + dy))
            );
            if (!touchesOutside) continue;
            const key = this._taskTileKey(task);
            depthByKey.set(key, 0);
            queue.push(task);
        }

        if (!queue.length) {
            for (const task of tasks) {
                depthByKey.set(this._taskTileKey(task), 0);
            }
            return depthByKey;
        }

        while (queue.length) {
            const task = queue.shift();
            const nextDepth = (depthByKey.get(this._taskTileKey(task)) ?? 0) + 1;

            for (const [dx, dy] of dirs) {
                const nextKey = this._tileKey(task.x + dx, task.y + dy);
                if (!taskByKey.has(nextKey) || depthByKey.has(nextKey)) continue;
                const nextTask = taskByKey.get(nextKey);
                depthByKey.set(nextKey, nextDepth);
                queue.push(nextTask);
            }
        }

        for (const task of tasks) {
            const key = this._taskTileKey(task);
            if (!depthByKey.has(key)) depthByKey.set(key, 0);
        }

        return depthByKey;
    }

    static _now() {
        return Number(this.scene?.time?.now ?? 0);
    }

    static _destroyAttackDuration(sprite) {
        const duration = Number(sprite?.weapon?.duration);
        return getMarketWorkDuration(sprite, Number.isFinite(duration) && duration > 0 ? duration : 700);
    }

    static isQueuedBuildTaskDeferred(task, troop = null) {
        if (this._isBlockBuildAwaitingSiteClear(task)) return true;
        const until = Number(task?._deferredUntil || 0);
        if (!(until > 0)) return false;
        const now = Number(troop?.scene?.time?.now ?? this._now());
        if (now < until) return true;
        task._deferredUntil = 0;
        task._deferredReason = null;
        task._deferredRetryEvent?.remove?.(false);
        task._deferredRetryEvent = null;
        return false;
    }

    static _deferQueuedBuildTask(task, reason = "blocked", delayMs = 350) {
        if (!task) return;
        const delay = Math.max(100, Number(delayMs) || 350);
        const teamNumber = Number(task.teamNumber ?? task.value?.teamNumber ?? 1) || 1;
        task._deferredReason = reason;
        task._lastDeferredReason = reason;
        task._deferredCount = Math.max(0, Number(task._deferredCount || 0)) + 1;
        task._deferredUntil = this._now() + delay;
        task._constructionStarted = false;
        task._buildStartedAt = null;
        task._deferredRetryEvent?.remove?.(false);
        task._deferredRetryEvent = this.scene?.time?.delayedCall?.(delay + 25, () => {
            task._deferredRetryEvent = null;
            const team = Teams.teamLists?.[teamNumber] ?? Teams.teamLists?.[`${teamNumber}`];
            const queueKey = task.queueKey || "buildingTileStates";
            if (!Array.isArray(team?.[queueKey]) || !team[queueKey].includes(task)) return;
            task._deferredUntil = 0;
            task._deferredReason = null;
            this.updateConstructionHoverText(task);
            this.assingTroopsToBuildTile?.(teamNumber);
        });
        this._stopConstructionTaskUiTicker(task);
        this.updateConstructionHoverText(task);
    }

    static orderBuildTileTasksForTroop(troop, taskList = []) {
        if (!Array.isArray(taskList) || taskList.length <= 1) return taskList;
        this.prepareQueuedWallJobPlans(troop?.body?.team ?? 1);

        const originX = Number(troop?.body?.x ?? troop?.x);
        const originY = Number(troop?.body?.y ?? troop?.y);
        const distanceScore = (task) => {
            const center = this._taskCenterWorld(task);
            const dx = center.x - originX;
            const dy = center.y - originY;
            return (dx * dx) + (dy * dy);
        };

        return [...taskList].sort((a, b) => {
            const aWall = this._isQueuedWallTask(a) && !!a?.wallJobId;
            const bWall = this._isQueuedWallTask(b) && !!b?.wallJobId;
            if (aWall !== bWall) return aWall ? -1 : 1;

            if (aWall && bWall) {
                const depthDiff = Number(b._wallBuildDepth || 0) - Number(a._wallBuildDepth || 0);
                if (depthDiff !== 0) return depthDiff;
            }

            const distDiff = distanceScore(a) - distanceScore(b);
            if (distDiff !== 0) return distDiff;
            return Number(a?.wallJobOrder ?? 0) - Number(b?.wallJobOrder ?? 0);
        });
    }

    static _unitOnTile(x, y, { ignoreTroop = null, teamNumber = null } = {}) {
        for (const troop of Player.troops || []) {
            if (!troop?.active || troop === ignoreTroop) continue;
            if (teamNumber != null && Number(troop.body?.team) !== Number(teamNumber)) continue;
            const gx = Math.floor(troop.x / SQUARESIZE);
            const gy = Math.floor(troop.y / SQUARESIZE);
            if (gx === x && gy === y) return troop;
        }
        return null;
    }

    static _tileReservedByOtherBuilder(x, y, troop, task) {
        const teamNumber = troop?.body?.team;
        for (const other of Player.troops || []) {
            if (!other?.active || other === troop) continue;
            if (Number(other.body?.team) !== Number(teamNumber)) continue;
            if (!other.isBuilder) continue;
            if (other.destX === x && other.destY === y) return true;
            if (other.task && other.task !== task && other.task.x === x && other.task.y === y) return true;
        }
        return false;
    }

    static _sameJobTemporaryApproachAllowed(approachTask, targetTask) {
        if (!approachTask || !targetTask?.wallJobId) return false;
        if (approachTask === targetTask) return false;
        if (approachTask.wallJobId !== targetTask.wallJobId) return false;
        if (!this._isQueuedWallTask(approachTask) || !this._isQueuedWallTask(targetTask)) return false;

        const approachDepth = Number(approachTask._wallBuildDepth || 0);
        const targetDepth = Number(targetTask._wallBuildDepth || 0);
        return approachDepth <= targetDepth;
    }

    static _canUseBuildApproachTile(tx, ty, troop, task) {
        const { navGrid } = Player._getNavForTroop(troop);
        if (tx < 0 || ty < 0 || ty >= navGrid.length || tx >= navGrid[0].length) return false;
        if (navGrid[ty]?.[tx] !== 1) return false;
        if (this._queuedBlockBuildCovers(tx, ty)) return false;
        if (this._tileReservedByOtherBuilder(tx, ty, troop, task)) return false;
        if (this._unitOnTile(tx, ty, { ignoreTroop: troop, teamNumber: troop?.body?.team })) return false;

        const queuedTile = this._queuedTileTaskAt(tx, ty, troop?.body?.team ?? 1);
        if (!queuedTile) return true;

        if (this._sameJobTemporaryApproachAllowed(queuedTile, task)) {
            return Number(queuedTile.assigned || 0) <= 0;
        }

        return false;
    }

    static _wallJobAccessBounds(tasks = [], extraCells = []) {
        const cells = [];
        for (const task of tasks || []) {
            if (Number.isFinite(Number(task?.x)) && Number.isFinite(Number(task?.y))) {
                cells.push({ x: Number(task.x), y: Number(task.y) });
            }
        }
        for (const cell of extraCells || []) {
            if (Number.isFinite(Number(cell?.x)) && Number.isFinite(Number(cell?.y))) {
                cells.push({ x: Number(cell.x), y: Number(cell.y) });
            }
        }
        if (!cells.length) return null;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const cell of cells) {
            minX = Math.min(minX, cell.x);
            minY = Math.min(minY, cell.y);
            maxX = Math.max(maxX, cell.x);
            maxY = Math.max(maxY, cell.y);
        }
        const gridH = Map.navGrid?.length ?? 0;
        const gridW = gridH ? (Map.navGrid[0]?.length ?? 0) : 0;
        if (!gridW || !gridH) return null;
        const margin = 2;
        return {
            minX: Math.max(0, minX - margin),
            minY: Math.max(0, minY - margin),
            maxX: Math.min(gridW - 1, maxX + margin),
            maxY: Math.min(gridH - 1, maxY + margin),
        };
    }

    static _friendlyTroops(teamNumber = 1) {
        return (Player.troops || []).filter((troop) =>
            troop?.active && Number(troop.body?.team) === Number(teamNumber)
        );
    }

    static _troopTile(troop) {
        if (!troop) return null;
        return {
            x: Math.floor(troop.x / SQUARESIZE),
            y: Math.floor(troop.y / SQUARESIZE),
        };
    }

    static _activeWallBuildTroops(teamNumber = 1, wallJobId = null) {
        return this._friendlyTroops(teamNumber).filter((troop) => {
            const task = troop?.task;
            if (!troop?.isBuilder || !task || !this._isQueuedWallTask(task)) return false;
            if (wallJobId && task.wallJobId !== wallJobId) return false;
            return true;
        });
    }

    static _isActiveSameWallJobBuilder(troop, task) {
        return !!(
            troop?.isBuilder &&
            troop.task &&
            troop.task !== task &&
            this._isQueuedWallTask(troop.task) &&
            troop.task.wallJobId === task?.wallJobId
        );
    }

    static _uniqueTroops(troops = []) {
        const out = [];
        const seen = new Set();
        for (const troop of troops) {
            if (!troop?.active || seen.has(troop.id)) continue;
            seen.add(troop.id);
            out.push(troop);
        }
        return out;
    }

    static _addFootprintKeysForQueuedBlocks(set, teamNumber = 1) {
        const team = this._teamForBuildQueue(teamNumber);
        const queue = Array.isArray(team?.blockBuildingStates) ? team.blockBuildingStates : [];
        for (const task of queue) {
            const lenX = Math.max(1, Number(task?.type?.lenX ?? task?.buildType?.lenX ?? 1));
            const lenY = Math.max(1, Number(task?.type?.lenY ?? task?.buildType?.lenY ?? 1));
            for (let y = task.y; y < task.y + lenY; y++) {
                for (let x = task.x; x < task.x + lenX; x++) {
                    set.add(this._tileKey(x, y));
                }
            }
        }
    }

    static _wallTaskAccessAnalysis(task, teamNumber = 1) {
        if (!task?.wallJobId || !this._isQueuedWallTask(task)) {
            return { unsafe: false, reason: null, troopsToEvacuate: [] };
        }

        if (this.isTileReservedForFarm(task.x, task.y, teamNumber)) {
            return {
                unsafe: true,
                reason: "reserved_by_farm",
                troopsToEvacuate: [],
            };
        }

        const jobTasks = this._wallJobTasks(task.wallJobId, teamNumber);
        if (!jobTasks.length) return { unsafe: false, reason: null, troopsToEvacuate: [] };
        this.prepareQueuedWallJobPlans(teamNumber);
        const allZeroDepthJob = jobTasks.every((jobTask) => Number(jobTask?._wallBuildDepth || 0) === 0);

        const candidateKey = this._taskTileKey(task);
        const sameJobQueued = new Set(jobTasks.map((jobTask) => this._taskTileKey(jobTask)));
        const activeWallTroops = this._activeWallBuildTroops(teamNumber);
        const activeSameJobTroops = activeWallTroops.filter((troop) => troop.task?.wallJobId === task.wallJobId);
        const simulatedBlocked = new Set([candidateKey]);
        this._addFootprintKeysForQueuedBlocks(simulatedBlocked, teamNumber);

        for (const troop of activeWallTroops) {
            if (!troop.task || troop.task === task) continue;
            simulatedBlocked.add(this._taskTileKey(troop.task));
        }

        const protectedCells = [];
        const troopsToEvacuate = [];
        const activeSameJobBlockers = [];

        for (const troop of this._friendlyTroops(teamNumber)) {
            const tile = this._troopTile(troop);
            if (!tile) continue;
            protectedCells.push({ ...tile, kind: "troop_current", troop });
            if (this._tileKey(tile.x, tile.y) === candidateKey) {
                if (this._isActiveSameWallJobBuilder(troop, task)) activeSameJobBlockers.push(troop);
                else troopsToEvacuate.push(troop);
            }
        }

        for (const troop of activeSameJobTroops) {
            if (Number.isFinite(Number(troop.destX)) && Number.isFinite(Number(troop.destY))) {
                protectedCells.push({
                    x: Number(troop.destX),
                    y: Number(troop.destY),
                    kind: "builder_approach",
                    troop,
                });
            }
        }

        const bounds = this._wallJobAccessBounds(jobTasks, [
            ...protectedCells,
            ...Array.from(simulatedBlocked, (key) => {
                const [x, y] = key.split(",").map(Number);
                return { x, y };
            }),
        ]);
        if (!bounds) return { unsafe: false, reason: null, troopsToEvacuate: [] };

        const flood = new Set();
        const queue = [];
        const dirs = this._wallApproachDirections();
        const moveDirs = this._cardinalDirections();

        const inBounds = (x, y) =>
            x >= bounds.minX && x <= bounds.maxX &&
            y >= bounds.minY && y <= bounds.maxY;

        const currentlyWalkableForBuilders = (x, y) => {
            const derived = Map._deriveNavStateForCell?.(x, y);
            if (derived) return derived.player === 1;
            return Map.navGrid?.[y]?.[x] === 1;
        };

        const standable = (x, y) => {
            if (!inBounds(x, y)) return false;
            const key = this._tileKey(x, y);
            if (simulatedBlocked.has(key)) return false;

            const queued = this._queuedTileTaskAt(x, y, teamNumber);
            if (queued && queued.wallJobId !== task.wallJobId) return false;

            if (sameJobQueued.has(key)) {
                return currentlyWalkableForBuilders(x, y);
            }

            return Map.navGrid?.[y]?.[x] === 1;
        };

        const enqueue = (x, y) => {
            const key = this._tileKey(x, y);
            if (flood.has(key) || !standable(x, y)) return;
            flood.add(key);
            queue.push({ x, y });
        };

        for (let x = bounds.minX; x <= bounds.maxX; x++) {
            enqueue(x, bounds.minY);
            enqueue(x, bounds.maxY);
        }
        for (let y = bounds.minY + 1; y <= bounds.maxY - 1; y++) {
            enqueue(bounds.minX, y);
            enqueue(bounds.maxX, y);
        }

        while (queue.length) {
            const cell = queue.shift();
            for (const [dx, dy] of moveDirs) {
                enqueue(cell.x + dx, cell.y + dy);
            }
        }

        if (troopsToEvacuate.length || activeSameJobBlockers.length) {
            return {
                unsafe: true,
                reason: troopsToEvacuate.length ? "target_occupied" : "target_used_by_active_builder",
                troopsToEvacuate: this._uniqueTroops(troopsToEvacuate),
                simulatedBlocked,
                candidateKey,
                flood,
            };
        }

        if (allZeroDepthJob) {
            return { unsafe: false, reason: null, troopsToEvacuate: [] };
        }

        for (const cell of protectedCells) {
            const key = this._tileKey(cell.x, cell.y);
            if (!standable(cell.x, cell.y) || !flood.has(key)) {
                const deferForActiveBuilder = this._isActiveSameWallJobBuilder(cell.troop, task);
                if (cell.troop && !deferForActiveBuilder) troopsToEvacuate.push(cell.troop);
                return {
                    unsafe: true,
                    reason: deferForActiveBuilder
                        ? "active_builder_access"
                        : cell.kind === "builder_approach" ? "approach_sealed" : "would_trap_troop",
                    troopsToEvacuate: this._uniqueTroops(troopsToEvacuate),
                    simulatedBlocked,
                    candidateKey,
                    flood,
                };
            }
        }

        for (const remaining of jobTasks) {
            const key = this._taskTileKey(remaining);
            if (key === candidateKey) continue;

            const hasReachableApproach = dirs.some(([dx, dy]) => {
                const ax = remaining.x + dx;
                const ay = remaining.y + dy;
                return standable(ax, ay) && flood.has(this._tileKey(ax, ay));
            });

            if (!hasReachableApproach) {
                return {
                    unsafe: true,
                    reason: "seals_access",
                    troopsToEvacuate: [],
                    simulatedBlocked,
                    candidateKey,
                    flood,
                };
            }
        }

        return { unsafe: false, reason: null, troopsToEvacuate: [], simulatedBlocked, candidateKey, flood };
    }

    static _wallTaskWouldSealNeededAccess(task, teamNumber = 1) {
        const result = this._wallTaskAccessAnalysis(task, teamNumber);
        return !!result.unsafe;
    }

    static _wallEvacuationPassable(x, y, troop, simulatedBlocked = new Set()) {
        const { navGrid } = Player._getNavForTroop(troop);
        if (x < 0 || y < 0 || y >= navGrid.length || x >= navGrid[0].length) return false;
        if (navGrid[y]?.[x] !== 1) return false;
        if (simulatedBlocked.has(this._tileKey(x, y))) return false;
        if (this._queuedBlockBuildCovers(x, y, troop?.body?.team)) return false;
        return true;
    }

    static _wallEvacuationDestinationSafe(x, y, troop, simulatedBlocked = new Set(), reachable = null) {
        if (!this._wallEvacuationPassable(x, y, troop, simulatedBlocked)) return false;
        const key = this._tileKey(x, y);
        if (reachable && !reachable.has(key)) return false;
        if (this._queuedTileTaskAt(x, y, troop?.body?.team)) return false;
        if (this.isTileReservedForFarm(x, y, troop?.body?.team)) return false;
        if (this._unitOnTile(x, y, { ignoreTroop: troop, teamNumber: troop?.body?.team })) return false;
        return true;
    }

    static _manualPathFromCells(troop, cells = []) {
        if (!troop || cells.length < 2) return null;
        return [
            { x: troop.x, y: troop.y },
            ...cells.slice(1).map((cell) => ({
                x: cell.x * SQUARESIZE + SQUARESIZE / 2,
                y: cell.y * SQUARESIZE + SQUARESIZE / 2,
            })),
        ];
    }

    static _findStraightBuildEvacuationPath(troop, simulatedBlocked = new Set(), reachable = null) {
        const start = this._troopTile(troop);
        if (!start) return null;
        const { navGrid } = Player._getNavForTroop(troop);
        for (const [dx, dy] of this._cardinalDirections()) {
            const cells = [{ ...start }];
            let x = start.x;
            let y = start.y;
            for (let step = 0; step < Math.max(navGrid.length, navGrid[0]?.length || 0); step++) {
                x += dx;
                y += dy;
                if (x < 0 || y < 0 || y >= navGrid.length || x >= navGrid[0].length) break;
                if (!this._wallEvacuationPassable(x, y, troop, simulatedBlocked)) break;
                cells.push({ x, y });
                if (this._wallEvacuationDestinationSafe(x, y, troop, simulatedBlocked, reachable)) {
                    return this._manualPathFromCells(troop, cells);
                }
            }
        }
        return null;
    }

    static _findBuildEvacuationPath(troop, simulatedBlocked = new Set(), reachable = null) {
        const straight = this._findStraightBuildEvacuationPath(troop, simulatedBlocked, reachable);
        if (straight?.length) return straight;

        const start = this._troopTile(troop);
        if (!start) return null;
        const { navGrid } = Player._getNavForTroop(troop);
        const startKey = this._tileKey(start.x, start.y);
        const queue = [{ ...start }];
        const seen = new Set([startKey]);
        const prev = new globalThis.Map();

        while (queue.length) {
            const cell = queue.shift();
            const cellKey = this._tileKey(cell.x, cell.y);
            if (
                cellKey !== startKey &&
                this._wallEvacuationDestinationSafe(cell.x, cell.y, troop, simulatedBlocked, reachable)
            ) {
                const route = [];
                let key = cellKey;
                while (key) {
                    const [x, y] = key.split(",").map(Number);
                    route.push({ x, y });
                    key = prev.get(key);
                }
                route.reverse();
                return this._manualPathFromCells(troop, route);
            }

            for (const [dx, dy] of this._cardinalDirections()) {
                const nx = cell.x + dx;
                const ny = cell.y + dy;
                const nextKey = this._tileKey(nx, ny);
                if (seen.has(nextKey)) continue;
                if (nx < 0 || ny < 0 || ny >= navGrid.length || nx >= navGrid[0].length) continue;
                if (!this._wallEvacuationPassable(nx, ny, troop, simulatedBlocked)) continue;
                seen.add(nextKey);
                prev.set(nextKey, cellKey);
                queue.push({ x: nx, y: ny });
            }
        }
        return null;
    }

    static _interruptTroopForBuildEvacuation(troop) {
        if (!troop?.active) return false;
        if (
            troop.isBuilder &&
            (troop.state === CONTROL_STATES.BUILD_MODE_T || troop.state === CONTROL_STATES.BUILD_MODE_B) &&
            troop.task
        ) {
            this._clearBuilderQueuedBuildState(troop, {
                queueKey: troop.taskMeta?.arrayKey ?? troop.task?.queueKey ?? null,
                removeQueueTask: false,
                clearGhost: false,
            });
            return true;
        }
        return InterruptController.interruptTroop(troop, "build_evacuation", CONTROL_STATES.TRACK_MODE);
    }

    static _evacuateTroopForBuildSafety(troop, analysis = {}) {
        if (!troop?.active) return false;
        const now = this._now();
        if (troop._buildEvacuationUntil && troop._buildEvacuationUntil > now && troop.currentPath?.length) {
            return true;
        }

        const evacuationBlocked = new Set(analysis.simulatedBlocked || []);
        if (analysis.candidateKey) evacuationBlocked.delete(analysis.candidateKey);
        const path = this._findBuildEvacuationPath(troop, evacuationBlocked, analysis.flood || null);
        if (!path?.length) return false;

        this._interruptTroopForBuildEvacuation(troop);
        troop._buildEvacuationUntil = now + 1200;
        troop._buildEvacuating = true;
        troop.roam = true;
        Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
        Player.moveTo(troop, path);
        return true;
    }

    static _evacuateTroopsForBuildSafety(troops = [], analysis = {}) {
        for (const troop of this._uniqueTroops(troops)) {
            this._evacuateTroopForBuildSafety(troop, analysis);
        }
    }

    static evacuateBlockedFriendlyTroops(teamNumber = 1) {
        for (const troop of this._friendlyTroops(teamNumber)) {
            const tile = this._troopTile(troop);
            if (!tile) continue;
            const { navGrid } = Player._getNavForTroop(troop);
            if (navGrid?.[tile.y]?.[tile.x] === 1) continue;
            this._evacuateTroopForBuildSafety(troop, {
                simulatedBlocked: new Set(),
                flood: null,
            });
        }
    }

    static _wallTaskTargetOccupied(task, teamNumber = 1) {
        if (!task || !this._isQueuedWallTask(task)) return false;
        return !!this._unitOnTile(task.x, task.y, { teamNumber });
    }

    static _deferWallTaskIfUnsafe(task, teamNumber = 1) {
        if (!task?.wallJobId || !this._isQueuedWallTask(task)) return false;
        const analysis = this._wallTaskAccessAnalysis(task, teamNumber);
        if (analysis.unsafe) {
            this._deferQueuedBuildTask(task, analysis.reason || "unsafe_access", 500);
            this._evacuateTroopsForBuildSafety(analysis.troopsToEvacuate || [], analysis);
            return true;
        }
        return false;
    }

    static _queuedWallPieceAngle(gridVal, family) {
        const def = family === "wood" ? TILE_TYPES.woodWall : TILE_TYPES.wall;
        if (gridVal === def.interior) return 0;
        if (gridVal === def.sides.up) return 0;
        if (gridVal === def.sides.right) return 90;
        if (gridVal === def.sides.down) return 180;
        if (gridVal === def.sides.left) return 270;
        if (gridVal === def.corners.topLeft) return 0;
        if (gridVal === def.corners.topRight) return 90;
        if (gridVal === def.corners.bottomRight) return 180;
        if (gridVal === def.corners.bottomLeft) return 270;
        return 0;
    }

    static _queuedWallDisplayInfo(task, queueTasks = []) {
        const typeName = task?.buildTypeName ?? task?.buildType?.name ?? task?.type?.name ?? null;
        const family = this._wallFamilyForTypeName(typeName);
        if (!family) return null;

        const isDoor = typeName === "wall_door" || typeName === "woodWall_door";
        const queueMap = new globalThis.Map();
        for (const queuedTask of queueTasks) {
            const queuedTypeName = queuedTask?.buildTypeName ?? queuedTask?.buildType?.name ?? queuedTask?.type?.name ?? null;
            if (!this._wallFamilyForTypeName(queuedTypeName)) continue;
            queueMap.set(`${queuedTask.x},${queuedTask.y}`, queuedTypeName);
        }

        const placedWallOrDoorAt = (x, y) => {
            const info = Map._wallStructureInfoAt?.(x, y) || null;
            return !!info;
        };
        const solidAt = (x, y) => queueMap.has(`${x},${y}`) || placedWallOrDoorAt(x, y);

        const up = solidAt(task.x, task.y - 1);
        const down = solidAt(task.x, task.y + 1);
        const left = solidAt(task.x - 1, task.y);
        const right = solidAt(task.x + 1, task.y);
        const count = (up ? 1 : 0) + (down ? 1 : 0) + (left ? 1 : 0) + (right ? 1 : 0);

        if (isDoor) {
            const angle = up && down ? 90 : (left && right ? 0 : ((up || down) ? 90 : 0));
            return { key: typeName, angle, alpha: 0.46, isDoor: true };
        }

        const def = family === "wood" ? TILE_TYPES.woodWall : TILE_TYPES.wall;
        let gridVal = def.interior;

        if (count === 1) {
            if (up) gridVal = def.sides.right;
            else if (right) gridVal = def.sides.up;
            else if (down) gridVal = def.sides.left;
            else gridVal = def.sides.down;
        } else if (count === 2) {
            if (up && down && !left && !right) gridVal = def.sides.right;
            else if (left && right && !up && !down) gridVal = def.sides.up;
            else if (up && left && !right && !down) gridVal = def.corners.bottomRight;
            else if (up && right && !left && !down) gridVal = def.corners.bottomLeft;
            else if (down && left && !right && !up) gridVal = def.corners.topRight;
            else if (down && right && !left && !up) gridVal = def.corners.topLeft;
        }

        const key = family === "wood"
            ? (gridVal === def.interior ? "woodWall_interior" : Object.values(def.sides).includes(gridVal) ? "woodWall_edge" : "woodWall_corner")
            : (gridVal === def.interior ? "wall_interior" : Object.values(def.sides).includes(gridVal) ? "wall_edge" : "wall_corner");

        return {
            key,
            angle: this._queuedWallPieceAngle(gridVal, family),
            alpha: 0.4,
            isDoor: false,
        };
    }

    static _bindQueuedTileGhostInteractions(task, sprite, teamNumber = 1) {
        sprite.removeAllListeners?.();
        const isWallJobTask = this._isQueuedWallTask(task) && !!task?.wallJobId;

        sprite.on("pointerover", () => {
            const baseAlpha = Math.max(0.1, Number(task._ghostBaseAlpha || sprite.alpha || 0.68));
            sprite.setAlpha(Math.min(baseAlpha + 0.16, 0.84));
            if (isWallJobTask) this.setQueuedWallJobHover(task.wallJobId, teamNumber);
        });

        sprite.on("pointerout", () => {
            sprite.setAlpha(Number(task._ghostBaseAlpha || 0.68));
            if (isWallJobTask && this._hoveredWallJobId === task.wallJobId) this.setQueuedWallJobHover(null, teamNumber);
        });

        sprite.on("pointerdown", () => {
            if (isWallJobTask) {
                const selectedBuilders = this.getSelectedBuilders(teamNumber);
                if (!selectedBuilders.length) {
                    this.selectQueuedWallJob(task.wallJobId, teamNumber);
                    return;
                }
            }
            const selectedBuilders = this.getSelectedBuilders(teamNumber);
            if (selectedBuilders.length) {
                this.assignSelectedBuildersToTask(task, CONTROL_STATES.BUILD_MODE_T, selectedBuilders);
                return;
            }
            this.selectQueuedConstructionTask(task, teamNumber);
        });
    }

    static _resolveQueuedBuildTeamNumber(task, fallback = 1) {
        return Number(task?.teamNumber ?? task?.value?.teamNumber ?? task?.value?.team ?? fallback ?? 1) || 1;
    }

    static _getTaskDisplayName(task) {
        const type = task?.type ?? task?.buildType ?? null;
        const raw = type?.displayName || type?.name || task?.buildTypeName || "Building";
        if (raw === "woodWall") return "Wood Wall";
        if (raw === "wall") return "Stone Wall";
        if (raw === "wall_door") return "Stone Door";
        if (raw === "woodWall_door") return "Wood Door";
        return String(raw)
            .replace(/_/g, " ")
            .replace(/\b\w/g, (m) => m.toUpperCase());
    }

    static _currentConstructionPercent(task) {
        if (!task) return 0;
        if (task.queueKey === "buildingTileStates" && task._constructionStarted) {
            const total = Math.max(1, Number(task.totalDuration || this.tileBuildingDuration || 1));
            const startedAt = Number(task._buildStartedAt || 0);
            if (startedAt > 0 && this.scene?.time) {
                const elapsed = Math.max(0, Number(this.scene.time.now || 0) - startedAt);
                return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
            }
        }

        const total = Math.max(1, Number(task.totalDuration || task.duration || 1));
        const done = total - Number(task.duration ?? total);
        return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
    }

    static _ensureConstructionTaskUi(task) {
        const scene = this.scene;
        if (!scene?.add || !task?.constructionSprite) return;

        if (this._isQueuedWallTask(task)) {
            task.labelBg?.destroy?.();
            task.labelBg = null;
            task.labelText?.destroy?.();
            task.labelText = null;
            return;
        }

        if (task.labelBg?.active) {
            task.labelBg.destroy();
        }
        task.labelBg = null;

        if (!task.labelText?.active) {
            task.labelText = scene.add.text(0, 0, "", {
                fontSize: "11px",
                fill: "#ffffff",
                stroke: "#000000",
                strokeThickness: 3,
                align: "center",
                fontFamily: "Bungee",
            })
                .setOrigin(0.5, 0.5)
                .setDepth(UIDEPTH + 6)
                .setScrollFactor(1);
        }
    }

    static _clearConstructionTaskUi(task) {
        if (!task) return;
        task._uiTicker?.remove?.(false);
        task._uiTicker = null;
        task.labelText?.destroy?.();
        task.labelText = null;
        if (this._selectedConstructionTask === task) {
            this.clearQueuedConstructionSelection(this._selectedConstructionTeamNumber);
        }
    }

    static _queuedWallJobTasks(wallJobId, teamNumber = 1) {
        if (!wallJobId) return [];
        const team = Teams.teamLists?.[teamNumber] ?? Teams.teamLists?.[`${teamNumber}`];
        const queueTasks = Array.isArray(team?.buildingTileStates) ? team.buildingTileStates : [];
        return queueTasks.filter((task) => task?.wallJobId === wallJobId && this._isQueuedWallTask(task));
    }

    static _teamForDestroyQueue(teamNumber = 1) {
        return Teams.teamLists?.[teamNumber] ?? Teams.teamLists?.[`${teamNumber}`] ?? null;
    }

    static _destroyQueueEntries(teamNumber = 1) {
        const team = this._teamForDestroyQueue(teamNumber);
        if (!team) return [];
        return [
            { key: "destroyTileStates", tasks: Array.isArray(team.destroyTileStates) ? team.destroyTileStates : [] },
            { key: "destroyStates", tasks: Array.isArray(team.destroyStates) ? team.destroyStates : [] },
        ];
    }

    static _queuedDestroyJobTasks(destroyJobId, teamNumber = 1) {
        if (!destroyJobId) return [];
        const tasks = [];
        for (const entry of this._destroyQueueEntries(teamNumber)) {
            for (const task of entry.tasks) {
                if (task?.destroyJobId !== destroyJobId) continue;
                task.queueKey = task.queueKey ?? entry.key;
                tasks.push(task);
            }
        }
        return tasks;
    }

    static _destroyTaskDisplayName(task) {
        if (task?.queueKey === "destroyTileStates") return "Wall";
        return this._getTaskDisplayName(task);
    }

    static _clearQueuedDestroyTaskVisual(task) {
        if (!task) return;
        task.destroyWarningXTween?.remove?.();
        task.destroyWarningXTween = null;
        task.destroyWarningX?.destroy?.();
        task.destroyWarningX = null;
        task.destroyMarker?.destroy?.();
        task.destroyMarker = null;
    }

    static _ensureQueuedDestroyWarningX(task, x, y, size, depth) {
        if (!task || !this.scene?.add) return null;

        let warningX = task.destroyWarningX;
        if (!warningX || !warningX.active) {
            warningX = this.scene.add.text(x, y, "X", {
                fontSize: `${Math.max(14, Math.min(22, Math.round(size * 0.42)))}px`,
                fill: "#ff2222",
                stroke: "#3a0000",
                strokeThickness: 4,
                fontFamily: "Bungee",
            })
                .setOrigin(0.5, 0.5)
                .setDepth(depth)
                .setAlpha(0.95)
                .setScrollFactor(1);

            task.destroyWarningX = warningX;
            task.destroyWarningXTween?.remove?.();
            task.destroyWarningXTween = this.scene.tweens?.add?.({
                targets: warningX,
                alpha: 0.28,
                duration: 420,
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut",
            }) ?? null;
        } else {
            warningX.setPosition(x, y);
            warningX.setFontSize?.(Math.max(14, Math.min(22, Math.round(size * 0.42))));
        }

        warningX.setDepth(depth);
        warningX.setVisible(true);
        return warningX;
    }

    static _bindQueuedDestroyGhostInteractions(task, marker, teamNumber = 1) {
        marker.removeAllListeners?.();
        marker.on("pointerover", () => {
            marker.setAlpha(0.32);
            this.setQueuedDestroyJobHover(task.destroyJobId, teamNumber);
        });
        marker.on("pointerout", () => {
            marker.setAlpha(0.18);
            if (this._hoveredDestroyJobId === task.destroyJobId) {
                this.setQueuedDestroyJobHover(null, teamNumber);
            }
        });
        marker.on("pointerdown", () => {
            const selectedBuilders = this.getSelectedBuilders(teamNumber);
            if (selectedBuilders.length) {
                const state = task.queueKey === "destroyTileStates"
                    ? CONTROL_STATES.DESTROY_MODE_T
                    : CONTROL_STATES.DESTROY_MODE;
                this.assignSelectedBuildersToTask(task, state, selectedBuilders);
                return;
            }
            this.selectQueuedDestroyJob(task.destroyJobId, teamNumber);
        });
    }

    static ensureQueuedDestroyTaskVisual(task, teamNumber = 1, queueKey = null) {
        if (!task?.destroyJobId || !this.scene?.add) return null;
        teamNumber = Number(teamNumber || 1);
        task.queueKey = task.queueKey ?? queueKey ?? "destroyStates";

        const isTileTask = task.queueKey === "destroyTileStates";
        const lenX = isTileTask ? 1 : Math.max(1, Number(task?.type?.lenX ?? 1));
        const lenY = isTileTask ? 1 : Math.max(1, Number(task?.type?.lenY ?? 1));
        const width = lenX * SQUARESIZE;
        const height = lenY * SQUARESIZE;
        const x = (task.x + lenX / 2) * SQUARESIZE;
        const y = (task.y + lenY / 2) * SQUARESIZE;

        let marker = task.destroyMarker;
        if (!marker || !marker.active) {
            marker = this.scene.add.rectangle(x, y, width, height, 0xff2a2a, 0.18)
                .setStrokeStyle(isTileTask ? 2 : 3, 0xff4040, 0.9)
                .setDepth(UIDEPTH + 1)
                .setInteractive({ useHandCursor: true });
            task.destroyMarker = marker;
            this._bindQueuedDestroyGhostInteractions(task, marker, teamNumber);
        } else {
            marker.setPosition(x, y);
            marker.setDisplaySize(width, height);
        }

        const isSelected =
            task.destroyJobId === this._selectedDestroyJobId &&
            Number(teamNumber) === Number(this._selectedDestroyJobTeamNumber || 1);
        const isHovered =
            task.destroyJobId === this._hoveredDestroyJobId &&
            Number(teamNumber) === Number(this._hoveredDestroyJobTeamNumber || 1);

        marker.clearTint?.();
        if (isSelected) marker.setTintFill?.(0xffe7a1);
        else if (isHovered) marker.setTintFill?.(0xffb4a1);
        marker.setAlpha(isSelected ? 0.42 : isHovered ? 0.34 : 0.18);
        marker.setDepth(UIDEPTH + (isSelected ? 3 : isHovered ? 2 : 1));
        marker.setVisible(true);
        this._ensureQueuedDestroyWarningX(
            task,
            x,
            y,
            Math.min(width, height),
            UIDEPTH + (isSelected ? 6 : isHovered ? 5 : 4)
        );
        return marker;
    }

    static refreshQueuedDestroyJobVisuals(teamNumber = 1) {
        teamNumber = Number(teamNumber || 1);
        const entries = this._destroyQueueEntries(teamNumber);
        const hasJob = (jobId) => entries.some((entry) =>
            entry.tasks.some((task) => task?.destroyJobId === jobId)
        );

        if (this._selectedDestroyJobTeamNumber === teamNumber && this._selectedDestroyJobId && !hasJob(this._selectedDestroyJobId)) {
            this._selectedDestroyJobId = null;
        }
        if (this._hoveredDestroyJobTeamNumber === teamNumber && this._hoveredDestroyJobId && !hasJob(this._hoveredDestroyJobId)) {
            this._hoveredDestroyJobId = null;
        }

        for (const entry of entries) {
            for (const task of entry.tasks) {
                if (!task?.destroyJobId) continue;
                this.ensureQueuedDestroyTaskVisual(task, teamNumber, entry.key);
            }
        }
        this._syncBuildQueueCommandBar();
    }

    static _commandBar() {
        return this.scene?.uiScene?.selectionCommandBar ?? null;
    }

    static _formatCommandRefund(costObj = null) {
        if (!costObj || typeof costObj !== "object") return "no refund";
        const parts = [];
        for (const [key, rawAmount] of Object.entries(costObj)) {
            const amount = Math.max(0, Number(rawAmount) || 0);
            if (!(amount > 0)) continue;
            if (key === "money") parts.push(`$${amount}`);
            else if (key === "permits") parts.push(`${amount} permit${amount === 1 ? "" : "s"}`);
            else parts.push(`${amount} ${String(key).replace(/_/g, " ")}`);
        }
        return parts.join(" | ") || "no refund";
    }

    static _sumTaskRefunds(tasks = []) {
        const bundle = {};
        for (const task of tasks) {
            const cost = task?.refundCost ?? task?.type?.cost ?? task?.buildType?.cost ?? task?.type?.price ?? task?.buildType?.price ?? null;
            if (!cost || typeof cost !== "object") continue;
            for (const [key, rawAmount] of Object.entries(cost)) {
                const amount = Math.max(0, Number(rawAmount) || 0);
                if (!(amount > 0)) continue;
                bundle[key] = Math.max(0, Number(bundle[key] || 0)) + amount;
            }
        }
        return bundle;
    }

    static _isQueuedConstructionTaskLive(task, teamNumber = 1) {
        if (!task) return false;
        const normalizedTeam = Number(teamNumber || this._resolveQueuedBuildTeamNumber(task, 1));
        const queueKey = task.queueKey ?? task.taskMeta?.arrayKey ?? null;
        const team = Teams.teamLists?.[normalizedTeam] ?? Teams.teamLists?.[`${normalizedTeam}`];
        const queue = Array.isArray(team?.[queueKey]) ? team[queueKey] : [];
        return queue.some((queuedTask) => this._sameQueuedBuildTask(queuedTask, task));
    }

    static _syncBuildQueueCommandBar() {
        const bar = this._commandBar();
        if (!bar) return;
        if (this.scene?.destroyWallMode) {
            bar.clearContext?.("build-queue");
            return;
        }

        const wallTasks = this._queuedWallJobTasks(this._selectedWallJobId, this._selectedWallJobTeamNumber);
        if (wallTasks.length) {
            bar.setContext("build-queue", {
                helperText: () => {
                    const refundText = this._formatCommandRefund(this._sumTaskRefunds(wallTasks));
                    return `WALL QUEUE | ${wallTasks.length} tiles | Refund ${refundText}`;
                },
                buttons: () => [
                    {
                        id: "cancel-wall-queue",
                        label: "CANCEL WALL QUEUE",
                        styleKey: "cancel",
                        onClick: () => this.cancelQueuedWallJob(this._selectedWallJobId, this._selectedWallJobTeamNumber),
                    },
                    {
                        id: "close-wall-queue",
                        label: "CLOSE",
                        styleKey: "neutral",
                        onClick: () => this.clearQueuedWallJobSelection(this._selectedWallJobTeamNumber),
                    },
                ],
            });
            return;
        }

        if (this._selectedConstructionTask && this._isQueuedConstructionTaskLive(this._selectedConstructionTask, this._selectedConstructionTeamNumber)) {
            const task = this._selectedConstructionTask;
            const teamNumber = this._selectedConstructionTeamNumber;
            bar.setContext("build-queue", {
                helperText: () => {
                    const pct = this._currentConstructionPercent(task);
                    const refundText = this._formatCommandRefund(this._sumTaskRefunds([task]));
                    const progress = this._isBlockBuildAwaitingSiteClear(task) ? "clearing site" : `${pct}%`;
                    return `${this._getTaskDisplayName(task)} ${progress} | Refund ${refundText}`;
                },
                buttons: () => [
                    {
                        id: "cancel-build",
                        label: "CANCEL BUILD",
                        styleKey: "cancel",
                        onClick: () => this.cancelConstructionTask(task, teamNumber),
                    },
                    {
                        id: "close-build",
                        label: "CLOSE",
                        styleKey: "neutral",
                        onClick: () => this.clearQueuedConstructionSelection(teamNumber),
                    },
                ],
            });
            return;
        }

        const destroyTasks = this._queuedDestroyJobTasks(this._selectedDestroyJobId, this._selectedDestroyJobTeamNumber);
        if (destroyTasks.length) {
            bar.setContext("build-queue", {
                helperText: () => {
                    const wallCount = destroyTasks.filter((task) => task?.queueKey === "destroyTileStates").length;
                    const buildingCount = destroyTasks.length - wallCount;
                    return `DESTROY QUEUE | ${destroyTasks.length} targets | ${wallCount} walls | ${buildingCount} buildings`;
                },
                buttons: () => [
                    {
                        id: "cancel-destroy-queue",
                        label: "CANCEL DESTROY QUEUE",
                        styleKey: "cancel",
                        onClick: () => this.cancelQueuedDestroyJob(this._selectedDestroyJobId, this._selectedDestroyJobTeamNumber),
                    },
                    {
                        id: "close-destroy-queue",
                        label: "CLOSE",
                        styleKey: "neutral",
                        onClick: () => this.clearQueuedDestroyJobSelection(this._selectedDestroyJobTeamNumber),
                    },
                ],
            });
            return;
        }

        bar.clearContext?.("build-queue");
    }

    static setQueuedWallJobHover(wallJobId = null, teamNumber = 1) {
        const normalizedTeam = Number(teamNumber || 1);
        if (this._hoveredWallJobId === wallJobId && this._hoveredWallJobTeamNumber === normalizedTeam) return;
        this._hoveredWallJobId = wallJobId;
        this._hoveredWallJobTeamNumber = normalizedTeam;
        this.refreshQueuedTileBuildGhosts(normalizedTeam);
    }

    static clearQueuedWallJobSelection(teamNumber = this._selectedWallJobTeamNumber || 1) {
        const normalizedTeam = Number(teamNumber || 1);
        this._selectedWallJobId = null;
        this._selectedWallJobTeamNumber = normalizedTeam;
        this.refreshQueuedTileBuildGhosts(normalizedTeam);
        this._syncBuildQueueCommandBar();
    }

    static selectQueuedWallJob(wallJobId, teamNumber = 1) {
        const normalizedTeam = Number(teamNumber || 1);
        this._selectedWallJobId = wallJobId;
        this._selectedWallJobTeamNumber = normalizedTeam;
        this._selectedDestroyJobId = null;
        this._selectedConstructionTask = null;
        this.refreshQueuedTileBuildGhosts(normalizedTeam);
        this.refreshQueuedDestroyJobVisuals(normalizedTeam);
        this._syncBuildQueueCommandBar();
    }

    static clearQueuedConstructionSelection(teamNumber = this._selectedConstructionTeamNumber || 1) {
        this._selectedConstructionTask = null;
        this._selectedConstructionTeamNumber = Number(teamNumber || 1);
        this._syncBuildQueueCommandBar();
    }

    static selectQueuedConstructionTask(task, teamNumber = 1) {
        if (!task) return;
        const previousWallJobId = this._selectedWallJobId;
        const previousWallTeamNumber = this._selectedWallJobTeamNumber;
        const previousDestroyJobId = this._selectedDestroyJobId;
        const previousDestroyTeamNumber = this._selectedDestroyJobTeamNumber;
        this._selectedConstructionTask = task;
        this._selectedConstructionTeamNumber = Number(teamNumber || this._resolveQueuedBuildTeamNumber(task, 1));
        this._selectedWallJobId = null;
        this._selectedDestroyJobId = null;
        if (previousWallJobId) {
            this.refreshQueuedTileBuildGhosts(previousWallTeamNumber);
        }
        if (previousDestroyJobId) {
            this.refreshQueuedDestroyJobVisuals(previousDestroyTeamNumber);
        }
        this._syncBuildQueueCommandBar();
    }

    static setQueuedDestroyJobHover(destroyJobId = null, teamNumber = 1) {
        const normalizedTeam = Number(teamNumber || 1);
        if (this._hoveredDestroyJobId === destroyJobId && this._hoveredDestroyJobTeamNumber === normalizedTeam) return;
        this._hoveredDestroyJobId = destroyJobId;
        this._hoveredDestroyJobTeamNumber = normalizedTeam;
        this.refreshQueuedDestroyJobVisuals(normalizedTeam);
    }

    static clearQueuedDestroyJobSelection(teamNumber = this._selectedDestroyJobTeamNumber || 1) {
        const normalizedTeam = Number(teamNumber || 1);
        this._selectedDestroyJobId = null;
        this._selectedDestroyJobTeamNumber = normalizedTeam;
        this.refreshQueuedDestroyJobVisuals(normalizedTeam);
        this._syncBuildQueueCommandBar();
    }

    static selectQueuedDestroyJob(destroyJobId, teamNumber = 1) {
        if (!destroyJobId) return;
        const normalizedTeam = Number(teamNumber || 1);
        const previousWallJobId = this._selectedWallJobId;
        const previousWallTeamNumber = this._selectedWallJobTeamNumber;
        this._selectedDestroyJobId = destroyJobId;
        this._selectedDestroyJobTeamNumber = normalizedTeam;
        this._selectedWallJobId = null;
        this._selectedConstructionTask = null;
        if (previousWallJobId) {
            this.refreshQueuedTileBuildGhosts(previousWallTeamNumber);
        }
        this.refreshQueuedDestroyJobVisuals(normalizedTeam);
        this._syncBuildQueueCommandBar();
    }

    static _startConstructionTaskUiTicker(task) {
        if (!task || task._uiTicker || !this.scene?.time) return;
        task._uiTicker = this.scene.time.addEvent({
            delay: 100,
            loop: true,
            callback: () => {
                if (!task?.constructionSprite?.active) {
                    task._uiTicker?.remove?.(false);
                    task._uiTicker = null;
                    return;
                }
                this.updateConstructionHoverText(task);
            },
        });
    }

    static _stopConstructionTaskUiTicker(task) {
        task?._uiTicker?.remove?.(false);
        if (task) task._uiTicker = null;
    }

    static _refundQueuedBuildCost(task, teamNumber = 1) {
        if (!task?.prepaid) return false;

        const cost = task.refundCost
            ?? task.type?.cost
            ?? task.buildType?.cost
            ?? task.type?.price
            ?? task.buildType?.price
            ?? null;
        if (!cost || typeof cost !== "object") return false;

        const scene = this.scene;
        for (const [resourceKey, rawAmount] of Object.entries(cost)) {
            const amount = Math.max(0, Number(rawAmount) || 0);
            if (!(amount > 0)) continue;

            if (resourceKey === "money") {
                scene?.updateMoney?.(amount);
                continue;
            }
            if (resourceKey === "permits") {
                scene?.updatePermits?.(amount);
                continue;
            }

            const itemDef = UI_ITEM_TYPES[resourceKey];
            if (!itemDef) continue;

            const added = StorageManager.grantItemToTeam(String(teamNumber), itemDef, amount, scene);
            const overflow = Math.max(0, amount - added);
            if (overflow > 0) {
                const sellPrice = Math.max(0, Number(StorageManager.getStorageSellPrice(itemDef) || 0));
                if (sellPrice > 0) {
                    scene?.updateMoney?.(sellPrice * overflow);
                }
            }
        }

        task.prepaid = false;
        return true;
    }

    static _unblockQueuedBlockTaskArea(task) {
        if (!task?._navBlocked) return;

        const blockTiles = this._blockBuildTiles(task);
        this._recomputeLiveNavForCells(blockTiles, "queued_block_build_nav_restore");

        task._navBlocked = false;
        this._markQueuedBlockBuildAreaDirty();
    }

    static refreshQueuedTileBuildGhosts(teamNumber = 1) {
        teamNumber = Number(teamNumber);
        const team = Teams.teamLists?.[teamNumber] ?? Teams.teamLists?.[`${teamNumber}`];
        const queueTasks = Array.isArray(team?.buildingTileStates) ? team.buildingTileStates : [];
        if (this._selectedWallJobTeamNumber === teamNumber && this._selectedWallJobId) {
            const stillExists = queueTasks.some((task) => task?.wallJobId === this._selectedWallJobId && this._isQueuedWallTask(task));
            if (!stillExists) this._selectedWallJobId = null;
        }
        if (this._hoveredWallJobTeamNumber === teamNumber && this._hoveredWallJobId) {
            const stillHovered = queueTasks.some((task) => task?.wallJobId === this._hoveredWallJobId && this._isQueuedWallTask(task));
            if (!stillHovered) this._hoveredWallJobId = null;
        }
        for (const task of queueTasks) {
            this.ensureQueuedTileBuildGhost(task, teamNumber, queueTasks);
        }
        this._syncBuildQueueCommandBar();
    }

    static ensureQueuedTileBuildGhost(task, teamNumber = 1, queueTasks = null) {
        teamNumber = Number(teamNumber);
        if (!task || !this.scene?.add) return task?.constructionSprite ?? null;

        task.queueKey = task.queueKey ?? "buildingTileStates";
        const spriteX = task.x * SQUARESIZE + SQUARESIZE / 2;
        const spriteY = task.y * SQUARESIZE + SQUARESIZE / 2;
        const allQueueTasks = queueTasks || Teams.teamLists?.[teamNumber]?.buildingTileStates || Teams.teamLists?.[`${teamNumber}`]?.buildingTileStates || [];

        if (this._isQueuedWallTask(task)) {
            const display = this._queuedWallDisplayInfo(task, allQueueTasks);
            if (!display) return task?.constructionSprite ?? null;
            const isSelectedJob =
                !!task.wallJobId &&
                task.wallJobId === this._selectedWallJobId &&
                Number(teamNumber) === Number(this._selectedWallJobTeamNumber || 1);
            const isHoveredJob =
                !!task.wallJobId &&
                task.wallJobId === this._hoveredWallJobId &&
                Number(teamNumber) === Number(this._hoveredWallJobTeamNumber || 1);

            let sprite = task.constructionSprite;
            if (!sprite || !sprite.active) {
                sprite = this.scene.add.sprite(spriteX, spriteY, display.key, 0)
                    .setDisplaySize(SQUARESIZE, SQUARESIZE)
                    .setDepth(BLOCKDEPTH + 0.15)
                    .setInteractive({ useHandCursor: true });
                task.constructionSprite = sprite;
                this._bindQueuedTileGhostInteractions(task, sprite, teamNumber);
            } else {
                sprite.setPosition(spriteX, spriteY);
                sprite.setTexture(display.key, 0);
                sprite.setDisplaySize(SQUARESIZE, SQUARESIZE);
            }

            task._ghostBaseAlpha = display.alpha;
            sprite.setAngle(display.angle || 0);
            sprite.clearTint();
            if (isSelectedJob) sprite.setTintFill(0xffe7a1);
            else if (isHoveredJob) sprite.setTintFill(0xfff2bf);

            const resolvedAlpha = isSelectedJob
                ? Math.min(display.alpha + (display.isDoor ? 0.28 : 0.26), display.isDoor ? 0.74 : 0.68)
                : isHoveredJob
                    ? Math.min(display.alpha + (display.isDoor ? 0.18 : 0.16), display.isDoor ? 0.64 : 0.58)
                    : display.alpha;
            sprite.setAlpha(resolvedAlpha);
            sprite.setDepth(BLOCKDEPTH + (isSelectedJob ? 0.32 : isHoveredJob ? 0.24 : 0.15));
            this._ensureConstructionTaskUi(task);
            this.updateConstructionHoverText(task);
            this._syncBuildQueueCommandBar();
            return sprite;
        }

        if (!task.constructionSprite || !task.constructionSprite.active) {
            const sprite = this.scene.add.image(spriteX, spriteY, "construction")
                .setDisplaySize(SQUARESIZE, SQUARESIZE)
                .setDepth(BLOCKDEPTH + 0.15)
                .setInteractive({ useHandCursor: true });
            task.constructionSprite = sprite;
            this._bindQueuedTileGhostInteractions(task, sprite, teamNumber);
        } else {
            task.constructionSprite.setPosition(spriteX, spriteY);
            task.constructionSprite.setTexture("construction");
            task.constructionSprite.setDisplaySize(SQUARESIZE, SQUARESIZE);
            task.constructionSprite.setAngle(0);
        }

        task._ghostBaseAlpha = 0.68;
        task.constructionSprite.setAlpha(0.68);
        this._ensureConstructionTaskUi(task);
        this.updateConstructionHoverText(task);
        return task.constructionSprite;
    }

    static clearQueuedTileBuildGhost(task) {
        if (!task) return;
        this._stopConstructionTaskUiTicker(task);
        this._clearConstructionTaskUi(task);
        task.constructionSprite?.destroy?.();
        task.constructionSprite = null;
    }

    static cancelQueuedTileBuild(task, teamNumber = 1) {
        teamNumber = Number(teamNumber);
        if (!task) return false;
        const team = Teams.teamLists?.[teamNumber] ?? Teams.teamLists?.[`${teamNumber}`];
        const builders = (team?.builderList || []).filter((troop) =>
            troop?.active && troop.task && this._sameQueuedBuildTask(troop.task, task)
        );

        Teams.removeFromStateArray(teamNumber, task.queueKey ?? "buildingTileStates", task);
        for (const troop of builders) {
            this._clearBuilderQueuedBuildState(troop, {
                queueKey: "buildingTileStates",
                removeQueueTask: false,
                clearGhost: false,
            });
        }
        this._refundQueuedBuildCost(task, teamNumber);
        this.clearQueuedTileBuildGhost(task);
        this.refreshQueuedTileBuildGhosts(teamNumber);
        return true;
    }

    static cancelQueuedWallJob(wallJobId, teamNumber = 1) {
        teamNumber = Number(teamNumber || 1);
        if (!wallJobId) return false;
        const team = Teams.teamLists?.[teamNumber] ?? Teams.teamLists?.[`${teamNumber}`];
        const queue = Array.isArray(team?.buildingTileStates) ? team.buildingTileStates : [];
        const tasks = queue.filter((task) => task?.wallJobId === wallJobId && this._isQueuedWallTask(task));
        if (!tasks.length) return false;

        const builders = team?.builderList || [];
        for (const troop of builders) {
            if (!troop?.active || !troop.task || troop.task.wallJobId !== wallJobId) continue;
            this._clearBuilderQueuedBuildState(troop, {
                queueKey: "buildingTileStates",
                removeQueueTask: false,
                clearGhost: false,
            });
        }

        for (const task of tasks) {
            Teams.removeFromStateArray(teamNumber, "buildingTileStates", task);
            this._refundQueuedBuildCost(task, teamNumber);
            this.clearQueuedTileBuildGhost(task);
        }

        if (this._selectedWallJobId === wallJobId && this._selectedWallJobTeamNumber === teamNumber) {
            this._selectedWallJobId = null;
        }
        if (this._hoveredWallJobId === wallJobId && this._hoveredWallJobTeamNumber === teamNumber) {
            this._hoveredWallJobId = null;
        }
        this.refreshQueuedTileBuildGhosts(teamNumber);
        this._syncBuildQueueCommandBar();
        return true;
    }

    static _destroyWorkersForJob(teamNumber = 1, destroyJobId = null) {
        if (!destroyJobId) return [];
        const team = this._teamForDestroyQueue(teamNumber);
        const seen = new Set();
        const workers = [];
        const addTroops = (troops = []) => {
            for (const troop of troops || []) {
                if (!troop?.active || !troop.task || troop.task.destroyJobId !== destroyJobId) continue;
                if (seen.has(troop)) continue;
                seen.add(troop);
                workers.push(troop);
            }
        };
        addTroops(team?.playerList);
        addTroops(team?.builderList);
        addTroops(Player.troops);
        return workers;
    }

    static _clearDestroyWorkerState(troop) {
        if (!troop?.active) return;
        const task = troop.task;
        if (task && typeof task.assigned === "number" && task.assigned > 0) {
            task.assigned -= 1;
        }
        if (troop.timer) {
            troop.timer.remove(false);
            troop.timer = null;
        }
        fightManager.clearAttackRecovery?.(troop);
        this._clearBuilderBuildPresentation(troop);
        troop.task = null;
        troop.taskMeta = null;
        troop.buildType = null;
        troop.destX = null;
        troop.destY = null;
        troop.currentPath?.splice?.(0);
        troop.body?.setVelocity?.(0, 0);
        troop.play?.(troop.idle);
        Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
        Scheduler.stepUnit(troop);
    }

    static cancelQueuedDestroyJob(destroyJobId, teamNumber = 1, options = {}) {
        teamNumber = Number(teamNumber || 1);
        if (!destroyJobId) return false;
        const tasks = this._queuedDestroyJobTasks(destroyJobId, teamNumber);
        if (!tasks.length) return false;

        const workers = this._destroyWorkersForJob(teamNumber, destroyJobId);
        for (const task of tasks) {
            task.canceled = true;
            this._clearQueuedDestroyTaskVisual(task);
            Teams.removeFromStateArray(teamNumber, task.queueKey ?? "destroyStates", task);
        }

        for (const troop of workers) {
            this._clearDestroyWorkerState(troop);
        }

        if (this._selectedDestroyJobId === destroyJobId && this._selectedDestroyJobTeamNumber === teamNumber) {
            this._selectedDestroyJobId = null;
        }
        if (this._hoveredDestroyJobId === destroyJobId && this._hoveredDestroyJobTeamNumber === teamNumber) {
            this._hoveredDestroyJobId = null;
        }
        if (options?.cancelLinkedBuilds !== false) {
            this._cancelLinkedBuildsForDestroyJob(destroyJobId, teamNumber);
        }
        this.refreshQueuedDestroyJobVisuals(teamNumber);
        this._syncBuildQueueCommandBar();
        return true;
    }

    static cancelConstructionTask(task, teamNumber = 1) {
        if (!task) return false;
        const queueKey = task.queueKey ?? task.taskMeta?.arrayKey ?? null;
        if (queueKey === "buildingTileStates") {
            return this.cancelQueuedTileBuild(task, teamNumber);
        }
        if (queueKey === "blockBuildingStates") {
            return this.cancelQueuedBlockBuild(task, teamNumber);
        }
        return false;
    }

    static _ensureConstructionHoverUi() {
        const scene = this.scene;
        if (!scene?.add) return;

        if (!scene.constructionHoverText) {
            scene.constructionHoverText = scene.add
                .text(0, 0, "", {
                    fontSize: "12px",
                    fill: "#ffffff",
                    stroke: "#000000",
                    strokeThickness: 3,
                    align: "center",
                })
                .setOrigin(0.5, 1)
                .setDepth(UIDEPTH + 6)
                .setScrollFactor(1)
                .setVisible(false);

            scene.constructionHoverBg = scene.add
                .rectangle(0, 0, 10, 10, 0x000000, 0.6)
                .setStrokeStyle(1, 0xffffff, 0.4)
                .setOrigin(0.5, 1)
                .setDepth(UIDEPTH + 5)
                .setScrollFactor(1)
                .setVisible(false);
        }
    }

    static _normalizeBlockBuildTask(task, teamNumber = 1) {
        if (!task) return null;

        const typeName = task.type?.name ?? task.buildType?.name ?? task.buildTypeName ?? task.type ?? task.buildType;
        const type = TILE_TYPES[typeName] ?? task.type ?? task.buildType ?? null;
        if (!type) return null;

        task.type = type;
        task.buildType = type;
        task.buildTypeName = type.name;
        task.queueKey = "blockBuildingStates";
        task.assigned = Number(task.assigned || 0);
        task.teamNumber = Number(task.teamNumber ?? teamNumber ?? 1);
        task.refundCost = task.refundCost ?? type.cost ?? type.price ?? null;
        task.duration = Math.max(1, Number(task.duration || 100));
        task.totalDuration = Math.max(task.duration, Number(task.totalDuration || task.duration || 100));
        task.buildTaskId = task.buildTaskId ?? task.siteClearBuildId ?? this.createBuildTaskId(task.teamNumber);
        task.siteClearBuildId = task.buildTaskId;
        return task;
    }

    static _isBlockBuildAwaitingSiteClear(task) {
        return !!(task?.awaitingSiteClear && task?.pendingDestroyJobId);
    }

    static _destroyTileTaskAt(x, y, teamNumber = 1) {
        const team = this._teamForDestroyQueue(teamNumber);
        const queue = Array.isArray(team?.destroyTileStates) ? team.destroyTileStates : [];
        return queue.find((task) => Number(task?.x) === x && Number(task?.y) === y) || null;
    }

    static _blockBuildSiteFailure(reason, detail = null) {
        this._lastBlockBuildQueueFailure = { reason, detail };
        return { ok: false, reason, detail };
    }

    static getLastBlockBuildQueueFailureMessage() {
        if (this._lastBlockBuildQueueFailure?.reason === "shore") {
            return Map.SHORE_PLACEMENT_MESSAGE ?? "Too close to shore";
        }
        return null;
    }

    static _analyzeBlockBuildSite(task, teamNumber = 1) {
        if (!task?.type) return this._blockBuildSiteFailure("invalid");
        if (Map.isPlacementTooCloseToShore?.(task.x, task.y, task.type.lenX, task.type.lenY, { placementType: task.type }, task.type)) {
            return this._blockBuildSiteFailure("shore");
        }

        const walls = [];
        const crops = [];
        const seenWalls = new Set();
        const seenCrops = new Set();

        for (const tile of this._blockBuildTiles(task)) {
            const row = Map.grid?.[tile.y];
            if (!row || row[tile.x] == null) {
                return this._blockBuildSiteFailure("blocked", tile);
            }

            if (Map._cellHasRealBuildingFootprint?.(tile.x, tile.y)) {
                return this._blockBuildSiteFailure("building", tile);
            }

            if (this._queuedBlockBuildCovers(tile.x, tile.y, teamNumber)) {
                return this._blockBuildSiteFailure("reserved", tile);
            }

            const wallInfo = Map._wallStructureInfoAt?.(tile.x, tile.y);
            const cropPresent = Map._cellHasActualCrop?.(tile.x, tile.y, teamNumber);

            if (wallInfo) {
                if (this._destroyTileTaskAt(tile.x, tile.y, teamNumber)) {
                    return this._blockBuildSiteFailure("destroy_queued", tile);
                }

                const key = `${tile.x},${tile.y}`;
                if (!seenWalls.has(key)) {
                    Wall.ensureAt?.(this.scene, tile.x, tile.y, teamNumber);
                    walls.push({
                        x: tile.x,
                        y: tile.y,
                        type: TILE_TYPES[wallInfo.name] ?? TILE_TYPES.wall,
                        originalGridVal: wallInfo.value,
                    });
                    seenWalls.add(key);
                }
            }

            if (cropPresent) {
                const key = `${tile.x},${tile.y}`;
                if (!seenCrops.has(key)) {
                    crops.push({ x: tile.x, y: tile.y });
                    seenCrops.add(key);
                }
            }

            if (Map._cellIsBlocking?.(tile.x, tile.y) && !wallInfo) {
                return this._blockBuildSiteFailure("blocked", tile);
            }

            if (Map._cellHasProtectedFarmSpot?.(tile.x, tile.y, teamNumber) && !cropPresent) {
                return this._blockBuildSiteFailure("farm_reserved", tile);
            }
        }

        this._lastBlockBuildQueueFailure = null;
        return { ok: true, walls, crops };
    }

    static _blockBuildTiles(task) {
        const tiles = [];
        const lenX = Math.max(1, Number(task?.type?.lenX ?? 1));
        const lenY = Math.max(1, Number(task?.type?.lenY ?? 1));
        const startX = Number(task?.x ?? 0);
        const startY = Number(task?.y ?? 0);

        for (let y = startY; y < startY + lenY; y++) {
            for (let x = startX; x < startX + lenX; x++) {
                tiles.push({ x, y });
            }
        }

        return tiles;
    }

    static _clearActivePlacementGhost() {
        if (!Map.isPlacing) return;
        Map.isPlacing = false;
        Map.placingItem?.destroy?.();
        Map.placingItem = null;
    }

    static _clearBlockBuildSiteCrops(task, teamNumber = 1) {
        if (!task || task.siteClearCropsCleared) return false;

        const tiles = Array.isArray(task.siteClearCropTiles) && task.siteClearCropTiles.length
            ? task.siteClearCropTiles
            : this._blockBuildTiles(task).filter((tile) => Map._cellHasActualCrop?.(tile.x, tile.y, teamNumber));

        let cleared = false;
        for (const tile of tiles) {
            if (Map.clearCropAt?.(tile.x, tile.y, null)) cleared = true;
        }

        task.siteClearCropTiles = [];
        task.siteClearCropsCleared = true;
        return cleared;
    }

    static _createSiteClearDestroyJobForBuild(task, wallTiles, teamNumber = 1) {
        if (!task?.pendingDestroyJobId || !Array.isArray(wallTiles) || !wallTiles.length) return false;

        const destroyTasks = wallTiles.map((tile, index) => ({
            x: tile.x,
            y: tile.y,
            type: tile.type,
            originalGridVal: tile.originalGridVal,
            destroyJobId: task.pendingDestroyJobId,
            destroyJobOrder: index,
            linkedBuildTaskId: task.buildTaskId,
            siteClearForBuild: true,
        }));

        this.createDestroyTileStateArray(destroyTasks, teamNumber, { destroyJobId: task.pendingDestroyJobId });
        return true;
    }

    static _linkedBlockBuildTasksForDestroyJob(destroyJobId, teamNumber = 1) {
        if (!destroyJobId) return [];
        const team = Teams.teamLists?.[teamNumber] ?? Teams.teamLists?.[`${teamNumber}`];
        const queue = Array.isArray(team?.blockBuildingStates) ? team.blockBuildingStates : [];
        return queue.filter((task) => task?.pendingDestroyJobId === destroyJobId);
    }

    static _activateLinkedBuildsIfDestroyJobComplete(destroyJobId, teamNumber = 1) {
        if (!destroyJobId) return false;
        if (this._queuedDestroyJobTasks(destroyJobId, teamNumber).length > 0) return false;

        const linkedBuilds = this._linkedBlockBuildTasksForDestroyJob(destroyJobId, teamNumber);
        if (!linkedBuilds.length) return false;

        for (const task of linkedBuilds) {
            task.awaitingSiteClear = false;
            task.pendingDestroyJobId = null;
            task.siteClearCompleted = true;
            task.assigned = 0;
            this.ensureQueuedBlockBuildGhost(task, teamNumber);
            this.updateConstructionHoverText(task);
        }

        this.assignTroopToBuildBlock(teamNumber);
        this._syncBuildQueueCommandBar();
        return true;
    }

    static _cancelLinkedBuildsForDestroyJob(destroyJobId, teamNumber = 1) {
        const linkedBuilds = this._linkedBlockBuildTasksForDestroyJob(destroyJobId, teamNumber);
        let canceled = false;
        for (const task of [...linkedBuilds]) {
            if (this.cancelQueuedBlockBuild(task, teamNumber, { cancelLinkedDestroyJob: false })) {
                canceled = true;
            }
        }
        return canceled;
    }

    static _markQueuedBlockBuildAreaDirty() {
        Map.regionSystem?.markDirty?.();
        Map.regionDrawer?.markDirty?.();
        Map.enemyRegionSystem?.markDirty?.();
        Map.enemyRegionDrawer?.markDirty?.();
    }

    static _repairUnitPathsForNavChange(navMesh, change) {
        if (!navMesh || !change?.removedPolyIds) return;
        const impacted = PathRegistry.handlePolysRemoved(navMesh, change.removedPolyIds, change.addedPolyIds);
        if (!impacted) return;
        for (const unit of impacted) {
            PathRepair.repairUnitPath(unit, change.removedPolyIds, navMesh);
        }
    }

    static _syncNavMeshCells(updater, navMesh, cells, unblock = false) {
        if (!updater?.blockTiles || !cells?.length) return;
        const tiles = cells.map(({ x, y }) => ({ x, y }));
        const change = unblock ? updater.blockTiles(tiles, true) : updater.blockTiles(tiles);
        this._repairUnitPathsForNavChange(navMesh, change);
    }

    static _recomputeLiveNavForCells(cells, reason = "nav_recompute", opts = {}) {
        const recomputed = Map.recomputeNavForCells?.(cells, reason);
        if (!recomputed) return false;

        if (opts.updateNavMesh !== false) {
            try {
                this._syncNavMeshCells(this.NavMeshUpdater, Map.navMesh, recomputed.playerBlocked, false);
                this._syncNavMeshCells(this.NavMeshUpdater, Map.navMesh, recomputed.playerOpen, true);
                this._syncNavMeshCells(this.EnemyNavMeshUpdater, Map.enemyNavMesh, recomputed.enemyBlocked, false);
                this._syncNavMeshCells(this.EnemyNavMeshUpdater, Map.enemyNavMesh, recomputed.enemyOpen, true);
            } catch (e) {
                console.warn(`${reason} navmesh recompute skipped`, e);
            }
        }

        if (recomputed.changed) {
            this._markQueuedBlockBuildAreaDirty();
            Map.enemyRegionSystem?.ensureUpToDate?.();
        }

        return recomputed.changed;
    }

    static _blockLiveNavFootprint(blockTiles, warningLabel = "building footprint") {
        if (!blockTiles?.length) return false;

        for (const tile of blockTiles) {
            if (Map.navGrid?.[tile.y]?.[tile.x] !== undefined) Map.navGrid[tile.y][tile.x] = 0;
            if (Map.enemyNavGrid?.[tile.y]?.[tile.x] !== undefined) Map.enemyNavGrid[tile.y][tile.x] = 0;
        }

        try {
            const change = this.NavMeshUpdater?.blockTiles?.(blockTiles);
            this._repairUnitPathsForNavChange(Map.navMesh, change);

            const enemyChange = this.EnemyNavMeshUpdater?.blockTiles?.(blockTiles);
            this._repairUnitPathsForNavChange(Map.enemyNavMesh, enemyChange);
        } catch (e) {
            console.warn(`${warningLabel} nav update skipped`, e);
        }

        this._markQueuedBlockBuildAreaDirty();
        return true;
    }

    static blockBuildingFootprintInLiveNav(buildingOrTask, {
        evacuateTeamNumber = null,
        warningLabel = "building footprint",
    } = {}) {
        const type = buildingOrTask?.tileType || buildingOrTask?.buildType || buildingOrTask?.type;
        const x = Math.floor(Number(buildingOrTask?.x ?? buildingOrTask?.gridX ?? buildingOrTask?.sx));
        const y = Math.floor(Number(buildingOrTask?.y ?? buildingOrTask?.gridY ?? buildingOrTask?.sy));
        if (!type || !Number.isFinite(x) || !Number.isFinite(y)) return false;

        const blocked = this._blockLiveNavFootprint(
            this._blockBuildTiles({ x, y, type }),
            warningLabel
        );
        if (blocked && evacuateTeamNumber != null) {
            this.evacuateBlockedFriendlyTroops(evacuateTeamNumber);
        }
        return blocked;
    }

    static _blockNavForQueuedBlockTask(task) {
        if (!task || task._navBlocked) return;

        const blockTiles = this._blockBuildTiles(task);
        if (!blockTiles.length) return;

        this._blockLiveNavFootprint(blockTiles, "queued block build");
        task._navBlocked = true;
    }

    static _startQueuedBlockConstruction(task) {
        if (!task) return;
        if (this._isBlockBuildAwaitingSiteClear(task)) return;
        this._clearBlockBuildSiteCrops(task, task.teamNumber ?? 1);
        task.totalDuration = Math.max(task.duration || 1, Number(task.totalDuration || task.duration || 1));
        task._constructionStarted = true;
        this._blockNavForQueuedBlockTask(task);
        this.updateConstructionHoverText(task);
    }

    static ensureQueuedBlockBuildGhost(task, teamNumber = 1) {
        teamNumber = Number(teamNumber);
        task = this._normalizeBlockBuildTask(task, teamNumber);
        if (!task || task.constructionSprite || !this.scene?.add) return task?.constructionSprite ?? null;

        const sprite = Map.scene.add.image(
            task.x * SQUARESIZE + (task.type.lenX * SQUARESIZE) / 2,
            task.y * SQUARESIZE + (task.type.lenY * SQUARESIZE) / 2,
            "construction"
        )
            .setDepth(BLOCKDEPTH)
            .setDisplaySize(task.type.lenX * SQUARESIZE, task.type.lenY * SQUARESIZE)
            .setAlpha(task._constructionStarted ? 0.78 : 0.62)
            .setInteractive({ useHandCursor: true });

        task.constructionSprite = sprite;

        sprite.on("pointerover", () => {
            sprite.setAlpha(task._constructionStarted ? 0.9 : 0.76);
        });

        sprite.on("pointerout", () => {
            sprite.setAlpha(task._constructionStarted ? 0.78 : 0.62);
        });

        sprite.on("pointerdown", () => {
            const selectedBuilders = this.getSelectedBuilders(teamNumber);
            if (selectedBuilders.length && !this._isBlockBuildAwaitingSiteClear(task)) {
                this.assignSelectedBuildersToTask(task, CONTROL_STATES.BUILD_MODE_B, selectedBuilders);
                return;
            }
            this.selectQueuedConstructionTask(task, teamNumber);
        });

        this._ensureConstructionTaskUi(task);
        this.updateConstructionHoverText(task);

        return sprite;
    }

    static clearQueuedBlockBuildGhost(task) {
        if (!task) return;
        this._stopConstructionTaskUiTicker(task);
        this._clearConstructionTaskUi(task);
        task.constructionSprite?.destroy?.();
        task.constructionSprite = null;
    }

    static cancelQueuedBlockBuild(task, teamNumber = 1, options = {}) {
        teamNumber = Number(teamNumber);
        task = this._normalizeBlockBuildTask(task, teamNumber);
        if (!task) return false;

        const team = Teams.teamLists?.[teamNumber] ?? Teams.teamLists?.[`${teamNumber}`];
        const builders = (team?.builderList || []).filter((troop) =>
            troop?.active && troop.task && this._sameQueuedBuildTask(troop.task, task)
        );

        if (task.pendingDestroyJobId && options?.cancelLinkedDestroyJob !== false) {
            this.cancelQueuedDestroyJob(task.pendingDestroyJobId, teamNumber, { cancelLinkedBuilds: false });
        }

        Teams.removeFromStateArray(teamNumber, "blockBuildingStates", task);
        for (const troop of builders) {
            this._clearBuilderQueuedBuildState(troop, {
                queueKey: "blockBuildingStates",
                removeQueueTask: false,
                clearGhost: false,
            });
        }
        this._unblockQueuedBlockTaskArea(task);
        this._refundQueuedBuildCost(task, teamNumber);
        this.clearQueuedBlockBuildGhost(task);
        return true;
    }

    static restoreQueuedBlockBuildTask(task, teamNumber = 1) {
        task = this._normalizeBlockBuildTask(task, teamNumber);
        if (!task) return null;
        task._navBlocked = false;
        this.ensureQueuedBlockBuildGhost(task, teamNumber);
        if (this._isBlockBuildAwaitingSiteClear(task)) {
            this._activateLinkedBuildsIfDestroyJobComplete(task.pendingDestroyJobId, teamNumber);
            return task;
        }
        if (task._constructionStarted) {
            this._blockNavForQueuedBlockTask(task);
        }
        return task;
    }

    static queueBlockBuildTask(task, teamNumber = 1) {
        teamNumber = Number(teamNumber);
        const team = Teams.teamLists?.[`${teamNumber}`] ?? Teams.teamLists?.[teamNumber];
        if (!team) return null;
        if (!Array.isArray(team.blockBuildingStates)) team.blockBuildingStates = [];
        this._lastBlockBuildQueueFailure = null;

        const normalized = this._normalizeBlockBuildTask(task, teamNumber);
        if (!normalized) return null;
        normalized.refundCost = normalized.refundCost ?? normalized.type?.cost ?? normalized.buildType?.cost ?? null;

        const site = this._analyzeBlockBuildSite(normalized, teamNumber);
        if (!site.ok) {
            this._refundQueuedBuildCost(normalized, teamNumber);
            return null;
        }

        normalized.siteClearCropTiles = site.crops || [];
        normalized.siteClearCropsCleared = !normalized.siteClearCropTiles.length;
        if (site.walls?.length) {
            normalized.pendingDestroyJobId = normalized.pendingDestroyJobId ?? this.createDestroyJobId(teamNumber);
            normalized.awaitingSiteClear = true;
            normalized.siteClearCompleted = false;
        } else {
            normalized.pendingDestroyJobId = null;
            normalized.awaitingSiteClear = false;
            normalized.siteClearCompleted = true;
        }

        team.blockBuildingStates.push(normalized);
        AudioManager.playBuildQueued?.();
        this.ensureQueuedBlockBuildGhost(normalized, teamNumber);
        if (site.walls?.length) {
            this._createSiteClearDestroyJobForBuild(normalized, site.walls, teamNumber);
            this.assignTroopsToDestroyTile?.(teamNumber);
        } else {
            this.assignTroopToBuildBlock(teamNumber);
        }
        this._clearActivePlacementGhost();
        return normalized;
    }

    static ensureFixTaskVisual(task) {
        if (!task?.value?.sprite?.active || !this.scene?.add) return null;
        if (task.fixIndicator?.active) return task.fixIndicator;

        const bounds = task.value.sprite.getBounds();
        const icon = this.scene.add.image(bounds.centerX, bounds.centerY, "hammer")
            .setDepth((task.value.sprite.depth ?? BLOCKDEPTH) + 2)
            .setDisplaySize(24, 24)
            .setAlpha(0.95);

        task.fixIndicator = icon;
        task.fixIndicatorTween = this.scene.tweens.add({
            targets: icon,
            angle: { from: -22, to: 22 },
            duration: 280,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
        });

        task.value.sprite.once?.("destroy", () => this.clearFixTaskVisual(task));
        return icon;
    }

    static clearFixTaskVisual(task) {
        if (!task) return;
        task.fixIndicatorTween?.remove?.();
        task.fixIndicatorTween = null;
        task.fixIndicator?.destroy?.();
        task.fixIndicator = null;
    }

    static _getBuildTaskTargetWorld(task) {
        const lenX = task?.type?.lenX ?? task?.buildType?.lenX ?? 1;
        const lenY = task?.type?.lenY ?? task?.buildType?.lenY ?? 1;

        return {
            x: (task.x + lenX / 2) * SQUARESIZE,
            y: (task.y + lenY / 2) * SQUARESIZE,
        };
    }

    static _clearBuilderBuildPresentation(sprite) {
        if (!sprite) return;

        if (sprite.buildSwingTween) {
            sprite.buildSwingTween.remove();
            sprite.buildSwingTween = null;
        }

        if (sprite.buildSwingFx) {
            sprite.buildSwingFx.destroy();
            sprite.buildSwingFx = null;
        }
    }

    static _startBuilderBuildPresentation(sprite, task, duration = this.tileBuildingDuration) {
        if (!sprite?.active || !task || !sprite.scene) return;

        task._constructionStarted = true;
        task.totalDuration = Math.max(1, Number(task.totalDuration || duration || this.tileBuildingDuration || 1));
        task._buildStartedAt = Number(this.scene?.time?.now || 0);
        this._startConstructionTaskUiTicker(task);
        this.updateConstructionHoverText(task);

        const target = this._getBuildTaskTargetWorld(task);
        const aim = Math.atan2(target.y - sprite.y, target.x - sprite.x);
        const swingArc = Math.PI * 0.72;
        const handleOffset = 12;

        updateDirectionalAnimationFromVelocity(
            sprite,
            target.x - sprite.x,
            target.y - sprite.y,
            true
        );

        sprite.play?.(sprite.idle);

        this._clearBuilderBuildPresentation(sprite);

        const fx = sprite.scene.add.image(
            sprite.x + Math.cos(aim) * handleOffset,
            sprite.y - 5 + Math.sin(aim) * (handleOffset * 0.42),
            "hammer"
        )
            .setDepth((sprite.depth ?? 0) + 2)
            .setOrigin(0.18, 0.82)
            .setDisplaySize(30, 30)
            .setRotation(aim - swingArc / 2);

        const tween = sprite.scene.tweens.add({
            targets: fx,
            rotation: aim + swingArc / 2,
            duration: Math.max(160, Math.floor(duration / 2)),
            yoyo: true,
            ease: "Sine.easeInOut",
            onUpdate: () => {
                if (!sprite.active || !fx.active) return;
                fx.setPosition(
                    sprite.x + Math.cos(aim) * handleOffset,
                    sprite.y - 5 + Math.sin(aim) * (handleOffset * 0.42)
                );
            },
            onComplete: () => {
                if (sprite.buildSwingFx === fx) sprite.buildSwingFx = null;
                if (sprite.buildSwingTween === tween) sprite.buildSwingTween = null;
                fx.destroy();
            }
        });

        sprite.buildSwingFx = fx;
        sprite.buildSwingTween = tween;
    }

    static createDestroyTileStateArray(tiles, teamNumber, options = {}) {
        const team = Teams.teamLists[teamNumber];
        if (!Array.isArray(team.destroyTileStates)) team.destroyTileStates = [];

        tiles.forEach(t => {
            const destroyJobId = t.destroyJobId ?? options.destroyJobId ?? null;
            team.destroyTileStates.push({
            x: t.x,
            y: t.y,
            assigned: 0,
            type: t.type,
            refundCost: t.refundCost ?? t.type?.cost ?? t.type?.price ?? null,
            teamNumber: Number(teamNumber),
            destroyJobId,
            destroyJobOrder: t.destroyJobOrder ?? team.destroyTileStates.length,
            linkedBuildTaskId: t.linkedBuildTaskId ?? null,
            siteClearForBuild: !!t.siteClearForBuild,
            queueKey: "destroyTileStates",
            // ✅ store what the tile WAS so Builder.js can refund correctly
            originalGridVal: t.originalGridVal,

            // ✅ drive wall HP / time pacing (beginDestroyingTile already uses wall.hp)
            duration: 9999, // any >0; beginDestroyingTile re-ticks off wall.hp anyway
            });
        });
        this.refreshQueuedDestroyJobVisuals(teamNumber);
    }

    static createDestroyStateArray(tasks, teamNumber, options = {}) {
        const team = Teams.teamLists[teamNumber];
        if (!Array.isArray(team.destroyStates)) team.destroyStates = [];

        tasks.forEach((task) => {
            if (!task?.type || task?.value == null) return;
            const target = this._destroyTargetForTask(task);
            const health = this._destroyTargetHealth(target);
            if (!target || !this._isDestroyTargetAlive(target)) return;
            const destroyJobId = task.destroyJobId ?? options.destroyJobId ?? null;
            team.destroyStates.push({
                x: task.x,
                y: task.y,
                assigned: 0,
                type: task.type,
                value: task.value,
                duration: Math.max(1, health.current),
                totalDuration: Math.max(1, health.max),
                refundCost: task.refundCost ?? task.type?.cost ?? task.type?.price ?? null,
                teamNumber: Number(teamNumber),
                destroyJobId,
                destroyJobOrder: task.destroyJobOrder ?? team.destroyStates.length,
                linkedBuildTaskId: task.linkedBuildTaskId ?? null,
                siteClearForBuild: !!task.siteClearForBuild,
                queueKey: "destroyStates",
            });
        });
        this.refreshQueuedDestroyJobVisuals(teamNumber);
    }

    static assingTroopsToBuildTile(teamNumber){
        let buildList = Teams.teamLists[`${teamNumber}`].buildingTileStates
        const force = Player.selected.length? true : false;
        const troops = Player.selected.length? Player.selected : Teams.teamLists[`${teamNumber}`].builderList ;
        Manager.assignTroopsToAction(troops, buildList, CONTROL_STATES.BUILD_MODE_T, force);
    }

    static findBuildApproachTile(buildX, buildY, troop, task = null) {
        const teamNumber = troop?.body?.team ?? task?.teamNumber ?? 1;
        if (task?.wallJobId) {
            this.prepareQueuedWallJobPlans(teamNumber);
            if (this._deferWallTaskIfUnsafe(task, teamNumber)) return null;
        }

        // Adjacent tiles only. No 2-tile stand-off positions.
        const directions = this._wallApproachDirections();

        const { navGrid } = Player._getNavForTroop(troop);

        const candidates = [];
        for (const [dx, dy] of directions) {
            const tx = buildX + dx;
            const ty = buildY + dy;

            if (tx < 0 || ty < 0 || ty >= navGrid.length || tx >= navGrid[0].length) continue;
            if (!this._canUseBuildApproachTile(tx, ty, troop, task)) continue;

            const worldX = tx * SQUARESIZE + SQUARESIZE / 2;
            const worldY = ty * SQUARESIZE + SQUARESIZE / 2;
            const dist = Phaser.Math.Distance.Between(troop.x, troop.y, worldX, worldY);
            candidates.push({ tx, ty, dist });
        }

        candidates.sort((a, b) => a.dist - b.dist);

        for (const c of candidates) {
            const path = Player.pathTo(troop, c.tx, c.ty, true);
            if (path && path.length > 0) {
                return { tx: c.tx, ty: c.ty, path };
            }
        }

        return null;
    }

    static beginBuilding(troop) {
        const task = troop.task;
        const initialTeamNumber = troop?.body?.team ?? task?.teamNumber ?? 1;

        if (!task?.buildType) {
            this._clearBuilderQueuedBuildState(troop, {
                queueKey: "buildingTileStates",
                removeQueueTask: false,
                clearGhost: false,
            });
            return;
        }

        // Prevent instant completion / repeated scheduling every frame.
        if (troop.timer) return;

        if (this._deferWallTaskIfUnsafe(task, initialTeamNumber)) {
            if (troop.task) {
                this._clearBuilderQueuedBuildState(troop, {
                    queueKey: "buildingTileStates",
                    removeQueueTask: false,
                    clearGhost: false,
                });
            }
            return;
        }

        const buildDuration = getMarketWorkDuration(troop, this.tileBuildingDuration);
        AudioManager.setConstructionActive(troop, true);
        this._startBuilderBuildPresentation(troop, task, buildDuration);

        troop.timer = this.scene.time.delayedCall(buildDuration, () => {
            if (!troop.active || troop.state !== CONTROL_STATES.BUILD_MODE_T) {
                this._clearBuilderBuildPresentation(troop);
                AudioManager.setConstructionActive(troop, false);
                troop.timer = null;
                return;
            }

            this._clearBuilderBuildPresentation(troop);
            AudioManager.setConstructionActive(troop, false);
            troop.timer = null;

            const teamNumber = troop.body.team ?? 1;
            const liveTask = troop.task;

            if (!liveTask?.buildType) {
                this._clearBuilderQueuedBuildState(troop, {
                    queueKey: "buildingTileStates",
                    removeQueueTask: false,
                    clearGhost: false,
                });
                return;
            }

            if (this._deferWallTaskIfUnsafe(liveTask, teamNumber)) {
                if (troop.task) {
                    this._clearBuilderQueuedBuildState(troop, {
                        queueKey: "buildingTileStates",
                        removeQueueTask: false,
                        clearGhost: false,
                    });
                }
                return;
            }

            const x = liveTask.x;
            const y = liveTask.y;
            const buildTypeName = liveTask.buildType?.name;
            const isDoor = (buildTypeName === "wall_door" || buildTypeName === "woodWall_door");
            const queuedTasks = Teams.teamLists?.[teamNumber]?.buildingTileStates ?? [];
            const taskStillQueued = queuedTasks.some((queuedTask) => this._sameQueuedBuildTask(queuedTask, liveTask));
            const currentCell = Map.grid?.[y]?.[x];
            const currentNames = Array.isArray(currentCell)
                ? currentCell.map((val) => TILE_MAP(val))
                : [TILE_MAP(currentCell)];
            const tileAlreadyBuilt = currentNames.includes(buildTypeName);

            if (!taskStillQueued || tileAlreadyBuilt) {
                if (tileAlreadyBuilt) {
                    this.clearQueuedTileBuildGhost(liveTask);
                    Teams.removeFromStateArray(teamNumber, "buildingTileStates", liveTask);
                    this.refreshQueuedTileBuildGhosts(teamNumber);
                }
                this._clearBuilderQueuedBuildState(troop, {
                    queueKey: "buildingTileStates",
                    removeQueueTask: false,
                    clearGhost: false,
                });
                return;
            }

            if (liveTask.buildType.block) {
                Map.navGrid[y][x] = 0;
                Map.enemyNavGrid[y][x] = 0;

                const change = this.NavMeshUpdater.blockTile(x, y);
                if (change && change.removedPolyIds) {
                    const impacted = PathRegistry.handlePolysRemoved(Map.navMesh, change.removedPolyIds, change.addedPolyIds);
                    for (const unit of impacted) {
                        PathRepair.repairUnitPath(unit, change.removedPolyIds, Map.navMesh);
                    }
                }

                const enemyChange = this.EnemyNavMeshUpdater.blockTile(x, y);
                if (enemyChange && enemyChange.removedPolyIds) {
                    const impacted = PathRegistry.handlePolysRemoved(Map.enemyNavMesh, enemyChange.removedPolyIds, enemyChange.addedPolyIds);
                    for (const unit of impacted) {
                        PathRepair.repairUnitPath(unit, enemyChange.removedPolyIds, Map.enemyNavMesh);
                    }
                }

                Map.placeTile(x, y, liveTask.buildType.name);

                if (buildTypeName === "wall" || buildTypeName === "woodWall") {
                    Wall.ensureAt(this.scene, x, y, teamNumber);
                    Map.refreshWallShapesAround?.(x, y);
                }
            } else {
                Map.handleGridDelete(null, liveTask.buildType, x, y);
                Map.grid[y][x] = [Map.grid[y][x], liveTask.buildType.grid];

                if (isDoor) {
                    const blocksPlayer = teamNumber === 0;
                    const blocksEnemy = teamNumber !== 0;

                    Map.navGrid[y][x] = blocksPlayer ? 0 : 1;
                    Map.enemyNavGrid[y][x] = blocksEnemy ? 0 : 1;

                    if (blocksPlayer) {
                        const playerChange = this.NavMeshUpdater.blockTile(x, y);
                        if (playerChange && playerChange.removedPolyIds) {
                            const impacted = PathRegistry.handlePolysRemoved(Map.navMesh, playerChange.removedPolyIds, playerChange.addedPolyIds);
                            for (const unit of impacted) {
                                PathRepair.repairUnitPath(unit, playerChange.removedPolyIds, Map.navMesh);
                            }
                        }
                    }

                    if (blocksEnemy) {
                        const enemyChange = this.EnemyNavMeshUpdater.blockTile(x, y);
                        if (enemyChange && enemyChange.removedPolyIds) {
                            const impacted = PathRegistry.handlePolysRemoved(Map.enemyNavMesh, enemyChange.removedPolyIds, enemyChange.addedPolyIds);
                            for (const unit of impacted) {
                                PathRepair.repairUnitPath(unit, enemyChange.removedPolyIds, Map.enemyNavMesh);
                            }
                        }
                    } else {
                        const enemyChange = this.EnemyNavMeshUpdater.blockTiles([{ x, y }], true);
                        if (enemyChange && enemyChange.removedPolyIds) {
                            const impacted = PathRegistry.handlePolysRemoved(Map.enemyNavMesh, enemyChange.removedPolyIds, enemyChange.addedPolyIds);
                            for (const unit of impacted) {
                                PathRepair.repairUnitPath(unit, enemyChange.removedPolyIds, Map.enemyNavMesh);
                            }
                        }
                    }
                } else {
                    this._recomputeLiveNavForCells([{ x, y }], "tile_build_nav_recompute");
                }

                Map.drawGridValue(x, y, 1);

                if (isDoor) {
                    Wall.ensureAt(this.scene, x, y, teamNumber);
                    Map.refreshWallShapesAround?.(x, y);
                }
            }

            this.evacuateBlockedFriendlyTroops(teamNumber);

            this.scene.zoomMixer.updateOverviewCell(x, y, Map.grid);
            Map.regionSystem?.markDirty?.();
            Map.regionDrawer?.markDirty?.();
            Map.enemyRegionSystem?.markDirty?.();
            Map.enemyRegionDrawer?.markDirty?.();
            Map.enemyRegionSystem?.ensureUpToDate?.();

            AudioManager.playWorldSound("sfx_building_complete", { volume: 0.2 });

            const completedTask = liveTask;
            this._clearBuilderQueuedBuildState(troop, {
                queueKey: "buildingTileStates",
                removeQueueTask: true,
                clearGhost: true,
            });
            this.refreshQueuedTileBuildGhosts(teamNumber);
            this._releaseOtherBuildersForQueuedBuild(completedTask, teamNumber, troop, "buildingTileStates");
        });
    }

    static makeWallNoBuild(x, y, gridValueOrCell = null) {
    const cell = (gridValueOrCell == null) ? Map.grid?.[y]?.[x] : gridValueOrCell;

    // overlay is either scalar, or [floor, overlay]
    const overlayVal = Array.isArray(cell) ? cell[1] : cell;
    if (overlayVal == null) return;

    const typeName = TILE_MAP(overlayVal);
    const buildType = TILE_TYPES[typeName];
    if (!buildType) return;

    // doors are non-block in TILE_TYPES; ownership decides which side is blocked
    const isDoor = (buildType.name === "wall_door" || buildType.name === "woodWall_door");
    const ownerWall = Wall.getAt(x, y);
    const inferredOwnerTeam =
        (Map.navGrid?.[y]?.[x] === 0 && Map.enemyNavGrid?.[y]?.[x] === 1) ? 0 :
        (Map.navGrid?.[y]?.[x] === 1 && Map.enemyNavGrid?.[y]?.[x] === 0) ? 1 :
        1;
    const ownerTeam = ownerWall?.team ?? inferredOwnerTeam;

    // --- ensure Map.grid has correct layered form for doors/walls ---
    // (important if caller passed scalar)
    if (!Array.isArray(Map.grid?.[y]?.[x])) {
        Map.grid[y][x] = [Map.grid[y][x], overlayVal];
    } else {
        Map.grid[y][x][1] = overlayVal;
    }

    // --- NAV GRIDS ---
    const hasPlayerNav = Array.isArray(Map.navGrid) && Array.isArray(Map.navGrid[y]);
    const hasEnemyNav  = Array.isArray(Map.enemyNavGrid) && Array.isArray(Map.enemyNavGrid[y]);

    // walls block both; doors block only the opposing side of the owner
    if (buildType.block && !isDoor) {
        if (hasPlayerNav) Map.navGrid[y][x] = 0;
        if (hasEnemyNav)  Map.enemyNavGrid[y][x] = 0;
    } else if (isDoor) {
        const blocksPlayer = ownerTeam === 0;
        const blocksEnemy = ownerTeam !== 0;
        if (hasPlayerNav) Map.navGrid[y][x] = blocksPlayer ? 0 : 1;
        if (hasEnemyNav)  Map.enemyNavGrid[y][x] = blocksEnemy ? 0 : 1;
    }

    // --- NAV MESH (ONLY if nav grids exist; otherwise redraw/menu will explode) ---
    // IMPORTANT: never attempt to rebuild polygons if grids aren’t ready yet.
    try {
        if (buildType.block && !isDoor) {
        if (hasPlayerNav && this.NavMeshUpdater?.blockTile && Map.navMesh) {
            const change = this.NavMeshUpdater.blockTile(x, y);
            if (change?.removedPolyIds) {
            const impacted = PathRegistry.handlePolysRemoved(Map.navMesh, change.removedPolyIds, change.addedPolyIds);
            for (const unit of impacted) PathRepair.repairUnitPath(unit, change.removedPolyIds, Map.navMesh);
            }
        }
        if (hasEnemyNav && this.EnemyNavMeshUpdater?.blockTile && Map.enemyNavMesh) {
            const enemyChange = this.EnemyNavMeshUpdater.blockTile(x, y);
            if (enemyChange?.removedPolyIds) {
            const impacted = PathRegistry.handlePolysRemoved(Map.enemyNavMesh, enemyChange.removedPolyIds, enemyChange.addedPolyIds);
            for (const unit of impacted) PathRepair.repairUnitPath(unit, enemyChange.removedPolyIds, Map.enemyNavMesh);
            }
        }
        } else if (isDoor) {
        const blocksPlayer = ownerTeam === 0;
        const blocksEnemy = ownerTeam !== 0;

        if (hasPlayerNav && this.NavMeshUpdater && Map.navMesh) {
            const playerChange = blocksPlayer
                ? this.NavMeshUpdater.blockTile(x, y)
                : this.NavMeshUpdater.blockTiles([{ x, y }], true);
            if (playerChange?.removedPolyIds) {
                const impacted = PathRegistry.handlePolysRemoved(Map.navMesh, playerChange.removedPolyIds, playerChange.addedPolyIds);
                for (const unit of impacted) PathRepair.repairUnitPath(unit, playerChange.removedPolyIds, Map.navMesh);
            }
        }

        if (hasEnemyNav && this.EnemyNavMeshUpdater && Map.enemyNavMesh) {
            const enemyChange = blocksEnemy
                ? this.EnemyNavMeshUpdater.blockTile(x, y)
                : this.EnemyNavMeshUpdater.blockTiles([{ x, y }], true);
            if (enemyChange?.removedPolyIds) {
                const impacted = PathRegistry.handlePolysRemoved(Map.enemyNavMesh, enemyChange.removedPolyIds, enemyChange.addedPolyIds);
                for (const unit of impacted) PathRepair.repairUnitPath(unit, enemyChange.removedPolyIds, Map.enemyNavMesh);
            }
        }
        }
    } catch (e) {
        // swallow during menu/redraw phase; navmesh can be rebuilt once the world is fully initialized
        console.warn("makeWallNoBuild: skipped navmesh update (nav not ready yet)", e);
    }

    // --- VISUALS ---
    // Put the actual tile art down. For doors, you want layer-1 to exist so map.js change (above) shows it.
    Map.drawGridValue(x, y, 1);
    Wall.ensureAt(this.scene, x, y, ownerTeam);
    Map.refreshWallShapesAround?.(x, y);

    // --- REGION / OVERVIEW ---
    this.scene?.zoomMixer?.updateOverviewCell?.(x, y, Map.grid);
    Map.regionSystem?.markDirty?.();
    Map.regionDrawer?.markDirty?.();
    Map.enemyRegionSystem?.markDirty?.();
    Map.enemyRegionDrawer?.markDirty?.();
    }

    static assignTroopToBuildBlock(teamNumber){
        const force = Player.selected.length? true : false;
        const troops = Player.selected.length? Player.selected : Teams.teamLists[`${teamNumber}`].builderList;
        let blockList = Teams.teamLists[`${teamNumber}`].blockBuildingStates
        Manager.assignTroopsToAction(troops, blockList, CONTROL_STATES.BUILD_MODE_B, force);
        if(Map.isPlacing){
            Map.isPlacing = false; // Exit placing mode
            Map.placingItem.destroy(); // Clear placing item
            Map.placingItem = null;
        }
    }

    // Is there at least one walkable perimeter tile around the block footprint?
    static isBlockAccessible(x, y, type) {
        // perimeter around [x..x+lenX-1] × [y..y+lenY-1]
        for (let dy = -1; dy <= type.lenY; dy++) {
            for (let dx = -1; dx <= type.lenX; dx++) {
            const tx = x + dx;
            const ty = y + dy;

            const inside = (dx >= 0 && dx < type.lenX && dy >= 0 && dy < type.lenY);
            if (inside) continue;

            if (ty < 0 || tx < 0 || ty >= Map.navGrid.length || tx >= Map.navGrid[0].length) continue;
                if (Map.navGrid[ty][tx]) {
                    // found at least one walkable tile adjacent to the block
                    return true;
                }
            }
        }
        return false;
    }

    static findBuildApproachBlock(x, y, type, troop, tStartX = null, tStartY = null, task = null) {
        // Construction should be reachable from any valid neighboring perimeter tile,
        // not a house-style "door" anchor on the bottom edge.
        return this.findApproachAnyPerimeter(x, y, type, troop, tStartX, tStartY, task);
    }

    static usesFrontDoorApproach(type) {
        const typeName = type?.name ?? type?.value ?? type;
        return (
            typeName === TILE_TYPES.house1.name ||
            typeName === TILE_TYPES.house2.name ||
            typeName === TILE_TYPES.storage.name ||
            typeName === TILE_TYPES.clayOven.name
        );
    }

    static findInteractionApproachBlock(x, y, type, troop, tStartX = null, tStartY = null, task = null) {
        if (this.usesFrontDoorApproach(type)) {
            return this.findFrontDoorApproachBlock(x, y, type, troop)
                ?? this.findApproachAnyPerimeter(x, y, type, troop, tStartX, tStartY, task);
        }
        return this.findBuildApproachBlock(x, y, type, troop, tStartX, tStartY, task);
    }

    static findFrontDoorApproachBlock(x, y, type, troop) {
        if (!type || !troop) return null;

        const lenX = type.lenX || 1;
        const ty = y + (type.lenY || 1);
        const { navGrid } = Player._getNavForTroop(troop);
        const candidateXs = [...new Set([
            x + Math.floor((lenX - 1) / 2),
            x + Math.floor(lenX / 2),
        ])];
        let best = null;

        for (const tx of candidateXs) {
            if (tx < 0 || ty < 0 || ty >= navGrid.length || tx >= navGrid[0].length) {
                continue;
            }
            if (!navGrid[ty]?.[tx]) {
                continue;
            }

            const path = Player.pathTo(troop, tx, ty, true);
            if (!path?.length) continue;

            if (!best || path.length < best.path.length) {
                best = { tx, ty, path };
            }
        }

        return best;
    }

    static _perimeterReservationKey(task) {
        return task?.perimeterReservationKey || task?.approachReservationKey || task?.destroyReservationKey || null;
    }

    static _assignedPerimeterDestKeys(task, troop) {
        if (!task || !troop) return new Set();

        const reservationKey = this._perimeterReservationKey(task);
        const used = new Set();
        for (const other of Player.troops) {
            if (!other || other === troop || !other.active) continue;
            if (other.body?.team !== troop.body?.team) continue;
            const sameTask = other.task === task;
            const sameReservation = reservationKey && this._perimeterReservationKey(other.task) === reservationKey;
            if (!sameTask && !sameReservation) continue;
            if (!Number.isFinite(other.destX) || !Number.isFinite(other.destY)) continue;
            used.add(`${other.destX},${other.destY}`);
        }
        return used;
    }

    static findApproachAnyPerimeter(x, y, type, troop, tStartX = null, tStartY = null, task = null) {
        const candidates = [];
        const startX = x;
        const startY = y;

        const { navMesh, navGrid } = Player._getNavForTroop(troop)

        // 1) Collect all walkable perimeter tiles around footprint
        for (let dy = -1; dy <= type.lenY; dy++) {
            for (let dx = -1; dx <= type.lenX; dx++) {
            const tx = startX + dx;
            const ty = startY + dy;

            const inside = dx >= 0 && dx < type.lenX && dy >= 0 && dy < type.lenY;
            if (inside) continue;

            if (tx < 0 || ty < 0 || ty >= navGrid.length || tx >= navGrid[0].length) continue;
            if (!navGrid[ty][tx]) continue;

            const worldX = tx * SQUARESIZE + SQUARESIZE / 2;
            const worldY = ty * SQUARESIZE + SQUARESIZE / 2;

            let dist;
            if (troop) {
                dist = Phaser.Math.Distance.Between(troop.x, troop.y, worldX, worldY);
            } else {
                dist = Phaser.Math.Distance.Between(
                    tStartX * SQUARESIZE + SQUARESIZE / 2,
                    tStartY * SQUARESIZE + SQUARESIZE / 2,
                    worldX,
                    worldY
                );
            }

            candidates.push({ tx, ty, dist });
            }
        }

        // 2) Resolve start world pos
        if (tStartX == null || tStartY == null) {
            let troopX = Math.floor(troop.x / SQUARESIZE);
            let troopY = Math.floor(troop.y / SQUARESIZE);
            tStartX = troop.x;
            tStartY = troop.y;

            if (!navGrid[troopY]?.[troopX]) {
                const [newX, newY] = Player.findBestStartPos(troop, troopX, troopY);
                if (newX === -1) return null;
                tStartX = newX * SQUARESIZE + SQUARESIZE / 2;
                tStartY = newY * SQUARESIZE + SQUARESIZE / 2;
            }
        } else {
            tStartX = tStartX * SQUARESIZE + SQUARESIZE / 2;
            tStartY = tStartY * SQUARESIZE + SQUARESIZE / 2;
        }

        // 3) Prefer open perimeter tiles already not claimed by other troops on the same task.
        candidates.sort((a, b) => a.dist - b.dist);
        const occupied = this._assignedPerimeterDestKeys(task, troop);
        const ordered = [
            ...candidates.filter(c => !occupied.has(`${c.tx},${c.ty}`)),
            ...candidates.filter(c => occupied.has(`${c.tx},${c.ty}`)),
        ];

        for (const c of ordered) {
            const result = navMesh.findPathDetailed(
                { x: tStartX, y: tStartY },
                { x: c.tx * SQUARESIZE + SQUARESIZE / 2, y: c.ty * SQUARESIZE + SQUARESIZE / 2 },
                { includePolys: true }
            );
            if (result?.points?.length) {
                return { tx: c.tx, ty: c.ty, path: result.points, polyIds: result.polyIds || [] };
            }
        }

        return null;
    }

    static beginBuildingBlock(sprite) {
        let task = sprite.task;

        if (this._isBlockBuildAwaitingSiteClear(task)) {
            this._clearBuilderQueuedBuildState(sprite, {
                queueKey: "blockBuildingStates",
                removeQueueTask: false,
                clearGhost: false,
            });
            return;
        }

        if (!task || task.duration <= 0) {
            this._clearBuilderQueuedBuildState(sprite, {
                queueKey: "blockBuildingStates",
                removeQueueTask: false,
                clearGhost: false,
            });
            return;
        }

        this.ensureQueuedBlockBuildGhost(task, sprite.body.team);
        this._startQueuedBlockConstruction(task);
        task.constructionSprite?.setAlpha?.(0.78);

        AudioManager.setConstructionActive(sprite, true);

        if (!sprite.timer) {
            const buildDuration = getMarketWorkDuration(sprite, this.blockBuildingDuration);
            this._startBuilderBuildPresentation(sprite, task, buildDuration);

            sprite.timer = this.scene.time.delayedCall(buildDuration, () => {
                if (!sprite.active || sprite.state != CONTROL_STATES.BUILD_MODE_B) {
                    this._clearBuilderBuildPresentation(sprite);
                    AudioManager.setConstructionActive(sprite, false);
                    sprite.timer = null;
                    return;
                }

                let teamNumber = sprite.body.team;
                task = sprite.task;

                if (!task || task.duration <= 0) {
                    this._clearBuilderBuildPresentation(sprite);
                    AudioManager.setConstructionActive(sprite, false);
                    this._clearBuilderQueuedBuildState(sprite, {
                        queueKey: "blockBuildingStates",
                        removeQueueTask: false,
                        clearGhost: false,
                    });
                    return;
                }

                const target = this._getBuildTaskTargetWorld(task);
                updateDirectionalAnimationFromVelocity(
                    sprite,
                    target.x - sprite.x,
                    target.y - sprite.y,
                    true
                );
                sprite.play?.(sprite.idle);

                task.duration -= 2;
                sprite.stamina = Math.max(0, sprite.stamina - 0.2);

                buildingManager.updateConstructionHoverText(task);

                if (task.duration <= 0) {
                    this._clearBuilderBuildPresentation(sprite);
                    AudioManager.setConstructionActive(sprite, false);
                    sprite.timer = null;

                    const cost = task.type.cost;
                    if (cost && !task.prepaid && !this.hasRequiredMaterials(cost, teamNumber)) {
                        this._clearBuilderQueuedBuildState(sprite, {
                            queueKey: "blockBuildingStates",
                            removeQueueTask: false,
                            clearGhost: false,
                        });
                        return;
                    }

                    if (cost && !task.prepaid) {
                        this.consumeRequiredMaterials(cost, teamNumber);
                    }

                    AudioManager.playWorldSound("sfx_building_complete");

                    this.clearQueuedBlockBuildGhost(task);

                    this.handlePlacement(task, teamNumber);
                    this.evacuateBlockedFriendlyTroops(teamNumber);

                    this.scene.zoomMixer.buildOverviewTextureFromGrid(Map.grid, SQUARESIZE, (cell) => colorFor(cell));

                    Map.regionSystem?.markDirty?.();
                    Map.regionDrawer?.markDirty?.();
                    Map.enemyRegionSystem?.markDirty?.();
                    Map.enemyRegionSystem?.ensureUpToDate?.();
                    Map.enemyRegionDrawer?.markDirty?.();

                    Teams.removeFromStateArray(teamNumber, "blockBuildingStates", task);
                    this._releaseOtherBuildersForQueuedBuild(task, teamNumber, sprite, "blockBuildingStates");
                    this._clearBuilderQueuedBuildState(sprite, {
                        queueKey: "blockBuildingStates",
                        removeQueueTask: false,
                        clearGhost: false,
                    });
                } else {
                    this._clearBuilderBuildPresentation(sprite);
                    sprite.timer = null;
                    this.beginBuildingBlock(sprite);
                }
            });
        }
    }

    static handlePlacement(task, teamNumber = 1){
        const ownerTeam = Number(teamNumber ?? task?.teamNumber ?? 1) || 1;
        if(task.type == TILE_TYPES.clayOven){
            new ClayOven(task.x, task.y, ownerTeam, { applyNavUpdate: true });
        }else if(task.type == TILE_TYPES.storage){
            new StorageBuilding(task.x, task.y, ownerTeam);
        }else if(task.type == TILE_TYPES.house1 || task.type == TILE_TYPES.house2){
            new House(task.x, task.y, task.type, ownerTeam);
        }else if(task.type == TILE_TYPES.tower){
            new TowerBuilding(task.x, task.y, ownerTeam, {
                isTownTower: ownerTeam === 1,
                isStarterTownTower: false,
                isFortObjective: ownerTeam !== 1,
                grantBuildPermit: ownerTeam === 1,
            });
        }else if(task.type == TILE_TYPES.turret){
            new Turret(task.x, task.y, ownerTeam);
        }else if(task.type == TILE_TYPES.catapult){
            new Catapult(task.x, task.y, ownerTeam);
        }else{
            Map.handleMapClick(task.x*SQUARESIZE, task.y*SQUARESIZE, task.type);
        }
    }

    static assingTroopsToDestroy(teamNumber){
        let destroyList = Teams.teamLists[`${teamNumber}`].destroyStates;
        const force = Player.selected.length? true : false;
        const troops = Player.selected.length? Player.selected : Teams.teamLists[`${teamNumber}`].builderList;
        Manager.assignTroopsToAction(troops, destroyList, CONTROL_STATES.DESTROY_MODE, force);
    }

    static assignTroopsToDestroyTile(teamNumber){
        const destroyList = Teams.teamLists[`${teamNumber}`].destroyTileStates;
        const force = Player.selected.length ? true : false;
        const troops = Player.selected.length ? Player.selected : Teams.teamLists[`${teamNumber}`].builderList;
        Manager.assignTroopsToAction(troops, destroyList, CONTROL_STATES.DESTROY_MODE_T, force);
    }

    static beginDestroyingBlock(sprite) {
        let task = sprite.task;
        if (task?.canceled) {
            this._clearDestroyWorkerState(sprite);
            return;
        }
        const synced = task ? this._syncDestroyTaskHealth(task) : null;
        if (!task || !synced || synced.current <= 0 || !this._isDestroyTargetAlive(task)) {
            console.log(`sprite: ${sprite.id} delete mode outside of timer with duration: ${task?.duration}`)
            if (task) {
                this._clearInvalidDestroyTask(sprite, task);
                return;
            }
            this._clearInvalidDestroyTask(sprite, task);
            return;
        }

        sprite.timer = this.scene.time.delayedCall(getMarketWorkDuration(sprite, 1000), () => {
            if(!sprite.active || sprite.state != CONTROL_STATES.DESTROY_MODE) return;
            if (task?.canceled) {
                this._clearDestroyWorkerState(sprite);
                return;
            }
            const live = task ? this._syncDestroyTaskHealth(task) : null;
            if (!task || !live || live.current <= 0 || !this._isDestroyTargetAlive(task)){
                console.log(`sprite: ${sprite.id} delete mode within timer `)
                this._clearInvalidDestroyTask(sprite, task);
                return;
            }

            // Ensure totalDuration snapshot exists (you already do this)
            if (!task.totalDuration) task.totalDuration = task.duration;

            // ✅ Gunslinger: fire projectile; projectile applies damage to *task.duration* via callback
            if (sprite.isGunslinger && sprite.weapon?.projectile) {
                // range+LOS gate (you already added these helpers in Gunslinger)
                if (!sprite._canShootDestroyTarget?.()) {
                    if (sprite.timer) { sprite.timer.remove(false); sprite.timer = null; }
                    sprite._ensureShootPositionOrRepath?.();
                    return;
                }

                const targetSprite = sprite._getDestroyTarget?.();
                if (!targetSprite || !targetSprite.active) return;

                fightManager.playAttackPresentation(sprite, targetSprite, { playAudio: false });
                const ang = Phaser.Math.Angle.Between(sprite.x, sprite.y, targetSprite.x, targetSprite.y);

                const proj = new Projectile(
                    sprite.x, sprite.y, ang,
                    sprite.body.team,
                    sprite.weapon,
                    sprite,
                    true
                );

                // cadence: schedule next shot if task still alive
                const reloadDuration = this._destroyAttackDuration(sprite);
                Player.markRangedReload?.(sprite, reloadDuration);
                if (sprite.timer) { sprite.timer.remove(false); sprite.timer = null; }
                sprite.timer = this.scene.time.delayedCall(reloadDuration, () => {
                    if (!sprite.task) return;
                    this.beginDestroyingBlock(sprite);
                });

                return;
            }
            else{
                // --- non-gunslinger path (existing melee/chip) stays the same ---
                let damage;
                if (!sprite.body.team || (sprite.type == Brawler || sprite.type == Blademaster || sprite.type == Gunslinger)) {
                    // Raiders / enemies: use their weapon to damage buildings
                    damage = fightManager.getModifiedWeaponDamage(sprite, sprite.weapon?.baseDmg || 5);
                } else {
                    // Player-side "demolition" – slow chip damage
                    damage = this.playerBuildingDemolitionDamage;
                }

                // Resolve building instance: prefer value.buildingRef, fall back to value
                const targetObj = task.value?.buildingRef || task.value;
                if (!sprite.body.team || (sprite.type == Brawler || sprite.type == Blademaster || sprite.type == Gunslinger)) {
                    fightManager.playAttackPresentation(sprite, targetObj?.sprite || targetObj);
                }

                this.applyDestroyDamage(task, damage);
            }

            if (task.duration <= 0) {
                if (sprite.timer) { sprite.timer.remove(false); sprite.timer = null; }
                console.log("Done Destroying.");
                this.playBuildingCollapseSfxOnce(task.value?.buildingRef || task.value);
                this._completeDestroyBlock(sprite, task);   // ✅ single source of truth
                return;
            }
            else {
                console.log(`sprite: ${sprite.id} continue building with new duration ${task.duration}`)
                sprite.timer.remove(false);
                sprite.timer = null;
                AudioManager.playWorldSound("sfx_building_damage");
                // 🔥 Restart another delayed call if still destroying
                this.beginDestroyingBlock(sprite);
            }

        });
    
    }

    // buildingManager.js
    static beginDestroyingTile(sprite) {
        const task = sprite.task;
        if (!task) return;
        if (task.canceled) {
            this._clearDestroyWorkerState(sprite);
            return;
        }

        // If task somehow invalid, bail cleanly
        if (task.duration == null || task.duration <= 0) {
            sprite.task = null;
            if (sprite.timer) { sprite.timer.remove(false); sprite.timer = null; }
            return;
        }

        // --- HP-based wall/door destruction ---
        // Ensure there is a Wall instance for visuals/HP tracking
        const tx = task.tx || task.x;
        const ty = task.ty || task.y;

        const wall = Wall.getAt(tx, ty);

        // If the target tile isn't a wall/door anymore, just cleanly finish this task.
        if (!wall || !wall.active) {
            this._clearInvalidDestroyTask(sprite, task);
            return;
        }

        // ✅ Gunslinger fires a projectile at the wall; projectile schedules impact
        let destroyed = false; // ✅ must exist for both paths

        // ✅ Gunslinger fires a projectile at the wall; projectile drives wall.hp
        if (sprite.isGunslinger && sprite.weapon?.projectile) {
            // Range+LOS gate
            if (!sprite._canShootDestroyTarget?.()) {
                sprite._ensureShootPositionOrRepath?.();
                return;
            }

            const targetSprite = wall.sprite;
            fightManager.playAttackPresentation(sprite, targetSprite, { playAudio: false });
            const ang = Phaser.Math.Angle.Between(sprite.x, sprite.y, targetSprite.x, targetSprite.y);

            const proj = new Projectile(
                sprite.x, sprite.y, ang,
                sprite.body.team,
                sprite.weapon,
                sprite,
                true            
            );


            // cadence: keep shooting until destroyed (don’t rely on `destroyed` here)
            const reloadDuration = this._destroyAttackDuration(sprite);
            Player.markRangedReload?.(sprite, reloadDuration);
            if (sprite.timer) { sprite.timer.remove(false); sprite.timer = null; }
            sprite.timer = this.scene.time.delayedCall(reloadDuration, () => {
                if (!sprite.task) return;
                this.beginDestroyingTile(sprite);
            });

            return; // ✅ IMPORTANT: prevent falling through to melee path
        }
        else{
            // Damage amount (raiders use weapon, players use chip)
            const damage = (!sprite.body.team || (sprite.type == Brawler || sprite.type == Blademaster || sprite.type == Gunslinger))
            ? fightManager.getModifiedWeaponDamage(sprite, sprite.weapon?.baseDmg || 5)
            : this.playerWallDemolitionDamage;

            fightManager.playAttackPresentation(sprite, wall.sprite);

            // Apply damage to the wall itself (this drives phase/frame changes)
            destroyed = wall.damage(damage);
        }

        // OPTIONAL: expose hp for debug UI / bars
        task.totalHp = wall.maxHp;
        task.hp = wall.hp;

        // If not destroyed yet, keep ticking
        if (!destroyed) {
        if (sprite.timer) { sprite.timer.remove(false); sprite.timer = null; }
            sprite.timer = this.scene.time.delayedCall(this._destroyAttackDuration(sprite), () => {
                if (!sprite.task) return;
                this.beginDestroyingTile(sprite);
            });
            return;
        }
        // ===== DESTROY COMPLETE =====
        this._completeDestroyTile(sprite, task, tx, ty);
        return true;
    }

    static _completeDestroyBlock(sprite, task) {
        const teamNumber = sprite.body.team;
        const destroyJobId = task?.destroyJobId ?? null;

        // stop repeating
        if (sprite.timer) { sprite.timer.remove(false); sprite.timer = null; }

        sprite.play(sprite.idle);

        // destroy the building object/sprite
        const targetObj = task.value?.buildingRef || task.value;

        if (targetObj && typeof targetObj.destroy === "function") {
            targetObj.destroy(); // calls ClayOven/House/StorageBuilding.destroy
            targetObj._destroyed = true;
            if ("health" in targetObj) targetObj.health = 0;
            if ("hp" in targetObj) targetObj.hp = 0;
            if (task.type == TILE_TYPES.pine) {
                removeFromArray(Map.worldPines, targetObj);
            }
        } else if (task.value && typeof task.value.destroy === "function") {
            removeFromArray(Map.worldStones, task.value);
            task.value.destroy(); // fallback: just sprite
        }

        this.cleanupDestroyedBlockBuilding(targetObj || task.value, task.x, task.y, task.type);

        // per-unit callbacks (kept from your completion block)
        if (sprite.type == Brawler || sprite.type == Blademaster || sprite.type == Gunslinger) {
            Player.onBlockDestroyed(sprite, task);
        } else if (teamNumber) {
            this._refundQueuedBuildCost({
                prepaid: true,
                refundCost: task.refundCost ?? task.type?.cost ?? task.type?.price ?? null,
            }, teamNumber);
        }

        // ✅ remove the shared task from the team queue
        this._clearQueuedDestroyTaskVisual(task);
        Teams.removeFromStateArray(teamNumber, "destroyStates", task);

        // ✅ remove building record + clear task from the killer
        sprite.task = null;

        // ✅ reassign the killer
        Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_MODE);
        if (destroyJobId) this.refreshQueuedDestroyJobVisuals(teamNumber);
        if (destroyJobId) this._activateLinkedBuildsIfDestroyJobComplete(destroyJobId, teamNumber);
    }

    static cleanupDestroyedBlockBuilding(buildingOrSprite, x = null, y = null, type = null, opts = {}) {
        const building = buildingOrSprite?.buildingRef || buildingOrSprite || null;
        const tileType = type || building?.tileType || building?.buildType || building?.type || null;
        const gridX = Math.floor(Number(x ?? building?.x ?? building?.gridX ?? building?.sx));
        const gridY = Math.floor(Number(y ?? building?.y ?? building?.gridY ?? building?.sy));

        if (!tileType || !Number.isFinite(gridX) || !Number.isFinite(gridY)) return false;

        let changed = false;
        if (!building || !building._blockFootprintCleared) {
            changed = this.clearBlockFootprint(gridX, gridY, tileType, opts) || changed;
            if (building) building._blockFootprintCleared = true;
        }

        if (opts.removeFromArrays !== false && (!building || !building._buildingArrayRemoved)) {
            this.removeBuildingFromArray(gridX, gridY);
            if (building) building._buildingArrayRemoved = true;
            changed = true;
        }

        return changed;
    }

    static playBuildingCollapseSfxOnce(buildingOrSprite, opts = {}) {
        const building = buildingOrSprite?.buildingRef || buildingOrSprite || null;
        if (building?._collapseSfxPlayed) return false;
        if (building) building._collapseSfxPlayed = true;
        AudioManager.playWorldSound("sfx_building_collapse", opts);
        return true;
    }

    static clearBlockFootprint(x, y, type, opts = {}) {
        if (!type?.block && !type?.stayBlocked) return false;

        const lenX = Math.max(1, Number(type.lenX || 1) || 1);
        const lenY = Math.max(1, Number(type.lenY || 1) || 1);
        const startX = Number(x);
        const startY = Number(y);
        if (!Number.isFinite(startX) || !Number.isFinite(startY)) return false;

        const blockTiles = [];
        for (let row = startY; row < startY + lenY; row++) {
            if (!Map.grid?.[row]) continue;
            for (let col = startX; col < startX + lenX; col++) {
                if (Map.grid[row][col] == null) continue;
                blockTiles.push({ x: col, y: row });

                if (Array.isArray(Map.grid[row][col])) {
                    Map.grid[row][col] = Map.grid[row][col][0];
                }
            }
        }

        if (!blockTiles.length) return false;

        if (opts.updateOverview !== false) {
            this.scene?.zoomMixer?.updateOverviewCell?.(startX, startY, Map.grid, lenX, lenY);
        }

        if (opts.redraw !== false) {
            Map.redrawRect?.(startX, startY, lenX, lenY, 1);
        }

        if (opts.updateNavMesh !== false) {
            this._recomputeLiveNavForCells(blockTiles, "block_footprint_clear", opts);
        } else {
            Map.recomputeNavForCells?.(blockTiles, "block_footprint_clear");
        }

        Map.regionSystem?.markDirty?.();
        Map.regionDrawer?.markDirty?.();
        Map.enemyRegionSystem?.markDirty?.();
        Map.enemyRegionDrawer?.markDirty?.();
        Map.enemyRegionSystem?.ensureUpToDate?.();
        return true;
    }


    static _completeDestroyTile(sprite, task, tx, ty, options = {}) {
        const wall = Wall.getAt(tx, ty);
        const destroyJobId = task?.destroyJobId ?? null;
        const {
            countRaiderSiegeProgress = true,
            preserveSpriteTimer = false,
            preserveTroopState = false,
        } = options || {};

        // stop repeating
        if (!preserveSpriteTimer && sprite.timer) { sprite.timer.remove(false); sprite.timer = null; }

        // remove wall sprite + clear grid overlay
        Wall.destroyAt(tx, ty);
        this._recomputeLiveNavForCells([{ x: tx, y: ty }], "destroy_tile_nav_recompute");

        // Patch the overview texture locally after the wall overlay is removed.
        this.scene?.zoomMixer?.updateOverviewCell?.(tx, ty, Map.grid);

        // region/border maintenance (siege)
        Map.enemyRegionSystem?.removeWallFromBorderIndex?.(tx, ty);
        Map.enemyRegionSystem?.markDirty?.();
        Map.enemyRegionDrawer?.markDirty?.();

        Map.regionSystem?.markDirty?.();
        Map.regionDrawer?.markDirty?.();

        Map.enemyRegionSystem?.ensureUpToDate?.();

        // task cleanup + troop cleanup
        if (sprite.body.team) {
            // player units
            if (sprite.type === Brawler || sprite.type === Blademaster || sprite.type === Gunslinger) {
            Player.onWallDestroyed?.(sprite, task);
            } else {
            Builder.onWallDestroyed?.(sprite, task);
            }
        } else {
            // raiders
            if (countRaiderSiegeProgress) {
                Raider.siegeComplete?.(sprite);
            }
        }

        // remove task from appropriate queue
        // For player demolition: destroyTileStates
        // For enemy-destroy commands: enemyDestroyTileStates (if you’re using that)
        const teamList = Teams.teamLists[sprite.body.team];
        this._clearQueuedDestroyTaskVisual(task);
        if (teamList?.destroyTileStates) Teams.removeFromStateArray(sprite.body.team, "destroyTileStates", task);
        if (teamList?.enemyDestroyTileStates) Teams.removeFromStateArray(sprite.body.team, "enemyDestroyTileStates", task);

        if (!preserveTroopState && sprite.task === task) {
            sprite.task = null;
            Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_MODE);
        }
        if (!preserveTroopState) {
            sprite.play(sprite.idle);
        }
        if (destroyJobId) this.refreshQueuedDestroyJobVisuals(sprite.body.team);
        if (destroyJobId) this._activateLinkedBuildsIfDestroyJobComplete(destroyJobId, sprite.body.team);
    }



    static removeBuildingFromArray(x, y) { //problematic, hard looping as we dont know who destroying and why
        // 1) Remove from global town.buildingArray
        for (let i = 0; i < buildingArray.length; i++) {
            const [bx, by] = buildingArray[i];
            if (bx === x && by === y) {
                console.log(`REMOVED BUILDING (global) at ${bx},${by}`);
                buildingArray.splice(i, 1);
                break;
            }
        }

        // 2) Remove from each team’s buildings list and clean matching destroy tasks
        for (const teamKey in Teams.teamLists) {
            const team = Teams.teamLists[teamKey];
            if (!team) continue;

            if (Array.isArray(team.buildings)) {
                const before = team.buildings.length;

                team.buildings = team.buildings.filter(([bx, by, type, building]) => {
                    return !(bx === x && by === y);
                });

                // If we actually removed something from this team, also clear destroy tasks at that tile
                if (team.buildings.length !== before && Array.isArray(team.destroyStates)) {
                    team.destroyStates = team.destroyStates.filter(t => {
                        const remove = t.x === x && t.y === y;
                        if (remove) this._clearQueuedDestroyTaskVisual(t);
                        return !remove;
                    });
                }
                if (team.buildings.length !== before && Array.isArray(team.enemyDestroyStates)) {
                    team.enemyDestroyStates = team.enemyDestroyStates.filter(t => t.x !== x || t.y !== y);
                }
                if (team.buildings.length !== before && Array.isArray(team.buildingFixTasks)) {
                    team.buildingFixTasks = team.buildingFixTasks.filter(t => {
                        const remove = t.x === x && t.y === y;
                        if (remove) this.clearFixTaskVisual?.(t);
                        return !remove;
                    });
                }
            }
        }

        for (const troop of Player.troops || []) {
            const task = troop?.task;
            if (!task || task.x !== x || task.y !== y) continue;
            const target = this._destroyTargetForTask(task);
            if (target && this._isDestroyTargetAlive(target)) continue;
            this._clearInvalidDestroyTask(troop, task);
        }

        return true;
    }

    static beginFixingBuilding(sprite) {
        const task = sprite.task;

        if (!task || !task.value) {
            this.clearFixTaskVisual(task);
            this._clearBuilderBuildPresentation(sprite);
            AudioManager.setConstructionActive(sprite, false);
            sprite.task = null;
            sprite.timer = null;
            Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_MODE);
            sprite.play(sprite.idle);
            return;
        }

        const b = task.value; // the building instance you stored
        const maxHp = (b.maxHealth ?? 100);
        const hpKey = ("health" in b) ? "health" : (("hp" in b) ? "hp" : "health");
        const buildingHp = (b[hpKey] ?? 0);

        if (b._destroyed || b.sprite?._destroyed || b.sprite?.active === false || buildingHp <= 0) {
            this.clearFixTaskVisual(task);
            this._clearBuilderBuildPresentation(sprite);
            AudioManager.setConstructionActive(sprite, false);
            Teams.removeFromStateArray(sprite.body.team, "buildingFixTasks", task);
            sprite.task = null;
            sprite.timer = null;
            Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_MODE);
            sprite.play(sprite.idle);
            return;
        }

        if (buildingHp >= maxHp) {
            // already fixed
            this.clearFixTaskVisual(task);
            this._clearBuilderBuildPresentation(sprite);
            AudioManager.setConstructionActive(sprite, false);
            Teams.removeFromStateArray(sprite.body.team, "buildingFixTasks", task);
            sprite.task = null;
            sprite.timer = null;
            Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_MODE);
            sprite.play(sprite.idle);
            return;
        }

        if (!sprite.timer) {
            const adjustedRepairDuration = getMarketWorkDuration(sprite, this.repairTickDuration);
            AudioManager.setConstructionActive(sprite, true);
            this._startBuilderBuildPresentation(sprite, task, adjustedRepairDuration);

            sprite.timer = this.scene.time.delayedCall(adjustedRepairDuration, () => {
            if (!sprite.active || sprite.state !== CONTROL_STATES.FIX_BUILDING) {
                this._clearBuilderBuildPresentation(sprite);
                AudioManager.setConstructionActive(sprite, false);
                if (sprite) sprite.timer = null;
                return;
            }

            // building might have been destroyed mid-task
            if (!sprite.task || !sprite.task.value) {
                this.clearFixTaskVisual(sprite.task);
                this._clearBuilderBuildPresentation(sprite);
                AudioManager.setConstructionActive(sprite, false);
                sprite.task = null;
                sprite.timer = null;
                Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_MODE);
                sprite.play(sprite.idle);
                return;
            }

            const building = sprite.task.value;
            const maxHealth = (building.maxHealth ?? 100);
            const key = ("health" in building) ? "health" : (("hp" in building) ? "hp" : "health");

            if (building._destroyed || building.sprite?._destroyed || building.sprite?.active === false || (building[key] ?? 0) <= 0) {
                this.clearFixTaskVisual(sprite.task);
                Teams.removeFromStateArray(sprite.body.team, "buildingFixTasks", sprite.task);
                this._clearBuilderBuildPresentation(sprite);
                AudioManager.setConstructionActive(sprite, false);
                sprite.task = null;
                sprite.timer = null;
                Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_MODE);
                sprite.play(sprite.idle);
                return;
            }

            const before = (building[key] ?? 0);
            const healed = Math.min(5, maxHealth - before);
            building[key] = Math.min(maxHealth, before + healed);
            if (healed > 0) {
                this.scene?.achievementSystem?.addStat?.("repairPoints", healed);
            }
            building.updateHealthBar?.();

            // green flash + shake
            if (building.sprite) {
                building.sprite.setTint(0x44ff44);
                this.scene.tweens.add({
                targets: building.sprite,
                x: building.sprite.x + 2,
                yoyo: true,
                repeat: 2,
                duration: 60,
                onComplete: () => building.sprite.clearTint()
                });
            }


            showGhostText(this.scene, building.x, building.y - 20, `+${healed} 💚`, 0x44ff44);
            

            sprite.play(sprite.action);

            // finished?
            if (building[key] >= maxHealth) {
                this.clearFixTaskVisual(sprite.task);
                Teams.removeFromStateArray(sprite.body.team, "buildingFixTasks", sprite.task);
                sprite.task = null;
                this._clearBuilderBuildPresentation(sprite);
                AudioManager.setConstructionActive(sprite, false);

                if (sprite.timer) {
                sprite.timer.remove(false);
                sprite.timer = null;
                }

                Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_MODE);
                sprite.play(sprite.idle);
                return;
            }

            // continue ticking
            sprite.timer.remove(false);
            sprite.timer = null;
            this._clearBuilderBuildPresentation(sprite);
            this.beginFixingBuilding(sprite);
            });
        }
    }

    static getAvailableMaterialCount(res, teamNumber) {
        if (res === "money") return Math.max(0, Number(this.scene?.money ?? 0));
        if (res === "permits") return Math.max(0, Number(this.scene?.permits ?? 0));

        const itemDef = UI_ITEM_TYPES[res];
        if (!itemDef) return 0;
        return StorageManager.getStoredItemCountForTeam(teamNumber, itemDef);
    }

    static getMissingMaterials(costObj, teamNumber) {
        const missing = [];
        for (const [res, count] of Object.entries(costObj)) {
            const amount = Math.max(0, Number(count) || 0);
            if (!(amount > 0)) continue;
            const available = this.getAvailableMaterialCount(res, teamNumber);
            if (available < amount) {
                missing.push({
                    key: res,
                    required: amount,
                    available,
                    missing: amount - available,
                    label: UI_ITEM_TYPES[res]?.label || String(res).replace(/_/g, " "),
                });
            }
        }
        return missing;
    }

    static hasRequiredMaterials(costObj, teamNumber) {
        return this.getMissingMaterials(costObj, teamNumber).length <= 0;
    }

    static consumeRequiredMaterials(costObj, teamNumber) {
        for (const [res, count] of Object.entries(costObj)) {
            const amount = Math.max(0, Number(count) || 0);
            if (!(amount > 0)) continue;
            if (res === "money") {
                this.scene?.updateMoney?.(-amount);
                continue;
            }
            if (res === "permits") {
                this.scene?.updatePermits?.(-amount);
                continue;
            }

            const itemDef = UI_ITEM_TYPES[res];
            if (!itemDef) continue;
            let remaining = amount;
            const storages = Teams.teamLists?.[teamNumber]?.storageList ?? Teams.teamLists?.[`${teamNumber}`]?.storageList ?? [];
            for (const storage of storages) {
                if (!(remaining > 0) || !storage?.removeItem) break;
                const before = Math.max(0, Number(storage.getItemCount?.(itemDef) || 0));
                storage.removeItem(itemDef.name, remaining);
                const after = Math.max(0, Number(storage.getItemCount?.(itemDef) || 0));
                remaining -= Math.max(0, before - after);
            }
            const consumed = amount - remaining;
            if (consumed > 0) {
                DailyNeedsTracker.updateUIItems(itemDef, consumed, true);
            }
        }
    }

    static updateConstructionHoverText(task) {
        const scene = buildingManager.scene;
        if (!scene || !task || !task.constructionSprite) return;
        if (this._isQueuedWallTask(task)) return;
        this._ensureConstructionTaskUi(task);

        const label = task.labelText;
        if (!label) return;

        const pct = this._currentConstructionPercent(task);
        const name = this._getTaskDisplayName(task);
        label.setText(this._isBlockBuildAwaitingSiteClear(task) ? `${name}\nClearing site` : `${name}\n${pct}%`);

        const sprite = task.constructionSprite;
        const x = sprite.x;
        const y = sprite.y;

        label.setPosition(x, y);
        label.setVisible(true);
    }

}
