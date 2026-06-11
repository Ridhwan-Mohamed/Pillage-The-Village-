// WallPlacementController.js
import Phaser from "phaser";
import { SQUARESIZE, WORLD_DIMENSIONX, WORLD_DIMENSIONY, TILE_TYPES, UIDEPTH, showAlert } from "../constants";
import { Map } from "../map";
import { buildingManager } from "../Manager/buildingManager";
import { Player } from "../players/Player";
import { TILE_ARR, TILE_MAP } from "../constants";
import wall_interior from "url:../assets/wall/stone_interior.png";
import wall_edge from "url:../assets/wall/stone_edge.png";
import wall_corner from "url:../assets/wall/stone_corner.png";
import woodWall_interior from "url:../assets/wall/woodWall_interior.png";
import woodWall_edge from "url:../assets/wall/woodWall_edge.png";
import woodWall_corner from "url:../assets/wall/woodWall_corner.png";
import stone_door from "url:../assets/wall/stone_door.png";
import wood_door from "url:../assets/wall/woodWall_door.png";
import { AudioManager } from "../Manager/AudioManager";
import { VisibilitySystem } from "../UI/VisibilitySystem";
import { Map as GameMap } from "../map";

const FINALIZE_BUTTON_WIDTH = 172;
const FINALIZE_BUTTON_HEIGHT = 46;

function normalizeCostBundle(rawCost) {
  if (rawCost == null) return {};
  if (typeof rawCost === "number") {
    const amount = Math.max(0, Number(rawCost) || 0);
    return amount > 0 ? { money: amount } : {};
  }
  if (typeof rawCost !== "object") return {};

  const cost = {};
  for (const [resourceKey, rawAmount] of Object.entries(rawCost)) {
    const amount = Math.max(0, Number(rawAmount) || 0);
    if (!(amount > 0)) continue;
    cost[resourceKey] = Math.max(0, Number(cost[resourceKey] || 0)) + amount;
  }
  return cost;
}

function mergeCostBundle(total, cost) {
  for (const [resourceKey, amount] of Object.entries(cost || {})) {
    total[resourceKey] = Math.max(0, Number(total[resourceKey] || 0)) + amount;
  }
}

function formatMissingCostMessage(missing) {
  if (!Array.isArray(missing) || !missing.length) return "Not enough materials";
  const parts = missing.map((item) => `${Math.ceil(Number(item.missing) || 0)} ${item.label || item.key}`);
  return `Need ${parts.join(", ")}`;
}

