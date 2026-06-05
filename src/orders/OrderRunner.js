import { CONTROL_STATES, PARCEL, SQUARESIZE, TILE_TYPES, showAlert } from "../constants";
import Phaser from "phaser";
import { Teams } from "../Teams";
import { Player } from "../players/Player";
import { StorageManager } from "../Manager/StorageManager";
import { Manager } from "../Manager/Manager";
import { Scheduler } from "../ai/scheduler/Scheduler";
import { InterruptController } from "../ai/scheduler/InterruptController";
import { CombatSpacingCoordinator } from "../ai/CombatSpacingCoordinator";
import { Map } from "../map";
import { blockResourceManager } from "../Manager/BlockResourceManager";
import { ORDER_KINDS, isGatherOrder } from "./OrderTypes";
import { StaminaManager } from "../Manager/staminaManager";
import { StageState } from "../parcelController/StageState";
import { buildingManager } from "../Manager/buildingManager";
import { UI_ITEM_TYPES } from "../UI/UIConstants";
import { ClayOven } from "../buildings/ClayOven";
import {
  getTroopSellValue as getBalancedTroopSellValue,
} from "../balance/GameBalance";

export class OrderRunner {
  static nextOrderId = 1;
  static DEFAULT_AREA_RADIUS_TILES = 12;
  static DEFEND_TOWN_RADIUS_TILES = 6;
  static HOLD_RADIUS_TILES = 1;
  static BERRY_HEAL_AMOUNT = 30;
  static BERRY_STAMINA_AMOUNT = 30;
  static SELL_PRICE = {
    Farmer: 50,
    Forager: 45,
    Fireman: 55,
    Builder: 70,
    Gunslinger: 120,
    Blademaster: 130,
    Brawler: 110,
    Default: 30,
  };

  static getSelectionProfile(selection = Player.selected) {
    const troops = (selection || []).filter(troop => troop?.active && troop.body?.team === 1);
    const allForagers = troops.length > 0 && troops.every(troop => troop.isForager);
    const anyForagers = troops.some(troop => troop.isForager);
    const allFiremen = troops.length > 0 && troops.every(troop => troop.isFireman);
    const anyFiremen = troops.some(troop => troop.isFireman);
    const allCombatants = troops.length > 0 && troops.every(troop => this._isCombatTroop(troop));
    const allGunslingers = troops.length > 0 && troops.every(troop => troop?.isGunslinger);
    const allSleepingLike = troops.length > 0 && troops.every(troop =>
      troop?.state === CONTROL_STATES.SLEEP_MODE || troop?.state === CONTROL_STATES.GO_HOME_MODE
    );
    const sellValue = troops.reduce((sum, troop) => sum + this.getTroopSellValue(troop), 0);
    return {
      troops,
      count: troops.length,
      hasSelection: troops.length > 0,
      allForagers,
      anyForagers,
      allFiremen,
      anyFiremen,
      allCombatants,
      allGunslingers,
      allSleepingLike,
      sellValue,
      hasMixedRoles: troops.length > 0 && !troops.every(troop => troop.isForager === troops[0].isForager),
    };
  }

  static hasPendingGatherPlacement() {
    return false;
  }

  static toggleGatherPlacement(resourceType) {
    return this.issueGatherTypeOrder(Player.selected, resourceType);
  }

  static clearPendingGatherPlacement() {}

  static issuePendingGatherPlacement(troops, worldX, worldY) {
    return false;
  }

  static getGatherContractType(resourceType) {
    if (resourceType === "wood") return "FOREST";
    if (resourceType === "stone" || resourceType === "gold") return "ROCK";
    if (resourceType === "seed" || resourceType === "berry") return "FARM";
    return null;
  }

  static _resourceNodesForType(resourceType) {
    switch (resourceType) {
      case "wood":
        return Map.worldPines || [];
      case "stone":
      case "gold":
        return Map.worldStones || [];
      case "seed":
        return Map.worldSeedBushes || [];
      case "berry":
        return Map.worldBerryBushes || [];
      default:
        return [];
    }
  }

  static hasActiveGatherParcel(resourceType, scene = Player.scene) {
    const contractType = this.getGatherContractType(resourceType);
    if (!contractType) return false;

    const worldScene = scene?.worldScene ?? scene ?? Player.scene;
    const contracts = worldScene?.parcelManager?.contractsById;
    if (!contracts?.values) return false;

    for (const contract of contracts.values()) {
      if (contract?.type === contractType && contract?._removalCommitted !== true) return true;
    }
    return false;
  }

  static getGatherParcelMissingMessage(resourceType) {
    if (resourceType === "wood") {
      return "No active forest parcel. Buy a forest parcel first.";
    }
    if (resourceType === "stone" || resourceType === "gold") {
      return "No active rock parcel. Buy a rock parcel first.";
    }
    if (resourceType === "seed" || resourceType === "berry") {
      return "No active field parcel. Buy a field parcel first.";
    }
    return "No matching resource parcel is active.";
  }

  static getGatherUnavailableMessage(resourceType, scene = Player.scene) {
    if (!this.hasActiveGatherParcel(resourceType, scene)) {
      return this.getGatherParcelMissingMessage(resourceType);
    }
    if (resourceType === "seed") {
      return "No seed bushes are available on the active field parcel.";
    }
    if (resourceType === "berry") {
      return "No berry bushes are available on the active field parcel.";
    }
    if (resourceType === "gold") {
      return "No gold ore targets are available on the active rock parcel.";
    }
    return `No ${resourceType} targets are available right now.`;
  }

  static hasGatherableNodes(resourceType) {
    const nodes = this._resourceNodesForType(resourceType);
    return nodes.some((node) =>
      this._nodeActive(node) &&
      this._nodeResourceKind(node) === resourceType &&
      Math.max(0, Number(node?.health ?? node?.task?.remaining ?? 0)) > 0
    );
  }

  static isGatherCommandAvailable(resourceType, scene = Player.scene) {
    return this.hasActiveGatherParcel(resourceType, scene) && this.hasGatherableNodes(resourceType);
  }

  static issueGatherTypeOrder(troops, resourceType, scene = Player.scene) {
    const selection = this.getSelectionProfile(troops);
    if (!selection.allForagers) return false;
    if (!this.isGatherCommandAvailable(resourceType, scene)) return false;

    const orderId = this._nextId();
    for (const troop of selection.troops) {
      this._replaceTroopOrder(troop, {
        id: orderId,
        kind: ORDER_KINDS.GATHER_TYPE,
        status: "active",
        source: "player",
        resourceType,
        persistent: true,
      });
    }

    for (const troop of selection.troops) {
      this.stepUnit(troop);
    }
    return true;
  }

  static issueGatherAreaOrder(troops, worldX, worldY, resourceType, opts = {}) {
    const selection = this.getSelectionProfile(troops);
    if (!selection.allForagers) return false;

    const orderId = this._nextId();
    for (const troop of selection.troops) {
      this._replaceTroopOrder(troop, {
        id: orderId,
        kind: ORDER_KINDS.GATHER_AREA,
        status: "active",
        source: "player",
        resourceType,
        center: { x: worldX, y: worldY },
        radiusTiles: opts.radiusTiles ?? this.DEFAULT_AREA_RADIUS_TILES,
        persistent: true,
      });
    }

    for (const troop of selection.troops) {
      this.stepUnit(troop);
    }
    return true;
  }

  static issueGatherSetOrder(troops, tasksOrNodes = []) {
    const selection = this.getSelectionProfile(troops);
    if (!selection.allForagers || !tasksOrNodes.length) return false;

    const nodeKeys = [];
    const unique = new Set();
    for (const entry of tasksOrNodes) {
      const task = blockResourceManager.ensureTaskForNode(entry, {
        queue: false,
        teamNumber: 1,
      });
      const key = this._taskKey(task);
      if (!task || !key || unique.has(key)) continue;
      unique.add(key);
      nodeKeys.push(key);
    }
    if (!nodeKeys.length) return false;

    const orderId = this._nextId();
    for (const troop of selection.troops) {
      this._replaceTroopOrder(troop, {
        id: orderId,
        kind: ORDER_KINDS.GATHER_SET,
        status: "active",
        source: "player",
        nodeKeys: [...nodeKeys],
        persistent: true,
      });
    }

    const tasks = this._collectTasksFromKeys(nodeKeys, 1);
    for (const task of tasks) {
      task.directOrderId = orderId;
      task.workerCapacity = task.workerCapacity ?? 1;
    }

    for (const troop of selection.troops) {
      this.stepUnit(troop);
    }
    return true;
  }

