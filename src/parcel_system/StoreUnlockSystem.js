const STORAGE_KEY = "processv2.store_unlocks_v1";
const DEMO_COMPLETED_STORAGE_KEY = "processv2.demo_completed_v1";
const DISABLED_STORE_UNLOCK_KEYS = Object.freeze(["turret", "catapult"]);

let cachedUnlocks = null;
let cachedDemoCompleted = null;

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

export const DEMO_COMPLETION_STORE_UNLOCK_LABELS = Object.freeze({
  [STORE_UNLOCK_KEYS.blademaster]: "Blademaster",
  [STORE_UNLOCK_KEYS.gunslinger]: "Gunslinger",
  [STORE_UNLOCK_KEYS.stoneWall]: "Stone Walls",
  [STORE_UNLOCK_KEYS.militiaParcel]: "Militia Parcels",
});

export const DEMO_COMPLETION_STORE_UNLOCK_KEYS = Object.freeze(Object.keys(DEMO_COMPLETION_STORE_UNLOCK_LABELS));

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

export function hasDemoCompleted() {
  if (cachedDemoCompleted != null) return !!cachedDemoCompleted;

  const storage = getStorage();
  if (!storage) {
    cachedDemoCompleted = false;
    return false;
  }

  try {
    cachedDemoCompleted = storage.getItem(DEMO_COMPLETED_STORAGE_KEY) === "1";
  } catch {
    cachedDemoCompleted = false;
  }

  return !!cachedDemoCompleted;
}

export function setDemoCompleted(completed = true, scene = null) {
  const next = !!completed;
  const previous = hasDemoCompleted();
  cachedDemoCompleted = next;

  const storage = getStorage();
  if (storage) {
    try {
      if (next) storage.setItem(DEMO_COMPLETED_STORAGE_KEY, "1");
      else storage.removeItem(DEMO_COMPLETED_STORAGE_KEY);
    } catch {}
  }

  const changed = previous !== next;
  scene?.events?.emit?.("demo:completion-changed", {
    completed: next,
    changed,
  });
  return changed;
}

export function grantDemoCompletionStoreUnlocks(scene = null) {
  const unlockedLabels = [];
  const mirrorScene = scene?.uiScene && scene.uiScene !== scene
    ? scene.uiScene
    : (scene?.worldScene && scene.worldScene !== scene ? scene.worldScene : null);
  for (const key of DEMO_COMPLETION_STORE_UNLOCK_KEYS) {
    const changed = unlockStoreItem(key, scene);
    if (mirrorScene) unlockStoreItem(key, mirrorScene);
    if (changed) unlockedLabels.push(DEMO_COMPLETION_STORE_UNLOCK_LABELS[key] || key);
  }
  return unlockedLabels;
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
