// === Fireman.js ===
import { BLOCKDEPTH, SQUARESIZE, CONTROL_STATES, TILE_TYPES } from '../constants.js';
import { Player } from './Player.js';
import { Teams } from '../Teams.js';
import { UI_ITEM_TYPES } from '../UI/UIConstants.js';
import { Manager } from '../Manager/Manager.js';
import { StorageManager } from '../Manager/StorageManager.js';
import { NameGenerator } from './NameGenerator.js';
import { waterSourcesQuadTree } from '../mainMenu.js';
import { ClayOven } from '../buildings/ClayOven.js';
import { buildingManager } from '../Manager/buildingManager.js';
import { ZoomMixer } from '../UI/ZoomMixer.js';
import { VisibilitySystem } from '../UI/VisibilitySystem.js';
import { AudioManager } from '../Manager/AudioManager.js';
import { Scheduler } from '../ai/scheduler/Scheduler.js';
import { OrderRunner } from '../orders/OrderRunner.js';
import { attachDirectionalSix } from './PlayerDirectionalAnimator.js';
import firemanWalkDown from 'url:../assets/players/fireman/fireman_walk_down.png';
import firemanWalkDownLeft from 'url:../assets/players/fireman/fireman_walk_down_left.png';
import firemanWalkDownRight from 'url:../assets/players/fireman/fireman_walk_down_right.png';
import firemanWalkUp from 'url:../assets/players/fireman/fireman_walk_up.png';
import firemanWalkUpLeft from 'url:../assets/players/fireman/fireman_walk_up_left.png';
import firemanWalkUpRight from 'url:../assets/players/fireman/fireman_walk_up_right.png';
import firemanSwimUp from 'url:../assets/players/fireman/fireman_swim_up.png';
import firemanSwimDown from 'url:../assets/players/fireman/fireman_swim_down.png';
import firemanSwimSidewards from 'url:../assets/players/fireman/fireman_swim_sidewards.png';

const MAX_CARRY = 1;

export class Fireman {

    static speed = 100;
    static stamina = 0.005;

