// src/parcel_system/ParcelContractInstance.js
// One active contract instance living in a slot (W/S/E).

import { buildResourceParcelTerrainPlan, paintResourceParcel, paintWaterRect } from "./ParcelTerrain.js";
import { ParcelRevealAnimator } from "./ParcelRevealAnimator.js";
import { buildPressureSpawnerPlan, createPressureSpawners } from "./PressureSpawner.js";
import { PARCEL_SIZE, RESOURCE_CONTRACT_MS } from "./ParcelConfig.js";
import { AudioManager } from "../Manager/AudioManager.js";
import { Map as GameMap } from "../map.js";
import { TILE_TYPES, TILE_MAP, SQUARESIZE, colorFor, removeFromArray } from "../constants.js";
import { spawnParcelMarketStorefront, DEFAULT_MARKET_PRICES } from "../UI/ShipMarket";
import { blockResourceManager } from "../Manager/BlockResourceManager";
import { FarmBushNode } from "../buildings/FarmBushNode";
import { buildMarketPriceTable, getGoldOrePayout } from "../balance/GameBalance.js";
import { cloneSlotFavor } from "./SlotFavorSystem.js";
import { VisibilitySystem } from "../UI/VisibilitySystem.js";

const MILITIA_CONTRACT_MS = 80_000;

