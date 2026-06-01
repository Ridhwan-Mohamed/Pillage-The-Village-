import { openPowerupScreen } from "../UI/Powerups";
import { Teams } from "../Teams";
import { VisibilitySystem } from "../UI/VisibilitySystem";
import { Player } from "../players/Player";
import { recalculateDestroyTasksFromPoint, spawnSeaRaider } from "../Manager/spawnManager";
import { AudioManager } from "../Manager/AudioManager";
import { DailyNeedsTracker } from "../UI/DailyNeedsTracker";

const DAWN_START = 6;
const DAY_START = 7;
const DUSK_START = 16;
const NIGHT_START = 18;
const NIGHT_PEAK_LOCK_HOUR = 20;
const NIGHT_END = DAWN_START;
const CROP_GROWTH_INTERVAL_HOURS = 8;
const CROP_GROWTH_START_HOUR = DAWN_START;
const WEEKDAY_LABELS = Object.freeze([
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]);
const WEEKDAY_SHORT_LABELS = Object.freeze([
    "MON",
    "TUE",
    "WED",
    "THU",
    "FRI",
    "SAT",
    "SUN",
]);

const PHASE_DEFS = {
    dawn: {
        key: "dawn",
        label: "DAWN",
        shortLabel: "Dawn",
        color: 0x9be7ff,
        textColor: "#dff6ff",
        help: "Tower income, permits, and queued village rewards.\nParcel buying stays open.",
        actionText: "Income / permits / rewards",
    },
    day: {
        key: "day",
        label: "DAY",
        shortLabel: "Day",
        color: 0x7ee787,
        textColor: "#e8ffe8",
        help: "Build, gather, and expand.\nParcel buying is open.",
        actionText: "Build / gather / expand",
    },
    dusk: {
        key: "dusk",
        label: "DUSK",
        shortLabel: "Dusk",
        color: 0xffb86b,
        textColor: "#fff1db",
        help: "Final prep before the coastal assault.\nParcel buying stays open.",
        actionText: "Prep / expand / defend",
    },
    night: {
        key: "night",
        label: "NIGHT",
        shortLabel: "Night",
        color: 0xf87171,
        textColor: "#ffe4e4",
        help: "Survive the horde until dawn.\nParcels stay usable all night.",
        actionText: "Defend / expand / survive",
    },
};

export class Clock {

    static overlay;
    constructor(scene) {
        this.scene = scene;
        this.paused = false; 
        this.powerupScreenShown = false;

        this.hours = 5;
        this.minutes = 50;
        this.day = 1;

        this.waveAmount = 1;
        this.spawnedThisNight = 0;
        this.lastSend = null;
        this.wasNight = false; // <== track night state

        this.minuteStep = 0.3;
        this.ticksPerMinute = 1;
        this.tickCount = 0;

        // // Dark overlay setup
        // const camera = scene.cameras.main;
        // const worldScale = 1 / 0.3; // pretend zoomed out fully
        // const bleed = 0.25;          // bleed margin on each side
        // const w = camera.width * worldScale * (1 + bleed * 2);
        // const h = camera.height * worldScale * (1 + bleed * 2);

        // Clock.overlay = scene.add.rectangle(
        // -camera.width * worldScale * (bleed+0.15),
        // -camera.height * worldScale * (bleed+0.15),
        // w,
        // h,
        // 0x000000,
        // 1
        // )
        //     .setOrigin(0, 0)
        //     .setDepth(UIDEPTH - 2)
        //     .setScrollFactor(0)
        //     .setAlpha(0);

        this.externalText = null;

    }

    getHourFloat() {
        return Number(this.hours) + Number(this.minutes) / 60;
    }

    getPhaseKey() {
        const hourFloat = this.getHourFloat();
        if (hourFloat >= NIGHT_START || hourFloat < DAWN_START) return "night";
        if (hourFloat < DAY_START) return "dawn";
        if (hourFloat < DUSK_START) return "day";
        return "dusk";
    }

    getPhaseInfo() {
        const phase = PHASE_DEFS[this.getPhaseKey()] || PHASE_DEFS.day;
        if (this.day === 1 && phase.key === "dusk") {
            return {
                ...phase,
                help: "First night is free: no raiders arrive tonight.\nUse dusk to finish setup.",
                actionText: "Free first night prep",
            };
        }
        if (this.day === 1 && phase.key === "night") {
            return {
                ...phase,
                help: "Free first night: no raiders tonight.\nThe first horde arrives on night two.",
                actionText: "Free first night",
            };
        }
        return phase;
    }

    canBuyParcels() {
        return true;
    }

