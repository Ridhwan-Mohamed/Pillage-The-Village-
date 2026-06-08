import Phaser, { Plugins } from 'phaser';
import worldMap from 'url:./assets/worldMap.png'
import black from 'url:./assets/black.png'
import gray from 'url:./assets/gray.png'
import green from 'url:./assets/green.png'
import leader from 'url:./assets/purple.png'
import hammer from 'url:./assets/hammer.png'
import waterParticle from 'url:./assets/waterParticle.png'
import zoomOutWaterTxt1 from 'url:./assets/zoomOutWaterTxt1.png'
import zoomOutWaterTxt2 from 'url:./assets/zoomOutWaterTxt2.png'
import { Map as GameMap } from './map.js';
import { Turret } from './buildings/Turret.js';
import { Catapult } from './buildings/Catapult.js';
import { UIDEPTH, SQUARESIZE, WORLD_DIMENSIONX, WORLD_DIMENSIONY, TILE_TYPES, CONTROL_STATES, TILE_MAP, FLOORDEPTH, PARCEL, PRESSURE_CONTRACT, showAlert, colorFor, MAX_CROP_GROWTH_STAGE } from './constants';
import {itemTab} from './itemTab.js';
import { Player } from './players/Player.js';
import { Farmer } from './players/Farmer.js';
import { Builder } from './players/Builder.js';
import { Forager } from './players/Forager.js';
import { Fireman } from './players/Fireman.js';
import { Brawler } from './players/Brawler.js';
import { Blademaster } from './players/Blademaster.js';
import { Gunslinger } from './players/Gunslinger.js';
import { Raider } from './players/Raider.js';
import { Hunter } from './players/Hunter.js';
import { Bomber } from './players/Bomber.js';
import { Shocker } from './players/Shocker.js';
import { Projectile } from './Projectile.js';
import player from 'url:./assets/Players/player.png'
import gun1 from 'url:./assets/Players/gun1.png'
import playerAction from 'url:./assets/Players/playerAction.png'
import playerCarry from 'url:./assets/Players/playerCarry.png'
import playerDeath from 'url:./assets/Players/player_death.png'
import { playerDict, setupTownBoundsToggle, townBounds, townRoads, clearBuildingArray, clearPlayerDict, spawnPoints } from './town.js';
import { tillManager } from './Manager/tillManager.js'
import { Teams } from './Teams.js';
import { buildingManager } from './Manager/buildingManager.js';
import monies from 'url:./assets/monies.png'
import seeds from 'url:./assets/seeds.png'
import { fightManager } from './Manager/fightManager.js';
import { seedManager } from './Manager/seedManager.js';
import char from 'url:./assets/char.png'
import berry from 'url:./assets/berry.png'
import spawn from 'url:./assets/hole.png'
import { recalculateDestroyTasksFromPoint, spawnSeaRaider } from './Manager/spawnManager.js';
import { Clock } from './Controllers/Clock.js';
import clayOven from 'url:./assets/clayOven.png'
import { ClayOven } from './buildings/ClayOven.js';
import { DailyNeedsTracker } from './UI/DailyNeedsTracker.js';
import tillOverlay from 'url:./assets/tillOverlay.png'
import foodIcon from 'url:./assets/foodIcon.png'
import waterIcon from 'url:./assets/waterIcon.png'
import woodIcon from 'url:./assets/woodIcon.png'
import stoneIcon from 'url:./assets/stoneIcon.png'
import playerIcon from 'url:./assets/playerIcon.png'
import uncleanWaterIcon from 'url:./assets/uncleanWaterIcon.png'
import { ClayOvenUI } from './UI/ClayOvenUI.js';
import { StorageBuilding } from './buildings/Storage.js';
import { StorageUI } from './UI/StorageUI.js';
import { StorageManager } from './Manager/StorageManager.js';
import { House } from './buildings/House.js';
import { GameStart } from './Controllers/GameStart.js';
import { ZoomMixer } from './UI/ZoomMixer.js';
import { MainMenu } from './mainMenu.js';
import { blockResourceManager } from './Manager/BlockResourceManager.js';
import { HouseUI } from './UI/HouseUI.js';
import UIPlugin from 'phaser3-rex-plugins/templates/ui/ui-plugin.js';
import fullBasePine from 'url:./assets/trees/fullBasePine.png';
import fullMiddlePine from 'url:./assets/trees/fullMiddlePine.png';
import fullTopPine from 'url:./assets/trees/fullTopPine.png';
import mediumBasePine from 'url:./assets/trees/mediumBasePine.png';
import mediumMiddlePine from 'url:./assets/trees/mediumMiddlePine.png';
import mediumTopPine from 'url:./assets/trees/mediumTopPine.png';
import { PineTree } from './buildings/pineTree.js';
import { RockNode } from './buildings/RockNode.js';
import { VisibilitySystem } from './UI/VisibilitySystem.js';
import { getEligiblePowerupCards, loadCardData } from './Cards/PowerupCards.js';
import { AudioManager } from './Manager/AudioManager.js';
import { WallPlacementController } from './Controllers/WallPlacementController.js';
import { WallDestroyController } from './Controllers/WallDestroyController.js';
import { TowerBuilding } from './buildings/Tower.js';
import { Bank } from './buildings/Bank.js';
import { Prison } from './buildings/Prison.js';
import { TowerPressureController } from './parcel_system/TowerPressureController.js';
import { StageState } from './parcelController/StageState.js';
import { loadParcelMarketAssets } from './UI/ShipMarket.js';
import { getMarketCardDefinition } from './Cards/MarketCards.js';
import { clearNorthFort, spawnNorthFort } from './parcel_system/FortRaidParcel.js';
import { GameUIScene } from './UI/GameUIScene.js';
import { OverviewCloudLayer } from './UI/OverviewCloudLayer.js';
import { OverviewOceanWaves } from './UI/OverviewOceanWaves.js';
import { OverviewShoreWaves } from './UI/OverviewShoreWaves.js';
import { OrderRunner } from './orders/OrderRunner.js';
import { getBossUnlockReward, openBossUnlockRewardPresentation } from './parcel_system/BossUnlockRewardSystem.js';
import { getHordeUnlockReward } from './parcel_system/HordeUnlockTrack.js';
import { hasStoreUnlock, STORE_UNLOCK_KEYS, unlockStoreItem } from './parcel_system/StoreUnlockSystem.js';
import { createPlayerPortraitAnimations, getPlayerPortraitKey, preloadPlayerPortraits } from './players/playerPortraits.js';
import { getHordeModifierForIndex } from './parcel_system/HordeModifiers.js';
import { addCardToHand, getCardHand } from './UI/Powerups.js';
import { addCardToInventory, buildCardAddedPayload, ensureCardInventory } from './Cards/CardInventory.js';
import { UI_ITEM_TYPES } from './UI/UIConstants.js';
import { SaveManager } from './save/SaveManager.js';
import { AchievementSystem } from './achievements/AchievementSystem.js';
import { TutorialManager } from './tutorial/TutorialManager.js';
import { createTutorialAnimations, preloadTutorialAssets } from './tutorial/TutorialAssets.js';
import {
    buildMarketPriceTable,
    buildEnemyTypeLabel,
    distributeAcrossLanes,
    getNightHordeSettings,
    pickScaledEnemyType,
} from './balance/GameBalance.js';
import reliefPackageImg from 'url:./assets/market/relief_package.png'
import parcelCouponImg from 'url:./assets/cardIcons/parcel_coupon.png'
import recruitVoucherImg from 'url:./assets/cardIcons/recruit_voucher.png'
import {
    RELIEF_PACKAGE_CRITICAL_ROLES,
    RELIEF_PACKAGE_ECONOMY_ROLE_COSTS,
    RELIEF_PACKAGE_MAX_COUNT,
    RELIEF_PACKAGE_MONEY_GRANT,
    RELIEF_PACKAGE_PRICE,
} from './ReliefPackageConfig.js';

const screenH = window.innerHeight
const screenW = window.innerWidth
const RUN_TROOP_UNLOCK_KEYS = new Set([
    STORE_UNLOCK_KEYS.blademaster,
    STORE_UNLOCK_KEYS.gunslinger,
]);
const DEMO_COMPLETION_STORE_UNLOCK_LABELS = Object.freeze({
    [STORE_UNLOCK_KEYS.blademaster]: "Blademaster",
    [STORE_UNLOCK_KEYS.gunslinger]: "Gunslinger",
    [STORE_UNLOCK_KEYS.stoneWall]: "Stone Walls",
    [STORE_UNLOCK_KEYS.militiaParcel]: "Militia Parcels",
});
const DEMO_COMPLETION_STORE_UNLOCK_KEYS = Object.freeze(Object.keys(DEMO_COMPLETION_STORE_UNLOCK_LABELS));
const TOWN_XP_TEAM_ID = "1";
const TOWN_XP_COLORS = Object.freeze({
    mint: 0x93f5d7,
    cyan: 0x8fe7ff,
    cream: 0xfff0c9,
    peach: 0xffd7a5,
    lilac: 0xd8c4ff,
    blue: 0x1b405d,
});
const TOWN_XP_SOURCE_VALUES = Object.freeze({
    parcelClaim: 20,
    raiderKill: 4,
    fortGruntKill: 8,
    hordeSurvived: 55,
    fortCleared: 95,
});
const TOWN_XP_SUPPLY_CAPS = Object.freeze({
    permits: 1,
    wood: 3,
    stone: 3,
    seeds: 3,
    food: 3,
    cleanWater: 3,
    berries: 2,
});
const TOWN_XP_MARKET_REWARD_IDS = Object.freeze([
    "second_wind_bell",
    "melee_crit_buff",
    "projectile_crit_buff",
]);
const TOWN_XP_SPECIAL_REWARD_DEFS = Object.freeze({
    parcel_coupon: {
        title: "Parcel Coupon",
        subtitle: "Your next parcel contract costs 25% less.",
        hint: "A one-use economy perk that cheapens the next parcel buy.",
        imageKey: "reward_parcel_coupon",
        accentColor: 0xffd7a5,
        panelColor: 0x2a3441,
        alertColor: "#ffd7a5",
    },
    recruit_voucher: {
        title: "Recruit Voucher",
        subtitle: "Your next recruit is free.",
        hint: "Shows FREE in the crew store until one recruit is taken.",
        imageKey: "reward_recruit_voucher",
        accentColor: 0xfff0c9,
        panelColor: 0x253548,
        alertColor: "#fff0c9",
    },
});
const DEBUG_BOMBER_START_HORDE_INDEX = 1;
const NIGHT_HORDE_BOMBER_RATIO = 0.2;
const SHOCKER_BOSS_DAY = 7;
const SHOCKER_BOSS_WEEK_INTERVAL = 7;
const SHOCKER_BOSS_HP_SCALE_PER_APPEARANCE = 0.12;
const SHOCKER_BOSS_HP_SCALE_CAP = 0.48;
const SHOCKER_BOSS_NAME = "The Shocker";
const SHOCKER_BOSS_REWARD_MONEY = 1200;
const SHOCKER_BOSS_REWARD_PERMITS = 2;
const FORAGER_ROUTE_RESOURCE_UI = Object.freeze({
    wood: {
        action: "Cut down",
        target: "trees",
        color: 0x34d399,
        textColor: "#86efac",
        alert: "Routed forager to trees",
        cardLabel: "Tree",
        cardIcon: "woodIcon",
    },
    stone: {
        action: "Mine",
        target: "rocks",
        color: 0x93c5fd,
        textColor: "#bfdbfe",
        alert: "Routed forager to rocks",
        cardLabel: "Rock",
        cardIcon: "stoneIcon",
    },
    gold: {
        action: "Mine",
        target: "gold ore",
        color: 0xfacc15,
        textColor: "#fde68a",
        alert: "Routed forager to gold ore",
        cardLabel: "Gold Ore",
        cardIcon: "monies",
    },
    seed: {
        action: "Gather",
        target: "seeds",
        color: 0xfacc15,
        textColor: "#fde68a",
        alert: "Routed forager to seed bushes",
        cardLabel: "Seed Bush",
        cardIcon: "seeds",
    },
    berry: {
        action: "Gather",
        target: "berries",
        color: 0xc084fc,
        textColor: "#e9d5ff",
        alert: "Routed forager to berry bushes",
        cardLabel: "Berry Bush",
        cardIcon: "berry",
    },
});
const DEBUG_SHOW_MILITIA_LEVEL3_UNLOCK_ON_START = false;
const TOWN_XP_RECRUIT_DEFS = Object.freeze([
    { key: "farmer", title: "Fresh Farmer", subtitle: "Recruit 1 Farmer for your village", accentColor: 0x8b5a2b, ctor: Farmer },
    { key: "builder", title: "Busy Builder", subtitle: "Recruit 1 Builder for faster construction", accentColor: 0x4433ff, ctor: Builder },
    { key: "forager", title: "Trail Forager", subtitle: "Recruit 1 Forager for quick gathering", accentColor: 0x2cb96f, ctor: Forager },
    { key: "fireman", title: "Spark Fireman", subtitle: "Recruit 1 Fireman to keep ovens and flames humming", accentColor: 0xff9933, ctor: Fireman },
    { key: "brawler", title: "Town Brawler", subtitle: "Recruit 1 Brawler to help hold the line", accentColor: 0xffd712, ctor: Brawler },
    { key: "gunslinger", title: "Quickdraw Gunslinger", subtitle: "Recruit 1 Gunslinger if that troop is unlocked", accentColor: 0x9999ff, ctor: Gunslinger, unlockKey: STORE_UNLOCK_KEYS.gunslinger },
    { key: "blademaster", title: "Swift Blademaster", subtitle: "Recruit 1 Blademaster if that troop is unlocked", accentColor: 0xaa33ee, ctor: Blademaster, unlockKey: STORE_UNLOCK_KEYS.blademaster },
]);

export class mapView extends Phaser.Scene {
    constructor() {
        super('mapView');
        this._bindSceneStatics();
        this._resetRuntimeState();
    }

    init() {
        this._bindSceneStatics();
        this._resetRuntimeState();
    }

    _bindSceneStatics() {
        mapView.scene = this;
        GameMap.scene = this;
        Turret.scene = this;
        Catapult.scene = this;
        tillManager.scene = this;
        buildingManager.scene = this;
        blockResourceManager.scene = this;
        fightManager.scene = this;
        seedManager.scene = this;
        StorageManager.scene = this;
        ClayOven.scene = this;
        itemTab.mapRef = this;
        House.scene = this;
        ZoomMixer.scene = this;
    }

    _createRunStats() {
        return {
            nightsSurvived: 0,
            parcelsClaimed: 0,
            enemiesDefeated: 0,
            moneyEarnedTotal: 0,
            troopUnlockKeys: new Set(),
            troopUnlockLabels: [],
            claimedContractIds: new Set(),
            defeatedEnemyIds: new Set(),
            claimedParcelTypes: {},
            marketPriceInflation: {},
            rewardEconomy: {
                nextParcelDiscount: 0,
                nextFreeRecruit: false,
            },
        };
    }

    _getTownXpRequirement(level = 1) {
        const normalized = Math.max(1, Number(level || 1));
        const priorLevels = Math.max(0, normalized - 1);
        if (normalized <= 3) {
            return 70 + (priorLevels * 30) + (Math.max(0, priorLevels - 1) * 10);
        }
        const lateLevels = normalized - 3;
        return 140 + (lateLevels * 56) + (lateLevels * lateLevels * 18);
    }

    _createTownXpState() {
        return {
            level: 1,
            xpIntoLevel: 0,
            xpForNextLevel: this._getTownXpRequirement(1),
            totalEarned: 0,
            pendingLevelRewards: 0,
            gainSerial: 0,
            lastGainAmount: 0,
            lastGainLabel: "",
            rewardReadyAt: 0,
            pendingMilitiaUnlockReward: false,
            militiaUnlockRewardShown: false,
        };
    }

    _isTutorialActive() {
        return !!this.tutorialManager?.isActive?.();
    }

    _isTownXpRewardPresentationBlocked() {
        return !!(
            this._continueCameraLockActive ||
            this._startupCameraLocked ||
            this._menuModeActive ||
            this.isMainMenuPreview ||
            this._pendingMenuPhase
        );
    }

    getTownXpSnapshot() {
        const state = this._townXp || (this._townXp = this._createTownXpState());
        const level = Math.max(1, Number(state.level || 1));
        const required = this._getTownXpRequirement(level);
        state.xpForNextLevel = required;
        return {
            level,
            xpIntoLevel: Math.max(0, Number(state.xpIntoLevel || 0)),
            xpForNextLevel: Math.max(1, required),
            totalEarned: Math.max(0, Number(state.totalEarned || 0)),
            pendingLevelRewards: Math.max(0, Number(state.pendingLevelRewards || 0)),
            gainSerial: Math.max(0, Number(state.gainSerial || 0)),
            lastGainAmount: Math.max(0, Number(state.lastGainAmount || 0)),
            lastGainLabel: String(state.lastGainLabel || "Town XP"),
            lastGainSource: state.lastGainSource
                && Number.isFinite(state.lastGainSource.x)
                && Number.isFinite(state.lastGainSource.y)
                ? { x: state.lastGainSource.x, y: state.lastGainSource.y }
                : null,
            progress: Math.max(
                0,
                Math.min(
                    1,
                    Math.max(0, Number(state.xpIntoLevel || 0))
                    / Math.max(1, Number(state.xpForNextLevel || this._getTownXpRequirement(state.level || 1)))
                )
            ),
        };
    }

    _emitTownXpChangedNow() {
        this._townXpChangedQueued = false;
        if (this._townXpChangedTimer) {
            this._townXpChangedTimer.remove?.(false);
            this._townXpChangedTimer = null;
        }
        this.events.emit("townxp:changed", this.getTownXpSnapshot());
    }

    _queueTownXpChanged({ immediate = false } = {}) {
        if (immediate) {
            this._emitTownXpChangedNow();
            return;
        }

        if (this._townXpChangedQueued) return;
        this._townXpChangedQueued = true;

        const flush = () => {
            if (!this._townXpChangedQueued) return;
            this._emitTownXpChangedNow();
        };

        this._townXpChangedTimer = this.time?.delayedCall?.(0, flush) || null;
        if (this._townXpChangedTimer) return;

        Promise.resolve().then(flush);
    }

    getAchievementBoardSnapshot() {
        return this.achievementSystem?.getBoardSnapshot?.() ?? {
            serial: 0,
            totalCompleted: 0,
            activeGoals: [],
        };
    }

    _buildMilitiaUnlockReward() {
        return {
            id: "town_xp_militia_unlock",
            unlockKey: STORE_UNLOCK_KEYS.militiaParcel,
            title: "Militia Parcel Unlocked",
            description: "Militia parcels are now available in contract slots. Buy temporary 1-day island defense formations from the parcel menu.",
            displayLabel: "Militia Parcel",
            badgeLabel: "TOWN LEVEL UNLOCK",
            subLabel: "NEW PARCEL OPTION",
            emoji: "🛡",
            accentColor: 0x7dd3fc,
            glowColor: 0xdbeafe,
            panelColor: 0x132238,
            onGrant: (scene) => {
                unlockStoreItem(STORE_UNLOCK_KEYS.militiaParcel, scene);
            },
        };
    }

    _queueMilitiaUnlockRewardFromTownXp(previousLevel, newLevel) {
        const prev = Math.max(1, Number(previousLevel || 1));
        const next = Math.max(prev, Number(newLevel || prev));
        const state = this._townXp || (this._townXp = this._createTownXpState());

        if (prev >= 3 || next < 3) return false;
        if (state.militiaUnlockRewardShown) return false;

        state.pendingMilitiaUnlockReward = true;
        return true;
    }

    _tryPresentPendingMilitiaUnlockReward() {
        const state = this._townXp || (this._townXp = this._createTownXpState());
        if (!state.pendingMilitiaUnlockReward || state.militiaUnlockRewardShown) return false;
        if (this._isTutorialActive()) return false;
        if (this._isTownXpRewardPresentationBlocked()) return false;
        if (this._townTowerLossInProgress || this._restartToMainMenuInProgress) return false;
        if (this._activeRewardUI || this._activeBossRewardUI || this._activeTownXpRewardUI) return false;
        if (this._hordeRewardInProgress || this.stageCompleteLock) return false;
        if (this.menu?.active || this.draftMenu?.active) return false;
        if (this.clock?.paused) return false;

        const phaseKey = this.clock?.getPhaseKey?.() || this._currentPhaseKey;
        if (phaseKey === "night") return false;
        if (Number(this.time?.now || 0) < Math.max(0, Number(state.rewardReadyAt || 0))) return false;

        const reward = this._buildMilitiaUnlockReward();
        this.clock.paused = true;
        this.applySimulationSpeed(true);
        this._movementLocked = true;

        this._activeBossRewardUI?.destroy?.();
        this._activeBossRewardUI = openBossUnlockRewardPresentation(this, {
            reward,
            onComplete: () => {
                this._activeBossRewardUI = null;
                state.pendingMilitiaUnlockReward = false;
                state.militiaUnlockRewardShown = true;
                state.rewardReadyAt = Number(this.time?.now || 0) + 140;
                this._movementLocked = false;
                if (!this._townTowerLossInProgress && !this._restartToMainMenuInProgress) {
                    this.clock.paused = false;
                    this.applySimulationSpeed(true);
                }
                this.parcelSpawnUI?.resetUiState?.();
                this.parcelSpawnUI?.refreshMilitiaLockState?.();
                this._queueTownXpChanged({ immediate: true });
                SaveManager.queueAutosave("town_xp_militia_unlock");
                this.time?.delayedCall?.(180, () => this._tryPresentPendingTownXpReward());
            },
        });

        return true;
    }

    _maybeShowDebugMilitiaLevel3Unlock() {
        if (!DEBUG_SHOW_MILITIA_LEVEL3_UNLOCK_ON_START) return;
        if (this._debugMilitiaLevel3UnlockShown) return;
        this._debugMilitiaLevel3UnlockShown = true;

        this.time?.delayedCall?.(900, () => {
            if (this._townTowerLossInProgress || this._restartToMainMenuInProgress) return;

            const state = this._townXp || (this._townXp = this._createTownXpState());
            state.level = Math.max(3, Number(state.level || 1));
            state.xpForNextLevel = this._getTownXpRequirement(state.level);

            if (!this._isMilitiaParcelUnlocked()) {
                unlockStoreItem(STORE_UNLOCK_KEYS.militiaParcel, this);
            }

            this._queueTownXpChanged({ immediate: true });
            this._showMilitiaParcelUnlockPresentation();
        });
    }

    _resetRuntimeState() {
        this.gridPlace = false;
        this.selectMode = true;
        this.brushTiles = []; // Array to store affected tiles
        this.isBrushMode = false; // Track if brush mode is active
        this.isBrushActive = false;
        this.farmMode = false;
        this.stoneWallMode = false;
        this.woodWallMode = false;
        // Farm plot selection state (laptop-friendly, 2-click)
        this._prevFarmMode = false;
        this.farmConsumeNextClick = false;
        this.farmSelectActive = false;     // true while choosing plot corners
        this.farmSelectPhase = 0;          // 0=inactive, 1=pick start, 2=pick end
        this.farmHover = null;             // phase-1 hover outline graphic
        this.farmBanner = null;            // top-center instruction banner (container)
        this.farmBannerParts = null;       // { left, esc, middle, seedCount, seedIcon, right }
        this.farmInstructionText = null;   // top-center instruction banner
        this.farmInstructionUI = null;
        this.farmInstructionBg = null;
        this.farmInstrLeft = null;
        this.farmInstrMid = null;
        this.farmInstrSeedCount = null;
        this.farmInstrSeedIcon = null;
        this.farmInstrRight = null;
        this.foragerRouteGlow = null;
        this.foragerRouteInstructionUI = null;
        this.foragerRouteInstructionBg = null;
        this.foragerRouteInstructionLeft = null;
        this.foragerRouteInstructionTarget = null;
        this.foragerRouteInstructionRight = null;
        this.foragerRouteHoverNode = null;
        this.foragerRouteHoverType = null;
        this.foragerRouteHoverCard = null;
        this.foragerRouteHoverCardBg = null;
        this.foragerRouteHoverCardIcon = null;
        this.foragerRouteHoverCardLabel = null;
        this.foragerRouteHoverCardNode = null;
        this.foragerRouteHoverCardSize = { width: 0, height: 0 };
        this.cropHoverCard = null;
        this.cropHoverCardBg = null;
        this.cropHoverCardIcon = null;
        this.cropHoverCardLabel = null;
        this.cropHoverCardTarget = null;
        this.cropHoverCardSize = { width: 0, height: 0 };
        this.wallHoverCard = null;
        this.wallHoverCardBg = null;
        this.wallHoverCardIcon = null;
        this.wallHoverCardLabel = null;
        this.wallHoverCardTarget = null;
        this.wallHoverCardSize = { width: 0, height: 0 };
        this._foragerRouteAssistSignature = "";
        this._foragerRouteLastDrawAt = 0;
        this.harvestMode = false;
        this.money = 400; // Starting fallback amount
        this.seeds = 10;
        this.foodAmnt = 15;
        this.cleanWaterAmnt = 15;
        this.woodAmnt = 4;
        this.stoneAmnt = 4;
        this.berries = 0;
        this.permits = 3;
        this.berryMode = false;
        this.seedGridMode = false;
        this.selectingEnemies = false;
        this.enemySelectStart = null;
        this.enemySelectionRect = null;
        this.tillPreviewSprites = new Map(); // key = "x,y" → sprite
        this.farmSelectionPreviewSprites = new Map();
        this.tillPulseTween = null;
        this.guardPlacement = { active: false, troop: null };
        this._trackpadDoubleClickWindowMs = 520;
        this._trackpadDoubleClickRadiusPx = 44;
        this._lastPrimaryPointerDownAt = -Infinity;
        this._lastPrimaryPointerDownX = 0;
        this._lastPrimaryPointerDownY = 0;
        this._lastPrimaryPointerUpAt = -Infinity;
        this._lastPrimaryPointerUpX = 0;
        this._lastPrimaryPointerUpY = 0;
        this._trackpadTapDragActive = false;
        this._trackpadTapDragMoved = false;
        this._trackpadTapDragIdleMs = 220;
        this._trackpadTapDragTimer = null;
        this._trackpadSelectStartWorld = null;
        this._trackpadSelectEndWorld = null;
        this._selectionDragZone = null;
        this._selectionDragDistanceThreshold = 6;
        this._selectionDragPending = false;
        this._selectionDragActive = false;
        this._selectionDragPointerId = null;
        this._selectionDragStartScreenX = 0;
        this._selectionDragStartScreenY = 0;
        this._debugCurrentText = null;
        this._debugSelectionCountText = null;
        this.selectedSimSpeed = 1;
        this.simNowMs = 0;
        this._simulationSpeedReady = false;
        this._simulationPauseReasons = new Set();
        this._appliedSimulationSpeed = 0;
        this._appliedEngineSimSpeed = 1;
        this._northFortMainIslandOrigin = null;
        this._northFortArrival = {
            pending: false,
            delayDays: 0,
            createdOnDay: 1,
            arrivalDay: 1,
            reason: null,
            seasonIndex: 1,
            stageIndex: 1,
        };
        this._northFortArrivalMarker = null;
        this._activeFort = null;
        this._activeNightHorde = null;
        this._activeShockerBoss = null;
        this._shockerBossState = {
            defeated: false,
            nightLocked: false,
            bossId: null,
            startedOnDay: null,
            defeatedOnDay: null,
            appearanceIndex: 0,
        };
        this._cachedNightHordePlan = null;
        this._hordeRewardInProgress = false;
        this._reliefRecoveryInProgress = false;
        this._reliefRecoveryQueuedForDawn = false;
        this._storageCollapseLossInProgress = false;
        this._storageCollapseCheckQueued = false;
        this._storageCollapseWarned = false;
        this._storageCollapseLastCheckedAt = 0;
        this._pendingStorageCollapseSource = null;
        this._townTowerLossInProgress = false;
        this._restartToMainMenuInProgress = false;
        this._lastTownCoreLost = null;
        this._gameOverOverlay = null;
        this._townTowerStats = { built: 0, destroyed: 0 };
        this._runStats = this._createRunStats();
        this._townXp = this._createTownXpState();
        this._activeRewardUI = null;
        this._activeBossRewardUI = null;
        this._activeTownXpRewardUI = null;
        this.achievementSystem = null;
        this.tutorialManager = null;
        this._debugMilitiaLevel3UnlockShown = false;
        this._movementLocked = false;
        this.stageCompleteLock = false;
        this.clock = null;
        this.uiScene = null;
        this.zoomMixer = null;
        this.parcelSpawnUI = null;
        this.parcelManager = null;
        this.navMeshUpdater = null;
        this.enemyNavMeshUpdater = null;
        this.menu = null;
        this.logo = null;
        this.logoMini = null;
        this.startButton = null;
        this.menuPreview = null;
        this.draftMenu = null;
        this._teamTownIcon = null;
        this.continueButton = null;
        this._skipStarterResourceSeed = false;
        this._pendingContinueSnapshot = null;
        this._draftTownIconUnsub = null;
        this._stageHud = null;
        this._pendingMenuPhase = false;
        this._menuModeActive = false;
        this._startupCameraLocked = true;
        this._continueCameraLockActive = false;
        this._startupCameraCenter = null;
        this._menuRevealFx = null;
        this._restartCarryCover = null;
        this._scaleResizeHandlers = [];
        this._registryImageChangedHandler = null;
    }

    _trackScaleResize(handler) {
        if (!handler) return null;
        this.scale?.on?.("resize", handler);
        this._scaleResizeHandlers.push(handler);
        return handler;
    }

    _getStartupCameraPose() {
        const overlayScene = MainMenu._getOverlayScene?.(this) || this;
        return MainMenu._getDraftCameraPose?.(this, overlayScene, this._pendingContinueSnapshot)
            || MainMenu._getMainIslandOverviewPose?.(this, overlayScene, this._pendingContinueSnapshot)
            || null;
    }

    _applyStartupCameraPose({ applyZoom = false } = {}) {
        const cam = this.cameras?.main;
        if (!cam) return;

        const pose = this._getStartupCameraPose();
        if (applyZoom && pose) {
            MainMenu._applyCameraPose?.(cam, pose);
            if (Number.isFinite(pose.centerX) && Number.isFinite(pose.centerY)) {
                this._startupCameraCenter = { x: pose.centerX, y: pose.centerY };
            }
            return;
        }

        const zoom = Math.max(0.0001, Number(cam.zoom || pose?.targetZoom || 1));
        const lockedCenter = this._startupCameraCenter;
        const centerX = Number.isFinite(lockedCenter?.x)
            ? lockedCenter.x
            : Number.isFinite(pose?.centerX)
            ? pose.centerX
            : ((PARCEL.MAIN_ORIGIN.x + (PARCEL.SIZE * 0.5)) * SQUARESIZE);
        const centerY = Number.isFinite(lockedCenter?.y)
            ? lockedCenter.y
            : Number.isFinite(pose?.centerY)
            ? pose.centerY
            : ((PARCEL.MAIN_ORIGIN.y + (PARCEL.SIZE * 0.5)) * SQUARESIZE);
        const scrollX = centerX - ((cam.width * 0.5) / zoom);
        const scrollY = centerY - ((cam.height * 0.5) / zoom);

        cam.setScroll(scrollX, scrollY);
        cam.scrollX = scrollX;
        cam.scrollY = scrollY;
    }

    registerRunParcelClaim(type, meta = {}) {
        const normalized = String(type || "").toUpperCase();
        if (!normalized || normalized === "PRESSURE" || normalized === "MILITIA") return;
        const stats = this._runStats || (this._runStats = this._createRunStats());
        const key = meta?.contractId || `${normalized}:${meta?.slotId ?? "?"}:${stats.parcelsClaimed}`;
        if (stats.claimedContractIds.has(key)) return;
        stats.claimedContractIds.add(key);
        stats.parcelsClaimed += 1;
        stats.claimedParcelTypes = {
            ...(stats.claimedParcelTypes || {}),
            [normalized]: true,
        };
        this.addTownXp(TOWN_XP_SOURCE_VALUES.parcelClaim, "Parcel Claimed");
        SaveManager.queueAutosave("parcel_claim");
    }

    _getRewardEconomyState() {
        const stats = this._runStats || (this._runStats = this._createRunStats());
        if (!stats.rewardEconomy || typeof stats.rewardEconomy !== "object") {
            stats.rewardEconomy = {
                nextParcelDiscount: 0,
                nextFreeRecruit: false,
            };
        }
        if (!stats.marketPriceInflation || typeof stats.marketPriceInflation !== "object") {
            stats.marketPriceInflation = {};
        }
        if (!stats.claimedParcelTypes || typeof stats.claimedParcelTypes !== "object") {
            stats.claimedParcelTypes = {};
        }
        return stats.rewardEconomy;
    }

    _emitRewardStateChanged() {
        this.events.emit("reward-state:changed", {
            nextParcelDiscount: this.getNextParcelDiscount(),
            nextFreeRecruit: this.hasRecruitVoucher(),
        });
    }

    _hasClaimedRunParcelType(type) {
        const normalized = String(type || "").toUpperCase();
        if (!normalized) return false;
        const stats = this._runStats || (this._runStats = this._createRunStats());
        return !!stats.claimedParcelTypes?.[normalized];
    }

    getNextParcelDiscount() {
        const state = this._getRewardEconomyState();
        return Math.max(0, Number(state.nextParcelDiscount || 0));
    }

    grantParcelCoupon(discount = 0.25) {
        const state = this._getRewardEconomyState();
        state.nextParcelDiscount = Math.max(Number(state.nextParcelDiscount || 0), Number(discount || 0));
        this._emitRewardStateChanged();
        SaveManager.queueAutosave("reward_parcel_coupon");
        return state.nextParcelDiscount;
    }

    consumeParcelCoupon() {
        const state = this._getRewardEconomyState();
        const discount = Math.max(0, Number(state.nextParcelDiscount || 0));
        if (!(discount > 0)) return 0;
        state.nextParcelDiscount = 0;
        this._emitRewardStateChanged();
        SaveManager.queueAutosave("reward_parcel_coupon_used");
        return discount;
    }

    hasRecruitVoucher() {
        return !!this._getRewardEconomyState().nextFreeRecruit;
    }

    grantRecruitVoucher() {
        const state = this._getRewardEconomyState();
        state.nextFreeRecruit = true;
        this._emitRewardStateChanged();
        SaveManager.queueAutosave("reward_recruit_voucher");
        return true;
    }

    consumeRecruitVoucher() {
        const state = this._getRewardEconomyState();
        if (!state.nextFreeRecruit) return false;
        state.nextFreeRecruit = false;
        this._emitRewardStateChanged();
        SaveManager.queueAutosave("reward_recruit_voucher_used");
        return true;
    }

    getRunMarketPriceInflation() {
        const stats = this._runStats || (this._runStats = this._createRunStats());
        if (!stats.marketPriceInflation || typeof stats.marketPriceInflation !== "object") {
            stats.marketPriceInflation = {};
        }
        return stats.marketPriceInflation;
    }

    getRunMarketPriceTable(basePrices = {}) {
        return buildMarketPriceTable(this, basePrices, this.getRunMarketPriceInflation());
    }