function fmtMMSS(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;

  if (hh > 0) {
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }

  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function randInt(rng, a, b) {
  return a + Math.floor(rng() * (b - a + 1));
}

export class ParcelContractInstance {
  constructor({
    id,
    type,
    slotId,
    origin,
    scene,
    rng,
    map,
    parcelManager,
    difficulty,
    pressureSource = "manual",
    pressureOwnerTower = null,
    pressureModifierKey = null,
    pressureModifier = null,
    pressureHordeIndex = null,
    militiaConfig = null,
    slotFavor = null,
    contractDurationMs = null,
    completionBonusMoney = 0,
  }) {
    this.id = id;
    this.type = type;
    this.slotId = slotId;
    this.origin = origin;
    this.scene = scene;
    this.rng = rng;
    this.placedObjects = [];
    this._completed = false;

    this.map = map ?? GameMap;

    this.militiaConfig = militiaConfig ? { ...militiaConfig } : null;
    this.pm = parcelManager;
    this.difficulty = difficulty || 1;
    this.pressureSource = pressureSource;
    this.pressureOwnerTower = pressureOwnerTower;
    this.pressureModifierKey = pressureModifierKey;
    this.pressureModifier = pressureModifier ? { ...pressureModifier } : null;
    this.pressureHordeIndex = pressureHordeIndex;
    this.slotFavor = cloneSlotFavor(slotFavor);
    this.contractDurationMs = Number(contractDurationMs ?? 0) || null;
    this.completionBonusMoney = Math.max(0, Number(completionBonusMoney || 0));
    this._completionBonusGranted = false;

    this.timerEvent = null;
    this.uiTickEvent = null;
    this.militiaAmmoCheckEvent = null;
    this.expireAt = null;
    this.uiLifecycle = "starting";

    this.spawned = 0;
    this.killed = 0;
    this.totalPlannedEnemies = 0;
    this.spawners = [];
    this.enemyType = "raider";
    this.enemyTypeLabel = "Raiders";
    this.spawnerCount = 0;

    this.timerText = null;
    this.timerLabelBg = null;
    this._timerPresentationMode = null;
  }

  _ensureTimerText() {
    if (!this.timerLabelBg?.active) {
      this.timerLabelBg = this.scene.add.graphics()
        .setDepth(9998)
        .setVisible(false);
    }
    if (this.timerText) return;

    const cx = (this.origin.x + PARCEL_SIZE / 2) * SQUARESIZE;
    const topY = (this.origin.y - 1) * SQUARESIZE;

    this.timerText = this.scene.add.text(cx, topY, "", {
      fontFamily: "Bungee",
      fontSize: "14px",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 4,
    }).setOrigin(0.5, 1).setDepth(9999);
  }

  _getTimerLabelAnchor(isOverview = false) {
    const x = (this.origin.x + PARCEL_SIZE / 2) * SQUARESIZE;
    const isSouthOverview = isOverview && this.slotId === "S";
    const y = isSouthOverview
      ? (this.origin.y + PARCEL_SIZE + 1) * SQUARESIZE
      : (this.origin.y - 1) * SQUARESIZE;

    return {
      x,
      y,
      originY: isSouthOverview ? 0 : 1,
      backgroundY: isSouthOverview ? -3 : null,
    };
  }

  _syncTimerTextPresentation() {
    if (!this.timerText?.active) return;

    const isOverview = this.scene?.zoomMixer?.mode === "overview";
    const anchor = this._getTimerLabelAnchor(isOverview);
    const modeKey = isOverview ? "overview" : "detailed";
    const cameraZoom = Number(this.scene?.cameras?.main?.zoom ?? 1);
    const overviewScale = cameraZoom > 0
      ? Math.min(4, Math.max(1, 1 / cameraZoom))
      : 1;
    const scale = isOverview ? overviewScale : 1;

    if (this._timerPresentationMode !== modeKey) {
      this._timerPresentationMode = modeKey;
      this.timerText
        .setFontSize(isOverview ? "15px" : "14px")
        .setColor(isOverview ? "#fff7d6" : "#ffffff")
        .setStroke(isOverview ? "#06111d" : "#000000", isOverview ? 5 : 4)
        .setDepth(isOverview ? 10002 : 9999);
    }

    this.timerText
      .setPosition(anchor.x, anchor.y)
      .setOrigin(0.5, anchor.originY)
      .setScale(scale);

    if (!isOverview) {
      this.timerLabelBg?.clear?.();
      this.timerLabelBg?.setVisible?.(false);
      return;
    }

    if (!this.timerLabelBg?.active) return;

    const padX = 9;
    const padY = 5;
    const w = Math.ceil((this.timerText.width || 0) + padX * 2);
    const h = Math.ceil((this.timerText.height || 0) + padY * 2);
    const radius = Math.min(10, Math.max(4, Math.floor(h / 2)));
    const backgroundY = anchor.backgroundY ?? (-h + 3);

    this.timerLabelBg
      .clear()
      .setPosition(this.timerText.x, this.timerText.y)
      .setScale(scale)
      .setDepth((this.timerText.depth ?? 10002) - 1)
      .setVisible(true);
    this.timerLabelBg.fillStyle(0x06111d, 0.82);
    this.timerLabelBg.fillRoundedRect(-w / 2, backgroundY, w, h, radius);
    this.timerLabelBg.lineStyle(1.5, 0xfff1bd, 0.34);
    this.timerLabelBg.strokeRoundedRect(-w / 2, backgroundY, w, h, radius);
  }

  _getSimulationNowMs() {
    return Number(this.scene?.getSimulationNow?.() ?? this.scene?.simNowMs ?? 0);
  }

  _getMilitiaDurationMs(value = null) {
    const raw = Number(value ?? this.contractDurationMs ?? MILITIA_CONTRACT_MS);
    if (!Number.isFinite(raw) || raw <= 0) return MILITIA_CONTRACT_MS;
    return raw > 120_000 ? MILITIA_CONTRACT_MS : raw;
  }

  _setHudLifecycle(next = "active") {
    const normalized = next === "starting" || next === "leaving" ? next : "active";
    if (this.uiLifecycle === normalized) return;
    this.uiLifecycle = normalized;
    this.pm?.onContractProgressChanged?.(this);
    this.scene?.uiScene?.contractHud?.refreshForParcelStateChange?.();
  }

  _updateTimerText() {
    if (!this.timerText) return;
    const label = this.type === "FARM" ? "FIELD" : this.type;
    let nextText = "";

    if (this.type === "PRESSURE") {
      nextText = `FIGHT ${this.killed}/${this.totalPlannedEnemies}`;
    } else if (this.type === "MARKET") {
      const remaining = this.expireAt ? (this.expireAt - this._getSimulationNowMs()) : 0;
      nextText = `MARKET ${fmtMMSS(remaining)}`;
    } else if (this.type === "MILITIA") {
      const remaining = this.expireAt ? (this.expireAt - this._getSimulationNowMs()) : 0;
      nextText = `MILITIA ${fmtMMSS(remaining)}`;
    } else {
      const remaining = this.expireAt ? (this.expireAt - this._getSimulationNowMs()) : 0;
      nextText = `${label} ${fmtMMSS(remaining)}`;
    }

    this.timerText.setText(nextText);
    this._syncTimerTextPresentation();
  }

  _startUITick() {
    this._ensureTimerText();
    this._updateTimerText();

    if (this.uiTickEvent) this.uiTickEvent.remove(false);
    this.uiTickEvent = this.scene.time.addEvent({
      delay: 200,
      loop: true,
      callback: () => this._updateTimerText(),
    });
  }

  _stopUITick() {
    if (this.uiTickEvent) {
      this.uiTickEvent.remove(false);
      this.uiTickEvent = null;
    }
    if (this.timerText) {
      this.timerText.destroy();
      this.timerText = null;
    }
    if (this.timerLabelBg) {
      this.timerLabelBg.destroy();
      this.timerLabelBg = null;
    }
    this._timerPresentationMode = null;
  }

  _footprintTouchesWater(gx, gy, lenX, lenY, pad = 1) {
    const minY = gy - pad;
    const maxY = gy + lenY - 1 + pad;
    const minX = gx - pad;
    const maxX = gx + lenX - 1 + pad;

    for (let yy = minY; yy <= maxY; yy++) {
      for (let xx = minX; xx <= maxX; xx++) {
        const cell = GameMap.grid?.[yy]?.[xx];
        if (cell == null) continue;

        if (Array.isArray(cell)) {
          if (cell.some((val) => TILE_MAP(val) === "water")) return true;
          continue;
        }

        if (TILE_MAP(cell) === "water") return true;
      }
    }

    return false;
  }

  _spawnResourceNodes(nodeType, count) {
    const triesMax = Math.max(200, count * 30);
    let placed = 0;
    let tries = 0;

    const tileType = this._resourceTileTypeForNodeType(nodeType);
    if (!tileType) return;

    const minX = this.origin.x + 1;
    const minY = this.origin.y + 1;
    const maxX = this.origin.x + (PARCEL_SIZE - 1) - tileType.lenX;
    const maxY = this.origin.y + (PARCEL_SIZE - 1) - tileType.lenY;

    while (placed < count && tries < triesMax) {
      tries++;

      const gx = randInt(this.rng, minX, maxX);
      const gy = randInt(this.rng, minY, maxY);

      const cell = GameMap.grid?.[gy]?.[gx];
      if (cell == null) continue;

      const top = Array.isArray(cell) ? cell[cell.length - 1] : cell;
      if (TILE_MAP(top) === "water") continue;
      if (this._footprintTouchesWater(gx, gy, tileType.lenX, tileType.lenY, 1)) continue;
      if (GameMap.checkBlockPositionGen(gx, gy, tileType.lenX, tileType.lenY)) continue;

      try {
        const obj = GameMap.handleLoadNonSpread(gx, gy, tileType);
        if (!obj) continue;

        obj.contractId = this.id;
        obj.slotId = this.slotId;
        if (nodeType === "goldOre") {
          obj.moneyReward = getGoldOrePayout(this.scene);
          obj.moneyRewardRemaining = obj.moneyReward;
        }

        if (nodeType === "pine") GameMap.worldPines.push(obj);
        else GameMap.worldStones.push(obj);

        this.placedObjects.push(obj);
        placed++;
      } catch (e) {
        // Ignore placement failures and keep filling the parcel.
      }
    }
  }

  _spawnResourceNodeDefs(nodeDefs = []) {
    for (const def of nodeDefs) {
      const nodeType = String(def?.nodeType || "").trim();
      const count = Math.max(0, Number(def?.count || 0));
      if (!nodeType || count <= 0) continue;
      this._spawnResourceNodes(nodeType, count);
    }
  }

  _spawnFarmBushes() {
    FarmBushNode.init(this.scene);
    const candidates = [];
    const minX = this.origin.x + 1;
    const minY = this.origin.y + 1;
    const maxX = this.origin.x + PARCEL_SIZE - 2;
    const maxY = this.origin.y + PARCEL_SIZE - 2;

    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        const cell = GameMap.grid?.[gy]?.[gx];
        if (cell == null) continue;

        const floor = Array.isArray(cell) ? cell[0] : cell;
        if (floor !== TILE_TYPES.dark_grass?.interior) continue;

        candidates.push([gx, gy]);
      }
    }

    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    const targetCount = Math.min(18, candidates.length);
    for (let i = 0; i < targetCount; i++) {
      const [gx, gy] = candidates[i];
      const kind = i % 2 === 0 ? "seed" : "berry";

      try {
        const obj = new FarmBushNode(gx, gy, kind);
        obj.contractId = this.id;
        obj.slotId = this.slotId;
        this.placedObjects.push(obj);
      } catch (e) {
        // Ignore a bad bush spawn and keep laying out the parcel.
      }
    }
  }

  _markParcelWaterWalkable() {
    const minX = this.origin.x;
    const minY = this.origin.y;
    const maxX = this.origin.x + PARCEL_SIZE - 1;
    const maxY = this.origin.y + PARCEL_SIZE - 1;
    let navChanged = false;

    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        const cell = GameMap.grid?.[gy]?.[gx];
        if (cell == null) continue;
        const water =
          Array.isArray(cell)
            ? cell.some((val) => TILE_MAP(val) === "water")
            : TILE_MAP(cell) === "water";
        if (!water) continue;
        if (GameMap.navGrid?.[gy]?.[gx] !== undefined) {
          navChanged = navChanged || GameMap.navGrid[gy][gx] !== 1;
          GameMap.navGrid[gy][gx] = 1;
        }
        if (GameMap.enemyNavGrid?.[gy]?.[gx] !== undefined) {
          navChanged = navChanged || GameMap.enemyNavGrid[gy][gx] !== 1;
          GameMap.enemyNavGrid[gy][gx] = 1;
        }
      }
    }

    if (navChanged) GameMap.bumpNavGridRevision?.("parcel_water_walkable");
  }

  _paintMilitiaIslands() {
    // Fill full parcel with water first.
    paintWaterRect({
      origin: this.origin,
      size: PARCEL_SIZE,
      setWaterRect: (x, y, w, h) => this.map.setWaterRect?.(x, y, w, h),
    });

    const islandSize = 2;
    const islandGap = 3; // between islands
    const nearMainGap = 1; // exactly what you asked for

    const islands = [];

    if (this.slotId === "S") {
      const y = this.origin.y + nearMainGap;
      const startX = this.origin.x + 6;
      islands.push(
        { x: startX, y, w: islandSize, h: islandSize },
        { x: startX + islandSize + islandGap, y, w: islandSize, h: islandSize },
        { x: startX + (islandSize + islandGap) * 2, y, w: islandSize, h: islandSize },
      );
    } else if (this.slotId === "N") {
      const y = this.origin.y + PARCEL_SIZE - nearMainGap - islandSize;
      const startX = this.origin.x + 6;
      islands.push(
        { x: startX, y, w: islandSize, h: islandSize },
        { x: startX + islandSize + islandGap, y, w: islandSize, h: islandSize },
        { x: startX + (islandSize + islandGap) * 2, y, w: islandSize, h: islandSize },
      );
    } else if (this.slotId === "E") {
      const x = this.origin.x + nearMainGap;
      const startY = this.origin.y + 6;
      islands.push(
        { x, y: startY, w: islandSize, h: islandSize },
        { x, y: startY + islandSize + islandGap, w: islandSize, h: islandSize },
        { x, y: startY + (islandSize + islandGap) * 2, w: islandSize, h: islandSize },
      );
    } else {
      const x = this.origin.x + PARCEL_SIZE - nearMainGap - islandSize;
      const startY = this.origin.y + 6;
      islands.push(
        { x, y: startY, w: islandSize, h: islandSize },
        { x, y: startY + islandSize + islandGap, w: islandSize, h: islandSize },
        { x, y: startY + (islandSize + islandGap) * 2, w: islandSize, h: islandSize },
      );
    }

    for (const island of islands) {
      this._paintMilitiaGrassIsland(island);
    }

    return islands;
  }

  _setFloorTileValue(gx, gy, val) {
    if (!this.map?.grid?.[gy] || this.map.grid[gy][gx] == null) return;
    const cell = this.map.grid[gy][gx];
    if (Array.isArray(cell)) {
      this.map.grid[gy][gx][0] = val;
    } else {
      this.map.grid[gy][gx] = val;
    }

    let navChanged = false;
    if (this.map.navGrid?.[gy]?.[gx] !== undefined) {
      navChanged = navChanged || this.map.navGrid[gy][gx] !== 1;
      this.map.navGrid[gy][gx] = 1;
    }
    if (this.map.enemyNavGrid?.[gy]?.[gx] !== undefined) {
      navChanged = navChanged || this.map.enemyNavGrid[gy][gx] !== 1;
      this.map.enemyNavGrid[gy][gx] = 1;
    }
    if (navChanged) this.map.bumpNavGridRevision?.("militia_floor_nav_change");

    this.map._refreshRenderCacheAround?.(gx, gy);
    this.map.drawGridValue?.(gx, gy);
  }

  _paintMilitiaGrassIsland(island) {
    if (!island) return;
    const corners = TILE_TYPES.grass?.corners;
    if (!corners || island.w !== 2 || island.h !== 2) {
      this.map.fillGroundRect?.(island.x, island.y, island.w, island.h, "grass");
      return;
    }

    // Militia islands are intentionally 2x2: one correctly oriented grass corner per tile.
    this._setFloorTileValue(island.x, island.y, corners.topLeft);
    this._setFloorTileValue(island.x + 1, island.y, corners.topRight);
    this._setFloorTileValue(island.x, island.y + 1, corners.bottomLeft);
    this._setFloorTileValue(island.x + 1, island.y + 1, corners.bottomRight);
  }

  _placeMilitiaDefense(kind, gx, gy, snapshot = null) {
    const tileType = kind === "catapult" ? TILE_TYPES.catapult : TILE_TYPES.turret;
    const obj = GameMap.handleLoadNonSpread(gx, gy, tileType);
    if (!obj) return null;

    const defaultMaxAmmo = kind === "catapult" ? 3 : 5;
    const maxAmmo = Number.isFinite(Number(snapshot?.maxAmmo))
      ? Math.max(0, Math.floor(Number(snapshot.maxAmmo)))
      : defaultMaxAmmo;
    const ammoRemaining = Number.isFinite(Number(snapshot?.ammoRemaining ?? snapshot?.ammo))
      ? Math.max(0, Math.floor(Number(snapshot.ammoRemaining ?? snapshot.ammo)))
      : maxAmmo;

    obj.contractId = this.id;
    obj.slotId = this.slotId;
    obj.isTemporaryMilitia = true;
    obj.maxAmmo = maxAmmo;
    obj.ammoRemaining = Math.min(ammoRemaining, maxAmmo);
    if (Number.isFinite(Number(snapshot?.maxHealth))) {
      obj.maxHealth = Math.max(1, Number(snapshot.maxHealth));
    }
    if (Number.isFinite(Number(snapshot?.health))) {
      obj.health = Math.max(0, Number(snapshot.health));
    }
    obj.onAmmoStateChanged = () => this._checkMilitiaDefensesUsable("out_of_ammo");
    obj.updateHealthBar?.();
    this.placedObjects.push(obj);
    return obj;
  }

  _spawnMilitiaFormation(savedDefenses = null) {
    const layout = Array.isArray(this.militiaConfig?.layout) && this.militiaConfig.layout.length === 3
      ? this.militiaConfig.layout
      : ["turret", "turret", "turret"];
    const snapshots = Array.isArray(savedDefenses) ? savedDefenses : [];

    const islands = this._paintMilitiaIslands();

    for (let i = 0; i < Math.min(3, islands.length); i++) {
      const island = islands[i];
      const snapshot = snapshots[i] || null;
      if (snapshot?.destroyed || snapshot?.active === false) continue;
      const kind = snapshot?.kind === "catapult" || snapshot?.kind === "turret"
        ? snapshot.kind
        : layout[i];
      this._placeMilitiaDefense(kind, island.x, island.y, snapshot);
    }
  }

  _militiaDefenses() {
    return (this.placedObjects || []).filter((obj) => (
      obj?.contractId === this.id &&
      (
        obj.isTemporaryMilitia ||
        obj.tileType?.name === TILE_TYPES.turret.name ||
        obj.tileType?.name === TILE_TYPES.catapult.name
      )
    ));
  }

  _isMilitiaDefenseUnusable(obj) {
    if (!obj || obj.active === false || obj._destroyed) return true;
    const hasFiniteAmmo = Number.isFinite(Number(obj.maxAmmo)) && Number.isFinite(Number(obj.ammoRemaining));
    return hasFiniteAmmo && Number(obj.ammoRemaining) <= 0;
  }

  _checkMilitiaDefensesUsable(reason = "out_of_ammo") {
    if (this._completed || this.type !== "MILITIA") return false;
    const defenses = this._militiaDefenses();
    const allUnusable = defenses.length === 0 || defenses.every((obj) => this._isMilitiaDefenseUnusable(obj));
    if (!allUnusable) return false;
    this.complete(reason || "out_of_ammo");
    return true;
  }

  _startMilitiaDefenseMonitor() {
    if (this.type !== "MILITIA") return;
    this._stopMilitiaDefenseMonitor();
    this.militiaAmmoCheckEvent = this.scene?.time?.addEvent?.({
      delay: 120,
      loop: true,
      callback: () => this._checkMilitiaDefensesUsable("out_of_ammo"),
    }) ?? null;
    this._checkMilitiaDefensesUsable("out_of_ammo");
  }

  _stopMilitiaDefenseMonitor() {
    this.militiaAmmoCheckEvent?.remove?.(false);
    this.militiaAmmoCheckEvent = null;
  }

  getParcelBounds() {
    return {
      x: this.origin?.x ?? 0,
      y: this.origin?.y ?? 0,
      w: PARCEL_SIZE,
      h: PARCEL_SIZE,
      parcelTag: `parcel:${this.slotId}`,
    };
  }

  _clearVisibilitySourcesInParcelBounds() {
    const bounds = this.getParcelBounds?.();
    if (!bounds) return;

    const minX = Number(bounds.x ?? 0);
    const minY = Number(bounds.y ?? 0);
    const maxX = minX + Math.max(0, Number(bounds.w ?? 0) - 1);
    const maxY = minY + Math.max(0, Number(bounds.h ?? 0) - 1);
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return;

    VisibilitySystem.clearSourcesInBounds(minX, minY, maxX, maxY);
  }

  _paintMarketParcel() {
    const M = this.map;

    if (this.scene?.refreshParcelArea) {
      this.scene.refreshParcelArea(this.getParcelBounds?.(), {
        forceOverviewRebuild: this.scene?.zoomMixer?.mode === "overview",
      });
    } else {
      if (this.scene?.zoomMixer?.mode !== "overview") M.reDraw?.();
      this.scene?.rebuildBothNavMeshes?.();
      this.scene?.zoomMixer?.buildOverviewTextureFromGrid?.(
        this.map.grid,
        SQUARESIZE,
        (cell) => colorFor(cell)
      );
    }
  }

  _resourceSpawnSettings() {
    if (this.type === "FOREST") {
      return {
        groundType: "dirt",
        pondTiles: 32,
        edgeBuffer: 2,
        waterWalkable: true,
        nodeDefs: [{ nodeType: "pine", count: 32 }],
        ms: RESOURCE_CONTRACT_MS.FOREST,
      };
    }

    if (this.type === "ROCK") {
      return {
        groundType: "dirt",
        pondTiles: 26,
        edgeBuffer: 2,
        waterWalkable: true,
        nodeDefs: [
          { nodeType: "rock", count: 14 },
          { nodeType: "goldOre", count: 6 },
        ],
        ms: RESOURCE_CONTRACT_MS.ROCK,
      };
    }

    if (this.type === "FARM") {
      return {
        groundType: "dark_grass",
        pondTiles: 28,
        edgeBuffer: 2,
        waterWalkable: true,
        nodeDefs: [],
        ms: RESOURCE_CONTRACT_MS.FARM ?? RESOURCE_CONTRACT_MS.FOREST,
      };
    }

    return null;
  }

  _buildResourceTerrainPlan(settings) {
    return buildResourceParcelTerrainPlan({
      origin: this.origin,
      size: PARCEL_SIZE,
      rng: this.rng,
      groundType: settings.groundType,
      pondTiles: settings.pondTiles,
      edgeBuffer: settings.edgeBuffer,
    });
  }

  _terrainPlanTileAt(plan, gx, gy) {
    return plan?.tileTypeByKey?.get?.(`${gx},${gy}`) ?? null;
  }

  _resourceTileTypeForNodeType(nodeType) {
    if (nodeType === "pine") return TILE_TYPES.pine;
    if (nodeType === "goldOre") return TILE_TYPES.goldOre;
    if (nodeType === "rock") return TILE_TYPES.rock;
    return null;
  }

  _footprintTouchesPlanWater(gx, gy, lenX, lenY, pad, terrainPlan) {
    for (let yy = gy - pad; yy <= gy + lenY - 1 + pad; yy++) {
      for (let xx = gx - pad; xx <= gx + lenX - 1 + pad; xx++) {
        if (this._terrainPlanTileAt(terrainPlan, xx, yy) === "water") return true;
      }
    }
    return false;
  }

  _buildResourceNodePlan(nodeDefs = [], terrainPlan) {
    const minX = this.origin.x + 1;
    const minY = this.origin.y + 1;
    const occupied = new Set();
    const nodes = [];

    const blockedByPlannedNode = (gx, gy, tileType) => {
      for (let yy = gy; yy < gy + tileType.lenY; yy++) {
        for (let xx = gx; xx < gx + tileType.lenX; xx++) {
          if (occupied.has(`${xx},${yy}`)) return true;
        }
      }
      return false;
    };

    const markOccupied = (gx, gy, tileType) => {
      for (let yy = gy; yy < gy + tileType.lenY; yy++) {
        for (let xx = gx; xx < gx + tileType.lenX; xx++) {
          occupied.add(`${xx},${yy}`);
        }
      }
    };

    for (const def of nodeDefs || []) {
      const nodeType = String(def?.nodeType || "").trim();
      const count = Math.max(0, Number(def?.count || 0));
      const tileType = this._resourceTileTypeForNodeType(nodeType);
      if (!nodeType || !tileType || count <= 0) continue;

      const triesMax = Math.max(200, count * 30);
      const maxX = this.origin.x + (PARCEL_SIZE - 1) - tileType.lenX;
      const maxY = this.origin.y + (PARCEL_SIZE - 1) - tileType.lenY;
      let placed = 0;
      let tries = 0;

      while (placed < count && tries < triesMax) {
        tries++;
        const gx = randInt(this.rng, minX, maxX);
        const gy = randInt(this.rng, minY, maxY);
        if (this._terrainPlanTileAt(terrainPlan, gx, gy) === "water") continue;
        if (this._footprintTouchesPlanWater(gx, gy, tileType.lenX, tileType.lenY, 1, terrainPlan)) continue;
        if (blockedByPlannedNode(gx, gy, tileType)) continue;
        if (GameMap.checkBlockPositionGen(gx, gy, tileType.lenX, tileType.lenY)) continue;

        nodes.push({
          x: gx,
          y: gy,
          nodeType,
          moneyReward: nodeType === "goldOre" ? getGoldOrePayout(this.scene) : 0,
        });
        markOccupied(gx, gy, tileType);
        placed++;
      }
    }

    return nodes;
  }

  _buildFarmBushPlan(terrainPlan) {
    const candidates = [];
    const minX = this.origin.x + 1;
    const minY = this.origin.y + 1;
    const maxX = this.origin.x + PARCEL_SIZE - 2;
    const maxY = this.origin.y + PARCEL_SIZE - 2;

    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        if (this._terrainPlanTileAt(terrainPlan, gx, gy) !== "dark_grass") continue;
        candidates.push([gx, gy]);
      }
    }

    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    return candidates.slice(0, Math.min(18, candidates.length)).map(([x, y], index) => ({
      x,
      y,
      kind: index % 2 === 0 ? "seed" : "berry",
    }));
  }

  _cloneNavGrid(grid) {
    return Array.isArray(grid) ? grid.map((row) => Array.isArray(row) ? row.slice() : []) : [];
  }

  _buildFutureNavGrids(terrainPlan, resourceNodes, settings) {
    const navGrid = this._cloneNavGrid(GameMap.navGrid);
    const enemyNavGrid = this._cloneNavGrid(GameMap.enemyNavGrid);

    for (const cell of terrainPlan.cells) {
      const walkableWater = cell.tileType === "water" && settings.waterWalkable === true;
      const blocks = cell.tileType === "water" && !walkableWater;
      if (navGrid[cell.y]) navGrid[cell.y][cell.x] = blocks ? 0 : 1;
      if (enemyNavGrid[cell.y]) enemyNavGrid[cell.y][cell.x] = blocks ? 0 : 1;
    }

    for (const node of resourceNodes || []) {
      const tileType = this._resourceTileTypeForNodeType(node.nodeType);
      if (!tileType) continue;
      for (let yy = node.y; yy < node.y + tileType.lenY; yy++) {
        for (let xx = node.x; xx < node.x + tileType.lenX; xx++) {
          if (navGrid[yy]) navGrid[yy][xx] = 0;
          if (enemyNavGrid[yy]) enemyNavGrid[yy][xx] = 0;
        }
      }
    }

    return {
      navGrid,
      enemyNavGrid,
      navGridRevision: GameMap.getNavGridRevision?.() ?? 0,
    };
  }

  _buildPressureTerrainPlan() {
    const cells = [];
    const tileTypeByKey = new Map();

    for (let ly = 0; ly < PARCEL_SIZE; ly++) {
      for (let lx = 0; lx < PARCEL_SIZE; lx++) {
        const x = this.origin.x + lx;
        const y = this.origin.y + ly;
        const cell = { x, y, lx, ly, tileType: "dirt" };
        cells.push(cell);
        tileTypeByKey.set(`${x},${y}`, "dirt");
      }
    }

    return {
      origin: { x: this.origin.x, y: this.origin.y },
      size: PARCEL_SIZE,
      groundType: "dirt",
      cells,
      pondCells: [],
      tileTypeByKey,
    };
  }

  _buildPressureNavGrids(terrainPlan, pressurePlan) {
    const navGrid = this._cloneNavGrid(GameMap.navGrid);
    const enemyNavGrid = this._cloneNavGrid(GameMap.enemyNavGrid);
    const spawnType = TILE_TYPES.spawn;
    const spawnLenX = Math.max(1, Number(spawnType?.lenX ?? 1) || 1);
    const spawnLenY = Math.max(1, Number(spawnType?.lenY ?? 1) || 1);

    for (const cell of terrainPlan.cells) {
      if (navGrid[cell.y]) navGrid[cell.y][cell.x] = 1;
      if (enemyNavGrid[cell.y]) enemyNavGrid[cell.y][cell.x] = 1;
    }

    for (const spec of pressurePlan?.spawnerSpecs || []) {
      const gx = Number(spec?.pos?.gx);
      const gy = Number(spec?.pos?.gy);
      if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;

      for (let yy = gy; yy < gy + spawnLenY; yy++) {
        for (let xx = gx; xx < gx + spawnLenX; xx++) {
          if (navGrid[yy]) navGrid[yy][xx] = 0;
          if (enemyNavGrid[yy]) enemyNavGrid[yy][xx] = 0;
        }
      }
    }

    return {
      navGrid,
      enemyNavGrid,
      navGridRevision: GameMap.getNavGridRevision?.() ?? 0,
    };
  }

  _applyTerrainPlan(terrainPlan, settings) {
    let navChanged = false;
    for (const cell of terrainPlan.cells) {
      const def = TILE_TYPES[cell.tileType];
      if (!def || !this.map.grid?.[cell.y] || this.map.grid[cell.y][cell.x] == null) continue;
      this.map.grid[cell.y][cell.x] = def.interior ?? def.grid;

      const walkableWater = cell.tileType === "water" && settings.waterWalkable === true;
      const blocks = cell.tileType === "water" && !walkableWater;
      const nextNav = blocks ? 0 : 1;
      if (this.map.navGrid?.[cell.y]?.[cell.x] !== undefined) {
        navChanged = navChanged || this.map.navGrid[cell.y][cell.x] !== nextNav;
        this.map.navGrid[cell.y][cell.x] = nextNav;
      }
      if (this.map.enemyNavGrid?.[cell.y]?.[cell.x] !== undefined) {
        navChanged = navChanged || this.map.enemyNavGrid[cell.y][cell.x] !== nextNav;
        this.map.enemyNavGrid[cell.y][cell.x] = nextNav;
      }
    }
    if (navChanged) this.map.bumpNavGridRevision?.("parcel_terrain_nav_change");

    this.map.refreshTerrainShapesInRect?.(this.origin.x, this.origin.y, PARCEL_SIZE, PARCEL_SIZE, 1);
  }

  _applyPressureSpawnerPlan(pressurePlan = null) {
    const pressureData = createPressureSpawners({
      scene: this.scene,
      origin: this.origin,
      difficulty: this.difficulty,
      contractId: this.id,
      spawnSpawnerBuilding: (args) => this.pm.spawnSpawnerBuilding(args),
      modifier: this.pressureModifier,
      plan: pressurePlan,
    });

    this.spawners = pressureData.spawners;
    this.totalPlannedEnemies = pressureData.totalPlannedEnemies;
    this.enemyType = pressureData.enemyType;
    this.enemyTypeLabel = pressureData.enemyTypeLabel;
    this.spawnerCount = pressureData.spawnerCount;
    this.placedObjects = pressureData.spawners
      .map((entry) => entry?.building)
      .filter(Boolean);

    this._startUITick();
    return pressureData;
  }

  _applyResourceNodePlan(nodes) {
    for (const node of nodes || []) {
      const tileType = this._resourceTileTypeForNodeType(node.nodeType);
      if (!tileType) continue;
      try {
        const obj = GameMap.handleLoadNonSpread(node.x, node.y, tileType);
        if (!obj) continue;

        obj.contractId = this.id;
        obj.slotId = this.slotId;
        if (node.nodeType === "goldOre") {
          obj.moneyReward = Math.max(0, Number(node.moneyReward || 0));
          obj.moneyRewardRemaining = Math.max(0, Number(node.moneyReward || 0));
        }

        if (node.nodeType === "pine") GameMap.worldPines.push(obj);
        else GameMap.worldStones.push(obj);

        this.placedObjects.push(obj);
      } catch (e) {
        // Ignore placement failures and keep filling the parcel.
      }
    }
  }

  _applyFarmBushPlan(bushes) {
    FarmBushNode.init(this.scene);
    for (const entry of bushes || []) {
      try {
        const obj = new FarmBushNode(entry.x, entry.y, entry.kind);
        obj.contractId = this.id;
        obj.slotId = this.slotId;
        this.placedObjects.push(obj);
      } catch (e) {
        // Ignore a bad bush spawn and keep laying out the parcel.
      }
    }
  }

  _startResourceLifecycle(ms) {
    const durationMs = Math.max(0, Number(ms || this.contractDurationMs || 0));
    this.contractDurationMs = durationMs;
    this.expireAt = this._getSimulationNowMs() + durationMs;
    this._startUITick();
    this.timerEvent = this.scene.time.delayedCall(durationMs, () => this.complete("timeout"), null, this);
    this._setHudLifecycle("active");
  }

  _fallbackRefreshResourceArea() {
    if (this.scene?.refreshParcelArea) {
      this.scene.refreshParcelArea(this.getParcelBounds?.(), {
        waterSourceUpdate: {
          slotId: this.slotId,
          landParcel: true,
        },
        forceOverviewRebuild: this.scene?.zoomMixer?.mode === "overview",
      });
      return true;
    }

    if (this.scene?.zoomMixer?.mode !== "overview") {
      this.map.reDraw?.();
    }
    this.scene?.rebuildBothNavMeshes?.();
    this.scene?.zoomMixer?.buildOverviewTextureFromGrid?.(
      this.map.grid,
      SQUARESIZE,
      (cell) => colorFor(cell)
    );
    return true;
  }

  _buildParcelWaterPlan() {
    const cells = [];
    for (let ly = 0; ly < PARCEL_SIZE; ly++) {
      for (let lx = 0; lx < PARCEL_SIZE; lx++) {
        cells.push({
          x: this.origin.x + lx,
          y: this.origin.y + ly,
          lx,
          ly,
          tileType: "water",
        });
      }
    }
    return {
      origin: { x: this.origin.x, y: this.origin.y },
      size: PARCEL_SIZE,
      cells,
    };
  }

  _buildRemovalNavGrids(removalPlan) {
    const navGrid = this._cloneNavGrid(GameMap.navGrid);
    const enemyNavGrid = this._cloneNavGrid(GameMap.enemyNavGrid);

    for (const cell of removalPlan.cells) {
      if (navGrid[cell.y]) navGrid[cell.y][cell.x] = 0;
      if (enemyNavGrid[cell.y]) enemyNavGrid[cell.y][cell.x] = 0;
    }

    return {
      navGrid,
      enemyNavGrid,
      navGridRevision: GameMap.getNavGridRevision?.() ?? 0,
    };
  }

  _applyWaterRemovalPlan(removalPlan) {
    const waterVal = TILE_TYPES.water?.interior ?? TILE_TYPES.water?.grid;
    if (waterVal == null) return;

    let navChanged = false;
    for (const cell of removalPlan.cells) {
      if (!this.map.grid?.[cell.y] || this.map.grid[cell.y][cell.x] == null) continue;
      this.map.grid[cell.y][cell.x] = waterVal;
      if (this.map.navGrid?.[cell.y]?.[cell.x] !== undefined) {
        navChanged = navChanged || this.map.navGrid[cell.y][cell.x] !== 0;
        this.map.navGrid[cell.y][cell.x] = 0;
      }
      if (this.map.enemyNavGrid?.[cell.y]?.[cell.x] !== undefined) {
        navChanged = navChanged || this.map.enemyNavGrid[cell.y][cell.x] !== 0;
        this.map.enemyNavGrid[cell.y][cell.x] = 0;
      }
    }
    if (navChanged) this.map.bumpNavGridRevision?.("parcel_removal_nav_change");

    this.map.refreshTerrainShapesInRect?.(this.origin.x, this.origin.y, PARCEL_SIZE, PARCEL_SIZE, 1);
  }

  _disablePlacedObjectInteractions() {
    const safeDisableInteractive = (node) => {
      if (!node || node.active === false) return;
      if (!node.scene?.sys?.input) return;
      node.disableInteractive?.();
    };

    for (const obj of this.placedObjects || []) {
      safeDisableInteractive(obj);
      safeDisableInteractive(obj?.sprite);
      safeDisableInteractive(obj?.hit);
      safeDisableInteractive(obj?.container);
    }

    for (const spawner of this.spawners || []) {
      const building = spawner?.building;
      safeDisableInteractive(building?.sprite);
      safeDisableInteractive(building);
    }
  }

  _destroyPlacedObjectsForRemoval() {
    for (const obj of this.placedObjects) {
      if (!obj) continue;

      if (typeof obj.destroy === "function" && (obj.resourceKind || obj.sprite || obj.container)) {
        obj.destroy();
        continue;
      }

      removeFromArray(GameMap.worldPines, obj);
      removeFromArray(GameMap.worldStones, obj);
      removeFromArray(GameMap.worldSeedBushes, obj);
      removeFromArray(GameMap.worldBerryBushes, obj);
      obj.destroy?.();
    }
    this.placedObjects = [];

    if (this.type === "MARKET") {
      this._marketHandle?.destroy?.();
      this._marketHandle = null;
    }

    for (const spawner of this.spawners) {
      try {
        spawner.building?.destroy?.();
      } catch {}
    }

    this.spawners = [];
  }

  _fallbackRefreshRemovalArea() {
    if (this.scene?.refreshParcelArea) {
      const refreshOptions = {
        forceOverviewRebuild: this.scene?.zoomMixer?.mode === "overview",
      };
      if (this.type !== "MARKET") {
        refreshOptions.waterSourceUpdate = {
          excludeParcelId: this.id,
        };
      }
      this.scene.refreshParcelArea(this.getParcelBounds?.(), refreshOptions);
      return true;
    }

    if (this.scene?.zoomMixer?.mode !== "overview") {
      this.map.reDraw?.();
    }
    this.scene?.rebuildBothNavMeshes?.();
    this.scene?.zoomMixer?.buildOverviewTextureFromGrid?.(
      this.map.grid,
      SQUARESIZE,
      (cell) => colorFor(cell)
    );
    return true;
  }

  _spawnResourceImmediate(settings) {
    this._spawnCommitted = true;
    const M = this.map;
    const setGroundRect = M.setGroundRect.bind(M);
    const setWater = M.setWater.bind(M);
    const setWalkableWater = (x, y) => M.setWater?.(x, y, { walkable: true });

    paintResourceParcel({
      origin: this.origin,
      size: PARCEL_SIZE,
      rng: this.rng,
      setGroundRect,
      setWater: settings.waterWalkable ? setWalkableWater : setWater,
      groundType: settings.groundType,
      pondTiles: settings.pondTiles,
      edgeBuffer: settings.edgeBuffer,
    });

    if (settings.waterWalkable) {
      this._markParcelWaterWalkable();
    }

    if (settings.nodeDefs?.length) {
      this._spawnResourceNodeDefs(settings.nodeDefs);
    } else if (this.type === "FARM") {
      this._spawnFarmBushes();
    }

    this._startResourceLifecycle(this.contractDurationMs ?? settings.ms);
    return { refreshHandled: false };
  }

  async _spawnResourceAnimated(settings) {
    let reveal = null;
    const terrainPlan = this._buildResourceTerrainPlan(settings);
    const resourceNodes = settings.nodeDefs?.length
      ? this._buildResourceNodePlan(settings.nodeDefs, terrainPlan)
      : [];
    const farmBushes = this.type === "FARM" ? this._buildFarmBushPlan(terrainPlan) : [];
    const futureNav = this._buildFutureNavGrids(terrainPlan, resourceNodes, settings);

    reveal = new ParcelRevealAnimator(this.scene, {
      cells: terrainPlan.cells,
      slotId: this.slotId,
      size: PARCEL_SIZE,
      alpha: 0.5,
      playThuds: true,
    });
    this._setHudLifecycle("starting");

    let navDone = false;
    const navPromise = this.scene?.prepareParcelNavMeshesAsync
      ? this.scene.prepareParcelNavMeshesAsync(futureNav)
          .catch((err) => {
            console.warn("Parcel navmesh async prep failed; falling back to local refresh.", err);
            return null;
          })
          .then((result) => {
            navDone = true;
            return result;
          })
      : Promise.resolve(null).then((result) => {
          navDone = true;
          return result;
        });

    try {
      await reveal.play();
      if (!navDone) reveal.pulseWaiting();
      const navResult = await navPromise;
      reveal.stopPulse();

      const commitBaseRevision = GameMap.getNavGridRevision?.() ?? 0;
      this._spawnCommitted = true;
      this._applyTerrainPlan(terrainPlan, settings);
      if (settings.nodeDefs?.length) {
        this._applyResourceNodePlan(resourceNodes);
      } else if (this.type === "FARM") {
        this._applyFarmBushPlan(farmBushes);
      }

      const refreshOpts = {
        waterSourceUpdate: {
          slotId: this.slotId,
          landParcel: true,
        },
        forceOverviewRebuild: this.scene?.zoomMixer?.mode === "overview",
      };
      const refreshHandled = !!(navResult && this.scene?.applyPreparedNavMeshes?.({
        navPolys: navResult.navPolys,
        enemyPolys: navResult.enemyPolys,
        navGrid: futureNav.navGrid,
        enemyNavGrid: futureNav.enemyNavGrid,
        navGridRevision: navResult.navGridRevision ?? futureNav.navGridRevision,
        commitBaseRevision,
        bounds: this.getParcelBounds?.(),
        refreshOpts,
      }));

      if (!refreshHandled) {
        this._fallbackRefreshResourceArea();
      }

      await reveal.complete();
      AudioManager.playBuildingComplete({ volume: 0.22, world: true });
      this._startResourceLifecycle(this.contractDurationMs ?? settings.ms);
      return { refreshHandled: true };
    } catch (err) {
      reveal?.destroy?.();
      throw err;
    }
  }

  _spawnPressureImmediate() {
    this._spawnCommitted = true;
    const terrainPlan = this._buildPressureTerrainPlan();
    const pressurePlan = buildPressureSpawnerPlan({
      scene: this.scene,
      origin: this.origin,
      difficulty: this.difficulty,
      modifier: this.pressureModifier,
    });

    this._applyTerrainPlan(terrainPlan, { waterWalkable: false });
    this._applyPressureSpawnerPlan(pressurePlan);
    this._setHudLifecycle("active");
    return { refreshHandled: false };
  }

  async _spawnPressureAnimated() {
    let reveal = null;
    const terrainPlan = this._buildPressureTerrainPlan();
    const pressurePlan = buildPressureSpawnerPlan({
      scene: this.scene,
      origin: this.origin,
      difficulty: this.difficulty,
      modifier: this.pressureModifier,
    });
    const futureNav = this._buildPressureNavGrids(terrainPlan, pressurePlan);

    reveal = new ParcelRevealAnimator(this.scene, {
      cells: terrainPlan.cells,
      slotId: this.slotId,
      size: PARCEL_SIZE,
      alpha: 0.5,
      playThuds: true,
    });
    this._setHudLifecycle("starting");

    let navDone = false;
    const navPromise = this.scene?.prepareParcelNavMeshesAsync
      ? this.scene.prepareParcelNavMeshesAsync(futureNav)
          .catch((err) => {
            console.warn("Pressure parcel navmesh async prep failed; falling back to local refresh.", err);
            return null;
          })
          .then((result) => {
            navDone = true;
            return result;
          })
      : Promise.resolve(null).then((result) => {
          navDone = true;
          return result;
        });

    try {
      await reveal.play();
      if (!navDone) reveal.pulseWaiting();
      const navResult = await navPromise;
      reveal.stopPulse();

      const commitBaseRevision = GameMap.getNavGridRevision?.() ?? 0;
      this._spawnCommitted = true;
      this._applyTerrainPlan(terrainPlan, { waterWalkable: false });
      this._applyPressureSpawnerPlan(pressurePlan);

      const refreshOpts = {
        waterSourceUpdate: {
          slotId: this.slotId,
          landParcel: true,
        },
        forceOverviewRebuild: this.scene?.zoomMixer?.mode === "overview",
      };
      const refreshHandled = !!(navResult && this.scene?.applyPreparedNavMeshes?.({
        navPolys: navResult.navPolys,
        enemyPolys: navResult.enemyPolys,
        navGrid: futureNav.navGrid,
        enemyNavGrid: futureNav.enemyNavGrid,
        navGridRevision: navResult.navGridRevision ?? futureNav.navGridRevision,
        commitBaseRevision,
        bounds: this.getParcelBounds?.(),
        refreshOpts,
      }));

      if (!refreshHandled) {
        this._fallbackRefreshResourceArea();
      }

      await reveal.complete();
      AudioManager.playBuildingComplete({ volume: 0.22, world: true });
      this._setHudLifecycle("active");
      return { refreshHandled: true };
    } catch (err) {
      reveal?.destroy?.();
      throw err;
    }
  }

  spawn(opts = {}) {
    const resourceSettings = this._resourceSpawnSettings();
    if (resourceSettings) {
      if (opts.animateParcelAdd && !opts.skipAnimation) {
        return this._spawnResourceAnimated(resourceSettings);
      }
      return this._spawnResourceImmediate(resourceSettings);
    }

    if (this.type === "PRESSURE") {
      if (opts.animateParcelAdd && !opts.skipAnimation) {
        return this._spawnPressureAnimated();
      }
      return this._spawnPressureImmediate();
    }

    if (this.type === "MILITIA") {
      const ms = this._getMilitiaDurationMs();
      this.contractDurationMs = ms;

      this._spawnMilitiaFormation();
      this.expireAt = this._getSimulationNowMs() + ms;

      this._startUITick();
      this.timerEvent = this.scene.time.delayedCall(ms, () => this.complete("timeout"), null, this);
      this._setHudLifecycle("active");
      this._startMilitiaDefenseMonitor();
      return;
    }

    if (this.type === "MARKET") {
      const ms = Math.max(0, Number(this.contractDurationMs || 60_000));
      this.contractDurationMs = ms;
      this.expireAt = this._getSimulationNowMs() + ms;

      this._paintMarketParcel();
      this._startUITick();

      const cx = (this.origin.x + PARCEL_SIZE / 2) * SQUARESIZE;
      const cy = (this.origin.y + PARCEL_SIZE / 2) * SQUARESIZE;
      const prices = this.scene?.getRunMarketPriceTable?.(DEFAULT_MARKET_PRICES)
        || buildMarketPriceTable(this.scene, DEFAULT_MARKET_PRICES);
      this._marketPrices = { ...prices };
      this._marketSoldIds = new Set();

      this._marketHandle = spawnParcelMarketStorefront(this.scene, {
        origin: this.origin,
        parcelCenterWorld: { x: cx, y: cy },
        slotId: this.slotId,
        teamNumber: 1,
        durationMs: ms,
        prices,
        soldIds: this._marketSoldIds,
        onSoldIdsChanged: (nextSoldIds = []) => {
          this._marketSoldIds = new Set(nextSoldIds);
        },
        onPricesChanged: (nextPrices = {}) => {
          this._marketPrices = { ...nextPrices };
        },
      });

      this.timerEvent = this.scene.time.delayedCall(ms, () => {
        const handle = this._marketHandle;
        if (handle?.depart) handle.depart(() => this.complete("timeout"));
        else this.complete("timeout");
      }, null, this);
      this._setHudLifecycle("active");
      return;
    }

    GameMap._uiIgnoreWorldLayer();
  }

  getSnapshot() {
    return {
      id: this.id,
      type: this.type,
      slotId: this.slotId,
      origin: this.origin ? { x: this.origin.x, y: this.origin.y } : null,
      expireAt: this.expireAt ?? null,
      difficulty: this.difficulty ?? 1,
      spawned: this.spawned ?? 0,
      killed: this.killed ?? 0,
      totalPlannedEnemies: this.totalPlannedEnemies ?? 0,
      enemyType: this.enemyType ?? "raider",
      enemyTypeLabel: this.enemyTypeLabel ?? "Raiders",
      spawnerCount: this.spawnerCount ?? 0,
      pressureSource: this.pressureSource ?? "manual",
      pressureOwnerTower: this.pressureOwnerTower ?? null,
      pressureModifierKey: this.pressureModifierKey ?? null,
      pressureModifier: this.pressureModifier ? { ...this.pressureModifier } : null,
      pressureHordeIndex: this.pressureHordeIndex ?? null,
      militiaConfig: this.militiaConfig ? { ...this.militiaConfig } : null,
      slotFavor: cloneSlotFavor(this.slotFavor),
      contractDurationMs: this.contractDurationMs ?? null,
      completionBonusMoney: this.completionBonusMoney ?? 0,
      marketPrices: this._marketPrices ? { ...this._marketPrices } : null,
      marketSoldIds: this._marketSoldIds ? Array.from(this._marketSoldIds) : null,
      moneyCost: this.moneyCost ?? 0,
      permitCost: this.permitCost ?? 0,
      placedObjects: (this.placedObjects || [])
        .filter((obj) => obj && obj.active !== false)
        .map((obj) => ({
          kind: obj.resourceTileType?.name
            || obj.tileType?.name
            || (obj.enemyType ? "spawner" : null),
          x: Number(obj.gridX ?? obj.x ?? obj.tilePos?.tileX ?? 0),
          y: Number(obj.gridY ?? obj.y ?? obj.tilePos?.tileY ?? 0),
          health: Number(obj.health ?? obj.hp ?? 0),
          maxHealth: Number(obj.maxHealth ?? obj.maxHp ?? 0),
          moneyReward: Number(obj.moneyReward ?? 0),
          moneyRewardRemaining: Number(obj.moneyRewardRemaining ?? obj.moneyReward ?? 0),
          quotaRemaining: Number(obj.quotaRemaining ?? 0),
          aliveCount: Number(obj.aliveCount ?? 0),
          intervalMs: Number(obj.intervalMs ?? 0),
          enemyType: obj.enemyType ?? null,
          enemyMods: obj.enemyMods ? { ...obj.enemyMods } : null,
          enemyTypeLabel: obj.enemyTypeLabel ?? null,
          modifierKey: obj.modifierKey ?? null,
          modifierLabel: obj.modifierLabel ?? null,
          maxAmmo: Number.isFinite(Number(obj.maxAmmo)) ? Number(obj.maxAmmo) : null,
          ammoRemaining: Number.isFinite(Number(obj.ammoRemaining)) ? Number(obj.ammoRemaining) : null,
          destroyed: !!obj._destroyed,
          isTemporaryMilitia: !!obj.isTemporaryMilitia,
        })),
    };
  }

  restoreSnapshot(saved = null) {
    if (!saved) return;
    this.expireAt = saved.expireAt ?? this.expireAt;
    this.spawned = Number(saved.spawned ?? this.spawned ?? 0);
    this.killed = Number(saved.killed ?? this.killed ?? 0);
    this.totalPlannedEnemies = Number(saved.totalPlannedEnemies ?? this.totalPlannedEnemies ?? 0);
    this.enemyType = saved.enemyType ?? this.enemyType;
    this.enemyTypeLabel = saved.enemyTypeLabel ?? this.enemyTypeLabel;
    this.spawnerCount = Number(saved.spawnerCount ?? this.spawnerCount ?? 0);
    this.permitCost = Number(saved.permitCost ?? this.permitCost ?? 0);
    this.moneyCost = Number(saved.moneyCost ?? this.moneyCost ?? 0);
    this._marketPrices = saved.marketPrices ? { ...saved.marketPrices } : this._marketPrices;
    this._marketSoldIds = new Set(Array.isArray(saved.marketSoldIds) ? saved.marketSoldIds : []);
    this.militiaConfig = saved.militiaConfig ? { ...saved.militiaConfig } : this.militiaConfig;
    this.slotFavor = cloneSlotFavor(saved.slotFavor ?? this.slotFavor);
    this.contractDurationMs = Number(saved.contractDurationMs ?? this.contractDurationMs ?? 0) || null;
    if (this.type === "MILITIA") {
      const militiaMs = this._getMilitiaDurationMs(this.contractDurationMs);
      this.contractDurationMs = militiaMs;
      const savedExpireAt = Number(saved.expireAt ?? 0);
      const simNow = this._getSimulationNowMs();
      this.expireAt = Number.isFinite(savedExpireAt) && savedExpireAt > 0 && savedExpireAt < 10_000_000
        ? Math.min(savedExpireAt, simNow + militiaMs)
        : simNow + militiaMs;
    }
    this.completionBonusMoney = Math.max(0, Number(saved.completionBonusMoney ?? this.completionBonusMoney ?? 0));
    this.pressureModifier = saved.pressureModifier ? { ...saved.pressureModifier } : this.pressureModifier;
    this.pressureModifierKey = saved.pressureModifierKey ?? this.pressureModifierKey;
    this.pressureOwnerTower = saved.pressureOwnerTower ?? this.pressureOwnerTower;
    this.pressureHordeIndex = saved.pressureHordeIndex ?? this.pressureHordeIndex;
    this.pressureSource = saved.pressureSource ?? this.pressureSource;

    if (this.type === "PRESSURE") {
      const spawnerSnapshots = Array.isArray(saved.placedObjects) ? saved.placedObjects.filter((entry) => entry.kind === "spawner") : [];
      this.spawners = [];
      this.placedObjects = [];
      for (const entry of spawnerSnapshots) {
        const spawner = this.pm.spawnSpawnerBuilding({
          gx: entry.x,
          gy: entry.y,
          contractId: this.id,
          plannedEnemies: entry.quotaRemaining,
          spawnIntervalMs: entry.intervalMs,
          enemyType: entry.enemyType || this.enemyType,
          enemyMods: entry.enemyMods || this.pressureModifier,
          enemyTypeLabel: entry.enemyTypeLabel || this.enemyTypeLabel,
          modifierKey: entry.modifierKey || this.pressureModifierKey,
          modifierLabel: entry.modifierLabel || this.pressureModifier?.label || null,
        });
        if (!spawner) continue;
        spawner.hp = Number(entry.health ?? spawner.hp ?? 0);
        spawner.maxHp = Number(entry.maxHealth ?? spawner.maxHp ?? 0);
        spawner.quotaRemaining = Number(entry.quotaRemaining ?? spawner.quotaRemaining ?? 0);
        spawner.aliveCount = Number(entry.aliveCount ?? spawner.aliveCount ?? 0);
        spawner._updateCounter?.();
        this.spawners.push({ building: spawner });
        this.placedObjects.push(spawner);
      }
      this._startUITick();
      this._setHudLifecycle("active");
      return;
    }

    if (this.type === "FOREST" || this.type === "ROCK") {
      this._markParcelWaterWalkable();
      const entries = Array.isArray(saved.placedObjects) ? saved.placedObjects : [];
      this.placedObjects = [];
      for (const entry of entries) {
        let tileType = TILE_TYPES.rock;
        if (entry.kind === "pine") tileType = TILE_TYPES.pine;
        else if (entry.kind === "goldOre") tileType = TILE_TYPES.goldOre;
        const obj = GameMap.handleLoadNonSpread(entry.x, entry.y, tileType);
        if (!obj) continue;
        obj.contractId = this.id;
        obj.slotId = this.slotId;
        obj.health = Number(entry.health ?? obj.health ?? 0);
        obj.applyBlockDamage?.(obj.health);
        if (tileType === TILE_TYPES.goldOre) {
          obj.moneyReward = Math.max(0, Number(entry.moneyReward || obj.moneyReward || getGoldOrePayout(this.scene)));
          obj.moneyRewardRemaining = Math.max(0, Number(entry.moneyRewardRemaining ?? obj.moneyRewardRemaining ?? obj.moneyReward));
        }
        if (tileType === TILE_TYPES.pine) GameMap.worldPines.push(obj);
        else GameMap.worldStones.push(obj);
        this.placedObjects.push(obj);
      }
      this._startUITick();
      const remaining = Math.max(0, Number(this.expireAt || 0) - this._getSimulationNowMs());
      this.timerEvent = this.scene.time.delayedCall(remaining, () => this.complete("timeout"), null, this);
      this._setHudLifecycle("active");
      return;
    }

    if (this.type === "FARM") {
      this._markParcelWaterWalkable();
      FarmBushNode.init(this.scene);
      const entries = Array.isArray(saved.placedObjects) ? saved.placedObjects : [];
      this.placedObjects = [];
      for (const entry of entries) {
        const kind = String(entry.kind || "").startsWith("berry") ? "berry" : "seed";
        const obj = new FarmBushNode(entry.x, entry.y, kind);
        obj.contractId = this.id;
        obj.slotId = this.slotId;
        obj.health = Number(entry.health ?? obj.health ?? 0);
        this.placedObjects.push(obj);
      }
      this._startUITick();
      const remaining = Math.max(0, Number(this.expireAt || 0) - this._getSimulationNowMs());
      this.timerEvent = this.scene.time.delayedCall(remaining, () => this.complete("timeout"), null, this);
      this._setHudLifecycle("active");
      return;
    }

    if (this.type === "MILITIA") {
      const militiaSnapshots = Array.isArray(saved.placedObjects)
        ? saved.placedObjects.filter((entry) => entry?.kind === "turret" || entry?.kind === "catapult")
        : null;
      this._spawnMilitiaFormation(militiaSnapshots);
      this._startUITick();
      const remaining = Math.max(0, Number(this.expireAt || 0) - this._getSimulationNowMs());
      this.timerEvent = this.scene.time.delayedCall(remaining, () => this.complete("timeout"), null, this);
      this._setHudLifecycle("active");
      this._startMilitiaDefenseMonitor();
      return;
    }

    if (this.type === "MARKET") {
      this._paintMarketParcel();
      const cx = (this.origin.x + PARCEL_SIZE / 2) * SQUARESIZE;
      const cy = (this.origin.y + PARCEL_SIZE / 2) * SQUARESIZE;
      const remaining = Math.max(0, Number(this.expireAt || 0) - this._getSimulationNowMs());
      this._startUITick();
      this._marketHandle = spawnParcelMarketStorefront(this.scene, {
        origin: this.origin,
        parcelCenterWorld: { x: cx, y: cy },
        slotId: this.slotId,
        teamNumber: 1,
        durationMs: remaining,
        prices: this._marketPrices || this.scene?.getRunMarketPriceTable?.(DEFAULT_MARKET_PRICES) || buildMarketPriceTable(this.scene, DEFAULT_MARKET_PRICES),
        soldIds: this._marketSoldIds,
        onSoldIdsChanged: (nextSoldIds = []) => {
          this._marketSoldIds = new Set(nextSoldIds);
        },
        onPricesChanged: (nextPrices = {}) => {
          this._marketPrices = { ...nextPrices };
        },
      });
      this.timerEvent = this.scene.time.delayedCall(remaining, () => {
        const handle = this._marketHandle;
        if (handle?.depart) handle.depart(() => this.complete("timeout"));
        else this.complete("timeout");
      }, null, this);
      this._setHudLifecycle("active");
    }
  }

  onRaiderSpawned() {
    this.spawned++;
    this.pm.onContractProgressChanged?.(this);
  }

  onRaiderKilled() {
    this.killed++;
    this.pm.onContractProgressChanged?.(this);

    if (
      this.type === "PRESSURE" &&
      this.spawned >= this.totalPlannedEnemies &&
      this.killed >= this.totalPlannedEnemies
    ) {
      this.complete("cleared");
    }
  }

  onSpawnerDestroyed(unspawnedCount) {
    if (this._completed) return;
    if (this.type !== "PRESSURE") return;

    const n = Math.max(0, unspawnedCount | 0);

    this.spawned += n;
    this.killed += n;

    this.pm.onContractProgressChanged?.(this);

    const allDead = this.spawners?.length
      ? this.spawners.every((s) => !s?.building || s.building._destroyed === true)
      : true;

    if (allDead) {
      this.complete("spawners_destroyed");
    }
  }

  complete(reason) {
    if (this._completionPromise) return this._completionPromise;
    if (this._completed) return this._completionPromise;
    this._completed = true;
    this._setHudLifecycle("leaving");

    if (this.timerEvent) {
      this.timerEvent.remove(false);
      this.timerEvent = null;
    }

    this._stopUITick();
    this._stopMilitiaDefenseMonitor();

    this._disablePlacedObjectInteractions();

    this._completionPromise = this._completeWithRemovalAnimation(reason);
    return this._completionPromise;
  }

  _abortResourceWorkAfterRemovalCommitted() {
    if (this._resourceWorkCleanupDone) return;
    if (this.type !== "FOREST" && this.type !== "ROCK" && this.type !== "FARM") return;

    this._resourceWorkCleanupDone = true;
    blockResourceManager.abortParcelResourceWork({
      teamNumber: 1,
      contractId: this.id,
      slotId: this.slotId,
      contractType: this.type,
      origin: this.origin,
      size: PARCEL_SIZE,
    });
  }

  _shouldGrantCompletionBonus(reason) {
    if (this._completionBonusGranted) return false;
    if (this.completionBonusMoney <= 0) return false;
    return reason !== "external_cleanup" && reason !== "stage_end_cleanup";
  }

  async _completeWithRemovalAnimation(reason) {
    const removalPlan = this._buildParcelWaterPlan();
    const futureNav = this._buildRemovalNavGrids(removalPlan);
    let reveal = null;
    let navDone = false;

    const navPromise = this.scene?.prepareParcelNavMeshesAsync
      ? this.scene.prepareParcelNavMeshesAsync(futureNav)
          .catch((err) => {
            console.warn("Parcel removal navmesh async prep failed; falling back to local refresh.", err);
            return null;
          })
          .then((result) => {
            navDone = true;
            return result;
          })
      : Promise.resolve(null).then((result) => {
          navDone = true;
          return result;
        });

    try {
      reveal = new ParcelRevealAnimator(this.scene, {
        cells: removalPlan.cells,
        slotId: this.slotId,
        size: PARCEL_SIZE,
        alpha: 0.5,
        batchSize: 8,
        batchDelayMs: 12,
      });

      await reveal.play();
      if (!navDone) reveal.pulseWaiting();
      const navResult = await navPromise;
      reveal.stopPulse();

      const commitBaseRevision = GameMap.getNavGridRevision?.() ?? 0;
      this._removalCommitted = true;
      this._applyWaterRemovalPlan(removalPlan);
      this._destroyPlacedObjectsForRemoval();
      this._clearVisibilitySourcesInParcelBounds();
      this._abortResourceWorkAfterRemovalCommitted();

      const refreshOpts = {
        waterSourceUpdate: {
          excludeParcelId: this.id,
        },
        forceOverviewRebuild: this.scene?.zoomMixer?.mode === "overview",
      };
      const refreshHandled = !!(navResult && this.scene?.applyPreparedNavMeshes?.({
        navPolys: navResult.navPolys,
        enemyPolys: navResult.enemyPolys,
        navGrid: futureNav.navGrid,
        enemyNavGrid: futureNav.enemyNavGrid,
        navGridRevision: navResult.navGridRevision ?? futureNav.navGridRevision,
        commitBaseRevision,
        bounds: this.getParcelBounds?.(),
        refreshOpts,
      }));

      if (!refreshHandled) {
        this._fallbackRefreshRemovalArea();
      }

      await reveal.complete({ holdMs: 45, darkenMs: 170 });
    } catch (err) {
      console.error("Animated parcel removal failed; falling back to immediate removal.", err);
      reveal?.destroy?.();

      if (!this._removalCommitted) {
        this._removalCommitted = true;
        this._applyWaterRemovalPlan(removalPlan);
        this._destroyPlacedObjectsForRemoval();
        this._clearVisibilitySourcesInParcelBounds();
        this._abortResourceWorkAfterRemovalCommitted();
      }
      if (this._removalCommitted) {
        this._clearVisibilitySourcesInParcelBounds();
        this._abortResourceWorkAfterRemovalCommitted();
      }
      this._fallbackRefreshRemovalArea();
    }

    if (this._shouldGrantCompletionBonus(reason)) {
      this._completionBonusGranted = true;
      this.scene?.updateMoney?.(this.completionBonusMoney);
    }

    GameMap._uiIgnoreWorldLayer();
    this.pm.removeContract(this.slotId, this.id, reason);
  }
}
