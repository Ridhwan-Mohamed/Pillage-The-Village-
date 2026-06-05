import { MAX_CROP_GROWTH_STAGE, SQUARESIZE, TILE_TYPES } from "../constants.js";
import { Map as GameMap } from "../map.js";
import { Teams } from "../Teams.js";
import { Player } from "../players/Player.js";
import { Wall } from "../buildings/Wall.js";
import { FarmBushNode } from "../buildings/FarmBushNode.js";
import { PineTree } from "../buildings/pineTree.js";
import { RockNode } from "../buildings/RockNode.js";
import { StageState } from "../parcelController/StageState.js";
import { STORE_UNLOCK_KEYS, getStoreUnlockSnapshot, unlockStoreItem, resetStoreUnlocks } from "../parcel_system/StoreUnlockSystem.js";
import { grantHordeUnlockCatchup } from "../parcel_system/HordeUnlockTrack.js";
import { POWERUP_CARDS } from "../Cards/PowerupCards.js";
import { clearBuildingArray, buildingArray, townBounds, townRoads, spawnPoints } from "../town.js";
import { TROOP_TYPE_REGISTRY, CARD_REGISTRY, reapplySavedCards, restoreItemStack, getTileTypeByKey, makeBuildingRef } from "./saveAdapters.js";
import { validateRunSnapshot } from "./saveSchema.js";
import { Scheduler } from "../ai/scheduler/Scheduler.js";
import { spawnNorthFort } from "../parcel_system/FortRaidParcel.js";
import { buildingManager } from "../Manager/buildingManager.js";
import { restoreCardInventorySnapshot } from "../Cards/CardInventory.js";
import { OrderRunner } from "../orders/OrderRunner.js";
import { ORDER_KINDS } from "../orders/OrderTypes.js";
import { StorageManager } from "../Manager/StorageManager.js";

function cloneSimple(value, fallback) {
  if (value == null) return fallback;
  try {
    return structuredClone(value);
  } catch {
    return fallback;
  }
}

function assignPlain(target, value, fallback) {
  const clone = cloneSimple(value, fallback);
  return clone == null ? fallback : clone;
}

function rehydrateTaskLike(task, queueKey = null, teamId = null) {
  if (!task || typeof task !== "object") return task;
  const next = assignPlain(null, task, {});
  const type = getTileTypeByKey(next.type);
  const buildType = getTileTypeByKey(next.buildType ?? next.buildTypeName);

  if (type) next.type = type;
  if (buildType) next.buildType = buildType;
  else if (type) next.buildType = type;

  if (!next.type && next.buildType) next.type = next.buildType;
  if (queueKey) next.queueKey = queueKey;
  if (teamId != null && next.teamNumber == null) next.teamNumber = Number(teamId);
  next.assigned = 0;
  delete next.reservedBy;
  delete next.directOrderId;
  delete next._ephemeralDirect;

  return next;
}

function rehydrateTaskList(tasks, queueKey = null, teamId = null) {
  return (Array.isArray(tasks) ? tasks : [])
    .map((task) => rehydrateTaskLike(task, queueKey, teamId))
    .filter(Boolean);
}

function getQueuedTillTint(kind) {
  return kind === "reseed" ? 0x45c9ff : 0x7cff97;
}

function restoreQueuedFarmPreviews(scene) {
  if (!scene?.addTillPreviewSprite) return;

  for (const [teamId, team] of Object.entries(Teams.teamLists || {})) {
    if (String(teamId) !== "1") continue;
    for (const task of team?.tileList || []) {
      if (!Number.isFinite(task?.x) || !Number.isFinite(task?.y)) continue;
      scene.addTillPreviewSprite(task.x, task.y, getQueuedTillTint(task.kind));
    }
  }
}

function restoreQueuedBuildVisuals(scene) {
  for (const [teamId, team] of Object.entries(Teams.teamLists || {})) {
    const numericTeamId = Number(teamId || 1);

    for (const task of team?.buildingTileStates || []) {
      buildingManager.ensureQueuedTileBuildGhost(task, numericTeamId);
    }

    for (const task of team?.blockBuildingStates || []) {
      buildingManager.restoreQueuedBlockBuildTask(task, numericTeamId);
    }
  }
}

function restoreQueuedDestroyVisuals(scene) {
  for (const [teamId] of Object.entries(Teams.teamLists || {})) {
    buildingManager.refreshQueuedDestroyJobVisuals(Number(teamId || 1));
  }
}

