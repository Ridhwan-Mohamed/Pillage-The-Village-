import { SlotPanel } from "./SlotPanel.js";

/**
 * World-space contract UI that lives beside the main island.
 *
 * Key rule for your camera-split logic:
 *   EVERY GameObject created here must have scrollFactor = 1
 *   (otherwise your mapView/mainMenu camera code will treat it as UI and
 *    it will "stick" to the screen).
 */
export class ParcelSpawnController {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {number} opts.islandTileX
   * @param {number} opts.islandTileY
   * @param {number} opts.islandTiles  // 25
   * @param {number} opts.tileSize
   * @param {number} [opts.gapTiles]   // distance from island to panel
   */
  constructor(scene, opts) {
    this.scene = scene;
    this.opts = {
      islandTileX: opts.islandTileX,
      islandTileY: opts.islandTileY,
      islandTiles: opts.islandTiles ?? 25,
      tileSize: opts.tileSize,
      gapTiles: opts.gapTiles ?? 10,
    };

    this.root = scene.add.container(0, 0);
    this.root.setScrollFactor(1);
    this.root.setDepth(9000);

    this.slots = new Map(); // id -> SlotPanel

    this._buildSlots();

  }

  _buildSlots() {
    const { islandTileX, islandTileY, islandTiles, tileSize, gapTiles } = this.opts;

    const islandW = islandTiles * tileSize;
    const islandH = islandTiles * tileSize;

    const islandLeft = islandTileX * tileSize;
    const islandTop  = islandTileY * tileSize;
    const islandCx = islandLeft + islandW / 2;
    const islandCy = islandTop  + islandH / 2;

    const panelW = islandW;
    const panelH = islandH;

    const gapPx = gapTiles * tileSize;
    const westX  = islandLeft - gapPx - panelW / 2;
    const eastX  = islandLeft + islandW + gapPx + panelW / 2;
    const northY = islandTop - gapPx - panelH / 2;
    const southY = islandTop  + islandH + gapPx + panelH / 2;

    const defs = [
      { id: "N", x: islandCx, y: northY },
      { id: "W", x: westX,    y: islandCy },
      { id: "E", x: eastX,    y: islandCy },
      { id: "S", x: islandCx, y: southY  },
    ];

    defs.forEach(d => {
      const slot = new SlotPanel(this.scene, {
        id: d.id,
        x: d.x,
        y: d.y,
        W: panelW,
        H: panelH,
      });

      this.slots.set(d.id, slot);
      this.root.add(slot.container);
    });
  }

  /** Hide the UI for a specific slot (after selection). */
  hideSlot(id) {
    const slot = this.slots.get(id);
    if (!slot) return;
    slot.setVisible(false);
  }

  /** Show the UI for a slot (e.g., when a contract expires/completes). */
  showSlot(id) {
    const slot = this.slots.get(id);
    if (!slot) return;
    slot.resetToGrid();
    slot.setVisible(true);

  }

  setMode(mode) {
    for (const slot of this.slots.values()) {
      slot.setMode?.(mode);
    }
  }

  resetUiState() {
    for (const slot of this.slots.values()) {
      slot.resetUiState?.();
    }
  }

  refreshMilitiaLockState() {
    for (const slot of this.slots.values()) {
      slot.refreshMilitiaLockState?.();
    }
  }

  refreshDisplayState() {
    for (const slot of this.slots.values()) {
      slot.refreshDisplayState?.();
    }
  }

  setVisible(v) {
    this.root.setVisible(v);
  }
}
