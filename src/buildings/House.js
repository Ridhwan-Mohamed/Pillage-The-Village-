import { BLOCKDEPTH, CONTROL_STATES, SQUARESIZE, TILE_TYPES, UIDEPTH, showGhostText } from "../constants";
import { Map } from "../map";
import { Teams } from "../Teams";
import { VisibilitySystem } from "../UI/VisibilitySystem";
import { buildingManager } from "../Manager/buildingManager";
import { StaminaManager } from "../Manager/staminaManager";
import {
    applyPortraitKeyToSprite,
    DEFAULT_PLAYER_PORTRAIT_KEY,
    getPlayerPortraitKey,
} from "../players/playerPortraits";
import {
    createBuildingHoverPanel,
    destroyStructuralHealthBar,
    ensureStructuralHealthBar,
    getStructuralBarAnchor,
    getStructuralHealthBarTargets,
    layoutStructuralHealthBar,
} from "../UI/BuildingTheme";
import { playBuildingCollapseSmoke } from "../FX/SmokeClearing";
import { animateOverlayPop, isOverviewMode } from "../UI/OverlayPopAnimator";

export class House {

    static scene;
    static _overviewMode = false;
    static _zoomModeScene = null;
    static _onZoomModeChanged = null;

    constructor(x, y, houseType, team) {
        this.scene = House.scene;
        House._ensureZoomModeListener(this.scene);
        this.x = x;
        this.y = y;
        this.team = team;
        this.tileType = houseType;
        this.capacity = 2;
        this.occupants = [];
        this._isBroken = false;
        this._removedFromHouseList = false;
        this.uiContainer = House.scene.add.container(0, 0).setDepth(UIDEPTH);
        this.sleepFxContainer = House.scene.add.container(0, 0).setDepth(UIDEPTH + 1);
        this.sleepFxByPlayer = new globalThis.Map();

        // 🔹 Building health
        this.maxHealth = 300;
        this.health = this.maxHealth;
        this.healthBarBg = null;
        this.healthBar   = null;
        this._damageBarUntil = 0;

        this.sprite = Map.addToWorldStatic(
            House.scene.add.image(x * SQUARESIZE, y * SQUARESIZE, houseType.name)
                .setOrigin(0)
                .setDepth(BLOCKDEPTH)
                .setInteractive()
            )
                .setOrigin(0)
                .setDepth(BLOCKDEPTH)
                .setInteractive()
                .on('pointerdown', () => {
                    const scene = this.scene;
                    if (scene?.destroyWallMode) return;
                    const handled = buildingManager.handleBuildingClickForBuilders(this, null, this.team);
                    if (handled) return;

                    // Prefer BottomBar tab flow (like ovens/storage)
                    if (scene?.openDetailPage) {
                        scene.openDetailPage('houses', (tab) => {
                            tab?.selectFromWorld?.(this);  // select + center handled by tab
                        });
                        return;
                    }
                });
        Map.drawRoadAround(x,y,houseType,team);
        Map.addBlockItem(x,y,houseType);
        this.collider = Map.addStructureBarrier(
            x * SQUARESIZE + ((houseType?.lenX ?? 1) * SQUARESIZE) / 2,
            y * SQUARESIZE + ((houseType?.lenY ?? 1) * SQUARESIZE) / 2,
            (houseType?.lenX ?? 1) * SQUARESIZE,
            (houseType?.lenY ?? 1) * SQUARESIZE,
            {
                team: this.team,
                buildingRef: this,
            }
        );
        if (this.collider) this.collider.isBuilding = true;

        if(team == 1){
            const cx = x + Math.floor(houseType.lenX/2);
            const cy = y + Math.floor(houseType.lenY/2);
            // Vision bubble so nearby tiles are slightly brighter
            this.visionId = VisibilitySystem.addVisionBubble({ x: cx, y: cy, r: 6, boost: 0.10 });
            // Optional: small porch light (trim or remove if you don’t want light)
            this.lightId  = VisibilitySystem.addLightSource({ x: cx, y: cy, r: 5, brightness: 2 });
        }

        this.sprite.buildingRef = this;

        this.sprite.on('pointerover', () => {
            this.isHovered = true;
            this.updateHealthBar?.();
            this.updateIcons();
        });
        this.sprite.on('pointerout', () => {
            this.isHovered = false;
            this.updateHealthBar?.();
            this.clearIcons();
        });

        this.uiIcons = [null, null];
        Teams.teamLists[team].houseList.push(this);
        Teams.teamLists[team].buildings.push([x, y, TILE_TYPES.house1, this.sprite])
        Teams.assignHomelessPlayersToHouses?.(team);
        this.scene?.events?.emit?.("housing:updated", team);
    }

