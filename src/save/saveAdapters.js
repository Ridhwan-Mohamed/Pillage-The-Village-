import { TILE_TYPES } from "../constants.js";
import { UI_ITEM_TYPES } from "../UI/UIConstants.js";
import { POWERUP_CARDS } from "../Cards/PowerupCards.js";
import { MARKET_CARDS } from "../Cards/MarketCards.js";
import { Farmer } from "../players/Farmer.js";
import { Builder } from "../players/Builder.js";
import { Forager } from "../players/Forager.js";
import { Fireman } from "../players/Fireman.js";
import { Brawler } from "../players/Brawler.js";
import { Blademaster } from "../players/Blademaster.js";
import { Gunslinger } from "../players/Gunslinger.js";
import { Raider } from "../players/Raider.js";
import { FortGrunt } from "../players/FortGrunt.js";
import { Shocker } from "../players/Shocker.js";
import { ClayOven } from "../buildings/ClayOven.js";
import { blockResourceManager } from "../Manager/BlockResourceManager.js";
import { buildingManager } from "../Manager/buildingManager.js";
import { fightManager } from "../Manager/fightManager.js";
import { StaminaManager } from "../Manager/staminaManager.js";
import { Teams } from "../Teams.js";
import { weapons } from "../weapons.js";

export const TROOP_TYPE_REGISTRY = Object.freeze({
  get farmer() { return Farmer; },
  get builder() { return Builder; },
  get forager() { return Forager; },
  get fireman() { return Fireman; },
  get brawler() { return Brawler; },
  get blademaster() { return Blademaster; },
  get gunslinger() { return Gunslinger; },
  get raider() { return Raider; },
  get shocker() { return Shocker; },
  get fort_grunt() { return FortGrunt; },
});

export const CARD_REGISTRY = new Map((POWERUP_CARDS || []).map((card) => [card.id, card]));
export const MARKET_CARD_REGISTRY = new Map((MARKET_CARDS || []).map((card) => [card.id, card]));

let cardDefaults = null;

function getCardDefaults() {
  if (!cardDefaults) {
    cardDefaults = Object.freeze({
      Farmer: { speed: Farmer.speed, stamina: Farmer.stamina, maxWaterPailCarry: Farmer.maxWaterPailCarry },
      Builder: { speed: Builder.speed, stamina: Builder.stamina },
      Forager: { speed: Forager.speed, stamina: Forager.stamina },
      Fireman: { speed: Fireman.speed, stamina: Fireman.stamina },
      Brawler: { speed: Brawler.speed, stamina: Brawler.stamina },
      Blademaster: { speed: Blademaster.speed, stamina: Blademaster.stamina },
      Gunslinger: { speed: Gunslinger.speed, stamina: Gunslinger.stamina },
      ClayOven: { cookDuration: ClayOven.cookDuration },
      BlockResources: {
        woodBreakDuration: blockResourceManager.woodBreakDuration,
        rockBreakDuration: blockResourceManager.rockBreakDuration,
      },
      BuildingManager: {
        blockBuildingDuration: buildingManager.blockBuildingDuration,
        tileBuildingDuration: buildingManager.tileBuildingDuration,
        repairTickDuration: buildingManager.repairTickDuration,
      },
      StaminaManager: { staminaIncreaseAmnt: StaminaManager.staminaIncreaseAmnt },
      Teams: { cropReseedChance: Teams.cropReseedChance },
      Weapons: {
        pistolAccuracy: weapons.pistol.accuracy,
        pistolDuration: weapons.pistol.duration,
        pistolBaseDmg: weapons.pistol.baseDmg,
        pistolCritDmg: weapons.pistol.critDmg,
        boxingGlovesBaseDmg: weapons.boxingGloves.baseDmg,
        boxingGlovesCritDmg: weapons.boxingGloves.critDmg,
        swordBaseDmg: weapons.sword.baseDmg,
        swordCritDmg: weapons.sword.critDmg,
      },
      FightManager: {
        lastStandEnabled: fightManager.lastStandEnabled,
        lastStandThreshold: fightManager.lastStandThreshold,
        lastStandDamageMultiplier: fightManager.lastStandDamageMultiplier,
      },
    });
  }
  return cardDefaults;
}

getCardDefaults();

