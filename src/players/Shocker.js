import Phaser from "phaser";
import { CONTROL_STATES, SQUARESIZE, TILE_MAP, TILE_TYPES, UIDEPTH } from "../constants";
import { Player } from "./Player";
import { Teams } from "../Teams";
import { Map } from "../map";
import { Raider } from "./Raider";
import { Wall } from "../buildings/Wall";
import { buildingManager } from "../Manager/buildingManager";
import { fightManager } from "../Manager/fightManager";
import { Manager } from "../Manager/Manager";
import { AudioManager } from "../Manager/AudioManager";
import { ZoomMixer } from "../UI/ZoomMixer";
import { SiegePlanner } from "../lib/navmesh/SiegePlanner";
import { attachDirectionalSix } from "./PlayerDirectionalAnimator";
import shockerWalkDown from "url:../assets/Players/shocker/shocker_walk_down.png";
import shockerWalkDownLeft from "url:../assets/Players/shocker/shocker_walk_down_left.png";
import shockerWalkDownRight from "url:../assets/Players/shocker/shocker_walk_down_right.png";
import shockerWalkUp from "url:../assets/Players/shocker/shocker_walk_up.png";
import shockerWalkUpLeft from "url:../assets/Players/shocker/shocker_walk_up_left.png";
import shockerWalkUpRight from "url:../assets/Players/shocker/shocker_walk_up_right.png";
import raiderSwimUp from "url:../assets/players/raider/raider_swim_up.png";
import raiderSwimDown from "url:../assets/players/raider/raider_swim_down.png";
import raiderSwimSidewards from "url:../assets/players/raider/raider_swim_sidewards.png";

const SHOCK_RANGE = SQUARESIZE * 4.8;
const WALL_SHOCK_RANGE = SQUARESIZE * 5.25;
const CHARGE_MS = 170;
const COOLDOWN_MS = 900;
const WALL_DAMAGE_PRIMARY = 72;
const WALL_DAMAGE_CHAIN = 34;
const BUILDING_DAMAGE = 40;
const PLAYER_DAMAGE = 26;
const SHOCK_DAMAGE_SCALE_BY_TARGET_COUNT = [0, 1.25, 0.9, 0.75];
const SHOCK_DAMAGE_SPREAD_FALLOFF = 0.1;
const SHOCK_DAMAGE_MIN_SPREAD_SCALE = 0.5;

export class Shocker {
    static speed = 66;
    static stamina = 0;
    static awareness = SQUARESIZE * 5.2;
    static tint = 0x9c8cff;

