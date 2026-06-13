import { Teams } from "../Teams.js";
import { getNightHordeSettings } from "../balance/GameBalance.js";
import { SaveManager } from "../save/SaveManager.js";

const TEAM_ID = "1";
const SLOT_ORDER = ["build", "economy", "combat"];
const RECENT_HISTORY_LIMIT = 3;
const MAX_HOUSE_GOAL_TARGET = 4;
const MAX_STORAGE_GOAL_TARGET = 2;
const MAX_OVEN_GOAL_TARGET = 2;
const MAX_NORMAL_NIGHTS_SURVIVED_TARGET = 5;
const MAX_DEMO_PARCEL_GOAL_TARGET = 6;
const MAX_DEMO_FIGHTER_GOAL_TARGET = 8;
const MAX_DEMO_POPULATION_GOAL_TARGET = 10;
const MAX_DEMO_STOCKPILE_GOAL_TARGET = 40;
const MAX_DEMO_CASH_GOAL_TARGET = 1000;
const DEMO_SCHEDULED_NORMAL_RAIDER_TOTAL = getScheduledNormalRaiderTotal(MAX_NORMAL_NIGHTS_SURVIVED_TARGET);

const SLOT_META = Object.freeze({
  build: {
    label: "Town",
    accent: 0x7dd3fc,
    fill: 0x10283a,
    stroke: 0x89d6ff,
  },
  economy: {
    label: "Supply",
    accent: 0xf9c74f,
    fill: 0x3b2a10,
    stroke: 0xf6d281,
  },
  combat: {
    label: "Defense",
    accent: 0xf87171,
    fill: 0x3a1717,
    stroke: 0xf6a3a3,
  },
});

const FOUNDATION_TRACKS = Object.freeze({
  build: Object.freeze([
    {
      uniqueKey: "build_house_total_1",
      family: "housing",
      title: "Raise Shelter",
      description: "Build 1 house after this goal appears.",
      metric: "houses",
      mode: "delta",
      target: 1,
      reward: { xp: 12, money: 40 },
    },
    {
      uniqueKey: "build_storage_total_1",
      family: "storage",
      title: "Lay In Supplies",
      description: "Build 1 storage after this goal appears.",
      metric: "storages",
      mode: "delta",
      target: 1,
      reward: { xp: 12, money: 35 },
    },
    {
      uniqueKey: "build_oven_total_1",
      family: "ovens",
      title: "Fire It Up",
      description: "Build 1 clay oven after this goal appears.",
      metric: "ovens",
      mode: "delta",
      target: 1,
      reward: { xp: 14, money: 50 },
    },
    {
      uniqueKey: "build_fighter_total_1",
      family: "fighters",
      title: "Train A Defender",
      description: "Train 1 fighter after this goal appears.",
      metric: "fighters",
      mode: "delta",
      target: 1,
      reward: { xp: 16, money: 50 },
    },
    {
      uniqueKey: "build_house_total_3",
      family: "housing",
      title: "Growing Village",
      description: "Build 1 more house after this goal appears.",
      metric: "houses",
      mode: "delta",
      target: 1,
      reward: { xp: 24, money: 85 },
    },
    {
      uniqueKey: "build_fighter_total_3",
      family: "fighters",
      title: "Standing Army",
      description: "Train 1 more fighter after this goal appears.",
      metric: "fighters",
      mode: "delta",
      target: 1,
      reward: { xp: 30, money: 90 },
    },
  ]),
  economy: Object.freeze([
    {
      uniqueKey: "econ_wood_gather_foundation_12",
      family: "gather_wood",
      title: "Stock The Yard",
      description: "Gather 12 wood after this goal appears.",
      metric: "woodGathered",
      mode: "delta",
      target: 12,
      reward: { xp: 14, money: 35 },
    },
    {
      uniqueKey: "econ_stone_gather_foundation_10",
      family: "gather_stone",
      title: "Stone Reserve",
      description: "Mine 10 stone after this goal appears.",
      metric: "stoneGathered",
      mode: "delta",
      target: 10,
      reward: { xp: 14, money: 35 },
    },
    {
      uniqueKey: "econ_harvest_total_8",
      family: "harvest",
      title: "First Yield",
      description: "Harvest 8 crops after this goal appears.",
      metric: "cropsHarvested",
      mode: "delta",
      target: 8,
      reward: { xp: 10, seeds: 4 },
    },
    {
      uniqueKey: "econ_seed_gather_foundation_18",
      family: "gather_seeds",
      title: "Seed Basket",
      description: "Gather 18 crop seeds after this goal appears.",
      metric: "seedsGathered",
      mode: "delta",
      target: 18,
      reward: { xp: 12, money: 25 },
    },
    {
      uniqueKey: "econ_harvest_total_24",
      family: "harvest",
      title: "Fieldwork",
      description: "Harvest 16 crops after this goal appears.",
      metric: "cropsHarvested",
      mode: "delta",
      target: 16,
      reward: { xp: 18, seeds: 6, money: 40 },
    },
  ]),
  combat: Object.freeze([
    {
      uniqueKey: "combat_parcels_total_1",
      family: "expansion",
      title: "Open New Ground",
      description: "Claim 1 parcel after this goal appears.",
      metric: "parcelsClaimed",
      mode: "delta",
      target: 1,
      reward: { xp: 20, money: 60 },
    },
    {
      uniqueKey: "combat_raiders_total_5",
      family: "raiders",
      title: "Thin The Raiders",
      description: "Defeat 5 raiders after this goal appears.",
      metric: "raidersKilled",
      mode: "delta",
      target: 5,
      reward: { xp: 20, money: 70 },
    },
    {
      uniqueKey: "combat_nights_total_1",
      family: "survival",
      title: "Hold Through Nightfall",
      description: "Survive 1 full night after this goal appears.",
      metric: "nightsSurvived",
      mode: "delta",
      target: 1,
      reward: { xp: 32, money: 90 },
    },
    {
      uniqueKey: "combat_parcels_total_3",
      family: "expansion",
      title: "Push The Frontier",
      description: "Claim 2 parcels after this goal appears.",
      metric: "parcelsClaimed",
      mode: "delta",
      target: 2,
      reward: { xp: 26, money: 110 },
    },
    {
      uniqueKey: "combat_raiders_total_12",
      family: "raiders",
      title: "Break Their Charge",
      description: "Defeat 7 raiders after this goal appears.",
      metric: "raidersKilled",
      mode: "delta",
      target: 7,
      reward: { xp: 28, money: 105 },
    },
    {
      uniqueKey: "combat_nights_total_2",
      family: "survival",
      title: "Two Nights Standing",
      description: "Survive 1 more full night after this goal appears.",
      metric: "nightsSurvived",
      mode: "delta",
      target: 1,
      reward: { xp: 36, money: 120 },
    },
  ]),
});

function clonePlain(value, fallback) {
  if (value == null) return fallback;
  try {
    return structuredClone(value);
  } catch {
    return fallback;
  }
}

function asPositiveInt(value, fallback = 0) {
  const normalized = Math.max(0, Math.floor(Number(value) || 0));
  return Number.isFinite(normalized) ? normalized : fallback;
}

