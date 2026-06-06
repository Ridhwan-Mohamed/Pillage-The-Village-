import Phaser from "phaser";
import { CONTROL_STATES, showAlert } from "../../constants";
import { Teams } from "../../Teams";
import { StorageManager } from "../../Manager/StorageManager";
import { OrderRunner } from "../../orders/OrderRunner";
import { ORDER_KINDS } from "../../orders/OrderTypes";
import { InterruptController } from "../../ai/scheduler/InterruptController";
import { AudioManager } from "../../Manager/AudioManager.js";
import { BOTTOM_BAR_THEME, getBottomBarWidth, mixColor } from "./BottomBarTheme";

const FUNCTION_TAB_SOURCE = "function_tab";
const CONTENT_PADDING_X = 14;
const CONTENT_PADDING_TOP = 0;
const CONTENT_PADDING_BOTTOM = 0;
const MAIN_BUTTON_GAP = 8;
const MAIN_BUTTON_HEIGHT = 44;
const REST_BUTTON_GAP = 8;
const REST_BUTTON_HEIGHT = 34;

const REST_GROUPS = [
  { key: "workers", label: "WORKERS", color: 0x5b21b6 },
  { key: "fighters", label: "FIGHTERS", color: 0x7c2d12 },
  { key: "idle", label: "IDLE", color: 0x4338ca },
  { key: "all", label: "ALL TROOPS", color: 0x581c87 },
];

const MODE_KEYS = ["Farm", "Destroy"];
const MODE_COLORS = {
  Farm: 0xd28d58,
  Destroy: 0xff6a87,
};

const TOGGLE_COLORS = {
  water: 0x74cbff,
};
const WATER_CONTROL_BUTTON_WIDTH = 22;
const WATER_ACTION_BUTTON_WIDTH = 86;
const WATER_CONTROL_BUTTON_HEIGHT = 16;

const GATHER_RESOURCES = [
  { key: "wood", label: "WOOD", color: 0x166534, text: "#86efac" },
  { key: "stone", label: "STONE", color: 0x475569, text: "#cbd5e1" },
  { key: "seed", label: "SEEDS", color: 0x92400e, text: "#fde68a" },
  { key: "berry", label: "BERRIES", color: 0x7c3aed, text: "#e9d5ff" },
];

export default class FunctionTab {
  constructor(scene, x, y, width, height) {
    this.scene = scene;
    this.teamNumber = 1;
    this.width = width;
    this.height = height;
    this.activeMode = null;
    this._syncIntervalMs = 140;
    this._lastAutomationSyncAt = 0;

    this._onModeCompleted = (mode) => {
      if (!mode) return;

      if (mode === "Farm") this.scene.farmMode = false;
      if (mode === "Destroy") {
        this.scene.destroyWallMode = false;
        this.scene.wallDestroyer?.stop?.();
        this.scene.input.setDefaultCursor("default");
      }

      this.activeMode = this._getSceneActiveMode();
      this.updateVisuals();
    };

    this._onKeyFarm = () => this.toggleMode("Farm");
    this._onResize = (gameSize) => {
      this.width = getBottomBarWidth(this.scene);
      this.relayout();
      this.updateVisuals();
    };

    this.view = scene.add.container(0, 0).setSize(width, height);
    this.container = this.view;

    this.mainButtons = {};
    this.mainButtonOrder = [];
    this.restButtons = {};
    this.restButtonOrder = [];

    this._createUi();
    this.registerHotkeys();

    this.scene.events.on("mode:completed", this._onModeCompleted);
    this.scene.scale.on("resize", this._onResize);

    Teams.ensureTownAutomation(this.teamNumber);
    this.relayout();
    this.updateVisuals();

    scene.functionTab = this;
  }

  _createUi() {
    MODE_KEYS.forEach((mode) => {
      const button = this._createMainButton(mode, MODE_COLORS[mode], () => this.toggleMode(mode));
      this.mainButtons[mode] = button;
      this.mainButtonOrder.push(button);
    });

    this.mainButtons.water = this._createMainButton("water", TOGGLE_COLORS.water, () => this._handleWaterPrimaryAction());
    this._createWaterControls(this.mainButtons.water);
    this.mainButtonOrder.push(this.mainButtons.water);

    REST_GROUPS.forEach((cfg) => {
      const button = this._createMainButton(cfg.key, cfg.color, () => this._runRestAction(cfg.key, this._getRestButtonMode(cfg.key)));
      button.height = REST_BUTTON_HEIGHT;
      this.restButtons[cfg.key] = button;
      this.restButtonOrder.push(button);
    });
  }

