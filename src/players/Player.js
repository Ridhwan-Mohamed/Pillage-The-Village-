import { BLOCKDEPTH, SQUARESIZE, CONTROL_STATES, TILE_TYPES, TILE_MAP, WORLD_DIMENSIONX, WORLD_DIMENSIONY, showAlert, UIDEPTH } from "../constants";
import Phaser from "phaser";
import { Map } from "../map";
import { tillManager } from "../Manager/tillManager";
import { Teams } from "../Teams";
import { buildingManager } from "../Manager/buildingManager";
import { weapons } from "../weapons";
import { fightManager } from "../Manager/fightManager";
import { seedManager } from "../Manager/seedManager";
import { Manager } from "../Manager/Manager";
import { Projectile } from "../Projectile";
import { Farmer } from "./Farmer";
import { Forager } from "./Forager";
import { Fireman } from "./Fireman";
import { Gunslinger } from "./Gunslinger";
import { StorageManager } from "../Manager/StorageManager";
import { Builder } from "./Builder";
import { UI_ITEM_TYPES } from "../UI/UIConstants";
import { blockResourceManager } from "../Manager/BlockResourceManager";
import { StaminaManager } from "../Manager/staminaManager";
import { VisibilitySystem } from "../UI/VisibilitySystem";
import { Blademaster } from "./Blademaster";
import { Brawler } from "./Brawler";
import { FortGrunt } from "./FortGrunt";
import { AudioManager } from "../Manager/AudioManager";
import { PathRegistry } from "../lib/navmesh/PathRegistry";
import { PathDebugDrawer } from "../lib/navmesh/PathDebugDrawer";
import { InterruptController } from "../ai/scheduler/InterruptController";
import { CombatSpacingCoordinator } from "../ai/CombatSpacingCoordinator";
import { SiegePlanner } from "../lib/navmesh/SiegePlanner";
import { OrderRunner } from "../orders/OrderRunner";
import { getMarketMoveMultiplier } from "../Cards/MarketBuffs";
import { Wall } from "../buildings/Wall";
import {
    faceDirectionalTowardVector,
    shouldUseDirectionalFacing,
    syncDirectionalAnimationState,
    updateDirectionalAnimationFromVelocity
} from "./PlayerDirectionalAnimator";

export class Player {

    static scene;
    static count = 0;
    static troops = [];
    static characters;
    static selected = [];
    // mini health/stamina bars config (segmented)
    static MINI_BAR_HEIGHT     = 6;
    static MINI_BAR_OFFSET_Y   = 10;      // below the feet
    static MINI_BAR_HIT_MS     = 2000;   // show for 2s after hit

    // Segmentation: each sub-rect represents this many points.
    // Last segment is truncated when max isn't divisible by this unit.
    static MINI_BAR_SEG_UNIT   = 20;
    static MINI_BAR_GAP        = 2;
    static MINI_BAR_PAD        = 1;
    static MINI_BAR_MAX_W      = 124;    // clamps on-screen width
    static MINI_BAR_BASE_SEG_W = 5;      // pre-scale width per segment before clamping
    static CARRY_ICON_OFFSET_Y = 28;
    static CARRY_ICON_SIZE     = 18;
    static HIGHLIGHT_RING_OFFSET_Y = 10;
    static FRIENDLY_VISION_BOOST = 0.58;
    static FLEE_REPATH_COOLDOWN_MS = 900;
    static FLEE_SAFE_GRACE_MS = 850;
    static FLEE_DEST_EPSILON = SQUARESIZE * 0.65;
    static STATUS_EMOTE_DURATION_MS = 1250;
    static STATUS_EMOTE_COOLDOWN_MS = 2400;
    static STATUS_EMOTE_Y_OFFSET = 30;
    static IDLE_EMOTE_DELAY_MS = 6500;
    static IDLE_EMOTE_COOLDOWN_MS = 11000;
    static TIRED_EMOTE_COOLDOWN_MS = 9000;
    static TIRED_STAMINA_RATIO = 0.26;
    static FIGHTER_CLOSE_THREAT_RADIUS = SQUARESIZE * 2;
    static FIGHTER_RECENT_ATTACKER_MS = 3200;
    static FIGHTER_TARGET_STICKY_MS = 1400;
    static FIGHTER_SPREAD_MAX_EXTRA_DISTANCE = SQUARESIZE * 4;
    static FIGHTER_SPREAD_MAX_RATIO = 1.8;
    static GUNSLINGER_DANGER_RADIUS = SQUARESIZE * 4;
    static GUNSLINGER_KITE_REPATH_COOLDOWN_MS = 240;
    static GUNSLINGER_KITE_DEST_EPSILON = SQUARESIZE * 0.55;

    static resetRuntimeState(scene = null) {
        this.scene = scene ?? null;
        this.count = 0;
        this.troops = [];
        this.selected = [];

        if (this.characters?.clear) {
            try { this.characters.clear(true, true); } catch {}
        }
        this.characters = null;
    }
    
    static init(scene){
        this.scene = scene;
        this.characters = this.scene.physics.add.group({});
        this.createAnim('walk','player',0,2);
        this.createAnim('idle','player',0,0);
        this.createAnim('gun1Walk', 'gun1',0,2);
        this.createAnim('gun1Idle', 'gun1',0,0);
        this.createAnim('action','playerAction',0,2,-1,10);
        this.createAnim('carryWalk', 'playerCarry', 0, 2)
        this.createAnim('carryIdle', 'playerCarry', 0, 0)
        this.createAnim('swim', 'playerSwim', 0, 2, -1, 8);
        this.createAnim('player_death_anim', 'player_death', 0, 5, 0, 8);
        this.setUpBackToTown()
        PathDebugDrawer.init(scene);
    }

    static addPlayer(x,y,team,spriteSheet='player',walk='walk',idle='idle',action='action', weapon=weapons.hands, swim='swim') {
        const newCube = Player.scene.physics.add.sprite(SQUARESIZE *x + SQUARESIZE/2, SQUARESIZE*y + SQUARESIZE/2, spriteSheet);
        newCube.setInteractive();
        newCube.id = this.count;
        this.count += 1;
        newCube.setOrigin(0.5,0.5);
        newCube.setDepth(BLOCKDEPTH+1)
        newCube.roam = false;
        newCube.currentPath = []
        newCube.body.team = team;
        newCube._teamNumber = team;
        team == 1 ? newCube.health = 200 : newCube.health = 100;
        team == 1 ? newCube.speed = 100 : newCube.speed = 50;
        // this.applyDefaultTint(newCube);
        newCube.body.pushable = false;
        newCube.animState = idle;
        newCube.walk = walk;
        newCube.idle = idle;
        newCube.action = action;
        newCube.swim = swim;
        Teams.movePlayerState(newCube, CONTROL_STATES.TRACK_MODE);
        newCube.weapon = weapon;
        this.characters.add(newCube);
        this.troops.push(newCube);
        this.configureCubeInteractivity(newCube);
        Teams.addPlayer(team, newCube);
        return newCube;
    }

    static destroyPlayer(player) {
        if (!player) return;

        const teamNum = player.body?.team ?? player._teamNumber ?? null;
        const state = player.state;
        fightManager.clearAttackRecovery(player);
        fightManager.clearHitReaction(player);
        this.clearRecentCombatAttacker(player);
        this.clearGunslingerKiteState(player);
        this._playDeathAnimation(player);
        this._clearStatusEmote(player);
        this._removePlayerFromHouse(player);
        this._dropTargetingAgainstUnit(player);

        // Call the troop-specific destroy logic if defined
        if (typeof player.destroySelf === 'function') {
            player.destroySelf();
        } else {
            this._destroyGenericPlayer(player);
        }

        this._destroySelectionIndicator(player);
        this._finalizeDestroyedPlayer(player, teamNum, state);
        if (teamNum != null) {
            StorageManager.pruneTeamDeliveryTasks?.(teamNum);
        }
    }

    static _removePlayerFromHouse(player) {
        const house = player?.home;
        if (!house) return;

        const idx = house.occupants?.indexOf(player) ?? -1;
        if (idx !== -1) {
            house.occupants.splice(idx, 1);
        }

        if (player.icon) {
            player.icon.followingHouse = false;
        }

        player.home = null;
        house.scene?.events?.emit?.("housing:updated", house.team);

        if (house.isHovered && house.occupants?.length) {
            house.updateIcons?.();
        } else {
            house.clearIcons?.();
        }
    }

    static _destroyGenericPlayer(player) {
        fightManager.clearAttackRecovery(player);
        fightManager.clearHitReaction(player);
        this._destroyMiniBars(player);
        this._clearStatusEmote(player);

        this._releaseTaskAssignment(player);
        if (player.carrying) player.carrying = null;

        this.characters?.remove?.(player);

        if (player.body && player.scene?.physics?.world) {
            player.scene.physics.world.remove(player.body);
            player.body.destroy();
        }

        const index = this.troops.indexOf(player);
        if (index !== -1) this.troops.splice(index, 1);

        player.destroy?.();
    }

    static _releaseTaskAssignment(troop) {
        if (!troop) return;
        const task = troop.task;
        const teamNumber = troop?.body?.team;
        if (task?.taskType === "storagePickup" && task.storage && task.item) {
            task.storage.releasePickup?.(task.item, 1);
        }
        if (task && typeof task === "object" && typeof task.assigned === "number" && task.assigned > 0) {
            task.assigned -= 1;
        }
        if (troop.isFireman) {
            if (troop.pendingFuelJob?.assigned > 0) troop.pendingFuelJob.assigned -= 1;
            if (troop.pendingOvenJob?.assigned > 0) troop.pendingOvenJob.assigned -= 1;
            troop.pendingFuelJob = null;
            troop.pendingOvenJob = null;
            troop.skip = false;
        }
        troop.task = null;
        troop.taskMeta = null;
        if ((task?.forageType === "block" || task?.forageType === "seed") && teamNumber != null) {
            blockResourceManager.syncNodeFlash(teamNumber, task.value || task);
        }
    }

    static _finalizeDestroyedPlayer(player, teamNum, state) {
        const selectedIndex = this.selected.indexOf(player);
        if (selectedIndex !== -1) {
            this.selected.splice(selectedIndex, 1);
        }

        if (teamNum == null) return;

        const team = Teams.teamLists?.[`${teamNum}`];
        if (!team) return;

        if (state !== undefined && team.stateLists?.[state]) {
            Teams.removePlayerFromState(teamNum, player, state);
        }

        const idx = team.playerList.indexOf(player);
        if (idx !== -1) {
            team.playerList.splice(idx, 1);
        }

        if (team.playerList.length === 0 && teamNum) {
            showAlert(Player.scene, `Team ${teamNum} has been destroyed`, "#ff0000", 3000);
        }
    }

    static _updateVisibilityForTroop(troop) {
        const gx = Math.floor(troop.x / SQUARESIZE);
        const gy = Math.floor(troop.y / SQUARESIZE);

        if (gx !== troop.gridX || gy !== troop.gridY) {
            // Move the troop’s vision bubble (VisibilitySystem will decide if it should repaint)
            if (troop.visionId != null) {
                VisibilitySystem.moveVisionBubble(troop.visionId, gx, gy, troop.visionRadius);
            } else {
                // Fallback if somehow missing id
                troop.visionId = VisibilitySystem.addVisionBubble({
                    x: gx,
                    y: gy,
                    r: troop.visionRadius,
                    boost: troop.visionBoost ?? this.FRIENDLY_VISION_BOOST,
                });
            }
            troop.gridX = gx;
            troop.gridY = gy;
        }
    }

    static _resolveCarryVisual(troop) {
        const carryEntry = troop?.carrying;
        if (carryEntry) {
            const item = carryEntry.item || carryEntry;
            const count = Number.isFinite(carryEntry.count) ? carryEntry.count : 1;
            const iconKey = item?.icon;
            if (iconKey) {
                return {
                    iconKey,
                    count,
                    showCount: count > 1,
                };
            }
        }

        if (troop?.isFarmer && Number(troop?.waterBucket?.count) > 0) {
            const count = troop.type?.clampWaterBucket?.(troop) ?? Number(troop.waterBucket.count || 0);
            if (count <= 0) return null;
            return {
                iconKey: UI_ITEM_TYPES.unclean_water.icon,
                count,
                showCount: true,
            };
        }

        return null;
    }

    static _ensureCarryIndicator(troop) {
        if (troop._carryIndicator || !this.scene) return troop._carryIndicator;

        const icon = this.scene.add.image(0, 0, UI_ITEM_TYPES.food.icon)
            .setDisplaySize(this.CARRY_ICON_SIZE, this.CARRY_ICON_SIZE)
            .setOrigin(0.5);

        const badgeBg = this.scene.add.circle(7, 7, 7, 0x000000, 0.82)
            .setStrokeStyle(1, 0xffffff, 0.55);

        const countText = this.scene.add.text(7, 7, "1", {
            fontFamily: "Bungee",
            fontSize: "10px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 2
        }).setOrigin(0.5);

        const container = this.scene.add.container(troop.x, troop.y, [icon, badgeBg, countText])
            .setDepth((troop.depth ?? (BLOCKDEPTH + 1)) + 3)
            .setVisible(false);

        container.icon = icon;
        container.badgeBg = badgeBg;
        container.countText = countText;

        troop._carryIndicator = container;
        troop.once?.("destroy", () => {
            troop._carryIndicator = null;
            container.destroy();
        });

        return container;
    }

    static _updateCarryIndicator(troop) {
        const indicator = troop?._carryIndicator;
        if (!troop?.active || !troop?.scene) {
            indicator?.destroy?.();
            troop._carryIndicator = null;
            return;
        }

        if (troop.state === CONTROL_STATES.SLEEP_MODE) {
            indicator?.setVisible(false);
            return;
        }

        const visual = this._resolveCarryVisual(troop);
        if (!visual) {
            indicator?.setVisible(false);
            return;
        }

        const container = this._ensureCarryIndicator(troop);
        const yOffset = (troop.displayHeight || SQUARESIZE) / 2 + this.CARRY_ICON_OFFSET_Y;

        container.setPosition(troop.x, troop.y - yOffset);
        container.setDepth((troop.depth ?? (BLOCKDEPTH + 1)) + 3);
        container.icon.setTexture(visual.iconKey);
        container.setVisible(true);

        container.badgeBg.setVisible(visual.showCount);
        container.countText.setVisible(visual.showCount);

        if (visual.showCount) {
            container.countText.setText(`${visual.count}`);
        }
    }

    static _ensureSelectionIndicator(troop) {
        if (troop._selectionIndicator || !this.scene || !troop) return troop._selectionIndicator;

        const ring = this.scene.add.ellipse(troop.x, troop.y, 24, 12, 0xffffff, 0.10)
            .setStrokeStyle(2, 0xffffff, 0.7)
            .setDepth((troop.depth ?? (BLOCKDEPTH + 1)) - 0.5)
            .setVisible(false);

        troop._selectionIndicator = ring;
        troop.once?.("destroy", () => {
            if (troop._selectionIndicator === ring) troop._selectionIndicator = null;
            ring.destroy();
        });

        return ring;
    }

    static _destroySelectionIndicator(troop) {
        troop?._selectionIndicator?.destroy?.();
        if (troop) troop._selectionIndicator = null;
    }

    static _clearStatusEmote(troop) {
        const bubble = troop?._statusEmote;
        if (!bubble) return;
        bubble.updateEventOwner?.events?.off?.("update", bubble.updatePosition);
        bubble.hideEvent?.remove?.(false);
        bubble.hideTween?.stop?.();
        bubble.showTween?.stop?.();
        bubble.destroy?.();
        troop._statusEmote = null;
    }

    static _ensureStatusEmoteState(troop) {
        if (!troop) return null;
        troop._statusEmoteCooldowns ||= Object.create(null);
        return troop._statusEmoteCooldowns;
    }

    static _getStatusEmoteAnchor(troop, anchorFn = null) {
        if (typeof anchorFn === "function") {
            const custom = anchorFn(troop);
            if (custom && Number.isFinite(custom.x) && Number.isFinite(custom.y)) {
                return custom;
            }
        }

        return {
            x: troop.x,
            y: troop.y - Math.max(
                this.STATUS_EMOTE_Y_OFFSET,
                ((troop.displayHeight || SQUARESIZE) * 0.5) + 12
            ),
        };
    }

