// BuildTab.js (v2)
// VERTICAL cards (icon + name + desc + cost). Charged only on placement commit.
// Uses iconKey placeholders; you’ll swap to real images later.

import { UIDEPTH, SQUARESIZE, showAlert, TILE_TYPES } from "../../constants";
import { Map as GameMap } from "../../map";
import { Teams } from "../../Teams";
import { buildingManager } from "../../Manager/buildingManager";
import { StorageManager } from "../../Manager/StorageManager";
import { AudioManager } from "../../Manager/AudioManager.js";
import { House } from "../../buildings/House";
import { Turret } from "../../buildings/Turret";
import { Catapult } from "../../buildings/Catapult";
import { townRoads } from "../../town";
import { Farmer } from "../../players/Farmer";
import { Builder } from "../../players/Builder";
import { Forager } from "../../players/Forager";
import { Fireman } from "../../players/Fireman";
import { Brawler } from "../../players/Brawler";
import { Blademaster } from "../../players/Blademaster";
import { Gunslinger } from "../../players/Gunslinger";
import { formatPermitCostText } from "../../permitSystem";
import { hasStoreUnlock, STORE_UNLOCK_KEYS } from "../../parcel_system/StoreUnlockSystem";
import { getQuickSellPermitValue, getRecruitCost } from "../../balance/GameBalance";
import {
  addViewportScrollAffordance,
  BOTTOM_BAR_THEME,
  getBottomBarWidth,
  makeGlassRoundRect,
  mixColor,
} from "./BottomBarTheme";
import { BODY_FONT_FAMILY } from "../Typography.js";

const RARITY = {
  common: { border: 0x2ecc71, label: "#2ecc71" }, // green
  rare:   { border: 0x4aa3ff, label: "#4aa3ff" }, // blue
  epic:   { border: 0xd86bff, label: "#d86bff" }, // pink-purple
};

const SPECIAL_BUILD_PLACERS = {
  turret: Turret,
  catapult: Catapult,
};

const QUICK_SELL_PRIORITY = Object.freeze({
  wood: 10,
  stone: 11,
  clean_water: 20,
  food: 21,
  rawFood: 22,
  crop: 23,
  seedCrop: 30,
  seedBerry: 31,
  unclean_water: 40,
});

const UNIT_STORE = [
  {
    key: "farmer",
    name: "Farmer",
    desc: "Plants, waters, and tends crops.",
    cost: { money: 90 },
    iconKey: "icon_farmer_store",
    portraitTexture: "portrait_farmer_healthy",
    unitClass: Farmer,
  },
  {
    key: "builder",
    name: "Builder",
    desc: "Constructs and repairs your structures.",
    cost: { money: 110 },
    iconKey: "icon_builder_store",
    portraitTexture: "portrait_builder_healthy",
    unitClass: Builder,
  },
  {
    key: "forager",
    name: "Forager",
    desc: "Harvests crops and gathers seeds.",
    cost: { money: 100 },
    iconKey: "icon_forager_store",
    portraitTexture: "portrait_forager_healthy",
    unitClass: Forager,
  },
  {
    key: "fireman",
    name: "Fireman",
    desc: "Runs ovens and keeps water flowing.",
    cost: { money: 100 },
    iconKey: "icon_fireman_store",
    portraitTexture: "portrait_fireman_healthy",
    unitClass: Fireman,
  },
  {
    key: "brawler",
    name: "Brawler",
    desc: "Fast melee bruiser for close fights.",
    cost: { money: 140 },
    iconKey: "icon_brawler_store",
    portraitTexture: "portrait_brawler_healthy",
    unitClass: Brawler,
  },
  {
    key: "blademaster",
    name: "Blademaster",
    desc: "Elite sword fighter with heavy hits.",
    cost: { money: 300 },
    unlockKey: STORE_UNLOCK_KEYS.blademaster,
    iconKey: "icon_blademaster_store",
    portraitTexture: "portrait_blademaster_healthy",
    unitClass: Blademaster,
  },
  {
    key: "gunslinger",
    name: "Gunslinger",
    desc: "Ranged fighter with high recruit cost.",
    cost: { money: 450 },
    unlockKey: STORE_UNLOCK_KEYS.gunslinger,
    iconKey: "icon_gunslinger_store",
    portraitTexture: "portrait_gunslinger_healthy",
    unitClass: Gunslinger,
  },
];

function getUnitRarity(price) {
  if (price >= 400) return "epic";
  if (price >= 200) return "rare";
  return "common";
}

function buildIconTexture(scene, iconKey, drawFn) {
  if (scene.textures.exists(iconKey)) scene.textures.remove(iconKey);
  const rt = scene.make.renderTexture({ width: 64, height: 64, add: false });
  rt.clear();
  drawFn(rt);
  rt.saveTexture(iconKey);
  rt.destroy();
}

function drawCenteredTexture(scene, rt, {
  key,
  frame = null,
  scale = 1,
  x = 32,
  y = 32,
  useSprite = false,
}) {
  const obj = useSprite
    ? scene.make.sprite({ x, y, key, frame, add: false })
    : scene.make.image({ x, y, key, add: false });
  obj.setOrigin(0.5);
  obj.setScale(scale);
  rt.draw(obj);
  obj.destroy();
}

function ensureBuildTabIcons(scene) {
  buildIconTexture(scene, "icon_storage", (rt) => {
    drawCenteredTexture(scene, rt, { key: "storage", scale: 1 });
  });

  buildIconTexture(scene, "icon_town_tower", (rt) => {
    drawCenteredTexture(scene, rt, { key: "tower", frame: 0, scale: 0.72, useSprite: true });
  });

  buildIconTexture(scene, "icon_clay_oven", (rt) => {
    drawCenteredTexture(scene, rt, { key: "clayOven", frame: 0, scale: 1, useSprite: true });
  });

  buildIconTexture(scene, "icon_stone_wall", (rt) => {
    drawCenteredTexture(scene, rt, { key: "wall_interior", frame: 0, scale: 1.5, useSprite: true });
  });

  buildIconTexture(scene, "icon_wood_wall", (rt) => {
    drawCenteredTexture(scene, rt, { key: "woodWall_interior", frame: 0, scale: 1.5, useSprite: true });
  });

  buildIconTexture(scene, "icon_turret_store", (rt) => {
    drawCenteredTexture(scene, rt, { key: "image7", scale: 0.85, x: 32, y: 40 });
    drawCenteredTexture(scene, rt, { key: "image7a", scale: 0.85, x: 32, y: 20 });
  });

  buildIconTexture(scene, "icon_catapult_store", (rt) => {
    drawCenteredTexture(scene, rt, { key: "catapult_base", scale: 0.76, x: 32, y: 38 });
    drawCenteredTexture(scene, rt, { key: "catapult_top", frame: 1, scale: 0.76, x: 32, y: 24, useSprite: true });
  });

  UNIT_STORE.forEach((unit) => {
    buildIconTexture(scene, unit.iconKey, (rt) => {
      drawCenteredTexture(scene, rt, {
        key: unit.portraitTexture,
        frame: 0,
        scale: 1.05,
        y: 34,
        useSprite: true,
      });
    });
  });
}