function clampWeight(value, fallback = 1) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return fallback;
  return Math.max(0.05, normalized);
}

function pushRecentValue(list, value, limit = RECENT_HISTORY_LIMIT) {
  if (!value) return Array.isArray(list) ? list.slice(-limit) : [];
  const next = Array.isArray(list) ? list.filter((entry) => entry && entry !== value) : [];
  next.push(value);
  return next.slice(-limit);
}

function nextMilestone(current, milestones = [], fallbackStep = 1) {
  const now = Math.max(0, Number(current || 0));
  for (const candidate of milestones) {
    const target = Math.max(1, asPositiveInt(candidate, 0));
    if (target > now) return target;
  }

  const step = Math.max(1, asPositiveInt(fallbackStep, 1));
  if (!milestones.length) return Math.max(step, now + step);

  const last = Math.max(step, asPositiveInt(milestones[milestones.length - 1], step));
  if (now < last) return last;

  const increments = Math.floor((now - last) / step) + 1;
  return last + (increments * step);
}

function getScheduledNormalRaiderTotal(normalNightCount = MAX_NORMAL_NIGHTS_SURVIVED_TARGET) {
  const count = Math.max(0, asPositiveInt(normalNightCount, 0));
  let total = 0;
  for (let index = 1; index <= count; index++) {
    total += Math.max(0, asPositiveInt(getNightHordeSettings(index)?.totalEnemies, 0));
  }
  return total;
}

function getScheduledNormalRaidersAfterNights(nightsSurvived = 0) {
  const completed = Math.max(0, Math.min(MAX_NORMAL_NIGHTS_SURVIVED_TARGET, asPositiveInt(nightsSurvived, 0)));
  let total = 0;
  for (let index = completed + 1; index <= MAX_NORMAL_NIGHTS_SURVIVED_TARGET; index++) {
    total += Math.max(0, asPositiveInt(getNightHordeSettings(index)?.totalEnemies, 0));
  }
  return total;
}

function cappedMilestones(milestones = [], cap = 0) {
  const normalizedCap = Math.max(1, asPositiveInt(cap, 1));
  const result = new Set();
  for (const milestone of milestones) {
    const target = Math.max(1, asPositiveInt(milestone, 0));
    if (target <= normalizedCap) result.add(target);
  }
  result.add(normalizedCap);
  return Array.from(result).sort((a, b) => a - b);
}

function nextCappedMilestone(current, milestones = [], fallbackStep = 1, cap = 0) {
  const normalizedCap = Math.max(1, asPositiveInt(cap, 1));
  const target = nextMilestone(current, cappedMilestones(milestones, normalizedCap), fallbackStep);
  return target <= normalizedCap ? target : null;
}

function rewardText(reward = {}) {
  const parts = [];
  if ((reward.xp || 0) > 0) parts.push(`+${reward.xp} XP`);
  if ((reward.money || 0) > 0) parts.push(`+$${reward.money}`);
  if ((reward.permits || 0) > 0) parts.push(`+${reward.permits} permit${reward.permits === 1 ? "" : "s"}`);
  if ((reward.seeds || 0) > 0) parts.push(`+${reward.seeds} seeds`);
  if ((reward.berries || 0) > 0) parts.push(`+${reward.berries} berry seed${reward.berries === 1 ? "" : "s"}`);
  if ((reward.wood || 0) > 0) parts.push(`+${reward.wood} wood`);
  if ((reward.stone || 0) > 0) parts.push(`+${reward.stone} stone`);
  if ((reward.food || 0) > 0) parts.push(`+${reward.food} food`);
  if ((reward.cleanWater || 0) > 0) parts.push(`+${reward.cleanWater} water`);
  return parts.join("  ");
}

export class AchievementSystem {
  constructor(scene) {
    this.scene = scene;
    this.stats = this.createDefaultStats();
    this.state = this.createDefaultState();
    this._lastBoardSignature = "";
  }

  createDefaultStats() {
    return {
      cropsHarvested: 0,
      raidersKilled: 0,
      woodGathered: 0,
      stoneGathered: 0,
      seedsGathered: 0,
      berriesGathered: 0,
      repairPoints: 0,
      marketPurchases: 0,
      shockersDefeated: 0,
    };
  }

  _createDefaultSlotPrograms() {
    const programs = {};
    for (const slot of SLOT_ORDER) {
      programs[slot] = {
        foundationIndex: 0,
        recentFamilies: [],
        recentMetrics: [],
      };
    }
    return programs;
  }

  createDefaultState() {
    return {
      serial: 0,
      nextInstanceId: 1,
      activeGoals: [],
      completedKeys: [],
      slotPrograms: this._createDefaultSlotPrograms(),
    };
  }

  _normalizeSlotPrograms(slotPrograms = null) {
    const normalized = this._createDefaultSlotPrograms();
    const source = slotPrograms && typeof slotPrograms === "object" ? slotPrograms : {};

    for (const slot of SLOT_ORDER) {
      const program = source[slot] || {};
      normalized[slot] = {
        foundationIndex: asPositiveInt(program.foundationIndex, 0),
        recentFamilies: Array.isArray(program.recentFamilies) ? program.recentFamilies.filter(Boolean).slice(-RECENT_HISTORY_LIMIT) : [],
        recentMetrics: Array.isArray(program.recentMetrics) ? program.recentMetrics.filter(Boolean).slice(-RECENT_HISTORY_LIMIT) : [],
      };
    }

    return normalized;
  }

  getSlotMeta(slot) {
    return SLOT_META[slot] || SLOT_META.build;
  }

  getSaveSnapshot() {
    return {
      stats: clonePlain(this.stats, this.createDefaultStats()),
      state: {
        serial: asPositiveInt(this.state?.serial, 0),
        nextInstanceId: Math.max(1, asPositiveInt(this.state?.nextInstanceId, 1)),
        activeGoals: clonePlain(this.state?.activeGoals, []),
        completedKeys: Array.from(this.state?.completedKeys || []),
        slotPrograms: clonePlain(this.state?.slotPrograms, this._createDefaultSlotPrograms()),
      },
    };
  }

  restoreSnapshot(snapshot = null) {
    const defaults = this.createDefaultState();
    this.stats = {
      ...this.createDefaultStats(),
      ...(clonePlain(snapshot?.stats, {}) || {}),
    };

    const savedState = clonePlain(snapshot?.state, {}) || {};
    const hadSavedSlotPrograms = !!savedState.slotPrograms;
    this.state = {
      ...defaults,
      ...savedState,
      serial: asPositiveInt(savedState.serial, defaults.serial),
      nextInstanceId: Math.max(1, asPositiveInt(savedState.nextInstanceId, defaults.nextInstanceId)),
      activeGoals: Array.isArray(savedState.activeGoals) ? savedState.activeGoals : [],
      completedKeys: Array.isArray(savedState.completedKeys) ? savedState.completedKeys : [],
      slotPrograms: this._normalizeSlotPrograms(savedState.slotPrograms),
    };

    if (!hadSavedSlotPrograms) {
      this._syncFoundationProgramsFromCurrentState();
    }

    this._normalizeRestoredActiveGoals();
    this._lastBoardSignature = "";
    this.update(true);
  }

