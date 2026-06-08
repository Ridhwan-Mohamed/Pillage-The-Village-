import { Teams } from "../Teams";
import { MARKET_CARD_KIND, getMarketCardDefinition } from "./MarketCards";

const BUCKETS = Object.freeze(["deck", "consumables"]);

export function createEmptyCardInventory() {
  return {
    deck: {},
    consumables: {},
  };
}

function normalizeBucket(value) {
  const out = {};
  if (!value || typeof value !== "object") return out;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const id = typeof entry === "string" ? entry : entry?.id;
      if (!id) continue;
      out[id] = Math.max(1, Math.floor(Number(out[id] || 0) + 1));
    }
    return out;
  }

  for (const [id, rawCount] of Object.entries(value)) {
    const count = Math.floor(Number(rawCount || 0));
    if (!id || count <= 0) continue;
    out[id] = count;
  }
  return out;
}

export function normalizeCardInventory(inventory = null) {
  const next = createEmptyCardInventory();
  if (!inventory || typeof inventory !== "object") return next;

  next.deck = normalizeBucket(inventory.deck ?? inventory.deckCards ?? inventory.roguelike ?? inventory.powerups ?? inventory.cards);
  next.consumables = normalizeBucket(inventory.consumables ?? inventory.consumable);

  for (const [cardId, count] of Object.entries(next.deck)) {
    const card = getMarketCardDefinition(cardId);
    if (!card || card.kind !== MARKET_CARD_KIND.CONSUMABLE) continue;
    next.consumables[cardId] = Math.max(0, Number(next.consumables[cardId] || 0)) + Math.max(0, Number(count || 0));
    delete next.deck[cardId];
  }

  for (const cardId of Object.keys(next.consumables)) {
    const card = getMarketCardDefinition(cardId);
    if (!card || card.kind !== MARKET_CARD_KIND.CONSUMABLE) {
      delete next.consumables[cardId];
    }
  }

  return next;
}

export function inventoryBucketForCard(cardOrId) {
  const card = getMarketCardDefinition(cardOrId);
  return card?.kind === MARKET_CARD_KIND.CONSUMABLE ? "consumables" : "deck";
}

export function buildCardAddedPayload(cardOrId, {
  teamNumber = "1",
  amount = 1,
  source = "reward",
  message = null,
} = {}) {
  const marketCard = getMarketCardDefinition(cardOrId);
  const rawCard = cardOrId && typeof cardOrId === "object" ? cardOrId : null;
  const card = marketCard || rawCard;
  const bucket = marketCard?.kind === MARKET_CARD_KIND.CONSUMABLE ? "consumables" : "deck";
  const noun = bucket === "consumables" ? "Consumable" : "Card";

  return {
    action: "added",
    bucket,
    cardId: card?.id ?? (typeof cardOrId === "string" ? cardOrId : null),
    cardName: card?.name ?? card?.title ?? "Card",
    amount: Math.max(1, Math.floor(Number(amount || 1))),
    teamNumber: String(teamNumber),
    source,
    message: message || `${noun} added`,
  };
}

export function ensureCardInventory(teamNumber = "1") {
  const team = Teams.getTeam?.(teamNumber) ?? Teams.teamLists?.[String(teamNumber)] ?? Teams.teamLists?.[teamNumber];
  if (!team) return createEmptyCardInventory();
  team.cardInventory = normalizeCardInventory(team.cardInventory);
  return team.cardInventory;
}

export function addCardToInventory(cardOrId, teamNumber = "1", amount = 1) {
  const card = getMarketCardDefinition(cardOrId);
  const n = Math.max(1, Math.floor(Number(amount || 1)));
  if (!card?.id) return false;

  const inventory = ensureCardInventory(teamNumber);
  const bucket = inventoryBucketForCard(card);
  inventory[bucket][card.id] = Math.max(0, Number(inventory[bucket][card.id] || 0)) + n;
  return true;
}

export function removeCardFromInventory(cardOrId, teamNumber = "1", amount = 1) {
  const card = getMarketCardDefinition(cardOrId);
  const n = Math.max(1, Math.floor(Number(amount || 1)));
  if (!card?.id) return false;

  const inventory = ensureCardInventory(teamNumber);
  const bucket = inventoryBucketForCard(card);
  const current = Math.max(0, Number(inventory[bucket][card.id] || 0));
  if (current < n) return false;

  const next = current - n;
  if (next > 0) inventory[bucket][card.id] = next;
  else delete inventory[bucket][card.id];
  return true;
}

export function getCardInventoryEntries(teamNumber = "1", tabKey = null) {
  const inventory = ensureCardInventory(teamNumber);
  const buckets = tabKey && BUCKETS.includes(tabKey) ? [tabKey] : BUCKETS;
  const entries = [];

  for (const bucket of buckets) {
    for (const [cardId, quantity] of Object.entries(inventory[bucket] || {})) {
      const card = getMarketCardDefinition(cardId);
      if (!card) continue;
      entries.push({
        card,
        cardId,
        quantity: Math.max(0, Number(quantity || 0)),
        bucket,
      });
    }
  }

  return entries
    .filter((entry) => entry.quantity > 0)
    .sort((a, b) => {
      const priceDiff = Number(b.card?.price || 0) - Number(a.card?.price || 0);
      if (priceDiff !== 0) return priceDiff;
      return String(a.card?.name || "").localeCompare(String(b.card?.name || ""));
    });
}

export function getCardInventoryCount(teamNumber = "1", tabKey = null) {
  return getCardInventoryEntries(teamNumber, tabKey)
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.quantity || 0)), 0);
}

export function getCardInventorySnapshot(inventory = null) {
  return normalizeCardInventory(inventory);
}

export function restoreCardInventorySnapshot(snapshot = null) {
  return normalizeCardInventory(snapshot);
}
