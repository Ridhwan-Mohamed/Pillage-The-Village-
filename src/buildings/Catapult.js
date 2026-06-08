import Phaser from "phaser";
import { BLOCKDEPTH, SQUARESIZE, TILE_TYPES, colorFor, handleGridXY, showGhostText, PARCEL } from "../constants";
import { Map } from "../map";
import { Player } from "../players/Player";
import { Teams } from "../Teams";
import { Projectile } from "../Projectile";
import { weapons } from "../weapons";
import { AudioManager } from "../Manager/AudioManager";
import { buildingManager } from "../Manager/buildingManager";
import { PathRegistry } from "../lib/navmesh/PathRegistry";
import { PathRepair } from "../lib/navmesh/PathRepair";
import { destroyStructuralHealthBar, ensureStructuralHealthBar, getStructuralBarAnchor, layoutStructuralHealthBar } from "../UI/BuildingTheme";
import { playBuildingCollapseSmoke } from "../FX/SmokeClearing";

export class Catapult {
  static scene = null;
  static instances = new Set();
  static placementState = null;

  static topFrame = 1;
  static turnRateRadPerSec = 1.95;
  static aimToleranceRad = Phaser.Math.DegToRad(7);
  static armHeadDirectionOffset = Math.PI;
  static armHeadDistance = 26;

  constructor(x, y, teamNumber = 1, opts = {}) {
    this.scene = Catapult.scene ?? Map.scene;
    this.x = x;
    this.y = y;
    this.gridX = x;
    this.gridY = y;
    this.teamNumber = Number(teamNumber ?? 1);
    this.team = this.teamNumber;
    this.tileType = TILE_TYPES.catapult;
    this.type = this.tileType;
    this.weapon = opts.weapon ?? weapons.catapult;
    this.maxHealth = opts.maxHealth ?? this.tileType.maxHealth ?? 420;
    this.health = opts.health ?? this.maxHealth;
    this.isTemporaryMilitia = !!opts.isTemporaryMilitia;
    this.maxAmmo = Number.isFinite(Number(opts.maxAmmo)) ? Math.max(0, Math.floor(Number(opts.maxAmmo))) : null;
    this.ammoRemaining = Number.isFinite(Number(opts.ammoRemaining ?? opts.ammo))
      ? Math.max(0, Math.floor(Number(opts.ammoRemaining ?? opts.ammo)))
      : this.maxAmmo;
    this._targetShotCounts = new WeakMap();
    this.nextShotAt = 0;
    this.currentTarget = null;
    this.isHovered = false;
    this._destroyed = false;
    this._launchTween = null;
    this._damageBarUntil = 0;
    this._damageBarTimer = null;
    this.healthBarBg = null;
    this.healthBar = null;
    this.ammoBg = null;
    this.ammoText = null;

    const centerX = x * SQUARESIZE + (this.tileType.lenX * SQUARESIZE) / 2;
    const centerY = y * SQUARESIZE + (this.tileType.lenY * SQUARESIZE) / 2;

    this.sprite = this.baseSprite = Map.addToWorldStatic(
      this.scene.add.image(centerX, centerY, this.tileType.value[0]).setDepth(BLOCKDEPTH)
    );
    this.topSprite = Map.addToWorldStatic(
      this.scene.add.sprite(centerX, centerY, this.tileType.value[1], Catapult.topFrame).setDepth(BLOCKDEPTH + 1)
    );

    this.baseSprite.setInteractive({ useHandCursor: true });
    this.topSprite.setInteractive({ useHandCursor: true });

    const w = this.tileType.lenX * SQUARESIZE;
    const h = this.tileType.lenY * SQUARESIZE;
    this.collider = this.scene.physics.add.staticImage(centerX, centerY, "barrier");
    this.collider.setAlpha(0);
    this.collider.setDisplaySize(w, h);
    this.collider.refreshBody();
    this.collider.body?.setSize?.(w, h, true);

    this.sprite.buildingRef = this;
    this.topSprite.buildingRef = this;
    this.collider.buildingRef = this;

    this.sprite.isBuilding = true;
    this.topSprite.isBuilding = true;
    this.collider.isBuilding = true;

    this.sprite.team = this.teamNumber;
    this.topSprite.team = this.teamNumber;
    this.collider.team = this.teamNumber;
    if (this.collider.body) this.collider.body.team = this.teamNumber;

    Map.structureBarrier?.add(this.collider);
    Map.addBlockItem?.(x, y, this.tileType);

    if (opts.applyNavUpdate) {
      this._applyFootprintBlockToNav();
    }

    const onPointerDown = () => this._handlePointerDown();
    const onPointerOver = () => {
      this.isHovered = true;
      this.updateHealthBar();
    };
    const onPointerOut = () => {
      this.isHovered = false;
      this.updateHealthBar();
    };

    this.baseSprite.on("pointerdown", onPointerDown);
    this.topSprite.on("pointerdown", onPointerDown);
    this.baseSprite.on("pointerover", onPointerOver);
    this.topSprite.on("pointerover", onPointerOver);
    this.baseSprite.on("pointerout", onPointerOut);
    this.topSprite.on("pointerout", onPointerOut);

    const teamList = Teams.teamLists?.[`${this.teamNumber}`] ?? Teams.teamLists?.[this.teamNumber];
    if (Array.isArray(teamList?.buildings)) {
      teamList.buildings.push([x, y, this.tileType, this.sprite]);
    }

    Catapult.instances.add(this);
  }

