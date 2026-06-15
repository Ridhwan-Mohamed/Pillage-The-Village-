import Phaser from "phaser";
import {
  DEFAULT_LAYOUT_MOVE_RANGE,
  DraftStartState,
} from "./DraftStartState.js";
import { DraftStartPreviewController } from "./DraftStartPreviewController.js";
import { TeamNameInput } from "./TeamNameInput.js";
import { getCardOutlineTint } from "../CardPreview.js";
import { SQUARESIZE, TILE_TYPES, UIDEPTH } from "../../constants.js";
import {
  applyPortraitKeyToSprite,
  getPlayerPortraitKey,
} from "../../players/playerPortraits.js";
import {
  createStarterPortraitUnit,
  REQUIRED_STARTER_TYPES,
} from "./DraftStarterDecks.js";
import { AudioManager } from "../../Manager/AudioManager.js";
import {
  createBodyTextStyle,
  createDisplayTextStyle,
  createLabelTextStyle,
} from "../Typography.js";

const RESOURCE_LAYOUT = [
  { key: "money", icon: "monies", label: "Cash" },
  { key: "seeds", icon: "seeds", label: "Seeds" },
  { key: "berries", icon: "berry", label: "Berries" },
  { key: "food", icon: "foodIcon", label: "Food" },
  { key: "water", icon: "waterIcon", label: "Water" },
  { key: "wood", icon: "woodIcon", label: "Wood" },
  { key: "stone", icon: "stoneIcon", label: "Stone" },
];

const BASE_DECK_FILL = 0x13293d;
const BASE_DECK_STROKE = 0xb2e8ff;
const HEADER_FILL = 0x10263b;
const SCREEN_TINT = 0x061520;
const TEXT_LIGHT = "#f8fcff";
const TEXT_MUTED = "#b7d3e0";
const TEXT_SUBTLE = "#7fa2b7";
const TEXT_GOOD = "#7dffbd";
const TEXT_DANGER = "#ff9b8f";

const _LEGACY_BUILDING_META = Object.freeze({
  tower: { emoji: "🗼", label: "Town Tower" },
  house1: { emoji: "🏠", label: "House" },
  house2: { emoji: "🏠", label: "House" },
  storage: { emoji: "📦", label: "Storage" },
  clayOven: { emoji: "🔥", label: "Clay Oven" },
});

const BUILDING_META = Object.freeze({
  tower: { emoji: "\u{1F5FC}", label: "Town Tower", color: "#74baff" },
  house1: { emoji: "\u{1F3E0}", label: "House", color: "#ff9b77" },
  house2: { emoji: "\u{1F3E0}", label: "House", color: "#ff9b77" },
  storage: { emoji: "\u{1F4E6}", label: "Storage", color: "#ffd27d" },
  clayOven: { emoji: "\u{1F525}", label: "Clay Oven", color: "#ff6958" },
});

const PLAYER_META = Object.freeze({
  farmer: { emoji: "\u{1F33E}", label: "Farmer", color: "#74d68e" },
  forager: { emoji: "\u{26CF}\uFE0F", label: "Forager", color: "#9fd8ff" },
  fireman: { emoji: "\u{1F525}", label: "Fireman", color: "#ff6958" },
  builder: { emoji: "\u{1F528}", label: "Builder", color: "#f0b35a" },
  brawler: { emoji: "\u{1F94A}", label: "Brawler", color: "#ff9b77" },
  gunslinger: { emoji: "\u{1F3AF}", label: "Gunslinger", color: "#ffd27d" },
  blademaster: { emoji: "\u{2694}\uFE0F", label: "Blademaster", color: "#cbb6ff" },
});

