import { StorageBuilding } from "../buildings/Storage";
import { CONTROL_STATES, SQUARESIZE, TILE_TYPES, WORLD_DIMENSIONX } from "../constants";
import { Fireman } from "../players/Fireman";
import { Player } from "../players/Player";
import { Teams } from "../Teams";
import { DailyNeedsTracker } from "../UI/DailyNeedsTracker";
import { StorageUI } from "../UI/StorageUI";
import { Manager } from "./Manager";
import { UI_ITEM_TYPES } from "../UI/UIConstants";
import { getStorageSellPrice as getBalancedStorageSellPrice, getStorageSellPrices } from "../balance/GameBalance";

export const STORAGE_SELL_PRICES = Object.freeze({
    ...getStorageSellPrices(),
});

export class StorageManager {
    static scene;

    static _isUsableStorage(storage) {
        return !!(
            storage &&
            typeof storage.getAvailableForPickup === "function" &&
            typeof storage.reservePickup === "function" &&
            typeof storage.releasePickup === "function"
        );
    }

    static _getTeam(teamNumber) {
        return Teams.teamLists?.[`${teamNumber}`] ?? Teams.teamLists?.[teamNumber] ?? null;
    }

    static getStoredItemCountForTeam(teamNumber, itemType) {
        const team = this._getTeam(teamNumber);
        const itemDef = typeof itemType === "string" ? UI_ITEM_TYPES[itemType] : itemType;
        if (!team || !itemDef) return 0;

        const storages = Array.isArray(team.storageList) ? team.storageList : [];
        return storages.reduce((sum, storage) => {
            if (typeof storage?.getItemCount === "function") {
                return sum + Math.max(0, Number(storage.getItemCount(itemDef) || 0));
            }

            const slots = Array.isArray(storage?.storageItems) ? storage.storageItems : [];
            return sum + slots.reduce((slotSum, slot) => {
                if (slot?.item?.name !== itemDef.name) return slotSum;
                return slotSum + Math.max(0, Number(slot.amount || 0));
            }, 0);
        }, 0);
    }

    static _getStoredSlotsForTeam(teamNumber) {
        const team = this._getTeam(teamNumber);
        const storages = Array.isArray(team?.storageList) ? team.storageList : [];
        return storages.flatMap((storage) =>
            (Array.isArray(storage?.storageItems) ? storage.storageItems : [])
                .filter((slot) => slot?.item && Number(slot.amount || 0) > 0)
        );
    }

    static getFoodEquivalentValue(item) {
        const itemDef = UI_ITEM_TYPES[item?.name] ?? item;
        if (!itemDef) return 0;
        if (itemDef.name === UI_ITEM_TYPES.food.name) return 1;
        if (itemDef.food && Number(itemDef.foodValue || 0) > 0) {
            return Math.max(1, Number(itemDef.foodValue || 1));
        }
        return 0;
    }

    static getStoredFoodEquivalentForTeam(teamNumber) {
        return this._getStoredSlotsForTeam(teamNumber).reduce((sum, slot) => {
            const value = this.getFoodEquivalentValue(slot.item);
            if (!(value > 0)) return sum;
            return sum + Math.max(0, Number(slot.amount || 0)) * value;
        }, 0);
    }

    static syncStorageBackedResourceCounters(scene = this.scene, teamNumber = "1") {
        if (!scene) return;

        scene.seeds = this.getStoredItemCountForTeam(teamNumber, UI_ITEM_TYPES.seedCrop);
        scene.berries = this.getStoredItemCountForTeam(teamNumber, UI_ITEM_TYPES.seedBerry);
        scene.woodAmnt = this.getStoredItemCountForTeam(teamNumber, UI_ITEM_TYPES.wood);
        scene.stoneAmnt = this.getStoredItemCountForTeam(teamNumber, UI_ITEM_TYPES.stone);
        scene.foodAmnt = this.getStoredFoodEquivalentForTeam(teamNumber);
        scene.cleanWaterAmnt = this.getStoredItemCountForTeam(teamNumber, UI_ITEM_TYPES.clean_water);
        scene.uiScene?._refreshTopHudValues?.(true);
    }

    static getStorageSellPrice(itemOrName) {
        return getBalancedStorageSellPrice(itemOrName);
    }