  _createMainButton(key, accentColor, onClick) {
    const root = this.scene.add.container(0, 0);
    const bg = this.scene.add.graphics();
    const text = this.scene.add.text(0, 0, "", {
      fontFamily: "Bungee",
      fontSize: "14px",
      fontStyle: "bold",
      align: "center",
      color: "#ffffff",
      stroke: "#081621",
      strokeThickness: 3,
    }).setOrigin(0.5);
    text.setLineSpacing(-4);

    const hit = this.scene.add.zone(0, 0, 10, 10)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    const button = {
      key,
      accentColor,
      onClick,
      root,
      bg,
      text,
      hit,
      width: 0,
      height: MAIN_BUTTON_HEIGHT,
      hovered: false,
      pressed: false,
      active: false,
      label: "",
    };

    hit.on("pointerover", (_pointer, _lx, _ly, event) => {
      event?.stopPropagation?.();
      button.hovered = true;
      this._drawMainButton(button, button.active);
    });
    hit.on("pointerout", (_pointer, event) => {
      event?.stopPropagation?.();
      button.hovered = false;
      button.pressed = false;
      this._drawMainButton(button, button.active);
    });
    hit.on("pointerdown", (_pointer, _lx, _ly, event) => {
      event?.stopPropagation?.();
      button.pressed = true;
      this._drawMainButton(button, button.active);
    });
    hit.on("pointerup", (_pointer, _lx, _ly, event) => {
      event?.stopPropagation?.();
      button.pressed = false;
      this._drawMainButton(button, button.active);
      AudioManager.playBottomBarClick();
      button.onClick?.();
    });

    root.add([bg, text, hit]);
    this.view.add(root);
    return button;
  }

  _createWaterControls(button) {
    if (!button?.root) return;

    const makeText = (fontSize) => this.scene.add.text(0, 0, "", {
      fontFamily: "Bungee",
      fontSize,
      color: "#ffffff",
      stroke: "#081621",
      strokeThickness: 3,
      align: "center",
    }).setOrigin(0.5);

    button.controlBg = this.scene.add.graphics();
    button.minusText = makeText("12px");
    button.countText = makeText("13px");
    button.plusText = makeText("12px");
    button.unitText = this.scene.add.text(0, 0, "", {
      fontFamily: "Bungee",
      fontSize: "10px",
      color: "#f8fdff",
      stroke: "#081621",
      strokeThickness: 3,
      align: "left",
    }).setOrigin(0, 0.5);
    button.actionText = makeText("10px");

    button.minusHit = this.scene.add.zone(0, 0, WATER_CONTROL_BUTTON_WIDTH, WATER_CONTROL_BUTTON_HEIGHT)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    button.plusHit = this.scene.add.zone(0, 0, WATER_CONTROL_BUTTON_WIDTH, WATER_CONTROL_BUTTON_HEIGHT)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    button.actionHit = this.scene.add.zone(0, 0, WATER_ACTION_BUTTON_WIDTH, WATER_CONTROL_BUTTON_HEIGHT)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    const bindPressable = (hit, hoverKey, pressKey, handler) => {
      hit.on("pointerover", (_pointer, _lx, _ly, event) => {
        event?.stopPropagation?.();
        button[hoverKey] = true;
        this._drawMainButton(button, button.active);
      });
      hit.on("pointerout", (_pointer, event) => {
        event?.stopPropagation?.();
        button[hoverKey] = false;
        button[pressKey] = false;
        this._drawMainButton(button, button.active);
      });
      hit.on("pointerdown", (_pointer, _lx, _ly, event) => {
        event?.stopPropagation?.();
        button[pressKey] = true;
        this._drawMainButton(button, button.active);
      });
      hit.on("pointerup", (_pointer, _lx, _ly, event) => {
        event?.stopPropagation?.();
        button[pressKey] = false;
        this._drawMainButton(button, button.active);
        AudioManager.playBottomBarClick();
        handler?.();
      });
    };

    bindPressable(button.minusHit, "minusHovered", "minusPressed", () => this._adjustWaterTarget(-1));
    bindPressable(button.plusHit, "plusHovered", "plusPressed", () => this._adjustWaterTarget(1));
    bindPressable(button.actionHit, "actionHovered", "actionPressed", () => this._handleWaterPrimaryAction());

    button.root.add([
      button.controlBg,
      button.minusText,
      button.countText,
      button.plusText,
      button.unitText,
      button.actionText,
      button.minusHit,
      button.plusHit,
      button.actionHit,
    ]);
  }

