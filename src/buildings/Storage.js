import { BLOCKDEPTH, SQUARESIZE, TILE_TYPES, showGhostText, GHOST_ITEM_ICONS, CONTROL_STATES } from '../constants.js';
import { Map } from '../map.js';
import { Teams } from '../Teams.js';
import { DailyNeedsTracker } from '../UI/DailyNeedsTracker.js';
import { StorageUI } from '../UI/StorageUI.js';
import {
    destroyStructuralHealthBar,
    ensureStructuralHealthBar,
    getStructuralBarAnchor,
    getStructuralHealthBarTargets,
    layoutStructuralHealthBar,
} from '../UI/BuildingTheme.js';
import { UI_ITEM_TYPES } from '../UI/UIConstants.js';
import { VisibilitySystem } from '../UI/VisibilitySystem.js';
import { buildingManager } from '../Manager/buildingManager.js';
import { StorageManager } from '../Manager/StorageManager.js';
import { playBuildingCollapseSmoke } from '../FX/SmokeClearing.js';

export class StorageBuilding {
    static scene;
    static defaultCapacity = 8;

    constructor(x, y, teamNumber) {
        this.teamNumber = teamNumber;

        const item = TILE_TYPES.storage;
        this.tileType = item;
        this.sprite = Map.addToWorldStatic(
            StorageBuilding.scene.add.sprite(
                (x + Math.floor(item.lenX/2)) * SQUARESIZE,
                (y + Math.floor(item.lenY/2)) * SQUARESIZE,
                'storage'
            ).setDepth(BLOCKDEPTH)
        );
        this.sprite.setInteractive({ useHandCursor: true });
        this.sprite.buildingRef = this;
        this.sprite.isBuilding = true;

        const tileType = TILE_TYPES.storage || { lenX: 1, lenY: 1 };
        const w = (tileType.lenX || 1) * SQUARESIZE;
        const h = (tileType.lenY || 1) * SQUARESIZE;

        this.collider = Map.addStructureBarrier(
            x * SQUARESIZE + (w / 2),
            y * SQUARESIZE + (h / 2),
            w,
            h,
            {
                team: this.teamNumber,
                buildingRef: this,
            }
        );

        if (this.collider) {
            this.collider.buildingRef = this;
            this.collider.isBuilding = true;
            this.collider.team = this.teamNumber;
        }

        Map.drawRoadAround(x,y,item,teamNumber)
        Map.addBlockItem(x,y,item)

        if(teamNumber == 1){
            const cx = x + Math.floor(item.lenX/2);
            const cy = y + Math.floor(item.lenY/2);
            // Vision bubble: keep storage area slightly visible
            this.visionId = VisibilitySystem.addVisionBubble({ x: cx, y: cy, r: 6, boost: 0.10 });
            // Utility light: a bit dimmer than oven
            this.lightId  = VisibilitySystem.addLightSource({ x: cx, y: cy, r: 5, brightness: 2 });
        }

        this.x = x;
        this.y = y;

        // 🔹 Building health
        this.maxHealth = 280;
        this.health = this.maxHealth;
        this.healthBarBg = null;
        this.healthBar   = null;
        this._damageBarUntil = 0;

        // per-item pickup reservations (itemName -> reserved count)
        this.reservedPickup = {};

        this.sprite.buildingRef = this;

        this.capacity = StorageBuilding.defaultCapacity;
        this.storageItems = Array(this.capacity).fill(null);
        StorageUI.refreshStatus?.(this);

        // Register into the team
        Teams.teamLists[teamNumber].storageList.push(this);
        Teams.teamLists[teamNumber].buildings.push([x, y, TILE_TYPES.storage, this.sprite])
        StorageBuilding.scene?.events?.emit?.("storage:added", this);
        //setup UI listeners
        this.sprite.setInteractive({ useHandCursor: true });
        this.sprite.on('pointerover', () => {
            this.isHovered = true;
            this.updateHealthBar?.();
            StorageUI.showMinor(this);
        });
        this.sprite.on('pointerout', () => {
            this.isHovered = false;
            this.updateHealthBar?.();
            StorageUI.hideMinor(this);
        });
        this.sprite.on('pointerdown', () => {
            if (this.scene?.destroyWallMode) return;
            if (buildingManager.handleBuildingClickForBuilders(this, null, this.teamNumber)) return;
            StorageBuilding.scene.openDetailPage('storage', tab => tab.selectFromWorld(this));
        });
    }

