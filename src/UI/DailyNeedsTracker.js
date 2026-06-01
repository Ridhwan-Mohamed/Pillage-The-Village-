import { createBubbleText, showAlert } from "../constants.js";
import { StorageManager } from "../Manager/StorageManager.js";
import { Player } from "../players/Player.js";
import { Teams } from "../Teams.js";
import { UI_ITEM_TYPES } from "./UIConstants.js";

export class DailyNeedsTracker {
    static scene = null;
    static NEEDS_EMOTE_DELAY_MS = 1050;
    static _onStorageChanged = null;

    static init(scene) {
        if (this.scene?.events && this._onStorageChanged) {
            this.scene.events.off("storage:updated", this._onStorageChanged);
            this.scene.events.off("storage:added", this._onStorageChanged);
            this.scene.events.off("storage:removed", this._onStorageChanged);
        }
        this.scene = scene;
        this.uiElements = [];
        this._onStorageChanged = () => this.syncStorageBackedResourceCounters(scene, "1");
        scene?.events?.on?.("storage:updated", this._onStorageChanged);
        scene?.events?.on?.("storage:added", this._onStorageChanged);
        scene?.events?.on?.("storage:removed", this._onStorageChanged);
        scene?.events?.once?.("shutdown", () => {
            if (!this._onStorageChanged) return;
            scene.events.off("storage:updated", this._onStorageChanged);
            scene.events.off("storage:added", this._onStorageChanged);
            scene.events.off("storage:removed", this._onStorageChanged);
        });
    }

    static getLivingActiveTroops(teamNumber = "1") {
        const team = Teams.teamLists?.[`${teamNumber}`] ?? Teams.teamLists?.[teamNumber];
        const players = Array.isArray(team?.playerList) ? team.playerList : [];
        return players.filter((player) => (
            player &&
            player.active !== false &&
            Number(player.health ?? 1) > 0
        ));
    }

    static getNeedCount(teamNumber = "1") {
        return this.getLivingActiveTroops(teamNumber).length;
    }

    static syncStorageBackedResourceCounters(scene = this.scene, teamNumber = "1") {
        StorageManager.syncStorageBackedResourceCounters(scene, teamNumber);
    }

    static getValues() {
        const troopCount = this.getNeedCount("1");
        return [
            { key: "foodIcon", have: this.scene.foodAmnt, need: troopCount },
            { key: "waterIcon", have: this.scene.cleanWaterAmnt, need: troopCount },
        ];
    }

    static clearUI() {
        if (this.uiElements) {
            this.uiElements.forEach((el) => el.destroy());
        }
        this.uiElements = [];
    }

    static _canMutateText(node) {
        if (!node || node.active === false) return false;
        if (node.scene?.sys?.isActive && node.scene.sys.isActive() === false) return false;
        if ("canvas" in node && (!node.canvas || !node.context)) return false;
        if (node.frame?.source && !node.frame.source.image) return false;
        return true;
    }

    static _mutateText(node, fn) {
        if (!this._canMutateText(node)) return false;
        try {
            fn(node);
            return true;
        } catch {
            return false;
        }
    }

    static _resolveTrackedResource(item, count = 0) {
        const type = item?.name || item;
        if (type === UI_ITEM_TYPES.food.name || type === UI_ITEM_TYPES.clean_water.name) {
            return {
                type,
                amount: Math.max(0, Number(count) || 0),
            };
        }

        if (item?.food && Number(item?.foodValue || 0) > 0) {
            return {
                type: UI_ITEM_TYPES.food.name,
                amount: Math.max(0, Number(count) || 0) * Math.max(1, Number(item.foodValue || 1)),
            };
        }

        return {
            type,
            amount: Math.max(0, Number(count) || 0),
        };
    }

