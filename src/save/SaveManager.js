import { buildRunSnapshot } from "./RunSnapshotBuilder.js";
import { restoreRunSnapshotIntoScene } from "./RunSnapshotLoader.js";
import {
  buildRunSaveMeta,
  clearRunSaveStorage,
  readRunSaveMeta,
  readRunSaveSnapshot,
  readTutorialProfile,
  validateRunSnapshot,
  writeTutorialProfile,
  writeRunSaveSnapshot,
} from "./saveSchema.js";

export class SaveManager {
  static scene = null;
  static _lastSignature = null;
  static _pendingDailyDay = 0;
  static _pendingDailyReason = null;
  static _lastAutoSaveDay = 0;
  static _boundPageHide = null;
  static _boundVisibilityChange = null;

  static attachScene(scene) {
    if (!scene) return;
    this.scene = scene;
    this._installWindowHooks();
  }

  static detachScene(scene = null) {
    if (!scene || this.scene === scene) {
      this.scene = null;
    }
  }

  static _installWindowHooks() {
    return;
  }

  static hasRunSave() {
    const meta = this.getRunSaveMeta();
    return !!meta?.hasContinue;
  }

  static getRunSaveMeta() {
    const snapshot = this.loadSnapshot();
    if (!snapshot) return null;
    const meta = readRunSaveMeta();
    if (meta?.hasContinue) return meta;
    return buildRunSaveMeta(snapshot);
  }

  static loadSnapshot() {
    const snapshot = readRunSaveSnapshot();
    const validation = validateRunSnapshot(snapshot);
    if (!validation.ok) return null;
    return snapshot;
  }

  static clearRunSave() {
    this._lastSignature = null;
    this._pendingDailyDay = 0;
    this._pendingDailyReason = null;
    this._lastAutoSaveDay = 0;
    clearRunSaveStorage();
  }

  static canSaveScene(scene = this.scene) {
    if (!scene || scene._restoringFromSave) return false;
    if (scene._runSaveDisabled || scene._demoCompleted || scene._demoCompletionInProgress) return false;
    if (scene.tutorialManager?.isBlockingSaves?.()) return false;
    if (!scene.clock || !scene.parcelManager || !scene.towerPressureController) return false;
    if (scene.menu?.active && !scene.parcelSpawnUI) return false;
    return true;
  }

  static isTutorialCompleted() {
    return !!readTutorialProfile()?.tutorialCompleted;
  }

  static setTutorialCompleted(completed = true) {
    return writeTutorialProfile({
      tutorialCompleted: !!completed,
      completedAt: completed ? Date.now() : 0,
    });
  }

  static queueAutosave(reason = "mutation") {
    const normalizedReason = String(reason || "mutation");
    if (!normalizedReason.startsWith("town_xp")) return false;
    if (!this.canSaveScene()) return false;
    return this.saveNow(normalizedReason, { silent: true });
  }

  static queueDailyAutosave(day = null, reason = "day_start") {
    if (!this.canSaveScene()) return false;
    const resolvedDay = Math.max(1, Number(day ?? this.scene?.clock?.day ?? 1) || 1);
    if (resolvedDay <= this._lastAutoSaveDay) return false;
    this._pendingDailyDay = resolvedDay;
    this._pendingDailyReason = String(reason || "day_start");
    return true;
  }

  static tick(scene = this.scene) {
    if (!this.canSaveScene(scene)) return;
    if (this._pendingDailyDay > 0 && this._canFlushDailyAutosave(scene)) {
      this.saveNow(this._pendingDailyReason || "day_start", {
        silent: true,
        autoDay: this._pendingDailyDay,
      });
    }
  }

  static _canFlushDailyAutosave(scene = this.scene) {
    if (!scene) return false;
    if (typeof scene.isDailyAutosaveReady === "function") {
      return !!scene.isDailyAutosaveReady();
    }
    return true;
  }

  static saveNow(reason = "manual", opts = {}) {
    const scene = this.scene;
    if (!this.canSaveScene(scene)) return false;

    const snapshot = buildRunSnapshot(scene);
    const meta = buildRunSaveMeta(snapshot);
    const signature = JSON.stringify({
      day: meta?.day,
      money: meta?.money,
      stageIndex: meta?.stageIndex,
      seasonIndex: meta?.seasonIndex,
      simNowMs: snapshot?.progression?.simNowMs,
      runStats: snapshot?.progression?.runStats,
      townXp: snapshot?.progression?.townXp,
      resources: snapshot?.progression?.resources,
      unlocks: snapshot?.systems?.storeUnlocks,
      contracts: snapshot?.parcels?.parcelManager?.contracts || [],
    });

    if (signature === this._lastSignature && reason !== "manual") {
      if (opts.autoDay) {
        this._lastAutoSaveDay = Math.max(this._lastAutoSaveDay, Number(opts.autoDay) || 0);
        this._pendingDailyDay = 0;
        this._pendingDailyReason = null;
      }
      return false;
    }

    const ok = writeRunSaveSnapshot(snapshot);
    if (ok) {
      this._lastSignature = signature;
      if (opts.autoDay) {
        this._lastAutoSaveDay = Math.max(this._lastAutoSaveDay, Number(opts.autoDay) || 0);
      }
      if (reason === "manual" && this._pendingDailyDay > 0) {
        const currentDay = Math.max(1, Number(scene?.clock?.day ?? 1) || 1);
        if (currentDay >= this._pendingDailyDay) {
          this._lastAutoSaveDay = Math.max(this._lastAutoSaveDay, this._pendingDailyDay);
        }
      }
      this._pendingDailyDay = 0;
      this._pendingDailyReason = null;
      if (!opts.silent) scene.showSaveNotification?.();
    }
    return ok;
  }

  static restoreIntoScene(scene, snapshot) {
    this.attachScene(scene);
    restoreRunSnapshotIntoScene(scene, snapshot);
  }
}