    applyRunMarketPriceInflation(cardId, inflationStep = 0.25) {
        const normalizedId = String(cardId || "").trim();
        if (!normalizedId) return 0;
        const basePrice = normalizedId === "relief_package"
            ? RELIEF_PACKAGE_PRICE
            : Number(getMarketCardDefinition(normalizedId)?.price || 0);
        if (!(basePrice > 0)) return 0;

        const inflation = this.getRunMarketPriceInflation();
        const currentFactor = Math.max(1, Number(inflation[normalizedId] || 1));
        inflation[normalizedId] = currentFactor * (1 + Math.max(0, Number(inflationStep || 0)));
        SaveManager.queueAutosave("market_price_inflation");
        return this.getRunMarketPriceTable({ [normalizedId]: basePrice })[normalizedId] || 0;
    }

    registerRunEnemyDefeat(troop, opts = {}) {
        if (opts?.silentStageCleanup) return;
        if (!troop?.isRaider && !troop?.isFortGrunt) return;

        const stats = this._runStats || (this._runStats = this._createRunStats());
        const key = Number.isFinite(troop?.id) ? troop.id : `${troop?.type?.name || "enemy"}:${stats.enemiesDefeated}`;
        if (stats.defeatedEnemyIds.has(key)) return;
        stats.defeatedEnemyIds.add(key);
        stats.enemiesDefeated += 1;
        if (troop?.isRaider) {
            this.achievementSystem?.addStat?.("raidersKilled", 1);
        }
        const sourceX = Number.isFinite(opts?.sourceX) ? opts.sourceX : Number(troop?.x);
        const sourceY = Number.isFinite(opts?.sourceY) ? opts.sourceY : Number(troop?.y);
        this.addTownXp(
            troop?.isFortGrunt ? TOWN_XP_SOURCE_VALUES.fortGruntKill : TOWN_XP_SOURCE_VALUES.raiderKill,
            troop?.isFortGrunt ? "Fort Grunt Defeated" : "Raider Defeated",
            {
                sourceX,
                sourceY,
                sourceKind: "player_death",
            }
        );
    }

    _isTroopUnlockReward(reward) {
        return RUN_TROOP_UNLOCK_KEYS.has(String(reward?.unlockKey || ""));
    }

    _registerRunTroopUnlock(reward) {
        if (!this._isTroopUnlockReward(reward)) return;
        const stats = this._runStats || (this._runStats = this._createRunStats());
        const key = String(reward?.unlockKey || reward?.displayLabel || reward?.title || "");
        if (!key || stats.troopUnlockKeys.has(key)) return;
        stats.troopUnlockKeys.add(key);
        stats.troopUnlockLabels.push(
            String(reward?.displayLabel || reward?.title || key)
                .replace(/\s+Unlocked$/i, "")
                .trim()
        );
    }

    _getMainIslandCenterGrid() {
        const bounds = this._getMainIslandBounds();
        return {
            x: Math.floor((bounds.minx + bounds.maxx) * 0.5),
            y: Math.floor((bounds.miny + bounds.maxy) * 0.5),
        };
    }

    _getPlayerTeam() {
        return Teams.getTeam?.("1") ?? Teams.teamLists?.["1"] ?? null;
    }

    getReliefPackageCount(teamNumber = 1) {
        const team = Teams.getTeam?.(teamNumber) ?? Teams.teamLists?.[`${teamNumber}`] ?? null;
        return Math.max(0, Number(team?.reliefPackageCount || 0));
    }

    hasReliefPackage(teamNumber = 1) {
        return this.getReliefPackageCount(teamNumber) > 0;
    }

    setReliefPackageCount(nextCount, teamNumber = 1) {
        const team = Teams.getTeam?.(teamNumber) ?? Teams.teamLists?.[`${teamNumber}`] ?? null;
        if (!team) return 0;

        const previous = Math.max(0, Number(team.reliefPackageCount || 0));
        const next = Phaser.Math.Clamp(
            Math.max(0, Math.floor(Number(nextCount) || 0)),
            0,
            RELIEF_PACKAGE_MAX_COUNT
        );
        if (previous === next) return next;

        team.reliefPackageCount = next;
        this.events.emit("relief-package:changed", {
            teamNumber: Number(teamNumber) || 1,
            count: next,
            previous,
        });
        SaveManager.queueAutosave("relief_package");

        if ((this._getPlayerTeam()?.storageList?.length || 0) <= 0) {
            this._queueStorageCollapseEvaluation(this._pendingStorageCollapseSource);
        }

        return next;
    }

    grantReliefPackage(teamNumber = 1) {
        return this.setReliefPackageCount(RELIEF_PACKAGE_MAX_COUNT, teamNumber);
    }

    consumeReliefPackage(teamNumber = 1) {
        return this.setReliefPackageCount(
            Math.max(0, this.getReliefPackageCount(teamNumber) - 1),
            teamNumber
        );
    }

    _countActiveRoleTroops(team, roleKey) {
        if (!team?.playerList?.length) return 0;
        return team.playerList.reduce((count, troop) => {
            if (!troop?.active) return count;
            if (roleKey === "builder" && troop.isBuilder) return count + 1;
            if (roleKey === "forager" && troop.isForager) return count + 1;
            return count;
        }, 0);
    }

    _getStorageCollapseEconomySnapshot(teamNumber = 1) {
        const team = Teams.getTeam?.(teamNumber) ?? Teams.teamLists?.[`${teamNumber}`] ?? null;
        const troops = (team?.playerList || []).filter((troop) => troop?.active);
        const roleCounts = {
            builder: this._countActiveRoleTroops(team, "builder"),
            forager: this._countActiveRoleTroops(team, "forager"),
        };
        const missingRoles = RELIEF_PACKAGE_CRITICAL_ROLES.filter((roleKey) => (roleCounts[roleKey] || 0) <= 0);
        const requiredMoney = missingRoles.reduce(
            (sum, roleKey) => sum + Math.max(0, Number(RELIEF_PACKAGE_ECONOMY_ROLE_COSTS[roleKey] || 0)),
            0
        );

        const preserveCounts = {
            builder: roleCounts.builder > 0 ? 1 : 0,
            forager: roleCounts.forager > 0 ? 1 : 0,
        };
        let sellableTroopValue = 0;
        let sellableTroopCount = 0;

        for (const troop of troops) {
            if (troop.isBuilder && preserveCounts.builder > 0) {
                preserveCounts.builder -= 1;
                continue;
            }
            if (troop.isForager && preserveCounts.forager > 0) {
                preserveCounts.forager -= 1;
                continue;
            }
            sellableTroopValue += Math.max(0, Number(OrderRunner.getTroopSellValue?.(troop) || 0));
            sellableTroopCount += 1;
        }

        const currentMoney = Math.max(0, Number(this.money || 0));
        const totalLiquidity = currentMoney + sellableTroopValue;

        return {
            team,
            storageCount: Math.max(0, Number(team?.storageList?.length || 0)),
            reliefPackageCount: this.getReliefPackageCount(teamNumber),
            currentMoney,
            sellableTroopValue,
            sellableTroopCount,
            totalLiquidity,
            requiredMoney,
            roleCounts,
            missingRoles,
            canRecoverFinancially: totalLiquidity >= requiredMoney,
        };
    }

    _clearActiveRunPresentations() {
        this._activeRewardUI?.destroy?.();
        this._activeRewardUI = null;
        this._activeBossRewardUI?.destroy?.();
        this._activeBossRewardUI = null;
        this._activeTownXpRewardUI?.destroy?.();
        this._activeTownXpRewardUI = null;
        this.uiScene?._destroyReliefPackageRecoveryPresentation?.();
    }

    _queueStorageCollapseEvaluation(sourceStorage = null) {
        if (sourceStorage) {
            this._pendingStorageCollapseSource = sourceStorage;
        }
        if (this._storageCollapseCheckQueued || !this.time) return;
        this._storageCollapseCheckQueued = true;
        this.time.delayedCall(0, () => {
            this._storageCollapseCheckQueued = false;
            this._evaluateStorageCollapseState({ sourceStorage: this._pendingStorageCollapseSource });
        });
    }

    _shouldDeferStorageCollapseEvaluation() {
        if (this._townTowerLossInProgress || this._storageCollapseLossInProgress || this._restartToMainMenuInProgress) {
            return true;
        }
        if (this._reliefRecoveryInProgress) return true;
        if (this._activeRewardUI || this._activeBossRewardUI || this._activeTownXpRewardUI) return true;
        if (this.menu?.active || this.draftMenu?.active) return true;
        if (this.uiScene?.pauseMenu?.isOpen) return true;
        return false;
    }

    _queueReliefRecoveryForDawn(sourceStorage = null) {
        if (sourceStorage) {
            this._pendingStorageCollapseSource = sourceStorage;
        }
        if (this._reliefRecoveryQueuedForDawn) return false;
        this._reliefRecoveryQueuedForDawn = true;
        showAlert(
            this,
            "All storage was lost. The relief package will deploy at dawn.",
            "#b8f2ff",
            3200
        );
        return true;
    }

    _getReliefRecoveryFloorType(x, y) {
        const cell = GameMap.grid?.[y]?.[x];
        if (cell == null) return null;
        const floorVal = Array.isArray(cell)
            ? GameMap.grabDepth(cell, FLOORDEPTH)
            : cell;
        return TILE_MAP(floorVal);
    }

    _isReliefRecoveryRoadTile(x, y) {
        return this._getReliefRecoveryFloorType(x, y) === "road";
    }

    _hasReliefRecoveryAdjacencyObstacle(x, y) {
        if (!!GameMap._wallStructureInfoAt?.(x, y)) return true;
        if (Teams.getCropAt?.(x, y, 1)) return true;
        return this._getReliefRecoveryFloorType(x, y) === "crops";
    }

    _getReliefRecoveryPlacementMetrics(x, y, lenX, lenY, bounds) {
        const footprintCells = Math.max(1, lenX * lenY);
        let footprintRoadCount = 0;
        for (let gy = y; gy < y + lenY; gy += 1) {
            for (let gx = x; gx < x + lenX; gx += 1) {
                if (this._isReliefRecoveryRoadTile(gx, gy)) {
                    footprintRoadCount += 1;
                }
            }
        }

        let ringCells = 0;
        let ringRoadCount = 0;
        let ringInBounds = true;
        let directObstacleCount = 0;
        for (let gy = y - 1; gy <= y + lenY; gy += 1) {
            for (let gx = x - 1; gx <= x + lenX; gx += 1) {
                const insideFootprint =
                    gx >= x &&
                    gx < x + lenX &&
                    gy >= y &&
                    gy < y + lenY;
                if (insideFootprint) continue;

                ringCells += 1;
                const inBounds =
                    gx >= bounds.minx &&
                    gy >= bounds.miny &&
                    gx <= bounds.maxx &&
                    gy <= bounds.maxy;
                if (!inBounds) {
                    ringInBounds = false;
                    continue;
                }

                if (this._isReliefRecoveryRoadTile(gx, gy)) {
                    ringRoadCount += 1;
                }
                if (this._hasReliefRecoveryAdjacencyObstacle(gx, gy)) {
                    directObstacleCount += 1;
                }
            }
        }

        return {
            footprintRoadCount,
            footprintCells,
            allFootprintRoads: footprintRoadCount >= footprintCells,
            ringRoadCount,
            ringCells,
            ringInBounds,
            allRingRoads: ringInBounds && ringCells > 0 && ringRoadCount >= ringCells,
            directObstacleCount,
            totalRoadCount: footprintRoadCount + ringRoadCount,
        };
    }

    _compareReliefRecoveryPlacementCandidates(a, b) {
        const flagCompare = (left, right) => Number(right) - Number(left);
        const metricCompare = (left, right) => Number(right || 0) - Number(left || 0);

        let delta = flagCompare(a.metrics.allRingRoads, b.metrics.allRingRoads);
        if (delta !== 0) return delta;

        delta = flagCompare(a.metrics.allFootprintRoads, b.metrics.allFootprintRoads);
        if (delta !== 0) return delta;

        delta = flagCompare(a.metrics.directObstacleCount <= 0, b.metrics.directObstacleCount <= 0);
        if (delta !== 0) return delta;

        delta = metricCompare(a.metrics.totalRoadCount, b.metrics.totalRoadCount);
        if (delta !== 0) return delta;

        delta = Number(a.metrics.directObstacleCount || 0) - Number(b.metrics.directObstacleCount || 0);
        if (delta !== 0) return delta;

        delta = Number(a.distanceToCenterSq || 0) - Number(b.distanceToCenterSq || 0);
        if (delta !== 0) return delta;

        delta = Number(a.distanceToReferenceSq || 0) - Number(b.distanceToReferenceSq || 0);
        if (delta !== 0) return delta;

        if (a.y !== b.y) return a.y - b.y;
        return a.x - b.x;
    }

