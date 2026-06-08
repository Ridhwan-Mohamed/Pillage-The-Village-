// VisibilitySystem.js — simple & efficient: full-view rebuilds; lights & vision chunked; no "explored" persistence.

import Phaser from "phaser";
import {
  CHUNK_SIZE,
  SQUARESIZE,
  WORLD_DIMENSIONX,
  WORLD_DIMENSIONY,
  UIDEPTH,
  TILE_TYPES,
  TILE_MAP,
  BLOCKDEPTH,
} from "../constants";
import { Map as GameMap } from "../map";

function currentMapWidth() {
  return Math.max(1, GameMap.grid?.[0]?.length || WORLD_DIMENSIONX);
}

function currentMapHeight() {
  return Math.max(1, GameMap.grid?.length || WORLD_DIMENSIONY);
}

function idx(x, y) { return y * VisibilitySystem._mapW + x; }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < VisibilitySystem._mapW && y < VisibilitySystem._mapH; }

export class VisibilitySystem {
  /** Phaser.Scene */
  static scene;
  static requestedViewRect = null;
  static _resizeHandler = null;

  // --- map-scale logic grids ---
  static blockerGrid;             // Uint8Array (0/1) — pines/rocks
  static occlusionGrid;           // Float32Array (0..1)

  // --- inputs ---
  static ambient = 1.0;           // 0..1
  static lightSources = [];       // [{id, x,y,r,brightness}]
  static visionBubbles = [];      // [{id, x,y,r,boost}]

  // --- render state (single view RT) ---
  static viewRect = null;         // {gx0, gy0, tilesW, tilesH}
  static viewRT = null;
  static overviewMode = false;
  static _mapW = WORLD_DIMENSIONX;
  static _mapH = WORLD_DIMENSIONY;
  static ambientTintColor = 0x020716;

  // --- UI cam opt-out ---
  static uiCam = null;
  static registerUICamera(cam) {
    this.uiCam = cam;
    if (this.viewRT) cam.ignore(this.viewRT);
  }

  static setOverviewMode(enabled) {
    this.overviewMode = !!enabled;
    if (!this.viewRT) return;
    this.viewRT
      .setDepth(this.overviewMode ? (UIDEPTH - 1.1) : (UIDEPTH - 3))
      .setAlpha(this.overviewMode ? 0.96 : 1);
  }

  // --- tunables ---
  static useOcclusion = false;
  static dayCutoff = 1; // >= this = daytime (everything visible)

  // Discrete occlusion rings; >=4 → black
  static occlusionMinShade = 0.0;  // final shade = 1 - O; O=1 => black
  static occFirstRing  = 0.15;
  static occSecondRing = 0.35;
  static occThirdRing  = 0.65;
  static occFourthRing = 0.90;

  // --- per-view scratch (resized to tilesW*tilesH) ---
  static _fog   = new Float32Array(0);   // will store (ambient + boost) from vision bubbles
  static _light = new Float32Array(0);   // ambient + lights
  static _cap   = 0;

  // === Fog of War helpers (world-space, chunk-accelerated) ===
  static playerTeam = 1;           // local player’s team id
  static pendingRebuild = false;   // micro-batch full rebuilds within a frame

