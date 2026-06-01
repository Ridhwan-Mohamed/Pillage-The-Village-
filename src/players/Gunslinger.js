// === Gunslinger.js ===

import { BLOCKDEPTH, CONTROL_STATES, SQUARESIZE } from '../constants.js';
import { Player } from './Player.js';
import { Teams } from '../Teams.js';
import { weapons } from '../weapons.js';
import { NameGenerator } from './NameGenerator.js';
import { ZoomMixer } from '../UI/ZoomMixer.js';
import { VisibilitySystem } from '../UI/VisibilitySystem.js';
import { Manager } from '../Manager/Manager.js';
import { Wall } from '../buildings/Wall.js';
import { Projectile } from '../Projectile.js';
import { Scheduler } from '../ai/scheduler/Scheduler.js';
import { attachDirectionalSix } from './PlayerDirectionalAnimator.js';
import gunslingerWalkDown from 'url:../assets/players/gunslinger/gunslinger_walk_down.png';
import gunslingerWalkDownLeft from 'url:../assets/players/gunslinger/gunslinger_walk_down_left.png';
import gunslingerWalkDownRight from 'url:../assets/players/gunslinger/gunslinger_walk_down_right.png';
import gunslingerWalkUp from 'url:../assets/players/gunslinger/gunslinger_walk_up.png';
import gunslingerWalkUpLeft from 'url:../assets/players/gunslinger/gunslinger_walk_up_left.png';
import gunslingerWalkUpRight from 'url:../assets/players/gunslinger/gunslinger_walk_up_right.png';
import gunslingerSwimUp from 'url:../assets/players/gunslinger/gunslinger_swim_up.png';
import gunslingerSwimDown from 'url:../assets/players/gunslinger/gunslinger_swim_down.png';
import gunslingerSwimSidewards from 'url:../assets/players/gunslinger/gunslinger_swim_sidewards.png';

export class Gunslinger {

    static speed = 70;
    static stamina = 0.01;