  _normalizeRestoredActiveGoals() {
    if (!Array.isArray(this.state.activeGoals)) {
      this.state.activeGoals = [];
      return;
    }

    const normalized = [];
    const seenSlots = new Set();
    const completed = Array.isArray(this.state.completedKeys) ? this.state.completedKeys : [];

    for (const rawGoal of this.state.activeGoals) {
      const goal = this._normalizeRestoredGoal(rawGoal);
      if (!goal?.slot || seenSlots.has(goal.slot)) continue;
      if (!goal.repeatable && completed.includes(goal.uniqueKey)) continue;

      const safeGoal = goal.mode !== "delta" && this.getProgress(goal).done
        ? this._convertGoalToActionableDelta(goal)
        : goal;

      normalized.push(safeGoal);
      seenSlots.add(safeGoal.slot);
    }

    this.state.activeGoals = normalized;
  }

  _normalizeRestoredGoal(rawGoal) {
    if (!rawGoal || typeof rawGoal !== "object") return null;
    const slot = SLOT_ORDER.includes(rawGoal.slot) ? rawGoal.slot : null;
    if (!slot) return null;

    let instanceId = rawGoal.instanceId ? String(rawGoal.instanceId) : "";
    if (!instanceId) {
      const id = Math.max(1, asPositiveInt(this.state?.nextInstanceId, 1));
      this.state.nextInstanceId = id + 1;
      instanceId = `achv_${id}`;
    }

    const foundationConfig = rawGoal.mode === "delta"
      ? null
      : this._getFoundationConfigForKey(slot, rawGoal.uniqueKey);
    const sourceConfig = foundationConfig || rawGoal;

    return {
      instanceId,
      ...this._makeCandidate(slot, sourceConfig),
    };
  }

  _getFoundationConfigForKey(slot, uniqueKey) {
    const key = String(uniqueKey || "");
    if (!key) return null;
    const track = FOUNDATION_TRACKS[slot] || [];
    const index = track.findIndex((entry) => entry?.uniqueKey === key);
    if (index < 0) return null;
    return {
      ...track[index],
      foundation: true,
      foundationIndex: index,
      weight: 99,
    };
  }

  _syncFoundationProgramsFromCurrentState() {
    for (const slot of SLOT_ORDER) {
      const track = FOUNDATION_TRACKS[slot] || [];
      const program = this._getSlotProgram(slot);
      let nextIndex = 0;

      while (nextIndex < track.length) {
        const config = { ...track[nextIndex] };
        if (config.mode === "delta" && config.baseline == null) {
          config.baseline = this.getMetricValue(config.metric);
        }
        const candidate = this._makeCandidate(slot, {
          ...config,
          foundationIndex: nextIndex,
          foundation: true,
        });
        const wasCompleted = Array.isArray(this.state?.completedKeys) && this.state.completedKeys.includes(candidate.uniqueKey);
        if (!wasCompleted && !this.getProgress(candidate).done) break;
        nextIndex += 1;
      }

      program.foundationIndex = nextIndex;
    }
  }

  addStat(key, amount = 1) {
    if (!key) return 0;
    const normalized = asPositiveInt(amount, 0);
    if (!(normalized > 0)) return this.stats?.[key] || 0;
    this.stats[key] = asPositiveInt(this.stats?.[key], 0) + normalized;
    return this.stats[key];
  }

  getMetricValue(metric) {
    const team = Teams.teamLists?.[TEAM_ID] || {};
    const activeCount = (list) => (Array.isArray(list) ? list.filter((entry) => entry?.active !== false && entry?.sprite?.active !== false).length : 0);

    switch (metric) {
      case "houses":
        return activeCount(team.houseList);
      case "storages":
        return activeCount(team.storageList);
      case "ovens":
        return activeCount(team.ovenList);
      case "fighters":
        return activeCount(team.fighterList);
      case "players":
        return activeCount(team.playerList);
      case "homeless":
        return Math.max(0, Number(Teams.getHousingStatus?.(TEAM_ID)?.homelessCount || 0));
      case "wood":
        return Math.max(0, Number(this.scene?.woodAmnt || 0));
      case "stone":
        return Math.max(0, Number(this.scene?.stoneAmnt || 0));
      case "seeds":
        return Math.max(0, Number(this.scene?.seeds || 0));
      case "berries":
        return Math.max(0, Number(this.scene?.berries || 0));
      case "food":
        return Math.max(0, Number(this.scene?.foodAmnt || 0));
      case "cleanWater":
        return Math.max(0, Number(this.scene?.cleanWaterAmnt || 0));
      case "money":
        return Math.max(0, Number(this.scene?.money || 0));
      case "permits":
        return Math.max(0, Number(this.scene?.permits || 0));
      case "cropsHarvested":
        return asPositiveInt(this.stats?.cropsHarvested, 0);
      case "raidersKilled":
        return asPositiveInt(this.stats?.raidersKilled, 0);
      case "woodGathered":
        return asPositiveInt(this.stats?.woodGathered, 0);
      case "stoneGathered":
        return asPositiveInt(this.stats?.stoneGathered, 0);
      case "seedsGathered":
        return asPositiveInt(this.stats?.seedsGathered, 0);
      case "berriesGathered":
        return asPositiveInt(this.stats?.berriesGathered, 0);
      case "repairPoints":
        return asPositiveInt(this.stats?.repairPoints, 0);
      case "marketPurchases":
        return asPositiveInt(this.stats?.marketPurchases, 0);
      case "shockersDefeated":
        return asPositiveInt(this.stats?.shockersDefeated, 0);
      case "parcelsClaimed":
        return asPositiveInt(this.scene?._runStats?.parcelsClaimed, 0);
      case "nightsSurvived":
        return asPositiveInt(this.scene?._runStats?.nightsSurvived, 0);
      case "moneyEarnedTotal":
        return asPositiveInt(this.scene?._runStats?.moneyEarnedTotal, 0);
      default:
        return 0;
    }
  }

  getProgress(goal) {
    if (!goal) return { value: 0, target: 1, ratio: 0, done: false };

    const currentValue = this.getMetricValue(goal.metric);
    const baseline = asPositiveInt(goal.baseline, 0);
    const target = Math.max(1, asPositiveInt(goal.target, 1));
    const value = goal.mode === "delta"
      ? Math.max(0, currentValue - baseline)
      : Math.max(0, currentValue);
    const ratio = Math.max(0, Math.min(1, value / target));
    return {
      value,
      target,
      ratio,
      done: value >= target,
    };
  }

  _snapshotGoal(goal) {
    if (!goal) return null;
    const progress = this.getProgress(goal);
    const slotMeta = this.getSlotMeta(goal.slot);
    return {
      ...clonePlain(goal, goal),
      progressValue: progress.value,
      progressTarget: progress.target,
      progressRatio: progress.ratio,
      complete: progress.done,
      rewardText: rewardText(goal.reward),
      slotLabel: slotMeta.label,
      accent: slotMeta.accent,
      fill: slotMeta.fill,
      stroke: slotMeta.stroke,
    };
  }

