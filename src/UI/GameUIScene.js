import Phaser from "phaser";
import { UIDEPTH, getAlertTone } from "../constants";
import { DailyNeedsTracker } from "./DailyNeedsTracker";
import { Clock, CLOCK_PHASE_HOURS } from "../Controllers/Clock";
import { CreateBottomBar } from "./BottomBar/BottomBar";
import { StageState } from "../parcelController/StageState";
import { ContractHud } from "./ContractHud.js";
import { SelectionCommandBar } from "./SelectionCommandBar.js";
import { Teams } from "../Teams.js";
import { getNextHordeUnlock } from "../parcel_system/HordeUnlockTrack.js";
import { applyPortraitKeyToSprite, createPlayerPortraitAnimations, getPlayerPortraitKey } from "../players/playerPortraits.js";
import { MainMenu } from "../mainMenu.js";
import { AudioManager } from "../Manager/AudioManager.js";
import { SaveManager } from "../save/SaveManager.js";
import { AchievementBoard } from "./AchievementBoard.js";
import { MARKET_REAL_ASSETS } from "../Cards/MarketCards.js";
import { RELIEF_PACKAGE_MONEY_GRANT, RELIEF_PACKAGE_PRICE } from "../ReliefPackageConfig.js";
import { UI_ITEM_TYPES } from "./UIConstants.js";
import { ORDER_KINDS, isGatherOrder } from "../orders/OrderTypes.js";
import { OrderRunner } from "../orders/OrderRunner.js";
import { BODY_FONT_FAMILY } from "./Typography.js";

export class GameUIScene extends Phaser.Scene {
  constructor() {
    super("GameUIScene");
    this.worldScene = null;
    this._bridged = [];
  }

  init(data) {
    this.worldSceneKey = data?.worldSceneKey || "mapView";
    this._resetRuntimeState();
  }

  _resetRuntimeState() {
    this.worldScene = null;
    this._bridged = [];
    this._hudBuilt = false;
    this._sceneShuttingDown = false;
    this.topHudHoverBubble = null;
    this._topHudHoverHideTimer = null;

    this.alertHud = null;
    this._activeAlerts = [];
    this.topHud = null;
    this._topHudLeftGroups = [];
    this._topHudLayoutConfig = null;
    this._topHudNeedWarnings = {};
    this.moneyIcon = null;
    this.moneyHoverTarget = null;
    this.moneyIconBaseScaleX = 1;
    this.moneyIconBaseScaleY = 1;
    this.moneyTextBaseScaleX = 1;
    this.moneyTextBaseScaleY = 1;
    this.permitIcon = null;
    this.housingIcon = null;
    this.reliefPackageIcon = null;
    this.reliefPackageHoverTarget = null;
    this.townXpHud = null;
    this.phaseClock = null;
    this.townStatusHud = null;
    this.townStatusEntries = null;
    this.stageMetaText = null;
    this.zoomControls = null;
    this.raiderEdgeHud = null;
    this.raiderEdgeIndicators = null;
    this.contractHud = null;
    this.productionStatusHud = null;
    this.productionStatusEntries = null;
    this._productionStatusSignature = "";
    this.achievementBoard = null;
    this.selectionCommandBar = null;
    this.uiBottomBar = null;
    this.playerTab = null;
    this.clayTab = null;
    this.storageTab = null;
    this.housesTab = null;
    this.buildTab = null;
    this.cardsTab = null;
    this.functionTab = null;
    this.bossHud = null;
    this._bossTarget = null;
    this._bossIntroPresentation = null;
    this._bossStorm = null;
    this._townLossPresentation = null;
    this._reliefPackageRecoveryPresentation = null;
    this._townXpRewardPresentation = null;
    this._adrenalineHud = null;
    this._adrenalineUntil = 0;
    this._adrenalineHudLastSeconds = null;
    this._meleeCritUntil = 0;
    this._projectileCritUntil = 0;
    this._townXpHudSignature = null;
    this._townXpLastGainSerial = 0;
    this._townStatusSignature = "";
    this._scaleResizeHandlers = [];
    this._stageMetaRecompute = null;
    this._stageMetaRefreshTimer = null;
    this.pauseMenu = null;
    this.pauseMenuButton = null;
    this._pauseKeyboardHandlers = [];
    this._pauseWorldInputState = null;
    this._pauseBackdropFx = null;
    this._pauseBlurFx = null;
    this._menuHudIntroPlayed = false;
    this._gameplayUiReady = false;
    this._achievementBoardAwaitingDetailedReveal = true;
    this._achievementBoardRevealTimer = null;
  }

  _teardownStageMetaHud() {
    if (this._stageMetaRecompute && this.worldScene?.events) {
      this.worldScene.events.off("stage:changed", this._stageMetaRecompute);
    }
    this._stageMetaRecompute = null;

    this._stageMetaRefreshTimer?.remove?.(false);
    this._stageMetaRefreshTimer = null;
  }

  _clearWorldEventBridge() {
    if (Array.isArray(this._bridged) && this._bridged.length) {
      const sourceScene = this._bridged[0]?.sourceScene || this.worldScene;
      this._bridged.forEach(({ evt, fn, sourceScene: bridgedScene }) => {
        const emitterOwner = bridgedScene || sourceScene;
        emitterOwner?.events?.off?.(evt, fn);
      });
    }
    this._bridged = [];
  }

  _trackScaleResize(handler) {
    if (!handler) return null;
    this.scale?.on?.("resize", handler);
    this._scaleResizeHandlers.push(handler);
    return handler;
  }

  _clearScaleResizeHandlers() {
    if (!Array.isArray(this._scaleResizeHandlers)) return;
    this._scaleResizeHandlers.forEach((handler) => {
      this.scale?.off?.("resize", handler);
    });
    this._scaleResizeHandlers.length = 0;
  }

  _bindPauseControls() {
    this._clearPauseControls();
    const keyboard = this.input?.keyboard;
    if (!keyboard) return;

    const onPauseToggle = (event) => {
      if (event?.repeat) return;
      if (this.pauseMenu?.isOpen) {
        this.closePauseMenu();
        return;
      }
      this.openPauseMenu();
    };

    const onEscClose = (event) => {
      if (event?.repeat) return;
      if (!this.pauseMenu?.isOpen) return;
      event?.stopPropagation?.();
      this.closePauseMenu();
    };

    keyboard.on("keydown-P", onPauseToggle);
    keyboard.on("keydown-ESC", onEscClose);
    this._pauseKeyboardHandlers.push(["keydown-P", onPauseToggle], ["keydown-ESC", onEscClose]);
  }

  _clearPauseControls() {
    const keyboard = this.input?.keyboard;
    if (keyboard && Array.isArray(this._pauseKeyboardHandlers)) {
      this._pauseKeyboardHandlers.forEach(([evt, fn]) => keyboard.off(evt, fn));
    }
    this._pauseKeyboardHandlers = [];
    this._destroyPauseMenu(true);
  }

  _canMutateText(node) {
    if (!node || node.active === false || node.scene !== this) return false;
    if ("canvas" in node && (!node.canvas || !node.context)) return false;
    if (node.frame?.source && !node.frame.source.image) return false;
    return true;
  }

  _mutateText(node, fn) {
    if (this._sceneShuttingDown || !this._canMutateText(node)) return false;
    try {
      fn(node);
      return true;
    } catch {
      return false;
    }
  }

  create() {
    const world = this.scene.get(this.worldSceneKey);
    if (!world) return;
    createPlayerPortraitAnimations(this);
    this._sceneShuttingDown = false;
    this.bindWorldScene(world);
    this._bindPauseControls();
    this._tryOpenPendingMenu({ allowPausedFallback: true });
    this.events.once("shutdown", () => {
      this._sceneShuttingDown = true;
      this._clearWorldEventBridge();
      this._clearPauseControls();
      if (this.worldScene?.uiScene === this) {
        this.worldScene.uiScene = null;
      }
      this._destroyTownLossPresentation();
      this._destroyGameplayUi();
      this._clearScaleResizeHandlers();
    });
  }

  _destroyGameplayUi() {
    const world = this.worldScene;
    this._destroyPauseMenu(true);
    this._teardownStageMetaHud();
    this._topHudHoverHideTimer?.remove?.(false);
    this._topHudHoverHideTimer = null;
    this._destroyReliefPackageRecoveryPresentation();
    this._destroyTownXpRewardPresentation();
    this.achievementBoard?.destroy?.();
    this.achievementBoard = null;
    this._achievementBoardRevealTimer?.remove?.(false);
    this._achievementBoardRevealTimer = null;
    this.selectionCommandBar?.destroy?.();
    this.selectionCommandBar = null;
    this.contractHud?.destroy?.();
    this.contractHud = null;
    this._destroyProductionStatusHud();
    this.uiBottomBar?.destroy?.();
    this.playerTab?.destroy?.();
    this.playerTab = null;
    this.clayTab?.destroy?.();
    this.clayTab = null;
    this.storageTab?.destroy?.();
    this.storageTab = null;
    this.housesTab?.destroy?.();
    this.housesTab = null;
    this.buildTab?.destroy?.();
    this.buildTab?.view?.destroy?.(true);
    this.buildTab = null;
    this.cardsTab?.destroy?.();
    this.cardsTab?.view?.destroy?.(true);
    this.cardsTab = null;
    this.functionTab?.destroy?.();
    this.functionTab?.container?.destroy?.(true);
    this.functionTab = null;
    this._destroyBossHud();
    this._destroyBossIntroPresentation();
    this._destroyBossStorm();
    this.uiBottomBar?.ui?.destroy?.(true);
    this.uiBottomBar = null;
    this._clearTopHudNeedWarningTweens();
    this.topHud?.destroy?.(true);
    this.topHud = null;
    this.reliefPackageIcon = null;
    this.reliefPackageHoverTarget = null;
    this.townXpHud?.destroy?.(true);
    this.townXpHud = null;
    this._destroyAdrenalineHud();
    this.phaseClock?.destroy?.(true);
    this.phaseClock = null;
    this._destroyTownStatusHud();
    this.stageMetaText?.destroy?.();
    this.stageMetaText = null;
    this.stageMetaSubText?.destroy?.();
    this.stageMetaSubText = null;
    this.zoomControls?.destroy?.(true);
    this.zoomControls = null;
    this.raiderEdgeHud?.destroy?.(true);
    this.raiderEdgeHud = null;
    this.alertHud?.destroy?.(true);
    this.alertHud = null;
    this.topHudHoverBubble?.destroy?.(true);
    this.topHudHoverBubble = null;
    this.moneyIcon = null;
    this.moneyText = null;
    this.seedsText = null;
    this.berryText = null;
    this.woodText = null;
    this.stoneText = null;
    this.foodText = null;
    this.waterText = null;
    this.permitText = null;
    this.clockText = null;
    this.phaseClockTimeText = null;
    this.topHudElements = [];
    this.topHudHoverTargets = [];
    this._townXpHudSignature = null;
    this._townXpLastGainSerial = 0;
    this._townStatusSignature = "";
    this._hudBuilt = false;

    if (world) {
      world.moneyText = null;
      world.seedsText = null;
      world.berryText = null;
      world.woodText = null;
      world.stoneText = null;
      world.foodText = null;
      world.waterText = null;
      world.permitText = null;
      world.clockText = null;
      world.uiBottomBar = null;
      world.setBottomBar = null;
      world.openDetailPage = null;
      world.playerTab = null;
      world.clayTab = null;
      world.storageTab = null;
      world.housesTab = null;
      world.buildTab = null;
      world.cardsTab = null;
      world.functionTab = null;
    }
  }

  _tryOpenPendingMenu({ allowPausedFallback = false } = {}) {
    const world = this.worldScene;
    if (!world || world.draftMenu) return false;

    const menuNeedsRehost = !!world.menu?.active && world.menu?.scene !== this;
    const shouldOpenMenu =
      !!world._pendingMenuPhase ||
      menuNeedsRehost ||
      (allowPausedFallback && !world.menu?.active && !!world.clock?.paused);

    if (!shouldOpenMenu) return false;
    MainMenu.startMenuPhase();
    return !!world.menu?.active;
  }

  bindWorldScene(world) {
    this._clearWorldEventBridge();
    this.worldScene = world;
    world.uiScene = this;

    this._bridgeWorldEvents();
    this._forwardWorldState();
  }

  _bridgeWorldEvents() {
    this._clearWorldEventBridge();

    const passthrough = [
      "oven:updated",
      "oven:added",
      "oven:removed",
      "storage:added",
      "storage:removed",
      "storage:updated",
      "housing:updated",
      "relief-package:changed",
      "store:unlock-changed",
      "reward-state:changed",
      "cards:updated",
      "mode:completed",
      "achievements:changed",
      "achievement:completed",
      "zoom:mode-changed",
      "market:adrenaline-changed",
      "market:timed-buff-changed",
    ];

    passthrough.forEach((evt) => {
      const fn = (...args) => {
        this.events.emit(evt, ...args);
        if (evt === "zoom:mode-changed") {
          this._maybeRevealAchievementBoardAfterDetailed(args[0], args[1]);
        }
      };
      this.worldScene.events.on(evt, fn);
      this._bridged.push({ evt, fn, sourceScene: this.worldScene });
    });

    const adrenalineFn = (payload) => this._setAdrenalineHud(payload);
    this.events.on("market:adrenaline-changed", adrenalineFn);
    this._bridged.push({ evt: "market:adrenaline-changed", fn: adrenalineFn, sourceScene: { events: this.events } });

    const timedBuffFn = (payload) => this._setTimedMarketBuffHud(payload);
    this.events.on("market:timed-buff-changed", timedBuffFn);
    this._bridged.push({ evt: "market:timed-buff-changed", fn: timedBuffFn, sourceScene: { events: this.events } });
  }

  _forwardWorldState() {
    const fields = [
      "money",
      "seeds",
      "berries",
      "woodAmnt",
      "stoneAmnt",
      "foodAmnt",
      "cleanWaterAmnt",
      "permits",
      "farmMode",
      "seedGridMode",
      "stoneWallMode",
      "woodWallMode",
      "destroyWallMode",
      "guardPlacement",
      "wallPlacer",
      "wallDestroyer",
      "uiBottomBar",
    ];

    fields.forEach((k) => {
      if (Object.getOwnPropertyDescriptor(this, k)) return;
      Object.defineProperty(this, k, {
        get: () => this.worldScene?.[k],
        set: (v) => {
          if (this.worldScene) this.worldScene[k] = v;
        },
      });
    });

    const fnNames = [
      "checkSufficientFunds",
      "checkSufficientSeeds",
      "checkSufficientBerries",
      "checkSufficientPermits",
      "updateMoney",
      "updateSeeds",
      "updateBerry",
      "updatePermits",
      "processEnemySelection",
    ];
    fnNames.forEach((k) => {
      if (typeof this[k] === "function") return;
      this[k] = (...args) => this.worldScene?.[k]?.(...args);
    });
  }

  initGameplayUI() {
    if (!this.worldScene) return;
    if (this._hudBuilt) return;
    this._gameplayUiReady = true;

    this._buildAlertHud();
    this._buildTopHud();
    this._buildTownXpHud();
    this._buildPhaseClock();
    this._buildTownStatusHud();
    this._buildAchievementBoard();
    this._buildZoomControls();
    this._buildRaiderEdgeHud();
    this._buildContractHud();
    this._buildSelectionCommandBar();
    CreateBottomBar(this);
    this._buildProductionStatusHud();
    this._hudBuilt = true;
    this._refreshProductionStatusHud(true);
    this._refreshTownStatusHud(true);
    this._maybeRevealAchievementBoardAfterDetailed("detailed", 180);

    this._syncWorldUiRefs();
    this.worldScene?.setSimulationSpeedReady?.(true);
  }

  _ensureMenuHudIntroUi() {
    if (!this.worldScene) return;
    this._buildAlertHud();
    this._buildTopHud();
    this._buildTownXpHud();
    this._buildPhaseClock();
    this._buildAchievementBoard();
    this._buildZoomControls();
    this._buildRaiderEdgeHud();
    this._buildContractHud();
    this._syncWorldUiRefs();
  }

  _getMenuHudIntroTargets() {
    return [
      this.topHud,
      this.townXpHud,
      this.phaseClock,
      this.zoomControls,
      this.contractHud?.root || this.contractHud,
    ].filter((target) => target && typeof target.setAlpha === "function" && typeof target.setVisible === "function");
  }

  playMenuHudIntro(force = false) {
    this._ensureMenuHudIntroUi();
    if (!force && this._menuHudIntroPlayed) return;
    this._menuHudIntroPlayed = true;

    const targets = this._getMenuHudIntroTargets();
    if (!targets.length) return;

    targets.forEach((target) => {
      this.tweens.killTweensOf(target);
      if (typeof target._menuIntroBaseY !== "number") {
        target._menuIntroBaseY = target.y;
      }
      target.setVisible(true);
      target.setAlpha(0);
      target.y = target._menuIntroBaseY + 16;
    });

    this.tweens.add({
      targets,
      alpha: 1,
      y: (_target) => _target._menuIntroBaseY,
      duration: 420,
      ease: "Cubic.easeOut",
      stagger: 55,
    });
  }

  _buildAlertHud() {
    if (this.alertHud) return;

    this.alertHud = this.add.container(0, 0).setDepth(UIDEPTH + 28);
    this._activeAlerts = [];

    const relayout = () => {
      const centerX = this.scale.width * 0.5;
      const startY = 50;
      this._activeAlerts.forEach((entry, index) => {
        entry.targetY = startY + index * 46;
        entry.root.x = centerX;
        if (!entry.isEntering) {
          entry.root.y = entry.targetY;
        }
      });
    };

    this.alertHud.relayout = relayout;
    this.scale.on("resize", relayout);
    this.events.once("shutdown", () => {
      this.scale.off("resize", relayout);
    });
  }

  _getAlertTone(message = "", color = "#ffffff") {
    return getAlertTone(message, color);
  }

  showAlertMessage(message, color = "#ffffff", duration = 2200) {
    if (!message) return null;
    this._buildAlertHud();
    const tweenScale = Number(this.tweens?.timeScale);
    const unscaledTweenTimeScale = Number.isFinite(tweenScale) && tweenScale > 0 ? 1 / tweenScale : 1;
    const alertTone = this._getAlertTone(message, color);
    if (alertTone === "bad") {
      AudioManager.playError({ volume: 0.24 });
    } else if (alertTone === "good") {
      AudioManager.playNotificationGood({ volume: 0.23 });
    } else {
      AudioManager.playNotification({ volume: 0.22 });
    }

    const label = this.add
      .text(0, 0, String(message), {
        fontFamily: "Bungee",
        fontSize: "18px",
        color,
        stroke: "#07111b",
        strokeThickness: 4,
        align: "center",
        wordWrap: { width: Math.max(260, this.scale.width - 220) },
      })
      .setOrigin(0.5);

    const width = Math.max(180, Math.ceil(label.width) + 30);
    const height = Math.max(34, Math.ceil(label.height) + 20);
    const shadow = this.add.rectangle(0, 4, width, height, 0x02060d, 0.34).setOrigin(0.5);
    const bg = this.add.rectangle(0, 0, width, height, 0x156c99, 0.9).setOrigin(0.5).setStrokeStyle(2, 0x89d6ff, 0.28);
    const shine = this.add
      .rectangle(0, -Math.round(height * 0.18), Math.max(48, width - 18), Math.max(10, Math.floor(height * 0.34)), 0xffffff, 0.07)
      .setOrigin(0.5);
    const root = this.add
      .container(this.scale.width * 0.5, 40, [shadow, bg, shine, label])
      .setDepth(UIDEPTH + 28)
      .setAlpha(0)
      .setScale(0.96);

    const entry = { root, isEntering: true, targetY: 50 };
    this.alertHud.add(root);
    this._activeAlerts.push(entry);
    this.alertHud.relayout?.();

    root.y = entry.targetY - 10;
    this.tweens.add({
      targets: root,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      y: entry.targetY,
      duration: 170,
      timeScale: unscaledTweenTimeScale,
      ease: "Back.Out",
      onComplete: () => {
        entry.isEntering = false;
      },
    });

    this.tweens.add({
      targets: root,
      alpha: 0,
      y: entry.targetY - 10,
      delay: Math.max(150, Number(duration) || 1400),
      duration: 220,
      timeScale: unscaledTweenTimeScale,
      ease: "Quad.Out",
      onComplete: () => {
        const nextAlerts = (this._activeAlerts || []).filter((candidate) => candidate !== entry);
        this._activeAlerts = nextAlerts;
        root.destroy();
        this.alertHud?.relayout?.();
      },
    });

    return root;
  }

  showSaveNotification() {
    return this.showAlertMessage("World data saved", "#d9fbff", 1100);
  }

  _syncWorldUiRefs() {
    const w = this.worldScene;
    if (!w) return;

    w.moneyText = this.moneyText;
    w.seedsText = this.seedsText;
    w.berryText = this.berryText;
    w.woodText = this.woodText;
    w.stoneText = this.stoneText;
    w.foodText = this.foodText;
    w.waterText = this.waterText;
    w.permitText = this.permitText;
    w.clockText = this.phaseClockTimeText ?? this.clockText;

    w.uiBottomBar = this.uiBottomBar;
    w.setBottomBar = this.setBottomBar;
    w.openDetailPage = this.openDetailPage;
    w.playerTab = this.playerTab;
    w.clayTab = this.clayTab;
    w.storageTab = this.storageTab;
    w.housesTab = this.housesTab;
    w.buildTab = this.buildTab;
    w.cardsTab = this.cardsTab;
    w.functionTab = this.functionTab;
  }

  _buildTopHud() {
    const W = this.scale.width;
    const H = 44;
    const world = this.worldScene;

    const shadow = this.add.graphics();
    const bg = this.add.graphics();
    const inset = this.add.graphics();
    const shine = this.add.graphics();

    const drawBar = (width = this.scale.width) => {
      const outerX = 8;
      const outerY = 4;
      const outerW = Math.max(120, width - 16);
      const outerH = H - 6;
      const radius = 20;

      shadow.clear();
      shadow.fillStyle(0x03101a, 0.30);
      shadow.fillRoundedRect(outerX + 2, outerY + 4, outerW, outerH, radius);

      bg.clear();
      bg.fillStyle(0x123548, 0.96);
      bg.lineStyle(2, 0xb7ecff, 0.20);
      bg.fillRoundedRect(outerX, outerY, outerW, outerH, radius);
      bg.strokeRoundedRect(outerX, outerY, outerW, outerH, radius);

      inset.clear();
      inset.fillStyle(0x0b2232, 0.24);
      inset.fillRoundedRect(outerX + 7, outerY + 7, outerW - 14, outerH - 14, radius - 6);

      shine.clear();
      shine.fillStyle(0xffffff, 0.08);
      shine.fillRoundedRect(outerX + 12, outerY + 6, outerW - 24, 14, 10);
    };
    drawBar(W);
    this._trackScaleResize(({ width }) => drawBar(width));

    const topHudTextStyle = {
      fontSize: "14px",
      fill: "#fff",
      fontFamily: "Bungee",
      stroke: "#000",
      strokeThickness: 2,
    };
    const topHudEmojiStyle = {
      fontSize: "18px",
      fontFamily: "Arial",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 2,
    };
    const measureTextWidth = (sample) => {
      const probe = this.add.text(-1000, -1000, sample, topHudTextStyle).setVisible(false);
      const width = probe.width;
      probe.destroy();
      return width;
    };

    const makeIcon = (x, key) =>
      this.add.image(x, H / 2, key).setDisplaySize(20, 20).setOrigin(0, 0.5).setDepth(UIDEPTH);

    const makeText = (x, text, color = "#fff") =>
      this.add
        .text(x, H / 2, text, {
          ...topHudTextStyle,
          fill: color,
        })
        .setOrigin(0, 0.5)
        .setDepth(UIDEPTH);

    const makeEmojiIcon = (x, emoji) =>
      this.add
        .text(x, H / 2, emoji, topHudEmojiStyle)
        .setOrigin(0, 0.5)
        .setDepth(UIDEPTH);

    const registerHover = (leftX, rightX, label) => {
      const width = Math.max(22, rightX - leftX);
      const hit = this.add
        .zone(leftX + width / 2, H / 2, width, H)
        .setOrigin(0.5, 0.5)
        .setDepth(UIDEPTH + 1)
        .setInteractive({ useHandCursor: true });

      this._bindTopHudHover(hit, label);
      this.topHudElements.push(hit);
      return hit;
    };

    let x = 12;
    const spacing = 8;
    const iconSize = 20;

    const needs = DailyNeedsTracker.getValues();
    this.topHudElements = [];
    this.topHudHoverTargets = [];
    this._topHudLeftGroups = [];
    this._topHudNeedWarnings = {};
    this._topHudLayoutConfig = {
      startX: 12,
      spacing,
      barHeight: H,
      measureTextWidth,
      moneyGap: 6,
    };

    const addLeftGroup = ({ icon, text = null, hover = null, minTextWidth = 0, iconGap = 4, visibleWhen = null, warningBg = null, warningKey = null }) => {
      this._topHudLeftGroups.push({
        icon,
        text,
        hover,
        minTextWidth,
        iconGap,
        visibleWhen,
        warningBg,
        warningKey,
      });
    };

    for (const item of needs) {
      const leftX = x;
      const warningBg = this.add.graphics().setVisible(false).setAlpha(0);
      const icon = makeIcon(x, item.key);
      x += iconSize + 4;
      const display = item.need ? `${item.have}/${item.need}` : `${item.have}`;
      const color = item.need ? (item.have >= item.need ? "#00ff00" : "#ff3333") : item.have > 0 ? "#00ff00" : "#ff3333";
      const text = makeText(x, display, color);
      x += text.width + spacing;

      if (item.key === "foodIcon") this.foodText = text;
      if (item.key === "waterIcon") this.waterText = text;
      if (item.key === "foodIcon") this._topHudNeedWarnings.food = { bg: warningBg, active: false, tween: null };
      if (item.key === "waterIcon") this._topHudNeedWarnings.water = { bg: warningBg, active: false, tween: null };

      this.topHudElements.push(warningBg, icon, text);
      const hover = registerHover(leftX, x - spacing, item.key === "foodIcon" ? "Food" : "Water");
      this.topHudHoverTargets.push(hover);
      addLeftGroup({
        icon,
        text,
        hover,
        minTextWidth: () => this._getTopHudScaledRatioWidth(text),
        warningBg,
        warningKey: item.key === "foodIcon" ? "food" : "water",
      });
    }

    const resources = [
      { key: "seeds", value: world.seeds },
      { key: "berry", value: world.berries },
      { key: "woodIcon", value: world.woodAmnt },
      { key: "stoneIcon", value: world.stoneAmnt },
    ];

    for (const r of resources) {
      const leftX = x;
      const icon = makeIcon(x, r.key);
      x += iconSize + 4;
      const text = makeText(x, `${r.value}`);
      x += text.width + spacing;

      switch (r.key) {
        case "seeds":
          this.seedsText = text;
          break;
        case "berry":
          this.berryText = text;
          break;
        case "woodIcon":
          this.woodText = text;
          break;
        case "stoneIcon":
          this.stoneText = text;
          break;
      }

      this.topHudElements.push(icon, text);
      const labelMap = {
        seeds: "Seeds",
        berry: "Berries",
        woodIcon: "Wood",
        stoneIcon: "Stone",
      };
      const hover = registerHover(leftX, x - spacing, labelMap[r.key] || r.key);
      this.topHudHoverTargets.push(hover);
      addLeftGroup({
        icon,
        text,
        hover,
        minTextWidth: () => this._getTopHudScaledCompactWidth(text),
      });
    }

    const permitLeftX = x;
    const permitIcon = makeEmojiIcon(x, "📜");
    x += permitIcon.width + 4;
    this.permitText = makeText(x, `${world.permits ?? 0}`);
    x += this.permitText.width + spacing;
    this.permitIcon = permitIcon;
    this.topHudElements.push(permitIcon, this.permitText);
    const permitHover = registerHover(permitLeftX, x - spacing, "Growth Permits");
    this.topHudHoverTargets.push(permitHover);
    addLeftGroup({
      icon: permitIcon,
      text: this.permitText,
      hover: permitHover,
      minTextWidth: () => this._getTopHudScaledCompactWidth(this.permitText),
    });

    const reliefLeftX = x;
    this.reliefPackageIcon = makeIcon(x, "relief_package");
    this.reliefPackageIcon.setVisible(false);
    x += iconSize + spacing;
    this.topHudElements.push(this.reliefPackageIcon);
    this.reliefPackageHoverTarget = registerHover(
      reliefLeftX,
      x - spacing,
      () => this._getReliefPackageHoverLabel()
    );
    this.reliefPackageHoverTarget.setVisible(false);
    if (this.reliefPackageHoverTarget.input) {
      this.reliefPackageHoverTarget.input.enabled = false;
    }
    this.topHudHoverTargets.push(this.reliefPackageHoverTarget);
    addLeftGroup({
      icon: this.reliefPackageIcon,
      hover: this.reliefPackageHoverTarget,
      visibleWhen: () => !!this.worldScene?.hasReliefPackage?.(),
    });

    const housingLeftX = x;
    const housingIcon = makeEmojiIcon(x, "🏠");
    x += housingIcon.width + 4;
    this.housingText = makeText(x, "0/0");
    x += this.housingText.width + spacing;
    this.housingIcon = housingIcon;
    this.topHudElements.push(housingIcon, this.housingText);
    const housingHover = registerHover(housingLeftX, x - spacing, () => this._getHousingHoverLabel());
    this.topHudHoverTargets.push(housingHover);
    addLeftGroup({
      icon: housingIcon,
      text: this.housingText,
      hover: housingHover,
      minTextWidth: () => this._getTopHudScaledRatioWidth(this.housingText),
    });

    const centerX = W / 2;
    const moneyLeftX = centerX - 30;
    const moneyIcon = makeIcon(centerX - 30, "monies");
    this.moneyIcon = moneyIcon;
    this.moneyText = makeText(centerX - 4, `$${world.money}`);
    this.moneyIconBaseScaleX = moneyIcon.scaleX;
    this.moneyIconBaseScaleY = moneyIcon.scaleY;
    this.moneyTextBaseScaleX = this.moneyText.scaleX;
    this.moneyTextBaseScaleY = this.moneyText.scaleY;
    this.topHudElements.push(moneyIcon, this.moneyText);
    this.moneyHoverTarget = registerHover(moneyLeftX, centerX - 4 + this.moneyText.width, "Money");
    this.topHudHoverTargets.push(this.moneyHoverTarget);

    this.topHud = this.add.container(0, 0, [shadow, bg, inset, shine, ...this.topHudElements]).setDepth(UIDEPTH);
    this._refreshTopHudValues(true);
    this._buildPauseMenuButton();
    this._layoutTopHudLeftGroups();
    this._trackScaleResize(({ width }) => {
      this._layoutTopHudLeftGroups(Number(width || this.scale?.width || 0));
    });
  }