    _findReliefRecoveryStoragePlacement(referenceStorage = null) {
        const storageType = TILE_TYPES.storage;
        const lenX = Math.max(1, Number(storageType?.lenX || 1));
        const lenY = Math.max(1, Number(storageType?.lenY || 1));
        const bounds = this._getMainIslandBounds();
        const center = Teams.getTownCenterRoadTile?.(1) || Teams.getTownCenterTile?.(1) || this._getMainIslandCenterGrid();
        const anchorX = center.x - Math.floor(lenX / 2);
        const anchorY = center.y - Math.floor(lenY / 2);
        const strictOptions = {
            padding: 1,
            protectFarmSpots: true,
            paddingAllowWalls: true,
            paddingProtectFarmSpots: false,
            enforceMainIslandInterior: true,
        };
        const looseOptions = { enforceMainIslandInterior: true };

        const canUse = (x, y, options = strictOptions) => {
            if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
            if (x < bounds.minx || y < bounds.miny) return false;
            if ((x + lenX - 1) > bounds.maxx || (y + lenY - 1) > bounds.maxy) return false;
            return !GameMap.checkBlockPositionGen(x, y, lenX, lenY, options);
        };

        const makeCandidate = (x, y, options) => {
            if (!canUse(x, y, options)) return null;
            const candidateCenterX = x + ((lenX - 1) * 0.5);
            const candidateCenterY = y + ((lenY - 1) * 0.5);
            const metrics = this._getReliefRecoveryPlacementMetrics(x, y, lenX, lenY, bounds);
            return {
                x,
                y,
                metrics,
                distanceToCenterSq: ((candidateCenterX - center.x) ** 2) + ((candidateCenterY - center.y) ** 2),
                distanceToReferenceSq: (
                    Number.isFinite(referenceStorage?.x) && Number.isFinite(referenceStorage?.y)
                        ? ((candidateCenterX - (Number(referenceStorage.x) + ((lenX - 1) * 0.5))) ** 2)
                            + ((candidateCenterY - (Number(referenceStorage.y) + ((lenY - 1) * 0.5))) ** 2)
                        : Number.POSITIVE_INFINITY
                ),
            };
        };

        const strictCandidates = [];
        const looseCandidates = [];
        const seen = new Set();
        const pushCandidate = (x, y) => {
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            const key = `${x},${y}`;
            if (seen.has(key)) return;
            seen.add(key);

            const strictCandidate = makeCandidate(x, y, strictOptions);
            if (strictCandidate) strictCandidates.push(strictCandidate);

            const looseCandidate = makeCandidate(x, y, looseOptions);
            if (looseCandidate) looseCandidates.push(looseCandidate);
        };

        if (Number.isFinite(referenceStorage?.x) && Number.isFinite(referenceStorage?.y)) {
            pushCandidate(Number(referenceStorage.x), Number(referenceStorage.y));
        }

        const townRoads = Teams.getTownRoadTiles?.(1) || [];
        for (const road of townRoads) {
            for (let oy = 0; oy < lenY; oy += 1) {
                for (let ox = 0; ox < lenX; ox += 1) {
                    pushCandidate(road.x - ox, road.y - oy);
                }
            }
        }

        const maxRadius = Math.max(bounds.maxx - bounds.minx, bounds.maxy - bounds.miny);
        for (let radius = 0; radius <= maxRadius; radius += 1) {
            for (let dy = -radius; dy <= radius; dy += 1) {
                for (let dx = -radius; dx <= radius; dx += 1) {
                    if (radius > 0 && Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                    pushCandidate(anchorX + dx, anchorY + dy);
                }
            }
        }

        if (strictCandidates.length > 0) {
            strictCandidates.sort((a, b) => this._compareReliefRecoveryPlacementCandidates(a, b));
            return { x: strictCandidates[0].x, y: strictCandidates[0].y };
        }

        if (looseCandidates.length > 0) {
            looseCandidates.sort((a, b) => this._compareReliefRecoveryPlacementCandidates(a, b));
            return { x: looseCandidates[0].x, y: looseCandidates[0].y };
        }

        return null;
    }

    _spawnReliefRecoveryStorage(referenceStorage = null) {
        const placement = this._findReliefRecoveryStoragePlacement(referenceStorage);
        if (!placement) return null;
        const storage = new StorageBuilding(placement.x, placement.y, 1);
        buildingManager.blockBuildingFootprintInLiveNav(storage, {
            evacuateTeamNumber: 1,
            warningLabel: "relief recovery storage",
        });
        return storage;
    }

    _spawnRecoveryTroopIfMissing(roleKey) {
        const team = this._getPlayerTeam();
        if (!team) return null;
        if (roleKey === "builder" && this._countActiveRoleTroops(team, roleKey) > 0) return null;
        if (roleKey === "forager" && this._countActiveRoleTroops(team, roleKey) > 0) return null;

        const spawnTile = Teams.getTownSpawnTile?.(1) || Teams.getTownCenterTile?.(1) || this._getMainIslandCenterGrid();
        if (!spawnTile) return null;

        let troop = null;
        if (roleKey === "builder") {
            troop = new Builder(spawnTile.x, spawnTile.y, 1);
        } else if (roleKey === "forager") {
            troop = new Forager(spawnTile.x, spawnTile.y, 1);
        }

        if (troop) {
            House.assignPlayerToHouse?.(troop, 1);
        }
        return troop;
    }

    _applyReliefPackageRecovery(referenceStorage = null) {
        const storage = this._spawnReliefRecoveryStorage(referenceStorage);
        if (!storage) {
            console.error("[ReliefPackage] failed to find placement for recovery storage");
            this._reliefRecoveryQueuedForDawn = false;
            this._reliefRecoveryInProgress = false;
            this._movementLocked = false;
            if (!this._townTowerLossInProgress && !this._storageCollapseLossInProgress && !this._restartToMainMenuInProgress) {
                this.clock.paused = false;
                this.applySimulationSpeed(true);
            }
            showAlert(this, "Emergency package deployment failed. Trying again...", "#ffd7a5", 2600);
            this.time?.delayedCall?.(150, () => {
                this._queueStorageCollapseEvaluation(referenceStorage);
            });
            return false;
        }

        this._reliefRecoveryQueuedForDawn = false;
        this.consumeReliefPackage(1);
        storage.addItem(UI_ITEM_TYPES.seedCrop, Math.max(1, Number(UI_ITEM_TYPES.seedCrop?.stacks || 1)));
        storage.addItem(UI_ITEM_TYPES.food, 6);
        storage.addItem(UI_ITEM_TYPES.clean_water, 6);
        storage.addItem(UI_ITEM_TYPES.wood, 4);
        storage.addItem(UI_ITEM_TYPES.stone, 4);
        this.updatePermits(1);
        this.updateMoney(RELIEF_PACKAGE_MONEY_GRANT);

        for (const roleKey of RELIEF_PACKAGE_CRITICAL_ROLES) {
            this._spawnRecoveryTroopIfMissing(roleKey);
        }

        this._pendingStorageCollapseSource = null;
        this._storageCollapseWarned = false;
        this._reliefRecoveryInProgress = false;
        this._movementLocked = false;
        if (!this._townTowerLossInProgress && !this._storageCollapseLossInProgress && !this._restartToMainMenuInProgress) {
            this.clock.paused = false;
            this.applySimulationSpeed(true);
        }
        this.events.emit?.("housing:updated", 1);
        showAlert(this, "Emergency relief package deployed", "#a7f3d0", 2200);
        return true;
    }

    _showStorageCollapseWarning() {
        if (this._storageCollapseWarned) return;
        this._storageCollapseWarned = true;
        showAlert(
            this,
            `All storage was lost. Buy a relief package at the market for $${RELIEF_PACKAGE_PRICE} or rebuild before the town stalls.`,
            "#ffd7a5",
            3200
        );
    }

    _buildStorageCollapseLossSummary(analysis = this._getStorageCollapseEconomySnapshot()) {
        const missingRoles = analysis.missingRoles.length
            ? analysis.missingRoles.map((roleKey) => roleKey[0].toUpperCase() + roleKey.slice(1)).join(", ")
            : "None";
        const builderCount = Math.max(0, Number(analysis.roleCounts?.builder || 0));
        const foragerCount = Math.max(0, Number(analysis.roleCounts?.forager || 0));

        return {
            badgeLabel: "ECONOMIC COLLAPSE",
            title: "Town Storage Collapsed",
            subtitle: "The town has no storage left, no emergency relief package, and no way to finance the basic builder/forager economy.",
            primaryStats: [
                {
                    label: "Storages",
                    value: 0,
                    hint: "All storage buildings destroyed",
                    accentColor: 0xfca5a5,
                    panelColor: 0x35243a,
                },
                {
                    label: "Relief Packages",
                    value: 0,
                    hint: "Emergency stock depleted",
                    accentColor: 0xffd7a5,
                    panelColor: 0x2d3248,
                },
                {
                    label: "Cash On Hand",
                    value: `$${analysis.currentMoney}`,
                    hint: "Current liquid funds",
                    accentColor: 0x8fe7ff,
                    panelColor: 0x153449,
                },
                {
                    label: "Sell Value",
                    value: `$${analysis.sellableTroopValue}`,
                    hint: `${analysis.sellableTroopCount} other troop${analysis.sellableTroopCount === 1 ? "" : "s"} could be sold`,
                    accentColor: 0xa7f3d0,
                    panelColor: 0x173743,
                },
                {
                    label: "Recovery Cost",
                    value: `$${analysis.requiredMoney}`,
                    hint: missingRoles === "None" ? "No critical roles missing" : `Missing: ${missingRoles}`,
                    accentColor: 0xc4b5fd,
                    panelColor: 0x26284a,
                },
            ],
            troopUnlockLabels: [],
            secondaryStats: [
                { label: "Builders", value: builderCount },
                { label: "Foragers", value: foragerCount },
                { label: "Total Liquidity", value: `$${analysis.totalLiquidity}` },
            ],
            restartLabel: "Restart Run",
        };
    }

    _triggerStorageCollapseGameOver(analysis = this._getStorageCollapseEconomySnapshot()) {
        if (this._storageCollapseLossInProgress || this._townTowerLossInProgress) return false;

        this._storageCollapseLossInProgress = true;
        this._movementLocked = true;
        this.stageCompleteLock = true;
        SaveManager.clearRunSave();
        this._clearActiveRunPresentations();

        AudioManager.playWorldSound?.('sfx_end_stage_explosions');
        this.cameras.main.shake(220, 0.004);
        if (this.clock) this.clock.paused = true;
        this.applySimulationSpeed(true);
        this._showGameOverOverlay(this._buildStorageCollapseLossSummary(analysis));
        return true;
    }

    _evaluateStorageCollapseState({ sourceStorage = null } = {}) {
        const team = this._getPlayerTeam();
        if (!team) return false;
        if (this._townTowerLossInProgress || this._storageCollapseLossInProgress || this._restartToMainMenuInProgress) {
            return false;
        }
        if (Math.max(0, Number(team.townTowerList?.length || 0)) <= 0) {
            return false;
        }

        const storageCount = Math.max(0, Number(team.storageList?.length || 0));
        if (storageCount > 0) {
            this._reliefRecoveryQueuedForDawn = false;
            this._storageCollapseWarned = false;
            this._pendingStorageCollapseSource = null;
            return false;
        }

        if (this.hasReliefPackage(1) && this.clock?.isNight?.()) {
            this._queueReliefRecoveryForDawn(sourceStorage);
            return true;
        }

        if (this._shouldDeferStorageCollapseEvaluation()) {
            this._queueStorageCollapseEvaluation(sourceStorage);
            return false;
        }

        if (this.hasReliefPackage(1)) {
            if (this._reliefRecoveryInProgress) return true;
            this._reliefRecoveryQueuedForDawn = false;
            this._reliefRecoveryInProgress = true;
            this._movementLocked = true;
            if (this.clock) this.clock.paused = true;
            this.applySimulationSpeed(true);

            const referenceStorage = sourceStorage || this._pendingStorageCollapseSource;
            if (this.uiScene?.showReliefPackageRecoveryPresentation) {
                this.uiScene.showReliefPackageRecoveryPresentation({
                    onConfirm: () => {
                        this._applyReliefPackageRecovery(referenceStorage);
                    },
                });
            } else {
                this._applyReliefPackageRecovery(referenceStorage);
            }
            return true;
        }

        this._reliefRecoveryQueuedForDawn = false;
        const analysis = this._getStorageCollapseEconomySnapshot(1);
        if (analysis.canRecoverFinancially) {
            this._showStorageCollapseWarning();
            return false;
        }

        return this._triggerStorageCollapseGameOver(analysis);
    }

    _grantTownXpResources(bundle = {}, opts = {}) {
        const moneyFxOpts = {
            sourceUiTarget: opts.sourceUiTarget ?? null,
            sourceUiX: opts.sourceUiX,
            sourceUiY: opts.sourceUiY,
            sourceWorldX: opts.sourceWorldX,
            sourceWorldY: opts.sourceWorldY,
        };
        if ((bundle.money || 0) > 0) {
            this.updateMoney(Math.max(0, Number(bundle.money || 0)), moneyFxOpts);
        }

        if ((bundle.permits || 0) > 0) {
            this.updatePermits(Math.max(0, Number(bundle.permits || 0)));
        }

        const overflowNotices = [];
        let totalCompensated = 0;

        const grantStorageItem = (itemKey, amount, label) => {
            const result = this._grantTownXpStorageItem(
                itemKey,
                Math.max(0, Number(amount || 0)),
                label
            );

            if (result.overflow > 0) {
                if (result.compensated > 0) {
                    totalCompensated += result.compensated;
                    overflowNotices.push(
                        `${result.overflow} ${result.label} didn't fit (+$${result.compensated})`
                    );
                } else {
                    overflowNotices.push(
                        `${result.overflow} ${result.label} didn't fit`
                    );
                }
            }

            return result;
        };

        if ((bundle.wood || 0) > 0) {
            grantStorageItem("wood", bundle.wood, "wood");
        }

        if ((bundle.stone || 0) > 0) {
            grantStorageItem("stone", bundle.stone, "stone");
        }

        if ((bundle.food || 0) > 0) {
            grantStorageItem("food", bundle.food, "food");
        }

        if ((bundle.cleanWater || 0) > 0) {
            const result = grantStorageItem("clean_water", bundle.cleanWater, "water");
            this._applyStoredTownXpWaterToActiveBatch(result?.stored ?? 0);
        }

        if ((bundle.seeds || 0) > 0) {
            grantStorageItem("seedCrop", bundle.seeds, "seeds");
        }

        if ((bundle.berries || 0) > 0) {
            grantStorageItem("seedBerry", bundle.berries, "berry seeds");
        }

        if (opts.showAlert) {
            const rewardParts = [];
            if ((bundle.money || 0) > 0) rewardParts.push(`+$${Math.max(0, Number(bundle.money || 0))}`);
            if ((bundle.permits || 0) > 0) rewardParts.push(`+${Math.max(0, Number(bundle.permits || 0))} permit${Number(bundle.permits) === 1 ? "" : "s"}`);
            if ((bundle.wood || 0) > 0) rewardParts.push(`+${Math.max(0, Number(bundle.wood || 0))} wood`);
            if ((bundle.stone || 0) > 0) rewardParts.push(`+${Math.max(0, Number(bundle.stone || 0))} stone`);
            if ((bundle.food || 0) > 0) rewardParts.push(`+${Math.max(0, Number(bundle.food || 0))} food`);
            if ((bundle.cleanWater || 0) > 0) rewardParts.push(`+${Math.max(0, Number(bundle.cleanWater || 0))} water`);
            if ((bundle.seeds || 0) > 0) rewardParts.push(`+${Math.max(0, Number(bundle.seeds || 0))} seeds`);
            if ((bundle.berries || 0) > 0) rewardParts.push(`+${Math.max(0, Number(bundle.berries || 0))} berry seeds`);
            if (rewardParts.length) {
                const label = opts.label ? `${opts.label}: ` : "Goal reward: ";
                showAlert(this, `${label}${rewardParts.join(", ")}`, opts.alertColor || "#fff4cf", 2200);
            }
        }

        return {
            overflowNotices,
            totalCompensated,
        };
    }

    _applyStoredTownXpWaterToActiveBatch(storedCount = 0) {
        const stored = Math.max(0, Math.floor(Number(storedCount || 0)));
        if (!(stored > 0)) return 0;

        const automation = Teams.ensureTownAutomation?.(TOWN_XP_TEAM_ID);
        const orderId = automation?.waterOrderId ?? null;
        if (!orderId) return 0;

        return OrderRunner.satisfyManagedWaterOrder?.(orderId, stored, TOWN_XP_TEAM_ID) ?? 0;
    }

    _getAvailableTownXpRecruitDefs() {
        return TOWN_XP_RECRUIT_DEFS.filter((entry) => !entry.unlockKey || hasStoreUnlock(entry.unlockKey));
    }

    _normalizeTownXpTroopKey(value = "") {
        const raw = String(value || "").trim().toLowerCase();
        if (!raw) return null;

        if (raw.startsWith("farmer")) return "farmer";
        if (raw.startsWith("fireman")) return "fireman";
        if (raw.startsWith("gunslinger")) return "gunslinger";
        if (raw.startsWith("forager")) return "forager";
        if (raw.startsWith("builder")) return "builder";
        if (raw.startsWith("blademaster")) return "blademaster";
        if (raw.startsWith("brawler")) return "brawler";

        return raw.replace(/\s+/g, "");
    }

    _isTownXpCardEligible(card) {
        if (!card) return false;
        if (card.type !== "player") return true;

        const troopKey = this._normalizeTownXpTroopKey(card.target || card.id || card.name);
        if (!troopKey) return true;

        const recruitDef = TOWN_XP_RECRUIT_DEFS.find((entry) => entry.key === troopKey);
        if (!recruitDef?.unlockKey) return true;

        return hasStoreUnlock(recruitDef.unlockKey);
    }

    _getAvailableTownXpCardPool() {
        const ownedCardIds = this._getOwnedTownXpCardIds(TOWN_XP_TEAM_ID);
        return getEligiblePowerupCards({ scene: this, teamNumber: TOWN_XP_TEAM_ID }).filter((card) => {
            const cardId = String(card?.id || "").trim();
            return !cardId || !ownedCardIds.has(cardId);
        });
    }

    _getOwnedTownXpCardIds(teamNumber = TOWN_XP_TEAM_ID) {
        const owned = new Set();

        for (const card of getCardHand(teamNumber) || []) {
            const cardId = String(card?.id || "").trim();
            if (cardId) owned.add(cardId);
        }

        const inventory = ensureCardInventory(teamNumber);
        for (const bucket of ["deck", "consumables"]) {
            for (const [cardId, count] of Object.entries(inventory?.[bucket] || {})) {
                if (Number(count || 0) > 0 && cardId) {
                    owned.add(String(cardId));
                }
            }
        }

        return owned;
    }

    _getEligibleTownXpSupplyKinds() {
        const kinds = ["money", "permits", "wood", "stone", "seeds", "food", "water", "berries"];
        const filtered = kinds.filter((kind) => {
            if (kind === "wood" && this._hasClaimedRunParcelType("FOREST")) return false;
            if (kind === "stone" && this._hasClaimedRunParcelType("ROCK")) return false;
            if ((kind === "seeds" || kind === "berries" || kind === "food") && this._hasClaimedRunParcelType("FARM")) return false;
            return true;
        });
        return filtered.length ? filtered : ["money", "permits", "water"];
    }

    _getAvailableTownXpMarketRewardCards() {
        return TOWN_XP_MARKET_REWARD_IDS
            .map((cardId) => getMarketCardDefinition(cardId))
            .filter(Boolean);
    }

    _getAvailableTownXpEconomyRewardKeys() {
        const keys = [];
        if (!this.getNextParcelDiscount?.()) keys.push("parcel_coupon");
        if (!this.hasRecruitVoucher?.()) keys.push("recruit_voucher");
        return keys;
    }

    _createTownXpMarketItemOption(level = 1) {
        const pool = this._getAvailableTownXpMarketRewardCards().slice();
        if (!pool.length) return null;
        Phaser.Utils.Array.Shuffle(pool);
        const card = pool[0];
        const outline = String(card.OUTLINE || "").replace("#", "");
        const accentColor = Number.parseInt(outline, 16);

        return {
            id: `market-item:${card.id}:${level}`,
            badgeLabel: "STORE ITEM",
            title: card.name,
            subtitle: card.text || "A free market item for your pouch.",
            hint: "Drops straight into your consumables pouch for later.",
            presentationType: "card",
            cardImageKey: card.image,
            cardText: card.text || "",
            accentColor: Number.isFinite(accentColor) ? accentColor : TOWN_XP_COLORS.cyan,
            panelColor: 0x17324c,
            grant: () => {
                addCardToInventory(card, TOWN_XP_TEAM_ID, 1);
                this.events.emit("cards:updated", buildCardAddedPayload(card, {
                    teamNumber: TOWN_XP_TEAM_ID,
                    source: "town_reward",
                }));
                showAlert(this, `Town reward: ${card.name}`, "#8fe7ff");
                SaveManager.queueAutosave("town_xp_market_item");
            },
        };
    }

    _createTownXpEconomyRewardOption(kind, level = 1) {
        const def = TOWN_XP_SPECIAL_REWARD_DEFS[kind];
        if (!def) return null;

        const applyReward = () => {
            if (kind === "parcel_coupon") {
                this.grantParcelCoupon?.(0.25);
            } else if (kind === "recruit_voucher") {
                this.grantRecruitVoucher?.();
            }
        };

        return {
            id: `economy:${kind}:${level}`,
            badgeLabel: kind === "parcel_coupon" ? "DEAL" : "CREW PASS",
            title: def.title,
            subtitle: def.subtitle,
            hint: def.hint,
            presentationType: "card",
            cardImageKey: def.imageKey,
            cardText: def.subtitle,
            accentColor: def.accentColor,
            panelColor: def.panelColor,
            grant: () => {
                applyReward();
                showAlert(this, `Town reward: ${def.title}`, def.alertColor);
                SaveManager.queueAutosave(`town_xp_${kind}`);
            },
        };
    }

    _getTownXpOverflowUnitValue(itemKey) {
        const itemDef = UI_ITEM_TYPES?.[itemKey];
        const value = Number(itemDef?.moneyValue ?? 0);
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    }

    _getProjectedRewardCapacityForItem(teamNumber, itemDef) {
        if (!itemDef) return 0;

        const storages = Teams.teamLists?.[teamNumber]?.storageList || [];
        let total = 0;

        for (const storage of storages) {
            const projected = StorageBuilding._getProjectedSlots?.(storage, teamNumber)
                ?? StorageBuilding._cloneSlots?.(storage?.storageItems ?? [])
                ?? [];

            total += StorageBuilding._availableCapacity?.(projected, itemDef) ?? 0;
        }

        return total;
    }

    _grantTownXpStorageItem(itemKey, amount, label = null) {
        const count = Math.max(0, Math.floor(Number(amount) || 0));
        const itemDef = UI_ITEM_TYPES?.[itemKey];
        const resolvedLabel = label || itemDef?.label || itemKey;

        if (!itemDef || count <= 0) {
            return {
                requested: count,
                stored: 0,
                overflow: count,
                compensated: 0,
                label: resolvedLabel,
            };
        }

        const teamNumber = TOWN_XP_TEAM_ID;
        const storages = Teams.teamLists?.[teamNumber]?.storageList || [];

        if (!storages.length) {
            const compensated = count * this._getTownXpOverflowUnitValue(itemKey);
            if (compensated > 0) this.updateMoney(compensated);

            return {
                requested: count,
                stored: 0,
                overflow: count,
                compensated,
                label: resolvedLabel,
            };
        }

        // Respect reservations / projected occupancy first.
        const projectedCapacity = this._getProjectedRewardCapacityForItem(teamNumber, itemDef);
        const targetToStore = Math.min(count, projectedCapacity);

        let remainingToStore = targetToStore;
        let stored = 0;

        for (const storage of storages) {
            if (remainingToStore <= 0) break;

            const before = storage.getItemCount?.(itemDef) ?? 0;
            storage.addItem?.(itemDef, remainingToStore);
            const after = storage.getItemCount?.(itemDef) ?? before;

            const accepted = Math.max(0, after - before);
            stored += accepted;
            remainingToStore -= accepted;
        }

        const overflow = Math.max(0, count - stored);
        const compensated = overflow * this._getTownXpOverflowUnitValue(itemKey);

        if (compensated > 0) {
            this.updateMoney(compensated);
        }

        return {
            requested: count,
            stored,
            overflow,
            compensated,
            label: resolvedLabel,
        };
    }

    _showTownXpOverflowCompensationAlert(result) {
        if (!result?.overflowNotices?.length) return;

        const text = `Storage full: ${result.overflowNotices.join(", ")}.${result.totalCompensated > 0 ? ` Refunded +$${result.totalCompensated}.` : ""}`;

        this.time?.delayedCall?.(350, () => {
            showAlert(this, text, "#ffd7a5", 2800);
        });
    }

    _getTownXpRecruitPortraitKey(recruitKey) {
        const stub = {
            health: 999,
            isFarmer: recruitKey === "farmer",
            isBuilder: recruitKey === "builder",
            isForager: recruitKey === "forager",
            isFireman: recruitKey === "fireman",
            isBrawler: recruitKey === "brawler",
            isGunslinger: recruitKey === "gunslinger",
            isBlademaster: recruitKey === "blademaster",
        };
        return getPlayerPortraitKey(stub);
    }

    _isMilitiaParcelUnlocked() {
        return hasStoreUnlock(STORE_UNLOCK_KEYS.militiaParcel);
    }

    _showMilitiaParcelUnlockPresentation() {
        if (this._activeMilitiaUnlockUI) return;
        if (this._townTowerLossInProgress || this._restartToMainMenuInProgress) return;

        this.clock.paused = true;
        this.applySimulationSpeed(true);
        this._movementLocked = true;

        const cam = this.cameras.main;
        const depth = (UIDEPTH ?? 10) + 1200;

        const container = this.add.container(0, 0).setDepth(depth);
        container.setScrollFactor(0);

        const shade = this.add.rectangle(0, 0, cam.width, cam.height, 0x000000, 0.78)
            .setOrigin(0)
            .setScrollFactor(0);

        const panel = this.add.rectangle(cam.centerX, cam.centerY, 520, 340, 0x10263a, 0.96)
            .setStrokeStyle(4, 0xb7ecff, 0.95)
            .setScrollFactor(0);

        const badge = this.add.text(cam.centerX, cam.centerY - 112, "TOWN LEVEL UNLOCK", {
            fontSize: "16px",
            color: "#dbeafe",
            fontFamily: "Bungee"
        }).setOrigin(0.5).setScrollFactor(0);

        const shield = this.add.text(cam.centerX, cam.centerY - 34, "🛡", {
            fontSize: "84px",
            color: "#ffffff",
            fontFamily: "Arial"
        }).setOrigin(0.5).setScrollFactor(0);

        const title = this.add.text(cam.centerX, cam.centerY + 30, "Militia Parcel Unlocked", {
            fontSize: "28px",
            color: "#ffffff",
            fontFamily: "Bungee",
            align: "center"
        }).setOrigin(0.5).setScrollFactor(0);

        const subtitle = this.add.text(
            cam.centerX,
            cam.centerY + 78,
            "You reached Town Level 3.\nMilitia parcels are now available in the parcel menu.",
            {
                fontSize: "15px",
                color: "#dbeafe",
                fontFamily: "Bungee",
                align: "center",
                lineSpacing: 8
            }
        ).setOrigin(0.5).setScrollFactor(0);

        const continueBg = this.add.rectangle(cam.centerX, cam.centerY + 138, 220, 48, 0x1d4ed8, 0.95)
            .setStrokeStyle(2, 0xffffff, 0.9)
            .setInteractive({ useHandCursor: true })
            .setScrollFactor(0);

        const continueTx = this.add.text(cam.centerX, cam.centerY + 138, "CONTINUE", {
            fontSize: "18px",
            color: "#ffffff",
            fontFamily: "Bungee"
        }).setOrigin(0.5).setScrollFactor(0);

        this.tweens.add({
            targets: shield,
            scale: { from: 0.9, to: 1.08 },
            alpha: { from: 0.82, to: 1 },
            duration: 650,
            yoyo: true,
            repeat: -1,
            ease: "Sine.inOut"
        });

        const close = () => {
            if (!this._activeMilitiaUnlockUI) return;
            this._activeMilitiaUnlockUI.destroy(true);
            this._activeMilitiaUnlockUI = null;
            this._movementLocked = false;

            if (!this._townTowerLossInProgress && !this._restartToMainMenuInProgress) {
                this.clock.paused = false;
                this.applySimulationSpeed(true);
            }

            this.parcelSpawnUI?.refreshMilitiaLockState?.();
        };

        continueBg.on("pointerover", () => continueBg.setFillStyle(0x2563eb, 0.98));
        continueBg.on("pointerout", () => continueBg.setFillStyle(0x1d4ed8, 0.95));
        continueBg.on("pointerdown", close);

        container.add([shade, panel, badge, shield, title, subtitle, continueBg, continueTx]);
        this._activeMilitiaUnlockUI = container;
    }

    _createTownXpSupplyOption(kind, level = 1) {
        const bonusScale = Math.max(0, Number(level || 1) - 1);
        const supplyDefs = {
            money: {
                badgeLabel: "TREASURY",
                title: "Sunny Treasury",
                reward: { money: 190 + (bonusScale * 36) },
                subtitle: (reward) => `+$${reward.money}`,
                hint: "A clean little bankroll boost for your next build spree.",
                chestContents: (reward) => [{ key: "monies", label: "Money", amount: reward.money }],
                accentColor: TOWN_XP_COLORS.cyan,
                panelColor: 0x153449,
                alertColor: "#8fe7ff",
                alertText: (reward) => `Town reward: +$${reward.money}`,
            },
            permits: {
                badgeLabel: "PERMITS",
                title: "Permit Parade",
                reward: { permits: TOWN_XP_SUPPLY_CAPS.permits },
                subtitle: (reward) => `+${reward.permits} permit${reward.permits === 1 ? "" : "s"}`,
                hint: "A juicy expansion nudge for grabbing the next parcel ring.",
                chestContents: (reward) => [{ emoji: "📜", label: "Permits", amount: reward.permits }],
                accentColor: TOWN_XP_COLORS.lilac,
                panelColor: 0x26284a,
                alertColor: "#d8c4ff",
                alertText: (reward) => `Town reward: +${reward.permits} permit${reward.permits === 1 ? "" : "s"}`,
            },
            wood: {
                badgeLabel: "SUPPLIES",
                title: "Builder Cache",
                reward: { wood: TOWN_XP_SUPPLY_CAPS.wood },
                subtitle: (reward) => `+${reward.wood} wood`,
                hint: "Quick lumber for walls, roads, and emergency patch jobs.",
                chestContents: (reward) => [{ key: "woodIcon", label: "Wood", amount: reward.wood }],
                accentColor: TOWN_XP_COLORS.peach,
                panelColor: 0x2c3347,
                alertColor: "#ffd7a5",
                alertText: (reward) => `Town reward: +${reward.wood} wood`,
            },
            stone: {
                badgeLabel: "SUPPLIES",
                title: "Stone Reserve",
                reward: { stone: TOWN_XP_SUPPLY_CAPS.stone },
                subtitle: (reward) => `+${reward.stone} stone`,
                hint: "Solid masonry stock for heavier defenses and upgrades.",
                chestContents: (reward) => [{ key: "stoneIcon", label: "Stone", amount: reward.stone }],
                accentColor: TOWN_XP_COLORS.cream,
                panelColor: 0x233042,
                alertColor: "#fff0c9",
                alertText: (reward) => `Town reward: +${reward.stone} stone`,
            },
            seeds: {
                badgeLabel: "SEEDS",
                title: "Seed Crate",
                reward: { seeds: TOWN_XP_SUPPLY_CAPS.seeds },
                subtitle: (reward) => `+${reward.seeds} seeds`,
                hint: "Fresh crop starters for a wider farm footprint.",
                chestContents: (reward) => [{ key: "seeds", label: "Seeds", amount: reward.seeds }],
                accentColor: TOWN_XP_COLORS.peach,
                panelColor: 0x2a3441,
                alertColor: "#ffd7a5",
                alertText: (reward) => `Town reward: +${reward.seeds} seeds`,
            },
            food: {
                badgeLabel: "SUPPER",
                title: "Camp Chow",
                reward: { food: TOWN_XP_SUPPLY_CAPS.food },
                subtitle: (reward) => `+${reward.food} food`,
                hint: "A clean pantry bump that keeps morale stable.",
                chestContents: (reward) => [{ key: "foodIcon", label: "Food", amount: reward.food }],
                accentColor: TOWN_XP_COLORS.mint,
                panelColor: 0x173743,
                alertColor: "#a7f3d0",
                alertText: (reward) => `Town reward: +${reward.food} food`,
            },
            water: {
                badgeLabel: "WATER",
                title: "Water Wagon",
                reward: { cleanWater: TOWN_XP_SUPPLY_CAPS.cleanWater },
                subtitle: (reward) => `+${reward.cleanWater} water`,
                hint: "A tidy clean-water refill before the next scramble.",
                chestContents: (reward) => [{ key: "waterIcon", label: "Water", amount: reward.cleanWater }],
                accentColor: TOWN_XP_COLORS.cyan,
                panelColor: 0x17324c,
                alertColor: "#8fe7ff",
                alertText: (reward) => `Town reward: +${reward.cleanWater} water`,
            },
            berries: {
                badgeLabel: "SEEDS",
                title: "Berry Pouch",
                reward: { berries: TOWN_XP_SUPPLY_CAPS.berries },
                subtitle: (reward) => `+${reward.berries} berry seeds`,
                hint: "A niche growable boost for longer food recovery.",
                chestContents: (reward) => [{ key: "berry", label: "Berry Seeds", amount: reward.berries }],
                accentColor: TOWN_XP_COLORS.mint,
                panelColor: 0x1b3a3f,
                alertColor: "#a7f3d0",
                alertText: (reward) => `Town reward: +${reward.berries} berry seeds`,
            },
        };

        const def = supplyDefs[kind] || supplyDefs.money;
        const reward = { ...def.reward };
        return {
            id: `${kind}:${level}`,
            badgeLabel: def.badgeLabel,
            title: def.title,
            subtitle: def.subtitle(reward),
            hint: def.hint,
            presentationType: "chest",
            chestContents: def.chestContents(reward),
            accentColor: def.accentColor,
            panelColor: def.panelColor,
            grant: () => {
                const result = this._grantTownXpResources(reward);
                showAlert(this, def.alertText(reward), def.alertColor);
                this._showTownXpOverflowCompensationAlert(result);
            },
        };
    }

    _createTownXpCardOption(level = 1) {
        const source = this._getAvailableTownXpCardPool().slice();
        Phaser.Utils.Array.Shuffle(source);

        const card = source[0];
        if (!card) return null;

        const outline = String(card.OUTLINE || "").replace("#", "");
        const accentColor = Number.parseInt(outline, 16);

        return {
            id: `card:${card.id || level}`,
            badgeLabel: "CARD",
            title: card.name || "Power Card",
            subtitle: card.text || "Add a fresh perk to the town hand.",
            hint: "A run perk that kicks in right away and sticks for this village.",
            presentationType: "card",
            cardImageKey: card.image,
            cardText: card.text || "",
            accentColor: Number.isFinite(accentColor) ? accentColor : TOWN_XP_COLORS.cyan,
            panelColor: 0x17324c,
            grant: () => {
                addCardToHand(card, TOWN_XP_TEAM_ID);
                this.events.emit("cards:updated", buildCardAddedPayload(card, {
                    teamNumber: TOWN_XP_TEAM_ID,
                    source: "town_reward",
                }));
                showAlert(this, `Town reward: ${card.name}`, "#8fe7ff");
            },
        };
    }

    _createTownXpRecruitOption(level = 1) {
        const recruitDefs = this._getAvailableTownXpRecruitDefs().slice();
        if (!recruitDefs.length || !Teams.canRecruitPlayer?.(TOWN_XP_TEAM_ID)) return null;
        Phaser.Utils.Array.Shuffle(recruitDefs);
        const recruit = recruitDefs[0];
        if (!recruit?.ctor) return null;

        return {
            id: `recruit:${recruit.key}:${level}`,
            badgeLabel: "CREW",
            title: recruit.title,
            subtitle: recruit.subtitle,
            hint: "Adds another cheerful pair of hands to the run right now.",
            presentationType: "recruit",
            portraitKey: this._getTownXpRecruitPortraitKey(recruit.key),
            accentColor: recruit.accentColor ?? TOWN_XP_COLORS.cream,
            panelColor: 0x213248,
            grant: () => {
                const spawnTile = Teams.getTownSpawnTile?.(TOWN_XP_TEAM_ID);
                if (!spawnTile) {
                    const fallbackMoney = 240 + (Math.max(0, level - 1) * 25);
                    this.updateMoney(fallbackMoney);
                    showAlert(this, `No town road: +$${fallbackMoney} instead`, "#ffd7a5");
                    return;
                }
                const troop = new recruit.ctor(spawnTile.x, spawnTile.y, 1);
                const assigned = House.assignPlayerToHouse(troop, TOWN_XP_TEAM_ID);
                if (!assigned) {
                    troop.destroySelf?.() ?? troop.destroy?.();
                    const fallbackMoney = 240 + (Math.max(0, level - 1) * 25);
                    this.updateMoney(fallbackMoney);
                    showAlert(this, `No free bed: +$${fallbackMoney} instead`, "#ffd7a5");
                    return;
                }
                showAlert(this, `Town reward: ${recruit.title}`, "#a7f3d0");
            },
        };
    }

    _buildTownXpRewardOptions(level = this._townXp?.level || 1) {
        const options = [];
        const addOption = (entry) => {
            if (!entry) return;
            if (options.some((candidate) => candidate.id === entry.id)) return;
            options.push(entry);
        };

        const supplyKinds = this._getEligibleTownXpSupplyKinds().slice();
        Phaser.Utils.Array.Shuffle(supplyKinds);

        addOption(this._createTownXpCardOption(level));

        const specialOptions = [];
        const economyRewardKeys = this._getAvailableTownXpEconomyRewardKeys().slice();
        Phaser.Utils.Array.Shuffle(economyRewardKeys);
        if (economyRewardKeys.length && Phaser.Math.Between(0, 99) < 60) {
            specialOptions.push(this._createTownXpEconomyRewardOption(economyRewardKeys[0], level));
        }
        if (Phaser.Math.Between(0, 99) < 38) {
            specialOptions.push(this._createTownXpMarketItemOption(level));
        }
        if (Teams.canRecruitPlayer?.(TOWN_XP_TEAM_ID)) {
            specialOptions.push(this._createTownXpRecruitOption(level));
        }
        Phaser.Utils.Array.Shuffle(specialOptions);
        while (options.length < 3 && specialOptions.length) {
            addOption(specialOptions.shift());
        }

        while (options.length < 3 && supplyKinds.length) {
            addOption(this._createTownXpSupplyOption(supplyKinds.shift(), level));
        }
        while (options.length < 3) {
            addOption(this._createTownXpSupplyOption("money", level + options.length));
        }

        Phaser.Utils.Array.Shuffle(options);
        return options.slice(0, 3);
    }

    addTownXp(amount, reason = "Town XP", opts = {}) {
        const normalized = Math.max(0, Math.floor(Number(amount) || 0));
        if (!(normalized > 0)) return 0;

        const state = this._townXp || (this._townXp = this._createTownXpState());
        const previousLevel = Math.max(1, Number(state.level || 1));
        state.totalEarned = Math.max(0, Number(state.totalEarned || 0)) + normalized;
        state.xpIntoLevel = Math.max(0, Number(state.xpIntoLevel || 0)) + normalized;
        state.gainSerial = Math.max(0, Number(state.gainSerial || 0)) + 1;
        state.lastGainAmount = normalized;
        state.lastGainLabel = String(reason || "Town XP");
        const sourceX = Number(opts?.sourceX);
        const sourceY = Number(opts?.sourceY);
        state.lastGainSource = Number.isFinite(sourceX) && Number.isFinite(sourceY)
            ? { x: sourceX, y: sourceY, kind: String(opts?.sourceKind || "") }
            : null;

        let levelsGained = 0;
        while (state.xpIntoLevel >= Math.max(1, Number(state.xpForNextLevel || this._getTownXpRequirement(state.level || 1)))) {
            state.xpIntoLevel -= Math.max(1, Number(state.xpForNextLevel || this._getTownXpRequirement(state.level || 1)));
            state.level = Math.max(1, Number(state.level || 1)) + 1;
            state.xpForNextLevel = this._getTownXpRequirement(state.level);
            state.pendingLevelRewards = Math.max(0, Number(state.pendingLevelRewards || 0)) + 1;
            levelsGained += 1;
        }

        const newLevel = Math.max(1, Number(state.level || 1));
        const tutorialActive = this._isTutorialActive();
        if (levelsGained > 0) {
            if (!tutorialActive) {
                this._queueMilitiaUnlockRewardFromTownXp(previousLevel, newLevel);
            }
        }

        const now = Number(this.time?.now || 0);
        if (levelsGained > 0) {
            state.rewardReadyAt = Math.max(now + 320, Number(state.rewardReadyAt || 0));
            if (!tutorialActive) {
                showAlert(
                    this,
                    `Town Level ${state.level}! A new village reward is ready.`,
                    "#ffe8b8",
                    1700
                );
                this.time?.delayedCall?.(360, () => {
                    this._tryPresentPendingTownXpReward();
                });
            }
        } else if (opts.alert) {
            showAlert(this, `${reason}: +${normalized} XP`, "#8fe7ff", 1100);
        }

        this._queueTownXpChanged();
        SaveManager.queueAutosave("town_xp");
        return levelsGained;
    }

    _canPresentPendingTownXpReward() {
        const state = this._townXp || (this._townXp = this._createTownXpState());
        if (!(state.pendingLevelRewards > 0)) return false;
        if (state.pendingMilitiaUnlockReward && !state.militiaUnlockRewardShown) return false;
        if (this._isTutorialActive()) return false;
        if (this._isTownXpRewardPresentationBlocked()) return false;
        if (this._townTowerLossInProgress || this._restartToMainMenuInProgress) return false;
        if (this._activeRewardUI || this._activeBossRewardUI || this._activeTownXpRewardUI) return false;
        if (this._hordeRewardInProgress || this.stageCompleteLock) return false;
        if (!this.uiScene?.showTownXpRewardPresentation) return false;
        if (this.menu?.active || this.draftMenu?.active) return false;
        if (this.clock?.paused) return false;

        const phaseKey = this.clock?.getPhaseKey?.() || this._currentPhaseKey;
        if (phaseKey === "night") return false;
        if (Number(this.time?.now || 0) < Math.max(0, Number(state.rewardReadyAt || 0))) return false;
        return true;
    }

    _tryPresentPendingTownXpReward() {
        const state = this._townXp || (this._townXp = this._createTownXpState());
        if (state.pendingMilitiaUnlockReward && !state.militiaUnlockRewardShown) {
            return this._tryPresentPendingMilitiaUnlockReward();
        }

        if (!this._canPresentPendingTownXpReward()) return false;

        const snapshot = this.getTownXpSnapshot();
        const options = this._buildTownXpRewardOptions(snapshot.level);

        this.clock.paused = true;
        this.applySimulationSpeed(true);
        this._movementLocked = true;

        this._activeTownXpRewardUI?.destroy?.();
        this._activeTownXpRewardUI = this.uiScene.showTownXpRewardPresentation({
            level: snapshot.level,
            xpSnapshot: snapshot,
            options,
            onChoose: (selection) => {
                try {
                    selection?.grant?.();
                } finally {
                    state.pendingLevelRewards = Math.max(0, Number(state.pendingLevelRewards || 0) - 1);
                    state.rewardReadyAt = Number(this.time?.now || 0) + 140;
                    this._activeTownXpRewardUI = null;
                    this._movementLocked = false;
                    if (!this._townTowerLossInProgress && !this._restartToMainMenuInProgress) {
                        this.clock.paused = false;
                        this.applySimulationSpeed(true);
                    }
                    this._queueTownXpChanged({ immediate: true });
                    SaveManager.queueAutosave("town_xp_reward_claimed");
                }
            },
            onCancel: () => {
                this._activeTownXpRewardUI = null;
                this._movementLocked = false;
                if (!this._townTowerLossInProgress && !this._restartToMainMenuInProgress) {
                    this.clock.paused = false;
                    this.applySimulationSpeed(true);
                }
            },
        });

        return true;
    }

    _tryPresentPostTutorialTownXpRewards() {
        if (this._isTutorialActive()) return false;
        if (this._townTowerLossInProgress || this._restartToMainMenuInProgress) return false;

        const state = this._townXp || (this._townXp = this._createTownXpState());
        const level = Math.max(1, Number(state.level || 1));
        if (level >= 3 && !state.militiaUnlockRewardShown) {
            this._queueMilitiaUnlockRewardFromTownXp(2, level);
        }

        state.rewardReadyAt = Math.min(
            Math.max(0, Number(state.rewardReadyAt || 0)),
            Number(this.time?.now || 0) + 220
        );
        return this._tryPresentPendingTownXpReward();
    }

    _getRunSummaryData() {
        const stats = this._runStats || this._createRunStats();
        const team = Teams.teamLists?.["1"] || {};
        const livingPlayers = (team.playerList || []).filter((player) => player?.active).length;
        const towerStats = this._townTowerStats || { built: 0, destroyed: 0 };
        const troopUnlockLabels = Array.isArray(stats.troopUnlockLabels) ? stats.troopUnlockLabels.slice() : [];
        const townXp = this.getTownXpSnapshot();

        return {
            badgeLabel: "RUN RECAP",
            title: "Town Tumbled!",
            subtitle: "The last Town Tower finally gave way, but the crew still put together a pretty cheerful little legend.",
            primaryStats: [
                {
                    label: "Nights Survived",
                    value: stats.nightsSurvived,
                    hint: "Completed hordes only",
                    accentColor: 0x8fe7ff,
                    panelColor: 0x153449,
                },
                {
                    label: "Towers Built",
                    value: towerStats.built,
                    hint: `Lost ${towerStats.destroyed}`,
                    accentColor: 0xffd7a5,
                    panelColor: 0x2d3248,
                },
                {
                    label: "Parcels Claimed",
                    value: stats.parcelsClaimed,
                    hint: "Expansion contracts started",
                    accentColor: 0xa7f3d0,
                    panelColor: 0x173743,
                },
                {
                    label: "Enemies Defeated",
                    value: stats.enemiesDefeated,
                    hint: "Actual hostile kills",
                    accentColor: 0xfca5a5,
                    panelColor: 0x35243a,
                },
                {
                    label: "Troops Unlocked",
                    value: troopUnlockLabels.length,
                    hint: troopUnlockLabels.length ? troopUnlockLabels.join(" • ") : "No run-earned unit unlocks",
                    accentColor: 0xc4b5fd,
                    panelColor: 0x26284a,
                },
            ],
            troopUnlockLabels,
            secondaryStats: [
                { label: "Town Level", value: townXp.level },
                { label: "Day Reached", value: Math.max(1, Number(this.clock?.day || 1)) },
                { label: "Money Earned", value: `$${Math.max(0, Math.floor(stats.moneyEarnedTotal || 0))}` },
                { label: "Money Banked", value: `$${Math.max(0, Math.floor(this.money || 0))}` },
                { label: "Crew Alive", value: livingPlayers },
                { label: "Horde Reached", value: Math.max(1, this.getCurrentHordeIndex()) },
            ],
            restartLabel: "Restart Run",
        };
    }

    setSimulationSpeed(multiplier) {
        const allowed = new Set([1, 1.5, 2]);
        const next = Number(multiplier);
        const normalized = allowed.has(next) ? next : 1;
        if (this.selectedSimSpeed === normalized) {
            return this.applySimulationSpeed();
        }

        this.selectedSimSpeed = normalized;
        this.events.emit("sim-speed:changed", normalized);
        return this.applySimulationSpeed();
    }

    getSimulationSpeed() {
        return this.selectedSimSpeed || 1;
    }

    getSimulationNow() {
        return Number(this.simNowMs || 0);
    }

    getAppliedSimulationSpeed() {
        return Number(this._appliedSimulationSpeed ?? this.getEffectiveSimulationSpeed());
    }

    isSimulationPaused() {
        return !!(this.clock?.paused || this._simulationPauseReasons?.size);
    }

    getEffectiveSimulationSpeed() {
        if (!this._simulationSpeedReady) return 0;
        return this.isSimulationPaused() ? 0 : this.getSimulationSpeed();
    }

    setSimulationPause(reason, paused = true) {
        const key = String(reason || "external");
        if (paused) this._simulationPauseReasons.add(key);
        else this._simulationPauseReasons.delete(key);
        return this.applySimulationSpeed();
    }

    setSimulationSpeedReady(ready = true) {
        this._simulationSpeedReady = !!ready;
        return this.applySimulationSpeed(true);
    }

    applySimulationSpeed(force = false) {
        const selected = this.getSimulationSpeed();
        const effective = this.getEffectiveSimulationSpeed();
        const engineSpeed = this._simulationSpeedReady ? effective : 1;

        AudioManager.setWorldAudioPaused?.(effective <= 0);

        if (!force && this._appliedSimulationSpeed === effective && this._appliedEngineSimSpeed === engineSpeed) {
            return effective;
        }

        if (this.time) {
            this.time.timeScale = engineSpeed;
        }
        if (this.tweens) {
            this.tweens.timeScale = engineSpeed;
        }

        const physicsWorld = this.physics?.world;
        if (physicsWorld) {
            if (engineSpeed > 0) {
                physicsWorld.resume?.();
                physicsWorld.timeScale = 1 / engineSpeed;
            } else {
                physicsWorld.timeScale = 1;
                physicsWorld.pause?.();
            }
        }

        if (this.anims) {
            this.anims.globalTimeScale = engineSpeed > 0 ? engineSpeed : 0;
        }

        this._appliedEngineSimSpeed = engineSpeed;
        this._appliedSimulationSpeed = effective;
        this.events.emit("sim-speed:applied", { selected, effective, engineSpeed });
        return effective;
    }

    _refreshOverviewFromGrid() {
        this.zoomMixer?.buildOverviewTextureFromGrid?.(GameMap.grid, SQUARESIZE, (cell) => colorFor(cell));
        GameMap._uiIgnoreWorldLayer?.();
    }

    getCurrentHordeIndex() {
        return Math.max(1, Number(StageState.stageIndex || 1));
    }

    _slotLabel(slotId) {
        if (slotId === "N") return "North";
        if (slotId === "E") return "East";
        if (slotId === "S") return "South";
        if (slotId === "W") return "West";
        return String(slotId || "");
    }

    _invalidateNightHordePlan() {
        this._cachedNightHordePlan = null;
    }

    _getNightHordeEnemyLabel(modifier = null) {
        if (modifier?.key === "heavy_grunts") return "Heavy Raiders";
        return String(modifier?.enemyTypeLabel || "Raiders");
    }

    _getNightHordeEnemyMods(modifier = null) {
        return {
            key: modifier?.key ?? null,
            label: modifier?.label ?? null,
            speedMultiplier: Math.max(0.5, Number(modifier?.speedMultiplier ?? 1) || 1),
            healthMultiplier: Math.max(0.5, Number(modifier?.healthMultiplier ?? 1) || 1),
            damageMultiplier: Math.max(0.5, Number(modifier?.damageMultiplier ?? 1) || 1),
            visual: modifier?.visual ? { ...modifier.visual } : null,
        };
    }

    _getNightHordeHeadline(totalEnemies = 0, phase = "preview") {
        if (phase === "active") return "Raiders Incoming";
        if (totalEnemies >= 28) return "Heavy Horde Tonight";
        return "Coastal Assault Tonight";
    }

    _countActiveNightHordeTroops(hordeId = this._activeNightHorde?.id ?? null) {
        if (!hordeId) return 0;
        return (Player.troops || []).filter((troop) => (
            troop?.active
            && troop?.nightHordeId === hordeId
            && (troop?.isRaider || troop?.isFortGrunt)
        )).length;
    }

    _clearNightHordeState(active = this._activeNightHorde, opts = {}) {
        if (!active) return 0;

        for (const event of active.spawnEvents || []) {
            event?.remove?.(false);
        }
        active.spawnEvents = [];

        if (!opts.destroyTroops) return 0;

        let removed = 0;
        const troops = (Player.troops || []).slice();
        for (const troop of troops) {
            if (!troop?.active || troop?.nightHordeId !== active.id) continue;
            if (!troop?.isRaider && !troop?.isFortGrunt) continue;
            try {
                troop.destroySelf?.({ silentStageCleanup: true });
                removed++;
            } catch {}
        }

        return removed;
    }

    _isShockerBossDay(day = this.clock?.day ?? 1) {
        const normalizedDay = Math.max(1, Number(day || 1));
        if (normalizedDay < SHOCKER_BOSS_DAY) return false;
        if (normalizedDay % SHOCKER_BOSS_WEEK_INTERVAL !== 0) return false;
        if (Number(this._shockerBossState?.defeatedOnDay || 0) === normalizedDay) return false;
        return true;
    }

    _getShockerBossAppearanceIndex(day = this.clock?.day ?? SHOCKER_BOSS_DAY) {
        const normalizedDay = Math.max(SHOCKER_BOSS_DAY, Number(day || SHOCKER_BOSS_DAY));
        return Math.max(0, Math.floor((normalizedDay - SHOCKER_BOSS_DAY) / SHOCKER_BOSS_WEEK_INTERVAL));
    }

    _getShockerBossHpMultiplier(day = this.clock?.day ?? SHOCKER_BOSS_DAY) {
        const appearanceIndex = this._getShockerBossAppearanceIndex(day);
        return 1 + Math.min(
            SHOCKER_BOSS_HP_SCALE_CAP,
            appearanceIndex * SHOCKER_BOSS_HP_SCALE_PER_APPEARANCE
        );
    }

    _isShockerBossActive() {
        return !!(this._activeShockerBoss?.active);
    }

    _findShockerBossSpawnTile() {
        const nav = GameMap.enemyNavGrid;
        if (!Array.isArray(nav) || !nav.length || !Array.isArray(nav[0])) {
            return { x: 1, y: 1 };
        }

        const h = nav.length;
        const w = nav[0].length;
        const center = this._getMainIslandCenterWorld?.() ?? {
            x: (w * SQUARESIZE) / 2,
            y: (h * SQUARESIZE) / 2,
        };
        const candidates = [];
        const pushIfWalkable = (x, y) => {
            if (x < 0 || y < 0 || x >= w || y >= h) return;
            if (nav[y]?.[x] !== 1) return;
            const worldX = x * SQUARESIZE + SQUARESIZE / 2;
            const worldY = y * SQUARESIZE + SQUARESIZE / 2;
            if (GameMap.enemyRegionSystem?.canReachWorldToWorld && !GameMap.enemyRegionSystem.canReachWorldToWorld(worldX, worldY, center.x, center.y)) {
                return;
            }
            const d2 = (worldX - center.x) ** 2 + (worldY - center.y) ** 2;
            candidates.push({ x, y, d2 });
        };

        for (let x = 0; x < w; x++) {
            pushIfWalkable(x, 0);
            pushIfWalkable(x, h - 1);
        }
        for (let y = 1; y < h - 1; y++) {
            pushIfWalkable(0, y);
            pushIfWalkable(w - 1, y);
        }

        if (!candidates.length) {
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    pushIfWalkable(x, y);
                }
            }
        }

