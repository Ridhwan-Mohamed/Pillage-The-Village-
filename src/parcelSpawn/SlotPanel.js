import { showAlert } from "../constants.js";
import { formatPermitCostText, getContractPermitCost } from "../permitSystem.js";
import { getContractMoneyCost } from "../balance/GameBalance.js";
import { PRESSURE } from "../parcel_system/ParcelConfig.js";
import { hasDemoCompleted, hasStoreUnlock, STORE_UNLOCK_KEYS } from "../parcel_system/StoreUnlockSystem.js";
import {
  getSlotFavorBannerText,
  getSlotFavorConfig,
  getSlotFavorShortLabel,
} from "../parcel_system/SlotFavorSystem.js";
import { getMilitiaTierConfig, getMilitiaTierLayout } from "../parcel_system/MilitiaTierConfig.js";

export class SlotPanel {
  constructor(scene, cfg) {
    this.scene = scene;
    this.id = cfg.id;
    this.W = cfg.W;
    this.H = cfg.H;

    this.container = scene.add.container(cfg.x, cfg.y);
    this.container.setScrollFactor(1);
    this.container.setDepth(9000);

    this._state = "GRID";
    this._pressureMode = false;
    this._pressureText = null;
    this._overviewStatusPrimary = null;
    this._overviewStatusSecondary = null;
    this._overviewFavorBg = null;
    this._overviewCards = [];
    this._overviewPressureCards = [];
    this._overviewPressureObjects = [];
    this._overviewMilitiaCards = [];
    this._overviewMilitiaObjects = [];
    this._overviewMenu = "GRID"; // GRID | PRESSURE | MILITIA
    this.mode = "detailed";
    this._detailHovered = false;

    this._buildFrame();
    this._buildDetailedProxy();
    this.gridObjects = [];
    this._buildOverviewGrid();
    this.setMode("detailed");
    this._lastMilitiaAccess = this._canAccessMilitia();
    this._onTownXpChanged = () => this.refreshMilitiaLockState();
    this._onStoreUnlockChanged = () => this.refreshMilitiaLockState();

    this.scene?.events?.on?.("townxp:changed", this._onTownXpChanged);
    this.scene?.events?.on?.("store:unlock-changed", this._onStoreUnlockChanged);
  }

  _buildFrame() {
    this.frameG = this.scene.add.graphics();
    this.frameG.setScrollFactor(1);
    this.container.add(this.frameG);
    this._drawFrameTheme(false);

    this.header = this.scene.add.text(0, -this.H/2, this._titleForSlot(), {
      fontFamily: "Bungee",
      fontSize: "14px",
      color: "#ffffff"
    }).setOrigin(0.5, 0);
    this.header.setScrollFactor(1);
    this.container.add(this.header);
  }

  _buildDetailedProxy() {
    this.detailProxyGlow = this.scene.add.rectangle(0, 0, 144, 56, 0x9ee6ff, 0.10)
      .setOrigin(0.5)
      .setScrollFactor(1)
      .setVisible(false);
    this.detailProxyBadge = this.scene.add.rectangle(0, 0, 128, 42, 0x113048, 0.88)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0xb7ecff, 0.46)
      .setScrollFactor(1)
      .setVisible(false);
    this.detailProxyLabel = this.scene.add.text(0, 0, this._directionLabel(), {
      fontFamily: "Bungee",
      fontSize: "18px",
      color: "#e9f7ff",
      stroke: "#04101a",
      strokeThickness: 4,
      align: "center",
    }).setOrigin(0.5).setScrollFactor(1).setVisible(false);
    this.detailProxyLabel.setInteractive({ useHandCursor: true });
    this.detailHitZone = this.scene.add.zone(0, 0, this.W, this.H)
      .setOrigin(0.5)
      .setScrollFactor(1)
      .setInteractive({ useHandCursor: false });

    this.detailHitZone.on("pointerover", (_pointer, _localX, _localY, event) => {
      if (this.mode === "overview" || !this.container.visible) return;
      event?.stopPropagation?.();
      this._setDetailedProxyHovered(true);
      this.scene?.uiScene?.contractHud?.setExternalHover?.(this.id, true);
    });
    this.detailHitZone.on("pointerout", (_pointer, event) => {
      if (this.mode === "overview") return;
      event?.stopPropagation?.();
      this._setDetailedProxyHovered(false);
      this.scene?.uiScene?.contractHud?.setExternalHover?.(this.id, false);
    });
    this.detailProxyLabel.on("pointerover", (_pointer, _localX, _localY, event) => {
      if (this.mode === "overview" || !this.container.visible) return;
      event?.stopPropagation?.();
      this._setDetailedProxyHovered(true);
    });
    this.detailProxyLabel.on("pointerout", (_pointer, event) => {
      if (this.mode === "overview") return;
      event?.stopPropagation?.();
      this._setDetailedProxyHovered(false);
    });
    this.detailProxyLabel.on("pointerdown", (_pointer, _localX, _localY, event) => {
      if (this.mode === "overview" || !this.container.visible) return;
      event?.stopPropagation?.();
      this._setDetailedProxyHovered(true);
    });
    this.detailProxyLabel.on("pointerup", (_pointer, _localX, _localY, event) => {
      if (this.mode === "overview" || !this.container.visible) return;
      event?.stopPropagation?.();
      this._handleDetailedProxyClick();
    });