  _setTopHudHoverBounds(target, leftX, rightX, height = 44) {
    if (!target) return;
    const width = Math.max(22, rightX - leftX);
    target.setPosition(leftX + width / 2, height / 2);
    target.setSize?.(width, height);
  }

  _getTopHudScaledRatioWidth(textNode) {
    const current = String(textNode?.text ?? "");
    const [haveRaw = "", needRaw = ""] = current.split("/");
    const getDigitCount = (value) => {
      const digitsOnly = String(value).replace(/\D/g, "");
      if (digitsOnly.length > 0) return digitsOnly.length;
      return Math.max(1, String(value).trim().length || 1);
    };
    const haveDigits = getDigitCount(haveRaw);
    const needDigits = getDigitCount(needRaw);
    const sample = `${"8".repeat(haveDigits)}/${"8".repeat(needDigits)}`;
    return Number(this._topHudLayoutConfig?.measureTextWidth?.(sample) || textNode?.width || 0);
  }

  _getTopHudScaledCompactWidth(textNode) {
    const current = String(textNode?.text ?? "");
    const digitsOnly = current.replace(/\D/g, "");
    const digitCount = Math.max(1, digitsOnly.length || current.trim().length || 1);
    const sample = `${"8".repeat(digitCount)}`;
    return Number(this._topHudLayoutConfig?.measureTextWidth?.(sample) || textNode?.width || 0);
  }

  _getTopHudNodeBounds(node, fallback = null) {
    if (!node) return typeof fallback === "function" ? fallback() : null;
    try {
      const bounds = node.getBounds?.();
      if (bounds && Number.isFinite(bounds.left) && Number.isFinite(bounds.right)) {
        return bounds;
      }
    } catch {}
    return typeof fallback === "function" ? fallback() : null;
  }

  _getTopHudRightOccupiedLeft(width = Number(this.scale?.width || 0)) {
    const leftEdges = [];
    const pushLeft = (value) => {
      if (!Number.isFinite(value)) return;
      leftEdges.push(value);
    };

    const phaseClockBounds = this._getTopHudNodeBounds(this.phaseClock, () => {
      const panelWidth = Number(this.phaseClock?.panelWidth || 0);
      if (!(panelWidth > 0) || !(width > 0)) return null;
      return {
        left: width - panelWidth - 18,
        right: width - 18,
      };
    });
    pushLeft(phaseClockBounds?.left);

    const pauseBounds = this._getTopHudNodeBounds(this.pauseMenuButton, () => {
      if (!(width > 0)) return null;
      const centerX = Math.round(width - 34);
      return {
        left: centerX - 21,
        right: centerX + 21,
      };
    });
    pushLeft(pauseBounds?.left);

    if (!leftEdges.length) return Math.max(12, width - 12);
    return Math.min(...leftEdges);
  }

  _layoutTopHudMoneyGroup(leftFlowRight = 0, layoutWidth = Number(this.scale?.width || 0)) {
    if (!this.moneyIcon || !this.moneyText) return;

    const width = Number(layoutWidth || this.scale?.width || 0);
    const iconWidth = Number(this.moneyIcon.displayWidth || this.moneyIcon.width || 0);
    const textWidth = Number(this.moneyText.width || 0);
    const moneyGap = Number(this._topHudLayoutConfig?.moneyGap || 6);
    const totalWidth = iconWidth + moneyGap + textWidth;
    const pureCenterIconX = (width - totalWidth) * 0.5;
    const leftLimit = Math.max(12, Number(leftFlowRight || 0) + 16);
    const rightOccupiedLeft = Math.max(leftLimit, this._getTopHudRightOccupiedLeft(width) - 12);
    const gapWidth = Math.max(0, rightOccupiedLeft - leftLimit);

    let iconX;
    if (gapWidth >= totalWidth) {
      iconX = Phaser.Math.Clamp(pureCenterIconX, leftLimit, rightOccupiedLeft - totalWidth);
    } else {
      const gapCenter = leftLimit + (gapWidth * 0.5);
      iconX = gapCenter - (totalWidth * 0.5);
      iconX = Phaser.Math.Clamp(iconX, 12, Math.max(12, width - 12 - totalWidth));
    }

    this.moneyIcon.setX(iconX);
    this.moneyText.setX(iconX + iconWidth + moneyGap);

    if (this.moneyHoverTarget) {
      this._setTopHudHoverBounds(
        this.moneyHoverTarget,
        iconX,
        this.moneyText.x + this.moneyText.width,
        Number(this._topHudLayoutConfig?.barHeight || 44)
      );
    }
  }

  _layoutTopHudLeftGroups(layoutWidth = Number(this.scale?.width || 0)) {
    if (!this._topHudLeftGroups?.length) return;

    const {
      startX = 12,
      spacing = 8,
      barHeight = 44,
    } = this._topHudLayoutConfig || {};

    let x = startX;
    for (const group of this._topHudLeftGroups) {
      const isVisible = typeof group.visibleWhen === "function" ? !!group.visibleWhen() : true;
      group.icon?.setVisible(isVisible);
      group.text?.setVisible(isVisible);

      if (!isVisible) {
        group.hover?.setVisible(false);
        if (group.hover?.input) group.hover.input.enabled = false;
        continue;
      }

      const leftX = x;
      group.icon?.setX(x);
      const iconWidth = Number(group.icon?.displayWidth || group.icon?.width || 0);
      x += iconWidth + Number(group.iconGap ?? 4);

      let textRightX = x;
      if (group.text) {
        group.text.setX(x);
        const resolvedMinWidth = typeof group.minTextWidth === "function"
          ? Number(group.minTextWidth(group) || 0)
          : Number(group.minTextWidth || 0);
        textRightX = x + Math.max(Number(group.text.width || 0), resolvedMinWidth);
        x = textRightX;
      }

      this._layoutTopHudNeedWarning(group, leftX, textRightX, barHeight);
      x += spacing;

      if (group.hover) {
        this._setTopHudHoverBounds(group.hover, leftX, x - spacing, barHeight);
        group.hover.setVisible(true);
        if (group.hover.input) group.hover.input.enabled = true;
      }
    }

    this._layoutTopHudMoneyGroup(x - spacing, layoutWidth);
  }

  _layoutTopHudNeedWarning(group, leftX, rightX, barHeight = 44) {
    const bg = group?.warningBg;
    if (!bg) return;

    const warning = this._topHudNeedWarnings?.[group.warningKey];
    const visible = !!warning?.active && group.icon?.visible !== false && group.text?.visible !== false;
    bg.clear();
    bg.setVisible(visible);
    if (!visible) return;

    const padX = 5;
    const bgHeight = Math.max(24, Math.min(30, Number(barHeight || 44) - 14));
    const bgY = Math.round((Number(barHeight || 44) - bgHeight) / 2);
    const width = Math.max(40, Math.ceil(rightX - leftX) + padX * 2);
    bg.fillStyle(0x8f1111, 1);
    bg.fillRoundedRect(Math.floor(leftX - padX), bgY, width, bgHeight, 9);
    bg.lineStyle(1.5, 0xff8b8b, 0.62);
    bg.strokeRoundedRect(Math.floor(leftX - padX), bgY, width, bgHeight, 9);
  }

