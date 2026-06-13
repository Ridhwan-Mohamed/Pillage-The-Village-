import Phaser from "phaser";
import { UIDEPTH } from "../constants.js";
import { AudioManager } from "../Manager/AudioManager.js";
import { TUTORIAL_SPEAKERS } from "./TutorialAssets.js";
import {
  createBodyTextStyle,
  createDisplayTextStyle,
  createLabelTextStyle,
} from "../UI/Typography.js";

const OVERLAY_DEPTH = UIDEPTH + 520;
const TYPE_DELAY_MS = 27;
const BODY_TEXT_COLOR = "#f4fbff";
const KEYWORD_STROKE = "#04111a";

const TUTORIAL_TERM_STYLES = [
  { terms: ["Permit Approved!"], color: "#9ee7ff", strokeThickness: 4 },
  { terms: ["Functions tab", "Functions"], color: "#8f7cff", strokeThickness: 3 },
  { terms: ["Store tab", "Store"], color: "#ff97c2", strokeThickness: 3 },
  { terms: ["Cards tab", "Cards"], color: "#ffdd73", strokeThickness: 3 },
  { terms: ["Town Towers", "Town Tower"], color: "#c4b5fd", strokeThickness: 3 },
  { terms: ["Clay Ovens", "Clay Oven"], color: "#fdba74", strokeThickness: 3 },
  { terms: ["House", "Houses"], color: "#f8d48b", strokeThickness: 3 },
  { terms: ["Storages", "Storage"], color: "#fcd34d", strokeThickness: 3 },
  { terms: ["Farmer", "Farmers"], color: "#ffd9a1", strokeThickness: 3 },
  { terms: ["Forager"], color: "#a7f3d0", strokeThickness: 3 },
  { terms: ["Builder", "Builders"], color: "#c7d2fe", strokeThickness: 3 },
  { terms: ["Fireman"], color: "#fed7aa", strokeThickness: 3 },
  { terms: ["Brawler"], color: "#fef08a", strokeThickness: 3 },
  { terms: ["The Shocker"], color: "#60a5fa", strokeThickness: 4 },
  { terms: ["Food"], color: "#86efac", strokeThickness: 3 },
  { terms: ["Unclean Water", "Water"], color: "#93c5fd", strokeThickness: 3 },
  { terms: ["Seeds"], color: "#fde68a", strokeThickness: 3 },
  { terms: ["Berries"], color: "#e9d5ff", strokeThickness: 3 },
  { terms: ["Wood"], color: "#bbf7d0", strokeThickness: 3 },
  { terms: ["Stone"], color: "#cbd5e1", strokeThickness: 3 },
  { terms: ["Growth Permits", "Growth Permit", "expansion permit", "permits"], color: "#f9a8d4", strokeThickness: 3 },
  { terms: ["Money"], color: "#fef08a", strokeThickness: 3 },
  { terms: ["Gold"], color: "#facc15", strokeThickness: 3 },
  { terms: ["XP"], color: "#a5b4fc", strokeThickness: 3 },
  { terms: ["Forest"], color: "#86efac", strokeThickness: 3 },
  { terms: ["Rock"], color: "#cbd5e1", strokeThickness: 3 },
  { terms: ["Field"], color: "#fde68a", strokeThickness: 3 },
  { terms: ["Market"], color: "#67e8f9", strokeThickness: 3 },
  { terms: ["Pressure"], color: "#fca5a5", strokeThickness: 3 },
];

const TUTORIAL_TERMS = TUTORIAL_TERM_STYLES
  .flatMap((style) => style.terms.map((term) => ({
    term,
    lower: term.toLowerCase(),
    style,
  })))
  .sort((a, b) => b.term.length - a.term.length);

const WORD_CHAR_RE = /[a-z0-9]/i;

