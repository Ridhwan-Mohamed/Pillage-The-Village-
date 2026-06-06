// Manager/AudioManager.js
// Simple mix: grass(day/night) + occluded(forest+rock) + water + ovenCooking + step SFX.
// Updates happen only when you call updateFromRedraw(...) (i.e., on your redraw).
import { TILE_MAP, TILE_TYPES, FLOORDEPTH, SQUARESIZE } from "../constants";
import day_ambience from 'url:../assets/audio/day-ambience.ogg';
import night_ambience from 'url:../assets/audio/night-ambience.ogg';
import occluded_ambience from 'url:../assets/audio/occluded-ambience.ogg';
import ocean_ambience from 'url:../assets/audio/ocean-ambience.ogg';
import main_menu_ambience from 'url:../assets/audio/main_menu_ambience.ogg';
import oven_cooking from 'url:../assets/audio/oven-cooking.ogg';
import step_sfx from 'url:../assets/audio/footstep.ogg';
import axe_chop from 'url:../assets/audio/axe-chop.ogg';
import rock_hit from 'url:../assets/audio/rock-hit.ogg';
import construction_noise from 'url:../assets/audio/construction-noise.ogg';
import pickup from 'url:../assets/audio/pickup.ogg';
import gun_shot from 'url:../assets/audio/gun-shot.ogg';
import sword_hit from 'url:../assets/audio/sword-hit.ogg';
import hand_punch from 'url:../assets/audio/hand-punch.ogg';
import boxing_punch from 'url:../assets/audio/boxing-glove-punch.ogg';
import plant_audio from 'url:../assets/audio/plant-audio.ogg';
import plant_harvest from 'url:../assets/audio/plant-harvest.ogg';
import water_pickup from 'url:../assets/audio/water-pickup.ogg';
import watering_plant from 'url:../assets/audio/watering-plant.ogg';
import tree_break from 'url:../assets/audio/tree-break.ogg';
import rock_break from 'url:../assets/audio/rock-destroy.ogg';
import building_complete from 'url:../assets/audio/building-complete.ogg';
import building_damage from 'url:../assets/audio/building-damage.ogg';
import building_collapse from 'url:../assets/audio/building-collapse.ogg';
import door_open from 'url:../assets/audio/door-opening.ogg';
import door_close from 'url:../assets/audio/door-closing.ogg';
import end_stage_explosions from 'url:../assets/audio/end_stage_explosions.ogg';
import button_hover from 'url:../assets/audio/button_hover.ogg';
import button_click_bubble from 'url:../assets/audio/button_click_bubble.ogg';
import bottom_bar_click from 'url:../assets/audio/bottomBar_click.ogg';
import bloop from 'url:../assets/audio/bloop.ogg';
import whoosh from 'url:../assets/audio/whoosh.ogg';
import swipe from 'url:../assets/audio/swipe.ogg';
import swimming_sfx from 'url:../assets/audio/swimming.ogg';
import swim1_sfx from 'url:../assets/audio/swim1.ogg';
import swim2_sfx from 'url:../assets/audio/swim2.ogg';
import swim3_sfx from 'url:../assets/audio/swim3.ogg';
import error_sfx from 'url:../assets/audio/error.ogg';
import type_sfx from 'url:../assets/audio/type.ogg';
import thud_click from 'url:../assets/audio/thud_click.ogg';
import coins_sfx from 'url:../assets/audio/coins.ogg';
import notification_sfx from 'url:../assets/audio/notification.ogg';
import notification_good_sfx from 'url:../assets/audio/notification_good.ogg';
import xp_gain_sfx from 'url:../assets/audio/xp.ogg';
import level_up_sfx from 'url:../assets/audio/level_up.ogg';
import scream1 from 'url:../assets/audio/scream1.ogg';
import scream2 from 'url:../assets/audio/scream2.ogg';
import scream3 from 'url:../assets/audio/scream3.ogg';
import scream4 from 'url:../assets/audio/scream4.ogg';
import scream5 from 'url:../assets/audio/scream5.ogg';
import scream6 from 'url:../assets/audio/scream6.ogg';
import zap1 from 'url:../assets/audio/zap1.ogg';
import zap2 from 'url:../assets/audio/zap2.ogg';
import zap3 from 'url:../assets/audio/zap3.ogg';
import rain_ambience from 'url:../assets/audio/rain_ambience.ogg';
import thunder from 'url:../assets/audio/thunder.ogg';

export class AudioManager {
  static scene = null;
  static STORAGE_KEY = "processv2.audio_settings_v1";
  static _settingsLoaded = false;
  static _masterVolume = 1;
  static _muted = false;

  // tweakables
  static FADE_MS = 500;
  static AMBIENT_MASTER = 0.55;
  static OVEN_MASTER = 0.45;

  static ambience = new Map(); // key -> Phaser.Sound.BaseSound|null
  static loops = new Map();    // misc loops (oven)
  static lastMix = null;
  // Weather/menu ambience also live in loops; only work/action loops pause with simulation.
  static PAUSABLE_WORLD_LOOP_KEYS = new Set([
    "loop_oven_cook",
    "sfx_construction",
    "sfx_axe_chop",
    "sfx_rock_hit",
  ]);
  static WORLD_SFX_KEYS = new Set([
    "sfx_step",
    "sfx_swim",
    "sfx_swim_move_1",
    "sfx_swim_move_2",
    "sfx_swim_move_3",
    "sfx_pickup",
    "sfx_gun_shot",
    "sfx_sword_hit",
    "sfx_hand_punch",
    "sfx_boxing_punch",
    "sfx_plant_audio",
    "sfx_plant_harvest",
    "sfx_water_pickup",
    "sfx_watering_plant",
    "sfx_tree_break",
    "sfx_rock_break",
    "sfx_building_complete",
    "sfx_building_damage",
    "sfx_door_open",
    "sfx_door_close",
    "sfx_flee_scream_1",
    "sfx_flee_scream_2",
    "sfx_flee_scream_3",
    "sfx_flee_scream_4",
    "sfx_flee_scream_5",
    "sfx_flee_scream_6",
    "sfx_shocker_zap_1",
    "sfx_shocker_zap_2",
    "sfx_shocker_zap_3",
    "sfx_boss_thunder",
  ]);
  static _worldAudioPaused = false;
  static _pausableWorldLoopVolumes = new Map();

