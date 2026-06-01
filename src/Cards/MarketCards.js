import Phaser from "phaser";
import autoWallIcon from "url:../assets/market/auto_wall_icon.png";
import chainZapperIcon from "url:../assets/market/chain_zapper.png";
import meteorDropIcon from "url:../assets/market/meteor_drop.png";
import decoyBeaconIcon from "url:../assets/market/decoy_beacon.png";
import fortifyPatchIcon from "url:../assets/market/fortify_patch.png";
import shockMineIcon from "url:../assets/market/shock_mine.png";
import teamHealIcon from "url:../assets/market/team_heal.png";
import fighterHealIcon from "url:../assets/market/fighter_heal.png";
import workerHealIcon from "url:../assets/market/worker_heal.png";
import adrenalineDraftIcon from "url:../assets/market/adrenaline_draft.png";
import secondWindBellIcon from "url:../assets/market/second_wind_bell.png";
import meleeCritBuffIcon from "url:../assets/market/melee_crit_buff.png";
import projectileCritBuffIcon from "url:../assets/market/projectile_crit_buff.png";
import decoyBeaconImg from "url:../assets/market/decoy_beacon_img.png";
import shockMineImg from "url:../assets/market/shock_mine_img.png";
import chainZapperImg from "url:../assets/market/chain_zapper_img.png";
import meteorDropAnimation from "url:../assets/market/meteor_drop_animation.png";

export const MARKET_CARD_KIND = Object.freeze({
  CONSUMABLE: "consumable",
});

export const MARKET_CARD_SECTION = Object.freeze({
  RECOVERY: "recovery",
  ATTACK: "attack",
  STRATEGY: "strategy",
});

export const MARKET_CARD_SECTIONS = Object.freeze([
  { key: MARKET_CARD_SECTION.RECOVERY, label: "Recovery" },
  { key: MARKET_CARD_SECTION.ATTACK, label: "Attack Items" },
  { key: MARKET_CARD_SECTION.STRATEGY, label: "Defense & Strategy" },
]);

export const MARKET_PLACEHOLDER_ASSETS = Object.freeze({
  storefront: "market_storefront_placeholder",
  uiPanel: "market_ui_panel_placeholder",
  uiAccent: "market_ui_accent_placeholder",
  cardSlotFrame: "market_card_slot_frame_placeholder",
  deckTab: "market_tab_deck_cards_placeholder",
  consumablesTab: "market_tab_consumables_placeholder",
  confirmButton: "card_confirm_button_placeholder",
  targetCursors: {
    chainZapper: "target_cursor_chain_zapper_placeholder",
    meteorDrop: "target_cursor_meteor_drop_placeholder",
    fortifyPatch: "target_cursor_fortify_patch_placeholder",
  },
  ghosts: {
    autoWall: "target_ghost_auto_wall_placeholder",
    decoyBeacon: "target_ghost_decoy_beacon_placeholder",
    shockMine: "target_ghost_shock_mine_placeholder",
  },
  cardIcons: {
    autoWall: "card_icon_auto_wall_placeholder",
    chainZapper: "card_icon_chain_zapper_placeholder",
    meteorDrop: "card_icon_meteor_drop_placeholder",
    decoyBeacon: "card_icon_decoy_beacon_placeholder",
    fortifyPatch: "card_icon_fortify_patch_placeholder",
    shockMine: "card_icon_shock_mine_placeholder",
    teamHeal: "card_icon_team_heal_placeholder",
    fighterHeal: "card_icon_fighter_heal_placeholder",
    workerHeal: "card_icon_worker_heal_placeholder",
    adrenalineDraft: "card_icon_adrenaline_draft_placeholder",
    secondWindBell: "card_icon_second_wind_bell_placeholder",
    meleeCritBuff: "card_icon_melee_crit_buff_placeholder",
    projectileCritBuff: "card_icon_projectile_crit_buff_placeholder",
  },
});

export const MARKET_REAL_ASSETS = Object.freeze({
  cardIcons: {
    autoWall: "market_icon_auto_wall",
    chainZapper: "market_icon_chain_zapper",
    meteorDrop: "market_icon_meteor_drop",
    decoyBeacon: "market_icon_decoy_beacon",
    fortifyPatch: "market_icon_fortify_patch",
    shockMine: "market_icon_shock_mine",
    teamHeal: "market_icon_team_heal",
    fighterHeal: "market_icon_fighter_heal",
    workerHeal: "market_icon_worker_heal",
    adrenalineDraft: "market_icon_adrenaline_draft",
    secondWindBell: "market_icon_second_wind_bell",
    meleeCritBuff: "market_icon_melee_crit_buff",
    projectileCritBuff: "market_icon_projectile_crit_buff",
  },
  world: {
    decoyBeacon: "market_decoy_beacon_img",
    shockMine: "market_shock_mine_img",
    chainZapper: "market_chain_zapper_img",
    meteorDrop: "market_meteor_drop_animation",
  },
});

