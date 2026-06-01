import Phaser from "phaser";
import { UIDEPTH } from "../constants.js";
import {
  createBodyTextStyle,
  createDisplayTextStyle,
  createLabelTextStyle,
} from "./Typography.js";

const BOARD_W = 300;
const HEADER_H = 30;
const ROW_H = 58;
const ROW_GAP = 15;
const PANEL_BOTTOM_PAD = 35;
const PROGRESS_X = (BOARD_W / 2) - 106;
const PROGRESS_Y = 4;
const PROGRESS_W = 86;
const PROGRESS_H = 22;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class AchievementBoard {
  constructor(scene, worldScene) {
    this.scene = scene;
    this.worldScene = worldScene;
    this.expanded = true;
    this._lastSignature = "";
    this._rowBySlot = new Map();
    this._completionTimers = new Map();
    this._unseenCompletions = 0;

    this.root = scene.add.container(0, 0).setDepth((UIDEPTH ?? 0) + 18);
    this.header = scene.add.container(0, 0);
    this.panel = scene.add.container(0, 0).setVisible(this.expanded).setAlpha(this.expanded ? 1 : 0);

    this.headerShadow = scene.add.graphics();
    this.headerBg = scene.add.graphics();
    this.headerShine = scene.add.graphics();
    this.headerTitle = scene.add.text(-(BOARD_W / 2) + 24, -5, "TOWN GOALS", createDisplayTextStyle({
      fontSize: 14,
      min: 14,
      color: "#eef8ff",
      stroke: "#07111b",
      strokeThickness: 2,
    })).setOrigin(0, 0.5);
    this.headerStatus = scene.add.text(-(BOARD_W / 2) + 24, 9, "3 ACTIVE", createLabelTextStyle({
      fontSize: 11,
      min: 11,
      color: "#b9deef",
    })).setOrigin(0, 0.5);
    this.chevron = scene.add.text(BOARD_W / 2 - 24, 0, "v", createLabelTextStyle({
      fontSize: 14,
      min: 14,
      color: "#d6efff",
    })).setOrigin(0.5);
    this.noticeBadgeBg = scene.add.graphics().setVisible(false);
    this.noticeBadgeText = scene.add.text(BOARD_W / 2 - 72, 0, "", createLabelTextStyle({
      fontSize: 10,
      min: 10,
      color: "#17330e",
      align: "center",
    })).setOrigin(0.5).setVisible(false);
    this.headerHit = scene.add.zone(0, 0, BOARD_W, HEADER_H).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.headerHit.on("pointerdown", () => this.toggle());

    this.header.add([
      this.headerShadow,
      this.headerBg,
      this.headerShine,
      this.headerTitle,
      this.headerStatus,
      this.noticeBadgeBg,
      this.noticeBadgeText,
      this.chevron,
      this.headerHit,
    ]);

    this.panelShadow = scene.add.graphics();
    this.panelBg = scene.add.graphics();
    this.panelShine = scene.add.graphics();
    this.panel.add([this.panelShadow, this.panelBg, this.panelShine]);

    this.rows = ["build", "economy", "combat"].map((slot, index) => this._createRow(slot, index));
    this.rows.forEach((row) => {
      this.panel.add(row.root);
      this._rowBySlot.set(row.slot, row);
    });

    this.root.add([this.header, this.panel]);

    this._onChanged = () => this.refresh(true);
    this._onCompleted = (payload) => this._animateCompletion(payload);
    scene.events.on("achievements:changed", this._onChanged);
    scene.events.on("achievement:completed", this._onCompleted);

    this._resizeHandler = () => {
      this.reposition();
      this.refresh(true);
    };
    scene.scale.on("resize", this._resizeHandler);

    this._drawShell();
    this.reposition();
    this.refresh(true);
  }

  _createRow(slot, index) {
    const root = this.scene.add.container(0, 0);
    root.baseY = HEADER_H + 10 + (ROW_H / 2) + index * (ROW_H + ROW_GAP);

    const bg = this.scene.add.graphics();
    const shine = this.scene.add.graphics();
    const tag = this.scene.add.text(-(BOARD_W / 2) + 26, -17, "", createLabelTextStyle({
      fontSize: 10,
      min: 10,
      color: "#ffffff",
    })).setOrigin(0, 0.5);
    const title = this.scene.add.text(-(BOARD_W / 2) + 26, -4, "", createLabelTextStyle({
      fontSize: 13,
      min: 13,
      color: "#eef8ff",
      wordWrap: { width: 146 },
    })).setOrigin(0, 0.5);
    const desc = this.scene.add.text(-(BOARD_W / 2) + 26, 16, "", createBodyTextStyle({
      fontSize: 11,
      min: 11,
      color: "#cfe4f2",
      wordWrap: { width: 150 },
    })).setOrigin(0, 0.5);

    const rewardBg = this.scene.add.graphics();
    const rewardText = this.scene.add.text((BOARD_W / 2) - 70, -14, "", createBodyTextStyle({
      fontSize: 10,
      min: 10,
      color: "#fff4cf",
      align: "right",
      wordWrap: { width: 92 },
    })).setOrigin(0.5);

    const progressBg = this.scene.add.graphics();
    const progressFill = this.scene.add.graphics();
    const progressShine = this.scene.add.graphics();
    const progressText = this.scene.add.text((BOARD_W / 2) - 70, 14, "", createLabelTextStyle({
      fontSize: 11,
      min: 11,
      color: "#e6f7ff",
    })).setOrigin(0.5);

    const strike = this.scene.add.graphics();
    const completeFlash = this.scene.add.graphics().setVisible(false);
    const completeSweep = this.scene.add.graphics().setVisible(false);
    const completeText = this.scene.add.text((BOARD_W / 2) - 68, 14, "COMPLETE", createLabelTextStyle({
      fontSize: 10,
      min: 10,
      color: "#123319",
    })).setOrigin(0.5).setVisible(false);

    root.add([bg, shine, completeFlash, completeSweep, rewardBg, progressBg, progressFill, progressShine, tag, title, desc, rewardText, progressText, strike, completeText]);
    root.setPosition(0, root.baseY);

    return {
      slot,
      root,
      bg,
      shine,
      tag,
      title,
      desc,
      rewardBg,
      rewardText,
      progressBg,
      progressFill,
      progressShine,
      progressText,
      strike,
      completeFlash,
      completeSweep,
      completeText,
      locked: false,
    };
  }

  _drawShell() {
    this.headerShadow.clear();
    this.headerShadow.fillStyle(0x02060d, 0.28);
    this.headerShadow.fillRoundedRect(-(BOARD_W / 2) + 2, -HEADER_H / 2 + 4, BOARD_W, HEADER_H, 15);

    this.headerBg.clear();
    this.headerBg.fillStyle(0x113048, 0.94);
    this.headerBg.lineStyle(2, 0x9edfff, 0.22);
    this.headerBg.fillRoundedRect(-(BOARD_W / 2), -HEADER_H / 2, BOARD_W, HEADER_H, 15);
    this.headerBg.strokeRoundedRect(-(BOARD_W / 2), -HEADER_H / 2, BOARD_W, HEADER_H, 15);

    this.headerShine.clear();
    this.headerShine.fillStyle(0xffffff, 0.08);
    this.headerShine.fillRoundedRect(-(BOARD_W / 2) + 10, -HEADER_H / 2 + 5, BOARD_W - 20, 11, 9);

    const panelH = this.rows.length * ROW_H + (this.rows.length - 1) * ROW_GAP + PANEL_BOTTOM_PAD;
    this.panelShadow.clear();
    this.panelShadow.fillStyle(0x02060d, 0.26);
    this.panelShadow.fillRoundedRect(-(BOARD_W / 2) + 3, HEADER_H - 5, BOARD_W, panelH, 20);

    this.panelBg.clear();
    this.panelBg.fillStyle(0x113048, 0.88);
    this.panelBg.lineStyle(2, 0x9edfff, 0.18);
    this.panelBg.fillRoundedRect(-(BOARD_W / 2), HEADER_H - 10, BOARD_W, panelH, 20);
    this.panelBg.strokeRoundedRect(-(BOARD_W / 2), HEADER_H - 10, BOARD_W, panelH, 20);

    this.panelShine.clear();
    this.panelShine.fillStyle(0xffffff, 0.05);
    this.panelShine.fillRoundedRect(-(BOARD_W / 2) + 10, HEADER_H - 2, BOARD_W - 20, 18, 12);

    this._drawNoticeBadge();
  }

  _goalSignature(snapshot) {
    return JSON.stringify({
      expanded: this.expanded,
      serial: snapshot?.serial || 0,
      completed: snapshot?.totalCompleted || 0,
      unseen: this._unseenCompletions,
      goals: (snapshot?.activeGoals || []).map((goal) => ({
        id: goal.instanceId,
        value: goal.progressValue,
        target: goal.progressTarget,
        title: goal.title,
      })),
    });
  }

  _renderRow(row, goal, { completed = false } = {}) {
    if (!row) return;
    if (!goal) {
      row.root.setVisible(false);
      return;
    }

    row.root.setVisible(true);
    row.root.setAlpha(1);
    row.root.setScale(1);
    row.completeFlash?.clear?.();
    row.completeFlash?.setVisible?.(false);
    row.completeSweep?.clear?.();
    row.completeSweep?.setVisible?.(false);
    row.completeText?.setVisible?.(false);

    const accent = completed ? 0x5fd18a : Number(goal.accent || 0x9edfff);
    const fill = completed ? 0x173725 : Number(goal.fill || 0x10283a);
    const stroke = completed ? 0x93f5b5 : Number(goal.stroke || 0x89d6ff);

    row.bg.clear();
    row.bg.fillStyle(fill, 0.98);
    row.bg.lineStyle(2, stroke, 0.28);
    row.bg.fillRoundedRect(-(BOARD_W / 2) + 8, -(ROW_H / 2), BOARD_W - 16, ROW_H, 16);
    row.bg.strokeRoundedRect(-(BOARD_W / 2) + 8, -(ROW_H / 2), BOARD_W - 16, ROW_H, 16);

    row.shine.clear();
    row.shine.fillStyle(0xffffff, completed ? 0.08 : 0.05);
    row.shine.fillRoundedRect(-(BOARD_W / 2) + 18, -(ROW_H / 2) + 6, BOARD_W - 36, 12, 10);

    row.tag.setText(String(goal.slotLabel || "").toUpperCase());
    row.tag.setColor(completed ? "#bff6d3" : "#d8f2ff");
    row.title.setText(completed ? `${goal.title} COMPLETE` : goal.title);
    row.title.setColor(completed ? "#d9ffe4" : "#eef8ff");
    row.desc.setText(goal.description || "");
    row.desc.setColor(completed ? "#b9efc9" : "#cfe4f2");

    row.rewardBg.clear();
    row.rewardBg.fillStyle(completed ? 0x24593a : 0x5a4311, 0.96);
    row.rewardBg.lineStyle(2, completed ? 0xbff6d3 : 0xf7d58b, 0.26);
    row.rewardBg.fillRoundedRect((BOARD_W / 2) - 120, -25, 100, 22, 11);
    row.rewardBg.strokeRoundedRect((BOARD_W / 2) - 120, -25, 100, 22, 11);
    row.rewardText.setText(completed ? `Paid ${goal.rewardText || "reward"}` : (goal.rewardText || ""));
    row.rewardText.setColor(completed ? "#d9ffe4" : "#fff4cf");

    row.progressBg.clear();
    row.progressFill.clear();
    row.progressShine.clear();
    row.progressBg.fillStyle(completed ? 0x2f7d4f : 0x16364d, 0.96);
    row.progressBg.lineStyle(2, completed ? 0xbff6d3 : accent, 0.28);
    row.progressBg.fillRoundedRect(PROGRESS_X, PROGRESS_Y, PROGRESS_W, PROGRESS_H, 11);
    row.progressBg.strokeRoundedRect(PROGRESS_X, PROGRESS_Y, PROGRESS_W, PROGRESS_H, 11);
    const progressRatio = completed
      ? 1
      : clamp(
        Number(goal.progressRatio ?? (
          Number(goal.progressTarget || 0) > 0
            ? Number(goal.progressValue || 0) / Number(goal.progressTarget || 1)
            : 0
        )),
        0,
        1
      );
    const fillInset = 3;
    const maxFillWidth = PROGRESS_W - (fillInset * 2);
    const minFillWidth = Math.min(maxFillWidth, PROGRESS_H - (fillInset * 2));
    const fillWidth = progressRatio <= 0
      ? 0
      : Math.min(maxFillWidth, Math.max(minFillWidth, Math.round(maxFillWidth * progressRatio)));
    if (fillWidth > 0) {
      row.progressFill.fillStyle(completed ? 0x7ce3a2 : accent, completed ? 0.96 : 0.92);
      row.progressFill.fillRoundedRect(
        PROGRESS_X + fillInset,
        PROGRESS_Y + fillInset,
        fillWidth,
        PROGRESS_H - (fillInset * 2),
        8
      );

      const shineWidth = Math.max(0, Math.min(fillWidth - 4, Math.round(fillWidth * 0.72)));
      if (shineWidth > 0) {
        row.progressShine.fillStyle(0xffffff, completed ? 0.12 : 0.16);
        row.progressShine.fillRoundedRect(
          PROGRESS_X + fillInset + 2,
          PROGRESS_Y + fillInset + 1,
          shineWidth,
          5,
          5
        );
      }
    }
    row.progressText.setText(completed ? "DONE" : `${goal.progressValue}/${goal.progressTarget}`);
    row.progressText.setColor(completed ? "#f0fff5" : "#e6f7ff");

    row.strike.clear();
    if (completed) {
      row.strike.lineStyle(4, 0xbff6d3, 0.9);
      row.strike.beginPath();
      row.strike.moveTo(-(BOARD_W / 2) + 28, 4);
      row.strike.lineTo((BOARD_W / 2) - 130, 4);
      row.strike.strokePath();
    }
  }

  _animateCompletion(payload) {
    const completed = payload?.completed;
    if (!completed) return;

    this._pulseHeader();

    if (!this.expanded) {
      this._unseenCompletions += 1;
      this._syncNoticeState();
      this._emitXpParticlesFrom(this.root.x, this.root.y);
      this.scene.townXpHud?.refresh?.(true);
      this.scene.time.delayedCall(720, () => this.refresh(true));
      return;
    }

    const row = this._rowBySlot.get(completed.slot);
    if (!row) return;

    this._completionTimers.get(row.slot)?.remove?.(false);
    row.locked = true;
    this._renderRow(row, completed, { completed: true });
    this._playOpenCompletionFx(row);
    this._emitXpParticlesFrom(
      this.root.x + row.root.x + (BOARD_W / 2) - 70,
      this.root.y + row.root.y + 14
    );
    this.scene.tweens.killTweensOf(row.root);
    this.scene.tweens.add({
      targets: row.root,
      scaleX: 1.045,
      scaleY: 1.045,
      duration: 150,
      ease: "Back.Out",
      yoyo: true,
    });
    this.scene.tweens.add({
      targets: row.root,
      alpha: 0.42,
      delay: 560,
      duration: 260,
      ease: "Quad.Out",
    });

    const timer = this.scene.time.delayedCall(920, () => {
      row.locked = false;
      row.root.setAlpha(0);
      row.root.setPosition(0, row.root.baseY + 8);
      this.refresh(true);
      this.scene.tweens.add({
        targets: row.root,
        alpha: 1,
        y: row.root.baseY,
        duration: 220,
        ease: "Back.Out",
      });
    });
    this._completionTimers.set(row.slot, timer);
  }

  _playOpenCompletionFx(row) {
    if (!row) return;

    row.completeFlash.clear();
    row.completeFlash.fillStyle(0xc8ffcf, 0.26);
    row.completeFlash.lineStyle(3, 0xbff6d3, 0.74);
    row.completeFlash.fillRoundedRect(-(BOARD_W / 2) + 8, -(ROW_H / 2), BOARD_W - 16, ROW_H, 16);
    row.completeFlash.strokeRoundedRect(-(BOARD_W / 2) + 8, -(ROW_H / 2), BOARD_W - 16, ROW_H, 16);
    row.completeFlash.setAlpha(0);
    row.completeFlash.setVisible(true);

    row.completeSweep.clear();
    row.completeSweep.fillStyle(0xffffff, 0.26);
    row.completeSweep.fillRoundedRect(0, -(ROW_H / 2) + 6, 34, ROW_H - 12, 10);
    row.completeSweep.setPosition(-(BOARD_W / 2) + 18, 0);
    row.completeSweep.setAlpha(0);
    row.completeSweep.setVisible(true);

    row.completeText.setAlpha(0);
    row.completeText.setScale(0.84);
    row.completeText.setVisible(true);

    this.scene.tweens.add({
      targets: row.completeFlash,
      alpha: { from: 0.78, to: 0 },
      duration: 620,
      ease: "Cubic.easeOut",
    });
    this.scene.tweens.add({
      targets: row.completeSweep,
      x: (BOARD_W / 2) - 58,
      alpha: { from: 0.92, to: 0 },
      duration: 520,
      ease: "Cubic.easeOut",
    });
    this.scene.tweens.add({
      targets: row.completeText,
      alpha: { from: 0, to: 1 },
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 180,
      ease: "Back.Out",
      yoyo: true,
      hold: 360,
    });
  }

  _emitXpParticlesFrom(originX, originY) {
    const hud = this.scene.townXpHud;
    if (!hud || !this.scene?.add || !this.scene?.tweens) return;

    const trackLeft = Number.isFinite(hud.trackLeft) ? hud.trackLeft : -80;
    const trackWidth = Math.max(60, Number(hud.trackWidth || 120));
    const ratio = Math.max(0.08, Math.min(1, Number(hud.progressRatio || hud.displayedProgressRatio || 0)));
    const targetX = hud.x + trackLeft + Math.round(trackWidth * ratio);
    const targetY = hud.y + 14;
    const colors = [0x8fe7ff, 0xfff0a8, 0xbff6d3];

    for (let i = 0; i < 14; i += 1) {
      const dot = this.scene.add.circle(
        originX + Phaser.Math.Between(-12, 12),
        originY + Phaser.Math.Between(-8, 8),
        Phaser.Math.Between(3, 5),
        colors[i % colors.length],
        0.94
      ).setDepth((UIDEPTH ?? 0) + 34);

      this.scene.tweens.add({
        targets: dot,
        x: targetX + Phaser.Math.Between(-8, 10),
        y: targetY + Phaser.Math.Between(-5, 5),
        alpha: { from: 0.94, to: 0 },
        scaleX: { from: 1, to: 0.35 },
        scaleY: { from: 1, to: 0.35 },
        delay: i * 22,
        duration: 520 + Phaser.Math.Between(0, 120),
        ease: "Cubic.easeInOut",
        onComplete: () => dot.destroy(),
      });
    }
  }

  _pulseHeader() {
    const pulseTarget = this.scene.townXpHud || this.root;
    this.scene.tweens.killTweensOf(pulseTarget);
    pulseTarget.setScale(1);
    this.scene.tweens.add({
      targets: pulseTarget,
      scaleX: 1.03,
      scaleY: 1.03,
      duration: 130,
      ease: "Sine.Out",
      yoyo: true,
    });
  }

  toggle() {
    this.setExpanded(!this.expanded);
  }

  setExpanded(expanded, animate = true) {
    const nextExpanded = !!expanded;
    if (nextExpanded && this._unseenCompletions > 0) {
      this._unseenCompletions = 0;
      this._syncNoticeState();
    }

    this.expanded = nextExpanded;
    this.chevron.setText(this.expanded ? "^" : "v");
    this.scene.tweens.killTweensOf(this.panel);
    this.panel.setVisible(true);
    if (!animate) {
      this.panel.setAlpha(this.expanded ? 1 : 0);
      this.panel.setScale(1, this.expanded ? 1 : 0.94);
      this.panel.setVisible(this.expanded);
    } else {
      this.scene.tweens.add({
        targets: this.panel,
        alpha: this.expanded ? 1 : 0,
        scaleY: this.expanded ? 1 : 0.94,
        duration: 180,
        ease: "Cubic.easeOut",
        onComplete: () => {
          if (!this.expanded) {
            this.panel.setVisible(false);
          }
        },
      });
    }
    this.refresh(true);
    this.scene.townXpHud?.refresh?.(true);
  }

  reposition() {
    const clock = this.scene.phaseClock;
    const panelWidth = Math.max(BOARD_W, Number(clock?.panelWidth || BOARD_W));
    const centerX = clamp(
      Number(clock?.x || (this.scene.scale.width - (panelWidth / 2) - 18)),
      BOARD_W / 2 + 10,
      this.scene.scale.width - BOARD_W / 2 - 10
    );
    const anchorBottom = Number(
      this.scene.phaseClockBottomY
      || (Number(clock?.y || 96) + Number(clock?.panelHeight || 104) / 2)
    );
    const topY = Math.round(anchorBottom + 10 + (HEADER_H / 2));
    this.root.setPosition(centerX, topY);
  }

  getNotificationCount() {
    return this._unseenCompletions;
  }

  _drawNoticeBadge() {
    this.noticeBadgeBg.clear();
    if (this._unseenCompletions <= 0) return;

    this.noticeBadgeBg.fillStyle(0xfff0a8, 0.98);
    this.noticeBadgeBg.lineStyle(2, 0xffffff, 0.28);
    this.noticeBadgeBg.fillRoundedRect((BOARD_W / 2) - 112, -11, 78, 22, 11);
    this.noticeBadgeBg.strokeRoundedRect((BOARD_W / 2) - 112, -11, 78, 22, 11);
  }

  _syncNoticeState() {
    const hasNotice = this._unseenCompletions > 0;
    this.noticeBadgeBg.setVisible(hasNotice);
    this.noticeBadgeText.setVisible(hasNotice);
    this.noticeBadgeText.setText(hasNotice ? `${this._unseenCompletions} DONE` : "");
    this.headerBg.setAlpha(1);
    this._drawNoticeBadge();

    if (!hasNotice) return;
    this.scene.tweens.killTweensOf(this.noticeBadgeText);
    this.noticeBadgeText.setScale(1);
    this.scene.tweens.add({
      targets: this.noticeBadgeText,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 160,
      ease: "Sine.Out",
      yoyo: true,
      repeat: 2,
    });
  }

  refresh(force = false) {
    const snapshot = this.worldScene?.getAchievementBoardSnapshot?.() || {
      serial: 0,
      totalCompleted: 0,
      activeGoals: [],
    };
    const signature = this._goalSignature(snapshot);
    if (!force && signature === this._lastSignature) return;
    this._lastSignature = signature;

    const activeCount = Array.isArray(snapshot.activeGoals) ? snapshot.activeGoals.length : 0;
    this.headerStatus.setText(`${activeCount} ACTIVE  ${snapshot.totalCompleted || 0} DONE`);
    this.chevron.setText(this.expanded ? "^" : "v");
    this._syncNoticeState();
    this.reposition();

    const goalsBySlot = new Map((snapshot.activeGoals || []).map((goal) => [goal.slot, goal]));
    this.rows.forEach((row) => {
      if (row.locked) return;
      this._renderRow(row, goalsBySlot.get(row.slot));
      row.root.setPosition(0, row.root.baseY);
    });
  }

  update() {
    this.refresh(false);
  }

  destroy() {
    this.scene.events.off("achievements:changed", this._onChanged);
    this.scene.events.off("achievement:completed", this._onCompleted);
    this.scene.scale.off("resize", this._resizeHandler);
    this._completionTimers.forEach((timer) => timer?.remove?.(false));
    this._completionTimers.clear();
    this.root?.destroy?.(true);
    this.root = null;
  }
}