  _setTopHudNeedWarning(key, shouldWarn = false) {
    const warning = this._topHudNeedWarnings?.[key];
    const bg = warning?.bg;
    if (!bg) return;

    const active = !!shouldWarn;
    if (warning.active === active) return;

    warning.active = active;
    warning.tween?.remove?.();
    warning.tween = null;

    if (!active) {
      bg.setVisible(false);
      bg.setAlpha(0);
      return;
    }

    bg.setVisible(true);
    bg.setAlpha(0.24);
    warning.tween = this.tweens.add({
      targets: bg,
      alpha: { from: 0.22, to: 0.64 },
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  _clearTopHudNeedWarningTweens() {
    for (const warning of Object.values(this._topHudNeedWarnings || {})) {
      warning?.tween?.remove?.();
      if (warning) warning.tween = null;
      warning?.bg?.setVisible?.(false);
      warning?.bg?.setAlpha?.(0);
    }
    this._topHudNeedWarnings = {};
  }

  _getTopHudNeedCount() {
    return DailyNeedsTracker.getNeedCount?.("1") ?? (Teams.teamLists?.["1"]?.playerList?.length || 0);
  }

  _getHousingHoverLabel() {
    const stats = Teams.getHousingStatus?.("1") ?? {
      playerCount: 0,
      capacity: 0,
      homelessCount: 0,
      descriptor: "Empty",
    };
    if (stats.homelessCount > 0) {
      return `Housing: ${stats.playerCount}/${stats.capacity}\n${stats.homelessCount} homeless`;
    }
    return `Housing: ${stats.playerCount}/${stats.capacity}\n${stats.descriptor}`;
  }

  _getReliefPackageHoverLabel() {
    if (!this.worldScene?.hasReliefPackage?.()) return "";
    return `Relief Package Ready\nEmergency storage recovery armed`;
  }

  _refreshTopHudValues(force = false) {
    if (!this.worldScene || this._sceneShuttingDown) return;

    const needCount = this._getTopHudNeedCount();
    const housing = Teams.getHousingStatus?.("1") ?? {
      playerCount: needCount,
      capacity: 0,
      homelessCount: 0,
      descriptor: "Empty",
    };
    const snapshot = {
      food: Number(this.worldScene.foodAmnt ?? 0),
      water: Number(this.worldScene.cleanWaterAmnt ?? 0),
      seeds: Number(this.worldScene.seeds ?? 0),
      berries: Number(this.worldScene.berries ?? 0),
      wood: Number(this.worldScene.woodAmnt ?? 0),
      stone: Number(this.worldScene.stoneAmnt ?? 0),
      permits: Number(this.worldScene.permits ?? 0),
      money: Number(this.worldScene.money ?? 0),
      reliefPackageCount: Math.max(0, Number(this.worldScene.getReliefPackageCount?.() ?? 0)),
      needCount,
      housingPlayers: Number(housing.playerCount ?? needCount),
      housingCapacity: Number(housing.capacity ?? 0),
      homelessCount: Number(housing.homelessCount ?? 0),
      housingDescriptor: housing.descriptor ?? "Empty",
    };

    const nextSig = JSON.stringify(snapshot);
    if (!force && nextSig === this._topHudValueSignature) return;
    this._topHudValueSignature = nextSig;

    this._mutateText(this.foodText, (node) => {
      node.setText(`${snapshot.food}/${snapshot.needCount}`);
      node.setColor(snapshot.food >= snapshot.needCount ? "#00ff00" : "#ff3333");
    });
    this._mutateText(this.waterText, (node) => {
      node.setText(`${snapshot.water}/${snapshot.needCount}`);
      node.setColor(snapshot.water >= snapshot.needCount ? "#00ff00" : "#ff3333");
    });
    const hasNeed = snapshot.needCount > 0;
    this._setTopHudNeedWarning("food", hasNeed && snapshot.food < snapshot.needCount);
    this._setTopHudNeedWarning("water", hasNeed && snapshot.water < snapshot.needCount);
    this._mutateText(this.seedsText, (node) => node.setText(`${snapshot.seeds}`));
    this._mutateText(this.berryText, (node) => node.setText(`${snapshot.berries}`));
    this._mutateText(this.woodText, (node) => node.setText(`${snapshot.wood}`));
    this._mutateText(this.stoneText, (node) => node.setText(`${snapshot.stone}`));
    this._mutateText(this.permitText, (node) => node.setText(`${snapshot.permits}`));
    const hasReliefPackage = snapshot.reliefPackageCount > 0;
    if (this.reliefPackageIcon) {
      this.reliefPackageIcon.setVisible(hasReliefPackage);
      this.reliefPackageIcon.setAlpha(hasReliefPackage ? 1 : 0);
    }
    if (this.reliefPackageHoverTarget) {
      this.reliefPackageHoverTarget.setVisible(hasReliefPackage);
      if (this.reliefPackageHoverTarget.input) {
        this.reliefPackageHoverTarget.input.enabled = hasReliefPackage;
      }
      if (!hasReliefPackage) {
        this._hideTopHudHover(true);
      }
    }
    this._mutateText(this.housingText, (node) => {
      node.setText(`${snapshot.housingPlayers}/${snapshot.housingCapacity}`);
      const housingColor =
        snapshot.homelessCount > 0 ? "#ff6666" :
        snapshot.housingCapacity <= 0 ? "#ff8888" :
        snapshot.housingPlayers >= snapshot.housingCapacity ? "#ffd166" :
        snapshot.housingCapacity - snapshot.housingPlayers === 1 ? "#ffe599" :
        "#8ef0b8";
      node.setColor(housingColor);
    });
    this._mutateText(this.moneyText, (node) => node.setText(`$${snapshot.money}`));
    this._layoutTopHudLeftGroups();
  }

  _buildTownXpHud() {
    if (this.townXpHud) return;

    const root = this.add.container(0, 0).setDepth(UIDEPTH + 14);
    const shadow = this.add.graphics();
    const bg = this.add.graphics();
    const shine = this.add.graphics();
    const track = this.add.graphics();
    const fill = this.add.graphics();
    const fillGlow = this.add.graphics().setAlpha(0.26);
    const badgeBg = this.add.graphics();
    const pendingBg = this.add.graphics();
    const goalsBg = this.add.graphics();
    const levelText = this.add.text(0, -11, "", {
      fontFamily: "Bungee",
      fontSize: "17px",
      color: "#f6fcff",
      stroke: "#07111b",
      strokeThickness: 4,
    }).setOrigin(0.5);
    const detailText = this.add.text(0, 12, "", {
      fontFamily: "Bungee",
      fontSize: "10px",
      color: "#d9f3ff",
      stroke: "#07111b",
      strokeThickness: 3,
    }).setOrigin(0.5);
    const badgeText = this.add.text(0, 0, "", {
      fontFamily: "Bungee",
      fontSize: "11px",
      color: "#0c2b3f",
      stroke: "#f8feff",
      strokeThickness: 2,
    }).setOrigin(0.5);
    const pendingText = this.add.text(0, 0, "", {
      fontFamily: "Bungee",
      fontSize: "9px",
      color: "#12324a",
      stroke: "#fffdf4",
      strokeThickness: 2,
    }).setOrigin(0.5);
    const goalsText = this.add.text(0, 0, "", {
      fontFamily: "Bungee",
      fontSize: "9px",
      color: "#d9f3ff",
      stroke: "#07111b",
      strokeThickness: 2,
    }).setOrigin(0.5);
    const hitZone = this.add.zone(0, 0, 10, 10).setOrigin(0.5).setInteractive({ useHandCursor: true });

    root.add([shadow, bg, shine, track, fillGlow, fill, badgeBg, pendingBg, goalsBg, levelText, detailText, badgeText, pendingText, goalsText, hitZone]);
    root.shadow = shadow;
    root.bg = bg;
    root.shine = shine;
    root.track = track;
    root.fill = fill;
    root.fillGlow = fillGlow;
    root.badgeBg = badgeBg;
    root.pendingBg = pendingBg;
    root.goalsBg = goalsBg;
    root.levelText = levelText;
    root.detailText = detailText;
    root.badgeText = badgeText;
    root.pendingText = pendingText;
    root.goalsText = goalsText;
    root.hitZone = hitZone;
    root.panelWidth = 0;
    root.panelHeight = 0;
    root.trackWidth = 0;
    root.progressRatio = 0;
    root.displayedProgressRatio = null;
    root._progressTween = null;
    root._progressAnimState = null;
    root._progressRendered = false;
    root._lastRenderedGainSerial = 0;
    root._lastRenderedTownLevel = null;

    hitZone.disableInteractive();

    const layout = (noticeCount = 0) => {
      const maxUsableWidth = Math.max(300, this.scale.width - 36);
      const width = Math.round(Math.min(maxUsableWidth, 430));
      const height = 65;
      root.panelWidth = width;
      root.panelHeight = height;
      root.trackWidth = Math.max(180, width - 108);
      root.trackLeft = -(width / 2) + 88;

      root.setPosition(Math.round((width / 2) + 18), Math.round(42 + 10 + (height / 2)));
      badgeText.setPosition(-(width / 2) + 43, 0);
      levelText.setPosition(root.trackLeft + root.trackWidth / 2, -13);
      detailText.setPosition(root.trackLeft + root.trackWidth / 2, 23);
      pendingText.setPosition((width / 2) - 54, 0);
      goalsText.setPosition((width / 2) - 54, 18);
      hitZone.setSize(width, height);

      shadow.clear();
      shadow.fillStyle(0x03101a, 0.28);
      shadow.fillRoundedRect(-(width / 2), -(height / 2) + 8, width, height, 24);

      bg.clear();
      bg.fillStyle(0x113048, 0.94);
      bg.lineStyle(2, 0x9edfff, 0.22);
      bg.fillRoundedRect(-(width / 2), -(height / 2), width, height, 24);
      bg.strokeRoundedRect(-(width / 2), -(height / 2), width, height, 24);

      shine.clear();
      shine.fillStyle(0xffffff, 0.08);
      shine.fillRoundedRect(-(width / 2) + 10, -(height / 2) + 8, width - 20, 18, 12);

      badgeBg.clear();
      badgeBg.fillStyle(0xbbefff, 0.98);
      badgeBg.lineStyle(2, 0xffffff, 0.22);
      badgeBg.fillRoundedRect(-(width / 2) + 14, -16, 58, 32, 16);
      badgeBg.strokeRoundedRect(-(width / 2) + 14, -16, 58, 32, 16);

      pendingBg.clear();
      pendingBg.fillStyle(0xffefc2, 0.94);
      pendingBg.lineStyle(2, 0xffffff, 0.20);
      pendingBg.fillRoundedRect((width / 2) - 88, -14, 68, 28, 14);
      pendingBg.strokeRoundedRect((width / 2) - 88, -14, 68, 28, 14);

      goalsBg.clear();
      goalsBg.fillStyle(noticeCount > 0 ? 0xffe58a : 0x153246, noticeCount > 0 ? 0.96 : 0.92);
      goalsBg.lineStyle(2, noticeCount > 0 ? 0xffffff : 0xbdefff, noticeCount > 0 ? 0.24 : 0.16);
      goalsBg.fillRoundedRect((width / 2) - 96, 8, 84, 18, 9);
      goalsBg.strokeRoundedRect((width / 2) - 96, 8, 84, 18, 9);
      goalsBg.setVisible(false);
      goalsText.setVisible(false);
    };

    const drawProgress = (progress, xp) => {
      const ratio = Math.max(0, Math.min(1, Number(progress || 0)));
      root.displayedProgressRatio = ratio;

      const width = root.trackWidth;
      const left = Number.isFinite(root.trackLeft) ? root.trackLeft : (-(width / 2) + 72);
      const top = 7;
      const trackHeight = 14;

      const segmentCount = xp.level >= 7 ? 10 : xp.level >= 4 ? 8 : 5;
      const gap = 3;
      const innerLeft = left + 2;
      const innerTop = top + 2;
      const innerWidth = Math.max(0, width - 4);
      const innerHeight = trackHeight - 4;
      const segmentWidth = Math.max(8, (innerWidth - (gap * (segmentCount - 1))) / segmentCount);
      const fillSegments = ratio * segmentCount;

      track.clear();
      track.fillStyle(0x0a1a27, 0.82);
      track.lineStyle(2, 0xffffff, 0.10);
      track.fillRoundedRect(left, top, width, trackHeight, 8);
      track.strokeRoundedRect(left, top, width, trackHeight, 8);
      for (let i = 0; i < segmentCount; i += 1) {
        const x = innerLeft + i * (segmentWidth + gap);
        track.fillStyle(0x102d42, 0.92);
        track.fillRoundedRect(x, innerTop, segmentWidth, innerHeight, 4);
        track.lineStyle(1, 0xbdefff, 0.12);
        track.strokeRoundedRect(x, innerTop, segmentWidth, innerHeight, 4);
      }

      fill.clear();
      if (ratio > 0) {
        fill.fillStyle(xp.pendingLevelRewards > 0 ? 0xffd785 : 0x78e6ff, 0.96);
        for (let i = 0; i < segmentCount; i += 1) {
          const segmentRatio = Phaser.Math.Clamp(fillSegments - i, 0, 1);
          if (segmentRatio <= 0) continue;
          const x = innerLeft + i * (segmentWidth + gap);
          fill.fillRoundedRect(x, innerTop, segmentWidth * segmentRatio, innerHeight, 4);
        }
      }

      fillGlow.clear();
      if (ratio > 0) {
        const glowX = innerLeft + Math.min(innerWidth - 18, Math.max(0, innerWidth * ratio - 9));
        fillGlow.fillStyle(xp.pendingLevelRewards > 0 ? 0xfff1b5 : 0xbdefff, xp.pendingLevelRewards > 0 ? 0.28 : 0.18);
        fillGlow.fillRoundedRect(glowX, top - 3, 18, trackHeight + 6, 9);
      }
    };

    root.refresh = (force = false) => {
      const xp = this.worldScene?.getTownXpSnapshot?.();
      if (!xp) return;

      const signature = [
        this.scale.width,
        xp.level,
        xp.xpIntoLevel,
        xp.xpForNextLevel,
        xp.pendingLevelRewards,
        xp.gainSerial,
        Teams.teamLists?.["1"]?.name || "",
      ].join("|");
      if (!force && signature === this._townXpHudSignature) return;
      this._townXpHudSignature = signature;

      layout();

      const progress = Math.max(0, Math.min(1, Number(xp.progress || 0)));
      root.progressRatio = progress;

      const firstProgressDraw = !root._progressRendered || root.displayedProgressRatio == null;
      const xpChanged = xp.gainSerial !== root._lastRenderedGainSerial;
      const levelChanged = root._lastRenderedTownLevel != null && xp.level !== root._lastRenderedTownLevel;
      const shouldAnimateProgress = !force && !firstProgressDraw && xpChanged;

      root._progressTween?.stop?.();
      root._progressTween = null;
      root._progressAnimState = null;

      if (shouldAnimateProgress) {
        const startProgress = levelChanged && progress < root.displayedProgressRatio
          ? 0
          : Math.max(0, Math.min(1, Number(root.displayedProgressRatio || 0)));

        root._progressAnimState = { value: startProgress };
        drawProgress(startProgress, xp);
        root._progressTween = this.tweens.add({
          targets: root._progressAnimState,
          value: progress,
          duration: 540,
          ease: "Cubic.easeOut",
          onUpdate: () => drawProgress(root._progressAnimState.value, xp),
          onComplete: () => {
            drawProgress(progress, xp);
            root._progressTween = null;
            root._progressAnimState = null;
          },
        });
      } else {
        drawProgress(progress, xp);
      }
      root._progressRendered = true;
      root._lastRenderedGainSerial = xp.gainSerial;
      root._lastRenderedTownLevel = xp.level;

      const rawTownName = String(Teams.teamLists?.["1"]?.name || "").trim();
      const townName = rawTownName
        ? (rawTownName.length > 18 ? `${rawTownName.slice(0, 17)}...` : rawTownName)
        : "Home";
      levelText.setText(`Town ${townName}`);
      detailText.setText(
        xp.pendingLevelRewards > 0
          ? `${xp.xpIntoLevel}/${xp.xpForNextLevel} XP  •  reward ready`
          : `${xp.xpIntoLevel}/${xp.xpForNextLevel} XP to next reward`
      );

      goalsText.setText("");
      detailText.setText(
        xp.pendingLevelRewards > 0
          ? `Level ${xp.level} - ${xp.xpIntoLevel}/${xp.xpForNextLevel} XP - reward ready`
          : `Level ${xp.level} - ${xp.xpIntoLevel}/${xp.xpForNextLevel} XP to next reward`
      );
      goalsText.setText("");

      badgeText.setText(`LV ${xp.level}`);
      detailText.setText(
        xp.pendingLevelRewards > 0
          ? `${xp.xpIntoLevel}/${xp.xpForNextLevel} XP - REWARD READY`
          : `${xp.xpIntoLevel}/${xp.xpForNextLevel} XP`
      );
      goalsText.setColor("#d9f3ff");
      goalsText.setText("");

      pendingBg.setVisible(false);
      pendingText.setVisible(false);
      pendingText.setText("");

      if (xp.gainSerial !== this._townXpLastGainSerial) {
        if (this._townXpLastGainSerial !== 0) {
          this._playTownXpGainFx(xp);
          if (levelChanged) {
            this._playTownLevelUpFx(xp);
          }
        }
        this._townXpLastGainSerial = xp.gainSerial;
      }
    };

    this._trackScaleResize(() => root.refresh(true));
    this.townXpHud = root;
    root.refresh(true);
  }

  _playTownXpGainFx(xp) {
    const root = this.townXpHud;
    if (!root || this._sceneShuttingDown) return;
    const gainAmount = Math.max(0, Number(xp?.lastGainAmount || 0));
    const impactDelay = this._getHudGainImpactDelay(gainAmount, {
      base: 480,
      stepAmount: 4,
      stepDelay: 18,
      min: 420,
      max: 680,
    });

    this.tweens.killTweensOf(root);
    root.setScale(1);
    this.tweens.add({
      targets: root,
      scaleX: 1.03,
      scaleY: 1.03,
      duration: 120,
      ease: "Sine.Out",
      yoyo: true,
    });

    this._playTownXpSourceParticles(xp, root);
    this.time?.delayedCall?.(impactDelay, () => {
      if (this._sceneShuttingDown) return;
      AudioManager.playTownXpGain(gainAmount);
    });

    const shouldShowLabel =
      gainAmount >= 8
      || Math.max(0, Number(xp?.pendingLevelRewards || 0)) > 0
      || !/raider defeated/i.test(String(xp?.lastGainLabel || ""));
    if (!shouldShowLabel) return;

    const label = this.add.text(root.x - (root.panelWidth / 2) + 18, root.y - 32, `+${gainAmount} XP`, {
      fontFamily: "Bungee",
      fontSize: "12px",
      color: xp?.pendingLevelRewards > 0 ? "#fff0c9" : "#8fe7ff",
      stroke: "#07111b",
      strokeThickness: 3,
    }).setOrigin(0, 0.5).setDepth((UIDEPTH ?? 0) + 16);

    this.tweens.add({
      targets: label,
      y: label.y - 18,
      alpha: 0,
      duration: 640,
      ease: "Cubic.easeOut",
      onComplete: () => label.destroy(),
    });
  }

  _playTownLevelUpFx(xp) {
    const root = this.townXpHud;
    if (!root || this._sceneShuttingDown) return;

    const badgeText = root.badgeText;
    const badgeBg = root.badgeBg;
    const badgeWidth = 58;
    const badgeHeight = 32;
    const badgeLeft = -(Number(root.panelWidth || 248) / 2) + 14;
    const badgeTop = -16;
    const badgeBurst = this.add.graphics()
      .setPosition(root.x, root.y)
      .setDepth((UIDEPTH ?? 0) + 18)
      .setAlpha(0)
      .setScale(0.86);

    badgeBurst.fillStyle(0xffefb0, 0.18);
    badgeBurst.lineStyle(3, 0xfff7d1, 0.9);
    badgeBurst.fillRoundedRect(badgeLeft, badgeTop, badgeWidth, badgeHeight, 18);
    badgeBurst.strokeRoundedRect(badgeLeft, badgeTop, badgeWidth, badgeHeight, 18);
    badgeBurst.setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.killTweensOf(root);
    root.setScale(1);
    this.tweens.add({
      targets: root,
      scaleX: 1.06,
      scaleY: 1.06,
      duration: 180,
      ease: "Back.Out",
      yoyo: true,
    });

    if (badgeText) {
      this.tweens.killTweensOf(badgeText);
      badgeText.setScale(1);
      this.tweens.add({
        targets: badgeText,
        scaleX: 1.28,
        scaleY: 1.28,
        duration: 180,
        ease: "Back.Out",
        yoyo: true,
        repeat: 1,
      });
    }

    if (badgeBg) {
      this.tweens.killTweensOf(badgeBg);
      badgeBg.setAlpha(1);
      this.tweens.add({
        targets: badgeBg,
        alpha: 0.66,
        duration: 170,
        ease: "Sine.Out",
        yoyo: true,
        repeat: 1,
      });
    }

    this.tweens.add({
      targets: badgeBurst,
      alpha: { from: 0.96, to: 0 },
      scaleX: 1.26,
      scaleY: 1.26,
      duration: 560,
      ease: "Cubic.easeOut",
      onComplete: () => badgeBurst.destroy(),
    });

    AudioManager.playTownLevelUp({
      volume: Math.max(0.3, Math.min(0.44, 0.32 + (Math.max(1, Number(xp?.level || 1)) * 0.002))),
    });
  }

  _getHudGainImpactDelay(amount = 0, opts = {}) {
    const normalized = Math.max(1, Number(amount || 0));
    const base = Number(opts.base ?? 480);
    const stepAmount = Math.max(1, Number(opts.stepAmount ?? 8));
    const stepDelay = Number(opts.stepDelay ?? 18);
    const min = Number(opts.min ?? 380);
    const max = Number(opts.max ?? 700);
    return Phaser.Math.Clamp(
      base + Math.floor(normalized / stepAmount) * stepDelay,
      min,
      max
    );
  }

  _playTownXpSourceParticles(xp, root) {
    const source = xp?.lastGainSource;
    if (!root || !source || !this.textures?.exists?.("player_death")) return;

    const cam = this.worldScene?.cameras?.main;
    const sourceX = Number(source.x);
    const sourceY = Number(source.y);
    if (!cam || !Number.isFinite(sourceX) || !Number.isFinite(sourceY)) return;

    const screenW = Math.max(1, Number(this.scale?.width || 1));
    const screenH = Math.max(1, Number(this.scale?.height || 1));
    const rawStartX = (sourceX - Number(cam.scrollX || 0)) * Number(cam.zoom || 1) + Number(cam.x || 0);
    const rawStartY = (sourceY - Number(cam.scrollY || 0)) * Number(cam.zoom || 1) + Number(cam.y || 0);
    const startX = Phaser.Math.Clamp(rawStartX, 18, screenW - 18);
    const startY = Phaser.Math.Clamp(rawStartY, 18, screenH - 18);
    const targetRatio = Math.max(0.08, Math.min(0.96, Number(root.progressRatio || 0.1)));
    const targetX = root.x + Number(root.trackLeft || 0) + (Number(root.trackWidth || 180) * targetRatio);
    const targetY = root.y + 14;
    const depth = (UIDEPTH ?? 0) + 32;
    const gainAmount = Math.max(0, Number(xp?.lastGainAmount || 0));
    const count = Math.max(5, Math.min(10, 5 + Math.floor(gainAmount / 2)));
    const impactDelay = this._getHudGainImpactDelay(gainAmount, {
      base: 480,
      stepAmount: 4,
      stepDelay: 18,
      min: 420,
      max: 680,
    });

    for (let i = 0; i < count; i += 1) {
      const shard = this.add.sprite(
        startX + Phaser.Math.Between(-10, 10),
        startY + Phaser.Math.Between(-10, 10),
        "player_death",
        Phaser.Math.Between(0, 5)
      )
        .setDepth(depth)
        .setScale(Phaser.Math.FloatBetween(0.28, 0.46))
        .setAlpha(Phaser.Math.FloatBetween(0.55, 0.88))
        .setBlendMode(Phaser.BlendModes.ADD);

      this.tweens.add({
        targets: shard,
        x: targetX + Phaser.Math.Between(-10, 10),
        y: targetY + Phaser.Math.Between(-5, 5),
        scale: 0.12,
        alpha: 0,
        angle: Phaser.Math.Between(-35, 35),
        delay: i * 32,
        duration: Phaser.Math.Between(560, 820),
        ease: "Cubic.easeInOut",
        onComplete: () => shard.destroy(),
      });
    }

    const spark = this.add.circle(targetX, targetY, 3, xp?.pendingLevelRewards > 0 ? 0xffe1a8 : 0x8fe7ff, 0.75)
      .setDepth(depth + 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0)
      .setScale(0.2);
    this.tweens.add({
      targets: spark,
      scale: { from: 0.2, to: 3.1 },
      alpha: { from: 0.78, to: 0 },
      delay: impactDelay,
      duration: 280,
      ease: "Quad.easeOut",
      onComplete: () => spark.destroy(),
    });
  }

  _getUiPoint(target) {
    if (!target) return null;
    const bounds = target.getBounds?.();
    if (bounds && Number.isFinite(bounds.centerX) && Number.isFinite(bounds.centerY)) {
      return { x: bounds.centerX, y: bounds.centerY };
    }

    let x = Number(target.x);
    let y = Number(target.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    let parent = target.parentContainer || null;
    while (parent) {
      x += Number(parent.x || 0);
      y += Number(parent.y || 0);
      parent = parent.parentContainer || null;
    }
    return { x, y };
  }

  _getMoneyHudTargetPoint() {
    const textPoint = this._getUiPoint(this.moneyText);
    const iconPoint = this._getUiPoint(this.moneyIcon);
    if (textPoint && iconPoint) {
      return {
        x: Math.round(((textPoint.x + iconPoint.x) * 0.5) + 4),
        y: Math.round((textPoint.y + iconPoint.y) * 0.5),
      };
    }
    return textPoint || iconPoint || { x: Math.round(this.scale.width * 0.5), y: 24 };
  }

  _resolveMoneyFxSource(opts = {}) {
    if (Number.isFinite(opts?.sourceUiX) && Number.isFinite(opts?.sourceUiY)) {
      return { x: opts.sourceUiX, y: opts.sourceUiY };
    }

    const uiTargetPoint = this._getUiPoint(opts?.sourceUiTarget);
    if (uiTargetPoint) return uiTargetPoint;

    const cam = this.worldScene?.cameras?.main;
    const sourceX = Number(opts?.sourceWorldX);
    const sourceY = Number(opts?.sourceWorldY);
    if (!cam || !Number.isFinite(sourceX) || !Number.isFinite(sourceY)) return null;

    return {
      x: Phaser.Math.Clamp(
        (sourceX - Number(cam.scrollX || 0)) * Number(cam.zoom || 1) + Number(cam.x || 0),
        18,
        Math.max(18, Number(this.scale?.width || 1) - 18)
      ),
      y: Phaser.Math.Clamp(
        (sourceY - Number(cam.scrollY || 0)) * Number(cam.zoom || 1) + Number(cam.y || 0),
        18,
        Math.max(18, Number(this.scale?.height || 1) - 18)
      ),
    };
  }

  _playMoneySourceParticles(amountDelta, opts = {}) {
    if (this._sceneShuttingDown || !(amountDelta > 0)) return;

    const source = this._resolveMoneyFxSource(opts);
    if (!source) return;

    const target = this._getMoneyHudTargetPoint();
    const impactDelay = this._getHudGainImpactDelay(amountDelta, {
      base: 500,
      stepAmount: 25,
      stepDelay: 18,
      min: 440,
      max: 720,
    });
    const count = Math.max(6, Math.min(14, 5 + Math.floor(Number(amountDelta || 0) / 25)));
    const depth = (UIDEPTH ?? 0) + 160;
    const palette = [0xfacc15, 0xfbbf24, 0xfde68a];

    for (let i = 0; i < count; i += 1) {
      const shard = this.add.circle(
        source.x + Phaser.Math.Between(-10, 10),
        source.y + Phaser.Math.Between(-10, 10),
        Phaser.Math.Between(4, 7),
        Phaser.Utils.Array.GetRandom(palette),
        Phaser.Math.FloatBetween(0.68, 0.94)
      )
        .setDepth(depth)
        .setBlendMode(Phaser.BlendModes.ADD);

      this.tweens.add({
        targets: shard,
        x: target.x + Phaser.Math.Between(-10, 10),
        y: target.y + Phaser.Math.Between(-6, 6),
        scaleX: 0.3,
        scaleY: 0.3,
        alpha: 0,
        delay: i * 34,
        duration: Phaser.Math.Between(760, 1120),
        ease: "Cubic.easeInOut",
        onComplete: () => shard.destroy(),
      });
    }

    const spark = this.add.circle(target.x, target.y, 4, 0xfff1a8, 0.82)
      .setDepth(depth + 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.2)
      .setAlpha(0);
    this.tweens.add({
      targets: spark,
      scaleX: { from: 0.2, to: 2.8 },
      scaleY: { from: 0.2, to: 2.8 },
      alpha: { from: 0.82, to: 0 },
      delay: impactDelay,
      duration: 260,
      ease: "Quad.easeOut",
      onComplete: () => spark.destroy(),
    });
  }

  _pulseMoneyHud(color = "#facc15") {
    const icon = this.moneyIcon;
    const text = this.moneyText;
    const targets = [text, icon].filter(Boolean);
    if (!targets.length) return;

    const iconBaseScaleX = Number(this.moneyIconBaseScaleX ?? icon?.scaleX ?? 1);
    const iconBaseScaleY = Number(this.moneyIconBaseScaleY ?? icon?.scaleY ?? 1);
    const textBaseScaleX = Number(this.moneyTextBaseScaleX ?? text?.scaleX ?? 1);
    const textBaseScaleY = Number(this.moneyTextBaseScaleY ?? text?.scaleY ?? 1);

    if (text) {
      this.tweens.killTweensOf(text);
      text.setScale(textBaseScaleX, textBaseScaleY);
    }
    if (icon) {
      this.tweens.killTweensOf(icon);
      icon.setScale(iconBaseScaleX, iconBaseScaleY);
    }

    this.moneyIcon?.setTint?.(0xfacc15);
    if (text) {
      this.tweens.add({
        targets: text,
        scaleX: textBaseScaleX * 1.08,
        scaleY: textBaseScaleY * 1.08,
        duration: 130,
        ease: "Sine.Out",
        yoyo: true,
      });
    }
    if (icon) {
      this.tweens.add({
        targets: icon,
        scaleX: iconBaseScaleX * 1.08,
        scaleY: iconBaseScaleY * 1.08,
        duration: 130,
        ease: "Sine.Out",
        yoyo: true,
        onComplete: () => {
          if (icon?.active) icon.setScale(iconBaseScaleX, iconBaseScaleY);
        },
      });
    }
    this._mutateText(this.moneyText, (node) => node.setFill(color));
    this.time.delayedCall(650, () => {
      this.moneyIcon?.clearTint?.();
      this._mutateText(this.moneyText, (node) => node.setFill("#ffffff"));
    });
  }

  _refreshTownXpHud(force = false) {
    this.townXpHud?.refresh?.(force);
  }

  _buildAchievementBoard() {
    if (this.achievementBoard || !this.worldScene) return;
    this.achievementBoard = new AchievementBoard(this, this.worldScene);
    if (!this._gameplayUiReady) {
      this.achievementBoard.hideUntilDetailed?.();
      this._achievementBoardAwaitingDetailedReveal = true;
    }
    this.townXpHud?.refresh?.(true);
  }

  _maybeRevealAchievementBoardAfterDetailed(mode = null, duration = 180) {
    if (!this.achievementBoard || !this._gameplayUiReady || !this._achievementBoardAwaitingDetailedReveal) return;
    const nextMode = mode || this.worldScene?.zoomMixer?.mode || "detailed";
    if (nextMode !== "detailed" || !this._isDetailedMode()) return;

    const revealDelay = Math.max(0, Number(duration || 0));
    this._achievementBoardRevealTimer?.remove?.(false);
    this._achievementBoardRevealTimer = this.time.delayedCall(revealDelay, () => {
      if (!this.achievementBoard || !this._isDetailedMode()) return;
      this._achievementBoardAwaitingDetailedReveal = false;
      this.achievementBoard.revealForDetailedMode?.();
      this.townXpHud?.refresh?.(true);
      this._achievementBoardRevealTimer = null;
    });
  }

  _ensureTopHudHoverBubble() {
    const existingBubble = this.topHudHoverBubble;
    if (
      existingBubble?.active !== false &&
      existingBubble?.scene === this &&
      this._canMutateText(existingBubble.label)
    ) {
      return existingBubble;
    }

    existingBubble?.destroy?.(true);
    this.topHudHoverBubble = null;

    const shadow = this.add.graphics().setDepth(UIDEPTH + 22);
    const bg = this.add.graphics().setDepth(UIDEPTH + 23);
    const shine = this.add.graphics().setDepth(UIDEPTH + 24);
    const text = this.add
      .text(0, 0, "", {
        fontFamily: "Bungee",
        fontSize: "14px",
        color: "#eef8ff",
        stroke: "#07111b",
        strokeThickness: 3,
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(UIDEPTH + 25);

    const bubble = this.add.container(0, 0, [shadow, bg, shine, text]).setDepth(UIDEPTH + 22).setVisible(false).setAlpha(0);
    bubble.shadow = shadow;
    bubble.bg = bg;
    bubble.shine = shine;
    bubble.label = text;
    bubble.widthPx = 0;
    bubble.heightPx = 0;
    this.topHudHoverBubble = bubble;
    return bubble;
  }

  _layoutTopHudHoverBubble(label) {
    let bubble = this._ensureTopHudHoverBubble();
    const paddingX = 16;
    const paddingY = 10;
    const applyLabel = (targetBubble) =>
      this._mutateText(targetBubble?.label, (node) => node.setText(label).setPosition(0, 0));

    if (!applyLabel(bubble)) {
      bubble?.destroy?.(true);
      this.topHudHoverBubble = null;
      bubble = this._ensureTopHudHoverBubble();
      if (!applyLabel(bubble)) return null;
    }

    const width = Math.max(98, Math.ceil(bubble.label.width) + paddingX * 2);
    const height = Math.max(38, Math.ceil(bubble.label.height) + paddingY * 2);
    const radius = 14;
    bubble.widthPx = width;
    bubble.heightPx = height;

    bubble.shadow.clear();
    bubble.shadow.fillStyle(0x02060d, 0.30);
    bubble.shadow.fillRoundedRect(-width / 2 + 2, -height / 2 + 4, width, height, radius);

    bubble.bg.clear();
    bubble.bg.fillStyle(0x16364d, 0.88);
    bubble.bg.lineStyle(2, 0x7ed7ff, 0.35);
    bubble.bg.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
    bubble.bg.strokeRoundedRect(-width / 2, -height / 2, width, height, radius);

    bubble.shine.clear();
    bubble.shine.fillStyle(0xffffff, 0.08);
    bubble.shine.fillRoundedRect(-width / 2 + 6, -height / 2 + 5, width - 12, Math.max(10, Math.floor(height * 0.42)), Math.max(8, radius - 4));
    return bubble;
  }

  _showTopHudHover(label, anchorX, targetY = 56) {
    const bubble = this._layoutTopHudHoverBubble(label);
    if (!bubble) return;
    this._topHudHoverHideTimer?.remove?.(false);
    this._topHudHoverHideTimer = null;

    const targetX = Phaser.Math.Clamp(anchorX, bubble.widthPx / 2 + 12, this.scale.width - bubble.widthPx / 2 - 12);

    bubble.setVisible(true);
    bubble.setPosition(targetX, targetY + 4);
    bubble.setScale(0.94);
    bubble.setAlpha(0);
    this.tweens.killTweensOf(bubble);
    this.tweens.add({
      targets: bubble,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      y: targetY,
      duration: 170,
      ease: "Back.Out",
    });
  }

  _hideTopHudHover(immediate = false) {
    const bubble = this.topHudHoverBubble;
    if (!bubble?.visible) return;
    this._topHudHoverHideTimer?.remove?.(false);
    this._topHudHoverHideTimer = null;
    this.tweens.killTweensOf(bubble);

    if (immediate) {
      bubble.setVisible(false).setAlpha(0);
      return;
    }

    this.tweens.add({
      targets: bubble,
      alpha: 0,
      scaleX: 0.97,
      scaleY: 0.97,
      y: bubble.y - 3,
      duration: 120,
      ease: "Quad.Out",
      onComplete: () => bubble.setVisible(false),
    });
  }

  _bindTopHudHover(target, label, opts = {}) {
    target.on("pointerover", () => {
      if (typeof opts.canShow === "function" && !opts.canShow()) return;
      const resolvedLabel = typeof label === "function" ? label() : label;
      if (!resolvedLabel) return;
      const anchor = this._getUiPoint(target);
      const fallbackX = target.x + (this.topHud?.x ?? 0);
      const anchorX = Number.isFinite(anchor?.x) ? anchor.x : fallbackX;
      const targetY = typeof opts.targetY === "function"
        ? opts.targetY(target, anchor)
        : (opts.targetY ?? 56);
      this._showTopHudHover(resolvedLabel, anchorX, targetY);
    });
    target.on("pointerout", () => {
      this._topHudHoverHideTimer?.remove?.(false);
      this._topHudHoverHideTimer = this.time.delayedCall(40, () => this._hideTopHudHover());
    });
  }

  _phaseClockAngleForHour(hour) {
    return Phaser.Math.DegToRad(-90 + (hour / 24) * 360);
  }

  _buildPhaseClock() {
    if (this.phaseClock) return;

    const world = this.worldScene;
    if (!world.clock || typeof world.clock.getPhaseInfo !== "function") {
      world.clock = new Clock(world);
    }

    const PANEL_W = 300;
    const PANEL_H = 104;
    const DIAL_CX = -88;
    const DIAL_CY = 0;
    const OUTER_R = 32;
    const INNER_R = 19;
    const RING_W = OUTER_R - INNER_R + 6;

    const root = this.add.container(0, 0).setDepth(UIDEPTH + 16);
    const shadow = this.add.graphics();
    const bg = this.add.graphics();
    const shine = this.add.graphics();
    const dial = this.add.graphics();
    const hand = this.add.graphics();
    const timeText = this.add.text(-28, -26, "", {
      fontFamily: "Bungee",
      fontSize: "13px",
      color: "#edf7ff",
      stroke: "#07111b",
      strokeThickness: 3,
      align: "left",
    }).setOrigin(0, 0.5);
    const phaseText = this.add.text(-28, 0, "", {
      fontFamily: "Bungee",
      fontSize: "20px",
      color: "#ffffff",
      stroke: "#07111b",
      strokeThickness: 4,
      align: "left",
    }).setOrigin(0, 0.5);
    const actionText = this.add.text(-28, 22, "", {
      fontFamily: "Bungee",
      fontSize: "10px",
      color: "#dbeafe",
      stroke: "#07111b",
      strokeThickness: 2,
      align: "left",
      wordWrap: { width: 184 },
    }).setOrigin(0, 0.5);
    const countdownText = this.add.text(-28, 40, "", {
      fontFamily: "Bungee",
      fontSize: "10px",
      color: "#fff7d6",
      stroke: "#07111b",
      strokeThickness: 2,
      align: "left",
      wordWrap: { width: 184 },
    }).setOrigin(0, 0.5);
    const dialCore = this.add.circle(DIAL_CX, DIAL_CY, INNER_R - 1, 0x0f172a, 0.98)
      .setStrokeStyle(2, 0xffffff, 0.12);

    root.add([shadow, bg, shine, dial, hand, dialCore, timeText, phaseText, actionText, countdownText]);
    root.panelWidth = PANEL_W;
    root.panelHeight = PANEL_H;

    const phaseSegments = [
      {
        key: "dawn",
        ranges: [[CLOCK_PHASE_HOURS.dawnStart, CLOCK_PHASE_HOURS.dayStart]],
        color: 0x7dd3fc,
      },
      {
        key: "day",
        ranges: [[CLOCK_PHASE_HOURS.dayStart, CLOCK_PHASE_HOURS.duskStart]],
        color: 0x4ade80,
      },
      {
        key: "dusk",
        ranges: [[CLOCK_PHASE_HOURS.duskStart, CLOCK_PHASE_HOURS.nightStart]],
        color: 0xfb923c,
      },
      {
        key: "night",
        ranges: [[CLOCK_PHASE_HOURS.nightStart, CLOCK_PHASE_HOURS.nightEnd + 24]],
        color: 0xf87171,
      },
    ];

    const drawPanel = () => {
      shadow.clear();
      shadow.fillStyle(0x02060d, 0.34);
      shadow.fillRoundedRect(-PANEL_W / 2 + 3, -PANEL_H / 2 + 5, PANEL_W, PANEL_H, 20);

      bg.clear();
      bg.fillStyle(0x113048, 0.94);
      bg.lineStyle(2, 0x9edfff, 0.22);
      bg.fillRoundedRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 20);
      bg.strokeRoundedRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 20);

      shine.clear();
      shine.fillStyle(0xffffff, 0.08);
      shine.fillRoundedRect(-PANEL_W / 2 + 10, -PANEL_H / 2 + 8, PANEL_W - 20, 26, 12);
    };

    const layout = () => {
      root.setPosition(this.scale.width - PANEL_W / 2 - 18, 42 + 10 + PANEL_H / 2);
      this.phaseClockBottomY = root.y + PANEL_H / 2;
      this._layoutTopHudLeftGroups();
      this.achievementBoard?.reposition?.();
      this.zoomControls?.reposition?.();
    };

    root.refresh = (force = false) => {
      const clock = this.worldScene?.clock;
      if (!clock) return;

      const phase = clock.getPhaseInfo?.() || { label: "DAY", actionText: "", textColor: "#ffffff" };
      const signature = [
        clock.day,
        clock.hours,
        clock.minutes,
        phase.key,
        this.scale.width,
      ].join("|");
      if (!force && signature === root._signature) return;
      root._signature = signature;

      drawPanel();

      const minuteDisplay = String(Math.round(clock.minutes)).padStart(2, "0");
      timeText.setText(`${clock.getWeekdayShortLabel?.() || "MON"}  DAY ${clock.day}  ${clock.formatClockFaceTime?.() || `${clock.hours}:${minuteDisplay}`}`);
      phaseText.setText(phase.label || "DAY");
      phaseText.setColor(phase.textColor || "#ffffff");
      actionText.setText(phase.actionText || "");
      countdownText.setText(clock.getPhaseCountdownText?.() || "");

      dial.clear();
      dial.lineStyle(4, 0x0b1220, 0.95);
      dial.strokeCircle(DIAL_CX, DIAL_CY, OUTER_R + 4);
      phaseSegments.forEach((segment) => {
        dial.lineStyle(RING_W, segment.color, phase.key === segment.key ? 0.98 : 0.58);
        segment.ranges.forEach(([startHour, endHour]) => {
          if (endHour <= 24) {
            dial.beginPath();
            dial.arc(DIAL_CX, DIAL_CY, (OUTER_R + INNER_R) / 2, this._phaseClockAngleForHour(startHour), this._phaseClockAngleForHour(endHour), false);
            dial.strokePath();
            return;
          }

          dial.beginPath();
          dial.arc(DIAL_CX, DIAL_CY, (OUTER_R + INNER_R) / 2, this._phaseClockAngleForHour(startHour), this._phaseClockAngleForHour(24), false);
          dial.strokePath();
          dial.beginPath();
          dial.arc(DIAL_CX, DIAL_CY, (OUTER_R + INNER_R) / 2, this._phaseClockAngleForHour(0), this._phaseClockAngleForHour(endHour - 24), false);
          dial.strokePath();
        });
      });

      hand.clear();
      const hourFloat = clock.getHourFloat?.() ?? 0;
      const angle = this._phaseClockAngleForHour(hourFloat);
      const handLen = OUTER_R - 7;
      const handX = DIAL_CX + Math.cos(angle) * handLen;
      const handY = DIAL_CY + Math.sin(angle) * handLen;
      hand.lineStyle(4, 0xf8fafc, 0.95);
      hand.beginPath();
      hand.moveTo(DIAL_CX, DIAL_CY);
      hand.lineTo(handX, handY);
      hand.strokePath();
      hand.fillStyle(0xf8fafc, 1);
      hand.fillCircle(handX, handY, 4);
      hand.fillStyle(0x0f172a, 1);
      hand.fillCircle(DIAL_CX, DIAL_CY, 4);

      this.clockText = timeText;
      this.phaseClockTimeText = timeText;
    };

    layout();
    root.refresh(true);
    this.scale.on("resize", layout);
    this.events.once("shutdown", () => {
      this.scale.off("resize", layout);
    });

    this.phaseClock = root;
  }

  _refreshPhaseClock(force = false) {
    this.phaseClock?.refresh?.(force);
  }

  _formatStatusItemSummary(entries = []) {
    return entries
      .slice(0, 3)
      .map(([label, count]) => `${String(label || "ITEM").toUpperCase()} x${count}`)
      .join("  |  ");
  }

  _getTownStatusIndicatorConfigs() {
    const team = Teams.getTeam?.(1) ?? Teams.teamLists?.["1"];
    if (!team) return [];

    const configs = [];
    const storages = (team.storageList || []).filter((storage) => storage?.sprite?.active !== false);
    const ovens = (team.ovenList || []).filter((oven) => oven?.sprite?.active !== false);

    const cookingCounts = new Map();
    const cookingOvens = ovens.filter((oven) => !!oven?.cooking);
    cookingOvens.forEach((oven) => {
      (oven?.cookingSlots || []).forEach((slot) => {
        if (!slot?.item) return;
        const label = slot.item.label || slot.item.name || "Batch";
        cookingCounts.set(label, (cookingCounts.get(label) || 0) + Math.max(1, Number(slot.amount || 1)));
      });
    });

    if (cookingOvens.length > 0) {
      const summary = this._formatStatusItemSummary(Array.from(cookingCounts.entries()));
      const ovenWord = cookingOvens.length === 1 ? "oven is" : "ovens are";
      configs.push({
        key: "town-cooking",
        iconText: "\u{1F525}",
        glowColor: 0xff9f1c,
        bgColor: 0x9a3412,
        hoverLabel: [
          `Fire: ${cookingOvens.length} ${ovenWord} cooking.`,
          summary ? `Queue: ${summary}.` : null,
        ].filter(Boolean).join("\n"),
      });
    }

    const storageWarningStates = storages.map((storage) => storage.getStorageWarningState?.() ?? null);
    const hardFullStorages = storages.filter((storage, index) => storageWarningStates[index] === "full");
    const slotLockedStorages = storages.filter((storage, index) => storageWarningStates[index] === "slots");
    const blockedStorageCount = hardFullStorages.length + slotLockedStorages.length;
    if (storages.length > 0 && blockedStorageCount === storages.length) {
      const detailParts = [];
      if (hardFullStorages.length > 0) detailParts.push(`${hardFullStorages.length} full`);
      if (slotLockedStorages.length > 0) detailParts.push(`${slotLockedStorages.length} slot-filled`);
      configs.push({
        key: "town-storage-pressure",
        iconText: "\u{1F4E6}",
        cancelBadge: true,
        glowColor: hardFullStorages.length > 0 ? 0xff5f76 : 0xffc85a,
        bgColor: hardFullStorages.length > 0 ? 0x7f1d2d : 0x7c3f12,
        hoverLabel: [
          `Storage blocked: ${detailParts.join(", ")}.`,
          hardFullStorages.length > 0 ? "Full = no slot or stack room." : null,
          slotLockedStorages.length > 0 ? "Slot-filled = no empty slot" : null,
          slotLockedStorages.length > 0 ? "for new item types." : null,
        ].filter(Boolean).join("\n"),
      });
    }

    return configs;
  }

  _buildTownStatusHud() {
    if (this.townStatusHud) return;
    this.townStatusHud = this.add.container(0, 0).setDepth(UIDEPTH + 16);
    this.townStatusEntries = new Map();
    this._townStatusSignature = "";
  }

  _destroyTownStatusHud() {
    this.townStatusEntries?.forEach?.((entry) => {
      this.tweens.killTweensOf(entry?.root);
      this.tweens.killTweensOf(entry?.glow);
      entry?.root?.destroy?.(true);
    });
    this.townStatusEntries?.clear?.();
    this.townStatusEntries = null;
    this.townStatusHud?.destroy?.(true);
    this.townStatusHud = null;
    this._townStatusSignature = "";
  }

  _createTownStatusEntry(config, index = 0) {
    const width = 38;
    const height = 34;
    const root = this.add.container(0, 0);
    const glow = this.add.graphics().setAlpha(0.74);
    const bg = this.add.graphics();
    const frame = this.add.graphics();
    const icon = this.add.text(0, -1, config.iconText || "!", {
      fontFamily: "Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif",
      fontSize: "20px",
      color: "#ffffff",
      stroke: "#07111b",
      strokeThickness: 2,
      align: "center",
    }).setOrigin(0.5);
    const hit = this.add.zone(0, 0, width + 6, height + 4).setInteractive({ useHandCursor: true });

    const entry = {
      key: config.key,
      root,
      glow,
      bg,
      width,
      hoverLabel: config.hoverLabel || "",
      glowColor: null,
      bgColor: null,
    };

    entry.redraw = (glowColor = config.glowColor || 0x74d7ff, bgColor = config.bgColor || glowColor) => {
      glow.clear();
      glow.fillStyle(glowColor, 0.09);
      glow.fillCircle(0, 0, 15);
      glow.lineStyle(1, glowColor, 0.24);
      glow.strokeRoundedRect((-width / 2) + 1, (-height / 2) + 1, width - 2, height - 2, 12);

      bg.clear();
      bg.fillStyle(bgColor, 0.5);
      bg.fillRoundedRect(-width / 2, -height / 2, width, height, 12);

      frame.clear();
      frame.lineStyle(1.6, glowColor, 0.66);
      frame.strokeRoundedRect(-width / 2, -height / 2, width, height, 12);
      frame.lineStyle(1, 0xffffff, 0.12);
      frame.strokeRoundedRect((-width / 2) + 2, (-height / 2) + 2, width - 4, height - 4, 10);
      entry.glowColor = glowColor;
      entry.bgColor = bgColor;
    };

    const children = [glow, bg, frame, icon];
    if (config.cancelBadge) {
      const cancel = this.add.container(11, -11);
      const cancelBg = this.add.circle(0, 0, 7, 0xff3344, 0.96).setStrokeStyle(1, 0xffffff, 0.78);
      const slash = this.add.graphics();
      slash.lineStyle(2, 0xffffff, 0.95);
      slash.beginPath();
      slash.moveTo(-4, 4);
      slash.lineTo(4, -4);
      slash.strokePath();
      cancel.add([cancelBg, slash]);
      children.push(cancel);
    }

    hit.on("pointerover", () => {
      const anchor = this._getUiPoint(root);
      if (!anchor) return;
      this._showTopHudHover(entry.hoverLabel || "", anchor.x, anchor.y - 34);
    });
    hit.on("pointerout", () => this._hideTopHudHover());

    root.add([...children, hit]);
    root.setAlpha(0);
    root.setScale(0.94);
    entry.redraw(config.glowColor);
    this.townStatusHud?.add?.(root);

    this.tweens.add({
      targets: root,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 180,
      delay: index * 40,
      ease: "Back.easeOut",
    });
    this.tweens.add({
      targets: glow,
      alpha: 0.34,
      duration: 900,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
      delay: index * 80,
    });
    this.tweens.add({
      targets: root,
      scaleX: 1.04,
      scaleY: 1.04,
      duration: 980,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
      delay: index * 80,
    });

    return entry;
  }

  _updateTownStatusEntry(entry, config) {
    if (!entry) return;
    entry.hoverLabel = config.hoverLabel || "";
    if (entry.glowColor !== config.glowColor || entry.bgColor !== config.bgColor) {
      entry.redraw?.(config.glowColor, config.bgColor);
    }
  }

  _getTownStatusAnchor() {
    const edgeMargin = 5;
    const productionAnchor = this._getProductionStatusAnchor?.();
    if (productionAnchor && Number.isFinite(productionAnchor.y)) {
      return {
        x: Math.round(this.scale.width - edgeMargin),
        y: Math.round(productionAnchor.y),
      };
    }

    const bottomBarProgress = Phaser.Math.Clamp(
      Number(this.uiBottomBar?.openProgress ?? (this.uiBottomBar?.expanded ? 1 : 0)),
      0,
      1
    );
    const bottomReserve = Phaser.Math.Linear(74, 190, bottomBarProgress);
    return {
      x: Math.round(this.scale.width - edgeMargin),
      y: Math.round(this.scale.height - bottomReserve - 36),
    };
  }

  _refreshTownStatusHud(force = false) {
    if (!this.townStatusHud) return;

    const configs = this._getTownStatusIndicatorConfigs();
    const signature = configs.map((config) => config.key).join("|");
    if (force || signature !== this._townStatusSignature) {
      const activeKeys = new Set(configs.map((config) => config.key));
      this.townStatusEntries?.forEach?.((entry, key) => {
        if (activeKeys.has(key)) return;
        this.tweens.killTweensOf(entry?.root);
        this.tweens.killTweensOf(entry?.glow);
        entry?.root?.destroy?.(true);
        this.townStatusEntries.delete(key);
      });

      configs.forEach((config, index) => {
        if (this.townStatusEntries?.has?.(config.key)) return;
        const entry = this._createTownStatusEntry(config, index);
        this.townStatusEntries?.set?.(config.key, entry);
      });

      this._townStatusSignature = signature;
    }

    const visible = configs.length > 0;
    this.townStatusHud.setVisible(visible);
    if (!visible) return;

    const anchor = this._getTownStatusAnchor();
    const gap = 8;
    let cursorRight = anchor.x;

    configs.forEach((config) => {
      const entry = this.townStatusEntries?.get?.(config.key);
      if (!entry?.root) return;
      this._updateTownStatusEntry(entry, config);
      const width = entry.width || 38;
      entry.root.setPosition(cursorRight - (width / 2), anchor.y);
      entry.root.setVisible(true);
      cursorRight -= width + gap;
    });
  }

  _buildStageMetaHud() {
    if (this.stageMetaText) return;
    this._teardownStageMetaHud();

    const panelY = 42;
    const panelX = 12;

    this.stageMetaText = this.add.text(panelX, panelY, "", {
      fontFamily: "Bungee",
      fontSize: "18px",
      color: "#f6f0ff",
      stroke: "#000000",
      strokeThickness: 4,
      align: "left",
    }).setOrigin(0, 0).setDepth(UIDEPTH + 1);

    this.stageMetaSubText = this.add.text(panelX, panelY + 54, "", {
      fontFamily: "Bungee",
      fontSize: "11px",
      color: "#ffe8b8",
      stroke: "#000000",
      strokeThickness: 3,
      align: "left",
    }).setOrigin(0, 0).setDepth(UIDEPTH + 1);

    const recompute = () => {
      if (this._sceneShuttingDown) return;
      const stage = Math.max(1, Number(StageState.stageIndex || 1));
      const nextUnlock = getNextHordeUnlock(stage);
      const preview = this.worldScene?.getUpcomingHordePreviewSummary?.() ?? null;
      const line1 = `\uD83C\uDFF9 Town Defense`;
      const line2 = `\uD83D\uDD25 Horde ${stage}`;
      const didUpdatePrimary = this._mutateText(this.stageMetaText, (node) => {
        node.setText(`${line1}\n${line2}`);
        node.setColor("#f6f0ff");
      });
      if (!didUpdatePrimary) return;
      const nextUnlockText = nextUnlock
        ? `NEXT UNLOCK  H${nextUnlock.hordeIndex}: ${String(nextUnlock.displayLabel || "").toUpperCase()}`
        : "ALL EARLY HORDE UNLOCKS EARNED";
      const previewText = preview
        ? [
            `${String(preview.headline || "COASTAL ASSAULT TONIGHT").toUpperCase()}  H${preview.hordeIndex}`,
            `${Math.max(0, Number(preview.totalEnemies || 0))} ${String(preview.enemyLabel || "RAIDERS").toUpperCase()}${preview.modifierLabel ? `  ${String(preview.modifierLabel).toUpperCase()}` : ""}`,
            preview.countdownText ? String(preview.countdownText).toUpperCase() : null,
          ].filter(Boolean).join("\n")
        : null;
      this._mutateText(this.stageMetaSubText, (node) => {
        node.setText([nextUnlockText, previewText].filter(Boolean).join("\n"));
      });
    };

    this._stageMetaRecompute = recompute;
    recompute();
    this.worldScene?.events?.on?.("stage:changed", this._stageMetaRecompute);

    this._stageMetaRefreshTimer = this.time.addEvent({
      delay: 300,
      loop: true,
      callback: recompute,
    });

    this._trackScaleResize(() => {
      this.stageMetaText?.setPosition(panelX, panelY);
      this.stageMetaSubText?.setPosition(panelX, panelY + 54);
    });
  }

  _buildZoomControls() {
    if (this.zoomControls) return;

    const SPEED_W = 72;
    const ZOOM_W = 46;
    const BTN_H = 28;
    const GAP = 6;
    const ACTIVE_ALPHA = 0.92;
    const IDLE_ALPHA = 0.68;
    const DISABLED_ALPHA = 0.32;

    const root = this.add.container(0, 0).setDepth(UIDEPTH + 18);
    const setButtonAlpha = (btn) => {
      btn.setAlpha(btn.disabled ? DISABLED_ALPHA : btn.active ? ACTIVE_ALPHA : IDLE_ALPHA);
    };

    const makeBtn = (label, width, { fontSize = "15px" } = {}) => {
      const bg = this.add
        .rectangle(0, 0, width, BTN_H, 0x0b1c2a, 0.001)
        .setStrokeStyle(2, 0x9edfff, 0)
        .setInteractive({ useHandCursor: true });

      const txt = this.add
        .text(0, 0, label, {
          fontFamily: "Bungee",
          fontSize,
          color: "#ffffff",
          stroke: "#000000",
          strokeThickness: 3,
        })
        .setOrigin(0.5);

      const btn = this.add.container(0, 0, [bg, txt]).setSize(width, BTN_H).setAlpha(IDLE_ALPHA);
      btn.bg = bg;
      btn.label = txt;
      btn.widthPx = width;
      btn.active = false;
      btn.disabled = false;
      btn.refreshAlpha = () => setButtonAlpha(btn);

      bg.on("pointerover", () => {
        if (btn.disabled) return;
        AudioManager.playUiHover({ volume: 0.16 });
        btn.bg.setFillStyle(0x0b1c2a, 0.32);
        btn.bg.setStrokeStyle(2, 0x9edfff, 0.22);
        btn.setAlpha(ACTIVE_ALPHA);
        this.tweens.killTweensOf(btn);
        this.tweens.add({
          targets: btn,
          scaleX: 1.05,
          scaleY: 1.05,
          duration: 100,
          ease: "Sine.Out",
        });
      });
      bg.on("pointerout", () => {
        this.tweens.killTweensOf(btn);
        this.tweens.add({
          targets: btn,
          scaleX: 1,
          scaleY: 1,
          duration: 100,
          ease: "Sine.Out",
        });
        btn.bg.setFillStyle(0x0b1c2a, 0.001);
        btn.bg.setStrokeStyle(2, 0x9edfff, 0);
        btn.refreshAlpha?.();
      });

      return btn;
    };

    const applyButtonState = (btn, { disabled = false, active = false, activeLabelColor = "#ffffff" } = {}) => {
      btn.disabled = disabled;
      btn.active = active;

      if (disabled) {
        if (btn._interactiveDisabled !== true) {
          btn.bg.disableInteractive();
          btn._interactiveDisabled = true;
        }
      } else if (btn._interactiveDisabled === true) {
        btn.bg.setInteractive({ useHandCursor: true });
        btn._interactiveDisabled = false;
      }

      const fillColor = 0x0b1c2a;
      const fillAlpha = 0.001;
      const strokeColor = 0x9edfff;
      const strokeAlpha = 0;

      btn.bg.setFillStyle(fillColor, fillAlpha);
      btn.bg.setStrokeStyle(2, strokeColor, strokeAlpha);
      btn.label.setAlpha(disabled ? 0.55 : 1);
      btn.label.setColor(disabled ? "#d1d5db" : active ? activeLabelColor : "#ffffff");
      btn.refreshAlpha?.();
    };

    const speedBtn = makeBtn("", SPEED_W);
    const zoomBtn = makeBtn("", ZOOM_W, { fontSize: "17px" });
    speedBtn.setPosition(-(ZOOM_W + GAP) / 2, 0);
    zoomBtn.setPosition((SPEED_W + GAP) / 2, 0);
    root.add([speedBtn, zoomBtn]);

    const positionControls = () => {
      root.setPosition(this.scale.width - 118, 22);
    };
    positionControls();
    this.scale.on("resize", positionControls);

    const triggerZoom = (targetZoom) => {
      const world = this.worldScene;
      const mixer = world?.zoomMixer;
      if (!mixer) return;
      if (mixer.zoomOutLocked || world?.stageCompleteLock) return;
      mixer.targetZoom = targetZoom;
      mixer.smoothCenterZoomTo(targetZoom);
    };

    const cycleSpeed = () => {
      const current = this.worldScene?.getSimulationSpeed?.() ?? 1;
      const speeds = [1, 1.5, 2];
      const currentIndex = speeds.indexOf(current);
      const next = speeds[(currentIndex + 1) % speeds.length] ?? 1;
      this.worldScene?.setSimulationSpeed?.(next);
      root.updateState?.();
    };

    speedBtn.bg.on("pointerdown", () => cycleSpeed());
    zoomBtn.bg.on("pointerdown", () => {
      const mixer = this.worldScene?.zoomMixer;
      if (!mixer) return;
      const isOverview = mixer.mode === "overview";
      triggerZoom(isOverview ? (mixer.detailedZoom ?? 1) : (mixer.overviewZoom ?? 0.3));
    });
    this._bindTopHudHover(speedBtn.bg, "Speed");
    this._bindTopHudHover(zoomBtn.bg, "Zoom");

    root.updateState = () => {
      const world = this.worldScene;
      const zoomDisabled = !!(world?.zoomMixer?.zoomOutLocked || world?.stageCompleteLock);
      const speedDisabled = !!(!world || world.stageCompleteLock);
      const selectedSpeed = world?.getSimulationSpeed?.() ?? 1;

      speedBtn.label.setText(`\u23e9 ${selectedSpeed}x`);
      zoomBtn.label.setText(world?.zoomMixer?.mode === "overview" ? "\ud83d\udd0d+" : "\ud83d\udd0e-");
      applyButtonState(speedBtn, {
        disabled: speedDisabled,
        active: selectedSpeed > 1,
        activeLabelColor: "#dbeafe",
      });
      applyButtonState(zoomBtn, { disabled: zoomDisabled });
    };

    root.reposition = positionControls;
    root.updateState();
    this.zoomControls = root;
    this.events.once("shutdown", () => {
      this.scale.off("resize", positionControls);
    });
  }

  _buildRaiderEdgeHud() {
    if (this.raiderEdgeHud) return;
    this.raiderEdgeHud = this.add.container(0, 0).setDepth(UIDEPTH + 30);
    this.raiderEdgeIndicators = new Map();
  }

  _isDetailedMode() {
    return (this.worldScene?.zoomMixer?.mode ?? "detailed") === "detailed";
  }

  _getRaiderIndicatorBounds() {
    const top = Math.max(78, Math.round((this.phaseClockBottomY ?? 106) + 12));
    const sidePad = 34;
    const bottomBarProgress = Phaser.Math.Clamp(
      Number(this.uiBottomBar?.openProgress ?? (this.uiBottomBar?.expanded ? 1 : 0)),
      0,
      1
    );
    const bottomReserve = Phaser.Math.Linear(74, 190, bottomBarProgress);
    const bottom = Math.min(this.scale.height - 34, this.scale.height - bottomReserve);
    return {
      left: sidePad,
      right: Math.max(sidePad, this.scale.width - sidePad),
      top,
      bottom: Math.max(top + 36, bottom),
    };
  }

  _createRaiderEdgeIndicator(key) {
    const root = this.add.container(0, 0).setDepth(UIDEPTH + 18);
    const glow = this.add.graphics();
    const arrow = this.add.text(0, 0, "▲", {
      fontFamily: "Bungee",
      fontSize: "30px",
      color: "#ff4d4d",
      stroke: "#190505",
      strokeThickness: 5,
    }).setOrigin(0.5);
    arrow.setText(">").setFontSize("30px");
    const badge = this.add.graphics();
    const badgeText = this.add.text(12, -12, "1", {
      fontFamily: "Bungee",
      fontSize: "10px",
      color: "#f8fafc",
      stroke: "#000000",
      strokeThickness: 3,
    }).setOrigin(0.5);

    root.add([glow, arrow, badge, badgeText]);
    root.setVisible(false);

    const indicator = {
      key,
      root,
      glow,
      arrow,
      badge,
      badgeText,
    };

    this.raiderEdgeHud?.add?.(root);
    this.raiderEdgeIndicators.set(key, indicator);
    return indicator;
  }

  _destroyRaiderEdgeIndicator(key) {
    const indicator = this.raiderEdgeIndicators?.get?.(key);
    if (!indicator) return;
    indicator.root?.destroy?.(true);
    this.raiderEdgeIndicators.delete(key);
  }

  _getOffscreenRaiderGroups() {
    const world = this.worldScene;
    const cam = world?.cameras?.main;
    if (!world || !cam || !this._isDetailedMode()) return [];

    const bounds = this._getRaiderIndicatorBounds();
    const centerX = Phaser.Math.Clamp(this.scale.width * 0.5, bounds.left, bounds.right);
    const centerY = Phaser.Math.Clamp(this.scale.height * 0.5, bounds.top, bounds.bottom);
    const enemyTroops = Teams.teamLists?.["0"]?.playerList || [];
    const groups = new Map();

    const projectToEdge = (screenX, screenY) => {
      let dx = screenX - centerX;
      let dy = screenY - centerY;
      if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) dy = -1;

      let bestT = Number.POSITIVE_INFINITY;
      let side = "right";

      if (dx > 0.001) {
        const t = (bounds.right - centerX) / dx;
        if (t < bestT) {
          bestT = t;
          side = "right";
        }
      }
      if (dx < -0.001) {
        const t = (bounds.left - centerX) / dx;
        if (t < bestT) {
          bestT = t;
          side = "left";
        }
      }
      if (dy > 0.001) {
        const t = (bounds.bottom - centerY) / dy;
        if (t < bestT) {
          bestT = t;
          side = "bottom";
        }
      }
      if (dy < -0.001) {
        const t = (bounds.top - centerY) / dy;
        if (t < bestT) {
          bestT = t;
          side = "top";
        }
      }

      if (!Number.isFinite(bestT) || bestT < 0) {
        if (Math.abs(dy) > Math.abs(dx)) side = dy > 0 ? "bottom" : "top";
        else side = dx > 0 ? "right" : "left";
        bestT = 1;
      }

      return {
        x: Phaser.Math.Clamp(centerX + dx * bestT, bounds.left, bounds.right),
        y: Phaser.Math.Clamp(centerY + dy * bestT, bounds.top, bounds.bottom),
        angle: Math.atan2(dy, dx),
        side,
      };
    };

    for (const troop of enemyTroops) {
      if (!troop?.active) continue;
      if (!troop?.isRaider && !troop?.isFortGrunt) continue;

      const worldView = cam.worldView;
      const inView = !!worldView
        && troop.x >= worldView.x
        && troop.x <= worldView.x + worldView.width
        && troop.y >= worldView.y
        && troop.y <= worldView.y + worldView.height;
      if (inView) continue;

      const screenX = (troop.x - cam.worldView.x) * cam.zoom;
      const screenY = (troop.y - cam.worldView.y) * cam.zoom;
      const edge = projectToEdge(screenX, screenY);
      const axisValue = (edge.side === "left" || edge.side === "right") ? edge.y : edge.x;
      const bucket = Math.round(axisValue / 52);
      const key = `${edge.side}:${bucket}`;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          side: edge.side,
          x: edge.x,
          y: edge.y,
          angle: edge.angle,
          axisValue,
          count: 0,
          nearestDistSq: Number.POSITIVE_INFINITY,
        });
      }

      const group = groups.get(key);
      group.count += 1;
      group.x += edge.x;
      group.y += edge.y;
      group.axisValue += axisValue;

      const distSq = Phaser.Math.Distance.Squared(troop.x, troop.y, cam.midPoint.x, cam.midPoint.y);
      if (distSq < group.nearestDistSq) {
        group.nearestDistSq = distSq;
        group.angle = edge.angle;
      }
    }

    const results = Array.from(groups.values()).map((group) => ({
      ...group,
      x: group.x / group.count,
      y: group.y / group.count,
      axisValue: group.axisValue / group.count,
    }));

    const minGap = 44;
    const spreadSide = (side, axisMin, axisMax) => {
      const sideGroups = results
        .filter((group) => group.side === side)
        .sort((a, b) => a.axisValue - b.axisValue);

      for (let i = 1; i < sideGroups.length; i++) {
        sideGroups[i].axisValue = Math.max(sideGroups[i].axisValue, sideGroups[i - 1].axisValue + minGap);
      }

      const overflow = sideGroups.length
        ? sideGroups[sideGroups.length - 1].axisValue - axisMax
        : 0;

      if (overflow > 0) {
        for (let i = sideGroups.length - 1; i >= 0; i--) {
          sideGroups[i].axisValue -= overflow;
          if (i > 0 && sideGroups[i].axisValue - sideGroups[i - 1].axisValue < minGap) {
            sideGroups[i - 1].axisValue = sideGroups[i].axisValue - minGap;
          }
        }
      }

      sideGroups.forEach((group) => {
        group.axisValue = Phaser.Math.Clamp(group.axisValue, axisMin, axisMax);
        if (side === "left" || side === "right") group.y = group.axisValue;
        else group.x = group.axisValue;
      });
    };

    spreadSide("left", bounds.top, bounds.bottom);
    spreadSide("right", bounds.top, bounds.bottom);
    spreadSide("top", bounds.left, bounds.right);
    spreadSide("bottom", bounds.left, bounds.right);

    return results;
  }

