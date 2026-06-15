import Phaser from "phaser";
import {
  SQUARESIZE,
  UIDEPTH,
  WORLD_DIMENSIONX,
  WORLD_DIMENSIONY,
  TILE_MAP,
  TILE_TYPES,
  PARCEL,
  showAlert,
  showGhostText,
  colorFor,
} from "../constants";
import { Map as GameMap } from "../map";
import { Teams } from "../Teams";
import { Player } from "../players/Player";
import { fightManager } from "../Manager/fightManager";
import { Wall } from "../buildings/Wall";
import { AudioManager } from "../Manager/AudioManager";
import {
  MARKET_CARD_KIND,
  MARKET_PLACEHOLDER_ASSETS,
  MARKET_REAL_ASSETS,
  getMarketCardDefinition,
  loadMarketCardPlaceholderAssets,
} from "../Cards/MarketCards";
import {
  clearExpiredMarketAdrenalineBuff,
  clearExpiredSceneMarketBuffs,
  setSceneMarketBuff,
  setMarketAdrenalineBuff,
} from "../Cards/MarketBuffs";
import { playSmokeClearing } from "../FX/SmokeClearing";

const CONTEXT_SOURCE = "market-card-use";
const PLAYER_TEAM = "1";
const ADRENALINE_MS = 45_000;
const MELEE_CRIT_MS = 32_000;
const PROJECTILE_CRIT_MS = 32_000;
const SECOND_WIND_STAMINA_FRACTION = 0.68;
const FORTIFY_MS = 120_000;
const AUTO_WALL_TYPE = "woodWall";
const AUTO_WALL_DOOR_TYPE = "woodWall_door";
const HEAL_PARTICLE_DEPTH = (UIDEPTH ?? 10) + 125;
const TARGETED_MARKET_ACTIVATIONS = new Set([
  "auto_wall",
  "chain_zapper",
  "meteor_drop",
  "fortify_patch",
  "shock_mine",
]);
const INSTANT_TARGET_ACTIVATIONS = new Set([
  "chain_zapper",
  "meteor_drop",
  "fortify_patch",
  "shock_mine",
]);

function gridKey(x, y) {
  return `${x},${y}`;
}

function worldToGrid(pointer) {
  return {
    x: Math.floor(Number(pointer?.worldX ?? 0) / SQUARESIZE),
    y: Math.floor(Number(pointer?.worldY ?? 0) / SQUARESIZE),
  };
}

function centerOfCell(x, y) {
  return {
    x: x * SQUARESIZE + SQUARESIZE / 2,
    y: y * SQUARESIZE + SQUARESIZE / 2,
  };
}

function mapWidth() {
  return Math.max(1, GameMap.grid?.[0]?.length || WORLD_DIMENSIONX);
}

function mapHeight() {
  return Math.max(1, GameMap.grid?.length || WORLD_DIMENSIONY);
}

function inWorldBounds(x, y) {
  return x >= 0 && y >= 0 && x < mapWidth() && y < mapHeight();
}

function cellTypeName(x, y) {
  const cell = GameMap.grid?.[y]?.[x];
  if (cell == null) return null;
  const val = Array.isArray(cell) ? cell[0] : cell;
  return TILE_MAP(val);
}

function isWaterCell(x, y) {
  return cellTypeName(x, y) === "water";
}

function isDetailedMode(scene) {
  return scene?.zoomMixer?.mode !== "overview";
}

function isFriendlyFighter(troop) {
  return !!(troop?.isBrawler || troop?.isBlademaster || troop?.isGunslinger || troop?.isFortGrunt);
}

function isFriendlyWorker(troop) {
  return !!troop && Number(troop.body?.team ?? troop._teamNumber ?? 0) === 1 && !isFriendlyFighter(troop);
}

function getLiveTeamTroops(teamNumber = PLAYER_TEAM) {
  const team = Teams.getTeam?.(teamNumber) ?? Teams.teamLists?.[String(teamNumber)];
  const fromTeam = Array.isArray(team?.playerList) ? team.playerList : [];
  return fromTeam.filter((troop) => troop?.active !== false && troop?.visible !== false);
}

function getLiveEnemies() {
  return (Player.troops || []).filter((troop) =>
    troop?.active !== false &&
    troop?.visible !== false &&
    Number(troop.body?.team ?? troop._teamNumber ?? 0) === 0 &&
    Number(troop.health ?? 1) > 0
  );
}

function textureOrFallback(scene, preferred, fallback) {
  if (preferred && scene?.textures?.exists?.(preferred)) return preferred;
  return fallback;
}

function emitHealParticles(scene, target, color = 0x7cffb2, count = 10) {
  if (!scene || !target) return;
  const baseX = Number(target.sprite?.x ?? target.x ?? 0);
  const baseY = Number(target.sprite?.y ?? target.y ?? 0);
  const spreadX = Math.max(10, Number(target.displayWidth ?? target.sprite?.displayWidth ?? SQUARESIZE) * 0.45);
  const spreadY = Math.max(8, Number(target.displayHeight ?? target.sprite?.displayHeight ?? SQUARESIZE) * 0.35);
  for (let i = 0; i < count; i++) {
    const dot = scene.add.circle(
      baseX + Phaser.Math.Between(-spreadX, spreadX),
      baseY + Phaser.Math.Between(-spreadY, spreadY),
      Phaser.Math.Between(2, 4),
      color,
      0.88
    ).setDepth(HEAL_PARTICLE_DEPTH);
    scene.tweens.add({
      targets: dot,
      y: dot.y - Phaser.Math.Between(20, 42),
      x: dot.x + Phaser.Math.Between(-8, 8),
      alpha: 0,
      scale: 0.25,
      duration: Phaser.Math.Between(520, 820),
      ease: "Sine.easeOut",
      onComplete: () => dot.destroy(),
    });
  }
}

function healTroops(scene, troops, fraction, label, particleColor = 0x7cffb2, textColor = "#7cffb2") {
  let healed = 0;
  for (const troop of troops) {
    const max = Math.max(1, Number(troop.maxHealth ?? troop.health ?? 1));
    const before = Number(troop.health ?? max);
    const next = Math.min(max, before + max * fraction);
    if (next <= before) continue;
    troop.health = next;
    Player.showMiniBarsOnHit?.(troop);
    emitHealParticles(scene, troop, particleColor, 9);
    showGhostText(scene, troop.x, troop.y - 12, label, 1, false, false, textColor);
    healed++;
  }
  return healed;
}

