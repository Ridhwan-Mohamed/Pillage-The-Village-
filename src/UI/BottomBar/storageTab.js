// === StorageTab.js ===
import Phaser from "phaser";
import { UI_ITEM_TYPES } from "../UIConstants";
import { Teams } from '../../Teams'
import { TILE_TYPES, showAlert } from '../../constants'
import { buildingManager } from '../../Manager/buildingManager.js';
import { AudioManager } from '../../Manager/AudioManager.js';
import { StorageManager } from '../../Manager/StorageManager.js';
import { StorageBuilding } from '../../buildings/Storage.js';
import {
  addScrollablePanelAffordance,
  BOTTOM_BAR_THEME,
  getBottomBarWidth,
  handleScrollablePanelWheel,
  makeGlassRoundRect,
  makeBottomBarEmptyRow,
  mixColor,
} from "./BottomBarTheme";

const TAB_BASE_DEPTH = 51;
const TAB_BG_DEPTH = 0;
const TAB_CONTENT_DEPTH = 1;

export default class StorageTab {
    constructor(scene, teamNumber = 0) {
    this.scene = scene;
    
    this.team = teamNumber;
    this.selected = null;
    this.cardByStorage = new Map();
    this._onWheel = null;
    this._scrollAffordances = [];
    this.root = this.build();
    this.bindScrollInput();

    // --- live update binding ---
    this._update = this.update.bind(this);
    this.scene.events.on("update", this._update);

    // --- storage lifecycle listeners ---
    this._onAdded = (storage) => {
      if (!storage || storage.teamNumber !== this.team) return;
      this.rebuildList();
    };

    this._onRemoved = (storage) => {
      const row = this.cardByStorage.get(storage);
      if (row) {
        row.destroy();
        this.cardByStorage.delete(storage);
        this.scroll.layout();
      }
      if (this.selected === storage) {
        this.selected = null;
        this.detail.setStorage(null);
      }
      if (!(Teams.teamLists[this.team]?.storageList || []).length) {
        this.rebuildList();
      }
    };

    this._onUpdated = (storage) => {
      if (!storage || storage.teamNumber !== this.team) return;

      const current = this.scene.uiBottomBar?.currentPage;

      // 🔒 Only touch UI if the Storage tab is actually open
      if (current !== 'storage') return;

      // Keep the row UI in sync with the storage state (only when tab is open)
      this.updateCard(storage);

      // And only touch the detail panel if this storage is selected
      if (this.selected === storage && this.detail?.setStorage) {
        this.detail.setStorage(storage);
      }
    };

    this._onResize = () => this.scroll.layout();

    scene.events.on("storage:added", this._onAdded);
    scene.events.on("storage:removed", this._onRemoved);
    scene.events.on("storage:updated", this._onUpdated);
    scene.scale.on("resize", this._onResize);
  }

  get view() { return this.root; }

  hide() {
    this.selected = null;

    // Hide or clear detail panel
    if (this.detail?.setOven) this.detail.setOven(null);
    if (this.detail?.hideDisplay) this.detail.hideDisplay();
    else if (this.detail?.setStorage) this.detail.setStorage(null);

    // Hide any visible count texts / icons
    if (this.detail?.cells) {
      this.detail.cells.forEach(c => {
        if (c.icon) c.icon.setVisible(false);
        if (c.ghostIcon) c.ghostIcon.setVisible(false);
        if (c.text) c.text.setVisible(false);
        if (c.queueText) c.queueText.setVisible(false);
      });
    }
    if (this.cards?.childrenMap?.grid) {
      this.cards.childrenMap.grid.getAllVisibleChildren?.().forEach(child => {
        if (child.setVisible) child.setVisible(false);
      });
    }
  }


  destroy() {
    if (typeof this._update === "function") {
      this.scene.events.off("update", this._update);
    }
    this.scene.events.off("storage:added", this._onAdded);
    this.scene.events.off("storage:removed", this._onRemoved);
    this.scene.events.off("storage:updated", this._onUpdated);
    this.scene.scale.off("resize", this._onResize);
    if (this._onWheel) {
      this.scene.input.off('wheel', this._onWheel);
      this._onWheel = null;
    }
    this.root?.destroy();
    this._scrollAffordances.forEach((affordance) => affordance?.destroy?.());
    this._scrollAffordances = [];
  }

  // ---------- UI BUILD ----------
  build() {
    const scene = this.scene;
    const CONTENT_H = 112;
    this.contentHeight = CONTENT_H;
    const barWidth = getBottomBarWidth(scene);
    const availableWidth = Math.max(520, barWidth - 16);
    const listWidth = Math.max(230, Math.floor(availableWidth * 0.34));
    const detailWidth = Math.max(320, availableWidth - listWidth - 26);
    const detailProportion = 2;
    const listProportion = 1;
    this.listWidth = listWidth;
    this.detailWidth = detailWidth;
    const root = scene.rexUI.add.sizer({
      height: CONTENT_H,
      orientation: "x",
      space: { left: 8, right: 8, top: 4, bottom: 4, item: 10 },
    }).setDepth(TAB_BASE_DEPTH);
    root.setMinSize(0, CONTENT_H);

    this.detail = this.buildDetailPanel();
    this.detail.panel?.setMinSize?.(detailWidth, CONTENT_H);
    const detailSizer = scene.rexUI.add.sizer({
      orientation: "y",
      height: CONTENT_H,
    }).add(this.detail.panel, { proportion: 1, expand: true }).setDepth(TAB_BASE_DEPTH);
    detailSizer.setMinSize(detailWidth, CONTENT_H);
    root.add(detailSizer, { proportion: detailProportion, expand: true });

    this.listBody = scene.rexUI.add.sizer({ orientation: "y", space: { item: 8 } });

    this.scroll = scene.rexUI.add.scrollablePanel({
      width: listWidth,
      height: CONTENT_H,
      scrollMode: 0,
      scrollDetectionMode: 'rectBounds',
      background: makeGlassRoundRect(scene, 0, 0, 16, {
        fill: mixColor(BOTTOM_BAR_THEME.panelFill, 0xffffff, 0.08),
        alpha: 0.74,
        stroke: 0x98e7ff,
        strokeAlpha: 0.12,
      }),
      panel: { child: this.listBody, mask: { padding: 1 } },
      scrollerY: {
        pointerOutRelease: true,
        rectBoundsInteractive: true,
      },
      space: { left: 6, right: 6, top: 6, bottom: 6, panel: 8 },
    }).setDepth(TAB_BASE_DEPTH);
    this.scroll.setMinSize(0, CONTENT_H);
    this._scrollAffordances.push(addScrollablePanelAffordance(scene, this.scroll, {
      isActive: () => this.scene.uiBottomBar?.expanded && this.scene.uiBottomBar?.currentPage === 'storage',
    }));

    root.add(this.scroll, { proportion: listProportion, expand: true });
    this.rebuildList();
    root.layout();
    return root;
  }