  static get isPlacing() {
    return !!this.placementState;
  }

  static beginPlacing(item = TILE_TYPES.catapult, teamNumber = 1) {
    if (!this.scene?.add || !item) return null;

    this.cancelPlacement();

    const baseSprite = this.scene.add
      .image(0, 0, item.value[0])
      .setAlpha(0.55)
      .setDepth(BLOCKDEPTH);

    const topSprite = this.scene.add
      .sprite(0, 0, item.value[1], Catapult.topFrame)
      .setAlpha(0.7)
      .setDepth(BLOCKDEPTH + 1);

    topSprite.blocked = true;

    const pointerMoveHandler = (pointer) => {
      const state = this.placementState;
      if (!state || !state.baseSprite?.active || !state.topSprite?.active) return;

      const placement = this.resolvePlacement(pointer, item);
      if (!placement) return;

      const tintColor = Map.checkBlockPosition(
        placement.gridX,
        placement.gridY,
        item.lenX,
        item.lenY,
        state.topSprite,
        {
          padding: 1,
          protectFarmSpots: true,
          paddingAllowWalls: true,
          paddingProtectFarmSpots: false,
          allowAutoClearSite: true,
        }
      );

      state.baseSprite.setPosition(placement.centerX, placement.centerY);
      state.topSprite.setPosition(placement.centerX, placement.centerY);
      state.baseSprite.setTint(tintColor);
      state.topSprite.setTint(tintColor);
    };

    this.placementState = {
      item,
      teamNumber,
      baseSprite,
      topSprite,
      pointerMoveHandler,
    };

    this.scene.input.on("pointermove", pointerMoveHandler);
    pointerMoveHandler(this.scene.input.activePointer);
    return this.placementState;
  }

  static cancelPlacement() {
    const state = this.placementState;
    if (!state) return;

    this.scene?.input?.off("pointermove", state.pointerMoveHandler);
    state.baseSprite?.destroy();
    state.topSprite?.destroy();
    this.placementState = null;
  }

  static resolvePlacement(pointer, item = TILE_TYPES.catapult) {
    if (!pointer || !item) return null;

    const [centerX, centerY] = handleGridXY(pointer.worldX, pointer.worldY, item.lenX, item.lenY);
    const gridX = Math.floor(centerX / SQUARESIZE) - Math.floor(item.lenX / 2);
    const gridY = Math.floor(centerY / SQUARESIZE) - Math.floor(item.lenY / 2);

    return { centerX, centerY, gridX, gridY };
  }

  static updateAll(now = 0, deltaMs = 16) {
    for (const catapult of [...this.instances]) {
      if (!catapult || catapult._destroyed || !catapult.sprite?.active || !catapult.topSprite?.active) {
        this.instances.delete(catapult);
        continue;
      }
      catapult.update(now, deltaMs);
    }
  }

