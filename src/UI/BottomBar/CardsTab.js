import Phaser from "phaser";
import { UIDEPTH, showAlert } from "../../constants";
import {
  getCardInventoryEntries,
  removeCardFromInventory,
} from "../../Cards/CardInventory";
import {
  MARKET_PLACEHOLDER_ASSETS,
  loadMarketCardPlaceholderAssets,
} from "../../Cards/MarketCards";
import { getCardOutlineTint, getCardVisualStyle } from "../CardPreview";
import { getCardHand } from "../Powerups";
import {
  getMarketCardUseController,
  useConsumableCard,
} from "../MarketCardUseController";
import { AudioManager } from "../../Manager/AudioManager";
import {
  addViewportScrollAffordance,
  BOTTOM_BAR_THEME,
  getBottomBarWidth,
  makeGlassRoundRect,
  mixColor,
} from "./BottomBarTheme";

const TAB_BASE_DEPTH = UIDEPTH + 42;
const MIN_TAB_W = 420;
const CARD_W = 272;
const CARD_H = 156;
const CARD_GAP = 18;
const VIEWPORT_H = CARD_H + 18;

const TARGETED_STORE_ACTIVATIONS = new Set([
  "auto_wall",
  "chain_zapper",
  "meteor_drop",
  "decoy_beacon",
  "fortify_patch",
  "shock_mine",
]);

const MODES = Object.freeze({
  deck: {
    key: "deck",
    label: "Deck Cards",
    emoji: "🃏",
    accent: 0x7bd9ff,
    asset: MARKET_PLACEHOLDER_ASSETS.deckTab,
    emptyTitle: "NO DECK CARDS",
  },
  consumables: {
    key: "consumables",
    label: "Consumables",
    emoji: "🧪",
    accent: 0x7cffb2,
    asset: MARKET_PLACEHOLDER_ASSETS.consumablesTab,
    emptyTitle: "NO CONSUMABLES",
  },
});

function makeText(scene, x, y, text, style = {}) {
  return scene.add.text(x, y, text, {
    fontFamily: "Bungee",
    fontSize: style.fontSize ?? "10px",
    color: style.color ?? BOTTOM_BAR_THEME.text,
    stroke: style.stroke ?? "#081621",
    strokeThickness: style.strokeThickness ?? 2,
    align: style.align ?? "left",
    wordWrap: style.wordWrap,
  }).setOrigin(style.originX ?? 0, style.originY ?? 0.5);
}

function applyToggleVisual(bg, text, selected, accent, hovered = false) {
  bg.setFillStyle(
    selected ? mixColor(accent, 0xffffff, 0.12) : mixColor(BOTTOM_BAR_THEME.panelFill, 0xffffff, hovered ? 0.12 : 0.06),
    selected ? 0.94 : hovered ? 0.9 : 0.82
  );
  bg.setStrokeStyle(selected ? 2 : 1.5, selected ? accent : mixColor(accent, 0x98e7ff, 0.35), selected ? 0.52 : 0.16);
  text.setColor(selected ? "#fff9ef" : BOTTOM_BAR_THEME.textSoft);
}

function makePillButton(scene, x, y, w, h, label, {
  accent = 0x98e7ff,
  fill = 0x17384d,
  onClick = null,
  disabled = false,
} = {}) {
  const root = scene.add.container(x, y);
  const bg = makeGlassRoundRect(scene, w, h, 9, {
    fill,
    alpha: disabled ? 0.28 : 0.82,
    stroke: accent,
    strokeAlpha: disabled ? 0.18 : 0.42,
    strokeWidth: 1.5,
  });
  const text = makeText(scene, 0, 0, label, {
    fontSize: "8px",
    color: disabled ? "#7c8d96" : "#fff9ef",
    originX: 0.5,
    originY: 0.5,
  });
  const hit = scene.add.zone(0, 0, w, h).setInteractive({ useHandCursor: !disabled });

  hit.on("pointerover", () => {
    if (disabled) return;
    AudioManager.playUiHover?.();
    root.setScale(1.03);
  });
  hit.on("pointerout", () => root.setScale(1));
  hit.on("pointerdown", (_pointer, _lx, _ly, event) => {
    event?.stopPropagation?.();
    if (disabled) return;
    onClick?.();
  });

  root.add([bg, text, hit]);
  return root;
}