  static isNight = false;

  // footsteps
  static STEP_COOLDOWN_MS = 240; // tune later
  static STEP_VOL = 0.22;
  static SWIM_COOLDOWN_MS = 290;
  static SWIM_VOL = 0.20;
  static OFFSCREEN_MOVE_FACTOR = 0.14;
  static MOVE_SOUND_DISTANCE_SCREENS = 1.75;
  static UI_HOVER_COOLDOWN_MS = 70;
  static _nextUiHoverAt = 0;
  static LAYOUT_MOVE_COOLDOWN_MS = 55;
  static _nextLayoutMoveAt = 0;
  static _lastSwimMoveSoundKey = null;
  static FLEE_SCREAM_WINDOW_MS = 850;
  static recentFleeStarts = [];
  static SHOCKER_ZAP_KEYS = ["sfx_shocker_zap_1", "sfx_shocker_zap_2", "sfx_shocker_zap_3"];
  static _shockerZapCursor = Math.floor(Math.random() * 3);
  static BOSS_RAIN_MASTER = 0.3;
  static BOSS_THUNDER_COOLDOWN_MS = 4500;
  static _nextBossThunderAt = 0;

  // construction loop
  static constructionWorkers = new Set(); // sprite.id numbers
  static CONSTRUCTION_MASTER = 0.30;      // tune
    // harvesting loops
    static woodCutters = new Set(); // sprite.id
    static rockCutters = new Set(); // sprite.id
    static WOOD_CUT_MASTER = 0.28;
    static ROCK_CUT_MASTER = 0.28;


  static init(scene) {
    this.scene = scene;
    this._loadSettings();
    this._applySoundSettings();

    // You can load .wav — it’s fine — but for web builds you’ll usually want .ogg/.mp3 too.
    // Keep keys stable; swap file extensions later.

    scene.load.audio("amb_grass_day",   day_ambience);
    scene.load.audio("amb_grass_night", night_ambience);
    scene.load.audio("amb_occluded",    occluded_ambience);
    scene.load.audio("amb_water",       ocean_ambience);

    scene.load.audio("loop_oven_cook",  oven_cooking);

    scene.load.audio("sfx_step",        step_sfx);
    scene.load.audio("sfx_swim",        swimming_sfx);
    scene.load.audio("sfx_swim_move_1", swim1_sfx);
    scene.load.audio("sfx_swim_move_2", swim2_sfx);
    scene.load.audio("sfx_swim_move_3", swim3_sfx);

    scene.load.audio("sfx_axe_chop",    axe_chop);
    scene.load.audio("sfx_rock_hit",    rock_hit);
    scene.load.audio("sfx_construction", construction_noise);
    scene.load.audio("sfx_pickup",      pickup);
    scene.load.audio("sfx_gun_shot",    gun_shot);
    scene.load.audio("sfx_sword_hit",   sword_hit);
    scene.load.audio("sfx_hand_punch",  hand_punch);
    scene.load.audio("sfx_boxing_punch", boxing_punch);
    scene.load.audio("sfx_plant_audio", plant_audio);
    scene.load.audio("sfx_plant_harvest", plant_harvest);
    scene.load.audio("sfx_water_pickup", water_pickup);
    scene.load.audio("sfx_watering_plant", watering_plant);
    scene.load.audio("sfx_tree_break",  tree_break);
    scene.load.audio("sfx_rock_break",  rock_break);
    scene.load.audio("sfx_building_complete", building_complete);
    scene.load.audio("sfx_building_damage", building_damage);
    scene.load.audio("sfx_building_collapse", building_collapse);
    scene.load.audio("sfx_door_open",   door_open);
    scene.load.audio("sfx_door_close",  door_close);
    scene.load.audio("sfx_end_stage_explosions", end_stage_explosions);
    scene.load.audio("amb_menu_ocean", main_menu_ambience);
    scene.load.audio("sfx_ui_hover", button_hover);
    scene.load.audio("sfx_ui_click_menu", button_click_bubble);
    scene.load.audio("sfx_ui_bottom_bar_click", bottom_bar_click);
    scene.load.audio("sfx_ui_draft_bloop", bloop);
    scene.load.audio("sfx_ui_whoosh", whoosh);
    scene.load.audio("sfx_ui_swipe", swipe);
    scene.load.audio("sfx_ui_error", error_sfx);
    scene.load.audio("sfx_ui_type", type_sfx);
    scene.load.audio("sfx_ui_thud_click", thud_click);
    scene.load.audio("sfx_ui_coins_gain", coins_sfx);
    scene.load.audio("sfx_ui_notification", notification_sfx);
    scene.load.audio("sfx_ui_notification_good", notification_good_sfx);
    scene.load.audio("sfx_ui_xp_gain", xp_gain_sfx);
    scene.load.audio("sfx_ui_level_up", level_up_sfx);
    scene.load.audio("sfx_flee_scream_1", scream1);
    scene.load.audio("sfx_flee_scream_2", scream2);
    scene.load.audio("sfx_flee_scream_3", scream3);
    scene.load.audio("sfx_flee_scream_4", scream4);
    scene.load.audio("sfx_flee_scream_5", scream5);
    scene.load.audio("sfx_flee_scream_6", scream6);
    scene.load.audio("sfx_shocker_zap_1", zap1);
    scene.load.audio("sfx_shocker_zap_2", zap2);
    scene.load.audio("sfx_shocker_zap_3", zap3);
    scene.load.audio("amb_boss_rain", rain_ambience);
    scene.load.audio("sfx_boss_thunder", thunder);
  }