  update(now, deltaMs = 16) {
    if (this._destroyed || !this.topSprite?.active) return;

    const target = this._pickTarget();
    this.currentTarget = target;
    if (!target) return;

    const launchAngle = this._getLeadAngle(target);
    if (!Number.isFinite(launchAngle)) return;

    const rotationStep = Catapult.turnRateRadPerSec * (deltaMs / 1000);
    this.topSprite.rotation = Phaser.Math.Angle.RotateTo(
      this.topSprite.rotation,
      launchAngle,
      rotationStep
    );

    const aimedAtTarget = Phaser.Math.Angle.ShortestBetween(
      Phaser.Math.RadToDeg(this.topSprite.rotation),
      Phaser.Math.RadToDeg(launchAngle)
    );

    if (
      Math.abs(aimedAtTarget) <= Phaser.Math.RadToDeg(Catapult.aimToleranceRad) &&
      now >= this.nextShotAt
    ) {
      this.fireAt(target, launchAngle, now);
    }
  }

  fireAt(target, launchAngle, now) {
    if (!target?.active) return;
    if (this._hasFiniteAmmo() && this.ammoRemaining <= 0) return;

    const armHeadAngle = this.topSprite.rotation + Catapult.armHeadDirectionOffset;
    const spawnX = this.topSprite.x + Math.cos(armHeadAngle) * Catapult.armHeadDistance;
    const spawnY = this.topSprite.y + Math.sin(armHeadAngle) * Catapult.armHeadDistance;
    const impactPoint = Projectile.leadAndAngle({ x: spawnX, y: spawnY }, target, this.weapon.speed);
    const impactAngle = Phaser.Math.Angle.Between(spawnX, spawnY, impactPoint.x, impactPoint.y);
    const travelDistance = Phaser.Math.Distance.Between(spawnX, spawnY, impactPoint.x, impactPoint.y);
    const distanceRatio = Phaser.Math.Clamp(
      travelDistance / Math.max(this.weapon.range ?? 1, 1),
      0,
      1
    );

    AudioManager.playWeaponAttack(this.topSprite, this.weapon, {
      volume: 0.34,
      cooldownMs: 120,
    });

    new Projectile(
      spawnX,
      spawnY,
      impactAngle,
      this.teamNumber,
      this.weapon,
      null,
      false,
      {
        sourceStructure: this,
        travelDistance,
        distanceRatio,
        impactX: impactPoint.x,
        impactY: impactPoint.y,
        impactRadius: this.weapon.impactRadius ?? 18,
        impactTarget: target,
      }
    );

    this._launchTween?.remove?.();
    this.topSprite.setScale(1);
    this._launchTween = this.scene.tweens.add({
      targets: this.topSprite,
      scaleX: 0.94,
      scaleY: 1.08,
      duration: 90,
      yoyo: true,
      ease: "Sine.Out",
      onComplete: () => {
        this._launchTween = null;
        if (this.topSprite?.active) this.topSprite.setScale(1);
      },
    });

    this.nextShotAt = now + this.weapon.duration;
    this._recordShot(target);
    this._consumeAmmo();
  }

  _hasFiniteAmmo() {
    return Number.isFinite(Number(this.maxAmmo)) && Number.isFinite(Number(this.ammoRemaining));
  }

  _getShotCount(target) {
    if (!target || !this._targetShotCounts) return 0;
    return Math.max(0, Number(this._targetShotCounts.get(target) || 0));
  }

  _recordShot(target) {
    if (!target) return;
    this._targetShotCounts?.set(target, this._getShotCount(target) + 1);
  }

  _consumeAmmo() {
    if (!this._hasFiniteAmmo()) return;
    this.ammoRemaining = Math.max(0, Math.floor(Number(this.ammoRemaining || 0)) - 1);
    this.updateHealthBar();
    if (this.ammoRemaining > 0) return;

    showGhostText(this.scene, this.topSprite.x, this.topSprite.y - 28, "OUT", this.teamNumber, false, false, "#f8e7b0");
    this.scene.time.delayedCall(220, () => {
      if (!this._destroyed) this.destroyAndUnblock({ playCollapseSfx: false });
    });
  }

  takeDamage(damage) {
    if (this._destroyed) return true;

    this.health = Math.max(0, this.health - damage);
    this.onDamaged(damage, this.health, this.maxHealth);

    if (this.health <= 0) {
      this.destroyAndUnblock({ playCollapseSfx: true });
      return true;
    }

    return false;
  }