    static updateUIItems(item, count, decrease = false) {
        if (!this.scene) return;

        const s = this.scene;
        const troopCount = this.getNeedCount("1");

        const resolved = this._resolveTrackedResource(item, count);
        const type = resolved.type;
        const delta = decrease ? -resolved.amount : resolved.amount;

        const updateNeedText = (textObj, have, need) => {
            const color = have >= need ? "#00ff00" : "#ff3333";
            return this._mutateText(textObj, (node) => {
                node.setColor(color);
                node.setText(`${have}/${need}`);
            });
        };

        switch (type) {
            case UI_ITEM_TYPES.clean_water.name: {
                s.cleanWaterAmnt = Math.max(0, (s.cleanWaterAmnt ?? 0) + delta);
                if (s.waterText) {
                    if (!updateNeedText(s.waterText, s.cleanWaterAmnt, troopCount)) {
                        s.waterText = null;
                    }
                }
                break;
            }

            case UI_ITEM_TYPES.food.name: {
                s.foodAmnt = Math.max(0, (s.foodAmnt ?? 0) + delta);
                if (s.foodText) {
                    if (!updateNeedText(s.foodText, s.foodAmnt, troopCount)) {
                        s.foodText = null;
                    }
                }
                break;
            }

            case UI_ITEM_TYPES.wood.name: {
                s.woodAmnt = Math.max(0, (s.woodAmnt ?? 0) + delta);
                if (s.woodText) {
                    if (!this._mutateText(s.woodText, (node) => node.setText(`${s.woodAmnt}`))) {
                        s.woodText = null;
                    }
                }
                break;
            }

            case UI_ITEM_TYPES.stone.name: {
                s.stoneAmnt = Math.max(0, (s.stoneAmnt ?? 0) + delta);
                if (s.stoneText) {
                    if (!this._mutateText(s.stoneText, (node) => node.setText(`${s.stoneAmnt}`))) {
                        s.stoneText = null;
                    }
                }
                break;
            }

            case UI_ITEM_TYPES.seedCrop.name: {
                if (typeof s.updateSeeds === "function") {
                    s.updateSeeds(delta);
                }
                break;
            }

            case UI_ITEM_TYPES.seedBerry.name: {
                if (typeof s.updateBerry === "function") {
                    s.updateBerry(delta);
                }
                break;
            }

            default:
                break;
        }
    }

    static _queueNeedsEmote(player, text, key, delayMs = this.NEEDS_EMOTE_DELAY_MS) {
        const scene = this.scene;
        if (!scene || !player?.active || !text) return;

        scene.time?.delayedCall?.(delayMs, () => {
            if (!player?.active) return;
            Player.showStatusEmote?.(player, text, {
                key,
                cooldownMs: 2600,
            });
        });
    }

    static _getFoodConsumptionOrder() {
        const defs = Object.values(UI_ITEM_TYPES || {})
            .filter((item) => StorageManager.getFoodEquivalentValue(item) > 0);
        return defs.sort((a, b) => {
            if (a.name === UI_ITEM_TYPES.food.name) return -1;
            if (b.name === UI_ITEM_TYPES.food.name) return 1;
            return a.name.localeCompare(b.name);
        });
    }

    static _consumeFoodFromStorage(teamNumber, needCount) {
        const required = Math.max(0, Math.floor(Number(needCount) || 0));
        if (required <= 0) return 0;

        let consumedEquivalent = 0;
        for (const itemDef of this._getFoodConsumptionOrder()) {
            const value = StorageManager.getFoodEquivalentValue(itemDef);
            if (!(value > 0)) continue;

            const remainingNeed = required - consumedEquivalent;
            if (remainingNeed <= 0) break;

            const itemUnitsNeeded = Math.ceil(remainingNeed / value);
            const consumedItems = StorageManager.consumeItemFromStorage(teamNumber, itemDef, itemUnitsNeeded);
            consumedEquivalent += consumedItems * value;
        }

        return Math.min(required, Math.max(0, Math.floor(consumedEquivalent)));
    }

