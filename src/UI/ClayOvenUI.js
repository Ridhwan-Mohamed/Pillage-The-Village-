// === ClayOvenUI.js ===

import { UIDEPTH } from '../constants';
import { Teams } from '../Teams';
import { UI_ITEM_TYPES } from './UIConstants';
import { BUILDING_PANEL_TEXT_STYLES, createBuildingHoverPanel } from './BuildingTheme';
import { animateOverlayPop, isOverviewMode } from './OverlayPopAnimator';

export class ClayOvenUI {
    static scene = null; // set externally
    static _onOvenUpdated = null;
    static _onOvenAdded = null;
    static _onOvenRemoved = null;
    static _onZoomModeChanged = null;

    static init(scene) {
        if (this.scene?.events && this._onOvenUpdated) {
            this.scene.events.off('oven:updated', this._onOvenUpdated);
            this.scene.events.off('oven:added', this._onOvenAdded);
            this.scene.events.off('oven:removed', this._onOvenRemoved);
            this.scene.events.off('zoom:mode-changed', this._onZoomModeChanged);
        }

        this.scene = scene;
        this.openUIs = new Map();
        this._onOvenUpdated = (oven) => this.refreshStatus(oven);
        this._onOvenAdded = (oven) => this.refreshStatus(oven);
        this._onOvenRemoved = (oven) => {
            this.hideStatus(oven);
            this.hideMinor(oven, { animate: false });
        };
        this._onZoomModeChanged = (mode, duration) => this.applyOverviewMode(mode, duration);
        this.scene.events.on('oven:updated', this._onOvenUpdated);
        this.scene.events.on('oven:added', this._onOvenAdded);
        this.scene.events.on('oven:removed', this._onOvenRemoved);
        this.scene.events.on('zoom:mode-changed', this._onZoomModeChanged);
        Teams.teamLists?.[1]?.ovenList?.forEach((oven) => this.refreshStatus(oven));
    }

    static _isOverviewMode() {
        return isOverviewMode(this.scene);
    }

    static _offSceneUpdate(listener) {
        if (typeof listener === 'function') {
            this.scene?.events?.off('update', listener);
        }
    }

    static _eachOven(fn) {
        for (const team of Object.values(Teams.teamLists || {})) {
            const ovens = Array.isArray(team?.ovenList) ? team.ovenList : [];
            ovens.forEach(fn);
        }
    }

    static applyOverviewMode(mode, duration = 160) {
        const overview = mode === 'overview';
        this._eachOven((oven) => {
            if (overview) {
                this._hideStatusForOverview(oven, duration);
                this._hideMinorForOverview(oven, duration);
            } else {
                this.refreshStatus(oven);
                if (oven?.isHovered) this.showMinor(oven, { duration });
                else if (oven?.minorUI?.hiddenForOverview) this.hideMinor(oven, { animate: false });
            }
        });
    }

    static _addStatusPulse(oven, state) {
        const ui = oven?.statusUI;
        if (!ui?.container || !state || this._isOverviewMode()) return;

        ui.tween?.remove?.();
        ui.tween = null;

        const startAlpha = state.key === 'cooking' ? 0.96 : 1;
        const endAlpha = state.key === 'cooking' ? 0.66 : 0.52;
        ui.container.setAlpha(startAlpha).setScale(1).setVisible(true);
        ui.tween = this.scene?.tweens?.add?.({
            targets: ui.container,
            alpha: { from: startAlpha, to: endAlpha },
            duration: state.key === 'cooking' ? 920 : 560,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1,
        }) ?? null;
    }

    static _showStatusWithPop(oven, state, shouldPop = false) {
        const ui = oven?.statusUI;
        if (!ui?.container) return;

        ui.hiddenForOverview = false;
        ui.tween?.remove?.();
        ui.tween = null;

        const targetAlpha = state.key === 'cooking' ? 0.96 : 1;
        if (shouldPop) {
            animateOverlayPop(this.scene, ui.container, true, {
                alpha: targetAlpha,
                duration: 150,
                onComplete: () => {
                    if (oven?.statusUI === ui) this._addStatusPulse(oven, state);
                },
            });
        } else {
            this._addStatusPulse(oven, state);
        }
    }

    static _hideStatusForOverview(oven, duration = 150) {
        const ui = oven?.statusUI;
        if (!ui?.container || ui.hiddenForOverview) return;
        ui.hiddenForOverview = true;
        ui.tween?.remove?.();
        ui.tween = null;
        animateOverlayPop(this.scene, ui.container, false, { duration });
    }

