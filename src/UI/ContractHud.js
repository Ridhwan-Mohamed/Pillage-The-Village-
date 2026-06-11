import { UIDEPTH, showAlert } from "../constants.js";
import { PRESSURE } from "../parcel_system/ParcelConfig.js";
import { StageState } from "../parcelController/StageState.js";
import { Teams } from "../Teams.js";
import { makeButton } from "../parcelSpawn/ui/makeButton.js";
import { formatPermitCostText, getContractPermitCost } from "../permitSystem.js";
import { hasDemoCompleted, hasStoreUnlock, STORE_UNLOCK_KEYS } from "../parcel_system/StoreUnlockSystem.js";
import { getContractMoneyCost } from "../balance/GameBalance.js";
import {
  getSlotFavorConfig,
  getSlotFavorIconText,
  getSlotFavorShortLabel,
  formatFavorDurationMs,
} from "../parcel_system/SlotFavorSystem.js";
import { clampMilitiaTier, getMilitiaTierConfig, getMilitiaTierLayout } from "../parcel_system/MilitiaTierConfig.js";

const SLOT_ORDER = ["N", "E", "S", "W"];
const SLOT_LABELS = {
  N: "NORTH",
  S: "SOUTH",
  E: "EAST",
  W: "WEST",
};
const FORT_ICON = "\u265B";
const FORT_TOWER_ICON = "\u265C";

const CONTRACT_DEFS = {
  FOREST: {
    emoji: "🌲",
    title: "Forest Contract",
    color: 0x166534,
    lines: (scene) => [
      "Spawns a forest parcel.",
      "Timer-based resource run.",
    ],
  },
  ROCK: {
    emoji: "🪨",
    title: "Rock Contract",
    color: 0x475569,
    lines: (scene) => [
      "Spawns a rock parcel.",
      "Timer-based resource run.",
    ],
  },
  PRESSURE: {
    emoji: "💀",
    title: "Pressure Contract",
    color: 0x991b1b,
  },
  MARKET: {
    emoji: "🏪",
    title: "Market Contract",
    color: 0x14384c,
    lines: (scene) => [
      "Storefront with various goods.",
    ],
  },
  FARM: {
    emoji: "🌾",
    title: "Field Contract",
    color: 0x15803d,
    lines: (scene) => [
      "Field Parcel containing seeds and berry bushes.",
    ],
  },
  MILITIA: {
    emoji: "🛡",
    title: "Militia Contract",
    color: 0x0f172a,
    lines: (scene) => [
      "Temporary defensive structure.",
    ],
  },
  LOCKED_MILITIA: {
    emoji: "🔒",
    title: "Locked",
    color: 0x374151,
    lines: () => [
      "Unlocks at Town XP Level 3.",
      "Militia parcel is not available yet.",
    ],
  },
};

const BUYABLE_TYPES = ["FOREST", "ROCK", "PRESSURE", "MARKET", "FARM"];

