import { POWERUP_CARDS } from "../../Cards/PowerupCards.js";

export const REQUIRED_STARTER_CREW = Object.freeze({
  farmer: 1,
  fireman: 1,
  forager: 1,
  builder: 1,
  brawler: 0,
  gunslinger: 0,
  blademaster: 0,
});

export const REQUIRED_STARTER_TYPES = Object.freeze([
  "forager",
  "builder",
  "fireman",
  "farmer",
]);

function getCardByName(name) {
  const card = POWERUP_CARDS.find((entry) => entry?.name === name);
  if (!card) {
    throw new Error(`Unknown draft starter card: ${name}`);
  }
  return card;
}

export const STARTER_DECKS = Object.freeze([
  Object.freeze({
    id: "homestead-bloom",
    name: "Homestead Bloom",
    subtitle: "Stable harvest opener",
    accent: "#74d68e",
    accentDark: "#1f6d49",
    summary: "Heavier seeds, food, and water for a forgiving early economy.",
    tradeoff: "You start with the lightest building stockpile.",
    resources: Object.freeze({
      money: 420,
      seeds: 14,
      berries: 8,
      wood: 5,
      stone: 3,
      food: 10,
      water: 10,
    }),
    cards: Object.freeze([
      getCardByName("Efficient Farmers"),
      getCardByName("Hydrated Farmers"),
      getCardByName("Fleet Farmers"),
    ]),
  }),
  Object.freeze({
    id: "builder-cache",
    name: "Builder Cache",
    subtitle: "Fast setup opener",
    accent: "#f0b35a",
    accentDark: "#8b5420",
    summary: "Front-loads wood, stone, and build speed for an aggressive town setup.",
    tradeoff: "Less cash and fewer comfort resources at the start.",
    resources: Object.freeze({
      money: 320,
      seeds: 7,
      berries: 0,
      wood: 8,
      stone: 8,
      food: 8,
      water: 7,
    }),
    cards: Object.freeze([
      getCardByName("Master Builders"),
      getCardByName("Mighty Workers"),
      getCardByName("Boisterous Builders"),
    ]),
  }),
  Object.freeze({
    id: "campfire-rush",
    name: "Campfire Rush",
    subtitle: "Mobile utility opener",
    accent: "#ff8a6d",
    accentDark: "#91392a",
    summary: "More cash and berry pressure with quicker cooking and utility movement.",
    tradeoff: "Your farm setup is the thinnest of the three starts.",
    resources: Object.freeze({
      money: 500,
      seeds: 5,
      berries: 10,
      wood: 5,
      stone: 4,
      food: 6,
      water: 9,
    }),
    cards: Object.freeze([
      getCardByName("Rapid Firemen"),
      getCardByName("Frantic Foragers"),
      getCardByName("Hot Ovens"),
    ]),
  }),
]);

export function getStarterDeckById(id) {
  return STARTER_DECKS.find((deck) => deck.id === id) ?? STARTER_DECKS[0];
}

export function createStarterPortraitUnit(typeKey, health = 100) {
  return {
    health,
    isFarmer: typeKey === "farmer",
    isFireman: typeKey === "fireman",
    isForager: typeKey === "forager",
    isBuilder: typeKey === "builder",
    isBrawler: typeKey === "brawler",
    isBlademaster: typeKey === "blademaster",
    isGunslinger: typeKey === "gunslinger",
  };
}