    static _hideMinorForOverview(oven, duration = 150) {
        const ui = oven?.minorUI;
        if (!ui?.root || ui.hiddenForOverview) return;
        ui.hiddenForOverview = true;
        animateOverlayPop(this.scene, ui.root, false, { duration });
    }

    static updateAllOvens(speedMultiplier = 0) {
        const delta = Number.isFinite(speedMultiplier) ? Math.max(0, speedMultiplier) : 0;
        Teams.teamLists[1]?.ovenList?.forEach(oven => {
            oven.updateCooking(delta);

            if (!oven.uiElements) return;

            const slotCount = oven.cookingSlots?.length || 1;
            for (let i = 0; i < slotCount; i++) {
                const ui = oven.uiElements[i] || {};
                const { progressFill, outIcon, cookIcon, cookLabel, outLabel } = ui;

                // === Update Progress Bar ===
                const duration = oven.cookDurations[i];
                const elapsed = oven.cookTimers[i];
                const pct = duration > 0 ? Math.min(elapsed / duration, 1) : 0;
                if (progressFill) {
                    progressFill.width = pct * 28;
                }

                // === Update Output Icon & Label ===
                const outSlot = oven.outputSlots[i];
                const expectedOutIcon = UI_ITEM_TYPES[outSlot?.item.name || 'empty']?.icon || "__MISSING";

                if (outIcon?.texture?.key !== expectedOutIcon) {
                    outIcon.setTexture(expectedOutIcon);
                }

                if (outLabel) {
                    if (outSlot?.amount > 1) {
                        outLabel.setText(`x${outSlot.amount}`);
                        outLabel.setVisible(true);
                    } else {
                        outLabel.setVisible(false);
                    }
                }

                // === Update Cook Icon & Label ===
                const cookSlot = oven.cookingSlots[i];
                const expectedCookIcon = UI_ITEM_TYPES[cookSlot?.item.name || 'empty']?.icon || "__MISSING";

                if (cookIcon?.texture?.key !== expectedCookIcon) {
                    cookIcon.setTexture(expectedCookIcon);
                }

                if (cookLabel) {
                    if (cookSlot?.amount > 1) {
                        cookLabel.setText(`x${cookSlot.amount}`);
                        cookLabel.setVisible(true);
                    } else {
                        cookLabel.setVisible(false);
                    }
                }
            }
        });
    }

    static refreshStatus(oven) {
        if (!this.scene || !oven?.sprite) return;

        const state = oven.getStatusBadgeState?.();
        if (!state) {
            this.hideStatus(oven);
            return;
        }

        if (this._isOverviewMode()) {
            this._hideStatusForOverview(oven);
            return;
        }

        let ui = oven.statusUI;
        const shouldPop = !ui || ui.hiddenForOverview || ui.container?.visible === false;
        if (!ui) {
            const container = this.scene.add.container(0, 0)
                .setDepth(UIDEPTH + 1)
                .setScrollFactor(0)
                .setAlpha(0)
                .setScale(0.82);

            const title = this.scene.add.text(0, -6, '', {
                ...BUILDING_PANEL_TEXT_STYLES.compact,
                fontSize: '10px',
                color: state.textColor,
                align: 'center',
                stroke: '#04111a',
                strokeThickness: 5,
            }).setOrigin(0.5);
            const detail = this.scene.add.text(0, 8, '', {
                ...BUILDING_PANEL_TEXT_STYLES.compactBody,
                fontSize: '8px',
                color: state.detailColor,
                align: 'center',
                stroke: '#04111a',
                strokeThickness: 4,
            }).setOrigin(0.5);

            container.add([title, detail]);

            const updatePosition = () => {
                if (!oven?.sprite?.active) return;
                const cam = this.scene.cameras.main;
                const bounds = oven.sprite.getBounds?.();
                const centerX = bounds?.centerX ?? oven.sprite.x;
                const topY = bounds?.top ?? (oven.sprite.y - ((oven.sprite.displayHeight || 0) * 0.5));
                const bodyOffset = bounds
                    ? Math.max(18, Math.min(bounds.height * 0.38, 32))
                    : 22;
                container.setPosition(
                    centerX - cam.scrollX,
                    topY + bodyOffset - cam.scrollY
                );
            };

            updatePosition();
            this.scene.events.on('update', updatePosition);
            ui = { container, title, detail, updatePosition, tween: null, state: null };
            oven.statusUI = ui;
        }

        ui.title.setText(state.title).setColor(state.textColor);
        ui.detail.setText(state.detail).setColor(state.detailColor);
        ui.state = state.key;
        ui.updatePosition?.();
        this._showStatusWithPop(oven, state, shouldPop);
    }

