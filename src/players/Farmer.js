// Farmer.js
import { BLOCKDEPTH, SQUARESIZE, CONTROL_STATES, TILE_TYPES } from '../constants.js';
import { Manager } from '../Manager/Manager.js';
import { Player } from './Player.js';
import { Teams } from '../Teams.js';
import { StorageManager } from '../Manager/StorageManager.js';
import { NameGenerator } from './NameGenerator.js';
import { waterSourcesQuadTree } from '../mainMenu.js';
import { ZoomMixer } from '../UI/ZoomMixer.js';
import { VisibilitySystem } from '../UI/VisibilitySystem.js';
import { UI_ITEM_TYPES } from '../UI/UIConstants.js';
import { AudioManager } from '../Manager/AudioManager.js';
import { Scheduler } from '../ai/scheduler/Scheduler.js';
import { attachDirectionalSix } from './PlayerDirectionalAnimator.js';
import farmerWalkDown from 'url:../assets/players/farmer/farmer_walk_down.png';
import farmerWalkDownLeft from 'url:../assets/players/farmer/farmer_walk_down_left.png';
import farmerWalkDownRight from 'url:../assets/players/farmer/farmer_walk_down_right.png';
import farmerWalkUp from 'url:../assets/players/farmer/farmer_walk_up.png';
import farmerWalkUpLeft from 'url:../assets/players/farmer/farmer_walk_up_left.png';
import farmerWalkUpRight from 'url:../assets/players/farmer/farmer_walk_up_right.png';
import farmerPlant from 'url:../assets/players/farmer/farmer_plant.png';
import farmerSwimUp from 'url:../assets/players/farmer/farmer_swim_up.png';
import farmerSwimDown from 'url:../assets/players/farmer/farmer_swim_down.png';
import farmerSwimSidewards from 'url:../assets/players/farmer/farmer_swim_sidewards.png';

export class Farmer {

    static speed = 85;
    static stamina = 0.005;
    static maxWaterPailCarry = 2;
    static WATER_ASSIGN_FAILURE_COOLDOWN_MS = 2200;
    static WATER_SOURCE_CANDIDATE_LIMIT = 12;