    static _consumeDrinkFromStorage(teamNumber, needCount) {
        const required = Math.max(0, Math.floor(Number(needCount) || 0));
        if (required <= 0) return 0;
        return StorageManager.consumeItemFromStorage(teamNumber, UI_ITEM_TYPES.clean_water, required);
    }

    static consumeResources() {
        const team = Teams.teamLists["1"];
        if (!team) return;
        this.syncStorageBackedResourceCounters(this.scene, "1");

        const currentDay = Math.max(1, Math.floor(Number(this.scene?.clock?.day || 1)));
        if (this.scene?.clock && currentDay === 1) {
            if (!this.scene._dailyNeedsFreeDayAnnounced) {
                this.scene._dailyNeedsFreeDayAnnounced = true;
                showAlert(this.scene, "Free first day: no food or water consumed.", "#a7f3d0", 2200);
            }
            return { skipped: true, reason: "day_one" };
        }

        const players = this.getLivingActiveTroops("1");
        if (!players.length) return;

        const troopCount = players.length;
        const totalFoodEaten = this._consumeFoodFromStorage("1", troopCount);
        const totalWaterDrank = this._consumeDrinkFromStorage("1", troopCount);
        this.syncStorageBackedResourceCounters(this.scene, "1");

        const scene = this.scene;
        const cam = scene.cameras.main;
        const view = cam.worldView;
        const sortedByHealth = [...players].sort((a, b) => a.health - b.health);

        let remainingFood = totalFoodEaten;
        let remainingWater = totalWaterDrank;

        for (const p of sortedByHealth) {
            const ate = remainingFood > 0;
            const drank = remainingWater > 0;

            if (ate) remainingFood--;
            if (drank) remainingWater--;

            if (ate && drank) {
                p.stamina = Math.min(p.maxStamina, p.stamina + 10);

                if (view.contains(p.x, p.y)) {
                    createBubbleText({
                        scene,
                        target: p,
                        text: "\u{1F37D}\u{1F4A7} +10 STA",
                        textColor: "#66ff66",
                        bgColor: "rgba(0,0,0,0.20)",
                        fontSize: 10,
                        duration: 1200,
                    });
                }
                continue;
            }

            if (ate || drank) {
                p.health = Math.max(0, p.health - 20);
                if (p.health <= 0) {
                    showAlert(scene, `Player ${p.name} has died`, "#ff0000", 5000);
                    Player.destroyPlayer(p);
                    continue;
                }
                p.stamina = Math.max(0, p.stamina - 20);

                if (view.contains(p.x, p.y)) {
                    createBubbleText({
                        scene,
                        target: p,
                        text: "\u{1F610} -20 HP/STA",
                        textColor: "#ffcc00",
                        bgColor: "rgba(40,20,0,0.20)",
                        fontSize: 10,
                        duration: 1200,
                    });
                }

                if (ate && !drank) {
                    this._queueNeedsEmote(p, "\u{1F4A7}", "needs_water");
                } else if (!ate && drank) {
                    this._queueNeedsEmote(p, "\u{1F37D}", "needs_food");
                }
                continue;
            }

            p.health = Math.max(0, p.health - 35);
            if (p.health <= 0) {
                showAlert(scene, `Player ${p.name} has died`, "#ff0000", 5000);
                Player.destroyPlayer(p);
                continue;
            }
            p.stamina = Math.max(0, p.stamina - 35);

            if (view.contains(p.x, p.y)) {
                createBubbleText({
                    scene,
                    target: p,
                    text: "\u{1F621} -35 HP/STA",
                    textColor: "#ff4444",
                    bgColor: "rgba(50,0,0,0.30)",
                    fontSize: 10,
                    duration: 1500,
                });
            }
            this._queueNeedsEmote(p, "\u{1F37D}\u{1F4A7}", "needs_food_water", 1200);
        }
    }

    static AddResources(item, amount) {
        if (!item || !amount) return;
        this.updateUIItems(item, amount, false);
    }
}
