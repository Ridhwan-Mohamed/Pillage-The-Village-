import { PARCEL, SQUARESIZE, TILE_MAP, TILE_TYPES } from "../constants.js";
import { bindDebugHotkey } from "../debug/DebugHotkeys.js";
import { QuadtreeNode } from "./QuadTreeNode.js";

const SOURCE_DEBUG_TOGGLE_KEY = "I";
const LAND_PARCEL_TYPES = new Set(["FOREST", "ROCK", "FARM", "PRESSURE"]);
const CARDINAL_DIRS = [
  [0, 1],
  [1, 0],
  [-1, 0],
  [0, -1],
];

function isWalkable(tile) {
  if (isWater(tile)) return false;
  if (Array.isArray(tile)) {
    return !TILE_TYPES[TILE_MAP(tile[tile.length - 1])]?.block;
  }
  return !TILE_TYPES[TILE_MAP(tile)]?.block;
}

function isWater(tile) {
  if (Array.isArray(tile)) {
    return tile.some((value) => TILE_MAP(value) === "water");
  }
  return TILE_MAP(tile) === "water";
}

function tileKey(x, y) {
  return `${x},${y}`;
}

function tileCenterWorld(x, y) {
  return {
    x: x * SQUARESIZE + SQUARESIZE / 2,
    y: y * SQUARESIZE + SQUARESIZE / 2,
  };
}

