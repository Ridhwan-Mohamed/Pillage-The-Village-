import Phaser from "phaser";
import { UIDEPTH } from "../constants";
import { applyPortraitKeyToSprite, createPlayerPortraitAnimations } from "../players/playerPortraits.js";

const DEFAULT_ACCENT_COLOR = 0xf6c86c;
const DEFAULT_GLOW_COLOR = 0xffefb1;
const DEFAULT_PANEL_COLOR = 0x111827;
const DEFAULT_SUBTEXT_COLOR = "#d7dce9";

const PLACEHOLDER_BOSS_UNLOCKS = Object.freeze({});

function safeDestroy(go) {
  if (!go) return;
  try {
    go.destroy?.();
  } catch {}
}

function safeCall(fn, ...args) {
  if (typeof fn !== "function") return;
  try {
    return fn(...args);
  } catch (err) {
    console.error("[BossUnlockRewardSystem] reward hook failed", err);
    return undefined;
  }
}

function toColorNumber(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      return Phaser.Display.Color.HexStringToColor(value).color;
    } catch {}
  }
  return fallback;
}

function toColorHex(value, fallback) {
  const n = toColorNumber(value, fallback);
  return `#${n.toString(16).padStart(6, "0")}`;
}

function addManagedTween(scene, ctx, config) {
  const tween = scene.tweens.add(config);
  ctx.tweens.push(tween);
  return tween;
}

function cloneReward(reward) {
  return reward ? { ...reward } : null;
}

function ensureCompositeTexture(scene, compositeArt) {
  const textureKey = compositeArt?.textureKey;
  if (!textureKey) return null;
  if (scene.textures.exists(textureKey)) return textureKey;

  const width = Math.max(1, Math.floor(Number(compositeArt.width) || 96));
  const height = Math.max(1, Math.floor(Number(compositeArt.height) || 96));
  const rt = scene.make.renderTexture({ width, height, add: false });
  rt.clear();

  for (const part of compositeArt.parts ?? []) {
    const key = part?.key;
    if (typeof key !== "string" || !scene.textures.exists(key)) continue;

    const x = Number.isFinite(part.x) ? part.x : width / 2;
    const y = Number.isFinite(part.y) ? part.y : height / 2;
    const scale = Number.isFinite(part.scale) ? part.scale : 1;
    const art = part.useSprite
      ? scene.make.sprite({ x, y, key, frame: part.frame ?? 0, add: false })
      : scene.make.image({ x, y, key, add: false });
    art.setOrigin(0.5);
    art.setScale(scale);
    rt.draw(art);
    art.destroy();
  }

  rt.saveTexture(textureKey);
  rt.destroy();
  return textureKey;
}

function getDisplayEntries(reward) {
  if (reward?.compositeArt) {
    return [
      {
        key: reward.compositeArt.textureKey ?? null,
        compositeArt: reward.compositeArt,
        portraitKey: null,
        emoji: reward.emoji ?? null,
        label: reward.displayLabel ?? "Store Preview",
        tintColor: reward.imageTint,
      },
    ];
  }

  if (typeof reward?.portraitKey === "string" && reward.portraitKey.trim()) {
    return [
      {
        key: null,
        compositeArt: null,
        portraitKey: reward.portraitKey,
        emoji: null,
        label: reward.displayLabel ?? "Store Preview",
        tintColor: reward.imageTint,
      },
    ];
  }

  if (typeof reward?.emoji === "string" && reward.emoji.trim()) {
    return [
      {
        key: null,
        compositeArt: null,
        portraitKey: null,
        emoji: reward.emoji,
        label: reward.displayLabel ?? "Store Preview",
        tintColor: reward.imageTint,
      },
    ];
  }

  const keys = [reward?.imageKey, reward?.imageKey2].filter(
    (key) => typeof key === "string" && key.trim().length > 0
  );

  if (!keys.length) {
    return [{ key: null, label: reward.displayLabel ?? "Store Preview", tintColor: reward.imageTint }];
  }

  return keys.map((key, index) => ({
    key,
    compositeArt: null,
    portraitKey: null,
    emoji: null,
    label: keys.length === 1 ? reward.displayLabel ?? "Store Preview" : `Preview ${index + 1}`,
    tintColor: index === 1 && reward.imageTint2 != null ? reward.imageTint2 : reward.imageTint,
  }));
}

