// buildings/SpawnerBuilding.js
// A simple, breakable spawner building that emits Raiders on an interval
// and shows "enemies left" above it.
//
// Dependencies expected on the Scene:
//   - scene.add, scene.tweens, scene.time
//   - scene.spawnManager or scene.spawnManager.spawnRaider(...)
//   - scene.uiTextStyle? (optional)
//
// You already have a TILE_TYPES.spawn entry; this file focuses on behaviour.
import { Map } from "../map.js";
import { TILE_TYPES, SQUARESIZE, BLOCKDEPTH } from "../constants.js";
import { applyEnemyModifierVisual, spawnRaiderAtWorld } from "../Manager/spawnManager.js";
import { Teams } from "../Teams.js";
import { VisibilitySystem } from "../UI/VisibilitySystem.js";
import { FortGrunt } from "../players/FortGrunt.js";
import { Hunter } from "../players/Hunter.js";
import { Bomber } from "../players/Bomber.js";
import { playBuildingCollapseSmoke } from "../FX/SmokeClearing.js";

export class SpawnerBuilding {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} gx tile x
   * @param {number} gy tile y
   * @param {object} opts
   */
  constructor(scene, gx, gy, opts = {}) {
    this.scene = scene;
    this.tilePos = { tileX: gx, tileY: gy };

    // ✅ bake into grid + block both nav grids + create barrier
    // uses Map.addBlockItem(...) which writes tile + sets navGrid/enemyNavGrid to 0 for blocking items :contentReference[oaicite:1]{index=1}
    // Preserve a dirt interior under the hole so parcel auto-tiling does not
    // produce corner/edge artifacts around the opening.
    Map.addTopLayerItem(gx, gy, TILE_TYPES.spawn, { fallbackFloorType: "dirt" });

    // compute world position internally
    this.difficulty = opts.difficulty ?? 1;
    this.stageIndex = opts.stageIndex ?? 1;

    this.maxHp = opts.maxHp ?? 80;
    this.hp = this.maxHp;
    this.contractId = opts.contractId ?? null;
    this.enemyType = ["grunt", "hunter", "bomber"].includes(opts.enemyType) ? opts.enemyType : "raider";
    this.enemyMods = opts.enemyMods ? { ...opts.enemyMods } : null;
    this.enemyTypeLabel = opts.enemyTypeLabel ?? (
      this.enemyType === "grunt"
        ? "Fort Grunts"
        : this.enemyType === "hunter"
        ? "Hunters"
        : this.enemyType === "bomber"
        ? "Bombers"
        : "Raiders"
    );
    this.modifierKey = opts.modifierKey ?? null;
    this.modifierLabel = opts.modifierLabel ?? null;

    this.quotaRemaining = opts.quota ?? 3;
    this.aliveCount = 0;

    this.intervalMs = opts.intervalMs ?? 4000;
    this.textureKey = opts.textureKey ?? TILE_TYPES.spawn.value; // assumes TILE_TYPES.spawn exists

    this._destroyed = false;
    const tileType = TILE_TYPES.spawn;
    const w = (tileType.lenX || 1) * SQUARESIZE;
    const h = (tileType.lenY || 1) * SQUARESIZE;
    const worldX = gx * SQUARESIZE + (w / 2);
    const worldY = gy * SQUARESIZE + (h / 2);
    this.spawnWorldX = worldX;
    this.spawnWorldY = worldY;

    // create visuals
    this.sprite = Map.addToWorldStatic(
        scene.add.sprite(
            worldX,
            worldY,
            tileType.name
        ).setDepth(BLOCKDEPTH)
    );
    this.team = opts.team ?? 0;   // enemy default
    this.lightId = VisibilitySystem.addLightSource({ x: gx + 0.5, y: gy + 0.5, r: 5.5, brightness: 1.6 });
    // this.sprite = scene.add.image(worldX, worldY, this.textureKey);
    this.sprite.setInteractive({ useHandCursor: true });
    // keep sprite interactive/visible (no physics needed on it)
    this.sprite.buildingRef = this;
    this.sprite.isBuilding = true;

    this.collider = Map.addStructureBarrier(worldX, worldY, w, h, {
      team: this.team,
      buildingRef: this,
    });

    // collision backrefs live on collider
    if (this.collider) {
      this.collider.buildingRef = this;
      this.collider.isBuilding = true;
      this.collider.team = this.team;
    }


    this.sprite.buildingRef = this;
    this.sprite.team = this.team;
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setDepth(50);


    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.buildingRef = this;
    this.sprite.team = this.team;

    this.sprite.on("pointerdown", () => {
      const playerTeam = 1;
      if (this.team === playerTeam) return;

      const list = Teams.teamLists[playerTeam];
      if (!list) return;

      const task = {
        x: this.tilePos.tileX,
        y: this.tilePos.tileY,
        duration: this.hp,
        totalDuration: this.maxHp,
        value: this.sprite,
        type: TILE_TYPES.spawn,
        assigned: 0,
      };

      this.tileType = TILE_TYPES.spawn; // Ensure tileType is set for the task

      const exists = list.enemyDestroyStates?.some(
        t => t?.x === task.x && t?.y === task.y && t?.type === task.type
      );

      if (exists) Teams.removeFromStateArray(playerTeam, "enemyDestroyStates", task);
      else Teams.addToStateArrayIfNotExists(playerTeam, "enemyDestroyStates", task);

      this.sprite.setTint(0x666666);
      this.scene.time.delayedCall(120, () => {
        if (this.sprite?.active) this.sprite.clearTint();
      });
    });

    // ✅ ensure it’s actually on the world layer
    if (typeof Map._worldAdd === "function") Map._worldAdd(this.sprite);

    this._playSpawnFX();

    const style = scene.uiTextStyle ?? { fontFamily: "Bungee", fontSize: "14px", color: "#ffffff" };
    this.counterText = scene.add.text(this.sprite.x, this.sprite.y - 26, "", style);
    this.counterText.setOrigin(0.5, 0.5);
    this.counterText.setDepth(60);
    if (typeof Map._worldAdd === "function") Map._worldAdd(this.counterText);

    this._updateCounter();

    // timer tick (spawns raiders)
    this.timer = scene.time.addEvent({
      delay: this.intervalMs,
      loop: true,
      callback: () => this._tick(),
    });

    // optional bookkeeping
    if (Array.isArray(Map.worldSpawners)) Map.worldSpawners.push(this);
  }

  _playSpawnFX() {
    // Shake
    this.scene.tweens.add({
      targets: this.sprite,
      x: this.sprite.x + 3,
      duration: 60,
      yoyo: true,
      repeat: 6,
    });

    // Flash
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0.25,
      duration: 80,
      yoyo: true,
      repeat: 5,
    });
  }

  _updateCounter() {
    if (!this.counterText) return;

    // show "spawns remaining" (goes DOWN on each spawn)
    this.counterText.setText(String(Math.max(0, this.quotaRemaining)));
  }

  _applyEnemyMods(unit) {
    if (!unit || !this.enemyMods) return;

    const speedMultiplier = Math.max(0.5, Number(this.enemyMods.speedMultiplier ?? 1) || 1);
    const healthMultiplier = Math.max(0.5, Number(this.enemyMods.healthMultiplier ?? 1) || 1);
    const damageMultiplier = Math.max(0.5, Number(this.enemyMods.damageMultiplier ?? 1) || 1);
    const visual = this.enemyMods.visual || null;

    unit.moveSpeedMultiplier = speedMultiplier;
    unit.hordeModifierKey = this.modifierKey;
    unit.hordeModifierLabel = this.modifierLabel;
    unit.pressureEnemyType = this.enemyType;

    if (Number.isFinite(unit.maxHealth)) {
      unit.maxHealth = Math.max(1, Math.round(unit.maxHealth * healthMultiplier));
      unit.health = Math.min(unit.maxHealth, Math.max(1, Math.round((unit.health ?? unit.maxHealth) * healthMultiplier)));
    }

    if (unit.weapon) {
      unit.weapon = {
        ...unit.weapon,
        baseDmg: Math.max(1, Math.round(Number(unit.weapon.baseDmg ?? 0) * damageMultiplier)),
        critDmg: Math.max(1, Math.round(Number(unit.weapon.critDmg ?? 0) * damageMultiplier)),
      };
    }

    applyEnemyModifierVisual(unit, visual);
  }

  _spawnEnemy() {
    const tileType = TILE_TYPES.spawn;
    const spawnGX = this.tilePos.tileX + Math.floor(Math.max(1, Number(tileType?.lenX ?? 1) || 1) / 2);
    const spawnGY = this.tilePos.tileY + Math.floor(Math.max(1, Number(tileType?.lenY ?? 1) || 1) / 2);
    const unit = this.enemyType === "grunt"
      ? new FortGrunt(spawnGX, spawnGY, 0)
      : this.enemyType === "hunter"
      ? new Hunter(spawnGX, spawnGY, 0)
      : this.enemyType === "bomber"
      ? new Bomber(spawnGX, spawnGY, 0)
      : spawnRaiderAtWorld(this.spawnWorldX, this.spawnWorldY);

    if (!unit) return false;

    unit.spawner = this;
    unit.contractId = this.contractId;
    this._applyEnemyMods(unit);
    this.scene?.parcelManager?.notifyRaiderSpawned?.(unit.contractId);
    return true;
  }

  _tick() {
    if (this._destroyed) return;

    // Spawn only while quota remains.
    if (this.quotaRemaining <= 0) {
      // Keep counter alive until all spawned enemies are dead.
      this._updateCounter();
      return;
    }

    // Spawn a Raider (you said existing attack logic will take over).
    // We only need to call into your spawnManager.
    const spawned = this._spawnEnemy();
    if (spawned) {
      this.quotaRemaining -= 1;
      this.aliveCount += 1;
      this._updateCounter();
    }
  }

  // buildings/SpawnerBuilding.js
  _spawnRaider() {
    const raider = spawnRaiderAtWorld(this.sprite.x, this.sprite.y);
    raider.spawner = this;               // already there :contentReference[oaicite:2]{index=2}
    raider.contractId = this.contractId; // ✅ add
    this.scene?.parcelManager?.notifyRaiderSpawned?.(raider.contractId);
    return true;
  }


  // Call this when a raider dies (hook from Raider.onDeath or your spawnManager)
  notifyEnemyDied() {
    if (this._destroyed) return;
    this.aliveCount = Math.max(0, this.aliveCount - 1);
    this._updateCounter();
  }

  applyDamage(dmg) {
    if (this._destroyed) return;
    this.hp -= dmg;
    // Minor feedback
    const baseAngle = Number.isFinite(this._damageRestAngle) ? this._damageRestAngle : (this.sprite?.angle || 0);
    this._damageRestAngle = baseAngle;
    this._damageShakeTween?.stop?.();
    if (this.sprite) this.sprite.angle = baseAngle;
    this._damageShakeTween = this.scene.tweens.add({
      targets: this.sprite,
      angle: baseAngle + 2,
      duration: 40,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        if (this.sprite) this.sprite.angle = baseAngle;
        this._damageShakeTween = null;
      },
    });
    if (this.hp <= 0) this.destroy();
  }

  isComplete() {
    return this.quotaRemaining <= 0 && this.aliveCount <= 0;
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    // ✅ credit unspawned enemies to the contract when spawner is destroyed
    const unspawned = Math.max(0, this.quotaRemaining | 0);
    this.scene?.parcelManager?.notifySpawnerDestroyed?.(this.contractId, unspawned);

    if (this.timer) this.timer.remove(false);
    if (this.collider) {
      Map.structureBarrier?.remove(this.collider, true, true);
      this.collider.destroy();
      this.collider = null;
    }
    if (this.lightId != null) {
      VisibilitySystem.removeLightById(this.lightId);
      this.lightId = null;
    }
    playBuildingCollapseSmoke(this);
    this.sprite?.destroy();
    this.counterText?.destroy();
  }
}

