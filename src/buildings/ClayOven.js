// === ClayOven.js ===

import { BLOCKDEPTH, CONTROL_STATES, SQUARESIZE, TILE_TYPES, showGhostText, GHOST_ITEM_ICONS } from "../constants";
import { Map } from "../map";
import { Teams } from "../Teams";
import { buildingManager } from "../Manager/buildingManager";
import { ClayOvenUI } from "../UI/ClayOvenUI";
import {
    destroyStructuralHealthBar,
    ensureStructuralHealthBar,
    getStructuralBarAnchor,
    getStructuralHealthBarTargets,
    layoutStructuralHealthBar,
} from "../UI/BuildingTheme";
import { UI_ITEM_TYPES } from "../UI/UIConstants";
import { VisibilitySystem } from "../UI/VisibilitySystem";
import { playBuildingCollapseSmoke } from "../FX/SmokeClearing";

export class ClayOven {

    static scene;
    static cookDuration = 575;
    static slotCount = 1;
    static itemCapacityPerSlot = 1;

    static getItemCapacityPerSlot() {
        return Math.max(1, Number(ClayOven.itemCapacityPerSlot || 1));
    }

    static isSlotOpenForInput(oven, slotIndex) {
        return !oven?.outputSlots?.[slotIndex];
    }

    constructor(x, y, teamNumber) {
        this.teamNumber = teamNumber;
        const item = TILE_TYPES.clayOven
        this.tileType = item;
        this.sprite = Map.addToWorldStatic(
            ClayOven.scene.add.sprite(
                (x + Math.floor(item.lenX/2)) * SQUARESIZE,
                (y + Math.floor(item.lenY/2)) * SQUARESIZE,
                'clayOven'
            ).setDepth(BLOCKDEPTH)
        )
        this.collider = Map.addStructureBarrier(
            x * SQUARESIZE + ((item?.lenX ?? 1) * SQUARESIZE) / 2,
            y * SQUARESIZE + ((item?.lenY ?? 1) * SQUARESIZE) / 2,
            (item?.lenX ?? 1) * SQUARESIZE,
            (item?.lenY ?? 1) * SQUARESIZE,
            {
                team: this.teamNumber,
                buildingRef: this,
            }
        );
        if (this.collider) this.collider.isBuilding = true;
        Map.drawRoadAround(x,y,item,teamNumber)
        Map.addBlockItem(x,y,item)

        if(teamNumber == 1){
            const cx = x + Math.floor(item.lenX/2);
            const cy = y + Math.floor(item.lenY/2);
            // Vision bubble: small boost over ambient
            this.visionId = VisibilitySystem.addVisionBubble({ x: cx, y: cy, r: 6, boost: 0.15 });
            // Warm light around oven
            this.lightId  = VisibilitySystem.addLightSource({ x: cx, y: cy, r: 6, brightness: 2 });
        }

        this.sprite.anims.play('oven_idle');
        this.x = x;
        this.y = y;
        this.cooking = false;
        this._destroyed = false;

        // 🔹 Building health (for destroy feedback)
        this.maxHealth = 250;
        this.health = this.maxHealth;
        this.healthBarBg = null;
        this.healthBar   = null;

        // Show HP bar briefly after taking damage (even if not hovered).
        // Prevents the bar from staying visible forever when the building is left partially damaged.
        this._damageBarUntil = 0; // ms timestamp

        this.sprite.buildingRef = this;

        Teams.teamLists[teamNumber].ovenList.push(this);
        Teams.teamLists[teamNumber].buildings.push([x, y, TILE_TYPES.clayOven, this.sprite])

        this.cookingSlots = Array.from({ length: ClayOven.slotCount }, () => null); // { item: UI_ITEM_TYPES.*, amount: number }
        this.outputSlots = Array.from({ length: ClayOven.slotCount }, () => null);  // same structure
        this.cookTimers = Array.from({ length: ClayOven.slotCount }, () => 0);      // track elapsed time
        this.cookDurations = Array.from({ length: ClayOven.slotCount }, () => 0);   // required time
        this.isCooking = Array.from({ length: ClayOven.slotCount }, () => false);
        this.fuel = 0;

        this.sprite.setInteractive();

        this.sprite.on('pointerover', () => {
            this.isHovered = true;
            this.updateHealthBar?.();
            ClayOvenUI.showMinor(this);
        });
        this.sprite.on('pointerout', () => {
            this.isHovered = false;
            this.updateHealthBar?.();
            ClayOvenUI.hideMinor(this);
        });
        this.sprite.on('pointerdown', () => {
            if (this.scene?.destroyWallMode) return;
            if (buildingManager.handleBuildingClickForBuilders(this, null, this.teamNumber)) return;
            ClayOven.scene.openDetailPage('ovens', tab => tab.selectFromWorld(this));
        });

        ClayOven.scene.events.emit('oven:added', this);
    }

