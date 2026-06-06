import Phaser from 'phaser';
import { buildCardAddedPayload } from "../Cards/CardInventory";
import { pickRandomPowerupCards } from "../Cards/PowerupCards";
import { House } from "../buildings/House";
import { SQUARESIZE, UIDEPTH, showAlert } from "../constants";
import { addCardToHand, getCardHand } from "../UI/Powerups";
import { createWorldCardPreview, getCardOutlineTint, getCardVisualStyle } from "../UI/CardPreview";
import { Builder } from "../players/Builder";
import { Farmer } from "../players/Farmer";
import { Fireman } from "../players/Fireman";
import { Forager } from "../players/Forager";
import { Gunslinger } from "../players/Gunslinger";
import { Blademaster } from "../players/Blademaster";
import { Brawler } from "../players/Brawler";
import { StorageManager } from "../Manager/StorageManager";
import { Teams } from "../Teams";
import { UI_ITEM_TYPES } from "../UI/UIConstants";
import { hasStoreUnlock, STORE_UNLOCK_KEYS } from "./StoreUnlockSystem";

const TEAM_ID = "1";
const NO_HOUSE_FALLBACK_MONEY = 500;

const PLAYER_REWARDS = [
  { key: "farmer", name: "Farmer", tint: 0x8b5a2b, ctor: Farmer },
  { key: "builder", name: "Builder", tint: 0x4433ff, ctor: Builder },
  { key: "forager", name: "Forager", tint: 0x228b22, ctor: Forager },
  { key: "fireman", name: "Fireman", tint: 0xff9933, ctor: Fireman },
  { key: "gunslinger", name: "Gunslinger", tint: 0x9999ff, ctor: Gunslinger },
  { key: "blademaster", name: "Blademaster", tint: 0xaa33ee, ctor: Blademaster },
  { key: "brawler", name: "Brawler", tint: 0xffd712, ctor: Brawler },
];

const PLAYER_REWARD_UNLOCKS = Object.freeze({
  gunslinger: STORE_UNLOCK_KEYS.gunslinger,
  blademaster: STORE_UNLOCK_KEYS.blademaster,
});

const CHEST_REWARDS = [
  {
    key: "money",
    name: "Money Chest",
    contents: [{ key: "monies", label: "Money", amount: 225, resourceKey: "money" }],
    grant: (scene) => {
      scene.updateMoney?.(225);
      showAlert(scene, "+$225", "#aaffaa");
    }
  },
  {
    key: "resource",
    name: "Resource Chest",
    contents: [
      { key: "woodIcon", label: "Wood", amount: 3, resourceKey: "wood", parcelType: "FOREST" },
      { key: "stoneIcon", label: "Stone", amount: 3, resourceKey: "stone", parcelType: "ROCK" },
      { key: "seeds", label: "Seeds", amount: 2, resourceKey: "seeds", parcelType: "FARM" },
    ],
    grant: (scene) => {
      addResource(scene, "wood", 3);
      addResource(scene, "stone", 3);
      addResource(scene, "seeds", 2);
      showAlert(scene, "+Resources", "#aaffaa");
    }
  },
  {
    key: "survival",
    name: "Food + Water Chest",
    contents: [
      { key: "foodIcon", label: "Food", amount: 2, resourceKey: "food", parcelType: "FARM" },
      { key: "waterIcon", label: "Water", amount: 3, resourceKey: "clean_water" },
      { key: "berry", label: "Berry", amount: 2, resourceKey: "berry", parcelType: "FARM" },
    ],
    grant: (scene) => {
      addResource(scene, "food", 2);
      addResource(scene, "clean_water", 3);
      addResource(scene, "berry", 2);
      showAlert(scene, "+Food + Water", "#aaffaa");
    }
  },
];

function worldify(scene, go) {
  if (!go) return go;
  return go;
}

function addResource(scene, key, amount) {
  if (!amount) return;
  if (key === "money") {
    scene.updateMoney?.(amount);
    return;
  }
  const itemType = ({
    seeds: UI_ITEM_TYPES.seedCrop,
    berry: UI_ITEM_TYPES.seedBerry,
    berries: UI_ITEM_TYPES.seedBerry,
    wood: UI_ITEM_TYPES.wood,
    stone: UI_ITEM_TYPES.stone,
    food: UI_ITEM_TYPES.food,
    clean_water: UI_ITEM_TYPES.clean_water,
    water: UI_ITEM_TYPES.clean_water,
  })[key];

  if (!itemType) return;
  StorageManager.grantItemToTeam(TEAM_ID, itemType, amount, scene);
}