function restoreTroopStamina(scene, troops, fraction, label = "+ST", particleColor = 0x8fe7ff, textColor = "#8fe7ff") {
  let restored = 0;
  for (const troop of troops) {
    const max = Math.max(1, Number(troop.maxStamina ?? troop.stamina ?? 1));
    const before = Number(troop.stamina ?? max);
    const next = Math.min(max, before + (max * fraction));
    if (next <= before) continue;
    troop.stamina = next;
    emitHealParticles(scene, troop, particleColor, 8);
    showGhostText(scene, troop.x, troop.y - 12, label, 1, false, false, textColor);
    restored++;
  }
  return restored;
}

function damageTroop(scene, troop, amount, {
  sourceTeam = 1,
  slowMultiplier = null,
  slowDurationMs = null,
  color = "#ffffff",
} = {}) {
  if (!troop?.active || Number(troop.health ?? 0) <= 0) return false;
  fightManager.applyHitReaction(troop, null, {
    moveSlowMultiplier: slowMultiplier,
    moveSlowDurationMs: slowDurationMs,
  });
  troop.health = Math.max(0, Number(troop.health ?? 0) - amount);
  Player.showMiniBarsOnHit?.(troop);
  showGhostText(scene, troop.x, troop.y - 12, String(Math.round(amount)), sourceTeam, false, false, color);
  if (troop.health <= 0) Player.destroyPlayer(troop);
  return true;
}

function damageStructure(scene, target, amount, color = "#ffad73") {
  if (!target) return false;
  if (target.wallRef) target = target.wallRef;

  if (target instanceof Wall || target.isWall || target.sprite?.isWall) {
    const wall = target.wallRef || target;
    const destroyed = wall.damage?.(amount);
    showGhostText(scene, wall.sprite?.x ?? ((wall.x + 0.5) * SQUARESIZE), (wall.sprite?.y ?? ((wall.y + 0.5) * SQUARESIZE)) - 12, String(Math.round(amount)), 1, false, false, color);
    return !destroyed;
  }

  if (typeof target.takeDamage === "function") {
    target.takeDamage(amount);
    return true;
  }

  const max = Math.max(1, Number(target.maxHealth ?? target.maxHp ?? target.health ?? target.hp ?? amount));
  const before = Number(target.health ?? target.hp ?? max);
  const next = Math.max(0, before - amount);
  if ("health" in target) target.health = next;
  if ("hp" in target) target.hp = next;
  target.onDamaged?.(amount, next, max);
  target.updateHealthBar?.();
  showGhostText(scene, target.sprite?.x ?? target.x * SQUARESIZE, (target.sprite?.y ?? target.y * SQUARESIZE) - 12, String(Math.round(amount)), 1, false, false, color);
  if (next <= 0) target.destroy?.();
  return next > 0;
}

function findNearestEnemyAtWorld(wx, wy, maxDistance = SQUARESIZE * 0.85) {
  let best = null;
  let bestDist = maxDistance;
  for (const enemy of getLiveEnemies()) {
    const d = Phaser.Math.Distance.Between(wx, wy, enemy.x, enemy.y);
    if (d > bestDist) continue;
    best = enemy;
    bestDist = d;
  }
  return best;
}

function getMainIslandBounds(scene) {
  const origin = scene?.parcelManager?.mainIslandOrigin || PARCEL.MAIN_ORIGIN;
  return {
    minX: Number(origin?.x ?? PARCEL.MAIN_ORIGIN.x),
    minY: Number(origin?.y ?? PARCEL.MAIN_ORIGIN.y),
    maxX: Number(origin?.x ?? PARCEL.MAIN_ORIGIN.x) + PARCEL.SIZE - 1,
    maxY: Number(origin?.y ?? PARCEL.MAIN_ORIGIN.y) + PARCEL.SIZE - 1,
  };
}

