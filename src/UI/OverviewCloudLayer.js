import Phaser from "phaser";
import {
  FLOORDEPTH,
  SQUARESIZE,
  UIDEPTH,
  WORLD_DIMENSIONX,
  WORLD_DIMENSIONY,
} from "../constants";

const CLOUD_PATTERNS = [
  [
    "0011100",
    "0111110",
    "1111111",
    "0111110",
  ],
  [
    "000111100",
    "001111110",
    "011111111",
    "001111110",
  ],
  [
    "00111100",
    "01111110",
    "11111111",
    "01111110",
    "00111100",
  ],
];

export class OverviewCloudLayer {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.depth = opts.depth ?? (UIDEPTH - 0.4);
    this.shadowDepth = opts.shadowDepth ?? (FLOORDEPTH + 0.01);
    this.cloudCount = opts.cloudCount ?? 10;
    this.cellSizePx = opts.cellSizePx ?? 6;
    this.cellWorldSize = opts.cellWorldSize ?? SQUARESIZE;
    this.baseWorldScale = this.cellSizePx > 0 ? (this.cellWorldSize / this.cellSizePx) : 1;
    this.mode = "detailed";
    this.clouds = [];
    this.patternMeta = [];
    this.shadowOffsetX = opts.shadowOffsetX ?? (SQUARESIZE * 0.2);
    this.shadowOffsetY = opts.shadowOffsetY ?? (SQUARESIZE * 0.25);

    this._ensureTextures();
    this._createClouds();