        candidates.sort((a, b) => b.d2 - a.d2);
        return candidates[0] || { x: 1, y: 1 };
    }

    _syncShockerBossUi() {
        this.uiScene?.setBossStormActive?.(!!this._shockerBossState?.nightLocked);
        this.uiScene?.setBossTarget?.(this._activeShockerBoss?.active ? this._activeShockerBoss : null);
    }

    shouldHoldNightAtPeakDarkness() {
        return !!this._shockerBossState?.nightLocked;
    }

    startShockerBossNight() {
        const bossDay = Math.max(1, Number(this.clock?.day || SHOCKER_BOSS_DAY));
        if (this._isShockerBossActive() || !this._isShockerBossDay(bossDay)) return;

        const targetPoint = this._getMainIslandCenterWorld?.() ?? {
            x: (WORLD_DIMENSIONX * SQUARESIZE) / 2,
            y: (WORLD_DIMENSIONY * SQUARESIZE) / 2,
        };
        const appearanceIndex = this._getShockerBossAppearanceIndex(bossDay);
        const hpMultiplier = this._getShockerBossHpMultiplier(bossDay);
        const boss = spawnSeaRaider(this, {
            EnemyClass: Shocker,
            teamNumber: 0,
            targetPoint,
            enemyTypeLabel: SHOCKER_BOSS_NAME,
            modifierLabel: appearanceIndex > 0 ? `Boss Night +${Math.round((hpMultiplier - 1) * 100)}% HP` : "Boss Night",
            nightHordeId: "shocker_boss_night",
            hordeIndex: this.getCurrentHordeIndex(),
            swimSpeed: 210,
        });
        if (!boss) return;

        boss.nightHordeId = "shocker_boss_night";
        boss.hordeIndex = this.getCurrentHordeIndex();
        boss._bossSpawnDay = bossDay;
        boss._shockerAppearanceIndex = appearanceIndex;
        if (hpMultiplier > 1 && Number.isFinite(boss.maxHealth)) {
            boss.maxHealth = Math.max(1, Math.round(boss.maxHealth * hpMultiplier));
            boss.health = boss.maxHealth;
        }

        this._activeShockerBoss = boss;
        this._shockerBossState = {
            defeated: false,
            nightLocked: true,
            bossId: boss.id ?? null,
            startedOnDay: boss._bossSpawnDay,
            defeatedOnDay: null,
            appearanceIndex,
        };
        SaveManager.queueAutosave("shocker_boss_night");
        this._syncShockerBossUi();
        this.uiScene?.flashStormLightning?.(220, 0.42);
        this.uiScene?.showBossIncomingPresentation?.({
            title: SHOCKER_BOSS_NAME.toUpperCase(),
            subtitle: "BOSS NIGHT",
            caption: appearanceIndex > 0
                ? `Night will not end until it is destroyed. HP +${Math.round((hpMultiplier - 1) * 100)}%.`
                : "Night will not end until it is destroyed",
            portraitKey: getPlayerPortraitKey(boss),
        });
    }

    _grantDemoCompletionStoreUnlocks() {
        const unlockedLabels = [];
        for (const key of DEMO_COMPLETION_STORE_UNLOCK_KEYS) {
            const changed = unlockStoreItem(key, null);
            if (changed) {
                unlockedLabels.push(DEMO_COMPLETION_STORE_UNLOCK_LABELS[key] || key);
            }
        }
        return unlockedLabels;
    }

    _buildDemoCompletionSummary() {
        const summary = this._getRunSummaryData();
        const unlockLabels = Object.values(DEMO_COMPLETION_STORE_UNLOCK_LABELS);

        return {
            ...summary,
            badgeLabel: "DEMO COMPLETE",
            title: "The Shocker Has Fallen",
            subtitle: "Thanks for playing the demo. Your town broke the storm, and the remaining demo store roster is now permanently unlocked.",
            troopUnlockLabels: unlockLabels,
            unlockHeaderLabel: "Permanent Store Unlocks",
            emptyUnlockHeaderLabel: "Permanent Store Unlocks: Already Claimed",
            secondaryStats: [
                ...(summary.secondaryStats || []),
                { label: "Demo Result", value: "Complete" },
            ],
            restartLabel: "Main Menu",
            restartHint: "Return to the clouds",
        };
    }

    handleShockerBossDefeated(troop) {
        if (!troop) return;
        const defeatedDay = Math.max(1, Number(troop._bossSpawnDay || this.clock?.day || SHOCKER_BOSS_DAY));
        if (Number(this._shockerBossState?.defeatedOnDay || 0) === defeatedDay && !this._shockerBossState?.nightLocked) return;

        this._shockerBossState = this._shockerBossState || {};
        this._shockerBossState.defeated = true;
        this._shockerBossState.nightLocked = false;
        this._shockerBossState.defeatedOnDay = defeatedDay;
        this._activeShockerBoss = null;
        this._movementLocked = true;
        this.stageCompleteLock = true;
        StageState.endlessMode = false;
        this._syncShockerBossUi();

        this.achievementSystem?.addStat?.("shockersDefeated", 1);
        this._grantDemoCompletionStoreUnlocks();
        SaveManager.clearRunSave();
        this._clearActiveRunPresentations();

        AudioManager.stopBossRainAmbience?.();
        AudioManager.playBossThunder?.({ volume: 0.46, cooldownMs: 0 });
        this.uiScene?.flashStormLightning?.(260, 0.46);
        this.cameras?.main?.shake?.(260, 0.006);
        if (this.clock) this.clock.paused = true;
        this.applySimulationSpeed(true);

        const showDemoCompletion = () => {
            this._showGameOverOverlay(this._buildDemoCompletionSummary());
        };
        const uiTimer = this.uiScene?.time;
        const uiTimerScale = Number(uiTimer?.timeScale ?? 1);
        if (uiTimer?.delayedCall && uiTimer?.paused !== true && (!Number.isFinite(uiTimerScale) || uiTimerScale > 0)) {
            uiTimer.delayedCall(520, showDemoCompletion);
        } else {
            showDemoCompletion();
        }
    }

    restoreShockerBossState(snapshot = null) {
        const startedOnDay = snapshot?.startedOnDay ?? null;
        this._shockerBossState = {
            defeated: !!snapshot?.defeated,
            nightLocked: !!snapshot?.nightLocked,
            bossId: snapshot?.bossId ?? null,
            startedOnDay,
            defeatedOnDay: snapshot?.defeatedOnDay ?? (snapshot?.defeated ? startedOnDay : null),
            appearanceIndex: Math.max(0, Number(snapshot?.appearanceIndex || 0)),
        };
        this._activeShockerBoss = (Player.troops || []).find((troop) =>
            troop?.active
            && troop?.isShocker
            && (snapshot?.bossId == null || Number(troop.id) === Number(snapshot.bossId))
        ) || null;
        this._syncShockerBossUi();
    }

    _estimateNightLaneDetails(edgeKey, difficulty, hordeIndex, modifier = null, laneEnemyCount = null) {
        const diff = Math.max(1, Math.min(PRESSURE_CONTRACT.MAX_DIFFICULTY ?? 3, difficulty | 0));
        const settings = getNightHordeSettings(hordeIndex);
        const enemies = Math.max(1, Number((laneEnemyCount ?? settings.totalEnemies) || 1));
        const baseIntervalMs = Math.max(
            1300,
            2800 - (Math.max(0, Number(hordeIndex || 1) - 1) * 140)
        );
        const spawnIntervalMs = Math.max(
            1200,
            Math.round(baseIntervalMs * Math.max(0.4, Number(modifier?.intervalMultiplier ?? 1) || 1))
        );
        const enemyMods = this._getNightHordeEnemyMods(modifier);
        const hunterRatio = Number(settings.hunterRatio || 0);
        const bomberRatio = Number(settings.bomberRatio || 0);
        const enemyTypes = ["raider"];
        if (hunterRatio > 0) enemyTypes.push("hunter");
        if (bomberRatio > 0) enemyTypes.push("bomber");
        const enemyTypeLabel = buildEnemyTypeLabel(enemyTypes) || this._getNightHordeEnemyLabel(modifier);

        return {
            edgeKey,
            difficulty: diff,
            spawners: 1,
            enemiesPerSpawner: enemies,
            enemies,
            spawnIntervalMs,
            swimSpeed: Math.max(180, Math.round(220 * Math.max(1, Number(enemyMods.speedMultiplier ?? 1) || 1))),
            enemyType: "raider",
            hunterRatio,
            bomberRatio,
            enemyTypeLabel,
            enemyMods,
            modifierKey: modifier?.key ?? null,
            modifierLabel: modifier?.label ?? null,
        };
    }

    _buildNightHordePlan(hordeIndex = this.getCurrentHordeIndex()) {
        const horde = Math.max(1, Number(hordeIndex || 1));
        const settings = getNightHordeSettings(horde);
        const laneCount = settings.laneCount;
        const baseDifficulty = Math.min(3, 1 + Math.floor(Math.max(0, horde - 1) / 2));
        const modifier = getHordeModifierForIndex(horde);
        const edgeKeys = Phaser.Utils.Array.Shuffle(["top", "right", "bottom", "left"].slice()).slice(0, laneCount);
        const laneEnemyCounts = distributeAcrossLanes(settings.totalEnemies, laneCount);
        const laneDetails = edgeKeys.map((edgeKey, idx) => {
            const laneDifficulty = Math.min(3, baseDifficulty + ((laneEnemyCounts[idx] >= 4 || (idx === edgeKeys.length - 1 && horde >= 5)) ? 1 : 0));
            return this._estimateNightLaneDetails(edgeKey, laneDifficulty, horde, modifier, laneEnemyCounts[idx]);
        });
        const totalEnemies = laneDetails.reduce((sum, lane) => sum + lane.enemies, 0);
        const includesHunters = laneDetails.some((lane) => Number(lane.hunterRatio || 0) > 0);
        const includesBombers = laneDetails.some((lane) => Number(lane.bomberRatio || 0) > 0);
        const enemyLabelParts = ["raider"];
        if (includesHunters) enemyLabelParts.push("hunter");
        if (includesBombers) enemyLabelParts.push("bomber");

        return {
            hordeIndex: horde,
            laneCount,
            baseDifficulty,
            edgeKeys,
            modifier,
            enemyLabel: buildEnemyTypeLabel(enemyLabelParts) || this._getNightHordeEnemyLabel(modifier),
            laneDetails,
            totalEnemies,
        };
    }

    _getMainIslandBounds() {
        const origin = this.parcelManager?.mainIslandOrigin ?? PARCEL.MAIN_ORIGIN;
        const minx = Number(origin?.x ?? PARCEL.MAIN_ORIGIN.x);
        const miny = Number(origin?.y ?? PARCEL.MAIN_ORIGIN.y);
        return {
            minx,
            miny,
            maxx: minx + PARCEL.SIZE - 1,
            maxy: miny + PARCEL.SIZE - 1,
        };
    }

    _getMainIslandCenterWorld() {
        const bounds = this._getMainIslandBounds();
        return {
            x: ((bounds.minx + bounds.maxx + 1) * 0.5) * SQUARESIZE,
            y: ((bounds.miny + bounds.maxy + 1) * 0.5) * SQUARESIZE,
        };
    }

    _getNightHordePlan(hordeIndex = this.getCurrentHordeIndex()) {
        const horde = Math.max(1, Number(hordeIndex || 1));
        const cached = this._cachedNightHordePlan;
        if (cached?.hordeIndex === horde) return cached;
        const plan = this._buildNightHordePlan(horde);
        this._cachedNightHordePlan = plan;
        return plan;
    }

    _resetParcelUiState() {
        this.uiScene?.contractHud?.closePopup?.(false);
        this.parcelSpawnUI?.resetUiState?.();
    }

    getUpcomingNightHordePlan() {
        if (!StageState.endlessMode || this._hordeRewardInProgress) return null;
        if (Number(this.clock?.day || 1) < 2) return null;
        if (this._isShockerBossDay() && !this._isShockerBossActive()) {
            return {
                hordeIndex: this.getCurrentHordeIndex(),
                laneCount: 1,
                modifier: { key: "shocker_boss", label: "Boss Night" },
                enemyLabel: SHOCKER_BOSS_NAME,
                laneDetails: [],
                totalEnemies: 1,
                boss: true,
            };
        }
        if (this._activeNightHorde?.plan) return this._activeNightHorde.plan;
        return this._getNightHordePlan();
    }

    getNightPressurePreviewForSlot(slotId) {
        return null;
    }

    getUpcomingHordePreviewSummary() {
        if (!StageState.endlessMode || this._hordeRewardInProgress) return null;

        if (this._isShockerBossActive()) {
            return {
                phase: "night",
                hordeIndex: this.getCurrentHordeIndex(),
                laneCount: 1,
                modifierLabel: "Boss Night",
                enemyLabel: SHOCKER_BOSS_NAME,
                totalEnemies: 1,
                aliveEnemies: this._activeShockerBoss?.active ? 1 : 0,
                countdownText: "Night is frozen until the boss dies",
                headline: "Storm Boss Active",
                bannerText: `Storm Boss Active | ${SHOCKER_BOSS_NAME}`,
                boss: true,
            };
        }

        if (this._activeNightHorde) {
            const totalEnemies = Math.max(
                0,
                Number(
                    this._activeNightHorde.totalEnemies
                    || this._activeNightHorde.laneDetails?.reduce((sum, lane) => sum + Math.max(0, Number(lane?.enemies || 0)), 0)
                    || 0
                )
            );
            const enemyLabel = this._activeNightHorde.enemyLabel || this._getNightHordeEnemyLabel(this._activeNightHorde.modifier);
            const headline = this._getNightHordeHeadline(totalEnemies, "active");
            return {
                phase: "night",
                hordeIndex: this._activeNightHorde.hordeIndex,
                laneCount: this._activeNightHorde.laneDetails?.length || 0,
                modifierLabel: this._activeNightHorde.modifier?.label ?? null,
                enemyLabel,
                totalEnemies,
                aliveEnemies: this._countActiveNightHordeTroops(this._activeNightHorde.id),
                countdownText: this.clock?.getPhaseCountdownText?.() || "",
                headline,
                bannerText: `${headline} | H${this._activeNightHorde.hordeIndex} | ${totalEnemies} ${enemyLabel}${this._activeNightHorde.modifier?.label ? ` | ${this._activeNightHorde.modifier.label}` : ""}`,
            };
        }

        const plan = this.getUpcomingNightHordePlan();
        if (!plan) return null;

        if (plan?.boss) {
            return {
                phase: this.clock?.getPhaseKey?.() || "day",
                hordeIndex: plan.hordeIndex,
                laneCount: 1,
                modifierLabel: "Boss Night",
                enemyLabel: SHOCKER_BOSS_NAME,
                totalEnemies: 1,
                countdownText: this.clock?.getPhaseCountdownText?.() || "",
                headline: "Storm Boss Tonight",
                bannerText: `Storm Boss Tonight | ${SHOCKER_BOSS_NAME}`,
                boss: true,
            };
        }

        const totalEnemies = Math.max(0, Number(plan.totalEnemies || 0));
        const enemyLabel = plan.enemyLabel || this._getNightHordeEnemyLabel(plan.modifier);
        const headline = this._getNightHordeHeadline(totalEnemies, this.clock?.getPhaseKey?.() === "dusk" ? "dusk" : "preview");

        return {
            phase: this.clock?.getPhaseKey?.() || "day",
            hordeIndex: plan.hordeIndex,
            laneCount: plan.laneDetails?.length || 0,
            modifierLabel: plan.modifier?.label ?? null,
            enemyLabel,
            totalEnemies,
            countdownText: this.clock?.getPhaseCountdownText?.() || "",
            headline,
            bannerText: `${headline} | H${plan.hordeIndex} | ${totalEnemies} ${enemyLabel}${plan.modifier?.label ? ` | ${plan.modifier.label}` : ""}`,
        };
    }

    _syncNightPressurePreviewPanels() {
        return;
    }

    _isTroopOnMainIsland(troop) {
        if (!troop?.active) return false;
        const gx = Math.floor(troop.x / SQUARESIZE);
        const gy = Math.floor(troop.y / SQUARESIZE);
        return (
            gx >= PARCEL.MAIN_ORIGIN.x &&
            gx < PARCEL.MAIN_ORIGIN.x + PARCEL.SIZE &&
            gy >= PARCEL.MAIN_ORIGIN.y &&
            gy < PARCEL.MAIN_ORIGIN.y + PARCEL.SIZE
        );
    }

    _recallRemoteParcelWorkers() {
        const team = Teams.teamLists?.["1"];
        if (!team?.playerList?.length) return 0;

        let recalled = 0;
        for (const troop of team.playerList) {
            if (!troop?.active || troop.body?.team !== 1) continue;
            if (!(troop.isForager || troop.isFarmer || troop.isBuilder || troop.isFireman)) continue;
            if (this._isTroopOnMainIsland(troop) && !Player._isOnWater?.(troop)) continue;

            OrderRunner._clearTroopOrder?.(troop, {
                interrupt: true,
                targetState: CONTROL_STATES.BACK_TO_TOWN,
            });
            troop.task = null;
            troop.finalPos = null;
            troop.currentPath?.splice?.(0);
            troop.body?.setVelocity?.(0, 0);
            Teams.sendTroopToTown(troop);
            recalled += 1;
        }

        return recalled;
    }

    handlePhaseChanged(phaseKey, phaseInfo = null) {
        this._currentPhaseKey = phaseKey;
        if ((phaseKey === "day" || phaseKey === "night") && this.getSimulationSpeed?.() !== 1) {
            this.setSimulationSpeed(1);
        }
        this.events.emit("phase:changed", phaseKey, phaseInfo || this.clock?.getPhaseInfo?.());
        if (phaseKey !== "night") {
            this.time?.delayedCall?.(0, () => this._tryPresentPendingTownXpReward());
        }

        const marker = `${this.clock?.day || 1}:${phaseKey}`;
        if (this._lastPhaseAnnouncement === marker) return;
        this._lastPhaseAnnouncement = marker;

        const colors = {
            dawn: "#b8f2ff",
            day: "#b9fbc0",
            dusk: "#ffd6a5",
            night: "#fecaca",
        };
        const isFreeFirstNight = Math.max(1, Number(this.clock?.day || 1)) === 1;
        const labels = {
            dawn: "Dawn: tower income and village rewards",
            day: "Day: build, gather, and expand",
            dusk: isFreeFirstNight ? "Dusk: free first night, no raiders tonight" : "Dusk: prepare for the coastal assault",
            night: isFreeFirstNight ? "Free first night: no raiders tonight" : "Night: defend town, parcels stay open",
        };

        const label = labels[phaseKey];
        if (label) {
            showAlert(this, label, colors[phaseKey] || "#ffffff");
        }
    }

    handleDuskStart() {
        if (!StageState.endlessMode || this._hordeRewardInProgress) return;
        SaveManager.queueAutosave("phase_dusk");
        if (Number(this.clock?.day || 1) < 2) {
            showAlert(this, "Free first night: no raiders tonight. First horde arrives on night 2.", "#a7f3d0", 2600);
            return;
        }
        if (this._isShockerBossDay()) {
            showAlert(this, "Stormfront detected. A boss arrives tonight.", "#d8b4fe", 2600);
            this.uiScene?.flashStormLightning?.(180, 0.26);
            return;
        }
        const preview = this.getUpcomingHordePreviewSummary();
        if (preview) {
            const alertText = `${preview.headline || "Coastal Assault Tonight"} | H${preview.hordeIndex} | ${Math.max(0, Number(preview.totalEnemies || 0))} ${preview.enemyLabel || "Raiders"}${preview.modifierLabel ? ` | ${preview.modifierLabel}` : ""}`;
            showAlert(this, alertText, "#ffd6a5", 2200);
        }
    }

    handleNightStart() {
        if (!StageState.endlessMode || this._hordeRewardInProgress) return;
        SaveManager.queueAutosave("phase_night");
        if (this._activeNightHorde?.startedOnDay === this.clock?.day) return;
        if (Number(this.clock?.day || 1) < 2) {
            showAlert(this, "Free first night: no raiders tonight. First horde arrives tomorrow night.", "#a7f3d0");
            return;
        }
        if (this._isShockerBossDay()) {
            this.startShockerBossNight();
            return;
        }
        this.startNightlyHorde();
    }

    handleDayStart() {
        this._resetParcelUiState();
        this.grantTownTowerDawnIncome();
        SaveManager.queueDailyAutosave(this.clock?.day, "day_start");
        if (this._reliefRecoveryQueuedForDawn) {
            this.time?.delayedCall?.(0, () => {
                this._queueStorageCollapseEvaluation(this._pendingStorageCollapseSource);
            });
        }
        if (!StageState.endlessMode || this._hordeRewardInProgress) return;
        if (this._shockerBossState?.nightLocked) return;
        this.finishNightlyHordeAtDawn();
        this._syncNightPressurePreviewPanels();
    }

    isDailyAutosaveReady() {
        if (this._townTowerLossInProgress || this._storageCollapseLossInProgress || this._restartToMainMenuInProgress) return false;
        if (this._reliefRecoveryInProgress) return false;
        if (this._hordeRewardInProgress || this.stageCompleteLock) return false;
        if (this._activeRewardUI || this._activeBossRewardUI || this._activeTownXpRewardUI) return false;
        if (Math.max(0, Number(this._townXp?.pendingLevelRewards || 0)) > 0) return false;
        if (this.clock?.paused) return false;
        if (this.menu?.active || this.draftMenu?.active) return false;
        if (this.uiScene?.pauseMenu?.isOpen) return false;
        return true;
    }

    grantTownTowerDawnIncome() {
        const currentDay = Math.max(1, Number(this.clock?.day || 1));
        const payout = TowerBuilding.grantDawnIncome(this, 1, {
            skipStarterPermits: currentDay === 1,
        });
        if (!payout) return null;

        const permitText = payout.permits > 0
            ? ` and +${payout.permits} permit${payout.permits === 1 ? "" : "s"}`
            : "";
        showAlert(
            this,
            `Town Towers: +$${payout.money}${permitText}`,
            "#a7f3d0"
        );
        return payout;
    }

    handleTownCoreLost(tower) {
        if (this._townTowerLossInProgress || this._storageCollapseLossInProgress) return;
        this._townTowerLossInProgress = true;
        this._lastTownCoreLost = tower || null;
        this._movementLocked = true;
        this.stageCompleteLock = true;
        SaveManager.clearRunSave();

        this._clearActiveRunPresentations();

        AudioManager.playWorldSound?.('sfx_end_stage_explosions');
        this.cameras.main.shake(260, 0.006);
        if (this.clock) this.clock.paused = true;
        this.applySimulationSpeed(true);

        this._playTownTowerCollapseSequence(tower, () => {
            this._showGameOverOverlay();
        });
    }

    _playTownTowerCollapseSequence(tower, onDone) {
        const sprite = tower?.sprite;
        if (this.uiScene?.playTownLossCollapseSequence) {
            this.uiScene.playTownLossCollapseSequence({
                towerWorldX: sprite?.x,
                towerWorldY: sprite?.y,
                onComplete: onDone,
            });
            return;
        }

        if (!sprite?.active) {
            onDone?.();
            return;
        }
        onDone?.();
    }

    _getRunSummaryLines() {
        const summary = this._getRunSummaryData();
        const primaryLines = (summary.primaryStats || []).map((entry) => `${entry.label}: ${entry.value}`);
        const secondaryLines = (summary.secondaryStats || []).map((entry) => `${entry.label}: ${entry.value}`);
        if (summary.troopUnlockLabels?.length) {
            secondaryLines.push(`Unlocked Troops: ${summary.troopUnlockLabels.join(", ")}`);
        }

        return [...primaryLines, ...secondaryLines];
    }

    _showGameOverOverlay(summaryData = this._getRunSummaryData()) {
        if (this.uiScene?.showTownLossPresentation) {
            this.uiScene.showTownLossPresentation(summaryData);
            return;
        }

        if (this._gameOverOverlay?.active) return;
        const cam = this.cameras.main;
        const overlay = this.add.container(0, 0).setDepth(20000).setScrollFactor(0);
        const shade = this.add.rectangle(0, 0, cam.width, cam.height, 0x07131f, 0.84)
            .setOrigin(0)
            .setScrollFactor(0)
            .setInteractive({ useHandCursor: false });
        const title = this.add.text(cam.centerX, cam.centerY - 40, "Town Tumbled!", {
            fontFamily: "Bungee",
            fontSize: "30px",
            color: "#fff7ed",
            stroke: "#08131d",
            strokeThickness: 6,
        }).setOrigin(0.5).setScrollFactor(0);
        const primaryLines = (summaryData.primaryStats || []).map((entry) => `${entry.label}: ${entry.value}`);
        const secondaryLines = (summaryData.secondaryStats || []).map((entry) => `${entry.label}: ${entry.value}`);
        const summaryLines = [...primaryLines, ...secondaryLines];
        const summary = this.add.text(cam.centerX, cam.centerY + 26, summaryLines.join("\n"), {
            fontFamily: "Bungee",
            fontSize: "14px",
            color: "#dbeafe",
            align: "center",
            lineSpacing: 7,
        }).setOrigin(0.5).setScrollFactor(0);
        overlay.add([shade, title, summary]);
        this._gameOverOverlay = overlay;
    }

    restartToMainMenu({ hostScene } = {}) {
        if (this._restartToMainMenuInProgress) return;
        this._restartToMainMenuInProgress = true;
        this.setSimulationPause?.("restart_to_main_menu", true);
        MainMenu.queueRestartReveal?.({
            color: 0x64b9ff,
            fadeOutDuration: 920,
        });

        const fadeScene = hostScene || this.uiScene || this;
        const fadeDepth = (UIDEPTH ?? 2000) + 5000;
        const fadeFx = fadeScene.add.container(0, 0).setDepth(fadeDepth).setScrollFactor(0);
        const fadeCover = fadeScene.add.rectangle(
            0,
            0,
            fadeScene.scale.width,
            fadeScene.scale.height,
            0x64b9ff,
            0
        ).setOrigin(0).setScrollFactor(0);
        fadeCover.setInteractive({ useHandCursor: false });
        const fadeGlowA = fadeScene.add.circle(
            fadeScene.scale.width * 0.26,
            fadeScene.scale.height * 0.3,
            210,
            0xffffff,
            0.08
        ).setAlpha(0);
        const fadeGlowB = fadeScene.add.circle(
            fadeScene.scale.width * 0.74,
            fadeScene.scale.height * 0.62,
            260,
            0xdbeafe,
            0.06
        ).setAlpha(0);
        fadeFx.add([fadeCover, fadeGlowA, fadeGlowB]);

        const lossPresentation = fadeScene._townLossPresentation?.root || null;
        if (lossPresentation) {
            fadeScene.tweens.add({
                targets: lossPresentation,
                alpha: 0,
                scaleX: 0.94,
                scaleY: 0.94,
                duration: 320,
                ease: "Cubic.easeOut",
            });
        }

        fadeScene.tweens.add({
            targets: [fadeGlowA, fadeGlowB],
            alpha: { from: 0.02, to: 0.16 },
            scaleX: { from: 0.9, to: 1.12 },
            scaleY: { from: 0.9, to: 1.12 },
            duration: 760,
            ease: "Sine.easeInOut",
        });
        fadeScene.tweens.add({
            targets: fadeCover,
            alpha: 1,
            duration: 760,
            ease: "Cubic.easeInOut",
            onComplete: () => {
                const carryCover = this.add.rectangle(
                    0,
                    0,
                    this.scale.width,
                    this.scale.height,
                    0x64b9ff,
                    1
                ).setOrigin(0).setScrollFactor(0).setDepth(fadeDepth + 10);
                this._restartCarryCover = carryCover;
                if (this.scene.isActive('GameUIScene')) {
                    const liveUiScene = this.scene.get('GameUIScene');
                    liveUiScene?._destroyTownLossPresentation?.();
                    liveUiScene?._destroyGameplayUi?.();
                    liveUiScene?._clearWorldEventBridge?.();
                    this.scene.stop('GameUIScene');
                }
                this.scene.restart();
            },
        });
    }

    _cleanupForSceneShutdown() {
        SaveManager.detachScene(this);
        Turret.cancelPlacement();
        Catapult.cancelPlacement();
        this.overviewOceanWaves?.destroy?.();
        this.overviewOceanWaves = null;
        this.overviewCloudLayer?.destroy?.();
        this.overviewCloudLayer = null;
        this.overviewShoreWaves?.destroy?.();
        this.overviewShoreWaves = null;
        this._menuModeActive = false;
        this._activeRewardUI?.destroy?.();
        this._activeRewardUI = null;
        this._activeBossRewardUI?.destroy?.();
        this._activeBossRewardUI = null;
        this._activeTownXpRewardUI?.destroy?.();
        this._activeTownXpRewardUI = null;
        this.tutorialManager?.destroy?.();
        this.tutorialManager = null;
        this.menu?.destroy?.();
        this.menu = null;
        this.logo?.destroy?.();
        this.logo = null;
        this.logoMini?.destroy?.();
        this.logoMini = null;
        this.startButton?.destroy?.();
        this.startButton = null;
        this.continueButton?.destroy?.();
        this.continueButton = null;
        this.menuPreview?.destroy?.();
        this.menuPreview = null;
        this._menuRevealFx?.destroy?.(true);
        this._menuRevealFx = null;
        this._restartCarryCover?.destroy?.();
        this._restartCarryCover = null;
        this.farmInstructionUI?.destroy?.(true);
        this.farmInstructionUI = null;
        this.farmInstrLeft = null;
        this.farmInstrMid = null;
        this.farmInstrSeedCount = null;
        this.farmInstrSeedIcon = null;
        this.farmInstrRight = null;
        this.farmHover?.destroy?.();
        this.farmHover = null;
        this._teamTownIcon?.destroyWithLabel?.();
        this._teamTownIcon?.destroy?.();
        this._teamTownIcon = null;
        this.draftMenu?.destroy?.();
        this.draftMenu = null;
        this._draftTownIconUnsub?.();
        this._draftTownIconUnsub = null;
        this.parcelSpawnUI?.root?.destroy?.(true);
        this.parcelSpawnUI = null;
        this.parcelManager = null;
        this.navMeshUpdater?.destroy?.();
        this.navMeshUpdater = null;
        this.enemyNavMeshUpdater?.destroy?.();
        this.enemyNavMeshUpdater = null;
        this.zoomMixer?.overviewImage?.destroy?.();
        this.zoomMixer = null;
        ZoomMixer.mapIconContainer?.destroy?.();
        ZoomMixer.mapIconContainer = null;
        if (this._registryImageChangedHandler) {
            this.registry?.events?.off?.('changedata-image', this._registryImageChangedHandler);
            this._registryImageChangedHandler = null;
        }
        if (Array.isArray(this._scaleResizeHandlers)) {
            this._scaleResizeHandlers.forEach((handler) => {
                this.scale?.off?.("resize", handler);
            });
            this._scaleResizeHandlers.length = 0;
        }

        if (this.time) this.time.timeScale = 1;
        if (this.tweens) this.tweens.timeScale = 1;
        if (this.physics?.world) {
            this.physics.world.resume?.();
            this.physics.world.timeScale = 1;
        }
        if (this.anims) this.anims.globalTimeScale = 1;
        if (this.input?.keyboard) this.input.keyboard.enabled = true;
        this._destroyNorthFortArrivalMarker();
        this.scene.stop('GameUIScene');

        GameMap.resetRuntimeState?.();
        VisibilitySystem.reset?.();
        AudioManager.stopAll?.();
        Player.resetRuntimeState?.();
        Teams.resetAll?.();
        StageState.resetForMenu?.();
        clearBuildingArray?.();
        clearPlayerDict?.();
        spawnPoints.length = 0;
        Object.keys(townBounds).forEach((key) => delete townBounds[key]);
        Object.keys(townRoads).forEach((key) => delete townRoads[key]);
    }

    _spawnNightlyHordeTroop(active, lane, enemyType = lane?.enemyType ?? "raider") {
        if (!active || this._activeNightHorde?.id !== active.id) return null;

        const troop = spawnSeaRaider(this, {
            edge: lane.edgeKey,
            enemyType,
            targetPoint: this._getMainIslandCenterWorld(),
            swimSpeed: lane.swimSpeed,
            modifier: lane.enemyMods,
            modifierKey: lane.modifierKey,
            modifierLabel: lane.modifierLabel,
            enemyTypeLabel: lane.enemyTypeLabel,
            hordeIndex: active.hordeIndex,
            nightHordeId: active.id,
        });

        if (troop) {
            active.spawnedCount = Math.max(0, Number(active.spawnedCount || 0)) + 1;
        }
        return troop;
    }

    _scheduleNightlyHordeSpawns(active) {
        if (!active?.laneDetails?.length) return [];

        const events = [];
        active.laneDetails.forEach((lane, laneIndex) => {
            const intervalMs = Math.max(350, Number(lane.spawnIntervalMs || 1500));
            const initialDelay = Phaser.Math.Between(0, Math.max(400, Math.round(intervalMs * 0.35)));
            for (let enemyIndex = 0; enemyIndex < Math.max(1, Number(lane.enemies || lane.enemiesPerSpawner || 1)); enemyIndex++) {
                const delay = Math.max(0, initialDelay + laneIndex * 180 + enemyIndex * intervalMs);
                const enemyType = pickScaledEnemyType({
                    hunterRatio: lane.hunterRatio,
                    bomberRatio: lane.bomberRatio,
                    sequenceIndex: enemyIndex + laneIndex,
                });
                events.push(this.time.delayedCall(delay, () => {
                    this._spawnNightlyHordeTroop(active, lane, enemyType);
                }));
            }
        });

        active.spawnEvents = events;
        return events;
    }

    startNightlyHorde() {
        if (this._hordeRewardInProgress) return;

        const plan = this.getUpcomingNightHordePlan() || this._getNightHordePlan();
        const laneDetails = (plan?.laneDetails || []).map((lane) => ({ ...lane }));
        if (!laneDetails.length) return;

        this._activeNightHorde = {
            id: `night_horde_${plan.hordeIndex}_${Math.max(1, Number(this.clock?.day || 1))}_${Date.now()}`,
            hordeIndex: plan.hordeIndex,
            startedOnDay: Math.max(1, Number(this.clock?.day || 1)),
            laneDetails,
            laneCount: laneDetails.length,
            modifier: plan.modifier ?? null,
            enemyLabel: plan.enemyLabel || this._getNightHordeEnemyLabel(plan.modifier),
            totalEnemies: Math.max(0, Number(plan.totalEnemies || 0)),
            spawnEvents: [],
            spawnedCount: 0,
            plan,
        };
        this._scheduleNightlyHordeSpawns(this._activeNightHorde);
        const nightAlertText = `Raiders Incoming | H${plan.hordeIndex} | ${Math.max(0, Number(plan.totalEnemies || 0))} ${plan.enemyLabel || this._getNightHordeEnemyLabel(plan.modifier)}${plan.modifier?.label ? ` | ${plan.modifier.label}` : ""}`;
        showAlert(this, nightAlertText, "#fecaca", 2200);
    }

    finishNightlyHordeAtDawn() {
        const active = this._activeNightHorde;
        if (!active) return;

        this._clearNightHordeState(active, { destroyTroops: true });
        this._activeNightHorde = null;
        this._invalidateNightHordePlan();
        this._runStats.nightsSurvived += 1;
        this.startHordeRewardSequence(active.hordeIndex);
    }

    startHordeRewardSequence(hordeIndex) {
        if (this._hordeRewardInProgress) return;
        this._hordeRewardInProgress = true;

        const finalizeHordeReward = () => {
            StageState.advanceHorde({ reason: "night_horde_survived", hordeIndex });
            this._invalidateNightHordePlan();
            this._movementLocked = false;
            this.clock.paused = false;
            this.applySimulationSpeed(true);
            this.zoomMixer?.setZoomOutLocked?.(false);
            this._hordeRewardInProgress = false;
            this._stageHud?.recompute?.();
            this.events.emit("stage:changed");
            this._syncNightPressurePreviewPanels();
            this.addTownXp(TOWN_XP_SOURCE_VALUES.hordeSurvived, `Horde ${hordeIndex} Survived`, { alert: true });
            showAlert(this, `Horde ${hordeIndex} survived`, "#a7f3d0");
        };

        const maybeOpenHordeUnlockReward = () => {
            const unlockReward = getHordeUnlockReward(hordeIndex);
            if (!unlockReward) {
                finalizeHordeReward();
                return;
            }

            this._registerRunTroopUnlock(unlockReward);

            this._activeBossRewardUI?.destroy?.();
            this._activeBossRewardUI = openBossUnlockRewardPresentation(this, {
                reward: unlockReward,
                onComplete: () => {
                    this._activeBossRewardUI = null;
                    finalizeHordeReward();
                }
            });
        };
        const unlockReward = getHordeUnlockReward(hordeIndex);
        if (!unlockReward) {
            finalizeHordeReward();
            return;
        }

        this.zoomMixer?.setZoomOutLocked?.(true);
        this._movementLocked = true;
        this.clock.paused = true;
        this.applySimulationSpeed(true);
        maybeOpenHordeUnlockReward();
    }

    getNorthFortArrivalInfo() {
        const state = this._northFortArrival;
        if (!state?.pending) return null;

        const currentDay = Math.max(1, Number(this.clock?.day ?? state.createdOnDay ?? 1));
        const arrivalDay = Math.max(currentDay, Number(state.arrivalDay ?? currentDay));
        const daysRemaining = Math.max(0, arrivalDay - currentDay);
        const seasonIndex = Math.max(1, Number(state.seasonIndex ?? StageState.seasonIndex ?? 1));
        const stageIndex = Math.max(1, Number(state.stageIndex ?? StageState.stageIndex ?? 1));

        return {
            pending: true,
            delayDays: Math.max(0, Number(state.delayDays ?? 0)),
            createdOnDay: Math.max(1, Number(state.createdOnDay ?? currentDay)),
            arrivalDay,
            daysRemaining,
            reason: state.reason ?? "scheduled",
            seasonIndex,
            stageIndex,
            timerText: `DAY ${arrivalDay}`,
            statusText: daysRemaining === 0
                ? "Arrives today"
                : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left`,
            metaText: `Season ${seasonIndex}  Stage ${stageIndex}`,
        };
    }

    _getNorthFortArrivalAnchor() {
        const baseOrigin = this._northFortMainIslandOrigin
            ?? this.parcelManager?.mainIslandOrigin
            ?? PARCEL.MAIN_ORIGIN;
        const fortOrigin = {
            x: Number(baseOrigin?.x ?? PARCEL.MAIN_ORIGIN.x),
            y: Number(baseOrigin?.y ?? PARCEL.MAIN_ORIGIN.y) - PARCEL.SIZE,
        };

        return {
            x: (fortOrigin.x + PARCEL.SIZE * 0.5) * SQUARESIZE,
            y: (fortOrigin.y + PARCEL.SIZE * 0.5) * SQUARESIZE,
        };
    }

    _ensureNorthFortArrivalMarker() {
        if (this._northFortArrivalMarker?.root?.active) return this._northFortArrivalMarker;

        const root = this.add.container(0, 0).setDepth(UIDEPTH - 0.35);
        const plate = this.add.graphics();
        const badge = this.add.circle(0, -132, 34, 0x4c1d95, 0.96)
            .setStrokeStyle(3, 0xfbbf24, 0.88);
        const tower = this.add.text(0, -59, "♜", {
            fontFamily: "Bungee",
            fontSize: "28px",
            color: "#fff5cf",
            stroke: "#190b2f",
            strokeThickness: 4,
        }).setOrigin(0.5);
        const crown = this.add.text(16, -74, "♛", {
            fontFamily: "Bungee",
            fontSize: "16px",
            color: "#fbbf24",
            stroke: "#190b2f",
            strokeThickness: 3,
        }).setOrigin(0.5);
        const title = this.add.text(0, -18, "NORTH FORT", {
            fontFamily: "Bungee",
            fontSize: "14px",
            color: "#f6ecff",
            stroke: "#14071f",
            strokeThickness: 4,
            align: "center",
        }).setOrigin(0.5);
        const timer = this.add.text(0, 5, "DAY 1", {
            fontFamily: "Bungee",
            fontSize: "18px",
            color: "#fff5cf",
            stroke: "#14071f",
            strokeThickness: 4,
            align: "center",
        }).setOrigin(0.5);
        const meta = this.add.text(0, 24, "", {
            fontFamily: "Bungee",
            fontSize: "11px",
            color: "#ead9ff",
            stroke: "#14071f",
            strokeThickness: 3,
            align: "center",
        }).setOrigin(0.5, 0);

        tower.setPosition(0, -133);
        tower.setFontSize("42px");
        tower.setText("♜");
        crown.setPosition(24, -154);
        crown.setFontSize("20px");
        crown.setText("♛");
        title.setPosition(0, -84);
        tower.setText("\u265C");
        crown.setText("\u265B");
        title.setFontSize("30px");
        title.setStroke("#14071f", 6);
        title.setText("NORTH FORT INCOMING");
        timer.setPosition(0, -4);
        timer.setFontSize("76px");
        timer.setStroke("#14071f", 8);
        meta.setPosition(0, 128);
        meta.setFontSize("16px");
        meta.setAlign("center");
        meta.setLineSpacing(8);
        meta.setWordWrapWidth(PARCEL.SIZE * SQUARESIZE - 72);

        const detailStatus = this.add.text(0, 74, "3 DAYS LEFT", {
            fontFamily: "Bungee",
            fontSize: "28px",
            color: "#f5d0fe",
            stroke: "#14071f",
            strokeThickness: 6,
            align: "center",
        }).setOrigin(0.5);
        const overviewPrimary = this.add.text(0, -34, "DAY 1", {
            fontFamily: "Bungee",
            fontSize: "96px",
            color: "#fff5cf",
            stroke: "#14071f",
            strokeThickness: 12,
            align: "center",
        }).setOrigin(0.5);
        const overviewSecondary = this.add.text(0, 102, "NORTH FORT\n3 DAYS LEFT", {
            fontFamily: "Bungee",
            fontSize: "32px",
            color: "#f5d0fe",
            stroke: "#14071f",
            strokeThickness: 8,
            align: "center",
            lineSpacing: 10,
            wordWrap: { width: PARCEL.SIZE * SQUARESIZE - 72 },
        }).setOrigin(0.5);

        root.add([plate, badge, tower, crown, title, timer, detailStatus, meta, overviewPrimary, overviewSecondary]);
        root.setAlpha(0);
        root.setScale(0.9);

        const pulse = this.tweens.add({
            targets: [badge, tower, timer, overviewPrimary],
            alpha: { from: 1, to: 0.82 },
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
        });
        const appear = this.tweens.add({
            targets: root,
            alpha: 1,
            scaleX: 1,
            scaleY: 1,
            duration: 220,
            ease: "Back.easeOut",
        });

        this._northFortArrivalMarker = {
            root,
            plate,
            badge,
            tower,
            crown,
            title,
            timer,
            detailStatus,
            meta,
            overviewPrimary,
            overviewSecondary,
            pulse,
            appear,
        };
        return this._northFortArrivalMarker;
    }

    _destroyNorthFortArrivalMarker() {
        const marker = this._northFortArrivalMarker;
        if (!marker) return;

        marker.appear?.remove?.();
        marker.pulse?.remove?.();
        marker.root?.destroy?.(true);
        this._northFortArrivalMarker = null;
    }

    _refreshNorthFortArrivalMarker() {
        const info = this.getNorthFortArrivalInfo();
        if (!info) {
            this._destroyNorthFortArrivalMarker();
            return;
        }

        const marker = this._ensureNorthFortArrivalMarker();
        const anchor = this._getNorthFortArrivalAnchor();
        const isOverview = this.zoomMixer?.mode === "overview";
        const panelW = PARCEL.SIZE * SQUARESIZE - 24;
        const panelH = PARCEL.SIZE * SQUARESIZE - 24;

        marker.plate.clear();
        marker.plate.fillStyle(0x2b0f42, isOverview ? 0.46 : 0.28);
        marker.plate.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 26);
        marker.plate.lineStyle(isOverview ? 6 : 5, 0xf0abfc, isOverview ? 0.86 : 0.74);
        marker.plate.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 26);
        marker.plate.lineStyle(2, 0xfbbf24, isOverview ? 0.36 : 0.26);
        marker.plate.strokeRoundedRect(-(panelW / 2) + 16, -(panelH / 2) + 16, panelW - 32, panelH - 32, 20);

        marker.root.setPosition(anchor.x, anchor.y);
        marker.root.setScale(1);
        marker.root.setAlpha(1);
        marker.badge.setVisible(!isOverview);
        marker.tower.setVisible(!isOverview);
        marker.crown.setVisible(!isOverview);
        marker.title.setVisible(!isOverview);
        marker.timer.setText(info.timerText);
        marker.timer.setVisible(!isOverview);
        marker.detailStatus.setVisible(!isOverview);
        marker.meta.setVisible(!isOverview);
        marker.overviewPrimary.setVisible(isOverview);
        marker.overviewSecondary.setVisible(isOverview);
        marker.title.setText("NORTH FORT INCOMING");
        marker.detailStatus.setText(String(info.statusText || "").toUpperCase());
        marker.meta.setText(`${info.metaText}\nCROWN FORT GATHERING IN THE NORTH`);
        marker.overviewPrimary.setText(info.timerText);
        marker.overviewSecondary.setText(`NORTH FORT\n${String(info.statusText || "").toUpperCase()}`);
    }

    _resetNorthFortArrivalState() {
        this._northFortArrival = {
            pending: false,
            delayDays: 0,
            createdOnDay: Math.max(1, Number(this.clock?.day ?? 1)),
            arrivalDay: Math.max(1, Number(this.clock?.day ?? 1)),
            reason: null,
            seasonIndex: Math.max(1, Number(StageState.seasonIndex || 1)),
            stageIndex: Math.max(1, Number(StageState.stageIndex || 1)),
        };
    }

    _spawnPendingNorthFort(reason = "scheduled") {
        const pendingInfo = this.getNorthFortArrivalInfo();
        const mainIslandOrigin = this._northFortMainIslandOrigin
            ?? this.parcelManager?.mainIslandOrigin
            ?? PARCEL.MAIN_ORIGIN;

        this._resetNorthFortArrivalState();
        this._destroyNorthFortArrivalMarker();

        this._activeFort = spawnNorthFort({
            scene: this,
            map: GameMap,
            mainIslandOrigin,
        });
        this._refreshOverviewFromGrid();
        this.events.emit("north-fort:arrival-changed", null);

        if (pendingInfo && pendingInfo.delayDays > 0) {
            showAlert(this, "North Fort sighted in the north", "#d8b4fe");
        }

        return this._activeFort;
    }

    scheduleNorthFortArrival({
        delayDays = 0,
        reason = "scheduled",
        mainIslandOrigin = null,
        oldMeta = null,
    } = {}) {
        const normalizedDelay = Math.max(0, Math.floor(Number(delayDays) || 0));
        if (mainIslandOrigin && Number.isFinite(mainIslandOrigin.x) && Number.isFinite(mainIslandOrigin.y)) {
            this._northFortMainIslandOrigin = { x: mainIslandOrigin.x, y: mainIslandOrigin.y };
        } else if (!this._northFortMainIslandOrigin) {
            this._northFortMainIslandOrigin = { ...PARCEL.MAIN_ORIGIN };
        }

        if (oldMeta?.bounds) {
            clearNorthFort({ scene: this, map: GameMap, meta: oldMeta });
            this._refreshOverviewFromGrid();
        }

        this._activeFort = null;
        this._resetNorthFortArrivalState();

        if (normalizedDelay <= 0) {
            return this._spawnPendingNorthFort(reason);
        }

        const currentDay = Math.max(1, Number(this.clock?.day ?? 1));
        this._northFortArrival = {
            pending: true,
            delayDays: normalizedDelay,
            createdOnDay: currentDay,
            arrivalDay: currentDay + normalizedDelay,
            reason,
            seasonIndex: Math.max(1, Number(StageState.seasonIndex || 1)),
            stageIndex: Math.max(1, Number(StageState.stageIndex || 1)),
        };

        this._refreshNorthFortArrivalMarker();
        this.events.emit("north-fort:arrival-changed", this.getNorthFortArrivalInfo());
        return null;
    }

    _updateNorthFortArrival() {
        const info = this.getNorthFortArrivalInfo();
        if (info && Number(this.clock?.day || 0) >= info.arrivalDay) {
            this._spawnPendingNorthFort(info.reason);
            return;
        }

        this._refreshNorthFortArrivalMarker();
    }

    preload() {
        this.load.spritesheet('player', player, { frameWidth: 16, frameHeight: 16});
        this.load.spritesheet('gun1', gun1, { frameWidth: 16, frameHeight: 16});
        this.load.spritesheet('playerAction', playerAction, { frameWidth: 16, frameHeight: 16});
        this.load.spritesheet('playerCarry', playerCarry, { frameWidth: 16, frameHeight: 16});
        this.load.spritesheet('player_death', playerDeath, { frameWidth: 32, frameHeight: 44});
        this.load.image('barrier', gray);  // Load a barrier image
        this.load.image('worldMap', worldMap);
        this.load.image('cube', black);  // Make sure the path and filename are correct
        this.load.image('selected', green)
        this.load.image('leader', leader)
        this.load.image('hammer', hammer);
        this.load.image('monies', monies);
        this.load.image('seeds', seeds);
        this.load.image('berry', berry);
        this.load.image('spawn', spawn);
        this.load.image('foodIcon', foodIcon);
        this.load.image('waterIcon', waterIcon);
        this.load.image('woodIcon', woodIcon);
        this.load.image('stoneIcon', stoneIcon);
        this.load.image('playerIcon', playerIcon);
        this.load.image('uncleanWaterIcon', uncleanWaterIcon);
        this.load.image('relief_package', reliefPackageImg);
        this.load.image('reward_parcel_coupon', parcelCouponImg);
        this.load.image('reward_recruit_voucher', recruitVoucherImg);
        this.load.image('sparkle', waterParticle);
        this.load.image('zoomOutWaterTxt1', zoomOutWaterTxt1);
        this.load.image('zoomOutWaterTxt2', zoomOutWaterTxt2);
        this.load.image('tillOverlay', tillOverlay);
        this.load.spritesheet('char', char, {frameWidth: 60, frameHeight: 50});
        this.load.spritesheet('clayOven', clayOven, { frameWidth: 64, frameHeight: 64});
        this.load.image('fullBasePine', fullBasePine);
        this.load.image('fullMiddlePine', fullMiddlePine);
        this.load.image('fullTopPine', fullTopPine);
        this.load.image('mediumBasePine', mediumBasePine);
        this.load.image('mediumMiddlePine', mediumMiddlePine);
        this.load.image('mediumTopPine', mediumTopPine);
        Farmer.preload(this);
        Builder.preload(this);
        Forager.preload(this);
        Fireman.preload(this);
        Brawler.preload(this);
        Blademaster.preload(this);
        Gunslinger.preload(this);
        Raider.preload(this);
        Hunter.preload(this);
        Bomber.preload(this);
        Shocker.preload(this);
        preloadPlayerPortraits(this);
        preloadTutorialAssets(this);
        this.brushGraphics = this.add.graphics(); // Graphics for tinting tiles
        itemTab.preload(this);
        Projectile.init(this);
        AudioManager.init(this);
        DailyNeedsTracker.init(this);
        ClayOvenUI.init(this); // once in your main scene's create()
        StorageBuilding.scene = this;
        StorageUI.init(this);
        HouseUI.init(this);
        MainMenu.attach(this);
        PineTree.init(this);
        RockNode.init(this);
        TowerBuilding.scene = this;
        Bank.scene = this;
        Prison.scene = this;
        WallPlacementController.preload(this);
        loadCardData(this);
        loadParcelMarketAssets(this);
    }

    _enableGlobalTextFont() {
        if (this._globalTextFontPatched || !this.add?.text) return;
        const originalAddText = this.add.text.bind(this.add);
        this.add.text = (x, y, text, style = {}) => {
            const nextStyle = (style && typeof style === "object") ? { ...style } : {};
            if (!nextStyle.fontFamily) nextStyle.fontFamily = "Bungee";
            return originalAddText(x, y, text, nextStyle);
        };
        this._globalTextFontPatched = true;
    }

    _ensureOceanTextures() {
        if (!this.textures.exists("ocean_gradient")) {
            const g = this.make.graphics({ x: 0, y: 0, add: false });
            g.fillGradientStyle(0x115f89, 0x115f89, 0x1b7aaa, 0x1b7aaa, 1, 1, 1, 1);
            g.fillRect(0, 0, 4, 256);
            g.generateTexture("ocean_gradient", 4, 256);
            g.destroy();
        }

    }

    _createOceanBackdrop() {
        this._ensureOceanTextures();
        const w = this.scale.width;
        const h = this.scale.height;

        this.oceanBackdropBase = this.add.rectangle(0, 0, w, h, 0x156c99, 1)
            .setOrigin(0)
            .setScrollFactor(0)
            .setDepth(-10000);

        this.oceanBackdropGradient = this.add.image(0, 0, "ocean_gradient")
            .setOrigin(0)
            .setDisplaySize(w, h)
            .setAlpha(0.18)
            .setScrollFactor(0)
            .setDepth(-9999);

        this.overviewOceanWaves?.destroy?.();
        this.overviewOceanWaves = new OverviewOceanWaves(this, {
            depth: UIDEPTH - 2.6
        });

        this.overviewCloudLayer?.destroy?.();
        this.overviewCloudLayer = new OverviewCloudLayer(this, {
            depth: UIDEPTH - 0.4,
            cloudCount: 10,
            cellSizePx: 6,
            cellWorldSize: SQUARESIZE
        });
        this.overviewShoreWaves?.destroy?.();
        this.overviewShoreWaves = new OverviewShoreWaves(this, {
            depth: UIDEPTH - 1.15,
            maxOffsetPx: 14,
            pulseCyclesPerSec: 0.50,
            rebuildIntervalMs: 900,
            getGrid: () => this.gridData || GameMap.grid
        });

        this._setOceanBackdropMode(this.zoomMixer?.mode || "detailed");

        this._trackScaleResize(({ width, height }) => {
            this.oceanBackdropBase?.setSize(width, height);
            this.oceanBackdropGradient?.setDisplaySize(width, height);
            this.overviewOceanWaves?.resize?.();
        });
    }

    _setOceanBackdropMode(mode = "detailed") {
        const isOverview = mode === "overview";
        if (this._oceanMode === mode) return;
        this._oceanMode = mode;

        this.oceanBackdropGradient?.setAlpha(isOverview ? 0.44 : 0.30);
        this.overviewOceanWaves?.setMode?.(mode);
        this.overviewCloudLayer?.setMode?.(mode);
    }

    _updateOceanBackdrop() {
        const inMenuOverview = !!(this._menuModeActive || this.isMainMenuPreview || this._pendingMenuPhase);
        const mode = inMenuOverview ? "overview" : (this.zoomMixer?.mode || "detailed");
        this._setOceanBackdropMode(mode);
        this.overviewOceanWaves?.update?.(mode, this.time?.now || 0);
        this.overviewCloudLayer?.update?.(mode);
        this.overviewShoreWaves?.update?.(inMenuOverview ? "detailed" : mode, this.time?.now || 0);
    }

    create() {
        this._enableGlobalTextFont();
        this._createOceanBackdrop();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this._cleanupForSceneShutdown();
        });
        this.createAnim('water')
        this.createAnim('crops',0,1)
        this.createAnim('char', -1, 5, 3)
        createPlayerPortraitAnimations(this);
        createTutorialAnimations(this);
        if (!this.anims.exists('rock_projectile_spin')) {
            this.anims.create({
                key: 'rock_projectile_spin',
                frames: this.anims.generateFrameNumbers('rock_projectile', { start: 0, end: 2 }),
                frameRate: 10,
                repeat: -1
            });
        }
        ZoomMixer.initMapIconContainer();
        this.wallDestroyer = new WallDestroyController(this);

        Player.init(this);
        Player.createAnim('oven_idle', 'clayOven', 0, 0, -1, 1);
        Player.createAnim('oven_cooking', 'clayOven', 1, 2, -1, 3);
        this._pendingMenuPhase = true;
        if (!this.scene.isActive('GameUIScene')) {
            this.scene.launch('GameUIScene', { worldSceneKey: 'mapView' });
        }
        this.uiScene = this.scene.get('GameUIScene');
        this.uiScene?.bindWorldScene?.(this);
        SaveManager.attachScene(this);
        this.achievementSystem = new AchievementSystem(this);
        this.tutorialManager = new TutorialManager(this);
        this.events.on("tutorial:completed", () => {
            this.time?.delayedCall?.(280, () => this._tryPresentPostTutorialTownXpRewards());
        });
        this.events.on('store:unlock-changed', () => SaveManager.queueAutosave('store_unlock'));
        this.events.on("storage:removed", (storage) => {
            if (storage?.teamNumber === 1) {
                this._pendingStorageCollapseSource = storage;
                this._queueStorageCollapseEvaluation(storage);
            }
        });
        this.cameras.main.useBounds = false;
        this._applyStartupCameraPose({ applyZoom: true });
        this._trackScaleResize(() => {
            if (this._startupCameraLocked || this._menuModeActive || this.isMainMenuPreview || this._pendingMenuPhase || this._continueCameraLockActive) {
                this._applyStartupCameraPose();
            }
        });
        this._trackScaleResize(() => {
            if (this._menuModeActive || this.isMainMenuPreview || this._pendingMenuPhase || this._continueCameraLockActive) {
                return;
            }
            this.zoomMixer?.handleResize?.();
        });
        if (this.uiScene?.sys?.isActive?.() && !this.menu?.active) {
            MainMenu.startMenuPhase();
        }
        setupTownBoundsToggle(this);
        this.cursors = this.input.keyboard.createCursorKeys();
        // Add collision between the cube and the barriers
        // this.physics.add.collider(characters, GameMap.barrier);
        // this.physics.add.overlap(Player.characters, Player.characters, Player.handlePlayerCollision, null, this);
        this.physics.add.collider(
            Player.characters,
            Projectile.projectileGroup,
            Projectile.handleCollision,
            (player, bullet) => !bullet?.deferImpactUntilEnd && bullet.team !== player.body.team, // Only collide if teams are different
            this
        );

        GameMap.structureBarrier = this.physics.add.staticGroup(); // structures (walls/buildings) persistent
        this.physics.add.collider(
            Projectile.projectileGroup,
            GameMap.structureBarrier,
            Projectile.handleStructureCollision,
            (projectile, structureHit) =>
                !projectile?.deferImpactUntilEnd &&
                Projectile.shouldCollideWithStructure(projectile, structureHit),
            this
        );

        this.cursors = this.input.keyboard.createCursorKeys();
        this.towerPressureController = new TowerPressureController(this, { /* your opts */ });
        // explosion spritesheet (single row, 5 frames)
        this.createAnim('explosions', 0, 10, 4);

        // stage completion lock
        this.stageCompleteLock = false;
        this._movementLocked = false;

        this.registry.set('image','init');
        this._registryImageChangedHandler = (parent, value) => {
            console.log(`Registry key 'image' updated to value:`, value);
            const item = TILE_TYPES[value];
            Turret.cancelPlacement();
            if(item.spread){
                // this.gridPlace = true;
            }
            else if(item == TILE_TYPES.turret){
                Turret.beginPlacing(item, 1)
            }
            else if(item == TILE_TYPES.clayOven){
                ClayOven.beginPlacing(this, 1)
            }
            else{
                GameMap.beginPlacing(item)
            }
        };
        this.registry.events.on('changedata-image', this._registryImageChangedHandler);

        // Store references to keys
        this.keys = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
            arrowUp: Phaser.Input.Keyboard.KeyCodes.UP,
            arrowDown: Phaser.Input.Keyboard.KeyCodes.DOWN,
            arrowLeft: Phaser.Input.Keyboard.KeyCodes.LEFT,
            arrowRight: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        });

        this.input.keyboard.on('keydown-ESC', () => {
            this.selectMode = true
            if (Turret.isPlacing) {
                Turret.cancelPlacement();
                return;
            }
            // Farm mode: ESC cycles (end->start) then (start->exit farm mode)
            if (!this.farmMode && !this.farmSelectActive) return;

            // If selecting: step back through phases
            if (this.farmSelectActive) {
                if (this.farmSelectPhase === 2) {
                    // back to phase 1
                    this.farmSelectPhase = 1;
                    this.startCell = null;
                    this.endCell = null;
                    this.graphics.clear();
                    if (this.farmHover) this.farmHover.setVisible(false);
                    this.setFarmInstructionPhase1();
                    return;
                }
                if (this.farmSelectPhase === 1) {
                    // exit farm mode entirely
                    this.cancelFarmSelection(true);
                    return;
                }
            }

            // if farmMode is on but selection not active, still exit
            this.cancelFarmSelection(true);
            if(this.gridPlace){
                this.gridPlace = false
            }
            else if(Turret.isPlacing){
                Turret.cancelPlacement();
            }
            else{
                GameMap.isPlacing = false; // Exit placing mode
                GameMap.placingItem.destroy(); // Clear placing item
                GameMap.placingItem = null;
            }
        });
        this.clock = new Clock(this);
        this._currentPhaseKey = this.clock.getPhaseKey?.() || this._currentPhaseKey;
        this.clock.paused = true;
        this.applySimulationSpeed(true);
        this._maybeShowDebugMilitiaLevel3Unlock();
        this.graphics = this.add.graphics(); // Graphics object for drawing the selection outline
        this._setupSelectionDragZone();
        this.startCell = null; // Start cell (grid coordinates)
        this.endCell = null; // End cell (grid coordinates)
        // Farm mode UX helpers (world hover + UI banner)
        this.farmHover = this.add.graphics()
            .setVisible(false)
            .setDepth(UIDEPTH);


        this.ensureFarmInstructionUI();

        // inside create() or constructor after scene exists:
        this.wallPlacer = new WallPlacementController(this);

        // pointer move
        this.input.on("pointermove", (pointer) => {
            this._updateForagerRouteHoverCardPosition(pointer);
            this._updateCropHoverCardPosition(pointer);
            this._updateWallHoverCardPosition(pointer);
            if (this.marketCardUseController?.active) this.marketCardUseController.onPointerMove(pointer);
            if (this.wallPlacer?.active) this.wallPlacer.onPointerMove(pointer);
            if (this.wallDestroyer?.active) this.wallDestroyer.onPointerMove(pointer);
        });

        // ESC
        this.input.keyboard.on("keydown-ESC", () => {
            if (this.marketCardUseController?.active) {
                this.marketCardUseController.cancel();
                return;
            }
            if (this.wallPlacer?.active) this.wallPlacer.onEsc();
            if (this.wallDestroyer?.active) this.wallDestroyer.onEsc();
        });

        this.keyboardSpeed = 10;
        this.input.keyboard.on('keydown-K', () => {
            this.selectingEnemies = true;
            this.enemySelectStart = this.input.activePointer.positionToCamera(this.cameras.main).clone();
            if (this.enemySelectionRect) this.enemySelectionRect.destroy();
            this.enemySelectionRect = this.add.graphics().setDepth(1000);
        });
        // Add a mouse click listener
        this.input.on('pointerdown', (pointer) => {

            let cam = this.cameras.main;
            const clickedOnPlayer = this.input.manager.hitTest(pointer, Player.characters.getChildren(), cam);
            const clickedInteractiveWorldObject = this.input.manager
                .hitTest(pointer, this.children.list, cam)
                .some((obj) => obj?.input?.enabled && obj !== this._selectionDragZone && !obj?.isHoverOnlyWorldObject);
            if (this.isSimulationPaused()) return;
            if (this._trackpadTapDragActive && pointer.button === 0) {
                if (this._trackpadTapDragMoved) {
                    this._finalizeTrackpadTapDrag();
                    return;
                }
                this._cancelTrackpadTapDrag();
            }
            if (this.marketCardUseController?.active && pointer.button === 0) {
                if (this.marketCardUseController.onPointerDown(pointer)) return;
            }
            // ✅ WALL MODE CONSUMES INPUT
            if (this.wallPlacer?.active && pointer.button === 0) {
                this.wallPlacer.onClick(pointer);
                return; // IMPORTANT: prevent fall-through into selection/move/build/etc
            }
            // ✅ DESTROY MODE CONSUMES INPUT
            if (this.wallDestroyer?.active && pointer.button === 0) {
                this.wallDestroyer.onClick(pointer);
                return;
            }
            if (clickedOnPlayer.length > 0) {
                console.log("hit player");
                return;
            }
            // 🔵 GUARD / SURVEY MODE: if PlayerTab put us into guardPlacement, consume this click
            if (this.guardPlacement && this.guardPlacement.active && pointer.button === 0) {
                const gridX = Math.floor(pointer.worldX / SQUARESIZE);
                const gridY = Math.floor(pointer.worldY / SQUARESIZE);
                const worldX = gridX * SQUARESIZE + SQUARESIZE / 2;
                const worldY = gridY * SQUARESIZE + SQUARESIZE / 2;

                Player.setGuardPost(this.guardPlacement.troop, worldX, worldY);

                this.guardPlacement.active = false;
                this.guardPlacement.troop = null;
                this.input.setDefaultCursor('default');

                return;
            }
            // 🌾 FARM MODE: laptop-friendly 2-click plot selection (left click)
            else if (this.farmMode && pointer.button === 0) {
                this.handleFarmPointerDown(pointer);
                return;
            }
            else if(GameMap.placingItem && !GameMap.placingItem.blocked){
                const items = TILE_TYPES[this.registry.get('image')]
                if (!items) {
                    return;
                }
                let x = Math.floor((pointer.x + cam.scrollX) / SQUARESIZE);
                let y = Math.floor((pointer.y + cam.scrollY) / SQUARESIZE);
                if(items == TILE_TYPES.player){GameMap.handleMapClick(x,y,items)}
                else{
                    buildingManager.queueBlockBuildTask({
                        type: items,
                        x: x - Math.floor(items.lenX/2),
                        y: y - Math.floor(items.lenY/2),
                        duration: 100,
                        assigned: 0
                    }, 1);
                }
            }
            else if(Turret.isPlacing){
                const items = itemTab.itemValues(this.registry.get('image'))
                if(items?.price && this.money < items.price){
                    showAlert(this, 'insufficient Funds', "#ff0000");
                    return;
                }
                const turret = Turret.handlePlacementClick(pointer, items, 1)
                if(turret){
                    if(items.price){
                        this.updateMoney(-1*items.price)
                    }
                    Turret.beginPlacing(items, 1)
                }
            }
            else if (
                pointer.button === 0 &&
                OrderRunner.hasPendingGatherPlacement() &&
                Player.selected.length > 0 &&
                !this.gridPlace &&
                !this.harvestMode &&
                !this.seedGridMode &&
                !this.farmMode &&
                !this.isBrushMode &&
                (this.breakItems?.text ?? "") != 'Place'
            ) {
                if (clickedInteractiveWorldObject) {
                    return;
                }
                const placed = OrderRunner.issuePendingGatherPlacement(Player.selected, pointer.worldX, pointer.worldY);
                if (placed) return;
            }
            else if (this._tryIssueOverviewForagerRoute(pointer, cam)) {
                return;
            }
            else if (
                this._canUseSelectionDrag(pointer, clickedInteractiveWorldObject, clickedOnPlayer)
            ) {
                this._armSelectionDrag(pointer);
                return;
            }
            else if (
                pointer.button === 0 &&
                !clickedInteractiveWorldObject &&
                Player.selected.length === 0 &&
                this._canUseTrackpadDrag() &&
                this._isDoublePrimaryPointerDown(pointer)
            ) {
                this._armTrackpadTapDrag(pointer);
                return;
            }
            else if (
                pointer.button === 2 &&
                !clickedInteractiveWorldObject &&
                Player.selected.length > 0 &&
                !this.gridPlace &&
                !this.harvestMode &&
                !this.seedGridMode &&
                !this.farmMode &&
                !this.isBrushMode &&
                (this.breakItems?.text ?? "") != 'Place'
            ){
                let x = pointer.worldX;
                let y = pointer.worldY;

                let posX = Math.floor(x / SQUARESIZE);
                let posY = Math.floor(y / SQUARESIZE);

                // this._showWorldDebugText(posX, posY);

                const formationSpots = Player.getFormation(posX,posY,Player.selected.length);
                let issuedMoveOrder = false;
                OrderRunner.cancelOrders(Player.selected);
                Player.selected.forEach((troop, index) => {
                    if(!troop.active){Player.selected.splice(index, 1); return;}
                    Teams.movePlayerState(troop, CONTROL_STATES.USER_MODE)
                    let troopX = Math.floor(troop.body.x / SQUARESIZE);
                    let troopY = Math.floor(troop.body.y / SQUARESIZE);
                    const spot = formationSpots[index];
                    if (!spot) return;
                    let [targetX, targetY] = spot;
                    const variance = 4;
                    targetX += Phaser.Math.RND.between(-variance, variance);
                    targetY += Phaser.Math.RND.between(-variance, variance);
                    if(GameMap.navGrid[troopY][troopX] == 0){
                        let [newX, newY] = Player.findBestStartPos(troop, troopX, troopY);
                        if (newX === -1) {
                            console.log("No valid start tile nearby");
                            return;
                        } else {
                            console.log("New valid tile:", newX, newY);
                            troopX = newX
                            troopY = newY
                        }
                    }
                    else if(GameMap.navGrid[posY][posX] == 0){
                        console.log("end pos is at blocked grid");
                        return;
                    }
                    troop.roam = false;
                    const moved = Player.moveTo(
                        troop,
                        GameMap.navMesh.findPath(
                            { x: troopX * SQUARESIZE, y: troopY * SQUARESIZE },
                            { x: targetX + SQUARESIZE / 2, y: targetY + SQUARESIZE / 2 }
                        )
                    );
                    issuedMoveOrder = issuedMoveOrder || !!moved;
                });
                if (issuedMoveOrder && Player.selected.length) Player.clearSelection();
            }
            else if((this.gridPlace || this.selectMode) && pointer.button == 2){
                const gridX = Math.floor(pointer.worldX / SQUARESIZE);
                const gridY = Math.floor(pointer.worldY / SQUARESIZE);
                this.pointerMoving = true;
                // Set the starting cell for selection
                this.startCell = { x: gridX, y: gridY };
                this.endCell = { x: gridX, y: gridY };
            }
            else if(this.isBrushMode && pointer.button == 2){
                this.isBrushActive = true;  
                this.brushTiles = [];
            }
            else if (
                pointer.button === 0 &&
                !clickedInteractiveWorldObject &&
                Player.selected.length > 0 &&
                !this.gridPlace &&
                !this.harvestMode &&
                !this.seedGridMode &&
                !this.farmMode &&
                !this.isBrushMode &&
                (this.breakItems?.text ?? "") != 'Place'
            ){
                Player.clearSelection();
            }
            else if (
                pointer.button === 0 &&
                !clickedInteractiveWorldObject &&
                Player.selected.length === 0 &&
                (this.breakItems?.text ?? "") != 'Place'
            ){
                let x = pointer.worldX;
                let y = pointer.worldY;

                let posX = Math.floor(x / SQUARESIZE) 
                let posY = Math.floor(y / SQUARESIZE)

                // this._showWorldDebugText(posX, posY);
                const formationSpots = Player.getFormation(posX,posY,Player.selected.length);
                let issuedMoveOrder = false;
                OrderRunner.cancelOrders(Player.selected);
                Player.selected.forEach((troop, index) => {
                    if(!troop.active){Player.selected.splice(index, 1); return;}
                    Teams.movePlayerState(troop, CONTROL_STATES.USER_MODE)
                    let troopX = Math.floor(troop.body.x / SQUARESIZE);
                    let troopY = Math.floor(troop.body.y / SQUARESIZE);
                    const spot = formationSpots[index];
                    if (!spot) return; // Not enough available spots
                    let [targetX, targetY] = spot;
                    // 🔥 Add slight pixel variance (±8px)
                    const variance = 4;
                    targetX += Phaser.Math.RND.between(-variance, variance);
                    targetY += Phaser.Math.RND.between(-variance, variance);
                    if(GameMap.navGrid[troopY][troopX] == 0){
                        let [newX, newY] = Player.findBestStartPos(troop, troopX, troopY);
                        if (newX === -1) {
                            console.log("No valid start tile nearby");
                            return;
                        } else {
                            console.log("New valid tile:", newX, newY);
                            troopX = newX
                            troopY = newY
                        }
                    }
                    else if(GameMap.navGrid[posY][posX] == 0){
                        console.log("end pos is at blocked grid");
                        return;
                    }
                    troop.roam = false;
                    const moved = Player.moveTo(
                        troop,
                        GameMap.navMesh.findPath(
                            { x: troopX * SQUARESIZE, y: troopY * SQUARESIZE },
                            { x: targetX + SQUARESIZE / 2, y: targetY + SQUARESIZE / 2 }
                        )
                    );
                    issuedMoveOrder = issuedMoveOrder || !!moved;
                });
                if (issuedMoveOrder && Player.selected.length) Player.clearSelection();
            }
        });
        this.input.on('pointermove', (pointer) => this.onPointerMove(pointer, SQUARESIZE));
        this.input.on('pointerup', (pointer) => this.onPointerUp(pointer));

    }

    handleKeyboardCameraMovement() {
        if (this.stageCompleteLock || this._movementLocked) return;
        const camera = this.cameras.main;
        const dt = (this.game?.loop?.delta || 16.67) / 850;

        if (!this._camPanState) {
            this._camPanState = {
                vx: 0,
                vy: 0
            };
        }

        let inputX = 0;
        let inputY = 0;
        if (this.keys.left.isDown || this.keys.arrowLeft.isDown) inputX -= 1;
        if (this.keys.right.isDown || this.keys.arrowRight.isDown) inputX += 1;
        if (this.keys.up.isDown || this.keys.arrowUp.isDown) inputY -= 1;
        if (this.keys.down.isDown || this.keys.arrowDown.isDown) inputY += 1;

        if (this._startupCameraLocked) {
            const inMenuOverview = !!(this._menuModeActive || this.isMainMenuPreview || this._pendingMenuPhase || this._continueCameraLockActive);
            if (!inMenuOverview) {
                this._startupCameraLocked = false;
            } else if (inputX === 0 && inputY === 0) {
                this._applyStartupCameraPose();
                return;
            } else {
                this._startupCameraLocked = false;
            }
        }

        // Normalize diagonal movement so speed is consistent.
        if (inputX !== 0 && inputY !== 0) {
            const inv = 1 / Math.sqrt(2);
            inputX *= inv;
            inputY *= inv;
        }

        const isOverview = this.zoomMixer?.mode === "overview";
        const accel = isOverview ? 7200 : 2600;          // px/s^2
        const maxSpeed = isOverview ? 2650 : 980;        // px/s
        const dampingPerSec = isOverview ? 11.5 : 9.5;   // higher = quicker stop

        const st = this._camPanState;
        if (inputX !== 0 || inputY !== 0) {
            st.vx += inputX * accel * dt;
            st.vy += inputY * accel * dt;
            const mag = Math.hypot(st.vx, st.vy);
            if (mag > maxSpeed) {
                const s = maxSpeed / mag;
                st.vx *= s;
                st.vy *= s;
            }
        } else {
            const damp = Math.exp(-dampingPerSec * dt);
            st.vx *= damp;
            st.vy *= damp;
            if (Math.abs(st.vx) < 2) st.vx = 0;
            if (Math.abs(st.vy) < 2) st.vy = 0;
        }

        let targetX = camera.scrollX + st.vx * dt;
        let targetY = camera.scrollY + st.vy * dt;

        // Final smoothing pass to reduce micro-jitter.
        const lerp = 1 - Math.exp(-18 * dt);
        camera.scrollX = Phaser.Math.Linear(camera.scrollX, targetX, lerp);
        camera.scrollY = Phaser.Math.Linear(camera.scrollY, targetY, lerp);
    }
    
    onPointerMove(pointer) {
        // Farm mode hover/preview
        // === Farm mode hover / live preview ===
        if (this.farmSelectActive && this.farmSelectPhase === 1) {
            const gridX = Math.floor(pointer.worldX / SQUARESIZE);
            const gridY = Math.floor(pointer.worldY / SQUARESIZE);

            this.graphics.clear();
            if (this.farmHover) {
                this.farmHover.clear();
                this.farmHover.setVisible(false);
            }

            const preview = this.getFarmSelectionPreviewData(gridX, gridX, gridY, gridY);
            this.renderFarmSelectionPreview(preview.cells);
            return;
        }
        else if (this.farmSelectActive && this.farmSelectPhase === 2 && this.startCell) {
            const gridX = Math.floor(pointer.worldX / SQUARESIZE);
            const gridY = Math.floor(pointer.worldY / SQUARESIZE);

            this.endCell = { x: gridX, y: gridY };

            const minX = Math.min(this.startCell.x, this.endCell.x);
            const maxX = Math.max(this.startCell.x, this.endCell.x);
            const minY = Math.min(this.startCell.y, this.endCell.y);
            const maxY = Math.max(this.startCell.y, this.endCell.y);

            const preview = this.getFarmSelectionPreviewData(minX, maxX, minY, maxY);
            this.graphics.clear();
            this.renderFarmSelectionPreview(preview.cells);
            this.setFarmInstructionPhase2(preview);
            return;
        }
        else if (this.isBrushMode && this.isBrushActive) {
            const gridX = Math.floor(pointer.worldX / SQUARESIZE);
            const gridY = Math.floor(pointer.worldY / SQUARESIZE);

            const alreadyExists = this.brushTiles.some(tile => tile.x === gridX && tile.y === gridY);

            if (!alreadyExists && gridX >= 0 && gridX < WORLD_DIMENSIONX && gridY >= 0 && gridY < WORLD_DIMENSIONY) {
                this.brushTiles.push({ x: gridX, y: gridY });

                this.brushGraphics.fillStyle(0x00ff00, 0.5);
                this.brushGraphics.fillRect(
                    gridX * SQUARESIZE,
                    gridY * SQUARESIZE,
                    SQUARESIZE,
                    SQUARESIZE
                ).setDepth(UIDEPTH);
            }
            if (this._trackpadTapDragActive) {
                this._trackpadTapDragMoved = true;
                this._refreshTrackpadTapDragTimer();
            }
        }
        else if (this._trackpadTapDragActive && this._trackpadSelectStartWorld) {
            this._trackpadSelectEndWorld = { x: pointer.worldX, y: pointer.worldY };
            this._drawWorldSelectionOutline(0x00ff00);
            this._trackpadTapDragMoved = true;
            this._refreshTrackpadTapDragTimer();
        }
        else if (this._trackpadTapDragActive && this.startCell) {
            const gridX = Math.floor(pointer.worldX / SQUARESIZE);
            const gridY = Math.floor(pointer.worldY / SQUARESIZE);

            this.endCell = { x: gridX, y: gridY };
            if(GameMap.checkSpreadPosition(this.startCell.x,this.startCell.y,this.endCell.x, this.endCell.y)){
                this.drawSelectionOutline("0xff0000");
            } else{
                this.drawSelectionOutline("0x00ff00");
            }
            this._trackpadTapDragMoved = true;
            this._refreshTrackpadTapDragTimer();
        }
        else if (
            (this._selectionDragPending || this._selectionDragActive) &&
            this._selectionDragPointerId === pointer?.id &&
            pointer?.isDown
        ) {
            const dx = (pointer.x ?? 0) - this._selectionDragStartScreenX;
            const dy = (pointer.y ?? 0) - this._selectionDragStartScreenY;
            const movedFarEnough = ((dx * dx) + (dy * dy)) >= (this._selectionDragDistanceThreshold * this._selectionDragDistanceThreshold);

            if (this._selectionDragPending && movedFarEnough) {
                this._startSelectionDrag(pointer);
            }
            if (this._selectionDragActive) {
                this._updateSelectionDrag(pointer);
            }
        }
        else if (this.startCell) {
            const gridX = Math.floor(pointer.worldX / SQUARESIZE);
            const gridY = Math.floor(pointer.worldY / SQUARESIZE);
    
            // Update the end cell for selection
            this.endCell = { x: gridX, y: gridY };
            if(GameMap.checkSpreadPosition(this.startCell.x,this.startCell.y,this.endCell.x, this.endCell.y)){
                this.drawSelectionOutline("0xff0000");
            } else{
                // Visualize the current selection
                this.drawSelectionOutline("0x00ff00");
            }
        }
    }

    onPointerUp(pointer) {
        if (this.wallDestroyer?.active) {
            this.wallDestroyer.onPointerUp(pointer);
            return;
        }
        if (
            this._trackpadTapDragActive &&
            pointer?.button === 0 &&
            !pointer?._skipTrackpadTapArm
        ) {
            this._rememberPrimaryPointerUp(pointer);
            return;
        }
        this._rememberPrimaryPointerUp(pointer);
        if (this._selectionDragActive && this._selectionDragPointerId === pointer?.id) {
            this._finishSelectionDrag(pointer);
            return;
        }
        if (this._consumeSelectionDragTap(pointer)) {
            return;
        }
        this.graphics.clear();
        // Farm mode uses click-to-pick; don't let pointerup clear our selection state.
        if (this.farmSelectActive) return;
        else if (this.selectingEnemies) {
            const end = this.input.activePointer.positionToCamera(this.cameras.main).clone();
            this.processEnemySelection(this.enemySelectStart, end);
            this.selectingEnemies = false;

            if (this.enemySelectionRect) {
                this.enemySelectionRect.clear();
                this.enemySelectionRect.destroy();
                this.enemySelectionRect = null;
            }

            this.events.emit('mode:completed', 'Attack');
        }
        // else if(this.farmMode){
        //     this.getSelectedCells(1)
        //     this.events.emit('mode:completed', 'Farm');
        // }
        else if(this.harvestMode){
            this.getSelectedCells(2)
        }
        else if(this.seedGridMode){
            this.getSelectedCells(3)
            this.events.emit('mode:completed', 'Seed');
        }
        else if (this.isBrushMode && this.isBrushActive) {
            this.isBrushActive = false
            this.brushGraphics.clear();
            let items = itemTab.itemValues(this.registry.get('image'))
            if(items.price && !this.checkSufficientFunds(items.price*this.brushTiles.length)) return;
            buildingManager.createBuildTileStateArray(this.brushTiles, 1);
            this.brushTiles = [];
            buildingManager.assingTroopsToBuildTile(1);
        }
        else if (this._trackpadSelectStartWorld && this._trackpadSelectEndWorld) {
            Player.handlePlayerSelectWorldRect(this._trackpadSelectStartWorld, this._trackpadSelectEndWorld);
        }
        else if(!this.gridPlace){ // player select
            Player.handlePlayerSelect();
        }
        else if (this.startCell && this.endCell) {
            // Get all selected grid cells
            this.getSelectedCells();
        }
        this.startCell = null;
        this.endCell = null;
        this._clearTrackpadWorldSelection();
        this.pointerMoving = false;
        this._clearTrackpadTapDragTimer();
        this._trackpadTapDragActive = false;
        this._trackpadTapDragMoved = false;
    }

    _canUseTrackpadDrag() {
        return !!(
            this.gridPlace ||
            this.harvestMode ||
            this.seedGridMode ||
            this.isBrushMode
        );
    }

    _isDoublePrimaryPointerDown(pointer) {
        if (pointer.button !== 0) return false;

        const now = this.time?.now ?? performance.now();
        const radiusSq = this._trackpadDoubleClickRadiusPx * this._trackpadDoubleClickRadiusPx;
        const upDx = pointer.x - this._lastPrimaryPointerUpX;
        const upDy = pointer.y - this._lastPrimaryPointerUpY;
        const downDx = pointer.x - this._lastPrimaryPointerDownX;
        const downDy = pointer.y - this._lastPrimaryPointerDownY;
        const matchesPrevUp =
            this._lastPrimaryPointerUpAt > 0 &&
            (now - this._lastPrimaryPointerUpAt) <= this._trackpadDoubleClickWindowMs &&
            ((upDx * upDx + upDy * upDy) <= radiusSq);
        const matchesPrevDown =
            this._lastPrimaryPointerDownAt > 0 &&
            (now - this._lastPrimaryPointerDownAt) <= this._trackpadDoubleClickWindowMs &&
            ((downDx * downDx + downDy * downDy) <= radiusSq);
        const isDouble = matchesPrevUp || matchesPrevDown;

        this._lastPrimaryPointerDownAt = now;
        this._lastPrimaryPointerDownX = pointer.x;
        this._lastPrimaryPointerDownY = pointer.y;

        if (isDouble) {
            this._lastPrimaryPointerDownAt = -Infinity;
            this._lastPrimaryPointerUpAt = -Infinity;
        }

        return isDouble;
    }

    _rememberPrimaryPointerUp(pointer) {
        if (pointer?.button !== 0) return;
        const now = this.time?.now ?? performance.now();
        this._lastPrimaryPointerUpAt = now;
        this._lastPrimaryPointerUpX = pointer.x;
        this._lastPrimaryPointerUpY = pointer.y;
    }

    _isTrackpadWorldSelectionMode() {
        return !!(
            this.selectMode &&
            !this.gridPlace &&
            !this.harvestMode &&
            !this.seedGridMode &&
            !this.farmMode &&
            !this.isBrushMode
        );
    }

    _drawWorldSelectionOutline(color = 0x00ff00) {
        if (!this._trackpadSelectStartWorld || !this._trackpadSelectEndWorld) return;

        const minX = Math.min(this._trackpadSelectStartWorld.x, this._trackpadSelectEndWorld.x);
        const maxX = Math.max(this._trackpadSelectStartWorld.x, this._trackpadSelectEndWorld.x);
        const minY = Math.min(this._trackpadSelectStartWorld.y, this._trackpadSelectEndWorld.y);
        const maxY = Math.max(this._trackpadSelectStartWorld.y, this._trackpadSelectEndWorld.y);

        this.graphics.clear();
        this.graphics.lineStyle(2, color, 1);
        this.graphics.setDepth(UIDEPTH);
        this.graphics.strokeRect(minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY));
    }

    _clearTrackpadWorldSelection() {
        this._trackpadSelectStartWorld = null;
        this._trackpadSelectEndWorld = null;
    }

    _setupSelectionDragZone() {
        if (this._selectionDragZone) {
            this._selectionDragZone.destroy();
            this._selectionDragZone = null;
        }
    }

    _syncSelectionDragZoneBounds() {
        return;
    }

    _canUseSelectionDrag(pointer, clickedInteractiveWorldObject, clickedOnPlayer) {
        return !!(
            pointer?.button === 0 &&
            this.selectMode &&
            !this.gridPlace &&
            !this.harvestMode &&
            !this.seedGridMode &&
            !this.farmMode &&
            !this.isBrushMode &&
            !clickedInteractiveWorldObject &&
            !(clickedOnPlayer?.length > 0) &&
            (this.breakItems?.text ?? "") !== "Place"
        );
    }

    _armSelectionDrag(pointer) {
        this._selectionDragPending = true;
        this._selectionDragActive = false;
        this._selectionDragPointerId = pointer?.id ?? null;
        this._selectionDragStartScreenX = pointer?.x ?? 0;
        this._selectionDragStartScreenY = pointer?.y ?? 0;
        this._trackpadSelectStartWorld = { x: pointer.worldX, y: pointer.worldY };
        this._trackpadSelectEndWorld = { x: pointer.worldX, y: pointer.worldY };
    }

    _startSelectionDrag(pointer) {
        if (!this._selectionDragPending || this._selectionDragPointerId !== pointer?.id) return;
        this._selectionDragPending = false;
        this._selectionDragActive = true;
        this._trackpadSelectStartWorld = this._trackpadSelectStartWorld || { x: pointer.worldX, y: pointer.worldY };
        this._trackpadSelectEndWorld = { x: pointer.worldX, y: pointer.worldY };
        this._drawWorldSelectionOutline(0x00ff00);
    }

    _updateSelectionDrag(pointer) {
        if (!this._selectionDragActive || this._selectionDragPointerId !== pointer?.id) return;
        this._trackpadSelectEndWorld = { x: pointer.worldX, y: pointer.worldY };
        this._drawWorldSelectionOutline(0x00ff00);
    }

    _finishSelectionDrag(pointer) {
        if (!this._selectionDragActive || this._selectionDragPointerId !== pointer?.id) return;
        if (this._trackpadSelectStartWorld && this._trackpadSelectEndWorld) {
            Player.handlePlayerSelectWorldRect(this._trackpadSelectStartWorld, this._trackpadSelectEndWorld);
        }
        this.graphics.clear();
        this._clearTrackpadWorldSelection();
        this._selectionDragPending = false;
        this._selectionDragActive = false;
        this._selectionDragPointerId = null;
        this._selectionDragStartScreenX = 0;
        this._selectionDragStartScreenY = 0;
    }

    _consumeSelectionDragTap(pointer) {
        if (!this._selectionDragPending || this._selectionDragPointerId !== pointer?.id) return false;

        this._selectionDragPending = false;
        this._selectionDragActive = false;
        this._selectionDragPointerId = null;
        this._selectionDragStartScreenX = 0;
        this._selectionDragStartScreenY = 0;
        this._clearTrackpadWorldSelection();
        this.graphics.clear();

        if (Player.selected.length > 0) {
            Player.clearSelection();
        } else if (pointer) {
            const posX = Math.floor(pointer.worldX / SQUARESIZE);
            const posY = Math.floor(pointer.worldY / SQUARESIZE);
            // this._showWorldDebugText(posX, posY);
        }

        return true;
    }

    _showWorldDebugText(posX, posY) {
        this._debugCurrentText?.destroy?.();
        this._debugSelectionCountText?.destroy?.();

        this._debugCurrentText = this.add.text(
            this.cameras.main.width - 150,
            50,
            `(${posX}, ${posY})`,
            { fontSize: '14px', fill: '#ffffff' }
        )
            .setScrollFactor(0)
            .setDepth(UIDEPTH);

        this._debugSelectionCountText = this.add.text(
            this.cameras.main.width - 150,
            65,
            `Selected: ${Player.selected.length}\nnavGird: ${GameMap.navGrid[posY][posX]}\ngrid: ${GameMap.grid[posY][posX]}`,
            { fontSize: '14px', fill: '#ffffff' }
        )
            .setScrollFactor(0)
            .setDepth(UIDEPTH);
    }

    _beginTrackpadDrag(pointer) {
        if (this.isBrushMode) {
            this.isBrushActive = true;
            this.brushTiles = [];
            return;
        }

        this.pointerMoving = true;
        if (this._isTrackpadWorldSelectionMode()) {
            this._trackpadSelectStartWorld = { x: pointer.worldX, y: pointer.worldY };
            this._trackpadSelectEndWorld = { x: pointer.worldX, y: pointer.worldY };
            this.startCell = null;
            this.endCell = null;
            return;
        }

        const gridX = Math.floor(pointer.worldX / SQUARESIZE);
        const gridY = Math.floor(pointer.worldY / SQUARESIZE);
        this.startCell = { x: gridX, y: gridY };
        this.endCell = { x: gridX, y: gridY };
    }

    _armTrackpadTapDrag(pointer) {
        this._trackpadTapDragActive = true;
        this._trackpadTapDragMoved = false;
        this._beginTrackpadDrag(pointer);
        this._refreshTrackpadTapDragTimer();
    }

    _clearTrackpadTapDragTimer() {
        if (this._trackpadTapDragTimer) {
            this._trackpadTapDragTimer.remove(false);
            this._trackpadTapDragTimer = null;
        }
    }

    _refreshTrackpadTapDragTimer() {
        this._clearTrackpadTapDragTimer();
        this._trackpadTapDragTimer = this.time.delayedCall(this._trackpadTapDragIdleMs, () => {
            if (!this._trackpadTapDragActive) return;
            if (this._trackpadTapDragMoved) {
                this._finalizeTrackpadTapDrag();
            } else {
                this._cancelTrackpadTapDrag();
            }
        });
    }

    _cancelTrackpadTapDrag() {
        this._clearTrackpadTapDragTimer();
        this._trackpadTapDragActive = false;
        this._trackpadTapDragMoved = false;
        this.pointerMoving = false;
        if (this.isBrushMode) {
            this.isBrushActive = false;
            this.brushTiles = [];
            this.brushGraphics?.clear?.();
        }
        this.graphics?.clear?.();
        this.startCell = null;
        this.endCell = null;
        this._clearTrackpadWorldSelection();
    }

    _finalizeTrackpadTapDrag() {
        if (!this._trackpadTapDragActive) return;
        this._clearTrackpadTapDragTimer();
        this.onPointerUp({ button: 0, _skipTrackpadTapArm: true });
    }

    _getForagerRouteSelectionProfile() {
        const profile = OrderRunner.getSelectionProfile(Player.selected);
        if (!profile.allForagers) return null;
        if (
            this.gridPlace ||
            this.harvestMode ||
            this.seedGridMode ||
            this.farmMode ||
            this.isBrushMode ||
            this.wallPlacer?.active ||
            this.wallDestroyer?.active ||
            (this.breakItems?.text ?? "") === "Place"
        ) {
            return null;
        }
        return profile;
    }

    _foragerRouteSelectionSignature(profile = this._getForagerRouteSelectionProfile()) {
        if (!profile) return "";
        return profile.troops
            .filter(troop => troop?.active)
            .map(troop => troop.id)
            .sort((a, b) => a - b)
            .join("|");
    }

    _getForagerRouteNodeResourceType(node) {
        return OrderRunner._nodeResourceKind?.(node) || node?.resourceKind || null;
    }

    _getForagerRouteNodes(resourceType = null) {
        const types = resourceType ? [resourceType] : Object.keys(FORAGER_ROUTE_RESOURCE_UI);
        const nodes = [];

        types.forEach((type) => {
            const list = OrderRunner._resourceNodesForType?.(type) || [];
            list.forEach((node) => {
                if (!OrderRunner._nodeActive?.(node)) return;
                if (this._getForagerRouteNodeResourceType(node) !== type) return;
                const health = Math.max(0, Number(node?.health ?? node?.task?.remaining ?? 0));
                if (health <= 0) return;
                nodes.push(node);
            });
        });

        return nodes;
    }

    _isPointerOnOverviewIcon(pointer, cam = this.cameras?.main) {
        const iconChildren = ZoomMixer.mapIconContainer?.list || [];
        if (!iconChildren.length) return false;

        return this.input.manager
            .hitTest(pointer, iconChildren, cam)
            .some((obj) => obj?.input?.enabled);
    }

    _findForagerRouteNodeAtWorld(worldX, worldY) {
        if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return null;

        const gridX = Math.floor(worldX / SQUARESIZE);
        const gridY = Math.floor(worldY / SQUARESIZE);
        let best = null;

        this._getForagerRouteNodes().forEach((node) => {
            const type = this._getForagerRouteNodeResourceType(node);
            if (!FORAGER_ROUTE_RESOURCE_UI[type]) return;

            const gx = Math.floor(Number(node?.gridX ?? node?.task?.x ?? 0));
            const gy = Math.floor(Number(node?.gridY ?? node?.task?.y ?? 0));
            const width = Math.max(1, Math.ceil(Number(
                node?.footprintW ?? node?.resourceTileType?.lenX ?? node?.task?.type?.lenX ?? 1
            )));
            const height = Math.max(1, Math.ceil(Number(
                node?.footprintH ?? node?.resourceTileType?.lenY ?? node?.task?.type?.lenY ?? 1
            )));

            if (gridX < gx || gridX >= gx + width || gridY < gy || gridY >= gy + height) return;

            const center = OrderRunner._nodeWorldCenter?.(node) || {
                x: (gx + width / 2) * SQUARESIZE,
                y: (gy + height / 2) * SQUARESIZE,
            };
            const dx = worldX - center.x;
            const dy = worldY - center.y;
            const score = dx * dx + dy * dy;

            if (!best || score < best.score) {
                best = { node, type, score };
            }
        });

        return best;
    }

    _tryIssueOverviewForagerRoute(pointer, cam = this.cameras?.main) {
        if (this.zoomMixer?.mode !== "overview") return false;
        if (pointer?.button !== 0) return false;
        if (this._isPointerOnOverviewIcon(pointer, cam)) return false;
        if (!this._getForagerRouteSelectionProfile()) return false;

        const match = this._findForagerRouteNodeAtWorld(pointer.worldX, pointer.worldY);
        if (!match) return false;

        return this.tryIssueForagerRouteToNode(match.node, match.type);
    }

    _ensureForagerRouteGlow() {
        if (this.foragerRouteGlow?.scene) return this.foragerRouteGlow;
        this.foragerRouteGlow?.destroy?.();
        this.foragerRouteGlow = this.add.graphics()
            .setDepth(UIDEPTH - 1)
            .setVisible(false);
        return this.foragerRouteGlow;
    }

    _drawForagerRouteAssist(force = false) {
        const profile = this._getForagerRouteSelectionProfile();
        const routeMode = this.zoomMixer?.mode || "detailed";
        const signature = [
            routeMode,
            this._foragerRouteSelectionSignature(profile),
            this.foragerRouteHoverType || "all",
            this.foragerRouteHoverNode ? `${this.foragerRouteHoverNode.gridX},${this.foragerRouteHoverNode.gridY}` : "",
        ].join("|");
        const now = this.time?.now ?? 0;

        if (!force && signature === this._foragerRouteAssistSignature && now - this._foragerRouteLastDrawAt < 180) {
            return;
        }

        this._foragerRouteAssistSignature = signature;
        this._foragerRouteLastDrawAt = now;

        const glow = this._ensureForagerRouteGlow();
        glow.clear();

        if (routeMode === "overview" || !profile) {
            glow.setVisible(false);
            this.hideForagerRouteInstruction();
            return;
        }

        glow.setVisible(true);
        const hoveredType = this.foragerRouteHoverType;
        const nodes = this._getForagerRouteNodes();

        nodes.forEach((node) => {
            const type = this._getForagerRouteNodeResourceType(node);
            const cfg = FORAGER_ROUTE_RESOURCE_UI[type];
            if (!cfg) return;

            const sameType = !hoveredType || hoveredType === type;
            const hoveredNode = this.foragerRouteHoverNode === node;
            const gx = Number(node.gridX ?? node.x ?? 0);
            const gy = Number(node.gridY ?? node.y ?? 0);
            const w = Math.max(1, Number(node.footprintW ?? node.resourceTileType?.lenX ?? 1));
            const h = Math.max(1, Number(node.footprintH ?? node.resourceTileType?.lenY ?? 1));
            const x = gx * SQUARESIZE;
            const y = gy * SQUARESIZE;
            const width = w * SQUARESIZE;
            const height = h * SQUARESIZE;
            const alpha = hoveredNode ? 0.24 : sameType ? 0.13 : 0.045;
            const strokeAlpha = hoveredNode ? 0.95 : sameType ? 0.58 : 0.18;
            const lineWidth = hoveredNode ? 4 : sameType ? 2.4 : 1.4;

            glow.fillStyle(cfg.color, alpha);
            glow.fillRoundedRect(x + 3, y + 3, Math.max(2, width - 6), Math.max(2, height - 6), 8);
            glow.lineStyle(lineWidth, cfg.color, strokeAlpha);
            glow.strokeRoundedRect(x + 2, y + 2, Math.max(2, width - 4), Math.max(2, height - 4), 8);
        });

        if (hoveredType) this.showForagerRouteInstruction(hoveredType);
        else this.hideForagerRouteInstruction();
    }

    updateForagerRouteAssist(force = false) {
        this._drawForagerRouteAssist(force);
    }

    setForagerRouteHover(node, resourceType = null, hovering = true, pointer = null) {
        const hoverPointer = pointer || this.input?.activePointer || null;
        if (!hovering) {
            if (this.foragerRouteHoverNode === node) {
                this.foragerRouteHoverNode = null;
                this.foragerRouteHoverType = null;
                this.updateForagerRouteAssist(true);
            }
            this._hideForagerRouteHoverCard(node);
            return;
        }

        const type = resourceType || this._getForagerRouteNodeResourceType(node);
        if (!FORAGER_ROUTE_RESOURCE_UI[type]) {
            this._hideForagerRouteHoverCard(node);
            return;
        }

        this._showForagerRouteHoverCard(node, type, hoverPointer);

        const profile = this._getForagerRouteSelectionProfile();
        if (!profile) {
            if (this.foragerRouteHoverNode) {
                this.foragerRouteHoverNode = null;
                this.foragerRouteHoverType = null;
                this.updateForagerRouteAssist(true);
            }
            return;
        }

        this.foragerRouteHoverNode = node;
        this.foragerRouteHoverType = type;
        this.updateForagerRouteAssist(true);
    }

    tryIssueForagerRouteToNode(node, resourceType = null) {
        const profile = this._getForagerRouteSelectionProfile();
        if (!profile || !node) return false;

        const type = resourceType || this._getForagerRouteNodeResourceType(node);
        const cfg = FORAGER_ROUTE_RESOURCE_UI[type];
        if (!cfg) return false;

        if (!OrderRunner._nodeActive?.(node) || Math.max(0, Number(node.health ?? node.task?.remaining ?? 0)) <= 0) {
            showAlert(this, `That ${cfg.target} target is already cleared`, "#fecaca");
            return true;
        }

        const tileType = node.resourceTileType || node.task?.type;
        if (tileType && !buildingManager.isBlockAccessible(node.gridX, node.gridY, tileType)) {
            showAlert(this, `Can't reach those ${cfg.target}`, "#fecaca");
            return true;
        }

        const issued = OrderRunner.issueGatherTypeOrder(profile.troops, type, this);
        if (!issued) {
            showAlert(this, `Could not route selected foragers to ${cfg.target}`, "#fecaca");
            return true;
        }

        this.foragerRouteHoverNode = null;
        this.foragerRouteHoverType = null;
        this._hideForagerRouteHoverCard();
        Player.clearSelection();
        this.updateForagerRouteAssist(true);
        this.functionTab?.updateVisuals?.();
        this.uiScene?.functionTab?.updateVisuals?.();
        showAlert(this, cfg.alert, cfg.textColor);
        this.tutorialManager?.notifyAction?.("forager.route", {
            resourceType: type,
            node,
        });
        return true;
    }

    ensureForagerRouteInstructionUI() {
        if (
            this.foragerRouteInstructionUI?.active &&
            this.foragerRouteInstructionBg?.scene &&
            this.foragerRouteInstructionLeft?.scene &&
            this.foragerRouteInstructionTarget?.scene &&
            this.foragerRouteInstructionRight?.scene
        ) {
            return;
        }

        this.foragerRouteInstructionUI?.destroy?.(true);
        this.foragerRouteInstructionUI = this.add.container(this.scale.width / 2, 132)
            .setDepth(UIDEPTH + 42)
            .setScrollFactor(0)
            .setVisible(false)
            .setAlpha(0);

        this.foragerRouteInstructionBg = this.add.graphics().setScrollFactor(0);
        this.foragerRouteInstructionLeft = this.add.text(0, 0, "", {
            fontFamily: "Bungee",
            fontSize: "15px",
            color: "#f6fcff",
            stroke: "#06111b",
            strokeThickness: 4,
        }).setOrigin(0, 0.5).setScrollFactor(0);
        this.foragerRouteInstructionTarget = this.add.text(0, 0, "", {
            fontFamily: "Bungee",
            fontSize: "15px",
            color: "#86efac",
            stroke: "#06111b",
            strokeThickness: 4,
        }).setOrigin(0, 0.5).setScrollFactor(0);
        this.foragerRouteInstructionRight = this.add.text(0, 0, "", {
            fontFamily: "Bungee",
            fontSize: "15px",
            color: "#d9f3ff",
            stroke: "#06111b",
            strokeThickness: 4,
        }).setOrigin(0, 0.5).setScrollFactor(0);

        this.foragerRouteInstructionUI.add([
            this.foragerRouteInstructionBg,
            this.foragerRouteInstructionLeft,
            this.foragerRouteInstructionTarget,
            this.foragerRouteInstructionRight,
        ]);

        this._trackScaleResize(({ width }) => {
            this.foragerRouteInstructionUI?.setX(width / 2);
        });
    }

    _layoutForagerRouteInstruction() {
        const ui = this.foragerRouteInstructionUI;
        if (!ui) return;

        const pad = 7;
        let x = 0;
        this.foragerRouteInstructionLeft.setPosition(x, 0);
        x += this.foragerRouteInstructionLeft.width + pad;
        this.foragerRouteInstructionTarget.setPosition(x, 0);
        x += this.foragerRouteInstructionTarget.width + pad;
        this.foragerRouteInstructionRight.setPosition(x, 0);
        x += this.foragerRouteInstructionRight.width;

        const textWidth = Math.max(1, x);
        const bubbleWidth = Math.max(260, textWidth + 48);
        const bubbleHeight = 42;
        const left = -bubbleWidth / 2;
        const top = -bubbleHeight / 2;

        for (const child of [this.foragerRouteInstructionLeft, this.foragerRouteInstructionTarget, this.foragerRouteInstructionRight]) {
            child.x -= textWidth / 2;
        }

        const bg = this.foragerRouteInstructionBg;
        bg.clear();
        bg.fillStyle(0x031019, 0.28);
        bg.fillRoundedRect(left, top + 5, bubbleWidth, bubbleHeight, 16);
        bg.fillStyle(0x113048, 0.84);
        bg.fillRoundedRect(left, top, bubbleWidth, bubbleHeight, 16);
        bg.fillStyle(0xffffff, 0.10);
        bg.fillRoundedRect(left + 9, top + 6, bubbleWidth - 18, 13, 10);
        bg.lineStyle(2, 0x9edfff, 0.24);
        bg.strokeRoundedRect(left, top, bubbleWidth, bubbleHeight, 16);
        bg.lineStyle(1, 0xffffff, 0.12);
        bg.strokeRoundedRect(left + 1, top + 1, bubbleWidth - 2, bubbleHeight - 2, 15);
    }

    showForagerRouteInstruction(resourceType = null) {
        const profile = this._getForagerRouteSelectionProfile();
        if (!profile) {
            this.hideForagerRouteInstruction();
            return;
        }

        this.ensureForagerRouteInstructionUI();
        const cfg = FORAGER_ROUTE_RESOURCE_UI[resourceType] || null;
        if (cfg) {
            this.foragerRouteInstructionLeft.setText(`${cfg.action} `);
            this.foragerRouteInstructionTarget.setText(cfg.target);
            this.foragerRouteInstructionTarget.setColor(cfg.textColor);
            this.foragerRouteInstructionRight.setText("");
        } else {
            this.foragerRouteInstructionLeft.setText("Route selected foragers");
            this.foragerRouteInstructionTarget.setText("");
            this.foragerRouteInstructionRight.setText("");
        }

        this._layoutForagerRouteInstruction();
        if (!this.foragerRouteInstructionUI.visible) {
            this.foragerRouteInstructionUI.setVisible(true).setAlpha(0).setScale(0.96);
            this.tweens.add({
                targets: this.foragerRouteInstructionUI,
                alpha: 1,
                scaleX: 1,
                scaleY: 1,
                duration: 130,
                ease: "Quad.easeOut",
            });
        }
    }

    _ensureForagerRouteHoverCard() {
        if (
            this.foragerRouteHoverCard?.active &&
            this.foragerRouteHoverCardBg?.scene &&
            this.foragerRouteHoverCardIcon?.scene &&
            this.foragerRouteHoverCardLabel?.scene
        ) {
            return;
        }

        this.foragerRouteHoverCard?.destroy?.(true);
        this.foragerRouteHoverCard = this.add.container(0, 0)
            .setDepth(UIDEPTH + 910)
            .setScrollFactor(0)
            .setVisible(false)
            .setAlpha(0);
        this.foragerRouteHoverCardBg = this.add.graphics().setScrollFactor(0);
        this.foragerRouteHoverCardIcon = this.add.image(0, 0, "woodIcon")
            .setOrigin(0.5)
            .setScrollFactor(0);
        this.foragerRouteHoverCardLabel = this.add.text(0, 0, "", {
            fontFamily: "Barlow Semi Condensed",
            fontSize: "16px",
            fontStyle: "bold",
            color: "#f4fbff",
            stroke: "#06111a",
            strokeThickness: 3,
        }).setOrigin(0, 0.5).setScrollFactor(0);

        this.foragerRouteHoverCard.add([
            this.foragerRouteHoverCardBg,
            this.foragerRouteHoverCardIcon,
            this.foragerRouteHoverCardLabel,
        ]);
    }

    _showForagerRouteHoverCard(node, resourceType, pointer = null) {
        const cfg = FORAGER_ROUTE_RESOURCE_UI[resourceType];
        if (!cfg) return;

        this._ensureForagerRouteHoverCard();
        const card = this.foragerRouteHoverCard;
        const bg = this.foragerRouteHoverCardBg;
        const icon = this.foragerRouteHoverCardIcon;
        const label = this.foragerRouteHoverCardLabel;
        if (!card || !bg || !icon || !label) return;

        const labelText = String(cfg.cardLabel || cfg.target || resourceType).trim();
        const iconKey = String(cfg.cardIcon || "woodIcon");
        const iconSize = 22;
        const gap = 10;
        const padX = 12;
        const padY = 9;

        label.setText(labelText).setColor(cfg.textColor || "#f4fbff");
        if (this.textures.exists(iconKey)) {
            icon.setTexture(iconKey).setVisible(true).setDisplaySize(iconSize, iconSize);
        } else {
            icon.setVisible(false);
        }

        const contentWidth = (icon.visible ? iconSize + gap : 0) + label.width;
        const width = Math.max(118, Math.round(contentWidth + padX * 2));
        const height = Math.max(40, Math.round(Math.max(iconSize, label.height) + padY * 2));
        const radius = 14;

        bg.clear();
        bg.fillStyle(0x102f43, 0.96);
        bg.fillRoundedRect(0, 0, width, height, radius);
        bg.fillStyle(0xffffff, 0.08);
        bg.fillRoundedRect(3, 3, width - 6, Math.max(12, Math.round(height * 0.34)), Math.max(8, radius - 6));
        bg.lineStyle(2, cfg.color ?? 0x9ee7ff, 0.92);
        bg.strokeRoundedRect(0, 0, width, height, radius);
        bg.lineStyle(1, 0xffffff, 0.18);
        bg.strokeRoundedRect(3, 3, width - 6, height - 6, Math.max(8, radius - 4));

        const iconX = padX + (icon.visible ? iconSize / 2 : 0);
        if (icon.visible) {
            icon.setPosition(iconX, height / 2);
        }
        label.setPosition(padX + (icon.visible ? iconSize + gap : 0), height / 2);

        this.foragerRouteHoverCardNode = node;
        this.foragerRouteHoverCardSize = { width, height };
        card.setVisible(true).setAlpha(1);
        this._updateForagerRouteHoverCardPosition(pointer);
    }

    _hideForagerRouteHoverCard(node = null) {
        if (node && this.foragerRouteHoverCardNode !== node) return;
        this.foragerRouteHoverCardNode = null;
        this.foragerRouteHoverCard?.setVisible(false)?.setAlpha(0);
    }

    _updateForagerRouteHoverCardPosition(pointer = null) {
        const card = this.foragerRouteHoverCard;
        if (!card?.visible) return;

        const node = this.foragerRouteHoverCardNode;
        const nodeAlive = !!node && node.active !== false && node.sprite?.active !== false && node.container?.active !== false;
        if (!nodeAlive) {
            this._hideForagerRouteHoverCard();
            return;
        }

        const p = pointer || this.input?.activePointer || null;
        if (!p) return;

        const width = Math.max(0, Number(this.foragerRouteHoverCardSize?.width || 0));
        const height = Math.max(0, Number(this.foragerRouteHoverCardSize?.height || 0));
        const margin = 10;
        let x = Number(p.x || 0) + 18;
        let y = Number(p.y || 0) - height - 14;

        if (x + width > this.scale.width - margin) {
            x = Math.max(margin, Number(p.x || 0) - width - 16);
        }
        if (y < margin) {
            y = Math.min(this.scale.height - height - margin, Number(p.y || 0) + 18);
        }

        card.setPosition(
            Phaser.Math.Clamp(x, margin, Math.max(margin, this.scale.width - width - margin)),
            Phaser.Math.Clamp(y, margin, Math.max(margin, this.scale.height - height - margin)),
        );
    }

    _ensureCropHoverCard() {
        if (
            this.cropHoverCard?.active &&
            this.cropHoverCardBg?.scene &&
            this.cropHoverCardIcon?.scene &&
            this.cropHoverCardLabel?.scene
        ) {
            return;
        }

        this.cropHoverCard?.destroy?.(true);
        this.cropHoverCard = this.add.container(0, 0)
            .setDepth(UIDEPTH + 912)
            .setScrollFactor(0)
            .setVisible(false)
            .setAlpha(0)
            .setScale(0.94);
        this.cropHoverCardBg = this.add.graphics().setScrollFactor(0);
        this.cropHoverCardIcon = this.add.sprite(0, 0, "crops", 1)
            .setOrigin(0.5)
            .setScrollFactor(0);
        this.cropHoverCardLabel = this.add.text(0, 0, "", {
            fontFamily: "Barlow Semi Condensed",
            fontSize: "15px",
            fontStyle: "bold",
            color: "#f7fbff",
            stroke: "#06111a",
            strokeThickness: 3,
            align: "left",
            lineSpacing: 2,
        }).setOrigin(0, 0.5).setScrollFactor(0);

        this.cropHoverCard.add([
            this.cropHoverCardBg,
            this.cropHoverCardIcon,
            this.cropHoverCardLabel,
        ]);
    }

    _resolveCropHoverTarget(target = null) {
        const sprite = target?.sprite || target || null;
        if (!sprite?.scene || sprite.active === false) return null;
        return sprite;
    }

    _resolveCropHoverState(target = null) {
        const sprite = this._resolveCropHoverTarget(target);
        if (!sprite) return null;

        const gx = Number(sprite.cropGridX);
        const gy = Number(sprite.cropGridY);
        const teamNumber = String(sprite.cropTeamNumber ?? "1");
        const liveCrop = Number.isFinite(gx) && Number.isFinite(gy)
            ? Teams.getCropAt(gx, gy, teamNumber)
            : null;

        if (liveCrop) {
            if (liveCrop.sprite !== sprite) liveCrop.sprite = sprite;
            return liveCrop;
        }

        const rawFrame = Number(sprite.frame?.name ?? sprite.frame?.index ?? 0);
        const frame = Number.isFinite(rawFrame) ? rawFrame : 0;
        return {
            sprite,
            x: gx,
            y: gy,
            teamNumber,
            hasSeed: frame > 0,
            growthStage: Math.max(0, frame - 1),
            dailyWatered: false,
        };
    }

    _describeCropHover(crop = null) {
        const seeded = crop?.hasSeed !== false;
        const watered = !!crop?.dailyWatered;
        const maxStage = Math.max(0, Number(MAX_CROP_GROWTH_STAGE || 0));
        const safeStage = Math.max(0, Math.min(maxStage, Number(crop?.growthStage || 0)));
        const totalStages = maxStage + 1;

        if (!seeded) {
            return {
                frame: 0,
                accentColor: 0xa7b7c9,
                text: "Crop Plot\nUnseeded • needs seeds\nWatered today: No",
            };
        }

        const ready = safeStage >= maxStage;
        return {
            frame: 1 + safeStage,
            accentColor: ready ? 0xfacc15 : (watered ? 0x86efac : 0x93c5fd),
            text: ready
                ? `Crop Plot\nStage ${safeStage + 1}/${totalStages} • Ready\nWatered today: ${watered ? "Yes" : "No"}`
                : `Crop Plot\nStage ${safeStage + 1}/${totalStages}\nWatered today: ${watered ? "Yes" : "No"}`,
        };
    }

    showCropHoverCard(target, pointer = null) {
        const crop = this._resolveCropHoverState(target);
        if (!crop) return;

        this._ensureCropHoverCard();
        const card = this.cropHoverCard;
        const bg = this.cropHoverCardBg;
        const icon = this.cropHoverCardIcon;
        const label = this.cropHoverCardLabel;
        if (!card || !bg || !icon || !label) return;

        const summary = this._describeCropHover(crop);
        const iconSize = 24;
        const gap = 11;
        const padX = 13;
        const padY = 10;

        label.setText(summary.text).setColor("#f7fbff");
        icon.setTexture("crops", summary.frame).setVisible(true).setDisplaySize(iconSize, iconSize);

        const contentWidth = iconSize + gap + label.width;
        const width = Math.max(170, Math.round(contentWidth + padX * 2));
        const height = Math.max(58, Math.round(Math.max(iconSize, label.height) + padY * 2));
        const radius = 15;

        bg.clear();
        bg.fillStyle(0x0d2534, 0.96);
        bg.fillRoundedRect(0, 0, width, height, radius);
        bg.fillStyle(0xffffff, 0.08);
        bg.fillRoundedRect(3, 3, width - 6, Math.max(12, Math.round(height * 0.34)), Math.max(8, radius - 6));
        bg.lineStyle(2, summary.accentColor, 0.9);
        bg.strokeRoundedRect(0, 0, width, height, radius);
        bg.lineStyle(1, 0xffffff, 0.18);
        bg.strokeRoundedRect(3, 3, width - 6, height - 6, Math.max(8, radius - 4));

        icon.setPosition(padX + (iconSize / 2), height / 2);
        label.setPosition(padX + iconSize + gap, height / 2);

        const targetSprite = crop.sprite || this._resolveCropHoverTarget(target);
        const sameTarget = this.cropHoverCardTarget === targetSprite;
        this.cropHoverCardTarget = targetSprite;
        this.cropHoverCardSize = { width, height };

        this.tweens.killTweensOf(card);
        if (!card.visible || !sameTarget) {
            card.setVisible(true).setAlpha(0).setScale(0.94);
            this.tweens.add({
                targets: card,
                alpha: 1,
                scaleX: 1,
                scaleY: 1,
                duration: 120,
                ease: "Quad.easeOut",
            });
        } else {
            card.setVisible(true).setAlpha(1).setScale(1);
        }

        this._updateCropHoverCardPosition(pointer);
    }

    hideCropHoverCard(target = null, { immediate = false } = {}) {
        const targetSprite = this._resolveCropHoverTarget(target);
        if (targetSprite && this.cropHoverCardTarget !== targetSprite) return;

        const card = this.cropHoverCard;
        if (!card) return;

        this.cropHoverCardTarget = null;
        this.tweens.killTweensOf(card);

        if (immediate || !card.visible) {
            card.setVisible(false).setAlpha(0).setScale(0.94);
            return;
        }

        this.tweens.add({
            targets: card,
            alpha: 0,
            scaleX: 0.95,
            scaleY: 0.95,
            duration: 100,
            ease: "Quad.easeIn",
            onComplete: () => {
                if (!this.cropHoverCardTarget) {
                    card.setVisible(false).setScale(0.94);
                }
            },
        });
    }

    _updateCropHoverCardPosition(pointer = null) {
        const card = this.cropHoverCard;
        if (!card?.visible) return;

        const target = this.cropHoverCardTarget;
        if (!target?.scene || target.active === false) {
            this.hideCropHoverCard(target, { immediate: true });
            return;
        }

        const p = pointer || this.input?.activePointer || null;
        if (!p) return;

        const width = Math.max(0, Number(this.cropHoverCardSize?.width || 0));
        const height = Math.max(0, Number(this.cropHoverCardSize?.height || 0));
        const margin = 10;
        let x = Number(p.x || 0) + 18;
        let y = Number(p.y || 0) - height - 16;

        if (x + width > this.scale.width - margin) {
            x = Math.max(margin, Number(p.x || 0) - width - 16);
        }
        if (y < margin) {
            y = Math.min(this.scale.height - height - margin, Number(p.y || 0) + 18);
        }

        card.setPosition(
            Phaser.Math.Clamp(x, margin, Math.max(margin, this.scale.width - width - margin)),
            Phaser.Math.Clamp(y, margin, Math.max(margin, this.scale.height - height - margin)),
        );
    }

    _ensureWallHoverCard() {
        if (
            this.wallHoverCard?.active &&
            this.wallHoverCardBg?.scene &&
            this.wallHoverCardIcon?.scene &&
            this.wallHoverCardLabel?.scene
        ) {
            return;
        }

        this.wallHoverCard?.destroy?.(true);
        this.wallHoverCard = this.add.container(0, 0)
            .setDepth(UIDEPTH + 913)
            .setScrollFactor(0)
            .setVisible(false)
            .setAlpha(0)
            .setScale(0.94);
        this.wallHoverCardBg = this.add.graphics().setScrollFactor(0);
        this.wallHoverCardIcon = this.add.sprite(0, 0, "wall_interior", 0)
            .setOrigin(0.5)
            .setScrollFactor(0);
        this.wallHoverCardLabel = this.add.text(0, 0, "", {
            fontFamily: "Barlow Semi Condensed",
            fontSize: "15px",
            fontStyle: "bold",
            color: "#f7fbff",
            stroke: "#06111a",
            strokeThickness: 3,
            align: "left",
            lineSpacing: 2,
        }).setOrigin(0, 0.5).setScrollFactor(0);

        this.wallHoverCard.add([
            this.wallHoverCardBg,
            this.wallHoverCardIcon,
            this.wallHoverCardLabel,
        ]);
    }

    _resolveWallHoverTarget(target = null) {
        const sprite = target?.sprite || target || null;
        if (!sprite?.scene || sprite.active === false) return null;
        return sprite;
    }

    _resolveWallHoverState(target = null) {
        const sprite = this._resolveWallHoverTarget(target);
        if (!sprite) return null;

        const wall = sprite.wallRef || target?.wallRef || (target?.sprite === sprite ? target : null);
        if (!wall || wall.active === false) return null;
        return wall;
    }

    _describeWallHover(wall = null) {
        const materialLabel = wall?.material === "wood" ? "Wood" : "Stone";
        const objectLabel = wall?.isDoor ? "Door" : "Wall";
        const maxHp = Math.max(1, Math.round(Number(wall?.maxHp ?? wall?.maxHealth ?? 1) || 1));
        const hp = Math.max(0, Math.round(Number(wall?.hp ?? wall?.health ?? maxHp) || 0));
        const ratio = Phaser.Math.Clamp(hp / maxHp, 0, 1);
        const healthLabel = ratio <= 0.33 ? "Critical" : ratio <= 0.66 ? "Damaged" : "Healthy";
        const accentColor = ratio <= 0.33
            ? 0xf87171
            : ratio <= 0.66
                ? 0xfbbf24
                : (wall?.material === "wood" ? 0xd08b45 : 0x94a3b8);
        const sprite = wall?.sprite || null;
        const rawFrame = Number(sprite?.frame?.name ?? sprite?.frame?.index ?? (wall?.phase ?? 0));
        const frame = Number.isFinite(rawFrame) ? rawFrame : 0;

        return {
            textureKey: wall?.isDoor ? wall?.doorKey : wall?.baseKey,
            fallbackTextureKey: sprite?.texture?.key,
            frame,
            accentColor,
            text: `${materialLabel} ${objectLabel}\nHealth: ${hp}/${maxHp} | ${healthLabel}`,
        };
    }

    showWallHoverCard(target, pointer = null) {
        const wall = this._resolveWallHoverState(target);
        if (!wall) return;

        this._ensureWallHoverCard();
        const card = this.wallHoverCard;
        const bg = this.wallHoverCardBg;
        const icon = this.wallHoverCardIcon;
        const label = this.wallHoverCardLabel;
        if (!card || !bg || !icon || !label) return;

        const summary = this._describeWallHover(wall);
        const iconSize = 24;
        const gap = 11;
        const padX = 13;
        const padY = 10;

        label.setText(summary.text).setColor("#f7fbff");
        const iconKey = summary.textureKey || summary.fallbackTextureKey;
        if (iconKey && this.textures.exists(iconKey)) {
            icon.setTexture(iconKey, summary.frame).setVisible(true).setDisplaySize(iconSize, iconSize);
        } else {
            icon.setVisible(false);
        }

        const contentWidth = (icon.visible ? iconSize + gap : 0) + label.width;
        const width = Math.max(172, Math.round(contentWidth + padX * 2));
        const height = Math.max(58, Math.round(Math.max(icon.visible ? iconSize : 0, label.height) + padY * 2));
        const radius = 15;

        bg.clear();
        bg.fillStyle(0x0d2534, 0.96);
        bg.fillRoundedRect(0, 0, width, height, radius);
        bg.fillStyle(0xffffff, 0.08);
        bg.fillRoundedRect(3, 3, width - 6, Math.max(12, Math.round(height * 0.34)), Math.max(8, radius - 6));
        bg.lineStyle(2, summary.accentColor, 0.9);
        bg.strokeRoundedRect(0, 0, width, height, radius);
        bg.lineStyle(1, 0xffffff, 0.18);
        bg.strokeRoundedRect(3, 3, width - 6, height - 6, Math.max(8, radius - 4));

        if (icon.visible) {
            icon.setPosition(padX + (iconSize / 2), height / 2);
        }
        label.setPosition(padX + (icon.visible ? iconSize + gap : 0), height / 2);

        const targetSprite = wall.sprite || this._resolveWallHoverTarget(target);
        const sameTarget = this.wallHoverCardTarget === targetSprite;
        this.wallHoverCardTarget = targetSprite;
        this.wallHoverCardSize = { width, height };

        this.tweens.killTweensOf(card);
        if (!card.visible || !sameTarget) {
            card.setVisible(true).setAlpha(0).setScale(0.94);
            this.tweens.add({
                targets: card,
                alpha: 1,
                scaleX: 1,
                scaleY: 1,
                duration: 120,
                ease: "Quad.easeOut",
            });
        } else {
            card.setVisible(true).setAlpha(1).setScale(1);
        }

        this._updateWallHoverCardPosition(pointer);
    }

    hideWallHoverCard(target = null, { immediate = false } = {}) {
        const targetSprite = this._resolveWallHoverTarget(target);
        if (targetSprite && this.wallHoverCardTarget !== targetSprite) return;

        const card = this.wallHoverCard;
        if (!card) return;

        this.wallHoverCardTarget = null;
        this.tweens.killTweensOf(card);

        if (immediate || !card.visible) {
            card.setVisible(false).setAlpha(0).setScale(0.94);
            return;
        }

        this.tweens.add({
            targets: card,
            alpha: 0,
            scaleX: 0.95,
            scaleY: 0.95,
            duration: 100,
            ease: "Quad.easeIn",
            onComplete: () => {
                if (!this.wallHoverCardTarget) {
                    card.setVisible(false).setScale(0.94);
                }
            },
        });
    }

    _updateWallHoverCardPosition(pointer = null) {
        const card = this.wallHoverCard;
        if (!card?.visible) return;

        const target = this.wallHoverCardTarget;
        if (!target?.scene || target.active === false || target.wallRef?.active === false) {
            this.hideWallHoverCard(target, { immediate: true });
            return;
        }

        const wall = target.wallRef || null;
        if (wall) {
            const summary = this._describeWallHover(wall);
            this.wallHoverCardLabel?.setText(summary.text);
        }

        const p = pointer || this.input?.activePointer || null;
        if (!p) return;

        const width = Math.max(0, Number(this.wallHoverCardSize?.width || 0));
        const height = Math.max(0, Number(this.wallHoverCardSize?.height || 0));
        const margin = 10;
        let x = Number(p.x || 0) + 18;
        let y = Number(p.y || 0) - height - 16;

        if (x + width > this.scale.width - margin) {
            x = Math.max(margin, Number(p.x || 0) - width - 16);
        }
        if (y < margin) {
            y = Math.min(this.scale.height - height - margin, Number(p.y || 0) + 18);
        }

        card.setPosition(
            Phaser.Math.Clamp(x, margin, Math.max(margin, this.scale.width - width - margin)),
            Phaser.Math.Clamp(y, margin, Math.max(margin, this.scale.height - height - margin)),
        );
    }

    hideForagerRouteInstruction() {
        if (!this.foragerRouteInstructionUI?.visible) return;
        this.tweens.killTweensOf(this.foragerRouteInstructionUI);
        this.foragerRouteInstructionUI.setVisible(false).setAlpha(0);
    }

    // === Farm mode: laptop-friendly 2-click plot selection ===