function buildResolvedChestReward(scene, chestDef) {
  const contents = (chestDef?.contents || []).filter((entry) => {
    const parcelType = String(entry?.parcelType || "").toUpperCase();
    return !parcelType || !scene?._hasClaimedRunParcelType?.(parcelType);
  });
  if (!contents.length) return null;

  return {
    ...chestDef,
    contents,
    grant: (targetScene) => {
      for (const entry of contents) {
        addResource(targetScene, entry.resourceKey, entry.amount);
      }
      const label = chestDef.key === "money"
        ? "+$225"
        : `+${contents.map((entry) => entry.label).join(" + ")}`;
      showAlert(targetScene, label, "#aaffaa");
    },
  };
}

function getAvailableChestRewards(scene) {
  const resolved = CHEST_REWARDS
    .map((chestDef) => buildResolvedChestReward(scene, chestDef))
    .filter(Boolean);
  return resolved.length ? resolved : CHEST_REWARDS.slice(0, 1);
}

function safeDestroy(go) {
  if (!go) return;
  try { go.destroy?.(); } catch {}
}

function pickRewardType(stageIndex) {
  const r = stageIndex % 3;
  if (r === 1) return "card";
  if (r === 2) return "chest";
  return "player";
}

function getFortCenter(meta) {
  const b = meta?.bounds;
  if (!b) return { x: 50 * SQUARESIZE, y: 25 * SQUARESIZE, gx: 50, gy: 25 };

  const gx = Math.floor((b.minx + b.maxx) / 2);
  const gy = Math.floor((b.miny + b.maxy) / 2);

  return {
    x: gx * SQUARESIZE + SQUARESIZE / 2,
    y: gy * SQUARESIZE + SQUARESIZE / 2,
    gx,
    gy,
  };
}

function rowPositions(cx, y, spacing = 165) {
  return [
    { x: cx - spacing, y },
    { x: cx, y },
    { x: cx + spacing, y },
  ];
}

function randomCards(count = 3) {
  return pickRandomPowerupCards(count, { teamNumber: TEAM_ID });
}

function getAvailablePlayerRewards() {
  const filtered = PLAYER_REWARDS.filter((reward) => {
    const unlockKey = PLAYER_REWARD_UNLOCKS[reward.key];
    return !unlockKey || hasStoreUnlock(unlockKey);
  });
  return filtered.length ? filtered : PLAYER_REWARDS.slice();
}

function chestTooltip(scene, x, y, chestDef) {
  const bg = worldify(scene, scene.add.rectangle(x, y, 180, 90, 0x000000, 0.72)
    .setStrokeStyle(1, 0xffffff, 0.5)
    .setDepth(10020)
    .setVisible(false));

  const title = worldify(scene, scene.add.text(x, y - 30, chestDef.name, {
    fontSize: "12px",
    color: "#ffffff",
    fontFamily: "Bungee",
    fontStyle: "bold",
  }).setOrigin(0.5).setDepth(10021).setVisible(false));

  const lines = [];
  chestDef.contents.forEach((entry, i) => {
    const ey = y - 10 + i * 20;
    const icon = worldify(scene, scene.add.image(x - 55, ey, entry.key).setScale(0.6).setDepth(10021).setVisible(false));
    const text = worldify(scene, scene.add.text(x - 40, ey, `+${entry.amount} ${entry.label}`, {
      fontSize: "12px",
      color: "#d8d8d8",
      fontFamily: "Bungee"
    }).setOrigin(0, 0.5).setDepth(10021).setVisible(false));
    lines.push(icon, text);
  });

  const list = [bg, title, ...lines];

  return {
    list,
    show() { list.forEach(o => o.setVisible(true)); },
    hide() { list.forEach(o => o.setVisible(false)); },
    destroy() { list.forEach(safeDestroy); }
  };
}