    get totalStored() {
        return this.storageItems.filter(slot => slot && slot.item && slot.item.name !== 'empty').length;
    }

    clearStoredInventory(applyLossToHud = false) {
        for (const slot of this.storageItems) {
            if (!slot?.item || slot.amount <= 0) continue;
            if (applyLossToHud) {
                DailyNeedsTracker.updateUIItems(slot.item, slot.amount, true);
            }
        }

        this.storageItems = Array(this.capacity).fill(null);
        this.reservedPickup = {};
        StorageUI.refreshMinor?.(this);
        StorageUI.refreshStatus?.(this);
    }

    getTotalCount() {
        return this.totalStored;
    }

    hasOpenSlots() {
        return this.storageItems.some(slot => !slot);
    }

    hasStackRoom() {
        return this.storageItems.some(slot =>
            slot?.item &&
            slot.amount < (slot.item.stacks ?? 1)
        );
    }

    getStorageWarningState() {
        if (this.hasOpenSlots()) return null;
        return this.hasStackRoom() ? 'slots' : 'full';
    }

    getStatusBadgeState() {
        const state = this.getStorageWarningState?.();
        if (!state) return null;

        if (state === 'full') {
            return {
                key: 'full',
                title: 'FULL',
                detail: 'NO ROOM',
                fillColor: 0x5a1d2a,
                fillAlpha: 0.94,
                strokeColor: 0xffc6d0,
                strokeAlpha: 0.28,
                accentColor: 0xff7f96,
                accentAlpha: 0.24,
                textColor: '#fff3f5',
                detailColor: '#ffd7df',
            };
        }

        return {
            key: 'slots',
            title: 'ALL SLOTS',
            detail: 'FILLED',
            fillColor: 0x5c3d10,
            fillAlpha: 0.94,
            strokeColor: 0xffe0a3,
            strokeAlpha: 0.26,
            accentColor: 0xffc85a,
            accentAlpha: 0.22,
            textColor: '#fff8e5',
            detailColor: '#ffe4ad',
        };
    }

    static _cloneSlots(slots = []) {
        return slots.map(slot => (slot ? { item: slot.item, amount: slot.amount } : null));
    }

    static _findPlacement(slots, itemDef) {
        if (!itemDef) return null;
        const maxStack = itemDef.stacks ?? 1;

        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            if (slot && slot.item?.name === itemDef.name && slot.amount < maxStack) {
                return { idx: i, room: maxStack - slot.amount, isEmpty: false };
            }
        }

        for (let i = 0; i < slots.length; i++) {
            if (!slots[i]) {
                return { idx: i, room: maxStack, isEmpty: true };
            }
        }