  relayout() {
    const barWidth = Math.max(
      320,
      Number(this.scene.uiBottomBar?.pages?.width || 0),
      Number(this.scene.uiBottomBar?.ui?.width || 0),
      getBottomBarWidth(this.scene),
    );
    const liveWidth = Math.max(320, Math.min(barWidth, Number(this.width || barWidth)));
    const liveHeight = Math.max(
      this.height,
      Number(this.view?.height || 0),
      Number(this.view?.displayHeight || 0),
      Number(this.view?.getBounds?.()?.height || 0),
      Number(this.scene.uiBottomBar?.pages?.height || 0),
    );

    this.width = liveWidth;
    this.height = liveHeight;

    this.view.setSize(this.width, this.height);

    const availableHeight = Math.max(90, this.height - CONTENT_PADDING_TOP - CONTENT_PADDING_BOTTOM);
    const rowGap = 8;
    const usableHeight = availableHeight - rowGap;

    const topRowHeight = Math.max(MAIN_BUTTON_HEIGHT, Math.floor(usableHeight * 0.5));
    const bottomRowHeight = Math.max(REST_BUTTON_HEIGHT, usableHeight - topRowHeight);

    const top = -this.height / 2 + CONTENT_PADDING_TOP;
    const row1Y = top + topRowHeight / 2;
    const restRowY = top + topRowHeight + rowGap + bottomRowHeight / 2;

    const usableWidth = Math.max(360, this.width - CONTENT_PADDING_X * 2);

    const mainButtonWidth = Math.max(
      124,
      Math.floor((usableWidth - MAIN_BUTTON_GAP * (this.mainButtonOrder.length - 1)) / this.mainButtonOrder.length)
    );
    const mainStartX = -((mainButtonWidth * this.mainButtonOrder.length) + (MAIN_BUTTON_GAP * (this.mainButtonOrder.length - 1))) / 2 + mainButtonWidth / 2;

    this.mainButtonOrder.forEach((button, index) => {
      button.width = mainButtonWidth;
      button.height = topRowHeight;
      button.root.setPosition(mainStartX + index * (mainButtonWidth + MAIN_BUTTON_GAP), row1Y);
      button.hit.setSize(button.width, button.height);
      if (button.key === "water") {
        button.text.setFontSize("11px");
        button.text.setPosition(0, -Math.max(12, Math.round(button.height * 0.32)));
        button.text.setFixedSize(button.width - 18, 16);
        this._layoutWaterControls(button);
      } else {
        button.text.setFontSize("14px");
        button.text.setPosition(0, 0);
        button.text.setFixedSize(button.width - 14, button.height - 10);
      }
      button.text.setOrigin(0.5);
    });

    const restButtons = this.restButtonOrder;
    const restButtonWidth = Math.max(
      110,
      Math.floor((usableWidth - REST_BUTTON_GAP * (restButtons.length - 1)) / restButtons.length)
    );
    const restStartX = -((restButtonWidth * restButtons.length) + (REST_BUTTON_GAP * (restButtons.length - 1))) / 2 + restButtonWidth / 2;

    restButtons.forEach((button, index) => {
      button.width = restButtonWidth;
      button.height = bottomRowHeight;
      button.root.setPosition(restStartX + index * (restButtonWidth + REST_BUTTON_GAP), restRowY);
      button.hit.setSize(button.width, button.height);
      button.text.setPosition(0, 0);
      button.text.setFixedSize(button.width - 12, button.height - 8);
      button.text.setOrigin(0.5);
    });
  }

  _layoutWaterControls(button) {
    if (!button?.controlBg) return;
    const automation = this._getAutomation() || Teams.createTownAutomationState();
    const countLabel = String(this._getWaterCountValue(automation));
    const unitLabel = this._getWaterCountUnitLabel(automation);
    const actionLabel = this._getWaterActionLabel(automation);
    const compact = button.width < 150;
    const gap = compact ? 3 : 5;
    const countWidth = compact
      ? Math.max(18, Math.min(28, countLabel.length * 9 + 10))
      : Math.max(24, Math.min(46, countLabel.length * 10 + 12));
    const unitWidth = compact
      ? (unitLabel === "waters" ? 32 : 22)
      : (unitLabel === "waters" ? 48 : 30);
    const rowWidth = WATER_CONTROL_BUTTON_WIDTH + gap + countWidth + gap + WATER_CONTROL_BUTTON_WIDTH + gap + unitWidth;
    const rowStartX = -rowWidth / 2;
    const countY = Math.round(-button.height * 0.02);
    const actionY = Math.round(button.height * 0.31);
    const minusX = rowStartX + WATER_CONTROL_BUTTON_WIDTH / 2;
    const countX = rowStartX + WATER_CONTROL_BUTTON_WIDTH + gap + countWidth / 2;
    const plusX = rowStartX + WATER_CONTROL_BUTTON_WIDTH + gap + countWidth + gap + WATER_CONTROL_BUTTON_WIDTH / 2;
    const unitX = rowStartX + WATER_CONTROL_BUTTON_WIDTH + gap + countWidth + gap + WATER_CONTROL_BUTTON_WIDTH + gap;
    const actionWidth = Math.min(
      Math.max(WATER_ACTION_BUTTON_WIDTH, actionLabel.length * 8 + 18),
      Math.max(62, button.width - 18)
    );

    button.minusText.setPosition(minusX, countY);
    button.countText.setPosition(countX, countY);
    button.plusText.setPosition(plusX, countY);
    button.unitText.setFontSize(compact ? "8px" : "10px");
    button.unitText.setFixedSize(unitWidth + 2, WATER_CONTROL_BUTTON_HEIGHT);
    button.unitText.setPosition(unitX, countY);
    button.actionText.setPosition(0, actionY);

    button.minusHit.setPosition(minusX, countY).setSize(WATER_CONTROL_BUTTON_WIDTH, WATER_CONTROL_BUTTON_HEIGHT);
    button.plusHit.setPosition(plusX, countY).setSize(WATER_CONTROL_BUTTON_WIDTH, WATER_CONTROL_BUTTON_HEIGHT);
    button.actionHit.setPosition(0, actionY).setSize(actionWidth, WATER_CONTROL_BUTTON_HEIGHT);
    button.waterLayout = {
      countY,
      actionY,
      minusX,
      countX,
      plusX,
      unitX,
      actionWidth,
    };
  }

  _getSceneActiveMode() {
    if (this.scene.destroyWallMode) return "Destroy";
    if (this.scene.farmMode) return "Farm";
    return null;
  }