function normalizeBounds(grid, bounds) {
  if (!Array.isArray(grid) || !Array.isArray(grid[0]) || !bounds) return null;

  const explicitMinX = Number(bounds.minX);
  const explicitMinY = Number(bounds.minY);
  const explicitMaxX = Number(bounds.maxX);
  const explicitMaxY = Number(bounds.maxY);

  let minX = Number(bounds.x);
  let minY = Number(bounds.y);
  let width = Number(bounds.width ?? bounds.w);
  let height = Number(bounds.height ?? bounds.h);

  if (Number.isFinite(explicitMinX) && Number.isFinite(explicitMaxX)) {
    minX = explicitMinX;
    width = explicitMaxX - explicitMinX + 1;
  }
  if (Number.isFinite(explicitMinY) && Number.isFinite(explicitMaxY)) {
    minY = explicitMinY;
    height = explicitMaxY - explicitMinY + 1;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  if (width <= 0 || height <= 0) return null;

  const maxGridX = grid[0].length - 1;
  const maxGridY = grid.length - 1;
  const clampedMinX = Math.max(0, minX);
  const clampedMinY = Math.max(0, minY);
  const clampedMaxX = Math.min(maxGridX, minX + width - 1);
  const clampedMaxY = Math.min(maxGridY, minY + height - 1);

  if (clampedMaxX < clampedMinX || clampedMaxY < clampedMinY) return null;

  return {
    minX: clampedMinX,
    minY: clampedMinY,
    maxX: clampedMaxX,
    maxY: clampedMaxY,
    width: clampedMaxX - clampedMinX + 1,
    height: clampedMaxY - clampedMinY + 1,
  };
}

class WaterSourceDebugDrawer {
  constructor(scene, sourceIndex, opts = {}) {
    this.scene = scene;
    this.sourceIndex = sourceIndex;
    this.toggleKey = opts.toggleKey ?? SOURCE_DEBUG_TOGGLE_KEY;
    this.depth = opts.depth ?? 121;
    this.enabled = false;
    this.graphics = null;
    this._bindKey();
  }

  _bindKey() {
    this._onToggle = () => {
      this.enabled = !this.enabled;
      if (this.enabled) this.draw();
      else this.clear();
    };

    this._debugHotkey = bindDebugHotkey(this.scene, this.toggleKey, this._onToggle);
  }

  destroy() {
    this._debugHotkey?.destroy?.();
    this._debugHotkey = null;
    this._onToggle = null;
    this.clear();
  }

  markDirty() {
    if (this.enabled) this.draw();
  }

  clear() {
    this.graphics?.destroy?.();
    this.graphics = null;
  }

  draw() {
    this.clear();
    if (!this.scene?.add) return;

    const points = this.sourceIndex.getPoints();
    const graphics = this.scene.add.graphics().setDepth(this.depth);
    graphics.lineStyle(1, 0x9fe7ff, 0.9);
    graphics.fillStyle(0x38bdf8, 0.28);

    for (const point of points) {
      const worldX = point.x * SQUARESIZE;
      const worldY = point.y * SQUARESIZE;
      graphics.fillRect(worldX, worldY, SQUARESIZE, SQUARESIZE);
      graphics.strokeRect(worldX + 1, worldY + 1, SQUARESIZE - 2, SQUARESIZE - 2);
    }

    this.graphics = graphics;
  }
}

export class WaterSourceIndex {
  constructor(scene, grid, opts = {}) {
    this.scene = scene ?? null;
    this.grid = grid ?? [];
    this.regionSystem = opts.regionSystem ?? null;
    this.pointsByKey = new Map();
    this.regionTrees = new Map();
    this.regionPoints = new Map();
    this.globalTree = null;
    this._regionIndexDirty = true;
    this.debugDrawer = this.scene ? new WaterSourceDebugDrawer(this.scene, this, opts.debug ?? {}) : null;
  }

  setGrid(grid) {
    if (grid === this.grid) return;
    this.grid = grid ?? [];
    this._regionIndexDirty = true;
  }

  setRegionSystem(regionSystem) {
    if (regionSystem === this.regionSystem) return;
    this.regionSystem = regionSystem ?? null;
    this._regionIndexDirty = true;
  }

  getPoints() {
    return Array.from(this.pointsByKey.values());
  }

  rebuildAll(opts = {}) {
    this.pointsByKey.clear();
    if (!Array.isArray(this.grid) || !Array.isArray(this.grid[0])) {
      this._rebuildSpatialIndex();
      return;
    }

    const ownedBounds = this._collectOwnedLandBounds(opts);
    for (const bounds of ownedBounds) {
      this._addBoundsSources(bounds);
    }

    this._rebuildSpatialIndex();
  }

  refreshBounds(opts = {}) {
    this.rebuildAll(opts);
  }

  refreshForParcel(bounds, opts = {}) {
    this.rebuildAll(opts);
  }

  nearest(x, y, maxDist = Infinity) {
    this._ensureRegionIndex();
    const queryRegionId = this._getRegionIdForTile(x, y);
    if (queryRegionId !== -1) {
      return this.regionTrees.get(queryRegionId)?.nearest(x, y, maxDist) ?? null;
    }
    return this.globalTree?.nearest(x, y, maxDist) ?? null;
  }

  destroy() {
    this.debugDrawer?.destroy?.();
    this.debugDrawer = null;
    this.pointsByKey.clear();
    this.regionTrees.clear();
    this.regionPoints.clear();
    this.globalTree = null;
  }

  _collectOwnedLandBounds(opts = {}) {
    const bounds = [];
    const mainOrigin = this.scene?.parcelManager?.mainIslandOrigin ?? PARCEL.MAIN_ORIGIN;
    const mainBounds = normalizeBounds(this.grid, {
      x: mainOrigin?.x ?? PARCEL.MAIN_ORIGIN.x,
      y: mainOrigin?.y ?? PARCEL.MAIN_ORIGIN.y,
      w: PARCEL.SIZE,
      h: PARCEL.SIZE,
    });
    if (mainBounds) bounds.push(mainBounds);

    const contracts = this.scene?.parcelManager?.contractsById?.values?.();
    if (!contracts) return bounds;

    for (const inst of contracts) {
      if (opts.excludeParcelId && inst?.id === opts.excludeParcelId) continue;
      const type = String(inst?.type || "").toUpperCase();
      if (!LAND_PARCEL_TYPES.has(type)) continue;
      const parcelBounds = normalizeBounds(this.grid, inst?.getParcelBounds?.());
      if (parcelBounds) bounds.push(parcelBounds);
    }

    return bounds;
  }

  _addBoundsSources(bounds) {
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        this._tryAddSourceTile(x, y);
      }
    }
  }

  _tryAddSourceTile(x, y) {
    const row = this.grid?.[y];
    const tile = row?.[x];
    if (tile == null || !isWalkable(tile)) return;

    for (const [dx, dy] of CARDINAL_DIRS) {
      if (isWater(this.grid?.[y + dy]?.[x + dx])) {
        const key = tileKey(x, y);
        const point = this.pointsByKey.get(key) ?? { x, y };
        point.x = x;
        point.y = y;
        this.pointsByKey.set(key, point);
        return;
      }
    }
  }

  _rebuildSpatialIndex() {
    this._regionIndexDirty = true;
    this._ensureRegionIndex();
    this.debugDrawer?.markDirty?.();
  }

  _ensureRegionIndex() {
    if (!this._regionIndexDirty && !this.regionSystem?.dirty) return;

    const width = Array.isArray(this.grid?.[0]) ? this.grid[0].length : 0;
    const height = Array.isArray(this.grid) ? this.grid.length : 0;
    const bounds = { x: 0, y: 0, width, height };

    this.globalTree = new QuadtreeNode(bounds);
    this.regionTrees.clear();
    this.regionPoints.clear();

    this.regionSystem?.ensureUpToDate?.();

    for (const point of this.pointsByKey.values()) {
      point.regionId = this._getRegionIdForTile(point.x, point.y);
      this.globalTree.insert(point);

      if (point.regionId === -1) continue;

      let regionTree = this.regionTrees.get(point.regionId);
      if (!regionTree) {
        regionTree = new QuadtreeNode(bounds);
        this.regionTrees.set(point.regionId, regionTree);
      }
      regionTree.insert(point);

      const points = this.regionPoints.get(point.regionId) ?? [];
      points.push(point);
      this.regionPoints.set(point.regionId, points);
    }

    this._regionIndexDirty = false;
  }

  _getRegionIdForTile(x, y) {
    if (!this.regionSystem?.getRegionIdForWorldPoint) return -1;
    const world = tileCenterWorld(x, y);
    return this.regionSystem.getRegionIdForWorldPoint(world.x, world.y);
  }
}

export function buildWaterQuadtree(sceneOrGrid, opts = {}) {
  const scene = Array.isArray(sceneOrGrid) ? opts.scene ?? null : sceneOrGrid ?? null;
  const grid = Array.isArray(sceneOrGrid) ? sceneOrGrid : (opts.grid ?? sceneOrGrid?.gridData ?? []);
  const waterSources = new WaterSourceIndex(scene, grid, opts);
  waterSources.rebuildAll();
  return waterSources;
}
