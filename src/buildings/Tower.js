// buildings/Tower.js
// Town Tower / enemy tower building (shared footprint + health + destroy flow)

import { BLOCKDEPTH, ENEMY_BUILDING_HOVER_UI, SQUARESIZE, TILE_TYPES, UIDEPTH, showGhostText } from "../constants";
import { buildingManager } from "../Manager/buildingManager";
import { Map } from "../map";
import { StageState } from "../parcelController/StageState";
import { Teams } from "../Teams";
import {
  BUILDING_PANEL_TEXT_STYLES,
  createBuildingHoverPanel,
  destroyStructuralHealthBar,
  ensureStructuralHealthBar,
  getStructuralBarAnchor,
  getStructuralHealthBarTargets,
  layoutStructuralHealthBar,
} from "../UI/BuildingTheme";
import { VisibilitySystem } from "../UI/VisibilitySystem";
import { playBuildingCollapseSmoke } from "../FX/SmokeClearing";
import { getBalanceDay, getTownTowerDawnIncome } from "../balance/GameBalance";

/**
 * TowerBuilding
 * - Assumes spritesheet key: 'tower' (2 frames)
 * - Plays animation 'tower_idle'
 * - buildingManager.beginDestroyingBlock drives damage by calling sprite.buildingRef.onDamaged(...)
 */
export class TowerBuilding {
  static scene;

  static getLivingTownTowers(teamNumber = 1) {
    const towers = Teams.teamLists?.[teamNumber]?.townTowerList || [];
    return towers.filter((tower) => tower && !tower._destroyed && tower.health > 0);
  }

  static hasLivingTownTowers(teamNumber = 1) {
    return this.getLivingTownTowers(teamNumber).length > 0;
  }

  static grantDawnIncome(scene, teamNumber = 1, opts = {}) {
    const towers = this.getLivingTownTowers(teamNumber);
    if (!towers.length) return null;

    const money = getTownTowerDawnIncome(scene, towers.length);
    const skippedStarterPermits = opts.skipStarterPermits
      ? towers.filter((tower) => tower.isStarterTownTower).length
      : 0;
    const permits = Math.max(0, towers.length - skippedStarterPermits);
    scene?.updateMoney?.(money);
    if (permits > 0) scene?.updatePermits?.(permits);

    return { towers, money, permits, skippedStarterPermits };
  }