function hasResources(scene, cost) {
  if (!cost) return true;
  return buildingManager.hasRequiredMaterials(cost, "1");
}

function joinNatural(parts) {
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function formatMissingCostMessage(cost) {
  const missing = buildingManager.getMissingMaterials?.(cost, "1") || [];
  if (!missing.length) return "Not enough resources";

  const parts = missing.map((entry) => {
    const amount = Math.max(0, Number(entry.missing || 0));
    if (entry.key === "money") return `$${amount}`;
    if (entry.key === "permits") return `${amount} permit${amount === 1 ? "" : "s"}`;
    return `${amount} ${entry.label || String(entry.key).replace(/_/g, " ")}`;
  });

  return `Missing ${joinNatural(parts)}`;
}

function spendResources(scene, cost) {
  if (!cost) return;
  buildingManager.consumeRequiredMaterials(cost, "1");
}

function fmtCost(cost) {
  if (!cost) return "";
  const entries = Object.entries(cost).filter(([, value]) => Number(value) > 0);
  if (!entries.length) return "FREE";
  if (entries.length === 1) {
    const [key, value] = entries[0];
    if (key === "money") return `$${value}`;
    if (key === "permits") return formatPermitCostText(value);
    if (key === "clean_water") return `water:${value}`;
    return `${key}:${value}`;
  }
  const parts = [];
  for (const [k, v] of entries) {
    if (k === "permits") parts.push(formatPermitCostText(v));
    else
    if (k === "money") parts.push(`$${v}`);
    else if (k === "clean_water") parts.push(`water:${v}`);
    else parts.push(`${k}:${v}`);
  }
  return parts.join("  ");
}

function makeIcon(scene, def, w, h) {
  if (def.iconKey && scene.textures.exists(def.iconKey)) {
    const img = scene.add.image(0, 0, def.iconKey);
    const tex = scene.textures.get(def.iconKey)?.getSourceImage?.();
    const srcW = tex?.width || img.width || w;
    const srcH = tex?.height || img.height || h;
    const scale = Math.min(w / srcW, h / srcH);
    img.setScale(scale);
    return img;
  }

  // Placeholder visual + label so you know what to replace.
  const c = scene.rexUI.add.sizer({ orientation: "y", space: { item: 4 } });
  const box = makeGlassRoundRect(scene, w, h, 16, {
    fill: mixColor(BOTTOM_BAR_THEME.panelFill, 0xffffff, 0.04),
    alpha: 0.9,
    stroke: 0xffffff,
    strokeAlpha: 0.12,
    strokeWidth: 1.5,
  });
  const label = scene.add.text(0, 0, def.iconKey ?? "icon_missing", {
    fontSize: "10px",
    fontFamily: "Bungee",
    color: BOTTOM_BAR_THEME.textMuted,
    align: "center",
    wordWrap: { width: w }
  }).setOrigin(0.5, 0.5);

  c.add(box, { expand: false, align: "center" });
  c.add(label, { expand: false, align: "center" });
  return c;
}

function normalizeTileCost(tile) {
  if (!tile) return {};

  // prefer cost; fallback to price
  const raw = tile.cost ?? tile.price ?? {};

  // some tiles use numeric `price` (money), normalize it
  if (typeof raw === "number") return { money: raw };
  if (typeof raw === "object") return raw;

  return {};
}

function getDefCost(def, scene = null) {
  const world = scene?.worldScene ?? scene;
  if (def?.isUnit) {
    if (world?.hasRecruitVoucher?.()) return { money: 0 };
    return { money: getRecruitCost(def.recruitType || def.key, world) };
  }
  if (def?.key === "house") {
    return Teams.getHouseBuildCost?.(world?.teamNumber ?? "1") ?? { wood: 4, stone: 4, permits: 1 };
  }
  if (def?.cost) return def.cost;
  // walls: use wallTypeName; buildings: tileTypeName
  const tileKey = def.isWall ? def.wallTypeName : def.tileTypeName;
  return normalizeTileCost(TILE_TYPES[tileKey]);
}

function getSpecialBuildPlacer(tile) {
  return tile?.name ? SPECIAL_BUILD_PLACERS[tile.name] ?? null : null;
}

function applyBuildTabToggleVisual(bg, text, active, accent) {
  bg.setFillStyle(
    active ? mixColor(accent, 0xffffff, 0.12) : mixColor(BOTTOM_BAR_THEME.panelFill, 0xffffff, 0.06),
    active ? 0.94 : 0.82
  );
  bg.setStrokeStyle(active ? 2 : 1.5, active ? accent : mixColor(accent, 0x98e7ff, 0.35), active ? 0.52 : 0.16);
  text.setColor(active ? "#fff9ef" : BOTTOM_BAR_THEME.textSoft);
}

export default class BuildTab {
  constructor(scene, x, y, width, height) {
    this.scene = scene;
    this.width = width;
    this.height = height;

    this.activeKey = null;
    this.pendingDef = null;
    this._placeClickBound = false;
    this.mode = "buildings";
    this._quickSellState = null;
    this._cardsScrollHooksBound = false;
    this._placementInputScene = null;
    this._onCardsPointerUp = null;
    this._onCardsPointerMove = null;
    this._onCardsWheel = null;
    this._onPlacePointerDown = null;
    this._onPlaceEsc = null;
    this._cardsScrollByMode = { buildings: 0, units: 0 };

    ensureBuildTabIcons(scene);

    this.view = scene.add.container(0, 0).setDepth(UIDEPTH);
    this.container = this.view; // if you referenced this.container elsewhere
    this.container.setOrigin?.(0, 0); // safe if available

    scene.buildTab = this;

    this._buildDefs = this._makeBuildDefs();
    this._unitDefs = this._makeUnitDefs();
    this._cardRefs = [];

    this._onStoreUnlockChanged = () => this.refreshAvailableDefs();
    scene.events.on("store:unlock-changed", this._onStoreUnlockChanged);
    this._onHousingChanged = () => {
      if (this.mode === "buildings") this._makeUI();
    };
    scene.events.on("housing:updated", this._onHousingChanged);
    this._onPhaseChanged = () => {
      this.refreshAvailableDefs();
    };
    scene.events.on("phase:changed", this._onPhaseChanged);
    this._onRewardStateChanged = () => this.refreshAvailableDefs();
    scene.events.on("reward-state:changed", this._onRewardStateChanged);
    scene.events.once("shutdown", () => {
      scene.events.off("store:unlock-changed", this._onStoreUnlockChanged);
      scene.events.off("housing:updated", this._onHousingChanged);
      scene.events.off("reward-state:changed", this._onRewardStateChanged);
    });

    this._makeUI();
    this._ensurePlacementHooks();

    this.container.setScrollFactor(0).setDepth(UIDEPTH);
  }

  destroy() {
    this.scene.events.off("store:unlock-changed", this._onStoreUnlockChanged);
    this.scene.events.off("housing:updated", this._onHousingChanged);
    this.scene.events.off("phase:changed", this._onPhaseChanged);
    this.scene.events.off("reward-state:changed", this._onRewardStateChanged);
    if (this._onCardsPointerUp) {
      this.scene.input.off("pointerup", this._onCardsPointerUp);
      this._onCardsPointerUp = null;
    }
    if (this._onCardsPointerMove) {
      this.scene.input.off("pointermove", this._onCardsPointerMove);
      this._onCardsPointerMove = null;
    }
    if (this._onCardsWheel) {
      this.scene.input.off("wheel", this._onCardsWheel);
      this._onCardsWheel = null;
    }
    this._cardsScrollAffordance?.destroy?.();
    this._cardsScrollAffordance = null;
    if (this._placementInputScene?.input && this._onPlacePointerDown) {
      this._placementInputScene.input.off("pointerdown", this._onPlacePointerDown);
    }
    if (this._placementInputScene?.input?.keyboard && this._onPlaceEsc) {
      this._placementInputScene.input.keyboard.off("keydown-ESC", this._onPlaceEsc);
    }
    this._onPlacePointerDown = null;
    this._onPlaceEsc = null;
    this._placementInputScene = null;
    this.view?.removeAll?.(true);
    this.view?.destroy?.(true);
    this.view = null;
    this.container = null;
    this._cardRefs = [];
  }

  _makeBuildDefs() {
    const defs = [
      { key: "tower", name: "Town Tower", desc: "Pays income and expansion permits at dawn.", rarity: "rare", iconKey: "icon_town_tower", tileTypeName: "tower" },
      { key:"house", name:"House", desc:"Adds housing capacity.", rarity:"common", iconKey:"icon_house", tileTypeName:"house1" },
      { key: "storage",  name: "Storage",   desc: "More inventory space.",  rarity: "common", iconKey: "icon_storage",  tileTypeName: "storage",},
      { key: "clayOven", name: "Clay Oven", desc: "Cook food over time.",   rarity: "common", iconKey: "icon_clay_oven",tileTypeName: "clayOven",},

      // Walls live here now
      { key: "woodWall",  name: "Wood Wall",  desc: "Cheap defense.", rarity: "common", iconKey: "icon_wood_wall",  wallTypeName: "woodWall",  isWall: true },
    ];

    if (hasStoreUnlock(STORE_UNLOCK_KEYS.stoneWall)) {
      defs.push({
        key: "stoneWall",
        name: "Stone Wall",
        desc: "Tough defense.",
        rarity: "rare",
        iconKey: "icon_stone_wall",
        wallTypeName: "wall",
        isWall: true,
      });
    }

    return defs;
  }

  _makeUnitDefs() {
    return UNIT_STORE.filter((unit) => !unit.unlockKey || hasStoreUnlock(unit.unlockKey)).map((unit) => ({
      costMoney: getRecruitCost(unit.key, this.scene),
      key: unit.key,
      name: unit.name,
      desc: unit.desc,
      rarity: getUnitRarity(getRecruitCost(unit.key, this.scene)),
      iconKey: unit.iconKey,
      unitClass: unit.unitClass,
      recruitType: unit.key,
      cost: unit.cost,
      isUnit: true,
    }));
  }

  _getCurrentDefs() {
    return this.mode === "units" ? this._unitDefs : this._buildDefs;
  }

  _getTutorialManager() {
    return this.scene.worldScene?.tutorialManager || this.scene.tutorialManager || null;
  }

  _getWorldScene() {
    return this.scene.worldScene ?? this.scene;
  }

  _getQuickSellReserves(teamNumber = "1") {
    const housing = Teams.getHousingStatus?.(teamNumber) ?? {};
    const playerCount = Math.max(0, Number(housing.playerCount || 0));
    const foodReserve = Math.max(4, Math.min(8, playerCount + 1));
    return {
      wood: 4,
      stone: 4,
      clean_water: foodReserve,
      food: foodReserve,
      rawFood: 2,
      crop: 2,
      seedCrop: 4,
      seedBerry: 4,
      unclean_water: 2,
      permits: 1,
    };
  }

  _buildQuickSellPlan(def) {
    const world = this._getWorldScene();
    const targetMoney = Math.max(0, Number(getDefCost(def, this.scene)?.money || 0));
    const currentMoney = Math.max(0, Number(world?.money || 0));
    const shortfall = Math.max(0, targetMoney - currentMoney);
    if (!(shortfall > 0)) return null;

    const teamNumber = "1";
    const team = Teams.getTeam?.(teamNumber);
    const reserves = this._getQuickSellReserves(teamNumber);
    const totalsByItem = {};
    const slotCandidates = [];

    for (const storage of team?.storageList || []) {
      const slots = Array.isArray(storage?.storageItems) ? storage.storageItems : [];
      slots.forEach((slot, slotIndex) => {
        const item = slot?.item;
        const amount = Math.max(0, Number(slot?.amount || 0));
        if (!item?.name || !(amount > 0)) return;
        const unitPrice = Math.max(0, Number(StorageManager.getStorageSellPrice(item) || 0));
        if (!(unitPrice > 0)) return;

        const itemName = item.name;
        totalsByItem[itemName] = Math.max(0, Number(totalsByItem[itemName] || 0)) + amount;
        slotCandidates.push({
          source: "storage",
          storage,
          slotIndex,
          itemName,
          label: item.label || item.name,
          count: amount,
          unitPrice,
          priority: QUICK_SELL_PRIORITY[itemName] ?? 999,
        });
      });
    }

    slotCandidates.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.unitPrice !== b.unitPrice) return b.unitPrice - a.unitPrice;
      if (a.count !== b.count) return b.count - a.count;
      return a.slotIndex - b.slotIndex;
    });

    const soldByItem = {};
    const actions = [];
    let remainingShortfall = shortfall;

    for (const candidate of slotCandidates) {
      if (!(remainingShortfall > 0)) break;
      const reserve = Math.max(0, Number(reserves[candidate.itemName] || 0));
      const total = Math.max(0, Number(totalsByItem[candidate.itemName] || 0));
      const alreadyPlanned = Math.max(0, Number(soldByItem[candidate.itemName] || 0));
      const sellable = Math.max(0, total - reserve - alreadyPlanned);
      if (!(sellable > 0)) continue;

      const neededAmount = Math.ceil(remainingShortfall / candidate.unitPrice);
      const amount = Math.min(candidate.count, sellable, neededAmount);
      if (!(amount > 0)) continue;

      const revenue = amount * candidate.unitPrice;
      actions.push({
        ...candidate,
        amount,
        revenue,
      });
      soldByItem[candidate.itemName] = alreadyPlanned + amount;
      remainingShortfall -= revenue;
    }

    const permitCount = Math.max(0, Number(world?.permits || 0));
    const sellablePermits = Math.max(0, permitCount - Math.max(0, Number(reserves.permits || 0)));
    if (remainingShortfall > 0 && sellablePermits > 0) {
      const permitUnitPrice = getQuickSellPermitValue(world);
      const amount = Math.min(sellablePermits, Math.ceil(remainingShortfall / permitUnitPrice));
      if (amount > 0) {
        const revenue = amount * permitUnitPrice;
        actions.push({
          source: "permits",
          itemName: "permits",
          label: amount === 1 ? "Permit" : "Permits",
          amount,
          unitPrice: permitUnitPrice,
          revenue,
          priority: 1000,
        });
        remainingShortfall -= revenue;
      }
    }

    if (remainingShortfall > 0 || !actions.length) {
      return null;
    }

    const totalRevenue = actions.reduce((sum, action) => sum + Math.max(0, Number(action.revenue || 0)), 0);
    return {
      defKey: def.key,
      targetMoney,
      currentMoney,
      shortfall,
      totalRevenue,
      actions,
    };
  }

  _summarizeQuickSellActions(actions = []) {
    const merged = new Map();
    actions.forEach((action) => {
      const key = `${action.source}:${action.itemName}`;
      const existing = merged.get(key) || {
        label: action.label,
        amount: 0,
        revenue: 0,
      };
      existing.amount += Math.max(0, Number(action.amount || 0));
      existing.revenue += Math.max(0, Number(action.revenue || 0));
      merged.set(key, existing);
    });
    return [...merged.values()];
  }

  _formatQuickSellPlanText(plan) {
    if (!plan?.actions?.length) return "";
    const entries = this._summarizeQuickSellActions(plan.actions);
    const lines = entries.slice(0, 3).map((entry) => (
      `${entry.amount} ${entry.label}  $${entry.revenue}`
    ));
    if (entries.length > 3) {
      lines[lines.length - 1] = `+${entries.length - 2} more stock lines`;
    }
    return lines.join("\n");
  }

  _closeQuickSell() {
    if (!this._quickSellState) return;
    this._quickSellState = null;
    this._refreshQuickSellOverlay();
  }

  _openQuickSell(def, plan) {
    this._quickSellState = { key: def.key, plan };
    this._refreshQuickSellOverlay();
  }

  _refreshQuickSellOverlay() {
    this._cardRefs.forEach((ref) => {
      const overlay = ref?.quickSellOverlay;
      if (!overlay) return;
      const activePlan = this._quickSellState?.key === ref.def?.key ? this._quickSellState.plan : null;
      overlay.setVisible(!!activePlan);
      if (!activePlan) return;

      ref.quickSellNeed?.setText(`Need $${Math.max(0, Number(activePlan.shortfall || 0))} more`);
      ref.quickSellItems?.setText(this._formatQuickSellPlanText(activePlan));
      ref.quickSellTotal?.setText(`Raises $${Math.max(0, Number(activePlan.totalRevenue || 0))}`);
    });
  }

  _runQuickSellPlan(plan, sourceUiTarget = null) {
    if (!plan?.actions?.length) return { totalRevenue: 0, soldAnything: false };

    const storageActions = plan.actions
      .filter((action) => action.source === "storage")
      .slice()
      .sort((a, b) => {
        if (a.storage === b.storage) return b.slotIndex - a.slotIndex;
        return 0;
      });

    let totalRevenue = 0;
    let soldAnything = false;

    for (const action of storageActions) {
      const result = StorageManager.sellFromStorage(
        action.storage,
        action.slotIndex,
        action.amount,
        this.scene,
        { sourceUiTarget }
      );
      if ((result?.sold || 0) > 0) {
        totalRevenue += Math.max(0, Number(result.revenue || 0));
        soldAnything = true;
      }
    }

    const permitActions = plan.actions.filter((action) => action.source === "permits");
    if (permitActions.length) {
      const world = this._getWorldScene();
      for (const action of permitActions) {
        const available = Math.max(0, Number(world?.permits || 0));
        const amount = Math.min(available, Math.max(0, Number(action.amount || 0)));
        if (!(amount > 0)) continue;
        world?.updatePermits?.(-amount);
        const unitPrice = Math.max(0, Number(action.unitPrice || getQuickSellPermitValue(world)));
        const revenue = amount * unitPrice;
        world?.updateMoney?.(revenue, { sourceUiTarget });
        totalRevenue += revenue;
        soldAnything = true;
      }
    }

    return { totalRevenue, soldAnything };
  }

  _confirmQuickSell(def, ref) {
    const plan = this._quickSellState?.key === def.key ? this._quickSellState.plan : null;
    if (!plan) return;

    const costObj = getDefCost(def, this.scene);
    if (hasResources(this.scene, costObj)) {
      this._closeQuickSell();
      this._recruitUnit(def, { allowQuickSell: false });
      return;
    }

    const freshPlan = this._buildQuickSellPlan(def);
    if (!freshPlan) {
      this._closeQuickSell();
      showAlert(this.scene, "No spare stock to sell", "#ff5555");
      return;
    }

    const { soldAnything } = this._runQuickSellPlan(freshPlan, ref?.quickSellConfirmHit ?? null);
    this._closeQuickSell();
    if (!soldAnything) {
      showAlert(this.scene, "No spare stock to sell", "#ff5555");
      return;
    }

    this._recruitUnit(def, { allowQuickSell: false });
  }

  _makeUI() {
    const scene = this.scene;
    this._rememberCardsScroll();
    const preservedScrollX = this._getRememberedCardsScroll(this.mode);

    this._cardsScrollAffordance?.destroy?.();
    this._cardsScrollAffordance = null;

    // Clear old children if hot-reloading
    this.view.removeAll(true);
    this._cardRefs = [];

    // Local coordinate system: 0,0 is center of the page area (CardsTab-style)
    const centerX = 0;
    const topY = -106;

    const toggleY = topY + 18;
    const buildToggleBg = makeGlassRoundRect(scene, 112, 30, 15, {
      fill: 0x1a4258,
      alpha: 0.82,
      stroke: 0xff97c2,
      strokeAlpha: 0.18,
      strokeWidth: 1.5,
    }).setPosition(centerX - 70, toggleY)
      .setInteractive({ useHandCursor: true });
    const buildToggleText = scene.add.text(centerX - 70, toggleY, "Buildings", {
      fontSize: "12px",
      fontFamily: "Bungee",
      color: this.mode === "buildings" ? "#ffe7f4" : BOTTOM_BAR_THEME.textSoft,
      stroke: "#081621",
      strokeThickness: 2,
    }).setOrigin(0.5);

    const unitToggleBg = makeGlassRoundRect(scene, 112, 30, 15, {
      fill: 0x1a4258,
      alpha: 0.82,
      stroke: 0x98e7ff,
      strokeAlpha: 0.18,
      strokeWidth: 1.5,
    }).setPosition(centerX + 70, toggleY)
      .setInteractive({ useHandCursor: true });
    const unitToggleText = scene.add.text(centerX + 70, toggleY, "Troops", {
      fontSize: "12px",
      fontFamily: "Bungee",
      color: this.mode === "units" ? "#ffe7f4" : BOTTOM_BAR_THEME.textSoft,
      stroke: "#081621",
      strokeThickness: 2,
    }).setOrigin(0.5);

    buildToggleBg.on("pointerdown", () => {
      AudioManager.playBottomBarClick();
      this._trySetMode("buildings");
    });
    buildToggleText.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
      AudioManager.playBottomBarClick();
      this._trySetMode("buildings");
    });
    unitToggleBg.on("pointerdown", () => {
      AudioManager.playBottomBarClick();
      this._trySetMode("units");
    });
    unitToggleText.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
      AudioManager.playBottomBarClick();
      this._trySetMode("units");
    });
    applyBuildTabToggleVisual(buildToggleBg, buildToggleText, this.mode === "buildings", 0xff97c2);
    applyBuildTabToggleVisual(unitToggleBg, unitToggleText, this.mode === "units", 0x98e7ff);

    this.view.add([buildToggleBg, buildToggleText, unitToggleBg, unitToggleText]);

    // ----- Card layout constants -----
    const CARD_W = 272;
    const CARD_H = 136;
    const ICON_W = 76;
    const ICON_H = 76;

    const gap = 18;

    // ----- Scroller viewport (masked) -----
    // width: leave margin so it looks like CardsTab and doesn't touch edges
    const pageWidth = Math.max(320, Math.min(this.width || getBottomBarWidth(scene), getBottomBarWidth(scene)));
    const viewportW = Math.max(320, pageWidth - 32);
    const viewportH = CARD_H + 18;
    const viewportY = topY + 38;
    const viewportX = centerX;

    // Hit area (dragging works anywhere in the viewport)
    const viewportHit = scene.add.rectangle(viewportX, viewportY, viewportW, viewportH, 0x000000, 0.001)
      .setOrigin(0.5, 0)
      .setInteractive({ useHandCursor: true });

    // Viewport bounds for horizontal scrolling
    const left = viewportX - viewportW / 2;
    const top = viewportY;

    // Content container starts at viewport top-left
    const cardsContainer = scene.add.container(left, top);

    // Optional visual lane so the horizontal scroller area is obvious
    const viewportFrame = makeGlassRoundRect(scene, viewportW, viewportH, 24, {
      fill: mixColor(BOTTOM_BAR_THEME.panelFill, 0xffffff, 0.08),
      alpha: 0.74,
      stroke: 0x98e7ff,
      strokeAlpha: 0.16,
      strokeWidth: 1.5,
    }).setOrigin(0.5, 0);
    viewportFrame.setPosition(viewportX, viewportY);
    const viewportGlow = scene.add.rectangle(viewportX, viewportY + 16, viewportW - 24, 18, 0xffffff, 0.08)
      .setOrigin(0.5, 0);

    // Add to view
    this.view.add([viewportFrame, viewportGlow, viewportHit, cardsContainer]);

    // Store for scrolling helpers
    this._cardsContainer = cardsContainer;
    this._cardsViewport = { left, top, w: viewportW, h: viewportH };
    this._cardsViewportHit = viewportHit;
    this._cardsScrollX = preservedScrollX;
    this._cardsContentW = 0;
    this._cardsScrollAffordance = addViewportScrollAffordance(
      scene,
      this.view,
      () => this._cardsViewport,
      () => {
        const viewportW = this._cardsViewport?.w || 0;
        const contentW = this._cardsContentW || 0;
        const minScroll = Math.min(0, viewportW - contentW);
        const bounds = this._cardsViewportHit?.getBounds?.();
        const pointer = scene.input?.activePointer;
        const hovered = this._cardsDragging || !!(bounds && pointer && Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y));
        return {
          overflow: contentW > viewportW + 1,
          hovered,
          canBack: (this._cardsScrollX || 0) < -1,
          canForward: (this._cardsScrollX || 0) > minScroll + 1,
          viewportRatio: contentW > 0 ? Phaser.Math.Clamp(viewportW / contentW, 0.12, 1) : 1,
          progress: minScroll < 0 ? Phaser.Math.Clamp((this._cardsScrollX || 0) / minScroll, 0, 1) : 0,
        };
      },
      {
        orientation: "x",
        isActive: () => this.scene.uiBottomBar?.expanded && this.scene.uiBottomBar?.currentPage === "build",
      }
    );

    // ----- Build cards horizontally -----
    let xCursor = 0;

    // card center Y inside viewport
    const cardCenterY = 10 + CARD_H / 2;

    this._getCurrentDefs().forEach((def) => {
      const rarity = RARITY[def.rarity] ?? RARITY.common;

      const x = xCursor + CARD_W / 2;
      const y = cardCenterY;
      const icon = makeIcon(scene, def, ICON_W, ICON_H);
      const iconAura = scene.add.ellipse(0, 0, 84, 84, rarity.border, 0.16).setOrigin(0.5);
      const name = scene.add.text(0, 0, def.name, {
        fontSize: "16px",
        fontFamily: "Bungee",
        color: BOTTOM_BAR_THEME.text,
        fontStyle: "bold",
        stroke: "#081621",
        strokeThickness: 3,
        align: "left",
        wordWrap: { width: CARD_W - 124 }
      }).setOrigin(0, 0);

      const desc = scene.add.text(0, 0, def.desc ?? "", {
        fontSize: "11px",
        fontFamily: "Bungee",
        color: BOTTOM_BAR_THEME.textMuted,
        stroke: "#081621",
        strokeThickness: 2,
        align: "left",
        lineSpacing: 2,
        wordWrap: { width: CARD_W - 124 }
      }).setOrigin(0, 0);

      // ✅ Cost from TILE_TYPES via your helper
      const costObj = getDefCost(def, scene);
      const cost = scene.add.text(0, 0, fmtCost(costObj), {
        fontSize: "11px",
        fontFamily: "Bungee",
        color: "#fff0bf",
        stroke: "#5a2c00",
        strokeThickness: 2,
        align: "left",
        wordWrap: { width: CARD_W - 124 }
      }).setOrigin(0, 0);
      const cardGlow = scene.add.rectangle(0, 0, CARD_W - 10, CARD_H - 10, rarity.border, 0.1)
        .setOrigin(0.5)
        .setAlpha(0.14)
        .setScale(0.94);
      const cardBg = makeGlassRoundRect(scene, CARD_W, CARD_H, 22, {
        fill: mixColor(BOTTOM_BAR_THEME.cardFill, rarity.border, 0.12),
        alpha: 0.94,
        stroke: rarity.border,
        strokeAlpha: 0.34,
        strokeWidth: 2,
      });
      const cardShine = scene.add.rectangle(0, -CARD_H / 2 + 18, CARD_W - 28, 18, 0xffffff, 0.08).setOrigin(0.5);
      iconAura.setPosition(-CARD_W / 2 + 56, 0);
      icon.setPosition(-CARD_W / 2 + 56, 0);
      name.setPosition(-CARD_W / 2 + 102, -CARD_H / 2 + 22);
      desc.setPosition(-CARD_W / 2 + 102, -8);
      cost.setPosition(-CARD_W / 2 + 102, CARD_H / 2 - 28);
      const hit = scene.add.zone(0, 0, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
      const card = scene.add.container(x, y, [cardGlow, cardBg, cardShine, iconAura, icon, name, desc, cost, hit]);

      hit.on("pointerdown", () => {
        AudioManager.playBottomBarClick();
        this._select(def.key);
      });

      const cardRef = {
        def,
        bg: cardBg,
        glow: cardGlow,
        iconAura,
        name,
        desc,
        cost,
        card,
        baseY: y,
        hit,
        hovered: false,
      };

      if (def.isUnit) {
        const overlayShade = makeGlassRoundRect(scene, CARD_W - 10, CARD_H - 10, 20, {
          fill: mixColor(BOTTOM_BAR_THEME.panelFill, 0x020812, 0.6),
          alpha: 0.96,
          stroke: 0xffd38a,
          strokeAlpha: 0.22,
          strokeWidth: 1.5,
        });
        const overlayBlocker = scene.add.zone(0, 0, CARD_W, CARD_H).setInteractive();
        const overlayTitle = scene.add.text(0, -44, "QUICK SELL", {
          fontSize: "12px",
          fontFamily: "Bungee",
          color: "#ffe8bf",
          stroke: "#081621",
          strokeThickness: 3,
          align: "center",
        }).setOrigin(0.5);
        const overlayNeed = scene.add.text(0, -24, "", {
          fontSize: "10px",
          fontFamily: "Bungee",
          color: "#ffffff",
          stroke: "#081621",
          strokeThickness: 3,
          align: "center",
        }).setOrigin(0.5);
        const overlayItems = scene.add.text(0, 4, "", {
          fontSize: "12px",
          fontFamily: BODY_FONT_FAMILY,
          color: "#d7e8f4",
          stroke: "#081621",
          strokeThickness: 1,
          align: "center",
          lineSpacing: 1,
          wordWrap: { width: CARD_W - 34 },
        }).setOrigin(0.5);
        const overlayTotal = scene.add.text(0, 26, "", {
          fontSize: "10px",
          fontFamily: "Bungee",
          color: "#9ef2c8",
          stroke: "#081621",
          strokeThickness: 3,
          align: "center",
        }).setOrigin(0.5);

        const confirmBg = makeGlassRoundRect(scene, 132, 24, 12, {
          fill: 0x1f6a4b,
          alpha: 0.96,
          stroke: 0x8ef2bf,
          strokeAlpha: 0.34,
          strokeWidth: 1.5,
        }).setPosition(-40, 50);
        const confirmText = scene.add.text(-40, 50, "Sell + Recruit", {
          fontSize: "10px",
          fontFamily: "Bungee",
          color: "#f5fff8",
          stroke: "#081621",
          strokeThickness: 3,
        }).setOrigin(0.5);
        const confirmHit = scene.add.zone(-40, 50, 132, 24).setInteractive({ useHandCursor: true });

        const cancelBg = makeGlassRoundRect(scene, 72, 24, 12, {
          fill: 0x5a2431,
          alpha: 0.94,
          stroke: 0xff9eb0,
          strokeAlpha: 0.28,
          strokeWidth: 1.5,
        }).setPosition(76, 50);
        const cancelText = scene.add.text(76, 50, "Cancel", {
          fontSize: "10px",
          fontFamily: "Bungee",
          color: "#fff5f7",
          stroke: "#081621",
          strokeThickness: 3,
        }).setOrigin(0.5);
        const cancelHit = scene.add.zone(76, 50, 72, 24).setInteractive({ useHandCursor: true });

        overlayBlocker.on("pointerdown", (_pointer, _lx, _ly, event) => {
          event?.stopPropagation?.();
        });
        overlayBlocker.on("pointerup", (_pointer, _lx, _ly, event) => {
          event?.stopPropagation?.();
        });

        const bindOverlayButton = (hitNode, bgNode, onClick) => {
          hitNode.on("pointerover", (_pointer, _lx, _ly, event) => {
            event?.stopPropagation?.();
            bgNode.setAlpha(1);
          });
          hitNode.on("pointerout", (_pointer, event) => {
            event?.stopPropagation?.();
            bgNode.setAlpha(0.94);
          });
          hitNode.on("pointerdown", (_pointer, _lx, _ly, event) => {
            event?.stopPropagation?.();
            bgNode.setScale(0.98);
          });
          hitNode.on("pointerup", (_pointer, _lx, _ly, event) => {
            event?.stopPropagation?.();
            bgNode.setScale(1);
            AudioManager.playBottomBarClick();
            onClick?.();
          });
        };

        bindOverlayButton(confirmHit, confirmBg, () => this._confirmQuickSell(def, cardRef));
        bindOverlayButton(cancelHit, cancelBg, () => this._closeQuickSell());

        const overlay = scene.add.container(0, 0, [
          overlayShade,
          overlayBlocker,
          overlayTitle,
          overlayNeed,
          overlayItems,
          overlayTotal,
          confirmBg,
          confirmText,
          confirmHit,
          cancelBg,
          cancelText,
          cancelHit,
        ]).setVisible(false);

        card.add(overlay);
        cardRef.quickSellOverlay = overlay;
        cardRef.quickSellNeed = overlayNeed;
        cardRef.quickSellItems = overlayItems;
        cardRef.quickSellTotal = overlayTotal;
        cardRef.quickSellConfirmHit = confirmHit;
      }

      hit.on("pointerover", () => {
        cardRef.hovered = true;
        this._applyCardVisual(cardRef, this.activeKey === def.key);
      });
      hit.on("pointerout", () => {
        cardRef.hovered = false;
        this._applyCardVisual(cardRef, this.activeKey === def.key);
      });

      this._cardRefs.push(cardRef);
      this._applyCardVisual(cardRef, this.activeKey === def.key);
      cardsContainer.add(card);

      xCursor += CARD_W + gap;
    });

    // Total scrollable width
    this._cardsContentW = Math.max(0, xCursor - gap);

    // Clamp and enable scrolling
    this._clampCardsScroll();
    this._enableCardScrolling(viewportHit);
    this._refreshQuickSellOverlay();
  }

  _clampCardsScroll() {
    if (!this._cardsContainer || !this._cardsViewport) return;

    const { left, w } = this._cardsViewport;
    const contentW = this._cardsContentW || 0;

    // if content fits, lock to start
    if (contentW <= w) {
      this._cardsScrollX = 0;
      this._cardsContainer.x = left;
      this._rememberCardsScroll();
      return;
    }

    // scroll range: [min, max] in pixels
    const maxScroll = 0;
    const minScroll = -(contentW - w);

    this._cardsScrollX = Phaser.Math.Clamp(this._cardsScrollX, minScroll, maxScroll);
    this._cardsContainer.x = left + this._cardsScrollX;
    this._rememberCardsScroll();
  }

  _rememberCardsScroll() {
    if (!this._cardsScrollByMode || !this.mode) return;
    const value = Number(this._cardsScrollX);
    this._cardsScrollByMode[this.mode] = Number.isFinite(value) ? value : 0;
  }

  _getRememberedCardsScroll(mode = this.mode) {
    const value = Number(this._cardsScrollByMode?.[mode]);
    return Number.isFinite(value) ? value : 0;
  }

  _enableCardScrolling(viewportHit) {
    const scene = this.scene;
    this._cardsDragging = false;
    this._cardsDragStartX = 0;
    this._cardsScrollStart = 0;

    viewportHit.on("pointerdown", (p) => {
      this._cardsDragging = true;
      this._cardsDragStartX = p.x;
      this._cardsScrollStart = this._cardsScrollX || 0;
    });

    if (this._cardsScrollHooksBound) return;
    this._cardsScrollHooksBound = true;

    this._onCardsPointerUp = () => { this._cardsDragging = false; };
    scene.input.on("pointerup", this._onCardsPointerUp);

    this._onCardsPointerMove = (p) => {
      if (!this._cardsDragging) return;
      const dx = p.x - this._cardsDragStartX;
      this._cardsScrollX = this._cardsScrollStart + dx;
      this._clampCardsScroll();
    };
    scene.input.on("pointermove", this._onCardsPointerMove);

    // Mouse wheel / trackpad scroll:
    // translate whichever axis the device gives us into horizontal card motion.
    this._onCardsWheel = (pointer, gameObjects, dx, dy) => {
      if (this.scene.uiBottomBar?.currentPage !== "build") return;
      if (!this.scene.uiBottomBar?.expanded) return;

      const bounds = this._cardsViewportHit?.getBounds?.();
      if (!bounds) return;

      const overViewport = Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y);
      const overCardHit = (gameObjects || []).some((gameObject) =>
        this._cardRefs?.some((ref) => ref.hit === gameObject || ref.card === gameObject)
      );
      const over = overViewport || overCardHit;

      if (!over) return;

      const dominantDelta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      if (Math.abs(dominantDelta) < 0.1) return;

      this._cardsScrollX -= dominantDelta * 0.8;
      this._clampCardsScroll();
    };
    scene.input.on("wheel", this._onCardsWheel);
  }

  _setMode(mode) {
    if (this.mode === mode) return;
    this._rememberCardsScroll();
    this._closeQuickSell();
    this._clearSelection(true);
    this.mode = mode;
    this._cardsScrollX = this._getRememberedCardsScroll(mode);
    this._makeUI();
  }

  _trySetMode(mode) {
    const tutorial = this._getTutorialManager();
    if (tutorial?.isActive?.() && mode !== this.mode) {
      tutorial.blockAction();
      return;
    }
    this._setMode(mode);
  }

  refreshAvailableDefs() {
    this._closeQuickSell();
    this._clearSelection(true);
    this._buildDefs = this._makeBuildDefs();
    this._unitDefs = this._makeUnitDefs();
    this._makeUI();
  }

  _recruitUnit(def, opts = {}) {
    const team = "1";
    const costObj = getDefCost(def, this.scene);
    const housing = Teams.getHousingStatus?.(team);
    const tutorial = this._getTutorialManager();
    const allowQuickSell = opts?.allowQuickSell !== false;

    if (tutorial && !tutorial.canPerformAction?.("build.recruit", { key: def.key })) {
      return;
    }

    if (!Teams.canRecruitPlayer?.(team)) {
      this._closeQuickSell();
      const waitingForTutorialHouse =
        def?.key === "brawler" &&
        tutorial?.currentStep?.id === "buy_brawler" &&
        Math.max(0, Number(housing?.homelessCount || 0)) <= 0 &&
        this._hasPendingHouseBuild(team);
      const message = waitingForTutorialHouse
        ? "Wait until the new house is built before recruiting the Brawler"
        : housing?.homelessCount > 0
          ? "House your homeless players first"
          : "Not enough housing";
      showAlert(this.scene, message, "#ff5555");
      return;
    }

    if (!hasResources(this.scene, costObj)) {
      const shortfall = Math.max(0, Number(costObj?.money || 0) - Math.max(0, Number(this._getWorldScene()?.money || 0)));
      if (allowQuickSell && shortfall > 0) {
        const plan = this._buildQuickSellPlan(def);
        if (plan) {
          this._openQuickSell(def, plan);
          return;
        }
      }
      this._closeQuickSell();
      showAlert(this.scene, formatMissingCostMessage(costObj), "#ff5555");
      return;
    }

    this._closeQuickSell();

    const spawnTile = Teams.getTownSpawnTile?.(team);
    if (!spawnTile) {
      showAlert(this.scene, "No town road to spawn from", "#ff5555");
      return;
    }

    const player = new def.unitClass(spawnTile.x, spawnTile.y, 1);
    House.assignPlayerToHouse(player, team);
    spendResources(this.scene, costObj);
    if ((costObj.money || 0) <= 0) {
      (this.scene.worldScene ?? this.scene).consumeRecruitVoucher?.();
    }
    AudioManager.playPurchaseCoins?.(costObj.money ?? 0);
    showAlert(this.scene, `${def.name} recruited!`, "#ffb4dd");
    tutorial?.notifyAction?.("build.recruit", {
      key: def.key,
      player,
    });
  }

  _hasPendingHouseBuild(teamNumber = "1") {
    const team = Teams.getTeam?.(teamNumber);
    const isHouseTask = (task) => {
      const name = task?.type?.name || task?.buildType?.name || task?.tileType?.name;
      return name === TILE_TYPES.house1.name || name === TILE_TYPES.house2.name;
    };

    return (
      (Array.isArray(team?.blockBuildingStates) && team.blockBuildingStates.some(isHouseTask)) ||
      (Array.isArray(team?.buildingTileStates) && team.buildingTileStates.some(isHouseTask))
    );
  }

  _select(key) {
    const scene = this.scene;
    const def = this._getCurrentDefs().find(d => d.key === key);
    if (!def) return;

    if (!def.isUnit) this._closeQuickSell();

    if (def.isUnit) {
      this._recruitUnit(def);
      return;
    }

    const tutorial = this._getTutorialManager();
    if (tutorial && !tutorial.canPerformAction?.("build.select", { key: def.key })) {
      return;
    }

    if (this.activeKey === key) {
      if (tutorial?.isActive?.()) {
        tutorial.blockAction();
        return;
      }
      this._clearSelection(true);
      return;
    }

    if (this.activeKey && this.activeKey !== key) {
      this._clearSelection(true);
    }

    this.activeKey = key;
    this.pendingDef = def;

    this._cardRefs.forEach((ref) => {
      this._applyCardVisual(ref, ref.def.key === key);
    });

    if (def.isWall) {
      showAlert(scene, `Begin placing: ${def.name}`, "#aaffaa");
      scene.stoneWallMode = (def.wallTypeName === "wall");
      scene.woodWallMode = (def.wallTypeName === "woodWall");
      scene.wallPlacer?.start?.(def.wallTypeName);
      return;
    }

    const tile = TILE_TYPES[def.tileTypeName];
    if (!tile) {
      showAlert(scene, `Missing TILE_TYPES for "${def.tileTypeName}"`, "#ff5555");
      return;
    }

    showAlert(scene, `Begin placing: ${def.name}`, "#aaffaa");
    const specialPlacer = getSpecialBuildPlacer(tile);
    if (specialPlacer) {
      specialPlacer.beginPlacing(tile, 1);
      return;
    }
    GameMap.beginPlacing(tile);
  }

  _clearSelection(silent = false) {
    this._closeQuickSell();
    this.activeKey = null;
    this.pendingDef = null;

    this._cardRefs.forEach((ref) => {
      this._applyCardVisual(ref, false);
    });

    if (this.scene.wallPlacer?.active) this.scene.wallPlacer.stop?.();

    Object.values(SPECIAL_BUILD_PLACERS).forEach((placer) => {
      if (placer?.isPlacing) placer.cancelPlacement();
    });

    if (GameMap.isPlacing) {
      GameMap.isPlacing = false;
      GameMap.placingItem?.destroy?.();
      GameMap.placingItem = null;
    }

    if (!silent) showAlert(this.scene, "Cancelled placement", "#ffaaaa");
  }

  _ensurePlacementHooks() {
    if (this._placeClickBound) return;
    this._placeClickBound = true;

    const inputScene = this.scene.worldScene ?? this.scene;
    this._placementInputScene = inputScene;
    this._onPlacePointerDown = (pointer) => {
      if (!this.pendingDef || this.pendingDef.isWall) return;
      const tile = TILE_TYPES[this.pendingDef.tileTypeName];
      if (!tile) return;

      const specialPlacer = getSpecialBuildPlacer(tile);
      const genericPlacementActive = !!(GameMap.isPlacing && GameMap.placingItem);
      const specialPlacementActive = !!specialPlacer?.isPlacing;
      if (!genericPlacementActive && !specialPlacementActive) return;

      if (specialPlacer) {
        if (!specialPlacementActive) return;
      } else {
        if (!genericPlacementActive) return;
      }

      // Don’t place through the bottom bar
      if (pointer.y > inputScene.scale.height - 180 && this.scene.uiBottomBar?.expanded) return;

      const lenX = tile.lenX, lenY = tile.lenY;
      let gridX;
      let gridY;

      if (specialPlacer) {
        const placement = specialPlacer.resolvePlacement(pointer, tile);
        if (!placement) return;
        gridX = placement.gridX;
        gridY = placement.gridY;
      } else {
        let x = Math.floor(pointer.worldX - (pointer.worldX % SQUARESIZE));
        let y = Math.floor(pointer.worldY - (pointer.worldY % SQUARESIZE));
        if (lenX % 2 !== 0) x += SQUARESIZE / 2;
        if (lenY % 2 !== 0) y += SQUARESIZE / 2;

        gridX = Math.floor(x / SQUARESIZE) - Math.floor(lenX / 2);
        gridY = Math.floor(y / SQUARESIZE) - Math.floor(lenY / 2);
      }

      const placementSprite = specialPlacer ? specialPlacer.placementState?.topSprite : GameMap.placingItem;
      GameMap.checkBlockPosition(
        gridX,
        gridY,
        lenX,
        lenY,
        placementSprite,
        tile.block ? {
          padding: 1,
          protectFarmSpots: true,
          paddingAllowWalls: true,
          paddingProtectFarmSpots: false,
          allowAutoClearSite: true,
          placementType: tile,
        } : { placementType: tile }
      );
      if (placementSprite?.blocked) {
        const message = GameMap.getPlacementBlockMessage?.(placementSprite);
        if (message) {
          showAlert(this.scene, message, "#ff5555");
          AudioManager.playError?.({ volume: 0.2 });
        }
        return;
      }

      const costObj = getDefCost(this.pendingDef, this.scene);
      const tutorial = this._getTutorialManager();

      if (tutorial && !tutorial.canPerformAction?.("build.placed", {
        key: this.pendingDef.key,
        tileTypeName: this.pendingDef.tileTypeName,
      })) {
        return;
      }

      if (!hasResources(this.scene, costObj)) {
        showAlert(this.scene, formatMissingCostMessage(costObj), "#ff5555");
        return;
      }

      const isBlockBuild =
        !!tile.block ||
        !!tile.stayBlocked ||
        (tile.lenX ?? 1) > 1 ||
        (tile.lenY ?? 1) > 1;

      if (isBlockBuild) {
        const placedDef = this.pendingDef;
        spendResources(this.scene, costObj);

        const queuedTask = buildingManager.queueBlockBuildTask({
          type: tile,
          x: gridX,
          y: gridY,
          teamNumber: 1,
          duration: 100,
          assigned: 0,
          refundCost: { ...costObj },
          prepaid: Object.keys(costObj).length > 0,
        }, 1);
        if (!queuedTask) {
          showAlert(this.scene, buildingManager.getLastBlockBuildQueueFailureMessage?.() || "Cannot build there", "#ff5555");
          return;
        }
        this._clearSelection(true);
        showAlert(this.scene, "Construction started!", "#aaffaa");
        tutorial?.notifyAction?.("build.placed", {
          key: placedDef?.key,
          tileTypeName: placedDef?.tileTypeName,
          gridX,
          gridY,
          tile,
        });
        return;
      }

      const placedDef = this.pendingDef;
      spendResources(this.scene, costObj);
      GameMap.placeItem(gridX * SQUARESIZE, gridY * SQUARESIZE, tile);
      this._clearSelection(true);
      showAlert(this.scene, "Built!", "#aaffaa");
      tutorial?.notifyAction?.("build.placed", {
        key: placedDef?.key,
        tileTypeName: placedDef?.tileTypeName,
        gridX,
        gridY,
        tile,
      });
    };
    inputScene.input.on("pointerdown", this._onPlacePointerDown);

    this._onPlaceEsc = () => {
      if (!this.pendingDef) return;
      if (this.pendingDef.isWall && this.scene.wallPlacer?.active) return;
      this._clearSelection(true);
    };
    inputScene.input.keyboard.on("keydown-ESC", this._onPlaceEsc);
  }

  onShow() {}
  hide() {}

  _applyCardVisual(ref, selected) {
    if (!ref?.bg || !ref?.card) return;
    const rarity = RARITY[ref.def?.rarity] ?? RARITY.common;
    const hovered = !!ref.hovered;
    const accent = selected ? mixColor(rarity.border, 0xffffff, 0.16) : rarity.border;

    ref.bg.setFillStyle(
      mixColor(BOTTOM_BAR_THEME.cardFill, rarity.border, selected ? 0.2 : hovered ? 0.16 : 0.12),
      selected ? 0.98 : hovered ? 0.96 : 0.94
    );
    ref.bg.setStrokeStyle(selected ? 3 : hovered ? 2.5 : 2, accent, selected ? 0.86 : hovered ? 0.54 : 0.34);
    ref.iconAura?.setFillStyle(rarity.border, selected ? 0.24 : hovered ? 0.2 : 0.16);
    ref.name?.setColor(selected ? "#fffdf4" : BOTTOM_BAR_THEME.text);
    ref.desc?.setColor(hovered || selected ? BOTTOM_BAR_THEME.textSoft : BOTTOM_BAR_THEME.textMuted);
    ref.cost?.setColor(selected ? "#fff4c9" : "#fff0bf");
    ref.glow?.setFillStyle(rarity.border, selected ? 0.26 : hovered ? 0.2 : 0.14);
    ref.glow?.setScale(selected ? 1.02 : hovered ? 0.99 : 0.94);

    this.scene.tweens.killTweensOf(ref.card);
    this.scene.tweens.add({
      targets: ref.card,
      y: selected ? ref.baseY - 6 : hovered ? ref.baseY - 4 : ref.baseY,
      scaleX: selected ? 1.025 : hovered ? 1.012 : 1,
      scaleY: selected ? 1.025 : hovered ? 1.012 : 1,
      duration: 130,
      ease: "Quad.easeOut",
    });
  }
}