function hexToColorInt(value, fallback = 0xffffff) {
  if (!value) return fallback;
  return Phaser.Display.Color.HexStringToColor(value).color;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class DraftStartMenu {
  static build(scene, opts) {
    const menu = new DraftStartMenu(scene, opts);
    menu.buildUI();
    return menu;
  }

  constructor(scene, opts) {
    this.scene = scene;
    this.worldScene = opts.worldScene ?? scene;
    this.srcW = opts.srcW;
    this.srcH = opts.srcH;
    this.gridData = opts.gridData;
    this.repaintBounds = opts.repaintBounds;

    this.container = scene.add.container(0, 0).setDepth(2200).setScrollFactor(0);
    this.state = new DraftStartState();
    this.preview = new DraftStartPreviewController(scene, {
      srcW: this.srcW,
      srcH: this.srcH,
      gridData: this.gridData,
      repaintBounds: this.repaintBounds,
      fullRepaintPreview: scene.fullRepaintPreview?.bind(scene),
      worldScene: this.worldScene,
    });

    this.ui = {
      deckRefs: [],
      cardHoverPreviews: [],
      mapInteractionRects: [],
    };
    this._teamNameInvalid = false;
    this.phase = "deck";
    this.selectedPlacedBuilding = null;
    this.selectedPlacedBuildingGrab = { x: 0, y: 0 };
    this._boundPointerMove = null;
    this._boundPointerDown = null;
    this._boundResizeHandler = null;
    this._resizeRebuildTimer = null;
    this._stateChangeUnsub = null;
    this._previewInitialized = false;
  }

  destroy() {
    this._resizeRebuildTimer?.remove?.(false);
    this._resizeRebuildTimer = null;
    if (this._boundResizeHandler) {
      this.scene?.scale?.off?.("resize", this._boundResizeHandler);
      this._boundResizeHandler = null;
    }
    this._stateChangeUnsub?.();
    this._stateChangeUnsub = null;
    this.teamNameInput?.destroy?.();
    this.teamNameInput = null;

    this.preview?.destroy?.();
    this.preview = null;
    this._unbindLayoutMapInput?.();

    for (const preview of this.ui.cardHoverPreviews ?? []) {
      preview?.destroy?.();
    }

    this.container?.destroy?.(true);
    this.container = null;
  }

  _bindResizeHandling() {
    if (this._boundResizeHandler) return;
    this._boundResizeHandler = () => {
      this._resizeRebuildTimer?.remove?.(false);
      this._resizeRebuildTimer = this.scene?.time?.delayedCall?.(40, () => {
        this._resizeRebuildTimer = null;
        this._rebuildUiForResize();
      });
    };
    this.scene?.scale?.on?.("resize", this._boundResizeHandler);
  }

  _rebuildUiForResize() {
    if (!this.container?.active || !this.scene?.scale) return;
    this._hideCardHoverBubble();
    this._hideLayoutTooltip();
    this._unbindLayoutMapInput();
    this.worldScene?.overviewOceanWaves?.resize?.();
    this.teamNameInput?.destroy?.();
    this.teamNameInput = null;
    this.container.removeAll(true);
    this.container.setAlpha(1).setVisible(true);
    this.buildUI({ animateIntro: false, initializePreview: false });
  }

  buildUI({ animateIntro = true, initializePreview = !this._previewInitialized } = {}) {
    const scene = this.scene;
    const width = scene.scale.width;
    const height = scene.scale.height;
    this.ui = {
      deckRefs: [],
      cardHoverPreviews: [],
      mapInteractionRects: [],
    };
    this.layout = this._createLayout(width, height);

    this._buildBackdrop(width, height);
    this._buildHeader(width);
    this._buildDeckRow(width, height);
    this._buildLayoutStage(width, height);
    this._buildFooter(width, height);
    this._buildCardHoverBubble(width, height);

    if (initializePreview) {
      this.preview.initBaseTown(this.state);
      this.preview._updatePlacedBuildingsIntoState?.(this.state);
      this.state.setWallEstimate(this.preview.estimateWallTiles(), true);
      this._previewInitialized = true;
    }
    this.preview.updateCrewSpawnPreview(this.state.crew);
    this.scene.fullRepaintPreview?.();

    if (!this._stateChangeUnsub) {
      this._stateChangeUnsub = this.state.onChange(() => {
        this._refreshUI();
      });
    }
    this._bindResizeHandling();

    this._bindLayoutMapInput();
    this._setPhase(this.phase, { immediate: true, emit: true });
    this._refreshUI();

    if (animateIntro) {
      this.container.setAlpha(0);
      this.teamNameInput?.dom?.setAlpha?.(0);
      scene.tweens.add({
        targets: [this.container, this.teamNameInput?.dom].filter(Boolean),
        alpha: 1,
        duration: 360,
        ease: "Cubic.easeOut",
      });
    } else {
      this.container.setAlpha(1);
      this.teamNameInput?.dom?.setAlpha?.(1);
    }
  }

  _createLayout(width, height) {
    const scale = clamp(Math.min(width / 1920, height / 1080), 0.74, 1);
    const compact = scale < 0.9;
    const pagePad = Math.max(18, Math.round(34 * scale));
    const gap = Math.max(10, Math.round(18 * scale));
    const headerHeight = Math.round((compact ? 110 : 126) * scale);
    const headerTopGap = 5;
    const headerY = headerTopGap + Math.round(headerHeight / 2);
    const footerHeight = clamp(Math.round(76 * scale), 58, 82);
    const footerY = height - pagePad - Math.round(footerHeight / 2);
    const topDeckStart = headerY + (headerHeight / 2) + Math.round(14 * scale);
    const bottomDeckEnd = footerY - (footerHeight / 2) - Math.round(18 * scale);
    const availableDeckHeight = bottomDeckEnd - topDeckStart;
    const deckWidth = Math.min(
      Math.floor((width - pagePad * 2 - gap * 2) / 3),
      Math.round(392 * scale),
    );
    const preferredDeckHeight = Math.round(438 * scale);
    const minimumDeckHeight = Math.max(320, Math.round(344 * scale));
    const deckHeightTarget = availableDeckHeight - Math.round(12 * scale);
    const deckHeight = availableDeckHeight <= preferredDeckHeight
      ? Math.max(
        Math.min(availableDeckHeight, preferredDeckHeight),
        Math.min(minimumDeckHeight, availableDeckHeight),
      )
      : Math.max(
        Math.min(deckHeightTarget, availableDeckHeight),
        Math.min(preferredDeckHeight, availableDeckHeight),
      );
    const rowCenterY = topDeckStart + Math.round(availableDeckHeight / 2);
    const teamInputWidth = compact ? 228 : 262;
    const confirmButtonWidth = clamp(Math.round(228 * scale), 184, 248);
    const confirmButtonHeight = clamp(Math.round(60 * scale), 48, 62);
    const confirmGlowWidth = confirmButtonWidth + Math.round(16 * scale);
    const confirmGlowHeight = confirmButtonHeight + Math.round(8 * scale);
    const backButtonWidth = clamp(Math.round(180 * scale), 148, 190);
    const layoutInfoHeight = 158;

    return {
      width,
      height,
      scale,
      compact,
      pagePad,
      gap,
      headerHeight,
      headerY,
      headerWidth: Math.min(Math.round(1120 * scale), width - pagePad * 2),
      footerHeight,
      footerY,
      footerWidth: Math.min(Math.round(1320 * scale), width - pagePad * 2),
      rowCenterY,
      deckWidth: Math.max(220, deckWidth),
      deckHeight: Math.max(360, deckHeight),
      teamInputWidth,
      confirmButtonWidth,
      confirmButtonHeight,
      confirmGlowWidth,
      confirmGlowHeight,
      backButtonWidth,
      layoutInfoWidth: clamp(
        Math.round(360 * scale),
        300,
        Math.min(Math.round(width * 0.3), 380),
      ),
      layoutInfoHeight,
      layoutMoveHudWidth: clamp(Math.round(500 * scale), 320, Math.min(width - pagePad * 2, 560)),
      layoutMoveHudHeight: clamp(Math.round(34 * scale), 28, 36),
      layoutMoveHudY: footerY - Math.round((footerHeight / 2) + Math.round(24 * scale)),
      layoutLegendWidth: Math.min(Math.round(332 * scale), Math.round(width * 0.22)),
      layoutLegendHeight: Math.round((compact ? 248 : 266) * scale),
      layoutPanelY: clamp(
        Math.round(height * 0.36),
        headerY + (headerHeight / 2) + Math.round(96 * scale),
        footerY - Math.round(180 * scale),
      ),
    };
  }

  _fontValue(base, min = 8, scale = this.layout?.scale ?? 1) {
    return Math.max(min, Math.round(base * scale));
  }

  _displayStyle(base, {
    min = 18,
    scale = this.layout?.scale ?? 1,
    color = TEXT_LIGHT,
    stroke = "#07111b",
    strokeThickness = 0,
    ...rest
  } = {}) {
    return createDisplayTextStyle({
      fontSize: this._fontValue(base, min, scale),
      min,
      color,
      stroke,
      strokeThickness,
      ...rest,
    });
  }

  _bodyStyle(base, {
    min = 12,
    scale = this.layout?.scale ?? 1,
    color = TEXT_MUTED,
    ...rest
  } = {}) {
    return createBodyTextStyle({
      fontSize: this._fontValue(base, min, scale),
      min,
      color,
      ...rest,
    });
  }

  _labelStyle(base, {
    min = 11,
    scale = this.layout?.scale ?? 1,
    color = TEXT_SUBTLE,
    fontStyle = "bold",
    ...rest
  } = {}) {
    return createLabelTextStyle({
      fontSize: this._fontValue(base, min, scale),
      min,
      color,
      fontStyle,
      ...rest,
    });
  }

  _getTeamNameInputElement() {
    return this.teamNameInput?.getInputElement?.()
      ?? this.teamNameInput?.dom?.node?.querySelector?.("input")
      ?? null;
  }

  _setTeamNameValidationState(isInvalid) {
    this._teamNameInvalid = isInvalid;
    const shell = this.ui.teamInputShell;
    const label = this.ui.teamTag;

    if (shell) {
      this._redrawPanel(
        shell,
        this.ui.teamInputShellWidth,
        this.ui.teamInputShellHeight,
        isInvalid
          ? {
            fillColor: 0x4a1217,
            fillAlpha: 0.98,
            strokeColor: 0xff7d8c,
            strokeAlpha: 0.9,
            radius: this.ui.teamInputShellRadius,
            shadowColor: 0x280409,
            shadowAlpha: 0.34,
            shadowOffsetY: Math.round(8 * this.layout.scale),
          }
          : {
            fillColor: 0x0d2130,
            fillAlpha: 0.9,
            strokeColor: 0xd2f6ff,
            strokeAlpha: 0.18,
            radius: this.ui.teamInputShellRadius,
            shadowColor: 0x06121b,
            shadowAlpha: 0.2,
            shadowOffsetY: Math.round(8 * this.layout.scale),
          },
      );
    }

    if (label) {
      label.setColor(isInvalid ? "#ffd3d8" : TEXT_LIGHT);
    }

    const input = this._getTeamNameInputElement();
    if (!input) return;
    input.style.background = "#000000";
    input.style.color = "#ffffff";
    input.style.setProperty("-webkit-text-fill-color", "#ffffff");
    input.style.borderColor = isInvalid ? "rgba(255,138,150,0.94)" : "#ffffff";
    input.style.boxShadow = "none";
    input.style.textShadow = "none";
    input.style.webkitTextStroke = "0";
  }

  _shakeTeamNameInput() {
    const targets = [];
    if (this.ui.teamInputShell) {
      this.ui.teamInputShell.x = this.ui.teamInputShellX;
      targets.push(this.ui.teamInputShell);
    }
    if (this.teamNameInput?.dom) {
      this.teamNameInput.dom.x = this.ui.teamInputDomX;
      targets.push(this.teamNameInput.dom);
    }

    if (!targets.length) return;

    this.scene.tweens.killTweensOf(targets);
    this.scene.tweens.add({
      targets,
      x: "+=10",
      duration: 48,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: 5,
      onComplete: () => {
        if (this.ui.teamInputShell) this.ui.teamInputShell.x = this.ui.teamInputShellX;
        if (this.teamNameInput?.dom) this.teamNameInput.dom.x = this.ui.teamInputDomX;
      },
    });
  }

  _updateFooterSummaryLayout(confirmWidth = this.layout.confirmButtonWidth) {
    const rects = [...(this.ui.layoutPanelRects ?? [])];
    const buttonY = this.layout.footerY;

    if (this.ui.confirmButton && this.ui.confirmLabel) {
      const confirmX = this.layout.width - this.layout.pagePad - (confirmWidth / 2);
      this.ui.confirmX = confirmX;
      this.ui.confirmButton.setX(confirmX);
      this.ui.confirmLabel.setX(confirmX);
      this.ui.confirmGlow?.setX(confirmX);
      rects.push({
        left: confirmX - confirmWidth / 2,
        right: confirmX + confirmWidth / 2,
        top: buttonY - this.layout.confirmButtonHeight / 2,
        bottom: buttonY + this.layout.confirmButtonHeight / 2,
      });
    }

    if (this.phase === "layout" && this.ui.backButton && this.ui.backLabel) {
      const backWidth = this.ui.backButtonWidth ?? this.layout.backButtonWidth;
      rects.push({
        left: this.ui.backX - backWidth / 2,
        right: this.ui.backX + backWidth / 2,
        top: buttonY - this.layout.confirmButtonHeight / 2,
        bottom: buttonY + this.layout.confirmButtonHeight / 2,
      });
    }

    if (
      this.phase === "layout"
      && this.selectedPlacedBuilding
      && this.ui.layoutMoveHud?.visible !== false
      && this.ui.layoutMoveHudRect
    ) {
      rects.push(this.ui.layoutMoveHudRect);
    }

    this.ui.mapInteractionRects = rects;

    if (!this.ui.footerSummary) return;

    const summaryLeft = this.ui.footerSummaryBaseX;
    const summaryRight =
      this.ui.confirmX
      - (confirmWidth / 2)
      - Math.round(22 * this.layout.scale);
    const wrapWidth = Math.max(180, Math.round(summaryRight - summaryLeft));

    this.ui.footerSummary.setX(summaryLeft);

    if (typeof this.ui.footerSummary.setWordWrapWidth === "function") {
      this.ui.footerSummary.setWordWrapWidth(wrapWidth);
    } else if (this.ui.footerSummary.style) {
      this.ui.footerSummary.style.wordWrapWidth = wrapWidth;
      this.ui.footerSummary.updateText?.();
    }
  }

  _getBuildingMetaLegacy(typeKey) {
    return BUILDING_META[typeKey] ?? { emoji: "🏗️", label: typeKey ?? "Building" };
  }

  _getBuildingMeta(typeKey) {
    return BUILDING_META[typeKey] ?? { emoji: "\u{1F3D7}\uFE0F", label: typeKey ?? "Building" };
  }

  _getPlayerMeta(typeKey) {
    return PLAYER_META[typeKey] ?? {
      emoji: "\u{1F464}",
      label: typeKey ? String(typeKey).replace(/^\w/, (char) => char.toUpperCase()) : "Player",
      color: "#d2f6ff",
    };
  }

  _countPlacedBuildings(typeKeys) {
    const allowed = new Set(typeKeys);
    return (this.state.placedBuildings ?? []).reduce((count, building) => {
      const key = building?.typeKey ?? building?.type;
      return count + (allowed.has(key) ? 1 : 0);
    }, 0);
  }

  _setDeckSelectionEnabled(enabled) {
    for (const ref of this.ui.deckRefs ?? []) {
      if (ref.hitArea?.input) {
        ref.hitArea.input.enabled = enabled;
      }
      for (const cardRef of ref.cardRefs ?? []) {
        if (cardRef.hit?.input) {
          cardRef.hit.input.enabled = enabled;
        }
      }
    }
  }

  _showLayoutTooltip(pointer, text, accentColor = null) {
    const tooltip = this.ui.layoutTooltip;
    if (!tooltip) return;
    tooltip.label.setText(text);
    tooltip.label.setColor(accentColor || TEXT_LIGHT);
    const pad = Math.round(16 * this.layout.scale);
    const width = Math.max(Math.round(120 * this.layout.scale), Math.round(tooltip.label.width + pad * 2));
    const height = Math.max(Math.round(38 * this.layout.scale), Math.round(tooltip.label.height + pad));
    this._redrawPanel(tooltip.bg, width, height, {
      fillColor: 0x08151e,
      fillAlpha: 0.94,
      strokeColor: accentColor ? hexToColorInt(accentColor, 0xffffff) : 0xffffff,
      strokeAlpha: accentColor ? 0.26 : 0.16,
      radius: Math.round(18 * this.layout.scale),
      shadowColor: 0x000000,
      shadowAlpha: 0.22,
      shadowOffsetY: Math.round(8 * this.layout.scale),
    });
    tooltip.label.setPosition(0, 0);
    tooltip.container.setVisible(true);
    tooltip.container.setAlpha(1);
    tooltip.container.setPosition(
      Phaser.Math.Clamp(pointer.x + Math.round(18 * this.layout.scale), width / 2 + 8, this.layout.width - width / 2 - 8),
      Phaser.Math.Clamp(pointer.y - Math.round(18 * this.layout.scale), height / 2 + 8, this.layout.height - height / 2 - 8),
    );
  }

  _hideLayoutTooltip() {
    this.ui.layoutTooltip?.container?.setVisible(false);
  }

  _getLayoutMoveRange() {
    return Math.max(0, Math.floor(Number(this.state.layoutMoveRange ?? DEFAULT_LAYOUT_MOVE_RANGE)));
  }

  _getLayoutInfoBodyText() {
    const moveRange = this._getLayoutMoveRange();
    const tileLabel = moveRange === 1 ? "tile" : "tiles";
    return `Click any building to move it up to five ${tileLabel} from its current position. Once your town layout feels settled, press Start to begin the game.`;
  }

  _getLayoutMoveDistance(building, gridX, gridY) {
    const originX = Number.isFinite(building?.originX) ? building.originX : building?.x;
    const originY = Number.isFinite(building?.originY) ? building.originY : building?.y;
    return Math.abs(gridX - originX) + Math.abs(gridY - originY);
  }

  _getLayoutPlacementFailureText(result) {
    if (result?.reason === "out of range") {
      return `Too far: max ${this.state.layoutMoveRange ?? DEFAULT_LAYOUT_MOVE_RANGE} tiles`;
    }
    if (result?.reason === "shore") {
      return "Too close to shore";
    }
    return "Invalid layout spot";
  }

  _drawLayoutMoveHudBg(valid = true) {
    const bg = this.ui.layoutMoveHudBg;
    if (!bg || !this.layout) return;

    const width = this.layout.layoutMoveHudWidth;
    const height = this.layout.layoutMoveHudHeight;
    const radius = Math.max(10, Math.round(12 * this.layout.scale));
    const accent = valid ? 0x66ff66 : 0xff6666;

    bg.clear();
    bg.fillStyle(0x10293b, 0.72);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
    bg.fillStyle(0xffffff, 0.08);
    bg.fillRoundedRect(
      -width / 2 + 2,
      -height / 2 + 2,
      width - 4,
      Math.max(8, height * 0.42),
      radius - 2,
    );
    bg.lineStyle(2, accent, valid ? 0.22 : 0.34);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, radius);
  }

  _updateLayoutMoveHud(targetX = null, targetY = null) {
    const hud = this.ui.layoutMoveHud;
    const label = this.ui.layoutMoveHudText;
    const building = this.selectedPlacedBuilding;
    if (!hud || !label || !building) {
      this._hideLayoutMoveHud();
      return;
    }

    const gridX = Number.isFinite(targetX) ? targetX : building.x;
    const gridY = Number.isFinite(targetY) ? targetY : building.y;
    const range = this._getLayoutMoveRange();
    const distance = this._getLayoutMoveDistance(building, gridX, gridY);
    const remaining = Math.max(0, range - distance);
    const inRange = distance <= range;
    const meta = this._getBuildingMeta(building.typeKey ?? building.type?.name);
    const spotsWord = remaining === 1 ? "spot" : "spots";
    const status = inRange ? `${remaining} ${spotsWord} left` : "too far";

    label.setText(`${meta.emoji} Moving ${meta.label} | ${status}`);
    label.setColor(inRange ? TEXT_GOOD : TEXT_DANGER);
    this._drawLayoutMoveHudBg(inRange);

    hud.setVisible(true).setAlpha(1);
    this.ui.layoutMoveHudRect = {
      left: hud.x - this.layout.layoutMoveHudWidth / 2,
      right: hud.x + this.layout.layoutMoveHudWidth / 2,
      top: hud.y - this.layout.layoutMoveHudHeight / 2,
      bottom: hud.y + this.layout.layoutMoveHudHeight / 2,
    };
    this._updateFooterSummaryLayout();
  }

  _hideLayoutMoveHud() {
    this.ui.layoutMoveHud?.setVisible(false).setAlpha(0);
    this.ui.layoutMoveHudRect = null;
    this._updateFooterSummaryLayout();
  }

  _pointerToGrid(pointer) {
    const cam = this.worldScene?.cameras?.main;
    if (!cam) return null;
    const worldPoint = cam.getWorldPoint(pointer.x, pointer.y);
    return {
      gridX: Math.floor(worldPoint.x / SQUARESIZE),
      gridY: Math.floor(worldPoint.y / SQUARESIZE),
      worldX: worldPoint.x,
      worldY: worldPoint.y,
    };
  }

  _isPointerOnLayoutUi(pointer) {
    if (pointer.y <= this.layout.headerY + (this.layout.headerHeight / 2) + Math.round(10 * this.layout.scale)) return true;
    return (this.ui.mapInteractionRects ?? []).some((rect) =>
      pointer.x >= rect.left
      && pointer.x <= rect.right
      && pointer.y >= rect.top
      && pointer.y <= rect.bottom
    );
  }

  _selectPlacedBuilding(building, grabX, grabY) {
    this.selectedPlacedBuilding = building;
    this.selectedPlacedBuildingGrab = {
      x: Math.max(0, grabX - building.x),
      y: Math.max(0, grabY - building.y),
    };
    this._refreshUI();
    this._updateLayoutMoveHud(building.x, building.y);
  }

  _clearSelectedPlacedBuilding() {
    this._hideLayoutMoveHud();
    this.selectedPlacedBuilding = null;
    this.selectedPlacedBuildingGrab = { x: 0, y: 0 };
    this.preview.clearHover?.();
    this._hideLayoutTooltip();
    this._refreshUI();
  }

  _bindLayoutMapInput() {
    this._unbindLayoutMapInput?.();

    const tryPlaceSelectedBuilding = (pointer, point) => {
      if (!this.selectedPlacedBuilding || !point) return false;
      const targetX = point.gridX - (this.selectedPlacedBuildingGrab?.x ?? 0);
      const targetY = point.gridY - (this.selectedPlacedBuildingGrab?.y ?? 0);
      if (targetX === this.selectedPlacedBuilding.x && targetY === this.selectedPlacedBuilding.y) {
        return false;
      }

      const moved = this.preview.tryMoveSelected(this.selectedPlacedBuilding, this.state, targetX, targetY);
      if (!moved?.ok) {
        AudioManager.playError({ volume: 0.18 });
        this._updateLayoutMoveHud(targetX, targetY);
        const text = this._getLayoutPlacementFailureText(moved);
        this._showLayoutTooltip(pointer, text, TEXT_DANGER);
        return false;
      }

      this.preview._refreshSpawnIfInvalid?.(this.state.crew);
      const meta = this._getBuildingMeta(this.selectedPlacedBuilding.typeKey ?? this.selectedPlacedBuilding.type?.name);
      AudioManager.playBuildingComplete();
      this._showLayoutTooltip(pointer, `${meta.emoji} ${meta.label} placed`, meta.color);
      this._clearSelectedPlacedBuilding();
      return true;
    };

    this._boundPointerMove = (pointer) => {
      if (this.phase !== "layout") return;
      if (this._isPointerOnLayoutUi(pointer)) {
        this.preview.clearHover?.();
        this.preview.clearSpawnIconHover?.();
        this._hideLayoutTooltip();
        return;
      }

      const point = this._pointerToGrid(pointer);
      if (!point) return;

      if (this.selectedPlacedBuilding) {
        this.preview.clearSpawnIconHover?.();
        const targetX = point.gridX - (this.selectedPlacedBuildingGrab?.x ?? 0);
        const targetY = point.gridY - (this.selectedPlacedBuildingGrab?.y ?? 0);
        this.preview.setMoveHover(this.selectedPlacedBuilding, this.state, targetX, targetY);
        this._updateLayoutMoveHud(targetX, targetY);
        this._hideLayoutTooltip();
        return;
      }

      const hoveredPlayer = this.preview.hitTestSpawnIcon?.(point.worldX, point.worldY);
      if (hoveredPlayer) {
        this.preview.clearHover?.();
        this.preview.setHoveredSpawnPoint?.(hoveredPlayer);
        const meta = this._getPlayerMeta(hoveredPlayer.type);
        this._showLayoutTooltip(pointer, `${meta.emoji} ${meta.label}`, meta.color);
        return;
      }

      this.preview.clearSpawnIconHover?.();
      const hovered = this.preview.hitTestPlaced(point.gridX, point.gridY);
      this.preview.clearHover?.();
      if (!hovered) {
        this._hideLayoutTooltip();
        return;
      }

      const meta = this._getBuildingMeta(hovered.typeKey ?? hovered.type?.name);
      this._showLayoutTooltip(pointer, `${meta.emoji} ${meta.label}`, meta.color);
    };

    this._boundPointerDown = (pointer) => {
      if (this.phase !== "layout") return;
      if (this._isPointerOnLayoutUi(pointer)) return;

      const point = this._pointerToGrid(pointer);
      if (!point) return;

      const hitPlayer = this.preview.hitTestSpawnIcon?.(point.worldX, point.worldY);
      const hitBuilding = this.preview.hitTestPlaced(point.gridX, point.gridY);
      if (!this.selectedPlacedBuilding) {
        if (hitPlayer) return;
        if (hitBuilding) {
          this._selectPlacedBuilding(hitBuilding, point.gridX, point.gridY);
          const meta = this._getBuildingMeta(hitBuilding.typeKey ?? hitBuilding.type?.name);
          this._showLayoutTooltip(pointer, `${meta.emoji} ${meta.label} selected`, meta.color);
        }
        return;
      }

      if (hitBuilding) {
        if (hitBuilding === this.selectedPlacedBuilding) {
          if (tryPlaceSelectedBuilding(pointer, point)) return;
          this._clearSelectedPlacedBuilding();
          return;
        }
        this._selectPlacedBuilding(hitBuilding, point.gridX, point.gridY);
        const meta = this._getBuildingMeta(hitBuilding.typeKey ?? hitBuilding.type?.name);
        this._showLayoutTooltip(pointer, `${meta.emoji} ${meta.label} selected`, meta.color);
        return;
      }

      tryPlaceSelectedBuilding(pointer, point);
    };

    this.scene.input.on("pointermove", this._boundPointerMove);
    this.scene.input.on("pointerdown", this._boundPointerDown);
  }

  _unbindLayoutMapInput() {
    if (this._boundPointerMove) {
      this.scene?.input?.off?.("pointermove", this._boundPointerMove);
      this._boundPointerMove = null;
    }
    if (this._boundPointerDown) {
      this.scene?.input?.off?.("pointerdown", this._boundPointerDown);
      this._boundPointerDown = null;
    }
  }

  _setPhase(nextPhase, opts = {}) {
    const phase = nextPhase === "layout" ? "layout" : "deck";
    const changed = this.phase !== phase;
    this.phase = phase;

    const isLayout = phase === "layout";
    const phaseOffset = Math.round(22 * this.layout.scale);
    const targetsToShow = [];
    const targetsToHide = [];

    if (this.ui.deckRow) {
      (isLayout ? targetsToHide : targetsToShow).push(this.ui.deckRow);
    }
    if (this.ui.layoutStage) {
      (isLayout ? targetsToShow : targetsToHide).push(this.ui.layoutStage);
    }

    if (!isLayout) {
      this._clearSelectedPlacedBuilding();
    } else {
      this._hideLayoutTooltip();
    }

    this.preview?.setSpawnPreviewVisible?.(isLayout);
    this._setDeckSelectionEnabled(!isLayout);

    for (const target of [...targetsToShow, ...targetsToHide]) {
      if (!target) continue;
      if (typeof target._draftPhaseBaseY !== "number") {
        target._draftPhaseBaseY = target.y ?? 0;
      }
    }

    for (const target of targetsToShow) {
      target.setVisible(true);
      if (opts.immediate) {
        target.setAlpha(1);
        target.y = target._draftPhaseBaseY ?? target.y ?? 0;
      } else {
        target.setAlpha(0);
        target.y = (target._draftPhaseBaseY ?? target.y ?? 0) + phaseOffset;
      }
    }
    for (const target of targetsToHide) {
      if (opts.immediate) {
        target.setAlpha(0).setVisible(false);
        target.y = target._draftPhaseBaseY ?? target.y ?? 0;
      }
    }

    if (!opts.immediate) {
      targetsToShow.forEach((target, index) => {
        this.scene.tweens.add({
          targets: target,
          alpha: 1,
          y: target._draftPhaseBaseY ?? target.y ?? 0,
          duration: 260,
          delay: index * 35,
          ease: "Cubic.easeOut",
        });
      });
      targetsToHide.forEach((target) => {
        const baseY = target._draftPhaseBaseY ?? target.y ?? 0;
        this.scene.tweens.add({
          targets: target,
          alpha: 0,
          y: baseY - phaseOffset,
          duration: 180,
          ease: "Quad.easeOut",
          onComplete: () => {
            target.setVisible(false);
            target.y = baseY;
          },
        });
      });
    }

    this.scene.events.emit("draftPhaseChanged", {
      phase,
      placedBuildings: this.state.placedBuildings,
      immediate: !!opts.immediate,
    });

    if (changed || opts.emit) {
      this._refreshUI();
    }
  }

  _confirmDraftStart() {
    if (!this.state.teamName.trim()) {
      AudioManager.playError({ volume: 0.24 });
      this._setTeamNameValidationState(true);
      this._shakeTeamNameInput();
      this.teamNameInput?.focus?.();
      return;
    }

    if (this.phase !== "layout") {
      this._setTeamNameValidationState(false);
      this._setPhase("layout");
      return;
    }

    this._setTeamNameValidationState(false);
    this.preview.syncNavGridFromDraftLayout?.();
    const startConfig = this.state.toStartConfig();
    startConfig.spawnPoints = this.preview.getSpawnPoints();
    this.preview.clearDraftPlayerIcons?.();
    this.scene.events.emit("draftConfirmed", startConfig);
  }

  _buildBackdrop(width, height) {
    const scene = this.scene;

    const shade = scene.add.rectangle(width / 2, height / 2, width, height, SCREEN_TINT, 0.34);
    const topGlow = scene.add.ellipse(width / 2, 0, width * 0.78, 220, 0x74d8ff, 0.1);
    const centerGlow = scene.add.ellipse(width / 2, height * 0.5, width * 0.44, height * 0.68, 0xffffff, 0.06);
    const bottomGlow = scene.add.ellipse(width / 2, height + 20, width * 0.86, 220, 0x5cf0bf, 0.08);

    this.container.add([shade, topGlow, centerGlow, bottomGlow]);

    scene.tweens.add({
      targets: [topGlow, centerGlow],
      alpha: { from: 0.04, to: 0.13 },
      duration: 2600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  _buildHeader(width) {
    const scene = this.scene;
    const layout = this.layout;
    const header = scene.add.container(width / 2, layout.headerY);
    const headerWidth = layout.headerWidth;
    const headerHeight = layout.headerHeight;
    const bodyWrapWidth = headerWidth - (layout.teamInputWidth + Math.round(220 * layout.scale));

    const shell = this._makeRoundedPanel(headerWidth, headerHeight, {
      fillColor: HEADER_FILL,
      fillAlpha: 0.74,
      strokeColor: 0x9be8ff,
      strokeAlpha: 0.25,
      radius: 34,
      shadowColor: 0x071116,
      shadowAlpha: 0.28,
      shadowOffsetY: 12,
    });

    const shine = this._makeRoundedPanel(headerWidth - 18, 42, {
      fillColor: 0xffffff,
      fillAlpha: 0.06,
      radius: 24,
    });
    shine.y = -26;

    const accent = scene.add.ellipse(
      -headerWidth / 2 + Math.round(86 * layout.scale),
      -Math.round(16 * layout.scale),
      Math.round(118 * layout.scale),
      Math.round(48 * layout.scale),
      0x72f0c0,
      0.16,
    );
    const title = scene.add.text(
      -headerWidth / 2 + Math.round(36 * layout.scale),
      -Math.round(20 * layout.scale),
      "Founding Draft",
      this._displayStyle(34, {
        min: 24,
        scale: layout.scale,
        color: TEXT_LIGHT,
        stroke: "#0a1420",
        strokeThickness: Math.max(3, Math.round(5 * layout.scale)),
      }),
    ).setOrigin(0, 0.5);

    const subtitle = scene.add.text(
      -headerWidth / 2 + Math.round(36 * layout.scale),
      Math.round(24 * layout.scale),
      "Pick one starter deck.",
      this._displayStyle(15, {
        min: 13,
        scale: layout.scale,
        color: "#d9eef8",
        stroke: "#08131d",
        strokeThickness: Math.max(2, Math.round(3 * layout.scale)),
        wordWrap: { width: bodyWrapWidth },
        lineSpacing: Math.round(4 * layout.scale),
      }),
    ).setOrigin(0, 0.5);

    const teamTagX = headerWidth / 2 - (layout.teamInputWidth + Math.round(74 * layout.scale));
    const teamTag = scene.add.text(
      teamTagX,
      -Math.round(30 * layout.scale),
      "Town Name",
      this._displayStyle(18, {
        min: 14,
        scale: layout.scale,
        color: TEXT_LIGHT,
        stroke: "#000000",
        strokeThickness: Math.max(3, Math.round(4 * layout.scale)),
      }),
    ).setOrigin(0, 0.5);

    const teamInputShellWidth = layout.teamInputWidth + 44;
    const teamInputShellHeight = Math.round(56 * layout.scale);
    const teamInputShellRadius = Math.round(20 * layout.scale);
    const teamInputShell = this._makeRoundedPanel(teamInputShellWidth, teamInputShellHeight, {
      fillColor: 0x0d2130,
      fillAlpha: 0.9,
      strokeColor: 0xd2f6ff,
      strokeAlpha: 0.18,
      radius: teamInputShellRadius,
      shadowColor: 0x06121b,
      shadowAlpha: 0.2,
      shadowOffsetY: Math.round(8 * layout.scale),
    });
    teamInputShell.x = headerWidth / 2 - (layout.teamInputWidth / 2) - Math.round(46 * layout.scale);
    teamInputShell.y = Math.round(12 * layout.scale);


    header.add([
      shell,
      shine,
      accent,
      title,
      subtitle,
      teamTag,
      teamInputShell,
    ]);

    scene.tweens.add({
      targets: accent,
      alpha: { from: 0.1, to: 0.22 },
      scaleX: { from: 1, to: 1.08 },
      scaleY: { from: 1, to: 1.08 },
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.teamNameInput = new TeamNameInput(scene, {
      x: width / 2 + teamInputShell.x,
      y: layout.headerY + teamInputShell.y,
      width: layout.teamInputWidth,
      inputClassName: "draft-town-name-input",
      styleTagId: "draft-town-name-input-style",
      fontLoadSizePx: Math.max(14, Math.round(16 * layout.scale)),
      placeholder: "Name your town",
      initialValue: this.state.teamName,
      onChange: (value) => this.state.setTeamName(value),
      onType: ({ changedCount, addedCount, removedCount }) => {
        const fallbackCount = (Number(addedCount) || 0) + (Number(removedCount) || 0);
        const playCount = Math.min(6, Math.max(0, Number(changedCount) || fallbackCount));
        for (let index = 0; index < playCount; index++) {
          AudioManager.playUiTextThud({
            volume: 0.15,
            rate: 1.01 + Math.random() * 0.04,
          });
        }
      },
      wrapperStyle: "display:flex; align-items:stretch;",
      extraCss: `
        .draft-town-name-input,
        .draft-town-name-input::placeholder {
          font-family:"Bungee", cursive !important;
          font-weight:400 !important;
          letter-spacing:0 !important;
          text-shadow:none !important;
          -webkit-text-stroke:0 !important;
        }
        .draft-town-name-input::placeholder {
          color:#d1d5db !important;
          opacity:1 !important;
        }
      `,
      inputStyle: `
        width:${layout.teamInputWidth}px;
        padding:${Math.round(9 * layout.scale)}px ${Math.round(16 * layout.scale)}px;
        font-size:${Math.max(13, Math.round(16 * layout.scale))}px;
        font-family:"Bungee", cursive;
        font-weight:400;
        border-radius:${Math.round(16 * layout.scale)}px;
        border:1px solid #ffffff;
        box-shadow:none;
        -webkit-appearance:none;
        appearance:none;
        background:#000000;
        color:#ffffff;
        -webkit-text-fill-color:#ffffff;
        -webkit-text-stroke:0;
        text-shadow:none;
        outline:none;
        caret-color:#ffffff;
        letter-spacing:0;
      `,
    });

    this.ui.teamTag = teamTag;
    this.ui.teamInputShell = teamInputShell;
    this.ui.teamInputShellWidth = teamInputShellWidth;
    this.ui.teamInputShellHeight = teamInputShellHeight;
    this.ui.teamInputShellRadius = teamInputShellRadius;
    this.ui.teamInputShellX = teamInputShell.x;
    this.ui.teamInputDomX = this.teamNameInput?.dom?.x ?? 0;
    this.ui.headerTitle = title;
    this.ui.headerSubtitle = subtitle;
    this._setTeamNameValidationState(false);

    this.container.add(header);
    this.ui.header = header;
  }

  _buildDeckRow(width, height) {
    const decks = this.state.starterDecks;
    const layout = this.layout;
    const gap = layout.gap;
    const deckWidth = layout.deckWidth;
    const deckHeight = layout.deckHeight;
    const rowCenterY = layout.rowCenterY;
    const totalWidth = deckWidth * decks.length + gap * (decks.length - 1);
    let x = (width - totalWidth) / 2 + deckWidth / 2;
    const row = this.scene.add.container(0, 0);

    this.ui.deckRefs = [];

    decks.forEach((deck, index) => {
      const ref = this._buildDeckCard(deck, x, rowCenterY, deckWidth, deckHeight, index, row);
      this.ui.deckRefs.push(ref);
      x += deckWidth + gap;
    });

    this.container.add(row);
    this.ui.deckRow = row;
  }

  _buildDeckCard(deck, x, y, width, height, index, rowContainer = this.container) {
    const scene = this.scene;
    const layout = this.layout;
    const accent = hexToColorInt(deck.accent, 0xffffff);
    const container = scene.add.container(x, y);
    const contentScale = clamp(Math.min(width / 360, height / 610), 0.72, 1);
    const top = -height / 2;
    const bottom = height / 2;
    const sectionLeft = -width / 2 + Math.round(28 * contentScale);
    const innerWidth = width - Math.round(56 * contentScale);
    const posY = (baseY) => top + Math.round(height * (baseY / 610));
    const sizeY = (baseHeight) => Math.round(height * (baseHeight / 610));

    const glow = this._makeRoundedPanel(width + 10, height + 10, {
      fillColor: accent,
      fillAlpha: 0.12,
      radius: 34,
      shadowColor: accent,
      shadowAlpha: 0.12,
      shadowOffsetY: 0,
    });

    const panel = this._makeRoundedPanel(width, height, {
      fillColor: BASE_DECK_FILL,
      fillAlpha: 0.78,
      strokeColor: BASE_DECK_STROKE,
      strokeAlpha: 0.18,
      radius: 32,
      shadowColor: 0x071116,
      shadowAlpha: 0.3,
      shadowOffsetY: 18,
    });

    const topShine = this._makeRoundedPanel(width - Math.round(24 * contentScale), Math.round(48 * contentScale), {
      fillColor: 0xffffff,
      fillAlpha: 0.05,
      radius: Math.round(24 * contentScale),
    });
    topShine.y = posY(38);

    const orb = scene.add.ellipse(-width / 2 + Math.round(54 * contentScale), posY(48), Math.round(88 * contentScale), Math.round(88 * contentScale), accent, 0.18);
    const selectPill = this._makeRoundedPanel(Math.round(138 * contentScale), Math.round(36 * contentScale), {
      fillColor: deck.accentDark ? hexToColorInt(deck.accentDark, accent) : accent,
      fillAlpha: 0.8,
      radius: Math.round(18 * contentScale),
    });
    selectPill.x = 0;
    const selectPillY = posY(38);
    selectPill.y = selectPillY;

    const selectLabel = scene.add.text(
      0,
      posY(38),
      "Starter Deck",
      this._displayStyle(10, {
        min: 10,
        scale: contentScale,
        color: "#f4fdff",
        stroke: "#03111c",
        strokeThickness: Math.max(2, Math.round(3 * contentScale)),
      }),
    ).setOrigin(0.5);

    const name = scene.add.text(
      sectionLeft,
      posY(86),
      deck.name,
      this._displayStyle(24, {
        min: 18,
        scale: contentScale,
        color: "#ffffff",
        stroke: "#03111c",
        strokeThickness: Math.max(3, Math.round(5 * contentScale)),
        wordWrap: { width: innerWidth },
      }),
    ).setOrigin(0, 0.5);

    const subtitle = scene.add.text(
      sectionLeft,
      posY(122),
      deck.subtitle,
      this._displayStyle(13, {
        min: 12,
        scale: contentScale,
        color: deck.accent,
        stroke: "#03111c",
        strokeThickness: Math.max(2, Math.round(3 * contentScale)),
        wordWrap: { width: innerWidth },
      }),
    ).setOrigin(0, 0.5);

    const summary = scene.add.text(
      sectionLeft,
      posY(154),
      deck.summary,
      this._displayStyle(10, {
        min: 10,
        scale: contentScale,
        color: "#d8eef7",
        stroke: "#03111c",
        strokeThickness: Math.max(1, Math.round(2 * contentScale)),
        wordWrap: { width: innerWidth },
        lineSpacing: Math.max(2, Math.round(4 * contentScale)),
      }),
    ).setOrigin(0, 0.5);

    const stockLabel = scene.add.text(
      sectionLeft,
      posY(216),
      "Starting Stock",
      this._displayStyle(12, {
        min: 11,
        scale: contentScale,
        color: "#effbff",
        stroke: "#03111c",
        strokeThickness: Math.max(2, Math.round(3 * contentScale)),
      }),
    ).setOrigin(0, 0.5);

    const stockTrayHeight = Math.max(Math.round(98 * contentScale), sizeY(104));
    const stockTray = this._makeRoundedPanel(width - Math.round(42 * contentScale), stockTrayHeight, {
      fillColor: 0x0d2130,
      fillAlpha: 0.86,
      strokeColor: 0xffffff,
      strokeAlpha: 0.08,
      radius: Math.round(26 * contentScale),
    });
    stockTray.y = posY(278);

    const resourceRefs = this._buildResourceChips(deck, width, stockTray.y, contentScale);

    const cardsLabel = scene.add.text(
      sectionLeft,
      posY(348),
      "Starter Cards",
      this._displayStyle(12, {
        min: 11,
        scale: contentScale,
        color: "#effbff",
        stroke: "#03111c",
        strokeThickness: Math.max(2, Math.round(3 * contentScale)),
      }),
    ).setOrigin(0, 0.5);

    const cardGap = Math.max(6, Math.round(8 * contentScale));
    const cardWidth = Math.floor((width - Math.round(48 * contentScale) - cardGap * 2) / 3);
    const cardHeight = Math.max(
      80,
      Math.round((layout.compact ? 92 : 104) * contentScale),
      sizeY(layout.compact ? 100 : 116),
    );
    const cardStartX = -width / 2 + Math.round(24 * contentScale) + cardWidth / 2;
    const cardY = posY(422);
    const cardRefs = [];

    deck.cards.forEach((card, cardIndex) => {
      const cardX = cardStartX + cardIndex * (cardWidth + cardGap);
      const cardRef = this._buildStarterCard(
        deck,
        card,
        width,
        height,
        cardX,
        cardY,
        cardWidth,
        cardHeight,
        contentScale,
      );
      cardRefs.push(cardRef);
    });

    const crewLabel = scene.add.text(
      sectionLeft + Math.round(6 * contentScale),
      posY(496),
      "Starting Crew",
      this._displayStyle(12, {
        min: 11,
        scale: contentScale,
        color: "#effbff",
        stroke: "#03111c",
        strokeThickness: Math.max(2, Math.round(3 * contentScale)),
      }),
    ).setOrigin(0, 0.5);

    const crewTrayHeight = Math.max(Math.round(94 * contentScale), sizeY(102));
    const crewTray = this._makeRoundedPanel(width - Math.round(42 * contentScale), crewTrayHeight, {
      fillColor: 0x0d2130,
      fillAlpha: 0.86,
      strokeColor: 0xffffff,
      strokeAlpha: 0.08,
      radius: Math.round(26 * contentScale),
    });
    crewTray.y = posY(540);

    const portraitRefs = this._buildPortraitStrip(width, crewTray.y, contentScale);

    const hitArea = scene.add.rectangle(0, 0, width, height, 0xffffff, 0.001)
      .setInteractive({ cursor: "pointer" });

    container.add([
      glow,
      panel,
      hitArea,
      topShine,
      orb,
      selectPill,
      selectLabel,
      name,
      subtitle,
      summary,
      stockLabel,
      stockTray,
      ...resourceRefs.flatMap((entry) => entry.objects),
      cardsLabel,
      ...cardRefs.map((entry) => entry.container),
      crewLabel,
      crewTray,
      ...portraitRefs.flatMap((entry) => entry.objects),
    ]);

    const deckRef = {
      deck,
      container,
      glow,
      panel,
      selectPill,
      selectLabel,
      summary,
      resourceRefs,
      cardRefs,
      portraitRefs,
      hitArea,
      accent,
      baseY: y,
      contentScale,
      selectPillWidth: Math.round(138 * contentScale),
      selectPillHeight: Math.round(36 * contentScale),
      selectPillY,
      isHovered: false,
    };

    hitArea.on("pointerover", () => {
      deckRef.isHovered = true;
      this._syncDeckVisual(deckRef);
    });

    hitArea.on("pointerout", () => {
      deckRef.isHovered = false;
      this._syncDeckVisual(deckRef);
    });

    hitArea.on("pointerdown", () => {
      if (deck.id !== this.state.selectedDeckId) {
        AudioManager.playDraftDeckSelect();
      }
      this.state.selectStarterDeck(deck.id);
    });

    scene.tweens.add({
      targets: orb,
      alpha: { from: 0.1, to: 0.24 },
      scaleX: { from: 1, to: 1.18 },
      scaleY: { from: 1, to: 1.18 },
      duration: 1700 + index * 220,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    scene.tweens.add({
      targets: container,
      alpha: { from: 0, to: 1 },
      y: { from: y + 40, to: y },
      duration: 520,
      delay: 100 + index * 110,
      ease: "Cubic.easeOut",
    });

    rowContainer.add(container);
    return deckRef;
  }

  _buildLayoutStage(width, height) {
    const scene = this.scene;
    const layout = this.layout;
    const scale = layout.scale;
    const stage = scene.add.container(0, 0).setVisible(false).setAlpha(0);
    const infoWidth = layout.layoutInfoWidth;
    const infoHeight = layout.layoutInfoHeight;
    const legendWidth = layout.layoutLegendWidth;
    const legendHeight = layout.layoutLegendHeight;
    const panelY = layout.layoutPanelY;
    const infoX = Math.round(layout.pagePad + infoWidth / 2 + 12 * scale);
    const moveHudX = Math.round(width / 2);
    const moveHudY = layout.layoutMoveHudY;
    const legendX = width - Math.round(layout.pagePad + legendWidth / 2 + 12 * scale);

    const info = scene.add.container(infoX, panelY);
    const infoShell = this._makeRoundedPanel(infoWidth, infoHeight, {
      fillColor: HEADER_FILL,
      fillAlpha: 0.84,
      strokeColor: 0xb9efff,
      strokeAlpha: 0.16,
      radius: Math.round(20 * scale),
      shadowColor: 0x08131c,
      shadowAlpha: 0.24,
      shadowOffsetY: Math.round(12 * scale),
    });
    const infoShine = this._makeRoundedPanel(infoWidth - Math.round(4 * scale), Math.max(20, Math.round(infoHeight * 0.38)), {
      fillColor: 0xffffff,
      fillAlpha: 0.08,
      radius: Math.round(16 * scale),
    });
    infoShine.y = -infoHeight / 2 + Math.max(10, Math.round(infoHeight * 0.19));
    const infoTitle = scene.add.text(
      -infoWidth / 2 + Math.round(26 * scale),
      -infoHeight / 2 + Math.round(25 * scale),
      "Town Layout",
      this._displayStyle(20, {
        min: 16,
        scale,
        color: TEXT_LIGHT,
        stroke: "#09131c",
        strokeThickness: Math.max(2, Math.round(3 * scale)),
      }),
    ).setOrigin(0, 0.5);
    const infoBody = scene.add.text(
      -infoWidth / 2 + Math.round(26 * scale),
      -infoHeight / 2 + Math.round(58 * scale),
      this._getLayoutInfoBodyText(),
      this._displayStyle(12, {
        min: 12,
        scale,
        color: TEXT_MUTED,
        stroke: "#08131d",
        strokeThickness: Math.max(2, Math.round(3 * scale)),
        wordWrap: { width: infoWidth - Math.round(54 * scale) },
        lineSpacing: Math.round(4 * scale),
      }),
    ).setOrigin(0, 0);
    info.add([infoShell, infoShine, infoTitle, infoBody]);

    const moveHud = scene.add.container(moveHudX, moveHudY)
      .setVisible(false)
      .setAlpha(0);
    const moveHudBg = scene.add.graphics();
    const moveHudText = scene.add.text(
      0,
      0,
      "",
      this._displayStyle(13, {
        min: 12,
        scale,
        color: TEXT_GOOD,
        stroke: "#000000",
        strokeThickness: Math.max(2, Math.round(3 * scale)),
      }),
    ).setOrigin(0.5);
    moveHud.add([moveHudBg, moveHudText]);

    const legend = scene.add.container(legendX, panelY);
    const legendShell = this._makeRoundedPanel(legendWidth, legendHeight, {
      fillColor: HEADER_FILL,
      fillAlpha: 0.82,
      strokeColor: 0xb9efff,
      strokeAlpha: 0.14,
      radius: Math.round(28 * scale),
      shadowColor: 0x08131c,
      shadowAlpha: 0.22,
      shadowOffsetY: Math.round(12 * scale),
    });
    const legendTitle = scene.add.text(
      -legendWidth / 2 + Math.round(24 * scale),
      -legendHeight / 2 + Math.round(30 * scale),
      "Legend",
      this._displayStyle(24, {
        min: 18,
        scale,
        color: TEXT_LIGHT,
        stroke: "#09131c",
        strokeThickness: Math.max(2, Math.round(4 * scale)),
      }),
    ).setOrigin(0, 0.5);

    const legendRefs = [];
    [
      { key: "tower", emoji: "🗼", label: "Town Tower", color: BUILDING_META.tower.color, types: ["tower"] },
      { key: "house", emoji: "🏠", label: "House", color: BUILDING_META.house1.color, types: ["house1", "house2"] },
      { key: "storage", emoji: "📦", label: "Storage", color: BUILDING_META.storage.color, types: ["storage"] },
      { key: "clayOven", emoji: "🔥", label: "Clay Oven", color: BUILDING_META.clayOven.color, types: ["clayOven"] },
    ].forEach((entry, index) => {
      const lineY = -legendHeight / 2 + Math.round((78 + index * 50) * scale);
      const marker = scene.add.circle(-legendWidth / 2 + Math.round(30 * scale), lineY, Math.max(4, Math.round(6 * scale)), hexToColorInt(entry.color, 0xffffff), 0.95);
      const label = scene.add.text(
        -legendWidth / 2 + Math.round(46 * scale),
        lineY,
        `${entry.emoji} ${entry.label}`,
        this._displayStyle(16, {
          min: 14,
          scale,
          color: entry.color,
          stroke: "#08131d",
          strokeThickness: Math.max(1, Math.round(2 * scale)),
        }),
      ).setOrigin(0, 0.5);
      const count = scene.add.text(
        legendWidth / 2 - Math.round(24 * scale),
        lineY,
        "x0",
        this._displayStyle(14, {
          min: 12,
          scale,
          color: entry.color,
          stroke: "#08131d",
          strokeThickness: Math.max(1, Math.round(2 * scale)),
        }),
      ).setOrigin(1, 0.5);
      legendRefs.push({ ...entry, marker, label, count });
      legend.add([marker, label, count]);
    });
    legend.add([legendShell, legendTitle]);
    legend.sendToBack(legendShell);

    const tooltip = scene.add.container(0, 0)
      .setVisible(false)
      .setAlpha(0.98);
    const tooltipBg = this._makeRoundedPanel(Math.round(170 * scale), Math.round(42 * scale), {
      fillColor: 0x08151e,
      fillAlpha: 0.94,
      strokeColor: 0xffffff,
      strokeAlpha: 0.14,
      radius: Math.round(18 * scale),
    });
    const tooltipLabel = scene.add.text(
      0,
      0,
      "",
      this._displayStyle(13, {
        min: 12,
        scale,
        color: TEXT_LIGHT,
        stroke: "#08131d",
        strokeThickness: Math.max(1, Math.round(2 * scale)),
      }),
    ).setOrigin(0.5);
    tooltip.add([tooltipBg, tooltipLabel]);

    stage.add([info, legend, moveHud, tooltip]);
    this.container.add(stage);

    this.ui.layoutStage = stage;
    this.ui.layoutInfoBody = infoBody;
    this.ui.layoutMoveHud = moveHud;
    this.ui.layoutMoveHudBg = moveHudBg;
    this.ui.layoutMoveHudText = moveHudText;
    this.ui.layoutMoveHudRect = null;
    this.ui.layoutLegendRefs = legendRefs;
    this.ui.layoutTooltip = {
      container: tooltip,
      bg: tooltipBg,
      label: tooltipLabel,
    };
    this.ui.layoutPanelRects = [
      {
        left: infoX - infoWidth / 2,
        right: infoX + infoWidth / 2,
        top: panelY - infoHeight / 2,
        bottom: panelY + infoHeight / 2,
      },
      {
        left: legendX - legendWidth / 2,
        right: legendX + legendWidth / 2,
        top: panelY - legendHeight / 2,
        bottom: panelY + legendHeight / 2,
      },
    ];
    this.ui.mapInteractionRects = [...this.ui.layoutPanelRects];
  }

  _buildResourceChips(deck, deckWidth, centerY, contentScale = 1) {
    const scene = this.scene;
    const chipHeight = Math.max(24, Math.round(28 * contentScale));
    const gap = Math.max(5, Math.round(7 * contentScale));
    const trayWidth = deckWidth - Math.round(42 * contentScale);
    const refs = [];
    const rows = [
      RESOURCE_LAYOUT.slice(0, 4),
      RESOURCE_LAYOUT.slice(4),
    ];

    rows.forEach((row, rowIndex) => {
      const chipWidth = Math.floor((trayWidth - gap * (row.length - 1)) / row.length);
      const rowWidth = row.length * chipWidth + (row.length - 1) * gap;
      let chipX = -rowWidth / 2 + chipWidth / 2;
      const chipY = centerY - Math.round(18 * contentScale) + rowIndex * Math.round(34 * contentScale);

      row.forEach((entry) => {
        const chip = this._makeRoundedPanel(chipWidth, chipHeight, {
          fillColor: 0xffffff,
          fillAlpha: 0.05,
          strokeColor: 0xffffff,
          strokeAlpha: 0.08,
          radius: Math.round(14 * contentScale),
        });
        chip.x = chipX;
        chip.y = chipY;

        const iconX = chipX - (chipWidth / 2) + Math.round((entry.key === "money" ? 18 : 16) * contentScale);
        const valueX = chipX - (chipWidth / 2) + Math.round((entry.key === "money" ? 34 : 28) * contentScale);
        const icon = scene.add.image(iconX, chipY, entry.icon)
          .setScale(entry.key === "money" ? 0.5 * contentScale : 0.68 * contentScale);
        const value = scene.add.text(
          valueX,
          chipY,
          String(deck.resources[entry.key] ?? 0),
          this._labelStyle(entry.key === "money" ? 9 : 10, {
            min: 10,
            scale: contentScale,
            color: "#f7fdff",
            stroke: "#03111c",
            strokeThickness: Math.max(1, Math.round(2 * contentScale)),
          }),
        ).setOrigin(0, 0.5);

        refs.push({
          key: entry.key,
          value,
          objects: [chip, icon, value],
        });

        chipX += chipWidth + gap;
      });
    });

    return refs;
  }

  _buildStarterCard(deck, card, deckWidth, deckHeight, localX, localY, width, height, contentScale = 1) {
    const scene = this.scene;
    const cardContainer = scene.add.container(localX, localY);
    const tint = getCardOutlineTint(card);

    const bg = this._makeRoundedPanel(width, height, {
      fillColor: tint,
      fillAlpha: 0.16,
      strokeColor: tint,
      strokeAlpha: 0.8,
      radius: Math.round(18 * contentScale),
      shadowColor: 0x09121a,
      shadowAlpha: 0.18,
      shadowOffsetY: Math.round(8 * contentScale),
    });

    const shine = this._makeRoundedPanel(width - Math.round(12 * contentScale), Math.round(24 * contentScale), {
      fillColor: 0xffffff,
      fillAlpha: 0.08,
      radius: Math.round(14 * contentScale),
    });
    shine.y = -height / 2 + Math.round(18 * contentScale);

    const icon = scene.add.image(0, -height / 2 + Math.round(34 * contentScale), card.image).setScale(0.72 * contentScale);
    const name = scene.add.text(
      0,
      height / 2 - Math.round(22 * contentScale),
      card.name,
      this._displayStyle(10, {
        min: 10,
        scale: contentScale,
        color: "#f7fdff",
        stroke: "#03111c",
        strokeThickness: Math.max(2, Math.round(3 * contentScale)),
        align: "center",
        wordWrap: { width: width - Math.round(16 * contentScale) },
      }),
    ).setOrigin(0.5);

    const hit = scene.add.rectangle(0, 0, width, height, 0xffffff, 0.001)
      .setInteractive({ cursor: "pointer" });

    hit.on("pointerover", () => {
      const deckContainer = cardContainer.parentContainer;
      this._showCardHoverBubble(
        card,
        tint,
        deckContainer?.x ?? this.scene.scale.width / 2,
        deckContainer?.y ?? this.scene.scale.height / 2,
      );
      scene.tweens.killTweensOf(cardContainer);
      scene.tweens.add({
        targets: cardContainer,
        scaleX: 1.04,
        scaleY: 1.04,
        y: localY - 8,
        duration: 140,
        ease: "Quad.easeOut",
      });
    });

    hit.on("pointerout", () => {
      this._hideCardHoverBubble();
      scene.tweens.killTweensOf(cardContainer);
      scene.tweens.add({
        targets: cardContainer,
        scaleX: 1,
        scaleY: 1,
        y: localY,
        duration: 140,
        ease: "Quad.easeOut",
      });
    });

    hit.on("pointerdown", () => {
      if (deck.id !== this.state.selectedDeckId) {
        AudioManager.playDraftDeckSelect();
      }
      this.state.selectStarterDeck(deck.id);
    });

    cardContainer.add([bg, shine, icon, name, hit]);

    return {
      container: cardContainer,
      hit,
    };
  }

  _buildPortraitStrip(deckWidth, centerY, contentScale = 1) {
    const scene = this.scene;
    const chipWidth = Math.floor((deckWidth - Math.round(62 * contentScale)) / REQUIRED_STARTER_TYPES.length);
    const chipHeight = Math.round(72 * contentScale);
    const startX = -((REQUIRED_STARTER_TYPES.length - 1) * chipWidth) / 2;

    return REQUIRED_STARTER_TYPES.map((typeKey, index) => {
      const unit = createStarterPortraitUnit(typeKey);
      const portraitKey = getPlayerPortraitKey(unit);
      const x = startX + index * chipWidth;

      const chip = this._makeRoundedPanel(chipWidth - 8, chipHeight, {
          fillColor: 0xffffff,
          fillAlpha: 0.05,
          strokeColor: 0xffffff,
          strokeAlpha: 0.08,
          radius: Math.round(18 * contentScale),
        });
      chip.x = x;
      chip.y = centerY;

      const portrait = scene.add.sprite(x, centerY - Math.round(10 * contentScale), portraitKey ?? "");
      applyPortraitKeyToSprite(scene, portrait, portraitKey, Math.round(34 * contentScale));

      const label = scene.add.text(
        x,
        centerY + Math.round(19 * contentScale),
        typeKey,
        this._displayStyle(8, {
          min: 8,
          scale: contentScale,
          color: "#edf9ff",
          stroke: "#03111c",
          strokeThickness: Math.max(1, Math.round(2 * contentScale)),
          align: "center",
          wordWrap: { width: chipWidth - Math.round(18 * contentScale) },
        }),
      ).setOrigin(0.5);

      return {
        objects: [chip, portrait, label],
      };
    });
  }

  _buildFooter(width, height) {
    const scene = this.scene;
    const layout = this.layout;
    const footer = scene.add.container(0, 0);
    const footerWidth = layout.footerWidth;
    const footerHeight = layout.footerHeight;
    const footerInset = Math.round(30 * layout.scale);
    const backWidth = layout.backButtonWidth;
    const backHeight = layout.confirmButtonHeight;
    const backX = layout.pagePad + (backWidth / 2);
    const confirmX = width - layout.pagePad - (layout.confirmButtonWidth / 2);
    const buttonY = layout.footerY;
    const summaryShellHeight = footerHeight + 5;

    const shell = this._makeRoundedPanel(footerWidth, summaryShellHeight, {
      fillColor: HEADER_FILL,
      fillAlpha: 0.8,
      strokeColor: 0xb9efff,
      strokeAlpha: 0.18,
      radius: Math.round(28 * layout.scale),
      shadowColor: 0x08131c,
      shadowAlpha: 0.28,
      shadowOffsetY: Math.round(12 * layout.scale),
    });
    shell.x = width / 2;
    shell.y = buttonY + 2.5;

    const labelY = buttonY - (footerHeight / 2) + Math.round(20 * layout.scale) - 1;
    const summaryY = labelY + Math.round(20 * layout.scale);
    const summaryLeft = (width / 2) - (footerWidth / 2) + footerInset;

    const pickLabel = scene.add.text(
      summaryLeft,
      labelY,
      "Opening Summary",
      this._displayStyle(13, {
        min: 12,
        scale: layout.scale,
        color: "#ddeff8",
        stroke: "#08131d",
        strokeThickness: Math.max(1, Math.round(2 * layout.scale)),
      }),
    ).setOrigin(0, 0.5);

    const summary = scene.add.text(
      summaryLeft,
      summaryY,
      "",
      this._displayStyle(12, {
        min: 11,
        scale: layout.scale,
        color: TEXT_MUTED,
        stroke: "#08131d",
        strokeThickness: Math.max(1, Math.round(2 * layout.scale)),
        wordWrap: { width: 260 },
        lineSpacing: Math.max(2, Math.round(4 * layout.scale)),
      }),
    ).setOrigin(0, 0);

    const backButton = this._makeRoundedPanel(backWidth, backHeight, {
      fillColor: 0xcc493f,
      fillAlpha: 0.96,
      strokeColor: 0xffffff,
      strokeAlpha: 0.18,
      radius: Math.round(20 * layout.scale),
    });
    backButton.x = backX;
    backButton.y = buttonY;
    backButton.setVisible(false).setAlpha(0);
    backButton.setInteractive(
      new Phaser.Geom.Rectangle(-backWidth / 2, -backHeight / 2, backWidth, backHeight),
      Phaser.Geom.Rectangle.Contains,
    );

    const backLabel = scene.add.text(
      backX,
      buttonY,
      "Back",
      this._displayStyle(18, {
        min: 18,
        scale: layout.scale,
        color: TEXT_LIGHT,
        stroke: "#0a1420",
        strokeThickness: Math.max(2, Math.round(3 * layout.scale)),
      }),
    ).setOrigin(0.5).setVisible(false).setAlpha(0);

    const confirmGlow = this._makeRoundedPanel(layout.confirmGlowWidth, layout.confirmGlowHeight, {
      fillColor: 0x69dfb0,
      fillAlpha: 0.24,
      radius: Math.round(24 * layout.scale),
    });
    confirmGlow.x = confirmX;
    confirmGlow.y = buttonY;

    const confirmButton = this._makeRoundedPanel(layout.confirmButtonWidth, layout.confirmButtonHeight, {
      fillColor: 0x1f7a3f,
      fillAlpha: 0.98,
      strokeColor: 0xffffff,
      strokeAlpha: 0.18,
      radius: Math.round(22 * layout.scale),
    });
    confirmButton.x = confirmX;
    confirmButton.y = buttonY;
    confirmButton.setInteractive(
      new Phaser.Geom.Rectangle(-layout.confirmButtonWidth / 2, -layout.confirmButtonHeight / 2, layout.confirmButtonWidth, layout.confirmButtonHeight),
      Phaser.Geom.Rectangle.Contains,
    );

    const confirmLabel = scene.add.text(
      confirmX,
      buttonY,
      "Town Layout",
      this._displayStyle(20, {
        min: 18,
        scale: layout.scale,
        color: TEXT_LIGHT,
        stroke: "#0a1420",
        strokeThickness: Math.max(2, Math.round(4 * layout.scale)),
      }),
    ).setOrigin(0.5);

    confirmButton.on("pointerdown", () => {
      AudioManager.playMenuClick();
      this._confirmDraftStart();
    });
    backButton.on("pointerdown", () => {
      AudioManager.playMenuClick();
      this._setPhase("deck");
    });

    confirmButton.on("pointerover", () => {
      AudioManager.playUiHover({ volume: 0.18 });
      scene.tweens.add({
        targets: [confirmButton, confirmGlow],
        scaleX: 1.03,
        scaleY: 1.03,
        duration: 120,
        ease: "Quad.easeOut",
      });
    });

    confirmButton.on("pointerout", () => {
      scene.tweens.add({
        targets: [confirmButton, confirmGlow],
        scaleX: 1,
        scaleY: 1,
        duration: 120,
        ease: "Quad.easeOut",
      });
    });
    backButton.on("pointerover", () => {
      AudioManager.playUiHover({ volume: 0.18 });
      scene.tweens.add({
        targets: [backButton, backLabel],
        scaleX: 1.03,
        scaleY: 1.03,
        duration: 120,
        ease: "Quad.easeOut",
      });
    });
    backButton.on("pointerout", () => {
      scene.tweens.add({
        targets: [backButton, backLabel],
        scaleX: 1,
        scaleY: 1,
        duration: 120,
        ease: "Quad.easeOut",
      });
    });

    scene.tweens.add({
      targets: confirmGlow,
      alpha: { from: 0.18, to: 0.34 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    footer.add([
      shell,
      pickLabel,
      summary,
      backButton,
      backLabel,
      confirmGlow,
      confirmButton,
      confirmLabel,
    ]);

    this.container.add(footer);
    this.ui.footerShell = shell;
    this.ui.footerLabel = pickLabel;
    this.ui.footerSummary = summary;
    this.ui.confirmButton = confirmButton;
    this.ui.confirmGlow = confirmGlow;
    this.ui.confirmLabel = confirmLabel;
    this.ui.confirmX = confirmX;
    this.ui.backButton = backButton;
    this.ui.backLabel = backLabel;
    this.ui.backX = backX;
    this.ui.backButtonWidth = backWidth;
    this.ui.footerSummaryBaseX = summaryLeft;
    this._updateFooterSummaryLayout(layout.confirmButtonWidth);
  }

  _buildCardHoverBubble(width, height) {
    const bubbleWidth = clamp(Math.round(320 * this.layout.scale), 240, 340);
    const bubbleHeight = clamp(Math.round(190 * this.layout.scale), 152, 202);
    const bubble = this.scene.add.container(width / 2, height / 2)
      .setDepth(UIDEPTH + 280)
      .setVisible(false)
      .setAlpha(0);

    const shadow = this._makeRoundedPanel(bubbleWidth + 16, bubbleHeight + 16, {
      fillColor: 0x000000,
      fillAlpha: 0.34,
      radius: Math.round(28 * this.layout.scale),
    });

    const bg = this._makeRoundedPanel(bubbleWidth, bubbleHeight, {
      fillColor: 0x07131c,
      fillAlpha: 0.96,
      strokeColor: 0xffffff,
      strokeAlpha: 0.28,
      radius: Math.round(24 * this.layout.scale),
      shadowColor: 0x000000,
      shadowAlpha: 0.24,
      shadowOffsetY: Math.round(10 * this.layout.scale),
    });

    const shine = this._makeRoundedPanel(bubbleWidth - Math.round(24 * this.layout.scale), Math.round(30 * this.layout.scale), {
      fillColor: 0xffffff,
      fillAlpha: 0.08,
      radius: Math.round(16 * this.layout.scale),
    });
    shine.y = -bubbleHeight / 2 + Math.round(24 * this.layout.scale);

    const icon = this.scene.add.image(0, -bubbleHeight / 2 + Math.round(48 * this.layout.scale), "icon_house").setScale(0.9 * this.layout.scale);
    const title = this.scene.add.text(
      0,
      -bubbleHeight / 2 + Math.round(84 * this.layout.scale),
      "",
      this._displayStyle(14, {
        min: 12,
        scale: this.layout.scale,
        color: TEXT_LIGHT,
        stroke: "#08131d",
        strokeThickness: Math.max(1, Math.round(2 * this.layout.scale)),
        align: "center",
        wordWrap: { width: bubbleWidth - Math.round(34 * this.layout.scale) },
      }),
    ).setOrigin(0.5);

    const desc = this.scene.add.text(
      0,
      Math.round(30 * this.layout.scale),
      "",
      this._displayStyle(10, {
        min: 10,
        scale: this.layout.scale,
        color: TEXT_MUTED,
        stroke: "#08131d",
        strokeThickness: Math.max(1, Math.round(2 * this.layout.scale)),
        align: "center",
        wordWrap: { width: bubbleWidth - Math.round(44 * this.layout.scale) },
        lineSpacing: Math.max(2, Math.round(4 * this.layout.scale)),
      }),
    ).setOrigin(0.5);

    bubble.add([shadow, bg, shine, icon, title, desc]);
    this.container.add(bubble);

    this.ui.cardHoverBubble = {
      container: bubble,
      bg,
      icon,
      title,
      desc,
      width: bubbleWidth,
      height: bubbleHeight,
    };
  }

  _showCardHoverBubble(card, tint, x, y) {
    const bubble = this.ui.cardHoverBubble;
    if (!bubble) return;

    this._redrawPanel(bubble.bg, bubble.width, bubble.height, {
      fillColor: 0x07131c,
      fillAlpha: 0.98,
      strokeColor: tint,
      strokeAlpha: 0.9,
      radius: Math.round(24 * this.layout.scale),
      shadowColor: 0x000000,
      shadowAlpha: 0.24,
      shadowOffsetY: Math.round(10 * this.layout.scale),
    });

    bubble.icon.setTexture(card.image).setScale(0.9 * this.layout.scale);
    bubble.title.setText(card.name);
    bubble.desc.setText(card.text);

    bubble.container.setPosition(x, y);
    this.scene.tweens.killTweensOf(bubble.container);
    bubble.container.setVisible(true);
    bubble.container.setAlpha(0);
    bubble.container.setScale(0.96);
    bubble.container.y = y + Math.round(8 * this.layout.scale);
    this.scene.tweens.add({
      targets: bubble.container,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      y,
      duration: 120,
      ease: "Quad.easeOut",
    });
  }

  _hideCardHoverBubble() {
    const bubble = this.ui.cardHoverBubble;
    if (!bubble) return;
    this.scene.tweens.killTweensOf(bubble.container);
    this.scene.tweens.add({
      targets: bubble.container,
      alpha: 0,
      duration: 90,
      ease: "Quad.easeOut",
      onComplete: () => bubble.container.setVisible(false),
    });
  }

  _makeRoundedPanel(width, height, opts = {}) {
    const graphics = this.scene.add.graphics();
    this._redrawPanel(graphics, width, height, opts);
    return graphics;
  }

  _redrawPanel(graphics, width, height, opts = {}) {
    graphics.clear();
    const radius = opts.radius ?? 24;
    const left = -width / 2;
    const top = -height / 2;

    if (opts.shadowAlpha) {
      graphics.fillStyle(opts.shadowColor ?? 0x000000, opts.shadowAlpha);
      graphics.fillRoundedRect(
        left,
        top + (opts.shadowOffsetY ?? 10),
        width,
        height,
        radius,
      );
    }

    graphics.fillStyle(opts.fillColor ?? 0xffffff, opts.fillAlpha ?? 1);
    graphics.fillRoundedRect(left, top, width, height, radius);

    if (opts.strokeAlpha) {
      graphics.lineStyle(opts.strokeWidth ?? 2, opts.strokeColor ?? 0xffffff, opts.strokeAlpha);
      graphics.strokeRoundedRect(left, top, width, height, radius);
    }

    return graphics;
  }

  _refreshUI() {
    const selectedDeck = this.state.getSelectedDeck();
    const input = this._getTeamNameInputElement();
    const isLayout = this.phase === "layout";

    if (input && input.value !== this.state.teamName) {
      this.teamNameInput.setValue(this.state.teamName);
    }

    if (this._teamNameInvalid && this.state.teamName.trim()) {
      this._setTeamNameValidationState(false);
    }

    this.scene.events.emit("draftTeamNameChanged", this.state.teamName);

    if (this.ui.headerSubtitle) {
      this.ui.headerSubtitle.setText(
        isLayout
          ? ""
          : "Pick one starter deck.",
      );
    }
    if (this.ui.headerTitle) {
      this.ui.headerTitle.setText(isLayout ? "Town Layout" : "Founding Draft");
    }

    if (this.ui.footerSummary) {
      this.ui.footerSummary.setText(
        `${selectedDeck?.summary ?? ""} ${selectedDeck?.tradeoff ? `Tradeoff: ${selectedDeck.tradeoff}` : ""}`.trim(),
      );
    }

    if (this.ui.confirmLabel) {
      this.ui.confirmLabel.setText(
        isLayout
          ? "Start"
          : "Town Layout",
      );
    }

    const accent = isLayout ? 0x1f7a3f : hexToColorInt(selectedDeck?.accent, 0x2d88ff);
    const confirmWidth = clamp(
      Math.max(this.layout.confirmButtonWidth, Math.round((this.ui.confirmLabel?.width ?? 0) + (70 * this.layout.scale))),
      this.layout.confirmButtonWidth,
      Math.min(this.layout.width - Math.round(90 * this.layout.scale), 320),
    );
    const confirmGlowWidth = confirmWidth + Math.round(16 * this.layout.scale);

    if (this.ui.confirmGlow) {
      this._redrawPanel(this.ui.confirmGlow, confirmGlowWidth, this.layout.confirmGlowHeight, {
        fillColor: accent,
        fillAlpha: 0.24,
        radius: 24,
      });
    }

    if (this.ui.confirmButton) {
      this._redrawPanel(this.ui.confirmButton, confirmWidth, this.layout.confirmButtonHeight, {
        fillColor: accent,
        fillAlpha: 0.98,
        strokeColor: 0xffffff,
        strokeAlpha: 0.18,
        radius: 22,
      });
      this.ui.confirmButton.setInteractive(
        new Phaser.Geom.Rectangle(-confirmWidth / 2, -this.layout.confirmButtonHeight / 2, confirmWidth, this.layout.confirmButtonHeight),
        Phaser.Geom.Rectangle.Contains,
      );
    }

    if (this.ui.backButton && this.ui.backLabel) {
      this.ui.backButton.setVisible(isLayout);
      this.ui.backLabel.setVisible(isLayout);
      this.ui.backButton.setAlpha(isLayout ? 1 : 0);
      this.ui.backLabel.setAlpha(isLayout ? 1 : 0);
    }

    if (this.ui.footerShell && this.ui.footerLabel && this.ui.footerSummary) {
      this.ui.footerShell.setVisible(!isLayout);
      this.ui.footerLabel.setVisible(!isLayout);
      this.ui.footerSummary.setVisible(!isLayout);
      this.ui.footerShell.setAlpha(isLayout ? 0 : 1);
      this.ui.footerLabel.setAlpha(isLayout ? 0 : 1);
      this.ui.footerSummary.setAlpha(isLayout ? 0 : 1);
    }

    this._updateFooterSummaryLayout(confirmWidth);

    if (this.ui.layoutInfoBody) {
      this.ui.layoutInfoBody.setText(this._getLayoutInfoBodyText());
    }
    for (const entry of this.ui.layoutLegendRefs ?? []) {
      entry.count.setText(`x${this._countPlacedBuildings(entry.types)}`);
    }

    for (const ref of this.ui.deckRefs ?? []) {
      for (const entry of ref.resourceRefs ?? []) {
        entry.value.setText(String(ref.deck.resources?.[entry.key] ?? 0));
      }
      this._syncDeckVisual(ref);
    }
  }

  _syncDeckVisual(ref) {
    const selectedDeckId = this.state.selectedDeckId;
    const isSelected = ref.deck.id === selectedDeckId;
    const accent = ref.accent;
    const scale = isSelected ? 1.02 : ref.isHovered ? 1.015 : 1;
    const targetY = ref.baseY - (isSelected ? 12 : ref.isHovered ? 6 : 0);

    this._redrawPanel(ref.glow, ref.hitArea.width + 10, ref.hitArea.height + 10, {
      fillColor: accent,
      fillAlpha: isSelected ? 0.2 : ref.isHovered ? 0.14 : 0.08,
      radius: 34,
      shadowColor: accent,
      shadowAlpha: isSelected ? 0.18 : 0.1,
      shadowOffsetY: 0,
    });

    this._redrawPanel(ref.panel, ref.hitArea.width, ref.hitArea.height, {
      fillColor: BASE_DECK_FILL,
      fillAlpha: isSelected ? 0.88 : 0.78,
      strokeColor: isSelected ? accent : BASE_DECK_STROKE,
      strokeAlpha: isSelected ? 0.76 : ref.isHovered ? 0.3 : 0.18,
      radius: 32,
      shadowColor: 0x071116,
      shadowAlpha: isSelected ? 0.34 : 0.3,
      shadowOffsetY: 18,
    });

    this._redrawPanel(ref.selectPill, ref.selectPillWidth, ref.selectPillHeight, {
      fillColor: isSelected ? accent : hexToColorInt(ref.deck.accentDark, accent),
      fillAlpha: isSelected ? 1 : 0.8,
      radius: Math.round(17 * ref.contentScale),
    });
    ref.selectPill.x = 0;
    ref.selectPill.y = ref.selectPillY;

    ref.selectLabel.setText(isSelected ? "Selected" : "Starter Deck");
    ref.summary.setColor(isSelected ? TEXT_LIGHT : TEXT_MUTED);

    this.scene.tweens.killTweensOf(ref.container);
    this.scene.tweens.add({
      targets: ref.container,
      scaleX: scale,
      scaleY: scale,
      y: targetY,
      duration: 150,
      ease: "Quad.easeOut",
    });
  }
}