    static showStatusEmote(troop, text, opts = {}) {
        if (!troop?.active || !text || !this.scene) return false;

        const scene = troop.scene || this.scene;
        if (!scene) return false;
        if (!opts.allowSleeping && troop.state === CONTROL_STATES.SLEEP_MODE) return false;

        const cooldowns = this._ensureStatusEmoteState(troop);
        const now = this._sceneNowMs(troop);
        const key = String(opts.key || text);
        const cooldownMs = Math.max(0, Number(opts.cooldownMs ?? this.STATUS_EMOTE_COOLDOWN_MS) || 0);
        const nextAllowedAt = Number(cooldowns?.[key] || 0);
        if (cooldownMs > 0 && now < nextAllowedAt) return false;
        cooldowns[key] = now + cooldownMs;

        this._clearStatusEmote(troop);

        const label = scene.add.text(0, 0, String(text), {
            fontFamily: "Bungee",
            fontSize: `${Math.max(12, Number(opts.fontSize || 14))}px`,
            color: opts.textColor || "#f8fafc",
            stroke: opts.strokeColor || "#020617",
            strokeThickness: Math.max(2, Number(opts.strokeThickness || 3)),
            align: "center",
        }).setOrigin(0.5);

        const paddingX = Math.max(10, Number(opts.paddingX || 12));
        const paddingY = Math.max(6, Number(opts.paddingY || 7));
        const width = Math.max(28, Math.ceil(label.width) + paddingX * 2);
        const height = Math.max(24, Math.ceil(label.height) + paddingY * 2);
        const radius = Math.max(10, Number(opts.radius || 13));
        const bg = scene.add.graphics();

        bg.fillStyle(Number(opts.bgColor ?? 0x0f172a), Number(opts.bgAlpha ?? 0.92));
        bg.lineStyle(2, Number(opts.borderColor ?? 0xe2e8f0), Number(opts.borderAlpha ?? 0.58));
        bg.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
        bg.strokeRoundedRect(-width / 2, -height / 2, width, height, radius);
        bg.fillTriangle(-7, height / 2 - 1, 7, height / 2 - 1, 0, height / 2 + 10);

        const bubble = scene.add.container(0, 0, [bg, label])
            .setDepth(Math.max(BLOCKDEPTH + 5, (troop.depth ?? BLOCKDEPTH) + 4))
            .setScale(0.9)
            .setAlpha(0);

        const anchorFn = typeof opts.anchor === "function" ? opts.anchor : null;
        const bubbleRecord = bubble;
        bubbleRecord.updateEventOwner = scene;
        bubbleRecord.updatePosition = () => {
            if (!bubble.active || !troop?.active) {
                this._clearStatusEmote(troop);
                return;
            }

            if (!anchorFn && (troop.visible === false || troop.alpha === 0 || troop.state === CONTROL_STATES.SLEEP_MODE)) {
                this._clearStatusEmote(troop);
                return;
            }

            const anchor = this._getStatusEmoteAnchor(troop, anchorFn);
            bubble.setPosition(anchor.x, anchor.y);
            bubble.setDepth(Math.max(BLOCKDEPTH + 5, (troop.depth ?? BLOCKDEPTH) + 4));
        };

        bubbleRecord.hideEvent = scene.time.delayedCall(
            Math.max(100, Number(opts.durationMs ?? this.STATUS_EMOTE_DURATION_MS) || this.STATUS_EMOTE_DURATION_MS),
            () => {
                if (!bubble.active || troop?._statusEmote !== bubble) return;
                bubbleRecord.hideTween = scene.tweens.add({
                    targets: bubble,
                    alpha: 0,
                    scaleX: 0.94,
                    scaleY: 0.94,
                    duration: 140,
                    ease: "Quad.easeIn",
                    onComplete: () => this._clearStatusEmote(troop),
                });
            }
        );

        scene.events.on("update", bubbleRecord.updatePosition);
        bubbleRecord.updatePosition();
        bubbleRecord.showTween = scene.tweens.add({
            targets: bubble,
            alpha: 1,
            scaleX: 1,
            scaleY: 1,
            duration: 120,
            ease: "Back.easeOut",
        });
        bubble.once?.("destroy", () => {
            scene.events.off("update", bubbleRecord.updatePosition);
        });

        troop._statusEmote = bubble;
        troop.once?.("destroy", () => this._clearStatusEmote(troop));
        return true;
    }

    static _isCombatTargetableUnit(target) {
        if (!target?.active || !target?.body) return false;
        if (target.state === CONTROL_STATES.SLEEP_MODE) return false;
        if (target.visible === false || target.alpha === 0) return false;
        if (target.body?.enable === false) return false;
        return true;
    }

    static _dropTargetingAgainstUnit(targetTroop) {
        if (!targetTroop?.active) return;

        for (const troop of this.troops || []) {
            if (!troop?.active || troop === targetTroop) continue;

            if (troop._raiderRetaliationTarget === targetTroop) {
                troop._raiderRetaliationTarget = null;
            }
            if (troop._recentCombatAttacker === targetTroop) {
                this.clearRecentCombatAttacker(troop);
            }

            const forced = troop.forcedTarget === targetTroop;
            const tracked = troop.track?.[0]?.gameObject === targetTroop;
            if (!forced && !tracked) continue;

            fightManager.disengageFromCombat(troop, "combat_target_untargetable");
        }
    }

    static _updateAmbientEmotes(troop) {
        if (!troop?.active || troop.body?.team !== 1) return;

        const now = this._sceneNowMs(troop);
        const maxStamina = Math.max(1, Number(troop.maxStamina ?? 100) || 100);
        const stamina = Math.max(0, Number(troop.stamina ?? maxStamina) || 0);
        const tired = (stamina / maxStamina) <= this.TIRED_STAMINA_RATIO;
        const inEligibleState =
            troop.state === CONTROL_STATES.TRACK_MODE &&
            troop.visible !== false &&
            troop.alpha !== 0 &&
            !troop.task &&
            !troop.track &&
            !troop.timer &&
            !troop.currentPath?.length &&
            !troop.roam;

        if (tired && troop.state !== CONTROL_STATES.SLEEP_MODE && troop.state !== CONTROL_STATES.GO_HOME_MODE) {
            this.showStatusEmote(troop, "\u{1F971}", {
                key: "tired",
                cooldownMs: this.TIRED_EMOTE_COOLDOWN_MS,
            });
        }

        if (!inEligibleState) {
            troop._idleSinceAt = 0;
            return;
        }

        if (!troop._idleSinceAt) {
            troop._idleSinceAt = now;
            return;
        }

        if ((now - troop._idleSinceAt) < this.IDLE_EMOTE_DELAY_MS) return;
        if (this.showStatusEmote(troop, "\u{1F4AC}", {
            key: "idle",
            cooldownMs: this.IDLE_EMOTE_COOLDOWN_MS,
        })) {
            troop._idleSinceAt = now;
        }
    }

    static _updateSelectionIndicator(troop) {
        const ring = troop?._selectionIndicator;
        if (!troop?.active || !troop?.scene) {
            ring?.destroy?.();
            if (troop) troop._selectionIndicator = null;
            return;
        }

        const selectedLike = !!troop.selected || !!troop._miniBarSelectedFromTab;
        const hovered = !!troop._miniBarHover;
        const shouldShow = selectedLike || hovered;

        if (!shouldShow || troop.visible === false || troop.alpha === 0) {
            ring?.setVisible(false);
            return;
        }

        const indicator = this._ensureSelectionIndicator(troop);
        const isEnemy = troop.body?.team === 0;
        const baseW = Math.max(18, Math.min(34, (troop.displayWidth || SQUARESIZE) * 0.72));
        const baseH = Math.max(8, Math.min(16, baseW * 0.44));
        const pulse = selectedLike ? (1 + 0.06 * Math.sin((this.scene.time.now || 0) / 120)) : 1;
        const fillColor = selectedLike ? (isEnemy ? 0x7f1d1d : 0x0284c7) : 0xffffff;
        const strokeColor = selectedLike ? (isEnemy ? 0xffc4c4 : 0xcffafe) : 0xffffff;

        indicator.setPosition(
            troop.x,
            troop.y + Math.max(this.HIGHLIGHT_RING_OFFSET_Y, (troop.displayHeight || SQUARESIZE) * 0.34)
        );
        indicator.setDepth((troop.depth ?? (BLOCKDEPTH + 1)) - 0.5);
        indicator.setFillStyle(fillColor, selectedLike ? 0.18 : 0.08);
        indicator.setStrokeStyle(selectedLike ? 2 : 1.5, strokeColor, selectedLike ? 0.95 : 0.75);
        indicator.setDisplaySize(baseW * pulse, baseH * pulse);
        indicator.setVisible(true);
    }

    static _setTroopSelected(troop, selected) {
        if (!troop?.active) return;
        troop.selected = !!selected;
        this._updateSelectionIndicator(troop);
    }

    static selectSingleTroop(troop, { openDetails = false } = {}) {
        if (!troop?.active) return;
        this.clearSelection();
        this._setTroopSelected(troop, true);
        this.selected.push(troop);
        if (openDetails) {
            this.scene?.openDetailPage?.('players', tab => tab.select(troop));
        }
    }

    static refreshAllFoW(allVisibile=false) {
       for (const t of this.troops) VisibilitySystem.applyFoWToSprite(t, allVisibile);
    }

    static configureCubeInteractivity(cube){
        cube.selected = false; // Add a custom property to track selection state

        // Track last-known grid tile for visibility updates
        cube.gridX = Math.floor(cube.x / SQUARESIZE);
        cube.gridY = Math.floor(cube.y / SQUARESIZE);

        // give the player its own vision bubble (centered on grid)
        if (cube.body.team === 1) {
            cube.visionRadius = cube.visionRadius ?? 6;
            cube.visionBoost = cube.visionBoost ?? this.FRIENDLY_VISION_BOOST;
            cube.visionId = VisibilitySystem.addVisionBubble({
                x: cube.gridX,
                y: cube.gridY,
                r: cube.visionRadius,
                boost: cube.visionBoost,
            }, /*noRepaint=*/false);
        }

        // Default per-unit vision radius in tiles (tweak as you like)
        cube.visionRadius = cube.visionRadius ?? 6;

        // Add a pointerdown event listener to toggle selection
        cube.on('pointerdown', (pointer) => {
            if(Player.scene.berryMode){
                if(!Player.scene.checkSufficientBerries(1)) return;
                Player.scene.updateBerry(-1);
                StorageManager.consumeItemFromStorage(cube.body.team, UI_ITEM_TYPES.seedBerry);
                cube.health = Math.min(cube.maxHealth, cube.health + 30);
                cube.stamina = Math.min(cube.maxStamina ?? cube.stamina, (cube.stamina ?? 0) + 30);
                Player.showMiniBarsOnHit?.(cube);
                return;
            }
            // Clicked an enemy (team 0) → pick a fighter and send it after this target
            if (cube.body.team === 0) {
                Player.assignFighterToTarget(cube);
                // Optional: don't select enemies when you click them
                // return;
            }
            const wasSelected = !!cube.selected;
            this.clearSelection();
            if (!wasSelected) {
                this._setTroopSelected(cube, true);
                this.selected.push(cube);
            }
        });
    
        // Add a pointerover event listener to change texture on hover
        cube.on('pointerover', (pointer) => {
            Player.setMiniBarHover(cube, true);
        });

        // Add a pointerout event listener to revert texture when not hovered
        cube.on('pointerout', (pointer) => {
            Player.setMiniBarHover(cube, false);
        });

    }

    static moveTo(troop, path) {
        const {navMesh, navGrid} = this._getNavForTroop(troop);
        if (!Array.isArray(path) || path.length === 0) {
            // Raiders: if a POI is blocked, convert to siege instead of clearing task.
            if (troop.body?.team === 0 && typeof troop.tryBeginSiege === "function") {
                const didSiege = troop.tryBeginSiege();
                if (didSiege) return true;
            }

            console.log("No path found or path is empty.");
            if (troop.task) {
                this._releaseTaskAssignment(troop);
                Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
                PathRegistry.unregisterUnit(navMesh, troop);
            }
            return false;
        }

        troop.currentPath = path.filter(point =>
            point &&
            Number.isFinite(point.x) &&
            Number.isFinite(point.y)
        );

        if (!troop.currentPath.length) {
            console.log("No path found or path is empty.");
            if (troop.task) {
                this._releaseTaskAssignment(troop);
                Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
                PathRegistry.unregisterUnit(navMesh, troop);
            }
            return false;
        }

        troop.finalPos = troop.currentPath[troop.currentPath.length - 1];

        const firstPoint = troop.currentPath[0];
        const distToFirst = Phaser.Math.Distance.Between(troop.x, troop.y, firstPoint.x, firstPoint.y);
        if (distToFirst <= this._getPathArrivalRadius(troop)) {
            troop.currentPath.shift();
        }

        if (troop.currentPath.length === 0) {
            CombatSpacingCoordinator.clearRoamReservation(troop);
            troop.__pendingPolyIds = [];
            troop.body?.setVelocity?.(0, 0);
            this._snapTroopToPoint(troop, troop.finalPos);
            PathDebugDrawer.onPathEnd(troop);
            this.doAction(troop);
            return true;
        }

        PathDebugDrawer.onNewPath(troop);

        if (troop.__pendingPolyIds && troop.__pendingPolyIds.length) {
            PathRegistry.registerUnitPath(navMesh, troop, troop.__pendingPolyIds);
            troop.__pendingPolyIds = [];
        }
        return true;
    }

    static _playDeathAnimation(player) {
        const scene = player?.scene || this.scene;
        if (!scene || player?._deathAnimationPlayed) return;
        if (!scene.textures?.exists?.('player_death')) return;
        player._deathAnimationPlayed = true;

        if (!scene.anims?.exists?.('player_death_anim')) {
            scene.anims?.create?.({
                key: 'player_death_anim',
                frames: scene.anims.generateFrameNumbers('player_death', { start: 0, end: 5 }),
                frameRate: 8,
                repeat: 0,
            });
        }

        const fx = scene.add.sprite(Number(player.x) || 0, Number(player.y) || 0, 'player_death', 0)
            .setOrigin(0.5, 0.58)
            .setDepth(Math.max(BLOCKDEPTH + 3, (player.depth ?? BLOCKDEPTH) + 2))
            .setAlpha(0.92);
        const tint = player?.isShocker ? 0xb58cff : (player?.body?.team === 1 ? 0x57e389 : 0xff6b6b);
        const targetHeight = Math.max(28, Math.min(52, (player.displayHeight || SQUARESIZE) * 1.45));
        const scale = targetHeight / 44;
        fx.setScale(scale);
        fx.setTint(tint);
        fx.play('player_death_anim');
        fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
        scene.time?.delayedCall?.(1100, () => fx?.destroy?.());
    }

    static _worldTileIsWalkableForTroop(troop, worldX, worldY) {
        const { navGrid } = this._getNavForTroop(troop);
        const tx = Math.floor(worldX / SQUARESIZE);
        const ty = Math.floor(worldY / SQUARESIZE);
        return navGrid?.[ty]?.[tx] === 1;
    }

