import { SQUARESIZE, TILE_TYPES, removeFromArray, showAlert, showGhostText } from "../constants";
import { Teams } from "../Teams";
import { Map as GameMap } from "../map";
import { blockResourceManager } from "../Manager/BlockResourceManager";
import { buildingManager } from "../Manager/buildingManager";
import { VisibilitySystem } from "../UI/VisibilitySystem";
import { OrderRunner } from "../orders/OrderRunner";
import { getGoldOrePayout, getGoldOreStagePayout } from "../balance/GameBalance";

export class RockNode {
  static scene;

  static init(scene) {
    RockNode.scene = scene;
  }

  // gridX, gridY are TOP-LEFT of the blocked footprint
  constructor(gridX, gridY, level = 1, opts = {}) {
    const scene = RockNode.scene;
    this.gridX = gridX;
    this.gridY = gridY;
    this.resourceTileType = opts.tileType || TILE_TYPES.rock;
    this.resourceKind = opts.resourceKind || (this.resourceTileType?.name === TILE_TYPES.goldOre?.name ? "gold" : "stone");
    this.footprintW = this.resourceTileType.lenX ?? 1;
    this.footprintH = this.resourceTileType.lenY ?? 1;
    this.maxHealth = 3;
    this.health = 3;
    this.task = null;
    this._lastClickTime = 0;
    this.flashTween = null;
    this.active = true;
    this.moneyReward = Math.max(0, Number(opts.moneyReward ?? (this.resourceKind === "gold" ? getGoldOrePayout(scene, 1, this.maxHealth) : 0)) || 0);
    this.moneyRewardRemaining = Math.max(0, Number(opts.moneyRewardRemaining ?? this.moneyReward) || 0);

    const cx = (gridX + this.footprintW / 2) * SQUARESIZE;
    const cy = (gridY + this.footprintH / 2) * SQUARESIZE;
    this.sprite = scene.add
      .sprite(cx, cy, this.resourceTileType?.value || "rock3")
      .setDepth(this.resourceTileType?.depth ?? TILE_TYPES.rock.depth)
      .setInteractive({ cursor: "pointer" });
    this.collider = GameMap.addStructureBarrier(
      cx,
      cy,
      this.footprintW * SQUARESIZE,
      this.footprintH * SQUARESIZE,
      {
        structureOwner: this,
      }
    );

    this.sprite.ownerNode = this;
    GameMap.addToWorldStatic(this.sprite);
    this.lightId = VisibilitySystem.addLightSource({
      x: gridX + this.footprintW / 2,
      y: gridY + this.footprintH / 2,
      r: 3.3,
      brightness: 0.95,
    });

    this.setLevel(level);
    this.setUpHitDetection();
  }

  setLevel(level) {
    this.level = level;
    const textures = Array.isArray(this.resourceTileType?.images) && this.resourceTileType.images.length >= 3
      ? this.resourceTileType.images
      : TILE_TYPES.rock.images;
    if (level <= 1) this.sprite.setTexture(textures[2]);
    else if (level === 2) this.sprite.setTexture(textures[1]);
    else this.sprite.setTexture(textures[0]);
  }

  setUpHitDetection() {
    this.sprite.on("pointerover", (pointer) => {
      RockNode.scene.setForagerRouteHover?.(this, this.resourceKind, true, pointer);
      const inPlaceMode = RockNode.scene.breakItems && RockNode.scene.breakItems.text === "Place";
      if (inPlaceMode) this.sprite.setTint(0x888888);
      else this.sprite.setTint(0xaaaaaa);
    });

    this.sprite.on("pointerout", (pointer) => {
      RockNode.scene.setForagerRouteHover?.(this, this.resourceKind, false, pointer);
      if (!this.flashTween) this.sprite?.clearTint?.();
    });

    this.sprite.on("pointerdown", () => {
      const team = Teams.teamLists["1"];
      if (!team) return;
      const selection = OrderRunner.getSelectionProfile();

      if (RockNode.scene.tryIssueForagerRouteToNode?.(this, this.resourceKind)) {
        return;
      }

      const now = RockNode.scene.time.now;
      if (this._lastClickTime && now - this._lastClickTime < 300) {
        blockResourceManager.cancelManualClickTasksForNode(1, this);
        return;
      }
      this._lastClickTime = now;

      if (!buildingManager.isBlockAccessible(this.gridX, this.gridY, this.resourceTileType)) {
        showAlert(RockNode.scene, `Can't reach that ${this.resourceTileType?.label || "resource"}`);
        return;
      }

      if (selection.allForagers && OrderRunner.hasPendingGatherPlacement()) {
        OrderRunner.issuePendingGatherPlacement(selection.troops, this.sprite.x, this.sprite.y);
        return;
      }

      blockResourceManager.queueManualClickTask(this, {
        teamNumber: 1,
        eligibleTroopIds: selection.allForagers ? selection.troops.map(troop => troop.id) : null,
      });
    });
  }

  startFlash() {
    if (this.flashTween) return;
    this.flashTween = RockNode.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 350,
      yoyo: true,
      repeat: -1,
      onUpdate: (tw) => {
        const on = tw.getValue() > 0.5;
        if (on) this.sprite?.setTint?.(0x636363);
        else this.sprite?.clearTint?.();
      },
    });
  }

  stopFlash() {
    if (this.flashTween) {
      this.flashTween.stop();
      this.flashTween.remove();
      this.flashTween = null;
    }
    this.sprite?.clearTint?.();
  }

  applyBlockDamage(remaining) {
    this.health = remaining;
    if (remaining >= 3) this.setLevel(1);
    else if (remaining === 2) this.setLevel(2);
    else if (remaining === 1) this.setLevel(3);
    else {
      this.stopFlash();
      this.destroy();
    }
  }

  grantGatherReward(scene = RockNode.scene, _sprite = null, nextHealth = this.health) {
    if (this.resourceKind !== "gold") return false;
    const remainingReward = Math.max(0, Number(this.moneyRewardRemaining || 0));
    if (!(remainingReward > 0)) return true;

    const next = Math.max(0, Number(nextHealth || 0));
    const stagePayout = getGoldOreStagePayout(scene);
    const amount = next <= 0
      ? remainingReward
      : Math.max(0, Math.min(remainingReward, stagePayout));
    if (!(amount > 0)) return true;

    const sourceX = Number(this.sprite?.x ?? ((this.gridX + this.footprintW / 2) * SQUARESIZE));
    const sourceY = Number(this.sprite?.y ?? ((this.gridY + this.footprintH / 2) * SQUARESIZE));
    this.moneyRewardRemaining = Math.max(0, remainingReward - amount);
    scene?.updateMoney?.(amount, {
      sourceWorldX: sourceX,
      sourceWorldY: sourceY,
    });
    showGhostText(scene, sourceX, sourceY - 14, `+$${amount}`, 0, 0, 0, "#facc15");
    return true;
  }

  destroy() {
    if (!this.sprite) return;
    this.active = false;
    RockNode.scene.setForagerRouteHover?.(this, this.resourceKind, false);
    this.stopFlash();
    if (this.lightId != null) {
      VisibilitySystem.removeLightById(this.lightId);
      this.lightId = null;
    }
    if (this.task?.value === this) this.task.value = null;
    this.task = null;
    GameMap.removeStructureBarrier(this.collider);
    this.collider = null;
    removeFromArray(GameMap.worldStones, this);
    GameMap.removeFromWorldStatic(this.sprite, true);
    this.sprite = null;
  }
}