export default class CardsTab {
  constructor(scene, teamNumber = 1) {
    this.scene = scene;
    this.teamNumber = String(teamNumber);
    this.mode = "deck";
    this.pendingUseId = null;
    this.armedCardId = null;
    this._cardRefs = [];
    this._toggles = {};
    this._scrollX = 0;
    this._contentW = 0;
    this._dragging = false;
    this._dragStartX = 0;
    this._dragStartScrollX = 0;

    loadMarketCardPlaceholderAssets(scene);

    this.view = scene.add.container(0, 0)
      .setDepth(TAB_BASE_DEPTH)
      .setScrollFactor(0);

    this._onResize = () => {
      this.buildShell();
      this.rebuild();
    };
    this._onCardsUpdated = (payload = null) => {
      if (this.scene.uiBottomBar?.currentPage === "cards") {
        this.rebuild();
        this._pulseAddedBucket(payload);
      }
    };
    this._onWheel = (pointer, _gameObjects, dx, dy) => this._handleWheel(pointer, dx, dy);
    this._onPointerMove = (pointer) => this._handlePointerMove(pointer);
    this._onPointerUp = () => this._stopDrag();

    this.scene.scale.on("resize", this._onResize);
    this.scene.events.on("cards:updated", this._onCardsUpdated);
    this.scene.input.on("wheel", this._onWheel);
    this.scene.input.on("pointermove", this._onPointerMove);
    this.scene.input.on("pointerup", this._onPointerUp);

    this.buildShell();
    this.rebuild();
  }

  destroy() {
    this.scene.scale.off("resize", this._onResize);
    this.scene.events.off("cards:updated", this._onCardsUpdated);
    this.scene.input.off("wheel", this._onWheel);
    this.scene.input.off("pointermove", this._onPointerMove);
    this.scene.input.off("pointerup", this._onPointerUp);
    this._scrollAffordance?.destroy?.();
    this._scrollAffordance = null;
    this.view?.destroy(true);
    this.view = null;
  }

  onShow() {
    this.refresh();
  }

  hide() {}

  refresh() {
    this.rebuild();
  }

  getTabWidth() {
    return Math.max(320, getBottomBarWidth(this.scene) - 16);
  }