    getStatusBadgeState() {
        const activeInput = this.cookingSlots?.find((slot) => slot?.item) || null;
        const activeOutput = this.outputSlots?.find((slot) => slot?.item) || null;
        const activeItemLabel = activeInput?.item?.label || activeInput?.item?.name || '';
        const outputItemLabel = activeOutput?.item?.label || activeOutput?.item?.name || '';

        if (activeInput && this.cooking) {
            return {
                key: 'cooking',
                title: 'COOKING',
                detail: String(activeItemLabel || 'Batch').toUpperCase(),
                fillColor: 0x173a55,
                fillAlpha: 0.94,
                strokeColor: 0xc7efff,
                strokeAlpha: 0.24,
                accentColor: 0x74d7ff,
                accentAlpha: 0.22,
                textColor: '#eefbff',
                detailColor: '#cdefff',
            };
        }

        if (activeInput && (Number(this.fuel || 0) <= 0)) {
            return {
                key: 'fuel',
                title: 'NO FUEL',
                detail: String(activeItemLabel || 'WAITING').toUpperCase(),
                fillColor: 0x5a2b14,
                fillAlpha: 0.94,
                strokeColor: 0xffd0a8,
                strokeAlpha: 0.26,
                accentColor: 0xffa24d,
                accentAlpha: 0.22,
                textColor: '#fff6ef',
                detailColor: '#ffd8b8',
            };
        }

        if (activeOutput) {
            return {
                key: 'ready',
                title: 'READY',
                detail: String(outputItemLabel || 'OUTPUT').toUpperCase(),
                fillColor: 0x244226,
                fillAlpha: 0.94,
                strokeColor: 0xc8f8cf,
                strokeAlpha: 0.24,
                accentColor: 0x70e08a,
                accentAlpha: 0.22,
                textColor: '#f0fff2',
                detailColor: '#d9ffe0',
            };
        }

        return null;
    }

    hasFreeSlotForItem(itemType, amount) {
        for (let i = 0; i < this.cookingSlots.length; i++) {
            const slot = this.cookingSlots[i];
            if (!ClayOven.isSlotOpenForInput(this, i)) continue;
            if (!slot) {
                return { idx: i, remaining: ClayOven.getItemCapacityPerSlot() };
            } else if (slot.item === itemType) {
                const spotsLeft = ClayOven.getItemCapacityPerSlot() - slot.amount;
                if (spotsLeft > 0) {
                    return { idx: i, remaining: Math.min(spotsLeft, amount) };
                }
            }
        }
        return null;
    }

    static getOvensNeedingStorage() {
        return Teams.getOvens(1).filter(oven => {
            return oven.outputSlots.some(slot => 
                slot?.item &&
                Number(slot.amount || 0) > 0 &&
                (slot.forceStore || Teams.getStorageWithCapacity(oven.teamNumber, slot.item, 1))
            );
        });
    }