  getBoardSnapshot() {
    const activeGoals = SLOT_ORDER
      .map((slot) => {
        const goal = (this.state?.activeGoals || []).find((entry) => entry?.slot === slot) || null;
        return this._snapshotGoal(goal);
      })
      .filter(Boolean);

    return {
      serial: asPositiveInt(this.state?.serial, 0),
      totalCompleted: Array.isArray(this.state?.completedKeys) ? this.state.completedKeys.length : 0,
      activeGoals,
    };
  }

  _buildBoardSignature() {
    const snapshot = this.getBoardSnapshot();
    return JSON.stringify({
      serial: snapshot.serial,
      completed: snapshot.totalCompleted,
      goals: snapshot.activeGoals.map((goal) => ({
        id: goal.instanceId,
        value: goal.progressValue,
        target: goal.progressTarget,
        complete: goal.complete,
      })),
    });
  }

  _emitChanged(force = false) {
    const signature = this._buildBoardSignature();
    if (!force && signature === this._lastBoardSignature) return false;
    this._lastBoardSignature = signature;
    this.scene?.events?.emit?.("achievements:changed", this.getBoardSnapshot());
    return true;
  }

  _markCompleted(goal) {
    if (!goal?.uniqueKey || goal.repeatable) return;
    const completed = Array.isArray(this.state.completedKeys) ? this.state.completedKeys : (this.state.completedKeys = []);
    if (!completed.includes(goal.uniqueKey)) {
      completed.push(goal.uniqueKey);
    }
  }

  _rewardGoal(goal) {
    const reward = goal?.reward || {};
    if ((reward.xp || 0) > 0) {
      this.scene?.addTownXp?.(reward.xp, goal.title);
    }

    const resourceBundle = {
      money: asPositiveInt(reward.money, 0),
      permits: asPositiveInt(reward.permits, 0),
      seeds: asPositiveInt(reward.seeds, 0),
      berries: asPositiveInt(reward.berries, 0),
      wood: asPositiveInt(reward.wood, 0),
      stone: asPositiveInt(reward.stone, 0),
      food: asPositiveInt(reward.food, 0),
      cleanWater: asPositiveInt(reward.cleanWater, 0),
    };

    const hasBundle = Object.values(resourceBundle).some((value) => value > 0);
    if (hasBundle) {
      this.scene?._grantTownXpResources?.(resourceBundle, {
        showAlert: true,
        label: goal.title || "Goal reward",
        sourceUiTarget: this.scene?.uiScene?.achievementBoard?.root ?? null,
      });
    }
  }

  _getSlotProgram(slot) {
    if (!this.state.slotPrograms || typeof this.state.slotPrograms !== "object") {
      this.state.slotPrograms = this._createDefaultSlotPrograms();
    }
    if (!this.state.slotPrograms[slot]) {
      this.state.slotPrograms[slot] = {
        foundationIndex: 0,
        recentFamilies: [],
        recentMetrics: [],
      };
    }
    return this.state.slotPrograms[slot];
  }

  _getRemainingScheduledNormalRaiders() {
    const nightsSurvived = this.getMetricValue("nightsSurvived");
    const raidersKilled = this.getMetricValue("raidersKilled");
    return Math.max(0, Math.min(
      getScheduledNormalRaidersAfterNights(nightsSurvived),
      DEMO_SCHEDULED_NORMAL_RAIDER_TOTAL - raidersKilled
    ));
  }

  _isRaiderGoalDemoImpossible(goal) {
    if (!goal || String(goal.metric || "") !== "raidersKilled") return false;
    if (this.getProgress(goal).done) return false;

    const mode = goal.mode === "delta" ? "delta" : "threshold";
    const target = Math.max(1, asPositiveInt(goal.target, 1));
    const baseline = Math.max(0, asPositiveInt(goal.baseline, 0));
    const current = this.getMetricValue("raidersKilled");
    const remainingScheduled = this._getRemainingScheduledNormalRaiders();

    if (mode === "delta") {
      const progress = Math.max(0, current - baseline);
      const remainingNeeded = Math.max(0, target - progress);
      return baseline + target > DEMO_SCHEDULED_NORMAL_RAIDER_TOTAL
        || remainingNeeded > remainingScheduled;
    }

    const remainingNeeded = Math.max(0, target - current);
    return target > DEMO_SCHEDULED_NORMAL_RAIDER_TOTAL
      || remainingNeeded > remainingScheduled;
  }

  _makeCandidate(slot, config = {}) {
    const metric = String(config.metric || "houses");
    const mode = config.mode === "delta" ? "delta" : "threshold";
    const baselineSource = mode === "delta" && config.baseline == null
      ? this.getMetricValue(metric)
      : config.baseline;

    return {
      slot,
      uniqueKey: String(config.uniqueKey || `${slot}_${config.metric || "goal"}`),
      repeatable: !!config.repeatable,
      title: String(config.title || "Town Goal"),
      description: String(config.description || ""),
      family: String(config.family || config.metric || slot),
      metric,
      mode,
      target: Math.max(1, asPositiveInt(config.target, 1)),
      baseline: Math.max(0, asPositiveInt(baselineSource, 0)),
      reward: clonePlain(config.reward, {}) || {},
      weight: clampWeight(config.weight, 1),
      foundation: !!config.foundation,
      foundationIndex: Number.isFinite(config.foundationIndex) ? asPositiveInt(config.foundationIndex, 0) : null,
    };
  }

  _buildGoal(candidate) {
    const preparedCandidate = this._prepareCandidateForActivation(candidate);
    const id = Math.max(1, asPositiveInt(this.state?.nextInstanceId, 1));
    this.state.nextInstanceId = id + 1;
    return {
      instanceId: `achv_${id}`,
      ...clonePlain(preparedCandidate, preparedCandidate),
    };
  }

  _isGoalUnavailable(candidate) {
    if (!candidate) return true;
    if (this._isDeprecatedGoal(candidate)) return true;
    const activeGoals = Array.isArray(this.state?.activeGoals) ? this.state.activeGoals : [];
    if (activeGoals.some((goal) => goal?.uniqueKey === candidate.uniqueKey)) return true;
    if (!candidate.repeatable && Array.isArray(this.state?.completedKeys) && this.state.completedKeys.includes(candidate.uniqueKey)) {
      return true;
    }
    return false;
  }

  _getActionNoun(metric, count) {
    const plural = count === 1 ? "" : "s";
    switch (metric) {
      case "houses":
        return `house${plural}`;
      case "storages":
        return `storage${plural}`;
      case "ovens":
        return `clay oven${plural}`;
      case "fighters":
        return `fighter${plural}`;
      case "players":
        return `town member${plural}`;
      case "parcelsClaimed":
        return `parcel${plural}`;
      case "nightsSurvived":
        return `full night${plural}`;
      case "raidersKilled":
        return `raider${plural}`;
      case "cropsHarvested":
        return `crop${plural}`;
      case "woodGathered":
        return "wood";
      case "stoneGathered":
        return "stone";
      case "seedsGathered":
        return "crop seeds";
      case "berriesGathered":
        return "berry seeds";
      case "food":
        return "cooked food";
      case "cleanWater":
        return "clean water";
      case "money":
        return `dollar${plural}`;
      case "permits":
        return `permit${plural}`;
      default:
        return `point${plural}`;
    }
  }