    canAcceptPlayer() {
        return !this._isBroken && this.occupants.length < this.capacity;
    }

    static availableHouse(team) {
        return Teams.canRecruitPlayer?.(team) ?? false;
    }

    static _ensureZoomModeListener(scene) {
        if (!scene?.events || this._zoomModeScene === scene) return;
        if (this._zoomModeScene?.events && this._onZoomModeChanged) {
            this._zoomModeScene.events.off("zoom:mode-changed", this._onZoomModeChanged);
        }

        this._zoomModeScene = scene;
        this._onZoomModeChanged = (mode, duration) => this.applyOverviewMode(mode, duration);
        scene.events.on("zoom:mode-changed", this._onZoomModeChanged);
        scene.events.once("shutdown", () => {
            if (this._onZoomModeChanged) {
                scene.events.off("zoom:mode-changed", this._onZoomModeChanged);
            }
            if (this._zoomModeScene === scene) this._zoomModeScene = null;
        });
    }

    static applyOverviewMode(mode, duration = 160) {
        const overview = mode === "overview";
        this._overviewMode = overview;
        for (const team of Object.values(Teams.teamLists || {})) {
            const houses = Array.isArray(team?.houseList) ? team.houseList : [];
            houses.forEach((house) => house?._setAboveBuildingOverlaysVisible?.(!overview, duration));
        }
    }

    _isOverviewMode() {
        return House._overviewMode || isOverviewMode(this.scene);
    }

    static assignPlayerToHouse(player, team){
        const house = Teams.teamLists[team].houseList.find(h => h.canAcceptPlayer());
        if (!house) return false;
        house.assignPlayer(player);
        return true;
    }

    assignPlayer(player) {
        if (!this.canAcceptPlayer()) return false;
        const oldHouse = player?.home && player.home !== this ? player.home : null;
        if (player?.home && player.home !== this) {
            const oldIndex = player.home.occupants?.indexOf(player) ?? -1;
            if (oldIndex !== -1) {
                player.home.occupants.splice(oldIndex, 1);
            }
        }
        this.occupants.push(player);
        player.home = this;   // 🔑 reference to their house
        if (oldHouse) {
            if (oldHouse.isHovered && oldHouse.occupants?.length) oldHouse.updateIcons?.();
            else oldHouse.clearIcons?.();
        }
        this.scene?.events?.emit?.("housing:updated", this.team);
        return true;
    }

    updateIcons() {
        if (this._isOverviewMode()) {
            this.clearIcons();
            return;
        }
        this.clearIcons(); // always start fresh
        if (!this.occupants.length) return;

        const bounds = this.sprite.getBounds();
        const iconCount = this.occupants.length;
        const iconSpacing = 26;
        const panelWidth = Math.max(78, 40 + ((iconCount - 1) * iconSpacing));

        this.iconPanel = createBuildingHoverPanel(this.scene, {
            x: bounds.centerX,
            y: bounds.top - 14,
            width: panelWidth,
            height: 34,
            depth: UIDEPTH,
            accentColor: 0x9be7ff,
        });
        this.iconPanel.setAlpha(0).setScale(0.82);
        this.uiContainer.add(this.iconPanel);

        this.uiIcons = this.occupants.map((p, i) => {
            const icon = this.scene.add.sprite(
                ((i - ((iconCount - 1) * 0.5)) * iconSpacing),
                1,
                DEFAULT_PLAYER_PORTRAIT_KEY
            ).setDepth(UIDEPTH + 2);
            applyPortraitKeyToSprite(this.scene, icon, getPlayerPortraitKey(p), 18);
            this.iconPanel.add(icon);
            return icon;
        });
        animateOverlayPop(this.scene, this.iconPanel, true, { duration: 140 });

    }

