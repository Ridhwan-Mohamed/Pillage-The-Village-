import { BLOCKDEPTH, CONTROL_STATES, MAX_CROP_GROWTH_STAGE, SQUARESIZE, TILE_TYPES, showGhostText } from "../constants";
import { Manager } from "./Manager";
import { StorageManager } from "./StorageManager";
import { Map } from "../map";
import { Player } from "../players/Player";
import { Teams } from "../Teams";
import { UI_ITEM_TYPES } from "../UI/UIConstants";
import { AudioManager } from "./AudioManager";
import { getMarketWorkDuration } from "../Cards/MarketBuffs";

export class tillManager {
    static scene;

    static _markCropSeeded(x, y, teamNumber = 1) {
        const teamKey = `${teamNumber}`;
        const team = Teams.teamLists?.[teamKey];
        if (!team) return null;

        let crop = Teams.getCropAt(x, y, teamKey);
        if (!crop) {
            crop = {
                sprite: Map.cropDict?.[`${x},${y}`] || null,
                x,
                y,
                teamNumber: teamKey,
                dailyWatered: false,
                growthStage: 0,
                hasSeed: true,
                harvestsRemaining: 0,
            };
            team.crops.push(crop);
        }

        crop.hasSeed = true;
        crop.growthStage = 0;
        crop.harvestsRemaining = 0;
        crop.dailyWatered = false;
        crop.sprite = crop.sprite || Map.cropDict?.[`${x},${y}`] || null;
        crop.sprite?.setFrame?.(1);
        if (crop.sprite) crop.sprite.hasSeed = true;
        Teams.setCropForWatering(crop);
        return crop;
    }

    static assignTilesToTroops(teamNumber) {
        const tillList = Teams.teamLists['1'].tileList;
        const force = Player.selected.length? true : false;
        const troops = Player.selected.length? Player.selected : Teams.teamLists[`${teamNumber}`].farmerList;
        Manager.assignTroopsToAction(troops, tillList, CONTROL_STATES.FARM_MODE, force);
    }

    static assignCropsToTroops(teamNumber){
        const cropList = Teams.teamLists['1'].cropList;
        const force = Player.selected.length? true : false;
        const troops = Player.selected.length? Player.selected : Teams.teamLists[`${teamNumber}`].farmerList;
        Manager.assignTroopsToAction(troops, cropList, CONTROL_STATES.HARVEST_MODE, force);
    }

    static harvestCrop(sprite) {
        if (!sprite.task) return;

        const { x, y } = sprite.task;
        const cropData = Teams.getCropAt(x, y, sprite.body.team); // helper you likely already have

        if (!cropData || cropData.growthStage < MAX_CROP_GROWTH_STAGE) return;

        const reservedDropoff =
            StorageManager.getDeliveryReservation(sprite, UI_ITEM_TYPES.crop) ||
            StorageManager.reserveDeliverySpace(sprite, UI_ITEM_TYPES.crop, 1);

        if (!reservedDropoff) {
            if (typeof sprite.task.assigned === "number" && sprite.task.assigned > 0) {
                sprite.task.assigned -= 1;
            }
            sprite.task = null;
            Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_MODE);
            return;
        }

        Teams.removeFromStateArray(sprite.body.team, "TeamFarmSpots", sprite.task);
        Teams.removeFromStateArray(sprite.body.team, "cropList", sprite.task);

