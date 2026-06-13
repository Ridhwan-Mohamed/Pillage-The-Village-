import { CONTROL_STATES, SQUARESIZE } from "../constants"
import Phaser from "phaser"
import { Player } from "../players/Player";
import { Teams } from "../Teams";
import { Manager } from "./Manager";
import { Projectile } from "../Projectile";
import { weapons } from "../weapons";
import { Map } from "../map";
import { AudioManager } from "./AudioManager";
import { InterruptController } from "../ai/scheduler/InterruptController";
import { CombatSpacingCoordinator } from "../ai/CombatSpacingCoordinator";
import { getMarketCritProfile } from "../Cards/MarketBuffs";

export class fightManager{

    static scene; 
    static lastStandEnabled = false;
    static lastStandThreshold = 0.35;
    static lastStandDamageMultiplier = 1.2;

    static _now(sprite = null) {
        const scene = sprite?.scene ?? this.scene;
        return scene?.getSimulationNow?.() ?? scene?.simNowMs ?? scene?.time?.now ?? Date.now();
    }

    static hasAttackRecovery(sprite) {
        if (!sprite) return false;
        if (sprite._attackRecoveryTimer) return true;
        const recoveryUntil = Number(sprite._attackRecoveryUntil || 0);
        return recoveryUntil > this._now(sprite);
    }

    static clearAttackRecovery(sprite, opts = {}) {
        if (!sprite) return;
        if (sprite._attackRecoveryTimer) {
            sprite._attackRecoveryTimer.remove(false);
            sprite._attackRecoveryTimer = null;
        }
        if (opts.clearCooldown) {
            sprite._attackRecoveryUntil = 0;
            sprite._rangedReloadUntil = 0;
        }
    }

    static clearHitReaction(target, { restoreVisual = false } = {}) {
        if (!target) return;
        target._hitFlashResetEvent?.remove?.(false);
        target._hitFlashResetEvent = null;

        const restoreTint = target._hitFlashRestoreTint;
        target._hitFlashRestoreTint = undefined;

        if (!restoreVisual || !target.active || !target.setTint) return;
        if (restoreTint !== undefined) {
            target.setTint(restoreTint);
        } else {
            target.clearTint?.();
        }
    }