    this._onResize = () => {
      for (const cloud of this.clouds) {
        this._syncShadow(cloud);
      }
    };
    this.scene.scale.on("resize", this._onResize);
  }

  destroy() {
    this.scene.scale.off("resize", this._onResize);
    for (const c of this.clouds) {
      c?.shadow?.destroy?.();
      c?.sprite?.destroy?.();
    }
    this.clouds = [];
  }

  setMode(mode = "detailed") {
    this.mode = mode;
    for (const c of this.clouds) {
      this._syncShadow(c);
    }
  }

  update(mode = "detailed") {
    this.setMode(mode);
    const dt = this.scene.game?.loop?.delta || 16.67;
    const worldW = this._worldW();
    const worldH = this._worldH();

    for (const c of this.clouds) {
      c.sprite.x += c.vx * dt;
      c.sprite.y += c.vy * dt;

      // Keep y inside world-ish corridor while drifting.
      if (c.sprite.y < SQUARESIZE * 2 || c.sprite.y > worldH - SQUARESIZE * 2) {
        c.vy *= -1;
      }

      const dx = c.endX - c.startX;
      const t = dx === 0 ? 1 : Phaser.Math.Clamp((c.sprite.x - c.startX) / dx, 0, 1);
      const fadeIn = Phaser.Math.Clamp(t / 0.12, 0, 1);
      const fadeOut = Phaser.Math.Clamp((1 - t) / 0.18, 0, 1);
      const pathAlpha = Math.min(fadeIn, fadeOut);
      c.alpha = c.baseAlpha * pathAlpha;

      // Respawn only after crossing fully past world edge.
      const pastRight = c.vx > 0 && c.sprite.x > worldW + c.margin;
      const pastLeft = c.vx < 0 && c.sprite.x < -c.margin;
      if (pastRight || pastLeft) {
        this._spawn(c, false);
      }

      this._syncShadow(c);
    }
  }

  // World-space footprint for future overcast mapping.
  getCloudFootprintsWorld() {
    const out = [];
    for (const c of this.clouds) {
      if (c.alpha <= 0.05) continue;
      const cellSize = this.cellWorldSize * (c.sprite.scaleX || 1);
      const cells = (c.footprint || []).map((p) => ({
        x: c.sprite.x + p.x * cellSize,
        y: c.sprite.y + p.y * cellSize,
        size: cellSize,
      }));
      out.push({
        key: c.sprite.texture?.key,
        alpha: c.alpha,
        centerX: c.sprite.x,
        centerY: c.sprite.y,
        cells,
      });
    }
    return out;
  }

  _worldW() {
    return WORLD_DIMENSIONX * SQUARESIZE;
  }

  _worldH() {
    return WORLD_DIMENSIONY * SQUARESIZE;
  }

  _ensureTextures() {
    const mk = (key, fn, w, h) => {
      if (this.scene.textures.exists(key)) return;
      const g = this.scene.make.graphics({ x: 0, y: 0, add: false });
      fn(g);
      g.generateTexture(key, w, h);
      g.destroy();
      this.scene.textures.get(key)?.setFilter?.(Phaser.Textures.FilterMode.NEAREST);
    };

    this.patternMeta = CLOUD_PATTERNS.map((rows, idx) => {
      const key = `overview_cloud_sq_${idx}`;
      const h = rows.length;
      const w = rows[0].length;
      const cx = (w - 1) / 2;
      const cy = (h - 1) / 2;
      const footprint = [];
      const alpha = 0.72 + (idx * 0.06);

      mk(
        key,
        (g) => {
          g.clear();
          g.fillStyle(0xffffff, alpha);
          for (let r = 0; r < h; r++) {
            for (let c = 0; c < w; c++) {
              if (rows[r][c] !== "1") continue;
              g.fillRect(c * this.cellSizePx, r * this.cellSizePx, this.cellSizePx, this.cellSizePx);
              footprint.push({ x: c - cx, y: r - cy });
            }
          }
        },
        w * this.cellSizePx,
        h * this.cellSizePx
      );

      return { key, footprint };
    });
  }

  _createClouds() {
    if (this.clouds.length) return;

    for (let i = 0; i < this.cloudCount; i++) {
      const pattern = this.patternMeta[i % this.patternMeta.length];
      const sprite = this.scene.add.image(0, 0, pattern.key)
        .setOrigin(0.5)
        .setDepth(this.depth)
        .setBlendMode(Phaser.BlendModes.SCREEN);

      const shadow = this.scene.add.image(0, 0, pattern.key)
        .setOrigin(0.5)
        .setDepth(this.shadowDepth)
        .setTint(0x000000)
        .setBlendMode(Phaser.BlendModes.NORMAL);

      const cloud = {
        sprite,
        shadow,
        footprint: pattern.footprint,
        alpha: 0,
        baseAlpha: 0.42,
        startX: 0,
        endX: 0,
        vx: 0,
        vy: 0,
        margin: 260,
      };

      this._spawn(cloud, true);
      this.clouds.push(cloud);
    }
  }

  _spawn(cloud, immediate = false) {
    const worldW = this._worldW();
    const worldH = this._worldH();
    const fromLeft = Math.random() < 0.5;
    const y = worldH * (0.12 + Math.random() * 0.74);
    const sizeVariance = 0.95 + Math.random() * 1.2;
    const scale = this.baseWorldScale * sizeVariance;
    const speedPxPerSec = 18 + Math.random() * 36;
    const speedPxPerMs = speedPxPerSec / 1000;
    const driftPxPerMs = (-6 + Math.random() * 12) / 1000;
    const visualWidth = (cloud.sprite.width || 0) * scale;
    const margin = Math.max(260, Math.ceil(visualWidth * 0.55) + SQUARESIZE * 4);

    cloud.margin = margin;
    cloud.baseAlpha = 0.32 + Math.random() * 0.28;
    cloud.startX = fromLeft ? -margin : worldW + margin;
    cloud.endX = fromLeft ? worldW + margin : -margin;

    cloud.vx = fromLeft ? speedPxPerMs : -speedPxPerMs;
    cloud.vy = driftPxPerMs;

    cloud.sprite.setScale(scale);
    cloud.shadow.setScale(scale * 1.08);

    if (immediate) {
      const progress = 0.05 + Math.random() * 0.9;
      cloud.sprite.x = cloud.startX + (cloud.endX - cloud.startX) * progress;
    } else {
      cloud.sprite.x = cloud.startX;
    }
    cloud.sprite.y = y;
    cloud.alpha = 0;

    this._syncShadow(cloud);
  }

  _syncShadow(cloud) {
    const s = cloud.shadow;
    const c = cloud.sprite;
    const inMenu = !!this.scene.isMainMenuPreview || !this.scene.parcelSpawnUI;
    const inOverview = this.mode === "overview";
    s.x = c.x + this.shadowOffsetX;
    s.y = c.y + this.shadowOffsetY;
    s.scaleX = c.scaleX * 1.08;
    s.scaleY = c.scaleY * 1.08;

    // Menu and both gameplay zoom modes should render the white cloud body.
    const showCloudSprite = inOverview || inMenu || this.mode === "detailed";
    c.setAlpha(showCloudSprite ? cloud.alpha : 0);
    c.setVisible(showCloudSprite);

    // Suppress shadows in menu; keep gameplay shadows subtle so clouds read white.
    const shadowBase = inMenu ? 0 : 0.10;
    const shadowAlpha = shadowBase * Phaser.Math.Clamp(cloud.alpha / Math.max(cloud.baseAlpha, 0.001), 0, 1);
    s.setAlpha(shadowAlpha);
    s.setVisible(shadowAlpha > 0.01);
  }
}