  static issueWorkQueuedOrder(troops, teamNumber = 1) {
    const queued = (Teams.teamLists?.[`${teamNumber}`]?.foragerQueue || [])
      .filter(task => (task?.forageType === "block" || task?.forageType === "seed") && !task.directOrderId);
    if (!queued.length) return false;
    return this.issueGatherSetOrder(troops, queued);
  }

  static issueMakeWaterOrder(troops) {
    const selection = this.getSelectionProfile(troops);
    if (!selection.allFiremen) return false;

    const orderId = this._nextId();
    for (const troop of selection.troops) {
      this._replaceTroopOrder(troop, {
        id: orderId,
        kind: ORDER_KINDS.MAKE_WATER,
        status: "active",
        source: "player",
        persistent: true,
      });
    }

    for (const troop of selection.troops) {
      this.stepUnit(troop);
    }
    return true;
  }

  static issueFillOvensOrder(troops) {
    const selection = this.getSelectionProfile(troops);
    if (!selection.allFiremen) return false;

    const orderId = this._nextId();
    for (const troop of selection.troops) {
      this._replaceTroopOrder(troop, {
        id: orderId,
        kind: ORDER_KINDS.FILL_OVENS,
        status: "active",
        source: "player",
        persistent: true,
      });
    }

    for (const troop of selection.troops) {
      this.stepUnit(troop);
    }
    return true;
  }

  static issueRefuelOvensOrder(troops) {
    const selection = this.getSelectionProfile(troops);
    if (!selection.allFiremen) return false;

    const orderId = this._nextId();
    for (const troop of selection.troops) {
      this._replaceTroopOrder(troop, {
        id: orderId,
        kind: ORDER_KINDS.REFUEL_OVENS,
        status: "active",
        source: "player",
        persistent: true,
      });
    }

    for (const troop of selection.troops) {
      this.stepUnit(troop);
    }
    return true;
  }

  static sendTroopsToTown(troops) {
    const selection = this.getSelectionProfile(troops);
    if (!selection.hasSelection) return false;
    this.clearPendingGatherPlacement();

    for (const troop of selection.troops) {
      this._clearTroopOrder(troop, { interrupt: true, targetState: CONTROL_STATES.TRACK_MODE });
      Teams.sendTroopToTown(troop);
    }
    return true;
  }

  static cancelOrders(troops) {
    const selection = this.getSelectionProfile(troops);
    if (!selection.hasSelection) return false;
    this.clearPendingGatherPlacement();

    for (const troop of selection.troops) {
      this._clearTroopOrder(troop, { interrupt: true, targetState: CONTROL_STATES.TRACK_MODE });
    }
    return true;
  }

  static resumeAuto(troops) {
    const selection = this.getSelectionProfile(troops);
    if (!selection.hasSelection) return false;
    this.clearPendingGatherPlacement();

    for (const troop of selection.troops) {
      this._clearTroopOrder(troop, { interrupt: true, targetState: CONTROL_STATES.TRACK_MODE });
    }

    for (const troop of selection.troops) {
      if (!troop?.active) continue;
      if (troop.body?.team === 1 && Player._isFighterUnit?.(troop)) {
        Player.updateTracking?.(troop);
        continue;
      }
      Scheduler.stepUnit(troop);
    }
    return true;
  }

  static toggleSleepTroops(troops) {
    const selection = this.getSelectionProfile(troops);
    if (!selection.hasSelection) return { ok: false, mode: "sleep", changed: 0, failed: 0 };
    this.clearPendingGatherPlacement();

    if (selection.allSleepingLike) {
      let changed = 0;
      for (const troop of selection.troops) {
        this._clearTroopOrder(troop, { interrupt: false, targetState: CONTROL_STATES.TRACK_MODE });
        if (troop.state === CONTROL_STATES.SLEEP_MODE) {
          StaminaManager.wakeUp(troop);
          changed += 1;
          continue;
        }
        if (troop.state === CONTROL_STATES.GO_HOME_MODE) {
          troop.task = null;
          troop.currentPath = [];
          troop.body?.setVelocity?.(0, 0);
          Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
          changed += 1;
        }
      }
      return { ok: changed > 0, mode: "wake", changed, failed: 0 };
    }

    let changed = 0;
    let failed = 0;
    for (const troop of selection.troops) {
      this._clearTroopOrder(troop, { interrupt: true, targetState: CONTROL_STATES.TRACK_MODE });
      StaminaManager.sendTroopHome(troop);
      if (troop.state === CONTROL_STATES.GO_HOME_MODE) changed += 1;
      else failed += 1;
    }
    return { ok: changed > 0, mode: "sleep", changed, failed };
  }

  static sellTroops(troops, scene = null, opts = {}) {
    const selection = this.getSelectionProfile(troops);
    if (!selection.hasSelection) return { ok: false, sold: 0, money: 0 };

    const toSell = [...selection.troops];
    const money = toSell.reduce((sum, troop) => sum + this.getTroopSellValue(troop), 0);
    const uiScene = scene ?? Player.scene?.uiScene ?? Player.scene;
    const sourceTroop = toSell[0] || null;

    Player.clearSelection?.();
    if (money > 0 && typeof uiScene?.updateMoney === "function") {
      uiScene.updateMoney(money, {
        sourceUiTarget: opts?.sourceUiTarget ?? null,
        sourceWorldX: Number(sourceTroop?.x),
        sourceWorldY: Number(sourceTroop?.y),
      });
    }

    for (const troop of toSell) {
      this._clearTroopOrder(troop, { interrupt: true, targetState: CONTROL_STATES.TRACK_MODE });
      Player.destroyPlayer(troop);
    }

    uiScene?.playerTab?.clearDetails?.();
    uiScene?.playerTab?.rebuildList?.();
    return { ok: true, sold: toSell.length, money };
  }

  static disperseBerries(troops, scene = null) {
    const selection = this.getSelectionProfile(troops);
    if (!selection.hasSelection) {
      return { ok: false, reason: "no_selection", required: 0, available: 0 };
    }

    const uiScene = scene ?? Player.scene?.uiScene ?? Player.scene;
    const required = selection.count;
    const available = Number(uiScene?.berries ?? 0);
    if (available < required) {
      return { ok: false, reason: "insufficient", required, available };
    }

    const teamNumber = selection.troops[0]?.body?.team ?? 1;
    const consumed = StorageManager.consumeItemFromStorage(teamNumber, UI_ITEM_TYPES.seedBerry, required);
    if (consumed < required) {
      if (consumed > 0) {
        uiScene?.updateBerry?.(-consumed);
      }
      return {
        ok: false,
        reason: "insufficient",
        required,
        available: Math.max(0, available - consumed),
      };
    }

    uiScene?.updateBerry?.(-consumed);

    for (const troop of selection.troops) {
      troop.health = Math.min(troop.maxHealth ?? troop.health, troop.health + this.BERRY_HEAL_AMOUNT);
      troop.stamina = Math.min(troop.maxStamina ?? troop.stamina, (troop.stamina ?? 0) + this.BERRY_STAMINA_AMOUNT);
      Player.showMiniBarsOnHit?.(troop);
    }

    return {
      ok: true,
      fed: consumed,
      healAmount: this.BERRY_HEAL_AMOUNT,
      staminaAmount: this.BERRY_STAMINA_AMOUNT,
      required,
      available: Math.max(0, available - consumed),
    };
  }

  static issueDefendTownOrder(troops) {
    return false;
  }

  static ensureCombatAutoOrder(troop) {
    if (!troop?.active) return false;
    if (
      troop.currentOrder?.kind === ORDER_KINDS.DEFEND_TOWN ||
      troop.currentOrder?.kind === ORDER_KINDS.HOLD_POSITION
    ) {
      this._clearTroopOrder(troop, { interrupt: true, targetState: CONTROL_STATES.TRACK_MODE });
    }
    return false;
  }

  static issueHoldOrder(troops) {
    return false;
  }

  static issueAttackFortOrder(troops) {
    const selection = this.getSelectionProfile(troops);
    if (!selection.allCombatants) return false;

    const teamNumber = selection.troops[0]?.body?.team ?? 1;
    const team = Teams.teamLists?.[`${teamNumber}`];
    if (!team) return false;
    if (!Array.isArray(team.destroyStates)) team.destroyStates = [];

    const eligibleTroopIds = selection.troops.map(troop => troop.id);
    const fortTasks = this._queueFortDestroyTasks(teamNumber, eligibleTroopIds);
    if (!fortTasks.length) return false;

    for (const troop of selection.troops) {
      this._clearTroopOrder(troop, { interrupt: true, targetState: CONTROL_STATES.TRACK_MODE });
    }

    buildingManager.assingTroopsToDestroy(teamNumber);
    return true;
  }