  onDamaged(damage, currentHealth, maxHealth) {
    this.health = Math.max(0, currentHealth ?? this.health);
    this.maxHealth = maxHealth ?? this.maxHealth ?? 1;

    const scene = this.scene;
    const baseAngle = Number.isFinite(this._damageRestAngle) ? this._damageRestAngle : (this.baseSprite?.angle || 0);
    this._damageRestAngle = baseAngle;
    this._damageShakeTween?.stop?.();
    if (this.baseSprite) this.baseSprite.angle = baseAngle;

    this._damageShakeTween = scene.tweens.add({
      targets: this.baseSprite,
      angle: baseAngle + 2,
      yoyo: true,
      duration: 40,
      repeat: 2,
      onComplete: () => {
        if (this.baseSprite) this.baseSprite.angle = baseAngle;
        this._damageShakeTween = null;
      },
    });

    this.baseSprite.setTint(0xff6666);
    this.topSprite.setTint(0xff6666);
    scene.time.delayedCall(120, () => {
      if (this._destroyed) return;
      this.baseSprite?.clearTint?.();
      this.topSprite?.clearTint?.();
      this.updateHealthBar();
    });

    this._damageBarUntil = (scene.time?.now ?? 0) + 2000;
    this.updateHealthBar();
    this._damageBarTimer?.remove?.(false);
    this._damageBarTimer = scene.time.delayedCall(2000, () => this.updateHealthBar());

    const textY = this.baseSprite.y - (this.tileType.lenY * SQUARESIZE) / 2 - 8;
    showGhostText(scene, this.baseSprite.x, textY, `-${damage}`, this.teamNumber, 0, 0, "#ff5555");
  }

  updateHealthBar() {
    if (this._destroyed || !this.baseSprite?.active) return;
    this.updateAmmoUi();

    const now = this.scene?.time?.now ?? 0;
    const shouldShow = this.isHovered || now < this._damageBarUntil;
    if (!shouldShow) {
      destroyStructuralHealthBar(this);
      return;
    }

    const ratio = Phaser.Math.Clamp(this.health / Math.max(this.maxHealth, 1), 0, 1);
    const { centerX, topY, width } = getStructuralBarAnchor(this.baseSprite, {
      widthScale: 0.78,
      paddingX: 10,
      yOffset: 14,
    });
    ensureStructuralHealthBar(this, this.scene, { fillColor: 0xf45d48 });
    layoutStructuralHealthBar(this, {
      ratio,
      centerX,
      topY,
      width,
      visible: true,
      fillColor: 0xf45d48,
    });
  }

  updateAmmoUi() {
    if (this._destroyed || !this.baseSprite?.active || !this._hasFiniteAmmo()) {
      this._destroyAmmoUi();
      return;
    }

    if (!this.isHovered) {
      this.ammoBg?.setVisible(false);
      this.ammoText?.setVisible(false);
      return;
    }

    if (!this.ammoBg) {
      this.ammoBg = this.scene.add
        .rectangle(0, 0, 74, 24, 0x121b24, 0.92)
        .setOrigin(0.5)
        .setDepth(BLOCKDEPTH + 5)
        .setStrokeStyle(2, 0xf8e7b0, 0.32);
      Map.addToWorldStatic(this.ammoBg);
    }
    if (!this.ammoText) {
      this.ammoText = this.scene.add.text(0, 0, "", {
        fontFamily: "Bungee",
        fontSize: "11px",
        color: "#fff4c2",
        stroke: "#06111a",
        strokeThickness: 3,
      }).setOrigin(0.5);
      this.ammoText.setDepth(BLOCKDEPTH + 6);
      Map.addToWorldStatic(this.ammoText);
    }

    const bounds = this.baseSprite.getBounds?.();
    const centerX = bounds?.centerX ?? this.baseSprite.x;
    const y = (bounds?.top ?? this.baseSprite.y) - 18;
    this.ammoText.setText(`${Math.max(0, Math.floor(Number(this.ammoRemaining || 0)))}/${Math.max(0, Math.floor(Number(this.maxAmmo || 0)))}`);
    this.ammoBg.setPosition(centerX, y);
    this.ammoText.setPosition(centerX, y);
    this.ammoBg.setVisible(true);
    this.ammoText.setVisible(true);
  }

  _destroyAmmoUi() {
    this.ammoBg?.destroy?.();
    this.ammoText?.destroy?.();
    this.ammoBg = null;
    this.ammoText = null;
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    Catapult.instances.delete(this);
    this.currentTarget = null;
    this._launchTween?.remove?.();
    this._launchTween = null;
    this._damageBarTimer?.remove?.(false);
    this._damageBarTimer = null;

    if (this.collider) {
      Map.structureBarrier?.remove(this.collider, true, true);
      this.collider.destroy();
      this.collider = null;
    }

    destroyStructuralHealthBar(this);
    this._destroyAmmoUi();

    playBuildingCollapseSmoke(this);
    Map.removeFromWorldStatic?.(this.topSprite, true);
    Map.removeFromWorldStatic?.(this.baseSprite, true);
    this.topSprite = null;
    this.sprite = null;
    this.baseSprite = null;
  }

