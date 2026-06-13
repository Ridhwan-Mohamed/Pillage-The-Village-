import Phaser from "phaser";
import { CONTROL_STATES, showGhostText, SQUARESIZE, TILE_TYPES, UIDEPTH } from "./constants";
import { Map } from "./map";
import { fightManager } from "./Manager/fightManager";
import { Player } from "./players/Player";
import { Teams } from "./Teams";
import { buildingManager } from "./Manager/buildingManager";
import { AudioManager } from "./Manager/AudioManager";
import { CombatSpacingCoordinator } from "./ai/CombatSpacingCoordinator";
import { playSmokeClearing } from "./FX/SmokeClearing";

const TEAM_HIT_EFFECT_TINTS = {
    0: 0xff4d3d,
    1: 0x44ff44,
};
const HIT_EFFECT_DEPTH = (UIDEPTH ?? 10) + 140;

export class Projectile {
    static scene;
    static projectileGroup;

    static init(scene) {
        this.scene = scene;
        this.projectileGroup = this.scene.physics.add.group();
    }

    constructor(x, y, angle, teamNumber, weapon, player = null, offset = false, options = null) {
        // Offset the starting position by 25 units in the direction of the angle
        const speed = weapon?.speed ?? 0;
        let offsetX = 0, offsetY = 0;
        if(typeof offset === "number"){
            offsetX = Math.cos(angle) * offset;
            offsetY = Math.sin(angle) * offset;
        }
        else if(offset){
            offsetX = Math.cos(angle) * 25;
            offsetY = Math.sin(angle) * 25;
        }
        const startX = x + offsetX;
        const startY = y + offsetY;

        if(player) AudioManager.playWeaponAttack(player, player.weapon);

        // Create a graphics object for the rectangle
        const textureKey = weapon?.projectileTextureKey ?? 'cube';
        const textureFrame = weapon?.projectileFrame ?? undefined;
        const newCube = Projectile.scene.physics.add.sprite(startX, startY, textureKey, textureFrame);
        if (Number.isFinite(weapon?.projectileDisplayWidth) && Number.isFinite(weapon?.projectileDisplayHeight)) {
            newCube.setDisplaySize(weapon.projectileDisplayWidth, weapon.projectileDisplayHeight);
        }
        if (weapon?.projectilePointsUp) {
            newCube.setRotation(angle + Math.PI / 2);
        } else if (weapon?.projectileRotateToAngle) {
            newCube.setRotation(angle);
        }
        Projectile.projectileGroup.add(newCube);
        newCube.body.dontTrack = true;
        newCube.body.pushable = false;
        newCube.body.setImmovable?.(true);
        newCube.team = teamNumber;
        newCube.weapon = weapon;
        newCube._shotOriginX = x;
        newCube._shotOriginY = y;
        newCube._travelAngle = angle;
        if(player) newCube.player = player;
        if (options?.sourceStructure) newCube.sourceStructure = options.sourceStructure;

        const deferImpactUntilEnd =
            !!weapon?.impactAtEndOnly &&
            Number.isFinite(Number(options?.impactX)) &&
            Number.isFinite(Number(options?.impactY));
        newCube.deferImpactUntilEnd = deferImpactUntilEnd;

        // Enable physics for the graphics object
        newCube.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
        newCube.setDepth(weapon?.projectileDepth ?? TILE_TYPES.turret.depth);
        newCube.body.dontTrack = true;
        if (deferImpactUntilEnd) {
            newCube.body.checkCollision.none = true;
            Projectile.scheduleImpactResolution(newCube, weapon, options);
        }

        if (weapon?.projectileAnimKey && Projectile.scene.anims.exists(weapon.projectileAnimKey)) {
            newCube.play(weapon.projectileAnimKey, true);
        }

        Projectile.applyTravelScaleArc(newCube, weapon, options);
        Projectile.startProjectileTrail(newCube, weapon);
        Projectile.attachBoundsCull(newCube, weapon);
    }

    static ensureWeaponEffectAnimations() {
        if (!Projectile.scene?.anims) return false;
        if (Projectile.scene.textures?.exists?.("weapon_hit_effect") && !Projectile.scene.anims.exists("weapon_hit_effect_anim")) {
            Projectile.scene.anims.create({
                key: "weapon_hit_effect_anim",
                frames: Projectile.scene.anims.generateFrameNumbers("weapon_hit_effect", { start: 0, end: 2 }),
                frameRate: 12,
                repeat: 0,
            });
        }
        return true;
    }

