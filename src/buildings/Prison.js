// buildings/Prison.js
// Enemy Prison building (closed/opened spritesheets + hover panel + destroy task)
// Matches Tower/House damage reactions: shake+flash, floating damage text, health bar visible on hover or after damage.

import { BLOCKDEPTH, ENEMY_BUILDING_HOVER_UI, SQUARESIZE, TILE_TYPES, UIDEPTH, showGhostText } from "../constants";
import { Map } from "../map";
import { Teams } from "../Teams";
import { Farmer } from "../players/Farmer.js";
import { Gunslinger } from "../players/Gunslinger.js";
import { Blademaster } from "../players/Blademaster.js";
import { Brawler } from "../players/Brawler.js";
import { Fireman } from "../players/Fireman.js";
import { Builder } from "../players/Builder.js";
import { Forager } from "../players/Forager.js";
import { Player } from "../players/Player.js";
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


const DEFAULT_LOCKED_TYPES = [
  "Farmer",
  "Gunslinger",
  "Blademaster",
  "Brawler",
  "Fireman",
  "Builder",
  "Forager",
];

const TYPE_TO_CLASS = {
  Farmer,
  Gunslinger,
  Blademaster,
  Brawler,
  Fireman,
  Builder,
  Forager,
};

function defaultSpawnUnit(scene, gx, gy, typeName, teamNumber = 1) {
  const Ctor = TYPE_TO_CLASS[typeName];
  if (!Ctor) {
    console.warn("Prison: unknown lockedType", typeName);
    return null;
  }

  // Constructors expect grid coords (see Forager/Farmer/etc.) :contentReference[oaicite:2]{index=2}
  return new Ctor(gx, gy, teamNumber);
}



function pickRandom(arr, rng) {
  return arr[Math.floor((rng?.() ?? Math.random()) * arr.length)];
}

export class Prison {
  static scene;

  /**
   * @param {number} x grid x
   * @param {number} y grid y
   * @param {number} team owning team (enemy default = 2)
   * @param {object} opts
   *  - lockedType?: string
   *  - maxHealth?: number
   *  - spawnUnit?: (scene, worldX, worldY, typeName) => void
   */
  constructor(x, y, team = 2, opts = {}) {
    this.scene = Prison.scene;
    this.x = x;
    this.y = y;
    this.team = team;

    const tileType = TILE_TYPES.prison || { lenX: 4, lenY: 4, name: "prison" };
    const lenX = tileType.lenX || 4;
    const lenY = tileType.lenY || 4;

    this.tileType = tileType;
    this.maxHealth = opts.maxHealth ?? tileType.maxHealth ?? 450;
    this.health = this.maxHealth;

    const rng = this.scene?.rng ?? Math.random;
    this.lockedType = opts.lockedType ?? pickRandom(DEFAULT_LOCKED_TYPES, rng);
    this.spawnUnit = opts.spawnUnit ?? ((scene, gx, gy, typeName) =>
      defaultSpawnUnit(scene, gx, gy, typeName, /*player team*/ 1)
    );

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

    const px = x * SQUARESIZE;
    const py = y * SQUARESIZE;

    this.sprite = Map.addToWorldStatic(
      this.scene.add.sprite(px, py, "prison_closed", 0).setOrigin(0).setDepth(BLOCKDEPTH)
    );
    const cx = x + Math.floor((lenX || 4) / 2);
    const cy = y + Math.floor((lenY || 4) / 2);
    this.visionId = VisibilitySystem.addVisionBubble({ x: cx, y: cy, r: 7, boost: 0.12 });
    this.lightId = VisibilitySystem.addLightSource({ x: cx, y: cy, r: 6, brightness: 2 });

    this.sprite.play("prison_closed_idle");
    this.sprite.setInteractive({ cursor: "pointer" });

    // footprint collider for overlaps/projectiles (matches Tower)
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

    Map.addBlockItem?.(x, y, tileType);

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

    if (!a.exists("prison_closed_idle")) {
      a.create({
        key: "prison_closed_idle",
        frames: a.generateFrameNumbers("prison_closed", { start: 0, end: 1 }),
        frameRate: 2,
        repeat: -1,
      });
    }

    if (!a.exists("prison_opened_idle")) {
      a.create({
        key: "prison_opened_idle",
        frames: a.generateFrameNumbers("prison_opened", { start: 0, end: 1 }),
        frameRate: 2,
        repeat: -1,
      });
    }
  }