    getSleepAnchorForOccupant(player) {
        if (!this.sprite) return null;
        const idx = Math.max(0, this.occupants?.indexOf(player) ?? 0);
        const bounds = this.sprite.getBounds?.() || {
            x: this.sprite.x,
            y: this.sprite.y,
            width: this.sprite.displayWidth || (TILE_TYPES.house1.lenX * SQUARESIZE),
            height: this.sprite.displayHeight || (TILE_TYPES.house1.lenY * SQUARESIZE),
            centerX: this.sprite.x + ((this.sprite.displayWidth || (TILE_TYPES.house1.lenX * SQUARESIZE)) * 0.5),
            centerY: this.sprite.y + ((this.sprite.displayHeight || (TILE_TYPES.house1.lenY * SQUARESIZE)) * 0.5),
        };
        const sideOffset = Math.max(10, Math.round(bounds.width * 0.18));
        return {
            x: bounds.centerX + (idx <= 0 ? -sideOffset : sideOffset),
            y: bounds.centerY + Math.min(10, Math.round(bounds.height * 0.16)),
            side: idx <= 0 ? "left" : "right",
            index: idx
        };
    }

    getSleepGlyphAnchorForOccupant(player) {
        const anchor = this.getSleepAnchorForOccupant(player);
        if (!anchor || !this.sprite) return anchor;
        const bounds = this.sprite.getBounds?.() || {
            y: this.sprite.y,
            centerY: this.sprite.y + ((this.sprite.displayHeight || (TILE_TYPES.house1.lenY * SQUARESIZE)) * 0.5),
        };
        return {
            ...anchor,
            y: bounds.centerY - 6
        };
    }

    _spawnSleepGlyph(player, fx) {
        if (this._isOverviewMode()) return;
        if (!player || !fx || !this.scene || !this.sprite || player.home !== this || player.state !== CONTROL_STATES.SLEEP_MODE) {
            this.stopSleepingVisual(player);
            return;
        }

        const anchor = this.getSleepGlyphAnchorForOccupant(player);
        if (!anchor) return;

        const leftSide = anchor.side === "left";
        const xJitter = leftSide ? -4 + Math.random() * 4 : 4 - Math.random() * 4;
        const glyph = this.scene.add.text(anchor.x + xJitter, anchor.y, "Z", {
            fontFamily: "Bungee",
            fontSize: "18px",
            color: "#f8fafc",
            stroke: "#164e63",
            strokeThickness: 4
        })
            .setOrigin(0.5)
            .setDepth(UIDEPTH + 2)
            .setAlpha(0.96)
            .setScale(0.48)
            .setAngle(leftSide ? -9 : 9);

        this.sleepFxContainer.add(glyph);
        fx.glyphs.add(glyph);

        const riseY = glyph.y - (22 + Math.random() * 10);
        const driftX = glyph.x + (leftSide ? -3 - Math.random() * 2 : 3 + Math.random() * 2);
        const startAngle = glyph.angle;
        const swayDelta = leftSide ? -7 : 7;

        this.scene.tweens.add({
            targets: glyph,
            angle: startAngle + swayDelta,
            duration: 220,
            ease: "Sine.easeInOut",
            yoyo: true,
            repeat: 2
        });

        this.scene.tweens.add({
            targets: glyph,
            x: driftX,
            y: riseY,
            scale: 1.18,
            alpha: 0,
            duration: 960,
            ease: "Sine.easeOut",
            onComplete: () => {
                fx.glyphs.delete(glyph);
                glyph.destroy();
            }
        });
    }