export const MARKET_CARDS = Object.freeze([
  {
    id: "auto_wall",
    image: MARKET_REAL_ASSETS.cardIcons.autoWall,
    name: "Auto Wall",
    text: "Preview and place a town perimeter wall with one tile of berth.",
    kind: MARKET_CARD_KIND.CONSUMABLE,
    marketSection: MARKET_CARD_SECTION.STRATEGY,
    activation: "auto_wall",
    price: 550,
    OUTLINE: "#7bd9ff",
    repeatBuyInflation: 0.2,
    balanceNote: "Permanent defense, priced as a late bailout.",
  },
  {
    id: "chain_zapper",
    image: MARKET_REAL_ASSETS.cardIcons.chainZapper,
    name: "Chain Zapper",
    text: "Target a raider. A heavy zap chains through nearby raiders once each.",
    kind: MARKET_CARD_KIND.CONSUMABLE,
    marketSection: MARKET_CARD_SECTION.ATTACK,
    activation: "chain_zapper",
    price: 240,
    OUTLINE: "#a7f0ff",
    repeatBuyInflation: 0.15,
    balanceNote: "Single burst against clustered enemies.",
  },
  {
    id: "melee_crit_buff",
    image: MARKET_REAL_ASSETS.cardIcons.meleeCritBuff,
    name: "Killer Instinct",
    text: "Confirm for a short melee crit surge for Brawlers and Blademasters.",
    kind: MARKET_CARD_KIND.CONSUMABLE,
    marketSection: MARKET_CARD_SECTION.ATTACK,
    activation: "melee_crit_buff",
    price: 180,
    OUTLINE: "#ff8a6b",
    repeatBuyInflation: 0.15,
    balanceNote: "Short close-range burst item for pressure swings.",
  },
  {
    id: "projectile_crit_buff",
    image: MARKET_REAL_ASSETS.cardIcons.projectileCritBuff,
    name: "Deadeye Volley",
    text: "Confirm for a short crit surge for projectile fighters.",
    kind: MARKET_CARD_KIND.CONSUMABLE,
    marketSection: MARKET_CARD_SECTION.ATTACK,
    activation: "projectile_crit_buff",
    price: 190,
    OUTLINE: "#ffd166",
    repeatBuyInflation: 0.15,
    balanceNote: "Short ranged-damage spike for dense raider pushes.",
  },
  {
    id: "meteor_drop",
    image: MARKET_REAL_ASSETS.cardIcons.meteorDrop,
    name: "Meteor Drop",
    text: "Target an area. Damages troops and buildings in the blast radius.",
    kind: MARKET_CARD_KIND.CONSUMABLE,
    marketSection: MARKET_CARD_SECTION.ATTACK,
    activation: "meteor_drop",
    price: 360,
    OUTLINE: "#ffad73",
    repeatBuyInflation: 0.15,
    balanceNote: "Friendly fire allowed; high impact with positioning risk.",
  },
  {
    id: "decoy_beacon",
    image: MARKET_REAL_ASSETS.cardIcons.decoyBeacon,
    name: "Decoy Beacon",
    text: "Place a fragile lure. When destroyed, it explodes near raiders.",
    kind: MARKET_CARD_KIND.CONSUMABLE,
    marketSection: MARKET_CARD_SECTION.STRATEGY,
    activation: "decoy_beacon",
    price: 190,
    OUTLINE: "#ffe07a",
    repeatBuyInflation: 0.15,
    balanceNote: "Temporary target control, not a permanent blocker.",
  },
  {
    id: "fortify_patch",
    image: MARKET_REAL_ASSETS.cardIcons.fortifyPatch,
    name: "Fortify Patch",
    text: "Select a building or wall to repair and temporarily reinforce.",
    kind: MARKET_CARD_KIND.CONSUMABLE,
    marketSection: MARKET_CARD_SECTION.STRATEGY,
    activation: "fortify_patch",
    price: 160,
    OUTLINE: "#9dffa5",
    repeatBuyInflation: 0.15,
    balanceNote: "Saves a target under pressure; does not build new economy.",
  },
  {
    id: "shock_mine",
    image: MARKET_REAL_ASSETS.cardIcons.shockMine,
    name: "Shock Mine",
    text: "Place a trap that shocks and briefly disrupts enemies that trigger it.",
    kind: MARKET_CARD_KIND.CONSUMABLE,
    marketSection: MARKET_CARD_SECTION.STRATEGY,
    activation: "shock_mine",
    price: 150,
    OUTLINE: "#b28cff",
    repeatBuyInflation: 0.15,
    balanceNote: "One-shot area disruption.",
  },
  {
    id: "team_heal",
    image: MARKET_REAL_ASSETS.cardIcons.teamHeal,
    name: "Team Heal",
    text: "Confirm to heal all team members by 50% max HP.",
    kind: MARKET_CARD_KIND.CONSUMABLE,
    marketSection: MARKET_CARD_SECTION.RECOVERY,
    activation: "team_heal",
    price: 170,
    OUTLINE: "#7cffb2",
    repeatBuyInflation: 0.1,
    balanceNote: "Emergency recovery only.",
  },
  {
    id: "second_wind_bell",
    image: MARKET_REAL_ASSETS.cardIcons.secondWindBell,
    name: "Second Wind Bell",
    text: "Confirm to restore a heavy burst of stamina to the whole town.",
    kind: MARKET_CARD_KIND.CONSUMABLE,
    marketSection: MARKET_CARD_SECTION.RECOVERY,
    activation: "second_wind_bell",
    price: 220,
    OUTLINE: "#8fe7ff",
    repeatBuyInflation: 0.1,
    balanceNote: "Expensive stamina recovery for a gassed-out town.",
  },
  {
    id: "fighter_heal",
    image: MARKET_REAL_ASSETS.cardIcons.fighterHeal,
    name: "Fighter Heal",
    text: "Confirm to heal all fighters by 70% max HP.",
    kind: MARKET_CARD_KIND.CONSUMABLE,
    marketSection: MARKET_CARD_SECTION.RECOVERY,
    activation: "fighter_heal",
    price: 140,
    OUTLINE: "#ff8ba8",
    repeatBuyInflation: 0.1,
    balanceNote: "Combat recovery without adding damage.",
  },
  {
    id: "worker_heal",
    image: MARKET_REAL_ASSETS.cardIcons.workerHeal,
    name: "Worker Heal",
    text: "Confirm to heal all workers by 70% max HP.",
    kind: MARKET_CARD_KIND.CONSUMABLE,
    marketSection: MARKET_CARD_SECTION.RECOVERY,
    activation: "worker_heal",
    price: 130,
    OUTLINE: "#8fe7ff",
    repeatBuyInflation: 0.1,
    balanceNote: "Protects labor without replacing food or water loops.",
  },
  {
    id: "adrenaline_draft",
    image: MARKET_REAL_ASSETS.cardIcons.adrenalineDraft,
    name: "Adrenaline Draft",
    text: "Confirm for a brief team tempo buff to movement and response.",
    kind: MARKET_CARD_KIND.CONSUMABLE,
    marketSection: MARKET_CARD_SECTION.STRATEGY,
    activation: "adrenaline_draft",
    price: 180,
    OUTLINE: "#fff17a",
    repeatBuyInflation: 0.15,
    balanceNote: "Temporary pressure response.",
  },
]);

