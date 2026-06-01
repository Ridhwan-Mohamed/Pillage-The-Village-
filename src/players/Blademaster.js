// === Blademaster.js ===
import { BLOCKDEPTH, CONTROL_STATES, SQUARESIZE } from '../constants.js';
import { Player } from './Player.js';
import { Teams } from '../Teams.js';
import { weapons } from '../weapons.js';
import { NameGenerator } from './NameGenerator.js';
import { ZoomMixer } from '../UI/ZoomMixer.js';
import { VisibilitySystem } from '../UI/VisibilitySystem.js';
import { Manager } from '../Manager/Manager.js';
import { Scheduler } from '../ai/scheduler/Scheduler.js';
import { attachDirectionalSix } from './PlayerDirectionalAnimator.js';
import blademasterWalkDown from 'url:../assets/players/blademaster/blademaster_walk_down.png';
import blademasterWalkDownLeft from 'url:../assets/players/blademaster/blademaster_walk_down_left.png';
import blademasterWalkDownRight from 'url:../assets/players/blademaster/blademaster_walk_down_right.png';
import blademasterWalkUp from 'url:../assets/players/blademaster/blademaster_walk_up.png';
import blademasterWalkUpLeft from 'url:../assets/players/blademaster/blademaster_walk_up_left.png';
import blademasterWalkUpRight from 'url:../assets/players/blademaster/blademaster_walk_up_right.png';
import blademasterSlash from 'url:../assets/players/blademaster/blademaster_slash.png';
import blademasterSwimUp from 'url:../assets/players/blademaster/blademaster_swim_up.png';
import blademasterSwimDown from 'url:../assets/players/blademaster/blademaster_swim_down.png';
import blademasterSwimSidewards from 'url:../assets/players/blademaster/blademaster_swim_sidewards.png';

export class Blademaster {

    static speed = 95;
    static stamina = 0.01;

    static preload(scene) {
        scene.load.spritesheet('blademaster_walk_down', blademasterWalkDown, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('blademaster_walk_down_left', blademasterWalkDownLeft, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('blademaster_walk_down_right', blademasterWalkDownRight, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('blademaster_walk_up', blademasterWalkUp, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('blademaster_walk_up_left', blademasterWalkUpLeft, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('blademaster_walk_up_right', blademasterWalkUpRight, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('blademaster_slash', blademasterSlash, { frameWidth: 50, frameHeight: 50 });
        scene.load.spritesheet('blademaster_swim_up', blademasterSwimUp, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('blademaster_swim_down', blademasterSwimDown, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('blademaster_swim_sidewards', blademasterSwimSidewards, { frameWidth: 32, frameHeight: 32 });
    }
    
    constructor(x, y, teamNumber) {
        const sprite = Player.scene.physics.add.sprite(
            SQUARESIZE * x + SQUARESIZE / 2,
            SQUARESIZE * y + SQUARESIZE / 2,
            'blademaster_walk_down',
            1
        );


        sprite.setInteractive();
        sprite.setDepth(BLOCKDEPTH + 1);
        sprite.setSize(16, 12).setOffset(8, 20);
        sprite.setCollideWorldBounds(true);
        sprite.unitTint = 0xAA33EE;

        sprite.id = Player.count++;
        sprite.body.team = teamNumber;
        sprite.maxHealth = 95;
        sprite.health = 95;
        sprite.stamina = 100;
        sprite.maxStamina = 100;
        sprite.body.pushable = false;
        sprite.name = NameGenerator.generate();
        sprite.type = Blademaster;

        sprite.animState = 'idle';
        sprite.walk = 'walk';
        sprite.idle = 'idle';
        sprite.action = 'action';
        sprite.swim = 'swim';
        sprite.slashFxKey = 'blademaster_slash';
        attachDirectionalSix(sprite, {
            animPrefix: 'blademaster',
            defaultDirection: 'down',
            walkStateKey: 'walk',
            idleStateKey: 'idle',
            swimStateKey: 'swim',
            idleFrame: 1,
            swimIdleFrame: 1,
            frameRate: 7,
            swimFrameRate: 8,
            directions: {
                down: 'blademaster_walk_down',
                down_left: 'blademaster_walk_down_left',
                down_right: 'blademaster_walk_down_right',
                up: 'blademaster_walk_up',
                up_left: 'blademaster_walk_up_left',
                up_right: 'blademaster_walk_up_right',
            },
            swimDirections: {
                up: 'blademaster_swim_up',
                down: 'blademaster_swim_down',
                side: 'blademaster_swim_sidewards',
            }
        });

        sprite.isBlademaster = true;

        // Melee sword: bigger damage + short range
        sprite.weapon = weapons.sword;

        if (!Player.scene.anims.exists('blademaster_slash_fx')) {
            Player.createAnim('blademaster_slash_fx', 'blademaster_slash', 0, 4, 0, 14);
        }

        ZoomMixer.createPlayerMoniker(sprite);
        Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_MODE);
        Player.characters.add(sprite);
        Player.troops.push(sprite);
        Player.configureCubeInteractivity(sprite);
        Teams.addPlayer(teamNumber, sprite);
        Teams.teamLists[teamNumber].fighterList.push(sprite);
        sprite.destroySelf = () => Blademaster.destroy(sprite);

        return sprite;
    }

    static update(troop) {
        Player.updateTracking(troop);
        if (troop.task || troop.track) return;

        if (Player.tryEnterQueuedSleep?.(troop)) return;
        if (Scheduler.stepUnit(troop)) return;
        if (Player.tryReturnIdleTroopToTown?.(troop, { requireNoActiveEnemies: true })) return;
        if (!troop.task && !troop.track && troop.state == CONTROL_STATES.TRACK_MODE && !troop.roam){
            Player.roam(troop);
        }
    }

    static destroy(troop) {
        const teamNumber = troop.body.team;
        const team = Teams.teamLists[teamNumber];

        Player._destroyMiniBars(troop)

        if (team?.fighterList) {
            const index = team.fighterList.indexOf(troop);
            if (index !== -1) team.fighterList.splice(index, 1);
        }

        const plIndex = team.playerList.indexOf(troop);
        if (plIndex !== -1) team.playerList.splice(plIndex, 1);

        if (troop.timer) {
            troop.timer.remove(false);
            troop.timer = null;
        }

        if (troop.visionId != null) {
            VisibilitySystem.removeVisionBubble(troop.visionId);
            troop.visionId = null;
        }

        Player._releaseTaskAssignment?.(troop);
        if (troop.carrying) troop.carrying = null;

        Player.characters.remove(troop);

        if (troop.body) {
            troop.scene.physics.world.remove(troop.body);
            troop.body.destroy();
        }

        const ind = Player.troops.indexOf(troop);
        if (ind !== -1) Player.troops.splice(ind, 1);

        troop.destroy();
    }
}