    static preload(scene) {
        scene.load.spritesheet('fireman_walk_down', firemanWalkDown, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('fireman_walk_down_left', firemanWalkDownLeft, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('fireman_walk_down_right', firemanWalkDownRight, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('fireman_walk_up', firemanWalkUp, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('fireman_walk_up_left', firemanWalkUpLeft, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('fireman_walk_up_right', firemanWalkUpRight, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('fireman_swim_up', firemanSwimUp, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('fireman_swim_down', firemanSwimDown, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('fireman_swim_sidewards', firemanSwimSidewards, { frameWidth: 32, frameHeight: 32 });
    }

    constructor(x, y, teamNumber) {
        const sprite = Player.scene.physics.add.sprite(
            SQUARESIZE * x + SQUARESIZE / 2,
            SQUARESIZE * y + SQUARESIZE / 2,
            'fireman_walk_down',
            1
        );
        sprite.setInteractive();
        sprite.id = Player.count++;
        sprite.setOrigin(0.5, 0.5);
        sprite.setDepth(BLOCKDEPTH + 1);
        sprite.roam = false;
        sprite.currentPath = [];
        sprite.body.team = teamNumber;
        sprite.health = 100;
        sprite.maxHealth = 100;
        sprite.stamina = 100;
        sprite.maxStamina = 100;
        sprite.unitTint = 0xff9933;
        sprite.type = Fireman;
        sprite.body.pushable = false;
        sprite.animState = 'idle';
        sprite.walk = 'walk';
        sprite.idle = 'idle';
        sprite.action = 'action';
        sprite.swim = 'swim';
        attachDirectionalSix(sprite, {
            animPrefix: 'fireman',
            defaultDirection: 'down',
            walkStateKey: 'walk',
            idleStateKey: 'idle',
            swimStateKey: 'swim',
            idleFrame: 1,
            swimIdleFrame: 1,
            frameRate: 7,
            swimFrameRate: 8,
            directions: {
                down: 'fireman_walk_down',
                down_left: 'fireman_walk_down_left',
                down_right: 'fireman_walk_down_right',
                up: 'fireman_walk_up',
                up_left: 'fireman_walk_up_left',
                up_right: 'fireman_walk_up_right',
            },
            swimDirections: {
                up: 'fireman_swim_up',
                down: 'fireman_swim_down',
                side: 'fireman_swim_sidewards',
            }
        });
        sprite.name = NameGenerator.generate();
        sprite.skip = false; //flag for manager task allocation

        sprite.carrying = null; // [{ item, count }]
        sprite.isFireman = true;

        ZoomMixer.createPlayerMoniker(sprite);
        Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_MODE);
        Player.characters.add(sprite);
        Player.troops.push(sprite);
        Player.configureCubeInteractivity(sprite);
        Teams.addPlayer(teamNumber, sprite);

        Teams.teamLists[teamNumber].firemanList.push(sprite);
        sprite.destroySelf = () => Fireman.destroy(sprite);
        return sprite;
    }

    static update(troop) {
        // If currently fleeing, only maintain flee behaviour.
        if (troop.state === CONTROL_STATES.FLEE_MODE) {
            Player.updateTracking(troop);   // may keep fleeing or drop back to TRACK_MODE when safe
            return;
        }

        // Always check for nearby enemies first (can flip into FLEE_MODE and drop tasks).
        Player.updateTracking(troop);
        if (troop.state === CONTROL_STATES.FLEE_MODE) {
            // Just started fleeing this tick; do not do fireman/oven logic.
            return;
        }

        Fireman.syncOvenJobAssignments(troop.body?.team);

        if (OrderRunner.stepUnit(troop)) return;
        if (troop.task) return;
        if (Player.tryEnterQueuedSleep?.(troop)) return;
        if (Scheduler.stepUnit(troop)) return;
        if (Player.tryReturnIdleTroopToTown?.(troop)) return;
        
        if (!troop.task && troop.state === CONTROL_STATES.TRACK_MODE && !troop.roam) {
            Player.roam(troop);
        }
    }

    static syncOvenJobAssignments(teamNumber) {
        const team = Teams.teamLists?.[`${teamNumber}`] ?? Teams.teamLists?.[teamNumber];
        if (!team) return false;

        const players = Array.isArray(team.playerList) ? team.playerList : [];
        const countRefs = (job, kind) => {
            let count = 0;
            for (const troop of players) {
                if (!troop?.active) continue;
                const hasActiveWork = !!(
                    troop.task ||
                    troop.timer ||
                    StorageManager.isCarrying(troop) ||
                    troop.state === CONTROL_STATES.FLEE_MODE ||
                    troop.state === CONTROL_STATES.GET_WATER_MODE ||
                    troop.state === CONTROL_STATES.GET_FROM_STORAGE ||
                    troop.state === CONTROL_STATES.SEND_TO_OVEN
                );
                if (!hasActiveWork) continue;

                if (kind === "fuel") {
                    if (troop.pendingFuelJob === job) {
                        count += 1;
                        continue;
                    }
                    if (troop.deferredCarry?.pendingFuelJob === job) {
                        count += 1;
                        continue;
                    }
                    if (troop.task?.job === job && troop.task?.taskType === "ovenFuelDelivery") {
                        count += 1;
                    }
                    continue;
                }

                if (troop.pendingOvenJob === job) {
                    count += 1;
                    continue;
                }
                if (troop.deferredCarry?.pendingOvenJob === job) {
                    count += 1;
                    continue;
                }
                if (troop.task?.job === job && troop.task?.taskType === "ovenDelivery") {
                    count += 1;
                }
            }
            return count;
        };

        const syncList = (jobs, kind) => {
            if (!Array.isArray(jobs)) return false;
            let changed = false;
            for (const job of jobs) {
                if (!job || job.canceled) continue;
                const remaining = Math.max(0, Number(job.remaining || 0));
                const actualAssigned = Math.min(remaining, countRefs(job, kind));
                if (Number(job.assigned || 0) !== actualAssigned) {
                    job.assigned = actualAssigned;
                    changed = true;
                }
            }
            return changed;
        };

        const waterChanged = syncList(team.ovenJobs, "water");
        const fuelChanged = syncList(team.ovenFuelJobs, "fuel");
        return waterChanged || fuelChanged;
    }

    static _orderIdActive(team, orderId) {
        if (orderId == null) return false;
        return (team?.playerList || []).some(troop =>
            troop?.active && troop.currentOrder?.id === orderId
        );
    }

    static _jobMatchesAssignmentOptions(job, options = {}, team = null) {
        if (!job) return false;
        if (options?.oven && job.oven !== options.oven) return false;

        const orderId = options?.orderId ?? options?.order?.id ?? null;
        if (orderId != null && job.directOrderId != null && job.directOrderId !== orderId) {
            return !this._orderIdActive(team, job.directOrderId);
        }
        return true;
    }

    static _adoptJobOrder(job, options = {}) {
        const orderId = options?.orderId ?? options?.order?.id ?? null;
        if (orderId != null && job && job.directOrderId !== orderId) {
            job.directOrderId = orderId;
        }
    }

    static assignFromOvenJobs(troop, options = {}) {
        const team = Teams.teamLists[troop.body.team];
        if (!team) return false;
        Fireman.syncOvenJobAssignments(troop.body.team);

        // find a job with remaining work, but do not assign input deliveries
        // while the oven output is waiting to be cleared.
        const job = team.ovenJobs.find(j => {
            const inputidx = Number.isFinite(Number(j?.inputidx)) ? Number(j.inputidx) : 0;
            return (
                !j.canceled &&
                j.remaining > j.assigned &&
                j.oven?.sprite?.active &&
                Fireman._jobMatchesAssignmentOptions(j, options, team) &&
                ClayOven.isSlotOpenForInput(j.oven, inputidx)
            );
        });
        if (!job) return false;
        Fireman._adoptJobOrder(job, options);

        // if the job is water: go to lake (we'll deliver to the exact oven/slot later)
        if (job.item.name === UI_ITEM_TYPES.unclean_water.name) {
            const nearest = waterSourcesQuadTree.nearest(Math.floor(troop.x/SQUARESIZE), Math.floor(troop.y/SQUARESIZE));
            if (nearest) {
                troop.pendingOvenJob = job;             // remember which job this trip is for
                troop.skip = true;
                troop.task = true;
                Teams.movePlayerState(troop, CONTROL_STATES.GET_WATER_MODE);
                const canTravel = Player.moveTo(troop, Player.pathTo(troop, nearest.x, nearest.y));
                if(canTravel){
                    troop.pendingOvenJob.assigned += 1;
                    return true;
                }
                console.error("Failed to path to nearest water, WATER PATH ISSUE")
                troop.task = null;
                troop.pendingOvenJob = null;
                troop.skip = false;
                return false;
            }
            return false; // no lake found -> wait
        }

        // otherwise: try to pick from storage for THIS job’s item
        troop.pendingOvenJob = job;
        const jobPossible = StorageManager.tryCreateStoragePickupTask(troop, job.item);
        if (!jobPossible) {
            troop.pendingOvenJob = null;
            return false;
        }
        // we’ve now committed one worker to this job
        job.assigned += 1;
        return true;
    }

    static assignFromOvenFuelJobs(troop, options = {}) {
        const team = Teams.teamLists[troop.body.team];
        if (!team) return false;
        Fireman.syncOvenJobAssignments(troop.body.team);

        // find lowest-fuel oven job
        const job = team.ovenFuelJobs.find(j =>
            !j.canceled &&
            j.remaining > j.assigned &&
            j.oven?.sprite?.active &&
            Fireman._jobMatchesAssignmentOptions(j, options, team)
        );
        if (!job) return false;
        Fireman._adoptJobOrder(job, options);

        troop.pendingFuelJob = job;
        const jobPossible = StorageManager.tryCreateStoragePickupTask(troop, UI_ITEM_TYPES.wood);
        if(!jobPossible){
            troop.pendingFuelJob = null;
            return false;
        }
        troop.pendingFuelJob.assigned += 1;
        return true;
    }

    static maybeAssignOvenFuelDelivery(troop, job, item) {
        const team = Teams.teamLists[troop.body.team];
        if (!team || !job || job.canceled) return false;

        const list = team.ovenFuelDeliveryItems;
        let task = list.find(t => t.oven === job.oven && t.item.name === "wood");

        if (task) {
            if (task.assigned >= job.remaining) return false;
        } else {
            task = {
                type: TILE_TYPES.clayOven,
                x: job.oven.x, y: job.oven.y,
                oven: job.oven,
                item: item || UI_ITEM_TYPES.wood,
                count: 1,
                assigned: 0,
                remaining: job.remaining,
                taskType: 'ovenFuelDelivery',
                job
            };
            list.push(task);
        }

        return Manager.assignOneTroopToAction(troop, list, CONTROL_STATES.SEND_TO_OVEN);
    }

    static deliverFuelToOven(troop) {
        const job = troop.pendingFuelJob;
        if (!job || !job.oven || job.canceled || !job.oven?.sprite?.active) {
            troop.pendingFuelJob = null;
            troop.task = null;
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
            return false;
        }

        const oven = job.oven;
        const amount = troop.carrying?.count || 1;

        if (oven.addFuel(amount)) {
            job.remaining = Math.max(0, Number(job.remaining || 0) - amount);
            job.assigned = Math.max(0, Number(job.assigned || 0) - 1);
            if (job.remaining <= 0) Teams.removeFromStateArray(troop.body.team, 'ovenFuelJobs', job);
        }else{
            console.error("Failed to add fuel to oven")
            job.assigned = Math.max(0, Number(job.assigned || 0) - 1);
        }

        StorageManager.removeCarriedItem(troop);
        troop.pendingFuelJob = null;
        troop.skip = false;
        troop.task = null;
        Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
        return true;
    }

    static goRefuelOven(troop, job) {
        if (!job?.oven || job.canceled || !job.oven?.sprite?.active) {
            if (job?.assigned > 0) job.assigned -= 1;
            if (troop.pendingFuelJob === job) troop.pendingFuelJob = null;
            troop.task = null;
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
            console.error("Failed to refuel oven after wood pickup, OVEN GONE ISSUE")
            return false; // fine for now, scheduler/storage recovery will take over
        }
        // Prepare to move back to oven
        troop.roam = false;
        Teams.movePlayerState(troop, CONTROL_STATES.SEND_TO_OVEN);
        troop.task = { oven: job.oven, taskType: 'ovenFuelDelivery' };

        // compute path to oven
        const approachTile = buildingManager.findBuildApproachBlock(
            job.oven.x, job.oven.y, TILE_TYPES.clayOven, troop
        );

        if (approachTile) {
            Player.moveTo(troop, approachTile.path);
            return true;
        }
        else{
            console.error("Failed to refuel oven after wood pickup, PATH ISSUE")
        }
        if (job.assigned > 0) job.assigned -= 1;
        if (troop.pendingFuelJob === job) troop.pendingFuelJob = null;
        troop.task = null;
        Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
        return false;
    }


    static maybeAssignOvenDeliveryTask(troop, item, count = 1) {
        const freeSlotInfo = ClayOven.findFreeCookingSlot(UI_ITEM_TYPES.unclean_water, troop.body.team)
        if (!freeSlotInfo) return false;

        const { oven, idx, remaining } = freeSlotInfo;
        if (remaining <= 0) return false;

        const deliveryList = Teams.teamLists[troop.body.team].ovenDeliveryItems;
        const existingTask = deliveryList?.find(task =>
            task.oven === oven &&
            task.item.name === item.name &&
            task.inputidx === idx
        );

        if (existingTask) {
            if (existingTask.assigned >= existingTask.remaining) return false;
            if(troop.skip) {existingTask.assigned++; troop.task = existingTask;};
        } else {
            const newTask = {
                type: TILE_TYPES.clayOven,
                x: oven.x,
                y: oven.y,
                oven,
                item,
                count,
                inputidx: idx,
                assigned: 0,
                remaining,
                taskType: 'ovenDelivery'
            };
            if(troop.skip) {newTask.assigned++; troop.task = newTask;}
            deliveryList.push(newTask);
        }
        if(!troop.skip) Manager.assignOneTroopToAction(troop, deliveryList, CONTROL_STATES.SEND_TO_OVEN);
        return true;
    }

    static maybeAssignOvenJobDelivery(troop, job, item) {
        if (!job || job.canceled || !job.oven?.sprite?.active) {
            if (troop.pendingOvenJob === job) troop.pendingOvenJob = null;
            return false;
        }

        const inputidx = Number.isFinite(Number(job.inputidx)) ? Number(job.inputidx) : 0;
        if (!ClayOven.isSlotOpenForInput(job.oven, inputidx)) {
            return false;
        }

        // Create a one-shot delivery task bound to this job
        const task = {
            type: TILE_TYPES.clayOven,
            x: job.oven.x,
            y: job.oven.y,
            oven: job.oven,
            item: item || job.item,
            count: 1,
            inputidx,
            assigned: 0,
            remaining: job.remaining,
            taskType: 'ovenDelivery',
            job,   // used by deliverToOven for bookkeeping
        };

        // Directly assign this single task to the troop
        return Manager.assignTaskToTroop(
            troop,
            task,
            CONTROL_STATES.SEND_TO_OVEN
        );
    }

    static deliverToOven(troop) {
        const task = troop.task;
        if (!task || !task.oven) {
            troop.pendingOvenJob = null;
            troop.task = null;
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
            return;
        }

        const job = task.job || troop.pendingOvenJob;
        if (job?.canceled || !task.oven?.sprite?.active) {
            if (job && job.assigned > 0) job.assigned -= 1;
            troop.pendingOvenJob = null;
            troop.task = null;
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
            return;
        }

        const oven = task.oven;

        // Prefer the explicit input index from the job / task
        const slotIndex =
            typeof task.inputidx === 'number'
                ? task.inputidx
                : (task.job && typeof task.job.inputidx === 'number'
                    ? task.job.inputidx
                    : null);

        let success;

        if (slotIndex !== null && !ClayOven.isSlotOpenForInput(oven, slotIndex)) {
            success = false;
        } else if (slotIndex !== null) {
            // Try to place exactly into the requested slot
            success = oven.addItemToCookAtSlot(task.item, task.count, slotIndex);

            // Optional: if the slot was invalid/full or changed type, fall back
            if (!success) {
                console.warn(
                    'deliverToOven: failed to add to requested slot',
                    slotIndex,
                    'for item',
                    task.item?.name,
                    '– falling back to first available slot.'
                );
                success = oven.addItemToCook(task.item, task.count);
            }
        } else {
            // Legacy path: no slot specified, use first-available behavior
            success = oven.addItemToCook(task.item, task.count);
        }

        if (success) {
            // job bookkeeping
            if (job) {
                job.assigned = Math.max(0, job.assigned - 1);
                job.delivered += 1;
                job.remaining = Math.max(0, job.target - job.delivered);
                if (job.remaining <= 0 || job.canceled) {
                    const jobs = Teams.teamLists[troop.body.team].ovenJobs;
                    const i = jobs.indexOf(job);
                    if (i !== -1) jobs.splice(i, 1);
                }
            }

            StorageManager.removeCarriedItem(troop);
        } else {
            if (job) {
                job.assigned = Math.max(0, Number(job.assigned || 0) - 1);
            }
            Player.showStatusEmote?.(troop, "OVEN FULL", {
                key: "oven_full",
                cooldownMs: 3200,
                fontSize: 12,
            });
        }

        troop.pendingOvenJob = null;
        troop.skip = false;
        troop.task = null;
        Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
    }

    static handleOvenPickupComplete(troop) {
        const task = troop.task;
        if (!task || task.taskType !== 'ovenPickup') {
            troop.task = null;
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
            return;
        }

        const oven = task.oven;
        const slotIdx = task.outputidx;

        if (!oven || typeof oven.removeItemFromSlot !== 'function' || !oven.sprite?.active) {
            Teams.removeFromStateArray(troop.body.team, 'ovenPickupJobs', task);
            troop.task = null;
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
            return;
        }

        const item = oven.removeItemFromSlot(slotIdx, true); // fromOutput = true
        if (!item) {
            troop.task = null;
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
            return;
        }

        const directOrderId = task.directOrderId
            ?? (OrderRunner._isManagedFunctionWaterOrder?.(troop.currentOrder)
                ? troop.currentOrder.id
                : null);

        StorageManager.addCarriedItem(troop, item, {
            directOrderId,
        });

        // Update task state
        task.amount -= 1;
        task.assigned -= 1;

        if (task.amount <= 0) {
            Teams.removeFromStateArray(troop.body.team, 'ovenPickupJobs', task);
        }

        const assigned = StorageManager.tryCreateStorageDeliveryTask(troop);
        if (!assigned) {
            troop.task = null;
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
        }
    }

    static firemanCompleteWaterPickup(troop){
        const job = troop.pendingOvenJob;
        StorageManager.addCarriedItem(troop, UI_ITEM_TYPES.unclean_water)
        AudioManager.playWaterPickup();
        const canTravel = Fireman.maybeAssignOvenJobDelivery(troop, job, UI_ITEM_TYPES.unclean_water);
        if(!canTravel){
            if (job?.oven && ClayOven.isSlotOpenForInput(job.oven, Number.isFinite(Number(job.inputidx)) ? Number(job.inputidx) : 0)) {
                console.error("Failed to path back to oven after water pickup, WATER TO OVEN ERROR")
            }
            if (job?.assigned > 0) job.assigned -= 1;
            troop.task = null;
            troop.pendingOvenJob = null;
            if (StorageManager.tryCreateStorageDeliveryTask(troop)) return true;
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
            return false;
        }
        return true;
    }

    static destroy(troop) {
        const teamNumber = troop.body.team;
        const team = Teams.teamLists[teamNumber];
        if (!team?.firemanList) return;

        OrderRunner.handleTroopDestroyed(troop);

        Player._destroyMiniBars(troop)

        const index = team.firemanList.indexOf(troop);
        if (index !== -1) {
            team.firemanList.splice(index, 1);
        }

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
        Player._releaseTaskAssignment(troop);
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