    static _countActiveDeliveryAssignments(task, players) {
        if (!task) return 0;
        return (players || []).reduce((count, troop) => {
            const validTroop =
                troop?.active !== false &&
                troop?.task === task &&
                troop?.state === CONTROL_STATES.SEND_TO_STORAGE &&
                troop?.carrying?.name === task.item?.name;
            return count + (validTroop ? 1 : 0);
        }, 0);
    }

    static pruneTeamDeliveryTasks(teamNumber) {
        const team = this._getTeam(teamNumber);
        if (!team) return [];

        const players = Array.isArray(team.playerList) ? team.playerList : [];
        const storages = Array.isArray(team.storageList) ? team.storageList : [];
        const tasks = Array.isArray(team.storageDeliveryItems) ? team.storageDeliveryItems : [];

        team.storageDeliveryItems = tasks.filter(task => {
            if (!task || task.taskType !== "storageDelivery" || !task.storage || !task.item) return false;
            if (!storages.includes(task.storage)) return false;

            const actualAssigned = this._countActiveDeliveryAssignments(task, players);
            task.assigned = actualAssigned;
            if (actualAssigned <= 0) return false;

            const projected = StorageBuilding.canAcceptItem(task.item, teamNumber, task.storage);
            if (projected?.storage === task.storage) {
                task.index = projected.idx;
                task.remaining = Math.max(actualAssigned, actualAssigned + Math.max(0, Number(projected.remaining || 0)));
            } else {
                task.remaining = Math.max(actualAssigned, Number(task.remaining || 0));
            }

            return true;
        });

        return team.storageDeliveryItems;
    }

    static handleStorageDestroyed(storage) {
        const teamNumber = storage?.teamNumber;
        const team = this._getTeam(teamNumber);
        if (!team || !storage) return;

        const players = Array.isArray(team.playerList) ? team.playerList : [];

        team.storageDeliveryItems = (team.storageDeliveryItems || []).filter((task) => task?.storage && task.storage !== storage);
        team.storageDeliveryReservations = (team.storageDeliveryReservations || []).filter((reservation) => reservation?.storage && reservation.storage !== storage);

        for (const troop of players) {
            if (!troop || troop.active === false) continue;
            const task = troop.task;
            const targetsStorage = task?.storage === storage;
            const hadReservation = troop.pendingStorageDeliveryReservation?.storage === storage;
            if (!targetsStorage && !hadReservation) continue;

            if (targetsStorage && task.taskType === "storagePickup" && task.item) {
                storage.releasePickup?.(task.item, 1);
            }

            troop.pendingStorageDeliveryReservation = null;

            if (targetsStorage) {
                troop.task = null;
                troop.currentPath = [];
                troop.setVelocity?.(0, 0);
            }

            if (targetsStorage && (
                troop.state === CONTROL_STATES.SEND_TO_STORAGE ||
                troop.state === CONTROL_STATES.GET_FROM_STORAGE
            )) {
                Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
            }

            if (troop.carrying) {
                this.tryCreateStorageDeliveryTask(troop);
            }
        }

        this.pruneTeamDeliveryTasks(teamNumber);
    }

    static grantItemToTeam(teamNumber, itemType, amount, scene = this.scene, opts = {}) {
        const team = this._getTeam(teamNumber);
        const itemDef = typeof itemType === "string" ? UI_ITEM_TYPES[itemType] : itemType;
        const requested = Math.max(0, Math.floor(Number(amount) || 0));
        if (!team || !itemDef || requested <= 0) return 0;

        const storages = Array.isArray(team.storageList) ? team.storageList : [];
        let remaining = requested;

        for (const storage of storages) {
            if (!(remaining > 0) || !storage?.addItem) break;
            const before = storage.getItemCount?.(itemDef) ?? 0;
            storage.addItem(itemDef, remaining, opts);
            const after = storage.getItemCount?.(itemDef) ?? before;
            remaining -= Math.max(0, after - before);
        }

        const added = requested - remaining;
        if (!storages.length && scene) {
            DailyNeedsTracker.updateUIItems(itemDef, requested, false);
            return requested;
        }

        return added;
    }

    static getDeliveryReservation(troop, itemType = null) {
        const reservation = troop?.pendingStorageDeliveryReservation || null;
        if (!reservation) return null;

        const itemName = typeof itemType === "string" ? itemType : itemType?.name;
        if (itemName && reservation.item?.name !== itemName) {
            return null;
        }

        return reservation;
    }

