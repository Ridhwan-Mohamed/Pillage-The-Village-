// UI/DraftStartPreviewController_v5.js
//
// Preview controller writes ONLY to gridData (+ buildingArray for later handoff).
// IMPORTANT: It never schedules repaint itself. The menu calls repaint when actions occur.

import { SQUARESIZE, TILE_MAP, TILE_TYPES, UIDEPTH } from "../../constants.js";
import { buildingArray, generateTown } from "../../town.js";
import { Map as GameMap } from "../../map.js";
import { Player } from "../../players/Player.js";
import { AudioManager } from "../../Manager/AudioManager.js";
import { DEFAULT_PLAYER_PORTRAIT_KEY } from "../../players/playerPortraits.js";
import { DEFAULT_LAYOUT_MOVE_RANGE } from "./DraftStartState.js";


function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function getFloorVal(cellVal){
  return Array.isArray(cellVal) ? cellVal[0] : cellVal;
}

const ROAD_PAD = 1;
const WALL_PAD = ROAD_PAD + 1; // walls sit one tile outside the road ring
const WALL_SHORE_MARGIN = 1;
const BUILDING_SHORE_BUFFER = 2;
const SHORE_REASON = "shore";
const DRAFT_SPAWN_ICON_TILE_FILL = 1;
const DRAFT_SPAWN_ICON_HOVER_SCALE = 1.12;
const DRAFT_SPAWN_ICON_HIT_PAD = 4;

function isWallOrDoorOverlay(overlayVal){
  return overlayVal === TILE_TYPES.wall?.grid ||
         overlayVal === TILE_TYPES.wall_door?.grid ||
         overlayVal === TILE_TYPES.woodWall?.grid ||
         overlayVal === TILE_TYPES.woodWall_door?.grid;
}

function isBlockedBaseTile(cellVal){
  if (Array.isArray(cellVal)) return true; // already a placed building/block
  const key = TILE_MAP(cellVal);
  return !!TILE_TYPES[key]?.block;
}

export class DraftStartPreviewController {
  constructor(scene, menuRefs) {
    this.scene = scene;
    this.worldScene = menuRefs.worldScene || scene.menuPreview?.scene || scene;
    this.gridData = menuRefs.gridData;
    // Baseline terrain snapshot (no draft buildings). Used to rebuild on edits.
    this.terrainGrid = this.gridData.map(row => row.slice());
    // --- spawn icon overlay (drawn ON the map preview, ignored by UI camera) ---
    this.spawnPoints = []; // [{x,y,type}]
    this._roadTilesCache = null;
    this.spawnIconContainer?.destroy?.();
    this.spawnIconContainer = this.worldScene.add.container(0, 0).setDepth(UIDEPTH - 1);
    this._spawnIcons = []; // Phaser Images
    this._spawnPreviewVisible = true;
    this._hoveredSpawnPoint = null;
    this._hoveredSpawnIcon = null;
    this.repaintBounds = menuRefs.repaintBounds;
    this.fullRepaint = menuRefs.fullRepaintPreview;
    this.srcW = menuRefs.srcW;
    this.srcH = menuRefs.srcH;
    this.hoverGfx = this.worldScene.add.graphics().setDepth(UIDEPTH - 2);
    this.wallGhostGfx = this.worldScene.add.graphics().setDepth(UIDEPTH);
    this._hover = null;
    this._lastWallBounds = null;
    this._lastGhostBounds = null;
    this._lastMoveHoverKey = null;

    this.placed = []; // {x,y,typeKey,type,lenX,lenY,teamnum,tag}
    this._houseToggle = 0;
  }

  // ---------- basic paint helpers ----------
  _getType(typeKey) {
    return TILE_TYPES[typeKey];
  }

  _rectFor(typeKey, x, y) {
    const t = this._getType(typeKey);
    return { x, y, w: t.lenX, h: t.lenY };
  }

  // inclusive rect intersection
  _rectsOverlap(a, b) {
    return !(
      a.x + a.w - 1 < b.x ||
      b.x + b.w - 1 < a.x ||
      a.y + a.h - 1 < b.y ||
      b.y + b.h - 1 < a.y
    );
  }

  _touchesWaterBuffer(gridX, gridY, width, height, buffer = BUILDING_SHORE_BUFFER) {
    for (let yy = gridY - buffer; yy < gridY + height + buffer; yy++) {
      for (let xx = gridX - buffer; xx < gridX + width + buffer; xx++) {
        if (xx < 0 || yy < 0 || xx >= this.srcW || yy >= this.srcH) {
          return true;
        }

        const terrainCell = this.terrainGrid?.[yy]?.[xx];
        if (TILE_MAP(getFloorVal(terrainCell)) === "water") {
          return true;
        }
      }
    }

    return false;
  }

  _canPlaceAt(typeKey, gridX, gridY) {
    const t = this._getType(typeKey);
    if (!t) return { ok:false, reason:"bad type" };

    // 1) footprint can't touch blocked or existing building-array
    for (let yy = gridY; yy < gridY + t.lenY; yy++) {
      for (let xx = gridX; xx < gridX + t.lenX; xx++) {
        if (yy < 0 || xx < 0 || yy >= this.gridData.length || xx >= this.gridData[0].length) {
          return { ok:false, reason:"oob" };
        }
        const cell = this.gridData[yy][xx];

        // if another building/wall is stored as array -> only walls/doors are placeable
        if (Array.isArray(cell)) {
          const overlay = cell[1];
          if (!isWallOrDoorOverlay(overlay)) return { ok:false, reason:"occupied" };
          // overlay is wall/door -> ok to build over it (we'll overwrite overlay with building)
        }

        // blocked terrain (rock/water/pine etc) -> blocked; road is fine
        const key = TILE_MAP(cell);
        if (TILE_TYPES[key]?.block) return { ok:false, reason:"terrain blocked" };
      }
    }

    if (this._touchesWaterBuffer(gridX, gridY, t.lenX, t.lenY)) {
      return { ok:false, reason:SHORE_REASON };
    }

    // 2) must be 1 tile away from OTHER BUILDINGS (not terrain)
    // Expand NEW rect by +1 in every direction, then ensure it doesn't overlap any placed building rect.
    const expanded = { x: gridX - 1, y: gridY - 1, w: t.lenX + 2, h: t.lenY + 2 };

    for (const b of (this.placed ?? [])) {
      const bt = this._getType(b.typeKey);
      if (!bt) continue;
      const br = { x: b.x, y: b.y, w: bt.lenX, h: bt.lenY };
      if (this._rectsOverlap(expanded, br)) return { ok:false, reason:"too close to building" };
    }

    return { ok:true };
  }