    static disengageFromCombat(sprite, reason = "combat_target_lost") {
        if (!sprite) return false;

        const shouldReturnToTrackMode =
            sprite.state === CONTROL_STATES.TRACK_TARGET ||
            sprite.state === CONTROL_STATES.ATTACK_MODE ||
            sprite.taskMeta?.state === CONTROL_STATES.TRACK_TARGET;

        if (sprite.taskMeta?.state === CONTROL_STATES.TRACK_TARGET) {
            InterruptController.interruptTroop(sprite, reason, CONTROL_STATES.TRACK_MODE);
        }

        if (sprite._raiderPlayerChase && typeof sprite.type?._dropPlayerChase === "function") {
            sprite.type._dropPlayerChase(sprite);
            Player.setAnimState(sprite, sprite.idle);
            return true;
        }

        CombatSpacingCoordinator.clearTroopFocus(sprite);
        Player.resetRoamState(sprite);
        Player.clearRecentCombatAttacker?.(sprite);
        Player.clearGunslingerKiteState?.(sprite);
        Player._cleanupBreachTicketsForTroop?.(sprite.body?.team, sprite);
        sprite.track = null;
        sprite.forcedTarget = null;
        sprite.currentPath?.splice?.(0);
        sprite.body?.setVelocity?.(0, 0);
        if (shouldReturnToTrackMode && sprite.state !== CONTROL_STATES.TRACK_MODE) {
            Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_MODE);
        }
        Player.setAnimState(sprite, sprite.idle);
        return true;
    }

    // 🔴 Common on-hit effects: flash red, cancel target timer, knockback team 0
    static applyHitReaction(target, attacker, weapon = attacker?.weapon) {
        if (!target || !target.scene || !target.active) return;

        // 1) Cancel any active timer on the target (interrupt windups, etc.)
        // if (target.timer) {
        //     if (target.timer.remove) {
        //         target.timer.remove(false);
        //     }
        //     target.timer = null;
        // }

        const scene = target.scene;

        // 2) Flash red briefly. Preserve the pre-flash tint across repeated hits.
        if (target._hitFlashRestoreTint === undefined) {
            target._hitFlashRestoreTint = target.tintTopLeft;
        }
        if (target.setTint) {
            target.setTint(0xff0000);
        }
        target._hitFlashResetEvent?.remove?.(false);
        target._hitFlashResetEvent = scene.time.delayedCall(120, () => {
            target._hitFlashResetEvent = null;
            const restoreTint = target._hitFlashRestoreTint;
            target._hitFlashRestoreTint = undefined;
            if (!target.active || !target.setTint) return;

            if (restoreTint !== undefined) {
                target.setTint(restoreTint);
            } else {
                target.clearTint?.();
            }
        });

        const slowMultiplier = Number(weapon?.moveSlowMultiplier);
        const slowDurationMs = Number(weapon?.moveSlowDurationMs);
        if (slowMultiplier > 0 && slowMultiplier < 1 && slowDurationMs > 0) {
            const now = scene.getSimulationNow?.() ?? scene.simNowMs ?? scene.time?.now ?? 0;
            const currentUntil = Number(target.moveSlowUntil) || 0;
            const currentMultiplier = Number(target.moveSlowMultiplier) || 1;
            const nextUntil = now + slowDurationMs;

            target.moveSlowMultiplier = currentUntil > now
                ? Math.min(currentMultiplier, slowMultiplier)
                : slowMultiplier;
            target.moveSlowUntil = Math.max(currentUntil, nextUntil);
        }

        Player.recordRecentCombatAttacker?.(target, attacker);

        const attackerIsPlayerFighter =
            attacker?.body?.team === 1 &&
            Player._isFighterUnit?.(attacker);
        if (target?.isRaider && attackerIsPlayerFighter && !target?.isBomber) {
            target._raiderRetaliationTarget = attacker;
        }

        target?.type?.handleHit?.(target, attacker, weapon);

        // 3) Knockback ONLY team 0 units, away from the attacker
        // if (!attacker || !target.body || target.body.team !== 0) return;

        // const dx = target.x - attacker.x;
        // const dy = target.y - attacker.y;
        // const len = Math.hypot(dx, dy);
        // if (len < 0.0001) return;

        // const nx = dx / len;
        // const ny = dy / len;

        // const knockDist = SQUARESIZE * 0.6;
        // const proposedX = target.x + nx * knockDist;
        // const proposedY = target.y + ny * knockDist;

        // const gx = Math.floor(proposedX / SQUARESIZE);
        // const gy = Math.floor(proposedY / SQUARESIZE);

        // // Respect nav grid if it exists – only knock back into walkable tiles
        // if (!Map.navGrid || !Map.navGrid[gy] || Map.navGrid[gy][gx] !== 1) {
        //     return; // tile blocked or out of bounds → skip knockback
        // }

        // // Prefer a short velocity impulse over teleporting
        // if (target.body.setVelocity) {
        //     const kbSpeed = 250;
        //     target.body.setVelocity(nx * kbSpeed, ny * kbSpeed);

        //     scene.time.delayedCall(120, () => {
        //         if (target.body) {
        //             target.body.setVelocity(0, 0);
        //         }
        //     });
        // } else {
        //     // Fallback: directly move the sprite
        //     target.x = proposedX;
        //     target.y = proposedY;
        // }
    }

    static sendToAttack(){
            const force = Player.selected.length? true : false;
            const troops = Player.selected.length? Player.selected : Teams.teamLists['1'].playerList;
            const fightList = Teams.teamLists['1'].fightingList;
            Manager.assignTroopsToAction(troops, fightList, CONTROL_STATES.TRACK_TARGET, force);
    }

    static playBlademasterSlash(sprite, target) {
        if (!sprite?.active || !target?.active || !sprite.scene?.add) return;

        const angle = Phaser.Math.Angle.Between(sprite.x, sprite.y, target.x, target.y);
        const offset = 18;
        const slashX = sprite.x + Math.cos(angle) * offset;
        const slashY = sprite.y + Math.sin(angle) * offset;
        const slash = sprite.scene.add.sprite(slashX, slashY, sprite.slashFxKey || 'blademaster_slash', 0);

        slash.setOrigin(0.22, 0.5);
        slash.setDepth(Math.max(sprite.depth ?? 0, target.depth ?? 0) + 1);
        slash.setRotation(angle);
        slash.play('blademaster_slash_fx');
        slash.once('animationcomplete', () => slash.destroy());
    }

    static playMeleeLungeFx(sprite, target, opts = {}) {
        if (!sprite?.active || !target?.active || !sprite.scene?.add) return;

        const {
            textureKey,
            startOffset = 10,
            travel = 14,
            startScale = 0.75,
            endScale = 1.1,
            alpha = 0.95,
            duration = 120,
            originX = 0.5,
            originY = 0.9,
        } = opts;

        if (!textureKey) return;

        const angle = Phaser.Math.Angle.Between(sprite.x, sprite.y, target.x, target.y);
        const forwardX = Math.cos(angle);
        const forwardY = Math.sin(angle);
        const startX = sprite.x + forwardX * startOffset;
        const startY = sprite.y + forwardY * startOffset;
        const fx = sprite.scene.add.image(startX, startY, textureKey);

        fx.setOrigin(originX, originY);
        fx.setDepth(Math.max(sprite.depth ?? 0, target.depth ?? 0) + 1);
        fx.setRotation(angle + Math.PI / 2);
        fx.setScale(startScale);
        fx.setAlpha(alpha);

        sprite.scene.tweens.add({
            targets: fx,
            x: startX + forwardX * travel,
            y: startY + forwardY * travel,
            scaleX: endScale,
            scaleY: endScale,
            alpha: 0,
            duration,
            ease: 'Quad.easeOut',
            onComplete: () => fx.destroy(),
        });
    }

    static playAttackPresentation(sprite, target, opts = {}) {
        if (!sprite?.active || !target) return;

        const weapon = opts.weapon ?? sprite.weapon;
        if (!weapon) return;

        Player.faceTarget?.(sprite, target, opts);

        if (!weapon.projectile) {
            if (sprite.isBlademaster) {
                this.playBlademasterSlash(sprite, target);
            } else if (sprite.isBrawler) {
                this.playMeleeLungeFx(sprite, target, {
                    textureKey: sprite.meleeFxKey || 'brawler_boxing_glove_fx',
                    startOffset: 8,
                    travel: 18,
                    startScale: 0.72,
                    endScale: 1.18,
                    duration: 135,
                    originX: 0.5,
                    originY: 0.88,
                });
            } else if (sprite.isRaider || sprite.isFortGrunt || sprite.meleeFxKey) {
                this.playMeleeLungeFx(sprite, target, {
                    textureKey: sprite.meleeFxKey || 'raider_hands_fx',
                    startOffset: 8,
                    travel: 13,
                    startScale: 0.78,
                    endScale: 1.06,
                    duration: 115,
                    originX: 0.5,
                    originY: 0.88,
                });
            }
        }

        if (opts.playAudio === false) return;
        AudioManager.playWeaponAttack(sprite, weapon, opts.audioOpts ?? {
            volume: weapon.projectile ? 0.45 : 0.32,
            cooldownMs: weapon.projectile ? 60 : 80,
        });
    }

    static _scheduleAttackRecovery(sprite, weapon) {
        if (!sprite?.active || !weapon || this.hasAttackRecovery(sprite)) return;

        const duration = Math.max(0, Number(weapon.duration || 0));
        sprite._attackRecoveryUntil = this._now(sprite) + duration;
        sprite._attackRecoveryTimer = sprite.scene.time.delayedCall(duration, () => {
            sprite._attackRecoveryTimer = null;
            sprite._attackRecoveryUntil = 0;
            if (!sprite?.active) return;

            const currentTracked = sprite.track && sprite.track[0];
            if (
                !currentTracked ||
                !currentTracked.gameObject ||
                !currentTracked.gameObject.active ||
                currentTracked.gameObject.health <= 0
            ) {
                this.disengageFromCombat(sprite, "combat_target_lost");
                return;
            }

            const target = currentTracked.gameObject;
            const inRange = Phaser.Math.Distance.Between(sprite.x, sprite.y, target.x, target.y) <= weapon.range;
            const hasLoS = !weapon.projectile || Projectile.hasLineOfSight(sprite, target);
            if (!inRange || !hasLoS) {
                Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_TARGET);
                Player.setAnimState(sprite, sprite.walk);
                Player.updateTracking(sprite);
                return;
            }

            this.attack(sprite);
        });
    }

    static _showAttackGhostText(scene, x, y, text, color) {
        if (!scene?.add) return;
        const ghost = scene.add.text(x, y, text, {
            fontSize: '14px',
            fill: color,
            stroke: '#000000',
            strokeThickness: 2
        }).setDepth(100).setOrigin(0.5);

        scene.tweens.add({
            targets: ghost,
            y: ghost.y - 20,
            alpha: 0,
            duration: 800,
            ease: 'Cubic.easeOut',
            onComplete: () => ghost.destroy()
        });
    }

    static getAttackerDamageMultiplier(attacker) {
        if (!attacker?.active) return 1;
        if (!this.lastStandEnabled) return 1;

        const maxHealth = Math.max(1, Number(attacker.maxHealth ?? attacker.health ?? 1) || 1);
        const currentHealth = Math.max(0, Number(attacker.health ?? maxHealth) || 0);
        const threshold = Math.max(0, Number(this.lastStandThreshold ?? 0.35) || 0.35);
        if ((currentHealth / maxHealth) > threshold) return 1;

        return Math.max(1, Number(this.lastStandDamageMultiplier ?? 1.2) || 1.2);
    }

    static getModifiedWeaponDamage(attacker, damage) {
        const baseDamage = Math.max(0, Number(damage) || 0);
        if (!(baseDamage > 0)) return 0;
        return Math.max(1, Math.round(baseDamage * this.getAttackerDamageMultiplier(attacker)));
    }

    static attack(sprite) {
        if (this.hasAttackRecovery(sprite)) return;

        // Always resolve the current tracked target from sprite.track
        const tracked = sprite.track && sprite.track[0];
        if (!tracked || !tracked.gameObject || !tracked.gameObject.active) {
            this.disengageFromCombat(sprite, "combat_target_lost");
            return;
        }

        const target = tracked.gameObject;
        const weapon = sprite.weapon;
        if (!weapon) return;

        const inRangeNow = Phaser.Math.Distance.Between(sprite.x, sprite.y, target.x, target.y) <= weapon.range;
        const hasLoSNow = !weapon.projectile || Projectile.hasLineOfSight(sprite, target);
        if (!inRangeNow || !hasLoSNow) {
            Teams.movePlayerState(sprite, CONTROL_STATES.TRACK_TARGET);
            Player.setAnimState(sprite, sprite.walk);
            Player.updateTracking(sprite);
            return;
        }

        this.playAttackPresentation(sprite, target, {
            playAudio: !weapon.projectile,
        });

        // Projectile weapon (gunslinger, etc.)
        if (weapon.projectile) {
            const leadPos = Projectile.leadAndAngle(sprite, target, weapon.speed);
            const angle = Phaser.Math.Angle.Between(sprite.x, sprite.y, leadPos.x, leadPos.y);
            new Projectile(sprite.x, sprite.y, angle, sprite.body.team, weapon, sprite);
            Player.markRangedReload?.(sprite, weapon.duration);
            this._scheduleAttackRecovery(sprite, weapon);
            return;
        }

        // Accuracy and crit rolls
        const accuracyRoll = Phaser.Math.Between(0, 100);
        const critRoll = Phaser.Math.Between(0, 100);
        const isHit = accuracyRoll <= weapon.accuracy;
        const isCrit = critRoll <= weapon.critProb;

        const textX = target.x || 0;
        const textY = target.y || 0;

        let damage = 0;
        let text = '';
        let color = '#ffffff';

        if (isHit) {
            damage = this.getModifiedWeaponDamage(sprite, isCrit ? weapon.critDmg : weapon.baseDmg);

            fightManager.applyHitReaction(target, sprite, weapon);
            target.health = Math.max(0, target.health - damage);
            Player.showMiniBarsOnHit(target);

            text = isCrit ? `CRIT ${damage}` : `HIT ${damage}`;
            color = sprite.body.team === 1 ? '#00ff00' : '#ff3333';
        } else {
            text = 'MISS';
            color = sprite.body.team === 1 ? '#ff3333' : '#aaaaaa';
        }

        this._showAttackGhostText(sprite.scene, textX, textY, text, color);

        if (target.health <= 0) {
            this.checkForKillReward(sprite.body.team, target);
            Player._cleanupCombatTicketForTarget?.(sprite.body.team, target);
            Player.destroyPlayer(target);
            if (sprite.track?.[0]?.gameObject === target || sprite.forcedTarget === target) {
                this.disengageFromCombat(sprite, "combat_target_killed");
            }
            return;
        }

        this._scheduleAttackRecovery(sprite, weapon);
    }


    static checkForKillReward(teamNumber, target){
        if(teamNumber && target.killReward){
            this.scene.updateMoney(target.killReward, {
                sourceWorldX: Number(target?.x),
                sourceWorldY: Number(target?.y),
            });
        }
        if (Number(teamNumber) === 1 && target?.body?.team !== 1) {
            this.scene?.registerRunEnemyDefeat?.(target, {
                sourceX: Number(target?.x),
                sourceY: Number(target?.y),
            });
        }
    }

    static calculateHitResultFromWeapon(weapon, attacker = null) {
        if (!weapon) {
            return {
                hit: false,
                missed: true,
                isCrit: false,
                damage: 0
            };
        }

        const hitRoll = Phaser.Math.Between(0, 100);
        const hit = hitRoll < weapon.accuracy; // e.g., accuracy = 80 means 80% chance to hit

        if (!hit) {
            return {
                hit: false,
                missed: true,
                isCrit: false,
                damage: 0
            };
        }

        const critProfile = getMarketCritProfile(attacker, weapon);
        const critChance = Math.max(0, Number(weapon.critProb || 0) + Number(critProfile.critChanceBonus || 0));
        const isCrit = Phaser.Math.Between(0, 100) < critChance;
        const critDamage = Math.max(
            1,
            Math.round(Number(weapon.critDmg || weapon.baseDmg || 1) * Math.max(1, Number(critProfile.critDamageMultiplier || 1)))
        );
        const damage = this.getModifiedWeaponDamage(attacker, isCrit ? critDamage : weapon.baseDmg);

        return {
            hit: true,
            missed: false,
            isCrit,
            damage
        };
    }
}
