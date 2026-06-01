import Phaser from "phaser";
import { CONTROL_STATES, SQUARESIZE, TILE_MAP, TILE_TYPES, showGhostText } from "../constants";
import { Player } from "./Player";
import { Teams } from "../Teams";
import { Map } from "../map";
import { ZoomMixer } from "../UI/ZoomMixer";
import { attachDirectionalSix } from "./PlayerDirectionalAnimator";
import { Raider } from "./Raider";
import { Wall } from "../buildings/Wall";
import { buildingManager } from "../Manager/buildingManager";
import { AudioManager } from "../Manager/AudioManager";
import bomberWalkDown from 'url:../assets/Players/bombers/bomber_walk_down.png';
import bomberWalkDownLeft from 'url:../assets/Players/bombers/bomber_walk_down_left.png';
import bomberWalkDownRight from 'url:../assets/Players/bombers/bomber_walk_down_right.png';
import bomberWalkUp from 'url:../assets/Players/bombers/bomber_walk_up.png';
import bomberWalkUpLeft from 'url:../assets/Players/bombers/bomber_walk_up_left.png';
import bomberWalkUpRight from 'url:../assets/Players/bombers/bomber_walk_up_right.png';
import bomberSwimUp from 'url:../assets/Players/bombers/bomber_swim_up.png';
import bomberSwimDown from 'url:../assets/Players/bombers/bomber_swim_down.png';
import bomberSwimRight from 'url:../assets/Players/bombers/bomber_swim_right.png';

const ARM_DURATION_MS = 5000;
const HIT_STUN_RESTART_MS = 850;
const BLAST_RADIUS = SQUARESIZE * 2.4;
const PLAYER_DAMAGE = 95;
const BUILDING_DAMAGE = 190;
const WALL_DAMAGE = 220;

export class Bomber {
    static speed = 78;
    static stamina = 0;
    static awareness = 0;
    static tint = 0xff6b2c;