// === Farm instruction UI (segmented, colored parts, seed icon) ===
ensureFarmInstructionUI() {
    const hasLiveUi =
        !!this.farmInstructionUI?.active &&
        !!this.farmInstructionBg?.scene &&
        !!this.farmInstrLeft?.scene &&
        !!this.farmInstrMid?.scene &&
        !!this.farmInstrSeedCount?.scene &&
        !!this.farmInstrSeedIcon?.scene &&
        !!this.farmInstrRight?.scene;
    if (hasLiveUi) return;

    this.farmInstructionUI?.destroy?.(true);
    this.farmInstructionUI = null;
    this.farmInstructionBg = null;
    this.farmInstrLeft = null;
    this.farmInstrMid = null;
    this.farmInstrSeedCount = null;
    this.farmInstrSeedIcon = null;
    this.farmInstrRight = null;

    const y = 92;
    const x = this.cameras.main.width / 2;

    this.farmInstructionUI = this.add.container(x, y)
        .setScrollFactor(0)
        .setDepth(UIDEPTH + 10)
        .setVisible(false);

    this.farmInstructionBg = this.add.graphics();

    // children we reuse
    this.farmInstrLeft = this.add.text(0, 0, "", {
        fontSize: "16px",
        fontFamily: "Bungee",
        fill: "#ffffff",
        stroke: "#000",
        strokeThickness: 3,
    }).setOrigin(0, 0.5);

    this.farmInstrMid = this.add.text(0, 0, "", {
        fontSize: "16px",
        fontFamily: "Bungee",
        fill: "#ffffff",
        stroke: "#000",
        strokeThickness: 3,
    }).setOrigin(0, 0.5);

    this.farmInstrSeedCount = this.add.text(0, 0, "", {
        fontSize: "16px",
        fontFamily: "Bungee",
        fill: "#00ff00",
        stroke: "#000",
        strokeThickness: 3,
    }).setOrigin(0, 0.5);

    this.farmInstrSeedIcon = this.add.image(0, 0, "seeds") // seed icon key MUST be 'seeds'
        .setOrigin(0, 0.5)
        .setDisplaySize(18, 18);

    this.farmInstrRight = this.add.text(0, 0, "", {
        fontSize: "16px",
        fontFamily: "Bungee",
        fill: "#ff4444", // red for Esc part
        stroke: "#000",
        strokeThickness: 3,
    }).setOrigin(0, 0.5);

    this.farmInstructionUI.add([
        this.farmInstructionBg,
        this.farmInstrLeft,
        this.farmInstrMid,
        this.farmInstrSeedCount,
        this.farmInstrSeedIcon,
        this.farmInstrRight,
    ]);

    // ignore by camera

    // keep centered on resize
        this._trackScaleResize(({ width }) => {
            if (this.farmInstructionUI) this.farmInstructionUI.setX(width / 2);
            this.layoutFarmInstruction();
        });
}

