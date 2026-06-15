// RegionDebugDrawer.js
import { RegionSystem } from "./RegionSystem.js";
import { bindDebugHotkey } from "../../debug/DebugHotkeys.js";

export class RegionDebugDrawer {
  constructor(scene, navMesh, regionSystem, opts = {}) {
    this.scene = scene;
    this.navMesh = navMesh;
    this.regionSystem = regionSystem || new RegionSystem(navMesh);

    this.depth = opts.depth ?? 120;
    this.alpha = opts.alpha ?? 0.20;
    this.lineAlpha = opts.lineAlpha ?? 0.45;
    this.enabled = false;
    this.graphics = [];

    // legend
    this.legendEnabled = opts.legendEnabled ?? true;
    this.legendX = opts.legendX ?? 12;
    this.legendY = opts.legendY ?? 50;
    this.legendMaxItems = opts.legendMaxItems ?? 24; // avoid giant lists
    this.legendTextSize = opts.legendTextSize ?? 12;

    this._legendItems = [];      // { g, t } pairs
    this._legendPanel = null;    // panel graphics

    // store region->color so legend matches draw exactly
    this._regionColor = new Map();

    // High-contrast palette (cycle)
    this._palette = [
    0xff1744, 0xd500f9, 0x3d5afe, 0x00b0ff,
    0x00e5ff, 0x1de9b6, 0x00e676, 0x76ff03,
    0xffea00, 0xff9100, 0xff3d00, 0x8d6e63,
    0x90a4ae, 0xffffff
    ];

    // make regions pop more
    this.alpha = opts.alpha ?? 0.28;      // was 0.20
    this.lineAlpha = opts.lineAlpha ?? 0.65; // was 0.45


    this.toggleKey = opts.toggleKey ?? "R";
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
    // unbind key
    this._debugHotkey?.destroy?.();
    this._debugHotkey = null;
    this._onToggle = null;

    // remove graphics + legend
    this.clear();
  }

  markDirty() {
    // Call this after navmesh edits, then redraw if enabled
    this.regionSystem.markDirty();
    if (this.enabled) this.draw();
  }

  draw() {
    this.clear();               // clears polys + legend now
    this._regionColor.clear();  // re-assign stable colors on each draw
    this.regionSystem.ensureUpToDate();

    const polys = this.navMesh.getPolygons ? this.navMesh.getPolygons() : this.navMesh.navPolygons;

    const regionIds = new Set();
    for (const p of polys) {
      if (!p) continue;
      const rid = this.regionSystem.getRegionIdForPoly(p.id);
      regionIds.add(rid);
  
      // deterministic-ish color per rid (cheap hash)
      const color = this._colorForRegion(rid);

      const g = this.scene.add.graphics();
      g.lineStyle(1, 0xffffff, this.lineAlpha);
      g.fillStyle(color, this.alpha);
      g.setDepth(this.depth);

      const pts = p.polygon.points;
      if (!pts || pts.length === 0) continue;

      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.lineTo(pts[0].x, pts[0].y);
      g.strokePath();
      g.fillPath();

      this.graphics.push(g);
    }

    if (this.legendEnabled) {
        this._drawLegend(Array.from(regionIds).sort((a, b) => a - b));
    }

  }

    clear() {
        for (const g of this.graphics) g.destroy();
        this.graphics = [];

        // legend cleanup
        for (const it of this._legendItems) {
            if (it.g) it.g.destroy();
            if (it.t) it.t.destroy();
        }
        this._legendItems = [];

        if (this._legendPanel) {
            this._legendPanel.destroy();
            this._legendPanel = null;
        }
    }

    _colorForRegion(rid) {
        // stable mapping regionId -> palette color
        if (this._regionColor.has(rid)) return this._regionColor.get(rid);

        // hashed palette index so IDs don't cluster into similar hues
        let x = (rid * 2654435761) >>> 0;
        x ^= x >>> 16;
        const idx = x % this._palette.length;

        const color = this._palette[idx];
        this._regionColor.set(rid, color);
        return color;
    }

    _drawLegend(sortedRegionIds) {
        const x0 = this.legendX;
        const y0 = this.legendY;

        const maxItems = Math.min(this.legendMaxItems, sortedRegionIds.length);
        const lineH = this.legendTextSize + 6;

        const pad = 8;
        const sw = 14; // swatch size
        const panelW = 170;
        const panelH = pad * 2 + lineH * (maxItems + 1);

        // panel background
        this._legendPanel = this.scene.add.graphics();
        this._legendPanel.fillStyle(0x000000, 0.55);
        this._legendPanel.fillRoundedRect(x0, y0, panelW, panelH, 8);
        this._legendPanel.setDepth(this.depth + 5);

        // header
        const header = this.scene.add.text(x0 + pad, y0 + pad, "Regions", {
            fontSize: `${this.legendTextSize + 1}px`,
            color: "#ffffff",
        });
        header.setDepth(this.depth + 6);
        this._legendItems.push({ g: null, t: header });

        for (let i = 0; i < maxItems; i++) {
            const rid = sortedRegionIds[i];
            const color = this._colorForRegion(rid);

            const yy = y0 + pad + lineH * (i + 1);

            // color swatch
            const sg = this.scene.add.graphics();
            sg.fillStyle(color, 1);
            sg.fillRect(x0 + pad, yy + 2, sw, sw);
            sg.lineStyle(1, 0xffffff, 0.35);
            sg.strokeRect(x0 + pad, yy + 2, sw, sw);
            sg.setDepth(this.depth + 6);

            // label
            const txt = this.scene.add.text(x0 + pad + sw + 8, yy, `Region ${rid}`, {
            fontSize: `${this.legendTextSize}px`,
            color: "#ffffff",
            });
            txt.setDepth(this.depth + 6);

            this._legendItems.push({ g: sg, t: txt });
        }

        // If there are more regions than we display, show a hint
        if (sortedRegionIds.length > maxItems) {
            const more = this.scene.add.text(
            x0 + pad,
            y0 + pad + lineH * (maxItems + 1),
            `(+${sortedRegionIds.length - maxItems} more)`,
            { fontSize: `${this.legendTextSize}px`, color: "#cccccc" }
            );
            more.setDepth(this.depth + 6);
            this._legendItems.push({ g: null, t: more });
        }
    }
}