    formatClockFaceTime() {
        const hour12 = this.hours % 12 === 0 ? 12 : this.hours % 12;
        const ampm = this.hours < 12 ? 'AM' : 'PM';
        const minutesStr = String(Math.round(this.minutes)).padStart(2, '0');
        return `${hour12}:${minutesStr} ${ampm}`;
    }

    formatTimeWithDay() {
        return `${this.getWeekdayLabel()} - Day ${this.day} - ${this.formatClockFaceTime()}`;
    }

    getSnapshot() {
        return {
            paused: !!this.paused,
            powerupScreenShown: !!this.powerupScreenShown,
            hours: Number(this.hours || 0),
            minutes: Number(this.minutes || 0),
            day: Number(this.day || 1),
            waveAmount: Number(this.waveAmount || 1),
            spawnedThisNight: Number(this.spawnedThisNight || 0),
            lastSend: this.lastSend ?? null,
            wasNight: !!this.wasNight,
            minuteStep: Number(this.minuteStep || 0.3),
            ticksPerMinute: Number(this.ticksPerMinute || 1),
            tickCount: Number(this.tickCount || 0),
        };
    }

    restoreSnapshot(snapshot = null) {
        if (!snapshot || typeof snapshot !== "object") return;
        this.paused = !!snapshot.paused;
        this.powerupScreenShown = !!snapshot.powerupScreenShown;
        this.hours = Number(snapshot.hours ?? this.hours ?? 5);
        this.minutes = Number(snapshot.minutes ?? this.minutes ?? 50);
        this.day = Math.max(1, Number(snapshot.day ?? this.day ?? 1));
        this.waveAmount = Math.max(1, Number(snapshot.waveAmount ?? this.waveAmount ?? 1));
        this.spawnedThisNight = Math.max(0, Number(snapshot.spawnedThisNight ?? this.spawnedThisNight ?? 0));
        this.lastSend = snapshot.lastSend ?? null;
        this.wasNight = !!snapshot.wasNight;
        this.minuteStep = Number(snapshot.minuteStep ?? this.minuteStep ?? 0.3);
        this.ticksPerMinute = Math.max(1, Number(snapshot.ticksPerMinute ?? this.ticksPerMinute ?? 1));
        this.tickCount = Math.max(0, Number(snapshot.tickCount ?? this.tickCount ?? 0));
        this.externalText?.setText?.(this.formatTimeWithDay());
        this.updateLighting?.();
    }

    _minutesUntilHour(targetHour) {
        const current = this.getHourFloat() * 60;
        let target = Number(targetHour) * 60;
        while (target <= current) target += 24 * 60;
        return Math.max(0, Math.round(target - current));
    }

    static formatMinutesAsClock(totalMinutes) {
        const mins = Math.max(0, Math.round(totalMinutes));
        const hh = Math.floor(mins / 60);
        const mm = mins % 60;
        if (hh <= 0) return `${mm}m`;
        return `${hh}h ${String(mm).padStart(2, "0")}m`;
    }

    getPhaseCountdownText() {
        const phase = this.getPhaseKey();
        if (phase === "dawn") {
            return `Day opens in ${Clock.formatMinutesAsClock(this._minutesUntilHour(DAY_START))}`;
        }
        if (phase === "day") {
            return `Dusk in ${Clock.formatMinutesAsClock(this._minutesUntilHour(DUSK_START))}`;
        }
        if (phase === "dusk") {
            if (this.day === 1) {
                return `Free night in ${Clock.formatMinutesAsClock(this._minutesUntilHour(NIGHT_START))}`;
            }
            return `Night in ${Clock.formatMinutesAsClock(this._minutesUntilHour(NIGHT_START))}`;
        }
        if (this.day === 1) {
            return `Free night ends in ${Clock.formatMinutesAsClock(this._minutesUntilHour(DAWN_START))}`;
        }
        return `Survive ${Clock.formatMinutesAsClock(this._minutesUntilHour(DAWN_START))}`;
    }

    update(stepCount = 1) {
        const steps = Math.max(1, Math.floor(stepCount));
        for (let i = 0; i < steps; i++) {
            this.tickCount++;
            if (this.tickCount >= this.ticksPerMinute) {
                this.tickCount = 0;
                this.advanceTime();
            }

            this.events();
        }

        this.externalText?.setText?.(this.formatTimeWithDay());
        this.updateLighting();
    }