    static canReserveDeliverySpace(teamNumber, itemType, preferredStorage = null) {
        const itemDef = typeof itemType === "string" ? UI_ITEM_TYPES[itemType] : itemType;
        if (!itemDef) return false;
        return !!StorageBuilding.canAcceptItem(itemDef, teamNumber, preferredStorage);
    }

    static reserveDeliverySpace(troop, itemType, amount = 1, preferredStorage = null) {
        if (!troop?.body?.team) return null;

        const itemDef = typeof itemType === "string" ? UI_ITEM_TYPES[itemType] : itemType;
        if (!itemDef) return null;

        const stale = this.getDeliveryReservation(troop);
        if (stale && stale.item?.name !== itemDef.name) {
            this.releaseDeliveryReservation(troop);
        }

        const existing = this.getDeliveryReservation(troop, itemDef);
        if (existing) return existing;

        const result = StorageBuilding.canAcceptItem(itemDef, troop.body.team, preferredStorage, troop);
        if (!result?.storage) return null;

        const team = this._getTeam(troop.body.team);
        if (!team) return null;

        const reservation = {
            troopId: troop.id,
            storage: result.storage,
            index: result.idx,
            item: itemDef,
            amount: Math.max(1, Math.floor(Number(amount) || 1)),
            createdAt: Date.now(),
        };

        if (!Array.isArray(team.storageDeliveryReservations)) {
            team.storageDeliveryReservations = [];
        }
        team.storageDeliveryReservations.push(reservation);
        troop.pendingStorageDeliveryReservation = reservation;
        return reservation;
    }

    static releaseDeliveryReservation(troopOrReservation, { clearTroopRef = true } = {}) {
        const troopRef = troopOrReservation?.pendingStorageDeliveryReservation ? troopOrReservation : null;
        const reservation = troopOrReservation?.storage
            ? troopOrReservation
            : troopRef?.pendingStorageDeliveryReservation || null;
        if (!reservation) return false;

        const teamNumber = troopRef?.body?.team ?? reservation.storage?.teamNumber;
        const team = this._getTeam(teamNumber);
        if (team && Array.isArray(team.storageDeliveryReservations)) {
            const idx = team.storageDeliveryReservations.indexOf(reservation);
            if (idx !== -1) {
                team.storageDeliveryReservations.splice(idx, 1);
            }
        }

        if (clearTroopRef && troopRef?.pendingStorageDeliveryReservation === reservation) {
            troopRef.pendingStorageDeliveryReservation = null;
        }

        return true;
    }

    static tryCreateStorageDeliveryTask(troop) {
        const carryEntry = troop.carrying;
        if (!carryEntry?.name) return false;

        const teamNumber = troop.body.team;
        const team = this._getTeam(teamNumber);
        if (!team) return false;

        this.pruneTeamDeliveryTasks(teamNumber);

        const staleReservation = this.getDeliveryReservation(troop);
        if (staleReservation && staleReservation.item?.name !== carryEntry.name) {
            this.releaseDeliveryReservation(troop);
        }

        const reserved = this.getDeliveryReservation(troop, carryEntry);
        let storage = reserved?.storage ?? null;
        let idx = reserved?.index ?? null;
        let remaining = 1;
        const sourceDirectOrderId = troop?.carryingDirectOrderId ?? troop?.task?.directOrderId ?? troop?.pendingOvenJob?.directOrderId ?? null;

        if (!storage || !team.storageList?.includes(storage)) {
            if (reserved) {
                this.releaseDeliveryReservation(troop);
            }
            const result = StorageBuilding.canAcceptItem(carryEntry, teamNumber, null, troop);
            if (!result) {
                Player.showStatusEmote?.(troop, "STORAGE FULL", {
                    key: "storage_full",
                    cooldownMs: 3200,
                    fontSize: 12,
                });
                return false;
            }
            storage = result.storage;
            idx = result.idx;
            remaining = result.remaining;
        }

        let task = team.storageDeliveryItems.find(existing =>
            existing.storage === storage &&
            existing.item?.name === carryEntry.name &&
            (existing.directOrderId ?? null) === sourceDirectOrderId
        );

        if (task) {
            task.index = idx;
            task.remaining = Math.max(task.assigned, task.assigned + Math.max(0, Number(remaining || 0)));
        } else {
            task = {
                type: TILE_TYPES.storage,
                x: storage.x,
                y: storage.y,
                storage,
                item: carryEntry,
                count: 1,
                index: idx,
                assigned: 0,
                remaining: Math.max(1, Number(remaining || 0)),
                taskType: 'storageDelivery',
                directOrderId: sourceDirectOrderId,
            };
            team.storageDeliveryItems.push(task);
        }

        const assigned = Manager.assignTaskToTroop(troop, task, CONTROL_STATES.SEND_TO_STORAGE);
        if (assigned && reserved) {
            this.releaseDeliveryReservation(troop);
        }
        return assigned;
    }

