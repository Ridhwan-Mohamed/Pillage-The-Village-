import icon_speed_boots from 'url:../assets/cardIcons/icon_speed_boots.png'
import icon_battery from 'url:../assets/cardIcons/icon_battery.png'
import icon_fire from 'url:../assets/cardIcons/icon_fire.png'
import icon_sleep_zzz from 'url:../assets/cardIcons/icon_sleep_zzz.png'
import icon_strength from 'url:../assets/cardIcons/icon_strength.png'
import icon_explosion from 'url:../assets/cardIcons/icon_explosion.png'
import icon_water_jar from 'url:../assets/cardIcons/icon_water_jar.png'
import icon_house from 'url:../assets/cardIcons/icon_house.png'
import icon_accuracy from 'url:../assets/cardIcons/icon_accuracy.png'
import { blockResourceManager } from '../Manager/BlockResourceManager'
import { buildingManager } from '../Manager/buildingManager'
import { fightManager } from '../Manager/fightManager'
import { StaminaManager } from '../Manager/staminaManager'
import { ClayOven } from '../buildings/ClayOven'
import { STORE_UNLOCK_KEYS, hasStoreUnlock } from '../parcel_system/StoreUnlockSystem'
import { Teams } from '../Teams'
import { Builder } from '../players/Builder'
import { Farmer } from '../players/Farmer'
import { Fireman } from '../players/Fireman'
import { Forager } from '../players/Forager'
import { Gunslinger } from '../players/Gunslinger'
import { weapons } from '../weapons'

const TEAM_ID = "1";
const RARITY = Object.freeze({
    common: "common",
    rare: "rare",
    epic: "epic",
    gold: "gold",
});
const POWER_BAND = Object.freeze({
    standard: "standard",
    highImpact: "high-impact",
    runDefining: "run-defining",
});
const CARD_WEIGHT_BY_RARITY = Object.freeze({
    [RARITY.common]: 18,
    [RARITY.rare]: 12,
    [RARITY.epic]: 7,
    [RARITY.gold]: 0.75,
});
const SPEED_25 = 1.25;
const SPEED_30 = 1.3;
const SPEED_35 = 1.35;
const STAMINA_DRAIN_MULTIPLIER = 0.8;
const DEADLY_AIM_ACCURACY_BONUS = 10;
const HYDRATED_FARMERS_WATER_BONUS = 2;
const MELEE_DAMAGE_BONUS = 1.18;
const LAST_STAND_THRESHOLD = 0.35;
const LAST_STAND_DAMAGE_BONUS = 1.2;
const RESEED_UNLOCK_CHANCE = 0.4;

function setStat(objectRef, key, nextValue) {
    objectRef[key] = nextValue;
}

function multiplyStat(objectRef, key, multiplier) {
    objectRef[key] *= multiplier;
}

function divideStat(objectRef, key, multiplier) {
    objectRef[key] /= multiplier;
}

function addStat(objectRef, key, amount) {
    objectRef[key] += amount;
}

function subtractStat(objectRef, key, amount) {
    objectRef[key] -= amount;
}

function clampStat(objectRef, key, amount, max = 99) {
    objectRef[key] = Math.min(max, objectRef[key] + amount);
}

function unclampStat(objectRef, key, amount) {
    objectRef[key] -= amount;
}

function hasUnlock(unlockKey) {
    return !unlockKey || hasStoreUnlock(unlockKey);
}

function makeCard({
    id,
    image,
    name,
    text,
    type,
    target,
    OUTLINE,
    rarity = RARITY.common,
    rewardWeight = null,
    unlockKey = null,
    eligible = null,
    apply = null,
    remove = null,
}) {
    const normalizedRarity = RARITY[rarity] || RARITY.common;
    const normalizedRewardWeight = Number(rewardWeight ?? CARD_WEIGHT_BY_RARITY[normalizedRarity] ?? 1);
    return Object.freeze({
        id,
        image,
        name,
        text,
        type,
        target,
        OUTLINE,
        rarity: normalizedRarity,
        powerBand: normalizedRarity === RARITY.gold
            ? POWER_BAND.runDefining
            : normalizedRarity === RARITY.epic
                ? POWER_BAND.highImpact
                : POWER_BAND.standard,
        rewardWeight: Number.isFinite(normalizedRewardWeight) && normalizedRewardWeight > 0
            ? normalizedRewardWeight
            : 1,
        unlockKey,
        eligible,
        apply,
        remove,
    });
}

function getCardRewardWeight(card) {
    const fallbackWeight = Number(CARD_WEIGHT_BY_RARITY[getPowerupCardRarity(card)] ?? 1);
    const weight = Number(card?.rewardWeight ?? fallbackWeight);
    return Number.isFinite(weight) && weight > 0 ? weight : 1;
}