export class TutorialOverlay {
  constructor(scene, manager) {
    this.scene = scene;
    this.manager = manager;
    this.root = null;
    this.promptRoot = null;
    this.currentStep = null;
    this.typeEvent = null;
    this.fullText = "";
    this.fullRuns = [];
    this.visibleText = "";
    this.isTyping = false;
    this._charIndex = 0;
    this.avatarFrameEvent = null;
    this._avatarFrameIndex = 0;
    this._spaceHandler = null;
    this._resizeHandler = null;
    this.stepTitle = null;
    this.bodyRich = null;
    this.bodyTextNodes = [];
    this._bodyFontSize = 17;
    this._bodyLineSpacing = 6;
    this._bodyWrapWidth = 480;
  }

  destroy() {
    this.typeEvent?.remove(false);
    this.typeEvent = null;
    this.avatarFrameEvent?.remove(false);
    this.avatarFrameEvent = null;
    this._clearBodyRichText();
    this._unbindSpace();
    this._setResizeHandler(null);
    this.promptRoot?.destroy?.(true);
    this.promptRoot = null;
    this.root?.destroy?.(true);
    this.root = null;
  }

  showPrompt({ onStart, onSkip } = {}) {
    this.promptRoot?.destroy?.(true);
    this.root?.setVisible?.(false);

    const cam = this.scene.cameras.main;
    const root = this.scene.add.container(0, 0).setDepth(OVERLAY_DEPTH).setScrollFactor(0);
    const shade = this.scene.add.rectangle(0, 0, cam.width, cam.height, 0x031019, 0.52)
      .setOrigin(0)
      .setInteractive({ useHandCursor: false });
    const card = this.scene.add.container(cam.width / 2, cam.height * 0.52);
    const width = Math.min(560, cam.width - 44);
    const height = 250;
    const bg = this.scene.add.graphics();
    this._drawPanel(bg, width, height, 0x123148, 0x9ee7ff, 26);
    const title = this.scene.add.text(0, -78, "Play the tutorial?", createDisplayTextStyle({
      fontSize: 24,
      min: 22,
      color: "#f4fbff",
      stroke: "#04111a",
      strokeThickness: 4,
      align: "center",
    })).setOrigin(0.5);
    const body = this.scene.add.text(0, -24, "This is a short guided start for the current version of the game.", createBodyTextStyle({
      fontSize: 16,
      min: 14,
      color: "#c7e8f5",
      align: "center",
      wordWrap: { width: width - 86 },
      lineSpacing: 6,
    })).setOrigin(0.5);

    const yes = this._makeButton(-112, 74, 166, "Start", "#eafffb", 0x1f7667, onStart);
    const no = this._makeButton(112, 74, 166, "Skip", "#ffe7ed", 0x682a3a, onSkip);
    card.add([bg, title, body, ...yes, ...no]);
    root.add([shade, card]);

    this.promptRoot = root;
    this._setResizeHandler(() => {
      shade.setSize(this.scene.scale.width, this.scene.scale.height);
      card.setPosition(this.scene.scale.width / 2, this.scene.scale.height * 0.52);
    });
  }

  showStep(step, opts = {}) {
    this.promptRoot?.destroy?.(true);
    this.promptRoot = null;
    this.currentStep = step;
    this._ensureSpeechRoot();
    this._setResizeHandler(() => this._layoutSpeech());
    this.root.setVisible(true).setAlpha(1);

    const speaker = TUTORIAL_SPEAKERS[step.speaker] ?? TUTORIAL_SPEAKERS.farmer;
    this.avatar.anims?.stop?.();
    this.avatar.setTexture(speaker.textureKey, 0).setFrame(0).setVisible(true);
    this.nameText.setText(speaker.name).setColor(speaker.textColor);
    const titleText = String(step.titleText || "").trim();
    this.stepTitle
      .setText(titleText)
      .setVisible(!!titleText)
      .setStyle(createDisplayTextStyle({
        fontSize: 18,
        min: 16,
        color: step.titleColor || "#ffd166",
        stroke: step.titleStroke || "#082131",
        strokeThickness: Number.isFinite(Number(step.titleStrokeThickness))
          ? Number(step.titleStrokeThickness)
          : 4,
        align: "left",
        wordWrap: { width: 480 },
    }));
    this.fullText = String(step.text || "");
    this.fullRuns = this._parseStyledRuns(this.fullText);
    this.visibleText = "";
    this._setBodyText("");
    this.nextText.setText(step.waitFor ? "WAITING" : (step.completeOnAdvance ? "Finish Tutorial" : "NEXT"));
    this.nextHint.setText(step.waitFor ? "finish the highlighted action" : "click or press space");
    this._setNextEnabled(!step.waitFor);
    this._layoutSpeech();
    this._startTyping(speaker);
  }

