const STORAGE_KEY = "processv2.store_unlocks_v1";
const DISABLED_STORE_UNLOCK_KEYS = Object.freeze(["turret", "catapult"]);

let cachedUnlocks = null;

function getStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {}
  return null;
}

function loadUnlocks() {
  if (cachedUnlocks) return cachedUnlocks;

  const storage = getStorage();
  if (!storage) {
    cachedUnlocks = new Set();
    return cachedUnlocks;
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    cachedUnlocks = new Set(Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : []);
    let removedDisabled = false;
    for (const key of DISABLED_STORE_UNLOCK_KEYS) {
      if (!cachedUnlocks.delete(key)) continue;
      removedDisabled = true;
    }
    if (removedDisabled) persistUnlocks();
  } catch {
    cachedUnlocks = new Set();
  }

  return cachedUnlocks;
}

function persistUnlocks() {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(Array.from(loadUnlocks())));
  } catch {}
}

export const STORE_UNLOCK_KEYS = Object.freeze({
  blademaster: "blademaster",
  gunslinger: "gunslinger",
  stoneWall: "stone_wall",
  turret: "turret",
  catapult: "catapult",
  militiaParcel: "militia_parcel",
});

export function hasStoreUnlock(key) {
  if (!key) return false;
  if (DISABLED_STORE_UNLOCK_KEYS.includes(key)) return false;
  return loadUnlocks().has(key);
}

export function getStoreUnlockSnapshot() {
  return Array.from(loadUnlocks());
}

export function unlockStoreItem(key, scene = null) {
  if (!key) return false;
  if (DISABLED_STORE_UNLOCK_KEYS.includes(key)) return false;

  const unlocks = loadUnlocks();
  const changed = !unlocks.has(key);
  unlocks.add(key);
  persistUnlocks();

  scene?.events?.emit?.("store:unlock-changed", {
    key,
    changed,
    unlocks: getStoreUnlockSnapshot(),
  });

  return changed;
}

export function resetStoreUnlocks(keys = null, scene = null) {
  const unlocks = loadUnlocks();
  const targets = Array.isArray(keys) && keys.length
    ? keys.filter((key) => typeof key === "string" && key.length > 0)
    : Array.from(unlocks);

  let changed = false;
  for (const key of targets) {
    if (!unlocks.has(key)) continue;
    unlocks.delete(key);
    changed = true;
  }

  if (!changed) return false;

  persistUnlocks();
  scene?.events?.emit?.("store:unlock-changed", {
    key: null,
    changed: true,
    reset: true,
    unlocks: getStoreUnlockSnapshot(),
  });
  return true;
}