layoutFarmInstruction() {
    if (!this.farmInstructionUI || !this.farmInstructionBg) return;

    const padX = 18;
    const padY = 10;
    const partGap = 4;

    // hide seed bits unless they have text
    const seedVisible = !!this.farmInstrSeedCount.text;

    this.farmInstrSeedCount.setVisible(seedVisible);
    this.farmInstrSeedIcon.setVisible(seedVisible);

    const parts = [
        this.farmInstrLeft,
        this.farmInstrMid,
        ...(seedVisible ? [this.farmInstrSeedCount, this.farmInstrSeedIcon] : []),
        this.farmInstrRight,
    ].filter((part) => part && part.visible !== false);

    const partWidth = (part) => part.displayWidth ?? part.width ?? 0;
    const partHeight = (part) => part.displayHeight ?? part.height ?? 0;
    const instructionW = parts.reduce((sum, part) => sum + partWidth(part), 0)
        + partGap * Math.max(0, parts.length - 1);
    const instructionH = parts.reduce((max, part) => Math.max(max, partHeight(part)), 0);
    const bgW = instructionW + padX * 2;
    const bgH = Math.max(30, instructionH + padY);

    this.farmInstructionBg.clear();
    this.farmInstructionBg.fillStyle(0x10293b, 0.72);
    this.farmInstructionBg.fillRoundedRect(-bgW / 2, -bgH / 2, bgW, bgH, 12);
    this.farmInstructionBg.fillStyle(0xffffff, 0.08);
    this.farmInstructionBg.fillRoundedRect((-bgW / 2) + 2, (-bgH / 2) + 2, bgW - 4, Math.max(8, bgH * 0.42), 10);
    this.farmInstructionBg.lineStyle(2, 0xffffff, 0.16);
    this.farmInstructionBg.strokeRoundedRect(-bgW / 2, -bgH / 2, bgW, bgH, 12);

    let cursorX = -instructionW / 2;
    for (const part of parts) {
        part.setPosition(cursorX, 0);
        cursorX += partWidth(part) + partGap;
    }
}

