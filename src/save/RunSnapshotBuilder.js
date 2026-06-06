import { Map as GameMap } from "../map.js";
import { Teams } from "../Teams.js";
import { Player } from "../players/Player.js";
import { StageState } from "../parcelController/StageState.js";
import { buildingArray, townBounds, townRoads, spawnPoints } from "../town.js";
import { Wall } from "../buildings/Wall.js";
import { getStoreUnlockSnapshot } from "../parcel_system/StoreUnlockSystem.js";
import { getCardInventorySnapshot } from "../Cards/CardInventory.js";
import { SAVE_BUILD_LABEL, SAVE_SCHEMA_VERSION } from "./saveSchema.js";
import {
  cloneSimple,
  getCardIdsFromHand,
  getTileTypeKey,
  getTroopTypeKey,
  makeBuildingRef,
  snapshotItemStack,
} from "./saveAdapters.js";

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function snapshotTaskLike(task) {
  if (!task) return null;
  const out = {};
  for (const [key, value] of Object.entries(task)) {
    if (key === "assigned" || key === "reservedBy" || key === "directOrderId" || key === "_ephemeralDirect") continue;
    if (key === "destroyMarker" || key === "destroyWarningX" || key === "destroyWarningXTween") continue;
    if (typeof value === "function") continue;
    if (value && typeof value === "object") {
      if (value.name && !Array.isArray(value) && Object.keys(value).includes("name")) {
        out[key] = value.name;
        continue;
      }
      if (value === task.value || value === task.sprite || value === task.building) continue;
      if (value.x != null && value.y != null && (value.tileType || value.resourceTileType || value.item || value.body || value.sprite)) {
        out[key] = {
          x: Number(value.x ?? value.gridX ?? value.tilePos?.tileX ?? 0),
          y: Number(value.y ?? value.gridY ?? value.tilePos?.tileY ?? 0),
          type: getTileTypeKey(value.tileType || value.resourceTileType),
        };
        continue;
      }
      try {
        out[key] = structuredClone(value);
      } catch {
        continue;
      }
      continue;
    }
    out[key] = value;
  }
  if (task.type) out.type = getTileTypeKey(task.type);
  return out;
}

function snapshotCurrentOrder(order) {
  if (!order || order.status !== "active" || order.persistent !== true) return null;

  const out = {
    id: order.id,
    kind: order.kind,
    status: "active",
    source: order.source || "player",
    persistent: true,
  };

  if (typeof order.resourceType === "string") out.resourceType = order.resourceType;
  if (Number.isFinite(Number(order.radiusTiles))) out.radiusTiles = Number(order.radiusTiles);
  if (Array.isArray(order.nodeKeys)) out.nodeKeys = order.nodeKeys.filter((key) => typeof key === "string");
  if (order.center && Number.isFinite(Number(order.center.x)) && Number.isFinite(Number(order.center.y))) {
    out.center = { x: Number(order.center.x), y: Number(order.center.y) };
  }
  if (order.anchor && Number.isFinite(Number(order.anchor.x)) && Number.isFinite(Number(order.anchor.y))) {
    out.anchor = { x: Number(order.anchor.x), y: Number(order.anchor.y) };
  }
  if (order.shuttingDown) out.shuttingDown = true;

  return out;
}

function snapshotBuildingState(building, teamId = 1) {
  if (!building) return null;
  const typeKey = getTileTypeKey(building.tileType) || getTileTypeKey(building.buildType);
  if (!typeKey) return null;
  const base = {
    ref: makeBuildingRef(teamId, typeKey, building.x, building.y),
    typeKey,
    x: Number(building.x || 0),
    y: Number(building.y || 0),
    teamId: String(teamId ?? building.teamNumber ?? building.team ?? 1),
    health: Number(building.health ?? building.hp ?? 0),
    maxHealth: Number(building.maxHealth ?? building.maxHp ?? 0),
    contractId: building.contractId ?? null,
    slotId: building.slotId ?? null,
  };

  if (typeKey === "storage") {
    base.storageItems = (building.storageItems || []).map(snapshotItemStack);
    base.capacity = Number(building.capacity || 0);
  } else if (typeKey === "clayOven") {
    base.cookingSlots = (building.cookingSlots || []).map(snapshotItemStack);
    base.outputSlots = (building.outputSlots || []).map(snapshotItemStack);
    base.cookTimers = cloneSimple(building.cookTimers, []);
    base.cookDurations = cloneSimple(building.cookDurations, []);
    base.isCooking = cloneSimple(building.isCooking, []);
    base.fuel = Number(building.fuel || 0);
  } else if (typeKey === "house1" || typeKey === "house2") {
    base.capacity = Number(building.capacity || 0);
    base.occupantIds = (building.occupants || []).map((troop) => troop?.id).filter(Number.isFinite);
  } else if (typeKey === "tower") {
    base.isPressureTower = !!building.isPressureTower;
    base.isFortObjective = !!building.isFortObjective;
    base.isTownTower = !!building.isTownTower;
    base.isStarterTownTower = !!building.isStarterTownTower;
    base.pressureSlotId = building.pressureSlotId ?? null;
  }

  return base;
}

