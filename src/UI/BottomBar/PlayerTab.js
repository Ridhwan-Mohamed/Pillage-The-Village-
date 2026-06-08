import Phaser from "phaser";
import { showAlert, CONTROL_STATES } from "../../constants";
import { AudioManager } from "../../Manager/AudioManager.js";
import { OrderRunner } from "../../orders/OrderRunner.js";
import { Player } from "../../players/Player";
import {
    applyPortraitKeyToSprite,
    DEFAULT_PLAYER_PORTRAIT_KEY,
    getPlayerPortraitKey,
} from "../../players/playerPortraits.js";
import { Teams } from "../../Teams.js";
import {
    addScrollablePanelAffordance,
    BOTTOM_BAR_THEME,
    getBottomBarWidth,
    handleScrollablePanelWheel,
    makeGlassRoundRect,
    makeBottomBarEmptyRow,
    mixColor,
    setHoverLiftState,
} from "./BottomBarTheme";

const TAB_BASE_DEPTH = 51;
const TAB_BG_DEPTH = 0;
const TAB_CONTENT_DEPTH = 1;


export default class PlayerTab {
  constructor(scene) {
    this.scene = scene;
    this.selected = null;
    this.pendingSellConfirmationId = null;
    this.pendingSellConfirmEvt = null;
        this.rows = new Map(); // sprite -> { row, hpBar, stBar, nameText, bg }
        this.refreshEvt = null;
        this._onWheel = null;
        this._rowBaseY = new WeakMap();
        this._scrollAffordances = [];
        this.BAR_SEG_UNIT = 25;
        this.BAR_SEG_GAP  = 1;

    // ---- config ----
    this.W = Math.floor(getBottomBarWidth(scene) - 20); // constrained by bottom bar
    this.H = 130; // the bar will decide height; content is responsive
    this.RIGHT_W = 300; // list (right)
    this.ROW_H = 34;

    // build UI
    this.root = this.build();
    this.bindScrollInput();
    // timed refresh (bars & list churn)
    this.refreshEvt = scene.time.addEvent({
      delay: 250,
      loop: true,
      callback: () => this.tick(),
    });

  }

    destroy() {
        this.refreshEvt?.remove(false);
        this.refreshEvt = null;
        this.pendingSellConfirmEvt?.remove(false);
        this.pendingSellConfirmEvt = null;
        if (this._onWheel) {
            this.scene.input.off('wheel', this._onWheel);
            this._onWheel = null;
        }
        this.root?.destroy();
        this.rows.clear();
        this._scrollAffordances.forEach((affordance) => affordance?.destroy?.());
        this._scrollAffordances = [];
    }

    build() {
        const scene = this.scene;
        const barWidth = getBottomBarWidth(scene);
        const detailWidth = Math.max(260, Math.floor(barWidth / 3) - 34);
        const listWidth = Math.max(300, Math.floor(barWidth * (2 / 3)) - 44);
        const detailHeight = 180;

        const root = scene.rexUI.add.sizer({
            orientation: 'x',
            space: { left: 8, right: 8, top: 8, bottom: 8, item: 10 },
        }).setDepth(TAB_BASE_DEPTH);

        // build the detail panel first
        this.detailCard = this.buildUnitInfoPanel(scene);
        this.detailScroll = scene.rexUI.add.scrollablePanel({
            width: detailWidth,
            height: detailHeight,
            scrollMode: 0,
            scrollDetectionMode: 'rectBounds',
            background: makeGlassRoundRect(scene, 0, 0, 16, {
                fill: mixColor(BOTTOM_BAR_THEME.panelFill, 0xffffff, 0.08),
                alpha: 0.74,
                stroke: 0x98e7ff,
                strokeAlpha: 0.12,
            }),
            panel: { child: this.detailCard.panel, mask: { padding: 1 } },
            space: { left: 4, right: 4, top: 4, bottom: 4, panel: 6 },
        }).setDepth(TAB_BASE_DEPTH);

        // LEFT (details) — 1/3
        this.detailSizer = scene.rexUI.add.sizer({ orientation: 'y' })
            .add(this.detailScroll, { proportion: 1, expand: true })
            .setDepth(TAB_BASE_DEPTH);

        // RIGHT (list) — 2/3
        this.listBody = scene.rexUI.add.sizer({ orientation: 'y', space: { item: 6 } });
        this.scroll = scene.rexUI.add.scrollablePanel({
            width: listWidth,
            height: 180,
            scrollMode: 0,
            scrollDetectionMode: 'rectBounds',
            background: makeGlassRoundRect(scene, 0, 0, 16, {
                fill: mixColor(BOTTOM_BAR_THEME.panelFill, 0xffffff, 0.08),
                alpha: 0.74,
                stroke: 0x98e7ff,
                strokeAlpha: 0.12,
            }),
            panel: { child: this.listBody, mask: { padding: 1 } },
            scrollerY: {
                pointerOutRelease: true,
                rectBoundsInteractive: true,
            },
            space: { left: 4, right: 4, top: 4, bottom: 4, panel: 6 },
        }).setDepth(TAB_BASE_DEPTH);
        this._scrollAffordances.push(addScrollablePanelAffordance(scene, this.scroll, {
            isActive: () => this.scene.uiBottomBar?.expanded && this.scene.uiBottomBar?.currentPage === 'players',
        }));

        // 🔒 proportions fixed here
        root.add(this.detailSizer, { proportion: 1, expand: true });
        root.add(this.scroll,      { proportion: 2, expand: true });

        this.rebuildList();
        root.layout();
        return root;
    }