    static tryCreateStoragePickupTask(troop, itemType) {
        const team = Teams.teamLists[troop.body.team];
        if (!team) return false;

        const storages = StorageBuilding.sortStoragesByDistance(
            (team.storageList || []).filter((storage) => this._isUsableStorage(storage)),
            troop
        );
        if (!storages || storages.length === 0) return false;

        for (const storage of storages) {
            // how many of this item are actually free to be picked up?
            const available = storage.getAvailableForPickup(itemType);
            if (available <= 0) continue;

            // one-shot task just for this troop
            const task = {
                type: TILE_TYPES.storage,
                x: storage.x,
                y: storage.y,
                storage,
                item: itemType,
                assigned: 0,   // Manager will bump this to 1
                amount: 1,     // for Manager.tooManyAssigned(GET_FROM_STORAGE)
                taskType: 'storagePickup'
            };

            // 🔒 Try to reserve 1 unit; if someone else grabbed it between
            // available-check and now, this will fail and we move on.
            const reserved = storage.reservePickup(itemType, 1);
            if (!reserved) continue;

            // try to send the troop there; if pathing fails, undo reservation and try another storage
            const ok = Manager.assignTaskToTroop(
                troop,
                task,
                CONTROL_STATES.GET_FROM_STORAGE
            );

            if (!ok) {
                storage.releasePickup(itemType, 1);
                continue;
            }

            return true;
        }

        return false;
    }

    static handleStorageDropoff(troop) {
        const task = troop.task;
        if (!task || task.taskType !== 'storageDelivery' || !task.storage) return;

        const carried = troop.carrying;
        if (!carried || carried.name !== task.item.name) {
            troop.task = null;
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
            this.pruneTeamDeliveryTasks(troop.body.team);
            return;
        }

        let success = task.storage.addItem(task.item, 1);
        if (!success) {
            const storages = StorageBuilding.sortStoragesByDistance(
                Teams.teamLists?.[troop.body.team]?.storageList || [],
                troop
            );
            for (const storage of storages) {
                if (!storage || storage === task.storage) continue;
                if (!storage.canAcceptItem(task.item, 1)) continue;
                success = storage.addItem(task.item, 1);
                if (success) break;
            }
        }

        if (success) {
            if (task.item?.name === UI_ITEM_TYPES.clean_water.name && task.directOrderId != null) {
                Teams.recordTownWaterDelivery?.(troop.body.team, task.directOrderId, 1);
            }
            this.removeCarriedItem(troop);
        }

        // Clean up task
        task.assigned = Math.max(0, Number(task.assigned || 0) - 1);
        task.remaining = Math.max(0, Number(task.remaining || 0) - (success ? 1 : 0));

        if (task.remaining <= 0 || task.assigned <= 0) {
            Teams.removeFromStateArray(troop.body.team, 'storageDeliveryItems', task);
        }

        troop.task = null;
        Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
        this.pruneTeamDeliveryTasks(troop.body.team);

        if (!success && troop.carrying) {
            Player.showStatusEmote?.(troop, "STORAGE FULL", {
                key: "storage_full",
                cooldownMs: 3200,
                fontSize: 12,
            });
            this.tryCreateStorageDeliveryTask(troop);
        }
    }

