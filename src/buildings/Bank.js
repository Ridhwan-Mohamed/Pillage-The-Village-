// buildings/Bank.js
// Enemy Bank building (closed/opened spritesheets + hover panel + destroy task + money reward)
// Matches Tower/House damage reactions: shake+flash, floating damage text, health bar visible on hover or after damage.

import { BLOCKDEPTH, ENEMY_BUILDING_HOVER_UI, SQUARESIZE, TILE_TYPES, UIDEPTH, showGhostText } from "../constants";
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


// Reward curve defaults (override via opts)
export const BANK_REWARD_BASE = 200;
export const BANK_REWARD_PER_STAGE = 150;

export class Bank {
  static scene;

  /**
   * @param {Phaser.Scene} scene
   * @param {number} x grid x (tile coord)
   * @param {number} y grid y (tile coord)
   * @param {number} team owning team (enemy default = 2)
   * @param {object} opts
   *  - maxHealth?: number
   *  - rewardBase?: number
   *  - rewardPerStage?: number
   *  - onReward?: (amount:number) => void
   */
  constructor(x, y, team = 2, opts = {}) {
    this.scene = Bank.scene;
    this.x = x;
    this.y = y;
    this.team = team;

    const tileType = TILE_TYPES.bank || { lenX: 4, lenY: 4, name: "bank" };
    const lenX = tileType.lenX || 4;
    const lenY = tileType.lenY || 4;

    this.tileType = tileType;
    this.maxHealth = opts.maxHealth ?? tileType.maxHealth ?? 500;
    this.health = this.maxHealth;

    this.rewardBase = opts.rewardBase ?? BANK_REWARD_BASE;
    this.rewardPerStage = opts.rewardPerStage ?? BANK_REWARD_PER_STAGE;

    this.healthBarBg = null;
    this.healthBar = null;
    this._damageBarUntil = 0;
    this._damageBarTimer = null;
    this.isHovered = false;

    this.uiContainer = this.scene.add.container(0, 0).setDepth(UIDEPTH);
    this.panelRoot = null;
    this.panelBg = null;
    this.panelText1 = null;
    this.panelText2 = null;

    this._ensureAnims();

    // Top-left pixel
    const px = x * SQUARESIZE;
    const py = y * SQUARESIZE;

    this.sprite = Map.addToWorldStatic(
      this.scene.add.sprite(px, py, "bank_closed", 0).setOrigin(0).setDepth(BLOCKDEPTH)
    );
    const cx = x + Math.floor((lenX || 4) / 2);
    const cy = y + Math.floor((lenY || 4) / 2);
    this.visionId = VisibilitySystem.addVisionBubble({ x: cx, y: cy, r: 7, boost: 0.12 });
    this.lightId = VisibilitySystem.addLightSource({ x: cx, y: cy, r: 6, brightness: 2 });

    this.sprite.play("bank_closed_idle");
    this.sprite.setInteractive({ cursor: "pointer" });

    // footprint collider for projectiles / overlaps (matches Tower pattern)
    const w = lenX * SQUARESIZE;
    const h = lenY * SQUARESIZE;
    this.collider = this.scene.physics.add.staticImage(px + w / 2, py + h / 2, "barrier");
    this.collider.setAlpha(0);
    this.collider.setDisplaySize(w, h);
    this.collider.refreshBody();
    this.collider.isBuilding = true;
    this.collider.team = this.team;
    this.collider.buildingRef = this;
    this.collider.body.setSize(w, h, true);
    Map.structureBarrier?.add(this.collider);

    // building manager hooks
    this.sprite.buildingRef = this;
    this.sprite.isBuilding = true;
    this.sprite.team = this.team;

    // blocks nav/placement
    Map.addBlockItem?.(x, y, tileType);

    // Click to toggle destroy task (player team queues, same as tower)
    this.sprite.on("pointerdown", () => this._toggleDestroyTask());

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

  _ensureAnims() {
    const a = this.scene?.anims;
    if (!a) return;

    if (!a.exists("bank_closed_idle")) {
      a.create({
        key: "bank_closed_idle",
        frames: a.generateFrameNumbers("bank_closed", { start: 0, end: 1 }),
        frameRate: 2,
        repeat: -1,
      });
    }

    if (!a.exists("bank_opened_idle")) {
      a.create({
        key: "bank_opened_idle",
        frames: a.generateFrameNumbers("bank_opened", { start: 0, end: 1 }),
        frameRate: 2,
        repeat: -1,
      });
    }
  }

  computeReward() {
    const s = StageState?.currentStage ?? StageState?.stage ?? StageState?.level ?? 1;
    const stageIndex = Math.max(1, Number(s) || 1);
    return this.rewardBase + (stageIndex - 1) * this.rewardPerStage;
  }

  _toggleDestroyTask() {
    const playerTeam = 1;
    if (this.team === playerTeam) return; // only queue enemy buildings

    const list = Teams.teamLists?.[playerTeam];
    if (!list) return;

    const task = {
      x: this.x,
      y: this.y,
      type: this.tileType,         // mimic Tower's matching behavior (object compare)
      value: this.sprite,
      duration: this.health,
      totalDuration: this.maxHealth,
      assigned: 0,
    };

    const exists = list.enemyDestroyStates?.some(
      (t) => t?.x === task.x && t?.y === task.y && t?.type === task.type
    );

    if (exists) Teams.removeFromStateArray(playerTeam, "enemyDestroyStates", task);
    else Teams.addToStateArrayIfNotExists(playerTeam, "enemyDestroyStates", task);

    // click flash: dark -> normal
    this.sprite.setTint(0x666666);
    this.scene.time.delayedCall(120, () => {
      if (this.sprite?.active) this.sprite.clearTint();
    });
  }

  // ──────────────────────────
  // Hover UI (House-style panel)
  // ──────────────────────────
  _panelPos() {
    if (!this.sprite) return { cx: 0, y: 0 };
    const b = this.sprite.getBounds();
    return {
      cx: b.centerX,
      y: b.top - ENEMY_BUILDING_HOVER_UI.PANEL_Y_OFFSET,
    };
  }

  _showPanel() {
    this._ensurePanel();
    this._updatePanel();
    this.panelRoot.setVisible(true);
  }

  _hidePanel() {
    this.panelRoot?.setVisible(false);
  }

  _ensurePanel() {
    if (this.panelRoot) return;

    const scene = this.scene;

    this.panelRoot = createBuildingHoverPanel(scene, {
      width: 162,
      height: 44,
      depth: UIDEPTH,
      accentColor: 0xd6a55c,
    });
    this.panelBg = this.panelRoot.panelBg;

    this.panelText1 = scene.add
      .text(0, ENEMY_BUILDING_HOVER_UI.LINE1_DY, "", BUILDING_PANEL_TEXT_STYLES.title)
      .setOrigin(0.5, 0.5)
      .setDepth(UIDEPTH + 1);

    this.panelText2 = scene.add
      .text(0, ENEMY_BUILDING_HOVER_UI.LINE2_DY + 1, "", BUILDING_PANEL_TEXT_STYLES.body)
      .setOrigin(0.5, 0.5)
      .setDepth(UIDEPTH + 1);

    this.panelRoot.add([this.panelText1, this.panelText2]);
    this.panelRoot.setVisible(false);
    this.uiContainer.add(this.panelRoot);

  }

  _updatePanel() {
    if (!this.uiContainer || !this.sprite || !this.panelBg) return;

    const { cx, y } = this._panelPos();

    // Move the whole panel as a unit
    this.uiContainer.setPosition(cx, y);

    // Update text content
    const hp = `HP: ${Math.max(0, this.health)}/${this.maxHealth}`;
    const loot = `Loot: $${this.computeReward()}`;

    this.panelText1.setText(hp);
    this.panelText2.setText(loot);
  }

  // ──────────────────────────
  // Health bar (Tower-style)
  // ──────────────────────────
  ensureHealthBar() {
    if (!this.sprite || !this.scene) return;
    ensureStructuralHealthBar(this, this.scene, { fillColor: 0xf45d48 });
  }

  updateHealthBar() {
    if (!this.sprite || !this.scene) return;
    this.ensureHealthBar();
    if (!this.healthBar || !this.healthBarBg) return;

    const ratio = this.maxHealth > 0 ? Phaser.Math.Clamp(this.health / this.maxHealth, 0, 1) : 0;
    const { centerX, topY, width } = getStructuralBarAnchor(this.sprite, {
      widthScale: 1,
      paddingX: 14,
      yOffset: 14,
    });

    const now = this.scene.time?.now ?? 0;
    const visible = this.isHovered || now < this._damageBarUntil;
    layoutStructuralHealthBar(this, {
      ratio,
      centerX,
      topY,
      width,
      visible,
      fillColor: 0xf45d48,
    });

    // keep hover panel current
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

    this.shakeAndFlash();

    const now = this.scene?.time?.now ?? 0;
    this._damageBarUntil = now + 2000;
    this.updateHealthBar();

    this._damageBarTimer?.remove(false);
    this._damageBarTimer = this.scene.time.delayedCall(2000, () => {
      this.updateHealthBar();
    });

    // floating damage text (same vibe as Tower/House)
    const fullWidth = (this.tileType.lenX || 4) * SQUARESIZE;
    showGhostText(
      this.scene,
      this.sprite.x + fullWidth / 2,
      this.sprite.y - 10,
      `-${damage}`,
      this.team,
      0,
      0,
      "#ff5555"
    );

    // refresh panel if hovered
    if (this.isHovered) this._updatePanel();
  }

  // Called when buildingManager actually destroys it
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.health = 0;
    this._damageBarTimer?.remove(false);
    this._damageBarTimer = null;

    // Swap to opened + reward
    if (this.sprite?.active) {
      playBuildingCollapseSmoke(this);
      this.sprite.setTexture("bank_opened", 0);
      this.sprite.play("bank_opened_idle");
      this.sprite.disableInteractive();
    }

    Map.removeBlockItem?.(this.x, this.y);

    const amount = this.computeReward();
    this.scene.updateMoney(amount);

    const fullWidth = (this.tileType.lenX || 4) * SQUARESIZE;
    showGhostText(this.scene, this.sprite.x + fullWidth / 2, this.sprite.y - 10, `+$${amount}`, this.team);

    if (this.collider) {
      Map.structureBarrier?.remove(this.collider, true, true); // ✅ remove from group + destroy children
      this.collider.destroy();
      this.collider = null;
    }

    destroyStructuralHealthBar(this);
    if (this.visionId != null) {
      VisibilitySystem.removeVisionBubble(this.visionId);
      this.visionId = null;
    }
    if (this.lightId != null) {
      VisibilitySystem.removeLightById(this.lightId);
      this.lightId = null;
    }

    // clear hover UI
    this.uiContainer?.destroy(true);
    this.uiContainer = null;
    this.panelRoot = null;
  }
}