    startSleepingVisual(player) {
        if (!player || !this.scene) return;
        this.stopSleepingVisual(player);

        const fx = {
            glyphs: new Set(),
            event: null
        };

        this.sleepFxByPlayer.set(player, fx);
        if (!this._isOverviewMode()) this._spawnSleepGlyph(player, fx);
        fx.event = this.scene.time.addEvent({
            delay: 420,
            loop: true,
            callback: () => this._spawnSleepGlyph(player, fx)
        });
    }

    stopSleepingVisual(player) {
        const fx = this.sleepFxByPlayer?.get(player);
        if (!fx) return;

        fx.event?.remove(false);
        for (const glyph of fx.glyphs) {
            this.scene?.tweens?.killTweensOf?.(glyph);
            glyph.destroy?.();
        }
        fx.glyphs.clear();
        this.sleepFxByPlayer.delete(player);
    }

    stopAllSleepingVisuals() {
        if (!this.sleepFxByPlayer?.size) return;
        for (const player of Array.from(this.sleepFxByPlayer.keys())) {
            this.stopSleepingVisual(player);
        }
    }

    _hideSleepingGlyphs(duration = 140) {
        if (!this.sleepFxByPlayer?.size) return;
        for (const fx of Array.from(this.sleepFxByPlayer.values())) {
            for (const glyph of Array.from(fx.glyphs || [])) {
                this.scene?.tweens?.killTweensOf?.(glyph);
                animateOverlayPop(this.scene, glyph, false, {
                    duration,
                    hiddenScale: 0.55,
                    onComplete: () => {
                        fx.glyphs.delete(glyph);
                        glyph.destroy?.();
                    }
                });
            }
        }
    }

    _setAboveBuildingOverlaysVisible(visible = true, duration = 160) {
        if (!visible) {
            this.clearIcons({ animate: true, duration });
            this._hideSleepingGlyphs(duration);
            return;
        }

        this.sleepFxContainer?.setVisible?.(true);
        if (this.isHovered) this.updateIcons();
        for (const [player, fx] of Array.from(this.sleepFxByPlayer || [])) {
            if (player?.state === CONTROL_STATES.SLEEP_MODE && player?.home === this) {
                this._spawnSleepGlyph(player, fx);
            }
        }
    }

    _removeFromHouseList() {
        if (this._removedFromHouseList) return;
        const list = Teams.teamLists?.[this.team]?.houseList;
        if (Array.isArray(list)) {
            const i = list.indexOf(this);
            if (i !== -1) list.splice(i, 1);
        }
        this._removedFromHouseList = true;
    }

    evacuateResidents() {
        if (this._isBroken && (!Array.isArray(this.occupants) || this.occupants.length === 0)) {
            return;
        }

        this._isBroken = true;
        this._removeFromHouseList();
        this.stopAllSleepingVisuals();

        const displacedPlayers = Array.isArray(this.occupants) ? [...this.occupants] : [];
        this.occupants = [];

        for (const player of displacedPlayers) {
            if (!player || player.active === false) continue;

            if (player.state === CONTROL_STATES.SLEEP_MODE) {
                StaminaManager.wakeUp(player);
            } else if (player.state === CONTROL_STATES.GO_HOME_MODE) {
                player.task = null;
                player.currentPath = [];
                player.setVelocity?.(0, 0);
                Teams.movePlayerState(player, CONTROL_STATES.TRACK_MODE);
            }

            if (player.home === this) {
                player.home = null;
            }
            if (player.icon) {
                player.icon.followingHouse = false;
            }
        }

        this.clearIcons?.();
        this.scene?.events?.emit?.("housing:updated", this.team);
        Teams.assignHomelessPlayersToHouses?.(this.team);
    }