  _getTutorialManager() {
    return this.scene.worldScene?.tutorialManager || this.scene.tutorialManager || null;
  }

  toggleMode(mode) {
    const currentMode = this._getSceneActiveMode();
    const turningOn = currentMode !== mode;
    const tutorial = this._getTutorialManager();

    if (tutorial?.isActive?.()) {
      if (!turningOn) {
        tutorial.blockAction();
        return;
      }
      if (!tutorial.canPerformAction?.("function.mode", { mode })) {
        return;
      }
    }

    this.scene.farmMode = false;
    this.scene.seedGridMode = false;
    this.scene.stoneWallMode = false;
    this.scene.woodWallMode = false;
    this.scene.destroyWallMode = false;

    if (currentMode === "Destroy" && mode !== "Destroy") {
      this.scene.wallDestroyer?.stop?.();
      this.scene.input.setDefaultCursor("default");
    }

    if (turningOn) {
      if (mode === "Farm") this.scene.farmMode = true;
      if (mode === "Destroy") {
        this.scene.destroyWallMode = true;
        this.scene.wallDestroyer?.start?.();
      }
    } else if (mode === "Destroy") {
      this.scene.wallDestroyer?.stop?.();
      this.scene.input.setDefaultCursor("default");
    }

    this.activeMode = this._getSceneActiveMode();
    this.updateVisuals();
    if (turningOn) {
      tutorial?.notifyAction?.("function.mode", { mode });
    }
  }

  _getAutomation() {
    return Teams.ensureTownAutomation(this.teamNumber);
  }

  _getWaterUiState(automation = this._getAutomation()) {
    const draft = Math.max(1, Number(automation?.waterDraftCount || Teams.DEFAULT_WATER_BATCH_COUNT || 5));
    const remaining = Math.max(0, Number(automation?.waterRemainingCount || 0));
    const delivered = Math.max(0, Number(automation?.waterDeliveredCount || 0));
    const committed = Math.max(0, Number(automation?.waterCommittedCount || 0));
    const batchActive = !!automation?.waterOrderId && (
      !!automation?.waterEnabled ||
      remaining > 0 ||
      committed > 0
    );
    return {
      draft,
      remaining,
      delivered,
      committed,
      batchActive,
      finishing: batchActive && remaining <= 0 && committed > 0,
      total: Math.max(delivered + remaining, delivered || draft),
    };
  }

  _adjustWaterTarget(delta = 0) {
    const automation = this._getAutomation();
    if (!automation) return;

    const amount = delta > 0 ? 1 : delta < 0 ? -1 : 0;
    if (!amount) return;

    this._reconcileTownAutomation(true);
    const state = this._getWaterUiState(automation);

    if (state.batchActive) {
      const nextRemaining = Math.max(0, state.remaining + amount);
      if (nextRemaining === state.remaining) return;

      automation.waterRemainingCount = nextRemaining;
      if (amount < 0 && automation.waterOrderId != null) {
        OrderRunner.trimManagedWaterOrder?.(automation.waterOrderId, nextRemaining, this.teamNumber);
      }
      if (automation.waterRemainingCount <= 0 && automation.waterCommittedCount <= 0) {
        Teams.clearTownWaterBatch?.(this.teamNumber, automation.waterOrderId);
      }
    } else {
      automation.waterDraftCount = Math.max(1, state.draft + amount);
    }

    this._reconcileTownAutomation(true);
    this.updateVisuals();
  }

  _startWaterBatch() {
    const automation = this._getAutomation();
    if (!automation) return;

    const tutorial = this._getTutorialManager();
    const target = Math.max(1, Number(automation.waterDraftCount || Teams.DEFAULT_WATER_BATCH_COUNT || 5));
    if (tutorial?.isActive?.() && !tutorial.canPerformAction?.("function.water", { enabled: true, target })) {
      return;
    }

    const orderId = OrderRunner._nextId();
    Teams.startTownWaterBatch?.(this.teamNumber, target, orderId);
    this._reconcileTownAutomation(true);
    this.updateVisuals();

    showAlert(this.scene, `Producing ${target} clean water`, "#93c5fd");
    tutorial?.notifyAction?.("function.water", { enabled: true, target });
  }

  _cancelWaterBatch() {
    const automation = this._getAutomation();
    if (!automation?.waterOrderId) return;

    const tutorial = this._getTutorialManager();
    if (tutorial?.isActive?.() && !tutorial.canPerformAction?.("function.water", { enabled: false })) {
      return;
    }

    automation.waterRemainingCount = 0;
    OrderRunner.trimManagedWaterOrder?.(automation.waterOrderId, 0, this.teamNumber);
    if (automation.waterCommittedCount <= 0) {
      Teams.clearTownWaterBatch?.(this.teamNumber, automation.waterOrderId);
    }
    this._reconcileTownAutomation(true);
    this.updateVisuals();

    showAlert(this.scene, "Water batch winding down", "#93c5fd");
    tutorial?.notifyAction?.("function.water", { enabled: false });
  }

  _handleWaterPrimaryAction() {
    const automation = this._getAutomation();
    if (!automation) return;
    const state = this._getWaterUiState(automation);
    if (state.batchActive) {
      if (state.finishing) return;
      this._cancelWaterBatch();
      return;
    }
    this._startWaterBatch();
  }