  relayout() {
    this._layoutSpeech();
  }

  finishCurrentText() {
    if (!this.isTyping) return false;
    this.typeEvent?.remove(false);
    this.typeEvent = null;
    this.isTyping = false;
    this.visibleText = this.fullText;
    this._setBodyText(this.fullText);
    this.avatarFrameEvent?.remove(false);
    this.avatarFrameEvent = null;
    this.avatar?.anims?.stop?.();
    this.avatar?.setFrame?.(0);
    return true;
  }

  _startTyping(speaker) {
    this.typeEvent?.remove(false);
    this.typeEvent = null;
    this._charIndex = 0;
    this.visibleText = "";
    this.isTyping = true;
    this._startSpeakerFrames(speaker);

    this.typeEvent = this.scene.time.addEvent({
      delay: TYPE_DELAY_MS,
      loop: true,
      callback: () => {
        if (this._charIndex >= this.fullText.length) {
          this.finishCurrentText();
          return;
        }

        const char = this.fullText[this._charIndex];
        this.visibleText += char;
        this._setBodyText(this.visibleText);
        if (char.trim() && this._charIndex % 3 === 0) {
          AudioManager.playUiType({ volume: 0.12, rate: 0.96 + Math.random() * 0.12 });
        }
        this._charIndex += 1;
      },
    });
  }

  _ensureSpeechRoot() {
    if (this.root?.active) return;

    this.root = this.scene.add.container(0, 0).setDepth(OVERLAY_DEPTH).setScrollFactor(0);
    this.shadow = this.scene.add.graphics();
    this.panel = this.scene.add.graphics();
    this.avatarPlate = this.scene.add.graphics();
    this.avatar = this.scene.add.sprite(0, 0, TUTORIAL_SPEAKERS.farmer.textureKey, 0)
      .setOrigin(0.5)
      .setDisplaySize(128, 128);
    this.nameText = this.scene.add.text(0, 0, "", createDisplayTextStyle({
      fontSize: 14,
      min: 14,
      color: "#ffffff",
      stroke: "#04111a",
      strokeThickness: 2,
      align: "center",
    })).setOrigin(0.5);
    this.stepTitle = this.scene.add.text(0, 0, "", createDisplayTextStyle({
      fontSize: 18,
      min: 16,
      color: "#ffd166",
      stroke: "#082131",
      strokeThickness: 4,
      align: "left",
    })).setOrigin(0, 0).setVisible(false);
    this.stepTitle.setShadow(0, 2, "#021018", 2, true, true);
    this.bodyRich = this.scene.add.container(0, 0);
    this.nextBg = this.scene.add.graphics();
    this.nextText = this.scene.add.text(0, 0, "NEXT", createLabelTextStyle({
      fontSize: 14,
      min: 14,
      color: "#eafffb",
      align: "center",
    })).setOrigin(0.5);
    this.nextHint = this.scene.add.text(0, 0, "click or press space", createBodyTextStyle({
      fontSize: 13,
      min: 13,
      color: "#bfe9f5",
      align: "center",
    })).setOrigin(0.5);
    this.nextHit = this.scene.add.zone(0, 0, 116, 42)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.nextHit.on("pointerdown", (_pointer, _lx, _ly, event) => {
      event?.stopPropagation?.();
      this._handleAdvanceInput();
    });

    this.root.add([
      this.shadow,
      this.panel,
      this.avatarPlate,
      this.avatar,
      this.nameText,
      this.stepTitle,
      this.bodyRich,
      this.nextBg,
      this.nextText,
      this.nextHint,
      this.nextHit,
    ]);

    this._bindSpace();
  }