    // Build the unit info panel inside your bottom bar.
    // Call: const card = buildUnitInfoPanel(scene, ui, assets);
    // Then ui.add(card.panel, 0, 'top-left', { left: 12, top: 8 }, true).layout();
    buildUnitInfoPanel(scene, ui = this, {
        portraitKey = null,              // texture key for the portrait (optional)
        name = '—',
        type = '—',
        team = '—',
        weapon = '—',
        hpPct = 1.0,                     // 0..1
        stPct = 1.0,                     // 0..1
        seedPrice = 70,
        sleepPrice = null                // set a number to show, or null to hide
    } = {}) {
        const compact = scene.scale.width < 1180;

        const BAR_W = compact ? 232 : 244;
        const BAR_H = compact ? 12 : 13;
        const BUTTON_H = compact ? 30 : 32;
        const ACTION_GAP = compact ? 5 : 6;
        const SIDE_BUTTON_W = compact ? 62 : 66;
        const SLEEP_BUTTON_W = Math.max(92, BAR_W - (SIDE_BUTTON_W * 2) - (ACTION_GAP * 2));
        const ACTION_FONT_SIZE = compact ? 10 : 11;

        // ---------- helpers ----------
        const rr = (w, h, r, color, alpha = 1) =>
            scene.rexUI.add.roundRectangle(0, 0, w, h, r, color, alpha);

        const makeSegmentedBar = (width, height, fillColor) => {
        const bg = makeGlassRoundRect(scene, width, height, 4, {
            fill: 0x08121a,
            alpha: 0.92,
            stroke: 0x98e7ff,
            strokeAlpha: 0.06,
            strokeWidth: 1,
        });
        const g  = scene.add.graphics();
        const c  = scene.add.container(0, 0, [bg, g]);
        c.setSize(width, height);

        const innerPad = 3;
        const innerW = width - innerPad * 2;
        const innerH = height - innerPad * 2;
        const segUnit = ui.BAR_SEG_UNIT;
        const gap = ui.BAR_SEG_GAP;

        c.setValues = (cur, max) => {
            const safeMax = Math.max(0, max ?? 0);
            const safeCur = Math.max(0, Math.min(cur ?? 0, safeMax || (cur ?? 0)));
            const segCount = Math.max(1, Math.ceil((safeMax || segUnit) / segUnit));
            const lastFrac = (safeMax % segUnit) === 0 ? 1 : (safeMax % segUnit) / segUnit;

            const totalGap = (segCount - 1) * gap;
            const baseSegW = Math.max(1, (innerW - totalGap) / segCount);

            g.clear();
            const x0 = -width / 2 + innerPad;
            const y0 = -height / 2 + innerPad;

            g.fillStyle(0x222222, 1);
            for (let i = 0; i < segCount; i++) {
            const isLast = (i === segCount - 1);
            const w = baseSegW * (isLast ? lastFrac : 1);
            const x = x0 + i * (baseSegW + gap);
            g.fillRect(x, y0, w, innerH);
            }

            const filledSegs = (safeCur / segUnit);
            g.fillStyle(fillColor, 1);
            for (let i = 0; i < segCount; i++) {
            const isLast = (i === segCount - 1);
            const w = baseSegW * (isLast ? lastFrac : 1);
            const x = x0 + i * (baseSegW + gap);
            const r = Phaser.Math.Clamp(filledSegs - i, 0, 1);
            if (r <= 0) continue;
            g.fillRect(x, y0, w * r, innerH);
            }
        };

        c.setValues(0, segUnit);
        return c;
        };

        // Detail panel rows now:
        const hpBar = makeSegmentedBar(BAR_W, BAR_H, 0xFF5A70);
        const hpVal = scene.add.text(0, 0, '0/0', { fontFamily: 'Bungee', fontSize: compact ? 10 : 11, color: BOTTOM_BAR_THEME.text, stroke: '#081621', strokeThickness: 2 });

        const stBar = makeSegmentedBar(BAR_W, BAR_H, 0x69D6FF);
        const stVal = scene.add.text(0, 0, '0/0', { fontFamily: 'Bungee', fontSize: compact ? 10 : 11, color: BOTTOM_BAR_THEME.text, stroke: '#081621', strokeThickness: 2 });

        const actionButtonStyles = {
            sleep: {
                fill: mixColor(BOTTOM_BAR_THEME.panelFill, 0x7acfff, 0.2),
                stroke: 0x7acfff,
                text: '#ffffff',
                textStroke: '#081621',
            },
            berry: {
                fill: mixColor(BOTTOM_BAR_THEME.panelFill, 0xb98cff, 0.2),
                stroke: 0xb98cff,
                text: '#f5e9ff',
                textStroke: '#2e1758',
            },
            sell: {
                fill: mixColor(BOTTOM_BAR_THEME.panelFill, 0xffd07d, 0.2),
                stroke: 0xffd07d,
                text: '#fff8e5',
                textStroke: '#5a2c00',
            },
        };

        function makeActionButton(labelText, onClick, style, width) {
            const background = makeGlassRoundRect(scene, width, BUTTON_H, 10, {
                fill: style.fill,
                alpha: 0.9,
                stroke: style.stroke,
                strokeAlpha: 0.2,
                strokeWidth: 1.5,
            });
            const text = scene.add.text(0, 0, labelText, {
                fontFamily: 'Bungee',
                fontSize: ACTION_FONT_SIZE,
                color: style.text,
                stroke: style.textStroke,
                strokeThickness: 2,
                align: 'center',
                fixedWidth: width - 8,
            }).setOrigin(0.5, 0.5);
            const hit = scene.add.zone(0, 0, width, BUTTON_H).setOrigin(0.5, 0.5);
            const button = scene.add.container(0, 0, [background, text, hit]);
            button.setSize(width, BUTTON_H);
            button.__background = background;
            button.__labelText = text;
            button.__hitZone = hit;
            button.__fixedWidth = width;

            hit
                .setInteractive({ useHandCursor: true })
                .on('pointerup', () => {
                    AudioManager.playBottomBarClick();
                    onClick?.();
                })
                .on('pointerover', () => {
                    if (button.__hovered) return;
                    button.__hovered = true;
                    button.__baseY ??= button.y;
                    setHoverLiftState(scene, button, true, { baseY: button.__baseY, hoverLift: 3, hoverScale: 1.03 });
                    if (!scene.guardPlacement?.active) {
                    scene.input.setDefaultCursor('pointer');
                    }
                })
                .on('pointerout', () => {
                    if (!button.__hovered) return;
                    button.__hovered = false;
                    button.__baseY ??= button.y;
                    setHoverLiftState(scene, button, false, { baseY: button.__baseY, hoverLift: 3, hoverScale: 1.03 });
                    if (!scene.guardPlacement?.active) {
                    scene.input.setDefaultCursor('default');
                    }
                });

            return button;
        }

        function setActionButtonVisible(button, visible) {
            if (!button) return false;
            if (button.__actionVisible === visible) return false;
            button.__actionVisible = visible;
            const background = button?.__background ?? button?.getElement?.('background');
            const text = button?.__labelText ?? button?.getElement?.('text');
            const hit = button?.__hitZone;
            button?.setVisible?.(visible);
            background?.setVisible?.(visible);
            text?.setVisible?.(visible);
            hit?.setVisible?.(visible);
            if (visible) {
                hit?.setInteractive?.({ useHandCursor: true });
                button?.setAlpha?.(1);
                background?.setAlpha?.(1);
                text?.setAlpha?.(1);
                hit?.setAlpha?.(1);
            } else {
                hit?.disableInteractive?.();
                if (button) button.__hovered = false;
                scene.tweens?.killTweensOf?.(button);
                button?.setScale?.(1);
                if (button?.__baseY != null) button.y = button.__baseY;
            }
            return true;
        }

        function setButtonLabel(button, labelText) {
            const text = button?.__labelText ?? button?.getElement?.('text');
            if (!text || text.text === labelText) return false;
            text.setText(labelText);
            button.setMinSize?.(button.__fixedWidth ?? 0, BUTTON_H);
            button.layout?.();
            return true;
        }

        // ---------- header row: portrait + details ----------
        const header = scene.rexUI.add.sizer({ orientation: 'x', space: { item: compact ? 10 : 12 } });

        const portrait = scene.add.sprite(0, 0, DEFAULT_PLAYER_PORTRAIT_KEY)
            .setDisplaySize(compact ? 42 : 44, compact ? 42 : 44)
            .setOrigin(0.5, 0.5);
        portrait.setVisible(false); // start hidden
        this.portrait = portrait;

        const detailsText = scene.add.text(
            0, 0,
            `Name: ${name}\nType: ${type}\nTeam: ${team}\nWeapon: ${weapon}`,
            { fontFamily: 'Bungee', fontSize: compact ? 13 : 14, color: BOTTOM_BAR_THEME.text, stroke: '#081621', strokeThickness: 2 }
        );

        header.add(portrait,    0, 'center', 0, false);
        header.add(detailsText, 0, 'left',   0, true);

        // ---------- bars column ----------
        const barsCol = scene.rexUI.add.sizer({ orientation: 'y', space: { item: compact ? 5 : 6 } });

        const hpRow = scene.rexUI.add.sizer({ orientation: 'x', space: { item: compact ? 6 : 8 } });
        hpRow.add(
            scene.add.text(0, 0, 'HP', { fontFamily: 'Bungee', fontSize: compact ? 10 : 11, color: BOTTOM_BAR_THEME.textMuted, stroke: '#081621', strokeThickness: 2 }),
            0, 'center', { right: 4 }, false
        );
        hpRow.add(hpBar, 0, 'center', 0, false);
        hpRow.add(hpVal, 0, 'center', 0, false);

        const stRow = scene.rexUI.add.sizer({ orientation: 'x', space: { item: compact ? 6 : 8 } });
        stRow.add(
            scene.add.text(0, 0, 'ST', { fontFamily: 'Bungee', fontSize: compact ? 10 : 11, color: BOTTOM_BAR_THEME.textMuted, stroke: '#081621', strokeThickness: 2 }),
            0, 'center', { right: 4 }, false
        );
        stRow.add(stBar, 0, 'center', 0, false);
        stRow.add(stVal, 0, 'center', 0, false);

        barsCol.add(hpRow, 0, 'left', 0, false);
        barsCol.add(stRow, 0, 'left', 0, false);

        // ---------- buttons row ----------
        const buttonsRow = scene.rexUI.add.sizer({
            orientation: 'x',
            space: { item: ACTION_GAP }
        }).setDepth(TAB_CONTENT_DEPTH);

        // make the row as wide as the HP/ST bars so alignment is predictable
        buttonsRow.setMinSize(BAR_W, BUTTON_H + 8);

        const sellBtn = makeActionButton('Sell', () => ui.sellSelected(), actionButtonStyles.sell, SIDE_BUTTON_W);
        const berryBtn = makeActionButton('Berry', () => ui.useBerryOnSelected(), actionButtonStyles.berry, SIDE_BUTTON_W);
        const sleepBtn = makeActionButton('Sleep', () => ui.toggleSelectedSleep(), actionButtonStyles.sleep, SLEEP_BUTTON_W);
        buttonsRow.add(sellBtn,  0, 'top', 0, false);
        buttonsRow.add(berryBtn, 0, 'top', 0, false);
        buttonsRow.add(sleepBtn, 0, 'top', 0, false);

        let panel = null;
        function bringActionsToTop() {
            sellBtn?.bringToTop?.();
            berryBtn?.bringToTop?.();
            sleepBtn?.bringToTop?.();
            buttonsRow?.bringToTop?.();
        }

        function layoutActions() {
            buttonsRow.layout();
            panel?.layout?.();
            ui.detailScroll?.layout?.();
            bringActionsToTop();
        }

        // Keep Rex children mounted; only toggle their display/interaction state.
        function updateButtonsLayout({ isFriendly }) {
            const visible = !!isFriendly;
            const changed = [
                setActionButtonVisible(sellBtn, visible),
                setActionButtonVisible(berryBtn, visible),
                setActionButtonVisible(sleepBtn, visible),
            ].some(Boolean);
            if (changed) layoutActions();
        }

        // start with nothing shown (no unit selected yet)
        updateButtonsLayout({ isFriendly: false, isCombatant: false });

        // ---------- root panel stack ----------
        const panelBg = makeGlassRoundRect(scene, 0, 0, 18, {
            fill: mixColor(BOTTOM_BAR_THEME.panelFill, 0xffffff, 0.06),
            alpha: 0.82,
            stroke: 0xa6e9ff,
            strokeAlpha: 0.16,
        }).setDepth(TAB_BG_DEPTH);
        panel = scene.rexUI.add.sizer({
            orientation: 'y',
            space: { left: compact ? 7 : 8, right: compact ? 7 : 8, top: compact ? 5 : 6, bottom: compact ? 5 : 6, item: compact ? 6 : 8 }
        });
        header.setDepth(TAB_CONTENT_DEPTH);
        barsCol.setDepth(TAB_CONTENT_DEPTH);

        panel.add(header,     0, 'left', 0, true);
        panel.add(barsCol,    0, 'left', 0, true);
        panel.add(buttonsRow, 0, 'left', 0, true);
        bringActionsToTop();

        // ---------- return with setters ----------
        return {
            panel,
            portrait, 
            setHPValues(cur, max) {
                hpBar.setValues(cur ?? 0, max ?? 0);
                hpVal.setText(`${cur ?? 0}/${max ?? 0}`);
            },
            setSTValues(cur, max) {
                stBar.setValues(cur ?? 0, max ?? 0);
                stVal.setText(`${Math.round(cur ?? 0)}/${Math.round(max ?? 0)}`);
            },
            // (optional) keep these if you still use pct anywhere
            setHP(pct) { hpBar.setValues((pct ?? 0) * ui.BAR_SEG_UNIT, ui.BAR_SEG_UNIT); },
            setST(pct) { stBar.setValues((pct ?? 0) * ui.BAR_SEG_UNIT, ui.BAR_SEG_UNIT); },
            setUnit(u) {
                detailsText.setText(
                    `Name: ${u.name}\nType: ${u.type}\nTeam: ${u.team}\nWeapon: ${u.weapon}`
                );
                applyPortraitKeyToSprite(scene, portrait, u.portraitKey, compact ? 42 : 44);
            },
            setActionLabels({ sell = 'Sell', berry = 'Berry', sleep = 'Sleep' } = {}) {
                const changed = [
                    setButtonLabel(sellBtn, sell),
                    setButtonLabel(berryBtn, berry),
                    setButtonLabel(sleepBtn, sleep),
                ].some(Boolean);
                if (changed) layoutActions();
            },
            setSellConfirming(isConfirming) {
                if (setButtonLabel(sellBtn, isConfirming ? 'Confirm' : 'Sell')) layoutActions();
            },
            setButtonsLayout(layout = {}) { updateButtonsLayout(layout); },
            sellButton: sellBtn,
            berryButton: berryBtn,
            sleepButton: sleepBtn,
        };
    }

