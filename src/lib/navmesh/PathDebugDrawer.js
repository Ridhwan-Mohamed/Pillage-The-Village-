// PathDebugDrawer.js
import Phaser from "phaser";
import { Player } from "../../players/Player";
import { BLOCKDEPTH } from "../../constants";
import { bindDebugHotkey } from "../../debug/DebugHotkeys.js";

export class PathDebugDrawer {
  static scene = null;
  static enabled = false;

  // unitId -> Phaser.Graphics
  static _gfxByUnitId = new Map();

  // unitId -> last redraw time (ms)
  static _lastDrawAt = new Map();

  // adjust: lower = smoother, higher = cheaper
  static REDRAW_EVERY_MS = 50;

  static init(scene) {
    if (this.scene) return; // only once
    this.scene = scene;

    bindDebugHotkey(scene, "P", () => {
      this.enabled = !this.enabled;

      if (!this.enabled) {
        this.clearAll();
        return;
      }

      // redraw existing paths
      for (const u of Player.troops) {
        this.redrawForUnit(u);
      }
    });
  }

  static clearAll() {
    for (const g of this._gfxByUnitId.values()) g.destroy();
    this._gfxByUnitId.clear();
  }

  static _getOrCreateGraphics(unit) {
    const id = unit.id ?? unit.name ?? unit; // best-effort key
    let g = this._gfxByUnitId.get(id);
    if (g) return g;

    g = this.scene.add.graphics();
    g.setDepth(BLOCKDEPTH);      // above world
    g.setScrollFactor(1);   // world-space (follows camera)
    // If you have a UI camera that ignores world objects, don’t ignore this graphics.
    this._gfxByUnitId.set(id, g);
    return g;
  }

  static _getUnitLineColor(unit) {
    // Prefer the unit’s actual tint if present
    // Phaser sprites commonly have tintTopLeft etc when tinted.
    const t = unit.tintTopLeft ?? unit.tint ?? null;
    if (typeof t === "number" && t !== 0xffffff) return t;

    // Fallback: mirror your “team-ish” idea
    // team 1 greenish, team 0 reddish, others bluish
    const team = unit?.body?.team;
    if (team === 1) return Phaser.Display.Color.GetColor(80, 220, 80);
    if (team === 0) return Phaser.Display.Color.GetColor(240, 80, 80);
    return Phaser.Display.Color.GetColor(80, 160, 240);
  }

  static onNewPath(unit) {
    if (!this.enabled) return;
    this.redrawForUnit(unit);
  }

  static onWaypointAdvanced(unit) {
    if (!this.enabled) return;
    this.redrawForUnit(unit);
  }

  static onPathEnd(unit) {
    const id = unit.id ?? unit.name ?? unit;
    const g = this._gfxByUnitId.get(id);
    if (g) {
      g.destroy();
      this._gfxByUnitId.delete(id);
    }
  }

  static redrawForUnit(unit) {
    if (!this.enabled || !this.scene || !unit?.active) return;

    const path = unit.currentPath;
    if (!path || path.length === 0) {
      this.onPathEnd(unit);
      return;
    }

    const g = this._getOrCreateGraphics(unit);
    g.clear();

    const color = this._getUnitLineColor(unit);
    const alpha = 0.9;
    const width = 2;

    // --- 1) thin white outline (draw first, slightly thicker) ---
    g.lineStyle(width + 2, 0xffffff, 0.85);
    g.beginPath();
    g.moveTo(unit.x, unit.y);
    for (let i = 0; i < path.length; i++) {
      g.lineTo(path[i].x, path[i].y);
    }
    g.strokePath();

    // --- 2) main colored line (draw on top) ---
    g.lineStyle(width, color, alpha);
    g.beginPath();
    g.moveTo(unit.x, unit.y);
    for (let i = 0; i < path.length; i++) {
      g.lineTo(path[i].x, path[i].y);
    }
    g.strokePath();
  }

  static tickUnit(unit, nowMs) {
    if (!this.enabled) return;
    if (!unit?.active) return;

    const path = unit.currentPath;
    if (!path || path.length === 0) {
      this.onPathEnd(unit);
      return;
    }

    const id = unit.id ?? unit.name ?? unit;
    const last = this._lastDrawAt.get(id) ?? 0;
    if (nowMs - last < this.REDRAW_EVERY_MS) return;

    this._lastDrawAt.set(id, nowMs);
    this.redrawForUnit(unit);
  }


}
