// src/UI/StageHud.js
//
// Tiny world-space HUD label for horde progression.
// Renders with the world camera.

import { UIDEPTH } from "../constants";
import { StageState } from "../parcelController/StageState";

export function ensureStageHud(scene, {
  x = 12,
  y = 50
} = {}) {
  if (scene._stageHud) return scene._stageHud;

  const txt = scene.add.text(x, y, "", {
    fontFamily: "Bungee",
    fontSize: "16px",
    color: "#ffffff",
    stroke: "#000000",
    strokeThickness: 4,
  }).setOrigin(0, 0).setDepth((UIDEPTH ?? 2000) + 1000);

  txt.setScrollFactor(0);

  function recompute() {
    const stageIndex = Math.max(1, Number(StageState.stageIndex || 1));
    txt.setText(`Horde ${stageIndex}`);
  }

  recompute();
  scene.events.on("stage:changed", recompute);

  scene._stageHud = { txt, recompute, destroy: () => txt.destroy() };
  return scene._stageHud;
}