  _getActionVerb(metric) {
    switch (metric) {
      case "houses":
      case "storages":
      case "ovens":
        return "Build";
      case "fighters":
        return "Train";
      case "players":
        return "Recruit";
      case "parcelsClaimed":
        return "Claim";
      case "nightsSurvived":
        return "Survive";
      case "raidersKilled":
        return "Defeat";
      case "cropsHarvested":
        return "Harvest";
      case "woodGathered":
        return "Gather";
      case "stoneGathered":
        return "Mine";
      case "seedsGathered":
      case "berriesGathered":
        return "Gather";
      case "food":
      case "cleanWater":
        return "Stockpile";
      case "money":
      case "permits":
        return "Earn";
      default:
        return "Earn";
    }
  }

  _buildActionDescription(goal, target) {
    const metric = String(goal?.metric || "");
    const count = Math.max(1, asPositiveInt(target, 1));
    return `${this._getActionVerb(metric)} ${count} ${this._getActionNoun(metric, count)} after this goal appears.`;
  }

  _convertGoalToActionableDelta(goal) {
    if (!goal) return goal;
    const target = 1;
    return {
      ...clonePlain(goal, goal),
      mode: "delta",
      baseline: this.getMetricValue(goal.metric),
      target,
      description: this._buildActionDescription(goal, target),
    };
  }

  _prepareCandidateForActivation(candidate) {
    if (!candidate) return candidate;
    if (candidate.mode === "delta") return candidate;
    if (!this.getProgress(candidate).done) return candidate;
    return this._convertGoalToActionableDelta(candidate);
  }

  _getFoundationGoalCandidate(slot) {
    const track = FOUNDATION_TRACKS[slot] || [];
    const program = this._getSlotProgram(slot);

    while (program.foundationIndex < track.length) {
      const index = program.foundationIndex;
      const config = { ...track[index] };
      if (config.mode === "delta" && config.baseline == null) {
        config.baseline = this.getMetricValue(config.metric);
      }
      const candidate = this._makeCandidate(slot, {
        ...config,
        foundation: true,
        foundationIndex: index,
        weight: 99,
      });
      if (Array.isArray(this.state?.completedKeys) && this.state.completedKeys.includes(candidate.uniqueKey)) {
        program.foundationIndex += 1;
        continue;
      }
      return candidate;
    }

    return null;
  }

  _getBuildCandidates() {
    const storages = this.getMetricValue("storages");
    const ovens = this.getMetricValue("ovens");
    const fighters = this.getMetricValue("fighters");
    const players = this.getMetricValue("players");
    const repairPoints = this.getMetricValue("repairPoints");
    const nights = this.getMetricValue("nightsSurvived");
    const candidates = [];

    const houseTarget = MAX_HOUSE_GOAL_TARGET;
    candidates.push(this._makeCandidate("build", {
      uniqueKey: `build_house_total_${houseTarget}`,
      family: "housing",
      title: "Raise Another Roof",
      description: `Reach ${houseTarget} houses in town.`,
      metric: "houses",
      target: houseTarget,
      reward: {
        xp: 16 + (houseTarget * 3),
        money: 40 + (houseTarget * 14),
      },
      repeatable: false,
      weight: 1.25,
    }));

    const fighterTarget = nextCappedMilestone(fighters, [4, 5, 6, 8, 10, 12], 2, MAX_DEMO_FIGHTER_GOAL_TARGET);
    if (fighterTarget) {
      candidates.push(this._makeCandidate("build", {
        uniqueKey: `build_fighter_total_${fighterTarget}`,
        family: "fighters",
        title: fighterTarget >= 8 ? "Hold The Line" : "Drill More Defenders",
        description: `Have ${fighterTarget} fighters ready at once.`,
        metric: "fighters",
        target: fighterTarget,
        reward: {
          xp: 18 + (fighterTarget * 3),
          money: 48 + (fighterTarget * 15),
        },
        repeatable: true,
        weight: 1.05,
      }));
    }

    if (storages >= 1) {
      const storageTarget = MAX_STORAGE_GOAL_TARGET;
      candidates.push(this._makeCandidate("build", {
        uniqueKey: `build_storage_total_${storageTarget}`,
        family: "storage",
        title: "Add More Storage",
        description: `Reach ${storageTarget} storage buildings.`,
        metric: "storages",
        target: storageTarget,
        reward: {
          xp: 14 + (storageTarget * 4),
          money: 28 + (storageTarget * 18),
          wood: Math.min(6, storageTarget + 1),
        },
        repeatable: false,
        weight: 0.92,
      }));
    }

    if (ovens >= 1) {
      const ovenTarget = MAX_OVEN_GOAL_TARGET;
      candidates.push(this._makeCandidate("build", {
        uniqueKey: `build_oven_total_${ovenTarget}`,
        family: "ovens",
        title: "Add A Second Oven",
        description: `Reach ${ovenTarget} ovens.`,
        metric: "ovens",
        target: ovenTarget,
        reward: {
          xp: 14 + (ovenTarget * 4),
          money: 22 + (ovenTarget * 14),
          food: Math.min(8, ovenTarget * 2),
        },
        repeatable: false,
        weight: 0.82,
      }));
    }

    const playerTarget = nextCappedMilestone(players, [5, 6, 8, 10, 12, 14], 2, MAX_DEMO_POPULATION_GOAL_TARGET);
    if (playerTarget) {
      candidates.push(this._makeCandidate("build", {
        uniqueKey: `build_player_total_${playerTarget}`,
        family: "population",
        title: "Growing Workforce",
        description: `Reach ${playerTarget} active town members.`,
        metric: "players",
        target: playerTarget,
        reward: {
          xp: 18 + (playerTarget * 2),
          money: 35 + (playerTarget * 10),
          food: 3,
          cleanWater: 3,
        },
        repeatable: true,
        weight: 0.94,
      }));
    }

    const repairTarget = nights >= 4 ? 16 : 10;
    candidates.push(this._makeCandidate("build", {
      uniqueKey: `build_repairs_${repairPoints}_${repairTarget}`,
      family: "repairs",
      title: "Patch The Walls",
      description: `Repair ${repairTarget} building health after this goal appears.`,
      metric: "repairPoints",
      mode: "delta",
      baseline: repairPoints,
      target: repairTarget,
      reward: {
        xp: 22 + Math.floor(repairTarget * 1.4),
        money: 42 + (repairTarget * 3),
        wood: 2,
        stone: 2,
      },
      repeatable: true,
      weight: nights >= 1 ? 0.96 : 0.3,
    }));

    return candidates;
  }