function animateChest(sprite, toFrame, scene) {
  const from = sprite.frame?.name ?? 0;
  if (from === toFrame) return;

  sprite._frameTimer?.remove(false);
  const dir = toFrame > from ? 1 : -1;

  sprite._frameTimer = scene.time.addEvent({
    delay: 45,
    loop: true,
    callback: () => {
      if (!sprite.active) {
        sprite._frameTimer?.remove(false);
        return;
      }
      const next = (sprite.frame?.name ?? 0) + dir;
      sprite.setFrame(next);
      if (next === toFrame) sprite._frameTimer?.remove(false);
    }
  });
}

function openSwapOverlay(scene, incomingCard, onDone) {
  const hand = getCardHand(TEAM_ID);
  const cam = scene.cameras.main;

  const overlay = scene.add.container(0, 0).setDepth((UIDEPTH ?? 10) + 1000);
  overlay.setScrollFactor(0);
  scene.cameras.main.ignore(overlay);

  const shade = scene.add.rectangle(0, 0, cam.width, cam.height, 0x000000, 0.75)
    .setOrigin(0)
    .setInteractive({ useHandCursor: true })
    .setScrollFactor(0);

  const title = scene.add.text(cam.centerX, 70, "Hand Full - Choose a Card to Replace", {
    fontSize: "18px",
    color: "#ffffff",
    fontFamily: "Bungee"
  }).setOrigin(0.5).setScrollFactor(0);

  const subtitle = scene.add.text(cam.centerX, 95, `New: ${incomingCard.name}`, {
    fontSize: "12px",
    color: "#cccccc",
    fontFamily: "Bungee"
  }).setOrigin(0.5).setScrollFactor(0);

  overlay.add([shade, title, subtitle]);

  const y = 200;
  const slotW = 160;
  const slotH = 190;
  const spacing = 175;
  const startX = cam.centerX - 2 * spacing;

  for (let i = 0; i < 5; i++) {
    const x = startX + i * spacing;
    const existing = hand[i];

    const bg = scene.add.rectangle(x, y, slotW, slotH, 0x222222, 0.9)
      .setStrokeStyle(2, 0xffffff)
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0);

    const iconBg = scene.add.rectangle(x, y - 35, 50, 50, 0x111111, 1)
      .setStrokeStyle(1, 0xffffff, 0.4)
      .setScrollFactor(0);

    const name = scene.add.text(x, y - 70, existing?.name || "(empty?)", {
      fontSize: "12px",
      color: "#ffffff",
      fontFamily: "Bungee"
    }).setOrigin(0.5).setScrollFactor(0);

    const desc = scene.add.text(x, y + 25, existing?.text || "", {
      fontSize: "12px",
      color: "#cccccc",
      wordWrap: { width: slotW - 20 }
    }).setOrigin(0.5).setScrollFactor(0);

    const icon = existing?.image
      ? scene.add.image(x, y - 35, existing.image).setScale(1).setScrollFactor(0)
      : scene.add.text(x, y - 35, "?", { fontSize: "18px", color: "#ffffff" }).setOrigin(0.5).setScrollFactor(0);

    bg.on("pointerdown", () => {
      const old = hand[i];
      if (old && typeof old.remove === "function") old.remove(scene);

      hand[i] = incomingCard;
      if (incomingCard && typeof incomingCard.apply === "function") incomingCard.apply(scene);

      scene.events.emit("cards:updated");
      overlay.destroy(true);
      onDone?.(true);
    });

    overlay.add([bg, iconBg, icon, name, desc]);
  }

  const cancelBg = scene.add.rectangle(cam.centerX, cam.height - 80, 220, 44, 0x550000, 0.85)
    .setStrokeStyle(2, 0xffffff)
    .setInteractive({ useHandCursor: true })
    .setScrollFactor(0);

  const cancelTx = scene.add.text(cam.centerX, cam.height - 80, "Cancel", {
    fontSize: "16px",
    color: "#ffffff",
    fontFamily: "Bungee"
  }).setOrigin(0.5).setScrollFactor(0);

  cancelBg.on("pointerdown", () => {
    overlay.destroy(true);
    onDone?.(false);
  });

  overlay.add([cancelBg, cancelTx]);
}