    _syncOutputPickupTask(slotIndex) {
        const team = Teams.teamLists?.[this.teamNumber];
        if (!team || !Array.isArray(team.ovenPickupJobs)) return false;

        const outSlot = this.outputSlots?.[slotIndex] || null;
        const taskList = team.ovenPickupJobs;
        const existingTask = taskList.find(task => task?.oven === this && task.outputidx === slotIndex) || null;

        if (!outSlot?.item || Number(outSlot.amount || 0) <= 0) {
            if (existingTask && Number(existingTask.assigned || 0) <= 0) {
                Teams.removeFromStateArray(this.teamNumber, "ovenPickupJobs", existingTask);
                return true;
            }
            return false;
        }

        const canStoreOutput = !!Teams.getStorageWithCapacity(this.teamNumber, outSlot.item, 1);
        if (!canStoreOutput && !outSlot.forceStore) {
            if (existingTask && Number(existingTask.assigned || 0) <= 0) {
                Teams.removeFromStateArray(this.teamNumber, "ovenPickupJobs", existingTask);
                return true;
            }
            return false;
        }

        const desiredAmount = Math.max(
            1,
            Number(outSlot.amount || 0),
            Number(existingTask?.assigned || 0)
        );

        if (existingTask) {
            const beforeAmount = Number(existingTask.amount || 0);
            existingTask.type = TILE_TYPES.clayOven;
            existingTask.x = this.x;
            existingTask.y = this.y;
            existingTask.taskType = "ovenPickup";
            existingTask.amount = desiredAmount;
            return beforeAmount !== desiredAmount;
        }

        taskList.push({
            oven: this,
            outputidx: slotIndex,
            x: this.x,
            y: this.y,
            type: TILE_TYPES.clayOven,
            assigned: 0,
            amount: desiredAmount,
            taskType: "ovenPickup",
        });
        return true;
    }

    _syncOutputPickupJobs() {
        let changed = false;
        for (let i = 0; i < (this.outputSlots?.length || 0); i++) {
            changed = this._syncOutputPickupTask(i) || changed;
        }
        return changed;
    }

    static isOpenOven() {
        const ovens = Teams.getOvens(1);
        for (const oven of ovens) {
            for (let i = 0; i < oven.cookingSlots.length; i++) {
                const slot = oven.cookingSlots[i];
                if (!ClayOven.isSlotOpenForInput(oven, i)) continue;
                if (!slot || (slot.item && slot.amount < ClayOven.getItemCapacityPerSlot())) {
                    return { oven, idx: i };
                }
            }
        }
        return null;
    }

    static findFreeCookingSlot(itemType, teamNumber) {
        const ovens = Teams.teamLists[teamNumber]?.ovenList || [];
        const ovenDeliveryItems = Teams.teamLists[teamNumber].ovenDeliveryItems;
        for (const oven of ovens) {
            let emptyCandidate = null;
            for (let i = 0; i < oven.cookingSlots.length; i++) {
                const slot = oven.cookingSlots[i];
                if (!ClayOven.isSlotOpenForInput(oven, i)) continue;
                const existingTask = ovenDeliveryItems.find(task =>
                    task.oven === oven && task.inputidx === i
                );
                if (slot && slot.item === itemType) {
                    if (existingTask &&
                        (existingTask.item.name !== itemType.name ||
                        existingTask.remaining <= existingTask.assigned)) {
                        continue;
                    }
                    const spotsLeft = ClayOven.getItemCapacityPerSlot() - slot.amount;
                    if (spotsLeft > 0) {
                        return { oven, idx: i, remaining: spotsLeft };
                    }
                }
                if (!slot && !emptyCandidate) {
                    if (existingTask &&
                        (existingTask.item.name !== itemType.name ||
                        existingTask.remaining <= existingTask.assigned)) {
                        continue;
                    }
                    emptyCandidate = { oven, idx: i, remaining: ClayOven.getItemCapacityPerSlot() };
                }
            }
            if (emptyCandidate) return emptyCandidate;
        }
        return null;
    }

    addItemToCook(itemType, count) {
        const cooksTo = itemType.cooksTo;
        if (!cooksTo || count <= 0) return false;   // allow queuing with 0 fuel

        const maxPerSlot = ClayOven.getItemCapacityPerSlot();
        let inserted = 0;

        for (let i = 0; i < this.cookingSlots.length && count > 0; i++) {
            const slot = this.cookingSlots[i];
            if (!ClayOven.isSlotOpenForInput(this, i)) continue;

            // Empty slot
            if (!slot) {
                const toAdd = Math.min(count, maxPerSlot);
                this.cookingSlots[i] = { item: itemType, amount: toAdd };
                this.cookTimers[i] = 0;
                this.cookDurations[i] = ClayOven.cookDuration; // configurable later
                inserted += toAdd;
                count -= toAdd;
            }

            // Matching item slot with room
            else if (slot.item.name === itemType.name && slot.amount < maxPerSlot) {
                const space = maxPerSlot - slot.amount;
                const toAdd = Math.min(space, count);
                slot.amount += toAdd;
                inserted += toAdd;
                count -= toAdd;
            }
        }

        if (inserted <= 0) return false;

        const icon = GHOST_ITEM_ICONS[itemType.name] || itemType.name;
        const text = `+${inserted} ${icon}`;
        showGhostText(
            ClayOven.scene,
            this.sprite.x,
            this.sprite.y - 8,
            text,
            0,0,0,'#00ff00'
        );

        ClayOven.scene.events.emit('oven:updated', this);
        return inserted;
    }