  _getEconomyCandidates() {
    const nights = this.getMetricValue("nightsSurvived");
    const cropsHarvested = this.getMetricValue("cropsHarvested");
    const woodGathered = this.getMetricValue("woodGathered");
    const stoneGathered = this.getMetricValue("stoneGathered");
    const seedsGathered = this.getMetricValue("seedsGathered");
    const berriesGathered = this.getMetricValue("berriesGathered");
    const marketPurchases = this.getMetricValue("marketPurchases");
    const berries = this.getMetricValue("berries");
    const food = this.getMetricValue("food");
    const cleanWater = this.getMetricValue("cleanWater");
    const money = this.getMetricValue("money");
    const parcelsClaimed = this.getMetricValue("parcelsClaimed");
    const berryRoutesOpened = berries > 0 || berriesGathered > 0 || nights >= 1;
    const candidates = [];

    const harvestTarget = nights >= 5 ? 20 : nights >= 3 ? 16 : 12;
    candidates.push(this._makeCandidate("economy", {
      uniqueKey: `econ_harvest_${cropsHarvested}_${harvestTarget}`,
      family: "harvest",
      title: harvestTarget >= 18 ? "Big Harvest" : "Bushel Run",
      description: `Harvest ${harvestTarget} crops after this goal appears.`,
      metric: "cropsHarvested",
      mode: "delta",
      baseline: cropsHarvested,
      target: harvestTarget,
      reward: {
        xp: 16 + harvestTarget,
        seeds: 5 + Math.floor(harvestTarget / 5),
        money: 28 + (harvestTarget * 2),
      },
      repeatable: true,
      weight: 1.2,
    }));

    const woodGatherTarget = nights >= 4 ? 16 : nights >= 2 ? 12 : 8;
    candidates.push(this._makeCandidate("economy", {
      uniqueKey: `econ_wood_gather_${woodGathered}_${woodGatherTarget}`,
      family: "gather_wood",
      title: "Logging Run",
      description: `Gather ${woodGatherTarget} wood after this goal appears.`,
      metric: "woodGathered",
      mode: "delta",
      baseline: woodGathered,
      target: woodGatherTarget,
      reward: {
        xp: 14 + woodGatherTarget,
        money: 22 + (woodGatherTarget * 2),
        wood: 2,
      },
      repeatable: true,
      weight: 1.02,
    }));

    const stoneGatherTarget = nights >= 4 ? 14 : nights >= 2 ? 10 : 6;
    candidates.push(this._makeCandidate("economy", {
      uniqueKey: `econ_stone_gather_${stoneGathered}_${stoneGatherTarget}`,
      family: "gather_stone",
      title: "Quarry Shift",
      description: `Mine ${stoneGatherTarget} stone after this goal appears.`,
      metric: "stoneGathered",
      mode: "delta",
      baseline: stoneGathered,
      target: stoneGatherTarget,
      reward: {
        xp: 14 + stoneGatherTarget,
        money: 22 + (stoneGatherTarget * 2),
        stone: 2,
      },
      repeatable: true,
      weight: 1.02,
    }));

    const seedGatherTarget = nights >= 4 ? 16 : nights >= 2 ? 12 : 8;
    candidates.push(this._makeCandidate("economy", {
      uniqueKey: `econ_seed_gather_${seedsGathered}_${seedGatherTarget}`,
      family: "gather_seeds",
      title: "Seed Sweep",
      description: `Gather ${seedGatherTarget} crop seeds after this goal appears.`,
      metric: "seedsGathered",
      mode: "delta",
      baseline: seedsGathered,
      target: seedGatherTarget,
      reward: {
        xp: 12 + seedGatherTarget,
        seeds: 3 + Math.floor(seedGatherTarget / 4),
        money: 18 + seedGatherTarget,
      },
      repeatable: true,
      weight: 0.95,
    }));

    if (berryRoutesOpened) {
      const berryGatherTarget = nights >= 4 ? 8 : 6;
      candidates.push(this._makeCandidate("economy", {
        uniqueKey: `econ_berry_gather_${berriesGathered}_${berryGatherTarget}`,
        family: "gather_berries",
        title: "Berry Trail",
        description: `Gather ${berryGatherTarget} berry seeds after this goal appears.`,
        metric: "berriesGathered",
        mode: "delta",
        baseline: berriesGathered,
        target: berryGatherTarget,
        reward: {
          xp: 14 + (berryGatherTarget * 2),
          berries: 3 + Math.floor(berryGatherTarget / 3),
          money: 20 + (berryGatherTarget * 3),
        },
        repeatable: true,
        weight: 0.84,
      }));
    }

    const foodTarget = nextCappedMilestone(food, [18, 24, 30, 40, 52], 10, MAX_DEMO_STOCKPILE_GOAL_TARGET);
    if (foodTarget) {
      candidates.push(this._makeCandidate("economy", {
        uniqueKey: `econ_food_${foodTarget}`,
        family: "stockpile_food",
        title: "Meal Prep",
        description: `Hold ${foodTarget} cooked food.`,
        metric: "food",
        target: foodTarget,
        reward: {
          xp: 14 + Math.floor(foodTarget / 2),
          money: 18 + foodTarget,
          cleanWater: 2,
        },
        repeatable: true,
        weight: 0.88,
      }));
    }

    const waterTarget = nextCappedMilestone(cleanWater, [18, 24, 30, 40, 52], 10, MAX_DEMO_STOCKPILE_GOAL_TARGET);
    if (waterTarget) {
      candidates.push(this._makeCandidate("economy", {
        uniqueKey: `econ_water_${waterTarget}`,
        family: "stockpile_water",
        title: "Fill The Casks",
        description: `Hold ${waterTarget} clean water.`,
        metric: "cleanWater",
        target: waterTarget,
        reward: {
          xp: 14 + Math.floor(waterTarget / 2),
          money: 18 + waterTarget,
          food: 2,
        },
        repeatable: true,
        weight: 0.88,
      }));
    }

    const cashTarget = nextCappedMilestone(money, [500, 700, 1000, 1400, 1800], 400, MAX_DEMO_CASH_GOAL_TARGET);
    if (cashTarget) {
      candidates.push(this._makeCandidate("economy", {
        uniqueKey: `econ_cash_${cashTarget}`,
        family: "cash",
        title: "Cash Buffer",
        description: `Hold $${cashTarget} at once.`,
        metric: "money",
        target: cashTarget,
        reward: {
          xp: 18 + Math.floor(cashTarget / 80),
          permits: cashTarget >= 1000 ? 1 : 0,
          money: 35 + Math.floor(cashTarget / 10),
        },
        repeatable: true,
        weight: 0.54,
      }));
    }

    if (parcelsClaimed >= 1 || nights >= 1) {
      const marketTarget = nights >= 4 ? 2 : 1;
      candidates.push(this._makeCandidate("economy", {
        uniqueKey: `econ_market_${marketPurchases}_${marketTarget}`,
        family: "market",
        title: marketTarget > 1 ? "Market Circuit" : "Market Day",
        description: `Make ${marketTarget} market purchase${marketTarget === 1 ? "" : "s"} after this goal appears.`,
        metric: "marketPurchases",
        mode: "delta",
        baseline: marketPurchases,
        target: marketTarget,
        reward: {
          xp: 16 + (marketTarget * 10),
          money: 24 + (marketTarget * 26),
        },
        repeatable: true,
        weight: 0.72,
      }));
    }

    return candidates;
  }