  clearHover() {
    this._hover = null;
    this._lastMoveHoverKey = null;
    this.hoverGfx.clear();
    this.wallGhostGfx.clear();
  }

  setHover(typeKey, state, gridX, gridY) {
    this._hover = { typeKey, gridX, gridY };

    const ok = this._canPlaceAt(typeKey, gridX, gridY).ok;

    // draw hover rect
    const t = this._getType(typeKey);
    const x = gridX * SQUARESIZE;
    const y = gridY * SQUARESIZE;
    const w = t.lenX * SQUARESIZE;
    const h = t.lenY * SQUARESIZE;

    this.hoverGfx.clear();
    this.hoverGfx.lineStyle(3, ok ? 0x00ff00 : 0xff0000, 1);
    this.hoverGfx.strokeRect(x, y, w, h);
    this.hoverGfx.fillStyle(ok ? 0x00ff00 : 0xff0000, 0.10);
    this.hoverGfx.fillRect(x, y, w, h);

    // ghost walls (only if wall toggle is on)
    if (!state?.extras?.wall || !ok) return;

    const bounds = this._boundsOfPlacedPlusRect({ x:gridX, y:gridY, w:t.lenX, h:t.lenY });
    if (!bounds) return;

    if (this._sameBounds(bounds, this._lastWallBounds)) {
      this.wallGhostGfx.clear();
      return;
    }
    if (this._sameBounds(bounds, this._lastGhostBounds)) return;
    this._lastGhostBounds = bounds;

    this.wallGhostGfx.clear();
    this._drawGhostWalls(bounds, state.extras.wallType);
  }

  // bounds union of placed buildings + hover rect
  _boundsOfPlacedPlusRect(r) {
    const b = this._boundsOfPlaced();
    if (!b) {
      return { minx:r.x, miny:r.y, maxx:r.x + r.w - 1, maxy:r.y + r.h - 1 };
    }
    return {
      minx: Math.min(b.minx, r.x),
      miny: Math.min(b.miny, r.y),
      maxx: Math.max(b.maxx, r.x + r.w - 1),
      maxy: Math.max(b.maxy, r.y + r.h - 1),
    };
  }

  _sameBounds(a, b) {
    if (!a || !b) return false;
    return a.minx === b.minx && a.miny === b.miny && a.maxx === b.maxx && a.maxy === b.maxy;
  }

  _tileBlocksNav(typeKey) {
    if (!typeKey) return false;
    if (typeKey === "water") return true;
    return !!TILE_TYPES[typeKey]?.block;
  }

  _cellBlocksNav(cell) {
    if (Array.isArray(cell)) {
      return this._tileBlocksNav(TILE_MAP(cell[0])) || this._tileBlocksNav(TILE_MAP(cell[1]));
    }
    return this._tileBlocksNav(TILE_MAP(cell));
  }

  syncNavGridFromDraftLayout() {
    const hasSizedNavGrid =
      Array.isArray(GameMap.navGrid) &&
      GameMap.navGrid.length === this.srcH &&
      GameMap.navGrid.every((row) => Array.isArray(row) && row.length === this.srcW);

    if (!hasSizedNavGrid) {
      GameMap.navGrid = Array.from({ length: this.srcH }, () => Array(this.srcW).fill(1));
    }

    for (let y = 0; y < this.srcH; y++) {
      for (let x = 0; x < this.srcW; x++) {
        GameMap.navGrid[y][x] = this._cellBlocksNav(this.gridData[y][x]) ? 0 : 1;
      }
    }

    return GameMap.navGrid;
  }

  _boundsOfPlacedExcluding(exclude) {
    const ps = this.placed.filter(p => p.tag === "draftPreview" && p !== exclude);
    if (!ps.length) return null;

    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const p of ps) {
      minx = Math.min(minx, p.x);
      miny = Math.min(miny, p.y);
      maxx = Math.max(maxx, p.x + p.lenX - 1);
      maxy = Math.max(maxy, p.y + p.lenY - 1);
    }