    advanceTime() {
        if (this.paused) return; // ⛔ don't advance time or spawn events
        const holdAtPeakDarkness = this.scene?.shouldHoldNightAtPeakDarkness?.();
        if (holdAtPeakDarkness && this.isNight() && this.getHourFloat() >= NIGHT_PEAK_LOCK_HOUR) {
            this.hours = NIGHT_PEAK_LOCK_HOUR;
            this.minutes = 0;
            this.wasNight = true;
            return;
        }
        this.minutes += this.minuteStep;
        if (this.minutes >= 60) {
            this.minutes = 0;
            this.hours++;

            if (this.hours >= 24) {
                this.hours = 0;
            }

            // Handle night end transition
            const isNight = this.isNight();
            if (this.wasNight && !isNight) {
                this.day++;
                this.waveAmount += 2;
                this.spawnedThisNight = 0;
            }
            this.wasNight = isNight;
        }
    }

    isNight() {
        return this.getPhaseKey() === "night";
    }

    isDayStart(){
        return this.hours == DAWN_START && this.minutes == 0
    }

    isDayPhaseStart() {
        return this.hours == DAY_START && this.minutes == 0
    }

    isDuskStart() {
        return this.hours == DUSK_START && this.minutes == 0
    }

    isNightStart(){
        return this.hours == NIGHT_START && this.minutes == 0
    }

    isCropGrowthTick() {
        if (this.minutes !== 0) return false;
        const elapsed = (this.hours - CROP_GROWTH_START_HOUR + 24) % 24;
        return elapsed % CROP_GROWTH_INTERVAL_HOURS === 0;
    }

    events() {
        const dayStart = this.isDayStart();
        const dayPhaseStart = this.isDayPhaseStart();
        const duskStart = this.isDuskStart();
        const nightStart = this.isNightStart();
        const cropGrowthTick = this.isCropGrowthTick();

        if (duskStart) {
            this.scene?.handleDuskStart?.();
            this.scene?.handlePhaseChanged?.("dusk", this.getPhaseInfo());
        }

        if (nightStart) {
            AudioManager.setIsNight(true);
            this.scene?.handleNightStart?.();
            this.scene?.handlePhaseChanged?.("night", this.getPhaseInfo());
        }
        else if (dayStart /*&& !this.powerupScreenShown*/) {
            AudioManager.setIsNight(false);
            this.powerupScreenShown = true;
            DailyNeedsTracker.consumeResources();
            this.scene?.handleDayStart?.();
            this.scene?.handlePhaseChanged?.("dawn", this.getPhaseInfo());
        } else if (dayPhaseStart) {
            this.scene?.handlePhaseChanged?.("day", this.getPhaseInfo());
        }

        if (cropGrowthTick) {
            Teams.growWateredCrops(1);
            Teams.resetDailyWatering(1);
        } else if (!nightStart && !dayStart) {
            this.lastSend = null;
        }
    }

    updateLighting() {
        let alpha = 0;
        const hourFloat = this.hours + this.minutes / 60;
        let nightHour = hourFloat;
        const maxDarkness = 0.72;
        if (nightHour < 6) nightHour += 24;

        if (nightHour >= 20 && nightHour <= 28) {
            alpha = maxDarkness;              // darkness amount
        } else if (nightHour >= 18 && nightHour < 20) {
            const t = (nightHour - 18) / 2;   // dusk ramp
            alpha = t * maxDarkness;
        } else if (nightHour > 28 && nightHour <= 30) {
            const t = 1 - (nightHour - 28) / 2; // dawn ramp
            alpha = t * maxDarkness;
        }

        // ✅ VisibilitySystem expects a light floor (BRIGHTNESS), not darkness.
        const ambientBrightness = 1 - alpha;
        const ambientTint = alpha > 0 ? 0x020716 : 0x000000;
        VisibilitySystem.setAmbient(ambientBrightness, ambientTint);
    }

    pause() {
        this.paused = true;
    }

    resume() {
        this.paused = false;
    }

    setDay(day = 1) {
        this.day = Math.max(1, Math.floor(Number(day) || 1));
        this.externalText?.setText?.(this.formatTimeWithDay());
    }

    getWeekdayIndex(day = this.day) {
        return ((Math.max(1, Math.floor(Number(day) || 1)) - 1) % WEEKDAY_LABELS.length + WEEKDAY_LABELS.length) % WEEKDAY_LABELS.length;
    }

    getWeekdayLabel(day = this.day) {
        return WEEKDAY_LABELS[this.getWeekdayIndex(day)] || WEEKDAY_LABELS[0];
    }

    getWeekdayShortLabel(day = this.day) {
        return WEEKDAY_SHORT_LABELS[this.getWeekdayIndex(day)] || WEEKDAY_SHORT_LABELS[0];
    }
}