    static tryPickupFromStorage(troop) {
        const task = troop.task;
        if (!task || task.taskType !== 'storagePickup' || !task.storage) {
            troop.task = null;
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
            return;
        }

        const storage = task.storage;

        // Actually try to take 1 item
        const taken = storage.removeItem(task.item.name, 1);

        // Whatever happens, release the reservation
        storage.releasePickup(task.item, 1);

        if (!taken) {
            // Item was already used or removed by something else
                console.error("Failed to take form storage, STORAGE ALLOC ERROR")
            troop.task = null;
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
            return;
        }

        // We successfully got one unit
        DailyNeedsTracker.updateUIItems(task.item, 1, true);
        this.addCarriedItem(troop, task.item);

        if (troop.isFireman) {
            // 🔥 fuel run: wood for an oven fuel job
            if (troop.pendingFuelJob && troop.carrying === UI_ITEM_TYPES.wood) {
                if (!Fireman.goRefuelOven(troop, troop.pendingFuelJob)) {
                    this.tryCreateStorageDeliveryTask(troop);
                }
                return;
            }

            // regular oven ingredient delivery
            const assigned = Fireman.maybeAssignOvenJobDelivery(troop, troop.pendingOvenJob, task.item);
            if (!assigned) {
                const job = troop.pendingOvenJob;
                if (job?.assigned > 0) job.assigned -= 1;
                troop.pendingOvenJob = null;
                troop.task = null;
                if (this.tryCreateStorageDeliveryTask(troop)) return;
                Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
            }
        } 
        else if (troop.isFarmer) {
            //if pending job go check if you can do it
            if (troop.pendingFarmSpot) {
                const plot = troop.pendingFarmSpot;
                // If we already fetched seeds, go plant this specific spot
                if (plot.reservedBy === troop) delete plot.reservedBy;
                troop.pendingFarmSpot = null;
                const canFarm = Manager.assignTaskToTroop(
                    troop,
                    plot,
                    CONTROL_STATES.FARM_MODE
                );
                if(!canFarm){
                    console.error("Failed to farm after seed pickup, FARM PATH ERROR")
                    StorageManager.tryCreateStorageDeliveryTask(troop);
                    troop.pendingFarmSpot.assigned = 0;
                    troop.pendingFarmSpot = null;
                    troop.task = null;
                }
                this.scene.enableTillFlash(plot.x, plot.y);
                return;
            }
        }
        else {
            troop.task = null;
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
        }
    }

    static consumeItemFromStorage(teamID, itemFilter, count = 1) {
        const team = Teams.teamLists[teamID];
        if (!team) return 0;

        let consumed = 0;

        for (const storage of team.storageList) {
            let storageChanged = false;
            for (let i = 0; i < storage.storageItems.length; i++) {
                const slot = storage.storageItems[i];
                if (
                    slot &&
                    (!itemFilter.name || slot.item.name === itemFilter.name) &&
                    (!itemFilter.type || slot.item.type === itemFilter.type)
                ) {
                    const toTake = Math.min(slot.amount, count - consumed);
                    slot.amount -= toTake;
                    consumed += toTake;
                    storageChanged = true;

                    // Remove slot if empty
                    if (slot.amount <= 0) {
                        storage.storageItems[i] = null;
                    }

                    if (storageChanged) {
                        storage.compactItems?.();
                    }

                    // Early exit if we've consumed enough
                    if (consumed >= count) {
                        StorageUI.refreshMajor?.(storage);
                        StorageUI.refreshMinor?.(storage);
                        this.scene?.events?.emit?.("storage:updated", storage);
                        return consumed;
                    }
                }
            }

            if (storageChanged) {
                storage.compactItems?.();
                StorageUI.refreshMajor?.(storage);
                StorageUI.refreshMinor?.(storage);
                this.scene?.events?.emit?.("storage:updated", storage);
            }
        }

        return consumed;
    }

    static sellFromStorage(storage, slotIndex, amount = 1, scene = this.scene, opts = {}) {
        const slot = storage?.storageItems?.[slotIndex];
        if (!slot?.item) {
            return { sold: 0, revenue: 0, item: null };
        }

        const item = slot.item;
        const sold = storage.removeItemFromSlot?.(slotIndex, amount) ?? 0;
        if (sold <= 0) {
            return { sold: 0, revenue: 0, item };
        }

        DailyNeedsTracker.updateUIItems(item, sold, true);

        const revenue = this.getStorageSellPrice(item) * sold;
        const targetScene = scene?.worldScene ?? scene ?? storage?.sprite?.scene ?? this.scene;
        if (revenue > 0 && typeof targetScene?.updateMoney === "function") {
            targetScene.updateMoney(revenue, opts);
        }

        return { sold, revenue, item };
    }

    static isCarrying(troop) {
        let isCarrying;
        troop.carrying ? isCarrying = true : isCarrying = false;
        return isCarrying;
    }

    static addCarriedItem(troop, item, opts = {}) {
        troop.carrying = item;
        troop.carryingDirectOrderId = opts?.directOrderId ?? null;
    }

    static removeCarriedItem(troop) {
        troop.carrying = null;
        troop.carryingDirectOrderId = null;
    }

}