    static _regionCheckPointForTroop(troop, worldX = troop?.x, worldY = troop?.y) {
        const { navGrid } = this._getNavForTroop(troop);
        if (!Array.isArray(navGrid) || !Number.isFinite(worldX) || !Number.isFinite(worldY)) {
            return null;
        }

        const tx = Math.floor(worldX / SQUARESIZE);
        const ty = Math.floor(worldY / SQUARESIZE);
        const toCenter = (x, y) => ({
            x: x * SQUARESIZE + SQUARESIZE / 2,
            y: y * SQUARESIZE + SQUARESIZE / 2,
            tx: x,
            ty: y,
        });

        if (navGrid?.[ty]?.[tx] === 1) {
            return toCenter(tx, ty);
        }

        let best = null;
        let bestDist = Infinity;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = tx + dx;
                const ny = ty + dy;
                if (navGrid?.[ny]?.[nx] !== 1) continue;
                const center = toCenter(nx, ny);
                const dist = Phaser.Math.Distance.Between(worldX, worldY, center.x, center.y);
                if (dist < bestDist) {
                    best = center;
                    bestDist = dist;
                }
            }
        }

        return bestDist <= SQUARESIZE * 0.8 ? best : null;
    }

    static _hasLiveNavPathForTroop(troop, fromPoint, toPoint) {
        const { navMesh } = this._getNavForTroop(troop);
        if (!navMesh?.findPathDetailed || !fromPoint || !toPoint) return false;
        const result = navMesh.findPathDetailed(
            { x: fromPoint.x, y: fromPoint.y },
            { x: toPoint.x, y: toPoint.y },
            { includePolys: false }
        );
        return !!result?.points?.length;
    }

    static _canReachWorldForTroop(troop, targetWorldX, targetWorldY) {
        if (!troop?.active || !troop?.body) return false;

        const regionSystem = troop.body.team === 0 ? Map.enemyRegionSystem : Map.regionSystem;
        if (!regionSystem) return true;

        regionSystem.ensureUpToDate?.();
        const fromPoint = this._regionCheckPointForTroop(troop, troop.x, troop.y);
        const toPoint = this._regionCheckPointForTroop(troop, targetWorldX, targetWorldY);
        if (!fromPoint || !toPoint) return false;

        const fromRegion = regionSystem.getRegionIdForWorldPoint?.(fromPoint.x, fromPoint.y);
        const toRegion = regionSystem.getRegionIdForWorldPoint?.(toPoint.x, toPoint.y);

        if (
            Number.isFinite(fromRegion) &&
            Number.isFinite(toRegion) &&
            fromRegion >= 0 &&
            toRegion >= 0
        ) {
            if (fromRegion === toRegion) return true;
            return this._hasLiveNavPathForTroop(troop, fromPoint, toPoint);
        }

        return this._hasLiveNavPathForTroop(troop, fromPoint, toPoint);
    }

    static _pathSegmentBlockedForTroop(troop, nextPoint) {
        if (!troop || !nextPoint) return false;
        const { navGrid } = this._getNavForTroop(troop);
        if (!Array.isArray(navGrid)) return false;

        const dx = nextPoint.x - troop.x;
        const dy = nextPoint.y - troop.y;
        const dist = Math.hypot(dx, dy);
        const samples = Math.max(1, Math.ceil(dist / Math.max(1, SQUARESIZE / 3)));

        for (let i = 1; i <= samples; i++) {
            const t = i / samples;
            const wx = troop.x + dx * t;
            const wy = troop.y + dy * t;
            const tx = Math.floor(wx / SQUARESIZE);
            const ty = Math.floor(wy / SQUARESIZE);
            if (navGrid?.[ty]?.[tx] !== 1) return true;
        }

        return false;
    }

    static handlePathInvalidated(troop, navMesh = null, details = {}) {
        if (!troop?.active) return false;

        const nav = navMesh ?? this._getNavForTroop(troop).navMesh;
        if (nav) PathRegistry.unregisterUnit(nav, troop);
        troop.__pendingPolyIds = [];
        troop.currentPath = [];
        troop.body?.setVelocity?.(0, 0);
        PathDebugDrawer.onPathEnd(troop);

        if (troop.body?.team === 0) {
            Map.enemyRegionSystem?.markDirty?.();
            Map.enemyRegionSystem?.ensureUpToDate?.();
        } else {
            Map.regionSystem?.markDirty?.();
            Map.regionSystem?.ensureUpToDate?.();
        }

        const controller = troop?.type;
        if (
            troop.body?.team === 0 &&
            typeof controller?.handlePathInvalidated === "function" &&
            controller.handlePathInvalidated(troop, details)
        ) {
            return true;
        }

        if (!troop.task && !troop.track) {
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
        }

        return false;
    }

    static _clearRoamResetTimer(troop) {
        if (!troop?._roamResetTimer) return;
        troop._roamResetTimer.remove(false);
        troop._roamResetTimer = null;
    }

    static resetRoamState(troop) {
        if (!troop) return;
        this._clearRoamResetTimer(troop);
        troop.roam = false;
        troop._combatRoamDest = null;
        CombatSpacingCoordinator.clearRoamReservation(troop);
    }

    static tryReturnIdleTroopToTown(troop, { requireNoActiveEnemies = false } = {}) {
        if (!troop?.active || troop.body?.team !== 1) return false;
        if (troop.state !== CONTROL_STATES.TRACK_MODE) return false;
        if (troop.task || troop.track || troop.timer) return false;
        if (troop.currentPath?.length || troop.roam) return false;
        if (troop._returnSwimActive === true) return false;
        if (StorageManager.isCarrying(troop)) return false;
        if (troop.pendingFuelJob || troop.pendingOvenJob) return false;

        const stranded = !!(Teams.farFromCenter?.(troop) || this._isOnWater?.(troop));
        if (!stranded) return false;

        if (requireNoActiveEnemies) {
            const activeEnemies = (Teams.teamLists?.["0"]?.playerList || []).some(enemy => enemy?.active);
            if (activeEnemies) return false;
        }

        this.resetRoamState(troop);
        troop.currentPath?.splice?.(0);
        troop.finalPos = null;
        troop.body?.setVelocity?.(0, 0);
        return !!Teams.sendTroopToTown(troop);
    }

    static _normalizeIdleMovementState(troop) {
        if (!troop?.active) return;

        if (this._recoverStalledStorageDelivery(troop)) {
            return;
        }

        const idleNoMotion =
            !troop.currentPath?.length &&
            !troop.task &&
            !troop.track &&
            !troop.timer;

        if (troop.state === CONTROL_STATES.HEADING_TO_GUARD && idleNoMotion) {
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
            troop.roam = false;
        }

        if (troop.state === CONTROL_STATES.BACK_TO_TOWN && idleNoMotion) {
            if (StorageManager.isCarrying(troop) && StorageManager.tryCreateStorageDeliveryTask(troop)) {
                return;
            }
            if (troop.currentOrder?.status === "active" && OrderRunner.stepUnit(troop)) {
                return;
            }
            const path = Teams.sendTroopToTown(troop);
            if (path?.length) {
                return;
            }
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
            troop.roam = false;
            troop.finalPos = null;
            troop.body?.setVelocity?.(0, 0);
            troop.play?.(troop.idle);
        }

        if (
            troop.state === CONTROL_STATES.TRACK_MODE &&
            troop.roam &&
            idleNoMotion &&
            !troop._roamResetTimer
        ) {
            this.resetRoamState(troop);
        }
    }

    static _recoverStalledStorageDelivery(troop) {
        const task = troop?.task;
        if (!troop?.active || !troop?.body) return false;
        if (troop._returnSwimActive === true) return false;
        if (troop.state !== CONTROL_STATES.SEND_TO_STORAGE) return false;
        if (task?.taskType !== "storageDelivery") return false;
        if (troop.timer || troop.currentPath?.length) return false;
        if (!this._worldTileIsWalkableForTroop(troop, troop.x, troop.y)) return false;

        if (StorageManager.isCarrying(troop) && this._repathCurrentTaskToApproach(troop, CONTROL_STATES.SEND_TO_STORAGE)) {
            return true;
        }

        const teamNumber = troop.body.team;
        const directOrderId = task.directOrderId ?? troop.carryingDirectOrderId ?? null;
        this._releaseTaskAssignment(troop);
        troop.currentPath?.splice?.(0);
        troop.finalPos = null;
        troop.body?.setVelocity?.(0, 0);
        Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
        StorageManager.pruneTeamDeliveryTasks?.(teamNumber);

        if (!StorageManager.isCarrying(troop)) {
            return true;
        }

        if (directOrderId != null && troop.carryingDirectOrderId == null) {
            troop.carryingDirectOrderId = directOrderId;
        }

        const reassigned = StorageManager.tryCreateStorageDeliveryTask(troop);
        if (!reassigned) {
            StorageManager.pruneTeamDeliveryTasks?.(teamNumber);
        }
        return true;
    }

    static _taskRepathState(troop) {
        return troop?.taskMeta?.state ?? troop?.state ?? null;
    }

    static _repathCurrentTaskToApproach(troop, stateOverride = null) {
        const task = troop?.task;
        const state = stateOverride ?? this._taskRepathState(troop);
        if (!troop?.active || !task || state == null) return false;
        if (!Number.isFinite(Number(task.x)) || !Number.isFinite(Number(task.y))) return false;

        if (troop.state !== state) {
            Teams.movePlayerState(troop, state);
        }

        if (Manager.buildType?.(state)) {
            if (!task.type) return false;
            const approachTile = Manager._resolveApproachTileForTask?.(troop, task, state);
            if (!approachTile?.path?.length) return false;

            troop.destX = approachTile.tx;
            troop.destY = approachTile.ty;
            if (approachTile.polyIds?.length) troop.__pendingPolyIds = approachTile.polyIds;
            return this.moveTo(troop, approachTile.path);
        }

        const path = this.pathTo(troop, task.x, task.y, true);
        if (!path?.length) return false;
        return this.moveTo(troop, path);
    }

    static _getPathArrivalRadius(sprite, currentSpeed = null) {
        const scene = sprite?.scene ?? this.scene;
        const speed = Number.isFinite(currentSpeed)
            ? Math.max(0, currentSpeed)
            : Math.max(0, sprite?.body?.velocity?.length?.() ?? 0);
        const loopDeltaSec = Math.max(1 / 240, (scene?.game?.loop?.delta ?? 16.67) / 1000);
        const simSpeed = Math.max(
            1,
            Number(scene?.getAppliedSimulationSpeed?.() ?? scene?.getSimulationSpeed?.() ?? 1)
        );
        const projectedTravel = speed * loopDeltaSec * simSpeed;
        return Phaser.Math.Clamp(Math.max(6, projectedTravel * 1.35), 6, SQUARESIZE * 0.45);
    }

    static _snapTroopToPoint(sprite, point) {
        if (!sprite || !point) return;
        if (sprite.body?.reset) {
            sprite.body.reset(point.x, point.y);
            return;
        }
        sprite.setPosition?.(point.x, point.y);
        sprite.body?.setVelocity?.(0, 0);
    }


    static findBestStartPos(sprite, sx, sy) {
        // 🧱 3. Search surrounding 8 tiles (including diagonals)
        const { navMesh, navGrid } = Player._getNavForTroop(sprite);

        const directions = [
            [-1, -1], [0, -1], [1, -1],
            [-1,  0],          [1,  0],
            [-1,  1], [0,  1], [1,  1]
        ];
    
        for (let [dx, dy] of directions) {
            const nx = sx + dx;
            const ny = sy + dy;
    
            // Skip out-of-bounds
            if (ny < 0 || ny >= navGrid.length || nx < 0 || nx >= navGrid[0].length) {
                continue;
            }
    
            // Check if tile is walkable
            if (navGrid[ny][nx] === 1) {
                // Convert to pixel position
                const px = nx * SQUARESIZE + SQUARESIZE / 2;
                const py = ny * SQUARESIZE + SQUARESIZE / 2;
    
                // Check distance to center of tile
                const dist = Phaser.Math.Distance.Between(sprite.body.x, sprite.body.y, px, py);
                if (dist <= 23) {
                    return [nx, ny];
                }
            }
        }
    
        // 🚫 4. No valid nearby tile
        return [-1, -1];
    }

    // Player.js
    static pathTo(troop, fx, fy, gridSpot = true){
        const { navMesh, navGrid } = Player._getNavForTroop(troop);

        let troopX = Math.floor(troop.x / SQUARESIZE);
        let troopY = Math.floor(troop.y / SQUARESIZE);

        let startX = troop.x;
        let startY = troop.y;

        // IMPORTANT: use navGrid for the team, not Map.navGrid
        if (!navGrid[troopY] || navGrid[troopY][troopX] !== 1) {
            let [newX, newY] = Player.findBestStartPos(troop, troopX, troopY); 
            // ^ if findBestStartPos uses Map.navGrid internally, see note below

            if (newX === -1) {
            console.log("No valid start tile nearby");
            return null;
            } else {
            startX = newX * SQUARESIZE + SQUARESIZE/2;
            startY = newY * SQUARESIZE + SQUARESIZE/2;
            console.log("New valid tile:", newX, newY);
            }
        }

        let destX = fx, destY = fy;
        if (gridSpot) {
            destX = fx * SQUARESIZE + SQUARESIZE / 2;
            destY = fy * SQUARESIZE + SQUARESIZE / 2;
        }

        // IMPORTANT: use navMesh for the team
        const result = navMesh.findPathDetailed(
            { x: startX, y: startY },
            { x: destX, y: destY },
            { includePolys: true }
        );

        if (!result || !result.points || result.points.length === 0) {
            console.warn(`Troop (team ${troop.body.team}) could not find a path to (${fx},${fy}).`);
            return null;
        }

        troop.__pendingPolyIds = result.polyIds || [];
        return result.points;
    }

    // Player.js
    static getValidStartWorld(troop){
        const troopX = Math.floor(troop.x / SQUARESIZE);
        const troopY = Math.floor(troop.y / SQUARESIZE);

        // already on walkable tile
        if (Map.navGrid?.[troopY]?.[troopX]) {
            return { x: troop.x, y: troop.y };
        }

        const [newX, newY] = Player.findBestStartPos(troop, troopX, troopY);
        if (newX === -1) return null;

        return {
            x: newX * SQUARESIZE + SQUARESIZE/2,
            y: newY * SQUARESIZE + SQUARESIZE/2,
        };
    }

    // static handleReMap(sprite){
    // // Attempt to re‐path from the sprite’s current world‐position to its final destination
    //     const start = { x: sprite.x, y: sprite.y };
    //     const end   = sprite.finalPos; // assigned earlier in Player.moveTo()
    //     const newPath = Map.navMesh.findPath(start, end);
    //     if (newPath && newPath.length > 0) {
    //         console.log("New path found")
    //         this.moveTo(sprite, newPath)
    //     } else {
    //         // No valid path found → abort movement
    //         console.warn("No valid path found, now in trackMode")
    //         sprite.currentPath = [];
    //         this.setAnimState(sprite, 'idle');
    //         Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_MODE);
    //         return false;
    //     }
    //     return true; // skip the rest of this frame so we don’t walk into a blocked tile
    // }

    static followPath(sprite) {
        Manager.handleDurationCheck(sprite);

        // 🔥 1) FIRST: if we're tracking a target and already in range,
        // go straight into ATTACK_MODE – even if there is no path.
        if (
            (sprite.state === CONTROL_STATES.TRACK_MODE ||
            sprite.state === CONTROL_STATES.TRACK_TARGET ||
            sprite.state === CONTROL_STATES.ATTACK_MODE) &&
            sprite.weapon
        ) {
            const attackTarget =
                (sprite.forcedTarget?.active && sprite.forcedTarget) ||
                sprite.track?.[0]?.gameObject ||
                null;

            if (attackTarget && this._isAttackReady(sprite, attackTarget)) {
                if (sprite.isGunslinger && sprite._gunslingerKiting && sprite.currentPath?.length) {
                    fightManager.attack(sprite);
                } else {
                    this.clearGunslingerKiteState(sprite);
                    sprite.body.setVelocity(0, 0);
                    if (sprite.currentPath && sprite.currentPath.length) sprite.currentPath.length = 0;
                    sprite.finalPos = null;
                    Teams.movePlayerState(sprite, CONTROL_STATES.ATTACK_MODE);
                    this.doAction(sprite);
                    return;
                }
            }
        }

        // 2) If we aren't walking anywhere, just idle.
        if (!sprite.currentPath || sprite.currentPath.length === 0) {
            CombatSpacingCoordinator.clearRoamReservation(sprite);
            sprite.finalPos = null;
            if (sprite.poseLock?.textureKey) {
                sprite.body.setVelocity(0, 0);
                sprite.rotation = 0;
                sprite.anims?.stop?.();
                if (sprite.texture?.key !== sprite.poseLock.textureKey) {
                    sprite.setTexture(sprite.poseLock.textureKey);
                }
                if (Number.isInteger(sprite.poseLock.frame)) {
                    sprite.setFrame(sprite.poseLock.frame);
                }
                PathDebugDrawer.onPathEnd(sprite);
                return;
            }
            this.setAnimState(sprite, sprite.idle);
            updateDirectionalAnimationFromVelocity(sprite, 0, 0, false);
            PathDebugDrawer.onPathEnd(sprite); // optional cleanup
            return;
        }
        
        // ✅ Gunslinger: if we're in destroy mode and we already have range + LOS, stop pathing and start firing
        if (
        sprite?.active &&
        sprite.weapon?.projectile &&
        sprite.task &&
        (sprite.state === CONTROL_STATES.DESTROY_MODE || sprite.state === CONTROL_STATES.DESTROY_MODE_T)
        ) {
            const ok = sprite._canShootDestroyTarget?.();
            if (ok) {
                sprite.body.setVelocity(0, 0);
                sprite.currentPath.length = 0;
                sprite.finalPos = null;
                this.doAction(sprite);
                return;
            }
        }

        // 3) Normal movement logic
        // Player.js - inside followPath(), in the "Normal movement logic" section
        PathRegistry.updateUnitProgress(sprite.body.team ? Map.navMesh : Map.enemyNavMesh, sprite, new Phaser.Math.Vector2(sprite.x, sprite.y));
        // after movement update, each tick while walking
        PathDebugDrawer.tickUnit(sprite, this.scene.time.now);
        const onWater = this._isOnWater(sprite);
        this.setAnimState(sprite, onWater ? (sprite.swim || sprite.walk) : sprite.walk);
        let nextPoint = sprite.currentPath[0];
        // Disabled for now: this raw navGrid segment sampling has been producing
        // false positives on otherwise valid precalculated paths, especially for
        // interaction routes around ovens/storage.
        // if (this._pathSegmentBlockedForTroop(sprite, nextPoint)) {
        //     this.handlePathInvalidated(
        //         sprite,
        //         sprite.body.team ? Map.navMesh : Map.enemyNavMesh,
        //         { reason: "path_segment_blocked" }
        //     );
        //     return;
        // }
        // Team 0 units (raiders/grunts) do not use stamina for movement.
        const baseSpeed = sprite?.type?.speed ?? sprite.speed ?? 0;
        let currentSpeed = baseSpeed;
        if (sprite.body.team === 1) {
            const maxStamina = Number(sprite.maxStamina) > 0 ? Number(sprite.maxStamina) : 100;
            const stamina = Number.isFinite(Number(sprite.stamina)) ? Number(sprite.stamina) : maxStamina;
            const staminaFactor = Math.max(0.2, stamina / maxStamina);
            currentSpeed = baseSpeed * staminaFactor;

            if (!sprite.roam && stamina > 0) {
                const drain = Number(sprite?.type?.stamina) || 0;
                sprite.stamina = Math.max(0, stamina - drain);
            }
        }
        currentSpeed *= Math.max(0.5, Number(sprite.moveSpeedMultiplier ?? 1) || 1);
        currentSpeed *= getMarketMoveMultiplier(sprite);
        currentSpeed *= this.getMovementSlowFactor(sprite);

        if(sprite.body.team == 1){
            this._updateVisibilityForTroop(sprite);
            VisibilitySystem.applyFoWToSprite(sprite);
        }

        const distToNext = Phaser.Math.Distance.Between(sprite.x, sprite.y, nextPoint.x, nextPoint.y);
        const arrivalRadius = this._getPathArrivalRadius(sprite, currentSpeed);

        if (distToNext <= arrivalRadius) {
            this._snapTroopToPoint(sprite, nextPoint);
            sprite.currentPath.shift();
            PathDebugDrawer.onWaypointAdvanced(sprite);
            if (sprite.currentPath.length == 0) {
                CombatSpacingCoordinator.clearRoamReservation(sprite);
                if (sprite.state === CONTROL_STATES.FLEE_MODE) {
                    sprite.body.setVelocity(0, 0);
                    this.updateTracking(sprite);
                    return;
                }
                if (sprite.roam && !sprite.task) {
                    this._clearRoamResetTimer(sprite);
                    const roamDuration = Phaser.Math.Between(1000, 4000);
                    sprite._roamResetTimer = sprite.scene.time.delayedCall(roamDuration, () => {
                        if (sprite?._roamResetTimer) {
                            sprite._roamResetTimer = null;
                        }
                        if (!sprite?.active) return;
                        if (
                            !sprite.currentPath?.length &&
                            !sprite.task &&
                            !sprite.track &&
                            sprite.state === CONTROL_STATES.TRACK_MODE
                        ) {
                            this.resetRoamState(sprite);
                        }
                    });
                }
                sprite.body.setVelocity(0, 0);
                this.doAction(sprite);
            }
            return;
        }

        const loopDeltaSec = Math.max(1 / 240, (sprite.scene?.game?.loop?.delta ?? 16.67) / 1000);
        const simSpeed = Math.max(
            1,
            Number(sprite.scene?.getAppliedSimulationSpeed?.() ?? sprite.scene?.getSimulationSpeed?.() ?? 1)
        );
        const maxApproachSpeed = distToNext / (loopDeltaSec * simSpeed);
        const approachSpeed = Math.max(0, Math.min(currentSpeed, maxApproachSpeed));

        const desired = new Phaser.Math.Vector2(nextPoint.x - sprite.x, nextPoint.y - sprite.y)
            .setLength(approachSpeed);
        // Calculate new velocity
        let newVelocity = new Phaser.Math.Vector2(
            desired.x,
            desired.y
        );
        sprite.body.setVelocity(newVelocity.x, newVelocity.y);

        let faceVx = newVelocity.x;
        let faceVy = newVelocity.y;
        if (sprite.isGunslinger && sprite._gunslingerKiting) {
            const kiteTarget =
                (sprite.forcedTarget?.active && sprite.forcedTarget) ||
                sprite.track?.[0]?.gameObject ||
                null;
            if (kiteTarget?.active) {
                faceVx = kiteTarget.x - sprite.x;
                faceVy = kiteTarget.y - sprite.y;
            } else {
                faceVx = -newVelocity.x;
                faceVy = -newVelocity.y;
            }
        }

        updateDirectionalAnimationFromVelocity(sprite, faceVx, faceVy, true);
        AudioManager.tryPlayStep(sprite);
        // Rotate the sprite to face the direction of movement
        if (newVelocity.length() > 0 && !shouldUseDirectionalFacing(sprite)) {
            sprite.rotation = Phaser.Math.Angle.Between(0, 0, newVelocity.x, newVelocity.y); // Calculate angle
        }
    }

    static doAction(sprite){
        if (sprite?.customDoAction?.() === true) {
            return;
        }
        if(sprite.state == CONTROL_STATES.FARM_MODE){
            tillManager.beginTilling(sprite);
        }
        else if(sprite.state == CONTROL_STATES.ATTACK_MODE){
            fightManager.attack(sprite)
        }
        else if(sprite.state == CONTROL_STATES.HARVEST_MODE){
            tillManager.harvestCrop(sprite)
        }
        else if(sprite.state == CONTROL_STATES.BUILD_MODE_T){
            buildingManager.beginBuilding(sprite) //test, moved assign one
        }
        else if(sprite.state == CONTROL_STATES.BUILD_MODE_B){
            buildingManager.beginBuildingBlock(sprite)
        }
        else if(sprite.state == CONTROL_STATES.FIX_BUILDING){
            buildingManager.beginFixingBuilding(sprite);
        }
        else if(sprite.state == CONTROL_STATES.DESTROY_MODE){
            buildingManager.beginDestroyingBlock(sprite)
        }
        else if(sprite.state == CONTROL_STATES.SEED_MODE){
            seedManager.beginSeeding(sprite);
        }
        else if(sprite.state == CONTROL_STATES.R_FARM_MODE){
            tillManager.harvestCrop(sprite)
        }
        else if(sprite.state == CONTROL_STATES.WATER_CROPS_MODE){
            tillManager.beginWatering(sprite);
        }
        else if(sprite.state == CONTROL_STATES.USER_MODE){
            Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_MODE);
        }
        else if(sprite.state == CONTROL_STATES.BACK_TO_TOWN){
            Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_MODE);
        }
        else if (sprite.state === CONTROL_STATES.GET_WATER_MODE) {
            if(sprite.isFireman) Fireman.firemanCompleteWaterPickup(sprite)
            else Farmer.giveTroopWater(sprite)
        }
        else if(sprite.state === CONTROL_STATES.GET_FROM_STORAGE){
            StorageManager.tryPickupFromStorage(sprite);
        }
        else if (sprite.state === CONTROL_STATES.SEND_TO_STORAGE){
            StorageManager.handleStorageDropoff(sprite)
        }
        else if(sprite.state == CONTROL_STATES.SEND_TO_OVEN){
            if (sprite.task?.taskType === 'ovenFuelDelivery') {
                Fireman.deliverFuelToOven(sprite);
            }else{
                Fireman.deliverToOven(sprite)
            }
        }
        else if(sprite.state == CONTROL_STATES.GET_FROM_OVEN){
            Fireman.handleOvenPickupComplete(sprite);
        }
        else if(sprite.state == CONTROL_STATES.GET_BLOCK_RESOURCE){
            blockResourceManager.beginFarmingBlockResource(sprite);
        }
        else if (sprite.state == CONTROL_STATES.GO_HOME_MODE) {
            if (sprite.home) {
                StaminaManager.arriveAtHome(sprite);
            }
        }
        else if (sprite.state == CONTROL_STATES.SLEEP_MODE) {
            // do nothing, stamina regen handled in StaminaManager.updateTroop
        }
        else if (sprite.state == CONTROL_STATES.HEADING_TO_GUARD) {
            Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_MODE)
            sprite.roam = false;
            this.roam(sprite);
        }
        else if (
            sprite.state === CONTROL_STATES.SIEGE_MODE ||
            sprite.state === CONTROL_STATES.DESTROY_MODE_T
        ) {
            buildingManager.beginDestroyingTile(sprite);
        }
    }

    static mostThreatening(troop, neighbours) {
        let mostThreat = null;
        let shortestDistance = Infinity;

        // Troop position and velocity
        const troopPosition = new Phaser.Math.Vector2(troop.x, troop.y);
        const troopVelocity = new Phaser.Math.Vector2(troop.body.velocity.x, troop.body.velocity.y);

        neighbours.forEach(neighbour => {
            if (neighbour === troop.body || neighbour.dontTrack) return; // Ignore itself
    
            // Neighbor position
            const neighbourPosition = new Phaser.Math.Vector2(neighbour.x, neighbour.y);
    
            // Vector from troop to neighbor
            const toNeighbour = new Phaser.Math.Vector2(
                neighbourPosition.x - troopPosition.x,
                neighbourPosition.y - troopPosition.y
            );
    
            // Check if neighbor is on the trajectory
            const projectedLength = toNeighbour.dot(troopVelocity) / troopVelocity.lengthSq();
    
            if (projectedLength >= 0) {
                // Calculate the closest point on the line
                const closestPoint = new Phaser.Math.Vector2(
                    troopPosition.x + projectedLength * troopVelocity.x,
                    troopPosition.y + projectedLength * troopVelocity.y
                );
    
                // Check the perpendicular distance from the neighbor to the line
                const perpendicularDistance = Phaser.Math.Distance.BetweenPoints(neighbourPosition, closestPoint);
    
                // Threshold for "collision" (adjust this based on hitbox size)
                const collisionThreshold = troop.displayWidth / 2;
    
                if (perpendicularDistance <= collisionThreshold) {
                    // Calculate straight-line distance to neighbor
                    const distance = Phaser.Math.Distance.Between(
                        troopPosition.x, troopPosition.y,
                        neighbourPosition.x, neighbourPosition.y
                    );
                        
                    // Update most threatening if closer
                    if (distance < shortestDistance) {
                        shortestDistance = distance;
                        mostThreat = neighbour;
                    }
                }
            }
        });
    
        return mostThreat;
    }

    static assignFighterToTarget(targetSprite) {
        if (!targetSprite || !targetSprite.body) return;

        const team = Teams.teamLists["1"];
        if (!team || !team.fighterList || !team.fighterList.length) return;

        const fighters = team.fighterList;

        let closestFree = null;
        let closestFreeDist = Infinity;
        let closestBusy = null;
        let closestBusyDist = Infinity;

        const tx = targetSprite.x;
        const ty = targetSprite.y;

        for (const f of fighters) {
            if (!f || !f.body || !f.active) continue;
            if (f.health !== undefined && f.health <= 0) continue;

            const dx = f.x - tx;
            const dy = f.y - ty;
            const d2 = dx * dx + dy * dy;

            // "Free" = not currently tracking a target
            const isFree =
                !f.track ||
                !f.track[0] ||
                f.state !== CONTROL_STATES.TRACK_TARGET;

            if (isFree) {
                if (d2 < closestFreeDist) {
                    closestFreeDist = d2;
                    closestFree = f;
                }
            } else {
                if (d2 < closestBusyDist) {
                    closestBusyDist = d2;
                    closestBusy = f;
                }
            }
        }

        const chosen = closestFree || closestBusy;
        if (!chosen) return;

        // Release any currently claimed job through the centralized task interrupt flow.
        // This keeps TaskBoard/assigned counters consistent with the new system.
        InterruptController.interruptTroop(chosen, "manual_attack_assignment", CONTROL_STATES.TRACK_MODE);
        this.clearRecentCombatAttacker(chosen);
        this.clearGunslingerKiteState(chosen);

        // 🔒 Mark this as a “hard assignment” target
        chosen.forcedTarget = targetSprite;
        CombatSpacingCoordinator.setTroopFocusTarget(chosen, targetSprite, { forced: true });
        const playerTeam = Teams.teamLists["1"];
        let fightTask = null;
        if (playerTeam?.fightingList) {
            fightTask = playerTeam.fightingList.find(t => {
                const tgt = t?.target || t;
                return tgt === targetSprite;
            }) || null;

            if (!fightTask) {
                fightTask = {
                    x: targetSprite.x,
                    y: targetSprite.y,
                    body: targetSprite.body,
                    target: targetSprite,
                    assigned: 0,
                    forced: true,
                };
                playerTeam.fightingList.push(fightTask);
            }
        }

        chosen.roam = false;
        if (fightTask) {
            chosen.task = fightTask;
            fightTask.assigned = Math.max(0, Number(fightTask.assigned || 0)) + 1;
            Manager._setTaskMeta?.(chosen, fightTask, CONTROL_STATES.TRACK_TARGET, null);
        }

        chosen.track = [
            targetSprite.body,
            { x: targetSprite.x, y: targetSprite.y }
        ];
        this._markCombatTargetSticky(chosen, targetSprite, this.FIGHTER_TARGET_STICKY_MS * 1.5);

        // Go into chase mode
        Teams.movePlayerState(chosen, CONTROL_STATES.TRACK_TARGET);

        // Kick their AI once so they immediately start pathing
        Player.updateTracking(chosen);
    }

    static mostClosestEnemy(troop, neighbours) {
        let mostClosest = null;
        let shortestDistance = Infinity;
        let search = !troop.forcedTarget; //always check for optimal enemy
        const canReachTarget = (body) => {
            if (!body) return false;
            const go = body.gameObject;
            const targetX = Number.isFinite(go?.x) ? go.x : body.x;
            const targetY = Number.isFinite(go?.y) ? go.y : body.y;
            return Player._canReachWorldForTroop(troop, targetX, targetY);
        };
        // troop.state == CONTROL_STATES.TRACK_TARGET ? search = false : search = true;
        if(search){
            const candidates = [];
            neighbours.forEach(neighbour => {
                if (neighbour === troop.body || neighbour.team == troop.body.team || (neighbour.gameObject && !neighbour.gameObject.active) || neighbour.dontTrack) return;
                if (!canReachTarget(neighbour)) return;
                const target = neighbour.gameObject;
                if (!target?.active) return;
                if (target?.body && !this._isCombatTargetableUnit(target)) return;
                candidates.push(target);
            });

            const recentAttacker = troop.body?.team === 1 && Player._isFighterUnit?.(troop)
                ? this._getRecentCombatAttacker(troop)
                : null;
            if (recentAttacker?.body && !candidates.includes(recentAttacker) && canReachTarget(recentAttacker.body)) {
                candidates.push(recentAttacker);
            }

            const currentTarget = troop.track?.[0]?.gameObject ?? null;
            let bestTarget = null;
            if (troop.body?.team === 1 && Player._isFighterUnit?.(troop)) {
                bestTarget = troop.isGunslinger
                    ? this._chooseGunslingerCombatTarget(troop, candidates, { currentTarget })
                    : this._chooseImmediateFighterTarget(troop, candidates, currentTarget);
            }

            if (!bestTarget) {
                bestTarget = CombatSpacingCoordinator.chooseBestEnemyTarget(troop, candidates, {
                    currentTarget,
                    strictTargetSpread: troop.body?.team === 1 && Player._isFighterUnit?.(troop),
                    strictTargetSpreadMaxExtraDistance: this.FIGHTER_SPREAD_MAX_EXTRA_DISTANCE,
                    strictTargetSpreadMaxRatio: this.FIGHTER_SPREAD_MAX_RATIO,
                    keepFocusWeight: troop.body?.team === 1 && Player._isFighterUnit?.(troop) ? 8 : 1.5,
                });
            }

            if (bestTarget?.body) {
                mostClosest = bestTarget.body;
                shortestDistance = Phaser.Math.Distance.Between(troop.x, troop.y, bestTarget.x, bestTarget.y);
            }
        }

        // We found a closest enemy body (mostClosest)
        // Use tile change on SQUARESIZE grid to decide if we need a new path.
        if (troop.track && (troop.track[0] === mostClosest || troop.state === CONTROL_STATES.TRACK_TARGET)) {
            const trackedBody = (troop.track[0] === mostClosest) ? mostClosest : troop.track[0];
            if (!canReachTarget(trackedBody)) {
                CombatSpacingCoordinator.clearTroopFocus(troop);
                troop.track = null;
                return false;
            }

            const go = trackedBody?.gameObject;
            if (!go) return false;
            if (go?.body && !this._isCombatTargetableUnit(go)) {
                CombatSpacingCoordinator.clearTroopFocus(troop);
                troop.track = null;
                return false;
            }
            CombatSpacingCoordinator.setTroopFocusTarget(troop, go, { forced: troop.forcedTarget === go });

            const lastTileX = Math.floor(troop.track[1].x / SQUARESIZE);
            const lastTileY = Math.floor(troop.track[1].y / SQUARESIZE);
            const curTileX  = Math.floor(go.x / SQUARESIZE);
            const curTileY  = Math.floor(go.y / SQUARESIZE);

            // Same tile as last time → no repath
            if (lastTileX === curTileX && lastTileY === curTileY) {
                return false;
            }

            // Tile changed → update stored target pos, tell caller to repath
            troop.track[1].x = go.x;
            troop.track[1].y = go.y;
            return true;
        }
        else if (mostClosest) {
            // New target acquired
            if (!canReachTarget(mostClosest)) return false;
            const go = mostClosest.gameObject;
            if (!go) return false;
            if (go?.body && !this._isCombatTargetableUnit(go)) return false;
            CombatSpacingCoordinator.setTroopFocusTarget(troop, go, { forced: troop.forcedTarget === go });

            troop.track = [
                mostClosest,
                {
                    x: go.x,
                    y: go.y
                }
            ];
            this._markCombatTargetSticky(troop, go);

            return true;
        }

        return false;
    }

    static findClosestEnemyBody(troop, neighbours) {
        let closest = null;
        let bestDistSq = Infinity;
        const tx = troop.x;
        const ty = troop.y;

        neighbours.forEach(body => {
            if (!body || body === troop.body) return;
            if (body.dontTrack) return;
            if (body.team == null || body.team === troop.body.team) return;

            const go = body.gameObject;
            if (go && !go.active) return;
            if (go?.body && !this._isCombatTargetableUnit(go)) return;

            const dx = body.x - tx;
            const dy = body.y - ty;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDistSq) {
                bestDistSq = d2;
                closest = body;
            }
        });

        return closest;
    }

    static _sceneNowMs(troop = null) {
        const scene = troop?.scene ?? this.scene;
        return scene?.getSimulationNow?.() ?? scene?.simNowMs ?? scene?.time?.now ?? Date.now();
    }

    static _handleNonCombatFlee(troop, closest) {
        const now = this._sceneNowMs(troop);

        if (!closest) {
            if (troop.state === CONTROL_STATES.FLEE_MODE) {
                const lastThreatAt = Number(troop._fleeLastThreatAt || 0);
                if (now - lastThreatAt < this.FLEE_SAFE_GRACE_MS) return true;

                troop._fleeThreatId = null;
                troop._fleeLastThreatAt = 0;
                troop._fleeNextRepathAt = 0;
                troop._fleeDest = null;
                this.resetRoamState(troop);
                Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
            }
            return true;
        }

        troop._fleeLastThreatAt = now;
        const threatId = closest.gameObject?.id ?? closest.id ?? null;
        const threatChanged = troop._fleeThreatId !== threatId;
        const needsEnterFlee = troop.state !== CONTROL_STATES.FLEE_MODE;

        if (needsEnterFlee) {
            Player.handleStateIntteruptStart(troop, CONTROL_STATES.FLEE_MODE);
            troop.track = null;
            troop._fleeNextRepathAt = 0;
            troop._fleeDest = null;
            this.showStatusEmote(troop, "\u{1F631}", {
                key: "flee",
                cooldownMs: 1800,
            });
            AudioManager.playFleeScream?.();
        }

        const hasPath = !!troop.currentPath?.length;
        if (!needsEnterFlee && hasPath && !threatChanged && now < Number(troop._fleeNextRepathAt || 0)) {
            return true;
        }

        const fleeDest = this.computeFleeDestination(troop, closest);
        if (!fleeDest) return true;

        const previousDest = troop._fleeDest;
        const sameDest = previousDest &&
            Phaser.Math.Distance.Between(previousDest.x, previousDest.y, fleeDest.x, fleeDest.y) < this.FLEE_DEST_EPSILON;

        if (!needsEnterFlee && hasPath && sameDest && now < Number(troop._fleeNextRepathAt || 0)) {
            return true;
        }

        const path = Map.navMesh.findPath(
            { x: troop.x, y: troop.y },
            fleeDest
        );
        if (path && path.length) {
            troop._fleeThreatId = threatId;
            troop._fleeDest = fleeDest;
            troop._fleeNextRepathAt = now + this.FLEE_REPATH_COOLDOWN_MS;
            this.moveTo(troop, path);
        }
        return true;
    }

    static computeFleeDestination(troop, threatBody) {
        const gx = Math.floor(troop.x / SQUARESIZE);
        const gy = Math.floor(troop.y / SQUARESIZE);

        const directions = [
            [-1, -1], [0, -1], [1, -1],
            [-1,  0],          [1,  0],
            [-1,  1], [0,  1], [1,  1]
        ];

        let best = null;
        let bestScore = -Infinity;

        for (const [dx, dy] of directions) {
            const nx = gx + dx;
            const ny = gy + dy;

            if (ny < 0 || ny >= Map.navGrid.length) continue;
            if (nx < 0 || nx >= Map.navGrid[0].length) continue;
            if (Map.navGrid[ny][nx] !== 1) continue; // must be walkable

            const wx = nx * SQUARESIZE + SQUARESIZE / 2;
            const wy = ny * SQUARESIZE + SQUARESIZE / 2;

            const dist = Phaser.Math.Distance.Between(wx, wy, threatBody.x, threatBody.y);
            if (dist > bestScore) {
                bestScore = dist;
                best = { x: wx, y: wy };
            }
        }

        return best;
    }


    static createAnim(key, image, start, end, repeat = -1, frameRate = 3){
        if (this.scene.anims.exists(key)) return;
        this.scene.anims.create({
            key: key,
            frames: this.scene.anims.generateFrameNumbers(image, { start: start, end: end }),
            frameRate: frameRate,
            repeat: repeat
        });
    }

    static setAnimState(troop, state){
        const changed = troop.animState != state;
        troop.animState = state;

        if (syncDirectionalAnimationState(troop, state)) {
            return;
        }

        if (changed) {
            troop.play(state)
        }
    }

    static setPoseLock(troop, textureKey, frame = null) {
        if (!troop || !textureKey) return;
        troop.poseLock = { textureKey, frame };
        troop.rotation = 0;
        troop.anims?.stop?.();
        troop.setTexture(textureKey);
        if (Number.isInteger(frame)) {
            troop.setFrame(frame);
        }
    }

    static clearPoseLock(troop, fallbackState = null) {
        if (!troop) return;
        troop.poseLock = null;
        if (fallbackState && troop.active) {
            this.setAnimState(troop, fallbackState);
        }
    }

    static faceTowardPoint(troop, targetX, targetY, opts = {}) {
        if (!troop?.active) return false;
        if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return false;

        const dx = targetX - troop.x;
        const dy = targetY - troop.y;
        if ((dx * dx) + (dy * dy) < 0.0001) return false;

        if (faceDirectionalTowardVector(troop, dx, dy, opts)) {
            return true;
        }

        troop.rotation = Phaser.Math.Angle.Between(0, 0, dx, dy);
        return true;
    }

    static faceTarget(troop, target, opts = {}) {
        if (!troop?.active || !target) return false;
        const resolved = target?.gameObject || target?.buildingRef?.sprite || target?.sprite || target;
        const targetX = Number.isFinite(resolved?.x) ? resolved.x : null;
        const targetY = Number.isFinite(resolved?.y) ? resolved.y : null;
        return this.faceTowardPoint(troop, targetX, targetY, opts);
    }

    static clearSelection() {
        this.selected.forEach((troop) => {
            if (!troop?.active) return;
            this._setTroopSelected(troop, false);
        });
        this.selected = [];
    }

    static handlePlayerSelect(){
        if (this.scene.startCell) {
            const minX = Math.min(this.scene.startCell.x, this.scene.endCell.x)*SQUARESIZE;
            const maxX = Math.max(this.scene.startCell.x, this.scene.endCell.x)*SQUARESIZE;
            const minY = Math.min(this.scene.startCell.y, this.scene.endCell.y)*SQUARESIZE;
            const maxY = Math.max(this.scene.startCell.y, this.scene.endCell.y)*SQUARESIZE;
            const selectionRect = new Phaser.Geom.Rectangle(minX, minY, maxX-minX, maxY-minY);

            this.clearSelection();

            this.troops.forEach(troop => {
                if (Phaser.Geom.Rectangle.Contains(selectionRect, troop.x, troop.y)) {
                    this.selected.push(troop);
                    this._setTroopSelected(troop, true);
                } else {
                    this._setTroopSelected(troop, false);
                }
            });

        }
    }

    static handlePlayerSelectWorldRect(start, end) {
        if (!start || !end) return;

        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);
        const selectionRect = new Phaser.Geom.Rectangle(
            minX,
            minY,
            Math.max(1, maxX - minX),
            Math.max(1, maxY - minY)
        );

        this.clearSelection();

        this.troops.forEach((troop) => {
            if (!troop?.active) return;
            if (Phaser.Geom.Rectangle.Contains(selectionRect, troop.x, troop.y)) {
                this.selected.push(troop);
                this._setTroopSelected(troop, true);
            } else {
                this._setTroopSelected(troop, false);
            }
        });
    }

    static _getNavForTroop(troop) {
        // default: player nav
        const useEnemy = troop?.body?.team === 0;

        const navMesh = (useEnemy && Map.enemyNavMesh) ? Map.enemyNavMesh : Map.navMesh;
        const navGrid = (useEnemy && Map.enemyNavGrid) ? Map.enemyNavGrid : Map.navGrid;

        return { navMesh, navGrid };
    }


    static getFormation(centerX, centerY, troopCount) {
        const visited = new Set();
        const queue = [[centerX, centerY]];
        const positions = [];

        const isValid = (x, y) => {
            if (x < 0 || y < 0 || y >= Map.grid.length || x >= Map.grid[0].length) return false;
            const tile = Map.grid[y][x];
            if (Array.isArray(tile)) return false;
            const tileType = TILE_TYPES[TILE_MAP(tile)];
            return tileType && !tileType.block;
        };

        while (queue.length && positions.length < troopCount) {
            const [x, y] = queue.shift();
            const key = `${x},${y}`;
            if (visited.has(key)) continue;
            visited.add(key);

            if (isValid(x, y)) {
                positions.push([
                    x * SQUARESIZE + SQUARESIZE / 2,
                    y * SQUARESIZE + SQUARESIZE / 2
                ]);

                // 🔍 Debug Cube
                // const debugCube = Player.scene.add.rectangle(
                //     x * SQUARESIZE + SQUARESIZE / 2,
                //     y * SQUARESIZE + SQUARESIZE / 2,
                //     SQUARESIZE,
                //     SQUARESIZE,
                //     0xffff00,
                //     0.25
                // );
                // debugCube.setDepth(1000);

                // Enqueue all cardinal directions (can also add diagonals if needed)
                queue.push([x + 1, y]);
                queue.push([x - 1, y]);
                queue.push([x, y + 1]);
                queue.push([x, y - 1]);
            }
        }
        return positions;
    }


    static handlePlayerCollision(player1, player2){
        if (player1 === player2) return; // Prevent self overlap
        if (!player1.finalPos || !player2.finalPos) return;
        const player1InCombat = !!(player1.track || player1.forcedTarget || player1.state === CONTROL_STATES.TRACK_TARGET || player1.state === CONTROL_STATES.ATTACK_MODE);
        const player2InCombat = !!(player2.track || player2.forcedTarget || player2.state === CONTROL_STATES.TRACK_TARGET || player2.state === CONTROL_STATES.ATTACK_MODE);
        if (player1InCombat || player2InCombat) return;
        if(player1.finalPos?.x == player2.finalPos?.x && player1.finalPos?.y == player2.finalPos?.y){
            if(player1.body.velocity.x == 0 && player1.body.velocity.y == 0 && player2.currentPath.length && !player1.currentPath.length){
                let newVelocity = new Phaser.Math.Vector2(
                    0,
                    0
                );
                player2.body.setVelocity(newVelocity.x, newVelocity.y)
                player2.currentPath.length = 0;
            }
            else if(player2.body.velocity.x == 0 && player2.body.velocity.y == 0 && player1.currentPath.length && !player2.currentPath.length){
                let newVelocity = new Phaser.Math.Vector2(
                    0,
                    0
                );
                player1.body.setVelocity(newVelocity.x, newVelocity.y)
                player1.currentPath.length = 0;
            }
        }
    }
    
    static drawPlayers(playerDict) {
        for (const key in playerDict) {
          const [x, y] = key.split(',').map(Number);
          const teamNumber = playerDict[key];
          // create the sprite
          if(teamNumber){
            this.addPlayer(x, y, teamNumber);
          }
          // remove from the dict
          delete playerDict[key];
        }
    }
      
    static roam(troop) {
        // start roaming
        this._clearRoamResetTimer(troop);
        troop.roam = true;
        const { navMesh, navGrid } = Player._getNavForTroop(troop);
        let px = troop.x;
        let py = troop.y;
        let troopX = Math.floor(px/SQUARESIZE)
        let troopY = Math.floor(py/SQUARESIZE)
        if(navGrid[troopY][troopX] == 0){
            let [newX, newY] = Player.findBestStartPos(troop, troopX, troopY);
            if (newX === -1) {
                console.log("No valid start tile nearby");
                return;
            } else {
                console.log("New valid tile:", newX, newY);
                px = newX*SQUARESIZE+SQUARESIZE/2;
                py = newY*SQUARESIZE+SQUARESIZE/2;
            }
        }

        // four directions at one grid distance (SQUARESIZE px)
        const offsets = [
            { x: px,              y: py - SQUARESIZE }, // above
            { x: px,              y: py + SQUARESIZE }, // below
            { x: px - SQUARESIZE, y: py             }, // left
            { x: px + SQUARESIZE, y: py             }  // right
        ];
    
        const validPositions = [];
        for (const pos of offsets) {
            const gx = Math.floor(pos.x / SQUARESIZE);
            const gy = Math.floor(pos.y / SQUARESIZE);

            if (gx < 0 || gx >= WORLD_DIMENSIONX || gy < 0 || gy >= WORLD_DIMENSIONY)
                continue;

            const roadOrCrop =
                Map._hasTypeAt(gx, gy, 'road') ||
                Map.grid[gy][gx] == TILE_TYPES.crops.grid;

            const tileOK =
                ((roadOrCrop && troop.body.team) || !troop.body.team);

            // final navGrid check
            if (tileOK && navGrid[gy]?.[gx] === 1) {
                validPositions.push(pos);
            }
        }

    
        if (validPositions.length) {
            const dest = CombatSpacingCoordinator.chooseRoamDestination(troop, validPositions)
                || Phaser.Utils.Array.GetRandom(validPositions);
            troop._combatRoamDest = dest ? { x: dest.x, y: dest.y } : null;
            const path = Player.pathTo(troop, dest.x, dest.y, false);
            Player.moveTo(troop, path);
        }
    }

    // Keep ranged units at comfortable distance (max range) while still in line of sight.
    static computeKiteDestination(troop, target, weapon, enemies = null) {
        if (troop?.isGunslinger) {
            return this._computeGunslingerKiteDestination(troop, target, weapon, enemies);
        }

        if (!target) return null;
        const range = weapon.range || 150;

        const desiredDist = range * 0.9;   // sit near outer edge
        const minDist     = range * 0.6;   // don't bother moving if already "safe"

        const dx = troop.x - target.x;
        const dy = troop.y - target.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;

        // If we're already in a comfortable band, no need to move.
        if (dist >= minDist && dist <= range) {
            return null;
        }

        // Unit vector from target → troop
        const ux = dx / dist;
        const uy = dy / dist;

        // Where we *want* to stand: just inside max range, on the far side
        const destX = target.x + ux * desiredDist;
        const destY = target.y + uy * desiredDist;

        return { x: destX, y: destY };
    }

    static clearGunslingerKiteState(troop) {
        if (!troop) return;
        troop._gunslingerKiting = false;
        troop._gunslingerKiteDest = null;
        troop._gunslingerKiteNextRepathAt = 0;
    }

    static _getKiteThreatCandidates(troop, enemies = null) {
        if (Array.isArray(enemies)) return enemies;
        const enemyTeam = troop?.body?.team === 1 ? "0" : "1";
        return Teams.teamLists?.[enemyTeam]?.playerList || [];
    }

    static _hasLineOfSightFromPoint(troop, target, x, y) {
        if (!target?.active) return false;
        const probe = Object.create(troop || null);
        probe.x = x;
        probe.y = y;
        probe.body = troop?.body;
        return Projectile.hasLineOfSight(probe, target);
    }

    static _computeGunslingerKiteDestination(troop, target, weapon, enemies = null) {
        if (!troop?.active || !target?.active || !weapon) return null;

        const dangerRadius = Math.max(this.GUNSLINGER_DANGER_RADIUS, Number(weapon.range || 0) * 0.55);
        const threats = this._getKiteThreatCandidates(troop, enemies)
            .filter(enemy =>
                this._isEnemyCandidateForTroop(troop, enemy) &&
                this._combatDistance(troop, enemy) <= dangerRadius
            );

        if (!threats.length) {
            this.clearGunslingerKiteState(troop);
            return null;
        }

        let pressureX = 0;
        let pressureY = 0;
        for (const enemy of threats) {
            const dx = troop.x - enemy.x;
            const dy = troop.y - enemy.y;
            const dist = Math.max(1, Math.hypot(dx, dy));
            const closeness = Math.max(0, (dangerRadius - dist) / dangerRadius);
            const weight = 0.25 + closeness * closeness * 2.75;
            pressureX += (dx / dist) * weight;
            pressureY += (dy / dist) * weight;
        }

        if (Math.hypot(pressureX, pressureY) < 0.001 && target) {
            const dx = troop.x - target.x;
            const dy = troop.y - target.y;
            const dist = Math.max(1, Math.hypot(dx, dy));
            pressureX = dx / dist;
            pressureY = dy / dist;
        }

        const baseAngle = Math.atan2(pressureY, pressureX);
        const offsets = [0, -Math.PI / 6, Math.PI / 6, -Math.PI / 3, Math.PI / 3, -Math.PI / 2, Math.PI / 2, Math.PI];
        const steps = [SQUARESIZE * 1.5, SQUARESIZE * 2.4, SQUARESIZE * 3.2];
        const range = Math.max(1, Number(weapon.range || 1));
        const desiredTargetDist = range * 0.82;

        let best = null;
        let bestScore = Infinity;
        const currentDest = troop._gunslingerKiteDest;

        for (const step of steps) {
            for (const offset of offsets) {
                const angle = baseAngle + offset;
                const candidate = {
                    x: troop.x + Math.cos(angle) * step,
                    y: troop.y + Math.sin(angle) * step,
                };

                if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) continue;
                if (!this._worldTileIsWalkableForTroop(troop, candidate.x, candidate.y)) continue;
                if (!this._canReachWorldForTroop(troop, candidate.x, candidate.y)) continue;

                const targetDist = this._combatDistance(candidate, target);
                const keepsRange = targetDist <= range;
                const keepsLos = keepsRange && this._hasLineOfSightFromPoint(troop, target, candidate.x, candidate.y);
                let closePenalty = 0;
                let minThreatDist = Infinity;

                for (const enemy of threats) {
                    const dist = this._combatDistance(candidate, enemy);
                    minThreatDist = Math.min(minThreatDist, dist);
                    const danger = Math.max(0, dangerRadius - dist);
                    closePenalty += danger * danger;
                }

                const currentDestBonus = currentDest && this._combatDistance(candidate, currentDest) <= this.GUNSLINGER_KITE_DEST_EPSILON
                    ? -SQUARESIZE * 2
                    : 0;
                const losPenalty = keepsLos ? 0 : 200000;
                const rangePenalty = keepsRange ? 0 : 80000 + Math.max(0, targetDist - range) * 600;
                const targetBandPenalty = Math.abs(targetDist - desiredTargetDist) * 1.8;
                const travelPenalty = this._combatDistance(troop, candidate) * 0.45;
                const safetyBonus = -Math.min(minThreatDist, dangerRadius * 1.5) * 3;

                const score =
                    closePenalty * 3.5 +
                    losPenalty +
                    rangePenalty +
                    targetBandPenalty +
                    travelPenalty +
                    safetyBonus +
                    currentDestBonus;

                if (score < bestScore) {
                    bestScore = score;
                    best = candidate;
                }
            }
        }

        return best;
    }

    static _tryGunslingerKite(troop, target, enemies = null) {
        if (!troop?.isGunslinger || !target?.active || !troop.weapon) return false;

        const kiteDest = this.computeKiteDestination(troop, target, troop.weapon, enemies);
        if (!kiteDest) return false;

        const now = this._sceneNowMs(troop);
        const previousDest = troop._gunslingerKiteDest;
        const sameDest = previousDest &&
            this._combatDistance(previousDest, kiteDest) <= this.GUNSLINGER_KITE_DEST_EPSILON;

        if (
            troop._gunslingerKiting &&
            troop.currentPath?.length &&
            sameDest &&
            now < Number(troop._gunslingerKiteNextRepathAt || 0)
        ) {
            if (this._isAttackReady(troop, target)) fightManager.attack(troop);
            return true;
        }

        const path = Player.pathTo(troop, kiteDest.x, kiteDest.y, false);
        if (!path?.length) return false;

        troop._gunslingerKiting = true;
        troop._gunslingerKiteDest = { x: kiteDest.x, y: kiteDest.y };
        troop._gunslingerKiteNextRepathAt = now + this.GUNSLINGER_KITE_REPATH_COOLDOWN_MS;
        Player.moveTo(troop, path);

        if (this._isAttackReady(troop, target)) fightManager.attack(troop);
        return true;
    }

    static handleStateIntteruptStart(troop, targetState) {
        if (troop.state === targetState) return;
        InterruptController.interruptTroop(troop, "state_interrupt", targetState);
    }

    static _isFighterUnit(troop) {
        return !!(troop?.isBrawler || troop?.isBlademaster || troop?.isGunslinger || troop?.isFortGrunt);
    }

    static _combatTargetId(target) {
        if (!target) return null;
        return target.id ?? target.body?.id ?? `${Math.floor((target.x ?? 0) / SQUARESIZE)},${Math.floor((target.y ?? 0) / SQUARESIZE)}`;
    }

    static _combatDistance(a, b) {
        if (!a || !b) return Infinity;
        return Phaser.Math.Distance.Between(a.x ?? 0, a.y ?? 0, b.x ?? 0, b.y ?? 0);
    }

    static _isEnemyCandidateForTroop(troop, enemy) {
        return !!(
            troop?.active &&
            troop.body &&
            enemy?.active &&
            enemy.body &&
            enemy.body.team !== troop.body.team &&
            !enemy.dontTrack &&
            !enemy.body?.dontTrack &&
            this._isCombatTargetableUnit(enemy)
        );
    }

    static _markCombatTargetSticky(troop, target, durationMs = this.FIGHTER_TARGET_STICKY_MS) {
        if (!troop?.active || !target?.active) return;
        troop._combatTargetStickyId = this._combatTargetId(target);
        troop._combatTargetStickyUntil = this._sceneNowMs(troop) + Math.max(0, Number(durationMs) || 0);
    }

    static _isStickyCombatTarget(troop, target, now = this._sceneNowMs(troop)) {
        if (!troop?.active || !target?.active) return false;
        return (
            troop._combatTargetStickyId === this._combatTargetId(target) &&
            now < Number(troop._combatTargetStickyUntil || 0)
        );
    }

    static recordRecentCombatAttacker(target, attacker, opts = {}) {
        if (!this._isFighterUnit(target)) return false;
        if (!target?.active || target.body?.team !== 1) return false;
        if (!this._isEnemyCandidateForTroop(target, attacker)) return false;

        const now = this._sceneNowMs(target);
        const durationMs = Math.max(0, Number(opts.durationMs ?? this.FIGHTER_RECENT_ATTACKER_MS) || 0);
        target._recentCombatAttacker = attacker;
        target._recentCombatAttackerId = this._combatTargetId(attacker);
        target._recentCombatAttackerHitAt = now;
        target._recentCombatAttackerUntil = now + durationMs;
        return true;
    }

    static clearRecentCombatAttacker(troop, attacker = null) {
        if (!troop) return;
        if (attacker && troop._recentCombatAttacker !== attacker) return;
        troop._recentCombatAttacker = null;
        troop._recentCombatAttackerId = null;
        troop._recentCombatAttackerHitAt = 0;
        troop._recentCombatAttackerUntil = 0;
    }

    static _getRecentCombatAttacker(troop, now = this._sceneNowMs(troop)) {
        const attacker = troop?._recentCombatAttacker;
        if (!attacker) return null;

        if (now >= Number(troop._recentCombatAttackerUntil || 0)) {
            this.clearRecentCombatAttacker(troop);
            return null;
        }

        if (!this._isEnemyCandidateForTroop(troop, attacker)) {
            this.clearRecentCombatAttacker(troop);
            return null;
        }

        if (!this._canReachWorldForTroop(troop, attacker.x, attacker.y)) {
            return null;
        }

        return attacker;
    }

    static _isShootableTarget(troop, target, weapon = troop?.weapon) {
        if (!weapon || !this._isEnemyCandidateForTroop(troop, target)) return false;
        if (this._combatDistance(troop, target) > Number(weapon.range || 0)) return false;
        return !weapon.projectile || Projectile.hasLineOfSight(troop, target);
    }

    static _getClosestCloseThreat(troop, candidates = [], radius = this.FIGHTER_CLOSE_THREAT_RADIUS) {
        let best = null;
        let bestDist = Infinity;
        const maxDist = Math.max(0, Number(radius) || 0);

        for (const enemy of candidates) {
            if (!this._isEnemyCandidateForTroop(troop, enemy)) continue;
            if (!this._canReachWorldForTroop(troop, enemy.x, enemy.y)) continue;
            const dist = this._combatDistance(troop, enemy);
            if (dist > maxDist || dist >= bestDist) continue;
            best = enemy;
            bestDist = dist;
        }

        return best;
    }

    static _chooseImmediateFighterTarget(troop, candidates = [], currentTarget = null, opts = {}) {
        const closeTarget = this._getClosestCloseThreat(troop, candidates, opts.closeRadius ?? this.FIGHTER_CLOSE_THREAT_RADIUS);
        if (closeTarget) return closeTarget;

        const recentAttacker = this._getRecentCombatAttacker(troop);
        if (recentAttacker && candidates.includes(recentAttacker)) return recentAttacker;

        if (
            opts.allowSticky !== false &&
            currentTarget?.active &&
            candidates.includes(currentTarget) &&
            (
                this._isStickyCombatTarget(troop, currentTarget) ||
                this._isCommittedToCombatTarget(troop, currentTarget)
            )
        ) {
            return currentTarget;
        }

        return null;
    }

    static _chooseClosestShootableTarget(troop, candidates = []) {
        let best = null;
        let bestDist = Infinity;

        for (const enemy of candidates) {
            if (!this._isShootableTarget(troop, enemy, troop.weapon)) continue;
            const dist = this._combatDistance(troop, enemy);
            if (dist < bestDist) {
                best = enemy;
                bestDist = dist;
            }
        }

        return best;
    }

    static _chooseGunslingerCombatTarget(troop, candidates = [], opts = {}) {
        const valid = candidates.filter(enemy => this._isEnemyCandidateForTroop(troop, enemy));
        if (!valid.length) return null;

        const shootable = this._chooseClosestShootableTarget(troop, valid);
        if (shootable) return shootable;

        const currentTarget = opts.currentTarget ?? troop.track?.[0]?.gameObject ?? null;
        const closeTarget = this._getClosestCloseThreat(troop, valid, this.GUNSLINGER_DANGER_RADIUS);
        if (closeTarget) return closeTarget;

        const recentAttacker = this._getRecentCombatAttacker(troop);
        if (recentAttacker && valid.includes(recentAttacker)) return recentAttacker;

        const emergencyCandidates = Array.isArray(opts.emergencyCandidates)
            ? opts.emergencyCandidates.filter(enemy => valid.includes(enemy))
            : [];
        if (emergencyCandidates.length) {
            return CombatSpacingCoordinator.chooseBestEnemyTarget(troop, emergencyCandidates, {
                anchor: opts.anchor ?? troop,
                currentTarget,
                priorityFn: opts.priorityFn,
                assignmentPriorityFn: opts.assignmentPriorityFn,
                priorityWeight: opts.priorityWeight ?? 100000,
                assignmentWeight: 0,
                pressureWeight: 0,
                anchorWeight: 1,
                troopWeight: 0.1,
                keepFocusWeight: 8,
            });
        }

        if (
            currentTarget?.active &&
            valid.includes(currentTarget) &&
            (
                this._isStickyCombatTarget(troop, currentTarget) ||
                this._isCommittedToCombatTarget(troop, currentTarget)
            )
        ) {
            return currentTarget;
        }

        return CombatSpacingCoordinator.chooseBestEnemyTarget(troop, valid, {
            currentTarget,
            strictTargetSpread: true,
            strictTargetSpreadMaxExtraDistance: this.FIGHTER_SPREAD_MAX_EXTRA_DISTANCE,
            strictTargetSpreadMaxRatio: this.FIGHTER_SPREAD_MAX_RATIO,
            keepFocusWeight: 8,
        });
    }

    static _cleanupCombatTicketForTarget(teamNumber, target) {
        const list = Teams.teamLists?.[`${teamNumber}`]?.fightingList;
        if (Array.isArray(list) && target) {
            for (let i = list.length - 1; i >= 0; i--) {
                const t = list[i];
                const tgt = t?.target || t;
                if (!tgt?.active || tgt === target) list.splice(i, 1);
            }
        }
        this._cleanupBreachTicketsForTarget(teamNumber, target);
    }

    static _removeEnemyDestroyTileTask(team, list, index) {
        const task = list[index];
        list.splice(index, 1);
        if (task?.breachPlanId && team?._breachSeen) {
            team._breachSeen.delete(`${task.x},${task.y}`);
        }
    }

    static _cleanupBreachTicketsForTarget(teamNumber, target) {
        const team = Teams.teamLists?.[`${teamNumber}`];
        const list = team?.enemyDestroyTileStates;
        if (!Array.isArray(list) || !target) return;

        const targetId = this._combatTargetId(target);
        for (let i = list.length - 1; i >= 0; i--) {
            const task = list[i];
            if (!task?.breachPlanId) continue;
            if (targetId && task.breachTargetId === targetId) {
                this._removeEnemyDestroyTileTask(team, list, i);
            }
        }
    }

    static _cleanupBreachTicketsForTroop(teamNumber, troop) {
        const team = Teams.teamLists?.[`${teamNumber}`];
        const list = team?.enemyDestroyTileStates;
        if (!Array.isArray(list) || !troop) return;

        for (let i = list.length - 1; i >= 0; i--) {
            const task = list[i];
            if (!task?.breachPlanId) continue;
            if (Array.isArray(task.eligibleTroopIds) && task.eligibleTroopIds.includes(troop.id)) {
                this._removeEnemyDestroyTileTask(team, list, i);
            }
        }
    }

    static _clearInvalidForcedTarget(troop) {
        const target = troop.forcedTarget;
        if (!target) return false;
        if (target?.active && target?.body && this._isCombatTargetableUnit(target)) return false;
        if (target) this._cleanupCombatTicketForTarget(troop.body.team, target);
        fightManager.disengageFromCombat(troop, "combat_target_lost");
        return true;
    }

    static _isAttackReady(troop, target) {
        if (!troop?.weapon || !target?.active) return false;
        if (target?.body && !this._isCombatTargetableUnit(target)) return false;
        if (fightManager.hasAttackRecovery?.(troop)) return false;
        const inRange = Phaser.Math.Distance.Between(troop.x, troop.y, target.x, target.y) <= troop.weapon.range;
        if (!inRange) return false;
        if (troop.weapon.projectile && !Projectile.hasLineOfSight(troop, target)) return false;
        return true;
    }

    static _resolveEnemyFocusedFriendly(enemy) {
        const forcedTarget = enemy?.forcedTarget;
        if (forcedTarget?.active && forcedTarget?.body?.team === 1 && this._isCombatTargetableUnit(forcedTarget)) return forcedTarget;
        const tracked = enemy?.track?.[0]?.gameObject;
        if (tracked?.active && tracked?.body?.team === 1 && this._isCombatTargetableUnit(tracked)) return tracked;
        return null;
    }

    static _resolveEnemyObjectiveTarget(enemy) {
        const directTaskTarget = enemy?.task?.value?.buildingRef || enemy?.task?.value || null;
        if (directTaskTarget) return directTaskTarget;

        const missionTaskTarget = enemy?._raidMissionTask?.value?.buildingRef || enemy?._raidMissionTask?.value || null;
        if (missionTaskTarget) return missionTaskTarget;

        return null;
    }

    static _targetFootprintContainsTile(target, tileX, tileY) {
        if (!target || !Number.isFinite(tileX) || !Number.isFinite(tileY)) return false;
        const fp = this._computeTargetFootprint(target);
        return (
            Number.isFinite(fp?.x) &&
            Number.isFinite(fp?.y) &&
            tileX >= fp.x &&
            tileX < fp.x + Math.max(1, Number(fp.w || 1)) &&
            tileY >= fp.y &&
            tileY < fp.y + Math.max(1, Number(fp.h || 1))
        );
    }

    static _isTownCenterObjectiveTarget(teamNumber, target) {
        const centerTile = Teams.getTownCenterRoadTile?.(teamNumber) || Teams.getTownCenterTile?.(teamNumber);
        if (!centerTile) return false;
        return this._targetFootprintContainsTile(target, centerTile.x, centerTile.y);
    }

    static _townDefenseBuildingPriority(target) {
        const building = target?.buildingRef || target || null;
        const tileType = building?.tileType ?? target?.tileType ?? null;
        const tileName = tileType?.name ?? null;

        if (tileType === TILE_TYPES.storage || tileName === TILE_TYPES.storage?.name) return 0;
        if (tileType === TILE_TYPES.clayOven || tileName === TILE_TYPES.clayOven?.name) return 1;
        if (
            tileType === TILE_TYPES.house1 ||
            tileType === TILE_TYPES.house2 ||
            tileName === TILE_TYPES.house1?.name ||
            tileName === TILE_TYPES.house2?.name
        ) {
            return 3;
        }

        return 2;
    }

    static _isEnemyBreakingTown(enemy) {
        return (
            enemy?.state === CONTROL_STATES.DESTROY_MODE ||
            enemy?.state === CONTROL_STATES.DESTROY_MODE_T ||
            enemy?.state === CONTROL_STATES.SIEGE_MODE
        );
    }

    static _canEnemyBeDefendedAgainst(troop, enemy, townCenter = null) {
        if (!troop?.active || !enemy?.active || !enemy?.body) return false;
        if (enemy.body.team === troop.body?.team || enemy.dontTrack) return false;
        return this._canReachWorldForTroop(troop, enemy.x, enemy.y);
    }

    static _collectTownDefenseCandidates(troop, townCenter) {
        const enemies = Teams.teamLists?.["0"]?.playerList || [];
        return enemies.filter(enemy => this._canEnemyBeDefendedAgainst(troop, enemy, townCenter));
    }

    static _isTownDefenseEmergencyEnemy(troop, enemy) {
        const objectiveTarget = this._resolveEnemyObjectiveTarget(enemy);
        return !!(
            objectiveTarget &&
            this._isEnemyBreakingTown(enemy) &&
            this._isTownCenterObjectiveTarget(troop.body?.team ?? 1, objectiveTarget)
        );
    }

    static _townDefenseReachTier(enemy) {
        if (!enemy?.active) return 3;
        if (this._isOnWater?.(enemy)) return 2;
        return 0;
    }

    static _isCommittedToCombatTarget(troop, target) {
        if (!troop?.active || !target?.active || !troop.weapon) return false;
        if (troop.state === CONTROL_STATES.ATTACK_MODE) return true;
        if (fightManager.hasAttackRecovery?.(troop)) return true;
        if (this._isAttackReady(troop, target)) return true;

        const commitDistance = Math.max(
            Number(troop.weapon.range || 0) * 1.2,
            SQUARESIZE * 2.25
        );
        return Phaser.Math.Distance.Between(troop.x, troop.y, target.x, target.y) <= commitDistance;
    }

    static _shouldKeepTownDefenseTarget(troop, currentTarget, candidates, emergencyCandidates) {
        if (!currentTarget?.active || !currentTarget?.body) return false;
        if (!candidates.includes(currentTarget)) return false;

        const currentIsEmergency = this._isTownDefenseEmergencyEnemy(troop, currentTarget);
        if (emergencyCandidates.length && !currentIsEmergency) return false;
        if (this._townDefenseReachTier(currentTarget) > 0 && !currentIsEmergency) return false;

        return (
            this._isCommittedToCombatTarget(troop, currentTarget) ||
            this._isStickyCombatTarget(troop, currentTarget)
        );
    }

    static _townDefensePriority(troop, enemy, townCenter) {
        const teamNumber = troop.body?.team ?? 1;
        const objectiveTarget = this._resolveEnemyObjectiveTarget(enemy);
        const reachTier = this._townDefenseReachTier(enemy);

        if (objectiveTarget && this._isEnemyBreakingTown(enemy)) {
            if (this._isTownCenterObjectiveTarget(teamNumber, objectiveTarget)) return reachTier;
            return 10 + reachTier * 20 + this._townDefenseBuildingPriority(objectiveTarget);
        }

        const pressuredFriendly = this._resolveEnemyFocusedFriendly(enemy);
        if (pressuredFriendly?.active) {
            return 30 + reachTier * 20 + (this._isFighterUnit?.(pressuredFriendly) ? 0 : 1);
        }

        if (townCenter) {
            const distanceToTown = Phaser.Math.Distance.Between(townCenter.x, townCenter.y, enemy.x, enemy.y);
            if (distanceToTown <= SQUARESIZE * 10) return 40 + reachTier * 20;
        }

        return 50 + reachTier * 20;
    }

    static _townDefenseCoveragePriority(troop, enemy, currentTarget = null) {
        if (!troop?.active || !enemy?.active) return 1;

        const teamNumber = troop.body?.team ?? 1;
        const counts = CombatSpacingCoordinator.getTargetAssignmentCounts(teamNumber, enemy);
        let accountedFor = Number(counts?.total ?? 0);

        if (enemy === currentTarget) {
            accountedFor = Math.max(0, accountedFor - 1);
        }

        return accountedFor;
    }

    static _selectTownDefenseTarget(troop) {
        if (!troop?.active || troop.body?.team !== 1 || !this._isFighterUnit(troop) || !troop.weapon) {
            return { target: null, shouldRepath: false };
        }

        const townCenter = Teams.getTownCenterRoadWorld?.(troop.body.team ?? 1);
        if (!townCenter) {
            return { target: null, shouldRepath: false };
        }

        const currentTarget = troop.track?.[0]?.gameObject ?? troop.forcedTarget ?? null;
        const candidates = this._collectTownDefenseCandidates(troop, townCenter);
        const emergencyCandidates = candidates.filter((enemy) => this._isTownDefenseEmergencyEnemy(troop, enemy));

        if (troop.isGunslinger) {
            const target = this._chooseGunslingerCombatTarget(troop, candidates, {
                anchor: townCenter,
                currentTarget,
                emergencyCandidates,
                priorityFn: (enemy) => this._townDefensePriority(troop, enemy, townCenter),
                assignmentPriorityFn: (enemy) => this._townDefenseCoveragePriority(troop, enemy, currentTarget),
                priorityWeight: 100000,
            });

            if (target?.body) {
                const previousBody = troop.track?.[0] ?? null;
                const movedTile = this._syncTrackToTarget(troop, target);
                return {
                    target,
                    shouldRepath: movedTile || previousBody !== target.body || (!troop.currentPath?.length && !this._isAttackReady(troop, target)),
                };
            }
        }

        const immediateTarget = this._chooseImmediateFighterTarget(troop, candidates, currentTarget, {
            allowSticky: false,
            closeRadius: this.FIGHTER_CLOSE_THREAT_RADIUS,
        });
        if (immediateTarget?.body) {
            const previousBody = troop.track?.[0] ?? null;
            const movedTile = this._syncTrackToTarget(troop, immediateTarget);
            return {
                target: immediateTarget,
                shouldRepath: movedTile || previousBody !== immediateTarget.body || (!troop.currentPath?.length && !this._isAttackReady(troop, immediateTarget)),
            };
        }

        if (this._shouldKeepTownDefenseTarget(troop, currentTarget, candidates, emergencyCandidates)) {
            const previousBody = troop.track?.[0] ?? null;
            const movedTile = this._syncTrackToTarget(troop, currentTarget);
            return {
                target: currentTarget,
                shouldRepath: movedTile || previousBody !== currentTarget.body || (!troop.currentPath?.length && !this._isAttackReady(troop, currentTarget)),
            };
        }
        const target = CombatSpacingCoordinator.chooseBestEnemyTarget(troop, emergencyCandidates.length ? emergencyCandidates : candidates, {
            anchor: townCenter,
            currentTarget,
            priorityFn: (enemy) => this._townDefensePriority(troop, enemy, townCenter),
            assignmentPriorityFn: (enemy) => this._townDefenseCoveragePriority(troop, enemy, currentTarget),
            priorityWeight: 100000,
            assignmentWeight: emergencyCandidates.length ? 0 : 25000,
            pressureWeight: 0,
            anchorWeight: 1,
            troopWeight: 0.05,
            keepFocusWeight: 10,
            strictTargetSpreadMaxExtraDistance: this.FIGHTER_SPREAD_MAX_EXTRA_DISTANCE,
            strictTargetSpreadMaxRatio: this.FIGHTER_SPREAD_MAX_RATIO,
        });

        if (!target?.body) {
            return { target: null, shouldRepath: false };
        }

        const previousBody = troop.track?.[0] ?? null;
        const movedTile = this._syncTrackToTarget(troop, target);
        return {
            target,
            shouldRepath: movedTile || previousBody !== target.body,
        };
    }

    static _syncTrackToTarget(troop, target) {
        CombatSpacingCoordinator.setTroopFocusTarget(troop, target, { forced: troop.forcedTarget === target });
        let movedTile = true;
        if (!troop.track || troop.track[0] !== target.body) {
            troop.track = [target.body, { x: target.x, y: target.y }];
            this._markCombatTargetSticky(troop, target);
            movedTile = true;
        } else {
            const regionSystem = troop.body?.team === 0 ? Map.enemyRegionSystem : Map.regionSystem;
            const lastWorldX = troop.track[1].x;
            const lastWorldY = troop.track[1].y;
            const lastTileX = Math.floor(lastWorldX / SQUARESIZE);
            const lastTileY = Math.floor(lastWorldY / SQUARESIZE);
            const curTileX = Math.floor(target.x / SQUARESIZE);
            const curTileY = Math.floor(target.y / SQUARESIZE);
            movedTile = lastTileX !== curTileX || lastTileY !== curTileY;

            if (movedTile && regionSystem?.getRegionIdForWorldPoint) {
                const troopRegion = regionSystem.getRegionIdForWorldPoint(troop.x, troop.y);
                const lastTargetRegion = regionSystem.getRegionIdForWorldPoint(lastWorldX, lastWorldY);
                const currentTargetRegion = regionSystem.getRegionIdForWorldPoint(target.x, target.y);

                const targetStillInSameLockedRegion =
                    troopRegion !== -1 &&
                    lastTargetRegion !== -1 &&
                    currentTargetRegion !== -1 &&
                    troopRegion !== currentTargetRegion &&
                    lastTargetRegion === currentTargetRegion;

                if (targetStillInSameLockedRegion) {
                    movedTile = false;
                }
            }

            troop.track[1].x = target.x;
            troop.track[1].y = target.y;
        }
        return movedTile;
    }

    static _computeTargetFootprint(target) {
        const b = target?.buildingRef;
        if (b && Number.isFinite(b.x) && Number.isFinite(b.y)) {
            const lenX = Number(b.tileType?.lenX ?? b.lenX ?? 1);
            const lenY = Number(b.tileType?.lenY ?? b.lenY ?? 1);
            return { x: b.x, y: b.y, w: lenX, h: lenY };
        }

        // Scheduler can pass the building object directly (not the sprite).
        // Those x/y values are tile coordinates, not world pixels.
        if (
            Number.isFinite(target?.x) &&
            Number.isFinite(target?.y) &&
            !target?.body &&
            (
                Number.isFinite(target?.tileType?.lenX) ||
                Number.isFinite(target?.lenX) ||
                typeof target?.onDamaged === "function"
            )
        ) {
            const lenX = Number(target.tileType?.lenX ?? target.lenX ?? 1);
            const lenY = Number(target.tileType?.lenY ?? target.lenY ?? 1);
            return { x: target.x, y: target.y, w: lenX, h: lenY };
        }

        if (target?.tilePos && Number.isFinite(target.tilePos.tileX) && Number.isFinite(target.tilePos.tileY)) {
            return { x: target.tilePos.tileX, y: target.tilePos.tileY, w: 1, h: 1 };
        }

        if (Number.isFinite(target?.sx) && Number.isFinite(target?.sy)) {
            return { x: target.sx, y: target.sy, w: Number(target.lenX ?? 1), h: Number(target.lenY ?? 1) };
        }

        const tx = Math.floor((target?.x ?? 0) / SQUARESIZE);
        const ty = Math.floor((target?.y ?? 0) / SQUARESIZE);
        return { x: tx, y: ty, w: 1, h: 1 };
    }

    static _ensureFriendlySiegePlanner() {
        if (!Map.playerSiegePlanner) {
            Map.playerSiegePlanner = new SiegePlanner({
                squareSize: SQUARESIZE,
                enemyNavGrid: Map.navGrid,
                isBreachableTile: (tx, ty) => {
                    const cell = Map.grid?.[ty]?.[tx];
                    if (!cell) return false;
                    const top = Array.isArray(cell) ? cell[1] : cell;
                    const name = TILE_MAP(top);
                    return name === "woodWall" || name === "woodWall_door" || name === "wall" || name === "wall_door";
                },
                isHardBlockedTile: () => false,
                regionSystem: Map.regionSystem
            });
        }
        return Map.playerSiegePlanner;
    }

    static _planBreachTicketsForTarget(troop, target) {
        const troopTeamNumber = Number(troop?.body?.team);
        if (!troop?.active || !Number.isFinite(troopTeamNumber) || !this._isFighterUnit(troop)) return false;
        const now = troop.scene?.getSimulationNow?.() ?? troop.scene?.simNowMs ?? troop.scene?.time?.now ?? 0;
        if (troop._nextBreachPlanAt && now < troop._nextBreachPlanAt) return false;
        troop._nextBreachPlanAt = now + 500;

        const fp = this._computeTargetFootprint(target);
        const gridH = Map.navGrid?.length ?? 0;
        const gridW = gridH ? (Map.navGrid[0]?.length ?? 0) : 0;
        if (!gridW || !gridH) return false;

        const perimeter = SiegePlanner.buildPerimeterTargets(fp.x, fp.y, fp.w, fp.h, gridW, gridH);
        const planner = this._ensureFriendlySiegePlanner();
        const breachTiles = planner?.planBreach?.(troop.x, troop.y, perimeter);
        if (!breachTiles?.length) return false;

        const team = Teams.getTeam(troopTeamNumber);
        if (!team?.enemyDestroyTileStates) return false;
        if (!team._breachSeen) team._breachSeen = new Set();

        const breachPlanId = `breach-${troop.id ?? "unit"}-${Math.round(now)}`;
        let added = 0;
        for (let i = 0; i < breachTiles.length; i++) {
            const t = breachTiles[i];
            const cell = Map.grid?.[t.y]?.[t.x];
            if (cell == null) continue;
            const top = Array.isArray(cell) ? cell[1] : cell;
            const typeName = TILE_MAP(top);
            if (typeName !== "wall" && typeName !== "woodWall" && typeName !== "wall_door" && typeName !== "woodWall_door") continue;
            const wall = Wall.getAt(t.x, t.y);
            if (wall?.team === troopTeamNumber) continue;

            const key = `${t.x},${t.y}`;
            if (team._breachSeen.has(key)) continue;
            team._breachSeen.add(key);

            team.enemyDestroyTileStates.push({
                x: t.x,
                y: t.y,
                duration: 400,
                assigned: 0,
                forced: !!troop.forcedTarget,
                type: TILE_TYPES[typeName],
                breachPlanId,
                breachTargetId: this._combatTargetId(target),
                breachTargetTeam: target.body?.team ?? null,
                breachOrder: i,
                breachChainLength: breachTiles.length,
                eligibleTroopIds: [troop.id],
            });
            added++;
        }

        if (!added) return false;
        if (!troop.task) {
            Manager.assignOneTroopToAction(troop, team.enemyDestroyTileStates, CONTROL_STATES.DESTROY_MODE_T);
        }
        return true;
    }

    static _chaseOrBreachTarget(troop, target, shouldRepath = true) {
        if (!target?.active || !target?.body) return false;
        const previousApproachKey = troop._combatApproachKey ?? null;
        const previousApproachMode = troop._combatApproachMode ?? null;
        const approach = CombatSpacingCoordinator.getCombatApproach(troop, target);
        const assignmentChanged =
            previousApproachKey !== (approach?.key ?? null) ||
            previousApproachMode !== (approach?.mode ?? null);

        if (!shouldRepath && !assignmentChanged && troop.currentPath?.length) return false;

        const chaseDest = approach?.destination ?? { x: target.x, y: target.y };
        let path = Player.pathTo(troop, chaseDest.x, chaseDest.y, false);
        if ((!path || !path.length) && (chaseDest.x !== target.x || chaseDest.y !== target.y)) {
            path = Player.pathTo(troop, target.x, target.y, false);
        }
        if (path?.length) {
            Player.moveTo(troop, path);
            return true;
        }

        troop.currentPath = [];
        troop.finalPos = null;
        troop.body?.setVelocity?.(0, 0);
        this._planBreachTicketsForTarget(troop, target);
        return false;
    }

    static updateTracking(troop){
        if (!troop?.active) return;
        if (troop.state === CONTROL_STATES.SLEEP_MODE) {
            troop.track = null;
            troop.forcedTarget = null;
            this.clearRecentCombatAttacker(troop);
            this.clearGunslingerKiteState(troop);
            troop.currentPath?.splice?.(0);
            troop.body?.setVelocity?.(0, 0);
            return;
        }

        const hasWeapon = !!troop.weapon;
        const fallbackDist = troop.body.team
            ? (troop.isGunslinger && hasWeapon ? Math.max(100, Number(troop.weapon?.range || 0), this.GUNSLINGER_DANGER_RADIUS) : 100)
            : 20;
        const awareness = troop?.awareness ?? troop?.type?.awareness;
        const overlapDist = Math.max(
            fallbackDist,
            Number.isFinite(awareness) ? Number(awareness) : 0
        );
        const neighbours = Player.scene.physics.overlapCirc(troop.x, troop.y, overlapDist);
        const isPlayerFighter = troop.body?.team === 1 && this._isFighterUnit(troop) && hasWeapon;

        const isObjectiveTaskState =
            troop.state === CONTROL_STATES.DESTROY_MODE ||
            troop.state === CONTROL_STATES.DESTROY_MODE_T ||
            troop.state === CONTROL_STATES.SIEGE_MODE ||
            troop.state === CONTROL_STATES.FIX_BUILDING;

        if (troop.task && isObjectiveTaskState) {
            if (!isPlayerFighter) return;

            const defenseTarget = this._selectTownDefenseTarget(troop).target;
            if (!defenseTarget?.body) return;

            Player.handleStateIntteruptStart(troop, CONTROL_STATES.TRACK_TARGET);
            this._syncTrackToTarget(troop, defenseTarget);
            troop.roam = false;
        }

        // 🟡 NON-COMBATANTS (no weapon) → FLEE
        if (!hasWeapon) {
            const closest = this.findClosestEnemyBody(troop, neighbours);
            this._handleNonCombatFlee(troop, closest);
            return;
        }

        if (this._clearInvalidForcedTarget(troop)) return;

        if (troop.forcedTarget) {
            const target = troop.forcedTarget;
            const movedTile = this._syncTrackToTarget(troop, target);
            troop.roam = false;
            if (troop.state !== CONTROL_STATES.ATTACK_MODE) {
                Teams.movePlayerState(troop, CONTROL_STATES.TRACK_TARGET);
            }

            if (troop.isGunslinger && this._tryGunslingerKite(troop, target)) {
                return;
            }

            if (this._isAttackReady(troop, target)) {
                this.clearGunslingerKiteState(troop);
                troop.currentPath?.splice?.(0);
                troop.body?.setVelocity?.(0, 0);
                return;
            }

            this._chaseOrBreachTarget(troop, target, movedTile || !troop.currentPath?.length);
            return;
        }

        const hadTrackedTarget =
            !!troop.track?.[0]?.gameObject ||
            troop.state === CONTROL_STATES.TRACK_TARGET ||
            troop.taskMeta?.state === CONTROL_STATES.TRACK_TARGET;
        const defenseSelection = isPlayerFighter ? this._selectTownDefenseTarget(troop) : null;
        const hasDefenseTarget = !!defenseSelection?.target;
        const fallbackTrackedEnemy = hasDefenseTarget ? false : this.mostClosestEnemy(troop, neighbours);
        const hasTrackedEnemy = hasDefenseTarget || fallbackTrackedEnemy;
        const trackedGO = hasDefenseTarget
            ? defenseSelection.target
            : troop.track?.[0]?.gameObject;
        if (!trackedGO?.active) {
            if (!hadTrackedTarget) {
                return;
            }
            fightManager.disengageFromCombat(troop, "combat_target_lost");
            return;
        }
        if (!hasTrackedEnemy && troop.state === CONTROL_STATES.TRACK_TARGET && !troop.track) {
            CombatSpacingCoordinator.clearTroopFocus(troop);
            this.resetRoamState(troop);
            troop.currentPath?.splice?.(0);
            troop.body?.setVelocity?.(0, 0);
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
            return;
        }

        troop.roam = false;
        if (troop.state !== CONTROL_STATES.ATTACK_MODE) {
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_TARGET);
        }
        if (troop.isGunslinger && this._tryGunslingerKite(troop, trackedGO)) {
            return;
        }

        if (this._isAttackReady(troop, trackedGO)) {
            this.clearGunslingerKiteState(troop);
            troop.currentPath?.splice?.(0);
            troop.body?.setVelocity?.(0, 0);
            return;
        }

        this._chaseOrBreachTarget(
            troop,
            trackedGO,
            ((hasDefenseTarget ? defenseSelection?.shouldRepath : fallbackTrackedEnemy) ?? hasTrackedEnemy) || !troop.currentPath?.length
        );
    }

    static _tileTypeAtWorld(x, y) {
        const gx = Math.floor(x / SQUARESIZE);
        const gy = Math.floor(y / SQUARESIZE);
        const row = Map.grid?.[gy];
        if (!row) return null;
        const cell = row[gx];
        if (cell == null) return null;
        if (Array.isArray(cell)) {
            const top = cell[1];
            if (top != null) return TILE_MAP(top);
            return TILE_MAP(cell[0]);
        }
        return TILE_MAP(cell);
    }

    static _isOnWater(troop) {
        return this._tileTypeAtWorld(troop.x, troop.y) === "water";
    }

    static _nearestWalkableWorld(troop, maxRadius = 80) {
        const gx0 = Math.floor(troop.x / SQUARESIZE);
        const gy0 = Math.floor(troop.y / SQUARESIZE);
        const { navGrid } = this._getNavForTroop(troop);
        if (!navGrid?.length) return null;

        const h = navGrid.length;
        const w = navGrid[0]?.length || 0;
        let best = null;
        let bestD2 = Infinity;
        const pushIfWalkable = (gx, gy) => {
            if (gx < 0 || gy < 0 || gx >= w || gy >= h) return;
            if (navGrid[gy][gx] !== 1) return;
            const wx = gx * SQUARESIZE + SQUARESIZE / 2;
            const wy = gy * SQUARESIZE + SQUARESIZE / 2;
            const dx = wx - troop.x;
            const dy = wy - troop.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
                bestD2 = d2;
                best = { x: wx, y: wy };
            }
        };

        for (let r = 1; r <= maxRadius; r++) {
            const minx = gx0 - r;
            const maxx = gx0 + r;
            const miny = gy0 - r;
            const maxy = gy0 + r;
            for (let gx = minx; gx <= maxx; gx++) {
                pushIfWalkable(gx, miny);
                pushIfWalkable(gx, maxy);
            }
            for (let gy = miny + 1; gy <= maxy - 1; gy++) {
                pushIfWalkable(minx, gy);
                pushIfWalkable(maxx, gy);
            }
            if (best) return best;
        }
        return null;
    }

    static _resumeAfterBlockedTileInterrupt(troop, resume) {
        if (!troop?.active || !troop?.body) return;

        if (resume?.state != null) {
            Teams.movePlayerState(troop, resume.state);
        }

        if (troop.task && this._repathCurrentTaskToApproach(troop)) {
            return;
        }

        // Prefer original final world goal.
        if (resume?.finalPos?.x != null && resume?.finalPos?.y != null) {
            const path = this.pathTo(troop, resume.finalPos.x, resume.finalPos.y, false);
            if (path?.length) {
                this.moveTo(troop, path);
                return;
            }
        }

        // Fallbacks by intent.
        if (troop.state === CONTROL_STATES.BACK_TO_TOWN) {
            const path = Teams.sendTroopToTown(troop);
            if (!path?.length) {
                Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
                troop.currentPath?.splice?.(0);
                troop.finalPos = null;
                troop.body?.setVelocity?.(0, 0);
                OrderRunner.stepUnit?.(troop);
            }
            return;
        }

        if (troop.forcedTarget?.active) {
            const path = this.pathTo(troop, troop.forcedTarget.x, troop.forcedTarget.y, false);
            if (path?.length) this.moveTo(troop, path);
            return;
        }

        const tracked = troop.track?.[0]?.gameObject;
        if (tracked?.active) {
            const path = this.pathTo(troop, tracked.x, tracked.y, false);
            if (path?.length) this.moveTo(troop, path);
            return;
        }

        if (troop.task && Number.isFinite(troop.task.x) && Number.isFinite(troop.task.y)) {
            this._repathCurrentTaskToApproach(troop);
        }
    }

    static _handleWaterReturnSwim(troop) {
        if (!troop?.active || !troop?.body) return false;
        if (troop.body.team !== 1) return false;

        const onWater = this._isOnWater(troop);
        const onBlockedTile = !this._worldTileIsWalkableForTroop(troop, troop.x, troop.y);
        const hasCurrentPath = !!troop.currentPath?.length;
        const blocked = onBlockedTile && !hasCurrentPath;
        const recovering = troop._returnSwimActive === true;
        if (!blocked && !recovering) return false;

        if (blocked && !recovering) {
            const { navMesh } = this._getNavForTroop(troop);
            if (navMesh) PathRegistry.unregisterUnit(navMesh, troop);
            troop.__pendingPolyIds = [];
            troop._returnSwimResume = {
                state: troop.state,
                finalPos: troop.finalPos ? { x: troop.finalPos.x, y: troop.finalPos.y } : null,
            };
            troop._returnSwimActive = true;
            troop._returnSwimTarget = this._nearestWalkableWorld(troop);
            troop.currentPath?.splice?.(0);
            troop.finalPos = null;
            troop.body.setVelocity(0, 0);
            PathDebugDrawer.onPathEnd(troop);
        }

        if (!troop._returnSwimTarget) {
            troop._returnSwimTarget = this._nearestWalkableWorld(troop);
        }
        const target = troop._returnSwimTarget;
        if (!target) {
            this.setAnimState(troop, troop.idle);
            troop.body.setVelocity(0, 0);
            return true;
        }

        const dx = target.x - troop.x;
        const dy = target.y - troop.y;
        const dist = Math.hypot(dx, dy);

        if (!blocked) {
            const resume = troop._returnSwimResume || null;
            troop._returnSwimActive = false;
            troop._returnSwimTarget = null;
            troop._returnSwimResume = null;
            troop.body.setVelocity(0, 0);
            this._resumeAfterBlockedTileInterrupt(troop, resume);
            return true;
        }

        const speedBase = troop?.type?.speed ?? troop.speed ?? 90;
        const speedMultiplier = Math.max(0.5, Number(troop?.moveSpeedMultiplier ?? 1) || 1) * getMarketMoveMultiplier(troop);
        const swimSpeed = Math.max(60, speedBase * 0.85 * speedMultiplier * this.getMovementSlowFactor(troop));
        const arrivalRadius = this._getPathArrivalRadius(troop, swimSpeed);
        if (dist <= arrivalRadius) {
            this._snapTroopToPoint(troop, target);
            if (this._worldTileIsWalkableForTroop(troop, troop.x, troop.y)) {
                const resume = troop._returnSwimResume || null;
                troop._returnSwimActive = false;
                troop._returnSwimTarget = null;
                troop._returnSwimResume = null;
                troop.body.setVelocity(0, 0);
                this._resumeAfterBlockedTileInterrupt(troop, resume);
                return true;
            }
        }
        const inv = dist > 0.001 ? 1 / dist : 0;
        const vx = dx * inv * swimSpeed;
        const vy = dy * inv * swimSpeed;

        this.setAnimState(troop, onWater ? (troop.swim || troop.idle) : troop.walk);
        troop.body.setVelocity(vx, vy);
        AudioManager.tryPlayStep(troop);

        const isMoving = Math.abs(vx) > 0.01 || Math.abs(vy) > 0.01;
        updateDirectionalAnimationFromVelocity(troop, vx, vy, isMoving);

        if (isMoving && !shouldUseDirectionalFacing(troop)) {
            troop.rotation = Phaser.Math.Angle.Between(0, 0, vx, vy);
        }

        return true;
    }

    static getMovementSlowFactor(troop) {
        if (!troop?.active) return 1;
        const multiplier = Number(troop.moveSlowMultiplier);
        const until = Number(troop.moveSlowUntil);
        const now = this.scene?.getSimulationNow?.() ?? troop.scene?.getSimulationNow?.() ?? this.scene?.time?.now ?? troop.scene?.time?.now ?? 0;

        if (!(multiplier > 0 && multiplier < 1) || !(until > now)) {
            troop.moveSlowMultiplier = 1;
            troop.moveSlowUntil = 0;
            return 1;
        }

        return multiplier;
    }

    static update(){
        this.troops.forEach( troop => {
            if (Player.scene?.isSimulationPaused?.() ?? Player.scene?.clock?.paused) {
                troop.body.setVelocity(0, 0);
                this._updateSelectionIndicator(troop);
                this._updateCarryIndicator(troop);
                return;
            }

            let skipTail = false;
            this._normalizeIdleMovementState(troop);

            // Raiders get their own AI
            if (troop.isRaider) {
                const raiderController = typeof troop.type?.update === "function" ? troop.type : null;
                if (raiderController) {
                    skipTail = raiderController.update(troop) === true;
                } else {
                    this.updateTracking(troop);
                }
            }
            else if (troop.isGunslinger) {
                Gunslinger.update(troop);
            }
            else if (troop.isBlademaster) {
                Blademaster.update(troop);
            }
            else if (troop.isBrawler) {
                Brawler.update(troop);
            }
            else if (troop.isFortGrunt) {
                skipTail = FortGrunt.update(troop) === true;
            }
            else if (troop.isFarmer) {
                Farmer.update(troop);
            }
            else if (troop.isForager) {
                Forager.update(troop);
            }
            else if (troop.isFireman) {
                Fireman.update(troop);
            }
            else if (troop.isBuilder) {
                Builder.update(troop);
            }
            else {
                // generic enemy / non-class AI
                this.updateTracking(troop);
            }

            // Swimming raiders drive their own velocity, so skip stamina+path
            if (skipTail) return;

            if (this._handleWaterReturnSwim(troop)) {
                this._updateMiniBars(troop);
                this._updateSelectionIndicator(troop);
                this._updateCarryIndicator(troop);
                return;
            }

            StaminaManager.updateTroop(troop);
            if (troop.state != CONTROL_STATES.SLEEP_MODE) {
                this.followPath(troop);
            }
            this._updateAmbientEmotes(troop);

            // 🔥 update world mini HP/ST bars
            this._updateMiniBars(troop);
            this._updateSelectionIndicator(troop);
            this._updateCarryIndicator(troop);
            troop.type?.postUpdate?.(troop);
        });
    }

    static sendGuardOrder(troops, worldX, worldY, radius = SQUARESIZE * 3) {
        if (!troops) return;

        troops.forEach(troop => {
            if (!troop || !troop.active) return;

            // Remember the guard point and radius
            troop.guardCenter = { x: worldX, y: worldY };
            troop.guardRadius = radius;

            // Clear any existing job/target
            troop.roam = false;
            troop.track = null;
            troop.task = null;
            troop.forcedTarget = null;
            CombatSpacingCoordinator.clearTroopFocus(troop);
            this.clearRecentCombatAttacker(troop);
            this.clearGunslingerKiteState(troop);

            // Path to the guard point
            const path = Player.pathTo(troop, worldX, worldY, false);

            if (path && path.length) {
                Player.moveTo(troop, path);
                // TRACK_MODE makes their update() call Player.roam(...) when idle
                Teams.movePlayerState(troop, CONTROL_STATES.HEADING_TO_GUARD);
            } else {
                console.log("No path found for guard order");
                // If no path, at least let them roam from where they are
                troop.roam = true;
            }
        });
    }

    // Player.js
    static setGuardPost(troop, worldX, worldY, radius = SQUARESIZE * 3) {
        if (!troop || !troop.active) return;

        // store the guard post
        troop.guardCenter = { x: worldX, y: worldY };
        troop.guardRadius = radius;
        troop.forcedTarget = null;
        CombatSpacingCoordinator.clearTroopFocus(troop);
        this.clearRecentCombatAttacker(troop);
        this.clearGunslingerKiteState(troop);

        // Set state + path to guard post
        Teams.movePlayerState(troop, CONTROL_STATES.HEADING_TO_GUARD);

        const path = Player.pathTo(troop, troop.guardCenter.x, troop.guardCenter.y, false);

        if (path && path.length) {
            Player.moveTo(troop, path);
        }

        troop.roam = false;
    }

    static playerAvailible(troop){
        if (troop?.currentOrder?.status === "active") {
            return false;
        }
        if(troop.state == CONTROL_STATES.USER_MODE || troop.state == CONTROL_STATES.R_FARM_MODE 
            || troop.state == CONTROL_STATES.BACK_TO_TOWN
            || (troop.state == CONTROL_STATES.TRACK_MODE && (!troop.track || !troop.track.gameObject))){
            if(troop.state == CONTROL_STATES.R_FARM_MODE && troop.task){
                troop.task.assigned = 0;
                troop.task = null;
            }
            return true;
        }
        return false;
    }

    static getRoleTint(cube) {
        let tint;

        switch (true) {
            case cube.isFarmer:
                tint = 0x8B5A2B; // Brown for farmers
                break;
            case cube.isForager:
                tint = 0x228B22;
                break;
            case cube.isFireman:
                tint = 0xff9933;
                break;
            case cube.isGunslinger:
                tint = 0x9999ff;
                break;
            case cube.isBuilder:
                tint = 0x4433ff;
                break;
            case cube.isBlademaster:
                tint = 0xAA33EE;
                break;
            case cube.isBrawler:
                tint = 0xFFD712;
                break;
            case cube.isFortGrunt:
                tint = 0x8b0000;
                break;
            case cube.body.team === 1:
                tint = 0x64ff32; // Green for your team
                break;
            default:
                tint = 0xff0000; // Red for others
                break;
        }

        return tint;
    }

    static applyRoleTint(cube) {
        const tint = this.getRoleTint(cube);
        if (cube?.setTint && tint != null) {
            cube.setTint(tint);
        }
    }


    static setUpBackToTown(){
        this.scene.input.keyboard.on('keydown-B', () => {
            if (!this.selected.length) return;
            OrderRunner.sendTroopsToTown(this.selected);
        });
    }

    //------------------------------MINI BAR LOGIC---------------------------

    static _ensureMiniBars(troop) {
    if (troop._miniBarsInit || !this.scene || !troop) return;

    troop._hpSegBg = [];
    troop._hpSegFill = [];
    troop._stSegBg = [];
    troop._stSegFill = [];

    troop._miniBarsSegCap = 0;
    troop._miniBarsInit = true;
    }

    static _rebuildMiniBarSegments(troop, segCap) {
    const scene = this.scene;
    const H = this.MINI_BAR_HEIGHT;
    const pad = this.MINI_BAR_PAD;

    const isEnemy = troop.body?.team === 0;
    const hpFillColor = isEnemy ? 0xff5b57 : 0x74f08b;
    const stFillColor = 0x4dc9ff;

    const mkBg = () => scene.add.rectangle(0, 0, 1, H, 0x08131b, 0.88)
        .setOrigin(0, 0.5)
        .setDepth(BLOCKDEPTH + 2)
        .setStrokeStyle(1, 0xd6f4ff, 0.2);

    const mkFill = (fillColor) => scene.add.rectangle(0, 0, 1, Math.max(2, H - (pad * 2)), fillColor, 1)
        .setOrigin(0, 0.5)
        .setDepth(BLOCKDEPTH + 3);

    while ((troop._miniBarsSegCap || 0) < segCap) {
        const hpBg = mkBg();
        const hpFill = mkFill(hpFillColor);
        troop._hpSegBg.push(hpBg);
        troop._hpSegFill.push(hpFill);

        // stamina only for friendlies (reduces clutter)
        if (!isEnemy) {
        const stBg = mkBg();
        const stFill = mkFill(stFillColor);
        troop._stSegBg.push(stBg);
        troop._stSegFill.push(stFill);
        }

        troop._miniBarsSegCap++;
    }

    for (let i = 0; i < troop._miniBarsSegCap; i++) {
        troop._hpSegBg[i]?.setVisible(false);
        troop._hpSegFill[i]?.setVisible(false);
        troop._stSegBg[i]?.setVisible(false);
        troop._stSegFill[i]?.setVisible(false);
    }
    }

    static _destroyMiniBars(troop) {
    const kill = (arr) => {
        if (!arr) return;
        for (const o of arr) o?.destroy?.();
    };

    kill(troop._hpSegBg);
    kill(troop._hpSegFill);
    kill(troop._stSegBg);
    kill(troop._stSegFill);

    troop._hpSegBg = null;
    troop._hpSegFill = null;
    troop._stSegBg = null;
    troop._stSegFill = null;

    troop._miniBarsSegCap = 0;
    troop._miniBarsInit = false;
    }

    static _hideMiniBars(troop) {
    if (!troop?._miniBarsInit) return;
    for (let i = 0; i < (troop._miniBarsSegCap || 0); i++) {
        troop._hpSegBg?.[i]?.setVisible(false);
        troop._hpSegFill?.[i]?.setVisible(false);
        troop._stSegBg?.[i]?.setVisible(false);
        troop._stSegFill?.[i]?.setVisible(false);
    }
    }

    static _layoutSegmentBar({ bgArr, fillArr, xLeft, y, totalW, cur, max, segUnit, gap, pad, segCap }) {
    const safeMax = Math.max(0.0001, Number(max) || 0);
    const safeCur = Phaser.Math.Clamp(Number(cur) || 0, 0, safeMax);

    const segCount = Math.max(1, Math.ceil(safeMax / segUnit));
    const lastFrac = Phaser.Math.Clamp((safeMax % segUnit) / segUnit || 1, 0.05, 1);

    const innerW = Math.max(1, totalW - pad * 2);
    const baseSegW = (innerW - (segCount - 1) * gap) / segCount;

    // drain capacity so the last segment truncation behaves naturally
    let remaining = safeCur;

    for (let i = 0; i < segCap; i++) {
        const show = i < segCount;
        const bg = bgArr?.[i];
        const fill = fillArr?.[i];
        if (!bg || !fill) continue;

        if (!show) {
        bg.setVisible(false);
        fill.setVisible(false);
        continue;
        }

        const isLast = i === segCount - 1;
        const segW = baseSegW * (isLast ? lastFrac : 1);
        const segX = xLeft + pad + i * (baseSegW + gap);

        bg.setPosition(segX, y);
        bg.width = segW;
        bg.setVisible(true);

        const segCapVal = segUnit * (isLast ? lastFrac : 1);
        const ratio = Phaser.Math.Clamp(remaining / segCapVal, 0, 1);
        const fillW = segW * ratio;

        fill.setPosition(segX, y);
        fill.width = fillW;
        fill.setVisible(fillW > 0.25);

        remaining -= segCapVal;
    }
    }

    static _updateMiniBars(troop) {
    if (!this.scene || !troop || !troop.active) return;

    if (troop.isBoss || troop.isShocker) {
        this._hideMiniBars(troop);
        return;
    }

    if (troop.state === CONTROL_STATES.SLEEP_MODE || troop.visible === false || troop.alpha === 0) {
        this._hideMiniBars(troop);
        return;
    }

    const scene = this.scene;

    const fromSelection = !!troop.selected;
    const fromHover = !!troop._miniBarHover;
    const fromTab = !!(
        troop._miniBarSelectedFromTab &&
        scene.uiBottomBar?.expanded &&
        scene.uiBottomBar?.currentPage === "players"
    );
    const recentHitAt = Number(troop._miniBarLastHit) || 0;
    const fromHit = recentHitAt > 0 && ((scene.time.now || 0) - recentHitAt) <= this.MINI_BAR_HIT_MS;
    const shouldShow = fromSelection || fromHover || fromTab || fromHit;

    if (!shouldShow) {
        this._hideMiniBars(troop);
        return;
    }

    this._ensureMiniBars(troop);

    const H = this.MINI_BAR_HEIGHT;
    const segUnit = this.MINI_BAR_SEG_UNIT;
    const gap = this.MINI_BAR_GAP;
    const pad = this.MINI_BAR_PAD;

    const isEnemy = troop.body?.team === 0;

    // type caps
    const maxHP = troop.maxHealth ?? (troop.body?.team === 1 ? 200 : 100);
    const maxST = troop.maxStamina ?? troop.maxStaminaValue ?? 100;

    // bar length scales by the *larger* of HP/ST, so both bars match length
    const maxForSize = isEnemy ? maxHP : Math.max(maxHP, maxST);

    const sizeSegCount = Math.max(1, Math.ceil(maxForSize / segUnit));
    let totalW = sizeSegCount * this.MINI_BAR_BASE_SEG_W + (sizeSegCount - 1) * gap + pad * 2;
    if (totalW > this.MINI_BAR_MAX_W) totalW = this.MINI_BAR_MAX_W;

    if ((troop._miniBarsSegCap || 0) < sizeSegCount) {
        this._rebuildMiniBarSegments(troop, sizeSegCount);
    }

    const baseX = troop.x;
    const baseY = troop.y + (troop.displayHeight || SQUARESIZE) / 2 + this.MINI_BAR_OFFSET_Y;
    const xLeft = baseX - totalW / 2;

    // HP: always visible when shouldShow
    this._layoutSegmentBar({
        bgArr: troop._hpSegBg,
        fillArr: troop._hpSegFill,
        xLeft,
        y: baseY,
        totalW,
        cur: troop.health ?? 0,
        max: maxHP,
        segUnit,
        gap,
        pad,
        segCap: troop._miniBarsSegCap || 0
    });

    // Stamina: friendlies only
    if (!isEnemy) {
        this._layoutSegmentBar({
        bgArr: troop._stSegBg,
        fillArr: troop._stSegFill,
        xLeft,
        y: baseY + H + 3,
        totalW,
        cur: troop.stamina ?? 0,
        max: maxST,
        segUnit,
        gap,
        pad,
        segCap: troop._miniBarsSegCap || 0
        });
    } else {
        for (let i = 0; i < (troop._miniBarsSegCap || 0); i++) {
        troop._stSegBg?.[i]?.setVisible(false);
        troop._stSegFill?.[i]?.setVisible(false);
        }
    }
    }

    // called by hover in configureCubeInteractivity
    static setMiniBarHover(troop, on) {
        if (!troop) return;
        troop._miniBarHover = !!on;
        this._updateSelectionIndicator(troop);
    }

    // called by fightManager when target gets hit
    static showMiniBarsOnHit(troop) {
        if (!this.scene || !troop) return;
        troop._miniBarLastHit = this.scene.time.now;
    }

    // called by PlayerTab when row selection changes
    static setMiniBarSelectedFromTab(selectedTroop) {
        if (!this.troops) return;
        this.troops.forEach(t => {
            t._miniBarSelectedFromTab = (t === selectedTroop);
            this._updateSelectionIndicator(t);
        });
    }

    static prepareTroopForSleep(troop) {
        if (!troop) return;

        const selectedIndex = this.selected.indexOf(troop);
        if (selectedIndex !== -1) {
            this.selected.splice(selectedIndex, 1);
        }

        troop._miniBarHover = false;
        troop._miniBarSelectedFromTab = false;
        troop._miniBarLastHit = 0;
        this._setTroopSelected(troop, false);
        this._hideMiniBars(troop);
        this.clearRecentCombatAttacker(troop);
        this.clearGunslingerKiteState(troop);

        this.clearPoseLock(troop, troop.idle);
        this._clearStatusEmote(troop);
        troop.deferredCarry = null;
        troop.carrying = null;
        StorageManager.releaseDeliveryReservation(troop);
        this._updateCarryIndicator(troop);
    }

    static tryEnterQueuedSleep(troop) {
        if (!troop?.active || !troop._sleepQueued) return false;

        if (troop.state === CONTROL_STATES.SLEEP_MODE) {
            troop._sleepQueued = false;
            troop._sleepQueuedAt = 0;
            return true;
        }

        if (troop.state === CONTROL_STATES.GO_HOME_MODE) {
            return false;
        }

        if (troop.task) return false;
        if (troop.timer) return false;
        if (troop.track) return false;
        if (troop.currentPath?.length) return false;
        if (StorageManager.isCarrying(troop)) return false;
        if (troop.pendingFuelJob || troop.pendingOvenJob) return false;
        if (troop.state !== CONTROL_STATES.TRACK_MODE) return false;

        const result = OrderRunner.toggleSleepTroops?.([troop]);
        if (result?.ok) {
            troop._sleepQueued = false;
            troop._sleepQueuedAt = 0;
            return true;
        }

        return false;
    }

    static onWallDestroyed(troop, task) {
    const teamNumber = troop.body.team;
    Teams.removeFromStateArray(teamNumber, "enemyDestroyTileStates", task);

    troop.task = null;
    if (troop.timer) { troop.timer.remove(false); troop.timer = null; }
    troop.play(troop.idle);
    Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
    }

    static onBlockDestroyed(troop, task) {
    const teamNumber = troop.body.team;
    Teams.removeFromStateArray(teamNumber, "enemyDestroyStates", task);

    troop.task = null;
    if (troop.timer) { troop.timer.remove(false); troop.timer = null; }
    troop.play(troop.idle);
    Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
    }
      
}