    resetSellConfirmation() {
        this.pendingSellConfirmationId = null;
        this.pendingSellConfirmEvt?.remove(false);
        this.pendingSellConfirmEvt = null;
        this.detailCard?.setSellConfirming?.(false);
    }

    beginSellConfirmation(troop) {
        if (!troop?.active) return;
        this.pendingSellConfirmationId = troop.id;
        this.detailCard?.setSellConfirming?.(true);
        this.pendingSellConfirmEvt?.remove(false);
        this.pendingSellConfirmEvt = this.scene.time.delayedCall(2500, () => {
            if (this.pendingSellConfirmationId !== troop.id) return;
            this.resetSellConfirmation();
        });
    }

    isSellConfirmationFor(troop) {
        return !!troop?.active && this.pendingSellConfirmationId === troop.id;
    }

    getSleepButtonLabel(troop) {
        if (troop?.state === CONTROL_STATES.GO_HOME_MODE) return 'Cancel Sleep';
        if (troop?.state === CONTROL_STATES.SLEEP_MODE) return 'Wake';
        return 'Sleep';
    }

    useBerryOnSelected() {
        this.resetSellConfirmation();
        const s = this.selected;
        if (!s || !s.active) return;

        const profile = OrderRunner.getSelectionProfile([s]);
        const required = profile.count || 0;
        const available = Number(this.scene?.berries ?? 0);
        if (!required) return;
        if (available < required) {
            showAlert(this.scene, `Need ${required} berries for ${required} selected troop${required === 1 ? "" : "s"}`, "#fecaca");
            return;
        }

        const result = OrderRunner.disperseBerries(profile.troops, this.scene);
        if (!result.ok) {
            showAlert(this.scene, `Need ${required} berries for ${required} selected troop${required === 1 ? "" : "s"}`, "#fecaca");
            return;
        }

        showAlert(this.scene, `Distributed ${result.fed} berr${result.fed === 1 ? "y" : "ies"} (+${result.healAmount} HP, +${result.staminaAmount} STA)`, "#e9d5ff");
        this.paintDetails(s);
    }

