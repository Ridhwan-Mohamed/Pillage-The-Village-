import {
  getStarterDeckById,
  REQUIRED_STARTER_CREW,
  STARTER_DECKS,
} from "./DraftStarterDecks.js";

const WALL_PRICES = Object.freeze({
  wood: 10,
  stone: 15,
});

export const DEFAULT_LAYOUT_MOVE_RANGE = 5;

export class DraftStartState {
  constructor(opts = {}) {
    this.teamName = opts.teamName ?? "";
    this.starterDecks = STARTER_DECKS.slice();
    this.selectedDeckId = opts.defaultDeckId ?? this.starterDecks[0]?.id ?? null;

    this.crew = { ...REQUIRED_STARTER_CREW };
    this.cash = 0;
    this.supplies = {
      seeds: 0,
      food: 0,
      berries: 0,
      wood: 0,
      stone: 0,
      water: 0,
    };

    this.cards = {
      offered: [],
      picked: [],
    };

    this.extras = {
      house: 0,
      storage: 1,
      oven: 1,
      wall: 0,
      wallType: "wood",
    };

    this.placedBuildings = [];
    this.wall = {
      estimatedTiles: 0,
      estimatedCost: 0,
    };
    this.layoutMoveRange = Math.max(0, Math.floor(opts.layoutMoveRange ?? DEFAULT_LAYOUT_MOVE_RANGE));

    this._listeners = new Set();
    this.recalc();
  }

  onChange(cb) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _emit(reason = "ui") {
    for (const cb of this._listeners) cb(this, reason);
  }

  setTeamName(name) {
    this.teamName = (name ?? "").trim().slice(0, 24);
    this._emit("ui");
  }

  selectStarterDeck(deckId) {
    const deck = getStarterDeckById(deckId);
    if (!deck || deck.id === this.selectedDeckId) return;
    this.selectedDeckId = deck.id;
    this.recalc();
    this._emit("ui");
  }

  getSelectedDeck() {
    return getStarterDeckById(this.selectedDeckId);
  }

  getSelectedResources() {
    return { ...(this.getSelectedDeck()?.resources ?? {}) };
  }

  getTotalCrew() {
    return Object.values(this.crew).reduce((sum, value) => sum + value, 0);
  }

  minHousesNeeded() {
    return Math.ceil(this.getTotalCrew() / 2);
  }

  setExtra(key, value) {
    if (!(key in this.extras)) return;

    if (key === "wall") {
      this.extras.wall = value ? 1 : 0;
      this._emit("preview");
      return;
    }

    if (key === "wallType") {
      this.extras.wallType = value === "stone" ? "stone" : "wood";
      this._emit("preview");
      return;
    }

    this.extras[key] = Math.max(0, Math.floor(value));
    this._emit("ui");
  }

  setPlacedBuildings(list) {
    this.placedBuildings = Array.isArray(list) ? list : [];
    this.recalc();
    this._emit("preview");
  }

  setWallEstimate(tiles, silent = false) {
    this.wall.estimatedTiles = Math.max(0, Math.floor(tiles));
    this.wall.estimatedCost = this.wall.estimatedTiles * WALL_PRICES[this.extras.wallType];
    if (!silent) this._emit("ui");
  }

  canAfford() {
    return true;
  }

  recalc() {
    const deck = this.getSelectedDeck();
    const resources = deck?.resources ?? {};

    this.cash = resources.money ?? 0;
    this.supplies = {
      seeds: resources.seeds ?? 0,
      food: resources.food ?? 0,
      berries: resources.berries ?? 0,
      wood: resources.wood ?? 0,
      stone: resources.stone ?? 0,
      water: resources.water ?? 0,
    };

    this.cards.offered = deck?.cards ? deck.cards.slice() : [];
    this.cards.picked = deck?.cards ? deck.cards.slice() : [];

    const placedHouseCount = this._countPlaced(["house1", "house2"]);
    const placedStorageCount = this._countPlaced(["storage"]);
    const placedOvenCount = this._countPlaced(["clayOven"]);

    this.extras.house = Math.max(this.minHousesNeeded(), placedHouseCount);
    this.extras.storage = Math.max(1, placedStorageCount);
    this.extras.oven = Math.max(1, placedOvenCount);
    this.wall.estimatedCost = this.wall.estimatedTiles * WALL_PRICES[this.extras.wallType];
  }

  _countPlaced(typeKeys) {
    const allowed = new Set(typeKeys);
    return (this.placedBuildings ?? []).reduce((count, building) => {
      const typeKey = building?.typeKey ?? building?.type;
      return count + (allowed.has(typeKey) ? 1 : 0);
    }, 0);
  }

  toStartConfig() {
    this.recalc();
    const deck = this.getSelectedDeck();
    const resources = this.getSelectedResources();

    return {
      teamName: this.teamName,
      starterDeckId: deck?.id ?? null,
      starterDeckName: deck?.name ?? "Starter Deck",
      starterDeckSummary: deck?.summary ?? "",
      crew: { ...this.crew },
      resources,
      supplies: { ...this.supplies },
      money: {
        amount: this.cash,
      },
      extras: { ...this.extras },
      wall: { ...this.wall },
      layoutMoveRange: this.layoutMoveRange,
      cards: {
        picked: (this.cards.picked ?? []).map((card) => ({
          id: card.id ?? card.name ?? card.key,
          ...card,
        })),
      },
      buildings: structuredClone(this.placedBuildings),
    };
  }
}