    addItemToCookAtSlot(itemType, count, slotIndex) {
        const cooksTo = itemType.cooksTo;
        if (!cooksTo || count <= 0) return false;
        if (slotIndex < 0 || slotIndex >= this.cookingSlots.length) return false;

        const maxPerSlot = ClayOven.getItemCapacityPerSlot();
        let inserted = 0;
        const slot = this.cookingSlots[slotIndex];
        if (!ClayOven.isSlotOpenForInput(this, slotIndex)) return false;

        // Empty slot
        if (!slot) {
            const toAdd = Math.min(count, maxPerSlot);
            this.cookingSlots[slotIndex] = { item: itemType, amount: toAdd };
            this.cookTimers[slotIndex] = 0;
            this.cookDurations[slotIndex] = ClayOven.cookDuration; // same default as addItemToCook
            inserted += toAdd;
        }
        // Matching item slot with room
        else if (slot.item.name === itemType.name && slot.amount < maxPerSlot) {
            const space = maxPerSlot - slot.amount;
            const toAdd = Math.min(space, count);
            slot.amount += toAdd;
            inserted += toAdd;
        }
        // Different item or full slot → cannot honor this job’s slot
        else {
            return false;
        }

        if (inserted <= 0) return false;

        const icon = GHOST_ITEM_ICONS[itemType.name] || itemType.name;
        const text = `+${inserted} ${icon}`;
        showGhostText(
            ClayOven.scene,
            this.sprite.x,
            this.sprite.y - 8,
            text,
            0,0,0,'#00ff00'
        );

        ClayOven.scene.events.emit('oven:updated', this);
        return inserted;
    }

    removeItemFromSlot(index, fromOutput = true) {
        const slots = fromOutput ? this.outputSlots : this.cookingSlots;
        if (index < 0 || index >= slots.length) return null;

        const slot = slots[index];
        if (!slot || slot.amount <= 0) return null;

        slot.amount--;

        // If emptied, clear the slot
        if (slot.amount === 0) {
            slots[index] = null;
        }

        const icon = GHOST_ITEM_ICONS[slot.item.name];
        const text = `-1 ${icon}`;
        showGhostText(
            ClayOven.scene,
            this.sprite.x,
            this.sprite.y - 8,
            text,
            0,0,0,'#ff0000'
        );

        ClayOven.scene.events.emit('oven:updated', this);
        return slot.item;
    }


    startCooking(slotIndex, duration = 3000) {
        if (this.isCooking[slotIndex]) return;

        this.isCooking[slotIndex] = true;
        this.updateAnimation();

        this.cookTimers[slotIndex] = ClayOven.scene.time.delayedCall(duration, () => {
            this.isCooking[slotIndex] = false;
            this.updateAnimation();
            // Add output handling logic here if needed
        });
    }

    updateAnimation() {
        const sprite = this.sprite;
        const anims = sprite?.anims;
        if (this._destroyed || !sprite?.active || typeof anims?.play !== "function") return;

        const anyCooking = Array.isArray(this.isCooking)
            ? this.isCooking.some(Boolean)
            : !!this.cooking;

        anims.play(anyCooking ? 'oven_cooking' : 'oven_idle', true);
    }

    stopAllCooking() {
        // Ensure arrays exist even if something called this early
        if (!this.cookTimers) this.cookTimers = Array.from({ length: ClayOven.slotCount }, () => 0);
        if (!this.isCooking) this.isCooking = Array.from({ length: ClayOven.slotCount }, () => false);

        for (let i = 0; i < this.cookingSlots.length; i++) {
            const timer = this.cookTimers[i];

            // If we ever stored a Phaser timer here, clean it up
            if (timer && typeof timer.remove === "function") {
                timer.remove(false);
            }

            // Reset to "not cooking"
            this.cookTimers[i] = 0;
            this.isCooking[i]  = false;
        }

        this.updateAnimation();
    }