showFarmInstruction() {
    this.ensureFarmInstructionUI();
    this.farmInstructionUI.setVisible(true);
}

hideFarmInstruction() {
    if (this.farmInstructionUI) this.farmInstructionUI.setVisible(false);
}

setFarmInstructionPhase1() {
    this.ensureFarmInstructionUI();

    this.farmInstrLeft.setText("Farming | click spot to begin plot | ");
    this.farmInstrMid.setText("");               // no middle piece
    this.farmInstrSeedCount.setText("");         // no seed count in phase 1
    this.farmInstrRight.setText("ESC to cancel");
    this.farmInstrRight.setColor("#ff4444");     // red Esc

    this.showFarmInstruction();
    this.layoutFarmInstruction();
}

setFarmInstructionPhase2(previewData) {
    this.ensureFarmInstructionUI();

    const totalNeeded = Number(previewData?.totalNeeded || 0);
    const cappedTotal = Number(previewData?.cappedTotal || 0);
    const maxSeedsReached = !!previewData?.maxSeedsReached;

    this.farmInstrLeft.setText("Farming | select end spot | x");
    this.farmInstrMid.setText("");
    this.farmInstrSeedCount.setText(String(totalNeeded));

    const enough = previewData?.enoughSeeds !== false;
    this.farmInstrSeedCount.setColor(enough ? "#00ff00" : "#ff4444");

    this.farmInstrRight.setText(
        maxSeedsReached
            ? ` | max ${cappedTotal} seeds reached | ESC to go back`
            : " | ESC to go back"
    );
    this.farmInstrRight.setColor("#ff4444");

    this.showFarmInstruction();
    this.layoutFarmInstruction();
}

// Valid start tile rules (matches your getSelectedCells(1) behavior)
getFarmTilePlacementType(x, y) {
    if (!this.isFarmTileInWorld(x, y)) return null;
    if (!GameMap.isWithinMainIslandBuildInterior(x, y, 1, 1)) return null;
    if (buildingManager.isFarmTileBlockedByBuildReservation?.(x, y, 1)) return null;

    const cell = GameMap.grid?.[y]?.[x];
    if (cell == null) return null;

    const vals = Array.isArray(cell) ? cell : [cell];
    const names = vals.map((v) => TILE_MAP(v)).filter(Boolean);
    if (names.includes("water") || names.includes("road")) return null;

    const floorName = TILE_MAP(GameMap.grabDepth(cell, FLOORDEPTH));
    const type = floorName ? TILE_TYPES[floorName] : null;

    if (names.includes("crops") || type?.name === "crops") {
        const crop = Teams.getCropAt(x, y, 1);
        return crop && !crop.hasSeed ? "reseed" : null;
    }

    if (type?.spread && type.name !== "water" && type.name !== "road") {
        return "fresh";
    }

    return null;
}

isValidFarmTile(x, y) {
    return !!this.getFarmTilePlacementType(x, y);
}

isFarmTileInWorld(x, y) {
    return x >= 0 && y >= 0 && x < WORLD_DIMENSIONX && y < WORLD_DIMENSIONY;
}

isValidFarmSelection(minX, maxX, minY, maxY) {
    let validCount = 0;
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            if (!this.isValidFarmTile(x, y)) return false;
            validCount++;
        }
    }
    return validCount > 0;
}

// ---- Farm selection seed accounting helpers ----
getPendingFarmTileKeySet() {
    const team1 = Teams.teamLists?.["1"];
    const list = team1?.tileList || [];
    const set = new Set();

    for (const t of list) {
        if (!t) continue;
        if (typeof t.x !== "number" || typeof t.y !== "number") continue;
        set.add(`${t.x},${t.y}`);
    }
    return set;
}

getPendingFarmSeedAccounting(teamNumber = "1") {
    const team = Teams.teamLists?.[`${teamNumber}`] ?? Teams.teamLists?.[teamNumber];
    const pendingTasks = (team?.tileList || [])
        .filter((task) => task && typeof task.x === "number" && typeof task.y === "number");
    const pending = new Set(pendingTasks.map((task) => `${task.x},${task.y}`));
    const reservedOrCommitted = new Set();
    const seedItem = UI_ITEM_TYPES.seedCrop;

    const markIfFarmTask = (task) => {
        if (!task || !pending.has(`${task.x},${task.y}`)) return false;
        reservedOrCommitted.add(task);
        return true;
    };

    for (const troop of team?.playerList || []) {
        if (!troop?.active) continue;
        if (troop.pendingFarmSpot) {
            markIfFarmTask(troop.pendingFarmSpot);
            continue;
        }
        if (troop.task && StorageManager.isCarryingItem(troop, seedItem)) {
            markIfFarmTask(troop.task);
        }
    }

    for (const task of pendingTasks) {
        const reserver = task.reservedBy;
        if (reserver?.active) reservedOrCommitted.add(task);
    }

    const pendingNeedsStoredCount = pendingTasks.reduce(
        (count, task) => count + (reservedOrCommitted.has(task) ? 0 : 1),
        0
    );
    const availableStoredSeeds = StorageManager.getAvailableStoredItemCountForTeam(teamNumber, seedItem);
    const availableNewSeeds = Math.max(0, availableStoredSeeds - pendingNeedsStoredCount);

    return {
        pending,
        pendingCount: pending.size,
        pendingNeedsStoredCount,
        availableStoredSeeds,
        availableNewSeeds,
    };
}

getFarmSelectionPreviewData(minX, maxX, minY, maxY) {
    const seedAccounting = this.getPendingFarmSeedAccounting("1");
    const pending = seedAccounting.pending;
    const cells = [];
    const availableNewSeeds = seedAccounting.availableNewSeeds;

    const startX = Phaser.Math.Clamp(minX, 0, WORLD_DIMENSIONX - 1);
    const endX = Phaser.Math.Clamp(maxX, 0, WORLD_DIMENSIONX - 1);
    const startY = Phaser.Math.Clamp(minY, 0, WORLD_DIMENSIONY - 1);
    const endY = Phaser.Math.Clamp(maxY, 0, WORLD_DIMENSIONY - 1);

    if (startX > endX || startY > endY) {
        return {
            pendingCount: pending.size,
            pendingNeedsStoredCount: seedAccounting.pendingNeedsStoredCount,
            availableStoredSeeds: seedAccounting.availableStoredSeeds,
            newCount: 0,
            totalNeeded: 0,
            cappedTotal: 0,
            plantableNewCount: 0,
            availableNewSeeds,
            maxSeedsReached: availableNewSeeds <= 0,
            validSelection: false,
            enoughSeeds: availableNewSeeds > 0,
            cells,
        };
    }

    let newCount = 0;
    const pivotX = Phaser.Math.Clamp(
        (this.startCell && this.startCell.x >= startX && this.startCell.x <= endX) ? this.startCell.x : startX,
        startX,
        endX
    );
    const pivotY = Phaser.Math.Clamp(
        (this.startCell && this.startCell.y >= startY && this.startCell.y <= endY) ? this.startCell.y : startY,
        startY,
        endY
    );
    const targetX = typeof this.endCell?.x === "number" ? this.endCell.x : endX;
    const targetY = typeof this.endCell?.y === "number" ? this.endCell.y : endY;
    const xStep = targetX < pivotX ? -1 : 1;
    const yStep = targetY < pivotY ? -1 : 1;
    const xValues = [];
    const yValues = [];

    for (let x = pivotX; xStep > 0 ? x <= endX : x >= startX; x += xStep) {
        xValues.push(x);
    }
    for (let y = pivotY; yStep > 0 ? y <= endY : y >= startY; y += yStep) {
        yValues.push(y);
    }

    for (const y of yValues) {
        for (const x of xValues) {
            const kind = this.getFarmTilePlacementType(x, y);
            if (!kind) continue;

            const key = `${x},${y}`;
            if (pending.has(key)) continue;

            const overBudget = newCount >= availableNewSeeds;
            const tint = overBudget
                ? 0xff5a5a
                : kind === "reseed"
                    ? 0x68dcff
                    : 0x52ff7a;
            const queuedTint = kind === "reseed" ? 0x45c9ff : 0x7cff97;
            cells.push({
                x,
                y,
                kind,
                tint,
                queuedTint,
            });
            newCount++;
        }
    }

    const totalNeeded = newCount;
    const plantableNewCount = Math.min(newCount, availableNewSeeds);
    const cappedTotal = plantableNewCount;
    return {
        pendingCount: pending.size,
        pendingNeedsStoredCount: seedAccounting.pendingNeedsStoredCount,
        availableStoredSeeds: seedAccounting.availableStoredSeeds,
        newCount,
        totalNeeded,
        cappedTotal,
        plantableNewCount,
        availableNewSeeds,
        maxSeedsReached: totalNeeded > cappedTotal,
        validSelection: newCount > 0,
        enoughSeeds: newCount <= availableNewSeeds,
        cells,
    };
}

// Returns how many seeds we need if we confirm THIS rectangle,
// excluding already queued tiles.
getFarmSelectionSeedCost(minX, maxX, minY, maxY) {
    const preview = this.getFarmSelectionPreviewData(minX, maxX, minY, maxY);
    return {
        pendingCount: preview.pendingCount,
        newCount: preview.newCount,
        totalNeeded: preview.totalNeeded,
    };
}

beginFarmSelectionIfNeeded() {
    if (!this.farmMode) return;
    if (this.farmSelectActive) return;

    this.farmSelectActive = true;
    this.farmSelectPhase = 1;
    this.startCell = null;
    this.endCell = null;
    this.graphics.clear();

    this.farmConsumeNextClick = false;

    this.setFarmInstructionPhase1();
}