function fmtMMSS(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function formatBonusDurationShort(ms = 0) {
  const totalSeconds = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0 && seconds > 0) return `${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function makeTimerBadge({
  text = "",
  textColor = "#ffffff",
  fillColor = 0x0b1320,
  fillAlpha = 0.92,
  strokeColor = 0xb8ecff,
  strokeAlpha = 0.26,
  fontSize = 12,
  pulse = null,
  minWidth = 36,
} = {}) {
  return {
    timerText: text,
    timerColor: textColor,
    timerBgFillColor: fillColor,
    timerBgFillAlpha: fillAlpha,
    timerBgStrokeColor: strokeColor,
    timerBgStrokeAlpha: strokeAlpha,
    timerFontSize: fontSize,
    timerPulse: pulse,
    timerBadgeMinWidth: minWidth,
  };
}

export class ContractHud {
  constructor(scene) {
    this.scene = scene;
    this.world = scene.worldScene;
    this.popupW = 280;
    this.popupH = 262;
    this.root = scene.add.container(0, 0).setDepth(UIDEPTH + 5);
    this.squares = new Map();
    this.popupObjects = [];
    this.popupButtonRefs = new Map();
    this.popupState = null;
    this._popupTween = null;
    this._clusterTween = null;
    this._hudVisible = false;

    this._buildSquares();
    this._buildPopup();
    this._layout();
    this._refreshSquares();
    this._hudVisible = this.world?.zoomMixer?.mode !== "overview";
    this.root.setVisible(this._hudVisible);
    if (this._hudVisible) this._playSquareClusterIntro();

    this._onResize = () => this._layout();
    this.scene.scale.on("resize", this._onResize);
  }

  destroy() {
    this._stopPopupTween();
    this._stopClusterTween();
    this.squares.forEach((_, slotId) => {
      this._stopSquareTween(slotId);
      this._stopSquareTimerPulse(slotId);
    });
    this.scene.scale.off("resize", this._onResize);
    this.root?.destroy(true);
  }

  update() {
    const isDetailed = this.world?.zoomMixer?.mode !== "overview";
    if (isDetailed !== this._hudVisible) {
      this._hudVisible = isDetailed;
      if (isDetailed) this._showHudCluster();
      else this._hideHudCluster();
    }
    if (!isDetailed) {
      return;
    }

    this._refreshSquares();
    this._refreshPopup();
  }

  focusSlot(slotId) {
    if (!this._hudVisible || !slotId) return false;
    if (!this._canPerformTutorialAction("contractHud.slot", { slotId })) return false;
    const status = this._getSlotStatus(slotId);
    if (!status) return false;
    if (status.kind === "locked-empty") {
      this._showParcelLockedMessage();
      return false;
    }
    if (status.kind === "empty") {
      this._openChooser(slotId);
      this._notifyTutorialAction("contractHud.slot", { slotId });
      return true;
    }
    this._openSummary(slotId);
    this._notifyTutorialAction("contractHud.slot", { slotId });
    return true;
  }

  setExternalHover(slotId, hovered = false) {
    const slot = this.squares.get(slotId);
    if (!slot) return;
    slot.externalHovered = !!hovered;
    this._applySquareVisual(slotId, this._getSlotStatus(slotId));
  }

  getTutorialTargetBounds(key) {
    if (!key) return null;
    if (key.startsWith("slot:")) {
      const slotId = key.slice("slot:".length);
      const slot = this.squares.get(slotId);
      if (!slot?.group || !slot?.zone) return null;
      return this._boundsFromLocal(slot.group, slot.zone.x, slot.zone.y, slot.zone.width, slot.zone.height);
    }

    if (key.startsWith("button:")) {
      const buttonKey = key.slice("button:".length);
      const button = this.popupButtonRefs.get(buttonKey);
      if (!button) return null;
      return this._boundsFromLocal(button, 0, 0, button.tutorialW || button.width || 90, button.tutorialH || button.height || 32);
    }

    return null;
  }

  _boundsFromLocal(obj, localX = 0, localY = 0, width = 1, height = 1) {
    const matrix = obj?.getWorldTransformMatrix?.();
    if (!matrix) {
      return {
        x: (obj?.x ?? 0) + localX - width / 2,
        y: (obj?.y ?? 0) + localY - height / 2,
        width,
        height,
      };
    }

    const point = matrix.transformPoint
      ? matrix.transformPoint(localX, localY)
      : { x: (matrix.tx ?? 0) + localX, y: (matrix.ty ?? 0) + localY };
    const scaleX = Math.max(0.0001, Math.hypot(matrix.a ?? 1, matrix.b ?? 0));
    const scaleY = Math.max(0.0001, Math.hypot(matrix.c ?? 0, matrix.d ?? 1));
    const w = width * scaleX;
    const h = height * scaleY;
    return {
      x: point.x - w / 2,
      y: point.y - h / 2,
      width: w,
      height: h,
    };
  }

  _getTutorialManager() {
    return this.world?.tutorialManager || this.scene?.tutorialManager || null;
  }

  _canPerformTutorialAction(action, payload = {}) {
    const tutorial = this._getTutorialManager();
    return !tutorial || tutorial.canPerformAction?.(action, payload) !== false;
  }

  _notifyTutorialAction(action, payload = {}) {
    this._getTutorialManager()?.notifyAction?.(action, payload);
  }

  _tryClosePopup() {
    if (!this._canPerformTutorialAction("contractHud.close")) return;
    this.closePopup();
  }

  _tryBackToChooser(slotId) {
    if (!this._canPerformTutorialAction("contractHud.back", { slotId })) return;
    this._openChooser(slotId);
  }

  _getWorldNowMs() {
    return Number(this.world?.getSimulationNow?.() ?? this.world?.simNowMs ?? 0);
  }

  _getPhaseInfo() {
    return this.world?.clock?.getPhaseInfo?.() ?? null;
  }

  _getTownLevel() {
    return Math.max(1, Number(this.world?.getTownXpSnapshot?.()?.level || 1));
  }

  _isMilitiaUnlocked() {
    return hasStoreUnlock(STORE_UNLOCK_KEYS.militiaParcel);
  }

  _canAccessMilitia() {
    return this._isMilitiaUnlocked() && (this._getTownLevel() >= 3 || hasDemoCompleted());
  }

  _showMilitiaLockedMessage() {
    showAlert(this.scene, "🔒 Unlocks at Town XP Level 3", "#ffe08a");
  }

  _getBuyableTypes() {
    const base = ["FOREST", "ROCK", "PRESSURE", "MARKET", "FARM"];
    if (this._canAccessMilitia()) {
      base.push("MILITIA");
    } else {
      base.push("LOCKED_MILITIA");
    }
    return base;
  }
  _canBuyContracts() {
    return this.world?.clock?.canBuyParcels?.() ?? true;
  }

  _showParcelLockedMessage() {
    showAlert(this.scene, "Parcel contracts stay open during every phase.", "#a7f3d0");
  }

  _getPurchaseContext(slotId, type, difficulty = 1) {
    const pm = this.world?.parcelManager;
    if (!pm?.getContractPurchaseContext) {
      return {
        favor: null,
        moneyCost: getContractMoneyCost(this.world ?? this.scene, type, difficulty),
        durationMs: 0,
        completionBonusMoney: 0,
      };
    }
    return pm.getContractPurchaseContext(slotId, type, difficulty);
  }

  _getSlotFavor(slotId) {
    return this.world?.parcelManager?.getSlotFavor?.(slotId) ?? null;
  }

  _getSlotFavorTone(favor = null) {
    const config = getSlotFavorConfig(favor);
    if (config?.kind === "discount") {
      return {
        strokeColor: 0xf87171,
        fillColor: 0x301116,
        timerColor: "#fca5a5",
        bodyColor: "#ffd9d9",
        subtitleColor: "#ff9b9b",
        buttonTextColor: "#ffb4b4",
      };
    }
    if (config?.kind === "extended") {
      return {
        strokeColor: 0x60a5fa,
        fillColor: 0x102744,
        timerColor: "#93c5fd",
        bodyColor: "#dcebff",
        subtitleColor: "#9ed0ff",
        buttonTextColor: "#dcebff",
      };
    }
    if (config?.kind === "completion") {
      return {
        strokeColor: 0xfbbf24,
        fillColor: 0x35260d,
        timerColor: "#fcd34d",
        bodyColor: "#fff0c4",
        subtitleColor: "#ffd776",
        buttonTextColor: "#fff0c4",
      };
    }
    return {
      strokeColor: 0xdbeafe,
      fillColor: 0x0b1220,
      timerColor: "#ffffff",
      bodyColor: "#eef7ff",
      subtitleColor: "#dbeafe",
      buttonTextColor: "#ffffff",
    };
  }

  _getSlotFavorHeadline(slotId, favor = null) {
    const slotLabel = String(SLOT_LABELS[slotId] || "THIS").toLowerCase();
    const config = getSlotFavorConfig(favor);
    if (!config) return "";
    if (config.kind === "discount") {
      const percentOff = Math.round((1 - Math.max(0, Number(config.moneyMultiplier || 1))) * 100);
      return `${percentOff}% off all ${slotLabel} contracts.`;
    }
    if (config.kind === "extended") {
      return `All parcels last ${formatBonusDurationShort(config.durationBonusMs)} longer for ${slotLabel} contracts.`;
    }
    if (config.kind === "completion") {
      return `Completed ${slotLabel} contracts pay an extra cash bonus.`;
    }
    return "";
  }

  refreshForParcelStateChange() {
    this._refreshSquares();
    if (this.popup.visible && this.popupState) {
      this._renderPopup();
    }
  }

  _getNorthFortArrival() {
    return this.world?.getNorthFortArrivalInfo?.() ?? null;
  }

  _stopPopupTween() {
    if (this.popup) this.scene.tweens.killTweensOf(this.popup);
    this._popupTween = null;
  }

  _stopSquareTween(slotId) {
    const slot = this.squares.get(slotId);
    if (!slot?.group) return;
    this.scene.tweens.killTweensOf(slot.group);
  }

  _stopSquareTimerPulse(slotId) {
    const slot = this.squares.get(slotId);
    if (!slot) return;
    if (slot.timer) {
      this.scene.tweens.killTweensOf(slot.timer);
      slot.timer.setAlpha(1);
      slot.timer.setScale(1);
    }
    if (slot.timerBg) {
      this.scene.tweens.killTweensOf(slot.timerBg);
      slot.timerBg.setAlpha(1);
      slot.timerBg.setScale(1);
    }
    slot.timerPulseMode = null;
  }

  _setSquareTimerPulse(slotId, mode = null) {
    const slot = this.squares.get(slotId);
    if (!slot?.timer || !slot?.timerBg) return;
    const nextMode = mode || null;
    if (slot.timerPulseMode === nextMode) return;

    this._stopSquareTimerPulse(slotId);
    if (!nextMode) return;
    slot.timerPulseMode = nextMode;

    if (nextMode === "danger") {
      this.scene.tweens.add({
        targets: [slot.timerBg, slot.timer],
        alpha: 0.38,
        duration: 220,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      return;
    }

    if (nextMode === "favor") {
      this.scene.tweens.add({
        targets: [slot.timerBg, slot.timer],
        scaleX: 1.06,
        scaleY: 1.06,
        duration: 720,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  _stopClusterTween() {
    const groups = SLOT_ORDER.map((slotId) => this.squares.get(slotId)?.group).filter(Boolean);
    if (groups.length) this.scene.tweens.killTweensOf(groups);
    this._clusterTween = null;
  }

  _showHudCluster() {
    this.root.setVisible(true);
    this._playSquareClusterIntro();
  }

  _hideHudCluster() {
    this.closePopup(false);
    this._stopClusterTween();
    const groups = SLOT_ORDER.map((slotId) => this.squares.get(slotId)?.group).filter(Boolean);
    if (!groups.length) {
      this.root.setVisible(false);
      return;
    }

    let completed = 0;
    groups.forEach((group, index) => {
      this.scene.tweens.add({
        targets: group,
        scaleX: 0.74,
        scaleY: 0.74,
        alpha: 0,
        duration: 120,
        delay: index * 24,
        ease: "Back.easeIn",
        onComplete: () => {
          completed += 1;
          if (completed < groups.length) return;
          groups.forEach((entry) => {
            entry.setScale(1);
            entry.setAlpha(1);
          });
          this.root.setVisible(false);
          this._clusterTween = null;
        },
      });
    });
  }

  _playSquareClusterIntro() {
    this._stopClusterTween();
    this.root.setVisible(true);
    SLOT_ORDER.forEach((slotId, index) => {
      const slot = this.squares.get(slotId);
      if (!slot?.group) return;
      slot.group.setScale(0.72);
      slot.group.setAlpha(0);
      this.scene.tweens.add({
        targets: slot.group,
        scaleX: 1,
        scaleY: 1,
        alpha: 1,
        duration: 220,
        delay: index * 45,
        ease: "Back.easeOut",
      });
    });
  }

  _animateSquare(slotId, mode = "open") {
    const slot = this.squares.get(slotId);
    if (!slot?.group) return;

    const config = mode === "buy"
      ? { scale: 1.18, alpha: 1, duration: 150, hold: 50, ease: "Back.easeOut" }
      : mode === "close"
        ? { scale: 0.82, alpha: 0.74, duration: 110, hold: 10, ease: "Quad.easeInOut" }
        : { scale: 1.12, alpha: 1, duration: 130, hold: 24, ease: "Back.easeOut" };

    this._stopSquareTween(slotId);
    this.scene.tweens.add({
      targets: slot.group,
      scaleX: config.scale,
      scaleY: config.scale,
      alpha: config.alpha,
      duration: config.duration,
      hold: config.hold,
      yoyo: true,
      ease: config.ease,
      onComplete: () => {
        slot.group.setScale(1);
        slot.group.setAlpha(1);
      },
    });
  }

  _getPopupAnchorSlotId(state = this.popupState) {
    if (!state) return null;
    return state.slotId ?? null;
  }

  _animatePopupOpen(slotId = null) {
    this._stopPopupTween();
    this.popup.setVisible(true);
    this.popup.setScale(0.88);
    this.popup.setAlpha(0);
    if (slotId) this._animateSquare(slotId, "open");
    this._popupTween = this.scene.tweens.add({
      targets: this.popup,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 180,
      ease: "Back.easeOut",
      onComplete: () => {
        this._popupTween = null;
      },
    });
  }

  _buildSquares() {
    for (const slotId of SLOT_ORDER) {
      const group = this.scene.add.container(0, 0);
      const defaultIconText = "+";
      const defaultTimerText = "BUY";
      const label = this.scene.add.text(0, 0, SLOT_LABELS[slotId], {
        fontFamily: "Bungee",
        fontSize: "16px",
        color: "#f8f6ff",
        stroke: "#000000",
        strokeThickness: 4,
      }).setOrigin(0.5, 0);

      const frame = this.scene.add.graphics();
      frame.setPosition(0, 0);

      const zone = this.scene.add.zone(0, 34, 56, 56).setInteractive({ useHandCursor: true });

      const icon = this.scene.add.text(0, 34, "+", {
        fontFamily: "Bungee",
        fontSize: "24px",
        color: "#ffffff",
        stroke: "#001018",
        strokeThickness: 5,
        align: "center",
      }).setOrigin(0.5);

      const timerBg = this.scene.add.graphics().setVisible(false);

      const timer = this.scene.add.text(0, 66, "BUY", {
        fontFamily: "Bungee",
        fontSize: "12px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
        align: "center",
      }).setOrigin(0.5, 0);

      zone.on("pointerover", () => {
        const slot = this.squares.get(slotId);
        if (!slot) return;
        slot.hovered = true;
        this._setSquareHoverScale(slotId, true);
        this._applySquareVisual(slotId, this._getSlotStatus(slotId));
      });
      zone.on("pointerout", () => {
        const slot = this.squares.get(slotId);
        if (!slot) return;
        slot.hovered = false;
        slot.pressed = false;
        this._setSquareHoverScale(slotId, false);
        this._applySquareVisual(slotId, this._getSlotStatus(slotId));
      });
      zone.on("pointerdown", () => {
        const slot = this.squares.get(slotId);
        if (!slot) return;
        slot.pressed = true;
        this._applySquareVisual(slotId, this._getSlotStatus(slotId));
      });
      zone.on("pointerup", () => {
        const slot = this.squares.get(slotId);
        if (!slot) return;
        slot.pressed = false;
        this._setSquareHoverScale(slotId, !!slot.hovered);
        this._applySquareVisual(slotId, this._getSlotStatus(slotId));
        this._onSquareClicked(slotId);
      });

      group.add([frame, label, icon, timerBg, timer, zone]);
      this.root.add(group);
      this.squares.set(slotId, {
        group,
        label,
        frame,
        icon,
        timerBg,
        timer,
        zone,
        hovered: false,
        pressed: false,
        externalHovered: false,
        timerPulseMode: null,
      });
      icon.setText(defaultIconText);
      timer.setText(defaultTimerText);
    }
  }

  _setSquareHoverScale(slotId, hovered = false) {
    const slot = this.squares.get(slotId);
    if (!slot?.group) return;
    this.scene.tweens.killTweensOf(slot.group);
    this.scene.tweens.add({
      targets: slot.group,
      scaleX: hovered ? 1.12 : 1,
      scaleY: hovered ? 1.12 : 1,
      duration: 110,
      ease: "Sine.Out",
    });
  }

  _buildPopup() {
    this.popup = this.scene.add.container(0, 0).setVisible(false);

    this.popupFrame = this.scene.add.graphics();

    this.popupTitle = this.scene.add.text(18, 14, "", {
      fontFamily: "Bungee",
      fontSize: "18px",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 4,
      wordWrap: { width: 206 },
    }).setOrigin(0, 0);

    this.popupSubtitle = this.scene.add.text(18, 42, "", {
      fontFamily: "Bungee",
      fontSize: "10px",
      color: "#dbeafe",
      stroke: "#000000",
      strokeThickness: 3,
      lineSpacing: 4,
      wordWrap: { width: 226 },
    }).setOrigin(0, 0).setVisible(false);

    this.popupBody = this.scene.add.text(18, 74, "", {
      fontFamily: "Bungee",
      fontSize: "12px",
      color: "#f8fbff",
      stroke: "#000000",
      strokeThickness: 3,
      lineSpacing: 6,
      wordWrap: { width: 244 },
    }).setOrigin(0, 0);

    this.popup.add([this.popupFrame, this.popupTitle, this.popupSubtitle, this.popupBody]);
    this.root.add(this.popup);
    this._setPopupTheme();
  }

  _setPopupTheme({
    bgColor = 0x101827,
    bgAlpha = 0.82,
    strokeColor = 0xffffff,
    titleColor = "#ffffff",
    bodyColor = "#f8fbff",
    subtitleColor = "#dbeafe",
  } = {}) {
    this.popupFrame.clear();
    this.popupFrame.fillStyle(bgColor, bgAlpha);
    this.popupFrame.fillRoundedRect(0, 0, this.popupW, this.popupH, 16);
    this.popupFrame.lineStyle(2, strokeColor, 0.40);
    this.popupFrame.strokeRoundedRect(0, 0, this.popupW, this.popupH, 16);
    this.popupTitle.setColor(titleColor);
    this.popupBody.setColor(bodyColor);
    this.popupSubtitle.setColor(subtitleColor);
  }

  _setPopupSubtitle(text = "", color = null, fontSize = "10px") {
    const next = String(text || "").trim();
    this.popupSubtitle.setFontSize(fontSize);
    this.popupSubtitle.setText(next);
    this.popupSubtitle.setVisible(!!next);
    if (color) this.popupSubtitle.setColor(color);
    this.popupBody.setPosition(18, next ? 74 : 52);
  }

  _layout() {
    const stackX = 46;
    const xpBottom = Math.round(
      (this.scene?.townXpHud?.y ?? 72) + ((this.scene?.townXpHud?.panelHeight ?? 60) / 2)
    );
    const topY = Math.max(132, xpBottom + 16);
    const gap = 94;

    SLOT_ORDER.forEach((slotId, index) => {
      const x = stackX;
      const y = topY + index * gap;
      const slot = this.squares.get(slotId);
      if (!slot) return;
      slot.group.setPosition(x, y);
    });

    if (this.popupState?.slotId) {
      this._positionPopupFor(this.popupState.slotId);
    } else if (this.popupState?.kind === "fort") {
      this._positionPopupFor("N");
    }
  }

  _positionPopupFor(slotId) {
    const slot = this.squares.get(slotId);
    if (!slot) return;
    const x = clamp(slot.group.x + 20, 120, Math.max(160, this.scene.scale.width - 150));
    const y = clamp(slot.group.y - 12, 52, Math.max(52, this.scene.scale.height - (this.popupH + 20)));
    this.popup.setPosition(x, y);
  }

  _refreshSquares() {
    for (const slotId of SLOT_ORDER) {
      this._applySquareVisual(slotId, this._getSlotStatus(slotId));
    }
  }

  _applySquareVisual(slotId, status) {
    const slot = this.squares.get(slotId);
    if (!slot || !status) return;

    const fillAlpha = status.fillAlpha ?? 0.94;
    const isHovered = !!slot.hovered || !!slot.externalHovered;
    const strokeAlpha = slot.pressed ? 0.95 : isHovered ? 0.72 : status.kind === "empty" ? 0.34 : 0.55;
    const iconColor = status.iconColor ?? "#ffffff";
    const hasFavorTag = status.kind === "empty" && !!status.favor;
    const timerText = status.timerText ?? "";
    const timerVisible = !!timerText;
    const timerY = Number(status.timerY ?? (hasFavorTag ? 62 : 66));
    const timerFontSize = Number(status.timerFontSize ?? 12);

    slot.frame.clear();
    if (fillAlpha > 0) {
      const boostedFill = isHovered ? Math.min(fillAlpha + 0.08, 1) : fillAlpha;
      slot.frame.fillStyle(status.fillColor ?? 0x111827, boostedFill);
      slot.frame.fillRoundedRect(-28, 6, 56, 56, 12);
    }
    slot.frame.lineStyle(status.kind === "empty" ? 2 : 3, status.strokeColor ?? 0xffffff, strokeAlpha);
    slot.frame.strokeRoundedRect(-28, 6, 56, 56, 12);

    slot.icon.setText(status.iconText);
    slot.icon.setColor(iconColor);
    slot.icon.setFontSize(status.iconSize ?? 24);

    slot.timer.setText(timerText);
    slot.timer.setVisible(timerVisible);
    slot.timer.setColor(status.timerColor ?? "#ffffff");
    slot.timer.setFontSize(timerFontSize);
    slot.timer.setY(timerY);

    slot.timerBg.clear();
    slot.timerBg.setVisible(timerVisible);
    if (!timerVisible) {
      this._stopSquareTimerPulse(slotId);
      return;
    }

    const badgePadX = Number(status.timerBadgePadX ?? 8);
    const badgePadY = Number(status.timerBadgePadY ?? 3);
    const badgeWidth = Math.max(
      Number(status.timerBadgeMinWidth ?? 36),
      Math.round(Number(slot.timer.width || 0) + badgePadX * 2)
    );
    const badgeHeight = Math.max(16, Math.round(Number(slot.timer.height || 10) + badgePadY * 2));
    const badgeY = Math.round(timerY - 1);
    const badgeRadius = Math.max(8, Math.round(badgeHeight / 2));

    slot.timerBg.fillStyle(status.timerBgFillColor ?? 0x0b1320, status.timerBgFillAlpha ?? 0.92);
    slot.timerBg.fillRoundedRect(-badgeWidth / 2, badgeY, badgeWidth, badgeHeight, badgeRadius);
    slot.timerBg.lineStyle(1.5, status.timerBgStrokeColor ?? 0xb8ecff, status.timerBgStrokeAlpha ?? 0.26);
    slot.timerBg.strokeRoundedRect(-badgeWidth / 2, badgeY, badgeWidth, badgeHeight, badgeRadius);

    this._setSquareTimerPulse(slotId, status.timerPulse ?? (hasFavorTag ? "favor" : null));
  }

  _getSlotStatus(slotId) {
    const active = this._getActiveContract(slotId);
    if (active) {
      const lifecycle = active.uiLifecycle || "active";
      if (active.type === "PRESSURE") {
        const timerStyle = lifecycle === "starting"
          ? makeTimerBadge({
            text: "STARTING",
            textColor: "#e0f2fe",
            fillColor: 0x113248,
            strokeColor: 0x7dd3fc,
            fontSize: 10,
            minWidth: 64,
          })
          : lifecycle === "leaving"
            ? makeTimerBadge({
              text: "LEAVING",
              textColor: "#fff1f2",
              fillColor: 0x5a1823,
              strokeColor: 0xfb7185,
              fontSize: 10,
              pulse: "danger",
              minWidth: 58,
            })
            : makeTimerBadge({
              text: "LIVE",
              textColor: "#ffe4e6",
              fillColor: 0x4b1419,
              strokeColor: 0xf87171,
              fontSize: 11,
              minWidth: 40,
            });
        return {
          kind: "pressure-live",
          iconText: "💀".repeat(Math.max(1, active.difficulty || 1)),
          fillColor: 0x351013,
          strokeColor: 0xf87171,
          iconSize: 18,
          fillAlpha: 0.94,
          contract: active,
          ...timerStyle,
        };
      }

      const def = CONTRACT_DEFS[active.type] || CONTRACT_DEFS.FOREST;
      const remainingMs = Math.max(0, Number(active.expireAt || 0) - this._getWorldNowMs());
      const timerStyle = lifecycle === "starting"
        ? makeTimerBadge({
          text: "STARTING",
          textColor: "#e0f2fe",
          fillColor: 0x113248,
          strokeColor: 0x7dd3fc,
          fontSize: 10,
          minWidth: 64,
        })
        : lifecycle === "leaving"
          ? makeTimerBadge({
            text: "LEAVING",
            textColor: "#fff1f2",
            fillColor: 0x5a1823,
            strokeColor: 0xfb7185,
            fontSize: 10,
            pulse: "danger",
            minWidth: 58,
          })
          : remainingMs <= 10_000
            ? makeTimerBadge({
              text: fmtMMSS(remainingMs),
              textColor: "#fff1f2",
              fillColor: 0x5a1823,
              strokeColor: 0xfb7185,
              pulse: "danger",
              minWidth: 42,
            })
            : makeTimerBadge({
              text: fmtMMSS(remainingMs),
              textColor: "#ffffff",
              fillColor: 0x0b1320,
              strokeColor: 0xb8ecff,
              minWidth: 42,
            });
      return {
        kind: "active",
        iconText: def.emoji,
        fillColor: 0x101827,
        strokeColor: 0xffffff,
        iconSize: 24,
        fillAlpha: 0.94,
        contract: active,
        ...timerStyle,
      };
    }

    const incoming = this._getIncomingPressure(slotId);
    if (incoming) {
      const isCountdown = incoming.phase === "countdown";
      return {
        kind: "pressure-incoming",
        iconText: "💀".repeat(Math.max(1, incoming.difficulty || 1)),
        fillColor: 0x2a1318,
        strokeColor: 0xfca5a5,
        iconSize: 18,
        fillAlpha: 0.93,
        incoming,
        ...makeTimerBadge({
          text: isCountdown ? incoming.remainingText : "LOCK",
          textColor: isCountdown ? "#ffe4e6" : "#fef3c7",
          fillColor: isCountdown ? 0x4b1419 : 0x3c2a08,
          strokeColor: isCountdown ? 0xf87171 : 0xfbbf24,
          fontSize: 11,
          minWidth: 42,
        }),
      };
    }

      if (!this._canBuyContracts()) {
        return {
          kind: "locked-empty",
          iconText: "🔒",
          fillColor: 0x111827,
          strokeColor: 0xfbbf24,
          iconSize: 24,
          fillAlpha: 0.88,
          ...makeTimerBadge({
            text: "LOCK",
            textColor: "#fef3c7",
            fillColor: 0x3c2a08,
            strokeColor: 0xfbbf24,
            fontSize: 11,
            minWidth: 42,
          }),
        };
      }

    const favor = this._getSlotFavor(slotId);
    if (favor) {
      const tone = this._getSlotFavorTone(favor);
      return {
        kind: "empty",
        iconText: getSlotFavorIconText(favor),
        fillColor: tone.fillColor,
        strokeColor: tone.strokeColor,
        iconSize: 24,
        fillAlpha: 0.88,
        favor,
        ...makeTimerBadge({
          text: getSlotFavorShortLabel(favor),
          textColor: tone.timerColor,
          fillColor: tone.fillColor,
          strokeColor: tone.strokeColor,
          fontSize: 10,
          pulse: "favor",
          minWidth: 44,
        }),
      };
    }

    return {
      kind: "empty",
      iconText: "+",
      timerText: "",
      fillColor: 0x0b1220,
      strokeColor: 0xdbeafe,
      iconSize: 34,
      fillAlpha: 0,
    };
  }

  _getActiveContract(slotId) {
    const pm = this.world?.parcelManager;
    const id = pm?.slotToContractId?.[slotId];
    if (!id) return null;
    return pm?.contractsById?.get?.(id) ?? null;
  }

  _getIncomingPressure(slotId) {
    return this.world?.towerPressureController?.getSlotPressureInfo?.(slotId)
      ?? null;
  }

  _getPressureSummaryLines(info, { live = false, contract = null } = {}) {
    const skull = "\u{1F480}";
    const difficulty = Math.max(1, Number(info?.difficulty || 1));
    const enemyTypeLabel = String(info?.enemyTypeLabel || "Raiders");
    const lines = [];

    if (live) {
      lines.push("Status: LIVE");
    } else if (info?.remainingText) {
      lines.push(`ETA: ${info.remainingText}`);
    }

    if (Number.isFinite(info?.hordeIndex) && Number(info.hordeIndex) > 0) {
      lines.push(`Horde: ${info.hordeIndex}`);
    }

    lines.push(`Difficulty: ${skull.repeat(difficulty)}`);

    if (info?.modifierLabel) {
      lines.push(`Modifier: ${info.modifierLabel}`);
    }

    if (live) {
      const totalSpawners = Math.max(1, Number(info?.spawners || contract?.spawners?.length || 1));
      const activeSpawners = Math.max(
        0,
        Number(
          info?.activeSpawners
          || (contract?.spawners || []).filter((s) => s?.building && !s.building._destroyed).length
        )
      );
      const totalEnemies = Math.max(
        0,
        Number(info?.enemies || contract?.totalPlannedEnemies || 0)
      );
      const aliveEnemies = Math.max(
        0,
        Number(info?.aliveEnemies || (Number(contract?.spawned || 0) - Number(contract?.killed || 0)))
      );
      const killedEnemies = Math.max(0, Number(contract?.killed || 0));

      lines.push(`Spawners Active: ${activeSpawners}/${totalSpawners}`);
      lines.push(`${enemyTypeLabel} Alive: ${aliveEnemies}/${totalEnemies}`);
      lines.push(`Destroyed: ${killedEnemies}/${totalEnemies}`);
      return lines;
    }

    lines.push(`Spawners: ${Math.max(1, Number(info?.spawners || 1))}`);
    lines.push(`${enemyTypeLabel}: ${Math.max(0, Number(info?.enemies || 0))}`);
    return lines;
  }

  _getFortSummaryLines() {
    const arrival = this._getNorthFortArrival();
    if (arrival) {
      return [
        `Arrival: Day ${arrival.arrivalDay}`,
        `${arrival.statusText}`,
        `Season ${arrival.seasonIndex}  Stage ${arrival.stageIndex}`,
      ];
    }

    const obj = StageState?._fortObjective;
    const towersRequired = Math.max(0, Number(obj?.requiredCount || 0));
    const towersDestroyed = Math.max(0, Number(obj?.destroyedSet?.size || 0));
    const totalFortEnemies = Math.max(0, Number(obj?.meta?.requiredFortEnemyCount || 0));
    const aliveFortEnemies = (Teams.teamLists?.["0"]?.fighterList || []).filter(
      (t) => t?.active && t?.isFortGrunt
    ).length;
    const fortDestroyed = Math.max(
      0,
      totalFortEnemies > 0 ? (totalFortEnemies - aliveFortEnemies) : 0
    );

    return [
      `🏰 Towers ${towersDestroyed}/${towersRequired}`,
      `💀 Fort Enemies ${fortDestroyed}/${totalFortEnemies}`,
    ];
  }

  _getFortPopupConfig() {
    const arrival = this._getNorthFortArrival();
    if (arrival) {
      return {
        theme: {
          bgColor: 0x4c1d95,
          bgAlpha: 0.34,
          strokeColor: 0xf0abfc,
          titleColor: "#fff5cf",
          bodyColor: "#f6ecff",
        },
        title: `${FORT_TOWER_ICON} North Fort Incoming`,
        body: [
          `Arrival: Day ${arrival.arrivalDay}`,
          `${arrival.statusText}`,
          `Season ${arrival.seasonIndex}`,
          `Stage ${arrival.stageIndex}`,
        ].join("\n"),
      };
    }

    return {
      theme: {
        bgColor: 0x4c1d95,
        bgAlpha: 0.34,
        strokeColor: 0xfbbf24,
        titleColor: "#fff5cf",
        bodyColor: "#f6ecff",
      },
      title: `${FORT_ICON} North Fort`,
      body: this._getFortSummaryLines().join("\n"),
    };

    if (false && arrival) {
      return {
        theme: {
          bgColor: 0x4c1d95,
          bgAlpha: 0.34,
          strokeColor: 0xf0abfc,
          titleColor: "#fff5cf",
          bodyColor: "#f6ecff",
        },
        title: "♜ North Fort Incoming",
        body: [
          `Arrival: Day ${arrival.arrivalDay}`,
          `${arrival.statusText}`,
          `Season ${arrival.seasonIndex}`,
          `Stage ${arrival.stageIndex}`,
        ].join("\n"),
      };
    }

    return {
      theme: {
        bgColor: 0x4c1d95,
        bgAlpha: 0.34,
        strokeColor: 0xfbbf24,
        titleColor: "#fff5cf",
        bodyColor: "#f6ecff",
      },
      title: "♛ North Fort",
      body: this._getFortSummaryLines().join("\n"),
    };
  }

  _onSquareClicked(slotId) {
    if (!this._canPerformTutorialAction("contractHud.slot", { slotId })) return;

    if (this.popupState?.slotId === slotId) {
      if (this._getTutorialManager()?.isActive?.()) {
        this._getTutorialManager()?.blockAction?.();
        return;
      }
      this.closePopup();
      return;
    }

    const status = this._getSlotStatus(slotId);
    if (status.kind === "locked-empty") {
      this._showParcelLockedMessage();
      return;
    }
    if (status.kind === "empty") {
      this._openChooser(slotId);
      this._notifyTutorialAction("contractHud.slot", { slotId });
      return;
    }

    this._openSummary(slotId);
    this._notifyTutorialAction("contractHud.slot", { slotId });
  }

  _openFortPopup() {
    const animatePopup = !this.popup.visible;
    this.popupState = { kind: "fort" };
    this._positionPopupFor("N");
    this._renderPopup();
    if (animatePopup) this._animatePopupOpen("N");
    else this._animateSquare("N", "open");
  }

  _openChooser(slotId) {
    const animatePopup = !this.popup.visible;
    this.popupState = { kind: "slot", slotId, view: "chooser" };
    this._positionPopupFor(slotId);
    this._renderPopup();
    if (animatePopup) this._animatePopupOpen(slotId);
    else this._animateSquare(slotId, "open");
  }

  _openDetail(slotId, type) {
    if (!this._canPerformTutorialAction("contractHud.type", { slotId, type })) return;

    if (type === "MILITIA" && !this._canAccessMilitia()) {
      this._showMilitiaLockedMessage();
      return;
    }

    const animatePopup = !this.popup.visible;
    this.popupState = {
      kind: "slot",
      slotId,
      view: "detail",
      type,
      difficulty: 1,
    };
    this._positionPopupFor(slotId);
    this._renderPopup();
    if (animatePopup) this._animatePopupOpen(slotId);
    else this._animateSquare(slotId, "open");
    this._notifyTutorialAction("contractHud.type", { slotId, type });
  }

  _openSummary(slotId) {
    const animatePopup = !this.popup.visible;
    this.popupState = { kind: "slot", slotId, view: this._getSlotStatus(slotId).kind };
    this._positionPopupFor(slotId);
    this._renderPopup();
    if (animatePopup) this._animatePopupOpen(slotId);
    else this._animateSquare(slotId, "open");
  }

  closePopup(animated = true, squareMode = "close", forceSlotId = null) {
    const closingState = this.popupState;
    const slotId = forceSlotId ?? this._getPopupAnchorSlotId(closingState);
    const finish = () => {
      this.popupState = null;
      this.popup.setVisible(false);
      this.popup.setScale(1);
      this.popup.setAlpha(1);
      this._clearPopupButtons();
      this._popupTween = null;
    };

    if (!animated || !this.popup.visible) {
      finish();
      return;
    }

    this._stopPopupTween();
    if (slotId) this._animateSquare(slotId, squareMode);
    this._popupTween = this.scene.tweens.add({
      targets: this.popup,
      scaleX: 0.88,
      scaleY: 0.88,
      alpha: 0,
      duration: 120,
      ease: "Quad.easeIn",
      onComplete: finish,
    });
  }

  _refreshPopup() {
    if (!this.popup.visible || !this.popupState) return;

    if (this.popupState.kind === "fort") {
      const fortPopup = this._getFortPopupConfig();
      this._setPopupTheme(fortPopup.theme);
      this.popupTitle.setText(fortPopup.title);
      this._setPopupSubtitle("");
      this.popupBody.setText(fortPopup.body);
      return;
    }

    const currentStatus = this._getSlotStatus(this.popupState.slotId);
    if ((this.popupState.view === "chooser" || this.popupState.view === "detail") && !this._canBuyContracts()) {
      this.closePopup(false);
      return;
    }

    if (this.popupState.view === "chooser" || this.popupState.view === "detail") {
      if (currentStatus.kind !== "empty") {
        this.popupState.view = currentStatus.kind;
        this._renderPopup();
      }
      return;
    }

    if (currentStatus.kind === "empty") {
      this._openChooser(this.popupState.slotId);
      return;
    }

    if (this.popupState.view !== currentStatus.kind) {
      this.popupState.view = currentStatus.kind;
      this._renderPopup();
      return;
    }

    if (this.popupState.view === "pressure-live" || this.popupState.view === "active" || this.popupState.view === "pressure-incoming") {
      this._refreshSummaryPopup(this.popupState.slotId, currentStatus);
    }
  }

  _refreshSummaryPopup(slotId, status, withButtons = false) {
    const slotLabel = SLOT_LABELS[slotId];
    const skull = "\u{1F480}";
    this._setPopupSubtitle("");

    if (status.kind === "pressure-incoming") {
      this._setPopupTheme({
        bgColor: 0x7f1d1d,
        bgAlpha: 0.84,
        strokeColor: 0xfca5a5,
        titleColor: "#fff1f1",
        bodyColor: "#ffe1e1",
        subtitleColor: "#ffd4d4",
      });
      const info = status.incoming;
      this.popupTitle.setText(`${skull} ${slotLabel} Pressure`);
      this.popupBody.setText(this._getPressureSummaryLines(info).join("\n"));
    } else if (status.kind === "pressure-live") {
      this._setPopupTheme({
        bgColor: 0x7f1d1d,
        bgAlpha: 0.86,
        strokeColor: 0xfca5a5,
        titleColor: "#fff1f1",
        bodyColor: "#ffe1e1",
        subtitleColor: "#ffd4d4",
      });
      const inst = status.contract;
      const totalSpawners = inst?.spawners?.length || inst?.difficulty || 1;
      const activeSpawners = (inst?.spawners || []).filter((s) => s?.building && !s.building._destroyed).length;
      const totalRaiders = inst?.totalPlannedEnemies || (inst?.difficulty || 1) * (PRESSURE.baseEnemiesPerSpawner ?? 3);
      const aliveRaiders = Math.max(0, Number(inst?.spawned || 0) - Number(inst?.killed || 0));
      this.popupTitle.setText(`${skull} ${slotLabel} Pressure`);
      this.popupBody.setText(this._getPressureSummaryLines({
        hordeIndex: inst?.pressureHordeIndex ?? null,
        difficulty: inst?.difficulty || 1,
        spawners: totalSpawners,
        activeSpawners,
        enemies: totalRaiders,
        aliveEnemies: aliveRaiders,
        enemyTypeLabel: inst?.enemyTypeLabel || "Raiders",
        modifierLabel: inst?.pressureModifier?.label || null,
      }, {
        live: true,
        contract: inst,
      }).join("\n"));
    } else if (status.kind === "active") {
      const inst = status.contract;
      const def = CONTRACT_DEFS[inst?.type] || CONTRACT_DEFS.FOREST;
      this._setPopupTheme({
        bgColor: def.color ?? 0x1f2937,
        bgAlpha: 0.84,
        strokeColor: 0xffffff,
        titleColor: "#ffffff",
        bodyColor: "#eef7ff",
        subtitleColor: "#dbeafe",
      });
      const remainingMs = Math.max(0, Number(inst?.expireAt || 0) - this._getWorldNowMs());
      this.popupTitle.setText(`${def.emoji} ${slotLabel} ${def.title}`);
      this.popupBody.setText([
        `Time Left: ${fmtMMSS(remainingMs)}`,
        `${def.title} is active.`,
        ...(inst?.slotFavor ? [`Slot Bonus: ${getSlotFavorShortLabel(inst.slotFavor)}`] : []),
      ].join("\n"));
    }

    if (withButtons) {
      this._addPopupCloseButton();
    }
  }

  _renderPopup() {
    if (!this.popupState) return;
    this._clearPopupButtons();

    if (this.popupState.kind === "fort") {
      const fortPopup = this._getFortPopupConfig();
      this._setPopupTheme(fortPopup.theme);
      this.popupTitle.setText(fortPopup.title);
      this._setPopupSubtitle("");
      this.popupBody.setText(fortPopup.body);
      this._addPopupCloseButton();
      return;
    }

    const { slotId, view } = this.popupState;
    const slotLabel = SLOT_LABELS[slotId];

    if (view === "chooser") {
      const slotFavor = this._getSlotFavor(slotId);
      const tone = this._getSlotFavorTone(slotFavor);
      const favorHeadline = this._getSlotFavorHeadline(slotId, slotFavor);
      this._setPopupTheme({
        bgColor: 0x0b1220,
        bgAlpha: 0.86,
        strokeColor: tone.strokeColor,
        titleColor: "#ffffff",
        bodyColor: "#e5edf7",
        subtitleColor: tone.subtitleColor,
      });
      this.popupTitle.setText(`${slotLabel} Contract`);
      this._setPopupSubtitle(favorHeadline, tone.subtitleColor);
      this.popupBody.setText("");
      const buttons = [];
      this._getBuyableTypes().forEach((type, index) => {
        const def = CONTRACT_DEFS[type];
        const row = Math.floor(index / 2);
        const col = index % 2;
        const x = 74 + col * 132;
        const y = 102 + row * 46;

        const isLockedMilitia = type === "LOCKED_MILITIA";
        const cost = isLockedMilitia ? 0 : getContractPermitCost(type, 1, this.world ?? this.scene);
        const purchase = isLockedMilitia ? null : this._getPurchaseContext(slotId, type, 1);
        const moneyCost = isLockedMilitia ? 0 : Math.max(0, Number(purchase?.moneyCost ?? getContractMoneyCost(this.world ?? this.scene, type, 1)));

        buttons.push({
          x,
          y,
          w: 120,
          h: 34,
          label: isLockedMilitia
            ? `🔒 Level 3`
            : `${def.emoji} ${def.title.replace(" Contract", "")}\n${formatPermitCostText(cost)} + $${moneyCost}`,
          textColor: slotFavor?.kind === "discount" && !isLockedMilitia ? "#ffb4b4" : "#ffffff",
          strokeColor: slotFavor?.kind === "discount" && !isLockedMilitia ? 0xf87171 : 0xffffff,
          fillColor: slotFavor?.kind === "discount" && !isLockedMilitia ? 0x341317 : 0xffffff,
          fillAlpha: slotFavor?.kind === "discount" && !isLockedMilitia ? 0.20 : 0.10,
          hoverFillAlpha: slotFavor?.kind === "discount" && !isLockedMilitia ? 0.30 : 0.16,
          pressedFillAlpha: slotFavor?.kind === "discount" && !isLockedMilitia ? 0.38 : 0.22,
          tutorialKey: isLockedMilitia ? "contract:LOCKED_MILITIA" : `contract:${type}`,
          onClick: () => {
            if (isLockedMilitia) {
              this._showMilitiaLockedMessage();
              return;
            }
            this._openDetail(slotId, type);
          },
        });
      });
      this._addPopupButtons(buttons);
      this._addPopupCloseButton();
      return;
    }

    if (view === "detail") {
      const type = this.popupState.type;
      if (type === "MILITIA" && !this._canAccessMilitia()) {
        this._setPopupTheme({
          bgColor: 0x111827,
          bgAlpha: 0.86,
          strokeColor: 0xfbbf24,
          titleColor: "#ffffff",
          bodyColor: "#eef7ff",
          subtitleColor: "#ffe08a",
        });
        this.popupTitle.setText("🔒 Locked");
        this._setPopupSubtitle("", "#ffe08a");
        this.popupBody.setText([
          "Unlocks at Town XP Level 3.",
          "Militia parcel is not available yet.",
        ].join("\n"));
        this._addPopupButtons([
          {
            x: 78,
            y: 226,
            w: 90,
            h: 32,
            label: "Back",
            fillColor: 0x581c24,
            fillAlpha: 0.92,
            hoverFillAlpha: 1,
            pressedFillAlpha: 1,
            strokeColor: 0xfca5a5,
            strokeAlpha: 0.7,
            textColor: "#ffe2e2",
            onClick: () => this._tryBackToChooser(slotId),
          },
        ]);
        this._addPopupCloseButton();
        return;
      }
      if (type === "PRESSURE") {
        this._setPopupTheme({
          bgColor: 0x7f1d1d,
          bgAlpha: 0.86,
          strokeColor: 0xfca5a5,
          titleColor: "#fff1f1",
          bodyColor: "#ffe1e1",
          subtitleColor: "#ffd4d4",
        });
        const diff = this.popupState.difficulty ?? 1;
        this.popupTitle.setText("💀 Pressure Contract");
        this._setPopupSubtitle("", "#ffd4d4");
        this.popupBody.setPosition(18, 64);
        this.popupBody.setText([
          `${formatPermitCostText(getContractPermitCost("PRESSURE", diff, this.world ?? this.scene))} + $${getContractMoneyCost(this.world ?? this.scene, "PRESSURE", diff)}`,
          "Bigger raid contracts send more enemies and pay more if you clear the parcel.",
        ].join("\n"));

        const selectedBtnFill = 0x4a0f14;
        const selectedBtnStroke = 0xffd3d3;
        const unselectedBtnFill = 0x241015;
        const unselectedBtnStroke = 0xfca5a5;
        const buttons = [
          {
            x: 56,
            y: 178,
            w: 60,
            h: 32,
            label: "💀",
            fillColor: diff === 1 ? selectedBtnFill : unselectedBtnFill,
            fillAlpha: diff === 1 ? 0.96 : 0.82,
            hoverFillAlpha: diff === 1 ? 1 : 0.92,
            pressedFillAlpha: 1,
            strokeColor: diff === 1 ? selectedBtnStroke : unselectedBtnStroke,
            strokeAlpha: diff === 1 ? 0.9 : 0.58,
            textColor: "#fff1f1",
            onClick: () => { this.popupState.difficulty = 1; this._renderPopup(); },
          },
          {
            x: 140,
            y: 178,
            w: 60,
            h: 32,
            label: "💀💀",
            fontSize: "11px",
            fillColor: diff === 2 ? selectedBtnFill : unselectedBtnFill,
            fillAlpha: diff === 2 ? 0.96 : 0.82,
            hoverFillAlpha: diff === 2 ? 1 : 0.92,
            pressedFillAlpha: 1,
            strokeColor: diff === 2 ? selectedBtnStroke : unselectedBtnStroke,
            strokeAlpha: diff === 2 ? 0.9 : 0.58,
            textColor: "#fff1f1",
            onClick: () => { this.popupState.difficulty = 2; this._renderPopup(); },
          },
          {
            x: 224,
            y: 178,
            w: 60,
            h: 32,
            label: "💀💀💀",
            fontSize: "10px",
            fillColor: diff === 3 ? selectedBtnFill : unselectedBtnFill,
            fillAlpha: diff === 3 ? 0.96 : 0.82,
            hoverFillAlpha: diff === 3 ? 1 : 0.92,
            pressedFillAlpha: 1,
            strokeColor: diff === 3 ? selectedBtnStroke : unselectedBtnStroke,
            strokeAlpha: diff === 3 ? 0.9 : 0.58,
            textColor: "#fff1f1",
            onClick: () => { this.popupState.difficulty = 3; this._renderPopup(); },
          },
          {
            x: 78,
            y: 226,
            w: 90,
            h: 32,
            label: "Back",
            fillColor: 0x581c24,
            fillAlpha: 0.92,
            hoverFillAlpha: 1,
            pressedFillAlpha: 1,
            strokeColor: 0xfca5a5,
            strokeAlpha: 0.7,
            textColor: "#ffe2e2",
            onClick: () => this._tryBackToChooser(slotId),
          },
          {
            x: 202,
            y: 226,
            w: 90,
            h: 32,
            label: "Buy",
            fillColor: 0x14532d,
            fillAlpha: 0.94,
            hoverFillAlpha: 1,
            pressedFillAlpha: 1,
            strokeColor: 0x86efac,
            strokeAlpha: 0.76,
            textColor: "#eafff1",
            tutorialKey: "contractBuy:PRESSURE",
            onClick: () => this._commit(slotId, { type: "PRESSURE", difficulty: diff }),
          },
        ];
        this._addPopupButtons(buttons);
        this._addPopupCloseButton();
        return;
      }
      if (type === "MILITIA") {
        const diff = clampMilitiaTier(this.popupState.difficulty ?? 1);
        const tier = getMilitiaTierConfig(diff);
        const purchase = this._getPurchaseContext(slotId, "MILITIA", diff);
        const moneyCost = Math.max(0, Number(purchase?.moneyCost ?? getContractMoneyCost(this.world ?? this.scene, "MILITIA", diff)));
        this._setPopupTheme({
          bgColor: 0x0f172a,
          bgAlpha: 0.88,
          strokeColor: 0xb7ecff,
          titleColor: "#ffffff",
          bodyColor: "#eef7ff",
          subtitleColor: "#d6f0ff",
        });
        this.popupTitle.setText("Militia Contract");
        this._setPopupSubtitle(`Tier ${diff}: ${tier.summary}`, "#d6f0ff", "12px");
        this.popupBody.setPosition(18, 88);
        this.popupBody.setText([
          `Permits ${getContractPermitCost("MILITIA", diff, this.world ?? this.scene)} + $${moneyCost}`,
          "Temporary defensive parcel.",
          "Duration: 1 day",
        ].join("\n"));

        const selectedBtnFill = 0x163042;
        const selectedBtnStroke = 0xd6f0ff;
        const unselectedBtnFill = 0x0b2232;
        const unselectedBtnStroke = 0x86c5e5;
        const buttons = [
          {
            x: 56,
            y: 178,
            w: 60,
            h: 32,
            label: "T1",
            fillColor: diff === 1 ? selectedBtnFill : unselectedBtnFill,
            fillAlpha: diff === 1 ? 0.96 : 0.82,
            hoverFillAlpha: diff === 1 ? 1 : 0.92,
            pressedFillAlpha: 1,
            strokeColor: diff === 1 ? selectedBtnStroke : unselectedBtnStroke,
            strokeAlpha: diff === 1 ? 0.9 : 0.58,
            textColor: "#eef7ff",
            onClick: () => { this.popupState.difficulty = 1; this._renderPopup(); },
          },
          {
            x: 140,
            y: 178,
            w: 60,
            h: 32,
            label: "T2",
            fillColor: diff === 2 ? selectedBtnFill : unselectedBtnFill,
            fillAlpha: diff === 2 ? 0.96 : 0.82,
            hoverFillAlpha: diff === 2 ? 1 : 0.92,
            pressedFillAlpha: 1,
            strokeColor: diff === 2 ? selectedBtnStroke : unselectedBtnStroke,
            strokeAlpha: diff === 2 ? 0.9 : 0.58,
            textColor: "#eef7ff",
            onClick: () => { this.popupState.difficulty = 2; this._renderPopup(); },
          },
          {
            x: 224,
            y: 178,
            w: 60,
            h: 32,
            label: "T3",
            fillColor: diff === 3 ? selectedBtnFill : unselectedBtnFill,
            fillAlpha: diff === 3 ? 0.96 : 0.82,
            hoverFillAlpha: diff === 3 ? 1 : 0.92,
            pressedFillAlpha: 1,
            strokeColor: diff === 3 ? selectedBtnStroke : unselectedBtnStroke,
            strokeAlpha: diff === 3 ? 0.9 : 0.58,
            textColor: "#eef7ff",
            onClick: () => { this.popupState.difficulty = 3; this._renderPopup(); },
          },
          {
            x: 78,
            y: 226,
            w: 90,
            h: 32,
            label: "Back",
            fillColor: 0x581c24,
            fillAlpha: 0.92,
            hoverFillAlpha: 1,
            pressedFillAlpha: 1,
            strokeColor: 0xfca5a5,
            strokeAlpha: 0.7,
            textColor: "#ffe2e2",
            onClick: () => this._tryBackToChooser(slotId),
          },
          {
            x: 202,
            y: 226,
            w: 90,
            h: 32,
            label: "Buy",
            fillColor: 0x14532d,
            fillAlpha: 0.94,
            hoverFillAlpha: 1,
            pressedFillAlpha: 1,
            strokeColor: 0x86efac,
            strokeAlpha: 0.76,
            textColor: "#eafff1",
            tutorialKey: "contractBuy:MILITIA",
            onClick: () => this._commit(slotId, {
              type: "MILITIA",
              difficulty: diff,
              militiaConfig: {
                tier: diff,
                layout: getMilitiaTierLayout(diff),
              },
            }),
          },
        ];
        this._addPopupButtons(buttons);
        this._addPopupCloseButton();
        return;
      }

      const def = CONTRACT_DEFS[type];
      const purchase = this._getPurchaseContext(slotId, type, 1);
      const tone = this._getSlotFavorTone(purchase.favor);
      const stayText = type === "MILITIA"
        ? "1 day"
        : formatFavorDurationMs(purchase.durationMs);
      this._setPopupTheme({
        bgColor: def.color ?? 0x1f2937,
        bgAlpha: 0.86,
        strokeColor: tone.strokeColor,
        titleColor: "#ffffff",
        bodyColor: purchase.favor?.kind === "discount" ? tone.bodyColor : "#eef7ff",
        subtitleColor: tone.subtitleColor,
      });
      this.popupTitle.setText(`${def.emoji} ${def.title}`);
      this._setPopupSubtitle("", tone.subtitleColor);
      this.popupBody.setText([
        `Stays for: ${stayText}`,
        "",
        ...(def.lines?.(this.world ?? this.scene) ?? []),
        "",
        `Permit Cost: ${formatPermitCostText(getContractPermitCost(type, 1, this.world ?? this.scene))}`,
        `Cash Cost: $${Math.max(0, Number(purchase?.moneyCost ?? getContractMoneyCost(this.world ?? this.scene, type, 1)))}`,
      ].join("\n"));
      this._addPopupButtons([
        {
          x: 78,
          y: 226,
          w: 90,
          h: 32,
          label: "Back",
          fillColor: 0x581c24,
          fillAlpha: 0.92,
          hoverFillAlpha: 1,
          pressedFillAlpha: 1,
          strokeColor: 0xfca5a5,
          strokeAlpha: 0.7,
          textColor: "#ffe2e2",
          onClick: () => this._tryBackToChooser(slotId),
        },
        {
          x: 202,
          y: 226,
          w: 90,
          h: 32,
          label: "Buy",
          fillColor: 0x14532d,
          fillAlpha: 0.94,
          hoverFillAlpha: 1,
          pressedFillAlpha: 1,
          strokeColor: 0x86efac,
          strokeAlpha: 0.76,
          textColor: "#eafff1",
          tutorialKey: `contractBuy:${type}`,
          onClick: () => this._commit(slotId, { type }),
        },
      ]);
      this._addPopupCloseButton();
      return;
    }

    const status = this._getSlotStatus(slotId);
    if (status.kind === "pressure-incoming") {
      this._setPopupTheme({
        bgColor: 0x7f1d1d,
        bgAlpha: 0.84,
        strokeColor: 0xfca5a5,
        titleColor: "#fff1f1",
        bodyColor: "#ffe1e1",
        subtitleColor: "#ffd4d4",
      });
      const info = status.incoming;
      this.popupTitle.setText(`💀 ${slotLabel} Pressure`);
      this._setPopupSubtitle("");
      this.popupBody.setText(this._getPressureSummaryLines(info).join("\n"));
    } else if (status.kind === "pressure-live") {
      this._setPopupTheme({
        bgColor: 0x7f1d1d,
        bgAlpha: 0.86,
        strokeColor: 0xfca5a5,
        titleColor: "#fff1f1",
        bodyColor: "#ffe1e1",
        subtitleColor: "#ffd4d4",
      });
      const inst = status.contract;
      const totalSpawners = inst?.spawners?.length || inst?.difficulty || 1;
      const activeSpawners = (inst?.spawners || []).filter((s) => s?.building && !s.building._destroyed).length;
      const totalRaiders = inst?.totalPlannedEnemies || (inst?.difficulty || 1) * (PRESSURE.baseEnemiesPerSpawner ?? 3);
      const aliveRaiders = Math.max(0, Number(inst?.spawned || 0) - Number(inst?.killed || 0));
      this.popupTitle.setText(`💀 ${slotLabel} Pressure`);
      this._setPopupSubtitle("");
      this.popupBody.setText(this._getPressureSummaryLines({
        hordeIndex: inst?.pressureHordeIndex ?? null,
        difficulty: inst?.difficulty || 1,
        spawners: totalSpawners,
        activeSpawners,
        enemies: totalRaiders,
        aliveEnemies: aliveRaiders,
        enemyTypeLabel: inst?.enemyTypeLabel || "Raiders",
        modifierLabel: inst?.pressureModifier?.label || null,
      }, {
        live: true,
        contract: inst,
      }).join("\n"));
    } else if (status.kind === "active") {
      const inst = status.contract;
      const def = CONTRACT_DEFS[inst?.type] || CONTRACT_DEFS.FOREST;
      const tone = this._getSlotFavorTone(inst?.slotFavor);
      this._setPopupTheme({
        bgColor: def.color ?? 0x1f2937,
        bgAlpha: 0.84,
        strokeColor: tone.strokeColor,
        titleColor: "#ffffff",
        bodyColor: "#eef7ff",
        subtitleColor: tone.subtitleColor,
      });
      const remainingMs = Math.max(0, Number(inst?.expireAt || 0) - this._getWorldNowMs());
      this.popupTitle.setText(`${def.emoji} ${slotLabel} ${def.title}`);
      this._setPopupSubtitle("", tone.subtitleColor);
      this.popupBody.setText([
        `Time Left: ${fmtMMSS(remainingMs)}`,
        `${def.title} is active.`,
        ...(inst?.slotFavor ? [`Slot Bonus: ${getSlotFavorShortLabel(inst.slotFavor)}`] : []),
      ].join("\n"));
    }
    this._addPopupCloseButton();
  }

  _clearPopupButtons() {
    this.popupObjects.forEach((obj) => obj?.destroy?.());
    this.popupObjects = [];
    this.popupButtonRefs.clear();
  }

  _addPopupCloseButton() {
    const btn = makeButton(this.scene, {
      x: this.popupW - 22,
      y: 22,
      w: 24,
      h: 24,
      label: "X",
      fontSize: "11px",
      fillColor: 0x581c24,
      fillAlpha: 0.92,
      hoverFillAlpha: 1,
      pressedFillAlpha: 1,
      strokeColor: 0xfca5a5,
      strokeAlpha: 0.7,
      textColor: "#ffe2e2",
      onClick: () => this._tryClosePopup(),
    });
    this.popup.add(btn);
    this.popupObjects.push(btn);
  }

  _addPopupButtons(defs) {
    defs.forEach((cfg) => {
      const btn = makeButton(this.scene, cfg);
      btn.tutorialKey = cfg.tutorialKey || null;
      btn.tutorialW = cfg.w ?? 120;
      btn.tutorialH = cfg.h ?? 34;
      if (btn.tutorialKey) {
        this.popupButtonRefs.set(btn.tutorialKey, btn);
      }
      this.popup.add(btn);
      this.popupObjects.push(btn);
    });
  }

  _commit(slotId, payload) {
    const pm = this.world?.parcelManager;
    if (!pm) return;
    if (!this._canBuyContracts()) {
      this._showParcelLockedMessage();
      this.closePopup(false);
      return;
    }

    const status = this._getSlotStatus(slotId);
    if (status.kind !== "empty") return;

    const type = payload.type;
    const difficulty = payload.difficulty ?? 1;
    const tutorial = this.world?.tutorialManager || this.scene?.tutorialManager || null;
    if (tutorial && !tutorial.canPerformAction?.("parcel.commit", {
      type,
      slotId,
      source: "contractHud",
    })) {
      return;
    }

    if (type === "MILITIA" && !this._canAccessMilitia()) {
      this._showMilitiaLockedMessage();
      return;
    }
    if (pm.hasActiveContractType?.(type)) {
      const label = String(type || "parcel").toLowerCase().replace(/_/g, " ");
      showAlert(this.scene, `Only one ${label} parcel can be active at once.`, "#ffcc66");
      return;
    }
    const cost = payload.cost != null
      ? payload.cost
      : getContractPermitCost(type, difficulty, this.world ?? this.scene);
    const purchase = this._getPurchaseContext(slotId, type, difficulty);
    const moneyCost = Math.max(0, Number(payload.moneyCost ?? purchase.moneyCost ?? getContractMoneyCost(this.world ?? this.scene, type, difficulty)));

    if (cost > 0) {
      if (!this.scene.checkSufficientPermits(cost)) return;
      this.scene.updatePermits(-cost);
    }

    if (moneyCost > 0) {
      if (!this.scene.checkSufficientFunds(moneyCost)) {
        if (cost > 0) this.scene.updatePermits(+cost);
        return;
      }
      this.scene.updateMoney(-moneyCost);
    }

    let started = null;
    try {
      if (type === "FOREST") started = pm.startForest(slotId);
      else if (type === "ROCK") started = pm.startRock(slotId);
      else if (type === "FARM") started = pm.startFarm?.(slotId);
      else if (type === "MILITIA") {
        started = pm.startMilitia?.(slotId, difficulty, {
          militiaConfig: payload.militiaConfig ?? {
            tier: difficulty,
            layout: getMilitiaTierLayout(difficulty),
          },
          moneyCost,
        });
      }
      else if (type === "PRESSURE") started = pm.startPressure(slotId, difficulty, { source: "manual" });
      else if (type === "MARKET") started = pm.startMarket(slotId);
    } catch (err) {
      console.error("ContractHud commit failed:", err);
      if (cost > 0) this.scene.updatePermits(+cost);
      if (moneyCost > 0) this.scene.updateMoney(+moneyCost);
    }

    if (!started) {
      if (cost > 0) this.scene.updatePermits(+cost);
      if (moneyCost > 0) this.scene.updateMoney(+moneyCost);
      return;
    }

    pm.markContractPermitCost?.(started, cost);

    tutorial?.notifyAction?.("parcel.commit", {
      type,
      slotId,
      source: "contractHud",
      contract: started,
    });

    this.closePopup(true, "buy", slotId);
  }
}