  // --- Light spatial index (by CHUNK_SIZE tiles) ---
  static _lightChunks = new Map();   // key "cx,cy" -> array of lights
  static _lightChunkSize = CHUNK_SIZE;
  static _lightIdSeq = 1;
  static _lightKey(cx, cy) { return `${cx},${cy}`; }
  static _lightAABBChunks(gx0, gy0, gx1, gy1) {
    const s = this._lightChunkSize;
    const cx0 = Math.floor(gx0 / s), cy0 = Math.floor(gy0 / s);
    const cx1 = Math.floor(gx1 / s), cy1 = Math.floor(gy1 / s);
    const out = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) out.push({cx,cy});
    return out;
  }

  // --- Vision spatial index (by CHUNK_SIZE tiles) ---
  static _visionChunks = new Map();  // key "cx,cy" -> array of bubbles
  static _visionChunkSize = CHUNK_SIZE;
  static _visionIdSeq = 1;
  static _visionKey(cx, cy) { return `${cx},${cy}`; }
  static _visionAABBChunks(gx0, gy0, gx1, gy1) {
    const s = this._visionChunkSize;
    const cx0 = Math.floor(gx0 / s), cy0 = Math.floor(gy0 / s);
    const cx1 = Math.floor(gx1 / s), cy1 = Math.floor(gy1 / s);
    const out = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) out.push({cx,cy});
    return out;
  }

  // ===== Init =====
  static init(scene) {
    if (this._resizeHandler && this.scene?.scale) {
      this.scene.scale.off("resize", this._resizeHandler);
    }

    this.scene = scene;

    this._ensureLogicGrids(true);

    this._resizeHandler = () => {
      if (!this.requestedViewRect) return;
      const { gx0, gy0, tilesW, tilesH } = this.requestedViewRect;
      this.setViewRect(gx0, gy0, tilesW, tilesH);
      this._rebuildViewFull();
    };
    this.scene.scale?.on?.("resize", this._resizeHandler);

    if (this.viewRect) {
      this._ensureViewRT();
      this._rebuildViewFull();
    }
  }

  static reset() {
    if (this._resizeHandler && this.scene?.scale) {
      this.scene.scale.off("resize", this._resizeHandler);
    }

    this.scene = null;
    this.requestedViewRect = null;
    this.viewRect = null;
    this._resizeHandler = null;
    this.uiCam = null;
    this.overviewMode = false;
    this.ambient = 1.0;
    this.lightSources = [];
    this.visionBubbles = [];
    this._lightChunks.clear();
    this._visionChunks.clear();

    if (this.viewRT) {
      try { this.viewRT.destroy(true); } catch {}
    }
    this.viewRT = null;
    this._fog = new Float32Array(0);
    this._light = new Float32Array(0);
    this._cap = 0;
    this._mapW = WORLD_DIMENSIONX;
    this._mapH = WORLD_DIMENSIONY;
    this.ambientTintColor = 0x020716;
  }

  // ===== Public API =====

  static _ensureLogicGrids(forceRebuild = false) {
    const width = currentMapWidth();
    const height = currentMapHeight();
    const N = width * height;
    const needsRebuild =
      forceRebuild ||
      width !== this._mapW ||
      height !== this._mapH ||
      !this.blockerGrid ||
      this.blockerGrid.length !== N ||
      !this.occlusionGrid ||
      this.occlusionGrid.length !== N;

    if (!needsRebuild) return false;

    this._mapW = width;
    this._mapH = height;
    this.blockerGrid = new Uint8Array(N);
    this.occlusionGrid = new Float32Array(N);
    this._buildInitialBlockers();
    this._recomputeAllOcclusion();
    return true;
  }

  // Called by your map reDraw: define current view rect (tile coords)
  static setViewRect(gx0, gy0, tilesW, tilesH) {
    this._ensureLogicGrids();
    this.requestedViewRect = { gx0, gy0, tilesW, tilesH };
    this.viewRect = this._applyShellPadding(this.requestedViewRect);
    this._ensureViewRT();
    // full paint is triggered by callers (ambient/occluder/unit/etc.)
  }

  // Ambient change → rebuild full mask
  static setAmbient(value01, tintColor = null) {
    const v = Phaser.Math.Clamp(value01, 0, 1);
    const nextTint = tintColor != null && Number.isFinite(Number(tintColor)) ? Number(tintColor) : this.ambientTintColor;
    const tintChanged = nextTint !== this.ambientTintColor;
    if (!tintChanged && Math.abs(v-this.ambient) < 0.05) return;
    if (!tintChanged && v === this.ambient && this.viewRT) return;
    this.ambient = v;
    this.ambientTintColor = nextTint;
    GameMap.setOuterWaterAmbience?.(v, nextTint);
    this._rebuildViewFull();
  }

  // ---------- Lights (chunked) ----------
  static setLightSources(sources /* [{x,y,r,brightness}] */) {
    this.lightSources = [];
    this._lightChunks.clear();
    if (!sources) { this._rebuildViewFull(); return; }
    for (const s of sources) this.addLightSource(s, /*noRepaint=*/true);
    if (this.ambient >= this.dayCutoff) return;   // ⬅️ skip daytime rebuild
    this._rebuildViewFull();
  }

  static addLightSource(light, noRepaint = false) {
    const id = this._lightIdSeq++;
    const s = { id, brightness: 1, ...light };
    this.lightSources.push(s);

    const gx0 = Math.floor(s.x - s.r), gy0 = Math.floor(s.y - s.r);
    const gx1 = Math.ceil (s.x + s.r), gy1 = Math.ceil (s.y + s.r);
    for (const {cx,cy} of this._lightAABBChunks(gx0, gy0, gx1, gy1)) {
      const k = this._lightKey(cx,cy);
      if (!this._lightChunks.has(k)) this._lightChunks.set(k, []);
      this._lightChunks.get(k).push(s);
    }
    if (!noRepaint && this.ambient < this.dayCutoff) this._rebuildViewFull();
    return id;
  }

  static removeLightById(id) {
    this.lightSources = this.lightSources.filter(s => s.id !== id);
    for (const [k, arr] of this._lightChunks) {
      const n = arr.filter(s => s.id !== id);
      if (n.length) this._lightChunks.set(k, n); else this._lightChunks.delete(k);
    }
    if (this.ambient < this.dayCutoff) this._rebuildViewFull();
  }

  // ---------- Vision (chunked; slight boost over ambient) ----------
  // boost = additional brightness over ambient within the bubble (default 0.1)
  static addVisionBubble(b /* {x,y,r,boost?} */, noRepaint = false) {
    const id = this._visionIdSeq++;
    const s = { id, boost: 0.1, ...b };
    this.visionBubbles.push(s);

    const gx0 = Math.floor(s.x - s.r), gy0 = Math.floor(s.y - s.r);
    const gx1 = Math.ceil (s.x + s.r), gy1 = Math.ceil (s.y + s.r);
    for (const {cx,cy} of this._visionAABBChunks(gx0, gy0, gx1, gy1)) {
      const k = this._visionKey(cx,cy);
      if (!this._visionChunks.has(k)) this._visionChunks.set(k, []);
      this._visionChunks.get(k).push(s);
    }
    if (!noRepaint) this._rebuildViewFull();
    return id;
  }

  static moveVisionBubble(id, x, y, r) {
    const s = this.visionBubbles.find(v => v.id === id);
    if (!s) return;
    // remove from old chunks
    const ogx0 = Math.floor(s.x - s.r), ogy0 = Math.floor(s.y - s.r);
    const ogx1 = Math.ceil (s.x + s.r), ogy1 = Math.ceil (s.y + s.r);
    for (const {cx,cy} of this._visionAABBChunks(ogx0, ogy0, ogx1, ogy1)) {
      const k = this._visionKey(cx,cy);
      const arr = this._visionChunks.get(k);
      if (!arr) continue;
      const n = arr.filter(v => v.id !== id);
      if (n.length) this._visionChunks.set(k, n); else this._visionChunks.delete(k);
    }
    // update
    s.x = x; s.y = y; if (r != null) s.r = r;
    // add to new chunks
    const ngx0 = Math.floor(s.x - s.r), ngy0 = Math.floor(s.y - s.r);
    const ngx1 = Math.ceil (s.x + s.r), ngy1 = Math.ceil (s.y + s.r);
    for (const {cx,cy} of this._visionAABBChunks(ngx0, ngy0, ngx1, ngy1)) {
      const k = this._visionKey(cx,cy);
      if (!this._visionChunks.has(k)) this._visionChunks.set(k, []);
      this._visionChunks.get(k).push(s);
    }
    // only rebuild if intersects view
    if (this.viewRect) {
      const { gx0, gy0, tilesW, tilesH } = this.viewRect;
      const vx0 = gx0, vy0 = gy0;
      const vx1 = gx0 + tilesW - 1, vy1 = gy0 + tilesH - 1;
      const ax0 = s.x - s.r, ay0 = s.y - s.r;
      const ax1 = s.x + s.r, ay1 = s.y + s.r;
      const hit = !(ax1 < vx0 || ax0 > vx1 || ay1 < vy0 || ay0 > vy1);
      if (hit && this.ambient < this.dayCutoff) this._markDirty();
    }
  }

  static removeVisionBubble(id) {
    this.visionBubbles = this.visionBubbles.filter(v => v.id !== id);
    for (const [k, arr] of this._visionChunks) {
      const n = arr.filter(v => v.id !== id);
      if (n.length) this._visionChunks.set(k, n); else this._visionChunks.delete(k);
    }
    if (this.ambient < this.dayCutoff) this._rebuildViewFull();
  }

  static clearVisionBubbles() {
    this.visionBubbles = [];
    this._visionChunks.clear();
    this._rebuildViewFull();
  }

  // Bulk-remove light/vision sources whose centers are inside a tile rect.
  // Useful for hard world resets (e.g., fort teardown) where sprites may be
  // destroyed without running per-object destroy hooks.
  static clearSourcesInBounds(gx0, gy0, gx1, gy1) {
    const minx = Math.min(gx0, gx1);
    const maxx = Math.max(gx0, gx1);
    const miny = Math.min(gy0, gy1);
    const maxy = Math.max(gy0, gy1);

    const inside = (s) => {
      if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return false;
      const sx = Math.floor(s.x);
      const sy = Math.floor(s.y);
      return sx >= minx && sx <= maxx && sy >= miny && sy <= maxy;
    };

    const removedLightIds = new Set();
    const removedVisionIds = new Set();

    this.lightSources = (this.lightSources || []).filter((s) => {
      const hit = inside(s);
      if (hit) removedLightIds.add(s.id);
      return !hit;
    });

    this.visionBubbles = (this.visionBubbles || []).filter((s) => {
      const hit = inside(s);
      if (hit) removedVisionIds.add(s.id);
      return !hit;
    });

    if (!removedLightIds.size && !removedVisionIds.size) return;

    // Rebuild spatial chunk indexes from kept sources.
    this._lightChunks.clear();
    for (const s of this.lightSources) {
      const gx0l = Math.floor(s.x - s.r), gy0l = Math.floor(s.y - s.r);
      const gx1l = Math.ceil(s.x + s.r), gy1l = Math.ceil(s.y + s.r);
      for (const { cx, cy } of this._lightAABBChunks(gx0l, gy0l, gx1l, gy1l)) {
        const k = this._lightKey(cx, cy);
        if (!this._lightChunks.has(k)) this._lightChunks.set(k, []);
        this._lightChunks.get(k).push(s);
      }
    }

    this._visionChunks.clear();
    for (const s of this.visionBubbles) {
      const gx0v = Math.floor(s.x - s.r), gy0v = Math.floor(s.y - s.r);
      const gx1v = Math.ceil(s.x + s.r), gy1v = Math.ceil(s.y + s.r);
      for (const { cx, cy } of this._visionAABBChunks(gx0v, gy0v, gx1v, gy1v)) {
        const k = this._visionKey(cx, cy);
        if (!this._visionChunks.has(k)) this._visionChunks.set(k, []);
        this._visionChunks.get(k).push(s);
      }
    }

    // Keep scene-level tracking sets in sync if present.
    const scene = this.scene;
    if (scene?.__structureLightIds && removedLightIds.size) {
      for (const id of removedLightIds) scene.__structureLightIds.delete(id);
    }
    if (scene?.__structureVisionIds && removedVisionIds.size) {
      for (const id of removedVisionIds) scene.__structureVisionIds.delete(id);
    }

    this._rebuildViewFull();
  }

  // ===== Gameplay hooks =====

  // Use this from Player movement: pass NEW grid coords (center of bubble), radius
  static onUnitMoved(gxNew, gyNew, r = 6, visionId = null) {
    if (visionId != null) {
      this.moveVisionBubble(visionId, gxNew, gyNew, r);
    } else {
      // fallback: create a transient bubble
      this.addVisionBubble({ x: gxNew, y: gyNew, r, boost: 0.1 });
    }
  }

  // Occluder (e.g., pine/rock) edits → recompute occlusion near change, then full repaint
  static onOccluderChangedRect(gx, gy, wTiles, hTiles, isBlock) {
    this._ensureLogicGrids();
    const mapW = this._mapW;
    const mapH = this._mapH;
    const x0 = Math.max(0, gx);
    const y0 = Math.max(0, gy);
    const x1 = Math.min(mapW - 1, gx + wTiles - 1);
    const y1 = Math.min(mapH - 1, gy + hTiles - 1);
    if (x1 < x0 || y1 < y0) return;

    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
      this.blockerGrid[idx(x, y)] = isBlock ? 1 : 0;

    const pad = 12;
    const ax0 = Math.max(0, x0 - pad), ay0 = Math.max(0, y0 - pad);
    const ax1 = Math.min(mapW - 1, x1 + pad);
    const ay1 = Math.min(mapH - 1, y1 + pad);
    this._floodExteriorToOcclusion(ax0, ay0, ax1, ay1);

    this._rebuildViewFull();
  }

  // Return true if (gx,gy) is inside ANY current vision bubble (night only)
  static pointInAnyVision(gx, gy) {
    if (this.ambient >= this.dayCutoff) return true; // day: everything visible
    const s = this._visionChunkSize;
    const cx = Math.floor(gx / s), cy = Math.floor(gy / s);
    const arr = this._visionChunks.get(this._visionKey(cx, cy));
    if (!arr || arr.length === 0) return false;
    for (const v of arr) {
      const dx = gx - v.x, dy = gy - v.y;
      if (dx*dx + dy*dy <= v.r*v.r) return true;
    }
    return false;
  }

  // Apply FoW to a sprite (cheap: O(k) where k = few bubbles in its chunk)
  static applyFoWToSprite(sprite, allVisibile=false) {
    if (!sprite?.body) return;
    if (this.ambient >= this.dayCutoff || allVisibile) { sprite.setVisible(true); return; }

    // Your units are always visible to you
    if (sprite.body.team === this.playerTeam) { sprite.setVisible(true); return; }

    const gx = Math.floor(sprite.x / SQUARESIZE);
    const gy = Math.floor(sprite.y / SQUARESIZE);
    const isVisible = this.pointInAnyVision(gx, gy)
    const inView = GameMap.cameraBounds?.contains(sprite.x, sprite.y);
    sprite.setVisible(inView); // Will not draw if false
    if(!inView || !isVisible){
      sprite.setVisible(false);
    }else {
      sprite.setVisible(true);
    }
  }

  // ===== Internals =====

  static _markDirty() {
    if (this.pendingRebuild) return;
    if (!this.scene?.time) return;
    this.pendingRebuild = true;
    // defer to end-of-tick so many moves coalesce into a single rebuild
    this.scene.time.delayedCall(0, () => {
      this.pendingRebuild = false;
      if (this.ambient < this.dayCutoff) this._rebuildViewFull();
    });
  }

  static _applyShellPadding(rect) {
    if (!rect) return rect;

    const outerWaterRect = GameMap.getOuterWaterTileRect?.() ?? null;
    if (outerWaterRect) {
      const minX = Math.min(rect.gx0, outerWaterRect.gx0);
      const minY = Math.min(rect.gy0, outerWaterRect.gy0);
      const maxX = Math.max(rect.gx0 + rect.tilesW, outerWaterRect.gx0 + outerWaterRect.tilesW);
      const maxY = Math.max(rect.gy0 + rect.tilesH, outerWaterRect.gy0 + outerWaterRect.tilesH);
      return {
        gx0: minX,
        gy0: minY,
        tilesW: Math.max(1, maxX - minX),
        tilesH: Math.max(1, maxY - minY),
      };
    }

    const padTiles = this._getShellPaddingTiles();
    return {
      gx0: rect.gx0 - padTiles,
      gy0: rect.gy0 - padTiles,
      tilesW: rect.tilesW + padTiles * 2,
      tilesH: rect.tilesH + padTiles * 2,
    };
  }

  static _getShellPaddingTiles() {
    const scene = this.scene;
    if (!scene?.scale) return 32;

    const screenTilesX = Math.ceil((scene.scale.width || 0) / SQUARESIZE);
    const screenTilesY = Math.ceil((scene.scale.height || 0) / SQUARESIZE);
    const screenTiles = Math.max(screenTilesX, screenTilesY, 1);

    return Math.max(32, Math.ceil(screenTiles * 2.5));
  }

  static _ensureViewRT() {
    if (!this.viewRect || !this.scene?.add) return;
    const { gx0, gy0, tilesW, tilesH } = this.viewRect;
    const needNew =
      !this.viewRT ||
      this.viewRT.scene !== this.scene ||
      this.viewRT.width  !== tilesW ||
      this.viewRT.height !== tilesH;

    if (needNew) {
      if (this.viewRT) this.viewRT.destroy(true);
      this.viewRT = this.scene.add.renderTexture(0, 0, tilesW, tilesH)
        .setOrigin(0, 0)
        .setDepth(this.overviewMode ? (UIDEPTH - 1.1) : (UIDEPTH - 3))
        .setScrollFactor(1, 1);
      this.viewRT.texture?.setFilter?.(Phaser.Textures.FilterMode.NEAREST);
      this.viewRT.setDisplaySize(tilesW * SQUARESIZE, tilesH * SQUARESIZE);
      this.viewRT.setAlpha(this.overviewMode ? 0.96 : 1);
      if (this.uiCam?.ignore) this.uiCam.ignore(this.viewRT);

      // resize scratch
      const cap = tilesW * tilesH;
      this._fog   = new Float32Array(cap);
      this._light = new Float32Array(cap);
      this._cap   = cap;
    }

    this.viewRT.setPosition(gx0 * SQUARESIZE, gy0 * SQUARESIZE);
    this.viewRT.setDepth(this.overviewMode ? (UIDEPTH - 1.1) : (UIDEPTH - 3));
    this.viewRT.gx0 = gx0; this.viewRT.gy0 = gy0;
    this.viewRT.tilesW = tilesW; this.viewRT.tilesH = tilesH;
  }

  /** Full rebuild of the current view */
  static _rebuildViewFull() {
    if (!this.viewRect) return;
    this._ensureLogicGrids();
    this._ensureViewRT();
    if (!this.viewRT) return;

    // Daytime fast-path: fully clear; blocker occlusion no longer affects rendering.
    if (this.ambient >= this.dayCutoff) {
      this.viewRT.clear();
      return;
    }

    const { gx0, gy0, tilesW, tilesH } = this.viewRect;
    const vx0 = gx0, vy0 = gy0;
    const vx1 = gx0 + tilesW - 1, vy1 = gy0 + tilesH - 1;

    const rt = this.viewRT;
    rt.clear();

    // 1) Vision (chunked): start at 0; set to ambient+boost within bubbles
    this._fog.fill(0, 0, tilesW * tilesH);

    const visCandidates = [];
    const visSeen = new Set();
    for (const {cx,cy} of this._visionAABBChunks(vx0, vy0, vx1, vy1)) {
      const k = this._visionKey(cx,cy);
      const arr = this._visionChunks.get(k);
      if (!arr) continue;
      for (const s of arr) {
        if (visSeen.has(s.id)) continue;
        const ax0 = Math.floor(s.x - s.r), ay0 = Math.floor(s.y - s.r);
        const ax1 = Math.ceil (s.x + s.r), ay1 = Math.ceil (s.y + s.r);
        if (ax1 < vx0 || ax0 > vx1 || ay1 < vy0 || ay0 > vy1) continue;
        visSeen.add(s.id);
        visCandidates.push(s);
      }
    }

    for (const V of visCandidates) {
      const { x, y, r, boost = 1 } = V;
      const minx = Math.max(vx0, Math.floor(x - r));
      const maxx = Math.min(vx1, Math.ceil (x + r));
      const miny = Math.max(vy0, Math.floor(y - r));
      const maxy = Math.min(vy1, Math.ceil (y + r));
      const r2 = r * r;
      const target = Phaser.Math.Clamp(this.ambient + boost, 0, 1);

      for (let gy = miny; gy <= maxy; gy++) {
        const rowOff = (gy - vy0) * tilesW;
        for (let gx = minx; gx <= maxx; gx++) {
          const dx = gx - x, dy = gy - y;
          if (dx*dx + dy*dy <= r2) {
            const j = rowOff + (gx - vx0);
            if (target > this._fog[j]) this._fog[j] = target;
          }
        }
      }
    }

    // 2) Light (chunked): ambient base + lights
    this._light.fill(this.ambient, 0, tilesW * tilesH);

    const lightCandidates = [];
    const lightSeen = new Set();
    for (const {cx,cy} of this._lightAABBChunks(vx0, vy0, vx1, vy1)) {
      const k = this._lightKey(cx,cy);
      const arr = this._lightChunks.get(k);
      if (!arr) continue;
      for (const s of arr) {
        if (lightSeen.has(s.id)) continue;
        const ax0 = Math.floor(s.x - s.r), ay0 = Math.floor(s.y - s.r);
        const ax1 = Math.ceil (s.x + s.r), ay1 = Math.ceil (s.y + s.r);
        if (ax1 < vx0 || ax0 > vx1 || ay1 < vy0 || ay0 > vy1) continue;
        lightSeen.add(s.id);
        lightCandidates.push(s);
      }
    }

    for (const L of lightCandidates) {
      const { x, y, r, brightness = 1.0 } = L;
      const minx = Math.max(vx0, Math.floor(x - r));
      const maxx = Math.min(vx1, Math.ceil (x + r));
      const miny = Math.max(vy0, Math.floor(y - r));
      const maxy = Math.min(vy1, Math.ceil (y + r));
      const r2 = r * r;

      for (let gy = miny; gy <= maxy; gy++) {
        const rowOff = (gy - vy0) * tilesW;
        for (let gx = minx; gx <= maxx; gx++) {
          const dx = gx - x, dy = gy - y;
          const d2 = dx*dx + dy*dy;
          if (d2 > r2) continue;
          const fall = 1 - Math.sqrt(d2) / r;          // linear falloff
          const add = Phaser.Math.Clamp(brightness * fall, 0, 1);
          const j = rowOff + (gx - vx0);
          if (add > this._light[j]) this._light[j] = add;
        }
      }
    }

    // 3) Draw final darkness from ambient, vision, and lights only.
    const gfx = this.scene.add.graphics();
    const ambientDark = 1 - Phaser.Math.Clamp(this.ambient, 0, 1);
    const detailedOuterAmbienceActive =
      !this.overviewMode &&
      GameMap.outerWaterLayer?.visible !== false &&
      GameMap.outerWaterAmbienceOverlay?.visible === true;

    for (let ly = 0; ly < tilesH; ly++) {
      const rowOff = ly * tilesW;
      for (let lx = 0; lx < tilesW; lx++) {
        const gx = gx0 + lx;
        const gy = gy0 + ly;
        const j  = rowOff + lx;
        const inMapBounds = inBounds(gx, gy);

        if (!inMapBounds && detailedOuterAmbienceActive) continue;

        const finalDark = inMapBounds
          ? 1 - Phaser.Math.Clamp(Math.max(this._fog[j], this._light[j]), 0, 1)
          : ambientDark;
        if (finalDark <= 0) continue;

        // NOTE: 1x1 grid pixel; RT is scaled to world size
        gfx.fillStyle(this.ambientTintColor, finalDark);
        gfx.fillRect(lx, ly, 1, 1);
      }
    }
    rt.draw(gfx, 0, 0);
    gfx.destroy();
  }

  // ===== Occlusion (discrete rings) =====

  static _buildInitialBlockers() {
    const grid = GameMap.grid;
    if (!grid) return;
    for (let y = 0; y < this._mapH; y++) {
      for (let x = 0; x < this._mapW; x++) {
        const cell = grid[y]?.[x];
        if (cell == null) continue;
        const code = GameMap.grabDepth(cell, BLOCKDEPTH);
        const name = TILE_TYPES[TILE_MAP(code)]?.name;
        this.blockerGrid[idx(x, y)] = (name === "pine" || name === "rock") ? 1 : 0;
      }
    }
  }

  static _recomputeAllOcclusion() {
    this._floodExteriorToOcclusion(0, 0, this._mapW - 1, this._mapH - 1);
  }

  /** Exterior flood within AABB; writes occlusionGrid using discrete blocker depths. */
  static _floodExteriorToOcclusion(x0, y0, x1, y1) {
    if (x1 < x0 || y1 < y0) return;
    const W = x1 - x0 + 1, H = y1 - y0 + 1;
    const idxLocal = (x, y) => (y - y0) * W + (x - x0);
    const inLocal = (x, y) => x >= x0 && y >= y0 && x <= x1 && y <= y1;
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

    // 1) Exterior flood (through non-blockers)
    const mark = new Uint8Array(W * H);
    const dist = new Uint16Array(W * H);
    const qx = new Int16Array(W * H), qy = new Int16Array(W * H);
    let qs = 0, qe = 0;
    const push = (x,y,d)=>{const i=idxLocal(x,y); qx[qe]=x; qy[qe]=y; dist[i]=d; qe++;};
    const pop  = ()=>[qx[qs], qy[qs++]];

    for (let x = x0; x <= x1; x++) {
      const top = idxLocal(x, y0);
      const bottom = idxLocal(x, y1);
      if (!this.blockerGrid[idx(x, y0)] && !mark[top]) { mark[top] = 1; push(x, y0, 0); }
      if (!this.blockerGrid[idx(x, y1)] && !mark[bottom]) { mark[bottom] = 1; push(x, y1, 0); }
    }
    for (let y = y0; y <= y1; y++) {
      const left = idxLocal(x0, y);
      const right = idxLocal(x1, y);
      if (!this.blockerGrid[idx(x0, y)] && !mark[left]) { mark[left] = 1; push(x0, y, 0); }
      if (!this.blockerGrid[idx(x1, y)] && !mark[right]) { mark[right] = 1; push(x1, y, 0); }
    }
    while (qs < qe) {
      const [cx, cy] = pop();
      const cd = dist[idxLocal(cx, cy)];
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (!inLocal(nx, ny)) continue;
        const ni = idxLocal(nx, ny);
        if (mark[ni]) continue;
        if (this.blockerGrid[idx(nx, ny)]) continue;
        mark[ni] = 1; push(nx, ny, cd + 1);
      }
    }

    // 2) Blocker depth flood (layers inside blockers)
    const depth = new Uint8Array(W * H);
    qs = qe = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const gi = idx(x, y);
        if (!this.blockerGrid[gi]) continue;
        let touches = false;
        for (const [dx, dy] of dirs) {
          const nx = x + dx, ny = y + dy;
          if (!inLocal(nx, ny)) continue;
          if (!this.blockerGrid[idx(nx, ny)] && mark[idxLocal(nx, ny)]) { touches = true; break; }
        }
        if (touches) {
          depth[idxLocal(x, y)] = 1;
          qx[qe] = x; qy[qe] = y; qe++;
        }
      }
    }
    while (qs < qe) {
      const cx = qx[qs], cy = qy[qs++], d = depth[idxLocal(cx, cy)];
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (!inLocal(nx, ny)) continue;
        const gi = idx(nx, ny), li = idxLocal(nx, ny);
        if (!this.blockerGrid[gi]) continue;
        if (depth[li]) continue;
        depth[li] = d + 1;
        qx[qe] = nx; qy[qe] = ny; qe++;
      }
    }

    // 3) Write occlusion (discrete rings on blockers; interior empty ramps up)
    const MAX_EMPTY_OCC = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const gi = idx(x, y), li = idxLocal(x, y);
        if (this.blockerGrid[gi]) {
          const d = depth[li] | 0;
          let O = 0.0;
          if (d === 1) O = this.occFirstRing;
          else if (d === 2) O = this.occSecondRing;
          else if (d === 3) O = this.occThirdRing;
          else if (d === 4) O = this.occFourthRing;
          else if (d >= 4) O = 1.0;
          this.occlusionGrid[gi] = O;
        } else {
          const exterior = mark[li];
          if (!exterior) {
            this.occlusionGrid[gi] = 1.0;
          } else {
            const d = dist[li];
            const norm = Math.min(d / 8, 1);
            this.occlusionGrid[gi] = norm * MAX_EMPTY_OCC;
          }
        }
      }
    }
  }
}


