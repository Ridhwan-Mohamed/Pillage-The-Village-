// players/Raider.js
import { SQUARESIZE, CONTROL_STATES, WORLD_DIMENSIONX, WORLD_DIMENSIONY, TILE_MAP, TILE_TYPES } from "../constants";
import { Player } from "./Player";
import { AudioManager } from "../Manager/AudioManager";
import { Teams } from "../Teams";
import { Manager } from "../Manager/Manager";
import { Map } from "../map";
import { Wall } from "../buildings/Wall";
import { weapons } from "../weapons";
import { pickRaidApproachForPOI, recalculateDestroyTasksFromPoint } from "../Manager/spawnManager";
import { SiegePlanner } from "../lib/navmesh/SiegePlanner"
import { ZoomMixer } from "../UI/ZoomMixer";
import {
    attachDirectionalSix,
    shouldUseDirectionalFacing,
    updateDirectionalAnimationFromVelocity
} from "./PlayerDirectionalAnimator";
import { InterruptController } from "../ai/scheduler/InterruptController";
import { CombatSpacingCoordinator } from "../ai/CombatSpacingCoordinator";
import { fightManager } from "../Manager/fightManager";
import raiderWalkDown from 'url:../assets/players/raider/raider_walk_down.png';
import raiderWalkDownLeft from 'url:../assets/players/raider/raider_walk_down_left.png';
import raiderWalkDownRight from 'url:../assets/players/raider/raider_walk_down_right.png';
import raiderWalkUp from 'url:../assets/players/raider/raider_walk_up.png';
import raiderWalkUpLeft from 'url:../assets/players/raider/raider_walk_up_left.png';
import raiderWalkUpRight from 'url:../assets/players/raider/raider_walk_up_right.png';
import raiderSwimUp from 'url:../assets/players/raider/raider_swim_up.png';
import raiderSwimDown from 'url:../assets/players/raider/raider_swim_down.png';
import raiderSwimSidewards from 'url:../assets/players/raider/raider_swim_sidewards.png';
import handsFx from 'url:../assets/Players/hands.png';
export class Raider {
    // Used by Player.followPath via sprite.type.speed / sprite.type.stamina
    static speed   = 80;  // a bit quick
    static stamina = 0;   // no stamina drain
    static tint   = 0xff0000; // default red tint for enemies (can be overridden per raider if you want)
    static awareness = 128;
    static PLAYER_CHASE_MAX_MS = 4200;
    static PLAYER_CHASE_COOLDOWN_MS = 2600;
    static PLAYER_CHASE_MAX_MISSION_DIST = SQUARESIZE * 6;
    static PLAYER_CHASE_DROP_DIST = SQUARESIZE * 7;