  _hideAllRaiderEdgeIndicators() {
    this.raiderEdgeIndicators?.forEach((indicator) => {
      indicator.root?.setVisible(false);
    });
  }

  _updateRaiderEdgeHud() {
    if (!this.raiderEdgeHud) return;
    if (!this._isDetailedMode()) {
      this.raiderEdgeHud.setVisible(false);
      this._hideAllRaiderEdgeIndicators();
      return;
    }

    const groups = this._getOffscreenRaiderGroups();
    if (!groups.length) {
      this.raiderEdgeHud.setVisible(false);
      this._hideAllRaiderEdgeIndicators();
      return;
    }

    this.raiderEdgeHud.setVisible(true);
    const seen = new Set();

    groups.forEach((group) => {
      const indicator = this.raiderEdgeIndicators?.get?.(group.key) || this._createRaiderEdgeIndicator(group.key);
      seen.add(group.key);

      indicator.root.setVisible(true).setAlpha(1).setScale(1);
      indicator.root.setPosition(group.x, group.y);
      indicator.glow.clear();
      indicator.glow.fillStyle(0x7f1d1d, 0.24);
      indicator.glow.fillCircle(0, 0, 17);
      indicator.glow.lineStyle(2, 0xffb4b4, 0.56);
      indicator.glow.strokeCircle(0, 0, 17);
      indicator.arrow.setColor("#ff4d4d").setFontSize("30px").setStroke("#190505", 5);
      indicator.arrow.setPosition(0, 0);
      indicator.arrow.setAngle(Phaser.Math.RadToDeg(group.angle));

      const showBadge = group.count > 1;
      indicator.badge.setVisible(showBadge);
      indicator.badgeText.setVisible(showBadge).setPosition(12, -12).setFontSize("10px");
      if (showBadge) {
        indicator.badge.clear();
        indicator.badge.fillStyle(0x111827, 0.96);
        indicator.badge.fillCircle(12, -12, 8);
        indicator.badge.lineStyle(1.5, 0xffffff, 0.28);
        indicator.badge.strokeCircle(12, -12, 8);
        indicator.badgeText.setText(`${group.count}`);
      } else {
        indicator.badge.clear();
      }
    });

    this.raiderEdgeIndicators?.forEach((indicator, key) => {
      if (seen.has(key)) return;
      indicator.root?.setVisible(false);
    });
  }

  _syncUiAnimationTimeScale() {
    const appliedSpeed = this.worldScene?.getAppliedSimulationSpeed?.() ?? 1;
    if (appliedSpeed <= 1 && this._uiAnimationCompSpeed === appliedSpeed) return;

    const localSpeed = appliedSpeed > 0 ? 1 / appliedSpeed : 1;
    const visit = (node) => {
      if (!node) return;
      if (node.anims) {
        if (typeof node.anims.setTimeScale === "function") node.anims.setTimeScale(localSpeed);
        else if ("timeScale" in node.anims) node.anims.timeScale = localSpeed;
      }
      if (Array.isArray(node.list)) node.list.forEach(visit);
    };

    this.children.list.forEach(visit);
    this._uiAnimationCompSpeed = appliedSpeed;
  }

  _buildContractHud() {
    if (this.contractHud) return;
    this.contractHud = new ContractHud(this);
  }

  _buildSelectionCommandBar() {
    if (this.selectionCommandBar) return;
    this.selectionCommandBar = new SelectionCommandBar(this);
  }

  _buildProductionStatusHud() {
    if (this.productionStatusHud) return;
    this.productionStatusHud = this.add.container(0, 0).setDepth(UIDEPTH + 16);
    this.productionStatusEntries = new Map();
    this._productionStatusSignature = "";
  }

  _destroyProductionStatusHud() {
    this.productionStatusEntries?.forEach?.((entry) => {
      this.tweens.killTweensOf(entry?.root);
      this.tweens.killTweensOf(entry?.glow);
      entry?.root?.destroy?.(true);
    });
    this.productionStatusEntries?.clear?.();
    this.productionStatusEntries = null;
    this.productionStatusHud?.destroy?.(true);
    this.productionStatusHud = null;
    this._productionStatusSignature = "";
  }

  _normalizeProductionKind(kind = null) {
    const raw = String(kind || "").trim();
    if (!raw) return null;
    const normalized = raw.toLowerCase();
    if (normalized === "water" || normalized === "clean_water" || normalized === "unclean_water") return "water";
    if (normalized === "wood" || normalized === "pine") return "wood";
    if (normalized === "stone" || normalized === "rock") return "stone";
    if (normalized === "gold" || normalized === "goldore") return "gold";
    if (normalized === "seed" || normalized === "seedcrop" || normalized === "seedbush") return "seed";
    if (normalized === "berry" || normalized === "berries" || normalized === "seedberry" || normalized === "berrybush") return "berry";
    return null;
  }