    toggleSelectedSleep() {
        this.resetSellConfirmation();
        const s = this.selected;
        if (!s || !s.active) return;

        const previousLabel = this.getSleepButtonLabel(s);
        const result = OrderRunner.toggleSleepTroops([s]);
        if (!result.ok) {
            showAlert(this.scene, "No selected troops could change sleep state", "#fecaca");
            this.paintDetails(s);
            return;
        }

        if (previousLabel === 'Wake') {
            showAlert(this.scene, `${s.name || 'Troop'} woke up.`, "#a7f3d0", 1800);
        } else if (previousLabel === 'Cancel Sleep') {
            showAlert(this.scene, `${s.name || 'Troop'} will stay awake.`, "#a7f3d0", 1800);
        } else if (result.failed > 0) {
            showAlert(this.scene, `${s.name || 'Troop'} could not sleep.`, "#fde68a", 1800);
        } else {
            showAlert(this.scene, `Sent ${s.name || 'troop'} home`, "#a7f3d0", 1800);
        }

        this.paintDetails(s);
    }

    startGuardPlacementForSelected() {
        return;
    }

    attackSelectedTarget() {
        const target = this.selected;
        if (!target || !target.active) return;

        if (!target.body || target.body.team !== 0) {
            showAlert?.(
                this.scene,
                'Attack is only for enemy units.',
                '#ffcc00',
                1500
            );
            return;
        }

        Player.assignFighterToTarget(target);
        showAlert?.(
            this.scene,
            `Sending a fighter to attack ${target.name || 'enemy'}.`,
            '#ff9933',
            1800
        );
    }