export class WallPlacementController {
  constructor(scene) {
    this.scene = scene;

    this.segments = []; 
    // each: { start:{x,y}, end:{x,y}, cells:[{x,y}...] } (cells excludes start if you want)
    this.segmentStart = null; // {x,y} when phase === 1

    this.active = false;
    this.wallTypeName = "wall";   // "wall" or "woodWall"
    this.consumeNextClick = false;

    this.pivots = [];             // [{x,y}]
    this.committedCells = [];     // cells locked in by prior clicks (all segments except current preview)
    this.previewCells = [];       // live segment cells under mouse

    this.previewSprites = [];     // pooled sprites for ghost
    this.previewContainer = null;

    this.ui = null;               // container for phase text + finalize button
    this.phase = 0;               // 0 = not started, 1 = have start pivot
    this._lastGhostQueuedCount = null;

    this.lastAxis = null;         // "x" or "y" (for “best linear” preference)
    this._initDoorPhysicsOnce(); // ✅ only needs to happen once per scene
  }

_initDoorPhysicsOnce() {
  const scene = this.scene;

  if (scene.__doorsPhysicsInited) return;
  if (scene.__doorPostUpdateHandler) {
    scene.events.off("postupdate", scene.__doorPostUpdateHandler);
    scene.__doorPostUpdateHandler = null;
  }
  scene.doorGroup?.destroy?.(true);
  scene.__doorsPhysicsInited = true;

  // ✅ one static group for all doors
  scene.doorGroup = scene.physics.add.staticGroup();

  // ✅ one overlap callback for all characters vs all doors
  // NOTE: Player.characters must be a physics group (Arcade).
  scene.physics.add.overlap(
    Player.characters,
    scene.doorGroup,
    (_character, doorSprite) => {
      // mark touched this frame (for open)
      doorSprite.__touchedThisFrame = true;
    },
    null,
    scene
  );

  const iterateDoors = (callback) => {
    const children = scene.doorGroup?.children;
    if (!children) return;

    if (typeof children.iterate === "function") {
      children.iterate(callback);
      return;
    }

    if (typeof children.getArray === "function") {
      children.getArray().forEach(callback);
      return;
    }

    if (Array.isArray(children.entries)) {
      children.entries.forEach(callback);
    }
  };

  // ✅ postupdate: open if touched, else close
  scene.__doorPostUpdateHandler = () => {
    if (!scene.doorGroup) return;

    iterateDoors((door) => {
      if (!door || !door.active) return;

      const shouldOpen = !!door.__touchedThisFrame;
      const wasOpen = !!door.__isOpen;

      // only do work if state changes
      if (shouldOpen !== wasOpen) {
        door.__isOpen = shouldOpen;

        // swap frame: 0 closed, 1 open
        door.setFrame(shouldOpen ? 1 : 0);

        // throttle per-door to avoid spam on jittery overlaps
        const now = scene.time.now;
        if (door.__nextDoorSfxAt == null) door.__nextDoorSfxAt = 0;

        if (now >= door.__nextDoorSfxAt) {
          if (shouldOpen) AudioManager.playWorldSound("sfx_door_open", { volume: 0.26 });
          else AudioManager.playWorldSound("sfx_door_close", { volume: 0.26 });

          door.__nextDoorSfxAt = now + 140; // ms; tune
        }
      }

      door.__touchedThisFrame = false;
    });
  };

  scene.events.on("postupdate", scene.__doorPostUpdateHandler);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    if (scene.__doorPostUpdateHandler) {
      scene.events.off("postupdate", scene.__doorPostUpdateHandler);
      scene.__doorPostUpdateHandler = null;
    }
    scene.doorGroup?.destroy?.(true);
    scene.doorGroup = null;
    scene.__doorsPhysicsInited = false;
  });
}

  start(wallTypeName) {
    buildingManager.clearQueuedWallJobSelection?.(1);
    this.segments = [];
    this.segmentStart = null;
    this.active = true;
    this.wallTypeName = wallTypeName; // "wall" or "woodWall"
    this.committedDoors = [];
      this.orderedBuildTiles = []; // ✅ walls + doors in the order you want built

    this.consumeNextClick = false;
    this.pivots = [];
    this.committedCells = [];
    this.previewCells = [];
    this.phase = 0;
    this._lastGhostQueuedCount = null;
    this.lastAxis = null;

    if (!this.previewContainer) {
      this.previewContainer = this.scene.add.container(0, 0).setDepth(9999);
    } else {
      this.previewContainer.removeAll(true);
    }
    this.previewSprites = [];

    this._ensureUI();
    this._setPhase1Text(true, 0);
    this._updateFinalizeEnabled(false);
  }

  static preload(scene){
    // Preload any assets needed for wall preview ghosts
    this.scene = scene;
    scene.load.spritesheet('wall_interior', wall_interior, { frameWidth: SQUARESIZE, frameHeight: SQUARESIZE });
    scene.load.spritesheet('wall_edge', wall_edge, { frameWidth: SQUARESIZE, frameHeight: SQUARESIZE });
    scene.load.spritesheet('wall_corner', wall_corner, { frameWidth: SQUARESIZE, frameHeight: SQUARESIZE });
    scene.load.spritesheet('wall_door', stone_door, { frameWidth: SQUARESIZE, frameHeight: SQUARESIZE });
    scene.load.spritesheet('woodWall_interior', woodWall_interior, { frameWidth: SQUARESIZE, frameHeight: SQUARESIZE });
    scene.load.spritesheet('woodWall_edge', woodWall_edge, { frameWidth: SQUARESIZE, frameHeight: SQUARESIZE });
    scene.load.spritesheet('woodWall_corner', woodWall_corner, { frameWidth: SQUARESIZE, frameHeight: SQUARESIZE });
    scene.load.spritesheet('woodWall_door', wood_door, { frameWidth: SQUARESIZE, frameHeight: SQUARESIZE });
  }

  stop() {
    buildingManager.clearQueuedWallJobSelection?.(1);
    this.segmentStart = null;
    this.committedDoors = [];
    this.orderedBuildTiles = [];
    this.active = false;
    this.phase = 0;
    this.pivots = [];
    this.committedCells = [];
    this.previewCells = [];
    this.lastAxis = null;
    this._lastGhostQueuedCount = null;

    if (this.previewContainer) this.previewContainer.removeAll(true);
    this.previewSprites = [];

    if (this.ui) this.ui.setVisible(false);
  }

  // ESC behavior:
  // - if we have >=2 pivots: remove last segment (go back one pivot)
  // - else: exit mode completely
  onEsc() {
    if (!this.active) return;

    // If we are mid-segment (picked a start but haven't ended it), cancel that start
    if (this.phase === 1) {
        this.segmentStart = null;
        this.phase = 0;
        this.previewCells = [];
        this._setPhase1Text(true, this._queuedCount());
        this._redrawGhost(true);
        return;
    }

    // Otherwise, remove last completed segment if any
    if (this.segments.length > 0) {
        const last = this.segments.pop();

        const killWalls = new Set(last.walls.map(c => `${c.x},${c.y}`));
        this.committedCells = this.committedCells.filter(c => !killWalls.has(`${c.x},${c.y}`));

        const killDoors = new Set(last.doors.map(c => `${c.x},${c.y}`));
        this.committedDoors = (this.committedDoors || []).filter(c => !killDoors.has(`${c.x},${c.y}`));

        if (this.orderedBuildTiles?.length) {
          const kill = new Set([
            ...last.walls.map(c => `${c.x},${c.y}`),
            ...last.doors.map(c => `${c.x},${c.y}`),
          ]);

          // remove ONLY tiles that belong to that segment
          this.orderedBuildTiles = this.orderedBuildTiles.filter(t => !kill.has(`${t.x},${t.y}`));
        }

        this._updateFinalizeEnabled(this._queuedCount() > 0);
        this._setPhase1Text(true, this._queuedCount());
        this._redrawGhost(true);
        return;
    }

    // nothing to undo → exit mode
    this.stop();
  }

  onPointerMove(pointer) {
    if (!this.active) return;

    if (this._updateFinalizeHover(pointer)) {
      return;
    }

    const g = this._pointerToGrid(pointer);
    if (!g) return;

    // Phase 0: hover a single potential START tile
    if (this.phase === 0) {
        const ok = this._canUseSegmentPivot(g.x, g.y);
        this._setPhase1Text(ok, this._queuedCount());
        this.previewCells = [{ x: g.x, y: g.y }];
        this._redrawGhost(ok);
        return;
    }

    // Phase 1: preview segment from segmentStart -> mouse
    const seg = this._strictLineSegment(this.segmentStart, g);
    if (!seg) {
        // show invalid preview (single tile or nothing)
        this.previewCells = [];
        this._setPhase2Text(false, this._queuedCount([]));
        this._redrawGhost(false);
        return;
    }
    const analysis = this._analyzeSegment(seg);
    const ok = analysis.valid;
    this.previewCells = seg;
    this._setPhase2Text(ok, this._queuedCount(analysis.buildableCells));
    this._redrawGhost(ok);
}

  onClick(pointer) {
    if (!this.active) return;

    if (this.consumeNextClick) {
        this.consumeNextClick = false;
        return;
    }

    if (this._handleFinalizePointer(pointer)) {
      return;
    }

    const g = this._pointerToGrid(pointer);
    if (!g) return;

    // Phase 0: pick START of a new segment
    if (this.phase === 0) {
        if (!this._canUseSegmentPivot(g.x, g.y)) return;

        this.segmentStart = { x: g.x, y: g.y };
        this.phase = 1;

        // show phase 2 prompt; preview will update on move
        this._setPhase2Text(true, this._queuedCount([]));
        this._updateFinalizeEnabled(this._queuedCount() > 0);
        return;
    }

    // Phase 1: click ends current segment (commit it)
// Phase 1: click ends current segment (commit it)
const seg = this._strictLineSegment(this.segmentStart, g);
if (!seg || seg.length < 1) return;
const analysis = this._analyzeSegment(seg);
if (!analysis.valid) return;

let doorCell = null;
let wallCells = analysis.buildableCells;
let doorsForSegment = [];

const doorTypeName =
  this._doorTypeName();

doorCell = this._pickDoorCell(seg, analysis.buildableCells);

if (doorCell) {
  doorsForSegment = [doorCell];
  wallCells = analysis.buildableCells.filter((cell) => !(cell.x === doorCell.x && cell.y === doorCell.y));

  this.committedDoors = this.committedDoors || [];
  const angle = this._segmentDoorAngle(seg, doorCell);
  this.committedDoors.push({ x: doorCell.x, y: doorCell.y, angle });
}

this.committedCells.push(...wallCells);

// enqueue IN ORDER (door interleaved)
for (const c of seg) {
  const isBuildable = analysis.buildableCells.some((cell) => cell.x === c.x && cell.y === c.y);
  if (!isBuildable) continue;
  const isDoorHere = !!doorCell && c.x === doorCell.x && c.y === doorCell.y;
  this.orderedBuildTiles.push({
    x: c.x,
    y: c.y,
    buildTypeName: isDoorHere ? doorTypeName : this.wallTypeName,
  });
}


    // record segment so ESC can pop exactly this segment
    this.segments.push({
      start: { ...this.segmentStart },
      end: { x: g.x, y: g.y },
      walls: wallCells,
      doors: doorsForSegment,
    });

    // IMPORTANT: end segment AND return to phase 0 (next click starts a new segment anywhere)
    this.segmentStart = null;
    this.phase = 0;
    this.previewCells = [];

    this._updateFinalizeEnabled(this._queuedCount() > 0);
    this._setPhase1Text(true, this._queuedCount());
    this._redrawGhost(true);
    }