export const MARKET_CARD_BY_ID = new Map(MARKET_CARDS.map((card) => [card.id, card]));
export const MARKET_CONSUMABLE_CARDS = Object.freeze(MARKET_CARDS.filter((card) => card.kind === MARKET_CARD_KIND.CONSUMABLE));
export const MARKET_CARD_OFFERS = Object.freeze([...MARKET_CARDS]);
export const MARKET_CARDS_BY_SECTION = Object.freeze(
  Object.fromEntries(
    MARKET_CARD_SECTIONS.map((section) => [
      section.key,
      MARKET_CARD_OFFERS.filter((card) => card.marketSection === section.key),
    ])
  )
);

export function getMarketCardDefinition(cardOrId) {
  if (!cardOrId) return null;
  if (typeof cardOrId === "string") return MARKET_CARD_BY_ID.get(cardOrId) || null;
  return MARKET_CARD_BY_ID.get(cardOrId.id) || cardOrId;
}

function makePlaceholderTexture(scene, key, {
  width = 64,
  height = 64,
  fill = 0x17384d,
  stroke = 0x98e7ff,
  accent = 0xffffff,
  radius = 8,
  icon = "square",
} = {}) {
  if (!scene?.textures || scene.textures.exists(key)) return;

  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.clear();
  g.fillStyle(fill, 0.86);
  g.fillRoundedRect?.(0, 0, width, height, radius) ?? g.fillRect(0, 0, width, height);
  g.fillStyle(0xffffff, 0.08);
  g.fillRoundedRect?.(4, 4, Math.max(4, width - 8), Math.max(4, height * 0.36), Math.max(3, radius - 3)) ?? g.fillRect(4, 4, Math.max(4, width - 8), Math.max(4, height * 0.36));
  g.lineStyle(2, stroke, 0.65);
  g.strokeRoundedRect?.(1, 1, width - 2, height - 2, radius) ?? g.strokeRect(1, 1, width - 2, height - 2);

  const cx = width / 2;
  const cy = height / 2;
  g.lineStyle(3, accent, 0.9);
  g.fillStyle(accent, 0.18);
  if (icon === "bolt") {
    const p = new Phaser.Geom.Polygon([
      cx - 7, cy - 21, cx + 10, cy - 21, cx + 1, cy - 2,
      cx + 14, cy - 2, cx - 8, cy + 24, cx - 1, cy + 4,
      cx - 14, cy + 4,
    ]);
    g.fillPoints(p.points, true);
    g.strokePoints(p.points, true);
  } else if (icon === "cross") {
    g.fillRect(cx - 5, cy - 22, 10, 44);
    g.fillRect(cx - 22, cy - 5, 44, 10);
    g.strokeRect(cx - 5, cy - 22, 10, 44);
    g.strokeRect(cx - 22, cy - 5, 44, 10);
  } else if (icon === "target") {
    g.strokeCircle(cx, cy, 21);
    g.strokeCircle(cx, cy, 11);
    g.beginPath();
    g.moveTo(cx - 25, cy);
    g.lineTo(cx + 25, cy);
    g.moveTo(cx, cy - 25);
    g.lineTo(cx, cy + 25);
    g.strokePath();
  } else if (icon === "mine") {
    g.fillCircle(cx, cy + 5, 17);
    g.strokeCircle(cx, cy + 5, 17);
    g.strokeLineShape(new Phaser.Geom.Line(cx - 18, cy - 15, cx + 18, cy - 15));
    g.strokeLineShape(new Phaser.Geom.Line(cx, cy - 15, cx, cy - 27));
  } else if (icon === "wall") {
    for (let yy = -14; yy <= 14; yy += 14) {
      for (let xx = -18; xx <= 18; xx += 18) {
        g.strokeRect(cx + xx - 9, cy + yy - 6, 18, 12);
      }
    }
  } else if (icon === "beacon") {
    g.fillTriangle(cx, cy - 25, cx + 20, cy + 18, cx - 20, cy + 18);
    g.strokeTriangle(cx, cy - 25, cx + 20, cy + 18, cx - 20, cy + 18);
    g.strokeCircle(cx, cy - 8, 9);
  } else if (icon === "meteor") {
    g.fillCircle(cx + 6, cy + 8, 16);
    g.strokeCircle(cx + 6, cy + 8, 16);
    g.beginPath();
    g.moveTo(cx - 24, cy - 24);
    g.lineTo(cx - 5, cy - 7);
    g.moveTo(cx - 12, cy - 26);
    g.lineTo(cx + 2, cy - 10);
    g.strokePath();
  } else {
    g.strokeRect(cx - 18, cy - 18, 36, 36);
  }

  g.generateTexture(key, width, height);
  g.destroy();
}