  _getProductionIndicatorConfig(kind = null) {
    switch (kind) {
      case "water":
        return {
          key: "water",
          iconKey: UI_ITEM_TYPES.clean_water.icon,
          glowColor: 0x74d7ff,
          bgColor: 0x075985,
          hoverLabel: "Producing Clean Water",
        };
      case "wood":
        return {
          key: "wood",
          iconKey: UI_ITEM_TYPES.wood.icon,
          glowColor: 0xf59e0b,
          bgColor: 0x92400e,
          hoverLabel: "Gathering Wood",
        };
      case "stone":
        return {
          key: "stone",
          iconKey: UI_ITEM_TYPES.stone.icon,
          glowColor: 0xd6deeb,
          bgColor: 0x475569,
          hoverLabel: "Gathering Stone",
        };
      case "seed":
        return {
          key: "seed",
          iconKey: UI_ITEM_TYPES.seedCrop.icon,
          glowColor: 0x86efac,
          bgColor: 0x166534,
          hoverLabel: "Gathering Crop Seeds",
        };
      case "berry":
        return {
          key: "berry",
          iconKey: UI_ITEM_TYPES.seedBerry.icon,
          glowColor: 0xfb7185,
          bgColor: 0x9f1239,
          hoverLabel: "Gathering Berry Seeds",
        };
      case "gold":
        return {
          key: "gold",
          iconKey: "monies",
          glowColor: 0xfacc15,
          bgColor: 0x854d0e,
          hoverLabel: "Gathering Gold",
        };
      default:
        return null;
    }
  }

  _getAdrenalineRemainingMs() {
    if (!this._adrenalineUntil) return 0;
    const now = this.worldScene?.getSimulationNow?.() ?? this.worldScene?.simNowMs ?? this.time.now;
    return Math.max(0, this._adrenalineUntil - now);
  }

  _getAdrenalineIndicatorConfig() {
    const remaining = this._getAdrenalineRemainingMs();
    if (remaining <= 0) return null;
    return {
      key: "adrenaline",
      iconKey: MARKET_REAL_ASSETS.cardIcons.adrenalineDraft,
      glowColor: 0xfff17a,
      bgColor: 0x854d0e,
      hoverLabel: "Adrenaline Draft active",
      timerText: `${Math.ceil(remaining / 1000)}s`,
      width: 78,
    };
  }

  _getTimedBuffRemainingMs(kind = "") {
    const now = this.worldScene?.getSimulationNow?.() ?? this.worldScene?.simNowMs ?? this.time.now;
    if (kind === "meleeCrit") return Math.max(0, Number(this._meleeCritUntil || 0) - now);
    if (kind === "projectileCrit") return Math.max(0, Number(this._projectileCritUntil || 0) - now);
    return 0;
  }

  _getMeleeCritIndicatorConfig() {
    const remaining = this._getTimedBuffRemainingMs("meleeCrit");
    if (remaining <= 0) return null;
    return {
      key: "meleeCrit",
      iconKey: MARKET_REAL_ASSETS.cardIcons.meleeCritBuff,
      glowColor: 0xff8a6b,
      bgColor: 0x7f1d1d,
      hoverLabel: "Killer Instinct active",
      timerText: `${Math.ceil(remaining / 1000)}s`,
      width: 78,
    };
  }

  _getProjectileCritIndicatorConfig() {
    const remaining = this._getTimedBuffRemainingMs("projectileCrit");
    if (remaining <= 0) return null;
    return {
      key: "projectileCrit",
      iconKey: MARKET_REAL_ASSETS.cardIcons.projectileCritBuff,
      glowColor: 0xffd166,
      bgColor: 0x78350f,
      hoverLabel: "Deadeye Volley active",
      timerText: `${Math.ceil(remaining / 1000)}s`,
      width: 78,
    };
  }

  _isWaterProductionJob(job = null) {
    if (!job) return false;
    if (job.item?.name === UI_ITEM_TYPES.unclean_water.name) return true;
    const output = job.oven?.outputSlots?.[job.outputidx ?? 0];
    return output?.item?.name === UI_ITEM_TYPES.clean_water.name;
  }

  _isWaterProductionActive(team) {
    const firemen = team?.firemanList || [];
    if (firemen.some((troop) => (
      troop?.active
      && troop?.currentOrder?.status === "active"
      && troop.currentOrder.kind === ORDER_KINDS.MAKE_WATER
      && !troop.currentOrder?.shuttingDown
    ))) {
      return true;
    }

    return ["ovenJobs", "ovenPickupJobs"].some((listKey) => (
      (team?.[listKey] || []).some((job) => this._isWaterProductionJob(job))
    ));
  }

  _collectGatherKindsForTroop(troop) {
    const order = troop?.currentOrder;
    if (!troop?.active || !isGatherOrder(order) || order?.shuttingDown) return [];
    if (
      order.kind === ORDER_KINDS.GATHER_TYPE &&
      !OrderRunner.isGatherCommandAvailable(order.resourceType, this.worldScene ?? this)
    ) {
      return [];
    }

    const kinds = new Set();
    const addKind = (value) => {
      const normalized = this._normalizeProductionKind(value);
      if (normalized) kinds.add(normalized);
    };

    addKind(order?.resourceType);
    addKind(troop?.task?.resource?.name);
    addKind(troop?.task?.value?.resourceKind);
    addKind(troop?.task?.type?.resourceKind);
    addKind(troop?.task?.type?.name);
    addKind(troop?.carrying?.name);

    if (order?.kind === ORDER_KINDS.GATHER_SET) {
      (order.nodeKeys || []).forEach((nodeKey) => addKind(String(nodeKey || "").split(":")[0]));
    }

    return Array.from(kinds);
  }

  _getActiveProductionKinds() {
    const team = Teams.getTeam(1);
    if (!team) return [];

    const kinds = new Set();
    if (this._isWaterProductionActive(team)) {
      kinds.add("water");
    }

    (team.foragerList || []).forEach((troop) => {
      this._collectGatherKindsForTroop(troop).forEach((kind) => kinds.add(kind));
    });

    const order = ["water", "wood", "stone", "seed", "berry", "gold"];
    return order.filter((kind) => kinds.has(kind));
  }

  _getActiveStatusConfigs() {
    const configs = [];
    const adrenaline = this._getAdrenalineIndicatorConfig();
    if (adrenaline) configs.push(adrenaline);
    const meleeCrit = this._getMeleeCritIndicatorConfig();
    if (meleeCrit) configs.push(meleeCrit);
    const projectileCrit = this._getProjectileCritIndicatorConfig();
    if (projectileCrit) configs.push(projectileCrit);
    return configs.concat(
      this._getActiveProductionKinds()
        .map((kind) => this._getProductionIndicatorConfig(kind))
        .filter(Boolean)
    );
  }

  _createProductionStatusEntry(config, index = 0) {
    const width = Math.max(34, Number(config.width ?? (config.timerText ? 78 : 34)));
    const height = 34;
    const halfW = width / 2;
    const root = this.add.container(0, 0);
    const glow = this.add.graphics().setAlpha(0.74);
    const bg = this.add.graphics();
    const frame = this.add.graphics();
    const hasTimer = !!config.timerText;
    const iconX = hasTimer ? (-halfW + 16) : 0;
    const icon = this.textures.exists(config.iconKey)
      ? this.add.image(iconX, 0, config.iconKey).setDisplaySize(18, 18).setAlpha(0.98)
      : this.add.text(iconX, 0, "!", {
        fontFamily: "Bungee",
        fontSize: "12px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      }).setOrigin(0.5);
    const timerText = hasTimer
      ? this.add.text(iconX + 16, 0, config.timerText, {
        fontFamily: "Bungee",
        fontSize: "11px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      }).setOrigin(0, 0.5)
      : null;
    const hit = this.add.zone(0, 0, width + 6, height + 4).setInteractive({ useHandCursor: true });

    glow.fillStyle(config.glowColor, 0.09);
    glow.fillCircle(iconX, 0, 15);
    glow.lineStyle(1, config.glowColor, 0.24);
    glow.strokeRoundedRect(-halfW + 1, -height / 2 + 1, width - 2, height - 2, 12);

    bg.fillStyle(config.bgColor || config.glowColor, 0.5);
    bg.fillRoundedRect(-halfW, -height / 2, width, height, 12);

    frame.lineStyle(1.6, config.glowColor, 0.66);
    frame.strokeRoundedRect(-halfW, -height / 2, width, height, 12);
    frame.lineStyle(1, 0xffffff, 0.12);
    frame.strokeRoundedRect(-halfW + 2, -height / 2 + 2, width - 4, height - 4, 10);

    hit.on("pointerover", () => {
      const anchor = this._getUiPoint(root);
      if (!anchor) return;
      this._showTopHudHover(config.hoverLabel || "", anchor.x, anchor.y - 34);
    });
    hit.on("pointerout", () => this._hideTopHudHover());

    root.add([glow, bg, frame, icon, hit]);
    if (timerText) root.add(timerText);
    root.setAlpha(0);
    root.setScale(0.94);
    this.productionStatusHud?.add?.(root);

    this.tweens.add({
      targets: root,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 180,
      delay: index * 40,
      ease: "Back.easeOut",
    });
    this.tweens.add({
      targets: glow,
      alpha: 0.34,
      duration: 900,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
      delay: index * 80,
    });
    this.tweens.add({
      targets: root,
      scaleX: 1.04,
      scaleY: 1.04,
      duration: 980,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
      delay: index * 80,
    });

    return { key: config.key, root, glow, timerText, width };
  }

  _updateProductionStatusEntry(entry, config) {
    if (!entry) return;
    if (entry.timerText) {
      const nextTimer = String(config.timerText || "");
      if (entry._lastTimerText !== nextTimer) {
        entry._lastTimerText = nextTimer;
        entry.timerText.setText(nextTimer);
      }
    }
    entry.width = Math.max(34, Number(config.width ?? (config.timerText ? 78 : 34)));
  }

  _getProductionStatusAnchor() {
    const edgeMargin = 5;
    const iconBottomGap = 5;
    const iconHeight = 34;
    const yOffsetFromBarTop = Math.round((iconHeight / 2) + iconBottomGap);
    const buttons = this.uiBottomBar?.tabs?.buttons || [];
    const functionButton = buttons.find((button) => button?.name === "functions") || buttons[0] || null;
    const buttonBounds = functionButton?.getBounds?.();
    if (buttonBounds && Number.isFinite(buttonBounds.left) && Number.isFinite(buttonBounds.top)) {
      return {
        x: edgeMargin,
        y: Math.round(buttonBounds.top - yOffsetFromBarTop),
      };
    }

    const tabsBounds = this.uiBottomBar?.tabs?.getBounds?.();
    if (tabsBounds && Number.isFinite(tabsBounds.left) && Number.isFinite(tabsBounds.top)) {
      return {
        x: edgeMargin,
        y: Math.round(tabsBounds.top - yOffsetFromBarTop),
      };
    }

    const bottomBarProgress = Phaser.Math.Clamp(
      Number(this.uiBottomBar?.openProgress ?? (this.uiBottomBar?.expanded ? 1 : 0)),
      0,
      1
    );
    const bottomReserve = Phaser.Math.Linear(74, 190, bottomBarProgress);
    return {
      x: edgeMargin,
      y: Math.round(this.scale.height - bottomReserve - yOffsetFromBarTop),
    };
  }

  _refreshProductionStatusHud(force = false) {
    if (!this.productionStatusHud) return;

    const configs = this._getActiveStatusConfigs();

    const signature = configs.map((config) => config.key).join("|");
    if (force || signature !== this._productionStatusSignature) {
      const activeKeys = new Set(configs.map((config) => config.key));
      this.productionStatusEntries?.forEach?.((entry, key) => {
        if (activeKeys.has(key)) return;
        this.tweens.killTweensOf(entry?.root);
        this.tweens.killTweensOf(entry?.glow);
        entry?.root?.destroy?.(true);
        this.productionStatusEntries.delete(key);
      });

      configs.forEach((config, index) => {
        if (this.productionStatusEntries?.has?.(config.key)) return;
        const entry = this._createProductionStatusEntry(config, index);
        this.productionStatusEntries?.set?.(config.key, entry);
      });

      this._productionStatusSignature = signature;
    }

    const visible = configs.length > 0;
    this.productionStatusHud.setVisible(visible);
    if (!visible) return;

    const anchor = this._getProductionStatusAnchor();
    const gap = 8;
    let cursorX = anchor.x;

    configs.forEach((config, index) => {
      const entry = this.productionStatusEntries?.get?.(config.key);
      if (!entry?.root) return;
      this._updateProductionStatusEntry(entry, config);
      const width = entry.width || 34;
      entry.root.setPosition(cursorX + width / 2, anchor.y);
      entry.root.setVisible(true);
      cursorX += width + gap;
    });
  }

  _ghostAt(targetText, content, color) {
    if (this._sceneShuttingDown || !this._canMutateText(targetText)) return;
    const ghost = this.add
      .text(targetText.x, targetText.y, content, { fontSize: "18px", fill: color })
      .setOrigin(0, 0)
      .setDepth(UIDEPTH);
    this.tweens.add({
      targets: ghost,
      y: ghost.y - 20,
      alpha: 0,
      duration: 800,
      ease: "Cubic.easeOut",
      onComplete: () => ghost.destroy(),
    });
  }

  _drawRoundedPanel(target, width, height, opts = {}) {
    const radius = Math.max(10, Math.round(Number(opts.radius ?? 24) || 24));
    const fillColor = opts.fillColor ?? 0x10263b;
    const fillAlpha = opts.fillAlpha ?? 0.98;
    const strokeColor = opts.strokeColor ?? 0xffffff;
    const strokeAlpha = opts.strokeAlpha ?? 0.18;
    const strokeWidth = Math.max(1, Math.round(Number(opts.strokeWidth ?? 2) || 2));
    const shadowColor = opts.shadowColor ?? 0x04101a;
    const shadowAlpha = opts.shadowAlpha ?? 0.26;
    const shadowOffsetY = Number(opts.shadowOffsetY ?? 10) || 0;

    target.clear();

    if (shadowAlpha > 0) {
      target.fillStyle(shadowColor, shadowAlpha);
      target.fillRoundedRect(-width / 2, (-height / 2) + shadowOffsetY, width, height, radius);
    }

    target.fillStyle(fillColor, fillAlpha);
    target.fillRoundedRect(-width / 2, -height / 2, width, height, radius);

    if (opts.topStripColor != null) {
      const stripHeight = Math.max(8, Math.round(Number(opts.topStripHeight ?? 10) || 10));
      target.fillStyle(opts.topStripColor, opts.topStripAlpha ?? 1);
      target.fillRoundedRect(-width / 2, -height / 2, width, stripHeight, Math.max(6, Math.min(radius, stripHeight)));
    }

    if (strokeAlpha > 0) {
      target.lineStyle(strokeWidth, strokeColor, strokeAlpha);
      target.strokeRoundedRect(-width / 2, -height / 2, width, height, radius);
    }

    return target;
  }

  _buildPauseMenuButton() {
    if (this.pauseMenuButton) return this.pauseMenuButton;

    const root = this.add.container(0, 0).setDepth(UIDEPTH + 18);
    const bg = this.add.rectangle(0, 0, 42, 30, 0x0b1c2a, 0.001)
      .setStrokeStyle(2, 0x9edfff, 0)
      .setInteractive({ useHandCursor: true });
    const label = this.add.text(0, 0, "II", {
      fontFamily: "Bungee",
      fontSize: "15px",
      color: "#effbff",
      stroke: "#04111c",
      strokeThickness: 3,
    }).setOrigin(0.5);
    root.add([bg, label]);
    root.bg = bg;
    root.label = label;
    root.refresh = () => {
      const active = !!this.pauseMenu?.isOpen;
      bg.setFillStyle(0x0b1c2a, 0.001);
      bg.setStrokeStyle(2, 0x9edfff, 0);
      label.setColor(active ? "#8fe7ff" : "#effbff");
      label.setScale(1);
    };
    const layout = ({ width } = this.scale) => {
      root.setPosition(Math.round(width - 34), 22);
    };
    layout();
    this._trackScaleResize(layout);
    bg.on("pointerover", () => {
      if (this.pauseMenu?.isOpen) return;
      AudioManager.playUiHover({ volume: 0.16 });
      bg.setFillStyle(0x0b1c2a, 0.32);
      bg.setStrokeStyle(2, 0x9edfff, 0.22);
      label.setColor("#c6f7ff");
      label.setScale(1.05);
    });
    bg.on("pointerout", () => root.refresh?.());
    this._bindTopHudHover(bg, "Pause", {
      canShow: () => !this.pauseMenu?.isOpen,
    });
    bg.on("pointerdown", (pointer, lx, ly, event) => {
      event?.stopPropagation?.();
      AudioManager.playMenuClick();
      this._hideTopHudHover(true);
      if (this.pauseMenu?.isOpen) this.closePauseMenu();
      else this.openPauseMenu();
    });
    root.refresh();
    this.pauseMenuButton = root;
    return root;
  }

  _setPauseWorldInputEnabled(enabled = true) {
    const world = this.worldScene;
    if (!world?.input) return;
    if (enabled) {
      if (this._pauseWorldInputState) {
        world.input.enabled = this._pauseWorldInputState.enabled;
        if (world.input.keyboard) world.input.keyboard.enabled = this._pauseWorldInputState.keyboardEnabled;
      } else {
        world.input.enabled = true;
        if (world.input.keyboard) world.input.keyboard.enabled = true;
      }
      this._pauseWorldInputState = null;
      return;
    }

    this._pauseWorldInputState = {
      enabled: world.input.enabled !== false,
      keyboardEnabled: world.input.keyboard?.enabled !== false,
    };
    world.input.enabled = false;
    if (world.input.keyboard) world.input.keyboard.enabled = false;
  }

  _applyPauseBackdropFx() {
    const world = this.worldScene;
    if (!world) return;
    const cam = world.cameras?.main;
    if (!this._pauseBackdropFx) {
      this._pauseBackdropFx = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x71d6ff, 0)
        .setOrigin(0)
        .setDepth(UIDEPTH + 118)
        .setScrollFactor(0);
    }
    try {
      this._clearPauseBackdropFx();
      this._pauseBlurFx = cam?.postFX?.addBlur?.(0, 0, 1, 1, 0x79dcff, 5) || null;
    } catch {
      this._pauseBlurFx = null;
    }
  }

  _getPauseHudObscureTargets() {
    return [
      this.topHud,
      this.townXpHud,
      this.phaseClock,
      this.townStatusHud,
      this.achievementBoard?.root,
      this.alertHud,
      this.contractHud?.root,
      this.uiBottomBar?.ui,
      this.productionStatusHud,
      this.raiderEdgeHud,
      this.pauseMenuButton,
      this.zoomControls,
    ].filter(Boolean);
  }

  _setPauseHudObscured(obscured = true) {
    if (!this._pauseHudObscureState) {
      this._pauseHudObscureState = new Map();
    }

    const targets = this._getPauseHudObscureTargets();
    if (obscured) {
      targets.forEach((target) => {
        if (!target || this._pauseHudObscureState.has(target)) return;
        this._pauseHudObscureState.set(target, {
          alpha: Number.isFinite(target.alpha) ? target.alpha : 1,
        });
        target.setAlpha(0.24);
      });
      return;
    }

    this._pauseHudObscureState.forEach((state, target) => {
      if (!target?.active) return;
      target.setAlpha(Number.isFinite(state?.alpha) ? state.alpha : 1);
    });
    this._pauseHudObscureState.clear();
  }

  _clearPauseBackdropFx() {
    const cam = this.worldScene?.cameras?.main;
    if (cam?.postFX?.remove && this._pauseBlurFx) {
      try {
        cam.postFX.remove(this._pauseBlurFx);
      } catch {}
    }
    this._pauseBlurFx?.destroy?.();
    this._pauseBlurFx = null;
  }

  _buildPauseMenu() {
    if (this.pauseMenu) return this.pauseMenu;

    const root = this.add.container(0, 0).setDepth((UIDEPTH ?? 0) + 10020).setAlpha(0).setVisible(false);
    root.isOpen = false;

    const blocker = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x02070d, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: false })
      .setScrollFactor(0);
    const panel = this.add.container(this.scale.width * 0.5, this.scale.height * 0.54).setScale(0.92);
    const blueWash = this._pauseBackdropFx || this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x71d6ff, 0)
      .setOrigin(0)
      .setDepth(UIDEPTH + 118)
      .setScrollFactor(0);
    this._pauseBackdropFx = blueWash;

    const panelBg = this.add.graphics();
    const panelInner = this.add.graphics();
    const panelShine = this.add.graphics();
    const accentOrbA = this.add.circle(-170, -86, 92, 0x8fe7ff, 0.10);
    const accentOrbB = this.add.circle(176, 128, 116, 0x3ea4ff, 0.09);
    const panelWidth = 560;
    const panelHeight = 408;
    this._drawRoundedPanel(panelBg, panelWidth, panelHeight, {
      radius: 30,
      fillColor: 0x0d2030,
      fillAlpha: 0.96,
      strokeColor: 0xa6ecff,
      strokeAlpha: 0.22,
      shadowColor: 0x02101a,
      shadowAlpha: 0.36,
      shadowOffsetY: 14,
      topStripColor: 0x1d5473,
      topStripAlpha: 0.9,
      topStripHeight: 18,
    });
    panelInner.fillStyle(0x123148, 0.38);
    panelInner.fillRoundedRect(-(panelWidth / 2) + 14, -(panelHeight / 2) + 18, panelWidth - 28, panelHeight - 32, 24);
    panelShine.fillStyle(0xffffff, 0.07);
    panelShine.fillRoundedRect(-(panelWidth / 2) + 42, -(panelHeight / 2) + 22, panelWidth - 84, 24, 14);

    const logo = this.textures.exists("logoMini")
      ? this.add.image(0, -(panelHeight / 2), "logoMini").setOrigin(0.5, 0.5).setScale(1.12)
      : null;
    const title = this.add.text(0, -134, "PAUSE MENU", {
      fontFamily: "Bungee",
      fontSize: "30px",
      color: "#f3fbff",
      stroke: "#04111a",
      strokeThickness: 5,
    }).setOrigin(0.5);

    const closeBg = this.add.rectangle((panelWidth / 2) - 34, -(panelHeight / 2) + 28, 36, 36, 0x163a50, 0.001)
      .setInteractive({ useHandCursor: true });
    const closeLabel = this.add.text(closeBg.x, closeBg.y, "X", {
      fontFamily: "Bungee",
      fontSize: "14px",
      color: "#effbff",
      stroke: "#04111a",
      strokeThickness: 3,
    }).setOrigin(0.5);

    const audioCard = this.add.graphics();
    this._drawRoundedPanel(audioCard, panelWidth - 84, 128, {
      radius: 22,
      fillColor: 0x11293c,
      fillAlpha: 0.94,
      strokeColor: 0xffffff,
      strokeAlpha: 0.10,
      shadowAlpha: 0.16,
      shadowOffsetY: 8,
    });
    audioCard.setPosition(0, -6);
    const audioTitle = this.add.text(-(panelWidth / 2) + 78, -44, "MASTER VOLUME", {
      fontFamily: "Bungee",
      fontSize: "15px",
      color: "#f3fbff",
      stroke: "#04111a",
      strokeThickness: 4,
    }).setOrigin(0, 0.5);
    const audioHint = this.add.text(audioTitle.x, -18, "All ambience, combat, UI, and world sound", {
      fontFamily: "Bungee",
      fontSize: "10px",
      color: "#9cc3d7",
      stroke: "#04111a",
      strokeThickness: 3,
    }).setOrigin(0, 0.5);
    const volumeValue = this.add.text((panelWidth / 2) - 136, -30, "100%", {
      fontFamily: "Bungee",
      fontSize: "16px",
      color: "#8fe7ff",
      stroke: "#04111a",
      strokeThickness: 4,
    }).setOrigin(0.5);
    const sliderTrack = this.add.rectangle(-18, 22, panelWidth - 244, 16, 0x09131d, 0.96)
      .setStrokeStyle(2, 0xffffff, 0.10)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const sliderFill = this.add.rectangle(sliderTrack.x - (sliderTrack.width / 2) + 2, 22, 1, 10, 0x7de7ff, 1)
      .setOrigin(0, 0.5);
    const sliderThumb = this.add.circle(0, 22, 12, 0xf7fdff, 1)
      .setStrokeStyle(3, 0x7de7ff, 0.9)
      .setInteractive({ draggable: true, useHandCursor: true });

    const actionButtonRefs = [];
    const isTutorialSaveBlocked = () => !!this.worldScene?.tutorialManager?.isBlockingSaves?.();
    const makeActionButton = (x, y, width, label, hint, palette, onClick) => {
      const bg = this.add.graphics();
      const hasHint = typeof hint === "string" && hint.trim().length > 0;
      const buttonHeight = hasHint ? 64 : 54;
      const isDisabled = () => {
        if (typeof palette.disabled === "function") return !!palette.disabled();
        return !!palette.disabled;
      };
      const draw = (hovered = false) => {
        const disabled = isDisabled();
        this._drawRoundedPanel(bg, width, buttonHeight, {
          radius: 20,
          fillColor: disabled ? 0x26313a : (hovered ? palette.hoverFill : palette.fill),
          fillAlpha: disabled ? 0.72 : 0.98,
          strokeColor: disabled ? 0x81919e : (hovered ? palette.hoverStroke : palette.stroke),
          strokeAlpha: disabled ? 0.14 : (hovered ? 0.34 : 0.20),
          shadowColor: 0x03101a,
          shadowAlpha: disabled ? 0.10 : 0.24,
          shadowOffsetY: 7,
        });
      };
      draw(false);
      bg.setPosition(x, y);
      bg.setInteractive(new Phaser.Geom.Rectangle(-(width / 2), -(buttonHeight / 2), width, buttonHeight), Phaser.Geom.Rectangle.Contains);
      const titleText = this.add.text(x, y + (hasHint ? -9 : 0), label, {
        fontFamily: "Bungee",
        fontSize: "16px",
        color: palette.text,
        stroke: "#04111a",
        strokeThickness: 3,
      }).setOrigin(0.5);
      const hintText = this.add.text(x, y + 12, hasHint ? hint : "", {
        fontFamily: "Bungee",
        fontSize: "10px",
        color: palette.subtext,
        stroke: "#04111a",
        strokeThickness: 2,
      }).setOrigin(0.5).setVisible(hasHint);
      const refresh = (hovered = false) => {
        const disabled = isDisabled();
        draw(hovered && !disabled);
        titleText.setColor(disabled ? "#9aa7b2" : palette.text);
        hintText.setColor(disabled ? "#c5ced6" : palette.subtext);
        hintText.setVisible(hasHint);
        if (hasHint) {
          hintText.setText(disabled ? (palette.disabledHint || "Finish tutorial first") : hint);
        }
        bg.setAlpha(disabled ? 0.88 : 1);
        titleText.setAlpha(disabled ? 0.78 : 1);
        hintText.setAlpha(hasHint ? (disabled ? 0.82 : 1) : 0);
      };
      bg.on("pointerover", () => {
        if (!isDisabled()) AudioManager.playUiHover({ volume: 0.16 });
        refresh(true);
        bg.setScale(isDisabled() ? 1 : 1.02);
      });
      bg.on("pointerout", () => {
        refresh(false);
        bg.setScale(1);
      });
      bg.on("pointerdown", (pointer, lx, ly, event) => {
        event?.stopPropagation?.();
        if (isDisabled()) {
          AudioManager.playError({ volume: 0.18 });
          this.showAlertMessage(palette.disabledHint || "Finish tutorial first", "#fca5a5", 1500);
          return;
        }
        AudioManager.playMenuClick();
        this.tweens.add({
          targets: [bg, titleText, hintText],
          scaleX: 0.98,
          scaleY: 0.98,
          yoyo: true,
          duration: 80,
        });
        onClick?.();
      });
      bg.refreshButtonState = refresh;
      actionButtonRefs.push({ refresh });
      refresh(false);
      return [bg, titleText, hintText];
    };

    const mutePalette = {
      fill: 0x17344a,
      hoverFill: 0x22506d,
      stroke: 0xaeefff,
      hoverStroke: 0xffffff,
      text: "#effbff",
      mutedFill: 0x4a1f2a,
      mutedStroke: 0xffc4cf,
      mutedText: "#ffd7de",
    };
    const muteBtn = this.add.graphics();
    const muteIcon = this.add.text((panelWidth / 2) - 80, 22, "", {
      fontFamily: "Segoe UI Emoji",
      fontSize: "22px",
      color: mutePalette.text,
      stroke: "#04111a",
      strokeThickness: 2,
    }).setOrigin(0.5);
    muteBtn.setPosition(muteIcon.x, muteIcon.y);
    muteBtn.setInteractive(new Phaser.Geom.Circle(0, 0, 21), Phaser.Geom.Circle.Contains);

    const pauseMenu = {
      root,
      blocker,
      panel,
      panelBg,
      panelInner,
      panelShine,
      blueWash,
      closeBg,
      closeLabel,
      sliderTrack,
      sliderFill,
      sliderThumb,
      volumeValue,
      muteBtn,
      muteIcon,
      confirm: null,
      isOpen: false,
      draggingSlider: false,
      actionButtonRefs,
      panelBaseY: this.scale.height * 0.54,
      getDisplayVolume: () => {
        const sceneVolume = Number(this.sound?.volume);
        const audioVolume = Number(AudioManager.getMasterVolume());
        const resolved = Number.isFinite(sceneVolume) ? sceneVolume : audioVolume;
        return Phaser.Math.Clamp(Number.isFinite(resolved) ? resolved : 1, 0, 1);
      },
      setVolume: (nextValue, commit = true) => {
        const value = Phaser.Math.Clamp(Number(nextValue ?? 1), 0, 1);
        pauseMenu.volume = value;
        const usableWidth = Math.max(8, sliderTrack.width - 8);
        sliderFill.width = Math.max(8, usableWidth * value);
        sliderThumb.x = sliderTrack.x - (sliderTrack.width / 2) + 4 + Math.max(0, usableWidth * value);
        volumeValue.setText(`${Math.round(value * 100)}%`);
        if (commit) AudioManager.setMasterVolume(value);
      },
      refreshMute: (hovered = false) => {
        const muted = AudioManager.isMuted();
        this._drawRoundedPanel(muteBtn, 42, 42, {
          radius: 21,
          fillColor: muted ? mutePalette.mutedFill : (hovered ? mutePalette.hoverFill : mutePalette.fill),
          fillAlpha: hovered ? 1 : 0.96,
          strokeColor: muted ? mutePalette.mutedStroke : (hovered ? mutePalette.hoverStroke : mutePalette.stroke),
          strokeAlpha: muted ? 0.34 : (hovered ? 0.28 : 0.18),
          shadowAlpha: 0.18,
          shadowOffsetY: 5,
        });
        muteIcon.setText(muted ? "\uD83D\uDD07" : "\uD83D\uDD0A");
        muteIcon.setColor(muted ? mutePalette.mutedText : mutePalette.text);
      },
    };

    const sliderSetFromPointer = (pointer) => {
      const localX = Phaser.Math.Clamp(pointer.x - panel.x, sliderTrack.x - sliderTrack.width / 2, sliderTrack.x + sliderTrack.width / 2);
      const ratio = (localX - (sliderTrack.x - sliderTrack.width / 2)) / sliderTrack.width;
      pauseMenu.setVolume(ratio, true);
    };

    sliderTrack.on("pointerdown", (pointer, lx, ly, event) => {
      event?.stopPropagation?.();
      sliderSetFromPointer(pointer);
    });
    sliderThumb.on("drag", (pointer) => {
      sliderSetFromPointer(pointer);
    });
    muteBtn.on("pointerdown", (pointer, lx, ly, event) => {
      event?.stopPropagation?.();
      AudioManager.playMenuClick();
      AudioManager.setMuted(!AudioManager.isMuted());
      pauseMenu.refreshMute();
    });
    muteBtn.on("pointerover", () => {
      AudioManager.playUiHover({ volume: 0.16 });
      pauseMenu.refreshMute(true);
    });
    muteBtn.on("pointerout", () => pauseMenu.refreshMute());

    const saveAction = () => {
      if (isTutorialSaveBlocked()) {
        this.showAlertMessage("Finish tutorial first", "#fca5a5", 1600);
        return;
      }
      SaveManager.attachScene(this.worldScene);
      const ok = SaveManager.saveNow("manual", { silent: false });
      if (!ok) {
        this.showAlertMessage("SAVE MISSED", "#fca5a5", 1600);
      }
    };
    const showLeavePrompt = () => this._showPauseExitConfirm();

    const buttons = [
      ...makeActionButton(-150, 138, 180, "SAVE", null, {
        fill: 0x1a5f57,
        hoverFill: 0x238074,
        stroke: 0xb9fff0,
        hoverStroke: 0xffffff,
        text: "#eafffb",
        subtext: "#b8efe4",
        disabled: isTutorialSaveBlocked,
        disabledHint: "Finish tutorial first",
      }, saveAction),
      ...makeActionButton(0, 218, 250, "BACK TO GAME", null, {
        fill: 0x6dd3f5,
        hoverFill: 0x8de7ff,
        stroke: 0xdff9ff,
        hoverStroke: 0xffffff,
        text: "#effbff",
        subtext: "#d7f6ff",
      }, () => this.closePauseMenu()),
      ...makeActionButton(150, 138, 220, "MAIN MENU", null, {
        fill: 0x3a2645,
        hoverFill: 0x523164,
        stroke: 0xf0c3ff,
        hoverStroke: 0xffffff,
        text: "#fff2ff",
        subtext: "#e9c6f3",
      }, showLeavePrompt),
    ];

    closeBg.on("pointerover", () => {
      AudioManager.playUiHover({ volume: 0.16 });
      closeLabel.setColor("#8fe7ff");
      closeLabel.setScale(1.08);
    });
    closeBg.on("pointerout", () => {
      closeLabel.setColor("#effbff");
      closeLabel.setScale(1);
    });
    closeBg.on("pointerdown", (pointer, lx, ly, event) => {
      event?.stopPropagation?.();
      AudioManager.playMenuClick();
      this.closePauseMenu();
    });

      panel.add([
      panelBg,
      accentOrbA,
      accentOrbB,
      panelInner,
      panelShine,
      ...(logo ? [logo] : []),
      title,
      closeBg,
      closeLabel,
      audioCard,
      audioTitle,
      audioHint,
      volumeValue,
      sliderTrack,
      sliderFill,
      sliderThumb,
      muteBtn,
      muteIcon,
      ...buttons,
    ]);

    const buildConfirm = () => {
      const confirm = this.add.container(0, 0).setVisible(false).setAlpha(0).setScale(0.95);
      const shade = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x02070d, 0.54)
        .setOrigin(0)
        .setInteractive({ useHandCursor: false });
      const card = this.add.container(this.scale.width * 0.5, this.scale.height * 0.54);
      const cardBg = this.add.graphics();
      this._drawRoundedPanel(cardBg, 420, 220, {
        radius: 26,
        fillColor: 0x0d2030,
        fillAlpha: 0.98,
        strokeColor: 0xcaf5ff,
        strokeAlpha: 0.18,
        shadowAlpha: 0.32,
        shadowOffsetY: 10,
      });
      const qTitle = this.add.text(0, -58, "RETURN TO MAIN MENU?", {
        fontFamily: "Bungee",
        fontSize: "22px",
        color: "#f3fbff",
        stroke: "#04111a",
        strokeThickness: 4,
      }).setOrigin(0.5);
      const qText = this.add.text(0, -12, "Save first so Continue keeps this run exactly where it is?", {
        fontFamily: "Bungee",
        fontSize: "11px",
        color: "#c3dcea",
        stroke: "#04111a",
        strokeThickness: 3,
        align: "center",
        wordWrap: { width: 320 },
      }).setOrigin(0.5);
      const leave = () => {
        this.worldScene?.setSimulationPause?.("restart_to_main_menu", true);
        this._destroyPauseMenu(true);
        this.worldScene?.restartToMainMenu?.({ hostScene: this });
      };
      const promptButtons = [
        ...makeActionButton(-118, 54, 144, "SAVE + EXIT", null, {
          fill: 0x1f6258,
          hoverFill: 0x2b8477,
          stroke: 0xc5fff3,
          hoverStroke: 0xffffff,
        text: "#eafffb",
        subtext: "#b8efe4",
        disabled: isTutorialSaveBlocked,
        disabledHint: "Finish tutorial first",
      }, () => {
          if (isTutorialSaveBlocked()) {
            this.showAlertMessage("Finish tutorial first", "#fca5a5", 1600);
            return;
          }
          SaveManager.attachScene(this.worldScene);
          SaveManager.saveNow("manual", { silent: false });
          leave();
        }),
        ...makeActionButton(118, 54, 176, "EXIT WITHOUT SAVE", null, {
          fill: 0x5b2431,
          hoverFill: 0x7a3244,
          stroke: 0xffd0db,
          hoverStroke: 0xffffff,
          text: "#fff3f5",
          subtext: "#f0c0cb",
        }, leave),
        ...makeActionButton(0, 122, 130, "CANCEL", null, {
          fill: 0x22384a,
          hoverFill: 0x2f4a62,
          stroke: 0xd7f6ff,
          hoverStroke: 0xffffff,
          text: "#effbff",
          subtext: "#b6d9e6",
        }, () => this._hidePauseExitConfirm()),
      ];
      card.add([cardBg, qTitle, qText, ...promptButtons]);
      confirm.add([shade, card]);
      confirm.card = card;
      confirm.shade = shade;
      return confirm;
    };