function snapshotWorldResource(node, kind) {
  if (!node?.active) return null;
  return {
    kind,
    x: Number(node.gridX ?? node.x ?? 0),
    y: Number(node.gridY ?? node.y ?? 0),
    health: Number(node.health ?? node.hp ?? 0),
    contractId: node.contractId ?? null,
    slotId: node.slotId ?? null,
  };
}

function snapshotFarmBush(node) {
  if (!node?.active) return null;
  return {
    kind: node.resourceKind,
    x: Number(node.gridX ?? 0),
    y: Number(node.gridY ?? 0),
    health: Number(node.health ?? 0),
    contractId: node.contractId ?? null,
    slotId: node.slotId ?? null,
  };
}

function snapshotCropState(crop) {
  if (!crop) return null;
  const x = Number(crop.x);
  const y = Number(crop.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x,
    y,
    teamNumber: String(crop.teamNumber ?? "1"),
    dailyWatered: !!crop.dailyWatered,
    growthStage: Math.max(0, Number(crop.growthStage || 0)),
    hasSeed: crop.hasSeed !== false,
    harvestsRemaining: Math.max(0, Number(crop.harvestsRemaining || 0)),
  };
}

function snapshotTroop(troop) {
  if (!troop?.active) return null;
  const typeKey = getTroopTypeKey(troop);
  if (!typeKey) return null;
  return {
    id: Number(troop.id ?? 0),
    typeKey,
    teamId: String(troop.body?.team ?? troop._teamNumber ?? 0),
    x: Number(troop.x ?? 0),
    y: Number(troop.y ?? 0),
    health: Number(troop.health ?? 0),
    maxHealth: Number(troop.maxHealth ?? 0),
    stamina: Number(troop.stamina ?? 0),
    maxStamina: Number(troop.maxStamina ?? 0),
    name: troop.name ?? null,
    roam: !!troop.roam,
    currentOrder: snapshotCurrentOrder(troop.currentOrder),
    carrying: snapshotItemStack(troop.carrying),
    waterBucket: cloneSimple(troop.waterBucket, null),
    sleepQueued: !!troop._sleepQueued,
    home: troop.home ? { x: Number(troop.home.x ?? 0), y: Number(troop.home.y ?? 0), typeKey: getTileTypeKey(troop.home.tileType) } : null,
    guardPost: troop.guardPost ? cloneSimple(troop.guardPost, null) : null,
    deferredCarry: null,
    pendingFarmSpot: null,
    pendingStorageDeliveryReservation: null,
    pendingOvenJob: null,
    pendingFuelJob: null,
    taskMeta: null,
    contractId: troop.contractId ?? null,
    nightHordeId: troop.nightHordeId ?? null,
    hordeIndex: troop.hordeIndex ?? null,
    pressureEnemyType: troop.pressureEnemyType ?? null,
    hordeModifierKey: troop.hordeModifierKey ?? null,
    hordeModifierLabel: troop.hordeModifierLabel ?? null,
    spawnerPos: troop.spawner ? { x: Number(troop.spawner.tilePos?.tileX ?? 0), y: Number(troop.spawner.tilePos?.tileY ?? 0) } : null,
  };
}