    static normalizeTint(value) {
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value !== "string") return null;

        const trimmed = value.trim();
        if (!trimmed) return null;

        if (/^\d+$/.test(trimmed)) return Number(trimmed);

        const hex = trimmed.startsWith("#")
            ? trimmed.slice(1)
            : trimmed.startsWith("0x")
                ? trimmed.slice(2)
                : null;

        if (!hex || !/^[0-9a-f]+$/i.test(hex)) return null;
        return Number.parseInt(hex, 16);
    }

    static getProjectileImpactTint(projectile) {
        const teamTint = TEAM_HIT_EFFECT_TINTS[Number(projectile?.team)];
        const candidates = [
            projectile?.weapon?.hitEffectTint,
            projectile?.weapon?.projectileTrailColor,
            projectile?.hitEffectTint,
            teamTint,
            0xffffff,
        ];

        for (const value of candidates) {
            const tint = Projectile.normalizeTint(value);
            if (tint != null) return tint;
        }
        return 0xffffff;
    }

    static getProjectileSourcePoint(projectile) {
        const source = projectile?.player
            ?? projectile?.sourceStructure?.topSprite
            ?? projectile?.sourceStructure?.sprite
            ?? projectile?.sourceStructure?.baseSprite
            ?? projectile?.sourceStructure;

        const x = Number(source?.x ?? projectile?._shotOriginX);
        const y = Number(source?.y ?? projectile?._shotOriginY);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    }

    static getProjectileImpactAngle(projectile, x, y) {
        const vx = Number(projectile?.body?.velocity?.x ?? 0);
        const vy = Number(projectile?.body?.velocity?.y ?? 0);
        if (Math.hypot(vx, vy) > 0.01) return Math.atan2(vy, vx);

        const travelAngle = Number(projectile?._travelAngle);
        if (Number.isFinite(travelAngle)) return travelAngle;

        const source = Projectile.getProjectileSourcePoint(projectile);
        if (source) return Phaser.Math.Angle.Between(source.x, source.y, x, y);

        const rotation = Number(projectile?.rotation);
        return Number.isFinite(rotation) ? rotation : 0;
    }

    static playFallbackHitEffect(x, y, { scale = 1, angle = 0, tint = 0xffffff } = {}) {
        const scene = Projectile.scene;
        if (!scene?.add) return;

        const normalizedTint = Projectile.normalizeTint(tint) ?? 0xffffff;
        const root = scene.add.container(x, y)
            .setDepth(HIT_EFFECT_DEPTH)
            .setRotation(angle)
            .setAlpha(0.95);
        const gfx = scene.add.graphics();
        const size = Math.max(8, 12 * scale);
        const stroke = Math.max(1.5, 2.5 * scale);

        gfx.lineStyle(stroke, normalizedTint, 0.95);
        gfx.beginPath();
        gfx.moveTo(-size, 0);
        gfx.lineTo(size, 0);
        gfx.moveTo(0, -size * 0.65);
        gfx.lineTo(0, size * 0.65);
        gfx.strokePath();
        gfx.lineStyle(Math.max(1, stroke * 0.55), 0xffffff, 0.5);
        gfx.strokeCircle(0, 0, size * 0.45);
        root.add(gfx);

        scene.tweens.add({
            targets: root,
            scale: 1.45,
            alpha: 0,
            duration: 260,
            ease: "Sine.easeOut",
            onComplete: () => root.destroy(),
        });
    }

    static playHitEffect(x, y, { scale = 1, angle = 0, tint = 0xffffff } = {}) {
        if (!Projectile.scene?.textures?.exists?.("weapon_hit_effect")) {
            Projectile.playFallbackHitEffect(x, y, { scale, angle, tint });
            return;
        }
        Projectile.ensureWeaponEffectAnimations();
        const fx = Projectile.scene.add.sprite(x, y, "weapon_hit_effect", 0)
            .setDepth(HIT_EFFECT_DEPTH)
            .setScale(scale * 1.35)
            .setRotation(angle)
            .setAlpha(1)
            .setBlendMode(Phaser.BlendModes.ADD);

        const normalizedTint = Projectile.normalizeTint(tint);
        if (normalizedTint != null) {
            if (typeof fx.setTintFill === "function") fx.setTintFill(normalizedTint);
            else fx.setTint(normalizedTint);
        }

        const animExists = Projectile.scene.anims?.exists?.("weapon_hit_effect_anim");
        if (animExists) {
            fx.play("weapon_hit_effect_anim");
            fx.once("animationcomplete", () => {
                Projectile.scene?.tweens?.add({
                    targets: fx,
                    alpha: 0,
                    scaleX: fx.scaleX * 1.12,
                    scaleY: fx.scaleY * 1.12,
                    duration: 80,
                    ease: "Sine.easeOut",
                    onComplete: () => fx.destroy(),
                });
            });
        } else {
            Projectile.scene?.tweens?.add({
                targets: fx,
                alpha: 0,
                duration: 260,
                ease: "Sine.easeOut",
                onComplete: () => fx.destroy(),
            });
        }
    }

    static playProjectileImpact(projectile, x, y, { scaleMultiplier = 1, angle = null } = {}) {
        if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return;
        const baseScale = Number(projectile?.weapon?.hitEffectScale ?? 1.1);
        Projectile.playHitEffect(Number(x), Number(y), {
            scale: Math.max(0.1, baseScale * scaleMultiplier),
            angle: Number.isFinite(Number(angle))
                ? Number(angle)
                : Projectile.getProjectileImpactAngle(projectile, Number(x), Number(y)),
            tint: Projectile.getProjectileImpactTint(projectile),
        });
    }

    static startProjectileTrail(projectile, weapon) {
        if (!projectile?.active || !weapon?.projectileTrail) return;
        const delay = Math.max(45, Number(weapon.projectileTrailDelay ?? 70));
        const color = Number.isFinite(weapon.projectileTrailColor) ? weapon.projectileTrailColor : 0xfff0a8;
        projectile._trailTimer = Projectile.scene.time.addEvent({
            delay,
            loop: true,
            callback: () => {
                if (!projectile?.active) return;
                Projectile.playProjectileTrailRing(projectile.x, projectile.y, color, weapon);
            },
        });
        projectile.once("destroy", () => {
            projectile._trailTimer?.remove?.(false);
            projectile._trailTimer = null;
        });
    }

    static playProjectileTrailRing(x, y, color, weapon = null) {
        const scene = Projectile.scene;
        if (!scene) return;
        const ring = scene.add.circle(x, y, Math.max(3, Number(weapon?.projectileTrailRadius ?? 4)), color, 0)
            .setDepth((TILE_TYPES.turret.depth ?? 10) + 4);
        ring.setStrokeStyle(Math.max(1, Number(weapon?.projectileTrailStroke ?? 1.5)), color, 0.62);
        scene.tweens.add({
            targets: ring,
            scale: Number(weapon?.projectileTrailScale ?? 2.3),
            alpha: 0,
            duration: Math.max(120, Number(weapon?.projectileTrailDuration ?? 260)),
            ease: "Sine.easeOut",
            onComplete: () => ring.destroy(),
        });
    }

    static attachBoundsCull(projectile, weapon = null) {
        if (!projectile || !Projectile.scene?.events) return;

        const updateHandler = () => {
            if (!projectile?.active) return;
            if (Projectile.isOutsideMapBounds(projectile, weapon)) {
                projectile.destroy();
            }
        };

        Projectile.scene.events.on("update", updateHandler);
        projectile.once("destroy", () => {
            Projectile.scene?.events?.off?.("update", updateHandler);
        });
    }

    static isOutsideMapBounds(projectile, weapon = null) {
        const grid = Map.grid;
        if (!Array.isArray(grid) || grid.length === 0 || !Array.isArray(grid[0])) return false;

        const mapWidth = grid[0].length * SQUARESIZE;
        const mapHeight = grid.length * SQUARESIZE;
        const halfDisplayWidth = Number(projectile.displayWidth ?? projectile.width ?? 0) * 0.5;
        const halfDisplayHeight = Number(projectile.displayHeight ?? projectile.height ?? 0) * 0.5;
        const extraPadding = Math.max(
            Number(weapon?.impactRadius ?? 0),
            Number(weapon?.projectileTrailRadius ?? 0),
            8
        );
        const padX = halfDisplayWidth + extraPadding;
        const padY = halfDisplayHeight + extraPadding;

        return (
            projectile.x < -padX ||
            projectile.y < -padY ||
            projectile.x > mapWidth + padX ||
            projectile.y > mapHeight + padY
        );
    }

    static getTravelDurationMs(weapon, options = null) {
        const travelDistance = Number(options?.travelDistance ?? 0);
        if (!travelDistance || !weapon) return 0;
        return Math.max(200, Math.round((travelDistance / Math.max(weapon.speed ?? 1, 1)) * 1000));
    }

    static applyTravelScaleArc(projectile, weapon, options = null) {
        if (!projectile || !weapon) return;

        const startScale = Number.isFinite(options?.startScale)
            ? options.startScale
            : weapon.projectileScaleStart;
        const endScale = Number.isFinite(options?.endScale)
            ? options.endScale
            : weapon.projectileScaleEnd;

        if (Number.isFinite(startScale)) {
            projectile.setScale(startScale);
        }

        const travelDistance = Number(options?.travelDistance ?? 0);
        if (!travelDistance || !Number.isFinite(startScale) || !Number.isFinite(endScale)) return;

        const distanceRatio = Phaser.Math.Clamp(
            Number(options?.distanceRatio ?? (travelDistance / Math.max(weapon.range ?? travelDistance, 1))),
            0,
            1
        );

        const defaultPeakScale = Phaser.Math.Linear(
            Number.isFinite(weapon.projectilePeakScaleMin) ? weapon.projectilePeakScaleMin : startScale,
            Number.isFinite(weapon.projectilePeakScaleMax) ? weapon.projectilePeakScaleMax : Math.max(startScale, endScale),
            distanceRatio
        );
        const peakScale = Number.isFinite(options?.peakScale) ? options.peakScale : defaultPeakScale;
        const travelMs = this.getTravelDurationMs(weapon, options);

        projectile._travelScaleTween?.remove?.();
        projectile._travelScaleTween = Projectile.scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: travelMs,
            ease: "Linear",
            onUpdate: (tween) => {
                if (!projectile.active) return;
                const t = tween.getValue();
                const baseScale = Phaser.Math.Linear(startScale, endScale, t);
                const arcT = 4 * t * (1 - t);
                projectile.setScale(baseScale + arcT * (peakScale - Math.max(startScale, endScale)));
            },
            onComplete: () => {
                projectile._travelScaleTween = null;
            },
        });

        projectile.once("destroy", () => {
            projectile._travelScaleTween?.remove?.();
            projectile._travelScaleTween = null;
        });
    }

    static scheduleImpactResolution(projectile, weapon, options = null) {
        if (!projectile?.active || !weapon?.impactAtEndOnly) return;

        const impactX = Number(options?.impactX);
        const impactY = Number(options?.impactY);
        if (!Number.isFinite(impactX) || !Number.isFinite(impactY)) return;

        const travelMs = this.getTravelDurationMs(weapon, options);
        if (!travelMs) return;

        projectile._impactTimer?.remove?.(false);
        projectile._impactTimer = Projectile.scene.time.delayedCall(travelMs, () => {
            projectile._impactTimer = null;
            this.resolveImpactAtPoint(projectile, impactX, impactY, options);
        });

        projectile.once("destroy", () => {
            projectile._impactTimer?.remove?.(false);
            projectile._impactTimer = null;
        });
    }

    static resolveImpactAtPoint(projectile, impactX, impactY, options = null) {
        if (!projectile?.active) return;

        projectile._resolvingImpact = true;
        projectile.body?.setVelocity?.(0, 0);
        projectile.setPosition(impactX, impactY);

        const impactRadius = Math.max(10, Number(options?.impactRadius ?? projectile.weapon?.impactRadius ?? 18));
        const preferredTarget = options?.impactTarget ?? null;
        if (projectile.weapon?.impactAtEndOnly) {
            const smokeSize = Math.max(16, Number(options?.impactSmokeSize ?? projectile.weapon?.impactSmokeSize ?? 32));
            playSmokeClearing(Projectile.scene, impactX, impactY, {
                width: smokeSize,
                height: smokeSize,
            });
        }

        const target = this.findImpactTarget(projectile, impactX, impactY, impactRadius, preferredTarget);
        if (target) {
            this.handleCollision(target, projectile);
            return;
        }

        const structureHit = this.findImpactStructure(projectile, impactX, impactY, impactRadius);
        if (structureHit) {
            this.handleStructureCollision(projectile, structureHit);
            return;
        }

        showGhostText(
            Projectile.scene,
            impactX,
            impactY - 10,
            "MISS",
            projectile.team,
            false,
            true
        );
        projectile.destroy();
    }

    static findImpactTarget(projectile, impactX, impactY, impactRadius, preferredTarget = null) {
        const radiusSq = impactRadius * impactRadius;
        const isValidEnemy = (target) =>
            !!target?.active &&
            !!target.body &&
            target.body.team != null &&
            target.body.team !== projectile.team &&
            !target.dontTrack &&
            !target.body.dontTrack &&
            (target.health ?? 1) > 0;

        if (isValidEnemy(preferredTarget)) {
            const distSq = Phaser.Math.Distance.Squared(preferredTarget.x, preferredTarget.y, impactX, impactY);
            if (distSq <= radiusSq) return preferredTarget;
        }

        let nearest = null;
        let nearestDistSq = radiusSq;
        for (const target of Player.troops) {
            if (!isValidEnemy(target)) continue;
            const distSq = Phaser.Math.Distance.Squared(target.x, target.y, impactX, impactY);
            if (distSq > nearestDistSq) continue;
            nearest = target;
            nearestDistSq = distSq;
        }
        return nearest;
    }

    static findImpactStructure(projectile, impactX, impactY, impactRadius) {
        const hits = Map.structureBarrier?.getChildren?.() ?? [];
        let nearest = null;
        let nearestDistSq = impactRadius * impactRadius;

        for (const hit of hits) {
            if (!hit?.active) continue;

            if (!this.shouldCollideWithStructure(projectile, hit)) continue;

            const left = Number.isFinite(hit.body?.left) ? hit.body.left : (hit.x - (hit.displayWidth ?? 0) / 2);
            const right = Number.isFinite(hit.body?.right) ? hit.body.right : (hit.x + (hit.displayWidth ?? 0) / 2);
            const top = Number.isFinite(hit.body?.top) ? hit.body.top : (hit.y - (hit.displayHeight ?? 0) / 2);
            const bottom = Number.isFinite(hit.body?.bottom) ? hit.body.bottom : (hit.y + (hit.displayHeight ?? 0) / 2);

            const nearestX = Phaser.Math.Clamp(impactX, left, right);
            const nearestY = Phaser.Math.Clamp(impactY, top, bottom);
            const distSq = Phaser.Math.Distance.Squared(impactX, impactY, nearestX, nearestY);
            if (distSq > nearestDistSq) continue;

            nearest = hit;
            nearestDistSq = distSq;
        }

        return nearest;
    }

    static getStructureTeam(hit) {
        if (!hit) return null;
        return hit.team
            ?? hit.body?.team
            ?? hit.wallRef?.team
            ?? hit.buildingRef?.team
            ?? hit.buildingRef?.teamNumber
            ?? hit.structureOwner?.team
            ?? hit.structureOwner?.teamNumber
            ?? null;
    }

    static getShotTeam(source) {
        if (!source) return null;
        return source.team
            ?? source.body?.team
            ?? source.player?.body?.team
            ?? source.player?.team
            ?? source.sourceStructure?.team
            ?? source.sourceStructure?.teamNumber
            ?? source.buildingRef?.team
            ?? source.buildingRef?.teamNumber
            ?? null;
    }

    static getShotOwner(source) {
        return source?.player
            ?? source?.sourceStructure
            ?? source?.buildingRef
            ?? source;
    }

    static shouldIgnoreStructureForShot(source, hit) {
        if (!source || !hit) return false;
        return this.isIgnoredStructureHit(hit, this.getStructureIdentitySet(source));
    }

    static isWallStructureHit(hit) {
        return !!(hit?.wallRef || hit?.isWall);
    }

    static isExplicitWallDestroyTarget(source, hit) {
        const wall = hit?.wallRef;
        const shooter = this.getShotOwner(source);
        const task = shooter?.task;
        if (!wall || !task) return false;
        if (shooter?.state !== CONTROL_STATES.DESTROY_MODE_T) return false;

        const targetX = Number(task.tx ?? task.x);
        const targetY = Number(task.ty ?? task.y);
        return Number(wall.x) === targetX && Number(wall.y) === targetY;
    }

    static sourceCanShootThroughFriendlyWalls(source) {
        const shooter = this.getShotOwner(source);
        return !!(
            source?.canShootThroughFriendlyWalls ||
            source?.weapon?.shootThroughFriendlyWalls ||
            shooter?.canShootThroughFriendlyWalls ||
            shooter?.weapon?.shootThroughFriendlyWalls ||
            shooter?.topSprite?.canShootThroughFriendlyWalls ||
            shooter?.topSprite?.weapon?.shootThroughFriendlyWalls ||
            shooter?.isGunslinger
        );
    }

    static canShootThroughFriendlyWall(source, hit) {
        if (!this.sourceCanShootThroughFriendlyWalls(source) || !this.isWallStructureHit(hit)) return false;
        if (this.isExplicitWallDestroyTarget(source, hit)) return false;

        const shotTeam = Number(this.getShotTeam(source));
        const wallTeam = Number(this.getStructureTeam(hit));
        return Number.isFinite(shotTeam) && Number.isFinite(wallTeam) && shotTeam === wallTeam;
    }

    static shouldCollideWithStructure(source, hit) {
        if (!hit?.active) return false;
        if (hit.blocksProjectiles === false) return false;
        if (this.canShootThroughFriendlyWall(source, hit)) return false;
        return !this.shouldIgnoreStructureForShot(source, hit);
    }

    static shouldBlockLineOfSight(source, hit) {
        if (!hit?.active) return false;
        if (hit.blocksLineOfFire === false) return false;
        if (this.canShootThroughFriendlyWall(source, hit)) return false;
        return !this.shouldIgnoreStructureForShot(source, hit);
    }

    static isFriendlyStructureHit(projectile, hit) {
        const shotTeam = Number(this.getShotTeam(projectile));
        const structureTeam = Number(this.getStructureTeam(hit));
        return (
            Number.isFinite(shotTeam) &&
            Number.isFinite(structureTeam) &&
            shotTeam === structureTeam
        );
    }

    static getStructureIdentitySet(obj) {
        const refs = new Set();
        const push = (value) => {
            if (value) refs.add(value);
        };

        push(obj);
        push(obj?.gameObject);
        push(obj?.wallRef);
        push(obj?.buildingRef);
        push(obj?.structureOwner);
        push(obj?.gameObject?.wallRef);
        push(obj?.gameObject?.buildingRef);
        push(obj?.gameObject?.structureOwner);
        push(obj?.player);
        push(obj?.player?.sprite);
        push(obj?.player?.collider);
        push(obj?.player?.buildingRef);
        push(obj?.sourceStructure);
        push(obj?.sourceStructure?.sprite);
        push(obj?.sourceStructure?.collider);
        push(obj?.sourceStructure?.buildingRef);
        push(obj?.sprite);
        push(obj?.collider);
        push(obj?.body?.gameObject);
        return refs;
    }

    static isIgnoredStructureHit(hit, ignoredRefs) {
        if (!hit || !ignoredRefs?.size) return false;
        return ignoredRefs.has(hit)
            || ignoredRefs.has(hit.wallRef)
            || ignoredRefs.has(hit.buildingRef)
            || ignoredRefs.has(hit.structureOwner)
            || ignoredRefs.has(hit.body?.gameObject);
    }

    static getStructureBounds(hit) {
        if (!hit) return null;
        const left = Number.isFinite(hit.body?.left) ? hit.body.left : (hit.x - (hit.displayWidth ?? 0) / 2);
        const right = Number.isFinite(hit.body?.right) ? hit.body.right : (hit.x + (hit.displayWidth ?? 0) / 2);
        const top = Number.isFinite(hit.body?.top) ? hit.body.top : (hit.y - (hit.displayHeight ?? 0) / 2);
        const bottom = Number.isFinite(hit.body?.bottom) ? hit.body.bottom : (hit.y + (hit.displayHeight ?? 0) / 2);
        const width = Math.max(1, right - left);
        const height = Math.max(1, bottom - top);
        const pad = 1;
        return new Phaser.Geom.Rectangle(left - pad, top - pad, width + pad * 2, height + pad * 2);
    }

    static getRectSides(rect) {
        if (!rect) return null;
        const left = Number.isFinite(rect.left) ? rect.left : rect.x;
        const right = Number.isFinite(rect.right) ? rect.right : rect.x + rect.width;
        const top = Number.isFinite(rect.top) ? rect.top : rect.y;
        const bottom = Number.isFinite(rect.bottom) ? rect.bottom : rect.y + rect.height;

        if (![left, right, top, bottom].every(Number.isFinite)) return null;
        return { left, right, top, bottom };
    }

    static getClosestPointOnRectFacingPoint(rect, point) {
        const sides = Projectile.getRectSides(rect);
        if (!sides || !point) return null;

        const { left, right, top, bottom } = sides;
        const x = Number(point.x);
        const y = Number(point.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

        let closestX = Phaser.Math.Clamp(x, left, right);
        let closestY = Phaser.Math.Clamp(y, top, bottom);

        if (x >= left && x <= right && y >= top && y <= bottom) {
            const distances = [
                { edge: "left", value: x - left },
                { edge: "right", value: right - x },
                { edge: "top", value: y - top },
                { edge: "bottom", value: bottom - y },
            ].sort((a, b) => a.value - b.value);

            switch (distances[0]?.edge) {
                case "left":
                    closestX = left;
                    break;
                case "right":
                    closestX = right;
                    break;
                case "top":
                    closestY = top;
                    break;
                case "bottom":
                    closestY = bottom;
                    break;
            }
        }

        return { x: closestX, y: closestY };
    }

    static getStructureImpactPoint(projectile, hit) {
        const fallbackX = Number(projectile?.x ?? hit?.x ?? 0);
        const fallbackY = Number(projectile?.y ?? hit?.y ?? 0);
        const fallback = { x: fallbackX, y: fallbackY };
        const bounds = Projectile.getStructureBounds(hit);
        if (!bounds) return fallback;

        const source = Projectile.getProjectileSourcePoint(projectile) ?? fallback;
        return Projectile.getClosestPointOnRectFacingPoint(bounds, source) ?? fallback;
    }

    static leadAndAngle(attacker, target, projectileSpeed) {
        if (!target.body) return { x: target.x, y: target.y };

        const dx = target.x - attacker.x;
        const dy = target.y - attacker.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const time = distance / projectileSpeed;

        return {
            x: target.x + target.body.velocity.x * time,
            y: target.y + target.body.velocity.y * time
        };
    }

    static hasLineOfSight(shooter, target) {
        if (!shooter || !target) return false;
        const line = new Phaser.Geom.Line(shooter.x, shooter.y, target.x, target.y);
        const ignoredRefs = new Set([
            ...this.getStructureIdentitySet(shooter),
            ...this.getStructureIdentitySet(target),
        ]);
        const hits = Map.structureBarrier?.getChildren?.() ?? [];

        for (const hit of hits) {
            if (!this.shouldBlockLineOfSight(shooter, hit)) continue;
            if (this.isIgnoredStructureHit(hit, ignoredRefs)) continue;

            const bounds = this.getStructureBounds(hit);
            if (!bounds) continue;
            if (Phaser.Geom.Intersects.LineToRectangle(line, bounds)) {
                return false;
            }
        }

        return true;
    }

    static handleCollision(target, projectile) {
        const result = fightManager.calculateHitResultFromWeapon(projectile.weapon, projectile.player || null);
        if (result.hit) {
        
            // 🔴 Apply on-hit effects to the victim (flash, timer cancel, knockback team 0)
            const attacker = projectile.player || null;
            fightManager.applyHitReaction(target, attacker, projectile.weapon);

            target.health = Math.max(0, target.health - result.damage);
            Player.showMiniBarsOnHit?.(target);
            Projectile.playProjectileImpact(projectile, target.x, target.y - 6);

            if (target.health <= 0) {
                fightManager.checkForKillReward(projectile.team, target);
                Player._cleanupCombatTicketForTarget?.(projectile.team, target);
                Player.destroyPlayer(target);

                const shooterStillTrackingTarget =
                    projectile.player?.track?.[0]?.gameObject === target ||
                    projectile.player?.forcedTarget === target;

                if (shooterStillTrackingTarget && projectile.player?.active && projectile.player?.body) {
                    CombatSpacingCoordinator.clearTroopFocus(projectile.player);
                    Player.resetRoamState?.(projectile.player);
                    Player.clearRecentCombatAttacker?.(projectile.player);
                    Player.clearGunslingerKiteState?.(projectile.player);
                    Teams.movePlayerState(projectile.player, CONTROL_STATES.TRACK_MODE);
                    projectile.player.track = null;
                    projectile.player.forcedTarget = null;
                    Player.setAnimState(projectile.player, projectile.player.idle);
                }

                // If you still need this removeFromStateArray, keep it:
                // Teams.removeFromStateArray(1, "fightingList", target);
            }

            showGhostText(
                Projectile.scene,
                target.x,
                target.y - 10,
                `${result.isCrit ? 'CRIT ' : ''}${result.damage}`,
                projectile.team,
                result.isCrit
            );
        } else {
            showGhostText(
                Projectile.scene,
                target.x,
                target.y - 10,
                'MISS',
                projectile.team,
                false,
                true
            );
        }

        projectile.destroy();
    }

    static handleStructureCollision(projectile, hit) {
        if (!Projectile.shouldCollideWithStructure(projectile, hit)) {
            return;
        }

        const impactPoint = Projectile.getStructureImpactPoint(projectile, hit);
        const playStructureImpact = (scaleMultiplier = 1) => {
            Projectile.playProjectileImpact(projectile, impactPoint.x, impactPoint.y, { scaleMultiplier });
        };

        if (Projectile.isFriendlyStructureHit(projectile, hit)) {
            playStructureImpact(0.82);
            projectile.destroy();
            return;
        }

        const weapon = projectile.weapon;
        const shooter = projectile.player || null;
        const result = fightManager.calculateHitResultFromWeapon(weapon, shooter);

        // MISS -> text + kill bullet
        if (!result.hit) {
            // best-effort text anchor
            const hx = impactPoint.x;
            const hy = impactPoint.y;

            playStructureImpact(0.78);
            showGhostText(
                Projectile.scene,
                hx,
                hy - 10,
                "MISS",
                projectile.team,
                false,
                true
            );

            projectile.destroy();
            return;
        }

        const dmg = result.damage;
        const teamNumber = projectile.team;

        // -----------------------
        // WALL HIT (tile task)
        // -----------------------
        if (hit.wallRef) {
            const wall = hit.wallRef;

            // If this shot is coming from a destroy task, decrement the TASK duration/HP
            // rather than random wall HP, so completion uses the same pipeline.
            const t = shooter?.task;

            // fallback: if you have wall HP system, use it
            playStructureImpact();
            const destroyed = wall.damage(dmg);
            
            if (destroyed) {
                buildingManager._completeDestroyTile(shooter, t, wall.x, wall.y);
            }

            showGhostText(
                Projectile.scene,
                wall.sprite?.x ?? hit.x,
                (wall.sprite?.y ?? hit.y) - 10,
                `${result.isCrit ? "CRIT " : ""}${dmg}`,
                teamNumber,
                result.isCrit
            );
            

            projectile.destroy();
            return;
        }

        // -----------------------
        // BUILDING HIT (block task)
        // -----------------------
        if (hit.buildingRef) {
            const building = hit.buildingRef;

            const t = shooter?.task;
            playStructureImpact();

            if (shooter && t) {
                const damageResult = buildingManager.applyDestroyDamage(t, dmg);
                if (damageResult.destroyed || t.duration <= 0) {
                    buildingManager._completeDestroyBlock(shooter, t);
                }

                projectile.destroy();
                return;
            }

            // No task: treat as normal "damage building health" path if present
            if (typeof building.takeDamage === "function") {
                building.takeDamage(dmg);
            } else if (typeof building.onDamaged === "function") {
                // if you store real health, you’d pass current/max; here best-effort:
                building.onDamaged(dmg, Math.max(0, (building.health ?? 0) - dmg), building.maxHealth ?? building.health ?? 1);
                building.health = Math.max(0, (building.health ?? 0) - dmg);
                if (building.health <= 0 && typeof building.destroy === "function") building.destroy();
            }

            projectile.destroy();
            return;
        }

        // unknown structure collider
        playStructureImpact(0.82);
        projectile.destroy();
    }
}