        return null;
    }

    static _placeIntoSlots(slots, itemDef, amount = 1) {
        let remaining = Math.max(0, Number(amount) || 0);
        while (remaining > 0) {
            const placement = this._findPlacement(slots, itemDef);
            if (!placement) return false;

            if (!slots[placement.idx]) {
                slots[placement.idx] = { item: itemDef, amount: 0 };
            }

            const toAdd = Math.min(placement.room, remaining);
            slots[placement.idx].amount += toAdd;
            remaining -= toAdd;
        }

        return true;
    }

    static _availableCapacity(slots, itemDef) {
        if (!itemDef) return 0;
        const maxStack = itemDef.stacks ?? 1;
        let available = 0;

        for (const slot of slots) {
            if (!slot) {
                available += maxStack;
            } else if (slot.item?.name === itemDef.name && slot.amount < maxStack) {
                available += maxStack - slot.amount;
            }
        }

        return available;
    }

    static _getActiveDeliveryReservations(teamNumber, storage) {
        const team = Teams.teamLists?.[teamNumber];
        if (!team || !storage) return [];

        const players = Array.isArray(team.playerList) ? team.playerList : [];
        const tasks = Array.isArray(team.storageDeliveryItems) ? team.storageDeliveryItems : [];
        const pendingReservations = Array.isArray(team.storageDeliveryReservations) ? team.storageDeliveryReservations : [];
        const reservations = [];

        for (const task of tasks) {
            if (!task || task.taskType !== 'storageDelivery' || task.storage !== storage || !task.item) continue;

            const actualAssigned = players.reduce((count, troop) => {
                const validTroop =
                    troop?.active !== false &&
                    troop?.task === task &&
                    troop?.state === CONTROL_STATES.SEND_TO_STORAGE &&
                    troop?.carrying?.name === task.item.name;
                return count + (validTroop ? 1 : 0);
            }, 0);

            if (actualAssigned > 0) {
                reservations.push({ item: task.item, amount: actualAssigned });
            }
        }

        for (const reservation of pendingReservations) {
            if (!reservation || reservation.storage !== storage || !reservation.item) continue;
            const amount = Math.max(0, Number(reservation.amount) || 0);
            if (amount > 0) {
                reservations.push({ item: reservation.item, amount });
            }
        }

        return reservations;
    }

    static _getProjectedSlots(storage, teamNumber) {
        const projected = this._cloneSlots(storage?.storageItems ?? []);
        const reservations = this._getActiveDeliveryReservations(teamNumber, storage);

        for (const reservation of reservations) {
            this._placeIntoSlots(projected, reservation.item, reservation.amount);
        }

        return projected;
    }

    static _storageWorldPosition(storage) {
        if (!storage) return { x: 0, y: 0 };

        if (storage.sprite) {
            return {
                x: Number(storage.sprite.x) || 0,
                y: Number(storage.sprite.y) || 0,
            };
        }

        return {
            x: ((Number(storage.x) || 0) + 0.5) * SQUARESIZE,
            y: ((Number(storage.y) || 0) + 0.5) * SQUARESIZE,
        };
    }

    static _distanceSqToStorage(storage, source = null) {
        if (!source) return 0;

        const sourceX = source.sprite?.x ?? source.x;
        const sourceY = source.sprite?.y ?? source.y;
        if (!Number.isFinite(sourceX) || !Number.isFinite(sourceY)) return 0;

        const storagePos = this._storageWorldPosition(storage);
        const dx = storagePos.x - sourceX;
        const dy = storagePos.y - sourceY;
        return dx * dx + dy * dy;
    }

    static sortStoragesByDistance(storages = [], source = null, preferredStorage = null) {
        const ordered = [...(storages || [])].filter((storage) =>
            storage &&
            typeof storage.getAvailableForPickup === "function" &&
            typeof storage.reservePickup === "function" &&
            typeof storage.releasePickup === "function"
        );
        if (ordered.length <= 1) return ordered;

        if (preferredStorage) {
            ordered.sort((a, b) => {
                if (a === preferredStorage) return -1;
                if (b === preferredStorage) return 1;
                return this._distanceSqToStorage(a, source) - this._distanceSqToStorage(b, source);
            });
            return ordered;
        }

        if (!source) return ordered;

        ordered.sort((a, b) => this._distanceSqToStorage(a, source) - this._distanceSqToStorage(b, source));
        return ordered;
    }

    compactItems() {
        const before = this.storageItems
            .map(slot => (slot ? `${slot.item?.name}:${slot.amount}` : ''))
            .join('|');

        const compacted = Array(this.capacity).fill(null);
        for (const slot of this.storageItems) {
            if (!slot?.item || slot.amount <= 0) continue;
            StorageBuilding._placeIntoSlots(compacted, slot.item, slot.amount);
        }

        const after = compacted
            .map(slot => (slot ? `${slot.item?.name}:${slot.amount}` : ''))
            .join('|');

        if (before !== after) {
            this.storageItems = compacted;
            return true;
        }

        return false;
    }

    addItem(itemType, amount, opts = {}) {
        const itemDef = itemType;
        const OGAmnt = amount;
        if (!itemDef) return false;

        const maxStack = itemDef.stacks;
        let changed = false;

        // 1. Stack into existing slots
        for (let i = 0; i < this.storageItems.length; i++) {
            const slot = this.storageItems[i];
            if (slot && slot.item === itemType && slot.amount < maxStack) {
                const toAdd = Math.min(maxStack - slot.amount, amount);
                slot.amount += toAdd;
                amount -= toAdd;
                changed = true;
                if (amount <= 0) break;
            }
        }

        // 2. Fill new slots
        for (let i = 0; i < this.storageItems.length && amount > 0; i++) {
            if (!this.storageItems[i]) {
                const toAdd = Math.min(maxStack, amount);
                this.storageItems[i] = { item: itemDef, amount: toAdd };
                amount -= toAdd;
                changed = true;
            }
        }

        // 3. Refresh UI if needed
        if (changed) {
            this.compactItems();
            const scene = StorageBuilding.scene;
            StorageUI.refreshMinor?.(this);
            StorageUI.refreshStatus?.(this);

            const added = OGAmnt - amount;
            if (added > 0 && !opts?.silent) {
                const icon = GHOST_ITEM_ICONS[itemType.name];
                const text = `+${added} ${icon}`;
                // teamNumber 0 ⇒ green in showGhostText
                showGhostText(scene, this.sprite.x, this.sprite.y - 12, text, 0, 0, 0, '#00ff00');
            }

            DailyNeedsTracker.AddResources(itemDef, added);
            scene.events.emit("storage:updated", this);
        }

        return amount <= 0;  // True if all items were added
    }

    removeItem(itemName, amount) {
        if (!itemName || amount <= 0) return false;
        let remaining = amount;
        let changed = false;

        // 1. Loop through all slots and subtract from matching ones
        for (let i = 0; i < this.storageItems.length; i++) {
            const slot = this.storageItems[i];
            if (!slot || slot.item.name !== itemName) continue;
            if (slot.amount > remaining) {
                slot.amount -= remaining;
                remaining = 0;
                changed = true;
                break;
            } else {
                remaining -= slot.amount;
                this.storageItems[i] = null;
                changed = true;
            }
            if (remaining <= 0) break;
        }

        // 2. Refresh UI if any slot changed
        if (changed) {
            this.compactItems();
            const icon = GHOST_ITEM_ICONS[itemName];
            const text = `-${Math.abs(amount-remaining)} ${icon}`;
            // teamNumber 0 ⇒ green in showGhostText
            showGhostText(StorageBuilding.scene, this.sprite.x, this.sprite.y - 12, text, 0, 1, 0, '#ff0000');
            StorageUI.refreshMinor?.(this);
            StorageUI.refreshStatus?.(this);
            const scene = StorageBuilding.scene;
            scene.events.emit("storage:updated", this);
        }
        return remaining <= 0; // true if full amount was removed
    }

    removeItemFromSlot(index, amount = 1) {
        const slot = this.storageItems?.[index];
        if (!slot?.item || amount <= 0) return 0;

        const removed = Math.min(slot.amount, Math.max(0, Number(amount) || 0));
        if (removed <= 0) return 0;

        const itemName = slot.item.name;
        slot.amount -= removed;
        if (slot.amount <= 0) {
            this.storageItems[index] = null;
        }

        this.compactItems();

        const icon = GHOST_ITEM_ICONS[itemName];
        const text = `-${removed} ${icon}`;
        showGhostText(StorageBuilding.scene, this.sprite.x, this.sprite.y - 12, text, 0, 1, 0, '#ff0000');
        StorageUI.refreshMinor?.(this);
        StorageUI.refreshStatus?.(this);
        StorageBuilding.scene?.events?.emit("storage:updated", this);
        return removed;
    }

    canAcceptItem(itemType, amount) {
        const itemDef = itemType;
        if (!itemDef) return false;

        const maxStack = itemDef.stacks;
        let needed = amount;

        for (let i = 0; i < this.storageItems.length; i++) {
            const slot = this.storageItems[i];

            if (!slot) {
                needed -= Math.min(maxStack, needed);
            } else if (slot.item?.name === itemDef.name && slot.amount < maxStack) {
                const spaceLeft = maxStack - slot.amount;
                needed -= Math.min(spaceLeft, needed);
            }

            if (needed <= 0) return true;
        }

        return false;
    }

    getItemCount(itemType) {
        const itemName = typeof itemType === "string" ? itemType : itemType?.name;
        if (!itemName) return 0;
        return this.storageItems
            .filter(slot => slot && slot.item?.name === itemName)
            .reduce((sum, slot) => sum + slot.amount, 0);
    }

    getAvailableForPickup(itemType) {
        const itemDef = typeof itemType === "string" ? UI_ITEM_TYPES[itemType] : itemType;
        if (!itemDef?.name) return 0;

        const stored = this.storageItems.reduce((sum, slot) => {
            if (!slot?.item || slot.item.name !== itemDef.name) return sum;
            return sum + Math.max(0, Number(slot.amount) || 0);
        }, 0);

        const reserved = Math.max(0, Number(this.reservedPickup?.[itemDef.name]) || 0);
        return Math.max(0, stored - reserved);
    }

    reservePickup(itemType, amount = 1) {
        const itemDef = typeof itemType === "string" ? UI_ITEM_TYPES[itemType] : itemType;
        const request = Math.max(0, Number(amount) || 0);
        if (!itemDef?.name || request <= 0) return false;

        if (this.getAvailableForPickup(itemDef) < request) return false;

        this.reservedPickup[itemDef.name] = Math.max(0, Number(this.reservedPickup[itemDef.name]) || 0) + request;
        return true;
    }

    releasePickup(itemType, amount = 1) {
        const itemDef = typeof itemType === "string" ? UI_ITEM_TYPES[itemType] : itemType;
        const release = Math.max(0, Number(amount) || 0);
        if (!itemDef?.name || release <= 0) return;

        const current = Math.max(0, Number(this.reservedPickup?.[itemDef.name]) || 0);
        const next = Math.max(0, current - release);
        if (next > 0) {
            this.reservedPickup[itemDef.name] = next;
        } else {
            delete this.reservedPickup[itemDef.name];
        }
    }

    static canAcceptItem(itemType, team, preferredStorage = null, source = null) {
        const itemDef = itemType;
        if (!itemDef) return null;

        const storages = this.sortStoragesByDistance(
            Teams.teamLists[team]?.storageList || [],
            source,
            preferredStorage
        );

        for (const storage of storages) {
            const projected = this._getProjectedSlots(storage, team);
            const placement = this._findPlacement(projected, itemDef);
            if (!placement) continue;

            return {
                storage,
                idx: placement.idx,
                remaining: this._availableCapacity(projected, itemDef)
            };
        }

        return null;
    }

    ensureHealthBar() {
        if (!this.sprite) return;
        const scene = StorageBuilding.scene;
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
            yOffset: 13,
        });

        const now = StorageBuilding.scene?.time?.now ?? 0;
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
        const scene = StorageBuilding.scene;
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
        const now = StorageBuilding.scene?.time?.now ?? 0;
        this._damageBarUntil = now + 2000;
        this.updateHealthBar();
        this._damageBarTimer?.remove(false);
        this._damageBarTimer = StorageBuilding.scene.time.delayedCall(2000, () => {
            this.updateHealthBar?.();
        });


        const textY = this.sprite.y - this.sprite.displayHeight / 2 - 8;
        showGhostText(
            StorageBuilding.scene,
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
        this.health = 0;
        this._damageBarTimer?.remove(false);
        this._damageBarTimer = null;

        this.clearStoredInventory(true);

        if (this.collider) {
            Map.structureBarrier?.remove(this.collider, true, true);
            this.collider = null;
        }

        buildingManager.cleanupDestroyedBlockBuilding?.(this, this.x, this.y, this.tileType);
        buildingManager.playBuildingCollapseSfxOnce?.(this, { volume: 0.3 });
        Teams.removeFromStateArray(this.teamNumber, 'storageList', this);
        StorageManager.handleStorageDestroyed?.(this);

        playBuildingCollapseSmoke(this, { scene: StorageBuilding.scene });
        this.sprite?.destroy();
        destroyStructuralHealthBar(this);
        StorageUI.hideStatus?.(this);
        if (this.visionId) VisibilitySystem.removeVisionBubble(this.visionId);
        if (this.lightId)  VisibilitySystem.removeLightById(this.lightId);
        StorageBuilding.scene?.events?.emit?.("storage:removed", this);
    }
}
