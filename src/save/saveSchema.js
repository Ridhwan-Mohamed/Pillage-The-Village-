export const RUN_SAVE_STORAGE_KEY = "processv2.run_save_v1";
export const RUN_SAVE_META_STORAGE_KEY = "processv2.run_save_meta_v1";
export const TUTORIAL_PROFILE_STORAGE_KEY = "processv2.tutorial_profile_v1";
export const SAVE_SCHEMA_VERSION = 1;
export const SAVE_BUILD_LABEL = "v1.0.0";

export function getSaveStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {}
  return null;
}

export function readJson(storageKey, fallback = null) {
  const storage = getSaveStorage();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJson(storageKey, value) {
  const storage = getSaveStorage();
  if (!storage) return false;
  try {
    storage.setItem(storageKey, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeJson(storageKey) {
  const storage = getSaveStorage();
  if (!storage) return false;
  try {
    storage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}

export function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function buildRunSaveMeta(snapshot = null) {
  if (!snapshot || !isPlainObject(snapshot)) return null;
  const meta = isPlainObject(snapshot.meta) ? snapshot.meta : {};
  return {
    version: Number(snapshot.version || 0),
    buildLabel: String(snapshot.buildLabel || SAVE_BUILD_LABEL),
    savedAt: Number(snapshot.savedAt || Date.now()),
    day: Math.max(1, Number(meta.day || 1)),
    phase: String(meta.phase || "day"),
    seasonIndex: Math.max(1, Number(meta.seasonIndex || 1)),
    stageIndex: Math.max(1, Number(meta.stageIndex || 1)),
    money: Math.max(0, Number(meta.money || 0)),
    hasContinue: true,
  };
}

export function validateRunSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) return { ok: false, reason: "Snapshot missing" };
  if (Number(snapshot.version) !== SAVE_SCHEMA_VERSION) return { ok: false, reason: "Version mismatch" };
  if (!isPlainObject(snapshot.meta)) return { ok: false, reason: "Meta missing" };
  if (!isPlainObject(snapshot.world)) return { ok: false, reason: "World missing" };
  if (!Array.isArray(snapshot.world.grid)) return { ok: false, reason: "Grid missing" };
  if (!isPlainObject(snapshot.progression)) return { ok: false, reason: "Progression missing" };
  return { ok: true };
}

export function readRunSaveSnapshot() {
  return readJson(RUN_SAVE_STORAGE_KEY, null);
}

export function readRunSaveMeta() {
  const meta = readJson(RUN_SAVE_META_STORAGE_KEY, null);
  if (meta && isPlainObject(meta)) return meta;
  const snapshot = readRunSaveSnapshot();
  return buildRunSaveMeta(snapshot);
}

export function writeRunSaveSnapshot(snapshot) {
  const meta = buildRunSaveMeta(snapshot);
  const okSnapshot = writeJson(RUN_SAVE_STORAGE_KEY, snapshot);
  const okMeta = meta ? writeJson(RUN_SAVE_META_STORAGE_KEY, meta) : false;
  return okSnapshot && okMeta;
}

export function clearRunSaveStorage() {
  removeJson(RUN_SAVE_STORAGE_KEY);
  removeJson(RUN_SAVE_META_STORAGE_KEY);
}

export function readTutorialProfile() {
  const profile = readJson(TUTORIAL_PROFILE_STORAGE_KEY, null);
  return isPlainObject(profile) ? profile : {};
}

export function writeTutorialProfile(profile = {}) {
  return writeJson(TUTORIAL_PROFILE_STORAGE_KEY, {
    tutorialCompleted: !!profile.tutorialCompleted,
    completedAt: Number(profile.completedAt || 0),
  });
}