  static _loadSettings() {
    if (this._settingsLoaded) return;
    this._settingsLoaded = true;
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this._masterVolume = this._clamp(Number(parsed?.masterVolume ?? 1), 0, 1);
      this._muted = !!parsed?.muted;
    } catch {}
  }

  static _persistSettings() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
        masterVolume: this._masterVolume,
        muted: this._muted,
      }));
    } catch {}
  }

  static _applySoundSettings() {
    const sound = this.scene?.sound;
    if (!sound) return;
    if (typeof sound.setVolume === "function") sound.setVolume(this._masterVolume);
    else sound.volume = this._masterVolume;
    if ("setMute" in sound && typeof sound.setMute === "function") sound.setMute(this._muted);
    else sound.mute = this._muted;
  }

  static getMasterVolume() {
    this._loadSettings();
    return this._masterVolume;
  }

  static setMasterVolume(value = 1) {
    this._loadSettings();
    this._masterVolume = this._clamp(Number(value ?? 1), 0, 1);
    this._applySoundSettings();
    this._persistSettings();
    return this._masterVolume;
  }

  static isMuted() {
    this._loadSettings();
    return !!this._muted;
  }

  static setMuted(muted = false) {
    this._loadSettings();
    this._muted = !!muted;
    this._applySoundSettings();
    this._persistSettings();
    return this._muted;
  }

  static setWorldAudioPaused(paused = false) {
    const next = !!paused;
    if (this._worldAudioPaused === next) return;
    this._worldAudioPaused = next;
    if (next) this._stopActiveWorldSfx();
    this._syncPausableWorldLoops();
  }

  static isWorldAudioPaused() {
    return !!this._worldAudioPaused;
  }

  // Call once per redraw
  static updateFromRedraw({
    topLeftX, topLeftY, bottomRightX, bottomRightY,
    grid, width, height,
    // new:
    cookingOvenCount = 0,
    // optional: pass clock info if handy
    isNight = this.isNight
  }) {
    if (!this.scene) return;

    this.isNight = !!isNight;

    const tileMix = this._tallyTiles(this._getAmbientSampleRect({
      topLeftX,
      topLeftY,
      bottomRightX,
      bottomRightY,
      grid,
      width,
      height,
    }));
    this._applyAmbientMix(tileMix);

    this._applyOvenMix(cookingOvenCount);

    this.lastMix = { tileMix, cookingOvenCount };
  }

  // Call on day/night transition (Clock)
  static setIsNight(isNight) {
    this.isNight = !!isNight;

    // Re-apply last known ratios so the day/night grass swap crossfades immediately.
    if (this.lastMix?.tileMix) {
      this._applyAmbientMix(this.lastMix.tileMix);
    } else {
      // Ensure loops exist at least
      this._ensureLoop(this.ambience, "amb_grass_day");
      this._ensureLoop(this.ambience, "amb_grass_night");
      this._fadeTo(this.ambience.get("amb_grass_day"), 0);
      this._fadeTo(this.ambience.get("amb_grass_night"), 0);
    }
  }

  // Throttled step SFX helper (safe to call every frame)
  static tryPlayStep(sprite) {
    if (!this.scene) return;
    if (this._worldAudioPaused) return;
    const isSwimming = this._isSpriteSwimming(sprite);
    const soundKey = isSwimming ? this._pickSwimMoveSoundKey() : "sfx_step";
    if (!soundKey || !this.scene.cache.audio.exists(soundKey)) return;

    const now = this.scene.time.now;
    if (sprite._phxNextMoveSfxAt == null) sprite._phxNextMoveSfxAt = 0;
    if (now < sprite._phxNextMoveSfxAt) return;

    // Optional: make step rate mildly speed-dependent
    const speed = sprite.body?.velocity ? sprite.body.velocity.length() : 0;
    if (speed < 5) return;

    const volume = this._getMovementSoundVolume(sprite, isSwimming ? this.SWIM_VOL : this.STEP_VOL);
    if (volume <= 0.01) return;

    sprite._phxNextMoveSfxAt = now + (isSwimming ? this.SWIM_COOLDOWN_MS : this.STEP_COOLDOWN_MS);

    this.scene.sound.play(soundKey, {
      volume,
      rate: isSwimming ? (0.97 + Math.random() * 0.06) : (0.95 + Math.random() * 0.1)
    });
  }

    static playPickup(opts = {}) {
        if (!this.scene) return;
        if (this._worldAudioPaused) return;
        if (!this.scene.cache.audio.exists("sfx_pickup")) return;

        this.scene.sound.play("sfx_pickup", {
            volume: opts.volume ?? 0.35,
            rate: opts.rate ?? (0.95 + Math.random() * 0.1),
        });
    }

    // AudioManager.js
    static playPlant(opts = {}) {
        if (!this.scene) return;
        if (this._worldAudioPaused) return;
        if (!this.scene.cache.audio.exists("sfx_plant_audio")) return;

        this.scene.sound.play("sfx_plant_audio", {
            volume: opts.volume ?? 0.50,
            rate: opts.rate ?? (0.95 + Math.random() * 0.1),
        });
    }

    static playCropHarvest(opts = {}) {
        if (!this.scene) return;
        if (this._worldAudioPaused) return;
        if (!this.scene.cache.audio.exists("sfx_plant_harvest")) return;

        this.scene.sound.play("sfx_plant_harvest", {
            volume: opts.volume ?? 0.40,
            rate: opts.rate ?? (0.95 + Math.random() * 0.1),
        });
    }

    static playWateringStart(opts = {}) {
        if (!this.scene) return;
        if (this._worldAudioPaused) return;
        if (!this.scene.cache.audio.exists("sfx_watering_plant")) return;

        this.scene.sound.play("sfx_watering_plant", {
            volume: opts.volume ?? 0.35,
            rate: opts.rate ?? (0.98 + Math.random() * 0.06),
        });
    }

    static playWaterPickup(opts = {}) {
        if (!this.scene) return;
        if (this._worldAudioPaused) return;
        if (!this.scene.cache.audio.exists("sfx_water_pickup")) return;

        this.scene.sound.play("sfx_water_pickup", {
        volume: opts.volume ?? 0.40,
        rate: opts.rate ?? (0.95 + Math.random() * 0.1),
        });
    }

    static playFleeScream(opts = {}) {
        if (!this.scene) return;
        if (this._worldAudioPaused) return;

        const keys = [
            "sfx_flee_scream_1",
            "sfx_flee_scream_2",
            "sfx_flee_scream_3",
            "sfx_flee_scream_4",
            "sfx_flee_scream_5",
            "sfx_flee_scream_6",
        ].filter((key) => this.scene.cache.audio.exists(key));

        if (!keys.length) return;

        const now = this.scene.time?.now ?? 0;
        this.recentFleeStarts = (this.recentFleeStarts || []).filter(
            (stamp) => (now - stamp) <= this.FLEE_SCREAM_WINDOW_MS
        );
        this.recentFleeStarts.push(now);

        const crowdCount = this.recentFleeStarts.length;
        const key = keys[Math.floor(Math.random() * keys.length)];
        const volume = this._clamp(
            Number(opts.volume ?? (0.15 + crowdCount * 0.06)),
            0.12,
            0.62
        );

        this.scene.sound.play(key, {
            volume,
            rate: opts.rate ?? (0.96 + Math.random() * 0.12),
        });
    }

    static playShockerZap(_index = null, opts = {}) {
        if (!this.scene) return false;
        if (this._worldAudioPaused) return false;

        const keys = this.SHOCKER_ZAP_KEYS.filter((key) => this.scene.cache.audio.exists(key));
        if (!keys.length) return false;

        const key = keys[this._shockerZapCursor % keys.length];
        this._shockerZapCursor = (this._shockerZapCursor + 1) % keys.length;

        this.scene.sound.play(key, {
            volume: this._clamp(Number(opts.volume ?? 0.28), 0, 0.48),
            rate: this._clamp(Number(opts.rate ?? (0.94 + Math.random() * 0.12)), 0.84, 1.16),
        });
        return true;
    }

    static startBossRainAmbience(opts = {}) {
        if (!this.scene) return;
        this._ensureLoop(this.loops, "amb_boss_rain");
        this._fadeTo(
            this.loops.get("amb_boss_rain"),
            this._clamp(Number(opts.volume ?? this.BOSS_RAIN_MASTER), 0, 0.45)
        );
    }

    static stopBossRainAmbience() {
        this._fadeTo(this.loops.get("amb_boss_rain"), 0);
    }

    static playBossThunder(opts = {}) {
        if (!this.scene) return false;
        if (this._worldAudioPaused) return false;
        if (!this.scene.cache.audio.exists("sfx_boss_thunder")) return false;

        const now = this.scene.time?.now ?? Date.now();
        if (now < this._nextBossThunderAt) return false;
        this._nextBossThunderAt = now + Math.max(1000, Number(opts.cooldownMs ?? this.BOSS_THUNDER_COOLDOWN_MS));

        this.scene.sound.play("sfx_boss_thunder", {
            volume: this._clamp(Number(opts.volume ?? 0.34), 0, 0.62),
            rate: this._clamp(Number(opts.rate ?? (0.94 + Math.random() * 0.12)), 0.82, 1.14),
        });
        return true;
    }

    static playCoinsGain(amount = 0, opts = {}) {
        const normalized = Math.max(1, Number(amount || 0));
        this.playSound("sfx_ui_coins_gain", {
            volume: opts.volume ?? this._clamp(0.18 + Math.min(0.18, normalized / 220), 0.18, 0.36),
            rate: opts.rate ?? this._clamp(1.08 - Math.min(0.16, normalized / 320), 0.92, 1.08),
        });
    }

    static playPurchaseCoins(amount = 0, opts = {}) {
        const normalized = Math.max(1, Number(amount || 0));
        this.playSound("sfx_ui_coins_gain", {
            volume: opts.volume ?? this._clamp(0.2 + Math.min(0.1, normalized / 260), 0.2, 0.3),
            rate: opts.rate ?? this._clamp(1.04 - Math.min(0.08, normalized / 420), 0.96, 1.04),
        });
    }

    static playTownXpGain(amount = 0, opts = {}) {
        const normalized = Math.max(1, Number(amount || 0));
        this.playSound("sfx_ui_xp_gain", {
            volume: opts.volume ?? this._clamp(0.18 + Math.min(0.16, normalized / 90), 0.18, 0.34),
            rate: opts.rate ?? this._clamp(0.96 + Math.min(0.14, normalized / 140), 0.96, 1.1),
        });
    }

    static playTownLevelUp(opts = {}) {
        this.playSound("sfx_ui_level_up", {
            volume: opts.volume ?? 0.34,
            rate: opts.rate ?? 1,
        });
    }

    static playSound(soundKey, opts = {}) {
        if (!this.scene) return;
        if (opts.world && this._worldAudioPaused) return;
        if (!this.scene.cache.audio.exists(soundKey)) return;

        this.scene.sound.play(soundKey, {
        volume: opts.volume ?? 0.40,
        rate: opts.rate ?? (0.95 + Math.random() * 0.1),
        });
    }

    static playWorldSound(soundKey, opts = {}) {
        this.playSound(soundKey, { ...opts, world: true });
    }

    static playOptionalSound(soundKey, fallbackKey = null, opts = {}) {
        if (!this.scene) return;
        if (opts.world && this._worldAudioPaused) return;
        const key = this.scene.cache.audio.exists(soundKey)
            ? soundKey
            : (fallbackKey && this.scene.cache.audio.exists(fallbackKey) ? fallbackKey : null);
        if (!key) return;

        this.scene.sound.play(key, {
        volume: opts.volume ?? 0.32,
        rate: opts.rate ?? (0.95 + Math.random() * 0.1),
        });
    }

    static playUiHover(opts = {}) {
        if (!this.scene) return;
        if (!this.scene.cache.audio.exists("sfx_ui_hover")) return;
        const now = this.scene.time?.now ?? 0;
        if (now < this._nextUiHoverAt) return;
        this._nextUiHoverAt = now + (opts.cooldownMs ?? this.UI_HOVER_COOLDOWN_MS);
        this.scene.sound.play("sfx_ui_hover", {
            volume: opts.volume ?? 0.18,
            rate: opts.rate ?? (0.98 + Math.random() * 0.04),
        });
    }

    static playMenuClick(opts = {}) {
        this.playSound("sfx_ui_click_menu", {
            volume: opts.volume ?? 0.23,
            rate: opts.rate ?? (0.97 + Math.random() * 0.05),
        });
    }

    static playBottomBarClick(opts = {}) {
        this.playSound("sfx_ui_bottom_bar_click", {
            volume: opts.volume ?? 0.23,
            rate: opts.rate ?? (0.98 + Math.random() * 0.04),
        });
    }

    static playDraftDeckSelect(opts = {}) {
        this.playSound("sfx_ui_draft_bloop", {
            volume: opts.volume ?? 0.3,
            rate: opts.rate ?? (0.98 + Math.random() * 0.05),
        });
    }

    static playMarketOpen(opts = {}) {
        this.playOptionalSound("sfx_market_open", "sfx_ui_whoosh", {
            volume: opts.volume ?? 0.28,
            rate: opts.rate ?? (0.98 + Math.random() * 0.05),
        });
    }

    static playMarketHover(opts = {}) {
        this.playOptionalSound("sfx_market_hover", "sfx_ui_hover", {
            volume: opts.volume ?? 0.16,
            rate: opts.rate ?? (0.98 + Math.random() * 0.04),
        });
    }

    static playMarketPurchase(opts = {}) {
        this.playPurchaseCoins(opts.amount ?? 0, opts);
    }

    static playCardArm(opts = {}) {
        this.playOptionalSound("sfx_card_arm", "sfx_ui_draft_bloop", {
            volume: opts.volume ?? 0.28,
            rate: opts.rate ?? (0.98 + Math.random() * 0.05),
        });
    }

    static playCardConfirmUse(opts = {}) {
        this.playOptionalSound("sfx_card_confirm_use", "sfx_ui_thud_click", {
            volume: opts.volume ?? 0.3,
            rate: opts.rate ?? (0.96 + Math.random() * 0.07),
        });
    }

    static playWhoosh(opts = {}) {
        this.playSound("sfx_ui_whoosh", {
            volume: opts.volume ?? 0.34,
            rate: opts.rate ?? (0.98 + Math.random() * 0.05),
        });
    }

    static playSwipe(opts = {}) {
        this.playSound("sfx_ui_swipe", {
            volume: opts.volume ?? 0.32,
            rate: opts.rate ?? (0.98 + Math.random() * 0.05),
        });
    }

    static playLayoutMove(opts = {}) {
        if (!this.scene) return;
        if (!this.scene.cache.audio.exists("sfx_ui_thud_click")) return;
        const now = this.scene.time?.now ?? 0;
        if (now < this._nextLayoutMoveAt) return;
        this._nextLayoutMoveAt = now + (opts.cooldownMs ?? this.LAYOUT_MOVE_COOLDOWN_MS);
        this.scene.sound.play("sfx_ui_thud_click", {
            volume: opts.volume ?? 0.2,
            rate: opts.rate ?? (0.98 + Math.random() * 0.05),
        });
    }

    static playBuildQueued(opts = {}) {
        this.playSound("sfx_ui_thud_click", {
            volume: opts.volume ?? 0.2,
            rate: opts.rate ?? (0.94 + Math.random() * 0.05),
        });
    }

    static playBuildingComplete(opts = {}) {
        this.playSound("sfx_building_complete", {
            volume: opts.volume ?? 0.24,
            rate: opts.rate ?? (0.98 + Math.random() * 0.04),
            world: !!opts.world,
        });
    }

    static playError(opts = {}) {
        this.playSound("sfx_ui_error", {
            volume: opts.volume ?? 0.26,
            rate: opts.rate ?? (0.94 + Math.random() * 0.09),
        });
    }

    static playNotification(opts = {}) {
        this.playSound("sfx_ui_notification", {
            volume: opts.volume ?? 0.22,
            rate: opts.rate ?? (0.97 + Math.random() * 0.06),
        });
    }

    static playNotificationGood(opts = {}) {
        this.playSound("sfx_ui_notification_good", {
            volume: opts.volume ?? 0.23,
            rate: opts.rate ?? (0.98 + Math.random() * 0.05),
        });
    }

    static playUiType(opts = {}) {
        this.playSound("sfx_ui_type", {
            volume: opts.volume ?? 0.25,
            rate: opts.rate ?? (0.96 + Math.random() * 0.12),
        });
    }

    static playUiTextThud(opts = {}) {
        this.playSound("sfx_ui_thud_click", {
            volume: opts.volume ?? 0.14,
            rate: opts.rate ?? (0.99 + Math.random() * 0.06),
        });
    }

    static startMenuOceanAmbience(opts = {}) {
        if (!this.scene) return;
        this._ensureLoop(this.loops, "amb_menu_ocean");
        this._fadeTo(this.loops.get("amb_menu_ocean"), opts.volume ?? 0.2);
    }

    static stopMenuOceanAmbience() {
        this._fadeTo(this.loops.get("amb_menu_ocean"), 0);
    }

    // AudioManager.js

    static playTreeBreak(opts = {}) {
        if (!this.scene) return;
        if (this._worldAudioPaused) return;
        if (!this.scene.cache.audio.exists("sfx_tree_break")) return;

        this.scene.sound.play("sfx_tree_break", {
        volume: opts.volume ?? 0.41,
        rate: opts.rate ?? (0.95 + Math.random() * 0.1),
        });
    }

    static playRockBreak(opts = {}) {
        if (!this.scene) return;
        if (this._worldAudioPaused) return;
        if (!this.scene.cache.audio.exists("sfx_rock_break")) return;

        this.scene.sound.play("sfx_rock_break", {
        volume: opts.volume ?? 0.41,
        rate: opts.rate ?? (0.95 + Math.random() * 0.1),
        });
    }

    // Optional convenience wrapper:
    static playBlockBreak(material /* "wood" | "rock" */, opts = {}) {
        if (material === "rock") this.playRockBreak(opts);
        else this.playTreeBreak(opts);
    }


  // -----------------------
  // Internals
  // -----------------------

  static _tallyTiles({ topLeftX, topLeftY, bottomRightX, bottomRightY, grid, width, height }) {
    const counts = { grass: 0, forest: 0, rock: 0, water: 0 };
    let total = 0;

    for (let y = topLeftY; y < bottomRightY; y++) {
      for (let x = topLeftX; x < bottomRightX; x++) {
        total++;

        // Treat out-of-bounds as water ambience (ocean edge vibe)
        if (y < 0 || x < 0 || y >= height || x >= width) {
          counts.water++;
          continue;
        }

        const cell = grid[y][x];

        // If your grid stores [floor, top] pairs, classify using BOTH.
        // Priority: water > rock > forest > grass.
        const type = this._classifyTileCell(cell);
        counts[type] += 1;
      }
    }

    const denom = total || 1;
    return {
      total,
      ratio: {
        grass: counts.grass / denom,
        forest: counts.forest / denom,
        rock: counts.rock / denom,
        water: counts.water / denom,
      },
      counts,
    };
  }

  // Decide which entry in a [a,b] cell is the floor by using TILE_TYPES depth
  static _pickFloorValFromCell(cell) {
    if (cell == null) return null;
    if (!Array.isArray(cell)) return cell;

    const a = cell[0];
    const b = cell[1];

    const aName = TILE_MAP(a);
    const bName = TILE_MAP(b);

    const aDef = aName ? TILE_TYPES[aName] : null;
    const bDef = bName ? TILE_TYPES[bName] : null;

    if (aDef?.depth === FLOORDEPTH) return a;
    if (bDef?.depth === FLOORDEPTH) return b;

    // Fallback: preserve your old assumption (index 0 is "base")
    return a;
  }

  static _classifyTileCell(cell) {
    if (cell == null) return "grass";

    if (!Array.isArray(cell)) {
      return this._classifyTileValue(cell);
    }

    const floorVal = this._pickFloorValFromCell(cell);
    const topVal = (floorVal === cell[0]) ? cell[1] : cell[0];

    const floorType = this._classifyTileValue(floorVal);
    const topType = this._classifyTileValue(topVal);

    // Priority so big blockers / water dominate ambience
    if (floorType === "water" || topType === "water") return "water";
    if (floorType === "rock"  || topType === "rock")  return "rock";
    if (floorType === "forest"|| topType === "forest")return "forest";
    return "grass";
  }

  static 
  _classifyTileValue(val) {
    if (val == null || typeof val !== "number") return "grass";

    const name = TILE_MAP(val);
    if (!name) return "grass";

    // Map real tile names -> ambience buckets
    switch (name) {
      case "water":
        return "water";

      case "pine":
        return "forest";

      case "rock":
        return "rock";

      // Optional: walls feel occluded/hard rather than "grass"
      case "wall":
        return "rock";

      default:
        // grass, dirt, road, sand, crops, interactable grass tiles, buildings, etc.
        return "grass";
    }
  }

  // construction noise helpers

  static setConstructionActive(sprite, isActive) {
    if (!this.scene || !sprite) return;

    const id = sprite.id ?? sprite; // allow passing id directly if you want

    if (isActive) this.constructionWorkers.add(id);
    else this.constructionWorkers.delete(id);

    this._applyConstructionMix();
  }

  static onSpriteDestroyed(sprite) {
    if (!sprite) return;
    const id = sprite.id ?? sprite;
    if (this.constructionWorkers.delete(id)) {
      this._applyConstructionMix();
    }
  }

  static _applyConstructionMix() {
    // One shared loop for the whole world
    this._ensureLoop(this.loops, "sfx_construction");

    const s = this.loops.get("sfx_construction");
    if (!s) return;

    const n = this.constructionWorkers.size;

    // Option A: simple on/off with fade
    const target = (n > 0) ? this.CONSTRUCTION_MASTER : 0;

    // Option B: gentle ramp with # builders (uncomment if you prefer)
    // const target = (n > 0) ? this._clamp(0.18 + 0.06 * (n - 1), 0, 0.45) : 0;

    this._setPausableWorldLoopVolume("sfx_construction", target);
  }

  static _applyAmbientMix(tileMix) {
    const r = tileMix.ratio;
    const weighted = this._dominanceWeightMix({
      grass: r.grass,
      occluded: r.forest + r.rock,
      water: r.water * 1.18,
    });

    const grassDayTarget   = (!this.isNight ? weighted.grass : 0) * this.AMBIENT_MASTER;
    const grassNightTarget = ( this.isNight ? weighted.grass : 0) * this.AMBIENT_MASTER;

    const targets = {
      amb_grass_day: grassDayTarget,
      amb_grass_night: grassNightTarget,
      amb_occluded: weighted.occluded * this.AMBIENT_MASTER,
      amb_water: weighted.water * this.AMBIENT_MASTER,
    };

    for (const [key, vol] of Object.entries(targets)) {
      this._ensureLoop(this.ambience, key);
      this._fadeTo(this.ambience.get(key), vol);
    }
  }

  static _applyOvenMix(cookingOvenCount) {
    // Gentle ramp; tune when you have real assets.
    // Example: 1 oven = 0.15, 3 ovens = 0.35, 6+ caps near 0.6
    const v = this._clamp(0.10 + cookingOvenCount * 0.07, 0, 0.65) * this.OVEN_MASTER;

    this._ensureLoop(this.loops, "loop_oven_cook");
    this._setPausableWorldLoopVolume("loop_oven_cook", v);
  }

    static setHarvestActive(sprite, material /* "wood" | "rock" */, isActive) {
        if (!this.scene || !sprite) return;
        const id = sprite.id ?? sprite;

        if (material === "rock") {
            if (isActive) this.rockCutters.add(id);
            else this.rockCutters.delete(id);
            this._applyHarvestMix("rock");
        } else {
            if (isActive) this.woodCutters.add(id);
            else this.woodCutters.delete(id);
            this._applyHarvestMix("wood");
        }
    }

    static onSpriteDestroyed(sprite) {
        if (!sprite) return;
        const id = sprite.id ?? sprite;

        let changed = false;
        if (this.constructionWorkers?.delete(id)) changed = true;
        if (this.woodCutters?.delete(id)) changed = true;
        if (this.rockCutters?.delete(id)) changed = true;

        if (changed) {
            this._applyConstructionMix?.();
            this._applyHarvestMix?.("wood");
            this._applyHarvestMix?.("rock");
        }
    }

    static _applyHarvestMix(material /* "wood" | "rock" */) {
        const isRock = material === "rock";
        const loopKey = isRock ? "sfx_rock_hit" : "sfx_axe_chop";
        const setRef = isRock ? this.rockCutters : this.woodCutters;
        const master = isRock ? this.ROCK_CUT_MASTER : this.WOOD_CUT_MASTER;

        this._ensureLoop(this.loops, loopKey);
        const s = this.loops.get(loopKey);
        if (!s) return;

        const n = setRef.size;

        // simple on/off with fade (best v1)
        const target = (n > 0) ? master : 0;

        // or a gentle ramp if you want:
        // const target = (n > 0) ? this._clamp(0.18 + 0.05 * (n - 1), 0, 0.45) : 0;

        this._setPausableWorldLoopVolume(loopKey, target);
    }

    // AudioManager.js
    static playWeaponAttack(attackerSprite, weapon, opts = {}) {
        if (!this.scene || !weapon) return;
        if (this._worldAudioPaused) return;

        const key = weapon.attackSfxKey;
        if (!key) return;
        if (!this.scene.cache.audio.exists(key)) return;

        // Throttle per-attacker (avoid rapid spam if durations get small later)
        const now = this.scene.time.now;
        const cooldownMs = opts.cooldownMs ?? 80;

        if (attackerSprite) {
            if (attackerSprite._phxNextAtkSfxAt == null) attackerSprite._phxNextAtkSfxAt = 0;
            if (now < attackerSprite._phxNextAtkSfxAt) return;
            attackerSprite._phxNextAtkSfxAt = now + cooldownMs;
        }

        this.scene.sound.play(key, {
            volume: opts.volume ?? (weapon.projectile ? 0.42 : 0.32),
            rate: opts.rate ?? (0.95 + Math.random() * 0.1),
        });
    }

  static _ensureLoop(map, key) {
    if (map.has(key)) return;

    if (!this.scene.cache.audio.exists(key)) {
      map.set(key, null);
      return;
    }

    const s = this.scene.sound.add(key, { loop: true, volume: 0 });
    s.play();
    map.set(key, s);
    if (map === this.loops && this.PAUSABLE_WORLD_LOOP_KEYS.has(key)) {
      this._syncPausableWorldLoop(key, s);
    }
  }

  static _fadeTo(sound, targetVol) {
    if (!sound) return;

    this._stopFade(sound);

    const cur = sound.volume ?? 0;
    if (Math.abs(cur - targetVol) < 0.01) {
      sound.setVolume(targetVol);
      return;
    }

    sound._phxFadeTween = this.scene.tweens.add({
      targets: sound,
      volume: targetVol,
      duration: this.FADE_MS,
      onComplete: () => { sound._phxFadeTween = null; }
    });
  }

  static _setPausableWorldLoopVolume(key, targetVol) {
    const target = this._clamp(Number(targetVol) || 0, 0, 1);
    this._pausableWorldLoopVolumes.set(key, target);
    this._syncPausableWorldLoop(key, this.loops.get(key));
  }

  static _syncPausableWorldLoops() {
    for (const key of this.PAUSABLE_WORLD_LOOP_KEYS) {
      this._syncPausableWorldLoop(key, this.loops.get(key));
    }
  }

  static _syncPausableWorldLoop(key, sound) {
    if (!sound) return;
    const target = this._pausableWorldLoopVolumes.get(key) ?? 0;
    if (this._worldAudioPaused) {
      this._stopFade(sound);
      try { sound.setVolume(0); } catch {}
      try { sound.pause?.(); } catch {}
      return;
    }

    try {
      if (sound.isPaused) sound.resume?.();
      else if (sound.isPlaying === false) sound.play?.();
    } catch {}
    this._fadeTo(sound, target);
  }

  static _stopFade(sound) {
    if (!sound?._phxFadeTween) return;
    try { sound._phxFadeTween.stop(); } catch {}
    sound._phxFadeTween = null;
  }

  static _stopActiveWorldSfx() {
    const soundManager = this.scene?.sound;
    if (!soundManager?.stopByKey) return;
    for (const key of this.WORLD_SFX_KEYS) {
      try { soundManager.stopByKey(key); } catch {}
    }
  }

  static _clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  static _getAmbientSampleRect({ topLeftX, topLeftY, bottomRightX, bottomRightY, grid, width, height }) {
    const sampleWidth = Number(width ?? grid?.[0]?.length ?? 0);
    const sampleHeight = Number(height ?? grid?.length ?? 0);
    const worldView = this.scene?.cameras?.main?.worldView;
    if (!worldView || !sampleWidth || !sampleHeight) {
      return { topLeftX, topLeftY, bottomRightX, bottomRightY, grid, width: sampleWidth, height: sampleHeight };
    }

    const padTiles = 2;
    const camLeft = Math.floor(worldView.x / SQUARESIZE) - padTiles;
    const camTop = Math.floor(worldView.y / SQUARESIZE) - padTiles;
    const camRight = Math.ceil((worldView.x + worldView.width) / SQUARESIZE) + padTiles;
    const camBottom = Math.ceil((worldView.y + worldView.height) / SQUARESIZE) + padTiles;

    return {
      topLeftX: camLeft,
      topLeftY: camTop,
      bottomRightX: camRight,
      bottomRightY: camBottom,
      grid,
      width: sampleWidth,
      height: sampleHeight,
    };
  }

  static _dominanceWeightMix(ratios = {}) {
    const shaped = {};
    const dominancePower = 1.45;
    let total = 0;

    for (const [key, raw] of Object.entries(ratios)) {
      const value = Math.max(0, Number(raw) || 0);
      const weighted = Math.pow(value, dominancePower);
      shaped[key] = weighted;
      total += weighted;
    }

    if (total <= 0) {
      return { grass: 0, occluded: 0, water: 0 };
    }

    for (const key of Object.keys(shaped)) {
      shaped[key] /= total;
    }
    return shaped;
  }

  static _isSpriteSwimming(sprite) {
    if (!sprite?.active) return false;
    if (sprite._returnSwimActive === true) return true;
    if (sprite.isSwimming === true) return true;
    return this._tileTypeAtWorld(sprite.x, sprite.y) === "water";
  }

  static _pickSwimMoveSoundKey() {
    if (!this.scene) return null;

    const keys = [
      "sfx_swim_move_1",
      "sfx_swim_move_2",
      "sfx_swim_move_3",
    ].filter((key) => this.scene.cache.audio.exists(key));

    if (!keys.length) {
      return this.scene.cache.audio.exists("sfx_swim") ? "sfx_swim" : null;
    }

    const pool = (keys.length > 1 && this._lastSwimMoveSoundKey)
      ? keys.filter((key) => key !== this._lastSwimMoveSoundKey)
      : keys;
    const options = pool.length ? pool : keys;
    const chosen = options[Math.floor(Math.random() * options.length)];
    this._lastSwimMoveSoundKey = chosen;
    return chosen;
  }

  static _tileTypeAtWorld(x, y) {
    const grid = this.scene?.gridData ?? this.scene?.grid;
    if (!Array.isArray(grid) || !Array.isArray(grid[0])) return null;
    const gx = Math.floor(Number(x || 0) / SQUARESIZE);
    const gy = Math.floor(Number(y || 0) / SQUARESIZE);
    if (gx < 0 || gy < 0 || gy >= grid.length || gx >= grid[0].length) return null;
    const cell = grid[gy][gx];
    return this._classifyTileCell(cell);
  }

  static _getMovementSoundVolume(sprite, baseVolume) {
    const cam = this.scene?.cameras?.main;
    const worldView = cam?.worldView;
    if (!worldView || !sprite) return baseVolume;

    const centerX = worldView.x + worldView.width / 2;
    const centerY = worldView.y + worldView.height / 2;
    const dx = (sprite.x ?? centerX) - centerX;
    const dy = (sprite.y ?? centerY) - centerY;
    const distance = Math.hypot(dx, dy);
    const maxDistance = Math.max(1, Math.hypot(worldView.width, worldView.height) * this.MOVE_SOUND_DISTANCE_SCREENS);
    const normalized = this._clamp(1 - (distance / maxDistance), 0, 1);
    if (normalized <= 0) return 0;

    const inView =
      sprite.x >= worldView.x &&
      sprite.x <= worldView.x + worldView.width &&
      sprite.y >= worldView.y &&
      sprite.y <= worldView.y + worldView.height;

    const proximityGain = 0.28 + (0.72 * Math.pow(normalized, 1.2));
    const visibilityGain = inView ? 1 : this.OFFSCREEN_MOVE_FACTOR;
    return baseVolume * proximityGain * visibilityGain;
  }

  static stopAll() {
    const stopMap = (map) => {
      for (const sound of map.values()) {
        if (!sound) continue;
        try { sound._phxFadeTween?.stop?.(); } catch {}
        try { sound.stop?.(); } catch {}
        try { sound.destroy?.(); } catch {}
      }
      map.clear();
    };

    stopMap(this.ambience);
    stopMap(this.loops);

    this.lastMix = null;
    this._worldAudioPaused = false;
    this._pausableWorldLoopVolumes.clear();
    this.constructionWorkers.clear();
    this.woodCutters.clear();
    this.rockCutters.clear();
  }
}