    static beginPlacing() {
        const ghost = ClayOven.scene.add.sprite(0, 0, 'clayOven', 0)
            .setAlpha(0.5)
            .setDepth(TILE_TYPES.clayOven.depth)
            .setInteractive();

        const lenX = 4;
        const lenY = 4;

        // Track pointer position for placement
        let lastValidPos = null;

        const pointerMoveHandler = (pointer) => {
            if (pointer.x < 0 || pointer.y < 0) return;

            let x = Math.floor(pointer.worldX / SQUARESIZE) * SQUARESIZE;
            let y = Math.floor(pointer.worldY / SQUARESIZE) * SQUARESIZE;

            const gridX = Math.floor(x / SQUARESIZE) - Math.floor(lenX / 2);
            const gridY = Math.floor(y / SQUARESIZE) - Math.floor(lenY / 2);

            const tintColor = Map.checkBlockPosition(
                gridX,
                gridY,
                lenX,
                lenY,
                ghost,
                {
                    padding: 1,
                    protectFarmSpots: true,
                    paddingAllowWalls: true,
                    paddingProtectFarmSpots: false,
                    allowAutoClearSite: true,
                }
            );
            const isBlocked = !!ghost.blocked;

            ghost.setTint(tintColor);
            ghost.setPosition(
                x + (lenX % 2 ? SQUARESIZE / 2 : 0),
                y + (lenY % 2 ? SQUARESIZE / 2 : 0)
            );

            if (!isBlocked) {
                lastValidPos = { x, y, gridX, gridY };
            } else {
                lastValidPos = null;
            }
        };

        const pointerUpHandler = () => {
            if (lastValidPos) {
                const items = TILE_TYPES.clayOven
                buildingManager.queueBlockBuildTask({
                    type: items,
                    x: lastValidPos.gridX,
                    y: lastValidPos.gridY, 
                    duration: 100,
                    assigned: 0
                }, 1);
                ghost.destroy();
                ClayOven.scene.input.off('pointermove', pointerMoveHandler);
                ClayOven.scene.input.off('pointerup', pointerUpHandler);
            }
        };

        ClayOven.scene.input.on('pointermove', pointerMoveHandler);
        ClayOven.scene.input.once('pointerup', pointerUpHandler);
    }

    updateCooking(delta) {
        if (this._destroyed || !this.sprite?.active) return;

        let anyCooking = false;
        let changed = false;

        for (let i = 0; i < this.cookingSlots.length; i++) {
            const slot = this.cookingSlots[i];
            if (!slot) continue;

            // Need a duration to cook this slot (set when items were added)
            const dur = this.cookDurations[i] || 0;
            if (dur <= 0) continue;

            const cookedName = UI_ITEM_TYPES[slot.item.name].cooksTo;
            const cookedItem = UI_ITEM_TYPES[cookedName];
            const outputCapacity = ClayOven.getItemCapacityPerSlot();
            const outSlot = this.outputSlots[i];
            const outputHasRoom = !outSlot || (outSlot.item.name === cookedItem.name && outSlot.amount < outputCapacity);
            if (!outputHasRoom) continue;

            // If this cook cycle is just starting (timer==0), consume 1 fuel.
            if (this.cookTimers[i] === 0) {
                if (this.fuel > 0) {
                this.fuel -= 1;         // 🔥 consume wood
                changed = true;         // fuel changed → UI update
                this.cookTimers[i] += delta;   // now we can begin progressing
                anyCooking = true;
                } else {
                // No fuel: do not progress this timer.
                continue;
                }
            } else {
                // Already in-flight this cycle: keep progressing
                this.cookTimers[i] += delta;
                anyCooking = true;
            }

            if (this.cookTimers[i] >= this.cookDurations[i]) {
                changed = true;
                if (!outSlot) {
                    this.outputSlots[i] = { item: cookedItem, amount: 1 };
                } else {
                    outSlot.amount = Math.min(outputCapacity, outSlot.amount + 1);
                }

                slot.amount -= 1;
                this.cookTimers[i] = 0;
                this.cookDurations[i] = ClayOven.cookDuration;

                if (slot.amount <= 0) {
                    this.cookingSlots[i] = null;
                    this.cookTimers[i] = 0;
                    this.cookDurations[i] = 0;
                }
            }
        }

        changed = this._syncOutputPickupJobs() || changed;

        if (changed) {
           ClayOven.scene.events.emit('oven:updated', this);
        }

        // Only switch animation if needed
        if (this.cooking !== anyCooking) {
            this.cooking = anyCooking;
            if (typeof this.sprite?.anims?.play === "function") {
                this.sprite.anims.play(this.cooking ? 'oven_cooking' : 'oven_idle', true);
            }
        }
    }