  _sumGatherTargets(gatherTargets = {}) {
    return GATHER_RESOURCES.reduce((sum, resource) => sum + Math.max(0, Number(gatherTargets?.[resource.key] || 0)), 0);
  }

  _getTeamTroops(list) {
    return (list || []).filter((troop) => troop?.active);
  }

  _isManagedOrder(order, kind = null) {
    if (!order || order.status !== "active") return false;
    if (order.source !== FUNCTION_TAB_SOURCE) return false;
    if (kind && order.kind !== kind) return false;
    return true;
  }

  _isSleepLike(troop) {
    return troop?.state === CONTROL_STATES.SLEEP_MODE || troop?.state === CONTROL_STATES.GO_HOME_MODE;
  }

  _isBusy(troop) {
    return !!(
      troop?._sleepQueued === true ||
      troop?.task ||
      troop?.timer ||
      troop?._returnSwimActive === true ||
      troop?.currentPath?.length ||
      StorageManager.isCarrying(troop)
    );
  }

  _canAssignNow(troop) {
    return !!(troop?.active && !this._isSleepLike(troop) && !this._isBusy(troop));
  }

  _markOrderShuttingDown(troop) {
    const order = troop?.currentOrder;
    if (!order || order.shuttingDown) return;
    order.shuttingDown = true;
    OrderRunner.stepUnit(troop);
  }

  _managedGatherTroops(foragers, resourceKey) {
    return foragers.filter((troop) => {
      const order = troop?.currentOrder;
      return this._isManagedOrder(order, ORDER_KINDS.GATHER_TYPE) && order.resourceType === resourceKey;
    });
  }

  _managedWaterTroops(firemen) {
    return firemen.filter((troop) => this._isManagedOrder(troop?.currentOrder, ORDER_KINDS.MAKE_WATER));
  }

  _releasePriority(troop) {
    return [
      this._isBusy(troop) ? 1 : 0,
      StorageManager.isCarrying(troop) ? 1 : 0,
      Number(troop?.id || 0),
    ];
  }

  _comparePriority(a, b) {
    for (let index = 0; index < a.length; index += 1) {
      if (a[index] === b[index]) continue;
      return a[index] - b[index];
    }
    return 0;
  }

  _assignManagedWaterOrder(troop, orderId) {
    OrderRunner._replaceTroopOrder(troop, {
      id: orderId,
      kind: ORDER_KINDS.MAKE_WATER,
      status: "active",
      source: FUNCTION_TAB_SOURCE,
      persistent: true,
    });
    OrderRunner.stepUnit(troop);
  }

  _assignManagedGatherOrder(troop, resourceType, orderId) {
    OrderRunner._replaceTroopOrder(troop, {
      id: orderId,
      kind: ORDER_KINDS.GATHER_TYPE,
      status: "active",
      source: FUNCTION_TAB_SOURCE,
      resourceType,
      persistent: true,
    });
    OrderRunner.stepUnit(troop);
  }

  _reconcileTownAutomation(force = false) {
    const now = this.scene.time?.now ?? 0;
    if (!force && now - this._lastAutomationSyncAt < this._syncIntervalMs) return;

    const team = Teams.getTeam(this.teamNumber);
    const automation = this._getAutomation();
    if (!team || !automation) return;

    this._reconcileWaterAutomation(team, automation);
    this._reconcileGatherAutomation(team, automation);
    this._lastAutomationSyncAt = now;
  }

  _reconcileWaterAutomation(team, automation) {
    const firemen = this._getTeamTroops(team.firemanList);
    const waterState = this._getWaterUiState(automation);

    this._managedWaterTroops(firemen)
      .filter((troop) => troop?.currentOrder?.shuttingDown)
      .forEach((troop) => {
        OrderRunner.stepUnit(troop);
      });

    if (!waterState.batchActive || !automation.waterOrderId) {
      this._managedWaterTroops(firemen).forEach((troop) => {
        this._markOrderShuttingDown(troop);
      });
      return;
    }

    firemen.forEach((troop) => {
      const order = troop?.currentOrder;
      if (this._isManagedOrder(order, ORDER_KINDS.MAKE_WATER) && order.id === automation.waterOrderId && !order.shuttingDown) return;
      if (this._isManagedOrder(order, ORDER_KINDS.MAKE_WATER) && order.id !== automation.waterOrderId) {
        this._markOrderShuttingDown(troop);
        return;
      }
      if (!this._canAssignNow(troop)) return;
      if (order && order.source && order.source !== FUNCTION_TAB_SOURCE) return;
      this._assignManagedWaterOrder(troop, automation.waterOrderId);
    });
  }