        const maxHarvestCharges = Math.max(1, Math.floor(Number(Teams.CROP_HARVEST_CHARGES || 1)));
        const rawHarvestsRemaining = Math.floor(Number(cropData.harvestsRemaining || maxHarvestCharges));
        const harvestsRemaining = Math.max(
            1,
            Math.min(maxHarvestCharges, Number.isFinite(rawHarvestsRemaining) ? rawHarvestsRemaining : maxHarvestCharges)
        );
        if (harvestsRemaining > 1) {
            cropData.harvestsRemaining = harvestsRemaining - 1;
            cropData.sprite?.setFrame?.(1 + cropData.growthStage);
            Teams.addFarmSpots(cropData.sprite, cropData.x, cropData.y);
            Teams.syncCropWaterIndicator?.(cropData);
        } else {
            const reseeded = Teams.resetCrop(cropData);
            if (reseeded) {
                this.playReseedProcFeedback(cropData);
            }
        }
        this.scene?.achievementSystem?.addStat?.("cropsHarvested", 1);
        StorageManager.addCarriedItem(sprite,UI_ITEM_TYPES.crop);
        AudioManager.playCropHarvest();
        sprite.task = null;
        if (!StorageManager.tryCreateStorageDeliveryTask(sprite)) {
            Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_MODE);
        }
    }

    static playReseedProcFeedback(crop) {
        const scene = this.scene || crop?.sprite?.scene;
        if (!scene || !crop) return;

        const centerX = Number(crop.sprite?.x ?? ((crop.x + 0.5) * SQUARESIZE));
        const centerY = Number(crop.sprite?.y ?? ((crop.y + 0.5) * SQUARESIZE));
        const depth = (crop.sprite?.depth ?? BLOCKDEPTH) + 2;

        const ring = scene.add.circle(centerX, centerY, 10, 0x9dffa5, 0.24)
            .setDepth(depth);
        scene.tweens.add({
            targets: ring,
            alpha: 0,
            scaleX: 2.1,
            scaleY: 2.1,
            duration: 420,
            ease: "Quad.Out",
            onComplete: () => ring.destroy(),
        });

        if (scene.textures?.exists?.("sparkle")) {
            const sparkle = scene.add.image(centerX, centerY, "sparkle")
                .setDepth(depth + 1)
                .setScale(0.58)
                .setTint(0x9dffa5)
                .setAlpha(0.88);
            scene.tweens.add({
                targets: sparkle,
                alpha: 0,
                scaleX: 1.15,
                scaleY: 1.15,
                y: centerY - 8,
                duration: 360,
                ease: "Sine.easeOut",
                onComplete: () => sparkle.destroy(),
            });
        }

        showGhostText(scene, centerX, centerY - 10, "RESEEDED", crop.teamNumber ?? 1, false, false, "#9dffa5");
    }

    static beginTilling(sprite) {
        const {x, y} = sprite.task;

        if (sprite.isFarmer && sprite.plantPose) {
            Player.setPoseLock(sprite, sprite.plantPose);
        }

        sprite.timer = this.scene.time.delayedCall(getMarketWorkDuration(sprite, 1000), () => {
            if (!sprite.active || sprite.state != CONTROL_STATES.FARM_MODE) {
                Player.clearPoseLock(sprite);
                sprite.timer = null;
                return;
            }

            const existingCrop = Teams.getCropAt(x, y, sprite.body.team);

            if (existingCrop) {
                // reseed existing crop
                this._markCropSeeded(x, y, sprite.body.team);
            } else {
                // plant new crop
                Map.grid[y][x] = TILE_TYPES.crops.grid;
                if (Map.redrawRect) {
                    Map.redrawRect(x, y, 1, 1, 1);
                } else {
                    Map.drawGridValue(x, y);
                }

                // Update overview image in real time
                if (this.scene?.zoomMixer) {
                    this.scene.zoomMixer.updateOverviewCell(
                        x,
                        y,
                        Map.grid
                    );
                }
                // add to Teams.teamLists[team].crops as usual, with sprite frame 1
                this._markCropSeeded(x, y, sprite.body.team);
            }
            this.scene.removeTillPreviewSprite(x, y);
            StorageManager.removeCarriedItem(sprite);
            AudioManager.playPlant();
            Teams.removeFromStateArray(1, "tileList", sprite.task);
            sprite.task = null;
            sprite.timer = null;
            Player.clearPoseLock(sprite, sprite.idle);
        });
    }

    static beginWatering(sprite){
        const x = sprite.task.x;
        const y = sprite.task.y;
        sprite.play('action')
        AudioManager.playWateringStart();
        // === Show sparkle image with fade-out ===
        const sparkle = this.scene.add.image(
            x * SQUARESIZE + SQUARESIZE / 2,
            y * SQUARESIZE + SQUARESIZE / 2,
            'sparkle'
        ).setDepth(BLOCKDEPTH + 1)
         .setScale(1)
         .setAlpha(1);

        this.scene.tweens.add({
            targets: sparkle,
            alpha: 0,
            scale: 1.5,
            duration: 600,
            ease: 'Sine.easeOut',
            onComplete: () => sparkle.destroy()
        });
        sprite.timer = this.scene.time.delayedCall(getMarketWorkDuration(sprite, 1000), () => {
            if(!sprite.active || sprite.state != CONTROL_STATES.WATER_CROPS_MODE) return;
            //function needed here for setting dailywatered state to true here
            const waterCount = sprite.type?.clampWaterBucket?.(sprite) ?? Number(sprite.waterBucket?.count || 0);
            sprite.waterBucket.count = Math.max(0, waterCount - 1);
            Teams.markCropWatered(sprite.body.team, x, y)
                // === Sparkle effect at crop location ===
            Teams.removeFromStateArray(sprite.body.team, "wateringList", sprite.task);
            sprite.timer = null;
            sprite.task = null;
            Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_MODE);
        });
    }
}