function snapshotTeamState(teamId, team) {
  if (!team) return null;
  const buildings = [];
  for (const entry of team.buildings || []) {
    const building = entry?.[3]?.buildingRef;
    if (!building) continue;
    const snap = snapshotBuildingState(building, teamId);
    if (snap) buildings.push(snap);
  }
  return {
    id: String(teamId),
    name: String(team.name || ""),
    center: cloneSimple(team.center, [0, 0]),
    tileList: (team.tileList || []).map(snapshotTaskLike),
    foragerQueue: (team.foragerQueue || []).map(snapshotTaskLike),
    buildingTileStates: (team.buildingTileStates || []).map(snapshotTaskLike),
    blockBuildingStates: (team.blockBuildingStates || []).map(snapshotTaskLike),
    destroyTileStates: (team.destroyTileStates || []).map(snapshotTaskLike),
    destroyStates: (team.destroyStates || []).map(snapshotTaskLike),
    enemyDestroyStates: (team.enemyDestroyStates || []).map(snapshotTaskLike),
    enemyDestroyTileStates: (team.enemyDestroyTileStates || []).map(snapshotTaskLike),
    buildingFixTasks: (team.buildingFixTasks || []).map(snapshotTaskLike),
    ovenJobs: (team.ovenJobs || []).map(snapshotTaskLike),
    ovenPickupJobs: (team.ovenPickupJobs || []).map(snapshotTaskLike),
    ovenFuelJobs: (team.ovenFuelJobs || []).map(snapshotTaskLike),
    ovenFuelDeliveryItems: [],
    ovenDeliveryItems: [],
    storageDeliveryItems: [],
    storageDeliveryReservations: [],
    cropList: (team.cropList || []).map(snapshotTaskLike),
    crops: (team.crops || []).map(snapshotCropState).filter(Boolean),
    wateringList: (team.wateringList || []).map(snapshotTaskLike),
    TeamFarmSpots: (team.TeamFarmSpots || []).map(snapshotTaskLike),
    buildingRefs: buildings.map((entry) => entry.ref),
    buildings,
    cardIds: getCardIdsFromHand(team.cardHand),
    cardInventory: getCardInventorySnapshot(team.cardInventory),
    reliefPackageCount: Math.max(0, Number(team.reliefPackageCount || 0)),
    townAutomation: cloneSimple(team.townAutomation, {}),
  };
}