function loadImageIfNeeded(scene, key, source) {
  if (!scene?.load || !key || scene.textures?.exists?.(key)) return;
  scene.load.image(key, source);
}

function loadSpritesheetIfNeeded(scene, key, source, frameWidth = 32, frameHeight = 32) {
  if (!scene?.load || !key || scene.textures?.exists?.(key)) return;
  scene.load.spritesheet(key, source, { frameWidth, frameHeight });
}

export function loadMarketCardAssets(scene) {
  loadImageIfNeeded(scene, MARKET_REAL_ASSETS.cardIcons.autoWall, autoWallIcon);
  loadImageIfNeeded(scene, MARKET_REAL_ASSETS.cardIcons.chainZapper, chainZapperIcon);
  loadImageIfNeeded(scene, MARKET_REAL_ASSETS.cardIcons.meteorDrop, meteorDropIcon);
  loadImageIfNeeded(scene, MARKET_REAL_ASSETS.cardIcons.decoyBeacon, decoyBeaconIcon);
  loadImageIfNeeded(scene, MARKET_REAL_ASSETS.cardIcons.fortifyPatch, fortifyPatchIcon);
  loadImageIfNeeded(scene, MARKET_REAL_ASSETS.cardIcons.shockMine, shockMineIcon);
  loadImageIfNeeded(scene, MARKET_REAL_ASSETS.cardIcons.teamHeal, teamHealIcon);
  loadImageIfNeeded(scene, MARKET_REAL_ASSETS.cardIcons.fighterHeal, fighterHealIcon);
  loadImageIfNeeded(scene, MARKET_REAL_ASSETS.cardIcons.workerHeal, workerHealIcon);
  loadImageIfNeeded(scene, MARKET_REAL_ASSETS.cardIcons.adrenalineDraft, adrenalineDraftIcon);
  loadImageIfNeeded(scene, MARKET_REAL_ASSETS.cardIcons.secondWindBell, secondWindBellIcon);
  loadImageIfNeeded(scene, MARKET_REAL_ASSETS.cardIcons.meleeCritBuff, meleeCritBuffIcon);
  loadImageIfNeeded(scene, MARKET_REAL_ASSETS.cardIcons.projectileCritBuff, projectileCritBuffIcon);
  loadImageIfNeeded(scene, MARKET_REAL_ASSETS.world.decoyBeacon, decoyBeaconImg);
  loadImageIfNeeded(scene, MARKET_REAL_ASSETS.world.shockMine, shockMineImg);
  loadSpritesheetIfNeeded(scene, MARKET_REAL_ASSETS.world.chainZapper, chainZapperImg, 32, 32);
  loadSpritesheetIfNeeded(scene, MARKET_REAL_ASSETS.world.meteorDrop, meteorDropAnimation, 32, 32);
}