    addFuel(amount = 1) {
        this.fuel = Math.min(this.maxFuel || 100, this.fuel + amount);
        ClayOven.scene.events.emit('oven:updated', this);
        const icon = GHOST_ITEM_ICONS['wood'];
        const text = `+${1} ${icon}`;
        showGhostText(
            ClayOven.scene,
            this.sprite.x,
            this.sprite.y - 8,
            text,
            0,0,0,'#00ff00'
        );
        return true;
    }

    clearQueuedWork() {
        const team = Teams.teamLists?.[this.teamNumber];
        if (!team) return;

        const releasedWaterByOrder = new globalThis.Map();
        const queueWaterRelease = (orderId, amount) => {
            if (orderId == null) return;
            const units = Math.max(0, Number(amount || 0) || 0);
            if (units <= 0) return;
            releasedWaterByOrder.set(
                orderId,
                Math.max(0, Number(releasedWaterByOrder.get(orderId) || 0)) + units
            );
        };

        const listKeys = [
            "ovenJobs",
            "ovenPickupJobs",
            "ovenFuelJobs",
            "ovenDeliveryItems",
            "ovenFuelDeliveryItems",
        ];

        for (const key of listKeys) {
            if (!Array.isArray(team[key])) continue;
            team[key] = team[key].filter((task) => {
                if (task?.oven !== this) return true;
                task.canceled = true;
                if (
                    key === "ovenJobs" &&
                    task?.item?.name === UI_ITEM_TYPES.unclean_water.name
                ) {
                    queueWaterRelease(task.directOrderId, task.remaining ?? task.target ?? 0);
                }
                if (
                    key === "ovenPickupJobs" &&
                    Number(task?.outputidx) === 0 &&
                    this.outputSlots?.[task.outputidx]?.item?.name === UI_ITEM_TYPES.clean_water.name
                ) {
                    queueWaterRelease(task.directOrderId, task.amount ?? 0);
                }
                return false;
            });
        }

        releasedWaterByOrder.forEach((amount, orderId) => {
            Teams.uncommitTownWaterUnits?.(this.teamNumber, orderId, amount);
        });

        const players = Array.isArray(team.playerList) ? team.playerList : [];
        for (const troop of players) {
            if (!troop || troop.active === false) continue;

            let changed = false;
            if (troop.pendingOvenJob?.oven === this) {
                troop.pendingOvenJob.canceled = true;
                troop.pendingOvenJob = null;
                changed = true;
            }
            if (troop.pendingFuelJob?.oven === this) {
                troop.pendingFuelJob.canceled = true;
                troop.pendingFuelJob = null;
                changed = true;
            }
            if (troop.task?.oven === this || troop.task?.job?.oven === this) {
                troop.task = null;
                changed = true;
            }
            if (
                changed &&
                (troop.state === CONTROL_STATES.SEND_TO_OVEN ||
                 troop.state === CONTROL_STATES.GET_FROM_STORAGE ||
                 troop.state === CONTROL_STATES.GET_WATER_MODE)
            ) {
                troop.task = null;
            }

            if (!changed) continue;

            troop.currentPath = [];
            troop.setVelocity?.(0, 0);

            if (
                troop.state === CONTROL_STATES.SEND_TO_OVEN ||
                troop.state === CONTROL_STATES.GET_FROM_STORAGE ||
                troop.state === CONTROL_STATES.GET_WATER_MODE
            ) {
                Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
            }
        }
    }

