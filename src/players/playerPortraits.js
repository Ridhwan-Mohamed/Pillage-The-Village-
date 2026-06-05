import blademasterHealthyPortrait from 'url:../assets/Players/blademaster/blademaster_healthy_portrait.png';
import blademasterWeakPortrait from 'url:../assets/Players/blademaster/blademaster_weak_portrait.png';
import brawlerHealthyPortrait from 'url:../assets/Players/brawler/brawler_healthy_portrait.png';
import brawlerWeakPortrait from 'url:../assets/Players/brawler/brawler_weak_portrait.png';
import builderHealthyPortrait from 'url:../assets/Players/builder/builder_healthy_portrait.png';
import builderWeakPortrait from 'url:../assets/Players/builder/builder_weak_portrait.png';
import farmerHealthyPortrait from 'url:../assets/Players/farmer/farmer_healthy_portrait.png';
import farmerWeakPortrait from 'url:../assets/Players/farmer/farmer_weak_portrait.png';
import firemanHealthyPortrait from 'url:../assets/Players/fireman/fireman_healthy_portrait.png';
import firemanWeakPortrait from 'url:../assets/Players/fireman/fireman_weak_portrait.png';
import foragerHealthyPortrait from 'url:../assets/Players/forager/forager_healthy_portrait.png';
import foragerWeakPortrait from 'url:../assets/Players/forager/forager_weak_portrait.png';
import gunslingerHealthyPortrait from 'url:../assets/Players/gunslinger/gunslinger_healthy_portrait.png';
import gunslingerWeakPortrait from 'url:../assets/Players/gunslinger/gunslinger_weak_portrait.png';
import hunterPortrait from 'url:../assets/Players/hunters/hunter_portrait.png';
import bomberPortrait from 'url:../assets/Players/bombers/bomber_portrait.png';
import raiderPortrait from 'url:../assets/Players/raider/raider_portrait.png';
import shockerPortrait from 'url:../assets/Players/shocker/shocker_portrait.png';

const PORTRAIT_FRAME_HEIGHT = 50;
const PORTRAIT_FRAME_RATE = 5;
const HEALTHY_THRESHOLD = 50;

const PORTRAIT_ASSETS = {
  portrait_blademaster_healthy: { asset: blademasterHealthyPortrait, frameWidth: 59 },
  portrait_blademaster_weak: { asset: blademasterWeakPortrait, frameWidth: 60 },
  portrait_brawler_healthy: { asset: brawlerHealthyPortrait, frameWidth: 58 },
  portrait_brawler_weak: { asset: brawlerWeakPortrait, frameWidth: 57 },
  portrait_builder_healthy: { asset: builderHealthyPortrait, frameWidth: 51 },
  portrait_builder_weak: { asset: builderWeakPortrait, frameWidth: 52 },
  portrait_farmer_healthy: { asset: farmerHealthyPortrait, frameWidth: 54 },
  portrait_farmer_weak: { asset: farmerWeakPortrait, frameWidth: 54 },
  portrait_fireman_healthy: { asset: firemanHealthyPortrait, frameWidth: 54 },
  portrait_fireman_weak: { asset: firemanWeakPortrait, frameWidth: 58 },
  portrait_forager_healthy: { asset: foragerHealthyPortrait, frameWidth: 54 },
  portrait_forager_weak: { asset: foragerWeakPortrait, frameWidth: 58 },
  portrait_gunslinger_healthy: { asset: gunslingerHealthyPortrait, frameWidth: 62 },
  portrait_gunslinger_weak: { asset: gunslingerWeakPortrait, frameWidth: 65 },
  portrait_hunter: { asset: hunterPortrait, frameWidth: 62 },
  portrait_bomber: { asset: bomberPortrait, frameWidth: 62 },
  portrait_raider: { asset: raiderPortrait, frameWidth: 77 },
  portrait_shocker: { asset: shockerPortrait, frameWidth: 62, frameHeight: 57 },
};