  buildShell() {
    const scene = this.scene;
    const width = this.getTabWidth();
    const topY = -104;
    const viewportW = Math.max(320, width - 32);
    const viewportX = 0;
    const viewportY = topY + 40;

    this._scrollAffordance?.destroy?.();
    this._scrollAffordance = null;
    this.view.removeAll(true);
    this._toggles = {};

    const shell = makeGlassRoundRect(scene, width, 222, 18, {
      fill: mixColor(BOTTOM_BAR_THEME.panelFill, 0xffffff, 0.08),
      alpha: 0.78,
      stroke: 0x98e7ff,
      strokeAlpha: 0.14,
    }).setPosition(0, 5);
    this.view.add(shell);

    const titleBg = makeGlassRoundRect(scene, 150, 28, 12, {
      fill: mixColor(BOTTOM_BAR_THEME.panelFill, 0xffffff, 0.16),
      alpha: 0.9,
      stroke: 0x9fe7ff,
      strokeAlpha: 0.24,
    }).setPosition(-width / 2 + 86, topY + 18);
    const title = makeText(scene, -width / 2 + 86, topY + 18, "CARD INVENTORY", {
      fontSize: "12px",
      strokeThickness: 3,
      originX: 0.5,
      originY: 0.5,
    });

    let toggleX = -width / 2 + 242;
    Object.values(MODES).forEach((mode) => {
      const bg = makeGlassRoundRect(scene, 132, 28, 12, {
        fill: BOTTOM_BAR_THEME.tabIdleFill,
        alpha: BOTTOM_BAR_THEME.tabIdleAlpha,
        stroke: 0x98e7ff,
        strokeAlpha: 0.18,
      }).setPosition(toggleX, topY + 18);
      const emoji = scene.add.text(toggleX - 46, topY + 18, mode.emoji || "", {
        fontFamily: "Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif",
        fontSize: "14px",
        color: "#ffffff",
      }).setOrigin(0.5, 0.5);
      const text = makeText(scene, toggleX + 8, topY + 18, mode.label, {
        fontSize: "9px",
        color: BOTTOM_BAR_THEME.textSoft,
        strokeThickness: 3,
        originX: 0.5,
        originY: 0.5,
      });
      const hit = scene.add.zone(toggleX, topY + 18, 132, 28).setInteractive({ useHandCursor: true });
      hit.on("pointerover", () => {
        this._toggles[mode.key].hovered = true;
        AudioManager.playUiHover?.();
        this._applyToggleVisuals();
      });
      hit.on("pointerout", () => {
        this._toggles[mode.key].hovered = false;
        this._applyToggleVisuals();
      });
      hit.on("pointerdown", (_pointer, _lx, _ly, event) => {
        event?.stopPropagation?.();
        this.setMode(mode.key);
      });
      this._toggles[mode.key] = { bg, text, mode, hovered: false };
      this.view.add([bg]);
      this.view.add([emoji, text, hit]);
      toggleX += 142;
    });

    this.countBg = makeGlassRoundRect(scene, 108, 26, 10, {
      fill: mixColor(0xffd47c, 0xffffff, 0.14),
      alpha: 0.92,
      stroke: 0xfff1b3,
      strokeAlpha: 0.26,
    }).setPosition(width / 2 - 62, topY + 18);
    this.countText = makeText(scene, width / 2 - 62, topY + 18, "0 CARDS", {
      fontSize: "12px",
      color: "#10263b",
      stroke: "#ffffff",
      strokeThickness: 3,
      originX: 0.5,
      originY: 0.5,
    });

    const viewportFrame = makeGlassRoundRect(scene, viewportW, VIEWPORT_H, 18, {
      fill: mixColor(BOTTOM_BAR_THEME.panelFill, 0xffffff, 0.08),
      alpha: 0.76,
      stroke: 0x98e7ff,
      strokeAlpha: 0.16,
      strokeWidth: 1.5,
    }).setOrigin(0.5, 0).setPosition(viewportX, viewportY);
    const viewportGlow = scene.add.rectangle(viewportX, viewportY + 16, viewportW - 24, 18, 0xffffff, 0.08)
      .setOrigin(0.5, 0);
    const viewportHit = scene.add.rectangle(viewportX, viewportY, viewportW, VIEWPORT_H, 0x000000, 0.001)
      .setOrigin(0.5, 0)
      .setInteractive({ useHandCursor: true });
    viewportHit.on("pointerdown", (pointer, _lx, _ly, event) => {
      event?.stopPropagation?.();
      this._dragging = true;
      this._dragStartX = pointer.x;
      this._dragStartScrollX = this._scrollX;
    });

    this._cardsViewport = {
      left: viewportX - viewportW / 2,
      top: viewportY,
      w: viewportW,
      h: VIEWPORT_H,
    };
    this._cardsViewportHit = viewportHit;
    this._cardsContainer = scene.add.container(this._cardsViewport.left, viewportY + 9);

    this.view.add([titleBg, title, this.countBg, this.countText, viewportFrame, viewportGlow, viewportHit, this._cardsContainer]);
    this._scrollAffordance = addViewportScrollAffordance(
      scene,
      this.view,
      () => this._cardsViewport,
      () => {
        const viewportW = this._cardsViewport?.w || 0;
        const contentW = this._contentW || 0;
        const minScroll = Math.min(0, viewportW - contentW);
        return {
          overflow: contentW > viewportW + 1,
          hovered: this._dragging || this._pointerInViewport(scene.input?.activePointer),
          canBack: (this._scrollX || 0) < -1,
          canForward: (this._scrollX || 0) > minScroll + 1,
          viewportRatio: contentW > 0 ? Phaser.Math.Clamp(viewportW / contentW, 0.12, 1) : 1,
          progress: minScroll < 0 ? Phaser.Math.Clamp((this._scrollX || 0) / minScroll, 0, 1) : 0,
        };
      },
      {
        orientation: "x",
        isActive: () => this.scene.uiBottomBar?.expanded && this.scene.uiBottomBar?.currentPage === "cards",
      }
    );
    this._applyToggleVisuals();
  }