  _toggleDestroyTask() {
    const playerTeam = 1;
    if (this.team === playerTeam) return;

    const list = Teams.teamLists?.[playerTeam];
    if (!list) return;

    const task = {
      x: this.x,
      y: this.y,
      type: this.tileType,
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

    this.sprite.setTint(0x666666);
    this.scene.time.delayedCall(120, () => {
      if (this.sprite?.active) this.sprite.clearTint();
    });
  }

  // Tint 
  _applyRoleFlagsForTint(icon, typeKey) {
    // ✅ Do NOT touch icon.body (UI Images have no physics body)
    // Player.applyRoleTint will tint using role flags first.

    // wipe flags
    icon.isFarmer = false;
    icon.isForager = false;
    icon.isFireman = false;
    icon.isGunslinger = false;
    icon.isBuilder = false;
    icon.isBlademaster = false;
    icon.isBrawler = false;

    switch ((typeKey || "").toLowerCase()) {
      case "farmer":      icon.isFarmer = true; break;
      case "forager":     icon.isForager = true; break;
      case "fireman":     icon.isFireman = true; break;
      case "gunslinger":  icon.isGunslinger = true; break;
      case "builder":     icon.isBuilder = true; break;
      case "blademaster": icon.isBlademaster = true; break;
      case "brawler":     icon.isBrawler = true; break;
    }
  }

  _tintPrisonerIcon(icon) {
    this._applyRoleFlagsForTint(icon, this.lockedType);
    Player.applyRoleTint(icon); // uses the exact mapping in Player.js
  }

  // ──────────────────────────
  // Hover UI (House-style panel)
  // ──────────────────────────
  _panelPos() {
    if (!this.sprite) return { cx: 0, y: 0 };
    const b = this.sprite.getBounds();
    return { cx: b.centerX, y: b.top - ENEMY_BUILDING_HOVER_UI.PANEL_Y_OFFSET };
  }

  _ensurePanel() {
    if (this.panelRoot) return;

    const scene = this.scene;
    this.panelRoot = createBuildingHoverPanel(scene, {
      width: 186,
      height: 46,
      depth: UIDEPTH,
      accentColor: 0xe2a75f,
    });
    this.panelBg = this.panelRoot.panelBg;
    this.panelIcon = scene.add.image(-62, 1, "char")
      .setDepth(UIDEPTH + 2)
      .setScale(0.35);
    this._tintPrisonerIcon(this.panelIcon);
    this.panelText1 = scene.add
      .text(-34, ENEMY_BUILDING_HOVER_UI.LINE1_DY, "", BUILDING_PANEL_TEXT_STYLES.title)
      .setOrigin(0, 0.5)
      .setDepth(UIDEPTH + 2);
    this.panelText2 = scene.add
      .text(-34, ENEMY_BUILDING_HOVER_UI.LINE2_DY + 1, "", BUILDING_PANEL_TEXT_STYLES.body)
      .setOrigin(0, 0.5)
      .setDepth(UIDEPTH + 2);
    this.panelRoot.add([this.panelIcon, this.panelText1, this.panelText2]);
    this.panelRoot.setVisible(false);
    this.uiContainer.add(this.panelRoot);
    return;
    const { cx, y } = this._panelPos();

    // wider because we’ll include an icon + 2 lines
    this.panelBg = scene.add
      .rectangle(cx, y, 182, 44, 0x121b24, 0.95)
      .setOrigin(0.5)
      .setDepth(UIDEPTH)
      .setStrokeStyle(2, 0xe4f6ff, 0.16);

    // ✅ prisoner icon (House uses 'char' + tint) :contentReference[oaicite:3]{index=3}
    this.panelIcon = scene.add.image(cx - 66, y, "char")
      .setDepth(UIDEPTH + 1)
      .setScale(0.35);

    this._tintPrisonerIcon(this.panelIcon);

    this.panelText1 = scene.add
      .text(cx - 36, y + ENEMY_BUILDING_HOVER_UI.LINE1_DY, "", BUILDING_PANEL_TEXT_STYLES.title)
      .setOrigin(0, 0.5)
      .setDepth(UIDEPTH + 2);

    this.panelText2 = scene.add
      .text(cx - 36, y + ENEMY_BUILDING_HOVER_UI.LINE2_DY + 1, "", BUILDING_PANEL_TEXT_STYLES.body)
      .setOrigin(0, 0.5)
      .setDepth(UIDEPTH + 2);

    this.uiContainer.add([this.panelBg, this.panelIcon, this.panelText1, this.panelText2]);

  }

  _updatePanel() {
    if (this.panelRoot) {
      const { cx, y } = this._panelPos();
      this.panelRoot.setPosition(cx, y);
      this.panelText1?.setText(`HP: ${Math.max(0, this.health)}/${this.maxHealth}`);
      this.panelText2?.setText(`Prisoner: ${this.lockedType}`);
      return;
    }

    if (!this.panelBg) return;

    const { cx, y } = this._panelPos();

    this.panelBg.setPosition(cx, y);
    this.panelIcon.setPosition(cx - 66, y);

    this.panelText1.setPosition(cx - 36, y + ENEMY_BUILDING_HOVER_UI.LINE1_DY);
    this.panelText2.setPosition(cx - 36, y + ENEMY_BUILDING_HOVER_UI.LINE2_DY + 1);

    this.panelText1.setText(`HP: ${Math.max(0, this.health)}/${this.maxHealth}`);
    this.panelText2.setText(`Prisoner: ${this.lockedType}`);

    // optional: if your player classes have a tint table, use it here; otherwise keep default
    // this.panelIcon.setTint(TYPE_TINTS[this.lockedType] ?? 0xffffff);
  }

  _showPanel() {
    this._ensurePanel();
    this._updatePanel();

    if (this.panelRoot) {
      this.panelRoot.setVisible(true);
      return;
    }

    this.panelBg.setVisible(true);
    this.panelIcon?.setVisible(true);
    this.panelText1.setVisible(true);
    this.panelText2.setVisible(true);
  }

  _hidePanel() {
    if (this.panelRoot) {
      this.panelRoot.setVisible(false);
      return;
    }

    if (!this.panelBg) return;

    this.panelBg.setVisible(false);
    this.panelIcon?.setVisible(false);
    this.panelText1.setVisible(false);
    this.panelText2.setVisible(false);
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

    if (this.isHovered) this._updatePanel();
  }

  // Called when buildingManager destroys it
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.health = 0;
    this._damageBarTimer?.remove(false);
    this._damageBarTimer = null;

    if (this.sprite?.active) {
      playBuildingCollapseSmoke(this);
      this.sprite.setTexture("prison_opened", 0);
      this.sprite.play("prison_opened_idle");
      this.sprite.disableInteractive();
    }

    Map.removeBlockItem?.(this.x, this.y);

    // Spawn freed unit "in front" (south) of the prison footprint (one tile below)
    if (typeof this.spawnUnit === "function") {
      const spawnGX = this.x + Math.floor((this.tileType.lenX || 4) / 2);
      const spawnGY = this.y + (this.tileType.lenY || 4);
      this.spawnUnit(this.scene, spawnGX, spawnGY, this.lockedType);
    }

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

    this.uiContainer?.destroy(true);
    this.uiContainer = null;
    this.panelRoot = null;
  }
}