    static preload(scene) {
        scene.load.spritesheet('raider_walk_down', raiderWalkDown, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('raider_walk_down_left', raiderWalkDownLeft, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('raider_walk_down_right', raiderWalkDownRight, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('raider_walk_up', raiderWalkUp, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('raider_walk_up_left', raiderWalkUpLeft, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('raider_walk_up_right', raiderWalkUpRight, { frameWidth: 32, frameHeight: 32 });
        scene.load.image('raider_hands_fx', handsFx);
        scene.load.spritesheet('raider_swim_up', raiderSwimUp, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('raider_swim_down', raiderSwimDown, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('raider_swim_sidewards', raiderSwimSidewards, { frameWidth: 32, frameHeight: 32 });
    }
    
    constructor(x, y, teamNumber = 0) {
        // Reuse generic cube creation, but then specialize
        const raider = Player.addPlayer(
            x,
            y,
            teamNumber,
            "raider_walk_down", // sprite sheet
            "walk",
            "idle",
            "action",
            weapons.hands
        );
        
        raider.unitTint = Raider.tint; // if you use a separate tint for weapons/effects, set it here too
        raider.type       = Raider;
        raider.isRaider   = true;
        raider.isSeaRaider = false;   // sea mode is set in spawnSeaRaider
        raider.roam       = false;
        raider.maxHealth  = 100;
        raider.killReward  = 18;   // reward for player when killed (for contract tracking)

        // Make sure stamina math is well-defined (even if we never drain it)
        raider.maxStamina = raider.maxStamina ?? 100;
        raider.stamina    = raider.stamina ?? raider.maxStamina;
        raider.weapon     = weapons.hands;
        raider.meleeFxKey = 'raider_hands_fx';
        raider.destroySelf = (opts = {}) => Raider.destroy(raider, opts); 
        attachDirectionalSix(raider, {
            animPrefix: 'raider',
            defaultDirection: 'down',
            walkStateKey: 'walk',
            idleStateKey: 'idle',
            swimStateKey: 'swim',
            idleFrame: 1,
            swimIdleFrame: 1,
            frameRate: 7,
            swimFrameRate: 8,
            directions: {
                down: 'raider_walk_down',
                down_left: 'raider_walk_down_left',
                down_right: 'raider_walk_down_right',
                up: 'raider_walk_up',
                up_left: 'raider_walk_up_left',
                up_right: 'raider_walk_up_right',
            },
            swimDirections: {
                up: 'raider_swim_up',
                down: 'raider_swim_down',
                side: 'raider_swim_sidewards',
            }
        });
        ZoomMixer.createPlayerMoniker(raider);

        // Enemies (team 0) already default to red tint in Player.applyDefaultTint,
        // so we don't have to override tint here.
        return raider;
    }

    static update(troop) {
        // Cache the raider's "start" (used for O(1) region reach checks)
        if (troop._spawnWorldX == null || troop._spawnWorldY == null) {
            troop._spawnWorldX = troop.x;
            troop._spawnWorldY = troop.y;
        }

        if (Raider._handleEnemyWaterRecovery(troop)) {
            return true;
        }

        Raider._clearInvalidMission(troop);
        if (Raider._shouldDropPlayerChase(troop)) {
            Raider._dropPlayerChase(troop);
            return false;
        }

        if (troop.task && !troop.task.siege && !Raider._isBuildingTaskValid(troop.task)) {
            troop.task = null;
            troop.currentPath = null;
            troop._postSiegeTask = null;
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
            return false;
        }

        if(troop.task){
            Raider._rememberMission(troop, troop.task);
            Raider._tryAggroNearbyPlayer(troop, { onMission: true });
            return false;
        }
        // -------------------------
        // 1) Land behaviour: fight nearby TEAM 1 units first
        // -------------------------
        if (troop.forcedTarget?.active && troop.forcedTarget?.body?.team === 1) {
            if (!troop._raiderPlayerChase) {
                troop._raiderPlayerChase = {
                    startedAt: Raider._now(troop),
                    targetId: troop.forcedTarget.id ?? null,
                    retaliation: false,
                };
            }
            Player._syncTrackToTarget(troop, troop.forcedTarget);
            Player._chaseOrBreachTarget?.(troop, troop.forcedTarget, true);
            return false;
        }

        if (Raider._tryAggroNearbyPlayer(troop, { onMission: false })) {
            return false;
        }

        if (!troop.task && troop._raidMissionTask && Raider._isBuildingTaskValid(troop._raidMissionTask)) {
            Raider._resumeMission(troop);
            return false;
        }

        // -------------------------
        // Helpers
        // -------------------------
        const isAdjacentTo = (tx, ty) => {
            const cx = Math.floor(troop.x / SQUARESIZE);
            const cy = Math.floor(troop.y / SQUARESIZE);
            return (Math.abs(cx - tx) + Math.abs(cy - ty)) === 1;
        };

        const pathToAdjacentWalkable = (tx, ty) => {
            const candidates = [
            { x: tx + 1, y: ty },
            { x: tx - 1, y: ty },
            { x: tx, y: ty + 1 },
            { x: tx, y: ty - 1 },
            ];

            candidates.sort((a, b) => {
            const awx = a.x * SQUARESIZE + SQUARESIZE / 2;
            const awy = a.y * SQUARESIZE + SQUARESIZE / 2;
            const bwx = b.x * SQUARESIZE + SQUARESIZE / 2;
            const bwy = b.y * SQUARESIZE + SQUARESIZE / 2;
            const da = (awx - troop.x) ** 2 + (awy - troop.y) ** 2;
            const db = (bwx - troop.x) ** 2 + (bwy - troop.y) ** 2;
            return da - db;
            });

            for (const n of candidates) {
            if (!Map.enemyNavGrid?.[n.y]?.[n.x]) continue;
            if (Map.enemyNavGrid[n.y][n.x] !== 1) continue;

            const dst = {
                x: n.x * SQUARESIZE + SQUARESIZE / 2,
                y: n.y * SQUARESIZE + SQUARESIZE / 2,
            };

            const p = Map.enemyNavMesh?.findPath?.({ x: troop.x, y: troop.y }, dst);
            if (p && p.length) return p;
            }

            return null;
        };

        const pickRandomReachableBuildingTask = () => {
            const buildingArray = Teams.teamLists?.["1"]?.buildings;
            if (!Array.isArray(buildingArray) || buildingArray.length === 0) return null;

            // Shuffle indices for unbiased random choice
            const n = buildingArray.length;
            const idxs = Array.from({ length: n }, (_, i) => i);
            for (let i = n - 1; i > 0; i--) {
                const j = (Math.random() * (i + 1)) | 0;
                [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
            }

            const rs = Map.enemyRegionSystem;

            const canReach = (bx, by) => {
                if (!rs?.canReachWorldToWorld) return true; // fallback if region system isn't ready
                rs.ensureUpToDate?.();
                const start = Player._regionCheckPointForTroop?.(troop, troop.x, troop.y);
                const wx = bx * SQUARESIZE + SQUARESIZE / 2;
                const wy = by * SQUARESIZE + SQUARESIZE / 2;
                // IMPORTANT: use CURRENT location, not spawn
                return rs.canReachWorldToWorld(start?.x ?? troop.x, start?.y ?? troop.y, wx, wy);
            };

            // Two buckets: reachable and blocked (blocked might be solvable via siege)
            const reachable = [];
            const blocked = [];

            for (const k of idxs) {
                const [bx, by, type, building] = buildingArray[k];
                if (!Raider._isBuildingTargetAlive(building)) continue;
                const entry = { bx, by, type, building };
                (canReach(bx, by) ? reachable : blocked).push(entry);
            }

            // Prefer reachable; otherwise attempt siege on a blocked POI
            const chosen = (reachable.length ? reachable[0] : (blocked.length ? blocked[0] : null));
            if (!chosen) return null;

            return {
                type: chosen.type,
                value: chosen.building,
                x: chosen.bx,
                y: chosen.by,
                duration: Raider._buildingTargetHealth(chosen.building).current,
                totalDuration: Raider._buildingTargetHealth(chosen.building).max,
                assigned: 0,
                perimeterReservationKey: Raider._buildingDestroyReservationKey(
                    chosen.bx,
                    chosen.by,
                    chosen.type,
                    chosen.building
                ),
            };
        };

        const beginSiegeForTask = (task) => {
            if (!Raider._isBuildingTaskValid(task)) return false;
            Raider._rememberMission(troop, task);

            // Build perimeter targets around the POI footprint
            const fp = { x: task.x, y: task.y, w: task.type?.lenX ?? 1, h: task.type?.lenY ?? 1 };

            const gridH = Map.enemyNavGrid?.length ?? 0;
            const gridW = gridH ? (Map.enemyNavGrid[0]?.length ?? 0) : 0;
            if (!gridW || !gridH) return false;

            const targets = SiegePlanner.buildPerimeterTargets(fp.x, fp.y, fp.w, fp.h, gridW, gridH);

            // Ensure planner exists (your Raider has _ensureSiegePlanner in-file)
            const planner = Raider._ensureSiegePlanner?.();
            const breachTiles = planner?.planBreach?.(troop.x, troop.y, targets);

            if (!breachTiles || breachTiles.length === 0) return false;

            const team0 = Teams.teamLists["0"];
            if (!Array.isArray(team0.siegeTileStates)) team0.siegeTileStates = [];

            // ✅ Put “seen” on the TEAM so all raiders share it (global dedupe)
            if (!team0._siegeSeen) team0._siegeSeen = new Set();

            const now = troop.scene?.getSimulationNow?.() ?? troop.scene?.simNowMs ?? troop.scene?.time?.now ?? Date.now();
            const breachPlanId = `siege-${troop.id ?? "raider"}-${Math.round(now)}`;
            const queuedTasks = [];

            for (let i = 0; i < breachTiles.length; i++) {
                const t = breachTiles[i];
                const key = `${t.x},${t.y}`;
                if (team0._siegeSeen.has(key)) continue;
                team0._siegeSeen.add(key);

                const siegeTask = {
                    x: t.x,
                    y: t.y,
                    duration: 500,
                    assigned: 0,
                    siege: true,
                    type: Raider._tileTypeAt(t.x, t.y) ?? { lenX: 1, lenY: 1, name: "wallTile" },
                    breachPlanId,
                    breachOrder: i,
                    breachChainLength: breachTiles.length,
                    eligibleTroopIds: [troop.id],
                };

                team0.siegeTileStates.push(siegeTask);
                queuedTasks.push(siegeTask);
            }

            if (!queuedTasks.length) return false;

            // Mark the raider as in “siege posture” (no specific tile yet)
            troop._postSiegeTask = task;
            troop._siegeQueue = queuedTasks.slice(1);
            troop.task = null;
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
            const taskObtained = Manager.assignTaskToTroop(troop, queuedTasks[0], CONTROL_STATES.DESTROY_MODE_T);

            // Let update() pick up a distributed tile via Manager
            return taskObtained;
        };

        const roamToCenterEnemy = () => {
            const destX = (WORLD_DIMENSIONX * SQUARESIZE) / 2;
            const destY = (WORLD_DIMENSIONY * SQUARESIZE) / 2;
            const path = Map.enemyNavMesh?.findPath?.({ x: troop.x, y: troop.y }, { x: destX, y: destY });
            if (path && path.length) Player.moveTo(troop, path);
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
        };

        const assignAndPathToTask = (task) => {
            Raider._rememberMission(troop, task);

            // 1) Try normal raid approach (perimeter/door bias) first
            const res = Manager.assignTaskToTroop(troop, task, CONTROL_STATES.DESTROY_MODE)
            if (res) {
                return true;
            }

            // 2) If pathing failed but the raider is already positioned to hit it, start now.
            if (Raider._startMissionDestroyInPlace(troop, task)) return true;

            // 3) If unreachable by path, attempt siege breach plan for this POI
            if (Raider.beginSiegeForTask(troop, task)) return true;

            // 4) If no siege plan possible, fall back to roaming
            roamToCenterEnemy();
            return false;
        };

        // -------------------------
        // 3) If no current task: choose a RANDOM reachable building via region checks
        // -------------------------
        if (!troop.task) {
            const task = pickRandomReachableBuildingTask();
            if (task) {
                // If task is reachable -> normal path.
                // If task is blocked -> assignAndPathToTask will siege if needed.
                const obtainedTask = assignAndPathToTask(task);
                if(obtainedTask) return false;
            } else {
                // No buildings exist at all -> just roam
                roamToCenterEnemy();
            }
        }

        // -------------------------
        // 4) Siege-aware destroy handling (wall tiles)
        // -------------------------
        // const task = troop.task;

        // if (task?.siege === true) {
        //     if (troop.state !== CONTROL_STATES.SIEGE_MODE && troop.state !== CONTROL_STATES.DESTROY_MODE_T) {
        //         Teams.movePlayerState(troop, CONTROL_STATES.SIEGE_MODE);
        //     }

        //     const tx = task.x ?? task.tx;
        //     const ty = task.y ?? task.ty;

        //     if (Number.isFinite(tx) && Number.isFinite(ty)) {
        //         if (isAdjacentTo(tx, ty)) {
        //             Teams.movePlayerState(troop, CONTROL_STATES.DESTROY_MODE_T);
        //         } else {
        //             if (!troop.currentPath || troop.currentPath.length === 0) {
        //                 const p = pathToAdjacentWalkable(tx, ty);
        //                 if (p?.length) Player.moveTo(troop, p);
        //             }
        //         }
        //     }

        //     return false;
        // }

        // -------------------------
        // 5) Normal POI/building destroy task: ensure we have an approach path or siege
        // -------------------------
        Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
        return false;
    }

    static _handleEnemyWaterRecovery(troop) {
        if (!troop?.active || !troop.body || troop.body.team !== 0) return false;

        const gx = Math.floor(troop.x / SQUARESIZE);
        const gy = Math.floor(troop.y / SQUARESIZE);
        const onEnemyLand = Map.enemyNavGrid?.[gy]?.[gx] === 1;
        const onWater = Player._isOnWater?.(troop) === true;
        const recovering = troop._enemyWaterRecovery === true;
        const swimming = troop.isSwimming === true;

        if (troop.task?.siege) {
            return false;
        }

        const shoreWall = Raider._adjacentBreachableWallTile(troop);
        const now = Raider._now(troop);
        const shoreWallHandoffActive = shoreWall && now < Number(troop._shoreWallBreachUntil || 0);
        if (
            shoreWall &&
            (shoreWallHandoffActive || swimming || recovering || onWater || (!onEnemyLand && !onWater))
        ) {
            Raider._handoffWaterRecoveryToShoreBreach(troop, shoreWall);
            return false;
        }

        if (!recovering && !swimming && !onWater) return false;

        if (onWater && !swimming) {
            Raider._startEnemyWaterRecovery(troop);
        } else if (recovering && !swimming) {
            Raider._startEnemyWaterRecovery(troop, { preserveMission: true });
        }

        if (troop.isSwimming !== true) return false;

        const canLandHere = onEnemyLand && !onWater;
        const reachedRecoveryLand = !troop._enemyWaterRecovery || Raider._isOnMainIslandTile(troop);
        if (canLandHere && reachedRecoveryLand) {
            Raider._finishEnemyWaterRecovery(troop);
            return false;
        }

        if (troop._enemyWaterRecovery && (!Number.isFinite(troop.swimTargetX) || !Number.isFinite(troop.swimTargetY))) {
            Raider._setEnemySwimTarget(troop, Raider._findMainIslandWalkableWorld(troop));
        }

        let dx = troop.swimDirX || 0;
        let dy = troop.swimDirY || 0;
        const targetX = Number.isFinite(troop.swimTargetX) ? troop.swimTargetX : null;
        const targetY = Number.isFinite(troop.swimTargetY) ? troop.swimTargetY : null;
        if (targetX != null && targetY != null) {
            const vecX = targetX - troop.x;
            const vecY = targetY - troop.y;
            const dist = Math.hypot(vecX, vecY);
            if (dist > 0.001) {
                dx = vecX / dist;
                dy = vecY / dist;
                troop.swimDirX = dx;
                troop.swimDirY = dy;
            }
        }
        if (Math.hypot(dx, dy) <= 0.001) {
            dx = 0;
            dy = 1;
            troop.swimDirX = dx;
            troop.swimDirY = dy;
        }

        const baseSpeed = Math.max(100, 100 * Math.max(1, Number(troop.moveSpeedMultiplier ?? 1) || 1));
        const speed = Math.max(baseSpeed, Number(troop.swimSpeed ?? 0) || 0);
        const vx = dx * speed;
        const vy = dy * speed;

        Player.setAnimState(troop, troop.swim || troop.idle);
        troop.body.setVelocity(vx, vy);
        AudioManager.tryPlayStep(troop);
        updateDirectionalAnimationFromVelocity(troop, vx, vy, true);

        if (!shouldUseDirectionalFacing(troop)) {
            troop.rotation = Phaser.Math.Angle.Between(0, 0, vx, vy);
        }

        return true;
    }

    static _handoffWaterRecoveryToShoreBreach(troop, wallTile = null) {
        if (!troop?.active) return false;
        troop.isSwimming = false;
        troop._enemyWaterRecovery = false;
        troop._enemyWaterRecoveryTarget = null;
        troop._shoreWallBreachHint = wallTile || null;
        troop._shoreWallBreachUntil = Raider._now(troop) + 1800;
        troop.body?.setVelocity?.(0, 0);
        troop.currentPath?.splice?.(0);
        troop.finalPos = null;
        Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
        return true;
    }

    static _startEnemyWaterRecovery(troop, { preserveMission = false } = {}) {
        if (!troop?.active || !troop.body) return false;

        if (!preserveMission) {
            const mission = Raider._waterRecoveryMission(troop);
            if (mission) Raider._rememberMission(troop, mission);
            Raider._releaseEnemyTaskForWaterRecovery(troop);
        }

        troop.isSwimming = true;
        troop._enemyWaterRecovery = true;
        troop.roam = false;
        troop.currentPath?.splice?.(0);
        troop.finalPos = null;
        troop.__pendingPolyIds = [];
        troop.body.setVelocity(0, 0);
        Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
        Raider._setEnemySwimTarget(troop, Raider._findMainIslandWalkableWorld(troop));
        return true;
    }

    static _finishEnemyWaterRecovery(troop) {
        const wasRecovery = troop?._enemyWaterRecovery === true;
        troop.isSwimming = false;
        troop._enemyWaterRecovery = false;
        troop._enemyWaterRecoveryTarget = null;
        troop.body?.setVelocity?.(0, 0);
        troop._spawnWorldX = troop.x;
        troop._spawnWorldY = troop.y;
        troop.task = null;
        troop.taskMeta = null;
        troop.currentPath = null;
        troop.finalPos = null;
        Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);

        if (wasRecovery) {
            Raider._resumeMission(troop);
        }
    }

    static _waterRecoveryMission(troop) {
        const candidates = [
            troop?.task?.siege ? null : troop?.task,
            troop?._postSiegeTask,
            troop?._raidMissionTask,
        ];
        return candidates.find(task => task && !task.siege && Raider._isBuildingTaskValid(task)) || null;
    }

    static _releaseEnemyTaskForWaterRecovery(troop) {
        if (!troop) return;

        if (troop.task?.siege) {
            Raider._releaseSiegeTasks(troop);
        } else if (troop.task) {
            InterruptController.releaseTaskClaim?.({
                troop,
                task: troop.task,
                meta: troop.taskMeta || null,
                reason: "enemy_water_recovery",
            });
        }

        troop.task = null;
        troop.taskMeta = null;
        troop._postSiegeTask = null;
        troop._siegeQueue = [];
        troop.track = null;
        troop.forcedTarget = null;
        troop._raiderPlayerChase = null;
        troop._raiderRetaliationTarget = null;
        troop.timer?.remove?.(false);
        troop.timer = null;
        troop.currentPath?.splice?.(0);
        troop.finalPos = null;
        fightManager.clearAttackRecovery?.(troop);
        fightManager.clearHitReaction?.(troop);
        CombatSpacingCoordinator.clearTroopFocus(troop);
        CombatSpacingCoordinator.clearRoamReservation?.(troop);
    }

    static _getMainIslandBounds(troop) {
        const bounds = troop?.scene?._getMainIslandBounds?.();
        if (!bounds) return null;
        const minx = Number(bounds.minx);
        const miny = Number(bounds.miny);
        const maxx = Number(bounds.maxx);
        const maxy = Number(bounds.maxy);
        if (![minx, miny, maxx, maxy].every(Number.isFinite)) return null;
        return {
            minx: Math.floor(minx),
            miny: Math.floor(miny),
            maxx: Math.floor(maxx),
            maxy: Math.floor(maxy),
        };
    }

    static _isOnMainIslandTile(troop) {
        const bounds = Raider._getMainIslandBounds(troop);
        if (!bounds) return true;
        const gx = Math.floor(troop.x / SQUARESIZE);
        const gy = Math.floor(troop.y / SQUARESIZE);
        return gx >= bounds.minx && gx <= bounds.maxx && gy >= bounds.miny && gy <= bounds.maxy;
    }

    static _findMainIslandWalkableWorld(troop) {
        const bounds = Raider._getMainIslandBounds(troop);
        const nav = Map.enemyNavGrid;
        if (bounds && Array.isArray(nav) && nav.length) {
            const h = nav.length;
            const w = nav[0]?.length || 0;
            const minx = Math.max(0, bounds.minx);
            const miny = Math.max(0, bounds.miny);
            const maxx = Math.min(w - 1, bounds.maxx);
            const maxy = Math.min(h - 1, bounds.maxy);
            let best = null;
            let bestD2 = Infinity;

            for (let y = miny; y <= maxy; y++) {
                for (let x = minx; x <= maxx; x++) {
                    if (nav?.[y]?.[x] !== 1) continue;
                    const wx = x * SQUARESIZE + SQUARESIZE / 2;
                    const wy = y * SQUARESIZE + SQUARESIZE / 2;
                    const dx = wx - troop.x;
                    const dy = wy - troop.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < bestD2) {
                        bestD2 = d2;
                        best = { x: wx, y: wy };
                    }
                }
            }
            if (best) return best;
        }

        const center = troop?.scene?._getMainIslandCenterWorld?.();
        if (center && Number.isFinite(center.x) && Number.isFinite(center.y)) return center;
        return {
            x: (WORLD_DIMENSIONX * SQUARESIZE) / 2,
            y: (WORLD_DIMENSIONY * SQUARESIZE) / 2,
        };
    }

    static _setEnemySwimTarget(troop, target) {
        const tx = Number.isFinite(target?.x) ? target.x : (WORLD_DIMENSIONX * SQUARESIZE) / 2;
        const ty = Number.isFinite(target?.y) ? target.y : (WORLD_DIMENSIONY * SQUARESIZE) / 2;
        let dx = tx - troop.x;
        let dy = ty - troop.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.001) {
            dx /= dist;
            dy /= dist;
        } else {
            dx = 0;
            dy = 1;
        }

        troop.swimTargetX = tx;
        troop.swimTargetY = ty;
        troop.swimDirX = dx;
        troop.swimDirY = dy;
        troop.swimSpeed = Math.max(Number(troop.swimSpeed ?? 0) || 0, Number(troop.type?.speed ?? Raider.speed ?? 80) * 1.35, 100);
        troop._enemyWaterRecoveryTarget = { x: tx, y: ty };
    }

    static _buildingFromTask(task) {
        return task?.value?.buildingRef || task?.value || null;
    }

    static _buildingTargetHealth(building) {
        const key = building && ("health" in building)
            ? "health"
            : (building && ("hp" in building) ? "hp" : "health");
        const rawMax = Number(building?.maxHealth ?? building?.maxHp ?? building?.[key] ?? 1);
        const max = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 1;
        const rawCurrent = Number(building?.[key] ?? max);
        const current = Number.isFinite(rawCurrent) ? Math.max(0, rawCurrent) : max;
        return { current, max };
    }

    static _isBuildingTargetAlive(building) {
        if (!building || building._destroyed || building._isDestroyed || building.sprite?._destroyed) return false;
        if (building.sprite && building.sprite.active === false) return false;
        if (building.baseSprite && building.baseSprite.active === false) return false;
        return Raider._buildingTargetHealth(building).current > 0;
    }

    static _isBuildingTaskValid(task) {
        return Raider._isBuildingTargetAlive(Raider._buildingFromTask(task));
    }

    static _now(troop) {
        return troop?.scene?.getSimulationNow?.() ?? troop?.scene?.simNowMs ?? troop?.scene?.time?.now ?? Date.now();
    }

    static _taskWorldCenter(task) {
        if (!task) return null;
        const lenX = Math.max(1, Number(task?.type?.lenX ?? 1));
        const lenY = Math.max(1, Number(task?.type?.lenY ?? 1));
        const x = Number(task.x);
        const y = Number(task.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return {
            x: (x + lenX / 2) * SQUARESIZE,
            y: (y + lenY / 2) * SQUARESIZE,
        };
    }

    static _buildingDestroyReservationKey(x, y, type, building) {
        const targetId = building?.id ?? building?.buildingId ?? building?.uid ?? null;
        if (targetId != null) return `enemy-building-destroy:${targetId}`;

        const gx = Number.isFinite(Number(x)) ? Number(x) : Number(building?.x ?? building?.gridX ?? 0);
        const gy = Number.isFinite(Number(y)) ? Number(y) : Number(building?.y ?? building?.gridY ?? 0);
        const typeName = type?.name ?? building?.buildType?.name ?? building?.type?.name ?? "building";
        return `enemy-building-destroy:${typeName}:${gx},${gy}`;
    }

    static _rememberMission(troop, task = troop?.task) {
        if (!troop || !task || task.siege || !Raider._isBuildingTaskValid(task)) return null;
        if (!task.perimeterReservationKey) {
            const building = Raider._buildingFromTask(task);
            task.perimeterReservationKey = Raider._buildingDestroyReservationKey(task.x, task.y, task.type, building);
        }
        troop._raidMissionTask = task;
        return task;
    }

    static _clearInvalidMission(troop) {
        if (!troop?._raidMissionTask) return;
        if (Raider._isBuildingTaskValid(troop._raidMissionTask)) return;
        troop._raidMissionTask = null;
    }

    static _distanceFromMission(troop) {
        const center = Raider._taskWorldCenter(troop?._raidMissionTask);
        if (!center) return 0;
        return Phaser.Math.Distance.Between(troop.x, troop.y, center.x, center.y);
    }

    static _distanceToTaskFootprint(troop, task) {
        const fp = Raider._taskToFootprint(task);
        if (!troop?.active || !fp) return Infinity;

        const width = Math.max(1, Number(fp.w ?? 1));
        const height = Math.max(1, Number(fp.h ?? 1));
        const minX = Number(fp.x) * SQUARESIZE;
        const minY = Number(fp.y) * SQUARESIZE;
        const maxX = (Number(fp.x) + width) * SQUARESIZE;
        const maxY = (Number(fp.y) + height) * SQUARESIZE;
        if (![minX, minY, maxX, maxY].every(Number.isFinite)) return Infinity;

        const closestX = Math.max(minX, Math.min(troop.x, maxX));
        const closestY = Math.max(minY, Math.min(troop.y, maxY));
        return Phaser.Math.Distance.Between(troop.x, troop.y, closestX, closestY);
    }

    static _isInBuildingDestroyRange(troop, task) {
        if (!troop?.active || !Raider._isBuildingTaskValid(task)) return false;
        const distance = Raider._distanceToTaskFootprint(troop, task);
        if (!Number.isFinite(distance)) return false;

        const weaponRange = Number(troop.weapon?.range ?? 0);
        const range = troop.isBomber
            ? SQUARESIZE * 1.35
            : Math.max(SQUARESIZE * 0.75, Number.isFinite(weaponRange) ? weaponRange : 0);
        return distance <= range;
    }

    static _startMissionDestroyInPlace(troop, task) {
        if (!troop?.active || !Raider._isBuildingTaskValid(task)) return false;
        if (!Raider._isInBuildingDestroyRange(troop, task)) return false;
        if (Manager.tooManyAssigned?.(task, CONTROL_STATES.DESTROY_MODE)) return false;

        if (troop.task && troop.task !== task && typeof troop.task.assigned === "number" && troop.task.assigned > 0) {
            troop.task.assigned -= 1;
        }

        Raider._rememberMission(troop, task);
        fightManager.clearAttackRecovery?.(troop);
        troop.timer?.remove?.(false);
        troop.timer = null;
        troop.roam = false;
        troop.task = task;
        task.assigned = Math.max(0, Number(task.assigned || 0)) + 1;
        troop.destX = Math.floor(troop.x / SQUARESIZE);
        troop.destY = Math.floor(troop.y / SQUARESIZE);
        troop.finalPos = null;
        troop.currentPath?.splice?.(0);
        troop.body?.setVelocity?.(0, 0);
        Teams.movePlayerState(troop, CONTROL_STATES.DESTROY_MODE);
        Manager._setTaskMeta?.(troop, task, CONTROL_STATES.DESTROY_MODE, null);
        Player.doAction?.(troop);
        return true;
    }

    static _canAggroPlayerTargets(troop) {
        return !!(troop?.active && !troop?.isBomber);
    }

    static _shouldRetaliateToHit(troop, attacker) {
        if (!Raider._canAggroPlayerTargets(troop)) return false;
        if (!attacker?.active || attacker.body?.team !== 1) return false;
        if (!Player._isCombatTargetableUnit?.(attacker)) return false;
        if (troop?.isHunter) return true;
        return !!Player._isFighterUnit?.(attacker);
    }

    static _isThreateningRaider(troop, target) {
        return !!(
            target?.forcedTarget === troop ||
            target?.track?.[0]?.gameObject === troop ||
            troop?._raiderRetaliationTarget === target
        );
    }

    static _canRoleChaseTarget(troop, target, { onMission = false } = {}) {
        if (!Raider._canAggroPlayerTargets(troop)) return false;
        if (!target?.active || target.body?.team !== 1) return false;
        if (!Player._isCombatTargetableUnit?.(target)) return false;
        if (troop?.isHunter) return true;
        if (Player._isFighterUnit?.(target)) return true;
        return !onMission && Raider._isThreateningRaider(troop, target);
    }

    static _targetPriorityForRole(troop, target) {
        const threatening = Raider._isThreateningRaider(troop, target);
        const fighter = !!Player._isFighterUnit?.(target);

        if (troop?.isHunter) {
            if (threatening && fighter) return 0;
            if (fighter) return 1;
            if (threatening) return 2;
            return 3;
        }

        if (threatening && fighter) return 0;
        if (fighter) return 1;
        if (threatening) return 2;
        return 5;
    }

    static _canStartPlayerChase(troop, target, opts = {}) {
        if (!Raider._canAggroPlayerTargets(troop)) return false;
        if (!troop?.active || !target?.active || target.body?.team !== 1) return false;
        if (!Player._isCombatTargetableUnit?.(target)) return false;
        const now = Raider._now(troop);
        const dist = Phaser.Math.Distance.Between(troop.x, troop.y, target.x, target.y);
        const immediate = dist <= Math.max((troop.weapon?.range || 0) + 14, SQUARESIZE * 0.9);
        if (!opts.retaliation && !immediate && now < Number(troop._nextPlayerChaseAt || 0)) return false;
        if (!Player._canReachWorldForTroop?.(troop, target.x, target.y)) {
            return false;
        }
        return true;
    }

    static _startPlayerChase(troop, target, opts = {}) {
        if (!Raider._canStartPlayerChase(troop, target, opts)) return false;
        Raider._rememberMission(troop, troop.task || troop._raidMissionTask);

        if (troop.task) {
            InterruptController.interruptTroop(troop, opts.reason || "raider_player_interruption", CONTROL_STATES.TRACK_TARGET);
        } else {
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_TARGET);
            troop.currentPath?.splice?.(0);
            troop.body?.setVelocity?.(0, 0);
        }

        const now = Raider._now(troop);
        troop._raiderPlayerChase = {
            startedAt: now,
            targetId: target.id ?? null,
            retaliation: !!opts.retaliation,
            role: troop?.isHunter ? "hunter" : "raider",
        };
        troop._raiderRetaliationTarget = null;
        troop.forcedTarget = target;
        troop.roam = false;
        Player._syncTrackToTarget(troop, target);
        Player._chaseOrBreachTarget?.(troop, target, true);
        return true;
    }

    static _shouldDropPlayerChase(troop) {
        const chase = troop?._raiderPlayerChase;
        const target = troop?.forcedTarget;
        if (!chase && !target) return false;
        if (!target?.active || target.body?.team !== 1) return true;
        if (!Player._isCombatTargetableUnit?.(target)) return true;

        const now = Raider._now(troop);
        const chaseAge = now - Number(chase?.startedAt || now);
        const isRetaliation = !!chase?.retaliation;
        const hunterChase = chase?.role === "hunter";
        if (!isRetaliation && !hunterChase && chaseAge >= Raider.PLAYER_CHASE_MAX_MS) return true;
        if (hunterChase && chaseAge >= Raider.PLAYER_CHASE_MAX_MS * 2.2) return true;

        const targetDist = Phaser.Math.Distance.Between(troop.x, troop.y, target.x, target.y);
        const maxDropDist = isRetaliation
            ? Raider.PLAYER_CHASE_DROP_DIST * 2.5
            : hunterChase
                ? Raider.PLAYER_CHASE_DROP_DIST * 2
                : Raider.PLAYER_CHASE_DROP_DIST;
        if (targetDist > maxDropDist) return true;

        if (!isRetaliation && !hunterChase && troop._raidMissionTask && Raider._isBuildingTaskValid(troop._raidMissionTask)) {
            if (Raider._distanceFromMission(troop) > Raider.PLAYER_CHASE_MAX_MISSION_DIST) return true;
        }

        if (!Player._canReachWorldForTroop?.(troop, target.x, target.y)) {
            return true;
        }

        return false;
    }

    static _dropPlayerChase(troop) {
        const now = Raider._now(troop);
        troop._raiderPlayerChase = null;
        troop._raiderRetaliationTarget = null;
        troop._nextPlayerChaseAt = now + Raider.PLAYER_CHASE_COOLDOWN_MS;
        troop.forcedTarget = null;
        troop.track = null;
        fightManager.clearAttackRecovery?.(troop);
        troop.currentPath?.splice?.(0);
        troop.body?.setVelocity?.(0, 0);
        CombatSpacingCoordinator.clearTroopFocus(troop);
        Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
        Raider._resumeMission(troop);
        return true;
    }

    static _resumeMission(troop) {
        const task = troop?._raidMissionTask;
        if (!troop?.active || !task || !Raider._isBuildingTaskValid(task)) {
            if (troop) troop._raidMissionTask = null;
            return false;
        }

        troop.task = null;
        troop.roam = false;
        fightManager.clearAttackRecovery?.(troop);
        troop.currentPath?.splice?.(0);
        troop.body?.setVelocity?.(0, 0);
        if (Manager.assignTaskToTroop(troop, task, CONTROL_STATES.DESTROY_MODE)) {
            return true;
        }
        if (Raider._startMissionDestroyInPlace(troop, task)) {
            return true;
        }
        if (Raider.beginSiegeForTask(troop, task)) {
            return true;
        }
        Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
        return false;
    }

    static _tryAggroNearbyPlayer(troop, { onMission = false } = {}) {
        if (!Raider._canAggroPlayerTargets(troop)) return false;

        const retaliationTarget = troop._raiderRetaliationTarget;
        if (retaliationTarget?.active && retaliationTarget?.body?.team === 1) {
            if (Raider._shouldRetaliateToHit(troop, retaliationTarget)) {
                return Raider._startPlayerChase(troop, retaliationTarget, {
                    retaliation: true,
                    reason: troop?.isHunter ? "hunter_retaliate_player" : "raider_retaliate_fighter",
                });
            }
            troop._raiderRetaliationTarget = null;
        } else if (retaliationTarget && !retaliationTarget?.active) {
            troop._raiderRetaliationTarget = null;
        }

        const nearbyPriorityTarget = Raider._findNearbyUnitTarget(troop, { onMission });
        if (!nearbyPriorityTarget) return false;

        return Raider._startPlayerChase(troop, nearbyPriorityTarget, {
            reason: troop?.isHunter ? "hunter_nearby_player" : "raider_nearby_player",
        });
    }

    static _findNearbyUnitTarget(troop, { onMission = false } = {}) {
        const radius = Math.max(
            Number(troop?.awareness ?? troop?.type?.awareness ?? Raider.awareness ?? 0),
            Number(troop?.weapon?.range ?? 0) * 2.5
        );
        if (!(radius > 0) || !Player.scene?.physics?.overlapCirc) return null;

        const neighbours = Player.scene.physics.overlapCirc(troop.x, troop.y, radius) || [];
        const candidates = [];

        neighbours.forEach(body => {
            if (!body || body === troop.body || body.team !== 1 || body.dontTrack) return;
            const target = body.gameObject;
            if (!target?.active || !target?.body) return;
            if (!Player._isCombatTargetableUnit?.(target)) return;
            if (!Player._canReachWorldForTroop?.(troop, target.x, target.y)) return;
            if (!Raider._canRoleChaseTarget(troop, target, { onMission })) return;

            candidates.push(target);
        });

        if (!candidates.length) return null;

        candidates.sort((a, b) => {
            const aPriority = Raider._targetPriorityForRole(troop, a);
            const bPriority = Raider._targetPriorityForRole(troop, b);
            if (aPriority !== bPriority) return aPriority - bPriority;
            return Phaser.Math.Distance.Between(troop.x, troop.y, a.x, a.y) - Phaser.Math.Distance.Between(troop.x, troop.y, b.x, b.y);
        });

        return candidates[0] || null;
    }

    static _ensureSiegePlanner() {
        Map.enemyRegionSystem?.ensureUpToDate?.();
        const plannerStale =
            !Map.siegePlanner ||
            Map.siegePlanner.enemyNavGrid !== Map.enemyNavGrid ||
            Map.siegePlanner.regionSystem !== Map.enemyRegionSystem;

        if (plannerStale) {
            Map.siegePlanner = new SiegePlanner({
                squareSize: SQUARESIZE,
                enemyNavGrid: Map.enemyNavGrid,
                // "breachable" = walls or doors (whatever you used to paint/mark them in Map.grid)
                isBreachableTile: (tx, ty) => {
                    const cell = Map.grid?.[ty]?.[tx];
                    if (!cell) return false;

                    // If your grid stores [base, top] for placed tiles, look at the "top"
                    const top = Array.isArray(cell) ? cell[1] : cell;
                    const name = TILE_MAP(top);

                    // If you store numeric tile ids, adapt this check to your TILE_MAP/TILE_TYPES setup
                    if (name) return name == "woodWall" || name == "woodWall_door" || name == "wall" || name == "wall_door"

                    return false;
                },
                // Optional: tiles that siege should NEVER traverse even as "breach candidates"
                isHardBlockedTile: (tx, ty) => {
                    // example: outside bounds handled internally; here you can ban water if you want:
                    const cell = Map.grid?.[ty]?.[tx];
                    const top = Array.isArray(cell) ? cell[1] : cell;
                    const name = typeof top === "string" ? top : null;
                    return name === "water";
                },
                regionSystem: Map.enemyRegionSystem
            });
        }
        return Map.siegePlanner;
    }

    static _troopTile(troop) {
        if (!troop) return null;
        const x = Math.floor(Number(troop.x || 0) / SQUARESIZE);
        const y = Math.floor(Number(troop.y || 0) / SQUARESIZE);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { x, y };
    }

    static _adjacentBreachableWallTile(troop) {
        const tile = Raider._troopTile(troop);
        if (!tile) return null;

        const offsets = [
            [0, 0],
            [0, -1],
            [0, 1],
            [1, 0],
            [-1, 0],
        ];

        for (const [dx, dy] of offsets) {
            const x = tile.x + dx;
            const y = tile.y + dy;
            const wall = Wall.getAt?.(x, y);
            if (!wall?.active) continue;
            if (Number(wall.team) === Number(troop?.body?.team)) continue;
            if (!Map._wallStructureInfoAt?.(x, y)) continue;
            return { x, y };
        }

        return null;
    }

    static _fallbackAdjacentBreachTiles(troop) {
        const hinted = troop?._shoreWallBreachHint;
        const hintedWall = hinted ? Wall.getAt?.(hinted.x, hinted.y) : null;
        if (
            hintedWall?.active &&
            Number(hintedWall.team) !== Number(troop?.body?.team) &&
            Map._wallStructureInfoAt?.(hinted.x, hinted.y)
        ) {
            return [{ x: hinted.x, y: hinted.y }];
        }

        const tile = Raider._adjacentBreachableWallTile(troop);
        return tile ? [tile] : [];
    }

    static _canStartSiegeTaskInPlace(troop, task) {
        if (!troop?.active || !task?.siege) return false;
        const tile = Raider._troopTile(troop);
        if (!tile) return false;
        const tx = Number(task.x ?? task.tx);
        const ty = Number(task.y ?? task.ty);
        if (!Number.isFinite(tx) || !Number.isFinite(ty)) return false;
        return Math.abs(tile.x - tx) + Math.abs(tile.y - ty) <= 1;
    }

    static _assignSiegeTaskInPlace(troop, task) {
        if (!Raider._canStartSiegeTaskInPlace(troop, task)) return false;
        if (Manager.tooManyAssigned?.(task, CONTROL_STATES.DESTROY_MODE_T)) return false;

        troop.currentPath?.splice?.(0);
        troop.finalPos = null;
        troop.body?.setVelocity?.(0, 0);
        troop.roam = false;
        troop.task = task;
        task.assigned = Math.max(0, Number(task.assigned || 0)) + 1;
        troop.destX = Math.floor(troop.x / SQUARESIZE);
        troop.destY = Math.floor(troop.y / SQUARESIZE);
        Manager._setTaskMeta?.(troop, task, CONTROL_STATES.DESTROY_MODE_T, "siegeTileStates");
        Teams.movePlayerState(troop, CONTROL_STATES.DESTROY_MODE_T);
        Player.doAction?.(troop);
        return true;
    }

    // task → footprint for POI buildings
    static _taskToFootprint(task) {
        if (!task) return null;

        // Preferred: building task.type has lenX/lenY (3x3 etc)
        if (task.type && Number.isFinite(task.type.lenX) && Number.isFinite(task.type.lenY)) {
            return { x: task.x, y: task.y, w: task.type.lenX, h: task.type.lenY };
        }

        // Fallback: if you store the target object on task.value
        const b = task.value;
        if (b && Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.lenX) && Number.isFinite(b.lenY)) {
            return { x: b.x, y: b.y, w: b.lenX, h: b.lenY };
        }

        return null;
    }

    static _releaseSiegeTasks(troop) {
        const team0 = Teams.teamLists?.["0"];
        if (!team0) return;

        const release = (task) => {
            if (!task?.siege) return;
            Teams.removeFromStateArray("0", "siegeTileStates", task);
            task.assigned = Math.max(0, Number(task.assigned || 0) - 1);
            team0._siegeSeen?.delete?.(`${task.x},${task.y}`);
        };

        release(troop.task);
        if (Array.isArray(troop._siegeQueue)) {
            for (const task of troop._siegeQueue) release(task);
        }
        troop._siegeQueue = [];
    }

    static beginSiegeForTask(troop, task) {
        if (!troop?.active || !task || task.siege) return false;
        if (!Raider._isBuildingTaskValid(task)) return false;
        Raider._rememberMission(troop, task);

        const fp = { x: task.x, y: task.y, w: task.type?.lenX ?? 1, h: task.type?.lenY ?? 1 };
        const gridH = Map.enemyNavGrid?.length ?? 0;
        const gridW = gridH ? (Map.enemyNavGrid[0]?.length ?? 0) : 0;
        if (!gridW || !gridH) return false;

        const targets = SiegePlanner.buildPerimeterTargets(fp.x, fp.y, fp.w, fp.h, gridW, gridH);
        const planner = Raider._ensureSiegePlanner?.();
        let breachTiles = planner?.planBreach?.(troop.x, troop.y, targets);
        if (!breachTiles?.length) {
            breachTiles = Raider._fallbackAdjacentBreachTiles(troop);
        }
        if (!breachTiles?.length) return false;

        const team0 = Teams.teamLists["0"];
        if (!Array.isArray(team0.siegeTileStates)) team0.siegeTileStates = [];
        if (!team0._siegeSeen) team0._siegeSeen = new Set();

        const now = troop.scene?.getSimulationNow?.() ?? troop.scene?.simNowMs ?? troop.scene?.time?.now ?? Date.now();
        const breachPlanId = `siege-${troop.id ?? "raider"}-${Math.round(now)}`;
        const queuedTasks = [];

        for (let i = 0; i < breachTiles.length; i++) {
            const t = breachTiles[i];
            const key = `${t.x},${t.y}`;
            if (team0._siegeSeen.has(key)) continue;
            team0._siegeSeen.add(key);

            const siegeTask = {
                x: t.x,
                y: t.y,
                duration: 500,
                assigned: 0,
                siege: true,
                type: Raider._tileTypeAt(t.x, t.y) ?? { lenX: 1, lenY: 1, name: "wallTile" },
                breachPlanId,
                breachOrder: i,
                breachChainLength: breachTiles.length,
                eligibleTroopIds: [troop.id],
            };

            team0.siegeTileStates.push(siegeTask);
            queuedTasks.push(siegeTask);
        }

        if (!queuedTasks.length) return false;

        troop._postSiegeTask = task;
        troop._siegeQueue = queuedTasks.slice(1);
        troop.task = null;
        troop.currentPath = [];
        Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);

        const taskObtained = Manager.assignTaskToTroop(troop, queuedTasks[0], CONTROL_STATES.DESTROY_MODE_T);
        if (taskObtained || Raider._assignSiegeTaskInPlace(troop, queuedTasks[0])) return true;

        for (const siegeTask of queuedTasks) {
            Teams.removeFromStateArray("0", "siegeTileStates", siegeTask);
            team0._siegeSeen.delete(`${siegeTask.x},${siegeTask.y}`);
        }
        troop._siegeQueue = [];
        return false;
    }

    static handlePathInvalidated(troop) {
        if (troop?.body?.team !== 0) return false;

        const activeTask = troop.task;
        if (activeTask?.siege) {
            const postTask = troop._postSiegeTask;
            Raider._releaseSiegeTasks(troop);
            troop.task = null;
            if (postTask && Raider.beginSiegeForTask(troop, postTask)) return true;
        } else if (activeTask) {
            if (Raider.beginSiegeForTask(troop, activeTask)) return true;
        } else if (troop._postSiegeTask) {
            const postTask = troop._postSiegeTask;
            Raider._releaseSiegeTasks(troop);
            if (Raider.beginSiegeForTask(troop, postTask)) return true;
        }

        troop.task = null;
        troop._siegeQueue = [];
        Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
        return false;
    }

    static _tileToWorldCenter(tx, ty) {
        return { x: tx * SQUARESIZE + SQUARESIZE / 2, y: ty * SQUARESIZE + SQUARESIZE / 2 };
    }

    static siegeComplete(troop) {
        // Defensive: only raiders
        if (troop?.body?.team !== 0) return;

        // Clear *current* task without reassigning a bunch of state.
        // (You wanted “don’t reassign, just clear task and let update pick next”.)
        Teams.removeFromStateArray("0", "siegeTileStates", troop.task);
        troop.task = null;

        // If more siege walls remain, jump to next siege wall and let Manager path it
        if (troop._siegeQueue && troop._siegeQueue.length > 0) {
            const next = troop._siegeQueue.shift();
            next.assigned = next.assigned ?? 0;

            // Manager owns state + pathing
            if (!Manager.assignTaskToTroop(troop, next, CONTROL_STATES.DESTROY_MODE_T)) {
                Raider._assignSiegeTaskInPlace(troop, next);
            }
            return;
        }

        // Siege is done: resume original goal (usually destroying the POI/building)
        const post = troop._postSiegeTask;
        troop._postSiegeTask = null;

        if (post) {
            if (!Raider._isBuildingTaskValid(post)) {
                Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
                troop.roam = false;
                return;
            }
            post.assigned = post.assigned ?? 0;
            Raider._rememberMission(troop, post);

            // IMPORTANT: use DESTROY_MODE so buildingManager destroy loop definitely ticks,
            // or keep SIEGE_MODE now that beginDestroyingBlock allows it.
            Manager.assignTaskToTroop(troop, post, CONTROL_STATES.DESTROY_MODE);
            return;
        }

        // Nothing left to do; fall back to default behavior (roam/idle/etc.)
        Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
        troop.roam = true;
    }

    // This should match whatever you used earlier for build/destroy approach
    static _makeWallDestroyTask(tx, ty) {
        const tileType = Raider._tileTypeAt(tx, ty);

        return {
            x: tx,
            y: ty,

            // ✅ actual tile type object (not a fake wallTile)
            // fallback keeps your code safe if something weird is on that tile
            type: tileType ?? { lenX: 1, lenY: 1, name: "wallTile" },

            duration: 6,
            assigned: 0,
            siege: true,
        };
    }


    static _tileTypeAt(tx, ty) {
        const cell = Map.grid?.[ty]?.[tx];
        if (!cell) return null;
        const top = Array.isArray(cell) ? cell[1] : cell;
        const name = TILE_MAP(top);              // "wall" | "woodWall" | "wall_door" | "woodWall_door" etc :contentReference[oaicite:2]{index=2}
        return name ? TILE_TYPES[name] : null;   // full type object with lenX/lenY/etc :contentReference[oaicite:3]{index=3}
    }

    // Call this whenever a raider finishes a destroy task (or periodically if you want)
    static tryResumePOIIfOpen(raider) {
        const siege = raider.__siege;
        if (!siege || !siege.originalTask) return false;

        // Attempt path to POI again (enemy mesh will be used because team==0 in your findPath selector)
        const fp = siege.footprint;
        const targetWorld = Raider._tileToWorldCenter(fp.x, fp.y);

        const path = Map.findPath(raider, targetWorld.x, targetWorld.y, fp.w, fp.h); // adjust signature to your finder
        if (path && path.length) {
            // Restore original POI task and go
            raider.task = siege.originalTask;
            raider.__siege = null;
            Player.moveTo(raider, path);
            return true;
        }

        return false;
    }

    isAdjacentToTile(tx, ty) {
        const cx = this.tileX, cy = this.tileY; // or however you store grid coords
        return Math.abs(cx - tx) + Math.abs(cy - ty) === 1;
    }

    static destroy(troop, opts = {}) {
        if (!troop || !troop.body) return;
        const scene = troop.scene;
        const silentStageCleanup = !!opts.silentStageCleanup;
        const taskReleasedBySiegeCleanup = !!troop.task?.siege;

        fightManager.clearAttackRecovery(troop);
        fightManager.clearHitReaction(troop);
        Raider._releaseSiegeTasks(troop);
        Player._dropTargetingAgainstUnit?.(troop);
        Player._playDeathAnimation?.(troop);
        Player._destroyMiniBars(troop)
        if (!silentStageCleanup) {
            troop.spawner?.notifyEnemyDied?.();
        }

        // ✅ count kill toward the parcel contract (updates ⚔ text + completion)
        if (!silentStageCleanup) {
            scene?.parcelManager?.notifyRaiderKilled?.(troop.contractId);
            scene?.registerRunEnemyDefeat?.(troop, opts);
        }

        const team = Teams.teamLists["0"];
        if (team) {
            if (team.fighterList) {
                const fidx = team.fighterList.indexOf(troop);
                if (fidx !== -1) team.fighterList.splice(fidx, 1);
            }
            const pidx = team.playerList.indexOf(troop);
            if (pidx !== -1) team.playerList.splice(pidx, 1);
        }

        // Cancel active timers
        if (troop.timer) {
            troop.timer.remove(false);
            troop.timer = null;
        }

        // Drop task cleanly
        if (troop.task) {
            if (!taskReleasedBySiegeCleanup && typeof troop.task.assigned === "number") troop.task.assigned--;
            troop.task = null;
        }

        troop.track = null;
        troop.forcedTarget = null;

        // Remove physics body
        if (troop.body) {
            try { scene.physics.world.remove(troop.body); } catch {}
            try { troop.body.destroy(); } catch {}
        }

        // Remove from global lists
        const idx = Player.troops.indexOf(troop);
        if (idx !== -1) Player.troops.splice(idx, 1);

        Player.characters.remove(troop);

        troop.destroy();
    }
}