    clearStoredContents() {
        this.stopAllCooking();
        this.cookingSlots = Array.from({ length: ClayOven.slotCount }, () => null);
        this.outputSlots = Array.from({ length: ClayOven.slotCount }, () => null);
        this.cookTimers = Array.from({ length: ClayOven.slotCount }, () => 0);
        this.cookDurations = Array.from({ length: ClayOven.slotCount }, () => 0);
        this.isCooking = Array.from({ length: ClayOven.slotCount }, () => false);
        this.fuel = 0;
    }

    ensureHealthBar() {
        if (!this.sprite) return;
        const scene = ClayOven.scene;
        if (!scene) return;
        ensureStructuralHealthBar(this, scene, { fillColor: 0x61d98f });
    }

    updateHealthBar() {
        if (!this.sprite) return;
        this.ensureHealthBar();

        if (!this.healthBar || !this.healthBarBg) return;
        const ratio = this.maxHealth > 0 ? Phaser.Math.Clamp(this.health / this.maxHealth, 0, 1) : 0;
        const { centerX, topY, width } = getStructuralBarAnchor(this.sprite, {
            widthScale: 1,
            paddingX: 12,
            yOffset: 14,
        });

        const now = ClayOven.scene?.time?.now ?? 0;
        const visible = this.isHovered || now < this._damageBarUntil;
        layoutStructuralHealthBar(this, {
            ratio,
            centerX,
            topY,
            width,
            visible,
            fillColor: 0x61d98f,
        });
    }

    shakeAndFlash() {
        if (!this.sprite) return;
        const scene = ClayOven.scene;
        const baseAngle = Number.isFinite(this._damageRestAngle) ? this._damageRestAngle : (this.sprite.angle || 0);
        this._damageRestAngle = baseAngle;
        this._damageShakeTween?.stop?.();
        this.sprite.angle = baseAngle;

        this._damageShakeTween = scene.tweens.add({
            targets: this.sprite,
            angle: baseAngle + 2,
            yoyo: true,
            duration: 40,
            repeat: 2,
            onComplete: () => {
                if (this.sprite) this.sprite.angle = baseAngle;
                this._damageShakeTween = null;
            }
        });

        this.sprite.setTint(0xff6666);
        scene.time.delayedCall(120, () => {
            if (this.sprite) this.sprite.clearTint();
        });
    }

    // Called by buildingManager.beginDestroyingBlock
    onDamaged(damage, currentHealth, maxHealth) {
        this.maxHealth = maxHealth ?? this.maxHealth ?? 1;
        this.health = Math.max(0, currentHealth);
        buildingManager.queueAutoFixForBuilding(this, this.teamNumber);

        this.shakeAndFlash();

        // Keep the health bar visible for a short period after the most recent hit.
        // If another hit happens, this extends/restarts the timer.
        const now = ClayOven.scene?.time?.now ?? 0;
        this._damageBarUntil = now + 2000;
        this.updateHealthBar();

        // 🔑 force a visibility re-check after expiry
        this._damageBarTimer?.remove(false);
        this._damageBarTimer = ClayOven.scene.time.delayedCall(2000, () => {
            this.updateHealthBar?.();
        });

        // Floating damage text
        const textY = this.sprite.y - (this.sprite.displayHeight || (4 * SQUARESIZE)) / 2 - 8;
        showGhostText(
            ClayOven.scene,
            this.sprite.x,
            textY,
            `-${damage}`,
            this.teamNumber,
            0, 0,
            '#ff5555'
        );
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;

        this._damageBarTimer?.remove(false);
        this._damageBarTimer = null;

        Teams.removeFromStateArray(this.teamNumber, 'ovenList', this);
        this.clearQueuedWork();
        this.clearStoredContents();
        ClayOven.scene.events.emit('oven:removed', this);
        destroyStructuralHealthBar(this);
        playBuildingCollapseSmoke(this, { scene: ClayOven.scene });
        Map.removeStructureBarrier(this.collider);
        this.collider = null;
        if (this.sprite) this.sprite.destroy();
        if (this.visionId) VisibilitySystem.removeVisionBubble(this.visionId);
        if (this.lightId)  VisibilitySystem.removeLightById(this.lightId);
    }
}