    static hideStatus(oven) {
        if (!oven?.statusUI) return;
        const { container, updatePosition, tween } = oven.statusUI;
        tween?.remove();
        container?._overlayPopTween?.remove?.();
        if (updatePosition) this.scene?.events?.off('update', updatePosition);
        container?.destroy?.();
        oven.statusUI = null;
    }

    // === Minor UI (hover) ===
    static showMinor(oven, opts = {}) {
        if (!oven) return;
        if (this._isOverviewMode()) return;
        if (oven.minorUI) {
            if (!oven.minorUI.root?.active || !oven.minorUI.status?.active) {
                this.hideMinor(oven, { animate: false });
            } else {
                oven.minorUI.hiddenForOverview = false;
                oven.minorUIUpdater?.();
                animateOverlayPop(this.scene, oven.minorUI.root, true, {
                    duration: Math.max(0, Number(opts.duration ?? 140) || 0),
                });
                return;
            }
        }

        const panel = createBuildingHoverPanel(this.scene, {
            width: 128,
            height: 44,
            depth: UIDEPTH,
            scrollFactor: 0,
            accentColor: 0xf0b86a,
        });
        panel.setAlpha(0).setScale(0.82);

        const status = this.scene.add.text(0, 0, '', {
            ...BUILDING_PANEL_TEXT_STYLES.compactBody,
            align: 'center',
        }).setOrigin(0.5).setLineSpacing(2);

        panel.add(status);
        oven.minorUI = { root: panel, status, hiddenForOverview: false };

        const updateMinorPosition = () => {
            if (
                oven.minorUI?.root !== panel ||
                !panel?.active ||
                !status?.active ||
                !oven.sprite?.active ||
                !this.scene?.sys?.isActive?.()
            ) {
                this._offSceneUpdate(updateMinorPosition);
                if (oven.minorUI?.root === panel) oven.minorUI = null;
                if (oven.minorUIUpdater === updateMinorPosition) oven.minorUIUpdater = null;
                return;
            }

            const worldX = oven.sprite.x;
            const worldY = oven.sprite.y - 40;

            // Convert world to screen space
            const cam = this.scene.cameras.main;
            const screenX = worldX - cam.scrollX;
            const screenY = worldY - cam.scrollY;

            panel.setPosition(screenX, screenY);
            const slotCount = oven.cookingSlots?.length || 1;
            const nextText = `Fuel: ${oven.fuel || 0}\nBurner: ${oven.cookingSlots?.filter(x => x).length || 0}/${slotCount}`;
            if (status.text !== nextText) status.setText(nextText);
        };

        oven.minorUIUpdater = updateMinorPosition;
        oven.minorUI.updatePosition = updateMinorPosition;
        this.scene.events.on('update', updateMinorPosition);
        updateMinorPosition();
        animateOverlayPop(this.scene, panel, true, {
            duration: Math.max(0, Number(opts.duration ?? 140) || 0),
        });
    }

    static hideMinor(oven, opts = {}) {
        if (!oven) return;
        if (oven.minorUI) {
            const ui = oven.minorUI;
            const root = ui.root;
            const destroy = () => {
                if (oven.minorUI !== ui) return;
                const updatePosition = ui.updatePosition || oven.minorUIUpdater;
                this._offSceneUpdate(updatePosition);
                if (oven.minorUIUpdater === updatePosition) oven.minorUIUpdater = null;

                root?._overlayPopTween?.remove?.();
                root?.destroy?.();
                oven.minorUI = null;
            };

            if (opts.animate === false || !root?.visible) {
                destroy();
            } else {
                animateOverlayPop(this.scene, root, false, {
                    duration: Math.max(0, Number(opts.duration ?? 120) || 0),
                    onComplete: destroy,
                });
            }
        }
    }