    // apply padding once (same as _boundsOfPlaced)
    return {
      minx: clamp(minx - WALL_PAD, WALL_SHORE_MARGIN, this.srcW - 1 - WALL_SHORE_MARGIN),
      miny: clamp(miny - WALL_PAD, WALL_SHORE_MARGIN, this.srcH - 1 - WALL_SHORE_MARGIN),
      maxx: clamp(maxx + WALL_PAD, WALL_SHORE_MARGIN, this.srcW - 1 - WALL_SHORE_MARGIN),
      maxy: clamp(maxy + WALL_PAD, WALL_SHORE_MARGIN, this.srcH - 1 - WALL_SHORE_MARGIN),
    };
  }

  _drawGhostWalls(b, wallType /* "wood"|"stone" */) {
    // color hint only; actual wall tiles still placed on confirm
    const col = (wallType === "stone") ? 0xcccccc : 0xaa8844;
    this.wallGhostGfx.fillStyle(col, 0.35);

    const doorX = Math.floor((b.minx + b.maxx) / 2);
    const doorY = Math.floor((b.miny + b.maxy) / 2);

    // top/bottom edges (skip door tile in center)
    for (let x = b.minx; x <= b.maxx; x++) {
      if (x !== doorX) this.wallGhostGfx.fillRect(x*SQUARESIZE, b.miny*SQUARESIZE, SQUARESIZE, SQUARESIZE);
      if (x !== doorX) this.wallGhostGfx.fillRect(x*SQUARESIZE, b.maxy*SQUARESIZE, SQUARESIZE, SQUARESIZE);
    }

    // left/right edges (skip door tile in center)
    for (let y = b.miny; y <= b.maxy; y++) {
      if (y !== doorY) this.wallGhostGfx.fillRect(b.minx*SQUARESIZE, y*SQUARESIZE, SQUARESIZE, SQUARESIZE);
      if (y !== doorY) this.wallGhostGfx.fillRect(b.maxx*SQUARESIZE, y*SQUARESIZE, SQUARESIZE, SQUARESIZE);
    }
  }

  _clearWallRing(bounds){
    if (!bounds) return;

    const clearAt = (x, y) => {
      const cell = this.gridData[y][x];
      if (!Array.isArray(cell)) return;
      const overlay = cell[1];
      if (isWallOrDoorOverlay(overlay)) this.gridData[y][x] = cell[0];
    };

    for (let x = bounds.minx; x <= bounds.maxx; x++) {
      clearAt(x, bounds.miny);
      clearAt(x, bounds.maxy);
    }
    for (let y = bounds.miny; y <= bounds.maxy; y++) {
      clearAt(bounds.minx, y);
      clearAt(bounds.maxx, y);
    }
  }

  _rebuildFromTerrain(state){
    // 1) Restore baseline terrain
    for (let y = 0; y < this.srcH; y++) {
      for (let x = 0; x < this.srcW; x++) {
        this.gridData[y][x] = this.terrainGrid[y][x];
      }
    }

    // 2) Clear draftPreview entries from town.js buildingArray
    for (let i = buildingArray.length - 1; i >= 0; i--) {
      if (buildingArray[i]?.[4] === "draftPreview") buildingArray.splice(i, 1);
    }

    // 3) Re-stamp all placed draft buildings at their stored coords
    //    Also rebuild road rings as we stamp.
    const newPlaced = [];
    for (const p of this.placed) {
      if (p.tag !== "draftPreview") continue;
      const type = TILE_TYPES[p.typeKey] ?? p.type;
      if (!type) continue;

      // Stamp footprint + ring roads
      for (let yy = p.y; yy < p.y + type.lenY; yy++) {
        for (let xx = p.x; xx < p.x + type.lenX; xx++) {
          this.gridData[yy][xx] = [TILE_TYPES.road.grid, type.grid];
        }
      }
      buildingArray.push([p.x, p.y, type, 1, "draftPreview"]);
      this._paintRoadRing(p.x, p.y, type.lenX, type.lenY);

      newPlaced.push({
        ...p,
        type,
        lenX: type.lenX,
        lenY: type.lenY
      });
    }
    this.placed = newPlaced;

    // 4) Walls last (so they wrap the new bounds cleanly)
    if (state?.extras?.wall) {
      const est = this.estimateWallTiles();
      state.setWallEstimate(est, true);
      this.applyWall(state);
    } else {
      this._clearWallRing(this._lastWallBounds);
      this._lastWallBounds = null;
    }

    // 5) Re-derive nav blockers from the latest preview layout so moved buildings
    // become the source of truth instead of the original generateTown placement.
    this.syncNavGridFromDraftLayout();

    // 6) Spawn icon road cache stale
    this._roadTilesCache = null;

    // 7) Tell menu state about placed buildings
    this._updatePlacedBuildingsIntoState(state);
  }

  _paintRoad(x,y){
    if (x<0||y<0||x>=this.srcW||y>=this.srcH) return;
    const cell = this.gridData[y][x];

    // If it's an overlay tile:
    if (Array.isArray(cell)) {
      // allow turning the FLOOR into road if the overlay is a wall/door
      // (do NOT touch building overlays)
      const overlay = cell[1];
      if (isWallOrDoorOverlay(overlay)) {
        this.gridData[y][x] = [TILE_TYPES.road.grid, overlay];
      }
      return;
    }

    // normal base tile
    const k = TILE_MAP(cell);
    if (TILE_TYPES[k]?.block) return;
    this.gridData[y][x] = TILE_TYPES.road.grid;
  }


  _paintRoadLine(x0,y0,x1,y1){
    let x = x0, y = y0;
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    while (x !== x1) { this._paintRoad(x,y); x += sx; }
    while (y !== y1) { this._paintRoad(x,y); y += sy; }
    this._paintRoad(x,y);
  }

  _paintRoadRing(gridX, gridY, w, h, pad = ROAD_PAD){
    const minx = clamp(gridX - pad, 0, this.srcW - 1);
    const miny = clamp(gridY - pad, 0, this.srcH - 1);
    const maxx = clamp(gridX + w - 1 + pad, 0, this.srcW - 1);
    const maxy = clamp(gridY + h - 1 + pad, 0, this.srcH - 1);

    for (let x = minx; x <= maxx; x++) { this._paintRoad(x, miny); this._paintRoad(x, maxy); }
    for (let y = miny; y <= maxy; y++) { this._paintRoad(minx, y); this._paintRoad(maxx, y); }
  }


  _placeStructure(gridX, gridY, type, tag = "draftPreview") {
    for (let y = gridY; y < gridY + type.lenY; y++) {
      for (let x = gridX; x < gridX + type.lenX; x++) {

        // allow placing over wall overlays: keep floor as road no matter what
        // (matches town.js behavior)
        this.gridData[y][x] = [TILE_TYPES.road.grid, type.grid];
      }
    }

    buildingArray.push([gridX, gridY, type, 1, tag]);

    const typeKey = type?.name ?? type?.key ?? type?.id ?? "unknown";
    this.placed.push({
      x: gridX, y: gridY,
      originX: gridX, originY: gridY,
      typeKey,
      type,
      lenX: type.lenX, lenY: type.lenY,
      teamnum: 1,
      tag
    });

    // keep your ring so you get the “roads around” too
    this._paintRoadRing(gridX, gridY, type.lenX, type.lenY);

    // IMPORTANT: road cache is now stale (spawn placement uses it)
    this._roadTilesCache = null;
  }

  _clearPlacedBuildings(tag = "draftPreview"){
    // Remove placed buildings from gridData (only those with matching tag in buildingArray)
    // NOTE: We don't attempt to reconstruct the exact floor tiles; we leave floor as-is.
    for (let i = buildingArray.length - 1; i >= 0; i--) {
      const entry = buildingArray[i];
      if (!entry) continue;
      if (entry[4] !== tag) continue;
      const [bx, by, type] = entry;
      for (let y = by; y < by + type.lenY; y++) {
        for (let x = bx; x < bx + type.lenX; x++) {
          const cell = this.gridData[y][x];
          if (Array.isArray(cell)) this.gridData[y][x] = cell[0];
        }
      }
      buildingArray.splice(i, 1);
    }
    this.placed = this.placed.filter(p => p.tag !== tag);
  }

  // ---------- placement rules ----------

  _footprintOk(x, y, type){
    if (x < 0 || y < 0 || x + type.lenX > this.srcW || y + type.lenY > this.srcH) return false;

    for (let yy = y; yy < y + type.lenY; yy++) {
      for (let xx = x; xx < x + type.lenX; xx++) {
        const cell = this.gridData[yy][xx];
        // allow building over wall/door overlays, but not over other overlays/buildings
        if (Array.isArray(cell)) {
          const overlay = cell[1];
          if (!isWallOrDoorOverlay(overlay)) return false;
          // wall/door overlay is fine
        } else {
          const key = TILE_MAP(cell);
          if (TILE_TYPES[key]?.block) return false;
        }
      }
    }

    if (this._touchesWaterBuffer(x, y, type.lenX, type.lenY)) return false;

    return true;
  }

  _randomSpotFor(type, tries = 2000){
    for (let t=0; t<tries; t++) {
      const x = Phaser.Math.RND.between(1, this.srcW - type.lenX - 2);
      const y = Phaser.Math.RND.between(1, this.srcH - type.lenY - 2);
      if (this._footprintOk(x,y,type)) return {x,y};
    }
    return null;
  }

  _getRoadTiles() {
    if (this._roadTilesCache) return this._roadTilesCache;

    const tiles = [];
    for (let y = 0; y < this.gridData.length; y++) {
      for (let x = 0; x < this.gridData[0].length; x++) {
        const cell = this.gridData[y][x];
        if (Array.isArray(cell)) continue;
        if (TILE_MAP(cell) === "road") tiles.push({ x, y });
      }
    }
    this._roadTilesCache = tiles;
    return tiles;
  }

  _seededRng(seedStr) {
    // tiny deterministic RNG from a string seed (stable preview positions)
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) h = (h ^ seedStr.charCodeAt(i)) * 16777619;
    return () => {
      h += h << 13; h ^= h >>> 7; h += h << 3; h ^= h >>> 17; h += h << 5;
      return ((h >>> 0) / 4294967296);
    };
  }

  _safeDestroyIcon(icon) {
    if (!icon) return;

    // If something (old code) attached a pseudo-body, don't let it crash cleanup.
    try {
      if (icon.body && typeof icon.body.destroy === "function") icon.body.destroy();
    } catch (e) {}

    icon.destroy?.();
  }

  _applyPlayerTint(icon, typeKey) {
    // If this icon doesn't have a physics body, we attach a SHIM that:
    // - exposes .team for Player.applyRoleTint
    // - exposes .destroy() so any old cleanup code calling body.destroy won't crash
    const needsShim = !icon.body || typeof icon.body.destroy !== "function";
    if (needsShim) {
      icon._tintShim = icon._tintShim || {
        team: 1,
        destroy: () => {},  // <- critical: prevents `this.body.destroy is not a function`
      };
      icon.body = icon._tintShim;
    }

    icon.body.team = 1;

    // clear role flags
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

    Player.applyRoleTint(icon);
  }

  _getDraftPortraitKey(typeKey) {
    switch ((typeKey || "").toLowerCase()) {
      case "farmer": return "portrait_farmer_healthy";
      case "forager": return "portrait_forager_healthy";
      case "fireman": return "portrait_fireman_healthy";
      case "gunslinger": return "portrait_gunslinger_healthy";
      case "builder": return "portrait_builder_healthy";
      case "blademaster": return "portrait_blademaster_healthy";
      case "brawler": return "portrait_brawler_healthy";
      default: return DEFAULT_PLAYER_PORTRAIT_KEY;
    }
  }

  _getSpawnIconBaseDisplaySize(frameWidth = 1, frameHeight = 1) {
    const maxFrameDimension = Math.max(1, Number(frameWidth || 1), Number(frameHeight || 1));
    const maxDisplayDimension = SQUARESIZE * DRAFT_SPAWN_ICON_TILE_FILL;
    return {
      width: Math.round((Number(frameWidth || 1) / maxFrameDimension) * maxDisplayDimension),
      height: Math.round((Number(frameHeight || 1) / maxFrameDimension) * maxDisplayDimension),
    };
  }

  _applyDraftPortrait(icon, portraitKey) {
    if (!icon) return;
    const key = portraitKey || DEFAULT_PLAYER_PORTRAIT_KEY;
    const frame = this.worldScene.textures.getFrame(key, 0);
    const frameWidth = frame?.width ?? 54;
    const frameHeight = frame?.height ?? 50;
    const { width: displayWidth, height: displayHeight } = this._getSpawnIconBaseDisplaySize(frameWidth, frameHeight);
    const hoverScale = icon._draftSpawnHovered ? DRAFT_SPAWN_ICON_HOVER_SCALE : 1;

    icon.anims?.stop?.();
    icon._draftSpawnBaseDisplayWidth = displayWidth;
    icon._draftSpawnBaseDisplayHeight = displayHeight;
    icon
      .setTexture(key, 0)
      .setDisplaySize(displayWidth * hoverScale, displayHeight * hoverScale);
    icon.clearTint?.();
  }

  _setSpawnIconHoverVisual(icon, hovered = false) {
    if (!icon?.active) return;
    icon._draftSpawnHovered = !!hovered;
    const baseWidth = icon._draftSpawnBaseDisplayWidth ?? icon.displayWidth ?? 0;
    const baseHeight = icon._draftSpawnBaseDisplayHeight ?? icon.displayHeight ?? 0;
    const scale = hovered ? DRAFT_SPAWN_ICON_HOVER_SCALE : 1;
    const targetWidth = baseWidth * scale;
    const targetHeight = baseHeight * scale;

    this.worldScene?.tweens?.killTweensOf?.(icon);
    if (this.worldScene?.tweens && baseWidth > 0 && baseHeight > 0) {
      this.worldScene.tweens.add({
        targets: icon,
        displayWidth: targetWidth,
        displayHeight: targetHeight,
        duration: 90,
        ease: "Quad.easeOut",
      });
    } else {
      icon.setDisplaySize?.(targetWidth, targetHeight);
    }
    icon.setDepth?.((UIDEPTH - 1) + (hovered ? 2 : 0));
  }

  setHoveredSpawnPoint(point = null) {
    if (this._hoveredSpawnPoint === point) return;
    if (this._hoveredSpawnIcon) {
      this._setSpawnIconHoverVisual(this._hoveredSpawnIcon, false);
    }

    this._hoveredSpawnPoint = point || null;
    this._hoveredSpawnIcon = point?._icon || null;
    if (this._hoveredSpawnIcon) {
      this._setSpawnIconHoverVisual(this._hoveredSpawnIcon, true);
    }
  }

  clearSpawnIconHover() {
    this.setHoveredSpawnPoint(null);
  }

  hitTestSpawnIcon(worldX, worldY) {
    if (this._spawnPreviewVisible === false || !Number.isFinite(worldX) || !Number.isFinite(worldY)) return null;

    const zoom = Math.max(0.0001, this.worldScene?.cameras?.main?.zoom ?? 1);
    const pad = DRAFT_SPAWN_ICON_HIT_PAD / zoom;
    let best = null;
    let bestDistance = Infinity;

    for (const point of this.spawnPoints ?? []) {
      const icon = point?._icon;
      if (!icon?.active || icon.visible === false) continue;

      const width = Math.max(icon.displayWidth ?? 0, icon._draftSpawnBaseDisplayWidth ?? 0);
      const height = Math.max(icon.displayHeight ?? 0, icon._draftSpawnBaseDisplayHeight ?? 0);
      const dx = worldX - icon.x;
      const dy = worldY - icon.y;
      if (Math.abs(dx) > width / 2 + pad || Math.abs(dy) > height / 2 + pad) continue;

      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = point;
      }
    }

    return best;
  }

  _setSpawnIcons(points) {
    if (this._hoveredSpawnPoint && !points.includes(this._hoveredSpawnPoint)) {
      this.clearSpawnIconHover();
    }

    // reuse icons
    while (this._spawnIcons.length > points.length) {
      const icon = this._spawnIcons.pop();
      this._safeDestroyIcon(icon);
    }

    for (let i = 0; i < points.length; i++) {
      const p = points[i];

      // tile -> world center
      const worldX = p.x * SQUARESIZE + SQUARESIZE / 2;
      const worldY = p.y * SQUARESIZE + SQUARESIZE / 2;
      const portraitKey = this._getDraftPortraitKey(p.type);

      let icon = this._spawnIcons[i];
      if (!icon) {
        icon = this.worldScene.add.sprite(worldX, worldY, portraitKey, 0)
          .setOrigin(0.5)
          .setDepth(UIDEPTH - 1);
        this._applyDraftPortrait(icon, portraitKey);
        this.spawnIconContainer.add(icon);
        this._spawnIcons[i] = icon;
      } else {
        icon.setPosition(worldX, worldY);
        this._applyDraftPortrait(icon, portraitKey);
      }
      icon._draftSpawnPoint = p;
      p._icon = icon;
      icon.setVisible(this._spawnPreviewVisible !== false);
    }

    this.spawnIconContainer?.setVisible?.(this._spawnPreviewVisible !== false);
    this.spawnIconContainer?.setAlpha?.(this._spawnPreviewVisible === false ? 0 : 1);
  }

  setSpawnPreviewVisible(visible = true) {
    this._spawnPreviewVisible = visible !== false;
    if (!this._spawnPreviewVisible) {
      this.clearSpawnIconHover();
    }
    this.spawnIconContainer?.setVisible?.(this._spawnPreviewVisible);
    this.spawnIconContainer?.setAlpha?.(this._spawnPreviewVisible ? 1 : 0);
    for (const icon of this._spawnIcons ?? []) {
      icon?.setVisible?.(this._spawnPreviewVisible);
    }
  }

  clearDraftPlayerIcons() {
    this.clearSpawnIconHover();

    if (this.spawnIconContainer) {
      this.spawnIconContainer.destroy(true);
      this.spawnIconContainer = null;
    }

    if (this._spawnIcons) {
      for (const icon of this._spawnIcons) this._safeDestroyIcon(icon);
      this._spawnIcons.length = 0;
    }
  }

  /**
   * Call this ONLY when crew changes.
   * crewCounts example: { farmer: 1, forager: 0, gunslinger: 2 }
   */
  updateCrewSpawnPreview(crewCounts) {
    const roadTiles = this._getRoadTiles();
    const total = Object.values(crewCounts).reduce((a, b) => a + b, 0);

    // Build a stable “expanded list” of player types
    const types = [];
    Object.keys(crewCounts).sort().forEach((k) => {
      for (let i = 0; i < (crewCounts[k] || 0); i++) types.push(k);
    });

    if (total === 0 || roadTiles.length === 0) {
      this.spawnPoints = [];
      this._setSpawnIcons([]);
      return;
    }

    // deterministic selection based on crew signature
    const rng = this._seededRng(JSON.stringify(crewCounts));

    // pick unique road tiles if possible
    const chosen = [];
    const used = new Set();

    const pick = () => {
      if (roadTiles.length === 0) return { x: 0, y: 0 };
      for (let tries = 0; tries < 50; tries++) {
        const idx = Math.floor(rng() * roadTiles.length);
        const t = roadTiles[idx];
        const key = `${t.x},${t.y}`;
        if (!used.has(key)) {
          used.add(key);
          return t;
        }
      }
      // fallback: allow reuse if too dense
      return roadTiles[Math.floor(rng() * roadTiles.length)];
    };

    for (let i = 0; i < types.length; i++) {
      const t = pick();
      chosen.push({ x: t.x, y: t.y, type: types[i] });
    }

    this.spawnPoints = chosen;
    this._setSpawnIcons(chosen);
  }

  getSpawnPoints() {
    return this.spawnPoints.slice();
  }

  /**
   * Build the mandatory town preview ONCE.
   * - town tower + storage + clayOven + N houses (N determined by state)
   * - roads rings + simple road connections between building centers
   */
  initBaseTown(state) {
    // wipe any prior draft preview footprint (if you have one)
    this.clearPreview?.();

    // IMPORTANT: if town.js uses module-global buildingArray, clear draft entries
    for (let i = buildingArray.length - 1; i >= 0; i--) {
      if (buildingArray[i]?.[4] === "draftPreview") buildingArray.splice(i, 1);
    }

    // Build the mandatory base using YOUR town style:
    // - house count is based on crew (2 per house)
    // - force at least 1 storage + 1 clay oven
    const housesNeeded = state.minHousesNeeded(); // your existing rule
    state.extras.house    = Math.max(state.extras.house, housesNeeded);
    state.extras.storage  = Math.max(state.extras.storage, 1);
    state.extras.oven     = Math.max(state.extras.oven, 1);

    const buildings = [];

    // Seed with the Town Tower in the center (generateTown grows outward from seed)
    buildings.push(TILE_TYPES.tower);

    // Add houses alternating house1/house2
    for (let i = 0; i < state.extras.house; i++) {
      buildings.push((i % 2 === 0) ? TILE_TYPES.house1 : TILE_TYPES.house2);
    }

    // Mandatory buildings
    buildings.push(TILE_TYPES.storage);
    buildings.push(TILE_TYPES.clayOven);

    // Let the preview layout become the nav source of truth after stamping.
    // Passing null here avoids leaving behind the generator's first blocker pass.
    const res = generateTown(
      this.gridData,     // grid
      buildings,         // buildings list
      1,                 // teamNumber
      Math.floor(this.srcW/2),              // optional start pos if your generateTown supports it; else omit
      Math.floor(this.srcH/2),
      null,
      "draftPreview"     // <-- ADD THIS PARAM in generateTown -> placeBuilding
    );

    // If your generateTown returns a new grid, update both UI + world scene refs.
    if (res) {
      this.gridData = res;
      this.scene.gridData = res;
      this.worldScene.gridData = res;
    }

    // Sync internal placed list from buildingArray tag
    this.placed = [];
    for (const e of buildingArray) {
      if (!e || e[4] !== "draftPreview") continue;
      const [x, y, type] = e;
      this.placed.push({
        x, y,
        lenX: type.lenX,
        lenY: type.lenY,
        originX: x,
        originY: y,
        type,
        typeKey: type?.name,     // ✅ add this
        tag: "draftPreview"
      });

    }

    this.syncNavGridFromDraftLayout();

    // draw once (no per-frame redraw)
    this.fullRepaint?.();
  }

  _updatePlacedBuildingsIntoState(state){
    const list = this.placed
      .filter(p => p.tag === "draftPreview")
      .map(p => ({
        x: p.x,
        y: p.y,
        typeKey: p.typeKey ?? p.type?.name, // ✅ reliable
        teamnum: 1
      }));

    state.setPlacedBuildings(list);
  }

  tryPlaceExtra(typeKey, state, gridX, gridY){
    const type = TILE_TYPES[typeKey];
    if (!type) return { ok:false, reason:"unknown_type" };
    if (!this._footprintOk(gridX, gridY, type)) {
      return {
        ok:false,
        reason: this._touchesWaterBuffer(gridX, gridY, type.lenX, type.lenY) ? SHORE_REASON : "blocked",
      };
    }

    this._placeStructure(gridX, gridY, type, "draftPreview");

    // If wall toggled, repaint wall (simple)
    if (state.extras.wall) {
      const est = this.estimateWallTiles();
      state.setWallEstimate(est, true);
      this.applyWall(state);
    }

    this._updatePlacedBuildingsIntoState(state);
    this.repaintBounds?.({ minx: gridX-6, miny: gridY-6, maxx: gridX+type.lenX+6, maxy: gridY+type.lenY+6 });
    this._rebuildFromTerrain(state);
    this.fullRepaint?.();
    return { ok:true };
  }

  // --- selection / moving ---
  _findPlacedAt(gridX, gridY){
    // hit-test: find top-left entry whose footprint includes (gridX,gridY)
    for (let i = this.placed.length - 1; i >= 0; i--) {
      const p = this.placed[i];
      if (gridX >= p.x && gridX < p.x + p.lenX && gridY >= p.y && gridY < p.y + p.lenY) return p;
    }
    return null;
  }

  tryMoveSelected(selected, state, newX, newY){
    if (!selected) return { ok:false, reason:"no_selection" };

    const can = this._canMoveAt(selected, newX, newY, state);
    if (!can.ok) return { ok:false, reason: can.reason || "blocked" };

    // 1) Update buildingArray entry
    for (let i = 0; i < buildingArray.length; i++) {
      const e = buildingArray[i];
      if (!e || e[4] !== "draftPreview") continue;
      if (e[0] === selected.x && e[1] === selected.y && e[2] === selected.type) {
        e[0] = newX; e[1] = newY;
        break;
      }
    }

    // 2) Update placed record
    selected.x = newX;
    selected.y = newY;

    // 3) Rebuild from baseline terrain so old footprint clears
    this._rebuildFromTerrain(state);

    // ✅ 4) If walls are enabled, walls/doors must be regenerated for the NEW bounds
    if (state?.extras?.wall) {
      const est = this.estimateWallTiles();
      state.setWallEstimate(est, true);
      this.applyWall(state);
    }

    // ✅ 5) Keep state/UI consistent
    this._updatePlacedBuildingsIntoState?.(state);
    this.fullRepaint?.();

    return { ok:true };
  }

  // --- walls ---
  _boundsOfPlaced(){
    const ps = this.placed.filter(p => p.tag === "draftPreview");
    if (!ps.length) return null;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const p of ps) {
      minx = Math.min(minx, p.x);
      miny = Math.min(miny, p.y);
      maxx = Math.max(maxx, p.x + p.lenX - 1);
      maxy = Math.max(maxy, p.y + p.lenY - 1);
    }
    // +1 padding so roads don't get covered by walls
    return {
      minx: clamp(minx - WALL_PAD, WALL_SHORE_MARGIN, this.srcW - 1 - WALL_SHORE_MARGIN),
      miny: clamp(miny - WALL_PAD, WALL_SHORE_MARGIN, this.srcH - 1 - WALL_SHORE_MARGIN),
      maxx: clamp(maxx + WALL_PAD, WALL_SHORE_MARGIN, this.srcW - 1 - WALL_SHORE_MARGIN),
      maxy: clamp(maxy + WALL_PAD, WALL_SHORE_MARGIN, this.srcH - 1 - WALL_SHORE_MARGIN)
    };

  }

  estimateWallTiles(){
    const b = this._boundsOfPlaced();
    if (!b) return 0;
    const w = (b.maxx - b.minx + 1);
    const h = (b.maxy - b.miny + 1);
    return 2*w + 2*h - 4;
  }

  applyWall(state){

    // 0) Clear previous ring (so old perimeter never lingers)
    this._clearWallRing(this._lastWallBounds);

    // compute new bounds
    const b = this._boundsOfPlaced();
    if (!b) { this._lastWallBounds = null; return; }
    this._lastWallBounds = b;

    const isStone = (state.extras.wallType === "stone");

    const wallType = isStone ? TILE_TYPES.wall : TILE_TYPES.woodWall;
    const doorType = isStone ? TILE_TYPES.wall_door : TILE_TYPES.woodWall_door;

    if (!wallType || !doorType) return;

    // 0) Clear previous perimeter wall/door overlays so we don't accumulate doors across re-applies.
    // Only clear OUR wall family overlays; leave other overlays alone.
    const clearIfOurWallFamily = (x, y) => {
      const cell = this.gridData[y][x];
      if (!Array.isArray(cell)) return;

      const overlay = cell[1];
      if (overlay === wallType.grid || overlay === doorType.grid) {
        this.gridData[y][x] = cell[0]; // restore floor
      }
    };

    for (let x = b.minx; x <= b.maxx; x++) {
      clearIfOurWallFamily(x, b.miny);
      clearIfOurWallFamily(x, b.maxy);
    }
    for (let y = b.miny; y <= b.maxy; y++) {
      clearIfOurWallFamily(b.minx, y);
      clearIfOurWallFamily(b.maxx, y);
    }

    // helper: place wall overlay on "free" base tiles
    const placeOverlay = (x, y, overlayGrid) => {
      const cell = this.gridData[y][x];

      // don't place over buildings/arrays (arrays here represent buildings or other blockers)
      if (Array.isArray(cell)) return false;

      // don't place on blocked base tiles (water/rock/pine/etc)
      const key = TILE_MAP(cell);
      if (TILE_TYPES[key]?.block) return false;

      // set overlay while preserving floor
      this.gridData[y][x] = [cell, overlayGrid];
      return true;
    };

    // 1) Paint perimeter walls
    for (let x = b.minx; x <= b.maxx; x++) {
      placeOverlay(x, b.miny, wallType.grid);
      placeOverlay(x, b.maxy, wallType.grid);
    }
    for (let y = b.miny; y <= b.maxy; y++) {
      placeOverlay(b.minx, y, wallType.grid);
      placeOverlay(b.maxx, y, wallType.grid);
    }

    // 2) Place exactly ONE door per side, centered (or nearest-to-center wall cell).
    const midX = Math.floor((b.minx + b.maxx) / 2);
    const midY = Math.floor((b.miny + b.maxy) / 2);

    const placeDoorNear = (startX, startY, dx, dy, maxSteps) => {
      // scan outward from the center so we keep "center of segment" behavior
      for (let step = 0; step <= maxSteps; step++) {
        // + direction
        const x = startX + dx * step;
        const y = startY + dy * step;
        if (x >= 0 && y >= 0 && x < this.srcW && y < this.srcH) {
          const cell = this.gridData[y][x];
          if (Array.isArray(cell) && cell[1] === wallType.grid) {
            this.gridData[y][x] = [cell[0], doorType.grid];
            return true;
          }
        }
        // - direction (skip step 0 because it’s the same as above)
        if (step !== 0) {
          const x = startX - dx * step;
          const y = startY - dy * step;
          if (x >= 0 && y >= 0 && x < this.srcW && y < this.srcH) {
            const cell = this.gridData[y][x];
            if (Array.isArray(cell) && cell[1] === wallType.grid) {
              this.gridData[y][x] = [cell[0], doorType.grid];
              return true;
            }
          }
        }
      }
      return false;
    };

    const maxStepsX = Math.max(1, Math.floor((b.maxx - b.minx) / 2));
    const maxStepsY = Math.max(1, Math.floor((b.maxy - b.miny) / 2));

    // top edge (scan along x)
    placeDoorNear(midX, b.miny, 1, 0, maxStepsX);
    // bottom edge
    placeDoorNear(midX, b.maxy, 1, 0, maxStepsX);
    // left edge (scan along y)
    placeDoorNear(b.minx, midY, 0, 1, maxStepsY);
    // right edge
    placeDoorNear(b.maxx, midY, 0, 1, maxStepsY);
    this._lastGhostBounds = null;
  }

  clearWall(){
    this._clearWallRing(this._lastWallBounds);
    this._lastWallBounds = null;
  }

  _getLayoutMoveRange(state) {
    return Math.max(0, Math.floor(Number(state?.layoutMoveRange ?? DEFAULT_LAYOUT_MOVE_RANGE)));
  }

  _moveDistanceFromOrigin(selected, gridX, gridY) {
    const originX = Number.isFinite(selected?.originX) ? selected.originX : selected?.x;
    const originY = Number.isFinite(selected?.originY) ? selected.originY : selected?.y;
    return Math.abs(gridX - originX) + Math.abs(gridY - originY);
  }

  _canMoveAt(selected, gridX, gridY, state = null) {
    const t = selected?.type;
    if (!t) return { ok:false, reason:"bad selected" };

    const moveRange = this._getLayoutMoveRange(state);
    const moveDistance = this._moveDistanceFromOrigin(selected, gridX, gridY);
    if (moveDistance > moveRange) {
      return { ok:false, reason:"out of range", distance: moveDistance, range: moveRange };
    }

    // 1) Footprint check, BUT allow overlap with selected’s current footprint
    if (gridX < 0 || gridY < 0 || gridX + t.lenX > this.srcW || gridY + t.lenY > this.srcH) {
      return { ok:false, reason:"oob" };
    }

    const selMinX = selected.x;
    const selMinY = selected.y;
    const selMaxX = selected.x + selected.lenX - 1;
    const selMaxY = selected.y + selected.lenY - 1;

    for (let yy = gridY; yy < gridY + t.lenY; yy++) {
      for (let xx = gridX; xx < gridX + t.lenX; xx++) {
        const cell = this.gridData[yy][xx];

        if (Array.isArray(cell)) {
          const overlay = cell[1];

          // allow building over wall/door overlays
          if (isWallOrDoorOverlay(overlay)) continue;

          // ✅ allow overlap with the selected building’s own current footprint
          const inSelectedNow = (xx >= selMinX && xx <= selMaxX && yy >= selMinY && yy <= selMaxY);
          if (inSelectedNow) continue;

          return { ok:false, reason:"occupied" };
        } else {
          const key = TILE_MAP(cell);
          if (TILE_TYPES[key]?.block) return { ok:false, reason:"terrain blocked" };
        }
      }
    }

    if (this._touchesWaterBuffer(gridX, gridY, t.lenX, t.lenY)) {
      return { ok:false, reason:SHORE_REASON };
    }

    // 2) Must be 1 tile away from OTHER buildings (ignore selected itself)
    const expanded = { x: gridX - 1, y: gridY - 1, w: t.lenX + 2, h: t.lenY + 2 };
    const ps = this.placed.filter(p => p.tag === "draftPreview");

    for (const b of ps) {
      if (b === selected) continue;
      const br = { x: b.x, y: b.y, w: b.lenX, h: b.lenY };
      if (this._rectsOverlap(expanded, br)) return { ok:false, reason:"too close to building" };
    }

    return { ok:true };
  }

  setMoveHover(selected, state, gridX, gridY) {

    const ok = this._canMoveAt(selected, gridX, gridY, state).ok;
    const moveKey = `${gridX},${gridY}`;
    const changed = gridX !== selected?.x || gridY !== selected?.y;
    if (ok && changed) {
      if (moveKey !== this._lastMoveHoverKey) {
        AudioManager.playLayoutMove();
      }
      this._lastMoveHoverKey = moveKey;
    } else {
      this._lastMoveHoverKey = null;
    }

    // draw hover rect at target location using selected footprint
    const t = selected.type;
    const x = gridX * SQUARESIZE;
    const y = gridY * SQUARESIZE;
    const w = t.lenX * SQUARESIZE;
    const h = t.lenY * SQUARESIZE;

    this.hoverGfx.clear();
    this.hoverGfx.lineStyle(3, ok ? 0x00ff00 : 0xff0000, 1);
    this.hoverGfx.strokeRect(x, y, w, h);
    this.hoverGfx.fillStyle(ok ? 0x00ff00 : 0xff0000, 0.10);
    this.hoverGfx.fillRect(x, y, w, h);

    // ghost walls if enabled: union "placed without selected" + "moved-to rect"
    if (!state?.extras?.wall || !ok) return;

    const movedRect = { x: gridX, y: gridY, w: t.lenX, h: t.lenY };

    // bounds of everything else (excluding the selected building)
    const b0 = this._boundsOfPlacedExcluding(selected);

    // base bounds is either existing (without selected) or just movedRect
    let minx = movedRect.x;
    let miny = movedRect.y;
    let maxx = movedRect.x + movedRect.w - 1;
    let maxy = movedRect.y + movedRect.h - 1;

    if (b0) {
      // IMPORTANT: b0 is already padded, so unpad to real footprint bounds first
      const unpad = {
        minx: b0.minx + WALL_PAD,
        miny: b0.miny + WALL_PAD,
        maxx: b0.maxx - WALL_PAD,
        maxy: b0.maxy - WALL_PAD,
      };

      minx = Math.min(unpad.minx, movedRect.x);
      miny = Math.min(unpad.miny, movedRect.y);
      maxx = Math.max(unpad.maxx, movedRect.x + movedRect.w - 1);
      maxy = Math.max(unpad.maxy, movedRect.y + movedRect.h - 1);
    }

    // apply padding ONCE for the ghost ring
    const bounds = {
      minx: clamp(minx - WALL_PAD, WALL_SHORE_MARGIN, this.srcW - 1 - WALL_SHORE_MARGIN),
      miny: clamp(miny - WALL_PAD, WALL_SHORE_MARGIN, this.srcH - 1 - WALL_SHORE_MARGIN),
      maxx: clamp(maxx + WALL_PAD, WALL_SHORE_MARGIN, this.srcW - 1 - WALL_SHORE_MARGIN),
      maxy: clamp(maxy + WALL_PAD, WALL_SHORE_MARGIN, this.srcH - 1 - WALL_SHORE_MARGIN),
    };

    // before drawing ghost
    if (this._sameBounds(bounds, this._lastGhostBounds)) {
      // bounds unchanged -> don't redraw, and crucially don't leave ghost over finalized walls
      // Option A: keep as-is (no work)
      // Option B (recommended): if walls are already applied for these bounds, hide ghost
      if (this._sameBounds(bounds, this._lastWallBounds)) {
        this.wallGhostGfx.clear();
      }
      return;
    }

    this._lastGhostBounds = bounds;

    // if these bounds match already-applied wall bounds, don't show ghost
    if (this._sameBounds(bounds, this._lastWallBounds)) {
      this.wallGhostGfx.clear();
      return;
    }

    this.wallGhostGfx.clear();
    this._drawGhostWalls(bounds, state.extras.wallType);
  }

  // --- helpers for menu hit-tests ---
  hitTestPlaced(gridX, gridY){
    return this._findPlacedAt(gridX, gridY);
  }

  _refreshSpawnIfInvalid(crewCounts) {
    if (!this.spawnPoints || this.spawnPoints.length === 0) return;

    const road = new Set(this._getRoadTiles().map(t => `${t.x},${t.y}`));

    // if ANY spawn point is no longer on a road, regenerate all (simple + deterministic)
    for (const p of this.spawnPoints) {
      if (!road.has(`${p.x},${p.y}`)) {
        this.updateCrewSpawnPreview(crewCounts);
        return;
      }
    }

    // still valid -> just ensure icons positioned correctly
    this._setSpawnIcons(this.spawnPoints);
  }

  destroy(){
    this.clearDraftPlayerIcons?.();

    this.hoverGfx?.destroy?.();
    this.wallGhostGfx?.destroy?.();

    this.spawnIconContainer?.destroy?.(true);

    this.hoverGfx = null;
    this.wallGhostGfx = null;
    this.spawnIconContainer = null;
    this._spawnIcons = [];
  }

}