function setSceneResource(scene, key, value) {
  scene[key] = Number(value || 0);
}

function syncStorageBackedResourceCounters(scene, teamId = "1") {
  StorageManager.syncStorageBackedResourceCounters(scene, teamId);
}

function getTeamCardIds(snapshot, teamId = "1") {
  return snapshot?.teams?.[String(teamId)]?.cardIds || [];
}

function syncStoreUnlocks(scene, unlockKeys = [], snapshot = null) {
  resetStoreUnlocks(null, scene);
  for (const key of Array.isArray(unlockKeys) ? unlockKeys : []) {
    unlockStoreItem(key, scene);
  }

  const townLevel = Math.max(1, Number(snapshot?.progression?.townXp?.level || 1));
  if (townLevel >= 3) {
    unlockStoreItem(STORE_UNLOCK_KEYS.militiaParcel, scene);
  }

  const completedHordes = Math.max(
    0,
    Number(snapshot?.progression?.runStats?.nightsSurvived || 0),
    Number(snapshot?.progression?.stageState?.stageIndex || 1) - 1
  );
  grantHordeUnlockCatchup(scene, completedHordes);
}

function restoreBuildingState(building, saved) {
  if (!building || !saved) return;
  if (Number.isFinite(saved.maxHealth) && saved.maxHealth > 0) {
    if ("maxHealth" in building) building.maxHealth = saved.maxHealth;
    if ("maxHp" in building) building.maxHp = saved.maxHealth;
  }
  if (Number.isFinite(saved.health)) {
    if (typeof building.setHealth === "function") building.setHealth(saved.health);
    else if ("health" in building) building.health = saved.health;
    else if ("hp" in building) building.hp = saved.health;
  }
  if (saved.typeKey === "storage") {
    building.storageItems = (saved.storageItems || []).map(restoreItemStack);
    building.reservedPickup = {};
  } else if (saved.typeKey === "clayOven") {
    building.cookingSlots = (saved.cookingSlots || []).map(restoreItemStack);
    building.outputSlots = (saved.outputSlots || []).map(restoreItemStack);
    building.cookTimers = assignPlain(null, saved.cookTimers, []);
    building.cookDurations = assignPlain(null, saved.cookDurations, []);
    building.isCooking = assignPlain(null, saved.isCooking, []);
    building.fuel = Number(saved.fuel || 0);
    building._updateCookingState?.();
  } else if (saved.typeKey === "tower") {
    building.isPressureTower = !!saved.isPressureTower;
    building.isFortObjective = !!saved.isFortObjective;
    building.isTownTower = !!saved.isTownTower;
    building.isStarterTownTower = !!saved.isStarterTownTower;
    building.pressureSlotId = saved.pressureSlotId ?? building.pressureSlotId ?? null;
  }
  building.updateHealthBar?.();
}

function restoreQueuedItemRef(itemRef) {
  if (!itemRef) return null;
  if (typeof itemRef === "object" && itemRef.name) return itemRef;
  if (typeof itemRef !== "string") return null;
  return restoreItemStack({ item: itemRef, amount: 1 })?.item ?? null;
}

const RESTORABLE_ORDER_KINDS = new Set(Object.values(ORDER_KINDS));

function bumpOrderCounterFromId(id) {
  const match = typeof id === "string" ? /^gather_(\d+)$/.exec(id) : null;
  if (!match) return;
  const next = Number(match[1]) + 1;
  if (Number.isFinite(next)) {
    OrderRunner.nextOrderId = Math.max(Number(OrderRunner.nextOrderId || 1), next);
  }
}