  _reconcileGatherAutomation(team, automation) {
    const foragers = this._getTeamTroops(team.foragerList);
    if (this._sumGatherTargets(automation.gatherTargets) <= 0) {
      automation.gatherEnabled = false;
    }

    foragers.forEach((troop) => {
      if (this._isManagedOrder(troop?.currentOrder, ORDER_KINDS.GATHER_TYPE) && troop.currentOrder?.shuttingDown) {
        OrderRunner.stepUnit(troop);
      }
    });

    GATHER_RESOURCES.forEach((resource) => {
      const desiredTarget = automation.gatherEnabled ? Math.max(0, Number(automation.gatherTargets?.[resource.key] || 0)) : 0;
      const desired = OrderRunner.isGatherCommandAvailable(resource.key, this.scene) ? desiredTarget : 0;
      const assigned = this._managedGatherTroops(foragers, resource.key).filter((troop) => !troop?.currentOrder?.shuttingDown);
      const overflow = Math.max(0, assigned.length - desired);
      if (overflow <= 0) return;

      assigned
        .sort((a, b) => this._comparePriority(this._releasePriority(a), this._releasePriority(b)))
        .slice(0, overflow)
        .forEach((troop) => this._markOrderShuttingDown(troop));
    });

    GATHER_RESOURCES.forEach((resource) => {
      const desired = automation.gatherEnabled ? Math.max(0, Number(automation.gatherTargets?.[resource.key] || 0)) : 0;
      if (desired <= 0) return;
      if (!OrderRunner.isGatherCommandAvailable(resource.key, this.scene)) return;

      const assignedCount = this._managedGatherTroops(foragers, resource.key)
        .filter((troop) => !troop?.currentOrder?.shuttingDown)
        .length;
      let needed = desired - assignedCount;
      if (needed <= 0) return;

      if (!automation.gatherOrderIds?.[resource.key]) {
        automation.gatherOrderIds[resource.key] = OrderRunner._nextId();
      }

      const candidates = foragers
        .filter((troop) => {
          if (!this._canAssignNow(troop)) return false;
          const order = troop?.currentOrder;
          if (!order) return true;
          if (order.source !== FUNCTION_TAB_SOURCE) return false;
          if (order.kind !== ORDER_KINDS.GATHER_TYPE) return false;
          if (!order.shuttingDown) return false;
          return true;
        })
        .sort((a, b) => this._comparePriority(
          [a?.currentOrder ? 0 : 1, Number(a?.id || 0)],
          [b?.currentOrder ? 0 : 1, Number(b?.id || 0)]
        ));

      for (const troop of candidates) {
        if (needed <= 0) break;
        this._assignManagedGatherOrder(troop, resource.key, automation.gatherOrderIds[resource.key]);
        needed -= 1;
      }
    });
  }

  _getRestTroops(groupKey, team) {
    const all = this._getTeamTroops(team?.playerList);
    const workers = this._getTeamTroops([
      ...(team?.builderList || []),
      ...(team?.foragerList || []),
      ...(team?.farmerList || []),
      ...(team?.firemanList || []),
    ]);
    const fighters = this._getTeamTroops(team?.fighterList);
    const idle = all.filter((troop) => (
      troop?.active &&
      !this._isSleepLike(troop) &&
      !troop?._sleepQueued &&
      !troop?.task &&
      !troop?.timer &&
      !troop?.track &&
      !troop?.currentPath?.length &&
      !StorageManager.isCarrying(troop)
    ));

    switch (groupKey) {
      case "workers":
        return workers;
      case "fighters":
        return fighters;
      case "idle":
        return idle;
      case "all":
      default:
        return all;
    }
  }

  _isDeliveryPhaseTroop(troop) {
    if (!troop?.active) return false;

    return !!(
      StorageManager.isCarrying(troop) ||
      troop?.state === CONTROL_STATES.SEND_TO_STORAGE ||
      troop?.state === CONTROL_STATES.SEND_TO_OVEN ||
      troop?.state === CONTROL_STATES.GET_FROM_OVEN ||
      troop?.pendingFuelJob ||
      troop?.pendingOvenJob
    );
  }

  _markOrderShuttingDownForSleep(troop) {
    const order = troop?.currentOrder;
    if (!order) return;
    if (order.source !== FUNCTION_TAB_SOURCE) return;
    if (order.shuttingDown) return;

    order.shuttingDown = true;
    OrderRunner.stepUnit?.(troop);
  }

  _queueSleepAfterCurrentDelivery(troop) {
    if (!troop?.active) return false;
    troop._sleepQueued = true;
    troop._sleepQueuedAt = this.scene.time?.now ?? Date.now();
    this._markOrderShuttingDownForSleep(troop);
    return true;
  }

  _sleepTroopNow(troop) {
    if (!troop?.active) return false;

    this._markOrderShuttingDownForSleep(troop);

    InterruptController.interruptTroop(
      troop,
      "function_tab_sleep_now",
      CONTROL_STATES.TRACK_MODE
    );

    const result = OrderRunner.toggleSleepTroops?.([troop]);
    if (result?.ok) {
      troop._sleepQueued = false;
      troop._sleepQueuedAt = 0;
      return true;
    }
    return false;
  }

  _wakeTroopNow(troop) {
    if (!troop?.active) return false;

    const hadQueuedSleep = !!troop._sleepQueued;
    troop._sleepQueued = false;
    troop._sleepQueuedAt = 0;

    if (this._isSleepLike(troop)) {
      const result = OrderRunner.toggleSleepTroops?.([troop]);
      return !!result?.ok;
    }

    return hadQueuedSleep;
  }