  destroyAndUnblock({ playCollapseSfx = false } = {}) {
    if (this._destroyed) return;

    if (playCollapseSfx) {
      AudioManager.playWorldSound?.("sfx_building_collapse", { volume: 0.3 });
    }

    this.destroy();
    this._clearQueuedTasks();
    this._unblockFootprint();
  }

  _handlePointerDown() {
    const playerTeam = 1;

    if (this.teamNumber === playerTeam) {
      if (this.scene?.destroyWallMode) return;
      buildingManager.handleBuildingClickForBuilders(this, null, this.teamNumber);
      return;
    }

    const list = Teams.teamLists?.[`${playerTeam}`];
    if (!list) return;

    const task = {
      x: this.x,
      y: this.y,
      duration: this.health,
      totalDuration: this.maxHealth,
      type: this.tileType,
      value: this.sprite,
      assigned: 0,
    };

    const exists = list.enemyDestroyStates?.some(
      (entry) => entry?.x === task.x && entry?.y === task.y && entry?.type === task.type
    );

    if (exists) Teams.removeFromStateArray(playerTeam, "enemyDestroyStates", task);
    else Teams.addToStateArrayIfNotExists(playerTeam, "enemyDestroyStates", task);

    this.baseSprite.setTint(0x666666);
    this.topSprite.setTint(0x666666);
    this.scene.time.delayedCall(120, () => {
      if (this._destroyed) return;
      this.baseSprite?.clearTint?.();
      this.topSprite?.clearTint?.();
      this.updateHealthBar();
    });
  }

  _pickTarget() {
    const maxRangeSq = (this.weapon.range ?? 0) * (this.weapon.range ?? 0);
    let best = null;
    let bestShotCount = Infinity;
    let bestDistSq = Infinity;

    for (const troop of Player.troops) {
      if (!troop?.active || !troop.body) continue;
      if (troop.body.team == null || troop.body.team === this.teamNumber) continue;
      if (troop.dontTrack || troop.body.dontTrack) continue;
      if ((troop.health ?? 1) <= 0) continue;

      const dx = troop.x - this.topSprite.x;
      const dy = troop.y - this.topSprite.y;
      const distSq = dx * dx + dy * dy;
      if (!this._isEligibleByIslandOrRange(troop, distSq, maxRangeSq)) continue;

      const shotCount = this._getShotCount(troop);
      if (shotCount > bestShotCount) continue;
      if (shotCount === bestShotCount && distSq >= bestDistSq) continue;
      best = troop;
      bestShotCount = shotCount;
      bestDistSq = distSq;
    }

    return best;
  }

  _isEligibleByIslandOrRange(troop, distSq, maxRangeSq) {
    if (!Player._isOnWater?.(troop) && this._isTargetOnMainIsland(troop)) return true;
    return distSq <= maxRangeSq;
  }

  _isTargetOnMainIsland(troop) {
    const origin = this.scene?.parcelManager?.mainIslandOrigin ?? PARCEL.MAIN_ORIGIN;
    const minX = Number(origin?.x ?? PARCEL.MAIN_ORIGIN.x);
    const minY = Number(origin?.y ?? PARCEL.MAIN_ORIGIN.y);
    const size = Math.max(1, Number(PARCEL.SIZE || 0) || 1);
    const gx = Math.floor(Number(troop?.x || 0) / SQUARESIZE);
    const gy = Math.floor(Number(troop?.y || 0) / SQUARESIZE);
    return gx >= minX && gx < minX + size && gy >= minY && gy < minY + size;
  }

  _getLeadAngle(target) {
    const leadPos = Projectile.leadAndAngle(this.topSprite, target, this.weapon.speed);
    return Phaser.Math.Angle.Between(this.topSprite.x, this.topSprite.y, leadPos.x, leadPos.y);
  }

  _footprintTiles() {
    const tiles = [];
    for (let ty = this.y; ty < this.y + this.tileType.lenY; ty++) {
      for (let tx = this.x; tx < this.x + this.tileType.lenX; tx++) {
        tiles.push({ x: tx, y: ty });
      }
    }
    return tiles;
  }