  constructor(x, y, team = 0, opts = {}) {
    this.scene = TowerBuilding.scene;
    this.x = x;
    this.y = y;
    this.team = team;
    this.isPressureTower = !!opts.isPressureTower;
    this.isFortObjective = !!opts.isFortObjective;
    this.isTownTower = !!opts.isTownTower || (!!team && !this.isFortObjective && !this.isPressureTower);
    this.isStarterTownTower = !!opts.isStarterTownTower;
    this.grantBuildPermit = !!opts.grantBuildPermit;
    this.pressureSlotId = opts.pressureSlotId ?? null; // "N"|"W"|"E"|"S"
    if (this.isFortObjective) {
      StageState.registerFortTower(this);
    }

    const tileType = TILE_TYPES.tower || { lenX: 1, lenY: 1, name: "tower" };
    const lenX = tileType.lenX || 1;
    const lenY = tileType.lenY || 1;

    this.maxHealth = opts.maxHealth ?? tileType.maxHealth ?? 600;
    this.health = this.maxHealth;

    this.healthBarBg = null;
    this.healthBar = null;
    this._damageBarUntil = 0;
    this._damageBarTimer = null;
    this.isHovered = false;
    // Hover UI (Prison-style panel)
    this.uiContainer = this.scene.add.container(0, 0).setDepth(UIDEPTH);
    this.panelRoot = null;
    this.panelBg = null;
    this.panelText1 = null;
    this.panelText2 = null;

    this._ensureTowerAnim();

    // Prefer sprite (spritesheet) instead of image
    const px = x * SQUARESIZE + (lenX * SQUARESIZE) / 2;
    const py = y * SQUARESIZE + (lenY * SQUARESIZE) / 2;

    this.sprite = Map.addToWorldStatic(
      this.scene
        .add
        .sprite(px, py, "tower")
        .setDepth(BLOCKDEPTH)
        .setInteractive({ cursor: "pointer" })
    );
    const cx = x + Math.floor((lenX || 1) / 2);
    const cy = y + Math.floor((lenY || 1) / 2);
    this.visionId = VisibilitySystem.addVisionBubble({ x: cx, y: cy, r: 7, boost: 0.12 });
    this.lightId = VisibilitySystem.addLightSource({ x: cx, y: cy, r: 6, brightness: 2 });

    this.sprite.setInteractive({ useHandCursor: true });
    // keep sprite interactive/visible (no physics needed on it)
    this.sprite.buildingRef = this;
    this.sprite.isBuilding = true;

    // Example: if tower is wTiles by hTiles tiles
    const w = lenX * SQUARESIZE;
    const h = lenY * SQUARESIZE;

    this.collider = Map.addStructureBarrier(px, py, w, h, {
      team: this.team,
      buildingRef: this,
    });

    if (this.isPressureTower) {
      this.scene?.towerPressureController?.registerTower?.(this, this.pressureSlotId);
    }

    // add to your structure barrier group that projectiles overlap against
    if (this.collider) {
      this.collider.buildingRef = this;
      this.collider.isBuilding = true;
      this.collider.team = this.team;
    }

    this.sprite.buildingRef = this;
    this.sprite.team = this.team;
    this.tileType = TILE_TYPES.tower;

    if (this.isTownTower && Teams.teamLists?.[team]) {
      Teams.teamLists[team].townTowerList.push(this);
      Teams.teamLists[team].buildings.push([x, y, TILE_TYPES.tower, this.sprite]);
      const stats = this.scene?._townTowerStats || (this.scene._townTowerStats = { built: 0, destroyed: 0 });
      stats.built += 1;

      if (this.grantBuildPermit && this.team === 1) {
        this.scene?.updatePermits?.(1);
        showGhostText(this.scene, this.sprite.x, this.sprite.y - 14, "+1 Permit", this.team, 0, 0, "#9be7ff");
      }
    }

    // Click enemy structure to toggle a fighter destruction task (team 1 queues)
    this.sprite.on("pointerdown", () => {
      const playerTeam = 1;
      if (this.team === playerTeam || this.isTownTower) {
        if (this.scene?.destroyWallMode) return;
        buildingManager.handleBuildingClickForBuilders(this, null, this.team);
        return;
      }

      const list = Teams.teamLists[playerTeam];
      if (!list) return;

      const task = {
        x: this.x,
        y: this.y,
        type: "tower",
        duration: this.health,
        totalDuration: this.maxHealth,
        type: TILE_TYPES.tower,
        value: this.sprite,
        assigned: 0,
      };

      const exists = list.enemyDestroyStates?.some(
        t => t?.x === task.x && t?.y === task.y && t?.type === task.type
      );

      if (exists) Teams.removeFromStateArray(playerTeam, "enemyDestroyStates", task);
      else Teams.addToStateArrayIfNotExists(playerTeam, "enemyDestroyStates", task);

      // click flash: dark → normal
      this.sprite.setTint(0x666666);
      this.scene.time.delayedCall(120, () => {
        if (this.sprite?.active) this.sprite.clearTint();
      });
    });


    this.sprite.play("tower_idle");
    this.sprite.buildingRef = this;

    // Make sure it occupies tiles / blocks nav like other buildings
    if (this.isTownTower) {
      Map.drawRoadAround?.(x, y, tileType, team);
    }
    Map.addBlockItem?.(x, y, tileType);

    this.sprite.on("pointerover", () => {
      this.isHovered = true;
      this.updateHealthBar();
      this._showPanel();
    });
    this.sprite.on("pointerout", () => {
      this.isHovered = false;
      this.updateHealthBar();
      this._hidePanel();
    });
  }