function isCellInBounds(bounds, x, y) {
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

function getAutoWallCropState(x, y, teamNumber = PLAYER_TEAM) {
  const crop = Teams.getCropAt?.(x, y, teamNumber) ?? null;
  if (crop) {
    return {
      hasCrop: true,
      clearSeedless: crop.hasSeed === false,
    };
  }

  const hasProtectedSpot = !!GameMap._cellHasProtectedFarmSpot?.(x, y, teamNumber);
  const hasActualCrop = !!GameMap._cellHasActualCrop?.(x, y, teamNumber);
  return {
    hasCrop: hasProtectedSpot || hasActualCrop,
    clearSeedless: false,
  };
}

function getAutoWallBuildInfo(bounds, x, y) {
  if (!isCellInBounds(bounds, x, y) || !inWorldBounds(x, y)) return { ok: false };
  if (GameMap.isPlacementTooCloseToShore?.(x, y, 1, 1, { placementType: AUTO_WALL_TYPE }, AUTO_WALL_TYPE)) return { ok: false };
  if (isWaterCell(x, y)) return { ok: false };
  const cropState = getAutoWallCropState(x, y, PLAYER_TEAM);
  if (cropState.hasCrop && !cropState.clearSeedless) return { ok: false };
  if (Wall.getAt?.(x, y)?.active) return { ok: false };
  if (GameMap.navGrid?.[y]?.[x] !== 1) return { ok: false };
  return {
    ok: true,
    clearSeedlessCrop: cropState.clearSeedless,
  };
}

function canAutoWallBuildAt(bounds, x, y) {
  return getAutoWallBuildInfo(bounds, x, y).ok;
}

function forceAutoWallGrassBase(x, y) {
  const row = GameMap.grid?.[y];
  if (!row || row[x] == null) return false;

  const grassVal = TILE_TYPES.grass?.grid ?? 1;
  const current = row[x];
  if (Array.isArray(current)) {
    const overlay = current.slice(1).find((val) => TILE_MAP(val) !== "crops");
    row[x] = overlay == null ? grassVal : [grassVal, overlay];
  } else {
    row[x] = grassVal;
  }

  GameMap._refreshRenderCacheAround?.(x, y);
  GameMap.regionSystem?.markDirty?.();
  GameMap.regionDrawer?.markDirty?.();
  GameMap.enemyRegionSystem?.markDirty?.();
  GameMap.enemyRegionDrawer?.markDirty?.();
  return true;
}

function clearSeedlessCropForAutoWall(scene, x, y) {
  GameMap.clearCropAt?.(x, y, PLAYER_TEAM, { redraw: false });
  if (!forceAutoWallGrassBase(x, y)) return;
  scene?.zoomMixer?.updateOverviewCell?.(x, y, GameMap.grid);
}

function pickAutoWallDoorCell(seg, buildableCells) {
  if (!Array.isArray(seg) || seg.length < 3 || !Array.isArray(buildableCells) || !buildableCells.length) {
    return null;
  }

  const buildableKeys = new Set(buildableCells.map((cell) => gridKey(cell.x, cell.y)));
  const centerIndex = (seg.length - 1) / 2;
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestIndex = Number.POSITIVE_INFINITY;

  for (let i = 1; i < seg.length - 1; i++) {
    const cell = seg[i];
    if (!buildableKeys.has(gridKey(cell.x, cell.y))) continue;
    const prev = seg[i - 1];
    const next = seg[i + 1];
    const straightThrough =
      (prev?.x === cell.x && next?.x === cell.x) ||
      (prev?.y === cell.y && next?.y === cell.y);
    if (!straightThrough) continue;
    const distance = Math.abs(i - centerIndex);
    if (distance < bestDistance || (distance === bestDistance && i < bestIndex)) {
      best = cell;
      bestDistance = distance;
      bestIndex = i;
    }
  }

  return best;
}

function computeAutoWallCells(scene) {
  const bounds = getMainIslandBounds(scene);
  const wallMargin = GameMap.WALL_SHORE_MARGIN ?? 1;
  const minX = Math.ceil(bounds.minX + wallMargin);
  const maxX = Math.floor(bounds.maxX - wallMargin);
  const minY = Math.ceil(bounds.minY + wallMargin);
  const maxY = Math.floor(bounds.maxY - wallMargin);

  if (minX > maxX || minY > maxY) return [];

  const segments = [
    Array.from({ length: maxX - minX + 1 }, (_, index) => ({ x: minX + index, y: minY })),
    Array.from({ length: maxY - minY - 1 }, (_, index) => ({ x: maxX, y: minY + index + 1 })),
    Array.from({ length: maxX - minX + 1 }, (_, index) => ({ x: minX + index, y: maxY })),
    Array.from({ length: maxY - minY - 1 }, (_, index) => ({ x: minX, y: minY + index + 1 })),
  ];

  const out = [];
  for (const seg of segments) {
    const buildableCells = seg
      .map((cell) => ({
        ...cell,
        buildInfo: getAutoWallBuildInfo(bounds, cell.x, cell.y),
      }))
      .filter((cell) => cell.buildInfo.ok);
    if (!buildableCells.length) continue;
    const door = pickAutoWallDoorCell(seg, buildableCells);
    const doorKey = door ? gridKey(door.x, door.y) : null;
    for (const cell of buildableCells) {
      out.push({
        x: cell.x,
        y: cell.y,
        tileType: gridKey(cell.x, cell.y) === doorKey ? AUTO_WALL_DOOR_TYPE : AUTO_WALL_TYPE,
        clearSeedlessCrop: !!cell.buildInfo.clearSeedlessCrop,
      });
    }
  }
  return out;
}

function placeAutoWallDoor(scene, x, y, teamNumber = 1) {
  const def = TILE_TYPES[AUTO_WALL_DOOR_TYPE];
  const current = GameMap.grid?.[y]?.[x];
  if (!def || current == null) return false;

  const floorVal = Array.isArray(current) ? current[0] : current;

  GameMap.grid[y][x] = [floorVal, def.grid];
  GameMap._refreshRenderCacheAround?.(x, y);
  if (GameMap.navGrid?.[y]) GameMap.navGrid[y][x] = 1;
  if (GameMap.enemyNavGrid?.[y]) GameMap.enemyNavGrid[y][x] = 0;
  Wall.ensureAt(scene, x, y, teamNumber);
  return true;
}

function placeWallCells(scene, cells) {
  if (!cells.length) return { total: 0, walls: 0, doors: 0 };
  let walls = 0;
  let doors = 0;
  const refreshKeys = new Set();
  for (const cell of cells) {
    const tileType = cell.tileType === AUTO_WALL_DOOR_TYPE ? AUTO_WALL_DOOR_TYPE : AUTO_WALL_TYPE;
    const isDoor = tileType === AUTO_WALL_DOOR_TYPE;
    let placed = false;

    if (GameMap.isPlacementTooCloseToShore?.(cell.x, cell.y, 1, 1, { placementType: tileType }, tileType)) {
      continue;
    }

    if (cell.clearSeedlessCrop) {
      clearSeedlessCropForAutoWall(scene, cell.x, cell.y);
    }

    if (isDoor) {
      placed = placeAutoWallDoor(scene, cell.x, cell.y, 1);
    } else {
      if (GameMap.navGrid?.[cell.y]) GameMap.navGrid[cell.y][cell.x] = 0;
      if (GameMap.enemyNavGrid?.[cell.y]) GameMap.enemyNavGrid[cell.y][cell.x] = 0;
      GameMap.placeTile(cell.x, cell.y, AUTO_WALL_TYPE);
      Wall.ensureAt(scene, cell.x, cell.y, 1);
      placed = true;
    }

    if (!placed) continue;
    if (isDoor) doors += 1;
    else walls += 1;
    for (let yy = cell.y - 1; yy <= cell.y + 1; yy++) {
      for (let xx = cell.x - 1; xx <= cell.x + 1; xx++) {
        if (!inWorldBounds(xx, yy)) continue;
        refreshKeys.add(gridKey(xx, yy));
      }
    }
  }
  for (const cell of cells) {
    GameMap.refreshWallShapesAround?.(cell.x, cell.y);
  }
  for (const key of refreshKeys) {
    const [x, y] = key.split(",").map(Number);
    Wall.ensureAt(scene, x, y, 1);
  }
  scene.refreshParcelArea?.({
    x: Math.min(...cells.map((cell) => cell.x)),
    y: Math.min(...cells.map((cell) => cell.y)),
    w: Math.max(...cells.map((cell) => cell.x)) - Math.min(...cells.map((cell) => cell.x)) + 1,
    h: Math.max(...cells.map((cell) => cell.y)) - Math.min(...cells.map((cell) => cell.y)) + 1,
    parcelTag: "main",
  });
  if (!scene.refreshParcelArea) {
    scene.rebuildBothNavMeshes?.();
    scene.zoomMixer?.buildOverviewTextureFromGrid?.(GameMap.grid, SQUARESIZE, (cell) => colorFor(cell));
  }
  GameMap.regionSystem?.markDirty?.();
  GameMap.regionDrawer?.markDirty?.();
  GameMap.enemyRegionSystem?.markDirty?.();
  GameMap.enemyRegionDrawer?.markDirty?.();
  GameMap.enemyRegionSystem?.ensureUpToDate?.();
  GameMap.siegePlanner = null;
  return { total: walls + doors, walls, doors };
}

function findBuildingAtGrid(gx, gy) {
  for (const [teamId, team] of Object.entries(Teams.teamLists || {})) {
    if (String(teamId) !== PLAYER_TEAM) continue;
    for (const entry of team?.buildings || []) {
      const building = entry?.[3]?.buildingRef || entry?.buildingRef || entry?.building;
      const type = building?.tileType || entry?.[2] || {};
      const bx = Number(building?.x ?? entry?.[0]);
      const by = Number(building?.y ?? entry?.[1]);
      const lenX = Math.max(1, Number(type?.lenX ?? 1));
      const lenY = Math.max(1, Number(type?.lenY ?? 1));
      if (!Number.isFinite(bx) || !Number.isFinite(by)) continue;
      if (gx >= bx && gx < bx + lenX && gy >= by && gy < by + lenY) return building;
    }
  }
  return null;
}

function describeFortifyTarget(target) {
  if (!target) return null;
  if (target.wallRef) target = target.wallRef;
  if (target.buildingRef) target = target.buildingRef;

  if (target instanceof Wall || target.isWall || target.sprite?.isWall) {
    const wall = target.wallRef || target;
    if (!wall?.active || Number(wall.team ?? PLAYER_TEAM) !== Number(PLAYER_TEAM)) return null;
    return {
      kind: "wall",
      label: "Wall",
      value: wall,
      x: wall.x,
      y: wall.y,
      w: 1,
      h: 1,
    };
  }

  const type = target.tileType || target.type || {};
  const teamNumber = Number(target.teamNumber ?? target.team ?? PLAYER_TEAM);
  if (teamNumber !== Number(PLAYER_TEAM)) return null;
  return {
    kind: "building",
    label: target.tileType?.label || target.tileType?.name || "Building",
    value: target,
    x: Number(target.x ?? target.gridX ?? 0),
    y: Number(target.y ?? target.gridY ?? 0),
    w: Math.max(1, Number(type.lenX ?? 1)),
    h: Math.max(1, Number(type.lenY ?? 1)),
  };
}

function findFortifyTargetAtGrid(gx, gy) {
  const wall = Wall.getAt?.(gx, gy);
  const wallTarget = describeFortifyTarget(wall);
  if (wallTarget) return wallTarget;

  return describeFortifyTarget(findBuildingAtGrid(gx, gy));
}

function findFortifyTargetFromPointer(scene, pointer) {
  const cam = scene?.cameras?.main;
  const hits = scene?.input?.manager?.hitTest?.(pointer, scene?.children?.list || [], cam) || [];
  for (const hit of hits) {
    const target = describeFortifyTarget(hit?.wallRef || hit?.buildingRef || hit);
    if (target) return target;
  }
  return null;
}

function isValidPlacementCell(gx, gy) {
  if (!inWorldBounds(gx, gy) || isWaterCell(gx, gy)) return false;
  if (GameMap.navGrid?.[gy]?.[gx] !== 1) return false;
  if (GameMap.checkBlockPositionGen?.(gx, gy, 1, 1)) return false;
  return true;
}

function applyFortify(scene, target) {
  if (!target?.value) return false;
  const obj = target.value;

  if (target.kind === "wall") {
    const originalMax = Math.max(1, Number(obj.maxHp ?? obj.hp ?? 1));
    obj.maxHp = Math.ceil(originalMax * 1.25);
    obj.hp = obj.maxHp;
    obj._applyVisuals?.();
    emitHealParticles(scene, { x: (obj.x + 0.5) * SQUARESIZE, y: (obj.y + 0.5) * SQUARESIZE }, 0x72f7d0, 14);
    showGhostText(scene, (obj.x + 0.5) * SQUARESIZE, (obj.y + 0.5) * SQUARESIZE - 12, "FORTIFIED", 1, false, false, "#9dffa5");
    scene.time.delayedCall(FORTIFY_MS, () => {
      if (!obj.active) return;
      obj.maxHp = originalMax;
      obj.hp = Math.min(obj.hp, obj.maxHp);
      obj._applyVisuals?.();
    });
    return true;
  }

  const originalMax = Math.max(1, Number(obj.maxHealth ?? obj.maxHp ?? obj.health ?? obj.hp ?? 1));
  const boosted = Math.ceil(originalMax * 1.25);
  if ("maxHealth" in obj) obj.maxHealth = boosted;
  if ("maxHp" in obj) obj.maxHp = boosted;
  if ("health" in obj) obj.health = boosted;
  if ("hp" in obj) obj.hp = boosted;
  obj.updateHealthBar?.();
  obj.onDamaged?.(0, boosted, boosted);
  emitHealParticles(scene, obj, 0x72f7d0, 16);
  showGhostText(scene, obj.sprite?.x ?? ((target.x + 0.5) * SQUARESIZE), (obj.sprite?.y ?? ((target.y + 0.5) * SQUARESIZE)) - 12, "FORTIFIED", 1, false, false, "#9dffa5");
  scene.time.delayedCall(FORTIFY_MS, () => {
    if (obj.sprite && obj.sprite.active === false) return;
    if ("maxHealth" in obj) obj.maxHealth = originalMax;
    if ("maxHp" in obj) obj.maxHp = originalMax;
    if ("health" in obj) obj.health = Math.min(obj.health, originalMax);
    if ("hp" in obj) obj.hp = Math.min(obj.hp, originalMax);
    obj.updateHealthBar?.();
  });
  return true;
}

function buildChain(startEnemy) {
  const chain = [];
  const visited = new Set();
  let current = startEnemy;
  const range = SQUARESIZE * 4.25;
  while (current && chain.length < 8) {
    chain.push(current);
    visited.add(current);
    let best = null;
    let bestDist = range;
    for (const enemy of getLiveEnemies()) {
      if (visited.has(enemy)) continue;
      const d = Phaser.Math.Distance.Between(current.x, current.y, enemy.x, enemy.y);
      if (d > bestDist) continue;
      best = enemy;
      bestDist = d;
    }
    current = best;
  }
  return chain;
}

function ensureMarketAnimations(scene) {
  if (!scene?.anims) return;
  const zapKey = MARKET_REAL_ASSETS.world.chainZapper;
  if (scene.textures?.exists?.(zapKey) && !scene.anims.exists("market_chain_zapper_anim")) {
    scene.anims.create({
      key: "market_chain_zapper_anim",
      frames: scene.anims.generateFrameNumbers(zapKey, { start: 0, end: 2 }),
      frameRate: 18,
      repeat: 2,
    });
  }
  const meteorKey = MARKET_REAL_ASSETS.world.meteorDrop;
  if (scene.textures?.exists?.(meteorKey) && !scene.anims.exists("market_meteor_drop_anim")) {
    scene.anims.create({
      key: "market_meteor_drop_anim",
      frames: scene.anims.generateFrameNumbers(meteorKey, { start: 0, end: 2 }),
      frameRate: 12,
      repeat: -1,
    });
  }
}

function drawZapSegment(scene, a, b) {
  const key = textureOrFallback(scene, MARKET_REAL_ASSETS.world.chainZapper, null);
  if (!key) {
    const graphics = scene.add.graphics().setDepth((UIDEPTH ?? 10) + 120);
    graphics.lineStyle(5, 0xa7f0ff, 0.8);
    graphics.strokeLineShape(new Phaser.Geom.Line(a.x, a.y, b.x, b.y));
    scene.time.delayedCall(180, () => graphics.destroy());
    return;
  }
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const length = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
  const zap = scene.add.sprite(midX, midY, key)
    .setDepth((UIDEPTH ?? 10) + 122)
    .setRotation(Phaser.Math.Angle.Between(a.x, a.y, b.x, b.y))
    .setDisplaySize(Math.max(SQUARESIZE * 0.5, length), SQUARESIZE * 0.42)
    .setAlpha(0.95);
  zap.play?.("market_chain_zapper_anim");
  scene.tweens.add({
    targets: zap,
    alpha: 0,
    duration: 300,
    ease: "Sine.easeOut",
    onComplete: () => zap.destroy(),
  });
}

function applyChainZapper(scene, startEnemy) {
  const chain = buildChain(startEnemy);
  if (!chain.length) return 0;
  ensureMarketAnimations(scene);
  AudioManager.playShockerZap?.(null, {
    volume: Phaser.Math.Clamp(0.2 + chain.length * 0.035, 0.22, 0.48),
    rate: Phaser.Math.Clamp(1.08 - chain.length * 0.018, 0.88, 1.1),
  });
  for (let i = 0; i < chain.length - 1; i++) {
    drawZapSegment(scene, chain[i], chain[i + 1]);
  }
  chain.forEach((enemy, index) => {
    scene.tweens.add({
      targets: enemy,
      alpha: 0.45,
      duration: 60,
      yoyo: true,
      repeat: 2,
    });
    damageTroop(scene, enemy, index === 0 ? 145 : 95, {
      sourceTeam: 1,
      slowMultiplier: 0.45,
      slowDurationMs: 1200,
      color: "#a7f0ff",
    });
  });
  return chain.length;
}

function applyMeteorImpact(scene, target, radius = SQUARESIZE * 3.2) {
  AudioManager.playMeteorImpact?.({ volume: 0.5 });
  scene.cameras?.main?.shake?.(240, 0.008);
  playSmokeClearing(scene, target.x, target.y, {
    width: radius * 1.15,
    height: radius * 1.15,
  });
  const graphics = scene.add.graphics().setDepth((UIDEPTH ?? 10) + 120);
  graphics.fillStyle(0xff743d, 0.28);
  graphics.fillCircle(target.x, target.y, radius);
  graphics.lineStyle(4, 0xffd08a, 0.85);
  graphics.strokeCircle(target.x, target.y, radius);
  scene.tweens.add({
    targets: graphics,
    alpha: 0,
    duration: 360,
    ease: "Quad.easeOut",
    onComplete: () => graphics.destroy(),
  });

  let hits = 0;
  for (const troop of (Player.troops || []).slice()) {
    if (!troop?.active || Number(troop.health ?? 0) <= 0) continue;
    if (Phaser.Math.Distance.Between(target.x, target.y, troop.x, troop.y) > radius) continue;
    const team = Number(troop.body?.team ?? troop._teamNumber ?? 0);
    damageTroop(scene, troop, team === 0 ? 210 : 28, { sourceTeam: 1, color: "#ffad73" });
    hits++;
  }

  const children = GameMap.structureBarrier?.getChildren?.() || [];
  const seen = new Set();
  for (const hit of children) {
    const targetObj = hit?.wallRef || hit?.buildingRef;
    if (!targetObj || seen.has(targetObj)) continue;
    const hx = hit.x ?? targetObj.sprite?.x ?? ((targetObj.x + 0.5) * SQUARESIZE);
    const hy = hit.y ?? targetObj.sprite?.y ?? ((targetObj.y + 0.5) * SQUARESIZE);
    if (Phaser.Math.Distance.Between(target.x, target.y, hx, hy) > radius) continue;
    seen.add(targetObj);
    damageStructure(scene, targetObj, 28, "#ffad73");
    hits++;
  }
  return hits;
}

function applyMeteor(scene, target) {
  const radius = SQUARESIZE * 3.2;
  ensureMarketAnimations(scene);
  AudioManager.playMeteorFlyby?.({ volume: 0.42 });
  const key = textureOrFallback(scene, MARKET_REAL_ASSETS.world.meteorDrop, null);
  if (!key) return applyMeteorImpact(scene, target, radius);

  const start = {
    x: target.x - SQUARESIZE * 5.2,
    y: target.y - SQUARESIZE * 5.7,
  };
  const meteor = scene.add.sprite(start.x, start.y, key)
    .setDepth((UIDEPTH ?? 10) + 130)
    .setRotation(Phaser.Math.Angle.Between(start.x, start.y, target.x, target.y))
    .setScale(2.35)
    .setAlpha(0.98);
  meteor.play?.("market_meteor_drop_anim");

  const shadow = scene.add.ellipse(target.x, target.y, SQUARESIZE * 0.5, SQUARESIZE * 0.22, 0x000000, 0.26)
    .setDepth((UIDEPTH ?? 10) + 2)
    .setScale(0.35);
  const travelMs = 1420;
  scene.tweens.add({ targets: shadow, scaleX: 1.8, scaleY: 1.2, alpha: 0.42, duration: travelMs - 80, ease: "Quad.easeIn" });

  let hits = 0;
  scene.tweens.add({
    targets: meteor,
    x: target.x,
    y: target.y,
    scale: 0.74,
    duration: travelMs,
    ease: "Quad.easeIn",
    onComplete: () => {
      meteor.destroy();
      shadow.destroy();
      hits = applyMeteorImpact(scene, target, radius);
    },
  });
  return hits;
}

function spawnShockMine(scene, gx, gy) {
  const pos = centerOfCell(gx, gy);
  const spriteKey = textureOrFallback(scene, MARKET_REAL_ASSETS.world.shockMine, MARKET_PLACEHOLDER_ASSETS.ghosts.shockMine);
  const sprite = scene.add.image(pos.x, pos.y, spriteKey)
    .setDisplaySize(SQUARESIZE * 0.9, SQUARESIZE * 0.9)
    .setDepth((UIDEPTH ?? 10) + 2)
    .setAlpha(0.94);
  scene.tweens.add({
    targets: sprite,
    alpha: 0.62,
    scale: 1.08,
    duration: 720,
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut",
  });
  const mine = { active: true, sprite, timer: null };
  const trigger = () => {
    if (!mine.active) return;
    const close = getLiveEnemies().find((enemy) => Phaser.Math.Distance.Between(pos.x, pos.y, enemy.x, enemy.y) <= SQUARESIZE * 0.95);
    if (!close) return;
    mine.active = false;
    mine.timer?.remove(false);
    AudioManager.playShockerZap?.(null, { volume: 0.42, rate: 0.9 });

    const radius = SQUARESIZE * 2.15;
    const graphics = scene.add.graphics().setDepth((UIDEPTH ?? 10) + 120);
    graphics.fillStyle(0xb28cff, 0.22);
    graphics.fillCircle(pos.x, pos.y, radius);
    graphics.lineStyle(3, 0xb28cff, 0.88);
    graphics.strokeCircle(pos.x, pos.y, radius);
    scene.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: 260,
      onComplete: () => graphics.destroy(),
    });
    for (const enemy of getLiveEnemies()) {
      if (Phaser.Math.Distance.Between(pos.x, pos.y, enemy.x, enemy.y) > radius) continue;
      damageTroop(scene, enemy, 100, {
        sourceTeam: 1,
        slowMultiplier: 0.35,
        slowDurationMs: 1800,
        color: "#d2b7ff",
      });
    }
    sprite.destroy();
  };
  mine.timer = scene.time.addEvent({ delay: 160, loop: true, callback: trigger });
  scene.time.delayedCall(90_000, () => {
    if (!mine.active) return;
    mine.active = false;
    mine.timer?.remove(false);
    sprite.destroy();
  });
  showGhostText(scene, pos.x, pos.y - 12, "ARMED", 1, false, false, "#d2b7ff");
  return mine;
}