    static preload(scene) {
        scene.load.spritesheet('bomber_walk_down', bomberWalkDown, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('bomber_walk_down_left', bomberWalkDownLeft, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('bomber_walk_down_right', bomberWalkDownRight, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('bomber_walk_up', bomberWalkUp, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('bomber_walk_up_left', bomberWalkUpLeft, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('bomber_walk_up_right', bomberWalkUpRight, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('bomber_swim_up', bomberSwimUp, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('bomber_swim_down', bomberSwimDown, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('bomber_swim_sidewards', bomberSwimRight, { frameWidth: 32, frameHeight: 32 });
    }

    constructor(x, y, teamNumber = 0) {
        const bomber = Player.addPlayer(
            x,
            y,
            teamNumber,
            "bomber_walk_down",
            "walk",
            "idle",
            "action",
            null
        );

        bomber.name = "Bomber";
        bomber.unitTint = Bomber.tint;
        bomber.type = Bomber;
        bomber.isRaider = true;
        bomber.isBomber = true;
        bomber.isSeaRaider = false;
        bomber.roam = false;
        bomber.awareness = 0;
        bomber.maxHealth = 48;
        bomber.health = bomber.maxHealth;
        bomber.killReward = 32;
        bomber.maxStamina = bomber.maxStamina ?? 100;
        bomber.stamina = bomber.stamina ?? bomber.maxStamina;
        bomber.weapon = null;
        bomber.destroySelf = (opts = {}) => Bomber.destroy(bomber, opts);

        attachDirectionalSix(bomber, {
            animPrefix: 'bomber',
            defaultDirection: 'down',
            walkStateKey: 'walk',
            idleStateKey: 'idle',
            swimStateKey: 'swim',
            idleFrame: 1,
            swimIdleFrame: 1,
            frameRate: 7,
            swimFrameRate: 8,
            directions: {
                down: 'bomber_walk_down',
                down_left: 'bomber_walk_down_left',
                down_right: 'bomber_walk_down_right',
                up: 'bomber_walk_up',
                up_left: 'bomber_walk_up_left',
                up_right: 'bomber_walk_up_right',
            },
            swimDirections: {
                up: 'bomber_swim_up',
                down: 'bomber_swim_down',
                side: 'bomber_swim_sidewards',
            }
        });

        ZoomMixer.createPlayerMoniker(bomber);
        return bomber;
    }

    static update(troop) {
        const recoveringFromWater = !!(troop && (troop._enemyWaterRecovery || Player._isOnWater?.(troop)));
        if (recoveringFromWater && troop?._bomberArming) {
            Bomber._cancelArming(troop);
        }
        if (Raider._handleEnemyWaterRecovery(troop)) return true;
        if (Bomber._updateArming(troop)) return false;
        return Raider.update(troop);
    }

    static handleHit(troop) {
        if (!troop?.isBomber || !troop._bomberArming) return;
        const now = Bomber._now(troop);
        const resumeAt = Math.max(
            Number(troop.moveSlowUntil || 0),
            now + HIT_STUN_RESTART_MS
        );
        Bomber._cancelArming(troop);
        troop._bomberInterruptedUntil = resumeAt;
    }

    static destroy(troop, opts = {}) {
        Bomber._cancelArming(troop);
        return Raider.destroy(troop, opts);
    }

    static _updateArming(troop) {
        if (!troop?.active || troop.isSwimming || troop._bomberExploded) return false;
        if (troop._bomberArming) {
            troop.body?.setVelocity?.(0, 0);
            troop.currentPath?.splice?.(0);
            return true;
        }
        if (!Bomber._canStartArming(troop)) return false;

        Bomber._startArming(troop);
        return true;
    }

    static _canStartArming(troop) {
        const task = troop?.task;
        if (!task) return false;
        if (troop.currentPath?.length) return false;
        if (Bomber._now(troop) < Number(troop._bomberInterruptedUntil || 0)) return false;
        if (
            troop.state !== CONTROL_STATES.DESTROY_MODE &&
            troop.state !== CONTROL_STATES.DESTROY_MODE_T &&
            troop.state !== CONTROL_STATES.SIEGE_MODE
        ) {
            return false;
        }

        return Bomber._distanceToTaskTarget(troop, task) <= SQUARESIZE * 1.35;
    }

    static _startArming(troop) {
        const scene = troop.scene;
        troop._bomberArming = true;
        troop.timer?.remove?.(false);
        troop.timer = null;
        troop.body?.setVelocity?.(0, 0);
        troop.currentPath?.splice?.(0);
        Player.setAnimState?.(troop, troop.idle);
        Teams.movePlayerState(troop, CONTROL_STATES.DESTROY_MODE);

        let pulse = 0;
        troop._bomberFlashEvent = scene.time.addEvent({
            delay: 150,
            loop: true,
            callback: () => {
                if (!troop?.active || !troop._bomberArming) return;
                const tint = pulse % 3 === 0 ? 0xffffff : (pulse % 3 === 1 ? 0xffcf33 : 0xff3636);
                troop.setTint?.(tint);
                pulse++;
            },
        });

        troop._bomberPulseRing = scene.add.circle(troop.x, troop.y, 8, 0xff3b30, 0.18)
            .setStrokeStyle(2, 0xfff3a3, 0.72)
            .setDepth((troop.depth ?? 0) - 1);
        troop._bomberPulseUpdate = () => {
            if (!troop?._bomberPulseRing?.active) return;
            troop._bomberPulseRing.setPosition(troop.x, troop.y);
        };
        scene.events.on("update", troop._bomberPulseUpdate);
        scene.tweens.add({
            targets: troop._bomberPulseRing,
            radius: BLAST_RADIUS,
            alpha: 0.02,
            duration: 700,
            repeat: -1,
            ease: "Sine.easeOut",
        });

        troop._bomberArmTimer = scene.time.delayedCall(ARM_DURATION_MS, () => {
            Bomber._explode(troop);
        });
    }

    static _cancelArming(troop) {
        if (!troop) return;
        troop._bomberArming = false;
        troop._bomberArmTimer?.remove?.(false);
        troop._bomberArmTimer = null;
        troop._bomberFlashEvent?.remove?.(false);
        troop._bomberFlashEvent = null;
        if (troop._bomberPulseUpdate && troop.scene?.events) {
            troop.scene.events.off("update", troop._bomberPulseUpdate);
        }
        troop._bomberPulseUpdate = null;
        troop.scene?.tweens?.killTweensOf?.(troop._bomberPulseRing);
        troop._bomberPulseRing?.destroy?.();
        troop._bomberPulseRing = null;
        troop.clearTint?.();
    }

    static _explode(troop) {
        if (!troop?.active || troop._bomberExploded) return;
        const scene = troop.scene;
        const x = troop.x;
        const y = troop.y;

        troop._bomberExploded = true;
        Bomber._cancelArming(troop);
        Bomber._playExplosionFx(scene, x, y);
        Bomber._damagePlayers(troop, x, y);
        Bomber._damageBuildings(troop, x, y);
        Bomber._damageWalls(troop, x, y);
        Raider.destroy(troop, { selfDestruct: true });
    }

    static _playExplosionFx(scene, x, y) {
        AudioManager.playWorldSound?.("sfx_end_stage_explosions");
        if (scene?.anims?.exists?.("explosions") && scene.textures.exists("explosions")) {
            const fx = scene.add.sprite(x, y, "explosions").setDepth(999).setScale(1.15);
            fx.play("explosions");
            fx.once("animationcomplete", () => fx.destroy());
        }
        const ring = scene.add.circle(x, y, 8, 0xff5a1f, 0.20)
            .setStrokeStyle(4, 0xfff0a6, 0.85)
            .setDepth(998);
        scene.tweens.add({
            targets: ring,
            radius: BLAST_RADIUS,
            alpha: 0,
            duration: 280,
            ease: "Quad.easeOut",
            onComplete: () => ring.destroy(),
        });
    }

    static _damagePlayers(troop, x, y) {
        const targets = [...(Player.troops || [])];
        for (const target of targets) {
            if (!target?.active || target === troop || target.body?.team === troop.body?.team) continue;
            const dist = Phaser.Math.Distance.Between(x, y, target.x, target.y);
            if (dist > BLAST_RADIUS) continue;
            const falloff = Phaser.Math.Clamp(1 - (dist / BLAST_RADIUS) * 0.45, 0.55, 1);
            const damage = Math.max(1, Math.round(PLAYER_DAMAGE * falloff));
            target.health = Math.max(0, Number(target.health ?? 0) - damage);
            Player.showMiniBarsOnHit?.(target);
            showGhostText(troop.scene, target.x, target.y - 10, `-${damage}`, troop.body.team, false, false, "#ff6b6b");
            if (target.health <= 0) Player.destroyPlayer(target);
        }
    }

    static _damageBuildings(troop, x, y) {
        const team = Teams.teamLists?.["1"];
        const buildings = Array.isArray(team?.buildings) ? [...team.buildings] : [];
        for (const [bx, by, type, building] of buildings) {
            if (!building || !buildingManager._isDestroyTargetAlive?.(building)) continue;
            const cx = (bx + (type?.lenX ?? 1) / 2) * SQUARESIZE;
            const cy = (by + (type?.lenY ?? 1) / 2) * SQUARESIZE;
            if (Phaser.Math.Distance.Between(x, y, cx, cy) > BLAST_RADIUS + SQUARESIZE) continue;
            const task = {
                x: bx,
                y: by,
                type,
                value: building,
                duration: building.health ?? building.hp ?? BUILDING_DAMAGE,
                totalDuration: building.maxHealth ?? building.maxHp ?? building.health ?? building.hp ?? BUILDING_DAMAGE,
                assigned: 0,
            };
            const result = buildingManager.applyDestroyDamage(task, BUILDING_DAMAGE);
            if (result.destroyed || task.duration <= 0) {
                buildingManager._completeDestroyBlock(troop, task);
            }
        }
    }

    static _damageWalls(troop, x, y) {
        const minX = Math.max(0, Math.floor((x - BLAST_RADIUS) / SQUARESIZE));
        const maxX = Math.min(Map.grid?.[0]?.length ?? 0, Math.ceil((x + BLAST_RADIUS) / SQUARESIZE));
        const minY = Math.max(0, Math.floor((y - BLAST_RADIUS) / SQUARESIZE));
        const maxY = Math.min(Map.grid?.length ?? 0, Math.ceil((y + BLAST_RADIUS) / SQUARESIZE));

        for (let gy = minY; gy < maxY; gy++) {
            for (let gx = minX; gx < maxX; gx++) {
                const wall = Wall.getAt(gx, gy);
                if (!wall?.active || wall.team === troop.body?.team) continue;
                const wx = gx * SQUARESIZE + SQUARESIZE / 2;
                const wy = gy * SQUARESIZE + SQUARESIZE / 2;
                if (Phaser.Math.Distance.Between(x, y, wx, wy) > BLAST_RADIUS) continue;
                const destroyed = wall.damage(WALL_DAMAGE);
                if (destroyed) {
                    const top = Array.isArray(Map.grid?.[gy]?.[gx]) ? Map.grid[gy][gx][1] : Map.grid?.[gy]?.[gx];
                    const typeName = TILE_MAP(top);
                    buildingManager._completeDestroyTile(troop, {
                        x: gx,
                        y: gy,
                        type: TILE_TYPES[typeName] || TILE_TYPES.wall,
                        duration: 0,
                        assigned: 0,
                    }, gx, gy);
                }
            }
        }
    }

    static _taskTargetWorld(task) {
        const building = task?.value?.buildingRef || task?.value || null;
        if (building?.sprite?.active) return { x: building.sprite.x, y: building.sprite.y };
        if (building?.baseSprite?.active) return { x: building.baseSprite.x, y: building.baseSprite.y };
        if (building?.collider?.active) return { x: building.collider.x, y: building.collider.y };

        if (Number.isFinite(task?.x) && Number.isFinite(task?.y)) {
            const lenX = Number(task.type?.lenX ?? 1);
            const lenY = Number(task.type?.lenY ?? 1);
            return {
                x: (task.x + lenX / 2) * SQUARESIZE,
                y: (task.y + lenY / 2) * SQUARESIZE,
            };
        }
        return null;
    }

    static _distanceToTaskTarget(troop, task) {
        if (!troop || !task) return Infinity;
        if (Number.isFinite(task?.x) && Number.isFinite(task?.y)) {
            const lenX = Number(task.type?.lenX ?? 1);
            const lenY = Number(task.type?.lenY ?? 1);
            const left = task.x * SQUARESIZE;
            const top = task.y * SQUARESIZE;
            const right = left + lenX * SQUARESIZE;
            const bottom = top + lenY * SQUARESIZE;
            const clampedX = Phaser.Math.Clamp(troop.x, left, right);
            const clampedY = Phaser.Math.Clamp(troop.y, top, bottom);
            return Phaser.Math.Distance.Between(troop.x, troop.y, clampedX, clampedY);
        }

        const target = Bomber._taskTargetWorld(task);
        return target ? Phaser.Math.Distance.Between(troop.x, troop.y, target.x, target.y) : Infinity;
    }

    static _now(troop) {
        return Number(troop?.scene?.getSimulationNow?.() ?? troop?.scene?.simNowMs ?? troop?.scene?.time?.now ?? Date.now());
    }
}