  _bindSpace() {
    if (this._spaceHandler || !this.scene.input?.keyboard) return;
    this._spaceHandler = (event) => {
      if (event?.repeat) return;
      this._handleAdvanceInput();
    };
    this.scene.input.keyboard.on("keydown-SPACE", this._spaceHandler);
  }

  _unbindSpace() {
    if (!this._spaceHandler || !this.scene.input?.keyboard) return;
    this.scene.input.keyboard.off("keydown-SPACE", this._spaceHandler);
    this._spaceHandler = null;
  }

  _handleAdvanceInput() {
    if (this.finishCurrentText()) return;
    if (this.currentStep?.waitFor) return;
    AudioManager.playMenuClick({ volume: 0.18 });
    this.manager.advanceFromOverlay();
  }

  _setNextEnabled(enabled) {
    const active = !!enabled;
    this.nextHit.input.enabled = active;
    this.nextBg.setAlpha(active ? 1 : 0.56);
    this.nextText.setAlpha(active ? 1 : 0.62);
    this.nextHint.setAlpha(active ? 1 : 0.58);
  }

  _layoutSpeech() {
    if (!this.root) return;

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const compact = width <= 1680 || height <= 1100 || !!this.scene.uiBottomBar?.expanded;
    const hasTitle = !!(this.currentStep?.titleText && this.stepTitle?.visible);
    const titleExtra = hasTitle ? (compact ? 24 : 28) : 0;
    const panelW = compact
      ? Phaser.Math.Clamp(Math.round(width * 0.48), 430, 620)
      : Phaser.Math.Clamp(width - 48, 560, 720);
    const avatarSize = compact
      ? Phaser.Math.Clamp(Math.round(height * 0.084), 76, 96)
      : Phaser.Math.Clamp(Math.round(height * 0.108), 98, 128);
    const panelH = (compact
      ? Math.max(126, avatarSize + 48)
      : Math.max(158, avatarSize + 50)) + titleExtra;
    const { x, y } = this._chooseSpeechPosition(panelW, panelH);
    const bubbleX = 14 + avatarSize + 18;
    const bubbleW = panelW - avatarSize - 28;
    const titleY = compact ? 18 : 22;
    const bodyY = hasTitle ? titleY + (compact ? 24 : 30) : (compact ? 18 : 22);

    this.root.setPosition(x, y);
    this.shadow.clear();
    this.shadow.fillStyle(0x02070d, 0.32);
    this.shadow.fillRoundedRect(3, 7, panelW, panelH, 18);
    this.panel.clear();
    this._drawPanel(this.panel, panelW, panelH, 0x102f43, 0x9ee7ff, 18, 0, 0);
    this.avatarPlate.clear();
    this.avatarPlate.fillStyle(0x071722, 0.72);
    this.avatarPlate.fillRoundedRect(10, 11, avatarSize + 8, avatarSize + 30, 16);
    this.avatarPlate.lineStyle(2, 0xb7ecff, 0.18);
    this.avatarPlate.strokeRoundedRect(10, 11, avatarSize + 8, avatarSize + 30, 16);

    this.avatar.setPosition(14 + avatarSize / 2, 14 + avatarSize / 2).setDisplaySize(avatarSize, avatarSize);
    this.nameText
      .setFontSize(compact ? "10px" : "12px")
      .setPosition(14 + avatarSize / 2, 18 + avatarSize + 11);
    this.stepTitle
      .setFontSize(compact ? "15px" : "18px")
      .setPosition(bubbleX, titleY)
      .setWordWrapWidth(Math.max(220, bubbleW - 34))
      .setVisible(hasTitle);
    this._bodyFontSize = compact ? 15 : 17;
    this._bodyLineSpacing = compact ? 5 : 6;
    this._bodyWrapWidth = Math.max(260, bubbleW - 34);
    this.bodyRich.setPosition(bubbleX, bodyY);
    this._renderRichBody(this.visibleText);
    const nextButtonW = this.currentStep?.completeOnAdvance ? 142 : 108;
    const nextButtonX = bubbleX + bubbleW - nextButtonW / 2 - 14;
    this.nextBg.setPosition(nextButtonX, panelH - 34);
    this.nextText
      .setFontSize(compact ? "12px" : "14px")
      .setPosition(nextButtonX, panelH - 40);
    this.nextHint
      .setFontSize(compact ? "10px" : "11px")
      .setPosition(nextButtonX, panelH - 22);
    this.nextHit.setPosition(nextButtonX, panelH - 32).setSize(nextButtonW, 38);
    this._drawNextButton();
  }