  _getRestGroupState(groupKey) {
    const team = Teams.getTeam(this.teamNumber);
    const troops = this._getRestTroops(groupKey, team);

    let awake = 0;
    let sleeping = 0;
    let queued = 0;

    troops.forEach((troop) => {
      if (!troop?.active) return;
      if (troop?._sleepQueued) {
        queued += 1;
        return;
      }
      if (this._isSleepLike(troop)) {
        sleeping += 1;
        return;
      }
      awake += 1;
    });

    return {
      troops,
      awake,
      sleeping,
      queued,
      total: awake + sleeping + queued,
    };
  }

  _getRestButtonMode(groupKey) {
    const state = this._getRestGroupState(groupKey);
    if (state.total <= 0) return "none";
    return state.awake > 0 ? "sleep" : "wake";
  }

  _getRestButtonLabel(groupKey) {
    const cfg = REST_GROUPS.find((g) => g.key === groupKey);
    const state = this._getRestGroupState(groupKey);
    if (state.total <= 0) return `NO\n${cfg?.label || groupKey.toUpperCase()}`;
    const action = state.awake > 0 ? "SLEEP" : "WAKE";
    return `${action}\n${cfg?.label || groupKey.toUpperCase()}`;
  }

  _runRestAction(groupKey, mode) {
    const tutorial = this._getTutorialManager();
    if (tutorial?.isActive?.()) {
      tutorial.blockAction();
      return;
    }

    const team = Teams.getTeam(this.teamNumber);
    if (!team) return;

    const troops = this._getRestTroops(groupKey, team);
    if (!troops.length) {
      const label = REST_GROUPS.find((g) => g.key === groupKey)?.label?.toLowerCase() || "troops";
      showAlert(this.scene, `No ${label} available`, "#fecaca");
      return;
    }

    let changed = 0;
    let queued = 0;
    let skipped = 0;

    troops.forEach((troop) => {
      if (!troop?.active) {
        skipped += 1;
        return;
      }

      if (mode === "wake") {
        if (this._wakeTroopNow(troop)) changed += 1;
        else skipped += 1;
        return;
      }

      if (this._isSleepLike(troop)) {
        skipped += 1;
        return;
      }

      if (this._isDeliveryPhaseTroop(troop)) {
        if (this._queueSleepAfterCurrentDelivery(troop)) queued += 1;
        else skipped += 1;
        return;
      }

      if (this._sleepTroopNow(troop)) changed += 1;
      else skipped += 1;
    });

    this.updateVisuals();

    if (mode === "wake") {
      showAlert(
        this.scene,
        `Woke ${changed} troop${changed === 1 ? "" : "s"}${skipped ? `, skipped ${skipped}` : ""}`,
        changed > 0 ? "#a7f3d0" : "#fecaca"
      );
      return;
    }

    showAlert(
      this.scene,
      `Sleeping now: ${changed}${queued ? ` | after dropoff: ${queued}` : ""}${skipped ? ` | skipped: ${skipped}` : ""}`,
      (changed + queued) > 0 ? "#c4b5fd" : "#fecaca"
    );
  }

  _getWaterSummary(automation, firemen) {
    const managed = this._managedWaterTroops(firemen);
    const active = managed.filter((troop) => !troop?.currentOrder?.shuttingDown).length;
    const finishing = managed.length - active;
    const state = this._getWaterUiState(automation);

    if (state.batchActive) {
      const total = Math.max(1, state.total);
      const done = Math.min(total, Math.max(0, state.delivered));
      return `${done}/${total} done`;
    }
    if (finishing > 0) {
      return "Finishing batch";
    }
    return "Clean water";
  }

  _getWaterCountValue(automation) {
    const state = this._getWaterUiState(automation);
    return state.batchActive ? state.remaining : state.draft;
  }

  _getWaterCountUnitLabel(automation) {
    const state = this._getWaterUiState(automation);
    return state.batchActive ? "left" : "waters";
  }

  _getWaterActionLabel(automation) {
    const state = this._getWaterUiState(automation);
    if (!state.batchActive) return "START";
    return state.finishing ? "FINISHING" : "CANCEL";
  }

  _setMainButtonLabel(button, label) {
    if (!button || button.label === label) return;
    button.label = label;
    button.text.setText(label);
  }

  _drawMainButton(button, active) {
    button.active = active;
    const x = -button.width / 2;
    const y = -button.height / 2;
    const fillColor = mixColor(BOTTOM_BAR_THEME.panelFill, button.accentColor, active ? 0.26 : button.hovered ? 0.16 : 0.08);
    const fillAlpha = active ? 0.96 : button.pressed ? 0.9 : button.hovered ? 0.86 : 0.8;
    const strokeColor = active ? button.accentColor : mixColor(button.accentColor, 0x98e7ff, 0.35);
    const strokeAlpha = active ? 0.64 : button.hovered ? 0.28 : 0.14;

    button.bg.clear();
    button.bg.fillStyle(0x031019, 0.16);
    button.bg.fillRoundedRect(x, y + 3, button.width, button.height, 14);
    button.bg.fillStyle(fillColor, fillAlpha);
    button.bg.fillRoundedRect(x, y, button.width, button.height, 14);
    button.bg.fillStyle(0xffffff, active ? 0.14 : 0.08);
    button.bg.fillRoundedRect(x + 8, y + 5, Math.max(18, button.width - 16), Math.max(10, Math.floor(button.height * 0.34)), 10);
    button.bg.lineStyle(active ? 2 : 1.5, strokeColor, strokeAlpha);
    button.bg.strokeRoundedRect(x, y, button.width, button.height, 14);
    button.bg.lineStyle(1, 0xffffff, active ? 0.18 : 0.08);
    button.bg.strokeRoundedRect(x + 1, y + 1, button.width - 2, button.height - 2, 13);

    button.text.setColor(active ? "#fffaf0" : Phaser.Display.Color.IntegerToColor(button.accentColor).rgba);
    button.root.setScale(button.pressed ? 0.99 : active ? 1.015 : button.hovered ? 1.01 : 1);
    if (button.key === "water") {
      this._drawWaterControls(button, active);
    }
  }