  _ensureTowerAnim() {
    const animKey = "tower_idle";
    const a = this.scene?.anims;
    if (!a) return;
    if (a.exists(animKey)) return;

    const towerTexture = this.scene?.textures?.get?.("tower");
    const destroyedTexture = this.scene?.textures?.get?.("tower_destroyed");
    const towerEnd = towerTexture?.has?.(1) ? 1 : 0;
    const destroyedEnd = destroyedTexture?.has?.(1) ? 1 : 0;

    a.create({
      key: animKey,
      frames: a.generateFrameNumbers("tower", { start: 0, end: towerEnd }),
      frameRate: towerEnd > 0 ? 2 : 1,
      repeat: -1,
    });

    if (!a.exists("tower_destroyed_idle")) {
      a.create({
        key: "tower_destroyed_idle",
        frames: a.generateFrameNumbers("tower_destroyed", { start: 0, end: destroyedEnd }),
        frameRate: destroyedEnd > 0 ? 2 : 1,
        repeat: -1,
      });
    }
  }

  ensureHealthBar() {
    if (!this.sprite || !this.scene) return;

    ensureStructuralHealthBar(this, this.scene, {
      fillColor: this.isTownTower ? 0x61d98f : 0xf45d48,
    });
    return;

    if (!this.healthBar) {
      // 🔴 enemy bar
      this.healthBar = this.scene.add
        .rectangle(this.sprite.x, topY, fullWidth, 2, 0xff0000, 1)
        .setDepth(BLOCKDEPTH + 2);
      Map.addToWorldStatic(this.healthBar);
    }
  }

  updateHealthBar() {
    if (!this.sprite || !this.scene) return;
    this.ensureHealthBar();
    if (!this.healthBar || !this.healthBarBg) return;

    const ratio = this.maxHealth > 0 ? Phaser.Math.Clamp(this.health / this.maxHealth, 0, 1) : 0;
    const { centerX, topY, width } = getStructuralBarAnchor(this.sprite, {
      widthScale: 1,
      paddingX: 16,
      yOffset: 13,
    });

    const now = this.scene.time?.now ?? 0;
    const visible = this.isHovered || now < this._damageBarUntil;
    layoutStructuralHealthBar(this, {
      ratio,
      centerX,
      topY,
      width,
      visible,
      fillColor: this.isTownTower ? 0x61d98f : 0xf45d48,
    });
    if (this.isHovered) this._updatePanel();
  }

  shakeAndFlash() {
    if (!this.sprite || !this.scene) return;
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
      },
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

    this.shakeAndFlash();

    const now = this.scene?.time?.now ?? 0;
    this._damageBarUntil = now + 2000;
    this.updateHealthBar();

    this._damageBarTimer?.remove(false);
    this._damageBarTimer = this.scene.time.delayedCall(2000, () => {
      this.updateHealthBar();
    });