function createArtSlot(
  scene,
  {
    x,
    y,
    key,
    compositeArt,
    portraitKey,
    emoji,
    label,
    accentColor,
    panelColor,
    tintColor,
  }
) {
  const slot = scene.add.container(x, y);
  const width = 194;
  const height = 196;

  const shadow = scene.add.rectangle(0, 12, width + 12, height + 12, 0x000000, 0.34);
  const frame = scene.add
    .rectangle(0, 0, width, height, panelColor, 0.98)
    .setStrokeStyle(2, accentColor, 0.96);
  const inner = scene.add
    .rectangle(0, -8, width - 18, height - 54, 0xffffff, 0.05)
    .setStrokeStyle(1, 0xffffff, 0.1);
  const accentBar = scene.add.rectangle(0, -92, 106, 4, accentColor, 1);

  const compositeKey = compositeArt ? ensureCompositeTexture(scene, compositeArt) : null;
  const resolvedKey = compositeKey ?? key;
  const hasPortrait = typeof portraitKey === "string" && scene.textures.exists(portraitKey);
  const hasTexture = typeof resolvedKey === "string" && scene.textures.exists(resolvedKey);
  let art;

  if (hasPortrait) {
    createPlayerPortraitAnimations(scene);
    const portraitPlate = scene.add
      .circle(0, -8, 56, 0xffffff, 0.08)
      .setStrokeStyle(2, accentColor, 0.28);
    art = scene.add.sprite(0, -8, portraitKey).setOrigin(0.5);
    applyPortraitKeyToSprite(scene, art, portraitKey, 92);
    slot.add(portraitPlate);
    slot.sendToBack(portraitPlate);
  } else if (hasTexture) {
    art = scene.add.image(0, -8, resolvedKey);
    const scale = Math.min(118 / Math.max(art.width, 1), 118 / Math.max(art.height, 1));
    art.setScale(Math.min(2.25, Math.max(0.65, scale)));
    if (tintColor != null) {
      art.setTint(toColorNumber(tintColor, 0xffffff));
    }
  } else if (typeof emoji === "string" && emoji.trim()) {
    art = scene.add
      .text(0, -8, emoji, {
        fontSize: "82px",
        fontFamily: "Arial",
        color: "#ffffff",
        align: "center",
        stroke: "#05070d",
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    const emojiPlate = scene.add
      .circle(0, -8, 54, 0xffffff, 0.08)
      .setStrokeStyle(2, accentColor, 0.28);

    slot.add(emojiPlate);
    slot.sendToBack(emojiPlate);
  } else {
    const fallbackText = resolvedKey ? `Art pending\n${resolvedKey}` : "Reward art\ncoming soon";
    art = scene.add
      .text(0, -6, fallbackText, {
        fontSize: "13px",
        fontFamily: "Bungee",
        color: DEFAULT_SUBTEXT_COLOR,
        align: "center",
        stroke: "#05070d",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
  }

  const labelText = scene.add
    .text(0, 72, label, {
      fontSize: "11px",
      fontFamily: "Bungee",
      color: DEFAULT_SUBTEXT_COLOR,
      stroke: "#05070d",
      strokeThickness: 3,
      align: "center",
    })
    .setOrigin(0.5);

  slot.add([shadow, frame, inner, accentBar, art, labelText]);

  return {
    container: slot,
    art,
  };
}

export function getBossUnlockReward(stageIndex, seasonIndex = 1) {
  const season = Math.max(1, Number(seasonIndex) || 1);
  const specificReward = PLACEHOLDER_BOSS_UNLOCKS[season];

  if (specificReward) {
    return cloneReward(specificReward);
  }

  return null;
}

export function openBossUnlockRewardPresentation(scene, { reward, onComplete } = {}) {
  const worldScene = scene;
  const hostScene = scene?.uiScene ?? scene;
  const rewardDef = {
    id: "boss_unlock_placeholder",
    title: "New Unlock",
    description: "A new boss reward has been unlocked.",
    badgeLabel: "BOSS REWARD UNLOCKED",
    subLabel: "NEW STORE ITEM",
    accentColor: DEFAULT_ACCENT_COLOR,
    glowColor: DEFAULT_GLOW_COLOR,
    panelColor: DEFAULT_PANEL_COLOR,
    ...(reward ?? {}),
  };

  const ctx = {
    done: false,
    destroyers: [],
    tweens: [],
  };

  const cleanup = () => {
    ctx.tweens.forEach((tween) => {
      try {
        tween?.remove?.();
      } catch {}
    });
    ctx.tweens.length = 0;

    ctx.destroyers.forEach((fn) => {
      try {
        fn?.();
      } catch {}
    });
    ctx.destroyers.length = 0;
  };

  const finish = () => {
    if (ctx.done) return;
    ctx.done = true;
    cleanup();
    onComplete?.(rewardDef);
  };

  const keyboardScenes = [];
  const lockKeyboard = (targetScene) => {
    if (!targetScene?.input?.keyboard) return;
    keyboardScenes.push({
      scene: targetScene,
      enabled: targetScene.input.keyboard.enabled,
    });
    targetScene.input.keyboard.enabled = false;
  };

  lockKeyboard(worldScene);
  if (hostScene !== worldScene) {
    lockKeyboard(hostScene);
  }

  ctx.destroyers.push(() => {
    keyboardScenes.forEach(({ scene: targetScene, enabled }) => {
      if (targetScene?.input?.keyboard) {
        targetScene.input.keyboard.enabled = enabled;
      }
    });
  });

  safeCall(rewardDef.onGrant, worldScene);

  const cam = hostScene.cameras.main;
  const accentColor = toColorNumber(rewardDef.accentColor, DEFAULT_ACCENT_COLOR);
  const glowColor = toColorNumber(rewardDef.glowColor, DEFAULT_GLOW_COLOR);
  const panelColor = toColorNumber(rewardDef.panelColor, DEFAULT_PANEL_COLOR);
  const textColor = toColorHex(rewardDef.textColor, 0xffffff);
  const subTextColor = toColorHex(rewardDef.subTextColor, 0xd7dce9);
  const depth = (UIDEPTH ?? 2000) + 4000;

  const root = hostScene.add.container(cam.centerX, cam.centerY).setDepth(depth);
  root.setScrollFactor(0);

  const shade = hostScene.add
    .rectangle(0, 0, cam.width, cam.height, 0x05070d, 0.82)
    .setInteractive({ useHandCursor: false });
  const glowLeft = hostScene.add.circle(-215, -36, 176, glowColor, 0.18);
  const glowRight = hostScene.add.circle(245, 92, 154, accentColor, 0.14);
  const centerHalo = hostScene.add.circle(0, 8, 248, accentColor, 0.08);

  const panel = hostScene.add.container(0, 0);
  const panelShadow = hostScene.add.rectangle(0, 18, 724, 510, 0x000000, 0.32);
  const panelBg = hostScene.add
    .rectangle(0, 0, 696, 486, panelColor, 0.98)
    .setStrokeStyle(3, accentColor, 0.94);
  const topStrip = hostScene.add.rectangle(0, -184, 696, 10, accentColor, 1);
  const badgeBg = hostScene.add.rectangle(0, -145, 272, 34, accentColor, 0.96);
  const badgeText = hostScene.add
    .text(0, -145, rewardDef.badgeLabel, {
      fontSize: "14px",
      fontFamily: "Bungee",
      color: "#1a1407",
      stroke: "#fff7d1",
      strokeThickness: 1,
    })
    .setOrigin(0.5);
  const title = hostScene.add
    .text(0, -92, rewardDef.title, {
      fontSize: "32px",
      fontFamily: "Bungee",
      color: textColor,
      stroke: "#05070d",
      strokeThickness: 5,
      align: "center",
      wordWrap: { width: 590 },
    })
    .setOrigin(0.5);
  const description = hostScene.add
    .text(0, -28, rewardDef.description, {
      fontSize: "14px",
      fontFamily: "Bungee",
      color: subTextColor,
      stroke: "#05070d",
      strokeThickness: 4,
      align: "center",
      wordWrap: { width: 560 },
    })
    .setOrigin(0.5);
  const divider = hostScene.add.rectangle(0, 38, 540, 2, accentColor, 0.45);
  const subLabel = hostScene.add
    .text(0, 56, rewardDef.subLabel, {
      fontSize: "12px",
      fontFamily: "Bungee",
      color: toColorHex(accentColor, DEFAULT_ACCENT_COLOR),
      stroke: "#05070d",
      strokeThickness: 3,
    })
    .setOrigin(0.5);

  const artContainer = hostScene.add.container(0, 118);
  const artSlots = [];
  const displayEntries = getDisplayEntries(rewardDef);
  const slotXs = displayEntries.length === 1 ? [0] : [-118, 118];

  displayEntries.forEach((entry, index) => {
    const slot = createArtSlot(hostScene, {
      x: slotXs[index] ?? 0,
      y: 0,
      key: entry.key,
      compositeArt: entry.compositeArt,
      portraitKey: entry.portraitKey,
      emoji: entry.emoji,
      label: entry.label,
      accentColor,
      panelColor,
      tintColor: entry.tintColor,
    });
    artSlots.push(slot);
    artContainer.add(slot.container);
  });

  const continueBg = hostScene.add
    .rectangle(0, 230, 220, 48, accentColor, 0.92)
    .setStrokeStyle(2, 0xffffff, 0.18)
    .setInteractive({ useHandCursor: true });
  const continueText = hostScene.add
    .text(0, 230, "Continue", {
      fontSize: "18px",
      fontFamily: "Bungee",
      color: "#1a1407",
      stroke: "#fff7d1",
      strokeThickness: 1,
    })
    .setOrigin(0.5);

  continueBg.on("pointerover", () => {
    continueBg.setScale(1.03);
  });
  continueBg.on("pointerout", () => {
    continueBg.setScale(1);
  });
  continueBg.on("pointerdown", () => {
    finish();
  });

  panel.add([
    panelShadow,
    panelBg,
    topStrip,
    badgeBg,
    badgeText,
    title,
    description,
    divider,
    subLabel,
    artContainer,
    continueBg,
    continueText,
  ]);

  root.add([shade, glowLeft, glowRight, centerHalo, panel]);

  const fadeTargets = [badgeBg, badgeText, title, description, divider, subLabel, continueBg, continueText];
  fadeTargets.forEach((target) => target.setAlpha(0));
  [glowLeft, glowRight, centerHalo].forEach((target) => {
    target.setAlpha(0);
    target.setScale(0.78);
  });
  panel.setAlpha(0);
  panel.setScale(0.9);
  panel.y += 26;

  artSlots.forEach(({ container }) => {
    container.setAlpha(0);
    container.setScale(0.82);
    container.y += 18;
  });

  addManagedTween(hostScene, ctx, {
    targets: shade,
    alpha: { from: 0, to: 0.82 },
    duration: 180,
    ease: "Quad.easeOut",
  });
  addManagedTween(hostScene, ctx, {
    targets: [glowLeft, glowRight, centerHalo],
    alpha: 1,
    scaleX: 1,
    scaleY: 1,
    duration: 420,
    ease: "Cubic.easeOut",
  });
  addManagedTween(hostScene, ctx, {
    targets: panel,
    alpha: 1,
    y: panel.y - 26,
    scaleX: 1,
    scaleY: 1,
    duration: 360,
    ease: "Back.easeOut",
  });
  addManagedTween(hostScene, ctx, {
    targets: fadeTargets,
    alpha: 1,
    duration: 280,
    delay: 110,
    ease: "Quad.easeOut",
  });

  artSlots.forEach(({ container }, index) => {
    addManagedTween(hostScene, ctx, {
      targets: container,
      alpha: 1,
      y: container.y - 18,
      scaleX: 1,
      scaleY: 1,
      duration: 300,
      delay: 180 + index * 80,
      ease: "Back.easeOut",
    });
  });

  addManagedTween(hostScene, ctx, {
    targets: [glowLeft, glowRight, centerHalo],
    scaleX: 1.05,
    scaleY: 1.05,
    alpha: 0.9,
    duration: 1600,
    delay: 420,
    ease: "Sine.easeInOut",
    yoyo: true,
    repeat: -1,
  });
  addManagedTween(hostScene, ctx, {
    targets: continueBg,
    scaleX: 1.03,
    scaleY: 1.03,
    duration: 900,
    delay: 620,
    ease: "Sine.easeInOut",
    yoyo: true,
    repeat: -1,
  });

  ctx.destroyers.push(() => {
    safeDestroy(root);
  });

  return {
    destroy: () => {
      if (ctx.done) return;
      ctx.done = true;
      cleanup();
    },
  };
}