    static preload(scene) {
        scene.load.image('farmer_plant', farmerPlant);
        scene.load.spritesheet('farmer_walk_down', farmerWalkDown, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('farmer_walk_down_left', farmerWalkDownLeft, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('farmer_walk_down_right', farmerWalkDownRight, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('farmer_walk_up', farmerWalkUp, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('farmer_walk_up_left', farmerWalkUpLeft, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('farmer_walk_up_right', farmerWalkUpRight, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('farmer_swim_up', farmerSwimUp, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('farmer_swim_down', farmerSwimDown, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('farmer_swim_sidewards', farmerSwimSidewards, { frameWidth: 32, frameHeight: 32 });
    }

    constructor(x, y, teamNumber) {
        const farmer = Player.scene.physics.add.sprite(
            SQUARESIZE *x + SQUARESIZE/2,
            SQUARESIZE*y + SQUARESIZE/2,
            'farmer_walk_down',
            1
        );
        farmer.setInteractive();
        farmer.id = this.count;
        Player.count += 1;
        farmer.setOrigin(0.5,0.5);
        farmer.setDepth(BLOCKDEPTH+1);
        farmer.roam = false;
        farmer.currentPath = [];
        farmer.body.team = teamNumber;
        farmer.health = 60;
        farmer.maxHealth = 60;
        farmer.stamina = 100;
        farmer.maxStamina = 100;
        farmer.type = Farmer;
        farmer.unitTint = 0x8B5A2B;
        farmer.body.pushable = false;
        farmer.name = NameGenerator.generate();
        farmer.animState = 'idle';
        farmer.walk = 'walk';
        farmer.idle = 'idle';
        farmer.action = 'action';
        farmer.plantPose = 'farmer_plant';
        farmer.swim = 'swim';
        farmer.carrying = null;
        farmer.waterBucket = {count: 0};
        farmer.oldState = null;
        farmer.pendingFarmSpot = null;
        farmer.pendingStorageDeliveryReservation = null;
        attachDirectionalSix(farmer, {
            animPrefix: 'farmer',
            defaultDirection: 'down',
            walkStateKey: 'walk',
            idleStateKey: 'idle',
            swimStateKey: 'swim',
            idleFrame: 1,
            swimIdleFrame: 1,
            frameRate: 7,
            swimFrameRate: 8,
            directions: {
                down: 'farmer_walk_down',
                down_left: 'farmer_walk_down_left',
                down_right: 'farmer_walk_down_right',
                up: 'farmer_walk_up',
                up_left: 'farmer_walk_up_left',
                up_right: 'farmer_walk_up_right',
            },
            swimDirections: {
                up: 'farmer_swim_up',
                down: 'farmer_swim_down',
                side: 'farmer_swim_sidewards',
            }
        });
        ZoomMixer.createPlayerMoniker(farmer);
        Teams.movePlayerState(farmer, CONTROL_STATES.TRACK_MODE);
        Player.characters.add(farmer);
        Player.troops.push(farmer);
        Player.configureCubeInteractivity(farmer);
        Teams.addPlayer(teamNumber, farmer);
        farmer.isFarmer = true;
        Teams.teamLists[teamNumber].farmerList.push(farmer);
        farmer.destroySelf = () => Farmer.destroy(farmer);
        return farmer;
    }
 
    static update(troop){
        // If currently fleeing, only maintain flee behaviour
        if (troop.state === CONTROL_STATES.FLEE_MODE) {
            Player.updateTracking(troop);   // can drop back to TRACK_MODE when safe
            return;
        }

        // Always check for nearby enemies first – may flip into FLEE_MODE
        Player.updateTracking(troop);
        if (troop.state === CONTROL_STATES.FLEE_MODE) {
            return; // we just started fleeing, don't do farm logic this tick
        }

        // 1. If manually assigned via tilling or harvesting
        if (troop.task) return;
        if (Player.tryEnterQueuedSleep?.(troop)) return;
        if (Scheduler.stepUnit(troop)) return;
        if (Player.tryReturnIdleTroopToTown?.(troop)) return;

        if(!troop.task && troop.state == CONTROL_STATES.TRACK_MODE && !troop.roam){
            Player.roam(troop);
        }
    }

    static tryAssignSeedFlow(troop, preferredSpot = null) {
        const teamData = Teams.teamLists[troop.body.team];
        if (!teamData) return false;

        const carrying = troop.carrying;
        const seedItemType = UI_ITEM_TYPES.seedCrop;
        const carryingSeeds = carrying && carrying === seedItemType;

        const reserveAndFetch = (spot) => {
            if (!spot) return false;
            spot.reservedBy = troop;
            troop.pendingFarmSpot = spot;

            if (carryingSeeds) {
                if (spot.reservedBy === troop) delete spot.reservedBy;
                troop.pendingFarmSpot = null;
                return Manager.assignTaskToTroop(troop, spot, CONTROL_STATES.FARM_MODE);
            }

            const gotPickup = StorageManager.tryCreateStoragePickupTask(troop, seedItemType);
            if (gotPickup) return true;

            if (spot.reservedBy === troop) delete spot.reservedBy;
            troop.pendingFarmSpot = null;
            return false;
        };

        if (troop.pendingFarmSpot) {
            const plot = troop.pendingFarmSpot;
            if (carryingSeeds) {
                if (plot.reservedBy === troop) delete plot.reservedBy;
                troop.pendingFarmSpot = null;
                return Manager.assignTaskToTroop(troop, plot, CONTROL_STATES.FARM_MODE);
            }
            if (StorageManager.tryCreateStoragePickupTask(troop, seedItemType)) return true;
            if (plot.reservedBy === troop) delete plot.reservedBy;
            troop.pendingFarmSpot = null;
            return false;
        }

        const tillSpots = teamData.tileList || [];
        if (preferredSpot && !preferredSpot.reservedBy && !Manager.tooManyAssigned(preferredSpot, 1)) {
            return reserveAndFetch(preferredSpot);
        }
        const spot = tillSpots.find((s) => !s.reservedBy && !Manager.tooManyAssigned(s, 1));
        return reserveAndFetch(spot);
    }

    static tryAssignWaterWork(troop, preferredCrop = null) {
        if (!Number(troop.waterBucket?.count || 0)) {
            return this.assignWaterTask(troop);
        }
        if (preferredCrop) {
            return this._assignWaterCropTasks(troop, [preferredCrop]);
        }
        const cropNeedingWater = Teams.getCropsNeedingWater(troop.body.team);
        if (!cropNeedingWater.length) return false;
        return this._assignWaterCropTasks(troop, cropNeedingWater);
    }

    static _nowMs(troop) {
        return Number(troop?.scene?.getSimulationNow?.() ?? troop?.scene?.simNowMs ?? troop?.scene?.time?.now ?? Date.now());
    }

    static _failureKey(kind, target) {
        return `${kind}:${Number(target?.x)},${Number(target?.y)}`;
    }

    static _failureMap(troop) {
        if (!troop._farmerWaterFailureUntil) troop._farmerWaterFailureUntil = new Map();
        return troop._farmerWaterFailureUntil;
    }

    static _isFailureCoolingDown(troop, kind, target) {
        if (!target) return false;
        const until = Number(this._failureMap(troop).get(this._failureKey(kind, target)) || 0);
        return until > this._nowMs(troop);
    }

    static _markFailureCooldown(troop, kind, target) {
        if (!target) return;
        this._failureMap(troop).set(
            this._failureKey(kind, target),
            this._nowMs(troop) + this.WATER_ASSIGN_FAILURE_COOLDOWN_MS
        );
    }

    static _waterSourceCandidates(troop) {
        const tx = Math.floor(troop.x / SQUARESIZE);
        const ty = Math.floor(troop.y / SQUARESIZE);
        const points = waterSourcesQuadTree?.getPoints?.();
        const candidates = Array.isArray(points) && points.length
            ? points
            : [waterSourcesQuadTree?.nearest?.(tx, ty)].filter(Boolean);

        const seen = new Set();
        return candidates
            .filter((point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)))
            .map((point) => ({ x: Number(point.x), y: Number(point.y) }))
            .filter((point) => {
                const key = `${point.x},${point.y}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .sort((a, b) => {
                const adx = a.x - tx;
                const ady = a.y - ty;
                const bdx = b.x - tx;
                const bdy = b.y - ty;
                return (adx * adx + ady * ady) - (bdx * bdx + bdy * bdy);
            })
            .slice(0, this.WATER_SOURCE_CANDIDATE_LIMIT);
    }

    static _assignWaterCropTasks(troop, taskList) {
        const state = CONTROL_STATES.WATER_CROPS_MODE;
        const failures = [];
        const tasks = (Array.isArray(taskList) ? taskList : [])
            .filter((task) => task && !task.canceled)
            .filter((task) => !this._isFailureCoolingDown(troop, "crop", task));

        for (const task of tasks) {
            if (Manager.tooManyAssigned(task, state)) continue;

            const path = Player.pathTo(troop, task.x, task.y, true);
            if (!path?.length) {
                failures.push(task);
                continue;
            }

            Teams.movePlayerState(troop, state);
            troop.roam = false;
            task.assigned = Math.max(0, Number(task.assigned || 0)) + 1;
            troop.task = task;
            Manager._setTaskMeta?.(troop, task, state, "wateringList");

            if (Player.moveTo(troop, path)) return true;
            failures.push(task);
        }

        for (const task of failures) this._markFailureCooldown(troop, "crop", task);
        return false;
    }

    static assignWaterTask(troop) {
        const candidates = this._waterSourceCandidates(troop)
            .filter((source) => !this._isFailureCoolingDown(troop, "source", source));
        if (!candidates.length) return false;

        for (const source of candidates) {
            const path = Player.pathTo(troop, source.x, source.y, true);
            if (!path?.length) {
                this._markFailureCooldown(troop, "source", source);
                continue;
            }

            const task = { type: 'getWater', x: source.x, y: source.y };
            troop.task = task;
            troop.roam = false;
            Teams.movePlayerState(troop, CONTROL_STATES.GET_WATER_MODE);
            Manager._setTaskMeta?.(troop, task, CONTROL_STATES.GET_WATER_MODE, null);

            if (Player.moveTo(troop, path)) return true;
            this._markFailureCooldown(troop, "source", source);
        }

        if (troop.task?.type === "getWater") troop.task = null;
        Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
        return false;
    }

    static addCarryToFarmer(troop, item, count = 1) {

        // If not carrying anything, create new carry object
        if (!troop.carrying) {
            troop.carrying = { item, count };
            return true;
        }

        // Already carrying something
        if (troop.carrying.item !== item) {
            return false; // can't carry multiple types
        }

        const newTotal = troop.carrying.count + count;
        troop.carrying.count = newTotal;
        // optional: update visual label or sprite (if needed)
        return true;
    }


    static handleStorageDropoff(troop) {
        const task = troop.task;
        if (!task || task.type !== 'storeCrop' || !task.storage) return;

        const storage = task.storage;
        storage.addItem(troop.carrying.item, troop.carrying.count);

        // Cleanup
        troop.carrying = null;
        troop.task = null;
        Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
    }
    
    static giveTroopWater(sprite){
        sprite.waterBucket = { count: this.maxWaterPailCarry };
        sprite.task = null;
        AudioManager.playWaterPickup();
        Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_MODE);
    }

    static destroy(farmer) {
        const teamList = Teams.teamLists[farmer.body.team];

        Player._destroyMiniBars(farmer)
        
        // Remove from farmerList
        const index = teamList.farmerList.indexOf(farmer);
        if (index !== -1) teamList.farmerList.splice(index, 1);

        let plIndex = teamList.playerList.indexOf(farmer)
        if (plIndex !== -1) {
            teamList.playerList.splice(plIndex, 1);
        }
        const scene = farmer.scene;
        if (scene?.playerTab?.onPlayerDestroyed) {
            scene.playerTab.onPlayerDestroyed(farmer);
        }

        // Clear references
        Player._releaseTaskAssignment(farmer);
        StorageManager.releaseDeliveryReservation(farmer);
        if (farmer.carrying) farmer.carrying = null;

        if (farmer.visionId != null) {
            VisibilitySystem.removeVisionBubble(farmer.visionId);
            farmer.visionId = null;
        }

        if (farmer.timer) {
            farmer.timer.remove(false);
            farmer.timer = null;
        }

        // ❗ Remove from Player.characters group
        Player.characters.remove(farmer);

        // 💥 CRITICAL FIX: remove from physics world
        if (farmer.body) {
            farmer.scene.physics.world.remove(farmer.body);
            farmer.body.destroy();
        }

        const ind = Player.troops.indexOf(farmer);
        if (ind !== -1) Player.troops.splice(ind, 1);

        // Now safe to destroy the sprite
        farmer.destroy();
    }
}