export function resetCardModifiedDefaults() {
  const defaults = getCardDefaults();
  Farmer.speed = defaults.Farmer.speed;
  Farmer.stamina = defaults.Farmer.stamina;
  Farmer.maxWaterPailCarry = defaults.Farmer.maxWaterPailCarry;
  Builder.speed = defaults.Builder.speed;
  Builder.stamina = defaults.Builder.stamina;
  Forager.speed = defaults.Forager.speed;
  Forager.stamina = defaults.Forager.stamina;
  Fireman.speed = defaults.Fireman.speed;
  Fireman.stamina = defaults.Fireman.stamina;
  Brawler.speed = defaults.Brawler.speed;
  Brawler.stamina = defaults.Brawler.stamina;
  Blademaster.speed = defaults.Blademaster.speed;
  Blademaster.stamina = defaults.Blademaster.stamina;
  Gunslinger.speed = defaults.Gunslinger.speed;
  Gunslinger.stamina = defaults.Gunslinger.stamina;
  ClayOven.cookDuration = defaults.ClayOven.cookDuration;
  blockResourceManager.woodBreakDuration = defaults.BlockResources.woodBreakDuration;
  blockResourceManager.rockBreakDuration = defaults.BlockResources.rockBreakDuration;
  buildingManager.blockBuildingDuration = defaults.BuildingManager.blockBuildingDuration;
  buildingManager.tileBuildingDuration = defaults.BuildingManager.tileBuildingDuration;
  buildingManager.repairTickDuration = defaults.BuildingManager.repairTickDuration;
  StaminaManager.staminaIncreaseAmnt = defaults.StaminaManager.staminaIncreaseAmnt;
  Teams.cropReseedChance = defaults.Teams.cropReseedChance;
  weapons.pistol.accuracy = defaults.Weapons.pistolAccuracy;
  weapons.pistol.duration = defaults.Weapons.pistolDuration;
  weapons.pistol.baseDmg = defaults.Weapons.pistolBaseDmg;
  weapons.pistol.critDmg = defaults.Weapons.pistolCritDmg;
  weapons.boxingGloves.baseDmg = defaults.Weapons.boxingGlovesBaseDmg;
  weapons.boxingGloves.critDmg = defaults.Weapons.boxingGlovesCritDmg;
  weapons.sword.baseDmg = defaults.Weapons.swordBaseDmg;
  weapons.sword.critDmg = defaults.Weapons.swordCritDmg;
  fightManager.lastStandEnabled = defaults.FightManager.lastStandEnabled;
  fightManager.lastStandThreshold = defaults.FightManager.lastStandThreshold;
  fightManager.lastStandDamageMultiplier = defaults.FightManager.lastStandDamageMultiplier;
}

export function reapplySavedCards(cardIds = []) {
  resetCardModifiedDefaults();
  const seen = new Set();
  for (const id of Array.isArray(cardIds) ? cardIds : []) {
    if (!id || seen.has(id)) continue;
    const card = CARD_REGISTRY.get(id);
    if (!card?.apply) continue;
    card.apply();
    seen.add(id);
  }
}

export function normalizeTeamId(teamId) {
  return String(teamId ?? "1");
}

export function getTileTypeKey(tileType) {
  if (!tileType) return null;
  if (typeof tileType === "string") return tileType;
  return tileType.name || null;
}

export function getTroopTypeKey(troop) {
  const ctor = troop?.type;
  if (ctor === Farmer) return "farmer";
  if (ctor === Builder) return "builder";
  if (ctor === Forager) return "forager";
  if (ctor === Fireman) return "fireman";
  if (ctor === Brawler) return "brawler";
  if (ctor === Blademaster) return "blademaster";
  if (ctor === Gunslinger) return "gunslinger";
  if (troop?.isFortGrunt || ctor === FortGrunt) return "fort_grunt";
  if (troop?.isShocker || ctor === Shocker) return "shocker";
  if (troop?.isRaider || ctor === Raider) return "raider";
  return null;
}

export function snapshotItemStack(slot) {
  if (!slot) return null;
  const itemName = typeof slot.item === "string" ? slot.item : slot.item?.name;
  if (!itemName) return null;
  return {
    item: itemName,
    amount: Math.max(0, Number(slot.amount || 0)),
    forceStore: !!slot.forceStore,
  };
}

export function restoreItemStack(snapshot) {
  if (!snapshot?.item) return null;
  const item = UI_ITEM_TYPES[snapshot.item];
  if (!item) return null;
  return {
    item,
    amount: Math.max(0, Number(snapshot.amount || 0)),
    forceStore: !!snapshot.forceStore,
  };
}

export function cloneSimple(value, fallback) {
  if (value == null) return fallback;
  try {
    return structuredClone(value);
  } catch {
    return fallback;
  }
}

export function getCardIdsFromHand(cardHand = []) {
  return (Array.isArray(cardHand) ? cardHand : [])
    .map((entry) => (typeof entry === "string" ? entry : entry?.id))
    .filter((id) => typeof id === "string" && id.length > 0);
}

export function makeBuildingRef(teamId, typeKey, x, y) {
  return `${normalizeTeamId(teamId)}:${String(typeKey || "unknown")}:${Number(x || 0)}:${Number(y || 0)}`;
}

export function makeStorageRef(teamId, x, y) {
  return `storage:${normalizeTeamId(teamId)}:${Number(x || 0)}:${Number(y || 0)}`;
}

export function makeOvenRef(teamId, x, y) {
  return `oven:${normalizeTeamId(teamId)}:${Number(x || 0)}:${Number(y || 0)}`;
}

export function makeCropRef(x, y) {
  return `crop:${Number(x || 0)}:${Number(y || 0)}`;
}

export function makeWallRef(x, y) {
  return `wall:${Number(x || 0)}:${Number(y || 0)}`;
}

export function getTileTypeByKey(typeKey) {
  return typeKey ? TILE_TYPES[typeKey] ?? null : null;
}