  _getCombatCandidates() {
    const parcelsClaimed = this.getMetricValue("parcelsClaimed");
    const raidersKilled = this.getMetricValue("raidersKilled");
    const nightsSurvived = this.getMetricValue("nightsSurvived");
    const shockersDefeated = this.getMetricValue("shockersDefeated");
    const candidates = [];

    const makeShockerCandidate = () => this._makeCandidate("combat", {
      uniqueKey: "combat_shocker_total_1",
      family: "boss",
      title: "Ground The Shocker",
      description: "Defeat The Shocker.",
      metric: "shockersDefeated",
      target: 1,
      reward: {
        xp: 90,
        money: 250,
        permits: 2,
      },
      repeatable: false,
      weight: 99,
    });

    if (nightsSurvived >= MAX_NORMAL_NIGHTS_SURVIVED_TARGET || shockersDefeated > 0) {
      return [makeShockerCandidate()];
    }

    const desiredRaiderDeltaTarget = nightsSurvived >= 3 ? 10 : 6;
    const remainingScheduledRaiders = this._getRemainingScheduledNormalRaiders();
    const raiderDeltaTarget = Math.min(desiredRaiderDeltaTarget, remainingScheduledRaiders);
    if (raiderDeltaTarget > 0) {
      candidates.push(this._makeCandidate("combat", {
        uniqueKey: `combat_raiders_${raidersKilled}_${raiderDeltaTarget}`,
        family: "raiders",
        title: raiderDeltaTarget >= 10 ? "Break The Wave" : "Keep The Coast Clear",
        description: `Defeat ${raiderDeltaTarget} raiders after this goal appears.`,
        metric: "raidersKilled",
        mode: "delta",
        baseline: raidersKilled,
        target: raiderDeltaTarget,
        reward: {
          xp: 18 + (raiderDeltaTarget * 2),
          money: 40 + (raiderDeltaTarget * 5),
        },
        repeatable: true,
        weight: 1.18,
      }));
    }

    const remainingDemoParcels = Math.max(0, MAX_DEMO_PARCEL_GOAL_TARGET - parcelsClaimed);
    const parcelDeltaTarget = Math.min(parcelsClaimed >= 5 ? 2 : 1, remainingDemoParcels);
    if (parcelDeltaTarget > 0) {
      candidates.push(this._makeCandidate("combat", {
        uniqueKey: `combat_parcels_${parcelsClaimed}_${parcelDeltaTarget}`,
        family: "expansion",
        title: parcelDeltaTarget > 1 ? "Push The Border" : "Claim Another Parcel",
        description: `Claim ${parcelDeltaTarget} parcel${parcelDeltaTarget === 1 ? "" : "s"} after this goal appears.`,
        metric: "parcelsClaimed",
        mode: "delta",
        baseline: parcelsClaimed,
        target: parcelDeltaTarget,
        reward: {
          xp: 18 + (parcelDeltaTarget * 12),
          money: 45 + (parcelDeltaTarget * 38),
          permits: parcelDeltaTarget > 1 ? 1 : 0,
        },
        repeatable: true,
        weight: 1.04,
      }));
    }

    const nightDeltaTarget = 1;
    candidates.push(this._makeCandidate("combat", {
      uniqueKey: `combat_nights_${nightsSurvived}_${nightDeltaTarget}`,
      family: "survival",
      title: "Hold Another Night",
      description: `Survive ${nightDeltaTarget} more night${nightDeltaTarget === 1 ? "" : "s"} after this goal appears.`,
      metric: "nightsSurvived",
      mode: "delta",
      baseline: nightsSurvived,
      target: nightDeltaTarget,
      reward: {
        xp: 24 + (nightDeltaTarget * 14),
        money: 55 + (nightDeltaTarget * 32),
      },
      repeatable: true,
      weight: 0.98,
    }));

    const parcelTotalTarget = nextCappedMilestone(parcelsClaimed, [4, 6, 8, 10, 12], 2, MAX_DEMO_PARCEL_GOAL_TARGET);
    if (parcelTotalTarget) {
      candidates.push(this._makeCandidate("combat", {
        uniqueKey: `combat_parcels_total_${parcelTotalTarget}`,
        family: "expansion",
        title: "Frontier Reach",
        description: `Reach ${parcelTotalTarget} total claimed parcels.`,
        metric: "parcelsClaimed",
        target: parcelTotalTarget,
        reward: {
          xp: 20 + (parcelTotalTarget * 6),
          money: 50 + (parcelTotalTarget * 22),
          permits: parcelTotalTarget >= 8 ? 1 : 0,
        },
        repeatable: true,
        weight: 0.82,
      }));
    }

    const raiderTotalTarget = nextCappedMilestone(
      raidersKilled,
      [18, 30, 45, 60],
      15,
      DEMO_SCHEDULED_NORMAL_RAIDER_TOTAL
    );
    if (raiderTotalTarget) {
      candidates.push(this._makeCandidate("combat", {
        uniqueKey: `combat_raiders_total_${raiderTotalTarget}`,
        family: "raiders",
        title: "Count The Fallen",
        description: `Reach ${raiderTotalTarget} total raiders defeated.`,
        metric: "raidersKilled",
        target: raiderTotalTarget,
        reward: {
          xp: 22 + Math.floor(raiderTotalTarget * 1.2),
          money: 50 + (raiderTotalTarget * 3),
        },
        repeatable: true,
        weight: 0.8,
      }));
    }

    const nightTotalTarget = nextMilestone(nightsSurvived, [3, 5], 2);
    if (nightTotalTarget <= MAX_NORMAL_NIGHTS_SURVIVED_TARGET) {
      candidates.push(this._makeCandidate("combat", {
        uniqueKey: `combat_nights_total_${nightTotalTarget}`,
        family: "survival",
        title: "Seasoned Defenders",
        description: `Reach ${nightTotalTarget} nights survived.`,
        metric: "nightsSurvived",
        target: nightTotalTarget,
        reward: {
          xp: 28 + (nightTotalTarget * 8),
          money: 60 + (nightTotalTarget * 24),
        },
        repeatable: true,
        weight: 0.78,
      }));
    }

    return candidates;
  }

  _getLateCandidatesForSlot(slot) {
    if (slot === "build") return this._getBuildCandidates();
    if (slot === "economy") return this._getEconomyCandidates();
    return this._getCombatCandidates();
  }

  _getCandidateWeight(slot, candidate) {
    let weight = clampWeight(candidate?.weight, 1);
    const program = this._getSlotProgram(slot);
    const recentFamilies = Array.isArray(program.recentFamilies) ? program.recentFamilies : [];
    const recentMetrics = Array.isArray(program.recentMetrics) ? program.recentMetrics : [];
    const lastFamily = recentFamilies[recentFamilies.length - 1] || null;
    const lastMetric = recentMetrics[recentMetrics.length - 1] || null;

    if (candidate?.family) {
      if (candidate.family === lastFamily) weight *= 0.24;
      else if (recentFamilies.includes(candidate.family)) weight *= 0.58;
    }

    if (candidate?.metric) {
      if (candidate.metric === lastMetric) weight *= 0.52;
      else if (recentMetrics.includes(candidate.metric)) weight *= 0.8;
    }

    if (!candidate?.repeatable) weight *= 1.12;

    return Math.max(0.05, weight);
  }

  _pickWeightedCandidate(slot, candidates = []) {
    const weighted = candidates
      .map((candidate) => ({
        candidate,
        weight: this._getCandidateWeight(slot, candidate),
      }))
      .filter((entry) => entry.weight > 0);

    if (!weighted.length) return null;

    const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const entry of weighted) {
      roll -= entry.weight;
      if (roll <= 0) return entry.candidate;
    }