function grantCardReward(scene, card, onDone) {
  addCardToHand(card, TEAM_ID);
  scene.events.emit("cards:updated", buildCardAddedPayload(card, {
    teamNumber: TEAM_ID,
    source: "fort_reward",
  }));
  onDone?.();
}

function buildChestReward(scene, meta, ctx, completeReward) {
  const center = getFortCenter(meta);
  const chestRewards = getAvailableChestRewards(scene).slice(0, 3);
  const spacing = 170;
  const startX = center.x - ((chestRewards.length - 1) * spacing) / 2;
  const positions = chestRewards.map((_, index) => ({ x: startX + index * spacing, y: center.y }));
  chestRewards.forEach((chestDef, i) => {
    const pos = positions[i];
    const chest = worldify(scene, scene.add.sprite(pos.x, pos.y, "reward_treasure_chest", 0)
      .setDepth(10010)
      .setInteractive({ useHandCursor: true }));

    const tooltip = chestTooltip(scene, pos.x, pos.y - 95, chestDef);

    chest.on("pointerover", () => {
      animateChest(chest, 4, scene);
      tooltip.show();
    });

    chest.on("pointerout", () => {
      animateChest(chest, 0, scene);
      tooltip.hide();
    });

    chest.on("pointerdown", () => {
      chestDef.grant(scene);
      completeReward();
    });

    ctx.destroyers.push(() => {
      chest._frameTimer?.remove(false);
      tooltip.destroy();
      safeDestroy(chest);
    });
  });
}