    // floating damage text
    showGhostText(
      this.scene,
      this.sprite.x,
      this.sprite.y - (TILE_TYPES.tower?.lenY ?? 1) * SQUARESIZE / 2 - 10,
      `-${damage}`,
      this.team,
      0,
      0,
      "#ff5555"
    );
  }

  // ──────────────────────────
  // Hover UI (Prison-style panel)
  // ──────────────────────────
  _panelPos() {
    if (!this.sprite) return { cx: 0, y: 0 };
    const b = this.sprite.getBounds();
    return { cx: b.centerX, y: b.top - ENEMY_BUILDING_HOVER_UI.PANEL_Y_OFFSET };
  }

  _ensurePanel() {
    if (this.panelRoot) return;

    this.panelRoot = createBuildingHoverPanel(this.scene, {
      width: 182,
      height: 44,
      depth: UIDEPTH,
      accentColor: this.isTownTower ? 0x6cc7ff : 0xff8a8a,
    });
    this.panelBg = this.panelRoot.panelBg;

    this.panelText1 = this.scene.add
      .text(-76, ENEMY_BUILDING_HOVER_UI.LINE1_DY, "", BUILDING_PANEL_TEXT_STYLES.title)
      .setOrigin(0, 0.5)
      .setDepth(UIDEPTH + 1);

    this.panelText2 = this.scene.add
      .text(-76, ENEMY_BUILDING_HOVER_UI.LINE2_DY + 1, "", BUILDING_PANEL_TEXT_STYLES.body)
      .setOrigin(0, 0.5)
      .setDepth(UIDEPTH + 1);

    this.panelRoot.add([this.panelText1, this.panelText2]);
    this.panelRoot.setVisible(false);
    this.uiContainer.add(this.panelRoot);

  }

  _updatePanel() {
    if (!this.panelRoot) return;

    const { cx, y } = this._panelPos();
    this.uiContainer.setPosition(cx, y);

    const hp = `HP: ${Math.max(0, this.health)}/${this.maxHealth}`;
    if (this.isTownTower) {
      const money = getTownTowerDawnIncome(this.scene, 1);
      const day = getBalanceDay(this.scene);
      const permitText = this.isStarterTownTower && day === 1 ? "permit starts day 2" : "+1 permit";
      this.panelText1.setText(`Town Tower ${hp}`);
      this.panelText2.setText(`Dawn: +$${money} ${permitText}`);
      return;
    }

    const tpc = this.scene?.towerPressureController;
    const info = tpc?.getTowerPressureInfo?.(this) ?? null;
    const laneLabel = (slotId) => {
      if (slotId === "N") return "North";
      if (slotId === "W") return "West";
      if (slotId === "E") return "East";
      if (slotId === "S") return "South";
      return null;
    };

    let pressure = "Raid lane: inactive";
    if (tpc && info?.slotId) {
      const lane = laneLabel(info.slotId) || info.slotId;
      if (info.phase === "raid_live") pressure = `Raid lane ${lane}: LIVE`;
      else if (info.phase === "countdown") pressure = `Raid lane ${lane}: ${info.remainingText}`;
      else if (info.phase === "waiting_slot") pressure = `Raid lane ${lane}: waiting`;
      else pressure = `Raid lane ${lane}: arming`;
    } else if (tpc) {
      pressure = "Raid lane: assigning";
    }

    this.panelText1.setText(hp);
    this.panelText2.setText(pressure);
  }

  _showPanel() {
    this._ensurePanel();
    this._updatePanel();
    this.panelRoot.setVisible(true);
  }

  _hidePanel() {
    this.panelRoot?.setVisible(false);
  }

  destroy() {
    this._damageBarTimer?.remove(false);
    this._damageBarTimer = null;
    this._destroyed = true;

    if (this.isFortObjective) {
      StageState.notifyFortTowerDestroyed(this);
      StageState.unregisterFortTower(this);
    }
    
    if (this.isPressureTower) {
      this.scene?.towerPressureController?.unregisterTower?.(this);
    }

    if (this.collider) {
      Map.structureBarrier?.remove(this.collider, true, true);
      this.collider.destroy();
      this.collider = null;
    }

    this.uiContainer?.destroy(true);
    this.uiContainer = null;
    this.panelRoot = null;

    destroyStructuralHealthBar(this);
    if (this.visionId != null) {
      VisibilitySystem.removeVisionBubble(this.visionId);
      this.visionId = null;
    }
    if (this.lightId != null) {
      VisibilitySystem.removeLightById(this.lightId);
      this.lightId = null;
    }

    if (this.isTownTower && Teams.teamLists?.[this.team]) {
      Teams.removeFromStateArray(this.team, "townTowerList", this);
      const stats = this.scene?._townTowerStats || (this.scene._townTowerStats = { built: 0, destroyed: 0 });
      stats.destroyed += 1;
    }

    // Collapse visually like other buildings: smoke at the footprint, then remove the tower art.
    if (this.sprite?.active) {
      playBuildingCollapseSmoke(this);
      this.sprite._destroyed = true;
      this.sprite.disableInteractive();
      this.sprite.destroy();
    }

    if (this.isTownTower && !TowerBuilding.hasLivingTownTowers(this.team)) {
      this.scene?.handleTownCoreLost?.(this);
    }
  }
}
