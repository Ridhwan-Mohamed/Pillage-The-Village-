import { UIDEPTH, showAlert } from "../constants";
import { Player } from "../players/Player";
import { OrderRunner } from "../orders/OrderRunner";

const BUTTON_STYLES = {
  details: { fill: 0x14532d, text: "#86efac", glow: 0xbbf7d0 },
  return: { fill: 0x0f766e, text: "#5eead4", glow: 0xa7f3d0 },
  cancel: { fill: 0x9f1239, text: "#fb7185", glow: 0xfda4af },
  confirm: { fill: 0x166534, text: "#bbf7d0", glow: 0xdcfce7 },
  destroy: { fill: 0x991b1b, text: "#fca5a5", glow: 0xfecaca },
  neutral: { fill: 0x334155, text: "#e2e8f0", glow: 0xf8fafc },
  auto: { fill: 0x1d4ed8, text: "#93c5fd", glow: 0xbfdbfe },
  sleep: { fill: 0x4338ca, text: "#c7d2fe", glow: 0xc4b5fd },
  berry: { fill: 0x6d28d9, text: "#e9d5ff", glow: 0xf5d0fe },
  sell: { fill: 0x92400e, text: "#fcd34d", glow: 0xfde68a },
  wood: { fill: 0x166534, text: "#86efac", glow: 0xbbf7d0 },
  stone: { fill: 0x475569, text: "#cbd5e1", glow: 0xe2e8f0 },
  seed: { fill: 0x92400e, text: "#fde68a", glow: 0xfef3c7 },
  berryGather: { fill: 0x7c3aed, text: "#e9d5ff", glow: 0xf5d0fe },
  workSelected: { fill: 0x92400e, text: "#fbbf24", glow: 0xfde68a },
  makeWater: { fill: 0x0f4c81, text: "#93c5fd", glow: 0xbfdbfe },
  attackFort: { fill: 0x991b1b, text: "#fca5a5", glow: 0xfecaca },
  hold: { fill: 0x5b21b6, text: "#ddd6fe", glow: 0xe9d5ff },
};

