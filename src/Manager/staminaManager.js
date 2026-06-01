import { CONTROL_STATES, TILE_TYPES } from "../constants";
import { Teams } from "../Teams";
import { Player } from "../players/Player";
import { buildingManager } from "./buildingManager";
import { InterruptController } from "../ai/scheduler/InterruptController";
import { AudioManager } from "./AudioManager";

export class StaminaManager {
    static scene;
    static staminaIncreaseAmnt = 0.01

    static updateTroop(troop) {
        // If stamina is empty → go home
        if (troop.stamina <= 0 && troop.state == CONTROL_STATES.TRACK_MODE && troop.state !== CONTROL_STATES.GO_HOME_MODE) {
            this.sendTroopHome(troop);
        }
        // If sleeping → regen stamina
        if (troop.state === CONTROL_STATES.SLEEP_MODE) {
            troop.stamina = Math.min(troop.maxStamina, troop.stamina + this.staminaIncreaseAmnt); // regen rate
            if (troop.stamina >= troop.maxStamina) {
                this.wakeUp(troop);
            }
        }
    }

    static sendTroopHome(troop) {
        if (!troop?.home) return false;
        if (troop.state === CONTROL_STATES.SLEEP_MODE || troop.state === CONTROL_STATES.GO_HOME_MODE) {
            return true;
        }

        Player.showStatusEmote?.(troop, "\u{1F634}", {
            key: "going_to_sleep",
            cooldownMs: 2600,
        });

        InterruptController.interruptTroop(troop, "sleep_request", CONTROL_STATES.TRACK_MODE);
        Player.clearPoseLock(troop, troop.idle);

        const { x, y } = troop.home;
        const homeType = troop.home.tileType ?? TILE_TYPES.house1;
        const approach = buildingManager.findInteractionApproachBlock(x, y, homeType, troop);
        if (!approach) return false;
        troop.task = true;
        troop.roam = false;
        const path = approach.path;
        if (path) {
            Player.moveTo(troop, path);
            Teams.movePlayerState(troop, CONTROL_STATES.GO_HOME_MODE);
            return true;
        }
        return false;
    }

    static arriveAtHome(troop) {
        const wasSleeping = troop?.state === CONTROL_STATES.SLEEP_MODE;
        Player.prepareTroopForSleep(troop);
        troop.setVisible(false);
        troop.body.setEnable(false);
        Teams.movePlayerState(troop, CONTROL_STATES.SLEEP_MODE);
        Player._dropTargetingAgainstUnit?.(troop);

        if (troop.home) {
            const house = troop.home;
            const anchor = house.getSleepAnchorForOccupant?.(troop);

            if (troop.icon && anchor) {
                troop.icon.setPosition(anchor.x, anchor.y);
                troop.icon.followingHouse = true;
            }

            house.startSleepingVisual?.(troop);
        }

        if (!wasSleeping) {
            AudioManager.playWorldSound("sfx_door_close", { volume: 0.24 });
        }
    }


    static wakeUp(troop) {
        const wasSleeping = troop?.state === CONTROL_STATES.SLEEP_MODE;
        troop.home?.stopSleepingVisual?.(troop);
        troop.task = null;
        troop.setVisible(true);
        troop.body.setEnable(true);
        Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);

        if (troop.icon) {
            troop.icon.followingHouse = false;
        }

        if (wasSleeping) {
            AudioManager.playWorldSound("sfx_door_open", { volume: 0.24 });
        }
    }

}