function pickWeightedCard(candidates = []) {
    const weightedCandidates = candidates
        .map((card) => ({ card, weight: getCardRewardWeight(card) }))
        .filter((entry) => entry.weight > 0);
    if (!weightedCandidates.length) return null;

    const totalWeight = weightedCandidates.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const entry of weightedCandidates) {
        roll -= entry.weight;
        if (roll <= 0) return entry.card;
    }
    return weightedCandidates[weightedCandidates.length - 1]?.card ?? null;
}

function makeSpeedCard({
    id,
    name,
    text,
    target,
    outline,
    statOwner,
    multiplier = SPEED_25,
    rarity = RARITY.common,
    unlockKey = null,
}) {
    return makeCard({
        id,
        image: "icon_speed_boots",
        name,
        text,
        type: "player",
        target,
        OUTLINE: outline,
        rarity,
        unlockKey,
        apply: () => multiplyStat(statOwner, "speed", multiplier),
        remove: () => divideStat(statOwner, "speed", multiplier),
    });
}

function makeStaminaCard({
    id,
    name,
    text,
    target,
    outline,
    statOwner,
    rarity = RARITY.common,
    unlockKey = null,
}) {
    return makeCard({
        id,
        image: "icon_battery",
        name,
        text,
        type: "player",
        target,
        OUTLINE: outline,
        rarity,
        unlockKey,
        apply: () => multiplyStat(statOwner, "stamina", STAMINA_DRAIN_MULTIPLIER),
        remove: () => divideStat(statOwner, "stamina", STAMINA_DRAIN_MULTIPLIER),
    });
}

export function loadCardData(scene) {
    scene.load.image('icon_speed_boots', icon_speed_boots);
    scene.load.image('icon_battery', icon_battery);
    scene.load.image('icon_fire', icon_fire);
    scene.load.image('icon_sleep_zzz', icon_sleep_zzz);
    scene.load.image('icon_strength', icon_strength);
    scene.load.image('icon_explosion', icon_explosion);
    scene.load.image('icon_water_jar', icon_water_jar);
    scene.load.image('icon_house', icon_house);
    scene.load.image('icon_accuracy', icon_accuracy);
}

export function getPowerupCardRarity(card) {
    return RARITY[String(card?.rarity || "").trim().toLowerCase()] || RARITY.common;
}

export function isGoldPowerupCard(card) {
    return getPowerupCardRarity(card) === RARITY.gold;
}

export function isPowerupCardEligible(card, {
    scene = null,
    teamNumber = TEAM_ID,
} = {}) {
    if (!card) return false;
    if (!hasUnlock(card.unlockKey)) return false;
    if (typeof card.eligible === "function") {
        return !!card.eligible({
            scene,
            teamNumber: String(teamNumber ?? TEAM_ID),
            hasUnlock,
        });
    }
    return true;
}

export function getEligiblePowerupCards(options = {}) {
    return POWERUP_CARDS.filter((card) => isPowerupCardEligible(card, options));
}

export function pickRandomPowerupCards(count = 3, options = {}) {
    const maxGoldCards = Math.max(0, Number(options?.maxGoldCards ?? 1));
    const candidates = getEligiblePowerupCards(options);
    if (!candidates.length) return [];
    if (candidates.length <= count) {
        const copy = candidates.slice();
        Phaser.Utils.Array.Shuffle(copy);
        return copy;
    }

    const pool = candidates.slice();
    const result = [];
    let goldCount = 0;

    while (pool.length > 0 && result.length < count) {
        const eligiblePool = pool.filter((card) => (
            maxGoldCards <= 0
                ? !isGoldPowerupCard(card)
                : goldCount < maxGoldCards || !isGoldPowerupCard(card)
        ));
        const nextCard = pickWeightedCard(eligiblePool.length ? eligiblePool : pool);
        if (!nextCard) break;
        result.push(nextCard);
        if (isGoldPowerupCard(nextCard)) goldCount += 1;
        const nextIndex = pool.findIndex((card) => card?.id === nextCard?.id);
        if (nextIndex >= 0) pool.splice(nextIndex, 1);
    }

    if (result.length < count) {
        const usedIds = new Set(result.map((card) => card?.id).filter(Boolean));
        const fallback = candidates.filter((card) => !usedIds.has(card?.id));
        Phaser.Utils.Array.Shuffle(fallback);
        for (const card of fallback) {
            result.push(card);
            if (result.length >= count) break;
        }
    }

    return result;
}