  _chooseSpeechPosition(panelW, panelH) {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const margin = 18;
    const safeTop = 84;
    const bottomBarRect = this._getBottomBarRect();
    const bottomLimit = bottomBarRect ? Math.max(safeTop + panelH, bottomBarRect.y - 14) : height - 70;
    const maxX = Math.max(margin, width - panelW - margin);
    const maxY = Math.max(safeTop, bottomLimit - panelH);
    const placement = this.currentStep?.speechPlacement;
    if (placement === "top") {
      return {
        x: Phaser.Math.Clamp(Math.round((width - panelW) / 2), margin, maxX),
        y: safeTop,
      };
    }
    if (placement === "contractBottom") {
      return {
        x: Phaser.Math.Clamp(Math.round(width * 0.58 - panelW / 2), margin, maxX),
        y: Phaser.Math.Clamp(Math.round(height - panelH - 86), safeTop, maxY),
      };
    }
    const target = this.manager?.getOverlayTargetRect?.() ?? null;
    const candidates = [];
    const add = (x, y, bias = 0) => {
      candidates.push({
        x: Phaser.Math.Clamp(Math.round(x), margin, maxX),
        y: Phaser.Math.Clamp(Math.round(y), safeTop, maxY),
        bias,
      });
    };

    if (target) {
      const targetMidY = target.y + target.height / 2 - panelH / 2;
      add(target.x + target.width + 24, targetMidY, -28);
      add(target.x - panelW - 24, targetMidY, -20);
      add(target.x + target.width + 24, target.y + target.height + 18, -16);
      add(target.x - panelW - 24, target.y + target.height + 18, -12);
      add((width - panelW) / 2, target.y + target.height + 24, -8);
      add((width - panelW) / 2, safeTop, 2);
      add((width - panelW) / 2, maxY, 8);
    } else {
      add(margin, maxY, -12);
      add((width - panelW) / 2, maxY, -8);
      add((width - panelW) / 2, safeTop, 0);
      add(width - panelW - margin, safeTop, 8);
    }

    const avoidRects = [
      target ? this._inflateRect(target, 14) : null,
      bottomBarRect ? this._inflateRect(bottomBarRect, 8) : null,
    ].filter(Boolean);

    let best = candidates[0] || { x: margin, y: maxY, bias: 0 };
    let bestScore = Infinity;
    for (const candidate of candidates) {
      const rect = { x: candidate.x, y: candidate.y, width: panelW, height: panelH };
      let score = candidate.bias || 0;
      for (const avoid of avoidRects) {
        score += this._intersectionArea(rect, avoid) * 20;
      }
      if (target) {
        const dx = (rect.x + rect.width / 2) - (target.x + target.width / 2);
        const dy = (rect.y + rect.height / 2) - (target.y + target.height / 2);
        score -= Math.min(260, Math.hypot(dx, dy)) * 0.35;
      }
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return best;
  }

  _startSpeakerFrames(speaker) {
    this.avatarFrameEvent?.remove(false);
    this.avatarFrameEvent = null;
    this._avatarFrameIndex = 0;
    this.avatar?.anims?.stop?.();
    this.avatar?.setFrame?.(0);

    const frameCount = Math.max(1, Number(speaker?.frameCount || 1));
    if (frameCount <= 1) return;

    const frameRate = speaker?.key === "fireman" ? 7 : 8;
    this.avatarFrameEvent = this.scene.time.addEvent({
      delay: Math.max(60, Math.round(1000 / frameRate)),
      loop: true,
      callback: () => {
        if (!this.isTyping || !this.avatar?.active) return;
        this._avatarFrameIndex = (this._avatarFrameIndex + 1) % frameCount;
        this.avatar.setFrame(this._avatarFrameIndex);
      },
    });
  }

  _getBottomBarRect() {
    const bar = this.scene.uiBottomBar;
    const bounds = bar?.ui?.getBounds?.();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      if (!bar?.expanded) return null;
      return { x: 0, y: this.scene.scale.height - 180, width: this.scene.scale.width, height: 180 };
    }
    const visibleHeight = Math.max(0, this.scene.scale.height - bounds.y);
    if (visibleHeight < 64 && !bar?.expanded) return null;
    return {
      x: bounds.x,
      y: Math.max(0, bounds.y),
      width: bounds.width,
      height: Math.max(64, visibleHeight),
    };
  }

