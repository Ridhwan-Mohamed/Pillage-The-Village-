import { Player } from "./Player";
import { weapons } from "../weapons";
import { ZoomMixer } from "../UI/ZoomMixer";
import { attachDirectionalSix } from "./PlayerDirectionalAnimator";
import { Raider } from "./Raider";
import hunterWalkDown from 'url:../assets/Players/hunters/hunter_walk_down.png';
import hunterWalkDownLeft from 'url:../assets/Players/hunters/hunter_walk_down_left.png';
import hunterWalkDownRight from 'url:../assets/Players/hunters/hunter_walk_down_right.png';
import hunterWalkUp from 'url:../assets/Players/hunters/hunter_walk_up.png';
import hunterWalkUpLeft from 'url:../assets/Players/hunters/hunter_walk_up_left.png';
import hunterWalkUpRight from 'url:../assets/Players/hunters/hunter_walk_up_right.png';
import hunterSwimUp from 'url:../assets/Players/hunters/hunter_swim_up.png';
import hunterSwimDown from 'url:../assets/Players/hunters/hunter_swim_down.png';
import hunterSwimRight from 'url:../assets/Players/hunters/hunter_swim_right.png';

export class Hunter {
    static speed = 70;
    static stamina = 0;
    static awareness = 180;
    static tint = 0xff8a3d;

    static preload(scene) {
        scene.load.spritesheet('hunter_walk_down', hunterWalkDown, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('hunter_walk_down_left', hunterWalkDownLeft, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('hunter_walk_down_right', hunterWalkDownRight, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('hunter_walk_up', hunterWalkUp, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('hunter_walk_up_left', hunterWalkUpLeft, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('hunter_walk_up_right', hunterWalkUpRight, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('hunter_swim_up', hunterSwimUp, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('hunter_swim_down', hunterSwimDown, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('hunter_swim_sidewards', hunterSwimRight, { frameWidth: 32, frameHeight: 32 });
    }

    constructor(x, y, teamNumber = 0) {
        const hunter = Player.addPlayer(
            x,
            y,
            teamNumber,
            "hunter_walk_down",
            "walk",
            "idle",
            "action",
            weapons.hunterRifle
        );

        hunter.name = "Hunter";
        hunter.unitTint = Hunter.tint;
        hunter.type = Hunter;
        hunter.isRaider = true;
        hunter.isHunter = true;
        hunter.isSeaRaider = false;
        hunter.roam = false;
        hunter.maxHealth = 75;
        hunter.health = hunter.maxHealth;
        hunter.killReward = 26;
        hunter.maxStamina = hunter.maxStamina ?? 100;
        hunter.stamina = hunter.stamina ?? hunter.maxStamina;
        hunter.weapon = { ...weapons.hunterRifle };
        hunter.destroySelf = (opts = {}) => Raider.destroy(hunter, opts);

        attachDirectionalSix(hunter, {
            animPrefix: 'hunter',
            defaultDirection: 'down',
            walkStateKey: 'walk',
            idleStateKey: 'idle',
            swimStateKey: 'swim',
            idleFrame: 1,
            swimIdleFrame: 1,
            frameRate: 7,
            swimFrameRate: 8,
            directions: {
                down: 'hunter_walk_down',
                down_left: 'hunter_walk_down_left',
                down_right: 'hunter_walk_down_right',
                up: 'hunter_walk_up',
                up_left: 'hunter_walk_up_left',
                up_right: 'hunter_walk_up_right',
            },
            swimDirections: {
                up: 'hunter_swim_up',
                down: 'hunter_swim_down',
                side: 'hunter_swim_sidewards',
            }
        });

        ZoomMixer.createPlayerMoniker(hunter);
        return hunter;
    }

    static update(troop) {
        if (Raider._handleEnemyWaterRecovery(troop)) return true;
        return Raider.update(troop);
    }

    static _dropPlayerChase(troop) {
        return Raider._dropPlayerChase(troop);
    }
}