export class SelectionCommandBar {
  constructor(scene) {
    this.scene = scene;
    this.isVisible = false;
    this.appearingTween = null;
    this.disappearingTween = null;
    this.dismissedSelectionSignature = null;
    this.lastSelectionSignature = "";
    this.currentSelectionTroops = [];
    this.currentSelectionProfile = null;
    this.externalContext = null;
    this.contextButtons = {};
    this.pendingSellConfirmation = null;

    this.container = scene.add.container(0, 0)
      .setDepth(UIDEPTH + 2)
      .setVisible(false)
      .setAlpha(0)
      .setScale(0.96);

    this.helperBg = scene.add.graphics().setScrollFactor(0);
    this.helperText = scene.add.text(0, 0, "", {
      fontSize: "12px",
      fontStyle: "bold",
      color: "#f8fafc",
      stroke: "#000000",
      strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0);

    this.container.add([this.helperBg, this.helperText]);

    this.buttons = {
      close: this._makeButton("close", "CLOSE", (snapshot) => {
        const troops = snapshot?.troops?.length ? snapshot.troops : this._getCommandTroops();
        this._dismissForCurrentSelection(troops);
      }, { styleKey: "neutral" }),
      details: this._makeButton("details", "DETAILS", (snapshot) => {
        const troop = this._getActionTroops(snapshot)?.[0];
        if (!troop?.active) return;
        this.scene.openDetailPage?.("players", tab => tab.select?.(troop));
        this._dismissForCurrentSelection(snapshot?.troops);
      }),
      return: this._makeButton("return", "RETURN", (snapshot) => {
        const ok = OrderRunner.sendTroopsToTown(this._getActionTroops(snapshot));
        if (ok) this._dismissForCurrentSelection(snapshot?.troops);
      }),
      cancel: this._makeButton("cancel", "CANCEL", (snapshot) => {
        const ok = OrderRunner.cancelOrders(this._getActionTroops(snapshot));
        if (ok) this._dismissForCurrentSelection(snapshot?.troops);
      }),
      auto: this._makeButton("auto", "AUTO", (snapshot) => {
        const ok = OrderRunner.resumeAuto(this._getActionTroops(snapshot));
        if (ok) this._dismissForCurrentSelection(snapshot?.troops);
      }),
      sleep: this._makeButton("sleep", "WAKE", (snapshot) => {
        const result = OrderRunner.toggleSleepTroops(this._getActionTroops(snapshot));
        if (!result.ok) {
          showAlert(this.scene, "No selected troops could change sleep state", "#fecaca");
          return;
        }
        this._dismissForCurrentSelection(snapshot?.troops);
        if (result.mode === "wake") {
          showAlert(this.scene, `Woke ${result.changed} troop${result.changed === 1 ? "" : "s"}`, "#a7f3d0");
        } else if (result.failed > 0) {
          showAlert(this.scene, `Sent ${result.changed} home, ${result.failed} could not sleep`, "#fde68a");
        } else {
          showAlert(this.scene, `Sent ${result.changed} troop${result.changed === 1 ? "" : "s"} home`, "#a7f3d0");
        }
      }),
      berry: this._makeButton("berry", "x0", (snapshot) => {
        const troops = this._getActionTroops(snapshot);
        const profile = this._getActionProfile(snapshot, troops);
        const required = profile.count || 0;
        const available = Number(this.scene?.berries ?? 0);
        if (!required) return;
        if (available < required) {
          showAlert(this.scene, `Need ${required} berries for ${required} selected troop${required === 1 ? "" : "s"}`, "#fecaca");
          return;
        }

        const result = OrderRunner.disperseBerries(troops, this.scene);
        if (!result.ok) {
          showAlert(this.scene, `Need ${required} berries for ${required} selected troop${required === 1 ? "" : "s"}`, "#fecaca");
          return;
        }

        showAlert(this.scene, `Distributed ${result.fed} berr${result.fed === 1 ? "y" : "ies"} (+${result.healAmount} HP, +${result.staminaAmount} STA)`, "#e9d5ff");
      }, { iconKey: "berry" }),
      sell: this._makeButton("sell", "CASH OUT", (snapshot) => {
        this._openSellConfirmation(snapshot);
      }),
      wood: this._makeButton("wood", "GATHER WOOD", (snapshot) => {
        this._issueGatherCommand(snapshot, "wood", "Selected foragers will prioritize wood", "#a7f3d0");
      }),
      stone: this._makeButton("stone", "GATHER STONE", (snapshot) => {
        this._issueGatherCommand(snapshot, "stone", "Selected foragers will prioritize stone", "#bfdbfe");
      }),
      seed: this._makeButton("seed", "GATHER SEEDS", (snapshot) => {
        this._issueGatherCommand(snapshot, "seed", "Selected foragers will gather seeds from the field", "#fde68a");
      }),
      berryGather: this._makeButton("berryGather", "GATHER BERRIES", (snapshot) => {
        this._issueGatherCommand(snapshot, "berry", "Selected foragers will gather berries from the field", "#e9d5ff");
      }),
      workSelected: this._makeButton("workSelected", "WORK SELECTED", (snapshot) => {
        const ok = OrderRunner.issueWorkQueuedOrder(this._getActionTroops(snapshot));
        if (!ok) {
          showAlert(this.scene, "No queued resource nodes to lock onto", "#ff9999");
        } else {
          this._dismissForCurrentSelection(snapshot?.troops);
          showAlert(this.scene, "Assigned selected foragers to queued resource targets", "#a7f3d0");
        }
      }),
      makeWater: this._makeButton("makeWater", "MAKE WATER", (snapshot) => {
        const ok = OrderRunner.issueMakeWaterOrder(this._getActionTroops(snapshot));
        if (!ok) {
          showAlert(this.scene, "Select only firemen to use this", "#fecaca");
          return;
        }
        this._dismissForCurrentSelection(snapshot?.troops);
        showAlert(this.scene, "Selected firemen will keep oven water and fuel balanced", "#93c5fd");
      }),
      attackFort: this._makeButton("attackFort", "ATTACK FORT", (snapshot) => {
        const ok = OrderRunner.issueAttackFortOrder(this._getActionTroops(snapshot));
        if (ok) this._dismissForCurrentSelection(snapshot?.troops);
        showAlert(this.scene, ok ? "Selected fighters are pushing the north fort" : "No active fort towers to attack", ok ? "#fca5a5" : "#fecaca");
      }),
      hold: this._makeButton("hold", "HOLD", (snapshot) => {
        const ok = OrderRunner.issueHoldOrder(this._getActionTroops(snapshot));
        if (ok) this._dismissForCurrentSelection(snapshot?.troops);
        showAlert(this.scene, ok ? "Selected shooters are holding position" : "Select only shooters to use this", ok ? "#ddd6fe" : "#fecaca");
      }),
    };

    Object.values(this.buttons).forEach(btn => this.container.add(btn.root));
  }

  destroy() {
    this.appearingTween?.remove();
    this.disappearingTween?.remove();
    this.container?.destroy(true);
    this.container = null;
  }

  update() {
    const tutorial = this.scene.worldScene?.tutorialManager || this.scene.tutorialManager || null;
    if (tutorial?.isActive?.()) {
      this._closeSellConfirmation();
      this._hide();
      return;
    }

    if (this.externalContext?.source === "sell-confirm") {
      const pendingTroops = (this.pendingSellConfirmation?.troops || []).filter((troop) => troop?.active);
      if (!pendingTroops.length) {
        this._closeSellConfirmation();
      }
    }

    if (this.externalContext) {
      this._updateExternalContext();
      return;
    }

    const profile = OrderRunner.getSelectionProfile(Player.selected);
    this.currentSelectionProfile = profile;
    this.currentSelectionTroops = [...profile.troops];
    const selectionSignature = this._getSelectionSignature(profile.troops);

    if (selectionSignature !== this.lastSelectionSignature) {
      this.lastSelectionSignature = selectionSignature;
      if (selectionSignature !== this.dismissedSelectionSignature) {
        this.dismissedSelectionSignature = null;
      }
    }

    if (!profile.hasSelection) {
      this.dismissedSelectionSignature = null;
      this._hide();
      return;
    }

    if (this.dismissedSelectionSignature && this.dismissedSelectionSignature === selectionSignature) {
      this._hide();
      return;
    }

    this._show();

    const layoutKeys = ["close"];
    if (profile.count === 1) {
      layoutKeys.push("details");
    }
    layoutKeys.push("return", "sleep", "berry", "sell");
    this._setDynamicLabels(profile);

    const gap = 6;
    const visibleButtons = layoutKeys.map(key => this.buttons[key]);
    let totalWidth = 0;
    visibleButtons.forEach((btn, idx) => {
      totalWidth += btn.width;
      if (idx < visibleButtons.length - 1) totalWidth += gap;
    });

    this._positionContainer();

    const helper = `${profile.count} SELECTED`;
    this.helperText.setText(helper);
    this.helperText.setPosition(0, -38);
    this._drawHelperBg();

    let x = -totalWidth / 2;
    Object.entries(this.buttons).forEach(([key, btn]) => {
      const shouldShow = layoutKeys.includes(key);
      btn.root.setVisible(shouldShow);
      btn.hit.setActive(shouldShow).setVisible(shouldShow);
      if (!shouldShow) return;

      btn.root.setPosition(x + btn.width / 2, 0);
      x += btn.width + gap;

      const active = this._isButtonActive(key, profile);
      const disabled = this._isButtonDisabled(key, profile);
      this._drawButton(btn, active, disabled);
    });
  }

  _show() {
    if (this.isVisible) return;
    this.isVisible = true;
    this.disappearingTween?.remove();
    this.container.setVisible(true);
    this.appearingTween?.remove();
    this.appearingTween = this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 170,
      ease: "Quad.easeOut",
    });
  }

  _hide() {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.appearingTween?.remove();
    this.disappearingTween?.remove();
    this.disappearingTween = this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      scaleX: 0.96,
      scaleY: 0.96,
      duration: 120,
      ease: "Quad.easeOut",
      onComplete: () => {
        if (!this.isVisible) this.container.setVisible(false);
      },
    });
  }

  _drawHelperBg() {
    const padX = 16;
    const w = this.helperText.width + padX * 2;
    const h = 24;
    const x = -w / 2;
    const y = -50;

    this.helperBg.clear();
    this.helperBg.fillStyle(0x111827, 0.26);
    this.helperBg.fillRoundedRect(x, y, w, h, 10);
    this.helperBg.fillStyle(0xffffff, 0.10);
    this.helperBg.fillRoundedRect(x + 2, y + 2, w - 4, Math.max(8, h * 0.38), 8);
    this.helperBg.lineStyle(2, 0xffffff, 0.22);
    this.helperBg.strokeRoundedRect(x, y, w, h, 10);
  }

  setContext(source, config = null) {
    if (!source) return;
    if (!config) {
      this.clearContext(source);
      return;
    }
    this.externalContext = {
      source,
      ...config,
    };
  }

  clearContext(source = null) {
    if (source && this.externalContext?.source !== source) return;
    this.externalContext = null;
    Object.values(this.contextButtons).forEach((btn) => {
      btn.root.setVisible(false);
      btn.hit.setActive(false).setVisible(false);
    });
  }

  _getContextValue(value) {
    return typeof value === "function" ? value() : value;
  }

  _getOrCreateContextButton(def) {
    const key = `ctx:${def.id}`;
    if (this.contextButtons[key]) return this.contextButtons[key];
    const btn = this._makeButton(
      key,
      def.label || "",
      (snapshot) => def.onClick?.(snapshot),
      { styleKey: def.styleKey || "neutral" }
    );
    this.contextButtons[key] = btn;
    this.container.add(btn.root);
    return btn;
  }

  _updateExternalContext() {
    const context = this.externalContext;
    if (!context) return;

    const buttons = (this._getContextValue(context.buttons) || [])
      .map((def) => ({
        ...def,
        label: this._getContextValue(def.label),
        disabled: !!this._getContextValue(def.disabled),
        active: !!this._getContextValue(def.active),
      }))
      .filter((def) => def && def.id && def.label);

    const helper = String(this._getContextValue(context.helperText) || "").trim();

    this._show();
    this._positionContainer();

    this.helperText.setText(helper);
    this.helperText.setPosition(0, -38);
    this._drawHelperBg();

    Object.values(this.buttons).forEach((btn) => {
      btn.root.setVisible(false);
      btn.hit.setActive(false).setVisible(false);
    });

    const gap = 6;
    const visibleButtons = buttons.map((def) => {
      const btn = this._getOrCreateContextButton(def);
      btn.styleKey = def.styleKey || btn.styleKey || "neutral";
      this._setButtonLabel(btn, def.label);
      return { def, btn };
    });

    let totalWidth = 0;
    visibleButtons.forEach(({ btn }, idx) => {
      totalWidth += btn.width;
      if (idx < visibleButtons.length - 1) totalWidth += gap;
    });

    let x = -totalWidth / 2;
    visibleButtons.forEach(({ def, btn }) => {
      btn.root.setVisible(true);
      btn.hit.setActive(true).setVisible(true);
      btn.root.setPosition(x + btn.width / 2, 0);
      btn._contextOnClick = def.onClick;
      btn._contextDisabled = def.disabled;
      this._drawButton(btn, def.active, def.disabled);
      x += btn.width + gap;
    });

    Object.values(this.contextButtons).forEach((btn) => {
      if (visibleButtons.some((entry) => entry.btn === btn)) return;
      btn.root.setVisible(false);
      btn.hit.setActive(false).setVisible(false);
    });
  }

  _positionContainer() {
    const bar = this.scene.uiBottomBar;
    const progress = bar ? (bar.openProgress ?? (bar.expanded ? 1 : 0)) : 0;
    const collapsedOffset = 80;
    const expandedOffset = 348;
    const centerY = this.scene.scale.height - Phaser.Math.Linear(collapsedOffset, expandedOffset, progress);
    this.container.setPosition(this.scene.scale.width / 2, centerY);
  }

  _makeButton(key, label, onClick, opts = {}) {
    const root = this.scene.add.container(0, 0).setScrollFactor(0);
    const bg = this.scene.add.graphics().setScrollFactor(0);
    const icon = opts.iconKey
      ? this.scene.add.image(0, 0, opts.iconKey).setScrollFactor(0).setDisplaySize(18, 18)
      : null;
    const text = this.scene.add.text(0, 0, label, {
      fontSize: "12px",
      fontStyle: "bold",
      color: BUTTON_STYLES[key]?.text || "#ffffff",
      stroke: "#000000",
      strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0);
    text.setShadow(0, 1, "#000000", 3, false, true);

    const width = Math.max(92, Math.ceil(text.width) + 26);
    const height = 30;
    const hit = this.scene.add.zone(0, 0, width, height)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    const btn = {
      key,
      label,
      root,
      bg,
      icon,
      text,
      hit,
      width,
      height,
      styleKey: opts.styleKey || key,
      hovered: false,
      pressed: false,
      disabled: false,
      active: false,
    };

    hit.on("pointerover", (_pointer, _localX, _localY, event) => {
      event?.stopPropagation?.();
      btn.hovered = true;
      this._drawButton(btn, btn.active, btn.disabled);
    });
    hit.on("pointerout", (_pointer, event) => {
      event?.stopPropagation?.();
      btn.hovered = false;
      btn.pressed = false;
      btn.selectionSnapshotTroops = null;
      btn.selectionSnapshotProfile = null;
      this._drawButton(btn, btn.active, btn.disabled);
    });
    hit.on("pointerdown", (_pointer, _localX, _localY, event) => {
      event?.stopPropagation?.();
      btn.pressed = true;
      btn.selectionSnapshotTroops = this._getCommandTroops();
      btn.selectionSnapshotProfile = this.currentSelectionProfile
        ? { ...this.currentSelectionProfile, troops: [...this.currentSelectionProfile.troops] }
        : null;
      this._drawButton(btn, btn.active, btn.disabled);
    });
    hit.on("pointerup", (_pointer, _localX, _localY, event) => {
      event?.stopPropagation?.();
      btn.pressed = false;
      this._drawButton(btn, btn.active, btn.disabled);
      const handler = btn._contextOnClick || onClick;
      if (btn._contextDisabled) return;
      handler?.({
        troops: btn.selectionSnapshotTroops || [],
        profile: btn.selectionSnapshotProfile,
      });
      btn.selectionSnapshotTroops = null;
      btn.selectionSnapshotProfile = null;
    });

    root.add([bg]);
    if (icon) root.add(icon);
    root.add([text, hit]);
    this._layoutButtonContent(btn);
    this._drawButton(btn, false, false);
    return btn;
  }

  _drawButton(btn, active, disabled = false) {
    const style = BUTTON_STYLES[btn.styleKey || btn.key] || BUTTON_STYLES.neutral;
    const glowColor = style.glow;
    btn.active = active;
    btn.disabled = disabled;
    const fillAlpha = disabled
      ? 0.12
      : active ? 0.40 : btn.pressed ? 0.34 : btn.hovered ? 0.29 : 0.22;
    const strokeAlpha = disabled
      ? 0.18
      : active ? 0.62 : btn.hovered ? 0.46 : 0.28;
    const x = -btn.width / 2;
    const y = -btn.height / 2;

    btn.bg.clear();
    btn.bg.fillStyle(style.fill, fillAlpha);
    btn.bg.fillRoundedRect(x, y, btn.width, btn.height, 10);
    btn.bg.lineStyle(2, 0xffffff, strokeAlpha);
    btn.bg.strokeRoundedRect(x, y, btn.width, btn.height, 10);
    btn.bg.lineStyle(1, glowColor, disabled ? 0.16 : active ? 0.72 : 0.42);
    btn.bg.strokeRoundedRect(x + 1, y + 1, btn.width - 2, btn.height - 2, 9);

    btn.text.setColor(style.text);
    btn.text.setAlpha(disabled ? 0.45 : 1);
    btn.icon?.setAlpha(disabled ? 0.45 : 1);
    btn.root.setScale(disabled ? 1 : btn.pressed ? 0.985 : btn.hovered ? 1.015 : 1);
  }

  _isButtonActive(key, profile) {
    if (key === "wood" || key === "stone" || key === "seed" || key === "berryGather") {
      if (!profile.allForagers) return false;
      const resourceType = this._gatherButtonResourceType(key);
      return profile.troops.length > 0 && profile.troops.every(troop =>
        troop?.currentOrder?.kind === "gather_type" &&
        troop.currentOrder?.resourceType === resourceType
      );
    }

    if (key === "makeWater") {
      return profile.allFiremen && profile.troops.length > 0 && profile.troops.every(troop =>
        troop?.currentOrder?.kind === "make_water"
      );
    }

    return false;
  }

  _isButtonDisabled(key, profile) {
    if (key === "berry") {
      const required = profile.count || 0;
      const available = Number(this.scene?.berries ?? 0);
      return required <= 0 || available < required;
    }
    if (key === "wood") {
      return !OrderRunner.isGatherCommandAvailable("wood", this.scene);
    }
    if (key === "stone") {
      return !OrderRunner.isGatherCommandAvailable("stone", this.scene);
    }
    if (key === "seed") {
      return !OrderRunner.isGatherCommandAvailable("seed", this.scene);
    }
    if (key === "berryGather") {
      return !OrderRunner.isGatherCommandAvailable("berry", this.scene);
    }
    return false;
  }

  _setDynamicLabels(profile) {
    const sleepLabel = profile.allSleepingLike ? "WAKE" : "SLEEP";
    this._setButtonLabel(this.buttons.sleep, sleepLabel);
    this._setButtonLabel(this.buttons.berry, `x${profile.count || 0}`);
    this._setButtonLabel(this.buttons.sell, `💰 $${profile.sellValue || 0}`);
  }

  _setButtonLabel(btn, label) {
    if (!btn || btn.label === label) return;
    btn.label = label;
    btn.text.setText(label);
    this._layoutButtonContent(btn);
  }

  _layoutButtonContent(btn) {
    if (!btn) return;

    const iconWidth = btn.icon ? 18 : 0;
    const iconGap = btn.icon ? 6 : 0;
    const minWidth = btn.icon ? 82 : 92;
    btn.width = Math.max(minWidth, Math.ceil(btn.text.width) + 26 + iconWidth + iconGap);
    btn.hit.setSize(btn.width, btn.height);

    if (!btn.icon) {
      btn.text.setPosition(0, 0);
      return;
    }

    const contentWidth = iconWidth + iconGap + btn.text.width;
    const startX = -contentWidth / 2;
    btn.icon.setPosition(startX + iconWidth / 2, 0);
    btn.text.setPosition(startX + iconWidth + iconGap + btn.text.width / 2, 0);
  }

  _getSelectionSignature(troops = []) {
    if (!troops?.length) return "";
    return troops
      .filter(troop => troop?.active)
      .map(troop => troop.id)
      .sort((a, b) => a - b)
      .join("|");
  }

  _getCommandTroops() {
    return (this.currentSelectionTroops || []).filter(troop => troop?.active);
  }

  _getActionTroops(snapshot) {
    const troops = snapshot?.troops?.length ? snapshot.troops : this._getCommandTroops();
    return (troops || []).filter(troop => troop?.active);
  }

  _getActionProfile(snapshot, troops = this._getActionTroops(snapshot)) {
    return OrderRunner.getSelectionProfile(troops);
  }

  _dismissForCurrentSelection(troops = this._getCommandTroops()) {
    this.dismissedSelectionSignature = this._getSelectionSignature(troops);
    this.appearingTween?.remove();
    this.disappearingTween?.remove();
    this.isVisible = false;
    this.container?.setAlpha(0)?.setVisible(false)?.setScale(0.96);
  }

  _gatherButtonResourceType(key) {
    if (key === "berryGather") return "berry";
    return key;
  }

  _issueGatherCommand(snapshot, resourceType, successMessage, color) {
    const troops = this._getActionTroops(snapshot);
    if (!OrderRunner.hasActiveGatherParcel(resourceType, this.scene) || !OrderRunner.hasGatherableNodes(resourceType)) {
      showAlert(this.scene, OrderRunner.getGatherUnavailableMessage(resourceType, this.scene), "#fecaca");
      return;
    }

    const ok = OrderRunner.issueGatherTypeOrder(troops, resourceType, this.scene);
    if (!ok) {
      showAlert(this.scene, "Select only foragers to use this", "#fecaca");
      return;
    }

    this._dismissForCurrentSelection(snapshot?.troops);
    showAlert(this.scene, successMessage, color);
  }

  _openSellConfirmation(snapshot) {
    const troops = this._getActionTroops(snapshot);
    const profile = this._getActionProfile(snapshot, troops);
    if (!troops.length || !(profile?.count > 0)) return;

    this.pendingSellConfirmation = {
      troops: [...troops],
      profile: profile ? { ...profile, troops: [...troops] } : null,
    };

    this.setContext("sell-confirm", {
      helperText: () => {
        const liveTroops = (this.pendingSellConfirmation?.troops || []).filter((troop) => troop?.active);
        const liveProfile = this._getActionProfile(
          this.pendingSellConfirmation,
          liveTroops
        );
        return `SELL ${liveProfile?.count || 0} FOR $${liveProfile?.sellValue || 0}?`;
      },
      buttons: () => [
        {
          id: "sell-cancel",
          label: "CANCEL",
          styleKey: "cancel",
          onClick: () => this._closeSellConfirmation(),
        },
        {
          id: "sell-confirm",
          label: "CONFIRM SELL",
          styleKey: "sell",
          onClick: () => this._confirmSellTroops(),
        },
      ],
    });
  }

  _closeSellConfirmation() {
    this.pendingSellConfirmation = null;
    this.clearContext("sell-confirm");
  }

  _confirmSellTroops() {
    const pending = this.pendingSellConfirmation;
    const troops = (pending?.troops || []).filter((troop) => troop?.active);
    if (!troops.length) {
      this._closeSellConfirmation();
      return;
    }

    const result = OrderRunner.sellTroops(troops, this.scene, {
      sourceUiTarget: this.buttons.sell?.root ?? null,
    });

    this._closeSellConfirmation();
    if (!result.ok) {
      return;
    }

    this._dismissForCurrentSelection(pending?.troops);
    showAlert(this.scene, `Sold ${result.sold} troop${result.sold === 1 ? "" : "s"} for $${result.money}`, "#fcd34d");
  }
}