  _drawWaterControls(button, active) {
    if (!button?.controlBg) return;

    const drawPill = (cx, cy, width, height, label, hovered, pressed, enabled = true) => {
      const x = cx - width / 2;
      const y = cy - height / 2;
      const alpha = !enabled ? 0.34 : pressed ? 0.92 : hovered ? 0.86 : 0.76;
      const fill = mixColor(button.accentColor, 0xffffff, !enabled ? 0.06 : hovered ? 0.18 : 0.12);
      const stroke = enabled ? button.accentColor : mixColor(button.accentColor, 0x6b7280, 0.52);
      button.controlBg.fillStyle(fill, alpha);
      button.controlBg.fillRoundedRect(x, y, width, height, 8);
      button.controlBg.lineStyle(enabled ? 1.5 : 1, stroke, enabled ? 0.58 : 0.24);
      button.controlBg.strokeRoundedRect(x, y, width, height, 8);
      label.setColor(enabled ? "#f8fdff" : "#7f93a1");
    };

    const automation = this._getAutomation() || Teams.createTownAutomationState();
    const state = this._getWaterUiState(automation);

    button.minusText.setText("-");
    button.countText.setText(`${this._getWaterCountValue(automation)}`);
    button.plusText.setText("+");
    button.unitText.setText(this._getWaterCountUnitLabel(automation));
    button.actionText.setText(this._getWaterActionLabel(automation));
    this._layoutWaterControls(button);

    const layout = button.waterLayout || {};
    button.controlBg.clear();
    drawPill(layout.minusX ?? 0, layout.countY ?? 0, WATER_CONTROL_BUTTON_WIDTH, WATER_CONTROL_BUTTON_HEIGHT, button.minusText, !!button.minusHovered, !!button.minusPressed, true);
    drawPill(layout.plusX ?? 0, layout.countY ?? 0, WATER_CONTROL_BUTTON_WIDTH, WATER_CONTROL_BUTTON_HEIGHT, button.plusText, !!button.plusHovered, !!button.plusPressed, true);
    drawPill(0, layout.actionY ?? 0, layout.actionWidth ?? WATER_ACTION_BUTTON_WIDTH, WATER_CONTROL_BUTTON_HEIGHT, button.actionText, !!button.actionHovered, !!button.actionPressed, !state.finishing);
  }

  updateVisuals() {
    const automation = this._getAutomation() || Teams.createTownAutomationState();
    const team = Teams.getTeam(this.teamNumber) || {
      playerList: [],
      fighterList: [],
      builderList: [],
      foragerList: [],
      farmerList: [],
      firemanList: [],
    };

    const firemen = this._getTeamTroops(team?.firemanList);

    this.activeMode = this._getSceneActiveMode();

    MODE_KEYS.forEach((mode) => {
      this._setMainButtonLabel(this.mainButtons[mode], mode);
      this._drawMainButton(this.mainButtons[mode], this.activeMode === mode);
    });

    this._setMainButtonLabel(this.mainButtons.water, this._getWaterSummary(automation, firemen));
    this._drawMainButton(this.mainButtons.water, this._getWaterUiState(automation).batchActive);

    REST_GROUPS.forEach((cfg) => {
      const button = this.restButtons[cfg.key];
      this._setMainButtonLabel(button, this._getRestButtonLabel(cfg.key));
      this._drawMainButton(button, false);
    });
  }

  update() {
    const now = this.scene.time?.now ?? 0;
    const shouldRefresh = now - this._lastAutomationSyncAt >= this._syncIntervalMs;
    this._reconcileTownAutomation();
    if (shouldRefresh || this.activeMode !== this._getSceneActiveMode()) {
      this.updateVisuals();
    }
  }

  onShow() {
    this.scene.time?.delayedCall?.(0, () => {
      this.relayout();
      this.updateVisuals();
    });
  }

  registerHotkeys() {
    this.scene.input.keyboard.on("keydown-F", this._onKeyFarm);
  }

  getContainer() {
    return this.container;
  }

  destroy() {
    this.scene.events.off("mode:completed", this._onModeCompleted);
    this.scene.input.keyboard.off("keydown-F", this._onKeyFarm);
    this.scene.scale.off("resize", this._onResize);
    this.container?.destroy?.(true);
    this.view = null;
    this.mainButtons = {};
    this.mainButtonOrder = [];
    this.restButtons = {};
    this.restButtonOrder = [];
  }
}