  bindScrollInput() {
    if (this._onWheel) return;

    this._onWheel = (pointer, _gameObjects, dx, dy) => {
      if (this.scene.uiBottomBar?.currentPage !== 'storage') return;
      if (!this.scene.uiBottomBar?.expanded) return;
      const panels = [this.scroll];
      panels.some((panel) => handleScrollablePanelWheel(this.scene, panel, pointer, dx, dy));
    };

    this.scene.input.on('wheel', this._onWheel);
  }

  isPointerOverScroll(pointer) {
    if (!this.scroll?.getBounds) return false;
    const bounds = this.scroll.getBounds();
    return Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y);
  }

  getProjectedSlots(storage) {
    if (!storage) return [];
    const teamNumber = storage.teamNumber ?? this.team ?? 1;
    return StorageBuilding._getProjectedSlots?.(storage, teamNumber) ?? [];
  }

  // ---------- DETAIL PANEL ----------
  buildDetailPanel() {
    {
      const scene = this.scene;
      const compact = scene.scale.width < 1180;
      const rr = (w, h, r, c, a = 1) => scene.rexUI.add.roundRectangle(0, 0, w, h, r, c, a);
      const panelBg = (w = 0, h = 0, r = 14, c = 0x153248, a = 0.78, stroke = 0x95e4ff, sa = 0.16) => {
        const bg = rr(w, h, r, c, a);
        bg.setStrokeStyle(2, stroke, sa);
        bg.setDepth(TAB_BG_DEPTH);
        return bg;
      };
      const text = (value, style = {}) => scene.add.text(0, 0, value, {
        fontFamily: "Bungee",
        fontSize: 12,
        color: "#ffffff",
        ...style,
      }).setShadow(0, 1, "#000000", 2, true, true);

      if (!scene.textures.exists("blank")) {
        const g = scene.add.graphics();
        g.fillStyle(0xffffff, 1);
        g.fillRect(0, 0, 1, 1);
        g.generateTexture("blank", 1, 1);
        g.destroy();
      }

      const makeHpBarWithText = (width, height) => {
        const s = scene.rexUI.add.overlapSizer({ width, height });
        const bg = panelBg(width, height, height / 2, 0x08121a, 0.92, 0x92ddff, 0.08);
        const fill = rr(Math.max(1, width - 4), Math.max(1, height - 4), (height - 4) / 2, 0x49cf73, 1)
          .setOrigin(0, 0.5)
          .setDepth(TAB_CONTENT_DEPTH);
        const label = text("HP 0/0", { fontSize: compact ? 10 : 11 }).setDepth(TAB_CONTENT_DEPTH);
        s.addBackground(bg);
        s.add(fill, { key: "fill", align: "left", expand: false, padding: { left: 2, right: 2 } });
        s.add(label, { key: "txt", align: "center", expand: false });
        s.layout();
        s.setValue = (cur, max) => {
          const m = Math.max(1, max ?? 1);
          const c = Math.max(0, cur ?? 0);
          const p = Phaser.Math.Clamp(c / m, 0, 1);
          fill.width = Math.max(1, (width - 4) * p);
          label.setText(`HP ${Math.floor(c)}/${Math.floor(m)}`);
          s.layout();
        };
        return s;
      };

      const button = (label, fill = 0x305f78, stroke = 0xa9ebff) => {
        const bg = panelBg(0, 0, 12, fill, 0.96, stroke, 0.18);
        const labelText = text(label, { fontSize: compact ? 10 : 11 });
        const btn = scene.rexUI.add.label({
          background: bg,
          text: labelText,
          space: { left: compact ? 8 : 10, right: compact ? 8 : 10, top: compact ? 4 : 6, bottom: compact ? 4 : 6 }
        });
        btn.labelText = labelText;
        btn._enabled = true;
        btn._hovered = false;
        btn.applyVisualState = () => {
          const enabled = btn._enabled !== false;
          const hovered = !!btn._hovered && enabled;
          bg.setFillStyle(fill, enabled ? (hovered ? 1 : 0.96) : 0.72);
          bg.setStrokeStyle(2, stroke, enabled ? (hovered ? 0.34 : 0.18) : 0.1);
          labelText.setColor(enabled ? "#ffffff" : "#b4c7d2");
          btn.setAlpha(enabled ? 1 : 0.45);
          btn.setScale(hovered ? 1.02 : 1);
        };
        btn.setInteractive({ useHandCursor: true });
        btn.on("pointerover", () => {
          btn._hovered = true;
          btn.applyVisualState();
        });
        btn.on("pointerout", () => {
          btn._hovered = false;
          btn.applyVisualState();
        });
        btn.setEnabledState = (enabled) => {
          btn._enabled = enabled;
          btn.disableInteractive();
          if (enabled) btn.setInteractive({ useHandCursor: true });
          btn.applyVisualState();
        };
        btn.applyVisualState();
        return btn;
      };

      const sectionHeight = Math.max(58, (this.contentHeight || 112) - (compact ? 40 : 42));
      const buildPanelShell = (width, height, background, content, padding = {}) => {
        const shell = scene.rexUI.add.scrollablePanel({
          width,
          height,
          scrollMode: 0,
          scrollDetectionMode: "rectBounds",
          background,
          panel: { child: content, mask: { padding: 1 } },
          space: {
            left: padding.left ?? 0,
            right: padding.right ?? 0,
            top: padding.top ?? 0,
            bottom: padding.bottom ?? 0,
            panel: 0,
          },
        }).setDepth(TAB_CONTENT_DEPTH);
        content.setDepth(TAB_CONTENT_DEPTH);
        shell.setMinSize(width, height);
        return shell;
      };

      const title = text("Storage", { fontSize: 15 });
      const sub = text("-", { fontSize: 11, color: "#b0b0b0" });
      const slotCount = StorageBuilding.defaultCapacity || 8;
      const gridColumns = 4;
      const gridRows = Math.max(1, Math.ceil(slotCount / gridColumns));
      const contentWidth = Math.max(330, (this.detailWidth || 380) - 18);
      const contentGap = compact ? 6 : 8;
      const paneWidth = Math.max(156, Math.floor((contentWidth - contentGap) / 2));
      const leftPaneWidth = paneWidth;
      const rightPaneWidth = Math.max(156, contentWidth - leftPaneWidth - contentGap);
      const hpWidth = Math.max(188, contentWidth - 8);
      const storageHpBar = makeHpBarWithText(hpWidth, compact ? 13 : 14);
      const cellGap = compact ? 3 : 4;
      const maxCellByWidth = Math.floor((leftPaneWidth - 10 - cellGap * (gridColumns - 1)) / gridColumns);
      const cellSize = Phaser.Math.Clamp(maxCellByWidth, compact ? 34 : 38, compact ? 44 : 50);
      const previewSize = Phaser.Math.Clamp(Math.floor(rightPaneWidth * 0.48), compact ? 56 : 60, compact ? 72 : 80);
      const detailGap = compact ? 6 : 8;
      const descWrap = Math.max(120, rightPaneWidth - previewSize - detailGap - 28);

      let currentStorage = null;
      let selectedSlotIndex = null;

      const gridSizer = scene.rexUI.add.gridSizer({
        column: gridColumns,
        row: gridRows,
        columnProportions: 1,
        rowProportions: 1,
        space: { column: cellGap, row: cellGap, left: 2, right: 2, top: 2, bottom: 2 },
      }).setDepth(TAB_CONTENT_DEPTH);

      const makeCell = () => {
        const s = scene.rexUI.add.overlapSizer({ width: cellSize, height: cellSize });
        const bg = panelBg(cellSize, cellSize, 10, 0x102637, 0.95, 0x98e7ff, 0.12);
        const shine = rr(cellSize - 12, 8, 4, 0xffffff, 0.08).setDepth(TAB_CONTENT_DEPTH);
        const icon = scene.add.image(0, 0, "blank").setDisplaySize(cellSize - 12, cellSize - 12).setVisible(false).setDepth(TAB_CONTENT_DEPTH);
        const ghostIcon = scene.add.image(0, 0, "blank").setDisplaySize(cellSize - 12, cellSize - 12).setAlpha(0.34).setVisible(false).setDepth(TAB_CONTENT_DEPTH);
        const count = text("", { fontSize: compact ? 8 : 9 }).setOrigin(1, 1).setDepth(TAB_CONTENT_DEPTH);
        const queued = text("", { fontSize: compact ? 7 : 8, color: "#9fdfff" }).setOrigin(0, 0).setVisible(false).setDepth(TAB_CONTENT_DEPTH);

        s.addBackground(bg);
        s.add(shine, { align: "top-center", padding: { top: 6 } });
        s.add(icon, { align: "center" });
        s.add(ghostIcon, { align: "center" });
        s.add(queued, { align: "top-left", padding: { left: 4, top: 3 } });
        s.add(count, { align: "right-bottom", padding: { right: 6, bottom: 4 } });

        s.icon = icon;
        s.ghostIcon = ghostIcon;
        s.text = count;
        s.queueText = queued;
        s._selected = false;
        s._hovered = false;
        s.applyVisualState = () => {
          const selected = !!s._selected;
          const hovered = !!s._hovered;
          const active = selected || hovered;
          const fillColor = selected ? 0x2a4f73 : hovered ? 0x19384f : 0x102637;
          const fillAlpha = active ? 1 : 0.95;
          const strokeColor = selected ? 0xffd28a : hovered ? 0xbaf1ff : 0x98e7ff;
          const strokeAlpha = selected ? 0.42 : hovered ? 0.26 : 0.12;
          bg.setFillStyle(fillColor, fillAlpha);
          bg.setStrokeStyle(2, strokeColor, strokeAlpha);
          shine.setFillStyle(0xffffff, selected ? 0.14 : hovered ? 0.11 : 0.08);
        };
        s.setIcon = (key, amt, queuedKey = null, queuedAmount = 0) => {
          const hasIcon = key && scene.textures.exists(key);
          if (hasIcon) {
            icon.setTexture(key);
            icon.setDisplaySize(cellSize - 12, cellSize - 12);
            icon.setVisible(true);
          } else {
            icon.setVisible(false);
          }

          const hasQueuedIcon = queuedKey && scene.textures.exists(queuedKey) && queuedAmount > 0;
          if (hasQueuedIcon) {
            ghostIcon.setTexture(queuedKey);
            ghostIcon.setDisplaySize(cellSize - 12, cellSize - 12);
            ghostIcon.setAlpha(hasIcon ? 0.2 : 0.34);
            ghostIcon.setVisible(true);
            queued.setVisible(true).setText(`Q+${queuedAmount}`);
          } else {
            ghostIcon.setVisible(false);
            queued.setVisible(false);
          }

          if (amt > 0) {
            count.setVisible(true).setText(`x${amt}`);
          } else {
            count.setVisible(false);
          }
        };
        s.setSelected = (active) => {
          s._selected = !!active;
          s.applyVisualState();
        };
        s.setHovered = (active) => {
          s._hovered = !!active;
          s.applyVisualState();
        };
        s.applyVisualState();
        return s;
      };

      const cells = [];
      for (let i = 0; i < slotCount; i++) {
        const cell = makeCell();
        gridSizer.add(cell, { column: i % gridColumns, row: Math.floor(i / gridColumns), expand: false });
        cells.push(cell);
      }

      const inventoryContent = scene.rexUI.add.sizer({
        orientation: "y",
        width: leftPaneWidth,
        space: { item: 3 }
      })
        .add(gridSizer, { proportion: 1, expand: true, align: "center" })
        .setDepth(TAB_CONTENT_DEPTH);
      inventoryContent.setMinSize(leftPaneWidth - 10, 0);
      const inventoryPanel = buildPanelShell(
        leftPaneWidth,
        sectionHeight,
        panelBg(leftPaneWidth, 0, 14, 0x17384c, 0.5, 0x98e7ff, 0.12),
        inventoryContent,
        { left: 5, right: 5, top: 5, bottom: 5 }
      );

      const previewSlot = scene.rexUI.add.overlapSizer({ width: previewSize, height: previewSize });
      const previewBg = panelBg(previewSize, previewSize, 18, 0x102637, 0.96, 0x8fe6ff, 0.16);
      const previewShine = rr(previewSize - 16, 10, 5, 0xffffff, 0.08).setDepth(TAB_CONTENT_DEPTH);
      const previewIcon = scene.add.image(0, 0, "blank").setDisplaySize(previewSize - 18, previewSize - 18).setVisible(false).setDepth(TAB_CONTENT_DEPTH);
      const previewCount = text("", { fontSize: compact ? 9 : 10 }).setOrigin(1, 1).setVisible(false).setDepth(TAB_CONTENT_DEPTH);
      const previewEmpty = text("EMPTY", { fontSize: compact ? 10 : 11, color: "#7cb9ce" }).setDepth(TAB_CONTENT_DEPTH);
      previewSlot.addBackground(previewBg);
      previewSlot.add(previewShine, { align: "top-center", padding: { top: 8 } });
      previewSlot.add(previewIcon, { align: "center" });
      previewSlot.add(previewEmpty, { align: "center" });
      previewSlot.add(previewCount, { align: "right-bottom", padding: { right: 8, bottom: 6 } });

      const detailTitle = text("No Slot Selected", { fontSize: compact ? 13 : 15 });
      const detailMeta = text("Pick a filled slot to inspect it.", {
        fontSize: compact ? 9 : 11,
        color: "#9fdfff",
        wordWrap: { width: descWrap }
      });
      const detailDesc = text("", {
        fontSize: compact ? 9 : 10,
        color: "#d9eef8",
        wordWrap: { width: descWrap }
      });

      const detailCopy = scene.rexUI.add.sizer({
        orientation: "y",
        space: { item: 4 }
      })
        .add(detailTitle, { expand: false, align: "left" })
        .add(detailMeta, { expand: false, align: "left" })
        .add(detailDesc, { expand: false, align: "left" })
        .setDepth(TAB_CONTENT_DEPTH);

      const detailBody = scene.rexUI.add.sizer({
        orientation: "x",
        space: { item: detailGap }
      })
        .add(detailCopy, { proportion: 1, expand: true, align: "left" })
        .add(previewSlot, { proportion: 0, expand: false, align: "right" })
        .setDepth(TAB_CONTENT_DEPTH);

      const detailContent = scene.rexUI.add.sizer({
        orientation: "y",
        space: { item: 5 }
      })
        .add(detailBody, { proportion: 1, expand: true, align: "center" })
        .setDepth(TAB_CONTENT_DEPTH);

      const sellOneBtn = button("Sell 1", 0x7c3aed, 0xd8b4fe);
      const sellStackBtn = button("Sell Stack", 0xc86b1f, 0xfacc15);
      sellOneBtn.setMinSize(0, compact ? 30 : 34);
      sellStackBtn.setMinSize(0, compact ? 30 : 34);
      sellOneBtn.setEnabledState(false);
      sellStackBtn.setEnabledState(false);

      const actionsRow = scene.rexUI.add.sizer({
        orientation: "x",
        space: { item: compact ? 8 : 10 }
      })
        .add(sellOneBtn, { proportion: 1, expand: true })
        .add(sellStackBtn, { proportion: 1, expand: true })
        .setDepth(TAB_CONTENT_DEPTH);

      const actionsContent = scene.rexUI.add.sizer({
        orientation: "y",
        space: {}
      })
        .add(actionsRow, { proportion: 1, expand: true })
        .setDepth(TAB_CONTENT_DEPTH);
      const actionsPanel = buildPanelShell(
        Math.max(120, rightPaneWidth - 16),
        compact ? 42 : 46,
        panelBg(0, 0, 12, 0x102637, 0.78, 0x98e7ff, 0.12),
        actionsContent,
        { left: 6, right: 6, top: 6, bottom: 6 }
      );

      detailContent.add(actionsPanel, { expand: true, align: "left" });

      const detailPanel = buildPanelShell(
        rightPaneWidth,
        sectionHeight,
        panelBg(rightPaneWidth, 0, 14, 0x17384c, 0.5, 0x98e7ff, 0.12),
        detailContent,
        { left: 8, right: 8, top: 6, bottom: 6 }
      );

      const fixBtn = button("Fix", 0x234c27, 0x7fd498).setMinSize(92, compact ? 28 : 30);
      fixBtn.on("pointerup", () => {
        AudioManager.playBottomBarClick();
        const storage = this.selected;
        if (!storage) return;
        buildingManager.requestBuildingFix(storage, this.team, []);
      });

      const contentRow = scene.rexUI.add.sizer({
        orientation: "x",
        space: { item: contentGap }
      })
        .add(inventoryPanel, { proportion: 1, expand: true, align: "top" })
        .add(detailPanel, { proportion: 1, expand: true, align: "top" })
        .setDepth(TAB_CONTENT_DEPTH);

      const titleCol = scene.rexUI.add.sizer({
        orientation: "y",
        space: { item: 1 }
      })
        .add(title, { expand: false, align: "left" })
        .add(sub, { expand: false, align: "left" });

      const headerRow = scene.rexUI.add.sizer({
        orientation: "x",
        space: { item: 6 }
      })
        .add(titleCol, { proportion: 1, align: "left", expand: true })
        .add(fixBtn, { proportion: 0, align: "right", expand: false })
        .setDepth(TAB_CONTENT_DEPTH);

      const setDetailVisibility = (visible) => {
        const on = !!visible;
        previewSlot.setVisible(on);
        previewBg.setVisible(on);
        previewShine.setVisible(on);
        previewIcon.setVisible(on && previewIcon.visible);
        previewCount.setVisible(on && previewCount.visible);
        previewEmpty.setVisible(on && previewEmpty.visible);
        detailTitle.setVisible(on);
        detailMeta.setVisible(on);
        detailDesc.setVisible(on);
        detailCopy.setVisible(on);
        detailBody.setVisible(on);
        detailContent.setVisible(on);
        actionsPanel.setVisible(on);
        actionsContent.setVisible(on);
        actionsRow.setVisible(on);
        sellOneBtn.setVisible(on);
        sellStackBtn.setVisible(on);
      };

      const refreshSelectionUi = () => {
        const slot = currentStorage?.storageItems?.[selectedSlotIndex] || null;

        cells.forEach((cell, idx) => {
          cell.setSelected(!!slot && idx === selectedSlotIndex);
        });

        if (!slot?.item) {
          previewIcon.setVisible(false);
          previewCount.setVisible(false);
          previewEmpty.setVisible(true);
          detailTitle.setText("No Slot Selected");
          detailMeta.setText("Pick a filled slot to inspect it.");
          detailDesc.setText("");
          sellOneBtn.labelText.setText("Sell 1");
          sellStackBtn.labelText.setText("Sell Stack");
          sellOneBtn.setEnabledState(false);
          sellStackBtn.setEnabledState(false);
          return;
        }

        const item = slot.item;
        const iconKey = UI_ITEM_TYPES[item.name]?.icon || null;
        const price = StorageManager.getStorageSellPrice(item);
        const total = price * slot.amount;

        if (iconKey && scene.textures.exists(iconKey)) {
          previewIcon.setTexture(iconKey);
          previewIcon.setDisplaySize(previewSize - 22, previewSize - 22);
          previewIcon.setVisible(true);
          previewEmpty.setVisible(false);
        } else {
          previewIcon.setVisible(false);
          previewEmpty.setVisible(true);
        }

        previewCount.setText(`x${slot.amount}`).setVisible(true);
        detailTitle.setText(item.label || item.name);
        detailMeta.setText(`Slot ${selectedSlotIndex + 1} | ${slot.amount}/${item.stacks || slot.amount} | $${price} each`);
        detailDesc.setText(item.description || "Stored supply item.");
        sellOneBtn.labelText.setText(`Sell 1 ($${price})`);
        sellStackBtn.labelText.setText(`Sell Stack ($${total})`);
        sellOneBtn.setEnabledState(true);
        sellStackBtn.setEnabledState(true);
      };

      const setStorage = (storage) => {
        currentStorage = storage;
        setDetailVisibility(true);

        if (!storage) {
          selectedSlotIndex = null;
          title.setText("Storage");
          sub.setText("-");
          storageHpBar.setValue(0, 1);
          cells.forEach(cell => cell.setIcon(null, 0, null, 0));
          refreshSelectionUi();
          return;
        }

        if (selectedSlotIndex == null || !storage.storageItems?.[selectedSlotIndex]?.item) {
          const firstFilledIndex = storage.storageItems.findIndex(slot => slot?.item);
          selectedSlotIndex = firstFilledIndex >= 0 ? firstFilledIndex : null;
        }

        title.setText("Storage");
        sub.setText(`(${storage.x ?? 0}, ${storage.y ?? 0})`);
        storageHpBar.setValue(storage.health ?? 0, storage.maxHealth ?? 1);
        const projected = this.getProjectedSlots(storage);

        for (let i = 0; i < slotCount; i++) {
          const slot = storage.storageItems?.[i] || null;
          const projectedSlot = projected?.[i] || null;
          const key = UI_ITEM_TYPES[slot?.item?.name || "empty"]?.icon || null;

          let queuedKey = null;
          let queuedAmount = 0;
          if (projectedSlot?.item) {
            if (!slot?.item) {
              queuedKey = UI_ITEM_TYPES[projectedSlot.item.name]?.icon || null;
              queuedAmount = projectedSlot.amount || 0;
            } else if (slot.item?.name === projectedSlot.item.name && projectedSlot.amount > slot.amount) {
              queuedKey = UI_ITEM_TYPES[projectedSlot.item.name]?.icon || null;
              queuedAmount = projectedSlot.amount - slot.amount;
            }
          }

          cells[i].setIcon(key, slot?.amount || 0, queuedKey, queuedAmount);
        }

        refreshSelectionUi();
      };

      const hideDisplay = () => {
        currentStorage = null;
        selectedSlotIndex = null;
        title.setText("Storage");
        sub.setText("-");
        storageHpBar.setValue(0, 1);
        cells.forEach((cell) => {
          cell.setIcon(null, 0, null, 0);
          cell.setSelected(false);
          cell.setHovered(false);
        });
        previewIcon.setVisible(false);
        previewCount.setVisible(false);
        previewEmpty.setVisible(false);
        detailTitle.setText("");
        detailMeta.setText("");
        detailDesc.setText("");
        sellOneBtn.setEnabledState(false);
        sellStackBtn.setEnabledState(false);
        setDetailVisibility(false);
      };

      const sellSelectedSlot = (sellStack = false) => {
        const slot = currentStorage?.storageItems?.[selectedSlotIndex];
        if (!slot?.item) return;

        const amount = sellStack ? slot.amount : 1;
        const { sold, revenue, item } = StorageManager.sellFromStorage(
          currentStorage,
          selectedSlotIndex,
          amount,
          scene,
          { sourceUiTarget: sellStack ? sellStackBtn : sellOneBtn }
        );
        if (sold <= 0) return;

        showAlert(scene, `Sold ${sold} ${item?.label || item?.name} for $${revenue}`, "#33ff77", 1800);
        if (currentStorage) setStorage(currentStorage);
      };

      sellOneBtn.on("pointerup", () => {
        AudioManager.playBottomBarClick();
        sellSelectedSlot(false);
      });
      sellStackBtn.on("pointerup", () => {
        AudioManager.playBottomBarClick();
        sellSelectedSlot(true);
      });

      cells.forEach((cell, idx) => {
        cell
          .setInteractive({ useHandCursor: true })
          .on("pointerover", () => {
            cell.setHovered(true);
          })
          .on("pointerout", () => {
            cell.setHovered(false);
          })
          .on("pointerdown", () => {
            const slot = currentStorage?.storageItems?.[idx];
            selectedSlotIndex = slot?.item ? idx : null;
            refreshSelectionUi();
          });
      });

      const panel = scene.rexUI.add.sizer({ orientation: "y", space: { item: 4 } })
        .add(headerRow, 0, "left", 0, true)
        .add(storageHpBar, 0, "left", 0, true)
        .add(contentRow, { proportion: 1, expand: true })
        .setDepth(TAB_BASE_DEPTH);
      storageHpBar.setDepth(TAB_CONTENT_DEPTH);
      // storageHpBar.setDepth(TAB_CONTENT_DEPTH);

      return { panel, setStorage, hideDisplay, cells };
    }
    const scene = this.scene;
    const rr = (w, h, r, c, a = 1) => scene.rexUI.add.roundRectangle(0, 0, w, h, r, c, a);

    const ensureBlankTexture = () => {
      if (scene.textures.exists("blank")) return;

      const g = scene.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 1, 1);
      g.generateTexture("blank", 1, 1);
      g.destroy();
    };
    ensureBlankTexture();

    // header: title + coords + HP
    const title = scene.add.text(0, 0, "Storage", { fontSize: 16, color: "#ffffff", fontFamily: "Bungee" });
    const sub = scene.add.text(0, 0, "—", { fontSize: 12, color: "#b0b0b0", fontFamily: "Bungee" });

    const makeHpBarWithText = (width, height) => {
      const s = scene.rexUI.add.overlapSizer({ width, height });

      const bg = rr(width, height, 5, 0x222222, 1);
      const fill = rr(Math.max(1, width - 2), Math.max(1, height - 2), 5, 0x4caf50, 1)
        .setOrigin(0, 0.5);

      const txt = scene.add.text(0, 0, 'HP —/—', {
        fontFamily: 'Bungee',
        fontSize: 12,
        color: '#ffffff',
      }).setOrigin(0.5, 0.5);

      s.addBackground(bg);
      s.add(fill, { key: 'fill', align: 'left', expand: false, padding: { left: 1, right: 1 } });
      s.add(txt,  { key: 'txt',  align: 'center', expand: false });
      s.layout();

      s.setValue = (cur, max) => {
        const m = Math.max(1, (max ?? 0));
        const c = Math.max(0, (cur ?? 0));
        const p = Phaser.Math.Clamp(c / m, 0, 1);
        fill.width = Math.max(1, (width - 2) * p);
        txt.setText(`HP ${Math.floor(c)}/${Math.floor(m)}`);
        s.layout();
      };

      return s;
    };

    const storageHpBar = makeHpBarWithText(240, 14);
    let currentStorage = null;
    let selectedSlotIndex = null;

    const gridSizer = scene.rexUI.add.gridSizer({
      column: 4, row: 4,
      columnProportions: 1, rowProportions: 1,
      space: { column: 8, row: 8, left: 6, right: 6, top: 6, bottom: 6 },
    });

    const makeCell = () => {
      const s = scene.rexUI.add.overlapSizer({ width: 32, height: 32 });

      // 🔲 background gray box like ClayOvenTab
      const bg = scene.rexUI.add.roundRectangle(
        0, 0,
        28, 28,
        4,
        0x333333,
        0.9
      );
      s.addBackground(bg);

      // placeholder icon; we size it only when real texture is set
      const icon = scene.add.image(0, 0, "blank").setOrigin(0.5);

      const count = scene.add.text(0, 0, "", {
        fontSize: 11,
        color: "#ffffff",
        stroke: "#000",
        strokeThickness: 2,
        fontFamily: "Bungee",
      }).setOrigin(1, 1);

      s.add(icon,  { key: "icon",  align: "center" });
      s.add(count, { key: "count", align: "right-bottom" });

      s.bg = bg;
      s.icon = icon;
      s.text = count;

      s.setIcon = (key, amt) => {
        const hasIcon = key && scene.textures.exists(key);

        if (hasIcon) {
          icon.setTexture(key);
          icon.setDisplaySize(24, 24);   // size AFTER real texture
          icon.setVisible(true);
        } else {
          // no item → hide the icon, keep gray box visible
          icon.setVisible(false);
        }

        if (amt && amt > 1) {
          count.setVisible(true).setText("x" + amt);
        } else {
          count.setVisible(false);
        }
      };

      s.setSelected = (active) => {
        bg.setFillStyle(active ? 0x6e5cff : 0x333333, active ? 0.95 : 0.9);
        bg.setStrokeStyle(active ? 2 : 1, 0xffffff, active ? 0.35 : 0.08);
      };

      s.setSelected(false);

      return s;
    };

    const cells = [];
    for (let i = 0; i < 16; i++) {
      const c = makeCell();
      gridSizer.add(c, { column: i % 4, row: Math.floor(i / 4), expand: false });
      cells.push(c);
    }

    const selectionText = scene.add.text(0, 0, "Select a filled slot to sell items.", {
      fontSize: 11,
      color: "#b7c9d8",
      fontFamily: "Bungee",
      wordWrap: { width: 240 }
    });

    const makeActionBtn = (label, fill) => {
      const text = scene.add.text(0, 0, label, {
        fontFamily: "Bungee",
        fontSize: 12,
        color: "#ffffff"
      });

      const btn = scene.rexUI.add.label({
        background: scene.rexUI.add.roundRectangle(0, 0, 0, 32, 10, fill, 1),
        text,
        space: { left: 10, right: 10, top: 6, bottom: 6 }
      }).setMinSize(100, 32);

      btn.labelText = text;
      btn.setEnabledState = (enabled) => {
        btn.setAlpha(enabled ? 1 : 0.35);
      };
      btn.setEnabledState(false);
      return btn;
    };

    const sellOneBtn = makeActionBtn("Sell 1", 0x8b5cf6);
    const sellStackBtn = makeActionBtn("Sell Stack", 0xde7b2a);

    const actionsRow = scene.rexUI.add.sizer({
      orientation: "x",
      space: { item: 8 }
    })
      .add(sellOneBtn, { proportion: 1, expand: true })
      .add(sellStackBtn, { proportion: 1, expand: true });

    const refreshSelectionUi = () => {
      const slot = currentStorage?.storageItems?.[selectedSlotIndex] || null;

      cells.forEach((cell, idx) => {
        cell.setSelected(!!slot && idx === selectedSlotIndex);
      });

      if (!slot?.item) {
        selectionText.setText("Select a filled slot to sell items.");
        sellOneBtn.labelText.setText("Sell 1");
        sellStackBtn.labelText.setText("Sell Stack");
        sellOneBtn.setEnabledState(false);
        sellStackBtn.setEnabledState(false);
        return;
      }

      const price = StorageManager.getStorageSellPrice(slot.item);
      selectionText.setText(`${slot.item.label || slot.item.name} x${slot.amount}  •  $${price} each`);
      sellOneBtn.labelText.setText(`Sell 1 ($${price})`);
      sellStackBtn.labelText.setText(`Sell Stack ($${price * slot.amount})`);
      sellOneBtn.setEnabledState(true);
      sellStackBtn.setEnabledState(true);
    };

    const sellSelectedSlot = (sellStack = false) => {
      const slot = currentStorage?.storageItems?.[selectedSlotIndex];
      if (!slot?.item) return;

      const amount = sellStack ? slot.amount : 1;
      const { sold, revenue, item } = StorageManager.sellFromStorage(
        currentStorage,
        selectedSlotIndex,
        amount,
        scene,
        { sourceUiTarget: sellStack ? sellStackBtn : sellOneBtn }
      );
      if (sold <= 0) return;

      showAlert(scene, `Sold ${sold} ${item?.label || item?.name} for $${revenue}`, "#33ff77", 1800);
      selectedSlotIndex = null;
      refreshSelectionUi();
      if (currentStorage) {
        setStorage(currentStorage);
      }
    };

    sellOneBtn
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => {
        AudioManager.playBottomBarClick();
        sellSelectedSlot(false);
      });

    sellStackBtn
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => {
        AudioManager.playBottomBarClick();
        sellSelectedSlot(true);
      });

    cells.forEach((cell, idx) => {
      cell
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          const slot = currentStorage?.storageItems?.[idx];
          selectedSlotIndex = slot?.item ? idx : null;
          refreshSelectionUi();
        });
    });

    const fixBtn = scene.rexUI.add.label({
      background: scene.rexUI.add.roundRectangle(0, 0, 0, 34, 10, 0x2f7d32),
      text: scene.add.text(0, 0, "🛠 Fix", { fontFamily: "Bungee", fontSize: 14, color: "#ffffff" }),
      space: { left: 12, right: 12, top: 7, bottom: 7 },
    })
      .setMinSize(110, 34)
      .setInteractive({ useHandCursor: true });

    fixBtn.on('pointerup', () => {
      AudioManager.playBottomBarClick();
      const b = this.selected; // storage
      if (!b) return;
      buildingManager.requestBuildingFix(b, this.team, []);
    });

    const headerRow = scene.rexUI.add.sizer({
      orientation: "x",
      space: { item: 10 }
    })
      .add(title, { proportion: 1, align: "left", expand: true })
      .add(fixBtn, { proportion: 0, align: "right", expand: false });

    const panel = scene.rexUI.add.sizer({ orientation: "y", space: { item: 8 } })
      .add(headerRow, 0, "left", 0, true)
      .add(sub, 0, "left", 0, false)
      .add(storageHpBar, 0, "left", 0, false)
      .add(rr(0, 2, 0, 0xffffff, 0.15), 0, "left", 0, false)
      .add(gridSizer, 0, "left", 0, false)
      .add(selectionText, 0, "left", 0, false)
      .add(actionsRow, 0, "left", 0, true);

    const setStorage = (storage) => {
      currentStorage = storage;
      if (!storage || !storage.storageItems?.[selectedSlotIndex]?.item) {
        selectedSlotIndex = null;
      }
      if (!storage) {
        title.setText("Storage");
        sub.setText("—");
        storageHpBar.setValue(0, 1);
        refreshSelectionUi();
        cells.forEach(c => c.setIcon(null, 0));   // 🔸 no texture for empty
        return;
      }

      title.setText("Storage");
      sub.setText(`(${storage.x ?? 0}, ${storage.y ?? 0})`);
      storageHpBar.setValue(storage.health ?? 0, storage.maxHealth ?? 1);

      const items = storage.storageItems;
      for (let i = 0; i < 16; i++) {
        const slot = items[i];
        const key  = UI_ITEM_TYPES[slot?.item?.name || "empty"]?.icon || null;
        cells[i].setIcon(key, slot?.amount || 0);
      }

      refreshSelectionUi();
    };

    return { panel, setStorage };
  }

  //refresh logic
  onShow() {
    const team = Teams.teamLists[this.team];
    const storages = team?.storageList || [];

    // If nothing selected (or old selection is gone), pick the first storage
    if (!this.selected || !storages.includes(this.selected)) {
      if (storages[0]) {
        // Opening the tab should not pan cameras; just select the first storage.
        this.selectStorage(storages[0]);
      } else {
        this.selected = null;
        if (this.detail?.setStorage) this.detail.setStorage(null);
        return;
      }
    } else if (this.detail?.setStorage) {
      // Ensure detail panel is synced with existing selection
      this.detail.setStorage(this.selected);
    }

    // Refresh every row from current storage state
    storages.forEach((s) => this.updateCard(s));
  }

  // ---------- CARD LIST ----------
  rebuildList() {
    const storages = Teams.teamLists[this.team]?.storageList || [];
    this.cardByStorage.clear();
    this.listBody.clear(true);

    if (!storages.length) {
      this.listBody.add(this.createEmptyCard(), { expand: true });
    }

    storages.forEach((storage, idx) => {
      const card = this.createCard(storage, idx);
      this.listBody.add(card, { expand: true });
      this.cardByStorage.set(storage, card);
    });

    this.scroll.layout();
  }

  createEmptyCard() {
    const width = Math.max(220, (this.listWidth ?? Math.floor(getBottomBarWidth(this.scene) * 0.34)) - 16);
    return makeBottomBarEmptyRow(this.scene, {
      width,
      height: 52,
      title: "No storage",
      subtitle: "Build storage from Store",
      accent: 0xffc97a,
    });
  }

  getStorageCountLabel(storage, filledSlots) {
    const totalSlots = Math.max(0, Number(storage?.storageItems?.length || 0));
    if (totalSlots > 0 && filledSlots >= totalSlots) {
      return "ALL SLOTS\nFILLED";
    }
    return `${filledSlots} / ${totalSlots} slots`;
  }

  createCard(storage, idx) {
    const scene = this.scene;
    const selected = storage === this.selected;
    const titleColor = selected ? "#fff9ef" : BOTTOM_BAR_THEME.text;

    const nameText = scene.add.text(0, 0, `Storage ${idx + 1} (${storage.x ?? 0},${storage.y ?? 0})`, {
      fontFamily: "Bungee",
      fontSize: 12,
      color: titleColor,
      stroke: "#081621",
      strokeThickness: 2,
    });

    const countText = scene.add.text(0, 0, "", {
      fontFamily: "Bungee",
      fontSize: 10,
      color: BOTTOM_BAR_THEME.textMuted,
      stroke: "#081621",
      strokeThickness: 2,
    }).setLineSpacing(-2);

    const iconsRow = scene.rexUI.add.sizer({
      orientation: "x",
      space: { item: 4 },
    });

    const items = storage.storageItems
      .filter((s) => s && s.item && s.item.name !== "empty");

    items.forEach((slot) => {
      const key = UI_ITEM_TYPES[slot.item.name]?.icon || "blank";
      const s = scene.rexUI.add.overlapSizer({ width: 26, height: 26 });
      const slotBg = makeGlassRoundRect(scene, 26, 26, 9, {
        fill: mixColor(BOTTOM_BAR_THEME.panelSoftFill, 0xffffff, 0.05),
        alpha: 0.88,
        stroke: 0xffffff,
        strokeAlpha: 0.08,
        strokeWidth: 1,
      }).setDepth(TAB_BG_DEPTH);
      const im = scene.add.image(0, 0, key).setDisplaySize(18, 18).setOrigin(0.5).setDepth(TAB_CONTENT_DEPTH);
      const tx = scene.add.text(0, 0, "", {
        fontSize: 10,
        color: "#ffffff",
        stroke: "#081621",
        strokeThickness: 2,
        fontFamily: "Bungee",
      }).setOrigin(1, 1).setDepth(TAB_CONTENT_DEPTH);
      if (slot.amount > 1) tx.setText("x" + slot.amount).setVisible(true);
      s.add(slotBg, { key: "bg", align: "center" });
      s.add(im, { key: "im", align: "center" });
      s.add(tx, { key: "tx", align: "right-bottom" });
      iconsRow.add(s);
    });

    const fullWidth = Math.max(220, (this.listWidth ?? Math.floor(getBottomBarWidth(scene) * 0.34)) - 16);
    const tint = 0xa5d8ff;
    const bg = makeGlassRoundRect(scene, 0, 0, 14, {
      fill: mixColor(BOTTOM_BAR_THEME.cardFill, 0xffffff, 0.06),
      alpha: 0.86,
      stroke: tint,
      strokeAlpha: 0.12,
      strokeWidth: 1.5,
    })

    // helper: HP bar (no text)
    const makeHpBar = (width, height) => {
      const s = scene.rexUI.add.overlapSizer({ width, height });
      const b = makeGlassRoundRect(scene, width, height, 4, {
        fill: 0x08121a,
        alpha: 0.92,
        stroke: 0x98e7ff,
        strokeAlpha: 0.06,
        strokeWidth: 1,
      }).setDepth(TAB_BG_DEPTH);
      const f = scene.rexUI.add.roundRectangle(0, 0, Math.max(1, width - 2), Math.max(1, height - 2), 4, 0x54d78b, 1)
        .setOrigin(0, 0.5)
        .setDepth(TAB_CONTENT_DEPTH);
      s.addBackground(b);
      s.add(f, { key: "fill", align: "left", expand: false, padding: { left: 1, right: 1 } });
      s.layout();
      s.setPercent = (pct) => {
        const p = Phaser.Math.Clamp(pct ?? 0, 0, 1);
        f.width = Math.max(1, (width - 2) * p);
        s.layout();
      };
      return s;
    };

    const hpBar = makeHpBar(Math.max(80, fullWidth - 24), 6);
    hpBar.setPercent((storage.health ?? 0) / (storage.maxHealth || 1));
    countText.setText(this.getStorageCountLabel(storage, items.length));

    const textCol = scene.rexUI.add.sizer({
      orientation: "y",
      space: { item: 2 },
    })
      .add(nameText, { proportion: 0, expand: false, align: "left" })
      .add(countText, { proportion: 0, expand: false, align: "left" });

    const topRow = scene.rexUI.add.sizer({
      orientation: "x",
      space: { item: 8 },
    })
      .add(textCol, { proportion: 1, expand: true, align: "left" })
      .add(iconsRow, { proportion: 1, expand: true, align: "right" });

    const content = scene.rexUI.add.sizer({
      orientation: "y",
      space: { item: 6 },
    })
      .add(topRow, { proportion: 1, expand: true })
      .add(hpBar, 0, "left", 0, false)
      .setDepth(TAB_CONTENT_DEPTH);

    const card = scene.rexUI.add.overlapSizer({ width: fullWidth })
      .addBackground(bg)
      .add(content, {
        align: "center",
        expand: true,
        padding: { left: 12, right: 12, top: 8, bottom: 6 },
      })
      .setDepth(TAB_BASE_DEPTH);

    bg.setDepth(50);

    card.setMinSize(fullWidth, 52);
    card.userData = { storage, iconsRow, hpBar, nameText, countText, bg, hovered: false };
    card.setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.selectFromCard(storage));

    card.on("pointerover", () => {
      card.userData.hovered = true;
      this.updateCardVisual(storage);
    });
    card.on("pointerout",  () => {
      card.userData.hovered = false;
      this.updateCardVisual(storage);
    });

    this.updateCardVisual(storage);

    return card;
  }

  updateCard(storage) {
    const card = this.cardByStorage.get(storage);
    if (!card || !card.userData) return;
    const { iconsRow, hpBar, nameText, countText } = card.userData;
    iconsRow.removeAll(true);

    const items = storage.storageItems
      .filter(s => s && s.item && s.item.name !== "empty");
    items.forEach(slot => {
      const key = UI_ITEM_TYPES[slot.item.name]?.icon || "blank";
      const s = this.scene.rexUI.add.overlapSizer({ width: 26, height: 26 });
      const slotBg = makeGlassRoundRect(this.scene, 26, 26, 9, {
        fill: mixColor(BOTTOM_BAR_THEME.panelSoftFill, 0xffffff, 0.05),
        alpha: 0.88,
        stroke: 0xffffff,
        strokeAlpha: 0.08,
        strokeWidth: 1,
      }).setDepth(TAB_BG_DEPTH);
      const im = this.scene.add.image(0, 0, key).setDisplaySize(18, 18).setOrigin(0.5).setDepth(TAB_CONTENT_DEPTH);
      const tx = this.scene.add.text(0, 0, "", {
        fontSize: 10, color: "#ffffff", stroke: "#081621", strokeThickness: 2, fontFamily: "Bungee",
      }).setOrigin(1, 1).setDepth(TAB_CONTENT_DEPTH);
      if (slot.amount > 1) tx.setText("x" + slot.amount).setVisible(true);
      s.add(slotBg, { key: "bg", align: "center" });
      s.add(im, { key: "im", align: "center" });
      s.add(tx, { key: "tx", align: "right-bottom" });
      iconsRow.add(s);
    });

    iconsRow.layout();

    if (nameText?.setText) {
      const base = (nameText.text || 'Storage').split('(')[0].trimEnd();
      nameText.setText(`${base}(${storage.x ?? 0},${storage.y ?? 0})`);
    }
    if (countText?.setText) {
      countText.setText(this.getStorageCountLabel(storage, items.length));
    }

    if (hpBar?.setPercent) {
      hpBar.setPercent((storage.health ?? 0) / (storage.maxHealth || 1));
    }

    this.updateCardVisual(storage);
  }

  updateCardVisual(storage) {
    const card = this.cardByStorage.get(storage);
    if (!card || !card.userData) return;
    const { bg, nameText, countText, hovered } = card.userData;
    const selected = storage === this.selected;
    const accent = selected ? 0xffd28a : mixColor(0xffd28a, 0x98e7ff, 0.35);

    bg.setFillStyle(
      mixColor(BOTTOM_BAR_THEME.cardFill, accent, hovered || selected ? 0.16 : 0.08),
      selected ? 0.94 : hovered ? 0.9 : 0.86
    );
    bg.setStrokeStyle(selected ? 2.5 : hovered ? 2 : 1.5, accent, selected ? 0.36 : hovered ? 0.24 : 0.12);
    nameText.setColor(selected ? "#fff9ef" : BOTTOM_BAR_THEME.text);
    countText.setColor(selected ? "#ffe9be" : BOTTOM_BAR_THEME.textMuted);
    card.setScale(1, 1);
  }

  // ---------- BEHAVIOR ----------
  selectStorage(storage) {
    this.selected = storage;
    this.detail.setStorage(storage);
    this.cardByStorage.forEach((_card, key) => this.updateCardVisual(key));
  }

  centerCameraOnStorage(storage) {
    if (!storage?.sprite) return;
    const cam = this.scene.worldScene?.cameras?.main || this.scene.cameras.main;
    cam.centerOn(storage.sprite.x, storage.sprite.y);
  }

  selectFromCard(storage) {
    this.selectStorage(storage);
    this.centerCameraOnStorage(storage);
  }

  selectFromWorld(storage) {
    this.selectStorage(storage);
    // no camera movement
  }

  refresh(teamNumber) {
    this.team = teamNumber;
    this.rebuildList();
  }

  update() {
    const current = this.scene.uiBottomBar?.currentPage;
    if (current !== 'storage' || !this.selected) return;

    this.detail.setStorage(this.selected);
  }

}