function restoreCurrentOrder(saved) {
  if (!saved || typeof saved !== "object") return null;
  if (saved.status !== "active" || saved.persistent !== true) return null;
  if (!RESTORABLE_ORDER_KINDS.has(saved.kind)) return null;

  const order = {
    id: saved.id,
    kind: saved.kind,
    status: "active",
    source: typeof saved.source === "string" ? saved.source : "player",
    persistent: true,
  };

  if (typeof saved.resourceType === "string") order.resourceType = saved.resourceType;
  if (Number.isFinite(Number(saved.radiusTiles))) order.radiusTiles = Number(saved.radiusTiles);
  if (Array.isArray(saved.nodeKeys)) {
    order.nodeKeys = saved.nodeKeys.filter((key) => typeof key === "string");
  }
  if (saved.center && Number.isFinite(Number(saved.center.x)) && Number.isFinite(Number(saved.center.y))) {
    order.center = { x: Number(saved.center.x), y: Number(saved.center.y) };
  }
  if (saved.anchor && Number.isFinite(Number(saved.anchor.x)) && Number.isFinite(Number(saved.anchor.y))) {
    order.anchor = { x: Number(saved.anchor.x), y: Number(saved.anchor.y) };
  }
  if (saved.shuttingDown) order.shuttingDown = true;

  if (order.kind === ORDER_KINDS.GATHER_TYPE && !order.resourceType) return null;
  if (order.kind === ORDER_KINDS.GATHER_AREA && (!order.resourceType || !order.center)) return null;
  if (order.kind === ORDER_KINDS.GATHER_SET && !order.nodeKeys?.length) return null;

  bumpOrderCounterFromId(order.id);
  return order;
}