export function useConsumableCard(scene, cardOrId) {
  const card = getMarketCardDefinition(cardOrId);
  if (!card || card.kind !== MARKET_CARD_KIND.CONSUMABLE) {
    return { ok: false, message: "That card is not a consumable" };
  }

  if (!isDetailedMode(scene)) {
    return { ok: false, message: "Zoom in to use cards" };
  }

  if (card.activation === "team_heal") {
    const healed = healTroops(scene, getLiveTeamTroops(PLAYER_TEAM), 0.5, "+HP", 0x6da8ff, "#8fbaff");
    return { ok: healed > 0, message: healed > 0 ? `Healed ${healed} team members` : "No team members needed healing" };
  }

  if (card.activation === "fighter_heal") {
    const healed = healTroops(scene, getLiveTeamTroops(PLAYER_TEAM).filter(isFriendlyFighter), 0.7, "+HP", 0xff5b6e, "#ff8ba8");
    return { ok: healed > 0, message: healed > 0 ? `Healed ${healed} fighters` : "No fighters needed healing" };
  }

  if (card.activation === "worker_heal") {
    const healed = healTroops(scene, getLiveTeamTroops(PLAYER_TEAM).filter(isFriendlyWorker), 0.7, "+HP", 0x61f28e, "#7cffb2");
    return { ok: healed > 0, message: healed > 0 ? `Healed ${healed} workers` : "No workers needed healing" };
  }

  if (card.activation === "second_wind_bell") {
    const restored = restoreTroopStamina(
      scene,
      getLiveTeamTroops(PLAYER_TEAM),
      SECOND_WIND_STAMINA_FRACTION,
      "+ST",
      0x8fe7ff,
      "#8fe7ff"
    );
    return { ok: restored > 0, message: restored > 0 ? "Second Wind Bell rang out" : "No team members needed stamina" };
  }

  if (card.activation === "adrenaline_draft") {
    let buffed = 0;
    const now = scene.getSimulationNow?.() ?? scene.simNowMs ?? scene.time?.now ?? 0;
    const until = now + ADRENALINE_MS;
    for (const troop of getLiveTeamTroops(PLAYER_TEAM)) {
      if (!troop.active) continue;
      setMarketAdrenalineBuff(troop, until);
      buffed++;
      emitHealParticles(scene, troop, 0xfff17a, 7);
      showGhostText(scene, troop.x, troop.y - 12, "TEMPO", 1, false, false, "#fff17a");
    }
    scene.time.delayedCall(ADRENALINE_MS, () => {
      const checkNow = scene.getSimulationNow?.() ?? scene.simNowMs ?? scene.time?.now ?? 0;
      for (const troop of getLiveTeamTroops(PLAYER_TEAM)) {
        clearExpiredMarketAdrenalineBuff(troop, checkNow);
      }
    });
    if (buffed > 0) scene.events?.emit?.("market:adrenaline-changed", { until, duration: ADRENALINE_MS });
    return { ok: buffed > 0, message: buffed > 0 ? "Adrenaline Draft active" : "No team members to buff" };
  }

  if (card.activation === "melee_crit_buff") {
    const targets = getLiveTeamTroops(PLAYER_TEAM).filter((entry) => entry?.isBrawler || entry?.isBlademaster);
    if (!targets.length) {
      return { ok: false, message: "No melee fighters are ready for Killer Instinct" };
    }
    const now = scene.getSimulationNow?.() ?? scene.simNowMs ?? scene.time?.now ?? 0;
    const until = setSceneMarketBuff(scene, "meleeCrit", now + MELEE_CRIT_MS);
    clearExpiredSceneMarketBuffs(scene, now);
    scene.events?.emit?.("market:timed-buff-changed", { key: "meleeCrit", until, duration: MELEE_CRIT_MS });
    scene.time.delayedCall(MELEE_CRIT_MS, () => {
      const checkNow = scene.getSimulationNow?.() ?? scene.simNowMs ?? scene.time?.now ?? 0;
      if (clearExpiredSceneMarketBuffs(scene, checkNow)) {
        scene.events?.emit?.("market:timed-buff-changed", { key: "meleeCrit", until: 0, duration: 0 });
      }
    });
    for (const troop of targets) {
      emitHealParticles(scene, troop, 0xff8a6b, 6);
      showGhostText(scene, troop.x, troop.y - 12, "CRIT", 1, false, false, "#ffb18f");
    }
    return { ok: true, message: "Killer Instinct active" };
  }

  if (card.activation === "projectile_crit_buff") {
    const targets = getLiveTeamTroops(PLAYER_TEAM).filter((entry) => entry?.weapon?.projectile);
    if (!targets.length) {
      return { ok: false, message: "No projectile fighters are ready for Deadeye Volley" };
    }
    const now = scene.getSimulationNow?.() ?? scene.simNowMs ?? scene.time?.now ?? 0;
    const until = setSceneMarketBuff(scene, "projectileCrit", now + PROJECTILE_CRIT_MS);
    clearExpiredSceneMarketBuffs(scene, now);
    scene.events?.emit?.("market:timed-buff-changed", { key: "projectileCrit", until, duration: PROJECTILE_CRIT_MS });
    scene.time.delayedCall(PROJECTILE_CRIT_MS, () => {
      const checkNow = scene.getSimulationNow?.() ?? scene.simNowMs ?? scene.time?.now ?? 0;
      if (clearExpiredSceneMarketBuffs(scene, checkNow)) {
        scene.events?.emit?.("market:timed-buff-changed", { key: "projectileCrit", until: 0, duration: 0 });
      }
    });
    for (const troop of targets) {
      emitHealParticles(scene, troop, 0xffd166, 6);
      showGhostText(scene, troop.x, troop.y - 12, "DEADEYE", 1, false, false, "#ffe29b");
    }
    return { ok: true, message: "Deadeye Volley active" };
  }

  return { ok: false, message: "That consumable has no effect yet" };
}

