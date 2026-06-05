import { Teams } from "../../Teams";
import { UI_ITEM_TYPES } from "../UIConstants";
import { AudioManager } from "../../Manager/AudioManager.js";
import { buildingManager } from "../../Manager/buildingManager.js";
import {
  addScrollablePanelAffordance,
  getBottomBarWidth,
  handleScrollablePanelWheel,
  makeBottomBarEmptyRow,
  mixColor,
} from "./BottomBarTheme.js";

const TAB_BASE_DEPTH = 51;

export default class ClayOvenTab {
  static ensureBlankTexture(scene) {
    if (scene.textures.exists("blank")) return;
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 1, 1);
    g.generateTexture("blank", 1, 1);
    g.destroy();
  }

  constructor(scene, teamNumber = 1) {
    this.scene = scene;
    this.team = teamNumber;
    this.selected = null;
    this.cardByOven = new Map();
    this._onWheel = null;
    this._destroyed = false;
    this._listDirty = false;
    this._listRefreshQueued = false;
    this._scrollAffordances = [];
    this.root = this.build();
    this.bindScrollInput();

    this._update = this.update.bind(this);
    this.scene.events.on("update", this._update);

    this._onOvenUpdated = (oven) => {
      if (!oven || oven.teamNumber !== this.team) return;
      if (!this.cardByOven.has(oven)) {
        this._scheduleListRefresh();
      }
      if (this.scene.uiBottomBar?.currentPage !== "ovens") return;
      this.updateCard(oven);
      if (this.selected === oven) this.detail?.setOven?.(oven);
    };

    this._onOvenAdded = (oven) => {
      if (!oven || oven.teamNumber !== this.team) return;
      this._scheduleListRefresh();
    };

    this._onOvenRemoved = (oven) => {
      if (this._destroyed) return;
      const team = Teams.teamLists[this.team];
      if (team) {
        for (const key of ["ovenJobs", "ovenFuelJobs", "ovenPickupJobs", "ovenDeliveryItems", "ovenFuelDeliveryItems"]) {
          if (Array.isArray(team[key])) team[key] = team[key].filter((job) => job?.oven !== oven);
        }
      }
      const row = this.cardByOven.get(oven);
      if (row) {
        row.destroy();
        this.cardByOven.delete(oven);
        this._safeScrollLayout();
      }
      if (this.selected === oven) {
        this.selected = null;
        this.detail?.setOven?.(null);
      }
      this._scheduleListRefresh();
    };

    scene.events.on("oven:updated", this._onOvenUpdated);
    scene.events.on("oven:added", this._onOvenAdded);
    scene.events.on("oven:removed", this._onOvenRemoved);
  }

  get view() { return this.root; }

  hide() {
    this.selected = null;
    this.detail?.setOven?.(null);
  }

  destroy() {
    this._destroyed = true;
    if (typeof this._update === "function") {
      this.scene.events.off("update", this._update);
    }
    this.scene.events.off("oven:updated", this._onOvenUpdated);
    this.scene.events.off("oven:added", this._onOvenAdded);
    this.scene.events.off("oven:removed", this._onOvenRemoved);
    if (this._onWheel) this.scene.input.off("wheel", this._onWheel);
    this._scrollAffordances.forEach((affordance) => affordance?.destroy?.());
    this._scrollAffordances = [];
    this.root?.destroy();
  }

  _scheduleListRefresh() {
    this._listDirty = true;
    if (
      this._destroyed ||
      this._listRefreshQueued ||
      this.scene?.uiBottomBar?.currentPage !== "ovens" ||
      !this._isUiAlive()
    ) {
      return;
    }

    this._listRefreshQueued = true;
    this.scene.time.delayedCall(0, () => {
      this._listRefreshQueued = false;
      if (!this._isUiAlive()) return;
      if (!this._listDirty) return;
      this.rebuildList();
    });
  }

  _isUiAlive() {
    return !!(
      !this._destroyed &&
      this.scene?.sys &&
      this.root?.scene === this.scene &&
      this.listBody?.scene === this.scene &&
      this.scroll?.scene === this.scene
    );
  }

  _safeScrollLayout() {
    if (!this._isUiAlive()) return false;
    try {
      this.scroll.layout();
      return true;
    } catch {
      return false;
    }
  }

  rr(w = 0, h = 0, r = 14, c = 0x153248, a = 0.78, stroke = 0x95e4ff, sa = 0.16) {
    const rect = this.scene.rexUI.add.roundRectangle(0, 0, w, h, r, c, a);
    rect.setStrokeStyle(2, stroke, sa);
    return rect;
  }

  panelBg(w = 0, h = 0, r = 14, c = 0x153248, a = 0.78, stroke = 0x95e4ff, sa = 0.16) {
    const bg = this.rr(w, h, r, c, a, stroke, sa);
    return bg;
  }

  txt(text, style = {}) {
    const label = this.scene.add.text(0, 0, text, { fontFamily: "Bungee", fontSize: 12, color: "#ffffff", ...style });
    label.setAlpha(1);
    label.setShadow(0, 1, "#000000", 2, true, true);
    return label;
  }

  button(label, fill = 0x305f78, stroke = 0xa9ebff, color = "#ffffff") {
    const compact = this.scene.scale.width < 1080;
    const bg = this.panelBg(0, 0, 12, fill, 0.95, stroke, 0.18);
    const text = this.txt(label, { fontSize: compact ? 11 : 12, color });
    const btn = this.scene.rexUI.add.label({
      background: bg,
      text,
      space: { left: compact ? 10 : 12, right: compact ? 10 : 12, top: compact ? 6 : 8, bottom: compact ? 6 : 8 }
    });
    btn.setInteractive({ useHandCursor: true });
    btn.on("pointerover", () => bg.setFillStyle(fill, 1));
    btn.on("pointerout", () => bg.setFillStyle(fill, 0.95));
    btn.on("pointerup", () => {
      AudioManager.playBottomBarClick();
    });
    btn.setEnabledState = (enabled) => {
      btn.disableInteractive();
      if (enabled) btn.setInteractive({ useHandCursor: true });
      btn.setAlpha(enabled ? 1 : 0.4);
    };
    return btn;
  }

  pill(text, fill = 0x17384c, stroke = 0x93dfff, color = "#d7f5ff") {
    const compact = this.scene.scale.width < 1080;
    const bg = this.panelBg(0, 0, 11, fill, 0.92, stroke, 0.16);
    const label = this.txt(text, { fontSize: compact ? 9 : 10, color });
    const pill = this.scene.rexUI.add.label({
      background: bg,
      text: label,
      space: { left: compact ? 8 : 10, right: compact ? 8 : 10, top: compact ? 4 : 5, bottom: compact ? 4 : 5 }
    });
    pill.setValue = (nextText, nextFill = fill, nextStroke = stroke, nextColor = color) => {
      label.setText(nextText);
      label.setColor(nextColor);
      bg.setFillStyle(nextFill, 0.92);
      bg.setStrokeStyle(2, nextStroke, 0.16);
    };
    return pill;
  }

  slot(size = 54) {
    const s = this.scene.rexUI.add.overlapSizer({ width: size, height: size });
    const bg = this.panelBg(size, size, 13, 0x102637, 0.95, 0x98e7ff, 0.14);
    const shine = this.scene.rexUI.add.roundRectangle(0, 0, size - 16, 12, 6, 0xffffff, 0.08);
    const icon = this.scene.add.image(0, 0, "blank").setDisplaySize(size - 18, size - 18).setVisible(false);
    const count = this.txt("", { fontSize: 10, stroke: "#091018", strokeThickness: 3 }).setOrigin(1, 1).setVisible(false);
    const hint = this.txt("", { fontSize: 9, color: "#98bed0", align: "center", wordWrap: { width: size - 12 } }).setOrigin(0.5);
    s.addBackground(bg);
    s.add(shine, { align: "top", padding: { top: 7 } });
    s.add(icon, { align: "center" });
    s.add(hint, { align: "center" });
    s.add(count, { align: "right-bottom", padding: { right: 6, bottom: 5 } });
    s.setItem = (item, amount = 0, empty = "") => {
      const ui = typeof item === "string" ? UI_ITEM_TYPES[item] : (item?.name ? UI_ITEM_TYPES[item.name] : item);
      const iconKey = ui?.icon || null;
      const showIcon = !!(iconKey && this.scene.textures.exists(iconKey));
      icon.setVisible(showIcon);
      if (showIcon) icon.setTexture(iconKey);
      hint.setVisible(!showIcon && !!empty).setText(showIcon ? "" : empty);
      count.setVisible(amount > 1).setText(amount > 1 ? `x${amount}` : "");
      s.layout();
    };
    return s;
  }

  bar(width = 150, height = 12) {
    const root = this.scene.add.container(0, 0).setSize(width, height);
    const bg = this.panelBg(width, height, height / 2, 0x08121a, 0.92, 0x92ddff, 0.08);
    const fill = this.scene.add.graphics();
    const text = this.txt("Idle", {
      fontSize: (width < 110 || this.scene.scale.width < 1080) ? 8 : 9,
      color: "#9fb3bf"
    }).setOrigin(0.5);

    root.add([bg, fill, text]);

    root.setValue = (pct, label = "Idle", color = 0x49cf73) => {
      const progress = Phaser.Math.Clamp(pct || 0, 0, 1);
      const innerHeight = Math.max(1, height - 4);
      const fillWidth = Math.max(innerHeight, Math.round((width - 4) * progress));
      const active = progress > 0;
      fill.clear();
      if (active) {
        fill.fillStyle(color, 1);
        fill.fillRoundedRect(
          (-width / 2) + 2,
          (-innerHeight) / 2,
          fillWidth,
          innerHeight,
          Math.max(1, innerHeight / 2)
        );
      }
      text.setText(label);
      text.setColor(active ? "#d7f3dc" : "#9fb3bf");
    };
    return root;
  }

  cookJob(oven) { return (Teams.teamLists[this.team]?.ovenJobs || []).find((j) => !j.canceled && j.oven === oven && j.inputidx === 0); }
  fuelJob(oven) { return (Teams.teamLists[this.team]?.ovenFuelJobs || []).find((j) => !j.canceled && j.oven === oven); }
  pickupJob(oven) { return (Teams.teamLists[this.team]?.ovenPickupJobs || []).find((j) => j.oven === oven && j.outputidx === 0 && j.amount > 0); }

  build() {
    const scene = this.scene;
    const contentHeight = 200;
    const rootSpace = { left: 10, right: 10, top: 8, bottom: 8, item: 12 };
    const splitWidth = Math.max(0, getBottomBarWidth(scene) - rootSpace.left - rootSpace.right - rootSpace.item);
    const detailProportion = 4;
    const listProportion = 5;
    const totalProportion = detailProportion + listProportion;
    const minPaneWidth = splitWidth >= 760 ? 280 : splitWidth >= 520 ? 220 : 160;
    this.detailWidth = Phaser.Math.Clamp(
      Math.floor(splitWidth * (detailProportion / totalProportion)),
      minPaneWidth,
      Math.max(minPaneWidth, splitWidth - minPaneWidth)
    );
    this.listWidth = Math.max(minPaneWidth, splitWidth - this.detailWidth);

    const root = scene.rexUI.add.sizer({ orientation: "x", space: rootSpace }).setDepth(TAB_BASE_DEPTH);
    this.detail = this.buildDetailPanel();
    this.detail.panel?.setMinSize?.(this.detailWidth, contentHeight);
    this.detailScroll = scene.rexUI.add.scrollablePanel({
      width: this.detailWidth,
      height: contentHeight,
      scrollMode: 0,
      scrollDetectionMode: "rectBounds",
      background: this.rr(0, 0, 16, 0x0f2432, 0.42, 0x93dfff, 0.14),
      panel: { child: this.detail.panel, mask: { padding: 2 } },
      scrollerY: { pointerOutRelease: true, rectBoundsInteractive: true },
      space: { left: 8, right: 8, top: 8, bottom: 8, panel: 8 },
    }).setDepth(TAB_BASE_DEPTH);
    const detailSizer = scene.rexUI.add.sizer({
      orientation: "y",
      height: contentHeight,
    }).add(this.detailScroll, { proportion: 1, expand: true }).setDepth(TAB_BASE_DEPTH);
    detailSizer.setMinSize(this.detailWidth, contentHeight);
    root.add(detailSizer, { proportion: detailProportion, expand: true });

    this.listBody = this.scene.rexUI.add.sizer({ orientation: "y", space: { item: 10 } });
    this.scroll = this.scene.rexUI.add.scrollablePanel({
      width: this.listWidth,
      height: contentHeight,
      scrollMode: 0,
      scrollDetectionMode: "rectBounds",
      background: this.rr(0, 0, 16, 0x0f2432, 0.42, 0x93dfff, 0.14),
      panel: { child: this.listBody, mask: { padding: 2 } },
      scrollerY: { pointerOutRelease: true, rectBoundsInteractive: true },
      space: { left: 8, right: 8, top: 8, bottom: 8, panel: 10 },
    }).setDepth(TAB_BASE_DEPTH);
    this._scrollAffordances.push(addScrollablePanelAffordance(scene, this.scroll, {
      isActive: () => this.scene.uiBottomBar?.expanded && this.scene.uiBottomBar?.currentPage === "ovens",
    }));
    const listSizer = scene.rexUI.add.sizer({
      orientation: "y",
      height: contentHeight,
    }).add(this.scroll, { proportion: 1, expand: true }).setDepth(TAB_BASE_DEPTH);
    listSizer.setMinSize(this.listWidth, contentHeight);
    root.add(listSizer, { proportion: listProportion, expand: true });
    this.rebuildList();
    root.layout();
    return root;
  }

  bindScrollInput() {
    if (this._onWheel) return;
    this._onWheel = (pointer, _gameObjects, dx, dy) => {
      if (this.scene.uiBottomBar?.currentPage !== "ovens") return;
      if (!this.scene.uiBottomBar?.expanded) return;
      const panels = [this.scroll];
      panels.some((panel) => handleScrollablePanelWheel(this.scene, panel, pointer, dx, dy));
    };
    this.scene.input.on("wheel", this._onWheel);
  }

  isPointerOverScroll(pointer) {
    if (!this.scroll?.getBounds) return false;
    return Phaser.Geom.Rectangle.Contains(this.scroll.getBounds(), pointer.x, pointer.y);
  }

  buildDetailPanel() {
    const compact = this.scene.scale.width < 1080;
    const contentWidth = Math.max(220, (this.detailWidth || 360) - 54);
    let statusColumnWidth = Math.max(156, Math.floor(contentWidth * 0.36));
    let burnerWidth = contentWidth - statusColumnWidth - 10;
    if (burnerWidth < 210) {
      burnerWidth = Math.floor((contentWidth - 10) * 0.58);
      statusColumnWidth = contentWidth - burnerWidth - 10;
    }

    const burnerBg = this.panelBg(0, 0, 15, 0x1f4a64, 0.46, 0x9ce7ff, 0.16);
    const title = this.txt("Clay Oven", { fontSize: compact ? 16 : 18 });
    const hp = this.bar(Math.max(150, contentWidth - 112), 13);
    const fuel = this.pill("Fuel 0", 0x2c2817, 0xffcf88, "#ffe8b2");
    const fixBtn = this.button("Fix", 0x27512d, 0x9df0ae, "#f3fff6");
    fixBtn.setMinSize(compact ? 78 : 88, compact ? 28 : 30);
    const input = this.slot(compact ? 54 : 58);
    const output = this.slot(compact ? 54 : 58);
    const progress = this.bar(Math.max(98, burnerWidth - 172), 12);
    const pickup = this.pill("No pickup queued", 0x17354a, 0x93dfff, "#d7f5ff");
    const cookBubble = this.buildStatusBubble("Cook Status", 0x16384d, 0x6dd3ff, statusColumnWidth);
    const fuelBubble = this.buildStatusBubble("Fuel Status", 0x2a2517, 0xffcf88, statusColumnWidth);
    fuel.setMinSize(96, 0);

    const burnerMid = this.scene.rexUI.add.sizer({ orientation: "y", space: { item: 5 } })
      .add(this.txt("Burner Lane", { fontSize: compact ? 10 : 11, color: "#effcff" }), { expand: false, align: "center" })
      .add(progress, { expand: false, align: "center" })
      .add(pickup, { expand: false, align: "center" });
    const burnerRow = this.scene.rexUI.add.sizer({ orientation: "x", space: { item: 10 } })
      .add(input, { expand: false })
      .add(burnerMid, { proportion: 1, expand: true })
      .add(this.txt("->", { fontSize: 16, color: "#9ccde0" }), { expand: false })
      .add(output, { expand: false });
    const burnerCard = this.scene.rexUI.add.sizer({ orientation: "y", space: { left: 10, right: 10, top: compact ? 6 : 8, bottom: compact ? 6 : 8, item: compact ? 5 : 6 } })
      .addBackground(burnerBg)
      .add(burnerRow, { expand: true });
    const headerRow = this.scene.rexUI.add.sizer({ orientation: "x", space: { item: 8 } })
      .add(title, { proportion: 1, expand: true, align: "left" })
      .add(fixBtn, { proportion: 0, expand: false, align: "right" });
    const statRow = this.scene.rexUI.add.sizer({ orientation: "x", space: { item: 8 } })
      .add(hp, { proportion: 1, expand: true })
      .add(fuel, { expand: false, align: "center" });
    const queueColumn = this.scene.rexUI.add.sizer({ orientation: "y", space: { item: 6 } })
      .add(cookBubble.box, { expand: true })
      .add(fuelBubble.box, { expand: true });
    const workRow = this.scene.rexUI.add.sizer({ orientation: "x", space: { item: 10 } })
      .add(burnerCard, { proportion: 1, expand: true })
      .add(queueColumn, { proportion: 0, expand: false, align: "top" });
    const panel = this.scene.rexUI.add.sizer({ orientation: "y", space: { left: 4, right: 4, top: 2, bottom: 2, item: 6 } })
      .add(headerRow, { expand: true, align: "left" })
      .add(statRow, { expand: true })
      .add(workRow, { expand: true })
      .setDepth(TAB_BASE_DEPTH);

    panel.setMinSize(contentWidth, 0);
    burnerCard.setMinSize(burnerWidth, 0);
    cookBubble.box.setMinSize(statusColumnWidth, 0);
    fuelBubble.box.setMinSize(statusColumnWidth, 0);

    const setOven = (oven) => {
      if (!oven) {
        title.setText("Clay Oven");
        hp.setValue(0, "", 0x49cf73);
        fuel.setValue("Fuel 0", 0x2c2817, 0xffcf88, "#ffe8b2");
        input.setItem(null, 0, "");
        output.setItem(null, 0, "");
        progress.setValue(0, "", 0x49cf73);
        pickup.setValue("", 0x17354a, 0x93dfff, "#d7f5ff");
        cookBubble.set("", "", null, 0);
        fuelBubble.set("", "", null, 0);
        panel.layout();
        return;
      }

      const slot = oven?.cookingSlots?.[0] || null;
      const out = oven?.outputSlots?.[0] || null;
      const cookJob = oven ? this.cookJob(oven) : null;
      const fuelJob = oven ? this.fuelJob(oven) : null;
      const pickupJob = oven ? this.pickupJob(oven) : null;
      const dur = oven?.cookDurations?.[0] || 0;
      const elapsed = oven?.cookTimers?.[0] || 0;
      const pct = dur > 0 ? Math.min(elapsed / dur, 1) : 0;
      title.setText(oven ? `Oven (${oven.x}, ${oven.y})` : "Clay Oven");
      hp.setValue((oven?.health || 0) / Math.max(1, oven?.maxHealth || 1), oven ? `HP ${Math.floor(oven.health)}/${Math.floor(oven.maxHealth || 1)}` : "Idle", 0x49cf73);
      fuel.setValue(`Fuel ${oven?.fuel || 0}`, 0x2c2817, 0xffcf88, "#ffe8b2");
      input.setItem(slot?.item || null, slot?.amount || 0, "Cook");
      output.setItem(out?.item || null, out?.amount || 0, "Out");
      progress.setValue(
        pct,
        slot ? `${slot.item?.label || slot.item?.name || "Cook"} ${Math.round(pct * 100)}%` : "Idle",
        0x49cf73
      );
      pickup.setValue(
        pickupJob ? `Pickup queued | ${pickupJob.amount} ready` : (out?.amount > 0 ? "Output ready for auto pickup" : "No pickup queued"),
        out?.amount > 0 ? 0x24453a : 0x17354a,
        out?.amount > 0 ? 0x8bf0c3 : 0x93dfff,
        out?.amount > 0 ? "#e5fff6" : "#d7f5ff"
      );
      cookBubble.set(
        cookJob ? `${cookJob.item?.label || cookJob.item?.name} x${cookJob.target}` : "Cook Status",
        cookJob ? `${cookJob.remaining}/${cookJob.target} left${cookJob.assigned > 0 ? ` | ${cookJob.assigned} assigned` : ""}` : "No cook request active.",
        cookJob?.item || null,
        cookJob?.target || 0
      );
      fuelBubble.set(
        fuelJob ? `Wood x${fuelJob.target}` : "Fuel Status",
        fuelJob ? `${fuelJob.remaining}/${fuelJob.target} wood left${fuelJob.assigned > 0 ? ` | ${fuelJob.assigned} assigned` : ""}` : "No fuel request active.",
        fuelJob ? UI_ITEM_TYPES.wood : null,
        fuelJob?.target || 0
      );
      panel.layout();
    };

    fixBtn.on("pointerup", () => {
      const oven = this.selected;
      if (!oven) return;
      buildingManager.requestBuildingFix(oven, this.team, []);
    });

    return { panel, setOven };
  }

  buildStatusBubble(name, fill, stroke, widthOverride = null) {
    const compact = this.scene.scale.width < 1080 || (widthOverride || 0) < 220;
    const contentWidth = widthOverride || Math.max(300, (this.detailWidth || 360) - 34);
    const bg = this.panelBg(0, 0, 14, fill, 0.44, stroke, 0.16);
    const icon = this.slot(compact ? 36 : 42);
    const title = this.txt(name, { fontSize: compact ? 11 : 12, color: "#f3fcff" });
    const body = this.txt("No request queued.", { fontSize: compact ? 9 : 10, color: "#e3f8ff", wordWrap: { width: Math.max(104, contentWidth - 76) } });
    const textCol = this.scene.rexUI.add.sizer({ orientation: "y", space: { item: compact ? 2 : 4 } })
      .add(title, { expand: false })
      .add(body, { expand: false });
    const box = this.scene.rexUI.add.sizer({ orientation: "x", space: { left: 10, right: 10, top: compact ? 6 : 8, bottom: compact ? 6 : 8, item: compact ? 8 : 10 } })
      .addBackground(bg)
      .add(icon, { expand: false })
      .add(textCol, { proportion: 1, expand: true })
      .setDepth(TAB_BASE_DEPTH);
    box.setMinSize(contentWidth, 0);
    return {
      box,
      set: (nextTitle, nextBody, item, amount) => {
        title.setText(nextTitle);
        body.setText(nextBody);
        const emptyHint = item
          ? ""
          : ((nextTitle || nextBody) ? (name === "Fuel Status" ? "Fuel" : "Cook") : "");
        icon.setItem(item, amount, emptyHint);
        box.layout();
      }
    };
  }

  rebuildList() {
    if (!this._isUiAlive()) return false;
    this.cardByOven.clear();
    this.listBody.clear(true);
    try {
      (Teams.teamLists[this.team]?.ovenList || []).forEach((oven, idx) => {
        const row = this.createCard(oven, idx);
        if (!row) return;
        this.listBody.add(row, { expand: true });
        this.cardByOven.set(oven, row);
        this.updateCard(oven);
      });
      this._listDirty = false;
      if (!this.cardByOven.size) {
        this.listBody.add(this.createEmptyCard(), { expand: true });
      }
      return this._safeScrollLayout();
    } catch {
      return false;
    }
  }

  createCard(oven, idx) {
    const width = Math.max(220, (this.listWidth || (Math.floor(getBottomBarWidth(this.scene) * (2 / 3)) - 46)) - 24);
    const compact = width < 420 || this.scene.scale.width < 1080;
    const rowHeight = compact ? 76 : 80;
    const slotSize = compact ? 38 : 44;
    const progressWidth = compact ? 92 : 112;
    const bg = this.rr(width, rowHeight, 16, 0x102a3b, 0.78, 0x8fe5ff, 0.16);
    const input = this.slot(slotSize);
    const output = this.slot(slotSize);
    const progress = this.bar(progressWidth, 12);
    const fuel = this.pill("Fuel 0", 0x2e2a18, 0xffcf88, "#ffe8b2");
    const cook = this.pill("No cook request");
    const fuelReq = this.pill("No fuel request", 0x2a2417, 0xffcf88, "#ffe8b2");
    const pickup = this.pill("No pickup queued");
    const hp = this.bar(Math.max(80, width - 28), 9);
    const titleColWidth = compact ? 124 : 150;
    const titleLabel = this.txt(`Oven ${idx + 1} (${oven.x}, ${oven.y})`, {
      fontSize: compact ? 11 : 13,
      color: "#f4fcff",
      wordWrap: { width: titleColWidth }
    });
    const lane = this.scene.rexUI.add.sizer({ orientation: "x", space: { item: 8 } })
      .add(input, { expand: false })
      .add(progress, { expand: false })
      .add(this.txt("->", { fontSize: 14, color: "#a5cfdf" }), { expand: false })
      .add(output, { expand: false });
    const top = this.scene.rexUI.add.sizer({ orientation: "x", space: { item: compact ? 6 : 8 } })
      .add(this.scene.rexUI.add.sizer({ orientation: "x" }).add(titleLabel, { expand: false, align: "left" }), { expand: false, align: "center" })
      .add(lane, { proportion: 1, expand: true, align: "center" })
      .add(fuel, { expand: false, align: "center" });
    const bottom = this.scene.rexUI.add.sizer({ orientation: "x", space: { item: 8 } })
      .add(cook, { proportion: 1, expand: true }).add(fuelReq, { proportion: 1, expand: true }).add(pickup, { proportion: 1, expand: true });
    const row = this.scene.rexUI.add.sizer({
      orientation: "y",
      width,
      height: rowHeight,
      space: { left: 12, right: 12, top: compact ? 8 : 10, bottom: compact ? 8 : 10, item: compact ? 6 : 8 }
    })
      .addBackground(bg)
      .add(top, { expand: true })
      .add(bottom, { expand: true })
      .add(hp, { expand: false })
      .setDepth(TAB_BASE_DEPTH);
    row.setMinSize(width, rowHeight);
    row.userData = { oven, row, bg, input, output, progress, fuel, cook, fuelReq, pickup, hp, titleLabel, hovered: false };
    row.setInteractive({ useHandCursor: true }).on("pointerdown", () => { this.selectOven(oven); this.centerCameraOnOven(oven); });
    row.on("pointerover", () => {
      row.userData.hovered = true;
      this.updateCardVisual(oven);
    });
    row.on("pointerout", () => {
      row.userData.hovered = false;
      this.updateCardVisual(oven);
    });
    this.updateCardVisual(oven);
    return row;
  }

  createEmptyCard() {
    const width = Math.max(220, (this.listWidth || (Math.floor(getBottomBarWidth(this.scene) * (2 / 3)) - 46)) - 24);
    const compact = width < 420 || this.scene.scale.width < 1080;
    return makeBottomBarEmptyRow(this.scene, {
      width,
      height: compact ? 76 : 80,
      title: "No clay ovens",
      subtitle: "Build an oven from Store",
      accent: 0xff8a65,
    });
  }

  updateCard(oven) {
    const row = this.cardByOven.get(oven);
    if (!row?.userData) return;
    const slot = oven.cookingSlots?.[0] || null;
    const out = oven.outputSlots?.[0] || null;
    const cookJob = this.cookJob(oven);
    const fuelJob = this.fuelJob(oven);
    const pickupJob = this.pickupJob(oven);
    const dur = oven.cookDurations?.[0] || 0;
    const elapsed = oven.cookTimers?.[0] || 0;
    const pct = dur > 0 ? Math.min(elapsed / dur, 1) : 0;
    row.userData.input.setItem(slot?.item || null, slot?.amount || 0, "Cook");
    row.userData.output.setItem(out?.item || null, out?.amount || 0, "Out");
    row.userData.progress.setValue(
      pct,
      slot ? `${slot.item?.label || slot.item?.name || "Cook"} ${Math.round(pct * 100)}%` : "Idle",
      0x49cf73
    );
    row.userData.fuel.setValue(`Fuel ${oven.fuel | 0}`, 0x2e2a18, 0xffcf88, "#ffe8b2");
    row.userData.cook.setValue(cookJob ? `${cookJob.item?.label || cookJob.item?.name} ${cookJob.remaining}/${cookJob.target}` : "No cook request");
    row.userData.fuelReq.setValue(fuelJob ? `Wood ${fuelJob.remaining}/${fuelJob.target}` : "No fuel request", 0x2a2417, 0xffcf88, "#ffe8b2");
    row.userData.pickup.setValue(
      pickupJob ? `Pickup ${pickupJob.amount} ready` : (out?.amount > 0 ? "Output ready" : "No pickup queued"),
      out?.amount > 0 ? 0x24453a : 0x17384c,
      out?.amount > 0 ? 0x8bf0c3 : 0x93dfff,
      out?.amount > 0 ? "#e5fff6" : "#d7f5ff"
    );
    row.userData.hp.setValue((oven.health || 0) / Math.max(1, oven.maxHealth || 1), "", 0x49cf73);
    this.updateCardVisual(oven);
  }

  updateCardVisual(oven) {
    const row = this.cardByOven.get(oven);
    if (!row?.userData) return;
    const { bg, titleLabel, hovered } = row.userData;
    const selected = this.selected === oven;
    const accent = selected ? 0xffd9a3 : 0x8fe5ff;
    bg.setFillStyle(
      mixColor(0x102a3b, accent, selected ? 0.18 : hovered ? 0.12 : 0.06),
      selected ? 0.94 : hovered ? 0.9 : 0.78
    );
    bg.setStrokeStyle(selected ? 2.5 : hovered ? 2 : 1.5, accent, selected ? 0.34 : hovered ? 0.22 : 0.16);
    titleLabel?.setColor?.(selected ? "#fff8eb" : "#f4fcff");
  }

  onShow() {
    this.rebuildList();
    const ovens = Teams.teamLists[this.team]?.ovenList || [];
    if (!this.selected || !ovens.includes(this.selected)) this.selected = ovens[0] || null;
    this.detail?.setOven?.(this.selected);
    ovens.forEach((oven) => this.updateCard(oven));
  }

  selectOven(oven) {
    this.selected = oven;
    this.detail?.setOven?.(oven);
    this.cardByOven.forEach((_row, key) => this.updateCardVisual(key));
  }
  selectFromWorld(oven) {
    if (oven && !this.cardByOven.has(oven)) this.rebuildList();
    this.selectOven(oven);
  }
  centerCameraOnOven(oven) {
    if (!oven?.sprite) return;
    const cam = this.scene.worldScene?.cameras?.main || this.scene.cameras.main;
    cam.centerOn(oven.sprite.x, oven.sprite.y);
  }

  update() {
    if (this.scene.uiBottomBar?.currentPage !== "ovens") return;
    this.cardByOven.forEach((_row, oven) => this.updateCard(oven));
    if (!this.selected) return;
    this.detail?.setOven?.(this.selected);
  }
}