  static handleTroopDestroyed(troop) {
    const orderId = troop?.currentOrder?.id;
    if (!orderId) return;
    this._releaseManagedGatherTarget(troop.currentOrder, troop);
    troop.currentOrder = null;
    this._cleanupOrderReservations(orderId);
  }

  static stepUnit(troop) {
    const order = troop?.currentOrder;
    if (!troop?.active) return false;
    if (!order || order.status !== "active") {
      return this._tryRecoverOrderlessCarry(troop);
    }

    if (order.kind === ORDER_KINDS.DEFEND_TOWN || order.kind === ORDER_KINDS.HOLD_POSITION) {
      this._clearTroopOrder(troop, { interrupt: false, targetState: CONTROL_STATES.TRACK_MODE });
      return false;
    }

    if (
      order.kind === ORDER_KINDS.MAKE_WATER ||
      order.kind === ORDER_KINDS.FILL_OVENS ||
      order.kind === ORDER_KINDS.REFUEL_OVENS
    ) {
      return this._stepFiremanOrder(troop, order);
    }

    if (!isGatherOrder(order) || !troop.isForager) return false;

    if (troop.task || troop.timer) return true;
    if (troop._returnSwimActive === true) return true;
    if (troop.state === CONTROL_STATES.BACK_TO_TOWN) {
      if (troop.currentPath?.length) return true;
      Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
    }
    if (troop.currentPath?.length) return true;

    if (
      troop.state === CONTROL_STATES.SEED_MODE ||
      troop.state === CONTROL_STATES.GET_BLOCK_RESOURCE ||
      troop.state === CONTROL_STATES.SEND_TO_STORAGE ||
      troop.state === CONTROL_STATES.GET_FROM_STORAGE
    ) {
      return true;
    }

    if (order.kind === ORDER_KINDS.GATHER_TYPE && !this.isGatherCommandAvailable(order.resourceType, troop.scene ?? Player.scene)) {
      return this._retireUnavailableGatherOrder(troop);
    }

    if (StorageManager.isCarrying(troop)) {
      StorageManager.tryCreateStorageDeliveryTask(troop);
      return true;
    }

    if (order.shuttingDown) {
      if (this._parkGatherTroopInTown(troop)) {
        return true;
      }
      this._finishGatherOrder(troop);
      return false;
    }

    const candidates = this._resolveGatherCandidates(order, troop.body.team);
    if (!candidates.length) {
      if (order.kind === ORDER_KINDS.GATHER_TYPE) {
        return this._retireUnavailableGatherOrder(troop);
      }
      this._parkGatherTroopInTown(troop);
      this._finishGatherOrder(troop);
      return false;
    }

    const available = candidates
      .filter(task => this._taskAssignedCount(task) < this._taskWorkerCapacity(task))
      .sort((a, b) => {
        const townDelta = this._taskTownPriority(a, troop.body.team) - this._taskTownPriority(b, troop.body.team);
        if (townDelta !== 0) return townDelta;
        return this._taskDistanceToTroop(troop, a) - this._taskDistanceToTroop(troop, b);
      });

    if (!available.length) {
      if (order.kind === ORDER_KINDS.GATHER_TYPE) {
        this._parkGatherTroopInTown(troop);
        return true;
      }
      if (this._orderHasBusyTroops(order.id, troop.id)) {
        this._parkGatherTroopInTown(troop);
        return true;
      }
      this._parkGatherTroopInTown(troop);
      this._finishGatherOrder(troop);
      return false;
    }

    for (const task of available) {
      task.directOrderId = order.id;
      task.workerCapacity = task.workerCapacity ?? 1;
      const state = task?.forageType === "seed" ? CONTROL_STATES.SEED_MODE : CONTROL_STATES.GET_BLOCK_RESOURCE;
      const assigned = Manager.assignTaskToTroop(troop, task, state);
      if (assigned) return true;
    }

    if (this._orderHasBusyTroops(order.id, troop.id)) {
      this._parkGatherTroopInTown(troop);
      return true;
    }
    this._parkGatherTroopInTown(troop);
    this._finishGatherOrder(troop);
    return false;
  }

  static _tryRecoverOrderlessCarry(troop) {
    if (!troop?.active || troop.task || troop.timer || troop.currentPath?.length) return false;
    if (!StorageManager.isCarrying(troop)) return false;

    if (troop.isFireman) {
      return this._tryRecoverFiremanCarry(troop);
    }

    if (troop.isForager) {
      return StorageManager.tryCreateStorageDeliveryTask(troop);
    }

    return false;
  }

  static _replaceTroopOrder(troop, order) {
    this._clearTroopOrder(troop, { interrupt: true, targetState: CONTROL_STATES.TRACK_MODE });
    troop.currentOrder = order;
    troop.roam = false;
  }

  static getTroopSellValue(troop) {
    return getBalancedTroopSellValue(troop, Player.scene);
  }

  static _clearTroopOrder(troop, { interrupt = false, targetState = CONTROL_STATES.TRACK_MODE } = {}) {
    if (!troop?.active) return;
    const oldOrder = troop.currentOrder;
    const orderId = oldOrder?.id;
    this._releaseManagedGatherTarget(oldOrder, troop);
    if (interrupt && (
      troop.task ||
      troop.currentPath?.length ||
      troop.timer ||
      StorageManager.isCarrying(troop) ||
      troop.pendingFuelJob ||
      troop.pendingOvenJob ||
      troop.deferredCarry
    )) {
      InterruptController.interruptTroop(troop, "direct_order_clear", targetState);
    }
    troop.currentOrder = null;
    if (oldOrder?.kind === ORDER_KINDS.DEFEND_TOWN || oldOrder?.kind === ORDER_KINDS.HOLD_POSITION) {
      troop.guardCenter = null;
      troop.guardRadius = null;
      troop.forcedTarget = null;
      troop.track = null;
      CombatSpacingCoordinator.clearTroopFocus(troop);
      if (troop.currentPath) troop.currentPath.length = 0;
      troop.body?.setVelocity?.(0, 0);
    }
    if (orderId) this._cleanupOrderReservations(orderId);
  }

  static _releaseManagedGatherTarget(order, troop) {
    if (!order || order.source !== "function_tab") return false;
    if (order.kind !== ORDER_KINDS.GATHER_TYPE || order.shuttingDown) return false;
    const resourceType = order.resourceType;
    const automation = Teams.ensureTownAutomation?.(troop?.body?.team ?? 1);
    const targets = automation?.gatherTargets;
    if (!targets || !Object.prototype.hasOwnProperty.call(targets, resourceType)) return false;

    const current = Math.max(0, Number(targets[resourceType] || 0));
    if (current <= 0) return false;
    targets[resourceType] = Math.max(0, current - 1);

    const total = Object.values(targets).reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0);
    if (total <= 0) automation.gatherEnabled = false;

