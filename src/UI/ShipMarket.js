// src/UI/ShipMarket.js
//
// World-space parcel market. The market itself is the storefront UI that
// occupies the bought parcel; no separate ship, cargo piles, or screen modal.

import Phaser from "phaser";
import { UIDEPTH, SQUARESIZE, showAlert } from "../constants";
import { AudioManager } from "../Manager/AudioManager";
import { addCardToInventory, buildCardAddedPayload } from "../Cards/CardInventory";
import {
  MARKET_CARD_OFFERS,
  MARKET_CARD_SECTION,
  MARKET_CARD_SECTIONS,
  MARKET_CARDS_BY_SECTION,
  MARKET_PLACEHOLDER_ASSETS,
  loadMarketCardAssets,
  loadMarketCardPlaceholderAssets,
} from "../Cards/MarketCards";
import { getCardOutlineTint } from "./CardPreview";
import { RELIEF_PACKAGE_PRICE } from "../ReliefPackageConfig";
import { BODY_FONT_FAMILY } from "./Typography.js";

export const DEFAULT_MARKET_PRICES = Object.freeze(
  Object.fromEntries([
    ...MARKET_CARD_OFFERS.map((card) => [card.id, card.price]),
    ["relief_package", RELIEF_PACKAGE_PRICE],
  ])
);

export function loadParcelMarketAssets(scene) {
  loadMarketCardAssets(scene);
  loadMarketCardPlaceholderAssets(scene);
}

function getPriceTable(pricesMaybe) {
  return { ...DEFAULT_MARKET_PRICES, ...(pricesMaybe || {}) };
}

function getRepeatBuyInflation(card = null) {
  const explicit = Number(card?.repeatBuyInflation);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  if (card?.marketSection === MARKET_CARD_SECTION.RECOVERY) return 0.1;
  if (card?.marketSection === MARKET_CARD_SECTION.ATTACK) return 0.15;
  return 0.15;
}

function getMoney(scene) {
  if (typeof scene?.getMoney === "function") return scene.getMoney();
  return Number(scene?.money || 0);
}

function canAfford(scene, cost) {
  if (typeof scene?.checkSufficientFunds === "function") return scene.checkSufficientFunds(cost);
  return getMoney(scene) >= cost;
}

function spend(scene, cost) {
  if (typeof scene?.updateMoney === "function") scene.updateMoney(-cost);
  else if (scene && typeof scene.money === "number") scene.money -= cost;
}

function worldMode(scene) {
  return scene?.zoomMixer?.mode || "detailed";
}

function setInteractiveEnabled(zone, enabled) {
  if (!zone?.input) return;
  zone.input.enabled = !!enabled;
  zone.setActive?.(!!enabled);
}

function mixIntColor(colorA, colorB, t = 0.5) {
  const a = Phaser.Display.Color.IntegerToColor(colorA);
  const b = Phaser.Display.Color.IntegerToColor(colorB);
  const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(
    a,
    b,
    100,
    Math.round(Phaser.Math.Clamp(t, 0, 1) * 100)
  );
  return Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b);
}

function drawGlassRect(graphics, x, y, w, h, radius = 12, {
  fill = 0x14384c,
  alpha = 0.84,
  stroke = 0x98e7ff,
  strokeAlpha = 0.28,
  shineAlpha = 0.08,
  shadowAlpha = 0.16,
} = {}) {
  graphics.clear();
  if (shadowAlpha > 0) {
    graphics.fillStyle(0x020812, shadowAlpha);
    graphics.fillRoundedRect(x + 4, y + 8, w, h, radius);
  }
  graphics.fillStyle(fill, alpha);
  graphics.fillRoundedRect(x, y, w, h, radius);
  if (shineAlpha > 0) {
    graphics.fillStyle(0xffffff, shineAlpha);
    graphics.fillRoundedRect(x + 8, y + 8, Math.max(12, w - 16), Math.max(10, Math.floor(h * 0.24)), Math.max(4, radius - 4));
  }
  graphics.lineStyle(2, stroke, strokeAlpha);
  graphics.strokeRoundedRect(x, y, w, h, radius);
  graphics.lineStyle(1, 0xffffff, 0.12);
  graphics.strokeRoundedRect(x + 2, y + 2, w - 4, h - 4, Math.max(4, radius - 2));
}