export function loadMarketCardPlaceholderAssets(scene) {
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.storefront, {
    width: 320,
    height: 224,
    fill: 0x16394f,
    stroke: 0x98e7ff,
    accent: 0xffd47c,
    radius: 10,
    icon: "target",
  });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.uiPanel, {
    width: 640,
    height: 420,
    fill: 0x102f42,
    stroke: 0x98e7ff,
    accent: 0xffffff,
    radius: 12,
  });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.uiAccent, {
    width: 96,
    height: 24,
    fill: 0x1b536d,
    stroke: 0x98e7ff,
    accent: 0xffd47c,
    radius: 6,
  });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.cardSlotFrame, {
    width: 220,
    height: 126,
    fill: 0x17384d,
    stroke: 0x98e7ff,
    accent: 0xffffff,
    radius: 8,
  });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.deckTab, {
    width: 148,
    height: 34,
    fill: 0x19465d,
    stroke: 0x98e7ff,
    accent: 0x7bd9ff,
    radius: 8,
  });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.consumablesTab, {
    width: 148,
    height: 34,
    fill: 0x19465d,
    stroke: 0x98e7ff,
    accent: 0x7cffb2,
    radius: 8,
  });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.confirmButton, {
    width: 120,
    height: 36,
    fill: 0x1f5c42,
    stroke: 0x9dffa5,
    accent: 0xffffff,
    radius: 8,
    icon: "cross",
  });

  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.cardIcons.autoWall, { accent: 0x7bd9ff, icon: "wall" });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.cardIcons.chainZapper, { accent: 0xa7f0ff, icon: "bolt" });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.cardIcons.meteorDrop, { accent: 0xffad73, icon: "meteor" });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.cardIcons.decoyBeacon, { accent: 0xffe07a, icon: "beacon" });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.cardIcons.fortifyPatch, { accent: 0x9dffa5, icon: "cross" });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.cardIcons.shockMine, { accent: 0xb28cff, icon: "mine" });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.cardIcons.teamHeal, { accent: 0x7cffb2, icon: "cross" });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.cardIcons.fighterHeal, { accent: 0xff8ba8, icon: "cross" });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.cardIcons.workerHeal, { accent: 0x8fe7ff, icon: "cross" });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.cardIcons.adrenalineDraft, { accent: 0xfff17a, icon: "bolt" });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.cardIcons.secondWindBell, { accent: 0x8fe7ff, icon: "cross" });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.cardIcons.meleeCritBuff, { accent: 0xff8a6b, icon: "target" });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.cardIcons.projectileCritBuff, { accent: 0xffd166, icon: "bolt" });

  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.targetCursors.chainZapper, { accent: 0xa7f0ff, icon: "bolt" });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.targetCursors.meteorDrop, { accent: 0xffad73, icon: "target" });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.targetCursors.fortifyPatch, { accent: 0x9dffa5, icon: "cross" });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.ghosts.autoWall, { accent: 0x7bd9ff, icon: "wall" });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.ghosts.decoyBeacon, { accent: 0xffe07a, icon: "beacon" });
  makePlaceholderTexture(scene, MARKET_PLACEHOLDER_ASSETS.ghosts.shockMine, { accent: 0xb28cff, icon: "mine" });
}