cancelFarmSelection(exitFarmMode = false) {
    this.farmSelectActive = false;
    this.farmSelectPhase = 0;
    this.startCell = null;
    this.endCell = null;
    this.graphics.clear();
    if (this.farmHover) this.farmHover.setVisible(false);
    this.clearFarmSelectionPreview();
    this.hideFarmInstruction();

    if (exitFarmMode) {
        // this is the key — FunctionTab uses this to un-toggle
        this.events.emit("mode:completed", "Farm");
        this.farmMode = false; // keep for safety; UI state comes from the event
    }
}

    handleFarmPointerDown(pointer) {
        this.beginFarmSelectionIfNeeded();

        if (this.farmConsumeNextClick) {
            this.farmConsumeNextClick = false;
            return;
        }

        const gridX = Math.floor(pointer.worldX / SQUARESIZE);
        const gridY = Math.floor(pointer.worldY / SQUARESIZE);

        // Phase 1: pick a valid start tile
        if (this.farmSelectPhase === 1) {
            const preview = this.getFarmSelectionPreviewData(gridX, gridX, gridY, gridY);
            if (!preview.validSelection) return;

            this.startCell = { x: gridX, y: gridY };
            this.endCell = { x: gridX, y: gridY };
            this.farmSelectPhase = 2;

            if (this.farmHover) this.farmHover.setVisible(false);
            return;
        }

        // Phase 2: confirm end tile
        if (this.farmSelectPhase === 2 && this.startCell) {
            this.endCell = { x: gridX, y: gridY };

            const minX = Math.min(this.startCell.x, this.endCell.x);
            const maxX = Math.max(this.startCell.x, this.endCell.x);
            const minY = Math.min(this.startCell.y, this.endCell.y);
            const maxY = Math.max(this.startCell.y, this.endCell.y);

            const preview = this.getFarmSelectionPreviewData(minX, maxX, minY, maxY);
            if (!preview.validSelection) return;
            if ((preview.plantableNewCount || 0) <= 0) {
                return;
            }

            // NOW it's allowed: proceed to existing tilling code
            this.getSelectedCells(1);

            // IMPORTANT: fully shut off selection + tell UI to toggle the Farm button off
            this.cancelFarmSelection(false);
            this.events.emit("mode:completed", "Farm");
            return;
        }
    }

    drawSelectionOutline(color) {
        this.graphics.clear(); // Clear previous drawings
        this.graphics.lineStyle(2, color, 1); // black outline with thickness
    
        const minX = Math.min(this.startCell.x, this.endCell.x);
        const maxX = Math.max(this.startCell.x, this.endCell.x);
        const minY = Math.min(this.startCell.y, this.endCell.y);
        const maxY = Math.max(this.startCell.y, this.endCell.y);
    
        const rectX = minX * SQUARESIZE;
        const rectY = minY * SQUARESIZE;
        const rectWidth = (maxX - minX + 1) * SQUARESIZE;
        const rectHeight = (maxY - minY + 1) * SQUARESIZE;
        
        this.graphics.setDepth(UIDEPTH);
        this.graphics.strokeRect(rectX, rectY, rectWidth, rectHeight); // Draw the rectangle
    }

    getSelectedCells(mode = 0) {
        const team1 = Teams.teamLists?.["1"];
        if (!team1) return;

        const existing = this.getPendingFarmTileKeySet();
        const minX = Math.min(this.startCell.x, this.endCell.x);
        const maxX = Math.max(this.startCell.x, this.endCell.x);
        const minY = Math.min(this.startCell.y, this.endCell.y);
        const maxY = Math.max(this.startCell.y, this.endCell.y);
        // if insufficient, show alert and bail out
        if (mode === 1) {
            // FARM/TILL selection mode
            const tillList = Teams.teamLists['1'].tileList;
            const preview = this.getFarmSelectionPreviewData(minX, maxX, minY, maxY);
            const maxNewSeeds = Math.max(0, preview.plantableNewCount || 0);
            let addedCount = 0;

            for (const cell of preview.cells) {
                if (addedCount >= maxNewSeeds) break;
                const key = `${cell.x},${cell.y}`;
                if (existing.has(key)) continue;
                existing.add(key);
                tillList.push({ x: cell.x, y: cell.y, assigned: 0, kind: cell.kind });
                this.addTillPreviewSprite(cell.x, cell.y, cell.queuedTint ?? cell.tint);
                addedCount++;
            }

            if (addedCount > 0) {
                AudioManager.playBuildingComplete({ volume: 0.2, world: true });
                this.tutorialManager?.notifyAction?.("farm.planted", {
                    count: addedCount,
                    minX,
                    maxX,
                    minY,
                    maxY,
                });
            }

            // IMPORTANT: do NOT turn farmMode off here.
            // Selection lifecycle should end via your "complete" event path (see section 3).
        }
        else if(mode == 2){
            let cropList = Teams.teamLists['1'].cropList;
            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    let type = TILE_TYPES[TILE_MAP(GameMap.grabDepth(GameMap.grid[y][x], FLOORDEPTH))]
                    if(type.name == 'crops'){
                        let cropTile;
                        const key = `${x},${y}`
                        if(Array.isArray(GameMap.cropDict[key])){
                            cropTile = GameMap.cropDict[key][0]
                        }else{cropTile = GameMap.cropDict[key]}
                        if(cropTile.anims.currentFrame.index == 3){
                            cropList.push({
                                x,
                                y,
                                assigned: 0
                            });
                        }
                    }
                }
            }
            tillManager.assignCropsToTroops(1);
        }
        else if (mode == 3) {
            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    this.seedGridMode = false;
                    this.functionTab.updateVisuals();
                    let tileType = TILE_TYPES[TILE_MAP(GameMap.grabDepth(GameMap.grid[y][x], FLOORDEPTH))];
                    if (tileType.interactable) {
                        const block = GameMap.blocks[y * WORLD_DIMENSIONX + x];
                        // register the seed task AND bind the block to it
                        const task = { x, y, block, forageType: 'seed', assigned: 0 };
                        Teams.teamLists["1"].foragerQueue.push(task);
                        // 🟡 draw persistent yellow outline
                        if (block && !block.queuedOutline) {
                            const size = SQUARESIZE;
                            const outline = GameMap.scene.add.graphics();
                            outline.setDepth(UIDEPTH);
                            outline.lineStyle(2, 0xffff00, 1);
                            outline.strokeRect(x * size, y * size, size, size);
                            block.queuedOutline = outline;
                        }
                    }
                }
            }
            // seedManager.assignSeedsToTroops(1);
        }
        else{
            const item = itemTab.itemValues(this.registry.get('image'));
            item.lenX = maxX-minX; item.lenY = maxY-minY;
            GameMap.addSpreadItem(minX,minY,item);
        }
    }

    sceneButtons() {
        const camera = this.cameras.main;
        const W = camera.width;
        const H = 36;

        // 🔳 Background
        const bar = this.add.rectangle(0, 0, W, H, 0x222222, 0.7)
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(UIDEPTH - 1);

        this._trackScaleResize(({ width }) => bar.setSize(width, H));

        const makeIcon = (x, key) =>
            this.add.image(x, H / 2, key)
            .setDisplaySize(20, 20)
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(UIDEPTH);

        const makeText = (x, text, color = "#fff") =>
            this.add.text(x, H / 2, text, {
            fontSize: "14px",
            fill: color,
            fontFamily: "Bungee",
            stroke: "#000",
            strokeThickness: 2,
            }).setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(UIDEPTH);

        let x = 12;
        const spacing = 8;
        const iconSize = 20;

        // === Daily Needs Section ===
        const needs = DailyNeedsTracker.getValues();
        this.topHudElements = [];

        for (const item of needs) {
            const icon = makeIcon(x, item.key);
            x += iconSize + 4;
            const display = item.need
                ? `${item.have}/${item.need}`
                : `${item.have}`;
            const color = item.need
                ? (item.have >= item.need ? "#00ff00" : "#ff3333")
                : (item.have > 0 ? "#00ff00" : "#ff3333");
            const text = makeText(x, display, color);
            x += text.width + spacing;

            // 🟢 store references
            if (item.key === "foodIcon") this.foodText = text;
            if (item.key === "waterIcon") this.waterText = text;

            this.topHudElements.push(icon, text);
        }

        // === Resource Section ===
        const resources = [
            { key: "seeds", value: this.seeds },
            { key: "berry", value: this.berries },
            { key: "woodIcon", value: this.woodAmnt },
            { key: "stoneIcon", value: this.stoneAmnt },
        ];

        for (const r of resources) {
            const icon = makeIcon(x, r.key);
            x += iconSize + 4;
            const text = makeText(x, `${r.value}`);
            text.name = r.key; // 🟢 give each text a name for lookup
            x += text.width + spacing;

            switch (r.key) {
                case "seeds": this.seedsText = text; break;
                case "berry": this.berryText = text; break;
                case "woodIcon": this.woodText = text; break;
                case "stoneIcon": this.stoneText = text; break;
                case "waterIcon": this.waterText = text; break;
            }

            this.topHudElements.push(icon, text);
        }

        // === Money (centered) ===
        const centerX = W / 2;
        const moneyIcon = makeIcon(centerX - 30, "monies");
        this.moneyText = makeText(centerX - 4, `$${this.money}`);
        this.topHudElements.push(moneyIcon, this.moneyText);

        // === Clock (right) ===
        const clockX = W - 160;
        this.clock = new Clock(this);
        this._currentPhaseKey = this.clock.getPhaseKey?.() || this._currentPhaseKey;
        this.clockText = makeText(clockX, this.clock.formatTimeWithDay());
        this.clock.externalText = this.clockText; // pass reference
        this.topHudElements.push(this.clockText);


        this.topHud = this.add.container(0, 0, [bar, ...this.topHudElements])
            .setScrollFactor(0)
            .setDepth(UIDEPTH);
        this.uiScene?._syncWorldUiRefs?.();
    }



    static refreshUICameraIgnores() {}


    updateMoney(amountDelta, opts = {}) {
        this.money += amountDelta;
        if (amountDelta > 0) {
            const stats = this._runStats || (this._runStats = this._createRunStats());
            stats.moneyEarnedTotal = Math.max(0, Number(stats.moneyEarnedTotal || 0) + Number(amountDelta || 0));
        }
        SaveManager.queueAutosave("money");
        if (this.uiScene?.onMoneyChanged) {
            this.uiScene.onMoneyChanged(amountDelta, opts);
            return;
        }
        if (!this.moneyText) return;
        this.moneyText.setText(`$${this.money}`);
    
        // Determine color and ghost prefix
        const isGain = amountDelta > 0;
        const color = isGain ? '#00ff00' : '#ff3333';
        const sign = isGain ? '+' : '-';
    
        // Temporarily change the fill color
        this.moneyText.setFill(color);
    
        // Create ghost text above the current amount
        const ghost = this.add.text(
            this.moneyText.x,
            this.moneyText.y,
            `${sign}$${Math.abs(amountDelta)}`,
            {
                fontSize: '18px',
                fill: color,
            }
        ).setOrigin(0, 0).setDepth(UIDEPTH).setScrollFactor(0);
    
        // Animate ghost text: float up and fade out
        this.tweens.add({
            targets: ghost,
            y: ghost.y - 20,
            alpha: 0,
            duration: 800,
            ease: 'Cubic.easeOut',
            onComplete: () => ghost.destroy()
        });
    
        // Reset fill color back to white after a short delay
        this.time.delayedCall(600, () => {
            this.moneyText.setFill('#ffffff');
        });
    }

    updateSeeds(amountDelta) {
        this.seeds = Math.max(0, Number(this.seeds || 0) + Number(amountDelta || 0));
        SaveManager.queueAutosave("seeds");
        if (this.uiScene?.onSeedsChanged) {
            this.uiScene.onSeedsChanged(amountDelta);
            return;
        }
        if (!this.seedsText) return;
        this.seedsText.setText(`${this.seeds}`);
    
        // color flash
        const color = amountDelta > 0 ? '#00ff00' : '#ff3333';
        this.seedsText.setFill(color);
    
        // floating ghost text
        const ghost = this.add.text(
            this.seedsText.x,
            this.seedsText.y,
            amountDelta > 0 ? `+${amountDelta}` : `${amountDelta}`,
            {
                fontSize: '18px',
                fill: color,
            }
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(UIDEPTH);
    
        this.tweens.add({
            targets: ghost,
            y: ghost.y - 20,
            alpha: 0,
            duration: 800,
            ease: 'Cubic.easeOut',
            onComplete: () => ghost.destroy()
        });
    
        // reset color
        this.time.delayedCall(600, () => {
            this.seedsText.setFill('#ffffff');
        });
    }

    updateBerry(amountDelta) {
        this.berries = Math.max(0, Number(this.berries || 0) + Number(amountDelta || 0));
        SaveManager.queueAutosave("berries");
        if (this.uiScene?.onBerryChanged) {
            this.uiScene.onBerryChanged(amountDelta);
            return;
        }
        if (!this.berryText) return;
        this.berryText.setText(`${this.berries}`);
    
        const color = amountDelta > 0 ? '#00ff00' : '#ff3333';
        this.berryText.setFill(color);
    
        const ghost = this.add.text(
            this.berryText.x,
            this.berryText.y,
            amountDelta > 0 ? `+${amountDelta}` : `${amountDelta}`,
            {
                fontSize: '18px',
                fill: color,
            }
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(UIDEPTH);
    
        this.tweens.add({
            targets: ghost,
            y: ghost.y - 20,
            alpha: 0,
            duration: 800,
            ease: 'Cubic.easeOut',
            onComplete: () => ghost.destroy()
        });
    
        this.time.delayedCall(600, () => {
            this.berryText.setFill('#ffffff');
        });
    }

    updatePermits(amountDelta) {
        this.permits = Math.max(0, (this.permits ?? 0) + amountDelta);
        SaveManager.queueAutosave("permits");
        if (this.uiScene?.onPermitsChanged) {
            this.uiScene.onPermitsChanged(amountDelta);
            return;
        }
        if (!this.permitText) return;
        this.permitText.setText(`${this.permits}`);

        const isGain = amountDelta > 0;
        const color = isGain ? '#d8b4fe' : '#fca5a5';
        const sign = isGain ? '+' : '-';
        this.permitText.setFill(color);

        const ghost = this.add.text(
            this.permitText.x,
            this.permitText.y,
            `${sign}${Math.abs(amountDelta)}📜`,
            {
                fontSize: '18px',
                fill: color,
            }
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(UIDEPTH);

        this.tweens.add({
            targets: ghost,
            y: ghost.y - 20,
            alpha: 0,
            duration: 800,
            ease: 'Cubic.easeOut',
            onComplete: () => ghost.destroy()
        });

        this.time.delayedCall(600, () => {
            this.permitText?.setFill?.('#ffffff');
        });
    }
    
    
    
    createAnim(key,repeat = -1, frameRate = 3, end=2){
        if (this.anims.exists(key)) return;
        this.anims.create({
            key: key,
            frames: this.anims.generateFrameNumbers(key, { start: 0, end: end }),
            frameRate: frameRate,
            repeat: repeat
        });
    }
    
    update(time, delta) {
        if (this._menuModeActive || this.isMainMenuPreview || this._pendingMenuPhase || this._continueCameraLockActive) {
            this._applyStartupCameraPose();
        }
        this._updateOceanBackdrop();
        const effectiveSimSpeed = this.applySimulationSpeed();
        if (effectiveSimSpeed > 0) {
            const simDeltaMs = delta * effectiveSimSpeed;
            this.simNowMs += simDeltaMs;
            const simNowMs = this.getSimulationNow();
            Turret.updateAll(simNowMs, simDeltaMs);
            Catapult.updateAll(simNowMs, simDeltaMs);
            this.clock.update(Math.max(1, Math.round(effectiveSimSpeed)));
            this._updateNorthFortArrival();
            this.handleKeyboardCameraMovement();
            PineTree.updateAll(this.time.now);
            if (this.farmMode && !this._prevFarmMode) {
                this.beginFarmSelectionIfNeeded();
            }
            if (!this.farmMode && this._prevFarmMode) {
                this.cancelFarmSelection(false);
            }
            this._prevFarmMode = this.farmMode;
        }
        Player.update();
        if (this._shockerBossState?.nightLocked && !this._activeShockerBoss?.active) {
            this._activeShockerBoss = (Player.troops || []).find((troop) => troop?.active && troop?.isShocker) || null;
        }
        if (this.uiScene && (this._shockerBossState?.nightLocked || this._activeShockerBoss)) {
            this._syncShockerBossUi();
        }
        this._updateCropHoverCardPosition();
        this._updateWallHoverCardPosition();
        this.updateForagerRouteAssist();
        ClayOvenUI.updateAllOvens(effectiveSimSpeed);
        this._refreshNorthFortArrivalMarker();
        this._syncNightPressurePreviewPanels();
        this._tryPresentPendingTownXpReward();
        if ((this.time?.now ?? 0) - this._storageCollapseLastCheckedAt >= 180) {
            this._storageCollapseLastCheckedAt = this.time?.now ?? 0;
            this._evaluateStorageCollapseState({ sourceStorage: this._pendingStorageCollapseSource });
        }
        this.achievementSystem?.update?.();
        SaveManager.tick(this);
        if (this._startupCameraLocked && (this._menuModeActive || this.isMainMenuPreview || this._pendingMenuPhase || this._continueCameraLockActive)) {
            this._applyStartupCameraPose();
        }
    }

    showSaveNotification() {
        if (this.uiScene?.showSaveNotification) {
            return this.uiScene.showSaveNotification();
        }
        const text = this.add.text(this.cameras.main.width / 2, -50, "World data saved 🌍", {
            fontSize: "32px",
            fill: "#ffffff",
            stroke: "#000000",
            strokeThickness: 4,
            fontStyle: "bold"
        })
        .setOrigin(0.5, 0.5) // Center the text
        .setDepth(1000); // Ensure it's on top
    
        // Tween: Drop down slightly, then bounce back up
        this.tweens.add({
            targets: text,
            y: 60, // Move down to this position
            duration: 600, // Drop duration
            ease: "Bounce.easeOut", // Smooth drop effect
            yoyo: true, // Move back up slightly
            onComplete: () => {
                // Remove the text after a delay
                this.time.delayedCall(1000, () => {
                    text.destroy();
                });
            }
        });
    }

    checkSufficientFunds(price){
        if(price>this.money){
            showAlert(this, "Insufficient Funds", '#ff0000')
        }
        return price<=this.money;
    }

    checkSufficientSeeds(seedAmnt){
        if(seedAmnt>this.seeds){
            showAlert(this, "Insufficient seeds", '#ff0000')
        }
        return seedAmnt<=this.seeds;
    }

    checkSufficientBerries(berryAmnt){
        if(berryAmnt>this.berries){
            showAlert(this, "Insufficient berries", '#ff0000')
        }
        return berryAmnt<=this.berries;
    }

    checkSufficientPermits(permitAmnt){
        if (permitAmnt > (this.permits ?? 0)) {
            showAlert(this, "Insufficient permits", '#ff0000');
        }
        return permitAmnt <= (this.permits ?? 0);
    }

    processEnemySelection(start, end) {
        const team1 = Teams.teamLists['1'];
        if (!team1) return;

        const x1 = Math.min(start.x, end.x);
        const y1 = Math.min(start.y, end.y);
        const x2 = Math.max(start.x, end.x);
        const y2 = Math.max(start.y, end.y);

        const enemies = Teams.teamLists['0'].playerList.filter(enemy => {
            return enemy.x >= x1 && enemy.x <= x2 &&
                enemy.y >= y1 && enemy.y <= y2 &&
                enemy.active;
        });

        for (const enemy of enemies) {
            if (!team1.fightingList.includes(enemy)) {
                Teams.addTroopsToFight('1', enemy);
            }
        }

        fightManager.sendToAttack()
    }

    addTillPreviewSprite(x, y, tint = 0x7cff97) {
        const key = `${x},${y}`;

        const existing = this.tillPreviewSprites.get(key);
        if (existing) {
            existing.setTint(tint);
            return;
        }

        const spr = this.add.image(
            x * SQUARESIZE + SQUARESIZE / 2,
            y * SQUARESIZE + SQUARESIZE / 2,
            "tillOverlay"
        )
        .setDisplaySize(SQUARESIZE, SQUARESIZE)
        .setDepth(FLOORDEPTH)
        .setAlpha(0.6)
        .setTint(tint);

        this.tillPreviewSprites.set(key, spr);
    }

    addFarmSelectionPreviewSprite(x, y, tint = 0x52ff7a) {
        const key = `${x},${y}`;
        if (this.farmSelectionPreviewSprites.has(key)) return;

        const spr = this.add.image(
            x * SQUARESIZE + SQUARESIZE / 2,
            y * SQUARESIZE + SQUARESIZE / 2,
            "tillOverlay"
        )
        .setDisplaySize(SQUARESIZE, SQUARESIZE)
        .setDepth(FLOORDEPTH + 0.01)
        .setAlpha(0.72)
        .setTint(tint);

        this.farmSelectionPreviewSprites.set(key, spr);
    }

    renderFarmSelectionPreview(cells = []) {
        const desired = new Set();
        let addedCount = 0;
        let removedCount = 0;

        for (const cell of cells) {
            const key = `${cell.x},${cell.y}`;
            desired.add(key);

            const existing = this.farmSelectionPreviewSprites.get(key);
            if (existing) {
                existing.setTint(cell.tint ?? 0x52ff7a);
                continue;
            }

            this.addFarmSelectionPreviewSprite(cell.x, cell.y, cell.tint ?? 0x52ff7a);
            addedCount++;
        }

        for (const [key, spr] of this.farmSelectionPreviewSprites.entries()) {
            if (desired.has(key)) continue;
            spr.destroy();
            this.farmSelectionPreviewSprites.delete(key);
            removedCount++;
        }

        if (this.farmSelectActive && this.farmSelectPhase === 2) {
            const bubbleCount = addedCount + removedCount;
            for (let index = 0; index < bubbleCount; index++) {
                AudioManager.playMenuClick({
                    volume: 0.1,
                    rate: removedCount > 0 && index >= addedCount ? 1.04 : 1,
                });
            }
        }
    }

    clearFarmSelectionPreview() {
        for (const spr of this.farmSelectionPreviewSprites.values()) {
            spr.destroy();
        }
        this.farmSelectionPreviewSprites.clear();
    }

    syncTillPulseTween() {

        if (!this.tillPulseTween) {
            this.tillPulseTween = this.tweens.add({
                targets: Array.from(this.tillPreviewSprites.values()),
                alpha: { from: 0.4, to: 0.9 },
                duration: 700,
                ease: 'Sine.inOut',
                yoyo: true,
                repeat: -1
            });
        } else {
            this.tillPulseTween.targets = Array.from(this.tillPreviewSprites.values());
        }
    }

    enableTillFlash(x, y) {
        const key = `${x},${y}`;
        const spr = this.tillPreviewSprites.get(key);
        if (!spr) return;

        // already flashing? don't double-attach
        if (spr._flashTween) {
            return;
        }

        spr._flashTween = this.tweens.add({
            targets: spr,
            alpha: { from: 0.4, to: 0.9 },
            duration: 650,
            ease: 'Sine.inOut',
            yoyo: true,
            repeat: -1
        });
    }

    removeTillPreviewSprite(x, y) {
        const key = `${x},${y}`;
        const spr = this.tillPreviewSprites.get(key);
        if (!spr) return;

        this.tillPreviewSprites.delete(key);

        if (spr._flashTween) {
            spr._flashTween.remove();
            spr._flashTween = null;
        }

        spr.destroy();
        AudioManager.playMenuClick({ volume: 0.1, rate: 1.04 });
    }

    startStageCompleteSequence(stageIndex, meta) {
        if (this.stageCompleteLock) return;
        this.stageCompleteLock = true;

        const cam = this.cameras.main;

        // lock camera/inputs immediately, but keep simulation running for troop evacuation
        this._movementLocked = true;

        // Stop tower-spawned pressure parcels from continuing to spawn/attack
        // during the stage-end cinematic and reward flow.
        this.parcelManager?.stopTowerPressureForStageEnd?.();

        // Send friendlies out of fort before reward selection.
        this._sendFortPlayersBackToTown(meta);

        // Force zoom-in cinematic framing.
        if (this.zoomMixer) {
            this.zoomMixer.targetZoom = 1;
            this.zoomMixer.smoothCenterZoomTo(1, 250);
        }

        // Disable zoom changes during stage-end sequence.
        this.zoomMixer?.setZoomOutLocked?.(true);

        this.tweens.add({
            targets: cam,
            scrollX: 50 * SQUARESIZE - cam.width / 2,
            scrollY: 24.5 * SQUARESIZE - cam.height / 2,
            duration: 450,
            ease: 'Quad.easeInOut',
            onComplete: () => {
                this.zoomMixer?.smoothCenterZoomTo(1, 200);

                AudioManager.playWorldSound('sfx_end_stage_explosions');
                this.cameras.main.shake(1000, 0.01);

                this.tweens.add({
                    targets: this.cameras.main,
                    zoom: { from: 1.01, to: 1 },
                    duration: 1000,
                    ease: 'Quad.easeOut'
                });

                this._playFortExplosions(meta, () => {
                    this._showStageCompletedGhost(stageIndex);

                    // Wait until all friendly fighters have moved south of the fort bottom edge.
                    this._waitForFortEvacuation(meta, null, () => {
                        this._openFortRewards(stageIndex, meta);
                    });
                });

                // Remove enemy fort grunts right as the explosion sequence starts.
                this.parcelManager?.clearAllFortGrunts?.();
            }
        });
    }

    _openFortRewards(stageIndex, meta) {
        // Freeze gameplay only if we need an unlock presentation.
        this.clock.paused = true;
        this.applySimulationSpeed(true);

        const finalizeStageCompletion = () => {
            // Stage transition cleanup:
            // - remove only tower-spawned pressure parcels + their raiders
            // - keep manually started pressure contracts alive (they remain paused during rewards)
            this.parcelManager?.forceClearPressureContracts?.("stage_end_cleanup", { onlyTowerSpawned: true });
            // Remove all fort grunts from the previous fort cycle.
            this.parcelManager?.clearAllFortGrunts?.();

            // Progress stage/season AFTER reward is chosen.
            StageState.completeFortCycle(
                { reason: 'fort_reward_collected' },
                { stagesPerSeason: StageState.STAGES_PER_SEASON }
            );

            // Fully clear old fort state and give the next stage a short breather
            // before the replacement North Fort arrives.
            const mainIslandOrigin = this.parcelManager?.mainIslandOrigin ?? PARCEL.MAIN_ORIGIN;
            this.scheduleNorthFortArrival({
                delayDays: 1,
                reason: 'fort_cleared',
                mainIslandOrigin,
                oldMeta: meta,
            });

            // Release sequence locks.
            this._movementLocked = false;
            this.stageCompleteLock = false;
            this.clock.paused = false;
            this.applySimulationSpeed(true);
            this.zoomMixer?.setZoomOutLocked?.(false);
            this._stageHud?.recompute?.();
            this.events.emit('stage:changed');
            this.events.emit('season:changed');
            this.addTownXp(TOWN_XP_SOURCE_VALUES.fortCleared, `Fort ${stageIndex} Cleared`, { alert: true });
        };

        const maybeOpenBossUnlockReward = () => {
            if (!StageState.isBossStage(stageIndex)) {
                finalizeStageCompletion();
                return;
            }

            const bossReward = getBossUnlockReward(stageIndex, StageState.seasonIndex);
            if (!bossReward) {
                finalizeStageCompletion();
                return;
            }

            this._activeBossRewardUI?.destroy?.();
            this._activeBossRewardUI = openBossUnlockRewardPresentation(this, {
                reward: bossReward,
                onComplete: () => {
                    this._activeBossRewardUI = null;
                    finalizeStageCompletion();
                }
            });
        };

        maybeOpenBossUnlockReward();
    }

    _waitForFortEvacuation(metaOrBounds, timeoutMs = 7000, done = null) {
        const bounds = this._resolveFortEvacBounds(metaOrBounds);
        if (!bounds) {
            done?.();
            return;
        }

        const startedAt = this.time.now;

        const tick = () => {
            const elapsed = this.time.now - startedAt;
            // Keep re-issuing return orders while sequence runs.
            this._sendFortPlayersBackToTown(metaOrBounds);

            const allOut = this._areFortFightersBelowBottom(metaOrBounds);

            if (allOut) {
                done?.();
                return;
            }

            if (timeoutMs != null && elapsed >= timeoutMs) {
                done?.();
                return;
            }

            this.time.delayedCall(150, tick);
        };

        tick();
    }

    _areFortPlayersStillInside(bounds) {
        const team = Teams.teamLists?.['1'];
        const players = team?.playerList || [];

        for (const troop of players) {
            if (!troop?.active || !troop.body) continue;
            if (!this._isFriendlyFighter(troop)) continue;

            const gx = Math.floor(troop.x / SQUARESIZE);
            const gy = Math.floor(troop.y / SQUARESIZE);
            const inside = gx >= bounds.minx && gx <= bounds.maxx && gy >= bounds.miny && gy <= bounds.maxy;
            if (inside) return true;
        }

        return false;
    }

    _sendFortPlayersBackToTown(metaOrBounds) {
        const bounds = this._resolveFortEvacBounds(metaOrBounds);
        if (!bounds) return;

        const team = Teams.teamLists?.['1'];
        const players = team?.fighterList || [];

        for (const troop of players) {
            if (!troop?.active || !troop.body) continue;
            if (!this._isFriendlyFighter(troop)) continue;

            const gy = Math.floor(troop.y / SQUARESIZE);
            if (gy > bounds.maxy) continue;

            Teams.sendTroopToTown(troop);
        }
    }

    _areFortFightersBelowBottom(metaOrBounds) {
        const bounds = this._resolveFortEvacBounds(metaOrBounds);
        if (!bounds) return true;
        const team = Teams.teamLists?.['1'];
        const fighters = team?.fighterList || [];

        for (const troop of fighters) {
            if (!troop?.active || !troop.body) continue;
            if (!this._isFriendlyFighter(troop)) continue;

            const gy = Math.floor(troop.y / SQUARESIZE);
            if (gy <= bounds.maxy) return false;
        }
        return true;
    }

    _resolveFortEvacBounds(metaOrBounds) {
        // Prefer full fort parcel bounds (25x25). Fall back to objective bounds.
        if (metaOrBounds?.refs?.parcelBounds) return metaOrBounds.refs.parcelBounds;
        if (metaOrBounds?.parcelBounds) return metaOrBounds.parcelBounds;
        if (metaOrBounds?.bounds) return metaOrBounds.bounds;
        if (
            metaOrBounds &&
            Number.isFinite(metaOrBounds.minx) &&
            Number.isFinite(metaOrBounds.miny) &&
            Number.isFinite(metaOrBounds.maxx) &&
            Number.isFinite(metaOrBounds.maxy)
        ) {
            return metaOrBounds;
        }
        return null;
    }

    _forceEvacuateFortPlayers(bounds) {
        if (!bounds) return;

        const team = Teams.teamLists?.['1'];
        const players = team?.playerList || [];

        for (const troop of players) {
            if (!troop?.active || !troop.body) continue;
            if (!this._isFriendlyFighter(troop)) continue;

            const gx = Math.floor(troop.x / SQUARESIZE);
            const gy = Math.floor(troop.y / SQUARESIZE);
            const inside = gx >= bounds.minx && gx <= bounds.maxx && gy >= bounds.miny && gy <= bounds.maxy;
            if (!inside) continue;

            const spawnTile = Teams.getTownSpawnTile?.("1");
            if (!spawnTile) return;
            const px = spawnTile.x * SQUARESIZE + SQUARESIZE / 2;
            const py = spawnTile.y * SQUARESIZE + SQUARESIZE / 2;

            troop.setVelocity?.(0, 0);
            if (typeof troop.body.reset === 'function') {
                troop.body.reset(px, py);
            } else {
                troop.setPosition?.(px, py);
            }

            Teams.sendTroopToTown(troop);
        }
    }

    _isFriendlyFighter(troop) {
        return !!(troop?.isBrawler || troop?.isBlademaster || troop?.isGunslinger);
    }

    _getTowerCenter(meta) {
        const tower = meta?.refs?.tower;

        if (tower?.sprite) {
            return {
            x: tower.sprite.x,
            y: tower.sprite.y
            };
        }

        const b = meta?.bounds;
        return {
            x: ((b.minx + b.maxx) / 2) * SQUARESIZE,
            y: ((b.miny + b.maxy) / 2) * SQUARESIZE
        };
    }

    _playFortExplosions(meta, onDone) {
        const bounds = meta?.bounds;
        const tower = meta?.refs?.tower;

        const spots = [];

        // ⭐ EXACT tower explosion
        if (tower?.sprite) {
            spots.push({
            x: tower.sprite.x,
            y: tower.sprite.y
            });
        }

        // remaining explosions (4 total minimum)
        const extraCount = Phaser.Math.Between(3, 4);

        for (let i = 0; i < extraCount; i++) {
            const gx = Phaser.Math.Between(bounds.minx + 1, bounds.maxx - 1);
            const gy = Phaser.Math.Between(bounds.miny + 1, bounds.maxy - 1);

            spots.push({
            x: gx * SQUARESIZE + SQUARESIZE / 2,
            y: gy * SQUARESIZE + SQUARESIZE / 2
            });
        }

        let finished = 0;

        spots.forEach(p => {
            const fx = this.add.sprite(p.x, p.y, 'explosions')
            .setDepth(9999);

            fx.play('explosions');

            fx.once('animationcomplete', () => {
            fx.destroy();
            finished++;
            if (finished === spots.length) onDone?.();
            });
        });
    }

    _fadeOutFortStructures(meta) {
        const track = meta?.refs?.fortTrack;
        const bounds = meta?.bounds;
        if (bounds) {
            VisibilitySystem.clearSourcesInBounds(bounds.minx, bounds.miny, bounds.maxx, bounds.maxy);
        }

        // Best path: fade ONLY tracked fort sprites
        if (track?.sprites?.length) {
            // optionally also disable their physics bodies
            (track.bodies || []).forEach(b => { try { b.enable = false; } catch(e){} });

            this.tweens.add({
            targets: track.sprites,
            alpha: 0,
            duration: 550,
            ease: 'Quad.easeInOut',
            onComplete: () => {
                track.sprites.forEach(s => { if (s?.destroy) s.destroy(); });
            }
            });
            return;
        }

        // Fallback (if something was not tracked yet): do nothing.
    }

    _showStageCompletedGhost(stageIndex) {

        const txt = this.add.text(
            this.scale.width / 2,
            this.scale.height / 2,
            `STAGE ${stageIndex} COMPLETED`,
            {
            fontFamily: 'Bungee',
            fontSize: '72px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 8
            }
        )
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(99999)
        .setAlpha(0);


        this.tweens.add({
            targets: txt,
            alpha: 1,
            duration: 250,
            yoyo: true,
            hold: 1000,
            onComplete: () => txt.destroy()
        });
    }

}

const GAME_RENDER_RESOLUTION = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);

function installTextResolutionDefault(PhaserRef, resolution) {
    const factoryProto = PhaserRef?.GameObjects?.GameObjectFactory?.prototype;
    if (!factoryProto?.text || factoryProto.text._processV2ResolutionPatched) return;

    const originalTextFactory = factoryProto.text;
    const defaultResolution = Math.max(1, Number(resolution) || 1);

    factoryProto.text = function textWithDefaultResolution(x, y, text, style = {}) {
        const nextStyle = (style && typeof style === "object") ? { ...style } : {};
        const styleResolution = Number(nextStyle.resolution);
        if (!Number.isFinite(styleResolution) || styleResolution <= 0) {
            nextStyle.resolution = defaultResolution;
        }
        return originalTextFactory.call(this, x, y, text, nextStyle);
    };

    factoryProto.text._processV2ResolutionPatched = true;
}

installTextResolutionDefault(Phaser, GAME_RENDER_RESOLUTION);

const config = {
    type: Phaser.AUTO,
    parent: "game",            // or whatever div id you use
    dom: { createContainer: true },  // <-- THIS fixes the error
    autoRound: true,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0x156c99,
    resolution: GAME_RENDER_RESOLUTION,
    scene: [mapView, GameUIScene, itemTab],
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    plugins: {
        scene: [
            {
                key: 'rexUI',
                plugin: UIPlugin,
                mapping: 'rexUI'
            }
        ]
    },
    physics: {
        default: 'arcade',
        arcade: { debug: false }
    }
};


new Phaser.Game(config);