    return weighted[weighted.length - 1]?.candidate || null;
  }

  _selectGoalForSlot(slot) {
    const foundationCandidate = this._getFoundationGoalCandidate(slot);
    if (foundationCandidate && !this._isGoalUnavailable(foundationCandidate)) {
      return this._buildGoal(foundationCandidate);
    }

    const candidates = this._getLateCandidatesForSlot(slot)
      .filter((candidate) => !this._isGoalUnavailable(candidate));
    const selected = this._pickWeightedCandidate(slot, candidates);
    return selected ? this._buildGoal(selected) : null;
  }

  _ensureActiveSlots() {
    let changed = false;
    if (!Array.isArray(this.state.activeGoals)) {
      this.state.activeGoals = [];
      changed = true;
    }

    for (const slot of SLOT_ORDER) {
      const alreadyActive = this.state.activeGoals.find((goal) => goal?.slot === slot);
      if (alreadyActive) continue;
      const nextGoal = this._selectGoalForSlot(slot);
      if (!nextGoal) continue;
      this.state.activeGoals.push(nextGoal);
      changed = true;
    }

    return changed;
  }

  _recordCompletedGoal(goal) {
    if (!goal?.slot) return;
    const program = this._getSlotProgram(goal.slot);
    program.recentFamilies = pushRecentValue(program.recentFamilies, goal.family || goal.metric);
    program.recentMetrics = pushRecentValue(program.recentMetrics, goal.metric);

    if (Number.isFinite(goal.foundationIndex)) {
      program.foundationIndex = Math.max(program.foundationIndex, goal.foundationIndex + 1);
    }
  }

  _isGoalComplete(goal) {
    if (!goal) return false;
    return this.getProgress(goal).done;
  }

  _isDeprecatedGoal(goal) {
    const family = String(goal?.family || "");
    const key = String(goal?.uniqueKey || "");
    const metric = String(goal?.metric || "");
    const mode = goal?.mode === "delta" ? "delta" : "threshold";
    const target = Math.max(0, asPositiveInt(goal?.target, 0));
    const baseline = Math.max(0, asPositiveInt(goal?.baseline, 0));
    const isDone = () => this.getProgress(goal).done;
    const shouldPreferShockerGoal =
      goal?.slot === "combat" &&
      key !== "combat_shocker_total_1" &&
      (
        this.getMetricValue("nightsSurvived") >= MAX_NORMAL_NIGHTS_SURVIVED_TARGET ||
        this.getMetricValue("shockersDefeated") > 0
      );

    if (shouldPreferShockerGoal) return !isDone();

    if (
      family === "stockpile_wood" ||
      family === "stockpile_stone" ||
      family === "stockpile_seeds" ||
      family === "stockpile_berries" ||
      key.startsWith("econ_stock_wood_") ||
      key.startsWith("econ_stock_stone_") ||
      key.startsWith("econ_stock_seeds_") ||
      key.startsWith("econ_stock_berries_")
    ) {
      return true;
    }

    if (metric === "houses") {
      if (target > MAX_HOUSE_GOAL_TARGET) return true;
      if (target === MAX_HOUSE_GOAL_TARGET && goal?.repeatable) return true;
    }
    if (metric === "storages") {
      if (target > MAX_STORAGE_GOAL_TARGET) return true;
      if (target === MAX_STORAGE_GOAL_TARGET && goal?.repeatable) return true;
    }
    if (metric === "ovens") {
      if (target > MAX_OVEN_GOAL_TARGET) return true;
      if (target === MAX_OVEN_GOAL_TARGET && goal?.repeatable) return true;
    }
    if (metric === "fighters" && mode !== "delta" && target > MAX_DEMO_FIGHTER_GOAL_TARGET) {
      return !isDone();
    }
    if (metric === "players" && mode !== "delta" && target > MAX_DEMO_POPULATION_GOAL_TARGET) {
      return !isDone();
    }
    if ((metric === "food" || metric === "cleanWater") && mode !== "delta" && target > MAX_DEMO_STOCKPILE_GOAL_TARGET) {
      return !isDone();
    }
    if (metric === "money" && mode !== "delta" && target > MAX_DEMO_CASH_GOAL_TARGET) {
      return !isDone();
    }

    if (metric === "parcelsClaimed") {
      if (isDone()) return false;
      if (mode === "delta") return baseline + target > MAX_DEMO_PARCEL_GOAL_TARGET;
      return target > MAX_DEMO_PARCEL_GOAL_TARGET;
    }

    if (metric === "raidersKilled") {
      return this._isRaiderGoalDemoImpossible(goal);
    }

    if (metric === "nightsSurvived") {
      if (mode === "delta") {
        if (target > 1) return true;
        return baseline + target > MAX_NORMAL_NIGHTS_SURVIVED_TARGET;
      }
      return target > MAX_NORMAL_NIGHTS_SURVIVED_TARGET;
    }

    return false;
  }

  _completeGoal(goal) {
    if (!goal) return false;
    const completedSnapshot = this._snapshotGoal(goal);
    this._markCompleted(goal);
    this._recordCompletedGoal(goal);
    this._rewardGoal(goal);
    this.state.serial = asPositiveInt(this.state?.serial, 0) + 1;
    this.state.activeGoals = (this.state.activeGoals || []).filter((entry) => entry !== goal);

    const replacement = this._selectGoalForSlot(goal.slot);
    if (replacement) {
      this.state.activeGoals.push(replacement);
    }

    this.scene?.events?.emit?.("achievement:completed", {
      completed: completedSnapshot,
      replacement: this._snapshotGoal(replacement),
    });

    SaveManager.queueAutosave("achievement_complete");
    return true;
  }

  _shouldDeferCompletions() {
    const scene = this.scene;
    if (!scene) return false;

    if (
      scene._startupCameraLocked ||
      scene._menuModeActive ||
      scene.isMainMenuPreview ||
      scene._pendingMenuPhase ||
      scene._continueCameraLockActive
    ) {
      return true;
    }

    const uiScene = scene.uiScene;
    if (!uiScene) return false;
    if (uiScene._sceneShuttingDown) return true;
    if (!uiScene._gameplayUiReady) return true;
    if (uiScene._achievementBoardAwaitingDetailedReveal) return true;
    if (uiScene.achievementBoard?._hiddenUntilDetailed) return true;
    return false;
  }

  update(force = false) {
    if (Array.isArray(this.state.activeGoals)) {
      const before = this.state.activeGoals.length;
      this.state.activeGoals = this.state.activeGoals.filter((goal) => !this._isDeprecatedGoal(goal));
      if (this.state.activeGoals.length !== before) force = true;
    }

    let changed = this._ensureActiveSlots();
    if (this._shouldDeferCompletions()) {
      return this._emitChanged(force || changed) || changed;
    }

    let safety = 0;

    while (safety < 18) {
      const nextCompleted = (this.state.activeGoals || []).find((goal) => this._isGoalComplete(goal));
      if (!nextCompleted) break;
      this._completeGoal(nextCompleted);
      changed = true;
      safety += 1;
    }

    return this._emitChanged(force || changed) || changed;
  }
}