    this.container.add([this.detailProxyGlow, this.detailProxyBadge, this.detailProxyLabel, this.detailHitZone]);
  }

  _drawFrameTheme(pressureMode) {
    if (!this.frameG) return;
    const g = this.frameG;
    g.clear();

    if (pressureMode) {
      g.lineStyle(3, 0xff4d4d, 0.9);
      g.strokeRoundedRect(-this.W / 2, -this.H / 2, this.W, this.H, 16);
      g.fillStyle(0x3a0000, 0.38);
      g.fillRoundedRect(-this.W / 2 + 4, -this.H / 2 + 4, this.W - 8, this.H - 8, 14);
      return;
    }

    const theme = this._getSlotFavorTheme();
    g.lineStyle(3, theme.stroke, 0.58);
    g.strokeRoundedRect(-this.W / 2, -this.H / 2, this.W, this.H, 16);
    g.fillStyle(theme.fill, theme.fillAlpha);
    g.fillRoundedRect(-this.W / 2 + 4, -this.H / 2 + 4, this.W - 8, this.H - 8, 14);
  }

  _titleForSlot() {
    if (this.id === "N") return "Contract (North)";
    if (this.id === "W") return "Contract (West)";
    if (this.id === "E") return "Contract (East)";
    if (this.id === "S") return "Contract (South)";
    return "Contract";
  }

  _directionLabel() {
    if (this.id === "N") return "NORTH";
    if (this.id === "W") return "WEST";
    if (this.id === "E") return "EAST";
    if (this.id === "S") return "SOUTH";
    return "CONTRACT";
  }

  _hasActiveContract() {
    const slotToContractId = this.scene?.parcelManager?.slotToContractId;
    return !!slotToContractId?.[this.id];
  }

  _getSlotFavor() {
    return this.scene?.parcelManager?.getSlotFavor?.(this.id) ?? null;
  }

  _getPurchaseContext(type, difficulty = 1) {
    const pm = this.scene?.parcelManager;
    if (!pm?.getContractPurchaseContext) {
      return {
        favor: null,
        moneyCost: getContractMoneyCost(this.scene, type, difficulty),
      };
    }
    return pm.getContractPurchaseContext(this.id, type, difficulty);
  }

  _getSlotFavorTheme() {
    const config = getSlotFavorConfig(this._getSlotFavor());
    if (config?.kind === "discount") {
      return {
        stroke: 0xf87171,
        fill: 0x341318,
        fillAlpha: 0.22,
        badgeFill: 0x48151c,
        badgeStroke: 0xfca5a5,
        glow: 0xffb4b4,
        priceColor: "#ffb4b4",
        favorColor: "#ffc3c3",
      };
    }
    if (config?.kind === "extended") {
      return {
        stroke: 0x60a5fa,
        fill: 0x0f2748,
        fillAlpha: 0.20,
        badgeFill: 0x15365f,
        badgeStroke: 0x93c5fd,
        glow: 0x9ed0ff,
        priceColor: "#dcebff",
        favorColor: "#dcebff",
      };
    }
    if (config?.kind === "completion") {
      return {
        stroke: 0xfbbf24,
        fill: 0x3b2c12,
        fillAlpha: 0.20,
        badgeFill: 0x493611,
        badgeStroke: 0xfcd34d,
        glow: 0xffdd89,
        priceColor: "#fff0c4",
        favorColor: "#fff0c4",
      };
    }
    return {
      stroke: 0xffffff,
      fill: 0x0b1020,
      fillAlpha: 0.10,
      badgeFill: 0x113048,
      badgeStroke: 0xb7ecff,
      glow: 0x9ee6ff,
      priceColor: "#ffffff",
      favorColor: "#dff7ff",
    };
  }

  _getOverviewFavorBannerText() {
    const favor = this._getSlotFavor();
    const config = getSlotFavorConfig(favor);
    if (!config) return "";
    if (config.kind === "discount") return "50% OFF";
    if (config.kind === "extended") return "+30s LONGER";
    if (config.kind === "completion") return "BONUS PAY";
    return String(config.title || "").toUpperCase();
  }

  _setDetailedProxyHovered(hovered) {
    this._detailHovered = !!hovered;
    this._refreshDetailedProxyVisual();
  }

  _refreshDetailedProxyVisual() {
    const hasActiveContract = this._hasActiveContract();
    const isDetailed = this.mode !== "overview";
    const visible = this.container.visible && !hasActiveContract && isDetailed;
    const isPressure = !!this._pressureMode;
    const hovered = !!this._detailHovered;
    const favorTheme = this._getSlotFavorTheme();

    this.header?.setVisible(false);
    if (!isPressure) this._drawFrameTheme(false);
    this.frameG?.setVisible(this.container.visible && !hasActiveContract);
    this.detailProxyGlow?.setVisible(visible);
    this.detailProxyBadge?.setVisible(visible);
    this.detailProxyLabel?.setVisible(visible);
    if (this.detailProxyLabel?.input) {
      this.detailProxyLabel.input.enabled = visible && isDetailed;
    }
    if (this.detailHitZone?.input) {
      this.detailHitZone.input.enabled = visible && isDetailed;
    }

    if (!visible) {
      this.frameG?.setAlpha?.(1);
      return;
    }

    const frameAlpha = hovered ? 0.42 : isPressure ? 0.34 : 0.22;
    this.frameG?.setAlpha?.(frameAlpha);
    this.detailProxyLabel?.setText?.(this._directionLabel());

    const badgeFill = isPressure ? 0x4e1717 : hovered ? 0x173e57 : favorTheme.badgeFill;
    const badgeStroke = isPressure ? 0xffb0b0 : favorTheme.badgeStroke;
    const badgeStrokeAlpha = hovered ? 0.82 : 0.46;
    const badgeScale = hovered ? 1.06 : 1;
    const glowAlpha = hovered ? (isPressure ? 0.20 : 0.18) : (isPressure ? 0.14 : 0.08);

    this.scene.tweens.killTweensOf([this.detailProxyGlow, this.detailProxyBadge, this.detailProxyLabel]);
    this.detailProxyBadge?.setFillStyle?.(badgeFill, hovered ? 0.96 : 0.88);
    this.detailProxyBadge?.setStrokeStyle?.(hovered ? 3 : 2, badgeStroke, badgeStrokeAlpha);
    this.detailProxyGlow?.setFillStyle?.(isPressure ? 0xffb0b0 : favorTheme.glow, glowAlpha);
    this.detailProxyLabel?.setColor?.(hovered ? "#ffffff" : "#e9f7ff");

    this.scene.tweens.add({
      targets: [this.detailProxyGlow, this.detailProxyBadge, this.detailProxyLabel].filter(Boolean),
      scaleX: badgeScale,
      scaleY: badgeScale,
      duration: 120,
      ease: "Sine.easeOut",
    });
  }

  _handleDetailedProxyClick() {
    if (this.mode === "overview") return;
    this.scene?.uiScene?.contractHud?.focusSlot?.(this.id);
  }

  _buildGrid() {
    this.gridObjects = [];
  }

  _getOverviewDefs() {
    const defs = [
      { type: "FOREST", emoji: "🌲", cost: () => getContractPermitCost("FOREST", 1, this.scene) },
      { type: "ROCK", emoji: "🪨", cost: () => getContractPermitCost("ROCK", 1, this.scene) },
      { type: "PRESSURE", emoji: "⚔️", difficulty: 1, cost: () => getContractPermitCost("PRESSURE", 1, this.scene) },
      { type: "MARKET", emoji: "🏪", cost: () => getContractPermitCost("MARKET", 1, this.scene) },
      { type: "FARM", emoji: "🌾", cost: () => getContractPermitCost("FARM", 1, this.scene) },
    ];

    if (this._canAccessMilitia()) {
      defs.push({ type: "MILITIA", emoji: "🛡" });
    } else {
      defs.push({
        type: "LOCKED_MILITIA",
        emoji: "🔒",
        label: "Level 3",
        locked: true,
        cost: () => 0,
      });
    }

    return defs;
  }

  _buildOverviewGrid() {
    const pad = 10;
    const innerW = this.W - pad * 2;
    const innerH = this.H - pad * 2;
    const cellW = Math.floor(innerW / 2) - 10;
    const cellH = Math.floor((innerH - 16) / 3) - 6;
    const startY = -innerH / 2 + cellH / 2 + 4;
    const defs = this._getOverviewDefs();

    this.overviewGridObjects = [];
    this._overviewCards = [];

    for (let i = 0; i < defs.length; i++) {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const x = -innerW / 2 + cellW / 2 + col * (cellW + 12);
      const y = startY + row * (cellH + 10);
      const def = defs[i];

      const bg = this.scene.add.rectangle(x, y, cellW, cellH, 0xffffff, 0.08)
        .setStrokeStyle(2, 0xffffff, 0.28)
        .setScrollFactor(1)
        .setInteractive({ useHandCursor: true });

      const titleText = def.locked ? (def.label || "Locked") : def.type;
      const emojiText = def.emoji || "";

      const emoji = this.scene.add.text(x, y - 26, emojiText, {
        fontSize: "84px",
        stroke: "#001018",
        strokeThickness: 8,
      }).setOrigin(0.5).setScrollFactor(1);

      const cost = this.scene.add.text(x, y + 46, "", {
        fontFamily: "Bungee",
        fontSize: "32px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 8,
        align: "center",
      }).setOrigin(0.5).setScrollFactor(1);

      const payload = def.type === "PRESSURE"
        ? { type: "PRESSURE", difficulty: def.difficulty ?? 1 }
        : { type: def.type };

      bg.on("pointerover", () => bg.setFillStyle(0xffffff, 0.16));
      bg.on("pointerout", () => bg.setFillStyle(0xffffff, 0.08));
      bg.on("pointerdown", () => bg.setFillStyle(0xffffff, 0.22));
      bg.on("pointerup", () => {
        const isLocked = !!def.locked;
        if (isLocked) {
          this._showMilitiaLockedMessage();
          return;
        }
        bg.setFillStyle(0xffffff, 0.16);
        if (this.mode !== "overview" || this._pressureMode) return;
        if (def.type === "PRESSURE") {
          this._openOverviewPressureMenu();
          return;
        }
        if (def.type === "MILITIA") {
          this._openOverviewMilitiaMenu();
          return;
        }
        this.commit(payload);
      });

      this.container.add([bg, emoji, cost]);
      this.overviewGridObjects.push(bg, emoji, cost);
      this._overviewCards.push({ def, costText: cost });
    }

    this._overviewStatusPrimary = this.scene.add.text(0, -48, "", {
      fontFamily: "Bungee",
      fontSize: "100px",
      color: "#ffffff",
      stroke: "#001018",
      strokeThickness: 12,
      align: "center",
    }).setOrigin(0.5).setScrollFactor(1).setVisible(false);

    this._overviewStatusSecondary = this.scene.add.text(0, 112, "", {
      fontFamily: "Bungee",
      fontSize: "36px",
      color: "#d6f5ff",
      stroke: "#001018",
      strokeThickness: 10,
      align: "center",
      lineSpacing: 12,
      wordWrap: { width: this.W - 36 },
    }).setOrigin(0.5).setScrollFactor(1).setVisible(false);

    const favorY = this.id === "S" ? (this.H / 2 + 20) : (-this.H / 2 - 58);
    this._overviewFavorBg = this.scene.add.rectangle(0, favorY + 24, Math.min(this.W - 48, 286), 72, 0x06111d, 0.94)
      .setStrokeStyle(3, this._getSlotFavorTheme().stroke, 0.72)
      .setScrollFactor(1)
      .setVisible(false);

    this._overviewFavorLabel = this.scene.add.text(0, favorY, "", {
      fontFamily: "Bungee",
      fontSize: "36px",
      color: "#dff7ff",
      stroke: "#001018",
      strokeThickness: 10,
      align: "center",
      wordWrap: { width: Math.min(this.W - 72, 260) },
      lineSpacing: 5,
    }).setOrigin(0.5, 0).setScrollFactor(1).setVisible(false);

    this.container.add([this._overviewStatusPrimary, this._overviewStatusSecondary, this._overviewFavorBg, this._overviewFavorLabel]);
    this._buildOverviewPressureMenu(cellW, cellH, innerW, innerH);
    this._buildOverviewMilitiaMenu(cellW, cellH, innerW, innerH);
    this._refreshOverviewGridCosts();
    this._refreshOverviewPressureCosts();
    this._refreshOverviewMilitiaCosts();
    this._refreshOverviewFavorLabel();
  }

  refreshMilitiaLockState() {
    const nextMilitiaAccess = this._canAccessMilitia();
    if (nextMilitiaAccess === this._lastMilitiaAccess) return;

    this._lastMilitiaAccess = nextMilitiaAccess;
    this._rebuildGrid();
    this._rebuildOverviewGrid();
  }

  _rebuildGrid() {
    this.gridObjects?.forEach((o) => {
      try { o.destroy?.(); } catch {}
    });
    this.gridObjects = [];
    this._buildGrid();

    if (this.mode === "overview" || this._pressureMode) {
      this.gridObjects?.forEach((o) => o.setVisible(false));
    }
  }

  _hideAllOverviewObjects({ includeStatus = true } = {}) {
    this.overviewGridObjects?.forEach((o) => o.setVisible(false));
    this._overviewPressureObjects?.forEach((o) => o.setVisible(false));
    this._overviewMilitiaObjects?.forEach((o) => o.setVisible(false));
    this._overviewFavorBg?.setVisible(false);
    this._overviewFavorLabel?.setVisible(false);
    if (includeStatus) {
      this._overviewStatusPrimary?.setVisible(false);
      this._overviewStatusSecondary?.setVisible(false);
    }
  }

  _rebuildOverviewGrid() {
    this.overviewGridObjects?.forEach((o) => {
      try { o.destroy?.(); } catch {}
    });
    this.overviewGridObjects = [];
    this._overviewCards = [];
    this._overviewPressureObjects?.forEach((o) => {
      try { o.destroy?.(); } catch {}
    });
    this._overviewPressureObjects = [];
    this._overviewPressureCards = [];
    this._overviewMilitiaObjects?.forEach((o) => {
      try { o.destroy?.(); } catch {}
    });
    this._overviewMilitiaObjects = [];
    this._overviewMilitiaCards = [];
    this._overviewStatusPrimary?.destroy?.();
    this._overviewStatusSecondary?.destroy?.();
    this._overviewFavorBg?.destroy?.();
    this._overviewFavorLabel?.destroy?.();
    this._overviewStatusPrimary = null;
    this._overviewStatusSecondary = null;
    this._overviewFavorBg = null;
    this._overviewFavorLabel = null;
    this._buildOverviewGrid();
    this._applyModeVisibilityState();
  }

  _refreshOverviewGridCosts() {
    const canBuy = this._canBuyContracts();
    const favorTheme = this._getSlotFavorTheme();
    const isSale = this._getSlotFavor()?.kind === "discount";
    for (const card of this._overviewCards) {
      if (!canBuy) {
        card.costText.setColor("#ffffff");
        card.costText.setText("LOCK\nDAY");
        continue;
      }
      if (card.def.type === "PRESSURE") {
        card.costText.setColor("#ffffff");
        card.costText.setText("PICK\nLEVEL");
        continue;
      }
      if (card.def.type === "MILITIA") {
        card.costText.setColor("#ffffff");
        card.costText.setText("PICK\nTIER");
        continue;
      }
      const permitCost = Number(card.def.cost?.() ?? 0);
      const purchase = this._getPurchaseContext(card.def.type, card.def.difficulty ?? 1);
      const moneyCost = Math.max(0, Number(purchase?.moneyCost ?? getContractMoneyCost(this.scene, card.def.type, card.def.difficulty ?? 1)));
      card.costText.setColor(isSale ? "#ffb4b4" : favorTheme.priceColor);
      card.costText.setText(`${formatPermitCostText(permitCost)}\n$${moneyCost}`);
    }
    this._refreshOverviewFavorLabel();
  }

  _getOverviewChoiceLayout(innerW, innerH) {
    const gap = 12;
    const cardW = Math.floor((innerW - gap) / 2);
    const cardH = Math.floor((innerH - gap) / 2);
    const leftX = -(cardW / 2) - (gap / 2);
    const rightX = (cardW / 2) + (gap / 2);
    const topY = -(cardH / 2) - (gap / 2);
    const bottomY = (cardH / 2) + (gap / 2);

    return {
      cardW,
      cardH,
      positions: [
        { x: leftX, y: topY },
        { x: rightX, y: topY },
        { x: leftX, y: bottomY },
        { x: rightX, y: bottomY },
      ],
    };
  }

  _getOverviewChoiceFontSizes(cardH) {
    return {
      title: Math.max(30, Math.min(54, Math.floor(cardH * 0.19))),
      info: Math.max(20, Math.min(30, Math.floor(cardH * 0.105))),
      cost: Math.max(26, Math.min(42, Math.floor(cardH * 0.15))),
      close: Math.max(56, Math.min(96, Math.floor(cardH * 0.30))),
      closeLabel: Math.max(24, Math.min(42, Math.floor(cardH * 0.14))),
    };
  }

  _fitOverviewText(text, maxWidth, maxHeight, preferredSize, minSize = 14) {
    if (!text) return;
    const start = Math.max(minSize, Math.floor(Number(preferredSize) || minSize));
    for (let size = start; size >= minSize; size--) {
      text.setFontSize(`${size}px`);
      if ((text.width || 0) <= maxWidth && (text.height || 0) <= maxHeight) return;
    }
    text.setFontSize(`${minSize}px`);
  }

  _buildOverviewPressureMenu(cellW, cellH, innerW, innerH) {
    const { cardW, cardH, positions } = this._getOverviewChoiceLayout(innerW, innerH);
    const sizes = this._getOverviewChoiceFontSizes(cardH);
    const defs = [1, 2, 3].map((difficulty, index) => ({
      difficulty,
      ...positions[index],
    }));

    this._overviewPressureCards = [];
    this._overviewPressureObjects = [];

    for (const def of defs) {
      const spawners = Math.max(1, Math.min(PRESSURE.maxDifficulty ?? 3, def.difficulty));
      const enemies = spawners * (PRESSURE.baseEnemiesPerSpawner ?? 3);
      const bg = this.scene.add.rectangle(def.x, def.y, cardW, cardH, 0xffffff, 0.08)
        .setStrokeStyle(2, 0xffffff, 0.28)
        .setScrollFactor(1)
        .setInteractive({ useHandCursor: true })
        .setVisible(false);

      const title = this.scene.add.text(def.x, def.y - cardH * 0.33, `RAID ${def.difficulty}`, {
        fontFamily: "Bungee",
        fontSize: `${sizes.title}px`,
        color: "#fff1f1",
        stroke: "#001018",
        strokeThickness: 8,
        align: "center",
        wordWrap: { width: cardW - 24 },
      }).setOrigin(0.5).setScrollFactor(1).setVisible(false);

      const info = this.scene.add.text(def.x, def.y - cardH * 0.02, [
        `${spawners} SPAWNER${spawners === 1 ? "" : "S"}`,
        `${enemies} ENEMIES`,
        "MONEY + XP",
      ].join("\n"), {
        fontFamily: "Bungee",
        fontSize: `${sizes.info}px`,
        color: "#ffd6d6",
        stroke: "#001018",
        strokeThickness: 6,
        align: "center",
        lineSpacing: 7,
        wordWrap: { width: cardW - 24 },
      }).setOrigin(0.5).setScrollFactor(1).setVisible(false);

      const cost = this.scene.add.text(def.x, def.y + cardH * 0.34, "", {
        fontFamily: "Bungee",
        fontSize: `${sizes.cost}px`,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 8,
        align: "center",
        lineSpacing: 4,
        wordWrap: { width: cardW - 24 },
      }).setOrigin(0.5).setScrollFactor(1).setVisible(false);

      this._fitOverviewText(title, cardW - 24, cardH * 0.22, sizes.title, 18);
      this._fitOverviewText(info, cardW - 24, cardH * 0.38, sizes.info, 14);

      bg.on("pointerover", () => bg.setFillStyle(0xffffff, 0.16));
      bg.on("pointerout", () => bg.setFillStyle(0xffffff, 0.08));
      bg.on("pointerdown", () => bg.setFillStyle(0xffffff, 0.22));
      bg.on("pointerup", () => {
        bg.setFillStyle(0xffffff, 0.16);
        if (this.mode !== "overview" || this._pressureMode || this._overviewMenu !== "PRESSURE") return;
        this.commit({ type: "PRESSURE", difficulty: def.difficulty });
      });

      this.container.add([bg, title, info, cost]);
      this._overviewPressureObjects.push(bg, title, info, cost);
      this._overviewPressureCards.push({ def, costText: cost, cardW, cardH, costSize: sizes.cost });
    }

    const close = positions[3];
    const closeBg = this.scene.add.rectangle(close.x, close.y, cardW, cardH, 0x3a0000, 0.78)
      .setStrokeStyle(3, 0xffa5a5, 0.72)
      .setScrollFactor(1)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    const closeText = this.scene.add.text(close.x, close.y - cardH * 0.06, "\u274c", {
      fontSize: `${sizes.close}px`,
      stroke: "#3a0000",
      strokeThickness: 10,
    }).setOrigin(0.5).setScrollFactor(1).setVisible(false);
    const closeLabel = this.scene.add.text(close.x, close.y + cardH * 0.29, "EXIT", {
      fontFamily: "Bungee",
      fontSize: `${sizes.closeLabel}px`,
      color: "#ffe2e2",
      stroke: "#000000",
      strokeThickness: 8,
      align: "center",
      wordWrap: { width: cardW - 24 },
    }).setOrigin(0.5).setScrollFactor(1).setVisible(false);
    this._fitOverviewText(closeLabel, cardW - 24, cardH * 0.18, sizes.closeLabel, 16);
    closeBg.on("pointerover", () => closeBg.setFillStyle(0x581c24, 0.96));
    closeBg.on("pointerout", () => closeBg.setFillStyle(0x3a0000, 0.78));
    closeBg.on("pointerup", () => this._closeOverviewDetailMenu());
    this.container.add([closeBg, closeText, closeLabel]);
    this._overviewPressureObjects.push(closeBg, closeText, closeLabel);
  }

  _refreshOverviewPressureCosts() {
    const canBuy = this._canBuyContracts();
    const favorTheme = this._getSlotFavorTheme();
    const isSale = this._getSlotFavor()?.kind === "discount";
    for (const card of this._overviewPressureCards) {
      if (!card?.costText || card.def?.close) continue;
      if (!canBuy) {
        card.costText.setColor("#ffffff");
        card.costText.setText("LOCKED");
        this._fitOverviewText(card.costText, card.cardW - 24, card.cardH * 0.26, card.costSize, 18);
        continue;
      }
      const permitCost = Number(getContractPermitCost("PRESSURE", card.def.difficulty, this.scene) ?? 0);
      const purchase = this._getPurchaseContext("PRESSURE", card.def.difficulty);
      const moneyCost = Math.max(0, Number(purchase?.moneyCost ?? getContractMoneyCost(this.scene, "PRESSURE", card.def.difficulty)));
      card.costText.setColor(isSale ? "#ffb4b4" : favorTheme.priceColor);
      card.costText.setText(`${formatPermitCostText(permitCost)}\n$${moneyCost}`);
      this._fitOverviewText(card.costText, card.cardW - 24, card.cardH * 0.28, card.costSize, 18);
    }
  }

  _buildOverviewMilitiaMenu(cellW, cellH, innerW, innerH) {
    const { cardW, cardH, positions } = this._getOverviewChoiceLayout(innerW, innerH);
    const sizes = this._getOverviewChoiceFontSizes(cardH);
    const defs = [1, 2, 3].map((difficulty, index) => ({
      difficulty,
      ...positions[index],
    }));

    this._overviewMilitiaCards = [];
    this._overviewMilitiaObjects = [];

    for (const def of defs) {
      const tier = getMilitiaTierConfig(def.difficulty);
      const summary = String(tier.summary || "")
        .toUpperCase()
        .split("+")
        .map((part) => part.trim())
        .filter(Boolean)
        .join("\n");
      const bg = this.scene.add.rectangle(def.x, def.y, cardW, cardH, 0xffffff, 0.08)
        .setStrokeStyle(2, 0xffffff, 0.28)
        .setScrollFactor(1)
        .setInteractive({ useHandCursor: true })
        .setVisible(false);

      const title = this.scene.add.text(def.x, def.y - cardH * 0.33, `TIER ${def.difficulty}`, {
        fontFamily: "Bungee",
        fontSize: `${sizes.title}px`,
        color: "#eef7ff",
        stroke: "#001018",
        strokeThickness: 8,
        align: "center",
        wordWrap: { width: cardW - 24 },
      }).setOrigin(0.5).setScrollFactor(1).setVisible(false);

      const info = this.scene.add.text(def.x, def.y - cardH * 0.02, `${summary}\n1 DAY DEFENSE`, {
        fontFamily: "Bungee",
        fontSize: `${sizes.info}px`,
        color: "#d6f5ff",
        stroke: "#001018",
        strokeThickness: 6,
        align: "center",
        lineSpacing: 7,
        wordWrap: { width: cardW - 24 },
      }).setOrigin(0.5).setScrollFactor(1).setVisible(false);

      const cost = this.scene.add.text(def.x, def.y + cardH * 0.34, "", {
        fontFamily: "Bungee",
        fontSize: `${sizes.cost}px`,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 8,
        align: "center",
        lineSpacing: 4,
        wordWrap: { width: cardW - 24 },
      }).setOrigin(0.5).setScrollFactor(1).setVisible(false);

      this._fitOverviewText(title, cardW - 24, cardH * 0.22, sizes.title, 18);
      this._fitOverviewText(info, cardW - 24, cardH * 0.42, sizes.info, 14);

      bg.on("pointerover", () => bg.setFillStyle(0xffffff, 0.16));
      bg.on("pointerout", () => bg.setFillStyle(0xffffff, 0.08));
      bg.on("pointerdown", () => bg.setFillStyle(0xffffff, 0.22));
      bg.on("pointerup", () => {
        bg.setFillStyle(0xffffff, 0.16);
        if (this.mode !== "overview" || this._pressureMode || this._overviewMenu !== "MILITIA") return;
        this.commit({
          type: "MILITIA",
          difficulty: def.difficulty,
          militiaConfig: {
            tier: def.difficulty,
            layout: getMilitiaTierLayout(def.difficulty),
          },
        });
      });

      this.container.add([bg, title, info, cost]);
      this._overviewMilitiaObjects.push(bg, title, info, cost);
      this._overviewMilitiaCards.push({ def, costText: cost, cardW, cardH, costSize: sizes.cost });
    }

    const close = positions[3];
    const closeBg = this.scene.add.rectangle(close.x, close.y, cardW, cardH, 0x3a0000, 0.78)
      .setStrokeStyle(3, 0xffa5a5, 0.72)
      .setScrollFactor(1)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    const closeText = this.scene.add.text(close.x, close.y - cardH * 0.06, "\u274c", {
      fontSize: `${sizes.close}px`,
      stroke: "#3a0000",
      strokeThickness: 10,
    }).setOrigin(0.5).setScrollFactor(1).setVisible(false);
    const closeLabel = this.scene.add.text(close.x, close.y + cardH * 0.29, "EXIT", {
      fontFamily: "Bungee",
      fontSize: `${sizes.closeLabel}px`,
      color: "#ffe2e2",
      stroke: "#000000",
      strokeThickness: 8,
      align: "center",
      wordWrap: { width: cardW - 24 },
    }).setOrigin(0.5).setScrollFactor(1).setVisible(false);
    this._fitOverviewText(closeLabel, cardW - 24, cardH * 0.18, sizes.closeLabel, 16);
    closeBg.on("pointerover", () => closeBg.setFillStyle(0x581c24, 0.96));
    closeBg.on("pointerout", () => closeBg.setFillStyle(0x3a0000, 0.78));
    closeBg.on("pointerup", () => this._closeOverviewDetailMenu());
    this.container.add([closeBg, closeText, closeLabel]);
    this._overviewMilitiaObjects.push(closeBg, closeText, closeLabel);
  }

  _refreshOverviewMilitiaCosts() {
    const canBuy = this._canBuyContracts();
    const favorTheme = this._getSlotFavorTheme();
    const isSale = this._getSlotFavor()?.kind === "discount";
    for (const card of this._overviewMilitiaCards) {
      if (!card?.costText || card.def?.close) continue;
      if (!canBuy) {
        card.costText.setColor("#ffffff");
        card.costText.setText("LOCKED");
        this._fitOverviewText(card.costText, card.cardW - 24, card.cardH * 0.26, card.costSize, 18);
        continue;
      }
      const permitCost = Number(getContractPermitCost("MILITIA", card.def.difficulty, this.scene) ?? 0);
      const purchase = this._getPurchaseContext("MILITIA", card.def.difficulty);
      const moneyCost = Math.max(0, Number(purchase?.moneyCost ?? getContractMoneyCost(this.scene, "MILITIA", card.def.difficulty)));
      card.costText.setColor(isSale ? "#ffb4b4" : favorTheme.priceColor);
      card.costText.setText(`${formatPermitCostText(permitCost)}\n$${moneyCost}`);
      this._fitOverviewText(card.costText, card.cardW - 24, card.cardH * 0.28, card.costSize, 18);
    }
  }

  _refreshOverviewFavorLabel() {
    if (!this._overviewFavorLabel) return;
    const favor = this._getSlotFavor();
    const banner = getSlotFavorBannerText(favor);
    if (!banner) {
      this._overviewFavorLabel.setText("");
      this._overviewFavorLabel.setVisible(false);
      this._overviewFavorBg?.setVisible(false);
      return;
    }
    const theme = this._getSlotFavorTheme();
    this._overviewFavorLabel.setColor(theme.favorColor);
    this._overviewFavorLabel.setText(this._getOverviewFavorBannerText());
    this._overviewFavorBg?.setStrokeStyle?.(3, theme.stroke, 0.72);
  }

  _syncOverviewFavorVisibility(showGrid = false) {
    const hasActiveContract = this._hasActiveContract();
    const showingStatus = !!(
      this._overviewStatusPrimary?.visible ||
      this._overviewStatusSecondary?.visible
    );
    const showFavor = showGrid
      && !hasActiveContract
      && !showingStatus
      && !this._pressureMode
      && !!this._getSlotFavor();
    this._overviewFavorBg?.setVisible(showFavor);
    this._overviewFavorLabel?.setVisible(showFavor);
  }

  _getTownLevel() {
    return Math.max(1, Number(this.scene?.getTownXpSnapshot?.()?.level || 1));
  }

  _isMilitiaUnlocked() {
    return hasStoreUnlock(STORE_UNLOCK_KEYS.militiaParcel);
  }

  _canAccessMilitia() {
    return this._isMilitiaUnlocked() && (this._getTownLevel() >= 3 || hasDemoCompleted());
  }

  _getMilitiaLockedLabel() {
    return "🔒 Lv 3";
  }

  _showMilitiaLockedMessage() {
    showAlert(this.scene, "🔒 Unlocks at Town XP Level 3", "#ffe08a");
  }

  _openOverviewPressureMenu() {
    if (!this._canBuyContracts()) {
      this._showParcelLockedMessage();
      return;
    }
    this._overviewMenu = "PRESSURE";
    this._hideOverviewStatus();
    this._refreshOverviewPressureCosts();
    this._syncOverviewVisibility();
  }

  _openOverviewMilitiaMenu() {
    if (!this._canBuyContracts()) {
      this._showParcelLockedMessage();
      return;
    }
    if (!this._canAccessMilitia()) {
      this._showMilitiaLockedMessage();
      return;
    }
    this._overviewMenu = "MILITIA";
    this._hideOverviewStatus();
    this._refreshOverviewMilitiaCosts();
    this._syncOverviewVisibility();
  }

  _closeOverviewDetailMenu() {
    this._overviewMenu = "GRID";
    this._hideOverviewStatus();
    this._syncOverviewVisibility();
  }

  _syncOverviewVisibility() {
    const hasActiveContract = this._hasActiveContract();
    const showingStatus = !!(
      this._overviewStatusPrimary?.visible ||
      this._overviewStatusSecondary?.visible
    );
    const showGrid =
      this.mode === "overview" &&
      !this._pressureMode &&
      !hasActiveContract &&
      !showingStatus &&
      this._overviewMenu === "GRID";
    const showPressureMenu =
      this.mode === "overview" &&
      !this._pressureMode &&
      !hasActiveContract &&
      !showingStatus &&
      this._overviewMenu === "PRESSURE";
    const showMilitiaMenu =
      this.mode === "overview" &&
      !this._pressureMode &&
      !hasActiveContract &&
      !showingStatus &&
      this._overviewMenu === "MILITIA";

    this.overviewGridObjects?.forEach(o => o.setVisible(showGrid));
    this._overviewPressureObjects?.forEach(o => o.setVisible(showPressureMenu));
    this._overviewMilitiaObjects?.forEach(o => o.setVisible(showMilitiaMenu));
    this._syncOverviewFavorVisibility(showGrid);
  }

  _showOverviewStatus(primary, secondary) {
    this._overviewStatusPrimary?.setText(primary ?? "");
    this._overviewStatusSecondary?.setText(secondary ?? "");
    this._overviewStatusPrimary?.setVisible(true);
    this._overviewStatusSecondary?.setVisible(true);
    this._hideAllOverviewObjects({ includeStatus: false });
  }

  _hideOverviewStatus() {
    this._overviewStatusPrimary?.setVisible(false);
    this._overviewStatusSecondary?.setVisible(false);
    this._syncOverviewFavorVisibility(this.mode === "overview" && this._overviewMenu === "GRID");
  }

  _applyModeVisibilityState() {
    const hasActiveContract = this._hasActiveContract();
    if (!hasActiveContract && !this._pressureMode) {
      this._drawFrameTheme(false);
    }

    if (hasActiveContract) {
      this.frameG?.setVisible(false);
      this.gridObjects?.forEach(o => o.setVisible(false));
      this._hideAllOverviewObjects();
      this._hideOverviewStatus();
      this._pressureText?.setVisible(false);
      this._refreshDetailedProxyVisual();
      return;
    }

    if (this.mode !== "overview") {
      this.frameG?.setVisible(this.container.visible);
      this._hideAllOverviewObjects();
      this._hideOverviewStatus();
      this._pressureText?.setVisible(false);
      this.gridObjects?.forEach(o => o.setVisible(false));
      this._refreshDetailedProxyVisual();
      return;
    }

    if (this._pressureMode) {
      this.frameG?.setVisible(this.container.visible);
      this.gridObjects?.forEach(o => o.setVisible(false));
      this._hideAllOverviewObjects({ includeStatus: false });
      return;
    }

    this.frameG?.setVisible(this.container.visible);
    this.gridObjects?.forEach(o => o.setVisible(false));
    this._syncOverviewVisibility();
  }

  setMode(mode) {
    this.mode = mode === "overview" ? "overview" : "detailed";
    const isOverview = this.mode === "overview";
    const hasActiveContract = this._hasActiveContract();
    if (!isOverview) this._overviewMenu = "GRID";
    if (isOverview) {
      this.detailProxyGlow?.setVisible(false);
      this.detailProxyBadge?.setVisible(false);
      this.detailProxyLabel?.setVisible(false);
    }

    this.header?.setVisible(false);
    this._refreshOverviewGridCosts();
    this._refreshOverviewPressureCosts();
    this._refreshOverviewMilitiaCosts();

    if (this._pressureMode) {
      this.gridObjects?.forEach(o => o.setVisible(false));

      if (isOverview) {
        this._pressureText?.setVisible(false);
        this._overviewStatusPrimary?.setVisible(true);
        this._overviewStatusSecondary?.setVisible(true);
        this._overviewPressureObjects?.forEach(o => o.setVisible(false));
        this._overviewMilitiaObjects?.forEach(o => o.setVisible(false));
        this._overviewFavorLabel?.setVisible(false);
      } else {
        this._hideOverviewStatus();
        this.overviewGridObjects?.forEach(o => o.setVisible(false));
        this._overviewPressureObjects?.forEach(o => o.setVisible(false));
        this._overviewMilitiaObjects?.forEach(o => o.setVisible(false));
        this._pressureText?.setVisible(false);
      }
      this._refreshDetailedProxyVisual();
      return;
    }

    this._pressureText?.setVisible(false);
    this._hideOverviewStatus();

    if (isOverview && hasActiveContract) {
      this.overviewGridObjects?.forEach(o => o.setVisible(false));
      this._overviewPressureObjects?.forEach(o => o.setVisible(false));
      this._overviewMilitiaObjects?.forEach(o => o.setVisible(false));
    }

    this._applyModeVisibilityState();
  }

  back() {
    if (this.mode === "overview") {
      this.gridObjects.forEach(o => o.setVisible(false));
      this._syncOverviewVisibility();
    } else {
      this.gridObjects.forEach(o => o.setVisible(false));
    }
    this._state = "GRID";
    this._applyModeVisibilityState();
  }

  resetToGrid() {
    this.clearPressureState();
    this.back();
  }

  resetUiState() {
    this._closeOverviewDetailMenu();
    this._hideOverviewStatus();
    this._state = "GRID";
    this._refreshOverviewGridCosts();
    this._refreshOverviewPressureCosts();
    this._refreshOverviewMilitiaCosts();
    if (!this._pressureMode) {
      if (this.mode === "overview") this._syncOverviewVisibility();
      else this.gridObjects?.forEach(o => o.setVisible(false));
    }
    this._applyModeVisibilityState();
  }

  refreshDisplayState() {
    this._refreshOverviewGridCosts();
    this._refreshOverviewPressureCosts();
    this._refreshOverviewMilitiaCosts();
    this._refreshOverviewFavorLabel();
    this._applyModeVisibilityState();
  }

  _canBuyContracts() {
    return this.scene?.clock?.canBuyParcels?.() ?? true;
  }

  _showParcelLockedMessage() {
    showAlert(this.scene, "Parcel contracts stay open during every phase.", "#a7f3d0");
  }

  /**
   * Called by pages when user confirms.
   * Spawns parcel via scene.parcelManager, then hides THIS slot's UI.
   */
  commit(payload) {
    const pm = this.scene.parcelManager;
    if (!pm) {
      console.warn("SlotPanel.commit: scene.parcelManager missing");
      return;
    }
    if (this._pressureMode) return;
    if (!this._canBuyContracts()) {
      this._showParcelLockedMessage();
      return;
    }
    this._closeOverviewDetailMenu();

    const type = payload.type;
    const difficulty = payload.difficulty ?? 1;
    const tutorial = this.scene.tutorialManager || null;
    if (tutorial && !tutorial.canPerformAction?.("parcel.commit", {
      type,
      slotId: this.id,
      source: "overview",
    })) {
      return;
    }

    if (type === "MILITIA" && !this._canAccessMilitia()) {
      this._showMilitiaLockedMessage();
      return;
    }

    if (pm.hasActiveContractType?.(type)) {
      const label = String(type || "parcel").toLowerCase().replace(/_/g, " ");
      showAlert(this.scene, `Only one ${label} parcel can be active at once.`, "#ffcc66");
      return;
    }

    const purchase = this._getPurchaseContext(type, difficulty);
    const moneyCost = Math.max(0, Number(payload.moneyCost ?? purchase.moneyCost ?? getContractMoneyCost(this.scene, type, difficulty)));
    // ✅ compute cost (allow payload.cost override if you really want)
    const cost = (payload.cost != null) ? payload.cost : getContractPermitCost(type, difficulty, this.scene);

    // ✅ enforce permits
    if (cost > 0) {
      if (!this.scene.checkSufficientPermits(cost)) return;
      this.scene.updatePermits(-cost);
    }

    if (moneyCost > 0) {
      if (!this.scene.checkSufficientFunds(moneyCost)) {
        if (cost > 0) this.scene.updatePermits(+cost);
        return;
      }
      this.scene.updateMoney(-moneyCost);
    }

    let started = null;
    try {
      if (type === "FOREST") started = pm.startForest(this.id);
      else if (type === "ROCK") started = pm.startRock(this.id);
      else if (type === "FARM") started = pm.startFarm?.(this.id);
      else if (type === "MILITIA") {
        started = pm.startMilitia?.(this.id, difficulty, {
          militiaConfig: payload.militiaConfig ?? null,
          moneyCost,
        });
      }
      else if (type === "PRESSURE") started = pm.startPressure(this.id, difficulty, { source: "manual" });
      else if (type === "MARKET") started = pm.startMarket(this.id);
      else console.warn("Unknown contract type:", type);
    } catch (e) {
      console.error("Contract commit failed:", e);
      // optional: refund on error
      if (cost > 0) this.scene.updatePermits(+cost);
      if (moneyCost > 0) this.scene.updateMoney(+moneyCost);      
      return;
    }

    if (!started) {
      if (cost > 0) this.scene.updatePermits(+cost);
      if (moneyCost > 0) this.scene.updateMoney(+moneyCost);
      return;
    }

    pm.markContractPermitCost?.(started, cost);

    tutorial?.notifyAction?.("parcel.commit", {
      type,
      slotId: this.id,
      source: "overview",
      contract: started,
    });

    this.playCloseTween(() => {
      this.resetUiState();
      this.setVisible(true);
    });
  }

  _ensurePressureText() {
    if (this._pressureText) return;

    this._pressureText = this.scene.add.text(
      0, 2,
      "",
      {
        fontFamily: "Bungee",
        fontSize: "30px",
        color: "#ffe9e9",
        stroke: "#2b0000",
        strokeThickness: 5,
        align: "center",
        wordWrap: { width: this.W - 28 },
        lineSpacing: 6,
      }
    ).setOrigin(0.5, 0.5).setScrollFactor(1).setDepth(9999);

    this.container.add(this._pressureText);
    this._pressureText.setVisible(false);
  }

  setPressureCountdown({ remainingText, spawners, enemies, enemyType, modifierLabel = null }) {
    this._ensurePressureText();
    this._pressureMode = true;
    this._overviewMenu = "GRID";
    this._drawFrameTheme(true);
    this.header?.setColor?.("#ffd6d6");

    this.gridObjects?.forEach(o => o.setVisible(false));
    this.overviewGridObjects?.forEach(o => o.setVisible(false));
    this._overviewPressureObjects?.forEach(o => o.setVisible(false));
    this._overviewMilitiaObjects?.forEach(o => o.setVisible(false));

    if (this.mode === "overview") {
      this._pressureText.setVisible(false);
      this._showOverviewStatus(
        remainingText,
        [
          `🧨 ${spawners} SPAWNER${spawners === 1 ? "" : "S"}`,
          `👹 ${enemies} ${String(enemyType || "Raiders").toUpperCase()}`,
          modifierLabel ? `✨ ${String(modifierLabel).toUpperCase()}` : null,
        ].filter(Boolean).join("\n")
      );
      return;
    }

    this._hideOverviewStatus();
    this._pressureText.setVisible(false);
    this._refreshDetailedProxyVisual();
    return;
    this._pressureText.setVisible(true);
    this._pressureText.setText([
      "🚨 INCOMING RAID 🚨",
      `${remainingText}`,
      `🧨 Spawners ${spawners}  👹 Enemies ${enemies}`,
      `⚔️ ${enemyType} squad in ${this._titleForSlot()}`,
      modifierLabel ? `✨ ${modifierLabel}` : null,
    ].filter(Boolean).join("\n"));
    return;

    // Hide normal UI while pressure is active
    this.gridObjects?.forEach(o => o.setVisible(false));

    this._pressureText.setVisible(true);
    this._pressureText.setText(
      `⏳ Next raid: ${remainingText}\n` +
      `Spawners: ${spawners} | Enemies: ${enemies} | Type: ${enemyType}`
    );
  }

  setPressureLive({ spawners, enemies, enemyType, modifierLabel = null }) {
    this._ensurePressureText();
    this._pressureMode = true;
    this._overviewMenu = "GRID";
    this._drawFrameTheme(true);
    this.header?.setColor?.("#ffd6d6");

    this.gridObjects?.forEach(o => o.setVisible(false));
    this.overviewGridObjects?.forEach(o => o.setVisible(false));
    this._overviewPressureObjects?.forEach(o => o.setVisible(false));
    this._overviewMilitiaObjects?.forEach(o => o.setVisible(false));

    if (this.mode === "overview") {
      this._pressureText.setVisible(false);
      this._showOverviewStatus(
        "LIVE",
        [
          `🧨 ${spawners} SPAWNER${spawners === 1 ? "" : "S"}`,
          `👹 ${enemies} ${String(enemyType || "Raiders").toUpperCase()}`,
          modifierLabel ? `✨ ${String(modifierLabel).toUpperCase()}` : null,
        ].filter(Boolean).join("\n")
      );
      return;
    }

    this._hideOverviewStatus();
    this._pressureText.setVisible(false);
    this._refreshDetailedProxyVisual();
    return;
    this._pressureText.setVisible(true);
    this._pressureText.setText([
      "⚠️ RAID ACTIVE ⚠️",
      `🧨 Spawners ${spawners}  👹 Enemies ${enemies}`,
      `⚔️ ${enemyType} assault in ${this._titleForSlot()}`,
      modifierLabel ? `✨ ${modifierLabel}` : null,
    ].filter(Boolean).join("\n"));
    return;

    this.gridObjects?.forEach(o => o.setVisible(false));

    this._pressureText.setVisible(true);
    this._pressureText.setText(
      `⚠️ RAID IN PROGRESS\n` +
      `Spawners: ${spawners} | Enemies: ${enemies} | Type: ${enemyType}`
    );
  }

  clearPressureState() {
    this._pressureMode = false;
    this._drawFrameTheme(false);
    this.header?.setColor?.("#ffffff");
    if (this._pressureText) this._pressureText.setVisible(false);
    this._hideOverviewStatus();

    // Restore normal UI (only if panel is visible)
    if (this.mode === "overview") {
      this.gridObjects?.forEach(o => o.setVisible(false));
      this._syncOverviewVisibility();
    } else {
      this.overviewGridObjects?.forEach(o => o.setVisible(false));
      this._overviewPressureObjects?.forEach(o => o.setVisible(false));
      this._overviewMilitiaObjects?.forEach(o => o.setVisible(false));
      this.gridObjects?.forEach(o => o.setVisible(false));
    }
    this._refreshDetailedProxyVisual();
  }

  setVisible(v) {
    const was = this.container.visible;
    if (v) {
      this._refreshOverviewGridCosts();
      this._refreshOverviewPressureCosts();
      this._refreshOverviewMilitiaCosts();
    }
    this.container.setVisible(v);
    if (!v) {
      this._detailHovered = false;
      this.scene?.uiScene?.contractHud?.setExternalHover?.(this.id, false);
    }
    this._applyModeVisibilityState();

    if (v && !was) {
      // if we're being shown after being hidden, open tween
      this.playOpenTween();
    }
  }

  playCloseTween(onDone) {
    // prevent double-trigger
    if (this._closing) return;
    this._closing = true;

    const targets = [
      this.container,
      this.header,
      this.frameG,
      ...(this.gridObjects ?? []),
      ...(this.overviewGridObjects ?? []),
      ...(this._overviewPressureObjects ?? []),
      ...(this._overviewMilitiaObjects ?? []),
      this._overviewStatusPrimary,
      this._overviewStatusSecondary,
      this._pressureText,
    ].filter(Boolean);

    // fade buttons + header + frame
    this.scene.tweens.add({
      targets,
      alpha: 0,
      duration: 120,
      ease: "Quad.easeIn",
    });

    // “frame closes into center” feel: scale down the whole panel container
    this.container.setOrigin?.(0.5, 0.5); // harmless if container ignores it
    this.scene.tweens.add({
      targets: this.container,
      scaleX: 0.05,
      scaleY: 0.05,
      duration: 160,
      ease: "Back.easeIn",
      onComplete: () => {
        this._closing = false;
        // reset scale for next open
        this.container.setScale(1);
        this.container.setAlpha(1);
        this.header?.setAlpha(1);
        this.frameG?.setAlpha(1);
        this.gridObjects?.forEach(o => o.setAlpha?.(1));
        this.overviewGridObjects?.forEach(o => o.setAlpha?.(1));
        this._overviewPressureObjects?.forEach(o => o.setAlpha?.(1));
        this._overviewMilitiaObjects?.forEach(o => o.setAlpha?.(1));
        this._overviewStatusPrimary?.setAlpha?.(1);
        this._overviewStatusSecondary?.setAlpha?.(1);
        this._pressureText?.setAlpha?.(1);
        onDone?.();
      },
    });
  }

  playOpenTween() {
    // prevent re-open spam
    if (this._opening) return;
    this._opening = true;

    // start collapsed
    this.container.setScale(0.05);
    this.container.setAlpha(0);
    this.header?.setAlpha(0);
    this.frameG?.setAlpha(0);
    this.gridObjects?.forEach(o => o.setAlpha?.(0));
    this.overviewGridObjects?.forEach(o => o.setAlpha?.(0));
    this._overviewPressureObjects?.forEach(o => o.setAlpha?.(0));
    this._overviewMilitiaObjects?.forEach(o => o.setAlpha?.(0));
    this._overviewStatusPrimary?.setAlpha?.(0);
    this._overviewStatusSecondary?.setAlpha?.(0);
    this._pressureText?.setAlpha?.(0);

    // scale open
    this.scene.tweens.add({
      targets: this.container,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 180,
      ease: "Back.easeOut",
    });

    // fade in internals slightly after
    const targets = [
      this.header,
      this.frameG,
      ...(this.gridObjects ?? []),
      ...(this.overviewGridObjects ?? []),
      ...(this._overviewPressureObjects ?? []),
      ...(this._overviewMilitiaObjects ?? []),
      this._overviewStatusPrimary,
      this._overviewStatusSecondary,
      this._pressureText,
    ].filter(Boolean);

    this.scene.tweens.add({
      targets,
      alpha: 1,
      duration: 160,
      delay: 40,
      ease: "Quad.easeOut",
      onComplete: () => { this._opening = false; }
    });
  }

}