    root.add([blueWash, blocker, panel]);
    pauseMenu.confirm = buildConfirm();
    root.add(pauseMenu.confirm);

    blocker.on("pointerdown", () => {
      if (pauseMenu.confirm?.visible) return;
      this.closePauseMenu();
    });

    root.refresh = () => {
      pauseMenu.setVolume(pauseMenu.getDisplayVolume(), false);
      pauseMenu.refreshMute();
      pauseMenu.actionButtonRefs?.forEach((entry) => entry.refresh?.(false));
      this.pauseMenuButton?.refresh?.();
    };

    const relayout = ({ width, height }) => {
      pauseMenu.panelBaseY = height * 0.54;
      blocker.setSize(width, height);
      blueWash.setSize(width, height);
      panel.setPosition(width * 0.5, pauseMenu.panelBaseY);
      if (pauseMenu.confirm?.card) pauseMenu.confirm.card.setPosition(width * 0.5, pauseMenu.panelBaseY);
      if (pauseMenu.confirm?.shade) pauseMenu.confirm.shade.setSize(width, height);
      pauseMenu.setVolume(pauseMenu.getDisplayVolume(), false);
      pauseMenu.refreshMute();
    };
    relayout(this.scale);
    this._trackScaleResize(relayout);
    pauseMenu.refreshMute();
    pauseMenu.setVolume(pauseMenu.getDisplayVolume(), false);

