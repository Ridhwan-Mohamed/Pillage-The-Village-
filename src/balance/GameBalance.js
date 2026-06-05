const RECRUIT_BASE_COSTS = Object.freeze({
  farmer: 90,
  builder: 110,
  forager: 100,
  fireman: 100,
  brawler: 140,
  blademaster: 300,
  gunslinger: 450,
});

const STORAGE_SELL_PRICE_TABLE = Object.freeze({
  clean_water: 9,
  unclean_water: 9,
  food: 15,
  rawFood: 10,
  crop: 6,
  wood: 10,
  stone: 10,
  seedCrop: 1,
  seedBerry: 2,
});

const CONTRACT_BASE_MONEY_COSTS = Object.freeze({
  FARM: 100,
  FOREST: 120,
  ROCK: 140,
  MARKET: 180,
  MILITIA: 220,
});

const PRESSURE_MONEY_COSTS = Object.freeze({
  1: 90,
  2: 160,
  3: 240,
});

const MILITIA_MONEY_COSTS = Object.freeze({
  1: 220,
  2: 275,
  3: 385,
});

const PRESSURE_CLEAR_BONUSES = Object.freeze({
  1: 60,
  2: 100,
  3: 145,
});

const TOWN_TOWER_BASE_DAWN_INCOME = 250;
const QUICK_SELL_PERMIT_BASE_VALUE = 100;
const GOLD_ORE_STAGE_BASE_PAYOUT = 75;
const GOLD_ORE_DAY_SCALE = 0.05;
const CONTRACT_DAY_SCALE = 0.10;
const REWARD_DAY_SCALE = 0.10;

const ENEMY_KILL_REWARDS = Object.freeze({
  raider: 18,
  hunter: 26,
  bomber: 32,
  grunt: 22,
  fortgrunt: 22,
});

