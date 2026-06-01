export function isOverviewMode(scene) {
  return scene?.zoomMixer?.mode === "overview";
}

export function animateOverlayPop(scene, target, visible, opts = {}) {
  if (!target) {
    opts.onComplete?.();
    return null;
  }

  const duration = Math.max(0, Number(opts.duration ?? 150) || 0);
  const targetAlpha = Number.isFinite(Number(opts.alpha)) ? Number(opts.alpha) : 1;
  const hiddenScale = Number.isFinite(Number(opts.hiddenScale)) ? Number(opts.hiddenScale) : 0.82;
  const easeIn = opts.easeIn || "Back.easeOut";
  const easeOut = opts.easeOut || "Back.easeIn";

  target._overlayPopTween?.remove?.();
  target._overlayPopTween = null;

  if (!scene?.tweens || duration <= 0) {
    target.setVisible?.(!!visible);
    target.setAlpha?.(visible ? targetAlpha : 0);
    target.setScale?.(visible ? 1 : hiddenScale);
    opts.onComplete?.();
    return null;
  }

  scene.tweens.killTweensOf?.(target);

  if (visible) {
    target.setVisible?.(true);
    target.setAlpha?.(0);
    target.setScale?.(hiddenScale);
    target._overlayPopTween = scene.tweens.add({
      targets: target,
      alpha: targetAlpha,
      scale: 1,
      duration,
      ease: easeIn,
      onComplete: () => {
        target._overlayPopTween = null;
        opts.onComplete?.();
      },
    });
  } else {
    target._overlayPopTween = scene.tweens.add({
      targets: target,
      alpha: 0,
      scale: hiddenScale,
      duration,
      ease: easeOut,
      onComplete: () => {
        target._overlayPopTween = null;
        target.setVisible?.(false);
        opts.onComplete?.();
      },
    });
  }

  return target._overlayPopTween;
}