    static preload(scene) {
        scene.load.spritesheet('gunslinger_walk_down', gunslingerWalkDown, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('gunslinger_walk_down_left', gunslingerWalkDownLeft, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('gunslinger_walk_down_right', gunslingerWalkDownRight, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('gunslinger_walk_up', gunslingerWalkUp, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('gunslinger_walk_up_left', gunslingerWalkUpLeft, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('gunslinger_walk_up_right', gunslingerWalkUpRight, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('gunslinger_swim_up', gunslingerSwimUp, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('gunslinger_swim_down', gunslingerSwimDown, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('gunslinger_swim_sidewards', gunslingerSwimSidewards, { frameWidth: 32, frameHeight: 32 });
    }

    constructor(x, y, teamNumber) {
        const sprite = Player.scene.physics.add.sprite(
            SQUARESIZE * x + SQUARESIZE / 2,
            SQUARESIZE * y + SQUARESIZE / 2,
            'gunslinger_walk_down',
            1
        );
        
        sprite.setInteractive();
        sprite.setOrigin(0.5, 0.5);
        sprite.setDepth(BLOCKDEPTH + 1);
        sprite.setSize(16, 12).setOffset(8, 20);
        sprite.setCollideWorldBounds(true);
        sprite.unitTint = 0x9999ff;

        sprite.id = Player.count++;
        sprite.body.team = teamNumber;
        sprite.health = 75;
        sprite.maxHealth = 75;
        sprite.stamina = 100;
        sprite.maxStamina = 100;
        sprite.body.pushable = false;
        sprite.name = NameGenerator.generate();
        sprite.type = Gunslinger;

        sprite.animState = 'idle';
        sprite.walk = 'walk';
        sprite.idle = 'idle';
        sprite.action = 'gun1Idle';
        sprite.swim = 'swim';
        attachDirectionalSix(sprite, {
            animPrefix: 'gunslinger',
            defaultDirection: 'down',
            walkStateKey: 'walk',
            idleStateKey: 'idle',
            swimStateKey: 'swim',
            idleFrame: 1,
            swimIdleFrame: 1,
            frameRate: 7,
            swimFrameRate: 8,
            directions: {
                down: 'gunslinger_walk_down',
                down_left: 'gunslinger_walk_down_left',
                down_right: 'gunslinger_walk_down_right',
                up: 'gunslinger_walk_up',
                up_left: 'gunslinger_walk_up_left',
                up_right: 'gunslinger_walk_up_right',
            },
            swimDirections: {
                up: 'gunslinger_swim_up',
                down: 'gunslinger_swim_down',
                side: 'gunslinger_swim_sidewards',
            }
        });

        sprite.isGunslinger = true;

        // === Equip pistol ===
        sprite.weapon = weapons.pistol;

        // === Register with systems ===
        ZoomMixer.createPlayerMoniker(sprite);
        Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_MODE);
        Player.characters.add(sprite);
        Player.troops.push(sprite);
        Player.configureCubeInteractivity(sprite);
        Teams.addPlayer(teamNumber, sprite);
        Teams.teamLists[teamNumber].fighterList.push(sprite);
        sprite.destroySelf = () => Gunslinger.destroy(sprite);

        // --- destroy target gate: range + LOS ---
        sprite._getDestroyTarget = () => {
            const t = sprite.task;
            if (!t) return null;

            // Tile-destroy (walls/doors): use tx/ty if present
            if (sprite.state === CONTROL_STATES.DESTROY_MODE_T) {
                const tx = t.tx ?? t.x;
                const ty = t.ty ?? t.y;
                // Wall is not necessarily a physics object; we use its sprite
                const wall = Wall.getAt(tx, ty);
                return wall?.sprite ? wall.sprite : null;
            }

            // Block-destroy (buildings): task.value is usually a building instance or sprite
            const obj = t.value?.buildingRef || t.value;
            if (!obj) return null;

            // ✅ Prefer collider (center) for aiming + LOS + distance
            if (obj.collider?.active) return obj.collider;

            // else sprite if available
            if (obj.sprite?.active) return obj.sprite;

            // else raw sprite-like object
            return obj;        
        };

        sprite._canShootDestroyTarget = () => {
            const target = sprite._getDestroyTarget();
            if (!target || !target.active) return false;

            const dist = Phaser.Math.Distance.Between(sprite.x, sprite.y, target.x, target.y);
            if (dist > sprite.weapon.range) return false;

            // use projectile LOS check (it already walks Map.grid and blocks on walls etc)
            return Projectile.hasLineOfSight(sprite, target);
        };

        // --- if we can't shoot, we should be moving (repath) instead of firing ---
        sprite._ensureShootPositionOrRepath = () => {
            if (!sprite.task) return false;
            if (sprite._canShootDestroyTarget()) return true;

            // cancel any firing loop
            if (sprite.timer) {
                sprite.timer.remove(false);
                sprite.timer = null;
            }

            // repath toward task center (existing destroy approach logic still works)
            // IMPORTANT: we don't need adjacency anymore because followPath will stop early once shootable
            const teamNum = sprite.body.team;
            const { navMesh, navGrid } = Player._getNavForTroop(sprite);

            const tx = sprite.task.tx ?? sprite.task.x;
            const ty = sprite.task.ty ?? sprite.task.y;

            const troopX = Math.floor(sprite.x / SQUARESIZE);
            const troopY = Math.floor(sprite.y / SQUARESIZE);
            if (!navGrid[troopY]?.[troopX]) return false;

            const path = navMesh.findPath(
                { x: sprite.x, y: sprite.y },
                { x: tx * SQUARESIZE + SQUARESIZE / 2, y: ty * SQUARESIZE + SQUARESIZE / 2 }
            );

            if (path && path.length) {
                Player.moveTo(sprite, path);
                return false;
            }

            // if no path, just fail the gate
            return false;
        };

        return sprite;
    }

    static update(troop) {
        Player.updateTracking(troop);

        // ✅ If we are destroying, keep validating range+LOS.
        // If not shootable, cancel firing and repath.
        if ( troop.task &&
            (troop.state === CONTROL_STATES.DESTROY_MODE || troop.state === CONTROL_STATES.DESTROY_MODE_T)
            ) {
            troop._ensureShootPositionOrRepath?.();
            return; // we don't want auto-assign logic while task is active
        }

        if (troop.task || troop.track) { return; }

        if (Player.tryEnterQueuedSleep?.(troop)) return;
        if (Scheduler.stepUnit(troop)) return;
        if (Player.tryReturnIdleTroopToTown?.(troop, { requireNoActiveEnemies: true })) return;
        if(!troop.task && !troop.track && troop.state == CONTROL_STATES.TRACK_MODE && !troop.roam){
            Player.roam(troop);
        }
    }

    static destroy(troop) {
        const teamNumber = troop.body.team;
        const team = Teams.teamLists[teamNumber];

        if (team?.fighterList) {
            const index = team.fighterList.indexOf(troop);
            if (index !== -1) {
                team.fighterList.splice(index, 1);
            }
        }

        Player._destroyMiniBars(troop)

        let plIndex = team.playerList.indexOf(troop)
        if (plIndex !== -1) {
            team.playerList.splice(plIndex, 1);
        }
        const scene = troop.scene;
        if (scene?.playerTab?.onPlayerDestroyed) {
            scene.playerTab.onPlayerDestroyed(troop);
        }

        if (troop.timer) {
            troop.timer.remove(false);
            troop.timer = null;
        }

        if (troop.visionId != null) {
            VisibilitySystem.removeVisionBubble(troop.visionId);
            troop.visionId = null;
        }

        // Clear references
        Player._releaseTaskAssignment?.(troop);
        if (troop.carrying) troop.carrying = null;

        // ❗ Remove from Player.characters group
        Player.characters.remove(troop);

        // 💥 CRITICAL FIX: remove from physics world
        if (troop.body) {
            troop.scene.physics.world.remove(troop.body);
            troop.body.destroy();
        }

        const ind = Player.troops.indexOf(troop);
        if (ind !== -1) Player.troops.splice(ind, 1);

        // Now safe to destroy the sprite
        troop.destroy();
    }
}