function resolveSavedOvenRef(task, teamId, buildingRegistry) {
  if (!task || !buildingRegistry) return null;
  const ovenRef = task.oven;
  const x = Number(ovenRef?.x ?? task.x);
  const y = Number(ovenRef?.y ?? task.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const ref = makeBuildingRef(teamId, "clayOven", x, y);
  const oven = buildingRegistry.get(ref);
  return oven?.tileType?.name === "clayOven" ? oven : null;
}

function normalizeSavedOvenJob(task, oven) {
  if (!task || !oven) return null;
  const normalized = task;
  normalized.oven = oven;
  normalized.type = TILE_TYPES.clayOven;
  normalized.x = Number(oven.x ?? normalized.x ?? 0);
  normalized.y = Number(oven.y ?? normalized.y ?? 0);
  normalized.assigned = Math.max(0, Number(normalized.assigned || 0));
  normalized.canceled = !!normalized.canceled;
  return normalized;
}

function rehydrateOvenQueues(buildingRegistry) {
  for (const [teamId, team] of Object.entries(Teams.teamLists || {})) {
    if (!team) continue;

    const normalizedCookJobs = [];
    for (const task of Array.isArray(team.ovenJobs) ? team.ovenJobs : []) {
      const oven = resolveSavedOvenRef(task, teamId, buildingRegistry);
      const job = normalizeSavedOvenJob(task, oven);
      if (!job) continue;

      job.item = restoreQueuedItemRef(job.item);
      if (!job.item?.name) continue;
      job.inputidx = Number.isFinite(Number(job.inputidx)) ? Number(job.inputidx) : 0;
      job.target = Math.max(0, Number(job.target || job.remaining || 0));
      job.delivered = Math.max(0, Number(job.delivered || 0));
      job.remaining = Math.max(0, Number(job.remaining ?? Math.max(0, job.target - job.delivered)));
      normalizedCookJobs.push(job);
    }
    team.ovenJobs = normalizedCookJobs;

    const normalizedFuelJobs = [];
    for (const task of Array.isArray(team.ovenFuelJobs) ? team.ovenFuelJobs : []) {
      const oven = resolveSavedOvenRef(task, teamId, buildingRegistry);
      const job = normalizeSavedOvenJob(task, oven);
      if (!job) continue;

      job.target = Math.max(0, Number(job.target || job.remaining || 0));
      job.delivered = Math.max(0, Number(job.delivered || 0));
      job.remaining = Math.max(0, Number(job.remaining ?? Math.max(0, job.target - job.delivered)));
      normalizedFuelJobs.push(job);
    }
    team.ovenFuelJobs = normalizedFuelJobs;

    team.ovenPickupJobs = [];
    for (const oven of team.ovenList || []) {
      if (!oven?.sprite?.active) continue;
      oven._syncOutputPickupJobs?.();
      oven._updateCookingState?.();
    }
  }
}

function rebuildBuildingRegistry(scene) {
  const registry = new Map();
  for (const [teamId, team] of Object.entries(Teams.teamLists || {})) {
    for (const entry of team.buildings || []) {
      const building = entry?.[3]?.buildingRef;
      if (!building) continue;
      const typeKey = building.tileType?.name || entry?.[2]?.name || "unknown";
      registry.set(makeBuildingRef(teamId, typeKey, building.x, building.y), building);
    }
  }
  return registry;
}

function restoreWalls(snapshotWalls = []) {
  for (const saved of snapshotWalls) {
    const teamId = Number(saved.teamId ?? 1);
    const wall = Wall.ensureAt(Player.scene, saved.x, saved.y, Number.isFinite(teamId) ? teamId : 1);
    if (!wall) continue;
    wall.maxHp = Number(saved.maxHp || wall.maxHp || 1);
    wall.hp = Number(saved.hp || wall.hp || wall.maxHp || 1);
    wall.phase = Number(saved.phase || 0);
    wall.isOpen = !!saved.isOpen;
    wall._applyVisuals?.();
    wall.setOpen?.(saved.isOpen);
  }
}

function restoreNonParcelResources(snapshotWorld = {}) {
  const pineByPos = new Map((GameMap.worldPines || []).filter((n) => n?.active).map((n) => [`${n.gridX},${n.gridY}`, n]));
  const rockByPos = new Map((GameMap.worldStones || []).filter((n) => n?.active).map((n) => [`${n.gridX},${n.gridY}`, n]));
  for (const saved of snapshotWorld.worldPines || []) {
    if (saved.contractId) continue;
    const node = pineByPos.get(`${saved.x},${saved.y}`);
    if (node) node.health = Number(saved.health || node.health || 0);
  }
  for (const saved of snapshotWorld.worldStones || []) {
    if (saved.contractId) continue;
    const node = rockByPos.get(`${saved.x},${saved.y}`);
    if (node) node.health = Number(saved.health || node.health || 0);
  }
}

function restoreTeamSnapshots(snapshot) {
  for (const [teamId, saved] of Object.entries(snapshot?.teams || {})) {
    const team = Teams.teamLists?.[teamId];
    if (!team || !saved) continue;
    team.name = saved.name || team.name;
    team.center = assignPlain(null, saved.center, team.center);
    team.tileList = rehydrateTaskList(saved.tileList, "tileList", teamId);
    team.foragerQueue = rehydrateTaskList(saved.foragerQueue, "foragerQueue", teamId);
    team.buildingTileStates = rehydrateTaskList(saved.buildingTileStates, "buildingTileStates", teamId);
    team.blockBuildingStates = rehydrateTaskList(saved.blockBuildingStates, "blockBuildingStates", teamId);
    team.destroyTileStates = rehydrateTaskList(saved.destroyTileStates, "destroyTileStates", teamId);
    team.destroyStates = rehydrateTaskList(saved.destroyStates, "destroyStates", teamId);
    team.enemyDestroyStates = rehydrateTaskList(saved.enemyDestroyStates, "enemyDestroyStates", teamId);
    team.enemyDestroyTileStates = rehydrateTaskList(saved.enemyDestroyTileStates, "enemyDestroyTileStates", teamId);
    team.buildingFixTasks = rehydrateTaskList(saved.buildingFixTasks, "buildingFixTasks", teamId);
    team.ovenJobs = rehydrateTaskList(saved.ovenJobs, "ovenJobs", teamId);
    team.ovenPickupJobs = rehydrateTaskList(saved.ovenPickupJobs, "ovenPickupJobs", teamId);
    team.ovenFuelJobs = rehydrateTaskList(saved.ovenFuelJobs, "ovenFuelJobs", teamId);
    team.ovenFuelDeliveryItems = [];
    team.ovenDeliveryItems = [];
    team.storageDeliveryItems = [];
    team.storageDeliveryReservations = [];
    team.cropList = rehydrateTaskList(saved.cropList, "cropList", teamId);
    team._savedCropSnapshots = Array.isArray(saved.crops) ? saved.crops : [];
    team.wateringList = [];
    team.TeamFarmSpots = [];
    team.reliefPackageCount = Math.max(
      0,
      Number(
        saved.reliefPackageCount
        ?? team.reliefPackageCount
        ?? (String(teamId) === "1" ? 1 : 0)
      ) || 0
    );
    team.townAutomation = assignPlain(null, saved.townAutomation, {});
    bumpOrderCounterFromId(team.townAutomation?.waterOrderId);
    Object.values(team.townAutomation?.gatherOrderIds || {}).forEach((orderId) => bumpOrderCounterFromId(orderId));
    team.cardHand = (saved.cardIds || []).map((id) => CARD_REGISTRY.get(id)).filter(Boolean);
    team.cardInventory = restoreCardInventorySnapshot(saved.cardInventory);
  }
}

function getCropSpriteAt(x, y) {
  const key = `${x},${y}`;
  let sprite = GameMap.cropDict?.[key] || null;
  if (Array.isArray(sprite)) sprite = sprite[0] || sprite[1] || null;
  if (!sprite && GameMap.grid?.[y]?.[x] === TILE_TYPES.crops.grid) {
    GameMap.drawGridValue?.(x, y);
    sprite = GameMap.cropDict?.[key] || null;
    if (Array.isArray(sprite)) sprite = sprite[0] || sprite[1] || null;
  }
  return sprite;
}

function clearCropWaterIndicator(crop) {
  crop?.waterNeedTween?.remove?.();
  if (crop) crop.waterNeedTween = null;
  if (crop?.waterNeedIcon) {
    GameMap.removeFromWorldStatic?.(crop.waterNeedIcon);
    crop.waterNeedIcon = null;
  }
}

function removeGeneratedCropPlaceholder(team, x, y) {
  if (!team) return;

  const pruneTaskList = (list) => {
    if (!Array.isArray(list)) return;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const entry = list[i];
      if (Number(entry?.x) !== x || Number(entry?.y) !== y) continue;
      list.splice(i, 1);
    }
  };

  if (Array.isArray(team.crops)) {
    for (let i = team.crops.length - 1; i >= 0; i -= 1) {
      const crop = team.crops[i];
      if (Number(crop?.x) !== x || Number(crop?.y) !== y) continue;
      clearCropWaterIndicator(crop);
      team.crops.splice(i, 1);
    }
  }

  pruneTaskList(team.wateringList);
  pruneTaskList(team.cropList);
  pruneTaskList(team.TeamFarmSpots);
}