  _inflateRect(rect, amount) {
    return {
      x: rect.x - amount,
      y: rect.y - amount,
      width: rect.width + amount * 2,
      height: rect.height + amount * 2,
    };
  }

  _intersectionArea(a, b) {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.width, b.x + b.width);
    const y2 = Math.min(a.y + a.height, b.y + b.height);
    return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  }

  _drawNextButton() {
    const buttonW = this.currentStep?.completeOnAdvance ? 142 : 108;
    const x = -buttonW / 2;
    this.nextBg.clear();
    this.nextBg.fillStyle(0x031019, 0.20);
    this.nextBg.fillRoundedRect(x, -19 + 4, buttonW, 38, 12);
    this.nextBg.fillStyle(0x1d766a, 0.92);
    this.nextBg.fillRoundedRect(x, -19, buttonW, 38, 12);
    this.nextBg.fillStyle(0xffffff, 0.08);
    this.nextBg.fillRoundedRect(x + 9, -14, Math.max(18, buttonW - 18), 11, 7);
    this.nextBg.lineStyle(2, 0xb9fff0, 0.22);
    this.nextBg.strokeRoundedRect(x, -19, buttonW, 38, 12);
  }

  _setBodyText(text) {
    this.visibleText = String(text || "");
    this._renderRichBody(this.visibleText);
  }

  _clearBodyRichText() {
    this.bodyTextNodes.forEach((node) => node?.destroy?.());
    this.bodyTextNodes = [];
    this.bodyRich?.removeAll?.(false);
  }

  _renderRichBody(text) {
    if (!this.bodyRich) return;
    this._clearBodyRichText();

    const visibleLength = String(text || "").length;
    const runs = this._visibleStyledRuns(visibleLength);
    const lineHeight = this._bodyFontSize + this._bodyLineSpacing;
    const wrapWidth = Math.max(120, this._bodyWrapWidth || 480);
    const spaceWidth = Math.max(4, Math.round(this._bodyFontSize * 0.34));
    let x = 0;
    let line = 0;

    runs.forEach((run) => {
      const style = this._bodyTextStyle(run.style);
      const tokens = String(run.text || "").match(/\n|[^\S\n]+|[^\s]+/g) || [];
      tokens.forEach((token) => {
        if (token === "\n") {
          x = 0;
          line += 1;
          return;
        }

        if (/^[^\S\n]+$/.test(token)) {
          if (x > 0) x += spaceWidth * token.length;
          return;
        }

        const node = this.scene.add.text(0, 0, token, style).setOrigin(0, 0);
        if (x > 0 && x + node.width > wrapWidth) {
          x = 0;
          line += 1;
        }
        const baselineOffset = run.style
          ? -Math.ceil(Number(run.style.strokeThickness || 0) / 2)
          : 0;
        node.setPosition(x, line * lineHeight + baselineOffset);
        this.bodyRich.add(node);
        this.bodyTextNodes.push(node);
        x += node.width;
      });
    });
  }

  _visibleStyledRuns(visibleLength) {
    let remaining = Math.max(0, Number(visibleLength) || 0);
    const sourceRuns = this.fullRuns?.length ? this.fullRuns : this._parseStyledRuns(this.visibleText);
    const visibleRuns = [];

    for (const run of sourceRuns) {
      if (remaining <= 0) break;
      const text = String(run.text || "");
      const take = Math.min(text.length, remaining);
      if (take > 0) {
        visibleRuns.push({
          text: text.slice(0, take),
          style: run.style,
        });
      }
      remaining -= take;
    }

    return visibleRuns;
  }

  _bodyTextStyle(termStyle = null) {
    return createBodyTextStyle({
      fontSize: this._bodyFontSize,
      min: 12,
      color: termStyle?.color || BODY_TEXT_COLOR,
      stroke: termStyle ? (termStyle.stroke || KEYWORD_STROKE) : undefined,
      strokeThickness: termStyle ? (termStyle.strokeThickness || 3) : 0,
    });
  }

  _parseStyledRuns(text) {
    const runs = [];
    let index = 0;
    let plain = "";

    const pushPlain = () => {
      if (!plain) return;
      runs.push({ text: plain, style: null });
      plain = "";
    };

    while (index < text.length) {
      const match = this._matchTutorialTerm(text, index);
      if (match) {
        pushPlain();
        runs.push({
          text: text.slice(index, index + match.term.length),
          style: match.style,
        });
        index += match.term.length;
        continue;
      }

      plain += text[index];
      index += 1;
    }

    pushPlain();
    return runs;
  }

  _matchTutorialTerm(text, index) {
    const lower = text.toLowerCase();
    for (const entry of TUTORIAL_TERMS) {
      if (!lower.startsWith(entry.lower, index)) continue;
      if (!this._isTermBoundary(text, index, entry.term.length)) continue;
      return entry;
    }
    return null;
  }

  _isTermBoundary(text, index, length) {
    const before = index > 0 ? text[index - 1] : "";
    const after = text[index + length] || "";
    return !WORD_CHAR_RE.test(before) && !WORD_CHAR_RE.test(after);
  }

  _makeButton(x, y, width, label, color, fill, onClick) {
    const bg = this.scene.add.graphics();
    const draw = (hovered = false) => {
      bg.clear();
      bg.fillStyle(0x02070d, 0.22);
      bg.fillRoundedRect(x - width / 2, y - 29 + 5, width, 58, 18);
      bg.fillStyle(fill, hovered ? 1 : 0.96);
      bg.fillRoundedRect(x - width / 2, y - 29, width, 58, 18);
      bg.lineStyle(2, 0xffffff, hovered ? 0.30 : 0.16);
      bg.strokeRoundedRect(x - width / 2, y - 29, width, 58, 18);
    };
    draw(false);
    const text = this.scene.add.text(x, y, label, createLabelTextStyle({
      fontSize: 16,
      min: 16,
      color,
    })).setOrigin(0.5);
    const hit = this.scene.add.zone(x, y, width, 58).setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => draw(true));
    hit.on("pointerout", () => draw(false));
    hit.on("pointerdown", (_pointer, _lx, _ly, event) => {
      event?.stopPropagation?.();
      AudioManager.playMenuClick({ volume: 0.2 });
      onClick?.();
    });
    return [bg, text, hit];
  }

  _drawPanel(g, width, height, fill, stroke, radius, x = -width / 2, y = -height / 2) {
    g.clear();
    g.fillStyle(0x02070d, 0.24);
    g.fillRoundedRect(x + 3, y + 6, width, height, radius);
    g.fillStyle(fill, 0.96);
    g.fillRoundedRect(x, y, width, height, radius);
    g.fillStyle(0xffffff, 0.07);
    g.fillRoundedRect(x + 16, y + 10, Math.max(24, width - 32), 20, 12);
    g.lineStyle(2, stroke, 0.24);
    g.strokeRoundedRect(x, y, width, height, radius);
    g.lineStyle(1, 0xffffff, 0.10);
    g.strokeRoundedRect(x + 1, y + 1, width - 2, height - 2, Math.max(1, radius - 1));
  }

  _setResizeHandler(handler) {
    if (this._resizeHandler) {
      this.scene.scale.off("resize", this._resizeHandler);
    }
    this._resizeHandler = handler || null;
    if (this._resizeHandler) {
      this.scene.scale.on("resize", this._resizeHandler);
    }
  }
}