finalize() {
  if (!this.active) return;
  if (!this.orderedBuildTiles?.length) return;

  // stable de-dupe while keeping first occurrence (preserves your segment build order)
  const seen = new Set();
  const ordered = [];
  for (const t of this.orderedBuildTiles) {
    const k = `${t.x},${t.y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    ordered.push(t);
  }

  const totalCost = {};
  for (const tile of ordered) {
    const buildType = TILE_TYPES[tile.buildTypeName] ?? TILE_TYPES[this.wallTypeName];
    mergeCostBundle(totalCost, normalizeCostBundle(buildType?.cost ?? buildType?.price ?? null));
  }

  const hasCost = Object.keys(totalCost).length > 0;
  if (hasCost && !buildingManager.hasRequiredMaterials(totalCost, "1")) {
    const missing = buildingManager.getMissingMaterials?.(totalCost, "1") || [];
    showAlert(this.scene, formatMissingCostMessage(missing), "#ff5555");
    AudioManager.playError?.({ volume: 0.24 });
    return;
  }

  const prepaid = hasCost;
  if (hasCost) {
    buildingManager.consumeRequiredMaterials(totalCost, "1");
  }

  const wallJobId = buildingManager.createWallJobId?.("1") ?? `wall-job-${Date.now()}`;
  const queuedTiles = ordered.map((tile) => {
    const buildType = TILE_TYPES[tile.buildTypeName] ?? TILE_TYPES[this.wallTypeName];
    const refundCost = normalizeCostBundle(buildType?.cost ?? buildType?.price ?? null);
    return {
      ...tile,
      wallJobId,
      prepaid,
      refundCost: Object.keys(refundCost).length ? refundCost : null,
    };
  });

  // Enqueue mixed build types and let the builder scheduler delegate them.
  buildingManager.createBuildTileStateArray(queuedTiles, "1");
  this.stop();
}

  // ---------- internals ----------

  _pointerToGrid(pointer) {
    if (pointer.worldX < 0 || pointer.worldY < 0) return null;
    const gx = Math.floor(pointer.worldX / SQUARESIZE);
    const gy = Math.floor(pointer.worldY / SQUARESIZE);
    if (gx < 0 || gy < 0 || gx >= WORLD_DIMENSIONX || gy >= WORLD_DIMENSIONY) return null;
    return { x: gx, y: gy };
  }

    _strictLineSegment(a, b) {
        return this._lineCells(a, b);
    }

  _lineCells(a, b) {
    const cells = [];
    const sx = Math.sign(b.x - a.x);
    const sy = Math.sign(b.y - a.y);
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);

    let x = a.x, y = a.y;
    cells.push({ x, y });

    if (dx === 0 || dy === 0) {
      while (x !== b.x || y !== b.y) {
        if (x !== b.x) x += sx;
        else if (y !== b.y) y += sy;
        cells.push({ x, y });
      }
      return cells;
    }

    if (dx >= dy) {
      let error = 0;
      while (x !== b.x || y !== b.y) {
        if (x !== b.x) {
          x += sx;
          cells.push({ x, y });
          error += dy;
        }

        if (y !== b.y && error * 2 >= dx) {
          y += sy;
          cells.push({ x, y });
          error -= dx;
        }
      }
      return cells;
    }

    let error = 0;
    while (x !== b.x || y !== b.y) {
      if (y !== b.y) {
        y += sy;
        cells.push({ x, y });
        error += dx;
      }

      if (x !== b.x && error * 2 >= dy) {
        x += sx;
        cells.push({ x, y });
        error -= dy;
      }
    }
    return cells;
  }

  _doorTypeName() {
    return this.wallTypeName === "woodWall" ? "woodWall_door" : "wall_door";
  }

  static _wallFamilyForTypeName(typeName) {
    if (typeName === "wall" || typeName === "wall_door") return "stone";
    if (typeName === "woodWall" || typeName === "woodWall_door") return "wood";
    return null;
  }

  static _isWallFamilyTypeName(typeName) {
    return this._wallFamilyForTypeName(typeName) != null;
  }

  static _typeNameMatchesWallFamily(typeName, family) {
    return this._wallFamilyForTypeName(typeName) === family;
  }

  _placedWallMatchesFamily(x, y, family) {
    const info = GameMap._wallStructureInfoAt?.(x, y) || null;
    return WallPlacementController._typeNameMatchesWallFamily(info?.name, family);
  }

  _placedWallOrDoorAt(x, y) {
    return !!GameMap._wallStructureInfoAt?.(x, y);
  }

  _virtualWallTiles(previewBuildableCells = [], previewDoor = null) {
    const tiles = new globalThis.Map();

    for (const tile of this.orderedBuildTiles || []) {
      const typeName = tile?.buildTypeName ?? tile?.type?.name ?? null;
      if (!WallPlacementController._isWallFamilyTypeName(typeName)) continue;
      tiles.set(`${tile.x},${tile.y}`, typeName);
    }

    for (const cell of previewBuildableCells || []) {
      tiles.set(`${cell.x},${cell.y}`, this.wallTypeName);
    }

    if (previewDoor) {
      tiles.set(`${previewDoor.x},${previewDoor.y}`, this._doorTypeName());
    }

    return tiles;
  }

  _wallDisplayInfoForCell(x, y, typeName, virtualTiles) {
    const family = WallPlacementController._wallFamilyForTypeName(typeName);
    if (!family) return null;

    const isDoor = typeName === "wall_door" || typeName === "woodWall_door";
    const solidAt = (gx, gy) => {
      const virtualType = virtualTiles?.get(`${gx},${gy}`) ?? null;
      if (WallPlacementController._isWallFamilyTypeName(virtualType)) return true;
      return this._placedWallOrDoorAt(gx, gy);
    };

    const up = solidAt(x, y - 1);
    const down = solidAt(x, y + 1);
    const left = solidAt(x - 1, y);
    const right = solidAt(x + 1, y);
    const count = (up ? 1 : 0) + (down ? 1 : 0) + (left ? 1 : 0) + (right ? 1 : 0);

    if (isDoor) {
      const angle = up && down ? 90 : (left && right ? 0 : ((up || down) ? 90 : 0));
      return { key: typeName, angle, isDoor: true };
    }

    const def = family === "wood" ? TILE_TYPES.woodWall : TILE_TYPES.wall;
    let gridVal = def.interior;

    if (count === 1) {
      if (up) gridVal = def.sides.right;
      else if (right) gridVal = def.sides.up;
      else if (down) gridVal = def.sides.left;
      else gridVal = def.sides.down;
    } else if (count === 2) {
      if (up && down && !left && !right) gridVal = def.sides.right;
      else if (left && right && !up && !down) gridVal = def.sides.up;
      else if (up && left && !right && !down) gridVal = def.corners.bottomRight;
      else if (up && right && !left && !down) gridVal = def.corners.bottomLeft;
      else if (down && left && !right && !up) gridVal = def.corners.topRight;
      else if (down && right && !left && !up) gridVal = def.corners.topLeft;
    }

    const kind = family === "wood"
      ? (gridVal === def.interior ? "woodWall_interior" : Object.values(def.sides).includes(gridVal) ? "woodWall_edge" : "woodWall_corner")
      : (gridVal === def.interior ? "wall_interior" : Object.values(def.sides).includes(gridVal) ? "wall_edge" : "wall_corner");

    return {
      key: kind,
      angle: WallPlacementController._angleForWallPiece(gridVal),
      isDoor: false,
    };
  }

  _sameWallFamilyName(name) {
    if (!name) return false;
    return name === this.wallTypeName || name === this._doorTypeName();
  }

  _queuedTileAt(x, y) {
    return (this.orderedBuildTiles || []).find((tile) => tile.x === x && tile.y === y) || null;
  }

  _cellBuildState(x, y) {
    const info = GameMap._wallStructureInfoAt?.(x, y) || null;
    const queuedTile = this._queuedTileAt(x, y);
    const sameFamilyPlaced = this._sameWallFamilyName(info?.name);
    const sameFamilyQueued = this._sameWallFamilyName(queuedTile?.buildTypeName);
    const hasPlacedWall = !!info;
    const hasQueuedTile = !!queuedTile;
    const hasQueuedFarm = !!buildingManager.isTileReservedForFarm?.(x, y, "1");
    const canBuildNew =
      !!Map.navGrid[y]?.[x] &&
      !hasPlacedWall &&
      !hasQueuedTile &&
      !hasQueuedFarm;

    return {
      info,
      queuedTile,
      hasQueuedFarm,
      sameFamilyPlaced,
      sameFamilyQueued,
      incorporated: sameFamilyPlaced || sameFamilyQueued,
      canBuildNew,
    };
  }

  _canUseSegmentPivot(x, y) {
    const state = this._cellBuildState(x, y);
    return state.canBuildNew || state.incorporated;
  }

  _analyzeSegment(cells) {
    const buildableCells = [];

    for (const cell of cells) {
      const state = this._cellBuildState(cell.x, cell.y);
      if (state.canBuildNew) {
        buildableCells.push(cell);
        continue;
      }
      if (state.incorporated) continue;
      return { valid: false, buildableCells: [] };
    }

    return {
      valid: buildableCells.length > 0,
      buildableCells,
    };
  }

  _pickDoorCell(seg, buildableCells) {
    if (!Array.isArray(seg) || seg.length < 3 || !Array.isArray(buildableCells) || buildableCells.length === 0) {
      return null;
    }

    const buildableKeys = new Set(buildableCells.map((cell) => `${cell.x},${cell.y}`));
    const centerIndex = (seg.length - 1) / 2;
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestIndex = Number.POSITIVE_INFINITY;

    for (let i = 1; i < seg.length - 1; i++) {
      const cell = seg[i];
      if (!buildableKeys.has(`${cell.x},${cell.y}`)) continue;
      const prev = seg[i - 1];
      const next = seg[i + 1];
      const straightThrough =
        (prev?.x === cell.x && next?.x === cell.x) ||
        (prev?.y === cell.y && next?.y === cell.y);
      if (!straightThrough) continue;
      const distance = Math.abs(i - centerIndex);
      if (distance < bestDistance || (distance === bestDistance && i < bestIndex)) {
        best = cell;
        bestDistance = distance;
        bestIndex = i;
      }
    }

    return best;
  }

  _segmentDoorAngle(seg, doorCell) {
    if (!Array.isArray(seg) || !doorCell) return 0;
    const index = seg.findIndex((cell) => cell.x === doorCell.x && cell.y === doorCell.y);
    if (index <= 0 || index >= seg.length - 1) return 0;

    const prev = seg[index - 1];
    const next = seg[index + 1];
    const verticalThrough =
      prev?.x === doorCell.x &&
      next?.x === doorCell.x;

    return verticalThrough ? 90 : 0;
  }

  _canPlaceCell(x, y) {
    // don’t allow placing onto blocked nav, or onto an existing wall layer
    // (tighten later if you want “replace fences”, etc.)
    if (!Map.navGrid[y]?.[x]) return false;

    const cell = Map.grid[y]?.[x];
    if (!GameMap.isWithinMainIslandBuildInterior(x, y, 1, 1)) return false;

    const wallName = this.wallTypeName;

    // if cell is paired [floor, block], ensure block slot is empty or not a wall
    if (Array.isArray(cell)) {
      const top = cell[1];
      // if top already maps to wall/woodWall, block
      const topName = top ? (typeof top === "number" ? this._tileNameFromNumber(top) : null) : null;
      if (topName === "wall" || topName === "woodWall") return false;
    } else {
      // scalar: could already be wall numeric
      const name = typeof cell === "number" ? this._tileNameFromNumber(cell) : null;
      if (name === "wall" || name === "woodWall") return false;
    }

    // also don’t collide with our own committed
    if (this._isInCommitted(x, y)) return false;
    if (buildingManager.isTileReservedForFarm?.(x, y, "1")) return false;

    return true;
  }

  _canPlaceCells(cells, allowStart = false) {
    for (let i = 0; i < cells.length; i++) {
        const c = cells[i];

        if (allowStart && i === 0) {
        // allow start tile even if it is “occupied” by being the chosen start
        // BUT still block if it already has a wall on map/grid (you decide).
        // Usually: allow start only if _canPlaceCell allows it, so simplest is:
        if (!this._canPlaceCell(c.x, c.y)) return false;
        continue;
        }

        if (!this._canPlaceCell(c.x, c.y)) return false;
    }
    return true;
  }

  _isInCommitted(x, y) {
    // small lists → linear scan is fine
    return this.committedCells.some(c => c.x === x && c.y === y);
  }

  _tileNameFromNumber(n) {
    // fast check for our two wall ranges
    if (n >= 2 && n <= 10) return "wall";
    if (n >= 57 && n <= 65) return "woodWall";
    return null;
  }

  _rebuildCommittedFromPivots() {
    this.committedCells = [];
    for (let i = 1; i < this.pivots.length; i++) {
      const a = this.pivots[i - 1];
      const b = this.pivots[i];
      const seg = this._strictLineSegment(a, b);
      if (!seg) continue;
      const toCommit = seg;
      this.committedCells.push(...toCommit);
    }
  }

  _totalCostCount(committed, preview) {
    const set = new Set();
    for (const c of committed) set.add(`${c.x},${c.y}`);
    for (const c of preview) set.add(`${c.x},${c.y}`);
    return set.size;
  }

  _queuedCount(preview = []) {
    const set = new Set();
    for (const t of this.orderedBuildTiles || []) set.add(`${t.x},${t.y}`);
    for (const c of preview || []) set.add(`${c.x},${c.y}`);
    return set.size;
  }

  _wallLabel() {
    return this.wallTypeName === "woodWall" ? "Wood Walls" : "Stone Walls";
  }

  _ensureUI() {
    if (!this.ui) {
        const y = 92; // below the top HUD / money row
        const x = this.scene.scale.width / 2;

        this.ui = this.scene.add.container(x, y)
        .setScrollFactor(0)
        .setDepth(UIDEPTH + 10)
        .setVisible(true);

        // background "pill"
        this.uiBg = this.scene.add.rectangle(0, 0, 10, 26, 0x222222, 0.75)
        .setOrigin(0.5, 0.5);

        this.uiText = this.scene.add.text(0, 0, "", {
        fontSize: "16px",
        fontFamily: "Bungee",
        color: "#ffffff",
        stroke: "#000",
        strokeThickness: 3,
        }).setOrigin(0.5, 0.5);

        // keep finalize as a separate button to the right of the banner (still under top bar)
        this.finalBtn = this.scene.add.text(0, 0, "✔ Finalize", {
        fontSize: "18px",
        fontFamily: "Bungee",
        color: "#ffffff",
        backgroundColor: "#222222",
        padding: { left: 8, right: 8, top: 4, bottom: 4 },
        }).setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true });

        this.finalBtn.on("pointerdown", () => this.finalize());

        this.ui.add([this.uiBg, this.uiText, this.finalBtn]);

        // keep centered on resize
        this.scene.scale.on("resize", ({ width }) => {
        this.ui.setX(width / 2);
        this._layoutUI();
        });
    }

    this.ui.setVisible(true);
    this._layoutUI();
  }

  _layoutUI() {
    if (!this.ui || !this.uiText || !this.uiBg || !this.finalBtn) return;

    const padX = 18;
    const padY = 10;
    const spacing = 16;

    // background sized to text only (like a banner)
    const w = this.uiText.width + padX * 2;
    const h = this.uiText.height + padY;

    this.uiBg.setSize(w, Math.max(26, h));
    this.uiBg.setPosition(0, 0);

    this.uiText.setPosition(0, 0);

    // finalize button sits to the right of the banner
    const btnX = (w / 2) + spacing + (this.finalBtn.width / 2);
    this.finalBtn.setPosition(btnX, 0);
  }

  _updateFinalizeEnabled(enabled) {
    if (!this.finalBtn) return;
    this.finalBtn.setAlpha(enabled ? 1 : 0.35);
    this.finalBtn.disableInteractive();
    if (enabled) this.finalBtn.setInteractive({ useHandCursor: true });
  }

  _setPhase1Text(valid = true) {
    // “Click to start placement | esc to end” (+ color cue)
    this.uiText.setText(`Click to start placement | esc to end`);
    this.uiText.setColor(valid ? "#66ff66" : "#ff6666");
    this._layoutUI();
  }

  _setPhase2Text(valid = true, count = 0) {
    const typeIcon = this.wallTypeName === "woodWall" ? "🪵" : "🪨";
    // “click to end segment | x#<<typeIcon>> | esc to go back | Click here to finalize”
    this.uiText.setText(`click to end segment | x${count}${typeIcon} | esc to go back | Click ✔ Finalize`);
    this.uiText.setColor(valid ? "#66ff66" : "#ff6666");
    this._layoutUI();
  }

// WallPlacementController.js
  _ensureUI() {
    if (!this.ui) {
      const y = 92;
      const x = this.scene.scale.width / 2;

      this.ui = this.scene.add.container(x, y)
        .setScrollFactor(0)
        .setDepth(UIDEPTH + 10)
        .setVisible(true);

      this.uiBg = this.scene.add.graphics();

      const makeInstructionText = (color = "#ffffff") => this.scene.add.text(0, 0, "", {
        fontSize: "16px",
        fontFamily: "Bungee",
        color,
        stroke: "#000",
        strokeThickness: 3,
      }).setOrigin(0, 0.5);

      this.uiTextParts = [
        makeInstructionText("#ffffff"),
        makeInstructionText("#ff4a4a"),
        makeInstructionText("#ffffff"),
      ];

      this.finalBtn = this.scene.add.text(0, 0, "✔", {
        fontSize: "18px",
        fontFamily: "Bungee",
        color: "#ffffff",
        stroke: "#02111d",
        strokeThickness: 4,
      }).setOrigin(0.5, 0.5);
      this.finalBtn.setText("\u2705 Start Build");

      this.finalBtn.setBackgroundColor("rgba(0,0,0,0)");
      this.finalBtn.setPadding(0, 0, 0, 0);
      this.finalBtn.on("pointerdown", (_pointer, _x, _y, event) => {
        event?.stopPropagation?.();
        if (!this._finalBtnEnabled) return;
        this._finalBtnPressed = true;
        this._drawFinalizeButton();
        this._activateFinalizeButton();
      });
      this.ui.add([this.uiBg, ...this.uiTextParts, this.finalBtn]);
      this.finalBtnGlass = this.scene.add.graphics();
      this.finalBtnHit = this.scene.add.zone(0, 0, FINALIZE_BUTTON_WIDTH, FINALIZE_BUTTON_HEIGHT);
      this._setFinalizeHitInteractive();
      this.finalBtnHit.on("pointerover", (_pointer, _x, _y, event) => {
        event?.stopPropagation?.();
        this._finalBtnHovered = true;
        AudioManager.playUiHover({ volume: 0.18 });
        this._drawFinalizeButton();
      });
      this.finalBtnHit.on("pointerout", (_pointer, event) => {
        event?.stopPropagation?.();
        this._finalBtnHovered = false;
        this._finalBtnPressed = false;
        this._drawFinalizeButton();
      });
      this.finalBtnHit.on("pointerdown", (_pointer, _x, _y, event) => {
        event?.stopPropagation?.();
        if (!this._finalBtnEnabled) return;
        this._finalBtnPressed = true;
        this._drawFinalizeButton();
      });
      this.finalBtnHit.on("pointerup", (_pointer, _x, _y, event) => {
        event?.stopPropagation?.();
        this._finalBtnPressed = false;
        this._drawFinalizeButton();
        this._activateFinalizeButton();
      });
      this.ui.addAt(this.finalBtnGlass, 2);
      this.ui.add(this.finalBtnHit);
      this.ui.setScrollFactor(0, 0, true);
      this.scene.scale.on("resize", ({ width }) => {
        this.ui.setX(width / 2);
        this._layoutUI();
      });
    }

    this.ui.setVisible(true);
    this._layoutUI();
  }

  _layoutUI() {
    if (!this.ui || !this.uiTextParts?.length || !this.uiBg || !this.finalBtn) return;

    const padX = 18;
    const padY = 10;
    const spacingY = 12;
    const textGap = 0;
    const instructionW = this.uiTextParts.reduce((sum, part) => sum + (part?.visible === false ? 0 : part.width), 0)
      + textGap * Math.max(0, this.uiTextParts.length - 1);
    const instructionH = this.uiTextParts.reduce((max, part) => Math.max(max, part?.height || 0), 0);
    const w = instructionW + padX * 2;
    const h = instructionH + padY;
    const bgH = Math.max(30, h);

    this.uiBg.clear();
    this.uiBg.fillStyle(0x10293b, 0.72);
    this.uiBg.fillRoundedRect(-w / 2, -bgH / 2, w, bgH, 12);
    this.uiBg.fillStyle(0xffffff, 0.08);
    this.uiBg.fillRoundedRect((-w / 2) + 2, (-bgH / 2) + 2, w - 4, Math.max(8, bgH * 0.42), 10);
    this.uiBg.lineStyle(2, 0xffffff, 0.16);
    this.uiBg.strokeRoundedRect(-w / 2, -bgH / 2, w, bgH, 12);

    let cursorX = -instructionW / 2;
    for (const part of this.uiTextParts) {
      if (!part) continue;
      part.setPosition(cursorX, 0);
      cursorX += part.width + textGap;
    }

    const btnY = bgH / 2 + spacingY + FINALIZE_BUTTON_HEIGHT / 2;
    this.finalBtn.setPosition(0, btnY);
    this.finalBtnGlass?.setPosition?.(0, 0);
    this.finalBtnHit?.setPosition?.(0, btnY);
    this._drawFinalizeButton();
  }

  _updateFinalizeEnabled(enabled) {
    if (!this.finalBtn) return;
    this._finalBtnEnabled = !!enabled;
    if (!enabled) {
      this._finalBtnHovered = false;
      this._finalBtnPressed = false;
    }
    this.finalBtn.setVisible(enabled);
    this.finalBtn.setAlpha(enabled ? 1 : 0.4);
    this.finalBtnGlass?.setVisible?.(enabled);
    this.finalBtnHit?.setActive?.(enabled);
    this.finalBtn.disableInteractive();
    this.finalBtnHit?.disableInteractive?.();
    if (enabled) {
      this.finalBtn.setInteractive({ useHandCursor: true });
      this._setFinalizeHitInteractive();
    }
    this._drawFinalizeButton();
  }

  _setFinalizeHitInteractive() {
    if (!this.finalBtnHit) return;
    this.finalBtnHit.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(
        -FINALIZE_BUTTON_WIDTH / 2,
        -FINALIZE_BUTTON_HEIGHT / 2,
        FINALIZE_BUTTON_WIDTH,
        FINALIZE_BUTTON_HEIGHT
      ),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
  }

  _drawFinalizeButton() {
    if (!this.finalBtnGlass || !this.finalBtn) return;
    const enabled = !!this._finalBtnEnabled;
    if (!enabled) {
      this.finalBtnGlass.clear();
      this.finalBtn.setScale(1);
      return;
    }
    const hovered = !!this._finalBtnHovered && enabled;
    const pressed = !!this._finalBtnPressed && enabled;
    const width = FINALIZE_BUTTON_WIDTH;
    const height = FINALIZE_BUTTON_HEIGHT;
    const fillAlpha = enabled ? (pressed ? 0.54 : hovered ? 0.48 : 0.38) : 0.14;
    const strokeAlpha = enabled ? (hovered ? 0.72 : 0.42) : 0.16;

    this.finalBtnGlass.clear();
    this.finalBtnGlass.fillStyle(0x17354a, fillAlpha);
    this.finalBtnGlass.fillRoundedRect(-width / 2, this.finalBtn.y - (height / 2), width, height, 12);
    this.finalBtnGlass.fillStyle(0xffffff, enabled ? (hovered ? 0.13 : 0.09) : 0.04);
    this.finalBtnGlass.fillRoundedRect((-width / 2) + 2, this.finalBtn.y - (height / 2) + 2, width - 4, 12, 10);
    this.finalBtnGlass.lineStyle(2, 0xffffff, strokeAlpha);
    this.finalBtnGlass.strokeRoundedRect(-width / 2, this.finalBtn.y - (height / 2), width, height, 12);
    this.finalBtnGlass.lineStyle(1, 0xa7f3d0, enabled ? (hovered ? 0.72 : 0.44) : 0.16);
    this.finalBtnGlass.strokeRoundedRect((-width / 2) + 1, this.finalBtn.y - (height / 2) + 1, width - 2, height - 2, 11);
    this.finalBtn.setScale(pressed ? 0.97 : hovered ? 1.04 : 1);
  }

  _getFinalizeBounds() {
    if (!this.ui?.visible || !this.finalBtnHit?.active || !this.finalBtn?.visible) return null;

    const width = this.finalBtnHit.width || FINALIZE_BUTTON_WIDTH;
    const height = this.finalBtnHit.height || FINALIZE_BUTTON_HEIGHT;
    const matrix = this.finalBtnHit.getWorldTransformMatrix?.();
    const x = matrix?.tx ?? ((this.ui.x || 0) + (this.finalBtnHit.x || 0));
    const y = matrix?.ty ?? ((this.ui.y || 0) + (this.finalBtnHit.y || 0));

    return new Phaser.Geom.Rectangle(x - width / 2, y - height / 2, width, height);
  }

  _updateFinalizeHover(pointer) {
    const bounds = this._getFinalizeBounds();
    const hovered = !!(bounds && Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y));
    if (hovered === !!this._finalBtnHovered) return hovered;
    this._finalBtnHovered = hovered;
    if (hovered) AudioManager.playUiHover({ volume: 0.18 });
    if (!hovered) this._finalBtnPressed = false;
    this._drawFinalizeButton();
    return hovered;
  }

  _handleFinalizePointer(pointer) {
    const bounds = this._getFinalizeBounds();
    if (!bounds || !Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y)) return false;
    if (!this._finalBtnEnabled) return true;
    this._finalBtnPressed = true;
    this._drawFinalizeButton();
    this._activateFinalizeButton();
    return true;
  }

  _activateFinalizeButton() {
    if (!this.active || !this._finalBtnEnabled || !this.orderedBuildTiles?.length) return false;
    AudioManager.playMenuClick({ volume: 0.2 });
    this.finalize();
    return true;
  }

  _setInstructionParts(prefix = "", escText = "", suffix = "", valid = true) {
    const normalColor = valid ? "#66ff66" : "#ff6666";
    const parts = this.uiTextParts || [];
    parts[0]?.setText(prefix);
    parts[0]?.setColor(normalColor);
    parts[1]?.setText(escText);
    parts[1]?.setColor("#ff4a4a");
    parts[2]?.setText(suffix);
    parts[2]?.setColor(normalColor);
  }

  _setPhase1Text(valid = true, count = this._queuedCount()) {
    const action = count > 0 ? "click to start next segment" : "click to start placement";
    this._setInstructionParts(
      `Placing ${this._wallLabel()} | ${count} queued | ${action} | `,
      "ESC to cancel",
      "",
      valid
    );
    this._layoutUI();
  }

  _setPhase2Text(valid = true, count = this._queuedCount(this.previewCells)) {
    this._setInstructionParts(
      `Placing ${this._wallLabel()} | ${count} queued | click to end segment | `,
      "ESC to undo",
      "",
      valid
    );
    this._layoutUI();
  }

_redrawGhost(isValid = true) {
  if (!this.previewContainer) return;

  this.previewContainer.removeAll(true);
  this.previewSprites = [];

  const tint = isValid ? 0x33ff33 : 0xff3333;
  const alphaWall = 0.55;
  const alphaDoor = 0.75;

  const previewAnalysis = this._analyzeSegment(this.previewCells);
  const previewBuildableCells = previewAnalysis.valid ? previewAnalysis.buildableCells : [];
  const previewDoor = previewAnalysis.valid
    ? this._pickDoorCell(this.previewCells, previewBuildableCells)
    : null;
  const previewQueuedCount = this._queuedCount(previewBuildableCells);
  if (this._lastGhostQueuedCount != null && previewQueuedCount !== this._lastGhostQueuedCount) {
    AudioManager.playLayoutMove({ volume: 0.2 });
  }
  this._lastGhostQueuedCount = previewQueuedCount;
  const virtualTiles = this._virtualWallTiles(previewBuildableCells, previewDoor);

  const drawGhostTile = (cell, typeName, a = alphaWall) => {
    const display = this._wallDisplayInfoForCell(cell.x, cell.y, typeName, virtualTiles);
    if (!display) return;

    const spr = this.scene.add.sprite(
      cell.x * SQUARESIZE + SQUARESIZE / 2,
      cell.y * SQUARESIZE + SQUARESIZE / 2,
      display.key,
      0
    );
    spr.setAngle(display.angle || 0);
    spr.setDisplaySize(SQUARESIZE, SQUARESIZE);
    spr.setAlpha(display.isDoor ? alphaDoor : a);
    spr.setTintFill(tint);
    spr.setBlendMode(Phaser.BlendModes.ADD);
    this.previewContainer.add(spr);
    this.previewSprites.push(spr);
  };

  const committedTiles = [];
  const seenCommitted = new Set();
  for (const tile of this.orderedBuildTiles || []) {
    const typeName = tile?.buildTypeName ?? tile?.type?.name ?? null;
    if (!WallPlacementController._isWallFamilyTypeName(typeName)) continue;
    const key = `${tile.x},${tile.y}`;
    if (seenCommitted.has(key)) continue;
    seenCommitted.add(key);
    committedTiles.push({ x: tile.x, y: tile.y, typeName });
  }
  for (const tile of committedTiles) drawGhostTile(tile, tile.typeName);

  if (!previewBuildableCells.length && !previewDoor) return;

  for (const cell of previewBuildableCells) {
    const isDoorHere = previewDoor && cell.x === previewDoor.x && cell.y === previewDoor.y;
    drawGhostTile(cell, isDoorHere ? this._doorTypeName() : this.wallTypeName);
  }
}

static isDoorTileNumber(n) {
  const arr = TILE_ARR[n];
  if (arr === "wall_door" || arr === "woodWall_door") return true;

  const mapped = TILE_MAP(n);
  return mapped === "wall_door" || mapped === "woodWall_door";
}

// WallPlacementController.js
static bindDoorSprite(scene, doorSprite) {
  if (!doorSprite || doorSprite.__doorBound) return;
  doorSprite.__doorBound = true;

  // default closed
  if (doorSprite.setFrame) doorSprite.setFrame(0);

  // Ensure the door has an Arcade STATIC body (overlap needs bodies)
  if (!doorSprite.body) {
    scene.physics.add.existing(doorSprite, true); // static body
  }

  // Ensure doorGroup exists + is static
  if (!scene.doorGroup) scene.doorGroup = scene.physics.add.staticGroup();

  // Add to the staticGroup so overlap(Player.characters, doorGroup) can hit it
  scene.doorGroup.add(doorSprite);
}

static _cellHasType(gridCell, typeName) {
  if (gridCell == null) return false;
  if (Array.isArray(gridCell)) {
    // your grid uses [floor, block] sometimes
    return TILE_MAP(gridCell[0]) === typeName || TILE_MAP(gridCell[1]) === typeName;
  }
  return TILE_MAP(gridCell) === typeName;
}

static _wallFamilyAt(mapGrid, x, y, family) {
  const row = mapGrid?.[y];
  if (!row) return false;

  const cell = row[x];
  if (cell == null) return false;

  if (family === "stone") {
    return (
      WallPlacementController._cellHasType(cell, "wall") ||
      WallPlacementController._cellHasType(cell, "wall_door")
    );
  }

  // wood
  return (
    WallPlacementController._cellHasType(cell, "woodWall") ||
    WallPlacementController._cellHasType(cell, "woodWall_door")
  );
}

static doorAngleForCell(_gridIgnored, x, y, doorTypeName) {
  // Treat BOTH the wall and the door as “structure neighbors”
  // so orientation stays stable no matter which layer holds it.
  const hasSolid = (nx, ny) => !!GameMap._wallStructureInfoAt?.(nx, ny);

  // Consider a neighbor “solid” if it has a wall or a door.
  const up    = hasSolid(x, y - 1);
  const down  = hasSolid(x, y + 1);
  const left  = hasSolid(x - 1, y);
  const right = hasSolid(x + 1, y);

  // If we're connecting vertically (walls up+down), door spans horizontally => angle 90
  if (up && down) return 90;

  // If we're connecting horizontally (walls left+right), door spans vertically => angle 0
  if (left && right) return 0;

  // Fallbacks: bias toward whichever axis has at least one neighbor
  if (up || down) return 90;
  return 0;
}


static _angleForWallPiece(gridVal) {
  // Determine whether this numeric gridVal is a side/corner, and rotate accordingly.
  // Assumes:
  //  - edge art is "top edge" at 0 degrees
  //  - corner art is "top-left corner" at 0 degrees
  const stone = TILE_TYPES.wall;
  const wood  = TILE_TYPES.woodWall;

  const isStone = (gridVal >= 2 && gridVal <= 10);
  const isWood  = (gridVal >= 57 && gridVal <= 65);

  const t = isWood ? wood : stone;

  // interior: no rotation
  if (gridVal === t.interior) return 0;

  // edges: authored as "up"
  if (gridVal === t.sides.up)    return 0;
  if (gridVal === t.sides.right) return 90;
  if (gridVal === t.sides.down)  return 180;
  if (gridVal === t.sides.left)  return 270;

  // corners: authored as "topLeft"
  if (gridVal === t.corners.topLeft)     return 0;
  if (gridVal === t.corners.topRight)    return 90;
  if (gridVal === t.corners.bottomRight) return 180;
  if (gridVal === t.corners.bottomLeft)  return 270;

  return 0;
}

static _removeStructureSourcesOn(node) {
  if (!node) return;

  const scene = node.scene;
  if (!scene) return;

  const visionSet = scene.__structureVisionIds || (scene.__structureVisionIds = new Set());
  const lightSet  = scene.__structureLightIds  || (scene.__structureLightIds  = new Set());

  if (node.__visionId != null) {
    VisibilitySystem.removeVisionBubble(node.__visionId);
    visionSet.delete(node.__visionId);
    node.__visionId = null;
  }

  if (node.__lightId != null) {
    VisibilitySystem.removeLightById(node.__lightId);
    lightSet.delete(node.__lightId);
    node.__lightId = null;
  }
}

static doorAngleForCell(_gridIgnored, x, y, doorTypeName) {
  const hasSolid = (nx, ny) => !!GameMap._wallStructureInfoAt?.(nx, ny);

  const up    = hasSolid(x, y - 1);
  const down  = hasSolid(x, y + 1);
  const left  = hasSolid(x - 1, y);
  const right = hasSolid(x + 1, y);

  if (up && down) return 90;
  if (left && right) return 0;
  if (up || down) return 90;
  return 0;
}

/**
 * Adds BOTH a light + vision bubble for any player-built structure sprite.
 * Call with noRepaint=true, and let Map/doBuildings do the single rebuild.
 */
static bindStructureLightAndVision(node, gx, gy, opts = {}) {
  if (!node) return;

  const scene = node.scene;
  if (!scene) return;

  const visionSet = scene.__structureVisionIds || (scene.__structureVisionIds = new Set());
  const lightSet  = scene.__structureLightIds  || (scene.__structureLightIds  = new Set());

  const r = opts.r ?? 6;
  const boost = opts.boost ?? 0.1;
  const brightness = opts.brightness ?? opts.intensity ?? 1.0;
  const lenX = Math.max(1, Number(opts.lenX ?? opts.w ?? 1) || 1);
  const lenY = Math.max(1, Number(opts.lenY ?? opts.h ?? 1) || 1);

  const cx = Number(gx) + lenX / 2;
  const cy = Number(gy) + lenY / 2;

  // clear old ids if re-binding
  WallPlacementController._removeStructureSourcesOn(node);

  node.__lightId = VisibilitySystem.addLightSource(
    { x: cx, y: cy, r, brightness },
    true // noRepaint
  );
  lightSet.add(node.__lightId);

  node.__visionId = VisibilitySystem.addVisionBubble(
    { x: cx, y: cy, r, boost },
    true // noRepaint
  );
  visionSet.add(node.__visionId);

  node.once?.("destroy", () => WallPlacementController._removeStructureSourcesOn(node));
}

/**
 * Optional: call this if you ever need to hard-reset all structure sources.
 * DO NOT call every frame; only when you know you’re rebuilding everything.
 */
static clearAllStructureSources(scene) {
  if (!scene) return;

  const visionSet = scene.__structureVisionIds;
  const lightSet  = scene.__structureLightIds;

  if (visionSet) {
    for (const id of visionSet) VisibilitySystem.removeVisionBubble(id);
    visionSet.clear();
  }

  if (lightSet) {
    for (const id of lightSet) VisibilitySystem.removeLightById(id);
    lightSet.clear();
  }
}

}