export class MarketCardUseController {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.card = null;
    this.activation = null;
    this.options = {};
    this.hover = null;
    this.selected = null;
    this.autoWallCells = [];
    this.graphics = null;
    this._cursorGuard = null;
  }

  begin(cardOrId, options = {}) {
    const card = getMarketCardDefinition(cardOrId);
    if (!card || !TARGETED_MARKET_ACTIVATIONS.has(card.activation)) {
      showAlert(this.scene, "That card cannot target the world", "#ffaaaa");
      return false;
    }
    if (!isDetailedMode(this.scene)) {
      showAlert(this.scene, "Zoom in to use cards", "#ffaaaa");
      return false;
    }

    this.cancel(null, { silent: true });
    loadMarketCardPlaceholderAssets(this.scene);
    this.card = card;
    this.activation = card.activation;
    this.options = options || {};
    this.active = true;
    this.hover = null;
    this.selected = null;
    this.autoWallCells = this.activation === "auto_wall" ? computeAutoWallCells(this.scene) : [];
    this.graphics = this.scene.add.graphics().setDepth((UIDEPTH ?? 10) + 140);

    this._attachCursorGuard();
    this._enforceCursor();
    this._setCommandContext();
    this._updateFromPointer(this.scene.input.activePointer);
    this._drawPreview();
    AudioManager.playCardArm?.();
    return true;
  }

  cancel(message = null, { silent = false } = {}) {
    if (!this.active && !this.card) return;
    const card = this.card;
    const onCancel = this.options?.onCancel;
    this._cleanup();
    if (!silent) {
      onCancel?.(card);
      if (message) showAlert(this.scene, message, "#d3edf9");
    }
  }

  onPointerMove(pointer) {
    if (!this.active) return false;
    this._updateFromPointer(pointer);
    this._enforceCursor();
    this._drawPreview();
    return true;
  }

  onPointerDown(pointer) {
    if (!this.active || pointer?.button !== 0) return false;
    this._updateFromPointer(pointer);
    if (this.activation !== "auto_wall") this.selected = this.hover;
    this._enforceCursor();
    this._drawPreview();
    if (INSTANT_TARGET_ACTIVATIONS.has(this.activation) && this.canConfirm()) {
      this.confirm();
    }
    return true;
  }

  canConfirm() {
    if (!this.active) return false;
    if (this.activation === "auto_wall") return this.autoWallCells.length > 0;
    if (this.activation === "chain_zapper") return !!this.selected?.enemy;
    if (this.activation === "meteor_drop") return Number.isFinite(this.selected?.x) && Number.isFinite(this.selected?.y);
    if (this.activation === "fortify_patch") return !!this.selected?.target;
    if (this.activation === "shock_mine") return !!this.selected?.valid;
    return false;
  }

  confirm() {
    if (!this.active || !this.canConfirm()) {
      AudioManager.playError?.();
      return false;
    }

    let result = { ok: false, message: "Card failed" };
    if (this.activation === "auto_wall") {
      const placed = placeWallCells(this.scene, this.autoWallCells);
      const doorSuffix = placed.doors > 0 ? ` with ${placed.doors} doors` : "";
      result = { ok: placed.total > 0, message: placed.total > 0 ? `Placed ${placed.total} wall segments${doorSuffix}` : "No valid wall cells" };
    } else if (this.activation === "chain_zapper") {
      const hits = applyChainZapper(this.scene, this.selected.enemy);
      result = { ok: hits > 0, message: hits > 0 ? `Zapped ${hits} enemies` : "No valid enemy chain" };
    } else if (this.activation === "meteor_drop") {
      const hits = applyMeteor(this.scene, this.selected);
      result = { ok: true, message: hits > 0 ? `Meteor hit ${hits} targets` : "Meteor dropped" };
    } else if (this.activation === "fortify_patch") {
      const ok = applyFortify(this.scene, this.selected.target);
      result = { ok, message: ok ? "Target fortified" : "No valid fortify target" };
    } else if (this.activation === "shock_mine") {
      spawnShockMine(this.scene, this.selected.gx, this.selected.gy);
      result = { ok: true, message: "Shock Mine armed" };
    }

    if (!result.ok) {
      showAlert(this.scene, result.message || "Card failed", "#ffaaaa");
      AudioManager.playError?.();
      return false;
    }

    const card = this.card;
    const complete = this.options?.onComplete;
    this._cleanup();
    AudioManager.playCardConfirmUse?.();
    showAlert(this.scene, result.message, "#aaffaa");
    complete?.(card, result);
    return true;
  }

  _cursorForActivation() {
    if (this.activation === "chain_zapper" || this.activation === "meteor_drop") return "crosshair";
    if (this.activation === "fortify_patch") return "cell";
    return "copy";
  }

  _needsManualConfirm() {
    return this.activation === "auto_wall";
  }

  _attachCursorGuard() {
    this._detachCursorGuard();
    this._cursorGuard = () => this._enforceCursor();
    this.scene.input?.on?.("gameobjectover", this._cursorGuard);
    this.scene.input?.on?.("gameobjectout", this._cursorGuard);
    this.scene.input?.on?.("gameobjectmove", this._cursorGuard);
    this.scene.input?.on?.("pointermove", this._cursorGuard);
  }

  _detachCursorGuard() {
    if (!this._cursorGuard) return;
    this.scene.input?.off?.("gameobjectover", this._cursorGuard);
    this.scene.input?.off?.("gameobjectout", this._cursorGuard);
    this.scene.input?.off?.("gameobjectmove", this._cursorGuard);
    this.scene.input?.off?.("pointermove", this._cursorGuard);
    this._cursorGuard = null;
  }

  _enforceCursor(cursor = null) {
    const nextCursor = cursor || this._cursorForActivation();
    this.scene.input.setDefaultCursor(nextCursor);
    const canvas = this.scene?.input?.manager?.canvas || this.scene?.game?.canvas;
    if (canvas?.style) canvas.style.cursor = nextCursor;
  }

  _setCommandContext() {
    this.scene.uiScene?.selectionCommandBar?.setContext?.(CONTEXT_SOURCE, {
      helperText: () => this._helperText(),
      buttons: () => {
        const buttons = [
          {
            id: "cancel-card",
            label: "CANCEL",
            styleKey: "cancel",
            onClick: () => this.cancel(),
          },
        ];
        if (this._needsManualConfirm()) {
          buttons.push({
            id: "confirm-card",
            label: "CONFIRM USE",
            styleKey: "confirm",
            disabled: () => !this.canConfirm(),
            active: () => this.canConfirm(),
            onClick: () => this.confirm(),
          });
        }
        return buttons;
      },
    });
  }

  _helperText() {
    if (!this.card) return "";
    if (this.activation === "auto_wall") {
      const doorCount = this.autoWallCells.filter((cell) => cell.tileType === AUTO_WALL_DOOR_TYPE).length;
      return this.autoWallCells.length
        ? `AUTO WALL | Previewing ${this.autoWallCells.length} valid wall cells${doorCount ? ` with ${doorCount} doors` : ""}`
        : "AUTO WALL | No valid perimeter cells found";
    }
    if (this.activation === "chain_zapper") {
      return this.hover?.enemy ? "CHAIN ZAPPER | Click a raider to fire the chain" : "CHAIN ZAPPER | Hover a raider and click to fire";
    }
    if (this.activation === "meteor_drop") {
      return Number.isFinite(this.hover?.x) ? "METEOR DROP | Click a point to drop the strike" : "METEOR DROP | Move over a target area";
    }
    if (this.activation === "fortify_patch") {
      return this.hover?.target ? `FORTIFY PATCH | Hovering ${this.hover.target.label} | Click to fortify` : "FORTIFY PATCH | Hover a building or wall";
    }
    if (this.activation === "shock_mine") {
      return this.hover?.valid ? "SHOCK MINE | Click to arm the mine" : "SHOCK MINE | Hover a valid empty tile";
    }
    return `${this.card.name} | Select target`;
  }

  _updateFromPointer(pointer) {
    if (!pointer || !this.active) return;
    const grid = worldToGrid(pointer);
    const world = {
      x: Number(pointer.worldX ?? 0),
      y: Number(pointer.worldY ?? 0),
    };

    if (this.activation === "chain_zapper") {
      this.hover = { enemy: findNearestEnemyAtWorld(world.x, world.y) };
      return;
    }

    if (this.activation === "meteor_drop") {
      this.hover = { x: world.x, y: world.y, gx: grid.x, gy: grid.y };
      return;
    }

    if (this.activation === "fortify_patch") {
      const target = findFortifyTargetFromPointer(this.scene, pointer) || findFortifyTargetAtGrid(grid.x, grid.y);
      this.hover = { gx: grid.x, gy: grid.y, target };
      return;
    }

    if (this.activation === "shock_mine") {
      const valid = isValidPlacementCell(grid.x, grid.y);
      this.hover = { gx: grid.x, gy: grid.y, valid };
    }
  }

  _drawPreview() {
    if (!this.graphics) return;
    const g = this.graphics;
    g.clear();

    if (this.activation === "auto_wall") {
      for (const cell of this.autoWallCells) {
        const isDoor = cell.tileType === AUTO_WALL_DOOR_TYPE;
        g.fillStyle(isDoor ? 0xffd978 : 0x7bd9ff, isDoor ? 0.24 : 0.18);
        g.lineStyle(2, isDoor ? 0xfff2b3 : 0x7bd9ff, 0.84);
        g.fillRect(cell.x * SQUARESIZE + 2, cell.y * SQUARESIZE + 2, SQUARESIZE - 4, SQUARESIZE - 4);
        g.strokeRect(cell.x * SQUARESIZE + 2, cell.y * SQUARESIZE + 2, SQUARESIZE - 4, SQUARESIZE - 4);
      }
      return;
    }

    if (this.activation === "chain_zapper") {
      const enemy = this.selected?.enemy || this.hover?.enemy;
      if (!enemy) return;
      g.lineStyle(3, 0xa7f0ff, 0.95);
      g.strokeCircle(enemy.x, enemy.y, SQUARESIZE * 0.75);
      const chain = buildChain(enemy);
      g.lineStyle(2, 0xa7f0ff, 0.42);
      for (let i = 0; i < chain.length - 1; i++) {
        g.strokeLineShape(new Phaser.Geom.Line(chain[i].x, chain[i].y, chain[i + 1].x, chain[i + 1].y));
      }
      return;
    }

    if (this.activation === "meteor_drop") {
      const target = this.selected || this.hover;
      if (!Number.isFinite(target?.x) || !Number.isFinite(target?.y)) return;
      const radius = SQUARESIZE * 3.2;
      g.fillStyle(0xff743d, 0.14);
      g.fillCircle(target.x, target.y, radius);
      g.lineStyle(3, 0xffad73, 0.8);
      g.strokeCircle(target.x, target.y, radius);
      g.lineStyle(2, 0xffe0a8, 0.8);
      g.strokeCircle(target.x, target.y, 8);
      return;
    }

    if (this.activation === "fortify_patch") {
      const target = (this.selected?.target || this.hover?.target);
      if (!target) return;
      const x = target.x * SQUARESIZE;
      const y = target.y * SQUARESIZE;
      g.fillStyle(0x9dffa5, 0.14);
      g.fillRect(x, y, target.w * SQUARESIZE, target.h * SQUARESIZE);
      g.lineStyle(3, 0x9dffa5, 0.9);
      g.strokeRect(x + 2, y + 2, target.w * SQUARESIZE - 4, target.h * SQUARESIZE - 4);
      return;
    }

    if (this.activation === "shock_mine") {
      const target = this.selected || this.hover;
      if (!target) return;
      const color = target.valid ? 0xb28cff : 0xff5555;
      const alpha = target.valid ? 0.28 : 0.18;
      g.fillStyle(color, alpha);
      g.fillRect(target.gx * SQUARESIZE + 3, target.gy * SQUARESIZE + 3, SQUARESIZE - 6, SQUARESIZE - 6);
      g.lineStyle(3, color, target.valid ? 0.85 : 0.65);
      g.strokeRect(target.gx * SQUARESIZE + 3, target.gy * SQUARESIZE + 3, SQUARESIZE - 6, SQUARESIZE - 6);
    }
  }

  _cleanup() {
    this.scene.uiScene?.selectionCommandBar?.clearContext?.(CONTEXT_SOURCE);
    this._detachCursorGuard();
    this._enforceCursor("default");
    this.graphics?.destroy();
    this.graphics = null;
    this.active = false;
    this.card = null;
    this.activation = null;
    this.options = {};
    this.hover = null;
    this.selected = null;
    this.autoWallCells = [];
  }
}

export function getMarketCardUseController(scene) {
  if (!scene) return null;
  if (!scene.marketCardUseController) {
    scene.marketCardUseController = new MarketCardUseController(scene);
  }
  return scene.marketCardUseController;
}