const NIGHT_HORDE_TOTALS = Object.freeze([3, 4, 6, 7, 8, 9, 10]);
const NIGHT_HORDE_LANES = Object.freeze([1, 1, 2, 2, 3, 3, 4]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toWholeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function getWorldScene(scene) {
  return scene?.worldScene ?? scene ?? null;
}

export function getBalanceDay(scene) {
  const world = getWorldScene(scene);
  return Math.max(1, Math.floor(toWholeNumber(world?.clock?.day, 1)));
}

export function getMoneyEarnedTotal(scene) {
  const world = getWorldScene(scene);
  return Math.max(0, toWholeNumber(world?._runStats?.moneyEarnedTotal, 0));
}

export function getIncomeTier(scene) {
  return Math.max(0, Math.floor(getMoneyEarnedTotal(scene) / 500));
}

export function roundPrice(value, step = 5) {
  const normalizedStep = Math.max(1, Math.floor(toWholeNumber(step, 1)));
  return Math.max(0, Math.round(toWholeNumber(value, 0) / normalizedStep) * normalizedStep);
}

export function getRecruitBaseCost(unitKey) {
  return RECRUIT_BASE_COSTS[String(unitKey || "").toLowerCase()] ?? 80;
}

export function getRecruitCost(unitKey, scene) {
  const dayScale = 1 + (Math.max(0, getBalanceDay(scene) - 1) * 0.08);
  return roundPrice(getRecruitBaseCost(unitKey) * dayScale, 5);
}

export function getTroopKey(troopOrKey) {
  if (typeof troopOrKey === "string") return String(troopOrKey).trim().toLowerCase();
  if (troopOrKey?.isFarmer) return "farmer";
  if (troopOrKey?.isBuilder) return "builder";
  if (troopOrKey?.isForager) return "forager";
  if (troopOrKey?.isFireman) return "fireman";
  if (troopOrKey?.isBrawler) return "brawler";
  if (troopOrKey?.isBlademaster) return "blademaster";
  if (troopOrKey?.isGunslinger) return "gunslinger";
  return "default";
}

export function getTroopSellRatio(troopOrKey) {
  const key = getTroopKey(troopOrKey);
  if (key === "gunslinger" || key === "blademaster") return 0.22;
  if (key === "brawler") return 0.24;
  if (key === "builder" || key === "farmer" || key === "forager" || key === "fireman") return 0.3;
  return 0.25;
}

export function getTroopSellValue(troop, scene) {
  const key = getTroopKey(troop);
  if (key === "default") return 20;
  return roundPrice(getRecruitCost(key, scene) * getTroopSellRatio(key), 5);
}

export function canSellTroopsNow(scene) {
  return true;
}

export function getTroopSellLockMessage() {
  return "";
}

export function getStorageSellPrices() {
  return STORAGE_SELL_PRICE_TABLE;
}

export function getStorageSellPrice(itemOrName) {
  const name = typeof itemOrName === "string" ? itemOrName : itemOrName?.name;
  return STORAGE_SELL_PRICE_TABLE[name] ?? 0;
}

export function getContractMoneyCost(scene, type, difficulty = 1) {
  const normalizedType = String(type || "").toUpperCase();
  const dayScale = 1 + (Math.max(0, getBalanceDay(scene) - 1) * CONTRACT_DAY_SCALE);
  if (normalizedType === "PRESSURE") {
    const diff = clamp(Math.floor(toWholeNumber(difficulty, 1)), 1, 3);
    return roundPrice((PRESSURE_MONEY_COSTS[diff] ?? PRESSURE_MONEY_COSTS[1]) * dayScale, 5);
  }
  if (normalizedType === "MILITIA") {
    const diff = clamp(Math.floor(toWholeNumber(difficulty, 1)), 1, 3);
    return roundPrice((MILITIA_MONEY_COSTS[diff] ?? MILITIA_MONEY_COSTS[1]) * dayScale, 5);
  }
  const base = CONTRACT_BASE_MONEY_COSTS[normalizedType] ?? 0;
  return roundPrice(base * dayScale, 5);
}

export function getDayProgressionScale(scene, rate = REWARD_DAY_SCALE) {
  return 1 + (Math.max(0, getBalanceDay(scene) - 1) * Math.max(0, Number(rate || 0)));
}

export function getTownTowerDawnIncome(scene, towerCount = 1) {
  const towers = Math.max(0, Math.floor(toWholeNumber(towerCount, 0)));
  return roundPrice(TOWN_TOWER_BASE_DAWN_INCOME * towers * getDayProgressionScale(scene), 5);
}

export function getQuickSellPermitValue(scene) {
  return roundPrice(QUICK_SELL_PERMIT_BASE_VALUE * getDayProgressionScale(scene), 5);
}

export function getGoldOreStagePayout(scene, richness = 1) {
  const dayScale = 1 + (Math.max(0, getBalanceDay(scene) - 1) * GOLD_ORE_DAY_SCALE);
  const reward = GOLD_ORE_STAGE_BASE_PAYOUT * Math.max(0.5, Number(richness || 1));
  return roundPrice(reward * dayScale, 5);
}

export function getGoldOrePayout(scene, richness = 1, stages = 3) {
  const stageCount = Math.max(1, Math.floor(toWholeNumber(stages, 3)));
  return roundPrice(getGoldOreStagePayout(scene, richness) * stageCount, 5);
}

export function getPressureClearBonus(scene, difficulty = 1) {
  const dayScale = 1 + (Math.max(0, getBalanceDay(scene) - 1) * 0.08);
  const diff = clamp(Math.floor(toWholeNumber(difficulty, 1)), 1, 3);
  return roundPrice((PRESSURE_CLEAR_BONUSES[diff] ?? PRESSURE_CLEAR_BONUSES[1]) * dayScale, 5);
}

export function getEnemyTypeLabel(enemyType = "raider") {
  const normalized = String(enemyType || "").toLowerCase();
  if (normalized === "hunter") return "Hunters";
  if (normalized === "bomber") return "Bombers";
  if (normalized === "grunt" || normalized === "fortgrunt") return "Fort Grunts";
  return "Raiders";
}

export function buildEnemyTypeLabel(enemyTypes = []) {
  const labels = [];
  const seen = new Set();
  for (const enemyType of enemyTypes) {
    const label = getEnemyTypeLabel(enemyType);
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels.join(" + ") || "Raiders";
}

export function getEnemyKillReward(enemyType = "raider") {
  const normalized = String(enemyType || "").toLowerCase();
  return ENEMY_KILL_REWARDS[normalized] ?? ENEMY_KILL_REWARDS.raider;
}

export function getMarketPriceMultiplier(scene) {
  return 1;
}

export function buildMarketPriceTable(scene, basePrices = {}, inflationMultipliers = null) {
  const multiplier = getMarketPriceMultiplier(scene);
  return Object.fromEntries(
    Object.entries(basePrices || {}).map(([key, value]) => {
      const inflation = Math.max(1, Number(inflationMultipliers?.[key] || 1));
      return [key, roundPrice(Number(value || 0) * multiplier * inflation, 10)];
    })
  );
}

export function getNightHordeSettings(hordeIndex = 1) {
  const index = Math.max(1, Math.floor(toWholeNumber(hordeIndex, 1)));
  const cappedIndex = Math.min(index, NIGHT_HORDE_TOTALS.length);
  const totalEnemies = NIGHT_HORDE_TOTALS[cappedIndex - 1];
  const laneCount = NIGHT_HORDE_LANES[cappedIndex - 1];
  const hunterRatio = index >= 2 ? Math.min(0.42, 0.16 + ((index - 2) * 0.04)) : 0;
  const bomberRatio = index >= 3 ? Math.min(0.28, 0.08 + ((index - 3) * 0.04)) : 0;
  return { totalEnemies, laneCount, hunterRatio, bomberRatio };
}

export function distributeAcrossLanes(totalEnemies = 0, laneCount = 1) {
  const total = Math.max(0, Math.floor(toWholeNumber(totalEnemies, 0)));
  const lanes = Math.max(1, Math.floor(toWholeNumber(laneCount, 1)));
  const base = Math.floor(total / lanes);
  let remainder = total % lanes;
  return Array.from({ length: lanes }, () => {
    const amount = base + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    return amount;
  });
}

export function pickScaledEnemyType({ hunterRatio = 0, bomberRatio = 0, sequenceIndex = 0 } = {}) {
  const bomberEvery = bomberRatio > 0 ? Math.max(3, Math.round(1 / bomberRatio)) : 0;
  const hunterEvery = hunterRatio > 0 ? Math.max(2, Math.round(1 / hunterRatio)) : 0;
  if (bomberEvery > 0 && sequenceIndex % bomberEvery === bomberEvery - 1) return "bomber";
  if (hunterEvery > 0 && sequenceIndex % hunterEvery === hunterEvery - 1) return "hunter";
  return "raider";
}

function getPressureSpawnerEnemyType(day, difficulty, spawnerIndex, spawnerCount) {
  if (day >= 3 && difficulty >= 3 && spawnerIndex === spawnerCount - 1) return "bomber";
  if (day >= 2 && (difficulty === 1 || spawnerIndex === spawnerCount - 1)) return "hunter";
  return "raider";
}

export function buildPressureSpawnerProfile(scene, difficulty = 1, modifier = null) {
  const day = getBalanceDay(scene);
  const diff = clamp(Math.floor(toWholeNumber(difficulty, 1)), 1, 3);
  const extraSpawners = Math.max(0, Math.floor(toWholeNumber(modifier?.extraSpawners, 0)));
  const spawnerCount = clamp(diff + extraSpawners, 1, 3);
  const quotaBase = Math.min(6, 3 + Math.floor(Math.max(0, day - 1) / 4));
  const quotaPerSpawner = Math.max(
    2,
    Math.round(quotaBase * Math.max(0.5, toWholeNumber(modifier?.quotaMultiplier, 1)))
  );
  const baseIntervalMs = Math.max(1600, 4200 - (Math.max(0, day - 1) * 180));
  const spawnIntervalMs = Math.max(
    1400,
    Math.round(baseIntervalMs * Math.max(0.45, toWholeNumber(modifier?.intervalMultiplier, 1)))
  );
  const enemyMods = {
    speedMultiplier: Math.max(0.5, toWholeNumber(modifier?.speedMultiplier, 1)),
    healthMultiplier: Math.max(0.5, toWholeNumber(modifier?.healthMultiplier, 1)),
    damageMultiplier: Math.max(0.5, toWholeNumber(modifier?.damageMultiplier, 1)),
    modifierKey: modifier?.key ?? null,
    modifierLabel: modifier?.label ?? null,
    visual: modifier?.visual ? { ...modifier.visual } : null,
  };
  const spawnerEnemyTypes = Array.from({ length: spawnerCount }, (_, index) =>
    getPressureSpawnerEnemyType(day, diff, index, spawnerCount)
  );
  return {
    day,
    difficulty: diff,
    spawnerCount,
    quotaPerSpawner,
    spawnIntervalMs,
    totalPlannedEnemies: spawnerCount * quotaPerSpawner,
    enemyType: spawnerEnemyTypes[0] || "raider",
    enemyTypeLabel: buildEnemyTypeLabel(spawnerEnemyTypes),
    enemyMods,
    spawnerEnemyTypes,
  };
}

export function estimatePressureContractEconomy(scene, difficulty = 1, modifier = null) {
  const profile = buildPressureSpawnerProfile(scene, difficulty, modifier);
  const killTotal = profile.spawnerEnemyTypes.reduce(
    (sum, enemyType) => sum + (getEnemyKillReward(enemyType) * profile.quotaPerSpawner),
    0
  );
  const bonus = getPressureClearBonus(scene, difficulty);
  const cost = getContractMoneyCost(scene, "PRESSURE", difficulty);
  const gross = killTotal + bonus;
  const net = gross - cost;
  return {
    ...profile,
    killTotal,
    bonus,
    cost,
    gross,
    net,
  };
}