  setMode(mode) {
    if (!MODES[mode] || this.mode === mode) return;
    this.mode = mode;
    this.pendingUseId = null;
    this._scrollX = 0;
    AudioManager.playBottomBarClick?.();
    this.rebuild();
  }

  rebuild() {
    if (!this._cardsContainer) return;
    const { entries, total } = this._getEntriesForMode();

    this._cardsContainer.removeAll(true);
    this._cardRefs = [];
    const countLabel = this.mode === "consumables" ? "ITEM" : "CARD";
    this.countText?.setText(`${total} ${total === 1 ? countLabel : `${countLabel}S`}`);
    this._applyToggleVisuals();

    if (!entries.length) {
      this._contentW = this._cardsViewport.w;
      this._cardsContainer.add(this._makeEmptyState());
      this._clampScroll();
      return;
    }

    let xCursor = 8;
    entries.forEach((entry) => {
      const card = this._makeCard(entry, xCursor + CARD_W / 2, CARD_H / 2);
      this._cardsContainer.add(card);
      xCursor += CARD_W + CARD_GAP;
    });
    this._contentW = Math.max(0, xCursor - CARD_GAP + 8);
    this._clampScroll();
  }

  _getEntriesForMode() {
    if (this.mode !== "deck") {
      const entries = getCardInventoryEntries(this.teamNumber, this.mode)
        .map((entry) => ({ ...entry, source: "inventory" }));
      const total = entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.quantity || 0)), 0);
      return { entries, total };
    }

    const handEntries = (getCardHand(this.teamNumber) || [])
      .filter(Boolean)
      .map((card, index) => ({
        card,
        cardId: card.id ?? card.name ?? `deck-${index}`,
        quantity: 1,
        bucket: "hand",
        source: "hand",
        index,
      }));

    const inventoryEntries = getCardInventoryEntries(this.teamNumber, "deck")
      .map((entry) => ({ ...entry, source: "inventory" }));
    const total = handEntries.length + inventoryEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry.quantity || 0)), 0);

    return {
      entries: [...handEntries, ...inventoryEntries],
      total,
    };
  }

  _applyToggleVisuals() {
    Object.values(this._toggles || {}).forEach(({ bg, text, mode, hovered }) => {
      applyToggleVisual(bg, text, this.mode === mode.key, mode.accent, hovered);
    });
  }

  _pulseAddedBucket(payload = null) {
    const action = String(payload?.action || "").toLowerCase();
    if (action !== "added") return;

    const modeKey = payload?.bucket === "consumables" ? "consumables" : "deck";
    const toggle = this._toggles?.[modeKey];
    if (!toggle?.text) return;

    this.scene.tweens.killTweensOf(toggle.text);
    toggle.text.setScale(1);
    this.scene.tweens.add({
      targets: toggle.text,
      scaleX: 1.16,
      scaleY: 1.16,
      duration: 130,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut",
      onComplete: () => toggle.text?.setScale?.(1),
    });
  }

  _makeEmptyState() {
    const scene = this.scene;
    const mode = MODES[this.mode] || MODES.deck;
    const w = Math.max(280, this._cardsViewport.w - 24);
    const root = scene.add.container(w / 2 + 8, CARD_H / 2);
    const bg = makeGlassRoundRect(scene, w, CARD_H, 14, {
      fill: mixColor(BOTTOM_BAR_THEME.cardFill, mode.accent, 0.08),
      alpha: 0.9,
      stroke: mode.accent,
      strokeAlpha: 0.18,
    });
    const title = makeText(scene, 0, -10, mode.emptyTitle, {
      fontSize: "12px",
      originX: 0.5,
      originY: 0.5,
    });
    const sub = makeText(scene, 0, 14, this.mode === "deck" ? "Starter and market deck cards appear here." : "Market purchases appear here.", {
      fontSize: "8px",
      color: BOTTOM_BAR_THEME.textMuted,
      originX: 0.5,
      originY: 0.5,
    });
    root.add([bg, title, sub]);
    return root;
  }

  _makeCard(entry, x, y) {
    if (this.mode === "consumables") {
      return this._makeConsumableItem(entry, x, y);
    }

    const scene = this.scene;
    const card = entry.card;
    const tint = getCardOutlineTint(card);
    const visualStyle = getCardVisualStyle(card);
    const isPending = this.pendingUseId === card.id;
    const isArmed = this.armedCardId === card.id;
    const isPassiveDeckCard = entry.source === "hand";
    const root = scene.add.container(x, y);

    const glow = scene.add.ellipse(
      0,
      0,
      CARD_W + (visualStyle.isGold ? 22 : 12),
      CARD_H + (visualStyle.isGold ? 28 : 16),
      visualStyle.haloTint,
      visualStyle.isGold ? 0.14 : 0.05
    ).setOrigin(0.5);
    const glowFrame = visualStyle.isGold
      ? scene.add.rectangle(0, 0, CARD_W + 12, CARD_H + 12, visualStyle.auraTint, 0.08)
        .setStrokeStyle(2, visualStyle.auraTint, 0.46)
        .setOrigin(0.5)
      : null;

    const bg = makeGlassRoundRect(scene, CARD_W, CARD_H, 16, {
      fill: mixColor(BOTTOM_BAR_THEME.cardFill, tint, isPending || isArmed ? 0.22 : 0.12),
      alpha: isPending || isArmed ? 0.98 : 0.94,
      stroke: tint,
      strokeAlpha: isPending || isArmed ? 0.74 : 0.4,
      strokeWidth: isPending || isArmed ? 3 : 2,
    });
    const shine = scene.add.rectangle(0, -CARD_H / 2 + 18, CARD_W - 28, 18, 0xffffff, 0.08)
      .setOrigin(0.5);
    const iconPlate = scene.add.rectangle(-CARD_W / 2 + 56, 0, 76, 76, 0x0b1c27, 0.58)
      .setStrokeStyle(2, tint, 0.32);
    const icon = scene.textures.exists(card.image)
      ? scene.add.image(-CARD_W / 2 + 56, 0, card.image).setDisplaySize(48, 48)
      : scene.add.rectangle(-CARD_W / 2 + 56, 0, 42, 42, tint, 0.3);
    const qty = makeText(scene, -CARD_W / 2 + 18, CARD_H / 2 - 26, isPassiveDeckCard ? `#${Number(entry.index ?? 0) + 1}` : `x${entry.quantity}`, {
      fontSize: "10px",
      color: "#fff9df",
      originX: 0,
      originY: 0.5,
    });
    const name = makeText(scene, -CARD_W / 2 + 102, -CARD_H / 2 + 22, card.name, {
      fontSize: "16px",
      strokeThickness: 3,
      wordWrap: { width: CARD_W - 124 },
      originY: 0,
    });
    const bodyY = this.mode === "consumables"
      ? -CARD_H / 2 + 55
      : -CARD_H / 2 + 73;
    const body = makeText(scene, -CARD_W / 2 + 102, bodyY, card.text, {
      fontSize: "10px",
      color: BOTTOM_BAR_THEME.textSoft,
      lineSpacing: 2,
      wordWrap: { width: CARD_W - 124 },
      originY: 0,
    });
    const isTargetedStoreItem = TARGETED_STORE_ACTIVATIONS.has(card.activation);
    const statusText = isPassiveDeckCard
      ? "ACTIVE"
      : isArmed
        ? "TARGETING"
        : (isTargetedStoreItem ? "TARGET MODE" : "CLICK TO ARM");
    const status = makeText(scene, -CARD_W / 2 + 102, CARD_H / 2 - 26, statusText, {
      fontSize: "9px",
      color: isPending || isArmed ? "#fff1b3" : "#d3edf9",
      originY: 0.5,
    });

    const cardHit = scene.add.zone(0, 0, CARD_W, CARD_H).setInteractive({ useHandCursor: !isPassiveDeckCard });
    cardHit.on("pointerover", () => {
      AudioManager.playUiHover?.();
      this._applyCardHover(root, bg, tint, true, isPending || isArmed);
    });
    cardHit.on("pointerout", () => this._applyCardHover(root, bg, tint, false, isPending || isArmed));
    cardHit.on("pointerdown", (_pointer, _lx, _ly, event) => {
      event?.stopPropagation?.();
      if (isPassiveDeckCard) {
        showAlert(this.scene.worldScene || this.scene, `${card.name} is already active`, "#d3edf9");
        return;
      }
      if (this.mode === "consumables" && !isTargetedStoreItem) this.armConsumable(entry);
      else this.armTargetCard(entry);
    });

    root.add([glow]);
    if (glowFrame) root.add(glowFrame);
    root.add([bg, shine, iconPlate, icon, qty, name, body, status, cardHit]);

    if (visualStyle.isGold) {
      scene.tweens.add({
        targets: glow,
        alpha: { from: 0.11, to: 0.18 },
        scaleX: 1.03,
        scaleY: 1.03,
        duration: 980,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    if (this.mode === "consumables" && isPending) {
      const veil = scene.add.rectangle(0, 0, CARD_W - 8, CARD_H - 8, 0x02060d, 0.58).setOrigin(0.5);
      const prompt = makeText(scene, 0, -22, "USE THIS CARD?", {
        fontSize: "14px",
        color: "#fff5cc",
        stroke: "#02060d",
        strokeThickness: 3,
        originX: 0.5,
        originY: 0.5,
      });
      const sub = makeText(scene, 0, -2, "Confirm or cancel", {
        fontSize: "9px",
        color: "#d7e9f4",
        stroke: "#02060d",
        strokeThickness: 2,
        originX: 0.5,
        originY: 0.5,
      });
      const confirm = makePillButton(scene, -56, 28, 98, 32, "CONFIRM", {
        accent: 0x9dffa5,
        fill: 0x1f5c42,
        onClick: () => this.confirmConsumable(entry),
      });
      const cancel = makePillButton(scene, 58, 28, 82, 32, "CANCEL", {
        accent: 0xff9fb5,
        fill: 0x5a2230,
        onClick: () => this.cancelPending(),
      });
      root.add([veil, prompt, sub, confirm, cancel]);
    }

    return root;
  }

  _makeConsumableItem(entry, x, y) {
    const scene = this.scene;
    const card = entry.card;
    const tint = getCardOutlineTint(card);
    const isPending = this.pendingUseId === card.id;
    const isArmed = this.armedCardId === card.id;
    const root = scene.add.container(x, y);

    const accent = isArmed ? 0xffe08a : tint;
    const bg = makeGlassRoundRect(scene, CARD_W, CARD_H, 14, {
      fill: mixColor(0x102a20, accent, isPending || isArmed ? 0.22 : 0.12),
      alpha: isPending || isArmed ? 0.98 : 0.92,
      stroke: accent,
      strokeAlpha: isPending || isArmed ? 0.72 : 0.34,
      strokeWidth: isPending || isArmed ? 3 : 1.5,
    });
    const leftBand = scene.add.rectangle(-CARD_W / 2 + 55, 0, 102, CARD_H - 18, 0x071712, 0.42)
      .setOrigin(0.5)
      .setStrokeStyle(1.5, accent, 0.18);
    const iconPlate = scene.add.rectangle(-CARD_W / 2 + 55, -12, 88, 88, 0x071018, 0.62)
      .setStrokeStyle(2, accent, 0.42);
    const icon = scene.textures.exists(card.image)
      ? scene.add.image(-CARD_W / 2 + 55, -12, card.image).setDisplaySize(72, 72)
      : scene.add.rectangle(-CARD_W / 2 + 55, -12, 66, 66, accent, 0.28);
    const qtyBadge = makeGlassRoundRect(scene, 56, 24, 10, {
      fill: mixColor(accent, 0x000000, 0.3),
      alpha: 0.94,
      stroke: 0xffffff,
      strokeAlpha: 0.22,
    }).setPosition(-CARD_W / 2 + 55, CARD_H / 2 - 28);
    const qty = makeText(scene, -CARD_W / 2 + 55, CARD_H / 2 - 28, `x${entry.quantity}`, {
      fontSize: "12px",
      color: "#fff9df",
      strokeThickness: 3,
      originX: 0.5,
      originY: 0.5,
    });

    const name = makeText(scene, -CARD_W / 2 + 116, -CARD_H / 2 + 26, card.name, {
      fontSize: "15px",
      strokeThickness: 3,
      wordWrap: { width: CARD_W - 136 },
      originY: 0,
    });
    const body = makeText(scene, -CARD_W / 2 + 116, -CARD_H / 2 + 62, card.text, {
      fontSize: "10px",
      color: BOTTOM_BAR_THEME.textSoft,
      lineSpacing: 2,
      wordWrap: { width: CARD_W - 136 },
      originY: 0,
    });

    const isTargetedStoreItem = TARGETED_STORE_ACTIVATIONS.has(card.activation);
    const statusText = isArmed ? "TARGETING" : (isTargetedStoreItem ? "TARGET MODE" : "CLICK TO USE");
    const status = makeText(scene, -CARD_W / 2 + 116, CARD_H / 2 - 24, statusText, {
      fontSize: "9px",
      color: isPending || isArmed ? "#fff1b3" : "#bafbd3",
      originY: 0.5,
    });

    const cardHit = scene.add.zone(0, 0, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
    cardHit.on("pointerover", () => {
      AudioManager.playUiHover?.();
      this._applyCardHover(root, bg, accent, true, isPending || isArmed, 0x102a20);
    });
    cardHit.on("pointerout", () => this._applyCardHover(root, bg, accent, false, isPending || isArmed, 0x102a20));
    cardHit.on("pointerdown", (_pointer, _lx, _ly, event) => {
      event?.stopPropagation?.();
      if (!isTargetedStoreItem) this.armConsumable(entry);
      else this.armTargetCard(entry);
    });

    root.add([bg, leftBand, iconPlate, icon, qtyBadge, qty, name, body, status, cardHit]);

    if (isPending) {
      const veil = scene.add.rectangle(0, 0, CARD_W - 8, CARD_H - 8, 0x02060d, 0.58).setOrigin(0.5);
      const prompt = makeText(scene, 0, -22, "USE THIS ITEM?", {
        fontSize: "14px",
        color: "#fff5cc",
        stroke: "#02060d",
        strokeThickness: 3,
        originX: 0.5,
        originY: 0.5,
      });
      const sub = makeText(scene, 0, -2, "Confirm or cancel", {
        fontSize: "9px",
        color: "#d7e9f4",
        stroke: "#02060d",
        strokeThickness: 2,
        originX: 0.5,
        originY: 0.5,
      });
      const confirm = makePillButton(scene, -56, 28, 98, 32, "CONFIRM", {
        accent: 0x9dffa5,
        fill: 0x1f5c42,
        onClick: () => this.confirmConsumable(entry),
      });
      const cancel = makePillButton(scene, 58, 28, 82, 32, "CANCEL", {
        accent: 0xff9fb5,
        fill: 0x5a2230,
        onClick: () => this.cancelPending(),
      });
      root.add([veil, prompt, sub, confirm, cancel]);
    }

    return root;
  }

  _applyCardHover(root, bg, tint, hovered, active, baseFill = BOTTOM_BAR_THEME.cardFill) {
    this.scene.tweens.killTweensOf(root);
    this.scene.tweens.add({
      targets: root,
      scaleX: hovered ? 1.02 : 1,
      scaleY: hovered ? 1.02 : 1,
      duration: 120,
      ease: "Quad.easeOut",
    });
    bg.setFillStyle(mixColor(baseFill, tint, hovered || active ? 0.2 : 0.12), hovered || active ? 0.98 : 0.94);
    bg.setStrokeStyle(hovered || active ? 3 : 2, tint, hovered || active ? 0.8 : 0.4);
  }

  armConsumable(entry) {
    if (this.pendingUseId === entry.card.id) return;
    this.pendingUseId = entry.card.id;
    this.armedCardId = null;
    AudioManager.playCardArm?.();
    this.rebuild();
  }

  cancelPending() {
    this.pendingUseId = null;
    AudioManager.playBottomBarClick?.();
    this.rebuild();
  }

  confirmConsumable(entry) {
    const world = this.scene.worldScene;
    if (!world) return;
    const result = useConsumableCard(world, entry.card);
    if (!result.ok) {
      showAlert(world, result.message || "Card could not be used", "#ffaaaa");
      AudioManager.playError?.();
      return;
    }

    removeCardFromInventory(entry.card.id, this.teamNumber, 1);
    this.pendingUseId = null;
    AudioManager.playCardConfirmUse?.();
    showAlert(world, result.message, "#aaffaa");
    world.events.emit("cards:updated");
    this.scene.events.emit("cards:updated");
    this.rebuild();
  }

  armTargetCard(entry) {
    const world = this.scene.worldScene;
    if (!world) return;
    const controller = getMarketCardUseController(world);
    const started = controller?.begin(entry.card, {
      onComplete: (card) => {
        removeCardFromInventory(card.id, this.teamNumber, 1);
        this.armedCardId = null;
        world.events.emit("cards:updated");
        this.scene.events.emit("cards:updated");
        this.rebuild();
      },
      onCancel: () => {
        this.armedCardId = null;
        this.rebuild();
      },
    });
    if (!started) return;
    this.pendingUseId = null;
    this.armedCardId = entry.card.id;
    this.rebuild();
  }

  _handleWheel(pointer, dx, dy) {
    if (this.scene.uiBottomBar?.currentPage !== "cards") return;
    if (!this.scene.uiBottomBar?.expanded) return;
    if (!this._pointerInViewport(pointer)) return;
    const dominantDelta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    if (Math.abs(dominantDelta) < 0.1) return;
    this._scrollX -= dominantDelta * 0.8;
    this._clampScroll();
    this.scene.input.stopPropagation();
  }

  _handlePointerMove(pointer) {
    if (!this._dragging) return;
    this._scrollX = this._dragStartScrollX + (pointer.x - this._dragStartX);
    this._clampScroll();
  }

  _stopDrag() {
    this._dragging = false;
  }

  _pointerInViewport(pointer) {
    if (!pointer || !this._cardsViewport) return false;
    const bounds = this._cardsViewportHit?.getBounds?.();
    return !!bounds && Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y);
  }

  _clampScroll() {
    if (!this._cardsContainer || !this._cardsViewport) return;
    const minScroll = Math.min(0, this._cardsViewport.w - this._contentW);
    this._scrollX = Phaser.Math.Clamp(this._scrollX, minScroll, 0);
    this._cardsContainer.x = this._cardsViewport.left + this._scrollX;
  }
}