    this.pauseMenu = pauseMenu;
    return pauseMenu;
  }

  _showPauseExitConfirm() {
    const confirm = this.pauseMenu?.confirm;
    if (!confirm || confirm.visible) return;
    confirm.setVisible(true);
    confirm.alpha = 0;
    confirm.scale = 0.95;
    this.tweens.add({
      targets: confirm,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 180,
      ease: "Back.Out",
    });
  }

  _hidePauseExitConfirm() {
    const confirm = this.pauseMenu?.confirm;
    if (!confirm?.visible) return;
    this.tweens.add({
      targets: confirm,
      alpha: 0,
      scaleX: 0.95,
      scaleY: 0.95,
      duration: 150,
      ease: "Quad.Out",
      onComplete: () => confirm.setVisible(false),
    });
  }

  openPauseMenu() {
    const world = this.worldScene;
    if (!world || this.pauseMenu?.isOpen) return false;
    if (world._restartToMainMenuInProgress || world._townTowerLossInProgress || world.menu?.active) return false;

    const pauseMenu = this._buildPauseMenu();
    this.tweens.killTweensOf([pauseMenu.root, pauseMenu.panel, pauseMenu.blocker, pauseMenu.blueWash]);
    this._clearPauseBackdropFx();
    pauseMenu.root.setVisible(true);
    pauseMenu.root.alpha = 0;
    pauseMenu.panel.setAlpha(1);
    pauseMenu.panel.setScale(0.92);
    pauseMenu.panel.y = pauseMenu.panelBaseY + 16;
    pauseMenu.isOpen = true;

    this._setPauseWorldInputEnabled(false);
    world.setSimulationPause?.("pause_menu", true);
    this._setPauseHudObscured(true);
    this._applyPauseBackdropFx();
    this._hidePauseExitConfirm();
    pauseMenu.refresh?.();

    this.tweens.add({
      targets: pauseMenu.blueWash,
      alpha: 0.16,
      duration: 180,
      ease: "Quad.Out",
    });
    this.tweens.add({
      targets: pauseMenu.blocker,
      alpha: 0.60,
      duration: 180,
      ease: "Quad.Out",
    });
    this.tweens.add({
      targets: pauseMenu.root,
      alpha: 1,
      duration: 180,
      ease: "Quad.Out",
    });
    this.tweens.add({
      targets: pauseMenu.panel,
      scaleX: 1,
      scaleY: 1,
      y: pauseMenu.panelBaseY,
      duration: 220,
      ease: "Back.Out",
    });
    this.pauseMenuButton?.refresh?.();
    return true;
  }

  closePauseMenu(immediate = false) {
    const pauseMenu = this.pauseMenu;
    const world = this.worldScene;
    if (!pauseMenu?.isOpen && !immediate) return false;
    pauseMenu.isOpen = false;
    this._hidePauseExitConfirm();
    world?.setSimulationPause?.("pause_menu", false);
    this._setPauseWorldInputEnabled(true);
    this.pauseMenuButton?.refresh?.();

    const finish = () => {
      pauseMenu.root.setVisible(false);
      this._clearPauseBackdropFx();
      this._setPauseHudObscured(false);
    };

    if (immediate) {
      pauseMenu.root.setAlpha(0).setVisible(false);
      pauseMenu.blocker.setAlpha(0);
      pauseMenu.blueWash.setAlpha(0);
      pauseMenu.panel.setScale(1).setAlpha(1);
      this._clearPauseBackdropFx();
      this._setPauseHudObscured(false);
      return true;
    }

    this.tweens.add({
      targets: pauseMenu.blueWash,
      alpha: 0,
      duration: 140,
      ease: "Quad.Out",
    });
    this.tweens.add({
      targets: pauseMenu.blocker,
      alpha: 0,
      duration: 140,
      ease: "Quad.Out",
    });
    this.tweens.add({
      targets: pauseMenu.root,
      alpha: 0,
      duration: 150,
      ease: "Quad.Out",
      onComplete: finish,
    });
    this.tweens.add({
      targets: pauseMenu.panel,
      scaleX: 0.96,
      scaleY: 0.96,
      alpha: 0.96,
      y: pauseMenu.panelBaseY + 12,
      duration: 150,
      ease: "Quad.Out",
    });
    return true;
  }

  _destroyPauseMenu(immediate = true) {
    if (this.pauseMenu?.isOpen) {
      this.worldScene?.setSimulationPause?.("pause_menu", false);
      this._setPauseWorldInputEnabled(true);
    }
    this._clearPauseBackdropFx();
    this._setPauseHudObscured(false);
    this._pauseBackdropFx?.destroy?.();
    this._pauseBackdropFx = null;
    this.pauseMenu?.root?.destroy?.(true);
    this.pauseMenu = null;
    this.pauseMenuButton?.destroy?.(true);
    this.pauseMenuButton = null;
  }

  _stopRewardChestTimer(sprite) {
    if (!sprite?._frameTimer) return;
    sprite._frameTimer.remove(false);
    sprite._frameTimer = null;
  }

  _animateRewardChest(sprite, toFrame = 0) {
    if (!sprite?.active) return;
    const current = Number(sprite.frame?.name ?? sprite.frame?.textureFrame ?? 0) || 0;
    if (current === toFrame) return;

    this._stopRewardChestTimer(sprite);
    const dir = toFrame > current ? 1 : -1;

    sprite._frameTimer = this.time.addEvent({
      delay: 45,
      loop: true,
      callback: () => {
        if (!sprite?.active) {
          this._stopRewardChestTimer(sprite);
          return;
        }
        const frameNow = Number(sprite.frame?.name ?? sprite.frame?.textureFrame ?? 0) || 0;
        const next = frameNow + dir;
        sprite.setFrame(next);
        if (next === toFrame) {
          this._stopRewardChestTimer(sprite);
        }
      },
    });
  }

  _buildTownXpRewardVisual(option, cardWidth, cardHeight, accent, destroyers = []) {
    const nodes = [];
    const hoverIn = [];
    const hoverOut = [];
    let onSelect = null;
    let selectDelayMs = 0;
    const visualTop = -(cardHeight / 2) + 84;
    let contentBottom = visualTop + 64;
    const rewardBadgeHeight = 32;
    const cardVisualOffsetY = rewardBadgeHeight + 15;

    if (option?.presentationType === "card") {
      const frameWrap = this.add.container(0, visualTop - 6 + cardVisualOffsetY);
      const hasCardFrame = this.textures.exists("reward_mini_card");
      const plateShadow = this.add.image(4, 8, hasCardFrame ? "reward_mini_card" : "__WHITE")
        .setAlpha(hasCardFrame ? 0.18 : 0.10)
        .setTint(0x04101a);
      const plate = this.add.image(0, 0, hasCardFrame ? "reward_mini_card" : "__WHITE")
        .setTint(accent)
        .setAlpha(hasCardFrame ? 0.98 : 0.18);
      if (hasCardFrame) {
        plateShadow.setDisplaySize(118, 140);
        plate.setDisplaySize(118, 140);
      } else {
        plateShadow.setDisplaySize(114, 138);
        plate.setDisplaySize(114, 138);
      }
      const iconPlate = this.add.circle(0, -32, 24, 0x0f2031, 0.92)
        .setStrokeStyle(2, 0xffffff, 0.18);
      const icon = this.add.image(0, -32, option?.cardImageKey || "__WHITE")
        .setDisplaySize(36, 36);
      const cardName = this.add.text(0, 18, String(option?.title || "Card"), {
        fontFamily: "Bungee",
        fontSize: "9px",
        color: "#fffaf0",
        stroke: "#08131d",
        strokeThickness: 3,
        align: "center",
        wordWrap: { width: 92 },
      }).setOrigin(0.5);
      frameWrap.add([plateShadow, plate, iconPlate, icon, cardName]);
      contentBottom = frameWrap.y + (plate.displayHeight / 2);
      nodes.push(frameWrap);

      hoverIn.push(() => {
        this.tweens.add({
          targets: frameWrap,
          scaleX: 1.04,
          scaleY: 1.04,
          duration: 140,
          ease: "Quad.Out",
        });
      });
      hoverOut.push(() => {
        this.tweens.add({
          targets: frameWrap,
          scaleX: 1,
          scaleY: 1,
          duration: 140,
          ease: "Quad.Out",
        });
      });
    } else if (option?.presentationType === "recruit") {
      const glow = this.add.circle(0, visualTop + 2, 54, accent, 0.14);
      const plate = this.add.circle(0, visualTop + 2, 44, 0x10263b, 0.96)
        .setStrokeStyle(2, accent, 0.36);
      const portrait = this.add.sprite(0, visualTop + 4, option?.portraitKey || "__WHITE").setOrigin(0.5);
      applyPortraitKeyToSprite(this, portrait, option?.portraitKey, 76);
      const recruitText = this.add.text(0, visualTop + 58, "Free Recruit", {
        fontFamily: "Bungee",
        fontSize: "9px",
        color: "#fff4d6",
        stroke: "#08131d",
        strokeThickness: 3,
        align: "center",
      }).setOrigin(0.5);
      nodes.push(glow, plate, portrait, recruitText);
      contentBottom = recruitText.y + (recruitText.height / 2);

      hoverIn.push(() => {
        this.tweens.add({
          targets: [glow, portrait],
          scaleX: 1.05,
          scaleY: 1.05,
          duration: 140,
          ease: "Quad.Out",
        });
      });
      hoverOut.push(() => {
        this.tweens.add({
          targets: [glow, portrait],
          scaleX: 1,
          scaleY: 1,
          duration: 140,
          ease: "Quad.Out",
        });
      });
    } else if (option?.presentationType === "chest") {
      const glow = this.add.circle(0, visualTop + 2, 56, accent, 0.14);
      const chest = this.add.sprite(0, visualTop - 4, "reward_treasure_chest", 0)
        .setScale(0.88);
      const contents = Array.isArray(option?.chestContents) ? option.chestContents.slice(0, 3) : [];
      const chipGap = 48;
      contents.forEach((entry, index) => {
        const chipX = (index - ((contents.length - 1) / 2)) * chipGap;
        const chipBg = this.add.circle(chipX, visualTop + 60, 15, 0x0d2334, 0.96)
          .setStrokeStyle(2, 0xffffff, 0.12);
        const icon = typeof entry?.emoji === "string" && entry.emoji.trim()
          ? this.add.text(chipX, visualTop + 60, entry.emoji, {
              fontFamily: "Arial",
              fontSize: "14px",
              color: "#ffffff",
              stroke: "#08131d",
              strokeThickness: 2,
              align: "center",
            }).setOrigin(0.5)
          : this.add.image(chipX, visualTop + 60, entry?.key || "__WHITE")
              .setDisplaySize(16, 16);
        const amount = this.add.text(chipX + 15, visualTop + 70, `x${Math.max(0, Number(entry?.amount || 0))}`, {
          fontFamily: "Bungee",
          fontSize: "8px",
          color: "#fff7e6",
          stroke: "#08131d",
          strokeThickness: 2,
        }).setOrigin(0, 0.5);
        contentBottom = Math.max(contentBottom, amount.y + (amount.height / 2));
        nodes.push(chipBg, icon, amount);
      });
      nodes.push(glow, chest);
      destroyers.push(() => this._stopRewardChestTimer(chest));

      hoverIn.push(() => {
        this._animateRewardChest(chest, 4);
        this.tweens.add({
          targets: [glow, chest],
          scaleX: 1.05,
          scaleY: 1.05,
          duration: 140,
          ease: "Quad.Out",
        });
      });
      hoverOut.push(() => {
        this._animateRewardChest(chest, 0);
        this.tweens.add({
          targets: [glow, chest],
          scaleX: 1,
          scaleY: 1,
          duration: 140,
          ease: "Quad.Out",
        });
      });
      onSelect = () => {
        this._animateRewardChest(chest, 4);
        this.tweens.add({
          targets: glow,
          alpha: 0.24,
          scaleX: 1.1,
          scaleY: 1.1,
          duration: 160,
          ease: "Quad.Out",
        });
      };
      selectDelayMs = 180;
    }

    return { nodes, hoverIn, hoverOut, onSelect, selectDelayMs, contentBottom };
  }

  _destroyTownXpRewardPresentation() {
    if (!this._townXpRewardPresentation) return;
    const { root, destroyers = [] } = this._townXpRewardPresentation;
    destroyers.forEach((fn) => {
      try {
        fn?.();
      } catch {}
    });
    root?.destroy?.(true);
    this._townXpRewardPresentation = null;
  }

  showTownXpRewardPresentation({ level = 1, xpSnapshot = null, options = [], onChoose, onCancel } = {}) {
    this._destroyTownXpRewardPresentation();

    const cam = this.cameras.main;
    const root = this.add.container(0, 0).setDepth((UIDEPTH ?? 2000) + 4200).setScrollFactor(0);
    const destroyers = [];
    let completed = false;

    const cleanup = () => {
      if (!this._townXpRewardPresentation) return;
      destroyers.forEach((fn) => {
        try {
          fn?.();
        } catch {}
      });
      this._townXpRewardPresentation = null;
      root.destroy(true);
    };

    const shade = this.add.rectangle(0, 0, cam.width, cam.height, 0x071726, 0.72)
      .setOrigin(0)
      .setInteractive({ useHandCursor: false })
      .setScrollFactor(0);
    const bloomA = this.add.circle(cam.width * 0.24, cam.height * 0.26, 210, 0x6dd3f5, 0.10).setScrollFactor(0);
    const bloomB = this.add.circle(cam.width * 0.78, cam.height * 0.66, 250, 0xfff0c9, 0.10).setScrollFactor(0);

    const panelWidth = Math.min(1000, cam.width - 110);
    const panelHeight = Math.min(620, cam.height - 90);
    const panel = this.add.container(cam.centerX, cam.centerY + 10).setAlpha(0).setScale(0.94).setScrollFactor(0);
    const panelBg = this.add.graphics();
    this._drawRoundedPanel(panelBg, panelWidth, panelHeight, {
      radius: 34,
      fillColor: 0x113048,
      fillAlpha: 0.97,
      strokeColor: 0xdff7ff,
      strokeAlpha: 0.20,
      shadowColor: 0x04101a,
      shadowAlpha: 0.34,
      shadowOffsetY: 16,
      topStripColor: 0xffffff,
      topStripAlpha: 0.08,
      topStripHeight: 18,
    });
    panel.add(panelBg);

    const badgeBg = this.add.graphics();
    this._drawRoundedPanel(badgeBg, 248, 42, {
      radius: 20,
      fillColor: 0xb7efff,
      fillAlpha: 0.98,
      strokeColor: 0xffffff,
      strokeAlpha: 0.18,
      shadowAlpha: 0.12,
      shadowOffsetY: 6,
    });
    badgeBg.setPosition(0, -(panelHeight / 2) + 50);
    const badgeText = this.add.text(0, badgeBg.y, "TOWN LEVEL REWARD", {
      fontFamily: "Bungee",
      fontSize: "16px",
      color: "#0c2b3f",
      stroke: "#f8feff",
      strokeThickness: 2,
    }).setOrigin(0.5);

    const title = this.add.text(0, -(panelHeight / 2) + 112, `Village Level ${Math.max(1, Number(level || 1))}!`, {
      fontFamily: "Bungee",
      fontSize: "34px",
      color: "#fff7e6",
      stroke: "#08131d",
      strokeThickness: 6,
      align: "center",
    }).setOrigin(0.5);
    const subtitle = this.add.text(0, title.y + 44, "Pick one bright little boost for the next stretch of this run.", {
      fontFamily: "Bungee",
      fontSize: "13px",
      color: "#d8f3ff",
      stroke: "#08131d",
      strokeThickness: 3,
      align: "center",
      wordWrap: { width: panelWidth - 160 },
    }).setOrigin(0.5);
    const progressLine = this.add.text(0, subtitle.y + 30, `Current XP: ${Math.max(0, Number(xpSnapshot?.xpIntoLevel || 0))}/${Math.max(1, Number(xpSnapshot?.xpForNextLevel || 1))}`, {
      fontFamily: "Bungee",
      fontSize: "11px",
      color: "#ffe8b8",
      stroke: "#08131d",
      strokeThickness: 3,
      align: "center",
    }).setOrigin(0.5);

    const chooseOption = (option, entry = null) => {
      if (completed) return;
      completed = true;
      optionCards.forEach((candidate) => candidate.hit.disableInteractive());
      entry?.onSelect?.();
      const finishChoice = () => {
        this.tweens.add({
          targets: panel,
          alpha: 0,
          scaleX: 0.96,
          scaleY: 0.96,
          duration: 180,
          ease: "Cubic.easeIn",
          onComplete: () => {
            try {
              onChoose?.(option);
            } finally {
              cleanup();
            }
          },
        });
      };
      const delayMs = Math.max(0, Number(entry?.selectDelayMs || 0));
      if (delayMs > 0) {
        this.time.delayedCall(delayMs, finishChoice);
      } else {
        finishChoice();
      }
    };

    const optionCards = [];
    const cardY = 70;
    const cardSpacing = Math.min(300, Math.floor((panelWidth - 150) / Math.max(1, options.length)));
    const startX = -((Math.max(0, options.length - 1)) * cardSpacing) / 2;
    const cardWidth = Math.min(250, Math.floor((panelWidth - 140) / Math.max(1, options.length)));
    const cardHeight = Math.min(348, panelHeight - 222);

    options.forEach((option, index) => {
      const x = startX + (index * cardSpacing);
      const accent = option?.accentColor ?? 0x8fe7ff;
      const card = this.add.container(x, cardY + 34).setAlpha(0).setScale(0.92);
      const shadow = this.add.graphics();
      const bg = this.add.graphics();
      const glow = this.add.graphics();
      const tagBg = this.add.graphics();
      const selectBg = this.add.graphics();
      const visual = this._buildTownXpRewardVisual(option, cardWidth, cardHeight, accent, destroyers);
      const selectY = (cardHeight / 2) - 34;

      const drawCard = (hovered = false) => {
        this._drawRoundedPanel(bg, cardWidth, cardHeight, {
          radius: 28,
          fillColor: option?.panelColor ?? 0x17334a,
          fillAlpha: hovered ? 0.99 : 0.96,
          strokeColor: accent,
          strokeAlpha: hovered ? 0.44 : 0.22,
          strokeWidth: hovered ? 3 : 2,
          shadowColor: 0x04101a,
          shadowAlpha: hovered ? 0.34 : 0.24,
          shadowOffsetY: hovered ? 14 : 10,
          topStripColor: accent,
          topStripAlpha: hovered ? 0.26 : 0.18,
          topStripHeight: 14,
        });

        glow.clear();
        glow.fillStyle(accent, hovered ? 0.12 : 0.07);
        const visualSlotTop = -(cardHeight / 2) + 52;
        const visualSlotHeight = option?.presentationType === "card" ? 126 : 84;
        const visualSlotRadius = option?.presentationType === "card" ? 24 : 20;
        glow.fillRoundedRect(
          -(cardWidth / 2) + 14,
          visualSlotTop,
          cardWidth - 28,
          visualSlotHeight,
          visualSlotRadius,
        );

        tagBg.clear();
        this._drawRoundedPanel(tagBg, 126, 32, {
          radius: 16,
          fillColor: accent,
          fillAlpha: 0.98,
          strokeColor: 0xffffff,
          strokeAlpha: 0.18,
          shadowAlpha: 0.10,
          shadowOffsetY: 5,
        });
        tagBg.setPosition(0, -(cardHeight / 2) + 34);

        selectBg.clear();
        this._drawRoundedPanel(selectBg, 130, 42, {
          radius: 18,
          fillColor: hovered ? 0xbff4ff : 0x93eaff,
          fillAlpha: 0.98,
          strokeColor: 0xffffff,
          strokeAlpha: hovered ? 0.28 : 0.18,
          shadowColor: accent,
          shadowAlpha: hovered ? 0.18 : 0.10,
          shadowOffsetY: 6,
        });
        selectBg.setPosition(0, selectY);
      };

      const tagText = this.add.text(0, -(cardHeight / 2) + 34, String(option?.badgeLabel || "REWARD"), {
        fontFamily: "Bungee",
        fontSize: "12px",
        color: "#0c2b3f",
        stroke: "#f8feff",
        strokeThickness: 2,
      }).setOrigin(0.5);
      const titleText = this.add.text(0, 0, String(option?.title || "Reward"), {
        fontFamily: "Bungee",
        fontSize: "16px",
        color: "#fff7e6",
        stroke: "#08131d",
        strokeThickness: 4,
        align: "center",
        wordWrap: { width: cardWidth - 34 },
      }).setOrigin(0.5);
      const subtitleText = this.add.text(0, 0, String(option?.subtitle || ""), {
        fontFamily: BODY_FONT_FAMILY,
        fontSize: "11px",
        color: "#d7efff",
        fontStyle: "600",
        align: "center",
        wordWrap: { width: cardWidth - 42 },
        lineSpacing: 2,
      }).setOrigin(0.5);
      const hintText = this.add.text(0, 0, String(option?.hint || ""), {
        fontFamily: BODY_FONT_FAMILY,
        fontSize: "10px",
        color: "#ffe9c7",
        fontStyle: "600",
        align: "center",
        wordWrap: { width: cardWidth - 44 },
        lineSpacing: 2,
      }).setOrigin(0.5);
      const selectText = this.add.text(0, selectY, "Choose", {
        fontFamily: "Bungee",
        fontSize: "15px",
        color: "#0c2b3f",
        stroke: "#f8feff",
        strokeThickness: 2,
      }).setOrigin(0.5);
      const layoutCardText = () => {
        const bodyTop = Math.max(12, Math.round(Number(visual?.contentBottom || 0) + 24));
        const bodyBottom = Math.round(selectY - 46);
        const textOffsetY = (option?.presentationType === "card" ? -15 : 0) - 10;
        let titleGap = 10;
        let bodyGap = String(option?.hint || "").trim() ? 8 : 0;
        let tuned = false;

        const placeTextBlock = () => {
          const titleHeight = Math.ceil(titleText.height);
          const subtitleHeight = Math.ceil(subtitleText.height);
          const hintVisible = Boolean(String(option?.hint || "").trim());
          const hintHeight = hintVisible ? Math.ceil(hintText.height) : 0;
          const totalHeight = titleHeight + subtitleHeight + hintHeight + titleGap + bodyGap;
          const availableHeight = Math.max(0, bodyBottom - bodyTop);

          if (totalHeight > availableHeight && !tuned) {
            tuned = true;
            titleGap = 8;
            bodyGap = hintVisible ? 6 : 0;
            subtitleText.setFontSize("10px");
            subtitleText.setLineSpacing(1);
            hintText.setFontSize("9px");
            hintText.setLineSpacing(1);
            return placeTextBlock();
          }

          const centeredStartY = bodyTop + Math.max(0, Math.floor((availableHeight - totalHeight) / 2)) + textOffsetY;
          const startY = Math.min(centeredStartY, bodyBottom - totalHeight);
          let cursorY = startY;

          titleText.setY(cursorY + (titleHeight / 2));
          cursorY += titleHeight + titleGap;

          subtitleText.setY(cursorY + (subtitleHeight / 2));
          cursorY += subtitleHeight;

          if (hintVisible) {
            cursorY += bodyGap;
            hintText.setY(cursorY + (hintHeight / 2));
            hintText.setVisible(true);
          } else {
            hintText.setVisible(false);
          }
        };

        placeTextBlock();
      };
      layoutCardText();

      const hit = this.add.rectangle(0, 0, cardWidth, cardHeight, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });

      drawCard(false);
      hit.on("pointerover", () => {
        drawCard(true);
        visual.hoverIn?.forEach((fn) => fn?.());
        this.tweens.add({
          targets: card,
          y: cardY + 22,
          duration: 140,
          ease: "Quad.Out",
        });
      });
      hit.on("pointerout", () => {
        drawCard(false);
        visual.hoverOut?.forEach((fn) => fn?.());
        this.tweens.add({
          targets: card,
          y: cardY + 34,
          duration: 140,
          ease: "Quad.Out",
        });
      });
      const optionEntry = {
        card,
        hit,
        onSelect: visual.onSelect,
        selectDelayMs: visual.selectDelayMs,
      };
      hit.on("pointerdown", () => chooseOption(option, optionEntry));

      card.add([
        shadow,
        bg,
        glow,
        tagBg,
        selectBg,
        ...(visual.nodes || []),
        tagText,
        titleText,
        subtitleText,
        hintText,
        selectText,
        hit,
      ]);
      panel.add(card);
      optionCards.push(optionEntry);

      this.tweens.add({
        targets: card,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        delay: 120 + (index * 90),
        duration: 220,
        ease: "Back.Out",
      });
    });

    panel.add([badgeBg, badgeText, title, subtitle, progressLine]);
    root.add([shade, bloomA, bloomB, panel]);

    this.tweens.add({
      targets: [bloomA, bloomB],
      alpha: { from: 0.06, to: 0.14 },
      scaleX: { from: 0.92, to: 1.1 },
      scaleY: { from: 0.92, to: 1.1 },
      duration: 1800,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
    this.tweens.add({
      targets: panel,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      y: cam.centerY,
      duration: 320,
      ease: "Back.Out",
    });

    destroyers.push(() => shade.removeAllListeners());
    optionCards.forEach((entry) => {
      destroyers.push(() => entry.hit.removeAllListeners());
    });

    this._townXpRewardPresentation = { root, destroyers };
    return {
      root,
      destroy: () => {
        if (completed) return;
        completed = true;
        try {
          onCancel?.();
        } finally {
          cleanup();
        }
      },
    };
  }

  _projectWorldToUiPoint(x, y) {
    const worldCam = this.worldScene?.cameras?.main;
    if (!worldCam || !Number.isFinite(x) || !Number.isFinite(y)) {
      return { x: this.scale.width * 0.5, y: this.scale.height * 0.42 };
    }

    return {
      x: (x - worldCam.worldView.x) * worldCam.zoom,
      y: (y - worldCam.worldView.y) * worldCam.zoom,
    };
  }

  playTownLossCollapseSequence({ towerWorldX, towerWorldY, onComplete } = {}) {
    const depth = (UIDEPTH ?? 2000) + 4300;
    const anchor = this._projectWorldToUiPoint(towerWorldX, towerWorldY);
    const root = this.add.container(0, 0).setDepth(depth).setScrollFactor(0);

    const pulse = this.add.circle(anchor.x, anchor.y, 34, 0xffddb6, 0.18);
    const halo = this.add.circle(anchor.x, anchor.y, 72, 0x8fe7ff, 0.10);
    const sparkle = this.add.star(anchor.x, anchor.y, 6, 18, 34, 0xfff4cf, 0.36);
    root.add([halo, pulse, sparkle]);

    this.tweens.add({
      targets: [pulse, halo],
      scaleX: { from: 0.6, to: 1.9 },
      scaleY: { from: 0.6, to: 1.9 },
      alpha: { from: 0.26, to: 0 },
      duration: 420,
      ease: "Cubic.easeOut",
    });

    this.tweens.add({
      targets: sparkle,
      angle: 100,
      alpha: { from: 0.34, to: 0 },
      scaleX: { from: 0.72, to: 1.5 },
      scaleY: { from: 0.72, to: 1.5 },
      duration: 460,
      ease: "Quad.easeOut",
    });

    const bubbleColors = [0xffc38b, 0x95e7ff, 0xfff2cf, 0xa7f3d0];
    for (let i = 0; i < 7; i++) {
      this.time.delayedCall(i * 75, () => {
        const bubble = this.add.circle(
          anchor.x + Phaser.Math.Between(-26, 26),
          anchor.y + Phaser.Math.Between(-22, 22),
          Phaser.Math.Between(10, 22),
          bubbleColors[i % bubbleColors.length],
          0.26
        );
        const dot = this.add.circle(bubble.x - 3, bubble.y - 4, Math.max(3, bubble.radius * 0.18), 0xffffff, 0.18);
        root.add([bubble, dot]);

        this.tweens.add({
          targets: [bubble, dot],
          y: bubble.y + Phaser.Math.Between(-34, -14),
          x: bubble.x + Phaser.Math.Between(-18, 18),
          scaleX: { from: 0.82, to: 1.18 },
          scaleY: { from: 0.82, to: 1.18 },
          alpha: { from: bubble.alpha, to: 0 },
          duration: 380,
          ease: "Cubic.easeOut",
          onComplete: () => {
            bubble.destroy();
            dot.destroy();
          },
        });
      });
    }

    this.cameras.main.shake(220, 0.0022);
    this.time.delayedCall(760, () => {
      root.destroy(true);
      onComplete?.();
    });

    return root;
  }

  _createTownLossStatCard(entry, x, y, width, height, delay = 0) {
    const accent = entry?.accentColor ?? 0x9ee7ff;
    const panelColor = entry?.panelColor ?? 0x143145;
    const valueColor = entry?.valueColor ?? "#fff7dc";
    const labelColor = entry?.labelColor ?? "#d7eef8";
    const hintColor = entry?.hintColor ?? "#9ec6d8";

    const root = this.add.container(x, y);
    const bg = this.add.graphics();
    this._drawRoundedPanel(bg, width, height, {
      radius: 24,
      fillColor: panelColor,
      fillAlpha: 0.96,
      strokeColor: accent,
      strokeAlpha: 0.42,
      topStripColor: accent,
      topStripAlpha: 0.95,
      topStripHeight: 24,
      shadowColor: 0x031018,
      shadowAlpha: 0.22,
      shadowOffsetY: 10,
    });

    const glow = this.add.circle(-width * 0.22, -height * 0.12, Math.max(20, Math.round(width * 0.18)), accent, 0.12);
    const shimmer = this.add.circle(width * 0.18, -height * 0.2, Math.max(12, Math.round(width * 0.08)), 0xffffff, 0.10);
    const textFlagHeight = Math.max(52, Math.round(height * 0.42));
    const textFlagY = (height / 2) - (textFlagHeight / 2) - 10;
    const textFlag = this.add.graphics();
    this._drawRoundedPanel(textFlag, width - 16, textFlagHeight, {
      radius: 18,
      fillColor: 0x0b1926,
      fillAlpha: 0.50,
      strokeColor: accent,
      strokeAlpha: 0.14,
      strokeWidth: 1,
      topStripColor: accent,
      topStripAlpha: 0.12,
      topStripHeight: 12,
      shadowAlpha: 0,
    });
    textFlag.setPosition(0, textFlagY);

    const value = this.add.text(0, -18, `${entry?.value ?? 0}`, {
      fontFamily: "Bungee",
      fontSize: width < 170 ? "24px" : "28px",
      color: valueColor,
      stroke: "#06121b",
      strokeThickness: 4,
      align: "center",
    }).setOrigin(0.5);
    const label = this.add.text(0, textFlagY - 4, entry?.label ?? "", {
      fontFamily: "Bungee",
      fontSize: width < 170 ? "10px" : "11px",
      color: labelColor,
      stroke: "#06121b",
      strokeThickness: 3,
      align: "center",
      wordWrap: { width: width - 34 },
      lineSpacing: 2,
    }).setOrigin(0.5, 1);
    const hint = this.add.text(0, textFlagY + 6, entry?.hint ?? "", {
      fontFamily: "Bungee",
      fontSize: width < 170 ? "9px" : "10px",
      color: hintColor,
      stroke: "#06121b",
      strokeThickness: 2,
      align: "center",
      wordWrap: { width: width - 34 },
      lineSpacing: 2,
    }).setOrigin(0.5, 0);

    root.add([bg, glow, shimmer, textFlag, value, label, hint]);
    root.setAlpha(0).setScale(0.9);

    this.tweens.add({
      targets: root,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      y: y - 10,
      delay,
      duration: 280,
      ease: "Back.Out",
    });

    this.tweens.add({
      targets: glow,
      alpha: { from: 0.06, to: 0.16 },
      scaleX: { from: 0.94, to: 1.08 },
      scaleY: { from: 0.94, to: 1.08 },
      duration: 1600,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    return root;
  }

  _destroyReliefPackageRecoveryPresentation() {
    const presentation = this._reliefPackageRecoveryPresentation;
    if (!presentation) return;
    this._reliefPackageRecoveryPresentation = null;
    presentation.destroyers?.forEach((fn) => {
      try { fn?.(); } catch {}
    });
    presentation.destroyers = [];
    presentation.root?.destroy?.(true);
  }

  showReliefPackageRecoveryPresentation({ onConfirm } = {}) {
    this._destroyReliefPackageRecoveryPresentation();

    const worldScene = this.worldScene;
    if (!worldScene) return null;

    const destroyers = [];
    const lockKeyboard = (scene) => {
      if (!scene?.input?.keyboard) return;
      const enabled = scene.input.keyboard.enabled;
      scene.input.keyboard.enabled = false;
      destroyers.push(() => {
        if (scene?.input?.keyboard) scene.input.keyboard.enabled = enabled;
      });
    };
    lockKeyboard(worldScene);
    lockKeyboard(this);

    const cam = this.cameras.main;
    const depth = (UIDEPTH ?? 2000) + 4350;
    const root = this.add.container(0, 0).setDepth(depth).setScrollFactor(0);
    const shade = this.add.rectangle(0, 0, cam.width, cam.height, 0x071726, 0.80)
      .setOrigin(0)
      .setInteractive({ useHandCursor: false });
    const bloomA = this.add.circle(cam.width * 0.26, cam.height * 0.28, 210, 0x8fe7ff, 0.10).setScrollFactor(0);
    const bloomB = this.add.circle(cam.width * 0.76, cam.height * 0.68, 240, 0xffe1bb, 0.10).setScrollFactor(0);

    const panelWidth = Math.min(920, cam.width - 80);
    const panelHeight = Math.min(620, cam.height - 80);
    const panel = this.add.container(cam.centerX, cam.centerY + 12).setAlpha(0).setScale(0.94).setScrollFactor(0);
    const panelBg = this.add.graphics();
    this._drawRoundedPanel(panelBg, panelWidth, panelHeight, {
      radius: 34,
      fillColor: 0x113048,
      fillAlpha: 0.98,
      strokeColor: 0xdff7ff,
      strokeAlpha: 0.22,
      shadowColor: 0x04101a,
      shadowAlpha: 0.34,
      shadowOffsetY: 16,
      topStripColor: 0xffffff,
      topStripAlpha: 0.10,
      topStripHeight: 18,
    });
    panel.add(panelBg);

    const badgeBg = this.add.graphics();
    this._drawRoundedPanel(badgeBg, 304, 42, {
      radius: 20,
      fillColor: 0xb7efff,
      fillAlpha: 0.98,
      strokeColor: 0xffffff,
      strokeAlpha: 0.18,
      shadowAlpha: 0.10,
      shadowOffsetY: 6,
    });
    badgeBg.setPosition(0, -(panelHeight / 2) + 50);
    const badgeText = this.add.text(0, badgeBg.y, "EMERGENCY RELIEF PACKAGE", {
      fontFamily: "Bungee",
      fontSize: "15px",
      color: "#0c2b3f",
      stroke: "#f8feff",
      strokeThickness: 2,
    }).setOrigin(0.5);

    const title = this.add.text(0, -(panelHeight / 2) + 112, "All Storages Lost", {
      fontFamily: "Bungee",
      fontSize: "32px",
      color: "#fff7e6",
      stroke: "#08131d",
      strokeThickness: 6,
      align: "center",
    }).setOrigin(0.5);
    const subtitle = this.add.text(0, title.y + 44, "The town is deploying its emergency relief package to keep the economy alive.", {
      fontFamily: "Bungee",
      fontSize: "13px",
      color: "#d8f3ff",
      stroke: "#08131d",
      strokeThickness: 3,
      align: "center",
      wordWrap: { width: panelWidth - 150 },
      lineSpacing: 4,
    }).setOrigin(0.5);

    const artX = -(panelWidth * 0.27);
    const artY = -12;
    const artGlow = this.add.circle(artX, artY - 14, 110, 0x8fe7ff, 0.12);
    const artPlate = this.add.circle(artX, artY - 14, 74, 0x0e2436, 0.98)
      .setStrokeStyle(3, 0xb7efff, 0.34);
    const art = this.textures.exists("relief_package")
      ? this.add.image(artX, artY - 14, "relief_package").setDisplaySize(108, 108)
      : this.add.text(artX, artY - 14, "RP", {
          fontFamily: "Bungee",
          fontSize: "34px",
          color: "#fff7e6",
          stroke: "#08131d",
          strokeThickness: 4,
        }).setOrigin(0.5);
    const artLabel = this.add.text(artX, artY + 88, "Package contents", {
      fontFamily: "Bungee",
      fontSize: "11px",
      color: "#ffe9c7",
      stroke: "#08131d",
      strokeThickness: 3,
      align: "center",
    }).setOrigin(0.5);

    const contents = [
      "1 Storage with 1 full seed stack",
      "6 Food, 6 clean water",
      "4 Wood, 4 stone",
      `1 Permit and +$${RELIEF_PACKAGE_MONEY_GRANT}`,
      "At least 1 Builder and 1 Forager",
    ];
    const contentsText = this.add.text(artX + 132, artY + 8, contents.map((line) => `- ${line}`).join("\n"), {
      fontFamily: "Bungee",
      fontSize: "11px",
      color: "#eef8ff",
      stroke: "#08131d",
      strokeThickness: 3,
      lineSpacing: 7,
      wordWrap: { width: 294 },
    }).setOrigin(0, 0.5);

    const rulesBg = this.add.graphics();
    this._drawRoundedPanel(rulesBg, panelWidth - 150, 120, {
      radius: 24,
      fillColor: 0x0d2334,
      fillAlpha: 0.86,
      strokeColor: 0x8fe7ff,
      strokeAlpha: 0.18,
      shadowAlpha: 0.10,
      shadowOffsetY: 6,
      topStripColor: 0xffffff,
      topStripAlpha: 0.06,
      topStripHeight: 12,
    });
    rulesBg.setPosition(0, 150);
    const rulesText = this.add.text(
      0,
      150,
      [
        "This recovery consumes your current relief package.",
        `You can buy a new one later at the market for $${RELIEF_PACKAGE_PRICE}.`,
        "Only 1 relief package can be held at a time.",
        `The package also includes a $${RELIEF_PACKAGE_MONEY_GRANT} emergency stipend.`,
      ].join("\n"),
      {
        fontFamily: "Bungee",
        fontSize: "11px",
        color: "#d8f3ff",
        stroke: "#08131d",
        strokeThickness: 3,
        align: "center",
        wordWrap: { width: panelWidth - 200 },
        lineSpacing: 6,
      }
    ).setOrigin(0.5);

    const buttonWidth = 238;
    const buttonHeight = 66;
    const buttonY = (panelHeight / 2) - 60;
    const buttonBg = this.add.graphics();
    const drawButton = (hovered = false) => {
      this._drawRoundedPanel(buttonBg, buttonWidth, buttonHeight, {
        radius: 22,
        fillColor: hovered ? 0xbff4ff : 0x93eaff,
        fillAlpha: 0.98,
        strokeColor: 0xffffff,
        strokeAlpha: hovered ? 0.28 : 0.18,
        shadowColor: 0x2e85a6,
        shadowAlpha: hovered ? 0.18 : 0.10,
        shadowOffsetY: 6,
      });
      buttonBg.setPosition(0, buttonY);
    };
    drawButton(false);
    buttonBg.setInteractive(
      new Phaser.Geom.Rectangle(-(buttonWidth / 2), -(buttonHeight / 2), buttonWidth, buttonHeight),
      Phaser.Geom.Rectangle.Contains
    );
    const buttonText = this.add.text(0, buttonY - 8, "Deploy Package", {
      fontFamily: "Bungee",
      fontSize: "17px",
      color: "#0c2b3f",
      stroke: "#f8feff",
      strokeThickness: 2,
    }).setOrigin(0.5);
    const buttonHint = this.add.text(0, buttonY + 14, "Recover town storage now", {
      fontFamily: "Bungee",
      fontSize: "10px",
      color: "#d8f6ff",
      stroke: "#09445e",
      strokeThickness: 2,
    }).setOrigin(0.5);

    const finish = () => {
      buttonBg.disableInteractive();
      this.tweens.add({
        targets: panel,
        alpha: 0,
        scaleX: 0.96,
        scaleY: 0.96,
        duration: 180,
        ease: "Cubic.easeIn",
        onComplete: () => {
          try {
            onConfirm?.();
          } finally {
            this._destroyReliefPackageRecoveryPresentation();
          }
        },
      });
    };

    buttonBg.on("pointerover", () => {
      drawButton(true);
      buttonBg.setScale(1.02);
    });
    buttonBg.on("pointerout", () => {
      drawButton(false);
      buttonBg.setScale(1);
    });
    buttonBg.on("pointerdown", finish);

    panel.add([
      badgeBg,
      badgeText,
      title,
      subtitle,
      artGlow,
      artPlate,
      art,
      artLabel,
      contentsText,
      rulesBg,
      rulesText,
      buttonBg,
      buttonText,
      buttonHint,
    ]);
    root.add([shade, bloomA, bloomB, panel]);

    this.tweens.add({
      targets: [bloomA, bloomB, artGlow],
      alpha: { from: 0.08, to: 0.16 },
      scaleX: { from: 0.94, to: 1.08 },
      scaleY: { from: 0.94, to: 1.08 },
      duration: 1800,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
    this.tweens.add({
      targets: panel,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      y: cam.centerY,
      duration: 320,
      ease: "Back.Out",
    });

    destroyers.push(() => buttonBg.removeAllListeners());
    this._reliefPackageRecoveryPresentation = { root, destroyers };
    return root;
  }

  _destroyTownLossPresentation() {
    const presentation = this._townLossPresentation;
    if (!presentation) return;
    this._townLossPresentation = null;
    presentation.destroyers?.forEach((fn) => {
      try { fn?.(); } catch {}
    });
    presentation.destroyers = [];
    presentation.root?.destroy?.(true);
  }

  showTownLossPresentation(summaryData = {}) {
    if (this._townLossPresentation?.root?.active) return this._townLossPresentation.root;
    const worldScene = this.worldScene;
    if (!worldScene) return null;

    const destroyers = [];
    const lockKeyboard = (scene) => {
      if (!scene?.input?.keyboard) return;
      const enabled = scene.input.keyboard.enabled;
      scene.input.keyboard.enabled = false;
      destroyers.push(() => {
        if (scene?.input?.keyboard) scene.input.keyboard.enabled = enabled;
      });
    };
    lockKeyboard(worldScene);
    lockKeyboard(this);

    const cam = this.cameras.main;
    const depth = (UIDEPTH ?? 2000) + 4400;
    const root = this.add.container(0, 0).setDepth(depth).setScrollFactor(0);
    const shade = this.add.rectangle(0, 0, cam.width, cam.height, 0x07131f, 0.78)
      .setOrigin(0)
      .setInteractive({ useHandCursor: false });

    const centerX = cam.centerX;
    const centerY = cam.centerY;
    const panelWidth = Math.min(1120, cam.width - 42);
    const panelHeight = Math.min(760, cam.height - 44);
    const panel = this.add.container(centerX, centerY + 8).setAlpha(0).setScale(0.94);

    const outerGlow = this.add.circle(centerX - (panelWidth * 0.24), centerY - (panelHeight * 0.12), 220, 0x7dd3fc, 0.08);
    const warmGlow = this.add.circle(centerX + (panelWidth * 0.18), centerY + (panelHeight * 0.08), 190, 0xffbf86, 0.08);
    const centerHalo = this.add.circle(centerX, centerY + 18, 280, 0xdbeafe, 0.05);

    root.add([shade, outerGlow, warmGlow, centerHalo, panel]);

    for (let i = 0; i < 8; i++) {
      const bubble = this.add.circle(
        centerX + Phaser.Math.Between(-Math.round(panelWidth * 0.42), Math.round(panelWidth * 0.42)),
        centerY + Phaser.Math.Between(-Math.round(panelHeight * 0.38), Math.round(panelHeight * 0.38)),
        Phaser.Math.Between(18, 42),
        i % 2 === 0 ? 0x8fe7ff : 0xffddb1,
        0.08
      );
      bubble.setScale(0.92 + (i % 3) * 0.08);
      root.add(bubble);
      this.tweens.add({
        targets: bubble,
        y: bubble.y + Phaser.Math.Between(-26, 26),
        x: bubble.x + Phaser.Math.Between(-20, 20),
        duration: 1800 + (i * 110),
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      });
    }

    const panelBg = this.add.graphics();
    this._drawRoundedPanel(panelBg, panelWidth, panelHeight, {
      radius: 36,
      fillColor: 0x10263b,
      fillAlpha: 0.985,
      strokeColor: 0xb4ecff,
      strokeAlpha: 0.42,
      strokeWidth: 3,
      topStripColor: 0x7dd3fc,
      topStripAlpha: 0.95,
      topStripHeight: 34,
      shadowColor: 0x031018,
      shadowAlpha: 0.3,
      shadowOffsetY: 16,
    });

    const badgeBg = this.add.graphics();
    this._drawRoundedPanel(badgeBg, 248, 42, {
      radius: 20,
      fillColor: 0xffddb1,
      fillAlpha: 0.96,
      strokeColor: 0xffffff,
      strokeAlpha: 0.14,
      shadowAlpha: 0,
    });
    badgeBg.setPosition(0, -(panelHeight / 2) + 54);

    const badgeText = this.add.text(0, badgeBg.y, summaryData?.badgeLabel || "RUN RECAP", {
      fontFamily: "Bungee",
      fontSize: "14px",
      color: "#5b3410",
      stroke: "#fff8e7",
      strokeThickness: 2,
    }).setOrigin(0.5);

    const title = this.add.text(0, -(panelHeight / 2) + 112, summaryData?.title || "Town Tumbled!", {
      fontFamily: "Bungee",
      fontSize: panelWidth < 760 ? "28px" : "34px",
      color: "#fff8ed",
      stroke: "#08131d",
      strokeThickness: 6,
      align: "center",
      wordWrap: { width: panelWidth - 120 },
    }).setOrigin(0.5);

    const subtitle = this.add.text(0, -(panelHeight / 2) + 158, summaryData?.subtitle || "The run is over, but the town still made some noise.", {
      fontFamily: "Bungee",
      fontSize: "13px",
      color: "#d8edf6",
      stroke: "#08131d",
      strokeThickness: 4,
      align: "center",
      wordWrap: { width: panelWidth - 170 },
      lineSpacing: 6,
    }).setOrigin(0.5);

    panel.add([panelBg, badgeBg, badgeText, title, subtitle]);

    const primaryStats = Array.isArray(summaryData?.primaryStats) ? summaryData.primaryStats : [];
    const cols = cam.width >= 1260 ? Math.min(5, Math.max(1, primaryStats.length)) : (cam.width >= 860 ? Math.min(3, Math.max(1, primaryStats.length)) : (cam.width >= 620 ? Math.min(2, Math.max(1, primaryStats.length)) : 1));
    const gapX = cols >= 5 ? 12 : 18;
    const gapY = 16;
    const cardWidth = Math.min(cols >= 5 ? 176 : 224, Math.floor((panelWidth - 120 - (gapX * Math.max(0, cols - 1))) / Math.max(1, cols)));
    const cardHeight = cam.width < 760 ? 124 : 132;
    const gridTop = -(panelHeight / 2) + 270;
    const rows = Math.ceil(primaryStats.length / Math.max(1, cols));
    const gridBottom = gridTop + (rows * cardHeight) + (Math.max(0, rows - 1) * gapY);

    primaryStats.forEach((entry, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const itemsInRow = Math.min(cols, primaryStats.length - (row * cols));
      const rowWidth = (itemsInRow * cardWidth) + ((itemsInRow - 1) * gapX);
      const x = -(rowWidth / 2) + (cardWidth / 2) + (col * (cardWidth + gapX));
      const y = gridTop + (row * (cardHeight + gapY));
      const card = this._createTownLossStatCard(entry, x, y, cardWidth, cardHeight, 140 + (index * 90));
      panel.add(card);
    });

    const unlockLabels = Array.isArray(summaryData?.troopUnlockLabels) ? summaryData.troopUnlockLabels : [];
    const unlockHeaderY = gridBottom + 42;
    const unlockHeaderText = unlockLabels.length
      ? (summaryData?.unlockHeaderLabel || "Run-Earned Troops")
      : (summaryData?.emptyUnlockHeaderLabel || "Run-Earned Troops: None This Run");
    const unlockHeader = this.add.text(0, unlockHeaderY, unlockHeaderText, {
      fontFamily: "Bungee",
      fontSize: "13px",
      color: unlockLabels.length ? "#ffe9c7" : "#d7e6ef",
      stroke: "#08131d",
      strokeThickness: 3,
      align: "center",
    }).setOrigin(0.5);
    panel.add(unlockHeader);

    const unlockChipY = unlockHeaderY + 40;

    if (unlockLabels.length) {
      const chipGap = 14;
      const chips = unlockLabels.map((label, index) => {
        const text = this.add.text(0, 0, label, {
          fontFamily: "Bungee",
          fontSize: "12px",
          color: "#0d2334",
          stroke: "#f8feff",
          strokeThickness: 1,
        }).setOrigin(0.5);
        const width = Math.ceil(text.width) + 34;
        const height = 36;
        const bg = this.add.graphics();
        this._drawRoundedPanel(bg, width, height, {
          radius: 18,
          fillColor: index % 2 === 0 ? 0xb6efff : 0xffe1bb,
          fillAlpha: 0.98,
          strokeColor: 0xffffff,
          strokeAlpha: 0.24,
            shadowAlpha: 0.12,
            shadowOffsetY: 6,
        });
        const chip = this.add.container(0, unlockChipY, [bg, text]).setAlpha(0).setScale(0.9);
        return { chip, width };
      });

      const totalWidth = chips.reduce((sum, chip) => sum + chip.width, 0) + (chipGap * Math.max(0, chips.length - 1));
      let cursorX = -(totalWidth / 2);
      chips.forEach(({ chip, width }, index) => {
        cursorX += width / 2;
        chip.x = cursorX;
        panel.add(chip);
        this.tweens.add({
          targets: chip,
          alpha: 1,
          scaleX: 1,
          scaleY: 1,
          delay: 260 + (index * 90),
          duration: 220,
          ease: "Back.Out",
        });
        this.tweens.add({
          targets: chip,
          y: chip.y - 8,
          duration: 1500 + (index * 90),
          ease: "Sine.easeInOut",
          yoyo: true,
          repeat: -1,
        });
        cursorX += (width / 2) + chipGap;
      });
    }

    const unlockContentBottomY = unlockLabels.length ? unlockChipY + 26 : unlockHeaderY + 6;
    const buttonWidth = Math.min(260, panelWidth - 180);
    const buttonHeight = 72;
    const buttonY = (panelHeight / 2) - 60;
    const secondaryY = Math.min(
      buttonY - 78,
      Math.max(unlockContentBottomY + 26, (panelHeight / 2) - 122)
    );
    const secondaryLine = (summaryData?.secondaryStats || [])
      .map((entry) => `${entry.label}: ${entry.value}`)
      .join("   •   ");
    const secondary = this.add.text(0, secondaryY, secondaryLine, {
      fontFamily: "Bungee",
      fontSize: "11px",
      color: "#9fc1d2",
      stroke: "#08131d",
      strokeThickness: 3,
      align: "center",
      wordWrap: { width: panelWidth - 140 },
      lineSpacing: 6,
    }).setOrigin(0.5);

    const buttonBg = this.add.graphics();
    const drawButton = (hovered = false) => {
      this._drawRoundedPanel(buttonBg, buttonWidth, buttonHeight, {
        radius: 24,
        fillColor: hovered ? 0x96efff : 0x6dd3f5,
        fillAlpha: 0.98,
        strokeColor: hovered ? 0xffffff : 0xdff9ff,
        strokeAlpha: hovered ? 0.36 : 0.22,
        shadowColor: 0x053245,
        shadowAlpha: 0.26,
        shadowOffsetY: 8,
      });
    };
    drawButton(false);
    buttonBg.setPosition(0, buttonY);
    buttonBg.setInteractive(new Phaser.Geom.Rectangle(-(buttonWidth / 2), -(buttonHeight / 2), buttonWidth, buttonHeight), Phaser.Geom.Rectangle.Contains);

    const buttonText = this.add.text(0, buttonBg.y - 10, summaryData?.restartLabel || "Restart Run", {
      fontFamily: "Bungee",
      fontSize: "18px",
      color: "#0b2a3e",
      stroke: "#f8feff",
      strokeThickness: 2,
    }).setOrigin(0.5);
    const buttonHint = this.add.text(0, buttonBg.y + 14, summaryData?.restartHint || "Fade back to the clouds", {
      fontFamily: "Bungee",
      fontSize: "10px",
      color: "#d8f6ff",
      stroke: "#09445e",
      strokeThickness: 2,
    }).setOrigin(0.5);

    buttonBg.on("pointerover", () => {
      drawButton(true);
      buttonBg.setScale(1.02);
    });
    buttonBg.on("pointerout", () => {
      drawButton(false);
      buttonBg.setScale(1);
    });
    buttonBg.on("pointerdown", () => {
      buttonBg.disableInteractive();
      this.worldScene?.restartToMainMenu?.({ hostScene: this });
    });

    panel.add([secondary, buttonBg, buttonText, buttonHint]);

    this.tweens.add({
      targets: panel,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 320,
      ease: "Back.Out",
    });
    this.tweens.add({
      targets: title,
      y: title.y - 8,
      duration: 1800,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    this._townLossPresentation = { root, destroyers };
    return root;
  }

  onMoneyChanged(amountDelta, opts = {}) {
    if (!this.moneyText || !this.worldScene) return;
    const isGain = amountDelta > 0;
    const color = isGain ? "#facc15" : "#ff3333";
    const sign = isGain ? "+" : "-";
    this._mutateText(this.moneyText, (node) => {
      node.setText(`$${this.worldScene.money}`);
      node.setFill(color);
    });
    this._ghostAt(this.moneyText, `${sign}$${Math.abs(amountDelta)}`, color);
    if (isGain) {
      this._playMoneySourceParticles(amountDelta, opts);
      this._pulseMoneyHud(color);
      const impactDelay = this._getHudGainImpactDelay(amountDelta, {
        base: 500,
        stepAmount: 25,
        stepDelay: 18,
        min: 440,
        max: 720,
      });
      this.time?.delayedCall?.(impactDelay, () => {
        if (this._sceneShuttingDown) return;
        AudioManager.playCoinsGain(amountDelta);
      });
      return;
    }
    this.moneyIcon?.clearTint?.();
    this.time.delayedCall(600, () => this._mutateText(this.moneyText, (node) => node.setFill("#ffffff")));
  }

  onSeedsChanged(amountDelta) {
    if (!this.seedsText || !this.worldScene) return;
    const color = amountDelta > 0 ? "#00ff00" : "#ff3333";
    this._mutateText(this.seedsText, (node) => {
      node.setText(`${this.worldScene.seeds}`);
      node.setFill(color);
    });
    this._ghostAt(this.seedsText, amountDelta > 0 ? `+${amountDelta}` : `${amountDelta}`, color);
    this.time.delayedCall(600, () => this._mutateText(this.seedsText, (node) => node.setFill("#ffffff")));
  }

  onBerryChanged(amountDelta) {
    if (!this.berryText || !this.worldScene) return;
    const color = amountDelta > 0 ? "#00ff00" : "#ff3333";
    this._mutateText(this.berryText, (node) => {
      node.setText(`${this.worldScene.berries}`);
      node.setFill(color);
    });
    this._ghostAt(this.berryText, amountDelta > 0 ? `+${amountDelta}` : `${amountDelta}`, color);
    this.time.delayedCall(600, () => this._mutateText(this.berryText, (node) => node.setFill("#ffffff")));
  }

  onPermitsChanged(amountDelta) {
    if (!this.permitText || !this.worldScene) return;
    const color = amountDelta > 0 ? "#d8b4fe" : "#fca5a5";
    const sign = amountDelta > 0 ? "+" : "-";
    this._mutateText(this.permitText, (node) => {
      node.setText(`${this.worldScene.permits ?? 0}`);
      node.setFill(color);
    });
    this._ghostAt(this.permitText, `${sign}${Math.abs(amountDelta)}📜`, color);
    this.time.delayedCall(600, () => this._mutateText(this.permitText, (node) => node.setFill("#ffffff")));
  }

  _destroyAdrenalineHud() {
    this._adrenalineHud?.destroy?.(true);
    this._adrenalineHud = null;
    this._adrenalineUntil = 0;
    this._adrenalineHudText = null;
    this._adrenalineHudLastSeconds = null;
  }

  _setTimedMarketBuffHud(payload = {}) {
    const key = String(payload?.key || "");
    const until = Math.max(0, Number(payload?.until || 0));
    if (key === "meleeCrit") {
      this._meleeCritUntil = until;
    } else if (key === "projectileCrit") {
      this._projectileCritUntil = until;
    } else {
      return;
    }
    this._refreshProductionStatusHud();
  }

  _setAdrenalineHud(payload = {}) {
    const until = Number(payload?.until || 0);
    if (!(until > 0)) {
      this._destroyAdrenalineHud();
      this._refreshProductionStatusHud();
      return;
    }
    this._adrenalineUntil = Math.max(this._adrenalineUntil || 0, until);
    this._adrenalineHud?.destroy?.(true);
    this._adrenalineHud = null;
    this._adrenalineHudText = null;
    this._refreshAdrenalineHud(true);
  }

  _buildAdrenalineHud() {
    this._adrenalineHud?.destroy?.(true);
    this._adrenalineHud = null;
    this._adrenalineHudText = null;
    this._adrenalineHudLastSeconds = null;
  }

  _refreshAdrenalineHud(force = false) {
    if (!this._adrenalineUntil) return;
    const remaining = this._getAdrenalineRemainingMs();
    if (remaining <= 0) {
      this._destroyAdrenalineHud();
      this._refreshProductionStatusHud();
      return;
    }
    const seconds = Math.ceil(remaining / 1000);
    if (force || this._adrenalineHudLastSeconds !== seconds) {
      this._adrenalineHudLastSeconds = seconds;
      this._refreshProductionStatusHud();
    }
  }

  _destroyBossHud() {
    this.bossHud?.destroy?.(true);
    this.bossHud = null;
    this._bossTarget = null;
  }

  setBossTarget(target = null) {
    const nextTarget = target?.active ? target : null;
    const changed = this._bossTarget !== nextTarget;
    this._bossTarget = nextTarget;
    if (!this._bossTarget) {
      this._destroyBossHud();
      return;
    }
    if (!this.bossHud) this._buildBossHud();
    this._refreshBossHud(changed);
  }

  _buildBossHud() {
    if (this.bossHud) return;
    const root = this.add.container(0, 0).setDepth(UIDEPTH + 44).setVisible(false);
    const shadow = this.add.graphics();
    const bg = this.add.graphics();
    const fillBg = this.add.graphics();
    const fill = this.add.graphics();
    const shine = this.add.graphics();
    const portraitPlate = this.add.graphics();
    const portrait = this.add.sprite(0, 0, "");
    const title = this.add.text(0, 0, "", {
      fontFamily: "Bungee",
      fontSize: "18px",
      color: "#f5fbff",
      stroke: "#07111b",
      strokeThickness: 4,
    }).setOrigin(0, 0.5);
    const value = this.add.text(0, 0, "", {
      fontFamily: "Bungee",
      fontSize: "11px",
      color: "#d8f6ff",
      stroke: "#07111b",
      strokeThickness: 3,
    }).setOrigin(1, 0.5);

    root.add([shadow, bg, fillBg, fill, shine, portraitPlate, portrait, title, value]);
    root.shadow = shadow;
    root.bg = bg;
    root.fillBg = fillBg;
    root.fill = fill;
    root.shine = shine;
    root.portraitPlate = portraitPlate;
    root.portrait = portrait;
    root.title = title;
    root.value = value;
    this.bossHud = root;
  }

  _getBottomBarTopForHud() {
    const bounds = this.uiBottomBar?.ui?.getBounds?.();
    const top = Number(bounds?.top);
    if (Number.isFinite(top) && top > 0 && top < this.scale.height) {
      return top;
    }
    return null;
  }

  _refreshBossHud(force = false) {
    const boss = this._bossTarget;
    if (!boss?.active) {
      this._destroyBossHud();
      return;
    }
    if (!this.bossHud) this._buildBossHud();
    const root = this.bossHud;
    const bottomBarProgress = Phaser.Math.Clamp(
      Number(this.uiBottomBar?.openProgress ?? (this.uiBottomBar?.expanded ? 1 : 0)),
      0,
      1
    );
    const bottomReserve = Phaser.Math.Linear(74, 190, bottomBarProgress);
    const width = Math.max(360, Math.min(this.scale.width - 54, 760));
    const height = 54;
    const x = Math.round(this.scale.width / 2);
    const bottomBarTop = this._getBottomBarTopForHud();
    let y = Math.round(this.scale.height - bottomReserve - 46);
    if (Number.isFinite(bottomBarTop)) {
      y = Math.min(y, Math.round(bottomBarTop - 14 - height / 2));
    }
    y = Math.max(82, y);
    const portraitSize = 62;
    const barLeft = -width / 2 + 90;
    const barWidth = width - 122;
    const ratio = Phaser.Math.Clamp(Number(boss.health || 0) / Math.max(1, Number(boss.maxHealth || 1)), 0, 1);
    const portraitKey = getPlayerPortraitKey(boss);
    const signature = `${boss.id}|${boss.health}|${boss.maxHealth}|${width}|${y}|${bottomBarProgress}|${bottomBarTop ?? "fallback"}|${portraitKey}`;
    if (!force && signature === root._signature) return;
    root._signature = signature;
    root.setVisible(true);
    root.setPosition(x, y);

    root.shadow.clear();
    root.shadow.fillStyle(0x02060d, 0.36);
    root.shadow.fillRoundedRect(-width / 2 + 3, -height / 2 + 5, width, height, 18);

    root.bg.clear();
    root.bg.fillStyle(0x111f31, 0.96);
    root.bg.lineStyle(2, 0x9dd7ff, 0.26);
    root.bg.fillRoundedRect(-width / 2, -height / 2, width, height, 18);
    root.bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 18);

    root.fillBg.clear();
    root.fillBg.fillStyle(0x06111d, 0.94);
    root.fillBg.fillRoundedRect(barLeft, -12, barWidth, 20, 10);

    root.fill.clear();
    root.fill.fillStyle(0x5f2dd8, 0.96);
    root.fill.fillRoundedRect(barLeft, -12, Math.max(8, Math.round(barWidth * ratio)), 20, 10);

    root.shine.clear();
    root.shine.fillStyle(0xffffff, 0.08);
    root.shine.fillRoundedRect(barLeft + 6, -10, Math.max(20, Math.round(barWidth * ratio) - 12), 7, 6);

    root.portraitPlate.clear();
    root.portraitPlate.fillStyle(0x0d1727, 0.98);
    root.portraitPlate.lineStyle(2, 0xb8ecff, 0.3);
    root.portraitPlate.fillRoundedRect(-width / 2 + 12, -portraitSize / 2, 66, portraitSize, 16);
    root.portraitPlate.strokeRoundedRect(-width / 2 + 12, -portraitSize / 2, 66, portraitSize, 16);

    root.portrait.setPosition(-width / 2 + 45, 0);
    applyPortraitKeyToSprite(this, root.portrait, portraitKey, 44);

    root.title.setText((boss.name || "BOSS").toUpperCase()).setPosition(barLeft, -20);
    root.value.setText(`${Math.max(0, Math.ceil(Number(boss.health || 0)))} / ${Math.max(1, Math.ceil(Number(boss.maxHealth || 1)))}`).setPosition(barLeft + barWidth, -20);
  }

  _destroyBossIntroPresentation() {
    const presentation = this._bossIntroPresentation;
    if (!presentation) return;
    presentation.destroyers?.forEach((fn) => {
      try { fn?.(); } catch {}
    });
    presentation.destroyers = [];
    presentation.root?.destroy?.(true);
    this._bossIntroPresentation = null;
  }

  showBossIncomingPresentation({ title = "BOSS", subtitle = "", caption = "", portraitKey = null } = {}) {
    this._destroyBossIntroPresentation();
    const depth = (UIDEPTH ?? 2000) + 5000;
    const root = this.add.container(this.scale.width / 2, this.scale.height / 2).setDepth(depth);
    const destroyers = [];
    const veil = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x030712, 0.84).setOrigin(0.5);
    const glow = this.add.circle(0, -8, 160, 0x60a5fa, 0.12);
    const plate = this.add.rectangle(0, 0, Math.min(720, this.scale.width - 42), 234, 0x101827, 0.96)
      .setStrokeStyle(2, 0xbbe9ff, 0.3);
    const shine = this.add.rectangle(0, -78, Math.min(620, this.scale.width - 92), 22, 0xffffff, 0.07);
    const portraitBack = this.add.rectangle(0, -8, 102, 102, 0x0d1727, 0.98)
      .setStrokeStyle(2, 0xdff6ff, 0.26);
    const portrait = this.add.sprite(0, -8, "");
    applyPortraitKeyToSprite(this, portrait, portraitKey, 74);
    const overline = this.add.text(0, -104, "BOSS NIGHT", {
      fontFamily: "Bungee",
      fontSize: "18px",
      color: "#d8f6ff",
      stroke: "#050b14",
      strokeThickness: 4,
    }).setOrigin(0.5);
    const titleText = this.add.text(0, 62, title, {
      fontFamily: "Bungee",
      fontSize: "34px",
      color: "#f8fbff",
      stroke: "#050b14",
      strokeThickness: 6,
      align: "center",
    }).setOrigin(0.5);
    const subtitleText = this.add.text(0, 98, subtitle, {
      fontFamily: "Bungee",
      fontSize: "16px",
      color: "#b8ecff",
      stroke: "#050b14",
      strokeThickness: 4,
      align: "center",
    }).setOrigin(0.5);
    const captionText = this.add.text(0, 126, caption, {
      fontFamily: "Bungee",
      fontSize: "11px",
      color: "#f8e4a5",
      stroke: "#050b14",
      strokeThickness: 3,
      align: "center",
    }).setOrigin(0.5);

    root.add([veil, glow, plate, shine, portraitBack, portrait, overline, titleText, subtitleText, captionText]);
    root.setAlpha(0);
    root.setScale(0.94);

    this.tweens.add({
      targets: root,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 220,
      ease: "Back.Out",
    });
    this.flashStormLightning(170, 0.5);
    const dismiss = this.time.delayedCall(2450, () => {
      this.tweens.add({
        targets: root,
        alpha: 0,
        duration: 220,
        ease: "Quad.easeOut",
        onComplete: () => this._destroyBossIntroPresentation(),
      });
    });
    destroyers.push(() => dismiss.remove(false));
    this._bossIntroPresentation = { root, destroyers };
    return root;
  }

  _destroyBossStorm() {
    AudioManager.stopBossRainAmbience();
    const storm = this._bossStorm;
    storm?.thunderGraphics?.forEach?.((graphic) => {
      this.tweens.killTweensOf(graphic);
      graphic?.destroy?.();
    });
    storm?.thunderGraphics?.clear?.();
    storm?.rainGraphics?.destroy?.();
    storm?.flashRect?.destroy?.();
    this._bossStorm = null;
  }

  setBossStormActive(active = false) {
    if (!active) {
      this._destroyBossStorm();
      return;
    }
    if (!this._bossStorm) {
      const flashDepth = (UIDEPTH ?? 10) + 6000;
      const rainGraphics = this.add.graphics().setDepth(UIDEPTH + 38);
      rainGraphics.setScrollFactor?.(0);
      const flashRect = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0xe5f6ff, 0)
        .setDepth(flashDepth)
        .setScrollFactor(0);
      const drops = Array.from({ length: 120 }, () => ({
        x: Math.random() * this.scale.width,
        y: Math.random() * this.scale.height,
        len: 10 + Math.random() * 16,
        speed: 260 + Math.random() * 260,
        drift: -24 - Math.random() * 30,
        alpha: 0.18 + Math.random() * 0.26,
      }));
      this._bossStorm = {
        rainGraphics,
        flashRect,
        drops,
        flashDepth,
        lastAt: this.time.now,
        nextThunderAt: this.time.now + Phaser.Math.Between(1500, 4000),
        thunderGraphics: new Set(),
      };
      this.children.bringToTop?.(flashRect);
    } else if (!Number.isFinite(Number(this._bossStorm.nextThunderAt))) {
      this._bossStorm.nextThunderAt = this.time.now + Phaser.Math.Between(1500, 4000);
    }
    AudioManager.startBossRainAmbience({ volume: 0.3 });
  }

  flashStormLightning(duration = 180, alpha = 0.62) {
    if (!this._bossStorm) this.setBossStormActive(true);
    const flashRect = this._bossStorm?.flashRect;
    if (!flashRect) return;
    const flashAlpha = Math.max(0.55, Number(alpha) || 0);
    const flashDuration = Math.max(180, Number(duration) || 0);
    this.tweens.killTweensOf(flashRect);
    flashRect
      .setScrollFactor(0)
      .setDepth(this._bossStorm.flashDepth ?? ((UIDEPTH ?? 10) + 6000))
      .setPosition(this.scale.width / 2, this.scale.height / 2)
      .setSize(this.scale.width, this.scale.height)
      .setAlpha(flashAlpha)
      .setVisible(true);
    this.children.bringToTop?.(flashRect);
    this.tweens.add({
      targets: flashRect,
      alpha: 0,
      duration: flashDuration,
      ease: "Quad.easeOut",
    });
  }

  _triggerBossStormThunder() {
    const storm = this._bossStorm;
    if (!storm?.rainGraphics) return;
    AudioManager.playBossThunder({
      volume: 0.32 + Math.random() * 0.08,
      rate: 0.92 + Math.random() * 0.12,
    });
    this.flashStormLightning(220, 0.62 + Math.random() * 0.16);
    this._drawBossStormThunderBolt(storm);
  }

  _drawBossStormThunderBolt(storm = this._bossStorm) {
    if (!storm) return null;
    const width = Math.max(1, this.scale.width);
    const height = Math.max(1, this.scale.height);
    const graphic = this.add.graphics()
      .setDepth(storm.flashDepth ?? ((UIDEPTH ?? 10) + 6001))
      .setAlpha(0.95);
    graphic.setScrollFactor?.(0);
    this.children.bringToTop?.(graphic);

    const startX = Phaser.Math.Between(Math.round(width * 0.12), Math.round(width * 0.88));
    const endX = Phaser.Math.Clamp(startX + Phaser.Math.Between(-190, 190), 36, width - 36);
    const endY = Phaser.Math.Between(Math.round(height * 0.34), Math.round(height * 0.72));
    const pointCount = Phaser.Math.Between(7, 11);
    const points = [];

    for (let i = 0; i <= pointCount; i++) {
      const t = i / pointCount;
      const taper = 1 - (t * 0.42);
      const x = Phaser.Math.Clamp(
        Phaser.Math.Linear(startX, endX, t) + Phaser.Math.Between(-42, 42) * taper,
        18,
        width - 18
      );
      const y = Phaser.Math.Linear(-18, endY, t);
      points.push({ x, y });
    }

    const drawPath = (path, lineWidth, color, alpha) => {
      if (!path.length) return;
      graphic.lineStyle(lineWidth, color, alpha);
      graphic.beginPath();
      graphic.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        graphic.lineTo(path[i].x, path[i].y);
      }
      graphic.strokePath();
    };

    drawPath(points, 7, 0x7dd3fc, 0.25);
    drawPath(points, 4, 0xdff6ff, 0.8);
    drawPath(points, 1.5, 0xffffff, 1);

    const branchCount = Phaser.Math.Between(2, 4);
    for (let i = 0; i < branchCount; i++) {
      const anchor = points[Phaser.Math.Between(2, Math.max(2, points.length - 3))];
      if (!anchor) continue;
      const direction = Math.random() < 0.5 ? -1 : 1;
      const branchLength = Phaser.Math.Between(42, 118);
      const branch = [
        anchor,
        {
          x: Phaser.Math.Clamp(anchor.x + direction * branchLength * 0.45, 12, width - 12),
          y: anchor.y + Phaser.Math.Between(18, 46),
        },
        {
          x: Phaser.Math.Clamp(anchor.x + direction * branchLength, 12, width - 12),
          y: anchor.y + Phaser.Math.Between(38, 92),
        },
      ];
      drawPath(branch, 3, 0xbfefff, 0.52);
      drawPath(branch, 1.2, 0xffffff, 0.8);
    }

    storm.thunderGraphics?.add?.(graphic);
    this.tweens.add({
      targets: graphic,
      alpha: 0,
      delay: 70,
      duration: 260,
      ease: "Quad.easeOut",
      onComplete: () => {
        storm.thunderGraphics?.delete?.(graphic);
        graphic.destroy();
      },
    });

    return graphic;
  }

  _updateBossStorm() {
    const storm = this._bossStorm;
    if (!storm?.rainGraphics) return;
    const now = this.time.now;
    const dt = Math.max(0.012, Math.min(0.05, (now - Number(storm.lastAt || now)) / 1000));
    storm.lastAt = now;
    storm.rainGraphics.clear();
    storm.rainGraphics.lineStyle(2, 0x9dd7ff, 0.3);
    for (const drop of storm.drops) {
      drop.x += drop.drift * dt;
      drop.y += drop.speed * dt;
      if (drop.y > this.scale.height + 22 || drop.x < -24) {
        drop.x = Math.random() * (this.scale.width + 40);
        drop.y = -12 - Math.random() * 100;
      }
      storm.rainGraphics.lineStyle(2, 0xbfefff, drop.alpha);
      storm.rainGraphics.beginPath();
      storm.rainGraphics.moveTo(drop.x, drop.y);
      storm.rainGraphics.lineTo(drop.x + 4, drop.y + drop.len);
      storm.rainGraphics.strokePath();
    }

    storm.flashRect.setPosition(this.scale.width / 2, this.scale.height / 2);
    storm.flashRect.setSize(this.scale.width, this.scale.height);
    storm.flashRect.setScrollFactor?.(0);
    storm.flashRect.setDepth?.(storm.flashDepth ?? ((UIDEPTH ?? 10) + 6000));
    if (!Number.isFinite(Number(storm.nextThunderAt))) {
      storm.nextThunderAt = now + Phaser.Math.Between(1500, 4000);
    }
    if (now >= Number(storm.nextThunderAt || 0)) {
      storm.nextThunderAt = now + Phaser.Math.Between(5000, 10000);
      this._triggerBossStormThunder();
    }
  }

  update() {
    if (this._sceneShuttingDown) return;
    // The UI scene should never pan with world interactions.
    this.cameras.main?.setScroll?.(0, 0);
    if (!this.worldScene?.menu?.active) {
      this._tryOpenPendingMenu();
    }
    this._refreshTopHudValues();
    this._refreshTownXpHud();
    this.achievementBoard?.update?.();
    this._refreshPhaseClock();
    this._refreshTownStatusHud();
    this.zoomControls?.updateState?.();
    this.pauseMenuButton?.refresh?.();
    this._updateRaiderEdgeHud();
    this._syncUiAnimationTimeScale();
    this.contractHud?.update?.();
    this.selectionCommandBar?.update?.();
    this.functionTab?.update?.();
    this._refreshProductionStatusHud();
    this._refreshAdrenalineHud();
    this._refreshBossHud();
    this._updateBossStorm();
  }
}