    attackSelectedTarget() {
        const target = this.selected;
        if (!target || !target.active) return;

        // Only attack enemies (team 0)
        if (!target.body || target.body.team !== 0) {
            showAlert?.(this.scene, 'Attack is only for enemy units.', '#ffcc00', 1500);
            return;
        }

        Player.assignFighterToTarget(target);
        showAlert?.(this.scene, `Sending a fighter to attack ${target.name || 'enemy'}.`, '#ff9933', 1800);
    }

    // --------- TEAM LIST (right) ----------
    rebuildList() {
        const scene = this.scene;
        this.listBody.clear(true);
        this.rows.clear();

        // "your team" is team 1 in your codebase
        // Instead of Player.troops...
        const team1 = (Teams.teamLists['1']?.playerList || []).slice();

        // sort by type then name for stability
        team1.sort((a, b) => (this.typeOf(a).localeCompare(this.typeOf(b))) || (a.name || '').localeCompare(b.name || ''));

        if (!team1.length) {
            this.listBody.add(this.createEmptyRow(), { expand: true });
        }

        team1.forEach(sprite => {
            const row = this.createRow(sprite);
            this.listBody.add(row, { expand: true });
            this.rows.set(sprite, row.userData);
        });

        this.listBody.layout();
        this.scroll.layout();
    }