const PORTRAIT_KEYS = {
  blademaster: {
    healthy: 'portrait_blademaster_healthy',
    weak: 'portrait_blademaster_weak',
  },
  brawler: {
    healthy: 'portrait_brawler_healthy',
    weak: 'portrait_brawler_weak',
  },
  builder: {
    healthy: 'portrait_builder_healthy',
    weak: 'portrait_builder_weak',
  },
  farmer: {
    healthy: 'portrait_farmer_healthy',
    weak: 'portrait_farmer_weak',
  },
  fireman: {
    healthy: 'portrait_fireman_healthy',
    weak: 'portrait_fireman_weak',
  },
  forager: {
    healthy: 'portrait_forager_healthy',
    weak: 'portrait_forager_weak',
  },
  gunslinger: {
    healthy: 'portrait_gunslinger_healthy',
    weak: 'portrait_gunslinger_weak',
  },
  hunter: {
    default: 'portrait_hunter',
  },
  bomber: {
    default: 'portrait_bomber',
  },
  raider: {
    default: 'portrait_raider',
  },
  shocker: {
    default: 'portrait_shocker',
  },
};

export const DEFAULT_PLAYER_PORTRAIT_KEY = 'portrait_farmer_healthy';

export function preloadPlayerPortraits(scene) {
  Object.entries(PORTRAIT_ASSETS).forEach(([key, config]) => {
    if (scene.textures.exists(key)) return;
    scene.load.spritesheet(key, config.asset, {
      frameWidth: config.frameWidth,
      frameHeight: config.frameHeight ?? PORTRAIT_FRAME_HEIGHT,
    });
  });
}

export function createPlayerPortraitAnimations(scene) {
  Object.keys(PORTRAIT_ASSETS).forEach((key) => {
    if (scene.anims.exists(key)) return;
    if (!scene.textures.exists(key)) return;

    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(key, { start: 0, end: 2 }),
      frameRate: PORTRAIT_FRAME_RATE,
      repeat: -1,
    });
  });
}

export function getPlayerPortraitKey(unit) {
  const portraitType = getPortraitType(unit);
  if (!portraitType) return null;

  const portraitSet = PORTRAIT_KEYS[portraitType];
  if (!portraitSet) return null;
  if (portraitSet.default) return portraitSet.default;

  return (unit?.health ?? 0) > HEALTHY_THRESHOLD
    ? portraitSet.healthy
    : portraitSet.weak;
}

export function applyPortraitKeyToSprite(scene, sprite, portraitKey, displayHeight = 48) {
  if (!sprite) return;

  if (!portraitKey) {
    sprite.setVisible(false);
    sprite.anims?.stop?.();
    return;
  }

  const frame = scene.textures.getFrame(portraitKey, 0);
  const frameWidth = frame?.width ?? displayHeight;
  const frameHeight = frame?.height ?? displayHeight;
  const displayWidth = Math.round((frameWidth / frameHeight) * displayHeight);
  if (!scene.anims?.exists?.(portraitKey) && scene.textures?.exists?.(portraitKey)) {
    createPlayerPortraitAnimations(scene);
  }

  sprite
    .setVisible(true)
    .setAlpha(1)
    .setTexture(portraitKey)
    .setDisplaySize(displayWidth, displayHeight);

  if (scene.anims?.exists?.(portraitKey)) {
    sprite.play(portraitKey, true);
  } else {
    sprite.anims?.stop?.();
  }
}

function getPortraitType(unit) {
  if (!unit) return null;
  if (unit.isBlademaster) return 'blademaster';
  if (unit.isBrawler) return 'brawler';
  if (unit.isBuilder) return 'builder';
  if (unit.isFarmer) return 'farmer';
  if (unit.isFireman) return 'fireman';
  if (unit.isForager) return 'forager';
  if (unit.isGunslinger) return 'gunslinger';
  if (unit.isHunter) return 'hunter';
  if (unit.isBomber) return 'bomber';
  if (unit.isShocker) return 'shocker';
  if (unit.isFortGrunt || unit.isRaider) return 'raider';
  return null;
}