export const POWERUP_CARDS = [
    makeSpeedCard({
        id: "farmer_speed_2x",
        name: "Fleet Farmers",
        text: "Farmers move 25% faster.",
        target: "farmer",
        outline: "#8b5a2b",
        statOwner: Farmer,
    }),
    makeSpeedCard({
        id: "fireman_speed_2x",
        name: "Rapid Firemen",
        text: "Firemen move 25% faster.",
        target: "fireman",
        outline: "#ff9933",
        statOwner: Fireman,
    }),
    makeSpeedCard({
        id: "gunslinger_speed_2x",
        name: "Trailblazer Gunslingers",
        text: "Gunslingers move 25% faster.",
        target: "gunslinger",
        outline: "#9999ff",
        statOwner: Gunslinger,
        rarity: RARITY.rare,
        unlockKey: STORE_UNLOCK_KEYS.gunslinger,
    }),
    makeSpeedCard({
        id: "forager_speed_2x",
        name: "Frantic Foragers",
        text: "Foragers move 25% faster.",
        target: "forager",
        outline: "#228B22",
        statOwner: Forager,
    }),
    makeSpeedCard({
        id: "builder_speed_2x",
        name: "Boisterous Builders",
        text: "Builders move 25% faster.",
        target: "builder",
        outline: "#4433ff",
        statOwner: Builder,
    }),
    makeStaminaCard({
        id: "farmer_stamina_half",
        name: "Efficient Farmers",
        text: "Farmers use 20% less stamina over time.",
        target: "farmer",
        outline: "#8b5a2b",
        statOwner: Farmer,
    }),
    makeStaminaCard({
        id: "fireman_stamina_half",
        name: "Efficient Firemen",
        text: "Firemen use 20% less stamina over time.",
        target: "fireman",
        outline: "#ff9933",
        statOwner: Fireman,
    }),
    makeStaminaCard({
        id: "gunslinger_stamina_half",
        name: "Efficient Gunslingers",
        text: "Gunslingers use 20% less stamina over time.",
        target: "gunslinger",
        outline: "#9999ff",
        statOwner: Gunslinger,
        rarity: RARITY.rare,
        unlockKey: STORE_UNLOCK_KEYS.gunslinger,
    }),
    makeStaminaCard({
        id: "forager_stamina_half",
        name: "Efficient Foragers",
        text: "Foragers use 20% less stamina over time.",
        target: "forager",
        outline: "#228B22",
        statOwner: Forager,
    }),
    makeStaminaCard({
        id: "builder_stamina_half",
        name: "Efficient Builders",
        text: "Builders use 20% less stamina over time.",
        target: "builder",
        outline: "#4433ff",
        statOwner: Builder,
    }),
    makeCard({
        id: "oven_speed_2x",
        image: "icon_fire",
        name: "Hot Ovens",
        text: "Clay ovens cook 30% faster.",
        type: "building",
        target: "clayOven",
        OUTLINE: "#8b4513",
        rarity: RARITY.common,
        apply: () => {
            divideStat(ClayOven, "cookDuration", SPEED_30);
            divideStat(ClayOven, "waterCookDuration", SPEED_30);
        },
        remove: () => {
            multiplyStat(ClayOven, "cookDuration", SPEED_30);
            multiplyStat(ClayOven, "waterCookDuration", SPEED_30);
        },
    }),
    makeCard({
        id: "sleep_regen_2x",
        image: "icon_sleep_zzz",
        name: "Restful Nights",
        text: "Sleeping restores 25% more stamina for everyone.",
        type: "global",
        target: "sleep",
        OUTLINE: "#3366ff",
        rarity: RARITY.common,
        apply: () => multiplyStat(StaminaManager, "staminaIncreaseAmnt", SPEED_25),
        remove: () => divideStat(StaminaManager, "staminaIncreaseAmnt", SPEED_25),
    }),
    makeCard({
        id: "gather_speed_wood_stone",
        image: "icon_strength",
        name: "Mighty Workers",
        text: "Wood chopping and stone breaking are 25% faster.",
        type: "gathering",
        target: "wood_stone",
        OUTLINE: "#64ff32",
        rarity: RARITY.rare,
        apply: () => {
            divideStat(blockResourceManager, "woodBreakDuration", SPEED_25);
            divideStat(blockResourceManager, "rockBreakDuration", SPEED_25);
        },
        remove: () => {
            multiplyStat(blockResourceManager, "woodBreakDuration", SPEED_25);
            multiplyStat(blockResourceManager, "rockBreakDuration", SPEED_25);
        },
    }),
    makeCard({
        id: "gunslinger_accuracy_50",
        image: "icon_accuracy",
        name: "Deadly Aim",
        text: "Gunslingers gain +10 accuracy.",
        type: "player",
        target: "gunslinger",
        OUTLINE: "#9999ff",
        rarity: RARITY.epic,
        unlockKey: STORE_UNLOCK_KEYS.gunslinger,
        apply: () => clampStat(weapons.pistol, "accuracy", DEADLY_AIM_ACCURACY_BONUS),
        remove: () => unclampStat(weapons.pistol, "accuracy", DEADLY_AIM_ACCURACY_BONUS),
    }),
    makeCard({
        id: "farmer_water_capacity_5",
        image: "icon_water_jar",
        name: "Hydrated Farmers",
        text: "Farmers can carry up to 4 water instead of 2.",
        type: "player",
        target: "farmer",
        OUTLINE: "#8b5a2b",
        rarity: RARITY.epic,
        apply: () => addStat(Farmer, "maxWaterPailCarry", HYDRATED_FARMERS_WATER_BONUS),
        remove: () => subtractStat(Farmer, "maxWaterPailCarry", HYDRATED_FARMERS_WATER_BONUS),
    }),
    makeCard({
        id: "build_speed_2x",
        image: "icon_house",
        name: "Master Builders",
        text: "Builders construct buildings and walls 30% faster.",
        type: "player",
        target: "builder",
        OUTLINE: "#4433ff",
        rarity: RARITY.rare,
        apply: () => {
            divideStat(buildingManager, "blockBuildingDuration", SPEED_30);
            divideStat(buildingManager, "tileBuildingDuration", SPEED_30);
        },
        remove: () => {
            multiplyStat(buildingManager, "blockBuildingDuration", SPEED_30);
            multiplyStat(buildingManager, "tileBuildingDuration", SPEED_30);
        },
    }),
    makeCard({
        id: "repair_speed_35",
        image: "icon_house",
        name: "Repair Crew",
        text: "Builders repair buildings and walls 35% faster.",
        type: "player",
        target: "builder",
        OUTLINE: "#4433ff",
        rarity: RARITY.rare,
        apply: () => divideStat(buildingManager, "repairTickDuration", SPEED_35),
        remove: () => multiplyStat(buildingManager, "repairTickDuration", SPEED_35),
    }),
    makeCard({
        id: "close_and_personal",
        image: "icon_strength",
        name: "Close and Personal",
        text: "Brawlers and blademasters deal 18% more melee damage.",
        type: "player",
        target: "melee",
        OUTLINE: "#d0a5ff",
        rarity: RARITY.epic,
        apply: () => {
            multiplyStat(weapons.boxingGloves, "baseDmg", MELEE_DAMAGE_BONUS);
            multiplyStat(weapons.boxingGloves, "critDmg", MELEE_DAMAGE_BONUS);
            multiplyStat(weapons.sword, "baseDmg", MELEE_DAMAGE_BONUS);
            multiplyStat(weapons.sword, "critDmg", MELEE_DAMAGE_BONUS);
        },
        remove: () => {
            divideStat(weapons.boxingGloves, "baseDmg", MELEE_DAMAGE_BONUS);
            divideStat(weapons.boxingGloves, "critDmg", MELEE_DAMAGE_BONUS);
            divideStat(weapons.sword, "baseDmg", MELEE_DAMAGE_BONUS);
            divideStat(weapons.sword, "critDmg", MELEE_DAMAGE_BONUS);
        },
    }),
    makeCard({
        id: "last_stand",
        image: "icon_explosion",
        name: "Last Stand",
        text: "Fighters below 35% health deal 20% more damage.",
        type: "player",
        target: "fighters",
        OUTLINE: "#ff7a7a",
        rarity: RARITY.epic,
        apply: () => {
            setStat(fightManager, "lastStandEnabled", true);
            setStat(fightManager, "lastStandThreshold", LAST_STAND_THRESHOLD);
            setStat(fightManager, "lastStandDamageMultiplier", LAST_STAND_DAMAGE_BONUS);
        },
        remove: () => {
            setStat(fightManager, "lastStandEnabled", false);
            setStat(fightManager, "lastStandThreshold", LAST_STAND_THRESHOLD);
            setStat(fightManager, "lastStandDamageMultiplier", LAST_STAND_DAMAGE_BONUS);
        },
    }),
    makeCard({
        id: "quickdraw",
        image: "icon_accuracy",
        name: "Quickdraw",
        text: "Gunslingers reload 35% faster.",
        type: "player",
        target: "gunslinger",
        OUTLINE: "#9999ff",
        rarity: RARITY.gold,
        unlockKey: STORE_UNLOCK_KEYS.gunslinger,
        apply: () => divideStat(weapons.pistol, "duration", SPEED_35),
        remove: () => multiplyStat(weapons.pistol, "duration", SPEED_35),
    }),
    makeCard({
        id: "reseed",
        image: "icon_water_jar",
        name: "Reseed",
        text: "Harvested crops have a 40% chance to reseed themselves.",
        type: "global",
        target: "crop",
        OUTLINE: "#45c9ff",
        rarity: RARITY.gold,
        apply: () => setStat(Teams, "cropReseedChance", RESEED_UNLOCK_CHANCE),
        remove: () => setStat(Teams, "cropReseedChance", Teams.DEFAULT_CROP_RESEED_CHANCE),
    }),
];