  _applyFootprintBlockToNav() {
    const blockTiles = this._footprintTiles();

    this.scene?.zoomMixer?.buildOverviewTextureFromGrid?.(Map.grid, SQUARESIZE, (cell) => colorFor(cell));

    const navUpdater = this.scene?.navMeshUpdater;
    const enemyNavUpdater = this.scene?.enemyNavMeshUpdater;

    const change = navUpdater?.blockTiles?.(blockTiles);
    if (change?.removedPolyIds?.length) {
      const impacted = PathRegistry.handlePolysRemoved(Map.navMesh, change.removedPolyIds, change.addedPolyIds);
      if (impacted) {
        for (const unit of impacted) {
          PathRepair.repairUnitPath(unit, change.removedPolyIds, Map.navMesh);
        }
      }
    }

    const enemyChange = enemyNavUpdater?.blockTiles?.(blockTiles);
    if (enemyChange?.removedPolyIds?.length) {
      const impacted = PathRegistry.handlePolysRemoved(
        Map.enemyNavMesh,
        enemyChange.removedPolyIds,
        enemyChange.addedPolyIds
      );
      if (impacted) {
        for (const unit of impacted) {
          PathRepair.repairUnitPath(unit, enemyChange.removedPolyIds, Map.enemyNavMesh);
        }
      }
    }

    Map.regionSystem?.markDirty?.();
    Map.regionDrawer?.markDirty?.();
    Map.enemyRegionSystem?.markDirty?.();
    Map.enemyRegionSystem?.ensureUpToDate?.();
    Map.enemyRegionDrawer?.markDirty?.();
  }

  _unblockFootprint() {
    const blockTiles = this._footprintTiles();

    for (const tile of blockTiles) {
      const cell = Map.grid?.[tile.y]?.[tile.x];
      if (Array.isArray(cell)) {
        Map.grid[tile.y][tile.x] = cell[0];
      }
      if (Map.navGrid?.[tile.y]) Map.navGrid[tile.y][tile.x] = 1;
      if (Map.enemyNavGrid?.[tile.y]) Map.enemyNavGrid[tile.y][tile.x] = 1;
    }

    this.scene?.zoomMixer?.buildOverviewTextureFromGrid?.(Map.grid, SQUARESIZE, (cell) => colorFor(cell));

    const navUpdater = this.scene?.navMeshUpdater;
    const enemyNavUpdater = this.scene?.enemyNavMeshUpdater;

    const change = navUpdater?.blockTiles?.(blockTiles, true);
    if (change?.removedPolyIds?.length) {
      PathRegistry.handlePolysRemoved(Map.navMesh, change.removedPolyIds, change.addedPolyIds);
    }

    const enemyChange = enemyNavUpdater?.blockTiles?.(blockTiles, true);
    if (enemyChange?.removedPolyIds?.length) {
      PathRegistry.handlePolysRemoved(Map.enemyNavMesh, enemyChange.removedPolyIds, enemyChange.addedPolyIds);
    }

    Map.regionSystem?.markDirty?.();
    Map.regionDrawer?.markDirty?.();
    Map.enemyRegionSystem?.markDirty?.();
    Map.enemyRegionSystem?.ensureUpToDate?.();
    Map.enemyRegionDrawer?.markDirty?.();

    buildingManager.removeBuildingFromArray?.(this.x, this.y);
  }

  _clearQueuedTasks() {
    for (const teamKey of Object.keys(Teams.teamLists ?? {})) {
      const team = Teams.teamLists?.[teamKey];
      if (!team) continue;

      if (Array.isArray(team.destroyStates)) {
        team.destroyStates = team.destroyStates.filter((task) => task?.x !== this.x || task?.y !== this.y);
      }

      if (Array.isArray(team.enemyDestroyStates)) {
        team.enemyDestroyStates = team.enemyDestroyStates.filter(
          (task) => task?.x !== this.x || task?.y !== this.y
        );
      }

      if (Array.isArray(team.buildingFixTasks)) {
        team.buildingFixTasks = team.buildingFixTasks.filter((task) => {
          const match = task?.x === this.x && task?.y === this.y;
          if (match) buildingManager.clearFixTaskVisual?.(task);
          return !match;
        });
      }
    }
  }
}