function buildCardReward(scene, meta, ctx, completeReward) {
  const center = getFortCenter(meta);
  const cards = randomCards(3);
  const positions = rowPositions(center.x, center.y, 165);

  cards.forEach((card, i) => {
    const pos = positions[i];
    const tint = getCardOutlineTint(card);
    const visualStyle = getCardVisualStyle(card);

    const halo = worldify(scene, scene.add.ellipse(pos.x, pos.y, 96, 110, visualStyle.haloTint, visualStyle.isGold ? 0.18 : 0.05)
      .setDepth(10009));
    if (visualStyle.isGold) {
      scene.tweens.add({
        targets: halo,
        alpha: { from: 0.13, to: 0.22 },
        scaleX: 1.06,
        scaleY: 1.06,
        duration: 940,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    const mini = worldify(scene, scene.add.image(pos.x, pos.y, "reward_mini_card")
      .setDepth(10010)
      .setScale(1.25)
      .setTint(tint)
      .setInteractive({ useHandCursor: true }));

    const preview = createWorldCardPreview(scene, card, pos.x, pos.y - 150);

    mini.on("pointerover", () => preview.show());
    mini.on("pointerout", () => preview.hide());
    mini.on("pointerdown", () => {
      grantCardReward(scene, card, () => {
        showAlert(scene, `Picked card: ${card.name}`, "#aaffaa");
        completeReward();
      });
    });

    ctx.destroyers.push(() => {
      safeDestroy(halo);
      preview.destroy();
      safeDestroy(mini);
    });
  });
}

function buildPlayerReward(scene, meta, ctx, completeReward) {
  const center = getFortCenter(meta);
  const y = center.y;
  const spacing = 165;
  const options = Phaser.Utils.Array.Shuffle(getAvailablePlayerRewards().slice()).slice(0, 3);
  const startX = center.x - ((options.length - 1) * spacing) / 2;

  const title = worldify(scene, scene.add.text(center.x, y - 118, "PLAYER REWARD", {
    fontSize: "16px",
    color: "#ffffff",
    fontFamily: "Bungee",
    fontStyle: "bold"
  }).setOrigin(0.5).setDepth(10015));

  const hint = worldify(scene, scene.add.text(center.x, y - 96, "Pick 1 of 3 recruits", {
    fontSize: "12px",
    color: "#cccccc",
    fontFamily: "Bungee"
  }).setOrigin(0.5).setDepth(10015));

  const grantRecruit = (def) => {
    if (!Teams.canRecruitPlayer?.(TEAM_ID)) {
      scene.updateMoney?.(NO_HOUSE_FALLBACK_MONEY);
      showAlert(scene, `Housing full: +$${NO_HOUSE_FALLBACK_MONEY}`, "#ffcc88");
      completeReward();
      return;
    }

    const spawnTile = Teams.getTownSpawnTile?.(TEAM_ID);
    if (!spawnTile) {
      scene.updateMoney?.(NO_HOUSE_FALLBACK_MONEY);
      showAlert(scene, `No town road: +$${NO_HOUSE_FALLBACK_MONEY}`, "#ffcc88");
      completeReward();
      return;
    }

    const troop = new def.ctor(spawnTile.x, spawnTile.y, 1);
    const assigned = House.assignPlayerToHouse(troop, TEAM_ID);
    if (!assigned) {
      troop.destroySelf?.() ?? safeDestroy(troop);
      scene.updateMoney?.(NO_HOUSE_FALLBACK_MONEY);
      showAlert(scene, `No housing: +$${NO_HOUSE_FALLBACK_MONEY}`, "#ffcc88");
    } else {
      showAlert(scene, `Recruited: ${def.name}`, "#aaffaa");
    }
    completeReward();
  };

  const created = [title, hint];

  options.forEach((def, index) => {
    const x = startX + index * spacing;
    const cardBg = worldify(scene, scene.add.rectangle(x, y + 6, 136, 176, 0x181a29, 0.9)
      .setStrokeStyle(2, def.tint, 0.9)
      .setDepth(10010)
      .setInteractive({ useHandCursor: true }));

    const glow = worldify(scene, scene.add.rectangle(x, y + 6, 128, 168, def.tint, 0.09)
      .setDepth(10009));

    const previewBg = worldify(scene, scene.add.rectangle(x, y - 28, 78, 78, 0x0f172a, 0.96)
      .setStrokeStyle(1, 0xffffff, 0.18)
      .setDepth(10010));

    const preview = worldify(scene, scene.add.sprite(x, y - 28, "player", 0)
      .setDepth(10011)
      .setScale(1.8)
      .setTint(def.tint));

    const name = worldify(scene, scene.add.text(x, y + 34, def.name, {
      fontSize: "14px",
      color: "#ffffff",
      fontFamily: "Bungee",
      align: "center",
      wordWrap: { width: 116 },
    }).setOrigin(0.5).setDepth(10011));

    const caption = worldify(scene, scene.add.text(x, y + 78, "Recruit 1 unit", {
      fontSize: "11px",
      color: "#d7e0ec",
      fontFamily: "Bungee",
      align: "center",
    }).setOrigin(0.5).setDepth(10011));

    const buttonBg = worldify(scene, scene.add.rectangle(x, y + 118, 98, 26, 0x16351d, 0.92)
      .setStrokeStyle(1, 0xa7f3d0, 0.65)
      .setDepth(10010));

    const buttonText = worldify(scene, scene.add.text(x, y + 118, "Recruit", {
      fontSize: "12px",
      color: "#edfff0",
      fontFamily: "Bungee",
    }).setOrigin(0.5).setDepth(10011));

    const setHover = (hovered) => {
      cardBg.setFillStyle(hovered ? 0x20263a : 0x181a29, hovered ? 0.98 : 0.9);
      glow.setAlpha(hovered ? 0.18 : 0.09);
    };

    cardBg.on("pointerover", () => setHover(true));
    cardBg.on("pointerout", () => setHover(false));
    cardBg.on("pointerdown", () => grantRecruit(def));

    created.push(cardBg, glow, previewBg, preview, name, caption, buttonBg, buttonText);
  });

  ctx.destroyers.push(() => {
    created.forEach(safeDestroy);
  });
}

export function openFortRewardSelection(scene, { stageIndex, meta, onComplete } = {}) {
  const ctx = {
    done: false,
    destroyers: [],
  };

  const cleanup = () => {
    ctx.destroyers.forEach(fn => {
      try { fn?.(); } catch {}
    });
    ctx.destroyers.length = 0;
  };

  const finish = () => {
    if (ctx.done) return;
    ctx.done = true;
    cleanup();
    onComplete?.();
  };

  const type = pickRewardType(stageIndex ?? 1);

  if (type === "chest") {
    buildChestReward(scene, meta, ctx, finish);
  } else if (type === "player") {
    buildPlayerReward(scene, meta, ctx, finish);
  } else {
    buildCardReward(scene, meta, ctx, finish);
  }

  return {
    destroy: () => {
      if (ctx.done) return;
      ctx.done = true;
      cleanup();
    }
  };
}