function makeWorldButton(scene, x, y, width, height, label, {
  onClick = null,
  fill = 0x1f5c42,
  stroke = 0x9dffa5,
  disabled = false,
  depth = 0,
} = {}) {
  const root = scene.add.container(x, y).setDepth(depth);
  const bg = scene.add.graphics();
  const text = scene.add.text(0, 0, label, {
    fontFamily: "Bungee",
    fontSize: "10px",
    color: disabled ? "#a8b5bd" : "#fff9ef",
    stroke: "#081621",
    strokeThickness: 3,
    align: "center",
  }).setOrigin(0.5);
  const hit = scene.add.zone(0, 0, width, height).setInteractive({ useHandCursor: !disabled });

  const redraw = (hovered = false, pressed = false) => {
    bg.clear();
    bg.fillStyle(fill, disabled ? 0.16 : pressed ? 0.56 : hovered ? 0.44 : 0.32);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
    bg.lineStyle(2, stroke, disabled ? 0.16 : hovered ? 0.72 : 0.42);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);
    text.setAlpha(disabled ? 0.52 : 1);
  };

  redraw();
  hit.on("pointerover", () => {
    if (disabled) return;
    AudioManager.playMarketHover?.();
    redraw(true, false);
  });
  hit.on("pointerout", () => redraw(false, false));
  hit.on("pointerdown", (_pointer, _lx, _ly, event) => {
    event?.stopPropagation?.();
    if (disabled) return;
    redraw(true, true);
  });
  hit.on("pointerup", (_pointer, _lx, _ly, event) => {
    event?.stopPropagation?.();
    if (disabled) return;
    redraw(true, false);
    onClick?.();
  });

  root.add([bg, text, hit]);
  root._marketHit = hit;
  return root;
}

function makeCardOffer(scene, card, {
  x,
  y,
  w,
  h,
  price,
  sold,
  teamNumber,
  onPurchased,
}) {
  const tint = getCardOutlineTint(card);
  const root = scene.add.container(x, y);
  const bg = scene.add.graphics();
  drawGlassRect(bg, -w / 2, -h / 2, w, h, 8, {
    fill: mixIntColor(0x17384d, tint, 0.12),
    alpha: sold ? 0.34 : 0.78,
    stroke: tint,
    strokeAlpha: sold ? 0.14 : 0.38,
    shineAlpha: sold ? 0.02 : 0.06,
    shadowAlpha: 0.06,
  });

  const iconPlate = scene.add.rectangle(-w / 2 + 30, -14, 42, 42, 0x0b1c27, 0.58)
    .setStrokeStyle(2, tint, 0.38);
  const icon = scene.textures.exists(card.image)
    ? scene.add.image(-w / 2 + 30, -14, card.image).setDisplaySize(30, 30)
    : scene.add.rectangle(-w / 2 + 30, -14, 28, 28, tint, 0.3);
  icon.setAlpha(sold ? 0.35 : 1);

  const name = scene.add.text(-w / 2 + 58, -33, card.name, {
    fontFamily: "Bungee",
    fontSize: "10px",
    color: sold ? "#8fa1aa" : "#fff9ef",
    stroke: "#081621",
    strokeThickness: 3,
    wordWrap: { width: w - 70 },
  }).setOrigin(0, 0);

  const desc = scene.add.text(-w / 2 + 58, -12, card.text, {
    fontFamily: BODY_FONT_FAMILY,
    fontSize: "9px",
    color: sold ? "#6f8895" : "#d3edf9",
    fontStyle: "600",
    lineSpacing: 1,
    wordWrap: { width: w - 70 },
  }).setOrigin(0, 0);

  const priceText = scene.add.text(-w / 2 + 14, h / 2 - 20, `$${price}`, {
    fontFamily: "Bungee",
    fontSize: "11px",
    color: sold ? "#8fa1aa" : "#fff1b3",
    stroke: "#081621",
    strokeThickness: 3,
  }).setOrigin(0, 0.5);

  const buyButton = makeWorldButton(scene, w / 2 - 42, h / 2 - 20, 74, 26, sold ? "SOLD" : "BUY", {
    fill: sold ? 0x2b3238 : 0x1f5c42,
    stroke: sold ? 0x74838c : 0x9dffa5,
    disabled: sold,
    onClick: () => {
      if (sold) return;
      if (!canAfford(scene, price)) {
        AudioManager.playError?.();
        return;
      }
      spend(scene, price);
      const added = addCardToInventory(card, String(teamNumber), 1);
      if (!added) {
        scene.updateMoney?.(price);
        showAlert(scene, "Couldn't add card to inventory", "#ff5555");
        AudioManager.playError?.();
        return;
      }
      scene.events.emit("cards:updated", buildCardAddedPayload(card, {
        teamNumber,
        source: "market",
      }));
      scene.achievementSystem?.addStat?.("marketPurchases", 1);
      AudioManager.playMarketPurchase?.();
      showAlert(scene, `Bought ${card.name}`, "#aaffaa");
      onPurchased?.(card);
    },
  });

  root.add([bg, iconPlate, icon, name, desc, priceText, buyButton]);
  root._marketHitZones = [buyButton._marketHit].filter(Boolean);
  return root;
}