    static preload(scene) {
        scene.load.spritesheet("shocker_walk_down", shockerWalkDown, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet("shocker_walk_down_left", shockerWalkDownLeft, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet("shocker_walk_down_right", shockerWalkDownRight, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet("shocker_walk_up", shockerWalkUp, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet("shocker_walk_up_left", shockerWalkUpLeft, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet("shocker_walk_up_right", shockerWalkUpRight, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet("shocker_swim_up", raiderSwimUp, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet("shocker_swim_down", raiderSwimDown, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet("shocker_swim_sidewards", raiderSwimSidewards, { frameWidth: 32, frameHeight: 32 });
    }

    constructor(x, y, teamNumber = 0) {
        const shocker = Player.addPlayer(
            x,
            y,
            teamNumber,
            "shocker_walk_down",
            "walk",
            "idle",
            "action",
            {
                name: "Shocker Arc",
                baseDmg: PLAYER_DAMAGE,
                range: SHOCK_RANGE,
                duration: COOLDOWN_MS,
                projectile: false,
            }
        );

        shocker.name = "The Shocker";
        shocker.unitTint = Shocker.tint;
        shocker.type = Shocker;
        shocker.isRaider = true;
        shocker.isShocker = true;
        shocker.isBoss = true;
        shocker.roam = false;
        shocker.maxHealth = 2200;
        shocker.health = shocker.maxHealth;
        shocker.killReward = 0;
        shocker.maxStamina = shocker.maxStamina ?? 100;
        shocker.stamina = shocker.stamina ?? shocker.maxStamina;
        shocker.customDoAction = () => Shocker.handleAction(shocker);
        shocker.destroySelf = (opts = {}) => Shocker.destroy(shocker, opts);
        shocker._bobPhase = Math.random() * Math.PI * 2;
        shocker._bobAppliedOffset = 0;
        shocker._shockerChargeFx = null;
        shocker._shockerChargeTween = null;
        shocker._shockerChargeEvent = null;
        shocker._shockerLightningSerial = 0;

        attachDirectionalSix(shocker, {
            animPrefix: "shocker",
            defaultDirection: "down",
            walkStateKey: "walk",
            idleStateKey: "idle",
            swimStateKey: "swim",
            idleFrame: 0,
            swimIdleFrame: 1,
            frameRate: 4,
            swimFrameRate: 8,
            frameEnd: 0,
            swimFrameEnd: 2,
            directions: {
                down: "shocker_walk_down",
                down_left: "shocker_walk_down_left",
                down_right: "shocker_walk_down_right",
                up: "shocker_walk_up",
                up_left: "shocker_walk_up_left",
                up_right: "shocker_walk_up_right",
            },
            swimDirections: {
                up: "shocker_swim_up",
                down: "shocker_swim_down",
                side: "shocker_swim_sidewards",
            },
        });

        ZoomMixer.createPlayerMoniker(shocker);
        return shocker;
    }

    static update(troop) {
        const recoveringFromWater = !!(troop && (troop._enemyWaterRecovery || Player._isOnWater?.(troop)));
        if (recoveringFromWater) {
            Shocker._clearShockCycle(troop);
        }
        const hadPlayerTarget = Shocker._hasActivePlayerTarget(troop) || !!troop?._raiderPlayerChase;
        const result = Raider.update(troop);
        const finishedWaterRecovery = recoveringFromWater && troop?.active && !troop._enemyWaterRecovery && !Player._isOnWater?.(troop);
        if (hadPlayerTarget && !Shocker._hasActivePlayerTarget(troop) && !troop?._raiderPlayerChase) {
            Shocker._clearShockCycle(troop);
        }
        if (finishedWaterRecovery || Shocker._needsMissionBreachTask(troop)) {
            Shocker._ensureMissionBreachTask(troop, { preferDirectZap: true });
        }
        return result;
    }

    static postUpdate(troop) {
        if (!troop?.active) return;
        const now = troop.scene?.getSimulationNow?.() ?? troop.scene?.simNowMs ?? troop.scene?.time?.now ?? 0;
        const baseY = troop.y - Number(troop._bobAppliedOffset || 0);
        const moving = (troop.body?.velocity?.lengthSq?.() ?? 0) > 36;
        const amplitude = moving ? 3.2 : 2.1;
        const bob = Math.sin((now * 0.008) + Number(troop._bobPhase || 0)) * amplitude;
        troop.y = baseY + bob;
        troop._bobAppliedOffset = bob;
    }

    static handleAction(troop) {
        if (!troop?.active || !troop.isShocker) return false;
        const state = troop.state;
        const intercept = (
            state === CONTROL_STATES.ATTACK_MODE
            || state === CONTROL_STATES.DESTROY_MODE
            || state === CONTROL_STATES.DESTROY_MODE_T
            || state === CONTROL_STATES.SIEGE_MODE
        );
        if (!intercept) return false;
        if (troop.timer) return true;

        const plan = Shocker._resolveShockPlan(troop);
        if (!plan) {
            if (state === CONTROL_STATES.ATTACK_MODE) {
                Teams.movePlayerState(troop, CONTROL_STATES.TRACK_TARGET);
                return true;
            }
            return false;
        }

        troop.body?.setVelocity?.(0, 0);
        troop.currentPath?.splice?.(0);
        Player.setAnimState?.(troop, troop.idle);
        Shocker._startShockCycle(troop, plan);
        return true;
    }

    static destroy(troop, opts = {}) {
        if (!troop) return;
        Shocker._clearShockCycle(troop);
        if (!opts?.silentStageCleanup && troop.scene?._activeShockerBoss === troop && !troop._shockerDefeatHandled) {
            troop._shockerDefeatHandled = true;
            troop.scene.handleShockerBossDefeated?.(troop);
        }
        return Raider.destroy(troop, opts);
    }

    static _dropPlayerChase(troop) {
        if (!troop?.active) return false;
        Shocker._clearShockCycle(troop);
        Shocker._clearCombatTaskClaim(troop);
        return Raider._dropPlayerChase(troop);
    }

    static _releaseSiegeTasks(troop) {
        return Raider._releaseSiegeTasks?.(troop);
    }

    static _clearCombatTaskClaim(troop) {
        if (troop?.taskMeta?.state !== CONTROL_STATES.TRACK_TARGET) return;
        if (typeof troop.task?.assigned === "number" && troop.task.assigned > 0) {
            troop.task.assigned -= 1;
        }
        troop.task = null;
        troop.taskMeta = null;
    }

    static _startShockCycle(troop, plan) {
        const scene = troop.scene;
        const cycleDelay = Shocker._currentCooldownMs(troop);
        troop._shockerChargeEvent?.remove?.(false);
        troop._shockerChargeEvent = null;
        troop._shockerChargeTween?.remove?.();
        troop._shockerChargeTween = null;
        troop?._shockerChargeFx?.destroy?.();
        troop._shockerChargeFx = null;
        const chargeFx = scene.add.circle(troop.x, troop.y, 10, 0x9dd7ff, 0.12)
            .setStrokeStyle(2, 0xe6fbff, 0.8)
            .setDepth((troop.depth ?? UIDEPTH) + 1);
        troop._shockerChargeFx = chargeFx;

        troop._shockerChargeTween = scene.tweens.add({
            targets: chargeFx,
            radius: plan.primary?.kind === "wall" ? 34 : 26,
            alpha: 0,
            duration: CHARGE_MS,
            ease: "Cubic.easeOut",
            onComplete: () => {
                if (troop._shockerChargeTween?.targets?.includes?.(chargeFx)) {
                    troop._shockerChargeTween = null;
                }
                if (chargeFx.active) chargeFx.destroy();
                if (troop._shockerChargeFx === chargeFx) troop._shockerChargeFx = null;
            },
        });

        troop.setTint?.(0xdff6ff);
        troop._shockerChargeEvent = scene.time.delayedCall(CHARGE_MS, () => {
            troop._shockerChargeEvent = null;
            if (!troop?.active) return;
            troop.clearTint?.();
            Shocker._executeShock(troop, plan);
        });

        troop.timer = scene.time.delayedCall(cycleDelay, () => {
            troop.timer = null;
            if (!troop?.active) return;
            troop.clearTint?.();
            const nextPlan = Shocker._resolveShockPlan(troop);
            if (!nextPlan) {
                if (troop.state === CONTROL_STATES.ATTACK_MODE) {
                    Teams.movePlayerState(troop, CONTROL_STATES.TRACK_TARGET);
                }
                return;
            }
            Shocker._startShockCycle(troop, nextPlan);
        });
    }

    static _clearShockCycle(troop) {
        troop?.timer?.remove?.(false);
        troop.timer = null;
        troop?._shockerChargeEvent?.remove?.(false);
        troop._shockerChargeEvent = null;
        troop?._shockerChargeTween?.remove?.();
        troop._shockerChargeTween = null;
        troop?._shockerChargeFx?.destroy?.();
        troop._shockerChargeFx = null;
        troop?.clearTint?.();
    }

    static _resolveShockPlan(troop) {
        const intensity = Shocker._getIntensity(troop);
        const sameRegionTargets = Shocker._collectSameRegionTargets(troop);
        const contextualPrimary = Shocker._resolveContextualPrimary(troop);
        let primary = contextualPrimary;

        if (!primary && sameRegionTargets.length) {
            primary = sameRegionTargets.shift();
        }

        const primaryId = Shocker._descriptorId(primary);
        const chains = sameRegionTargets
            .filter((entry) => Shocker._descriptorId(entry) !== primaryId)
            .slice(0, intensity.chainCount);

        const sideWalls = Shocker._collectNearbyWalls(troop, WALL_SHOCK_RANGE)
            .filter((entry) => Shocker._descriptorId(entry) !== primaryId)
            .slice(0, intensity.sideWallCount);

        if (!primary && sideWalls.length) {
            primary = sideWalls.shift();
        }
        if (!primary) return null;

        return {
            primary,
            chains,
            sideWalls,
        };
    }

    static _resolveContextualPrimary(troop) {
        const playerTargets = [
            troop.forcedTarget,
            troop.track?.[0]?.gameObject,
        ];
        for (const target of playerTargets) {
            if (Shocker._canShockSameRegionTarget(troop, target, SHOCK_RANGE)) {
                return Shocker._describeTarget("player", target, troop);
            }
        }

        const wallTask = Shocker._getTaskWall(troop);
        if (wallTask?.wall && Shocker._distanceToWall(troop, wallTask.wall) <= WALL_SHOCK_RANGE) {
            return wallTask;
        }

        const buildingTarget = troop.task?.value?.buildingRef || troop.task?.value || null;
        if (buildingTarget && Shocker._isBuildingActive(buildingTarget) && Shocker._canShockSameRegionTarget(troop, buildingTarget, SHOCK_RANGE)) {
            return Shocker._describeTarget("building", buildingTarget, troop);
        }

        return null;
    }

    static _collectSameRegionTargets(troop) {
        const out = [];
        const pushIfValid = (kind, target) => {
            if (!Shocker._canShockSameRegionTarget(troop, target, SHOCK_RANGE)) return;
            out.push(Shocker._describeTarget(kind, target, troop));
        };

        for (const target of Teams.teamLists?.["1"]?.playerList || []) {
            pushIfValid("player", target);
        }

        for (const entry of Teams.teamLists?.["1"]?.buildings || []) {
            const building = entry?.[3]?.buildingRef || entry?.[3] || null;
            if (!building || !Shocker._isBuildingActive(building)) continue;
            pushIfValid("building", building);
        }

        out.sort((a, b) => {
            const pa = Shocker._priorityForDescriptor(a);
            const pb = Shocker._priorityForDescriptor(b);
            if (pa !== pb) return pa - pb;
            return a.distance - b.distance;
        });
        return out;
    }

    static _collectNearbyWalls(troop, range) {
        const walls = [];
        for (const wall of Wall.byCell.values()) {
            if (!wall?.active) continue;
            const dist = Shocker._distanceToWall(troop, wall);
            if (dist > range) continue;
            walls.push({
                kind: "wall",
                target: wall,
                wall,
                x: wall.sprite?.x ?? (wall.x * SQUARESIZE + SQUARESIZE / 2),
                y: wall.sprite?.y ?? (wall.y * SQUARESIZE + SQUARESIZE / 2),
                distance: dist,
                task: Shocker._makeWallTask(wall),
            });
        }
        walls.sort((a, b) => a.distance - b.distance);
        return walls;
    }

    static _executeShock(troop, plan) {
        if (!troop?.active || !plan?.primary) return;
        const targets = [plan.primary, ...(plan.chains || []), ...(plan.sideWalls || [])];
        const unique = [];
        const seen = new Set();
        targets.forEach((entry) => {
            const id = Shocker._descriptorId(entry);
            if (!id || seen.has(id)) return;
            seen.add(id);
            unique.push(entry);
        });

        const from = { x: troop.x, y: troop.y - 8 };
        unique.forEach((entry, index) => {
            const to = Shocker._targetPoint(entry);
            const primaryArc = index === 0;
            AudioManager.playShockerZap(index, {
                volume: primaryArc ? (0.29 + Math.random() * 0.05) : (0.16 + Math.random() * 0.07),
                rate: 0.94 + Math.random() * 0.12,
            });
            Shocker._drawElectricArc(troop.scene, from, to, index);
            Shocker._applyShockDamage(troop, entry, index === 0, unique.length);
        });
    }

    static _damageScaleForTargetCount(targetCount = 1) {
        const count = Math.max(1, Math.floor(Number(targetCount) || 1));
        if (count < SHOCK_DAMAGE_SCALE_BY_TARGET_COUNT.length) {
            return SHOCK_DAMAGE_SCALE_BY_TARGET_COUNT[count];
        }
        return Math.max(
            SHOCK_DAMAGE_MIN_SPREAD_SCALE,
            SHOCK_DAMAGE_SCALE_BY_TARGET_COUNT[3] - ((count - 3) * SHOCK_DAMAGE_SPREAD_FALLOFF)
        );
    }

    static _scaleShockDamage(baseDamage, targetCount = 1) {
        const raw = Number(baseDamage || 0) * Shocker._damageScaleForTargetCount(targetCount);
        return Math.max(1, Math.round(raw));
    }

    static _applyShockDamage(troop, entry, isPrimary, targetCount = 1) {
        if (!entry) return false;
        if (entry.kind === "player") {
            const target = entry.target;
            if (!target?.active) return false;
            const wasFocusedTarget = Shocker._isFocusedPlayerTarget(troop, target);
            target.health = Math.max(0, Number(target.health || 0) - Shocker._scaleShockDamage(PLAYER_DAMAGE, targetCount));
            fightManager.applyHitReaction(target, troop, troop.weapon);
            if (target.health <= 0) {
                Player._cleanupCombatTicketForTarget?.(troop.body?.team, target);
                Player.destroyPlayer(target);
                if (wasFocusedTarget && Shocker._isFocusedPlayerTarget(troop, target)) {
                    Shocker._dropPlayerChase(troop);
                }
            }
            return true;
        }

        if (entry.kind === "building") {
            const target = entry.target;
            if (!Shocker._isBuildingActive(target)) return false;
            const tempTask = { value: target, duration: Number(target.health ?? target.hp ?? target.maxHealth ?? target.maxHp ?? 1) };
            const result = buildingManager.applyDestroyDamage(tempTask, Shocker._scaleShockDamage(BUILDING_DAMAGE, targetCount));
            if (result?.destroyed) {
                target.destroy?.();
            }
            return true;
        }

        if (entry.kind === "wall") {
            const wall = entry.wall || entry.target;
            if (!wall?.active) return false;
            const missionTask = Shocker._getMissionTask(troop);
            const countsSiegeProgress = Shocker._isActiveBreachWall(troop, entry, wall);
            const completionTask = countsSiegeProgress
                ? troop.task
                : (entry.task || Shocker._makeWallTask(wall));
            const baseDamage = isPrimary ? WALL_DAMAGE_PRIMARY : WALL_DAMAGE_CHAIN;
            const destroyed = wall.damage(Shocker._scaleShockDamage(baseDamage, targetCount));
            if (destroyed) {
                buildingManager._completeDestroyTile(troop, completionTask, wall.x, wall.y, {
                    countRaiderSiegeProgress: countsSiegeProgress,
                    preserveSpriteTimer: !countsSiegeProgress,
                    preserveTroopState: !countsSiegeProgress,
                });
                if (!countsSiegeProgress) {
                    Shocker._removeDestroyedWallFromPendingSiege(troop, wall.x, wall.y);
                }
                Shocker._tryResumeReachableMission(troop, missionTask);
            }
            return true;
        }

        return false;
    }

    static _hasActivePlayerTarget(troop) {
        const forced = troop?.forcedTarget;
        if (forced?.active && forced.body?.team === 1) return true;
        const tracked = troop?.track?.[0]?.gameObject;
        return !!(tracked?.active && tracked.body?.team === 1);
    }

    static _isFocusedPlayerTarget(troop, target) {
        if (!target?.body || target.body.team !== 1) return false;
        return troop?.forcedTarget === target || troop?.track?.[0]?.gameObject === target;
    }

    static _wallTaskMatches(task, wallOrX, y = null) {
        if (!task?.siege) return false;
        const tx = Number(task.tx ?? task.x);
        const ty = Number(task.ty ?? task.y);
        const wx = typeof wallOrX === "object" ? Number(wallOrX?.x) : Number(wallOrX);
        const wy = typeof wallOrX === "object" ? Number(wallOrX?.y) : Number(y);
        return Number.isFinite(tx) && Number.isFinite(ty) && tx === wx && ty === wy;
    }

    static _isActiveBreachWall(troop, entry, wall) {
        return !!(
            troop?.task?.siege &&
            Shocker._wallTaskMatches(troop.task, wall) &&
            (!entry?.task || Shocker._wallTaskMatches(entry.task, wall))
        );
    }

    static _getMissionTask(troop, preferredTask = null) {
        const candidates = [
            preferredTask,
            troop?._postSiegeTask,
            troop?._raidMissionTask,
            troop?.task,
        ];
        for (const task of candidates) {
            if (!task || task.siege) continue;
            if (Raider._isBuildingTaskValid(task)) return task;
        }
        return null;
    }

    static _findMissionApproach(troop, task) {
        const building = Raider._buildingFromTask(task);
        const type = task?.type || building?.tileType || building?.buildType || building?.type;
        const x = Number(task?.x ?? building?.x ?? building?.gridX);
        const y = Number(task?.y ?? building?.y ?? building?.gridY);
        if (!troop?.active || !type || !Number.isFinite(x) || !Number.isFinite(y)) return null;
        return buildingManager.findApproachAnyPerimeter(x, y, type, troop, null, null, task);
    }

    static _removeDestroyedWallFromPendingSiege(troop, tx, ty) {
        const key = `${tx},${ty}`;
        const matches = (task) => Shocker._wallTaskMatches(task, tx, ty);
        const team0 = Teams.teamLists?.["0"];

        if (Array.isArray(troop?._siegeQueue)) {
            troop._siegeQueue = troop._siegeQueue.filter((task) => {
                if (!matches(task)) return true;
                team0?._siegeSeen?.delete?.(key);
                if (Array.isArray(team0?.siegeTileStates)) {
                    Teams.removeFromStateArray("0", "siegeTileStates", task);
                }
                return false;
            });
        }

        if (Array.isArray(team0?.siegeTileStates)) {
            for (let i = team0.siegeTileStates.length - 1; i >= 0; i--) {
                const task = team0.siegeTileStates[i];
                if (matches(task)) team0.siegeTileStates.splice(i, 1);
            }
        }
        team0?._siegeSeen?.delete?.(key);
    }

    static _tryResumeReachableMission(troop, preferredTask = null) {
        if (!troop?.active || Shocker._hasActivePlayerTarget(troop)) return false;

        const task = Shocker._getMissionTask(troop, preferredTask);
        if (!task) return false;
        if (troop.task === task && !task.siege) {
            Raider._rememberMission(troop, task);
            return true;
        }

        const approach = Shocker._findMissionApproach(troop, task);
        if (!approach?.path?.length) return false;

        Shocker._clearShockCycle(troop);
        Raider._releaseSiegeTasks?.(troop);
        troop._postSiegeTask = null;
        troop._siegeQueue = [];
        troop.task = null;
        troop.taskMeta = null;
        troop.roam = false;
        troop.currentPath?.splice?.(0);
        troop.finalPos = null;
        troop.body?.setVelocity?.(0, 0);

        Raider._rememberMission(troop, task);
        task.assigned = Math.max(0, Number(task.assigned || 0));
        Teams.movePlayerState(troop, CONTROL_STATES.DESTROY_MODE);
        troop.task = task;
        troop.task.assigned += 1;
        troop.destX = approach.tx;
        troop.destY = approach.ty;
        Manager._setTaskMeta?.(troop, task, CONTROL_STATES.DESTROY_MODE, null);
        if (approach.polyIds?.length) troop.__pendingPolyIds = approach.polyIds;
        Player.moveTo(troop, approach.path);
        return true;
    }

    static _needsMissionBreachTask(troop) {
        if (!troop?.active || troop._enemyWaterRecovery || Player._isOnWater?.(troop)) return false;
        if (Shocker._hasActivePlayerTarget(troop) || troop._raiderPlayerChase) return false;
        if (troop.task || troop.timer || troop.currentPath?.length) return false;
        if (troop.state !== CONTROL_STATES.TRACK_MODE) return false;
        return !!Shocker._getMissionTask(troop);
    }

    static _ensureMissionBreachTask(troop, opts = {}) {
        if (!troop?.active || Shocker._hasActivePlayerTarget(troop) || troop._raiderPlayerChase) return false;

        const missionTask = Shocker._getMissionTask(troop);
        if (!missionTask) return false;

        const reachableApproach = Shocker._findMissionApproach(troop, missionTask);
        if (reachableApproach?.path?.length) return false;

        const breachTasks = Shocker._buildMissionBreachTasks(troop, missionTask);
        if (!breachTasks.length) return false;

        const firstTask = breachTasks[0];
        const firstWall = Wall.getAt(firstTask.x, firstTask.y);
        if (!firstWall?.active) return false;

        const preferDirectZap = opts?.preferDirectZap !== false;
        if (preferDirectZap && Shocker._distanceToWall(troop, firstWall) <= WALL_SHOCK_RANGE) {
            return Shocker._assignDirectBreachTask(troop, missionTask, breachTasks);
        }

        return Raider.beginSiegeForTask?.(troop, missionTask) || false;
    }

    static _buildMissionBreachTasks(troop, missionTask) {
        if (!troop?.active || !missionTask) return [];
        const fp = Raider._taskToFootprint?.(missionTask) || {
            x: missionTask.x,
            y: missionTask.y,
            w: missionTask.type?.lenX ?? 1,
            h: missionTask.type?.lenY ?? 1,
        };
        const gridH = Map.enemyNavGrid?.length ?? 0;
        const gridW = gridH ? (Map.enemyNavGrid[0]?.length ?? 0) : 0;
        if (!gridW || !gridH) return [];

        Map.enemyRegionSystem?.ensureUpToDate?.();
        const targets = SiegePlanner.buildPerimeterTargets(fp.x, fp.y, fp.w, fp.h, gridW, gridH);
        const planner = Raider._ensureSiegePlanner?.();
        let breachTiles = planner?.planBreach?.(troop.x, troop.y, targets);
        if (!breachTiles?.length) {
            breachTiles = Raider._fallbackAdjacentBreachTiles?.(troop) || [];
        }
        if (!breachTiles?.length) return [];

        const now = troop.scene?.getSimulationNow?.() ?? troop.scene?.simNowMs ?? troop.scene?.time?.now ?? Date.now();
        const breachPlanId = `shocker-siege-${troop.id ?? "boss"}-${Math.round(now)}`;
        const tasks = [];
        for (let i = 0; i < breachTiles.length; i++) {
            const tile = breachTiles[i];
            const wall = Wall.getAt(tile.x, tile.y);
            if (!wall?.active) continue;
            tasks.push({
                ...Shocker._makeWallTask(wall),
                duration: 500,
                breachPlanId,
                breachOrder: i,
                breachChainLength: breachTiles.length,
                eligibleTroopIds: [troop.id],
                shockerDirectSiege: true,
            });
        }
        return tasks;
    }

    static _assignDirectBreachTask(troop, missionTask, breachTasks = []) {
        if (!troop?.active || !breachTasks.length) return false;
        const team0 = Teams.teamLists?.["0"];
        if (!team0) return false;
        if (!Array.isArray(team0.siegeTileStates)) team0.siegeTileStates = [];
        if (!team0._siegeSeen) team0._siegeSeen = new Set();

        Raider._releaseSiegeTasks?.(troop);
        Shocker._clearShockCycle(troop);

        const queued = [];
        for (const task of breachTasks) {
            const key = `${task.x},${task.y}`;
            if (!team0.siegeTileStates.includes(task)) {
                team0.siegeTileStates.push(task);
            }
            team0._siegeSeen.add(key);
            queued.push(task);
        }
        if (!queued.length) return false;

        const first = queued[0];
        troop._postSiegeTask = missionTask;
        troop._siegeQueue = queued.slice(1);
        troop.task = first;
        first.assigned = Math.max(0, Number(first.assigned || 0)) + 1;
        troop.roam = false;
        troop.destX = first.x;
        troop.destY = first.y;
        troop.currentPath?.splice?.(0);
        troop.finalPos = null;
        troop.body?.setVelocity?.(0, 0);
        Raider._rememberMission?.(troop, missionTask);
        Manager._setTaskMeta?.(troop, first, CONTROL_STATES.DESTROY_MODE_T, "siegeTileStates");
        Teams.movePlayerState(troop, CONTROL_STATES.DESTROY_MODE_T);
        Player.setAnimState?.(troop, troop.idle);

        const plan = Shocker._resolveShockPlan(troop);
        if (plan) {
            Shocker._startShockCycle(troop, plan);
        }
        return true;
    }

    static _describeTarget(kind, target, troop = null) {
        const point = Shocker._worldPointForTarget(target);
        return {
            kind,
            target,
            x: point.x,
            y: point.y,
            distance: troop ? Phaser.Math.Distance.Between(troop.x, troop.y, point.x, point.y) : 0,
        };
    }

    static _liveTargetVisual(target) {
        return target?.sprite || target?.baseSprite || target;
    }

    static _worldPointForTarget(target) {
        const sprite = Shocker._liveTargetVisual(target);
        return {
            x: Number(sprite?.x ?? target?.x ?? 0),
            y: Number(sprite?.y ?? target?.y ?? 0),
        };
    }

    static _priorityForDescriptor(entry) {
        if (!entry) return 99;
        if (entry.kind === "player") return 0;
        const target = entry.target;
        const tileName = target?.tileType?.name ?? target?.type?.name ?? null;
        if (tileName === "tower") return 1;
        if (entry.kind === "building") return 2;
        return 4;
    }

    static _canShockSameRegionTarget(troop, target, range = SHOCK_RANGE) {
        if (!troop?.active || !Shocker._isShockTargetActive(target)) return false;
        const point = Shocker._worldPointForTarget(target);
        const dist = Phaser.Math.Distance.Between(troop.x, troop.y, point.x, point.y);
        if (dist > range) return false;
        if (!Map.enemyRegionSystem?.canReachWorldToWorld) return true;
        Map.enemyRegionSystem.ensureUpToDate?.();
        const from = Player._regionCheckPointForTroop?.(troop, troop.x, troop.y);
        if (!from) return false;
        return !!Map.enemyRegionSystem.canReachWorldToWorld(from.x, from.y, point.x, point.y);
    }

    static _descriptorId(entry) {
        if (!entry) return null;
        if (entry.kind === "wall") return `wall:${entry.wall?.x},${entry.wall?.y}`;
        return `${entry.kind}:${entry.target?.id ?? entry.target?.x ?? 0}:${entry.target?.y ?? 0}`;
    }

    static _targetPoint(entry) {
        return {
            x: Number(entry?.x ?? 0),
            y: Number(entry?.y ?? 0),
        };
    }

    static _distanceToWall(troop, wall) {
        const x = wall?.sprite?.x ?? (wall?.x * SQUARESIZE + SQUARESIZE / 2);
        const y = wall?.sprite?.y ?? (wall?.y * SQUARESIZE + SQUARESIZE / 2);
        return Phaser.Math.Distance.Between(troop.x, troop.y, x, y);
    }

    static _isShockTargetActive(target) {
        if (!target || target._destroyed || target._isDestroyed) return false;
        const visual = Shocker._liveTargetVisual(target);
        if (visual?._destroyed || visual?._isDestroyed) return false;
        if (target.active === false || visual?.active === false) return false;
        const health = Number(target.health ?? target.hp ?? visual?.health ?? visual?.hp ?? 1);
        return !Number.isFinite(health) || health > 0;
    }

    static _isBuildingActive(target) {
        if (!Shocker._isShockTargetActive(target)) return false;
        const health = Number(target.health ?? target.hp ?? target.maxHealth ?? target.maxHp ?? 1);
        return !Number.isFinite(health) || health > 0;
    }

    static _getTaskWall(troop) {
        const task = troop?.task;
        if (!task) return null;
        const tx = Number(task.tx ?? task.x);
        const ty = Number(task.ty ?? task.y);
        if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
        const wall = Wall.getAt(tx, ty);
        if (!wall?.active) return null;
        return {
            kind: "wall",
            target: wall,
            wall,
            x: wall.sprite?.x ?? (tx * SQUARESIZE + SQUARESIZE / 2),
            y: wall.sprite?.y ?? (ty * SQUARESIZE + SQUARESIZE / 2),
            distance: Shocker._distanceToWall(troop, wall),
            task: Shocker._makeWallTask(wall),
        };
    }

    static _makeWallTask(wall) {
        const gridCell = Map.grid?.[wall.y]?.[wall.x];
        const top = Array.isArray(gridCell) ? gridCell[1] : gridCell;
        const typeName = TILE_MAP(top) || (wall.isDoor ? (wall.material === "wood" ? "woodWall_door" : "wall_door") : (wall.material === "wood" ? "woodWall" : "wall"));
        return {
            x: wall.x,
            y: wall.y,
            tx: wall.x,
            ty: wall.y,
            type: TILE_TYPES[typeName] || { name: typeName },
            assigned: 0,
            siege: true,
        };
    }

    static _drawElectricArc(scene, from, to, arcIndex = 0) {
        const g = scene.add.graphics().setDepth((UIDEPTH ?? 2000) + 180);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.max(12, Math.hypot(dx, dy));
        const norm = { x: dx / length, y: dy / length };
        const perp = { x: -norm.y, y: norm.x };
        const segments = Math.max(5, Math.round(length / 18));
        const jitter = 10 + Math.min(14, length * 0.05) + (arcIndex * 1.8);

        const drawLayer = (width, color, alpha, variance) => {
            g.lineStyle(width, color, alpha);
            g.beginPath();
            g.moveTo(from.x, from.y);
            for (let i = 1; i < segments; i++) {
                const t = i / segments;
                const alongX = Phaser.Math.Linear(from.x, to.x, t);
                const alongY = Phaser.Math.Linear(from.y, to.y, t);
                const offset = (Math.random() * 2 - 1) * variance;
                g.lineTo(
                    alongX + perp.x * offset,
                    alongY + perp.y * offset
                );
            }
            g.lineTo(to.x, to.y);
            g.strokePath();
        };

        drawLayer(5, 0x4b1f8f, 0.34, jitter + 6);
        drawLayer(3, 0x7dd3fc, 0.92, jitter);
        drawLayer(1.6, 0xffffff, 0.96, Math.max(4, jitter * 0.45));

        scene.tweens.add({
            targets: g,
            alpha: 0,
            duration: 180,
            ease: "Quad.easeOut",
            onComplete: () => g.destroy(),
        });
    }

    static _getIntensity(troop) {
        const ratio = Math.max(0, Math.min(1, Number(troop?.health || 0) / Math.max(1, Number(troop?.maxHealth || 1))));
        if (ratio <= 0.25) {
            return { chainCount: 3, sideWallCount: 3, cooldownScale: 0.68 };
        }
        if (ratio <= 0.5) {
            return { chainCount: 2, sideWallCount: 2, cooldownScale: 0.78 };
        }
        if (ratio <= 0.75) {
            return { chainCount: 2, sideWallCount: 1, cooldownScale: 0.88 };
        }
        return { chainCount: 1, sideWallCount: 1, cooldownScale: 1 };
    }

    static _currentCooldownMs(troop) {
        const intensity = Shocker._getIntensity(troop);
        return Math.max(540, Math.round(COOLDOWN_MS * intensity.cooldownScale));
    }
}