export function buildRunSnapshot(scene) {
  const savedAt = Date.now();
  const clockSnapshot = scene?.clock?.getSnapshot?.() ?? null;
  const townXpState = cloneSimple(scene?._townXp, null);
  const runStats = scene?._runStats
    ? {
        ...scene._runStats,
        troopUnlockKeys: Array.from(scene._runStats.troopUnlockKeys || []),
        claimedContractIds: Array.from(scene._runStats.claimedContractIds || []),
        defeatedEnemyIds: Array.from(scene._runStats.defeatedEnemyIds || []),
      }
    : null;

  const teamSnapshots = {};
  for (const [teamId, team] of Object.entries(Teams.teamLists || {})) {
    const snap = snapshotTeamState(teamId, team);
    if (snap) teamSnapshots[teamId] = snap;
  }

  const players = (Player.troops || []).map(snapshotTroop).filter(Boolean);
  const walls = Array.from(Wall.byCell?.values?.() || [])
    .filter((wall) => wall?.active)
    .map((wall) => ({
      x: Number(wall.x || 0),
      y: Number(wall.y || 0),
      teamId: String(wall.team ?? 1),
      hp: Number(wall.hp ?? 0),
      maxHp: Number(wall.maxHp ?? 0),
      phase: Number(wall.phase ?? 0),
      isOpen: !!wall.isOpen,
      material: wall.material ?? null,
      isDoor: !!wall.isDoor,
    }));

  const buildingEntries = [];
  Object.values(teamSnapshots).forEach((team) => {
    for (const entry of team.buildings || []) {
      if (entry?.contractId) continue;
      buildingEntries.push(entry);
    }
  });

  const worldPines = (GameMap.worldPines || []).map((node) => snapshotWorldResource(node, "pine")).filter(Boolean);
  const worldStones = (GameMap.worldStones || []).map((node) => snapshotWorldResource(node, "rock")).filter(Boolean);
  for (const node of worldPines) {
    if (node.contractId) continue;
    buildingEntries.push({
      ref: makeBuildingRef(0, "pine", node.x, node.y),
      typeKey: "pine",
      x: node.x,
      y: node.y,
      teamId: "0",
      health: node.health,
      maxHealth: node.health,
    });
  }
  for (const node of worldStones) {
    if (node.contractId) continue;
    buildingEntries.push({
      ref: makeBuildingRef(0, "rock", node.x, node.y),
      typeKey: "rock",
      x: node.x,
      y: node.y,
      teamId: "0",
      health: node.health,
      maxHealth: node.health,
    });
  }
  const worldSeedBushes = (GameMap.worldSeedBushes || []).map(snapshotFarmBush).filter(Boolean);
  const worldBerryBushes = (GameMap.worldBerryBushes || []).map(snapshotFarmBush).filter(Boolean);
  const worldSpawners = (GameMap.worldSpawners || [])
    .filter((spawner) => spawner && !spawner._destroyed)
    .map((spawner) => ({
      x: Number(spawner.tilePos?.tileX ?? 0),
      y: Number(spawner.tilePos?.tileY ?? 0),
      contractId: spawner.contractId ?? null,
      hp: Number(spawner.hp ?? 0),
      maxHp: Number(spawner.maxHp ?? 0),
      quotaRemaining: Number(spawner.quotaRemaining ?? 0),
      aliveCount: Number(spawner.aliveCount ?? 0),
      intervalMs: Number(spawner.intervalMs ?? 0),
      enemyType: spawner.enemyType ?? "raider",
      enemyMods: cloneSimple(spawner.enemyMods, null),
      enemyTypeLabel: spawner.enemyTypeLabel ?? null,
      modifierKey: spawner.modifierKey ?? null,
      modifierLabel: spawner.modifierLabel ?? null,
      teamId: String(spawner.team ?? 0),
    }));

  const snapshot = {
    version: SAVE_SCHEMA_VERSION,
    savedAt,
    buildLabel: SAVE_BUILD_LABEL,
    meta: {
      day: Math.max(1, Number(scene?.clock?.day ?? 1)),
      phase: String(scene?.clock?.getPhaseKey?.() || "day"),
      seasonIndex: Math.max(1, Number(StageState.seasonIndex || 1)),
      stageIndex: Math.max(1, Number(StageState.stageIndex || 1)),
      money: Math.max(0, Number(scene?.money || 0)),
      hasContinue: true,
      savedAt,
    },
    world: {
      grid: cloneSimple(GameMap.grid, []),
      navGrid: cloneSimple(GameMap.navGrid, []),
      enemyNavGrid: cloneSimple(GameMap.enemyNavGrid, []),
      buildingEntries,
      walls,
      worldPines,
      worldStones,
      worldSeedBushes,
      worldBerryBushes,
      worldSpawners,
      cropDict: {},
      townBounds: cloneSimple(townBounds, {}),
      townRoads: cloneSimple(townRoads, {}),
      spawnPoints: cloneSimple(spawnPoints, []),
      legacyBuildingArray: cloneSimple(buildingArray, []),
      mainIslandOrigin: cloneSimple(scene?.parcelManager?.mainIslandOrigin, null),
      northFortMainIslandOrigin: cloneSimple(scene?._northFortMainIslandOrigin, null),
    },
    teams: teamSnapshots,
    players,
    parcels: {
      parcelManager: scene?.parcelManager?.getSnapshot?.() ?? null,
      towerPressure: scene?.towerPressureController?.getSnapshot?.() ?? null,
    },
    progression: {
      clock: clockSnapshot,
      stageState: {
        stageIndex: Math.max(1, Number(StageState.stageIndex || 1)),
        seasonIndex: Math.max(1, Number(StageState.seasonIndex || 1)),
        startDay: Math.max(1, Number(StageState.startDay || 1)),
        endlessMode: !!StageState.endlessMode,
        fortObjectiveEnabled: !!StageState.fortObjectiveEnabled,
      },
      achievements: scene?.achievementSystem?.getSaveSnapshot?.() ?? null,
      runStats,
      townXp: townXpState,
      northFortArrival: cloneSimple(scene?._northFortArrival, null),
      activeNightHorde: scene?._activeNightHorde ? {
        id: scene._activeNightHorde.id ?? null,
        hordeIndex: scene._activeNightHorde.hordeIndex ?? null,
        startedOnDay: scene._activeNightHorde.startedOnDay ?? null,
        totalEnemies: scene._activeNightHorde.totalEnemies ?? 0,
        spawnedCount: scene._activeNightHorde.spawnedCount ?? 0,
        enemyLabel: scene._activeNightHorde.enemyLabel ?? null,
        modifier: cloneSimple(scene._activeNightHorde.modifier, null),
        plan: cloneSimple(scene._activeNightHorde.plan, null),
        laneDetails: cloneSimple(scene._activeNightHorde.laneDetails, []),
      } : null,
      shockerBoss: cloneSimple(scene?._shockerBossState, null),
      townTowerStats: cloneSimple(scene?._townTowerStats, null),
      activeFort: scene?._activeFort ? {
        origin: cloneSimple(scene._activeFort.origin, null),
        bounds: cloneSimple(scene._activeFort.bounds, null),
      } : null,
      resources: {
        money: Number(scene?.money || 0),
        seeds: Number(scene?.seeds || 0),
        berries: Number(scene?.berries || 0),
        woodAmnt: Number(scene?.woodAmnt || 0),
        stoneAmnt: Number(scene?.stoneAmnt || 0),
        foodAmnt: Number(scene?.foodAmnt || 0),
        cleanWaterAmnt: Number(scene?.cleanWaterAmnt || 0),
        permits: Number(scene?.permits || 0),
      },
      selectedSimSpeed: Number(scene?.selectedSimSpeed || 1),
      simNowMs: Number(scene?.simNowMs || 0),
    },
    systems: {
      storeUnlocks: getStoreUnlockSnapshot(),
    },
  };

  return snapshot;
}