    clearIcons(opts = {}) {
        if (this.iconPanel) {
            const panel = this.iconPanel;
            this.iconPanel = null;
            if (opts.animate && panel?.active) {
                animateOverlayPop(this.scene, panel, false, {
                    duration: Math.max(0, Number(opts.duration ?? 120) || 0),
                    onComplete: () => panel.destroy()
                });
            } else {
                panel.destroy();
            }
        }

        if (!opts.animate) {
            for (const icon of this.uiIcons) {
                if (icon?.active) icon.destroy();
            }

            this.uiContainer.removeAll(true);
        }

        this.uiIcons = [];
    }

    selectFromWorld(house) {
        if (!house) return;
        this.select(house);
        this.centerOnHouse(house);
    }

    centerOnHouse(house) {
        const cam = this.scene?.uiScene?.worldScene?.cameras?.main || this.scene.cameras.main;
        if (!cam || !house?.sprite) return;

        const b = house.sprite.getBounds();
        cam.centerOn(b.centerX, b.centerY);
    }

    ensureHealthBar() {
        if (!this.sprite) return;
        const scene = this.scene;
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
            paddingX: 14,
            yOffset: 12,
        });

        const now = this.scene?.time?.now ?? 0;
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
        const baseAngle = Number.isFinite(this._damageRestAngle) ? this._damageRestAngle : (this.sprite.angle || 0);
        this._damageRestAngle = baseAngle;
        this._damageShakeTween?.stop?.();
        this.sprite.angle = baseAngle;

        this._damageShakeTween = this.scene.tweens.add({
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
        this.scene.time.delayedCall(120, () => {
            if (this.sprite) this.sprite.clearTint();
        });
    }

    // Called by buildingManager.beginDestroyingBlock
    onDamaged(damage, currentHealth, maxHealth) {
        this.maxHealth = maxHealth ?? this.maxHealth ?? 1;
        this.health = Math.max(0, currentHealth);
        buildingManager.queueAutoFixForBuilding(this, this.team);

        if (this.health <= 0 && !this._isBroken) {
            this.evacuateResidents();
        }

        this.shakeAndFlash();
        const now = House.scene?.time?.now ?? 0;
        this._damageBarUntil = now + 2000;
        this.updateHealthBar();
        // 🔑 force a visibility re-check after expiry (so it hides without hover)
        this._damageBarTimer?.remove(false);
        this._damageBarTimer = House.scene.time.delayedCall(2000, () => {
            this.updateHealthBar?.();
        });


        const fullWidth = this.sprite.displayWidth || (TILE_TYPES.house1.lenX * SQUARESIZE);
        const textX = this.sprite.x + fullWidth / 2;
        const textY = this.sprite.y - this.sprite.displayHeight / 2 - 8;

        showGhostText(
            this.scene,
            textX,
            textY,
            `-${damage}`,
            this.team, 0, 0,
            '#ff5555'
        );
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this.health = 0;
        this._damageBarTimer?.remove(false);
        this._damageBarTimer = null;
        this.evacuateResidents();

        if (this.visionId) VisibilitySystem.removeVisionBubble(this.visionId);
        if (this.lightId)  VisibilitySystem.removeLightById(this.lightId);
        destroyStructuralHealthBar(this);
        this.sleepFxContainer?.destroy();
        buildingManager.cleanupDestroyedBlockBuilding?.(this, this.x, this.y, this.tileType);
        buildingManager.playBuildingCollapseSfxOnce?.(this, { volume: 0.32 });
        playBuildingCollapseSmoke(this);
        Map.removeStructureBarrier(this.collider);
        this.collider = null;
        this.sprite?.destroy();
        this.clearIcons?.();
        this.scene?.events?.emit?.("housing:updated", this.team);
    }
}