function makeReliefPackageOffer(scene, {
  x,
  y,
  w,
  h,
  price,
  sold,
  teamNumber,
  onSold,
}) {
  const tint = 0xffd47c;
  const alreadyStocked = !!scene?.hasReliefPackage?.(teamNumber);
  const disabled = sold || alreadyStocked;
  const buttonLabel = sold ? "SOLD" : alreadyStocked ? "STOCKED" : "BUY";
  const root = scene.add.container(x, y);
  const bg = scene.add.graphics();
  drawGlassRect(bg, -w / 2, -h / 2, w, h, 8, {
    fill: mixIntColor(0x17384d, tint, 0.12),
    alpha: disabled ? 0.34 : 0.78,
    stroke: tint,
    strokeAlpha: disabled ? 0.14 : 0.38,
    shineAlpha: disabled ? 0.02 : 0.06,
    shadowAlpha: 0.06,
  });

  const iconPlate = scene.add.rectangle(-w / 2 + 30, -14, 42, 42, 0x0b1c27, 0.58)
    .setStrokeStyle(2, tint, 0.38);
  const icon = scene.textures.exists("relief_package")
    ? scene.add.image(-w / 2 + 30, -14, "relief_package").setDisplaySize(30, 30)
    : scene.add.rectangle(-w / 2 + 30, -14, 28, 28, tint, 0.3);
  icon.setAlpha(disabled ? 0.35 : 1);

  const name = scene.add.text(-w / 2 + 58, -33, "Relief Package", {
    fontFamily: "Bungee",
    fontSize: "10px",
    color: disabled ? "#8fa1aa" : "#fff9ef",
    stroke: "#081621",
    strokeThickness: 3,
    wordWrap: { width: w - 70 },
  }).setOrigin(0, 0);

  const desc = scene.add.text(-w / 2 + 58, -12, "Emergency storage recovery. Auto-deploys when all storages are lost. Limit 1.", {
    fontFamily: BODY_FONT_FAMILY,
    fontSize: "9px",
    color: disabled ? "#6f8895" : "#d3edf9",
    fontStyle: "600",
    lineSpacing: 1,
    wordWrap: { width: w - 70 },
  }).setOrigin(0, 0);

  const priceText = scene.add.text(-w / 2 + 14, h / 2 - 20, `$${price}`, {
    fontFamily: "Bungee",
    fontSize: "11px",
    color: disabled ? "#8fa1aa" : "#fff1b3",
    stroke: "#081621",
    strokeThickness: 3,
  }).setOrigin(0, 0.5);

  const buyButton = makeWorldButton(scene, w / 2 - 42, h / 2 - 20, 74, 26, buttonLabel, {
    fill: disabled ? 0x2b3238 : 0x1f5c42,
    stroke: disabled ? 0x74838c : 0x9dffa5,
    disabled,
    onClick: () => {
      if (disabled) return;
      if (!canAfford(scene, price)) {
        AudioManager.playError?.();
        return;
      }
      spend(scene, price);
      const stockedCount = Number(scene.grantReliefPackage?.(teamNumber) || 0);
      if (!(stockedCount > 0)) {
        scene.updateMoney?.(price);
        showAlert(scene, "Couldn't stock the relief package", "#ff5555");
        AudioManager.playError?.();
        return;
      }
      scene.achievementSystem?.addStat?.("marketPurchases", 1);
      AudioManager.playMarketPurchase?.();
      showAlert(scene, "Relief package stocked", "#aaffaa");
      onSold?.("relief_package");
    },
  });

  root.add([bg, iconPlate, icon, name, desc, priceText, buyButton]);
  root._marketHitZones = [buyButton._marketHit].filter(Boolean);
  return root;
}