    bindScrollInput() {
        if (this._onWheel) return;

        this._onWheel = (pointer, _gameObjects, dx, dy) => {
            if (this.scene.uiBottomBar?.currentPage !== 'players') return;
            if (!this.scene.uiBottomBar?.expanded) return;
            const panels = [this.scroll];
            panels.some((panel) => handleScrollablePanelWheel(this.scene, panel, pointer, dx, dy));
        };

        this.scene.input.on('wheel', this._onWheel);
    }

    isPointerOverScroll(pointer) {
        if (!this.scroll?.getBounds) return false;
        const bounds = this.scroll.getBounds();
        return Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y);
    }

    //refresh logic
    onShow() {
        const team1 = Teams.teamLists['1']?.playerList || [];

        // If nothing selected (or old selection is gone), pick the first player
        if (!this.selected || !team1.includes(this.selected)) {
            if (team1[0]) {
            this.select(team1[0]);
            } else {
            this.selected = null;
            this.clearDetails();
            return;
            }
        } else {
            this.select(this.selected);
        }
    }

    onHide() {
        Player.setMiniBarSelectedFromTab?.(null);
    }

    createRow(sprite) {
        const scene = this.scene;

        const accent = sprite.unitTint ?? 0x96d9ff;
        const bg = makeGlassRoundRect(scene, 0, 0, 14, {
            fill: mixColor(BOTTOM_BAR_THEME.cardFill, accent, 0.08),
            alpha: 0.88,
            stroke: accent,
            strokeAlpha: 0.12,
            strokeWidth: 1.5,
        }).setDepth(TAB_BG_DEPTH);

        const name = scene.add.text(
            0, 0,
            sprite.name || 'Unnamed',
            { fontFamily: 'Bungee', fontSize: '12px', color: BOTTOM_BAR_THEME.text, stroke: '#081621', strokeThickness: 2 }
        );

        // helper for mini bars
        function makeMiniSegBar(width, height, fillColor, ui) {
        const bg = makeGlassRoundRect(scene, width, height, 4, {
            fill: 0x08121a,
            alpha: 0.92,
            stroke: 0x98e7ff,
            strokeAlpha: 0.05,
            strokeWidth: 1,
        });
        const g  = scene.add.graphics();
        const c  = scene.add.container(0,0,[bg,g]);
        c.setSize(width, height);

        const segUnit = ui.BAR_SEG_UNIT;
        const gap = ui.BAR_SEG_GAP;
        const innerPad = 1;
        const innerW = width - innerPad*2;
        const innerH = height - innerPad*2;

        c.setValues = (cur, max) => {
            const safeMax = Math.max(0, max ?? 0);
            const safeCur = Math.max(0, Math.min(cur ?? 0, safeMax || (cur ?? 0)));
            const segCount = Math.max(1, Math.ceil((safeMax || segUnit) / segUnit));
            const lastFrac = (safeMax % segUnit) === 0 ? 1 : (safeMax % segUnit)/segUnit;

            const totalGap = (segCount - 1) * gap;
            const baseSegW = Math.max(1, (innerW - totalGap) / segCount);

            g.clear();
            const x0 = -width/2 + innerPad;
            const y0 = -height/2 + innerPad;

            g.fillStyle(0x111111, 1);
            for (let i=0;i<segCount;i++){
            const isLast = i===segCount-1;
            const w = baseSegW*(isLast?lastFrac:1);
            const x = x0 + i*(baseSegW+gap);
            g.fillRect(x,y0,w,innerH);
            }

            const filledSegs = safeCur / segUnit;
            g.fillStyle(fillColor,1);
            for (let i=0;i<segCount;i++){
            const isLast = i===segCount-1;
            const w = baseSegW*(isLast?lastFrac:1);
            const x = x0 + i*(baseSegW+gap);
            const r = Phaser.Math.Clamp(filledSegs - i, 0, 1);
            if (r<=0) continue;
            g.fillRect(x,y0,w*r,innerH);
            }
        };

        c.setValues(0, segUnit);
        return c;
        }

        const hp = makeMiniSegBar(76, 6, 0xff4d4d, this);
        const st = makeMiniSegBar(76, 6, 0x4dd2ff, this);

        const bars = scene.rexUI.add.sizer({ orientation: 'y', space: { item: 4 } })
            .add(hp, 0, 'left', 0, false)
            .add(st, 0, 'left', 0, false)
            .setDepth(TAB_CONTENT_DEPTH);
        name.setDepth(TAB_CONTENT_DEPTH);

        const row = scene.rexUI.add.sizer({
            orientation: 'x',
            space: { left: 8, right: 20, top: 6, bottom: 6, item: 8 },
        })
            .addBackground(bg)
            .add(name, { proportion: 1, expand: false })
            .add(bars, { proportion: 0, expand: false, padding: { left: 6, right: 10 } })
            .setDepth(TAB_BASE_DEPTH);
        
        // 🔥 stretch full width
        const fullWidth = Math.max(220, Math.floor(getBottomBarWidth(scene) * (2 / 3)) - 72);
        row.setMinSize(fullWidth, 6);

        // row.setMinSize(this.RIGHT_W - 20, this.ROW_H);
        row.setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.select(sprite))
            .on('pointerover', () => {
                const data = row.userData;
                if (!data) return;
                if (data.hovered) return;
                data.hovered = true;
                this.updateRowVisual(data);
            })
            .on('pointerout', () => {
                const data = row.userData;
                if (!data) return;
                if (!data.hovered) return;
                data.hovered = false;
                this.updateRowVisual(data);
            });

        // store refs on row
        row.userData = {
            sprite,
            hpBar: hp,
            stBar: st,
            nameText: name,
            bg,
            row,
            hovered: false,
        };

        this._rowBaseY.set(row, row.y);
        this.updateRowVisual(row.userData);

        // initial bar widths
        this.updateRowBars(row.userData);

        return row;
    }

    createEmptyRow() {
        const width = Math.max(220, Math.floor(getBottomBarWidth(this.scene) * (2 / 3)) - 72);
        return makeBottomBarEmptyRow(this.scene, {
            width,
            height: Math.max(44, this.ROW_H + 10),
            title: "No players",
            subtitle: "Recruit from Store",
            accent: 0x57d68d,
        });
    }

    // --------- selection & details ----------
    select(sprite) {
        if (this.selected !== sprite) {
            this.resetSellConfirmation();
        }
        this.selected = sprite;
        // highlight selected row
        for (const data of this.rows.values()) {
            this.updateRowVisual(data);
        }

        // 🔥 keep world mini bars open for selected unit
        if (Player.setMiniBarSelectedFromTab) {
            Player.setMiniBarSelectedFromTab(sprite);
        }

        this.paintDetails(sprite);
    }

    paintDetails(s) {
        if (!s || !s.active) {
            this.clearDetails();
            return;
        }

        const type = this.typeOf(s);
        const profile = OrderRunner.getSelectionProfile([s]);

        // same close-up logic as before
        const portraitKey = getPlayerPortraitKey(s);
        this.detailCard.setUnit({
            name:   s.name || 'Unnamed',
            type,
            team:   s.body?.team ?? '?',
            weapon: s.weapon?.name ?? 'None',
            portraitKey
        });

        const maxHP = s.maxHealth ?? 100;
        const maxST = s.maxStamina ?? s.maxStaminaValue ?? 100;

        // Segmented bars + correct labels (current / type max)
        this.detailCard.setHPValues?.(s.health ?? 0, maxHP);
        this.detailCard.setSTValues?.(s.stamina ?? 0, maxST);

        const isFriendly = profile.hasSelection;
        if (!isFriendly && this.isSellConfirmationFor(s)) {
            this.resetSellConfirmation();
        }

        this.detailCard.setActionLabels?.({
            sell: this.isSellConfirmationFor(s) ? 'Confirm' : 'Sell',
            berry: 'Berry',
            sleep: this.getSleepButtonLabel(s),
        });

        this.detailCard.setButtonsLayout?.({
            isFriendly
        });
    }

    clearDetails() {
        this.resetSellConfirmation();
        this.selected = null;
        Player.setMiniBarSelectedFromTab?.(null);
        this.detailCard.setUnit({
            name: '—',
            type: '—',
            team: '—',
            weapon: '—',
            portraitKey: null
        });
        this.detailCard.setHPValues?.(100, 100);
        this.detailCard.setSTValues?.(100, 100);
        this.detailCard.setActionLabels?.({ sell: 'Sell', berry: 'Berry', sleep: 'Sleep' });
        this.detailCard.setButtonsLayout?.({
            isFriendly: false
        });
    }

    sellSelected() {
        const s = this.selected;
        if (!s || !s.active) {
            this.resetSellConfirmation();
            return;
        }

        const profile = OrderRunner.getSelectionProfile([s]);
        if (!profile.hasSelection) {
            this.resetSellConfirmation();
            return;
        }

        if (!this.isSellConfirmationFor(s)) {
            this.beginSellConfirmation(s);
            this.paintDetails(s);
            return;
        }

        const soldName = s.name || 'troop';
        this.resetSellConfirmation();
        const result = OrderRunner.sellTroops(profile.troops, this.scene, {
            sourceUiTarget: this.detailCard?.sellButton ?? null,
        });
        if (!result.ok) {
            if (s.active) this.paintDetails(s);
            return;
        }

        showAlert?.(this.scene, `Sold ${soldName} for $${result.money}`, '#33ff77', 1800);
    }

    // --------- tick / refresh ---------
    tick() {
        const current = this.scene.uiBottomBar?.currentPage;
        if (current !== 'players') return;

        // if any troop was removed/added, rebuild
        const team1Count = Teams.teamLists['1']?.playerList?.length || 0;
        if (team1Count !== this.rows.size) {
            this.rebuildList();
        }

        // update bars for each row
        for (const data of this.rows.values()) {
            if (!data.sprite?.active) continue;
            this.updateRowBars(data);
        }

        // keep details live only when active
        if (this.selected?.active) {
            this.paintDetails(this.selected);
        }
    }


    onPlayerDestroyed(player) {
        if (!player) return;

        const data = this.rows.get(player);
        if (data) {
            // destroy the row UI
            if (data.row && !data.row.isDestroyed) {
                data.row.destroy();
            }
            this.rows.delete(player);
        }

        // if that player was selected, clear the detail panel
        if (this.selected === player) {
            this.selected = null;
            this.clearDetails();
        }

        // re-layout scroll panel so there isn't a gap
        this.listBody?.layout?.();
        this.scroll?.layout?.();

        // fallback: if counts are now out of sync for any reason, hard refresh
        const team1Count = Teams.teamLists['1']?.playerList?.length || 0;
        if (team1Count === 0 || team1Count !== this.rows.size) {
            this.rebuildList();
        }
    }

    updateRowBars({ sprite: s, hpBar, stBar }) {
        const maxHP = s.maxHealth ?? 100;
        const maxST = s.maxStamina ?? s.maxStaminaValue ?? 100;

        hpBar.setValues?.(s.health ?? 0, maxHP);
        stBar.setValues?.(s.stamina ?? 0, maxST);
    }

    updateRowVisual(data) {
        if (!data?.bg || !data?.row) return;
        const selected = this.selected === data.sprite;
        const hovered = !!data.hovered;
        const accent = selected ? 0xffd8a2 : (data.sprite?.unitTint ?? 0x96d9ff);
        data.bg.setFillStyle(
            mixColor(BOTTOM_BAR_THEME.cardFill, accent, selected ? 0.16 : hovered ? 0.12 : 0.08),
            selected ? 0.94 : hovered ? 0.9 : 0.88
        );
        data.bg.setStrokeStyle(selected ? 2.5 : hovered ? 2 : 1.5, accent, selected ? 0.34 : hovered ? 0.22 : 0.12);
        data.nameText?.setColor(selected ? "#fff8eb" : BOTTOM_BAR_THEME.text);
        const active = selected || hovered;
        const targetScale = selected ? 1.012 : hovered ? 1.008 : 1;
        const nextVisualState = `${active}:${targetScale}`;
        if (data.__hoverVisualState !== nextVisualState) {
            data.__hoverVisualState = nextVisualState;
            setHoverLiftState(this.scene, data.row, active, {
                baseY: this._rowBaseY.get(data.row) ?? data.row.y,
                hoverLift: 0,
                hoverScale: targetScale,
                moveY: false,
            });
        }
    }

    typeOf(s) {
        if (s.isFarmer)      return 'Farmer';
        if (s.isForager)     return 'Forager';
        if (s.isFireman)     return 'Fireman';
        if (s.isBuilder)     return 'Builder';
        if (s.isGunslinger)  return 'Gunslinger';
        if (s.isBlademaster) return 'Blademaster';
        if (s.isBrawler)     return 'Brawler';
        if (s.isShocker)     return 'Shocker';
        if (s.isFortGrunt)   return 'Fort Grunt';
        if (s.isSeaRaider)   return 'Sea Raider';
        if (s.isRaider)      return 'Raider';
        return 'Unit';
    }

    hidePortrait() {
        this.portrait?.setVisible(false);
        this.portrait?.anims?.stop?.();
    }

    // Expose the root for rexUI pages.addPage(...)
    get view() { return this.root; }
}