    this._refreshFunctionTabForTroop(troop);
    return true;
  }

  static _refreshFunctionTabForTroop(troop) {
    const scene = troop?.scene ?? Player.scene;
    const candidates = new Set([
      scene,
      scene?.uiScene,
      scene?.scene?.get?.("GameUIScene"),
      Player.scene,
      Player.scene?.uiScene,
      Player.scene?.scene?.get?.("GameUIScene"),
    ]);

    candidates.forEach((candidate) => {
      candidate?.functionTab?.updateVisuals?.();
    });
  }

  static _finishGatherOrder(troop, { targetState = CONTROL_STATES.TRACK_MODE } = {}) {
    const orderId = troop?.currentOrder?.id;
    const oldOrder = troop?.currentOrder;
    troop.currentOrder = null;
    troop.roam = false;
    if (troop?.active && targetState != null) {
      Teams.movePlayerState(troop, targetState);
    }
    if (orderId) this._cleanupOrderReservations(orderId);
    if (oldOrder?.source === "function_tab") {
      this._refreshFunctionTabForTroop(troop);
    }
  }

  static _retireUnavailableGatherOrder(troop) {
    if (!troop?.active) return false;
    const wasCarrying = StorageManager.isCarrying(troop);

    this._finishGatherOrder(troop);

    if (wasCarrying && StorageManager.tryCreateStorageDeliveryTask(troop)) {
      return true;
    }

    return this._parkGatherTroopInTown(troop);
  }

  static _parkGatherTroopInTown(troop) {
    if (!troop?.active) return false;

    const shouldRetreat = !!(Teams.farFromCenter?.(troop) || Player._isOnWater?.(troop));
    if (!shouldRetreat) {
      Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
      troop.roam = false;
      troop.play?.(troop.idle);
      return false;
    }

    troop.roam = false;
    troop.currentPath?.splice?.(0);
    troop.finalPos = null;
    troop.body?.setVelocity?.(0, 0);
    const path = Teams.sendTroopToTown(troop);
    if (!path?.length) {
      const onBlockedTile = Player._worldTileIsWalkableForTroop
        ? !Player._worldTileIsWalkableForTroop(troop, troop.x, troop.y)
        : false;
      if (onBlockedTile || Player._isOnWater?.(troop)) {
        Teams.movePlayerState(troop, CONTROL_STATES.BACK_TO_TOWN);
        troop.play?.(troop.idle);
        return true;
      }

      Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
      troop.play?.(troop.idle);
      return false;
    }
    return true;
  }

  static _cleanupOrderReservations(orderId) {
    if (!orderId) return;
    const stillInUse = Player.troops.some(
      troop => troop?.active && troop.currentOrder?.id === orderId
    );
    if (stillInUse) return;

    for (const task of this._allKnownResourceTasks(1)) {
      if (task?.directOrderId !== orderId) continue;
      task.directOrderId = null;

      if (task._ephemeralDirect && this._taskAssignedCount(task) <= 0) {
        task.value?.stopFlash?.();
        if (task.value?.task === task) {
          task.value.task = null;
        }
      }
    }

    this._cleanupDirectOvenJobs(orderId, 1);
    Teams.clearTownWaterBatch?.(1, orderId);
  }

  static _getTownCenterWorld(teamNumber = 1) {
    return Teams.getTownCenterRoadWorld?.(teamNumber) || null;
  }

  static _stepDefendTownOrder(troop, order) {
    const townCenter = order.anchor || this._getTownCenterWorld(troop.body?.team ?? 1);
    if (!townCenter) return false;

    const threat = this._findDefendTownThreat(troop, townCenter);
    if (threat) {
      return this._trackCombatTarget(troop, threat);
    }

    this._clearCombatTargeting(troop);
    if (!troop.guardCenter) {
      Player.setGuardPost(
        troop,
        townCenter.x,
        townCenter.y,
        this.DEFEND_TOWN_RADIUS_TILES * SQUARESIZE
      );
      return true;
    }

    if (!troop.task && !troop.track && troop.state === CONTROL_STATES.TRACK_MODE && !troop.roam) {
      Player.roam(troop);
    }
    return true;
  }

  static _stepHoldOrder(troop, order) {
    const anchor = order.anchor || troop.guardCenter || { x: troop.x, y: troop.y };
    const threat = this._findHoldThreat(troop, anchor);
    if (threat) {
      return this._trackCombatTarget(troop, threat);
    }

    this._clearCombatTargeting(troop);
    if (!troop.guardCenter) {
      Player.setGuardPost(
        troop,
        anchor.x,
        anchor.y,
        this.HOLD_RADIUS_TILES * SQUARESIZE
      );
      return true;
    }

    if (!troop.task && !troop.track && troop.state === CONTROL_STATES.TRACK_MODE && !troop.roam) {
      Player.roam(troop);
    }
    return true;
  }

  static _findDefendTownThreat(troop, townCenter) {
    const regionSystem = Map.regionSystem;
    const enemies = Teams.teamLists?.["0"]?.playerList || [];
    const currentTarget = troop.forcedTarget || troop.track?.[0]?.gameObject || null;
    const canReachThreat = (enemy) => {
      if (!enemy?.active) return false;
      if (!enemy.body || enemy.body.team === troop.body?.team) return false;
      if (Player._canReachWorldForTroop?.(troop, enemy.x, enemy.y)) return true;
      if (!regionSystem?.canReachWorldToWorld) return true;

      const townPoint = Player._regionCheckPointForTroop?.(troop, townCenter.x, townCenter.y);
      const enemyPoint = Player._regionCheckPointForTroop?.(troop, enemy.x, enemy.y);
      if (!townPoint || !enemyPoint) return false;

      return (
        regionSystem.canReachWorldToWorld(townPoint.x, townPoint.y, enemyPoint.x, enemyPoint.y)
      );
    };

    return CombatSpacingCoordinator.chooseBestEnemyTarget(
      troop,
      enemies.filter(enemy => canReachThreat(enemy)),
      {
        anchor: townCenter,
        currentTarget,
        priorityFn: (enemy) => this._combatThreatPriority(enemy, townCenter),
        assignmentPriorityFn: (enemy) => this._defendTownCoveragePriority(troop, enemy, currentTarget),
        strictTargetSpread: true,
      }
    );
  }

  static _findHoldThreat(troop, anchor) {
    const maxRange = Math.max(
      Number(troop?.weapon?.range || 0),
      this.HOLD_RADIUS_TILES * SQUARESIZE * 2
    );
    const enemies = Teams.teamLists?.["0"]?.playerList || [];
    return CombatSpacingCoordinator.chooseBestEnemyTarget(
      troop,
      enemies
        .filter(enemy => enemy?.active)
        .filter(enemy => Phaser.Math.Distance.Between(anchor.x, anchor.y, enemy.x, enemy.y) <= maxRange),
      {
        anchor,
        currentTarget: troop.forcedTarget || troop.track?.[0]?.gameObject || null,
        strictTargetSpread: true,
      }
    );
  }

  static _resolveFriendlyTarget(enemy) {
    const forcedTarget = enemy?.forcedTarget;
    if (forcedTarget?.active && forcedTarget?.body?.team === 1) return forcedTarget;
    const tracked = enemy?.track?.[0]?.gameObject;
    if (tracked?.active && tracked?.body?.team === 1) return tracked;
    return null;
  }

  static _combatThreatPriority(enemy, townCenter = null) {
    const pressuredFriendly = this._resolveFriendlyTarget(enemy);
    if (pressuredFriendly) {
      return Player._isFighterUnit?.(pressuredFriendly) ? 1 : 0;
    }

    const breakingTown =
      enemy?.state === CONTROL_STATES.DESTROY_MODE ||
      enemy?.state === CONTROL_STATES.DESTROY_MODE_T ||
      enemy?.state === CONTROL_STATES.SIEGE_MODE;
    if (breakingTown) return 2;

    if (townCenter) {
      const distanceToTown = Phaser.Math.Distance.Between(townCenter.x, townCenter.y, enemy.x, enemy.y);
      if (distanceToTown <= SQUARESIZE * 10) return 3;
    }

    return 4;
  }

  static _defendTownCoveragePriority(troop, enemy, currentTarget = null) {
    if (!troop?.active || !enemy?.active) return 1;

    const teamNumber = troop.body?.team ?? 1;
    const counts = CombatSpacingCoordinator.getTargetAssignmentCounts(teamNumber, enemy);
    let accountedFor = Number(counts?.total ?? 0);

    if (enemy === currentTarget) {
      accountedFor = Math.max(0, accountedFor - 1);
    }

    return accountedFor > 0 ? 1 : 0;
  }

  static _trackCombatTarget(troop, target) {
    if (!troop?.active || !target?.active) return false;
    const targetBody = target.body;
    if (!targetBody) return false;

    troop.forcedTarget = target;
    troop.roam = false;

    const movedTile = Player._syncTrackToTarget(troop, target);
    if (troop.state !== CONTROL_STATES.ATTACK_MODE) {
      Teams.movePlayerState(troop, CONTROL_STATES.TRACK_TARGET);
    }

    if (Player._isAttackReady?.(troop, target)) {
      troop.currentPath?.splice?.(0);
      troop.body?.setVelocity?.(0, 0);
      return true;
    }

    if (troop.isGunslinger) {
      const kiteDest = Player.computeKiteDestination?.(troop, target, troop.weapon);
      if (kiteDest) {
        const kitePath = Player.pathTo(troop, kiteDest.x, kiteDest.y, false);
        if (kitePath?.length) {
          Player.moveTo(troop, kitePath);
          return true;
        }
      }
    }

    Player._chaseOrBreachTarget?.(troop, target, movedTile || !troop.currentPath?.length);
    return true;
  }

  static _clearCombatTargeting(troop) {
    Player.resetRoamState?.(troop);
    troop.forcedTarget = null;
    troop.track = null;
    CombatSpacingCoordinator.clearTroopFocus(troop);
    if (troop.currentPath) troop.currentPath.length = 0;
    troop.body?.setVelocity?.(0, 0);
    if (troop.state === CONTROL_STATES.TRACK_TARGET) {
      Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
    }
  }

  static _queueFortDestroyTasks(teamNumber, eligibleTroopIds = []) {
    const towers = [...(StageState?._fortTowers || [])]
      .filter(tower => tower?.sprite?.active && !tower?.sprite?._destroyed);
    const queued = [];

    for (const tower of towers) {
      const existing = Teams.teamLists?.[`${teamNumber}`]?.destroyStates?.find(task =>
        task?.x === tower.x &&
        task?.y === tower.y &&
        task?.value === tower.sprite
      );

      if (existing) {
        if (eligibleTroopIds.length) {
          existing.eligibleTroopIds = [...new Set([...(existing.eligibleTroopIds || []), ...eligibleTroopIds])];
        }
        queued.push(existing);
        continue;
      }

      const task = {
        x: tower.x,
        y: tower.y,
        duration: tower.health ?? tower.maxHealth ?? 600,
        totalDuration: tower.maxHealth ?? tower.health ?? 600,
        type: tower.tileType,
        value: tower.sprite,
        assigned: 0,
        eligibleTroopIds: [...eligibleTroopIds],
      };
      Teams.addToStateArrayIfNotExists(teamNumber, "destroyStates", task);
      queued.push(task);
    }

    return queued;
  }

  static _resolveGatherCandidates(order, teamNumber) {
    if (!isGatherOrder(order)) return [];

    if (order.kind === ORDER_KINDS.GATHER_TYPE) {
      return this._collectTasksForResourceType(order.resourceType, teamNumber).filter(task => this._taskUsable(task));
    }

    if (order.kind === ORDER_KINDS.GATHER_SET) {
      return this._collectTasksFromKeys(order.nodeKeys || [], teamNumber).filter(task => this._taskUsable(task));
    }

    const nodes = this._nodesForArea(order);
    const tasks = [];
    for (const node of nodes) {
      const task = blockResourceManager.ensureTaskForNode(node, {
        queue: false,
        teamNumber,
        directOrderId: order.id,
      });
      if (!task) continue;
      tasks.push(task);
    }
    return tasks.filter(task => this._taskUsable(task));
  }

  static _collectTasksForResourceType(resourceType, teamNumber) {
    const nodes = this._resourceNodesForType(resourceType);
    const tasks = [];
    for (const node of nodes) {
      if (!this._nodeActive(node)) continue;
      if (resourceType && this._nodeResourceKind(node) !== resourceType) continue;
      const task = blockResourceManager.ensureTaskForNode(node, {
        queue: false,
        teamNumber,
      });
      if (task) tasks.push(task);
    }
    return tasks;
  }

  static _collectTasksFromKeys(nodeKeys, teamNumber) {
    const desired = new Set(nodeKeys);
    const tasks = [];
    for (const task of this._allKnownResourceTasks(teamNumber)) {
      const key = this._taskKey(task);
      if (!desired.has(key)) continue;
      tasks.push(task);
    }

    if (tasks.length === desired.size) return tasks;

    const nodes = this._allResourceNodes();
    for (const node of nodes) {
      const key = this._nodeKey(node);
      if (!desired.has(key)) continue;
      const task = blockResourceManager.ensureTaskForNode(node, {
        queue: false,
        teamNumber,
      });
      if (task && !tasks.includes(task)) tasks.push(task);
    }
    return tasks;
  }

  static _nodesForArea(order) {
    const nodes = this._resourceNodesForType(order.resourceType);
    const radiusPx = (order.radiusTiles ?? this.DEFAULT_AREA_RADIUS_TILES) * SQUARESIZE;
    const radiusSq = radiusPx * radiusPx;
    const center = order.center || { x: 0, y: 0 };

    return nodes.filter(node => {
      if (!this._nodeActive(node)) return false;
      if (order.resourceType && this._nodeResourceKind(node) !== order.resourceType) return false;
      const { x, y } = this._nodeWorldCenter(node);
      const dx = x - center.x;
      const dy = y - center.y;
      return (dx * dx + dy * dy) <= radiusSq;
    });
  }

  static _allKnownResourceTasks(teamNumber) {
    const tasks = [];
    const seen = new Set();

    for (const queued of Teams.teamLists?.[`${teamNumber}`]?.foragerQueue || []) {
      if (queued?.forageType !== "block" && queued?.forageType !== "seed") continue;
      if (seen.has(queued)) continue;
      seen.add(queued);
      tasks.push(queued);
    }

    for (const node of this._allResourceNodes()) {
      const task = node?.task;
      if (!task || seen.has(task)) continue;
      seen.add(task);
      tasks.push(task);
    }

    return tasks;
  }

  static _allResourceNodes() {
    return [
      ...(Map.worldPines || []),
      ...(Map.worldStones || []),
      ...(Map.worldSeedBushes || []),
      ...(Map.worldBerryBushes || []),
    ];
  }

  static _orderHasBusyTroops(orderId, excludeTroopId = null) {
    return Player.troops.some(troop => {
      if (!troop?.active || troop.id === excludeTroopId) return false;
      if (troop.currentOrder?.id !== orderId) return false;
      return !!(
        troop.task ||
        troop.timer ||
        StorageManager.isCarrying(troop) ||
        troop.currentPath?.length ||
        troop.state === CONTROL_STATES.SEED_MODE ||
        troop.state === CONTROL_STATES.GET_BLOCK_RESOURCE ||
        troop.state === CONTROL_STATES.SEND_TO_STORAGE ||
        troop.state === CONTROL_STATES.GET_FROM_STORAGE
      );
    });
  }

  static _taskUsable(task) {
    if (!task || (task.forageType !== "block" && task.forageType !== "seed")) return false;
    if (!task.value) return false;
    if (typeof task.remaining === "number" && task.remaining <= 0) return false;
    if (!this._nodeActive(task.value)) return false;
    return true;
  }

  static _taskDistanceToTroop(troop, task) {
    const { x, y } = this._taskWorldCenter(task);
    return Math.hypot(troop.x - x, troop.y - y);
  }

  static _taskTownPriority(task, teamNumber) {
    const team = Teams.teamLists?.[`${teamNumber}`];
    const center = team?.center;
    if (!Array.isArray(center) || center.length < 2) return 0;
    return Math.hypot((task.x ?? 0) - center[0], (task.y ?? 0) - center[1]);
  }

  static _taskWorldCenter(task) {
    if (task?.value) return this._nodeWorldCenter(task.value);
    return {
      x: (task.x + 0.5) * SQUARESIZE,
      y: (task.y + 0.5) * SQUARESIZE,
    };
  }

  static _taskAssignedCount(task) {
    return Number(task?.assigned || 0);
  }

  static _taskWorkerCapacity(task) {
    return Math.max(1, Number(task?.workerCapacity || 1));
  }

  static _stepFiremanOrder(troop, order) {
    if (!troop?.isFireman) return false;
    if (troop.task || troop.timer) return true;
    if (troop._returnSwimActive === true) return true;
    if (troop.currentPath?.length) return true;
    if (
      troop.state === CONTROL_STATES.GET_FROM_STORAGE ||
      troop.state === CONTROL_STATES.GET_WATER_MODE ||
      troop.state === CONTROL_STATES.SEND_TO_OVEN ||
      troop.state === CONTROL_STATES.SEND_TO_STORAGE
    ) {
      return true;
    }

    if (this._tryRecoverFiremanCarry(troop)) {
      return true;
    }

    if (order.shuttingDown) {
      if (this._parkGatherTroopInTown(troop)) {
        return true;
      }
      this._clearTroopOrder(troop, { interrupt: false, targetState: CONTROL_STATES.TRACK_MODE });
      return false;
    }

    if (order.kind === ORDER_KINDS.MAKE_WATER) {
      if (this._tryAssignMakeWaterPickup(troop, order)) {
        return true;
      }

      const nextAction = this._selectMakeWaterAction(troop, order);
      if (!nextAction) {
        this._parkGatherTroopInTown(troop);
        return true;
      }

      if (nextAction.type === "fuel") {
        if (troop.type?.assignFromOvenFuelJobs?.(troop, { oven: nextAction.oven, order })) return true;
        if (this._createMakeWaterFuelJob(nextAction.oven, order, troop.body?.team ?? 1)) {
          return troop.type?.assignFromOvenFuelJobs?.(troop, { oven: nextAction.oven, order }) || true;
        }
        this._parkGatherTroopInTown(troop);
        return true;
      }

      if (troop.type?.assignFromOvenJobs?.(troop, { oven: nextAction.oven, order })) return true;
      if (this._createMakeWaterFillJob(nextAction.oven, order, troop.body?.team ?? 1)) {
        return troop.type?.assignFromOvenJobs?.(troop, { oven: nextAction.oven, order }) || true;
      }
      this._parkGatherTroopInTown(troop);
      return true;
    }

    if (order.kind === ORDER_KINDS.FILL_OVENS) {
      if (this._tryAssignMakeWaterPickup(troop, order)) {
        return true;
      }
      if (troop.type?.assignFromOvenJobs?.(troop, { order })) return true;
      if (this._createNextFillOvenJob(troop, order)) {
        return troop.type?.assignFromOvenJobs?.(troop, { order }) || true;
      }
      this._parkGatherTroopInTown(troop);
      return true;
    }

    if (order.kind === ORDER_KINDS.REFUEL_OVENS) {
      if (troop.type?.assignFromOvenFuelJobs?.(troop, { order })) return true;
      if (this._createNextRefuelOvenJob(troop, order)) {
        return troop.type?.assignFromOvenFuelJobs?.(troop, { order }) || true;
      }
      this._parkGatherTroopInTown(troop);
      return true;
    }

    return false;
  }

  static _tryRecoverFiremanCarry(troop) {
    if (!troop?.isFireman) return false;

    if (troop.carrying) {
      if (troop.pendingFuelJob && StorageManager.isCarryingItem(troop, UI_ITEM_TYPES.wood)) {
        return troop.type?.goRefuelOven?.(troop, troop.pendingFuelJob) || false;
      }
      if (troop.pendingOvenJob) {
        const job = troop.pendingOvenJob;
        if (troop.type?.maybeAssignOvenJobDelivery?.(troop, job, troop.carrying)) {
          return true;
        }
        if (job && Number(job.assigned || 0) > 0) {
          job.assigned = Math.max(0, Number(job.assigned || 0) - 1);
        }
        troop.pendingOvenJob = null;
        return StorageManager.tryCreateStorageDeliveryTask(troop) || false;
      }
    }

    if (troop.deferredCarry && troop.carrying) {
      const item = troop.deferredCarry.item ?? troop.carrying;
      if (troop.deferredCarry.pendingFuelJob && item?.name === UI_ITEM_TYPES.wood.name) {
        const ok = troop.type?.goRefuelOven?.(troop, troop.deferredCarry.pendingFuelJob);
        if (ok) {
          troop.deferredCarry = null;
          return true;
        }
      } else if (troop.deferredCarry.pendingOvenJob) {
        const ok = troop.type?.maybeAssignOvenJobDelivery?.(troop, troop.deferredCarry.pendingOvenJob, item);
        if (ok) {
          troop.deferredCarry = null;
          return true;
        }
      }
    }

    if (StorageManager.isCarrying(troop) && !troop.task) {
      return StorageManager.tryCreateStorageDeliveryTask(troop);
    }
    return false;
  }

  static _isManagedFunctionWaterOrder(order) {
    return order?.kind === ORDER_KINDS.MAKE_WATER && order?.source === "function_tab";
  }

  static _getManagedWaterUnitsStillNeeded(order, teamNumber = 1) {
    if (!this._isManagedFunctionWaterOrder(order)) return Number.POSITIVE_INFINITY;
    const automation = Teams.ensureTownAutomation?.(teamNumber);
    if (!automation || automation.waterOrderId !== order.id) return 0;
    return Math.max(
      0,
      Number(automation.waterRemainingCount || 0) - Number(automation.waterCommittedCount || 0)
    );
  }

  static _compareCandidateScores(a = [], b = []) {
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
      const aValue = Number(a[index] ?? 0);
      const bValue = Number(b[index] ?? 0);
      if (aValue === bValue) continue;
      return aValue - bValue;
    }
    return 0;
  }

  static _selectMakeWaterAction(troop, order = null) {
    const teamNumber = troop?.body?.team ?? 1;
    const team = Teams.teamLists?.[`${teamNumber}`];
    if (!team) return null;
    troop.type?.syncOvenJobAssignments?.(teamNumber);

    const maxPerBurner = ClayOven.getItemCapacityPerSlot();
    const unitsStillNeeded = this._getManagedWaterUnitsStillNeeded(order, teamNumber);
    const ovens = [...(team.ovenList || [])]
      .filter(oven => oven?.sprite?.active)
      .sort((a, b) => this._ovenDistanceToTroop(troop, a) - this._ovenDistanceToTroop(troop, b));

    let bestFuel = null;
    let bestFuelScore = null;
    let bestStarterWater = null;
    let bestStarterWaterScore = null;
    let bestWater = null;
    let bestWaterScore = null;

    for (const oven of ovens) {
      if (this._isOvenInputBlockedByOutput(oven, 0)) continue;

      const slot = oven.cookingSlots?.[0] || null;
      if (slot && slot.item?.name !== UI_ITEM_TYPES.unclean_water.name) continue;

      const inSlot = slot?.item?.name === UI_ITEM_TYPES.unclean_water.name ? Number(slot.amount || 0) : 0;
      const plannedWater = this._plannedWaterForOven(teamNumber, oven, 0);
      const totalWater = inSlot + plannedWater;

      const currentFuel = Number(oven?.fuel || 0);
      const plannedFuel = this._plannedFuelForOven(teamNumber, oven);
      const totalFuel = currentFuel + plannedFuel;
      const maxFuel = Number(oven?.maxFuel || 100);

      const fuelNeeded = Math.max(0, Math.min(maxFuel, totalWater) - totalFuel);
      const actualFuelNeeded = Math.max(0, Math.min(maxFuel, totalWater) - currentFuel);
      const hasAssignableFuelJob = actualFuelNeeded > 0 && this._hasAssignableOvenFuelJob(teamNumber, oven, order);
      if (fuelNeeded > 0 || hasAssignableFuelJob) {
        const fuelScore = [
          this._ovenDistanceToTroop(troop, oven),
          Number(currentFuel || 0),
          Number(inSlot || 0),
          Number(oven?.x || 0),
          Number(oven?.y || 0),
        ];
        if (!bestFuel || this._compareCandidateScores(fuelScore, bestFuelScore) < 0) {
          bestFuel = { type: "fuel", oven };
          bestFuelScore = fuelScore;
        }
      }

      const waterNeeded = Math.max(0, maxPerBurner - totalWater);
      const actualWaterNeeded = Math.max(0, maxPerBurner - inSlot);
      const hasAssignableWaterJob = actualWaterNeeded > 0 && this._hasAssignableOvenFillJob(teamNumber, oven, 0, order);
      if ((waterNeeded > 0 && unitsStillNeeded > 0) || hasAssignableWaterJob) {
        const waterScore = [
          slot ? 1 : 0,
          Number(totalWater || 0),
          this._ovenDistanceToTroop(troop, oven),
          Number(oven?.x || 0),
          Number(oven?.y || 0),
        ];
        if (totalWater <= 0) {
          if (!bestStarterWater || this._compareCandidateScores(waterScore, bestStarterWaterScore) < 0) {
            bestStarterWater = { type: "water", oven };
            bestStarterWaterScore = waterScore;
          }
        } else if (!bestWater || this._compareCandidateScores(waterScore, bestWaterScore) < 0) {
          bestWater = { type: "water", oven };
          bestWaterScore = waterScore;
        }
      }
    }

    return bestStarterWater || bestFuel || bestWater || null;
  }

  static _directOrderStillActive(orderId, teamNumber = 1) {
    if (orderId == null) return false;
    const team = Teams.teamLists?.[`${teamNumber}`] ?? Teams.teamLists?.[teamNumber];
    const players = Array.isArray(team?.playerList) ? team.playerList : Player.troops;
    return (players || []).some(troop =>
      troop?.active &&
      String(troop.body?.team) === String(teamNumber) &&
      troop.currentOrder?.id === orderId
    );
  }

  static _ovenJobMatchesOrder(job, order, teamNumber = 1) {
    if (!job) return false;
    const orderId = order?.id ?? null;
    if (orderId == null || job.directOrderId == null || job.directOrderId === orderId) return true;
    return !this._directOrderStillActive(job.directOrderId, teamNumber);
  }

  static _hasAssignableOvenFuelJob(teamNumber, oven, order = null) {
    const jobs = Teams.teamLists?.[`${teamNumber}`]?.ovenFuelJobs || [];
    return jobs.some(job =>
      job?.oven === oven &&
      !job.canceled &&
      job.oven?.sprite?.active &&
      this._ovenJobMatchesOrder(job, order, teamNumber) &&
      Number(job.remaining || 0) > Number(job.assigned || 0)
    );
  }

  static _hasAssignableOvenFillJob(teamNumber, oven, inputidx = 0, order = null) {
    const jobs = Teams.teamLists?.[`${teamNumber}`]?.ovenJobs || [];
    return jobs.some(job =>
      job?.oven === oven &&
      Number(job.inputidx ?? 0) === Number(inputidx ?? 0) &&
      job.item?.name === UI_ITEM_TYPES.unclean_water.name &&
      !job.canceled &&
      job.oven?.sprite?.active &&
      this._ovenJobMatchesOrder(job, order, teamNumber) &&
      Number(job.remaining || 0) > Number(job.assigned || 0)
    );
  }

  static _isOvenInputBlockedByOutput(oven, inputidx = 0) {
    const out = oven?.outputSlots?.[inputidx] || null;
    return !!(out?.item && Number(out.amount || 0) > 0);
  }

  static _tryAssignMakeWaterPickup(troop, order) {
    const teamNumber = troop?.body?.team ?? 1;
    const team = Teams.teamLists?.[`${teamNumber}`];
    if (!team) return false;
    if (!Teams.getStorageWithCapacity(teamNumber, UI_ITEM_TYPES.clean_water, 1)) {
      if (this._hasCleanWaterOvenOutput(team)) {
        Player.showStatusEmote?.(troop, "STORAGE FULL", {
          key: "water_storage_full",
          cooldownMs: 3200,
          fontSize: 12,
        });
      }
      return false;
    }

    const existingJobs = (team.ovenPickupJobs || [])
      .filter(job => job?.oven?.sprite?.active)
      .filter(job => Number(job.amount || 0) > Number(job.assigned || 0))
      .filter(job => job.outputidx === 0)
      .filter(job => job.oven?.outputSlots?.[job.outputidx]?.item?.name === UI_ITEM_TYPES.clean_water.name)
      .sort((a, b) => this._ovenDistanceToTroop(troop, a.oven) - this._ovenDistanceToTroop(troop, b.oven));

    for (const job of existingJobs) {
      if (this._isManagedFunctionWaterOrder(order) && job.directOrderId == null) {
        job.directOrderId = order.id;
      }
      if (Manager.assignOneTroopToAction(troop, [job], CONTROL_STATES.GET_FROM_OVEN)) {
        return true;
      }
    }

    const ovens = [...(team.ovenList || [])]
      .filter(oven => oven?.sprite?.active)
      .sort((a, b) => this._ovenDistanceToTroop(troop, a) - this._ovenDistanceToTroop(troop, b));

    for (const oven of ovens) {
      const out = oven.outputSlots?.[0];
      if (!out || out.item?.name !== UI_ITEM_TYPES.clean_water.name || Number(out.amount || 0) <= 0) continue;
      const job = this._createMakeWaterPickupJob(oven, order, teamNumber);
      if (!job) continue;
      if (Manager.assignOneTroopToAction(troop, [job], CONTROL_STATES.GET_FROM_OVEN)) {
        return true;
      }
      if (job.assigned <= 0) {
        Teams.removeFromStateArray(teamNumber, "ovenPickupJobs", job);
      }
    }

    return false;
  }

  static _hasCleanWaterOvenOutput(team) {
    return (team?.ovenList || []).some(oven => {
      if (!oven?.sprite?.active) return false;
      return (oven.outputSlots || []).some(slot =>
        slot?.item?.name === UI_ITEM_TYPES.clean_water.name &&
        Number(slot.amount || 0) > 0
      );
    });
  }

  static _createMakeWaterPickupJob(oven, order, teamNumber = 1) {
    const team = Teams.teamLists?.[`${teamNumber}`];
    if (!team || !oven?.sprite?.active) return null;
    const out = oven.outputSlots?.[0];
    if (!out || out.item?.name !== UI_ITEM_TYPES.clean_water.name || Number(out.amount || 0) <= 0) return null;

    const existing = (team.ovenPickupJobs || []).find(job =>
      job?.oven === oven &&
      job.outputidx === 0 &&
      job.taskType === "ovenPickup"
    );
    if (existing) {
      existing.amount = Math.max(Number(existing.amount || 0), Number(out.amount || 0));
      if (existing.directOrderId == null) existing.directOrderId = order.id;
      return existing;
    }

    const job = {
      oven,
      outputidx: 0,
      x: oven.x,
      y: oven.y,
      type: TILE_TYPES.clayOven,
      assigned: 0,
      amount: Number(out.amount || 0),
      taskType: "ovenPickup",
      directOrderId: order.id,
    };
    team.ovenPickupJobs.push(job);
    Player.scene?.events?.emit?.("oven:updated", oven);
    return job;
  }

  static _createMakeWaterFillJob(oven, order, teamNumber = 1) {
    const team = Teams.teamLists?.[`${teamNumber}`];
    if (!team || !oven?.sprite?.active) return null;
    if (this._isOvenInputBlockedByOutput(oven, 0)) return null;

    const slot = oven.cookingSlots?.[0] || null;
    if (slot && slot.item?.name !== UI_ITEM_TYPES.unclean_water.name) return null;

    const maxPerBurner = ClayOven.getItemCapacityPerSlot();
    const inSlot = slot?.item?.name === UI_ITEM_TYPES.unclean_water.name ? Number(slot.amount || 0) : 0;
    const planned = this._plannedWaterForOven(teamNumber, oven, 0);
    const missing = Math.max(0, maxPerBurner - inSlot - planned);
    if (missing <= 0) return null;

    const job = {
      oven,
      inputidx: 0,
      item: UI_ITEM_TYPES.unclean_water,
      target: 1,
      delivered: 0,
      remaining: 1,
      assigned: 0,
      canceled: false,
      directOrderId: order.id,
      x: oven.x,
      y: oven.y,
    };
    team.ovenJobs.push(job);
    if (this._isManagedFunctionWaterOrder(order)) {
      Teams.commitTownWaterUnits?.(teamNumber, order.id, 1);
    }
    Player.scene?.events?.emit?.("oven:updated", oven);
    return job;
  }

  static _createMakeWaterFuelJob(oven, order, teamNumber = 1) {
    const team = Teams.teamLists?.[`${teamNumber}`];
    if (!team || !oven?.sprite?.active) return null;
    if (this._isOvenInputBlockedByOutput(oven, 0)) return null;

    const slot = oven.cookingSlots?.[0] || null;
    if (slot && slot.item?.name !== UI_ITEM_TYPES.unclean_water.name) return null;

    const inSlot = slot?.item?.name === UI_ITEM_TYPES.unclean_water.name ? Number(slot.amount || 0) : 0;
    const plannedWater = this._plannedWaterForOven(teamNumber, oven, 0);
    const totalWater = inSlot + plannedWater;
    const plannedFuel = this._plannedFuelForOven(teamNumber, oven);
    const currentFuel = Number(oven?.fuel || 0);
    const maxFuel = Number(oven?.maxFuel || 100);
    const missing = Math.max(0, Math.min(maxFuel, totalWater) - currentFuel - plannedFuel);
    if (missing <= 0) return null;

    const job = {
      oven,
      target: 1,
      delivered: 0,
      remaining: 1,
      assigned: 0,
      canceled: false,
      directOrderId: order.id,
      x: oven.x,
      y: oven.y,
    };
    team.ovenFuelJobs.push(job);
    Player.scene?.events?.emit?.("oven:updated", oven);
    return job;
  }

  static _createNextFillOvenJob(troop, order) {
    const teamNumber = troop?.body?.team ?? 1;
    const team = Teams.teamLists?.[`${teamNumber}`];
    if (!team) return null;
    const ovens = [...(team?.ovenList || [])]
      .filter(oven => oven?.sprite?.active)
      .sort((a, b) => this._ovenDistanceToTroop(troop, a) - this._ovenDistanceToTroop(troop, b));

    const maxPerBurner = ClayOven.getItemCapacityPerSlot();
    for (const oven of ovens) {
      if (this._isOvenInputBlockedByOutput(oven, 0)) continue;

      const slot = oven.cookingSlots?.[0] || null;
      if (slot && slot.item?.name !== UI_ITEM_TYPES.unclean_water.name) continue;

      const inSlot = slot?.item?.name === UI_ITEM_TYPES.unclean_water.name ? Number(slot.amount || 0) : 0;
      const planned = this._plannedWaterForOven(teamNumber, oven, 0);
      const missing = Math.max(0, maxPerBurner - inSlot - planned);
      if (missing <= 0) continue;

      const job = {
        oven,
        inputidx: 0,
        item: UI_ITEM_TYPES.unclean_water,
        target: missing,
        delivered: 0,
        remaining: missing,
        assigned: 0,
        canceled: false,
        directOrderId: order.id,
        x: oven.x,
        y: oven.y,
      };
      team.ovenJobs.push(job);
      Player.scene?.events?.emit?.("oven:updated", oven);
      return job;
    }
    return null;
  }

  static _createNextRefuelOvenJob(troop, order) {
    const teamNumber = troop?.body?.team ?? 1;
    const team = Teams.teamLists?.[`${teamNumber}`];
    if (!team) return null;
    const ovens = [...(team?.ovenList || [])]
      .filter(oven => oven?.sprite?.active)
      .sort((a, b) => this._ovenDistanceToTroop(troop, a) - this._ovenDistanceToTroop(troop, b));

    for (const oven of ovens) {
      const maxFuel = Number(oven?.maxFuel || 100);
      const planned = this._plannedFuelForOven(teamNumber, oven);
      const missing = Math.max(0, maxFuel - Number(oven?.fuel || 0) - planned);
      if (missing <= 0) continue;

      const job = {
        oven,
        target: missing,
        delivered: 0,
        remaining: missing,
        assigned: 0,
        canceled: false,
        directOrderId: order.id,
        x: oven.x,
        y: oven.y,
      };
      team.ovenFuelJobs.push(job);
      Player.scene?.events?.emit?.("oven:updated", oven);
      return job;
    }
    return null;
  }

  static _plannedWaterForOven(teamNumber, oven, inputidx = 0) {
    const team = Teams.teamLists?.[`${teamNumber}`];
    const jobs = team?.ovenJobs || [];
    return jobs.reduce((sum, job) => {
      if (!job || job.canceled) return sum;
      if (job.oven !== oven || job.inputidx !== inputidx) return sum;
      if (job.item?.name !== UI_ITEM_TYPES.unclean_water.name) return sum;
      return sum + Math.max(0, Number(job.remaining || 0));
    }, 0);
  }

  static _plannedFuelForOven(teamNumber, oven) {
    const jobs = Teams.teamLists?.[`${teamNumber}`]?.ovenFuelJobs || [];
    return jobs.reduce((sum, job) => {
      if (!job || job.canceled || job.oven !== oven) return sum;
      return sum + Math.max(0, Number(job.remaining || 0));
    }, 0);
  }

  static _cleanupDirectOvenJobs(orderId, teamNumber = 1) {
    const team = Teams.teamLists?.[`${teamNumber}`];
    if (!team) return;

    const removedOvens = new Set();
    const pruneJobs = (arrayKey) => {
      const arr = team[arrayKey];
      if (!Array.isArray(arr)) return;
      for (let i = arr.length - 1; i >= 0; i -= 1) {
        const job = arr[i];
        if (job?.directOrderId !== orderId) continue;
        job.canceled = true;
        removedOvens.add(job.oven);
        arr.splice(i, 1);
      }
    };

    pruneJobs("ovenJobs");
    pruneJobs("ovenFuelJobs");

    const pruneTasks = (arrayKey) => {
      const arr = team[arrayKey];
      if (!Array.isArray(arr)) return;
      for (let i = arr.length - 1; i >= 0; i -= 1) {
        const task = arr[i];
        if (task?.directOrderId === orderId || task?.job?.directOrderId === orderId) {
          removedOvens.add(task.oven);
          arr.splice(i, 1);
        }
      }
    };

    pruneTasks("ovenDeliveryItems");
    pruneTasks("ovenFuelDeliveryItems");
    pruneTasks("ovenPickupJobs");

    removedOvens.forEach(oven => Player.scene?.events?.emit?.("oven:updated", oven));
  }

  static trimManagedWaterOrder(orderId, keepCommitted = 0, teamNumber = 1) {
    const team = Teams.teamLists?.[`${teamNumber}`];
    const automation = Teams.ensureTownAutomation?.(teamNumber);
    if (!team || !automation || automation.waterOrderId !== orderId) return 0;

    let removableUnits = Math.max(
      0,
      Number(automation.waterCommittedCount || 0) - Math.max(0, Number(keepCommitted || 0) || 0)
    );
    if (removableUnits <= 0) return 0;

    const jobs = Array.isArray(team.ovenJobs)
      ? team.ovenJobs
          .map((job, index) => ({ job, index }))
          .filter(({ job }) => (
            job?.directOrderId === orderId &&
            job?.item?.name === UI_ITEM_TYPES.unclean_water.name &&
            Number(job?.assigned || 0) <= 0
          ))
          .sort((a, b) => {
            const byAssigned = Number(a.job?.assigned || 0) - Number(b.job?.assigned || 0);
            if (byAssigned !== 0) return byAssigned;
            return a.index - b.index;
          })
      : [];

    const removedOvens = new Set();
    let removedUnits = 0;

    const removableEntries = jobs
      .slice()
      .sort((a, b) => b.index - a.index);

    for (const entry of removableEntries) {
      if (removableUnits <= 0) break;
      const units = Math.max(0, Number(entry.job?.remaining || entry.job?.target || 0) || 0);
      if (units <= 0) continue;

      team.ovenJobs.splice(entry.index, 1);
      entry.job.canceled = true;
      removedOvens.add(entry.job.oven);
      removedUnits += units;
      removableUnits -= units;
    }

    if (removedUnits > 0) {
      Teams.uncommitTownWaterUnits?.(teamNumber, orderId, removedUnits);
      removedOvens.forEach((oven) => Player.scene?.events?.emit?.("oven:updated", oven));
    }

    return removedUnits;
  }

  static _ovenDistanceToTroop(troop, oven) {
    const centerX = (Number(oven?.x || 0) + 1) * SQUARESIZE;
    const centerY = (Number(oven?.y || 0) + 1) * SQUARESIZE;
    return Math.hypot((troop?.x || 0) - centerX, (troop?.y || 0) - centerY);
  }

  static _isCombatTroop(troop) {
    return !!(troop?.isBrawler || troop?.isBlademaster || troop?.isGunslinger);
  }

  static _troopTypeLabel(troop) {
    if (troop?.isFarmer) return "Farmer";
    if (troop?.isForager) return "Forager";
    if (troop?.isFireman) return "Fireman";
    if (troop?.isBuilder) return "Builder";
    if (troop?.isGunslinger) return "Gunslinger";
    if (troop?.isBlademaster) return "Blademaster";
    if (troop?.isBrawler) return "Brawler";
    return "Default";
  }

  static _nodeActive(node) {
    if (!node) return false;
    if (node.active === false) return false;
    if (node.sprite && node.sprite.active === false) return false;
    if (node.container && node.container.active === false) return false;
    return true;
  }

  static _nodeWorldCenter(node) {
    if (Number.isFinite(node?.x) && Number.isFinite(node?.y)) {
      return { x: node.x, y: node.y };
    }
    if (Number.isFinite(node?.sprite?.x) && Number.isFinite(node?.sprite?.y)) {
      return { x: node.sprite.x, y: node.sprite.y };
    }
    if (Number.isFinite(node?.container?.x) && Number.isFinite(node?.container?.y)) {
      return { x: node.container.x, y: node.container.y };
    }
    const gx = Number(node?.gridX ?? node?.x ?? 0);
    const gy = Number(node?.gridY ?? node?.y ?? 0);
    const lenX = Number(node?.lenX ?? 1);
    const lenY = Number(node?.lenY ?? 1);
    return {
      x: (gx + lenX / 2) * SQUARESIZE,
      y: (gy + lenY / 2) * SQUARESIZE,
    };
  }

  static _nodeResourceKind(node) {
    if (node?.resourceKind) return node.resourceKind;
    if (node?.resourceTileType?.name === "pine") return "wood";
    if (node?.resourceTileType?.name === "rock") return "stone";
    if (node?.resourceTileType?.name === "goldOre") return "gold";
    if (node?.resourceTileType?.name === "seedBush") return "seed";
    if (node?.resourceTileType?.name === "berryBush") return "berry";
    if (node?.task?.type?.name === "pine") return "wood";
    if (node?.task?.type?.name === "rock") return "stone";
    if (node?.task?.type?.name === "goldOre") return "gold";
    if (node?.task?.type?.name === "seedBush") return "seed";
    if (node?.task?.type?.name === "berryBush") return "berry";
    return null;
  }

  static _taskKey(task) {
    if (!task) return null;
    const kind = this._nodeResourceKind(task.value) ||
      (task.type?.name === "pine" ? "wood" : null) ||
      (task.type?.name === "rock" ? "stone" : null) ||
      (task.type?.name === "goldOre" ? "gold" : null) ||
      (task.type?.name === "seedBush" ? "seed" : null) ||
      (task.type?.name === "berryBush" ? "berry" : null);
    return `${kind || "resource"}:${task.x},${task.y}`;
  }

  static _nodeKey(node) {
    if (!node) return null;
    const gx = node.gridX ?? node.x ?? node.task?.x;
    const gy = node.gridY ?? node.y ?? node.task?.y;
    const kind = this._nodeResourceKind(node);
    if (!Number.isFinite(gx) || !Number.isFinite(gy) || !kind) return null;
    return `${kind}:${gx},${gy}`;
  }

  static _nextId() {
    return `gather_${this.nextOrderId++}`;
  }
}