    // ClayOvenUI.js (partial)
    static toggleMajor(oven) {
        if (this.openUIs.has(oven)) {
            this.closeMajor(oven);
            return;
        }

        const cam = this.scene.cameras.main;
        const camX = cam.centerX;
        const camY = cam.centerY;

        const container = this.scene.add.container(0, 0).setDepth(UIDEPTH).setScrollFactor(0);

        const slotCount = oven.cookingSlots?.length || 1;
        const bg = this.scene.add.rectangle(camX, camY, 400, Math.max(160, 120 + slotCount * 44), 0x222222, 0.95)
            .setStrokeStyle(2, 0xffffff)
            .setScrollFactor(0);
        container.add(bg);

        const title = this.scene.add.text(camX, camY - 90, 'Clay Oven', {
            fontSize: '16px',
            fontFamily: 'Bungee',
            fill: '#ffffff'
        }).setOrigin(0.5).setScrollFactor(0);
        container.add(title);

        // === Cooking + Output Slots ===
        const slotStartY = camY - 40;
        const cookX = camX - 120;
        const outputX = camX - 40;
        const slotSpacingY = 50;

        oven.uiElements = [];

        for (let i = 0; i < slotCount; i++) {
            const y = slotStartY + i * slotSpacingY;

            // === COOKING SLOT ===
            const cookSlot = oven.cookingSlots[i];
            const cookIconKey = UI_ITEM_TYPES[cookSlot?.item.name || 'empty']?.icon || 'blank';

            const cookIcon = this.scene.add.image(cookX, y, cookIconKey)
                .setDisplaySize(24, 24).setScrollFactor(0);
            container.add(cookIcon);

            // Cooking amount text
            const cookLabel = this.scene.add.text(cookX + 10, y + 10, '', {
                fontSize: '12px',
                fill: '#ffffff',
                stroke: '#000000',
                strokeThickness: 2,
                fontFamily: 'Bungee'
            }).setOrigin(1, 1).setScrollFactor(0).setVisible(false);
            container.add(cookLabel);

            // === Cooking Progress Bar ===
            const progressBg = this.scene.add.rectangle(cookX, y + 16, 28, 5, 0x000000)
                .setOrigin(0.5).setScrollFactor(0);
            const progressFill = this.scene.add.rectangle(cookX, y + 16, 24, 5, 0x00ff00)
                .setOrigin(0.5).setScrollFactor(0);

            container.add(progressBg);
            container.add(progressFill);

            // === OUTPUT SLOT ===
            const outSlot = oven.outputSlots[i];
            const outIconKey = UI_ITEM_TYPES[outSlot?.item.name || 'empty']?.icon || 'blank';

            const outIcon = this.scene.add.image(outputX, y, outIconKey)
                .setDisplaySize(24, 24).setScrollFactor(0);
            container.add(outIcon);

            // Output amount text
            const outLabel = this.scene.add.text(outputX + 10, y + 10, '', {
                fontSize: '12px',
                fill: '#ffffff',
                stroke: '#000000',
                strokeThickness: 2,
                fontFamily: 'Bungee'
            }).setOrigin(1, 1).setScrollFactor(0).setVisible(false);
            container.add(outLabel);

            // === Save references for dynamic updates ===
            oven.uiElements[i] = {
                cookIcon,
                outIcon,
                progressFill,
                cookLabel,
                outLabel
            };
        }

        // === Fuel Info + Add Wood Button ===
        const fuelX = camX + 100;

        const fuelText = this.scene.add.text(fuelX, camY - 30, `Fuel: ${oven.fuel}`, {
            fontSize: '12px',
            fontFamily: 'Bungee',
            fill: '#ffffff'
        }).setOrigin(0.5).setScrollFactor(0);

        const addWoodBtn = this.scene.add.rectangle(fuelX, camY + 10, 80, 20, 0x22cc22)
            .setScrollFactor(0)
            .setInteractive({ useHandCursor: true });
        const addWoodText = this.scene.add.text(fuelX, camY + 10, 'Add Wood', {
            fontSize: '12px',
            fontFamily: 'Bungee',
            fill: '#000000'
        }).setOrigin(0.5).setScrollFactor(0);

        addWoodBtn.on('pointerdown', () => {
            oven.fuel += 1;
            fuelText.setText(`Fuel: ${oven.fuel}`);
        });

        container.add([fuelText, addWoodBtn, addWoodText]);

        // === Close Button ===
        const closeBtn = this.scene.add.text(camX + 180, camY - 90, 'X', {
            fontSize: '12px',
            fill: '#ff4444'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setScrollFactor(0);

        closeBtn.on('pointerdown', () => this.closeMajor(oven));
        container.add(closeBtn);

        // === Save UI handle ===
        this.openUIs.set(oven, container);
    }

    static closeMajor(oven) {
        const container = this.openUIs.get(oven);
        if (container) {
            this._offSceneUpdate(container._uiUpdate);
            container.destroy();
            this.openUIs.delete(oven);
        }

        // 🔥 Properly clean up all UI elements, including labels
        if (oven.uiElements) {
            oven.uiElements.forEach(el => {
                el?.cookIcon?.destroy();
                el?.outIcon?.destroy();
                el?.progressFill?.destroy();
                el?.cookLabel?.destroy();
                el?.outLabel?.destroy();
            });
            oven.uiElements = null;
        }
    }

}