function restoreSavedCropStates() {
  for (const [teamId, team] of Object.entries(Teams.teamLists || {})) {
    const savedCrops = Array.isArray(team?._savedCropSnapshots) ? team._savedCropSnapshots : [];
    delete team._savedCropSnapshots;

    if (!savedCrops.length) {
      for (const crop of team?.crops || []) {
        Teams.syncCropWaterIndicator?.(crop);
      }
      continue;
    }

    for (const crop of team?.crops || []) {
      clearCropWaterIndicator(crop);
    }

    const restored = [];
    team.crops = [];
    team.cropList = [];
    team.wateringList = [];
    team.TeamFarmSpots = [];

    for (const saved of savedCrops) {
      const x = Number(saved?.x);
      const y = Number(saved?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      const sprite = getCropSpriteAt(x, y);
      if (!sprite) continue;
      removeGeneratedCropPlaceholder(team, x, y);

      const hasSeed = saved?.hasSeed !== false;
      const growthStage = Math.max(0, Math.min(MAX_CROP_GROWTH_STAGE, Number(saved?.growthStage || 0)));
      const crop = {
        sprite,
        x,
        y,
        teamNumber: String(saved?.teamNumber ?? teamId ?? "1"),
        dailyWatered: !!saved?.dailyWatered,
        growthStage,
        hasSeed,
      };

      sprite.hasSeed = hasSeed;
      sprite.setFrame?.(hasSeed ? 1 + growthStage : 0);
      restored.push(crop);

      if (hasSeed && growthStage >= MAX_CROP_GROWTH_STAGE) {
        Teams.addFarmSpots?.(sprite, x, y);
        team.cropList.push({ x, y, assigned: 0, sprite });
      } else if (hasSeed && !crop.dailyWatered) {
        team.wateringList.push({ x, y, assigned: 0, sprite });
      }

      Teams.syncCropWaterIndicator?.(crop);
    }

    team.crops = restored;
  }
}

function restorePlayers(scene, snapshot, buildingRegistry) {
  const troops = [];
  const houseRegistry = new Map();
  for (const [ref, building] of buildingRegistry.entries()) {
    houseRegistry.set(ref, building);
  }

  for (const saved of snapshot?.players || []) {
    const TroopClass = TROOP_TYPE_REGISTRY[saved.typeKey];
    if (!TroopClass) continue;
    const gx = Math.max(0, Math.floor(Number(saved.x || 0) / SQUARESIZE));
    const gy = Math.max(0, Math.floor(Number(saved.y || 0) / SQUARESIZE));
    const troop = new TroopClass(gx, gy, Number(saved.teamId || 0));
    troop.x = Number(saved.x || troop.x);
    troop.y = Number(saved.y || troop.y);
    troop.id = Number(saved.id || troop.id || 0);
    troop.health = Number(saved.health || troop.health || 0);
    troop.maxHealth = Number(saved.maxHealth || troop.maxHealth || troop.health || 0);
    troop.stamina = Number(saved.stamina || troop.stamina || 0);
    troop.maxStamina = Number(saved.maxStamina || troop.maxStamina || troop.stamina || 0);
    if (saved.name) troop.name = saved.name;
    troop.roam = !!saved.roam;
    troop.carrying = restoreItemStack(saved.carrying);
    troop.waterBucket = assignPlain(null, saved.waterBucket, troop.waterBucket ?? null);
    troop.type?.clampWaterBucket?.(troop);
    troop._sleepQueued = !!saved.sleepQueued;
    troop.guardPost = assignPlain(null, saved.guardPost, null);
    troop.deferredCarry = null;
    troop.pendingFarmSpot = null;
    troop.pendingStorageDeliveryReservation = null;
    troop.pendingOvenJob = null;
    troop.pendingFuelJob = null;
    troop.taskMeta = null;
    troop.task = null;
    troop.currentOrder = restoreCurrentOrder(saved.currentOrder);
    troop.contractId = saved.contractId ?? null;
    troop.nightHordeId = saved.nightHordeId ?? null;
    troop.hordeIndex = saved.hordeIndex ?? null;
    troop.pressureEnemyType = saved.pressureEnemyType ?? null;
    troop.hordeModifierKey = saved.hordeModifierKey ?? null;
    troop.hordeModifierLabel = saved.hordeModifierLabel ?? null;
    troop.currentPath = [];
    troop.destX = null;
    troop.destY = null;
    troop.timer?.remove?.(false);
    troop.timer = null;
    troop.body?.reset?.(troop.x, troop.y);
    troops.push({ troop, saved });
  }

  let maxId = 0;
  for (const { troop, saved } of troops) {
    maxId = Math.max(maxId, Number(saved.id || troop.id || 0));
    if (saved.home?.typeKey) {
      const ref = makeBuildingRef(saved.teamId, saved.home.typeKey, saved.home.x, saved.home.y);
      const home = houseRegistry.get(ref);
      if (home) {
        troop.home = home;
        if (Array.isArray(home.occupants) && !home.occupants.includes(troop)) home.occupants.push(troop);
      }
    }
  }
  Player.count = maxId + 1;
}

export function prepareSnapshotWorldForBoot(snapshot) {
  const validation = validateRunSnapshot(snapshot);
  if (!validation.ok) {
    throw new Error(validation.reason || "Invalid save snapshot");
  }

  clearBuildingArray();
  const savedEntries = Array.isArray(snapshot?.world?.buildingEntries) ? snapshot.world.buildingEntries : [];
  for (const entry of savedEntries) {
    const tileType = getTileTypeByKey(entry.typeKey);
    if (!tileType) continue;
    buildingArray.push([Number(entry.x || 0), Number(entry.y || 0), tileType, Number(entry.teamId || 0)]);
  }

  Object.keys(townBounds).forEach((key) => delete townBounds[key]);
  Object.assign(townBounds, cloneSimple(snapshot?.world?.townBounds, {}));
  Object.keys(townRoads).forEach((key) => delete townRoads[key]);
  Object.assign(townRoads, cloneSimple(snapshot?.world?.townRoads, {}));
  spawnPoints.length = 0;
  for (const point of snapshot?.world?.spawnPoints || []) spawnPoints.push(point);
}

export function restoreRunSnapshotIntoScene(scene, snapshot) {
  const validation = validateRunSnapshot(snapshot);
  if (!validation.ok) throw new Error(validation.reason || "Invalid save snapshot");

  scene._restoringFromSave = true;
  try {
    scene.simNowMs = Number(snapshot?.progression?.simNowMs || scene.simNowMs || 0);
    reapplySavedCards(getTeamCardIds(snapshot, "1"));
    restoreTeamSnapshots(snapshot);
    syncStoreUnlocks(scene, snapshot?.systems?.storeUnlocks || [], snapshot);

    scene.clock?.restoreSnapshot?.(snapshot?.progression?.clock || null);

    StageState.stageIndex = Math.max(1, Number(snapshot?.progression?.stageState?.stageIndex || 1));
    StageState.seasonIndex = Math.max(1, Number(snapshot?.progression?.stageState?.seasonIndex || 1));
    StageState.startDay = Math.max(1, Number(snapshot?.progression?.stageState?.startDay || 1));
    StageState.endlessMode = !!snapshot?.progression?.stageState?.endlessMode;
    StageState.fortObjectiveEnabled = !!snapshot?.progression?.stageState?.fortObjectiveEnabled;

    const resources = snapshot?.progression?.resources || {};
    setSceneResource(scene, "money", resources.money);
    setSceneResource(scene, "seeds", resources.seeds);
    setSceneResource(scene, "berries", resources.berries);
    setSceneResource(scene, "woodAmnt", resources.woodAmnt);
    setSceneResource(scene, "stoneAmnt", resources.stoneAmnt);
    setSceneResource(scene, "foodAmnt", resources.foodAmnt);
    setSceneResource(scene, "cleanWaterAmnt", resources.cleanWaterAmnt);
    setSceneResource(scene, "permits", resources.permits);
    scene.selectedSimSpeed = Number(snapshot?.progression?.selectedSimSpeed || scene.selectedSimSpeed || 1);

    scene._runStats = {
      ...(snapshot?.progression?.runStats || {}),
      troopUnlockKeys: new Set(snapshot?.progression?.runStats?.troopUnlockKeys || []),
      claimedContractIds: new Set(snapshot?.progression?.runStats?.claimedContractIds || []),
      defeatedEnemyIds: new Set(snapshot?.progression?.runStats?.defeatedEnemyIds || []),
    };
    scene._townXp = cloneSimple(snapshot?.progression?.townXp, scene._townXp);
    scene._northFortArrival = cloneSimple(snapshot?.progression?.northFortArrival, scene._northFortArrival);
    scene._townTowerStats = cloneSimple(snapshot?.progression?.townTowerStats, scene._townTowerStats);
    scene._northFortMainIslandOrigin = cloneSimple(snapshot?.world?.northFortMainIslandOrigin, scene._northFortMainIslandOrigin);

    restoreSavedCropStates();

    const buildingRegistry = rebuildBuildingRegistry(scene);
    for (const team of Object.values(snapshot?.teams || {})) {
      for (const saved of team?.buildings || []) {
        const building = buildingRegistry.get(saved.ref);
        if (building) restoreBuildingState(building, saved);
      }
    }
    rehydrateOvenQueues(buildingRegistry);

    restoreWalls(snapshot?.world?.walls || []);
    restoreNonParcelResources(snapshot?.world || {});

    scene.parcelManager?.restoreSnapshot?.(snapshot?.parcels?.parcelManager, snapshot);
    scene.towerPressureController?.restoreSnapshot?.(snapshot?.parcels?.towerPressure, scene, snapshot);

    restorePlayers(scene, snapshot, buildingRegistry);
    syncStorageBackedResourceCounters(scene, "1");
    scene.restoreShockerBossState?.(snapshot?.progression?.shockerBoss || null);
    restoreQueuedFarmPreviews(scene);
    restoreQueuedBuildVisuals(scene);
    restoreQueuedDestroyVisuals(scene);

    scene._activeNightHorde = cloneSimple(snapshot?.progression?.activeNightHorde, null);
    scene.achievementSystem?.restoreSnapshot?.(snapshot?.progression?.achievements || null);

    if (snapshot?.progression?.activeFort?.origin && scene?._northFortMainIslandOrigin) {
      scene._activeFort = spawnNorthFort({
        scene,
        map: GameMap,
        mainIslandOrigin: scene._northFortMainIslandOrigin,
      });
    }

    scene.uiScene?.refreshAll?.();
    scene.events.emit?.("store:unlock-changed", { changed: true, unlocks: getStoreUnlockSnapshot() });
    scene.events.emit?.("stage:changed", { stageIndex: StageState.stageIndex, seasonIndex: StageState.seasonIndex });
    scene.showSaveNotification?.();

    for (const troop of Player.troops || []) {
      if (!troop?.active || Number(troop.body?.team ?? troop._teamNumber ?? 0) !== 1) continue;
      Scheduler.stepUnit(troop);
    }
  } finally {
    scene._restoringFromSave = false;
  }
}