export function spawnParcelMarketStorefront(scene, {
  origin = null,
  parcelCenterWorld = null,
  slotId = null,
  teamNumber = 1,
  durationMs = 60_000,
  prices = null,
  soldIds = [],
  onSoldIdsChanged = null,
  onPricesChanged = null,
} = {}) {
  loadMarketCardPlaceholderAssets(scene);

  const priceTable = getPriceTable(prices);
  const sold = new Set(soldIds instanceof Set ? Array.from(soldIds) : (soldIds || []));
  const center = parcelCenterWorld ?? {
    x: (origin?.x ?? 0) * SQUARESIZE + (25 * SQUARESIZE) / 2,
    y: (origin?.y ?? 0) * SQUARESIZE + (25 * SQUARESIZE) / 2,
  };

  const rootDepth = (UIDEPTH ?? 10) + 1;
  const parcelPx = 25 * SQUARESIZE;
  const panelW = parcelPx - 54;
  const panelH = parcelPx - 58;
  const columnGap = 14;
  const colW = Math.floor((panelW - 56 - columnGap * 2) / 3);
  const rowH = 96;

  let destroyed = false;
  let currentMode = worldMode(scene);
  const hitZones = [];

  const container = scene.add.container(center.x, center.y)
    .setDepth(rootDepth)
    .setAlpha(0);

  const shell = scene.add.graphics();
  drawGlassRect(shell, -panelW / 2, -panelH / 2, panelW, panelH, 16, {
    fill: 0x102f42,
    alpha: 0.9,
    stroke: 0x98e7ff,
    strokeAlpha: 0.36,
    shineAlpha: 0.08,
  });

  const detailedLayer = scene.add.container(0, 0);
  const overviewLayer = scene.add.container(0, 0).setVisible(false);

  const title = scene.add.text(-panelW / 2 + 28, -panelH / 2 + 30, "PARCEL MARKET", {
    fontFamily: "Bungee",
    fontSize: "18px",
    color: "#fff9ef",
    stroke: "#081621",
    strokeThickness: 4,
  }).setOrigin(0, 0.5);

  const subtitle = scene.add.text(-panelW / 2 + 28, -panelH / 2 + 56, "Cards and emergency supplies are bought here.", {
    fontFamily: "Bungee",
    fontSize: "8px",
    color: "#d3edf9",
    stroke: "#081621",
    strokeThickness: 2,
  }).setOrigin(0, 0.5);

  detailedLayer.add([title, subtitle]);

  function rebuildOffers() {
    detailedLayer._offerNodes?.forEach((node) => node.destroy(true));
    detailedLayer._offerNodes = [];
    hitZones.length = 0;

    const topY = -panelH / 2 + 96;
    const leftX = -panelW / 2 + 28;
    MARKET_CARD_SECTIONS.forEach((section, sectionIndex) => {
      const colX = leftX + sectionIndex * (colW + columnGap);
      const headerBg = scene.add.graphics();
      drawGlassRect(headerBg, colX, topY - 34, colW, 30, 8, {
        fill: 0x1b536d,
        alpha: 0.72,
        stroke: sectionIndex === 0 ? 0x7cffb2 : sectionIndex === 1 ? 0xffad73 : 0x98e7ff,
        strokeAlpha: 0.28,
        shineAlpha: 0.05,
        shadowAlpha: 0.04,
      });
      const headerText = scene.add.text(colX + 12, topY - 19, section.label, {
        fontFamily: "Bungee",
        fontSize: "10px",
        color: "#fff9ef",
        stroke: "#081621",
        strokeThickness: 3,
      }).setOrigin(0, 0.5);
      detailedLayer.add([headerBg, headerText]);
      detailedLayer._offerNodes.push(headerBg, headerText);

      const offers = [
        ...(section.key === MARKET_CARD_SECTION.RECOVERY ? ["relief_package"] : []),
        ...(MARKET_CARDS_BY_SECTION[section.key] || []),
      ];
      offers.forEach((offerDef, index) => {
        const offerId = typeof offerDef === "string" ? offerDef : offerDef.id;
        const price = Number(priceTable[offerId] ?? offerDef?.price ?? 0);
        const offer = offerId === "relief_package"
          ? makeReliefPackageOffer(scene, {
            x: colX + colW / 2,
            y: topY + index * (rowH + 10) + rowH / 2,
            w: colW,
            h: rowH,
            price,
            sold: sold.has(offerId),
            teamNumber,
            onSold: (nextOfferId) => {
              sold.add(nextOfferId);
              onSoldIdsChanged?.(Array.from(sold));
              rebuildOffers();
              applyMode(currentMode);
            },
          })
          : makeCardOffer(scene, offerDef, {
          x: colX + colW / 2,
          y: topY + index * (rowH + 10) + rowH / 2,
          w: colW,
          h: rowH,
          price,
          sold: false,
          teamNumber,
          onPurchased: (purchasedCard) => {
            const nextPrice = scene.applyRunMarketPriceInflation?.(purchasedCard?.id, getRepeatBuyInflation(purchasedCard));
            if (Number.isFinite(nextPrice) && nextPrice > 0) {
              priceTable[purchasedCard.id] = nextPrice;
              onPricesChanged?.({ ...priceTable });
            }
            rebuildOffers();
            applyMode(currentMode);
          },
        });
        detailedLayer.add(offer);
        detailedLayer._offerNodes.push(offer);
        hitZones.push(...(offer._marketHitZones || []));
      });
    });
  }

  const overviewStore = scene.add.image(0, -24, MARKET_PLACEHOLDER_ASSETS.storefront)
    .setDisplaySize(SQUARESIZE * 12, SQUARESIZE * 8)
    .setAlpha(0.94);
  const overviewSignBg = scene.add.rectangle(0, -SQUARESIZE * 5.1, SQUARESIZE * 7.2, 34, 0x102f42, 0.86)
    .setStrokeStyle(2, 0x98e7ff, 0.45);
  const overviewSign = scene.add.text(0, -SQUARESIZE * 5.1, "MARKET", {
    fontFamily: "Bungee",
    fontSize: "17px",
    color: "#fff9ef",
    stroke: "#081621",
    strokeThickness: 4,
  }).setOrigin(0.5);
  const overviewHint = scene.add.text(0, SQUARESIZE * 4.7, "Zoom in to shop", {
    fontFamily: "Bungee",
    fontSize: "9px",
    color: "#d3edf9",
    stroke: "#081621",
    strokeThickness: 3,
  }).setOrigin(0.5);
  overviewLayer.add([overviewStore, overviewSignBg, overviewSign, overviewHint]);

  container.add([shell, detailedLayer, overviewLayer]);
  rebuildOffers();

  scene.tweens.add({
    targets: container,
    alpha: 1,
    scaleX: { from: 0.96, to: 1 },
    scaleY: { from: 0.96, to: 1 },
    duration: 220,
    ease: "Quad.easeOut",
  });

  function applyMode(mode) {
    currentMode = mode || "detailed";
    const isOverview = currentMode === "overview";
    detailedLayer.setVisible(!isOverview);
    overviewLayer.setVisible(isOverview);
    hitZones.forEach((zone) => setInteractiveEnabled(zone, !isOverview));
  }

  applyMode(currentMode);

  const modeTimer = scene.time.addEvent({
    delay: 250,
    loop: true,
    callback: () => {
      const nextMode = worldMode(scene);
      if (nextMode !== currentMode) applyMode(nextMode);
    },
  });
  const reliefPackageChanged = () => {
    rebuildOffers();
    applyMode(currentMode);
  };
  scene.events.on("relief-package:changed", reliefPackageChanged);

  const depart = (onDone) => {
    if (destroyed) {
      onDone?.();
      return;
    }
    scene.tweens.add({
      targets: container,
      alpha: 0,
      scaleX: 0.96,
      scaleY: 0.96,
      duration: 220,
      ease: "Quad.easeIn",
      onComplete: () => {
        handle.destroy();
        onDone?.();
      },
    });
  };

  const handle = {
    container,
    durationMs,
    slotId,
    get soldIds() {
      return Array.from(sold);
    },
    get prices() {
      return { ...priceTable };
    },
    setMode: applyMode,
    openPanel: () => {},
    closePanel: () => {},
    depart,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      scene.events.off("relief-package:changed", reliefPackageChanged);
      modeTimer?.remove(false);
      scene.tweens.killTweensOf(container);
      container.destroy(true);
    },
  };

  return handle;
}

// Compatibility exports for older imports while call sites are migrated.
export const DEFAULT_SUPPLY_PRICES = DEFAULT_MARKET_PRICES;
export const loadShipMarketAssets = loadParcelMarketAssets;
export const spawnMarketShip = spawnParcelMarketStorefront;
