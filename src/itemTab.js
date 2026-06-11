import Phaser from "phaser";
import { FLOORDEPTH, UIDEPTH, TILE_TYPES, showAlert } from "./constants";
import sand from 'url:./assets/sand.png'
import flower from 'url:./assets/flower.png'
import pine from 'url:./assets/pine.png'
import rock3 from 'url:./assets/rock3.png'
import brick from 'url:./assets/wall/brick.png'
import turretBase from 'url:./assets/turretBase.png'
import turret from 'url:./assets/turret.png'
import catapultBase from 'url:./assets/catapult_base.png'
import catapultTop from 'url:./assets/catapult_top.png'
import rockProjectile from 'url:./assets/rock_projectile.png'
import Wall from 'url:./assets/wall/Wall.png'
import TWall from 'url:./assets/wall/TWall.png'
import BWall from 'url:./assets/wall/BWall.png'
import RWall from 'url:./assets/wall/RWall.png'
import LWall from 'url:./assets/wall/LWall.png'
import TRCWall from 'url:./assets/wall/TRCWall.png'
import BRCWall from 'url:./assets/wall/BRCWall.png'
import TLCWall from 'url:./assets/wall/TLCWall.png'
import BLCWall from 'url:./assets/wall/BLCWall.png'
import grass_interior from 'url:./assets/terrain/grass/grass_interior.png'
import grass_overhang_edge from 'url:./assets/terrain/grass/grass_overhang_edge.png'
import grass_overhang_corner from 'url:./assets/terrain/grass/grass_overhang_corner.png'
import grass_edge_water from 'url:./assets/terrain/grass/grass_edge_water.png'
import grass_corner_water from 'url:./assets/terrain/grass/grass_corner_water.png'
import grass_inner_corner_water from 'url:./assets/terrain/grass/grass_inner_corner_water.png'
import darkgrass_interior from 'url:./assets/terrain/dark_grass/darkgrass_interior.png'
import darkgrass_edge_grass from 'url:./assets/terrain/dark_grass/darkgrass_edge_grass.png'
import darkgrass_edge_water from 'url:./assets/terrain/dark_grass/darkgrass_edge_water.png'
import darkgrass_shore_edge_grass from 'url:./assets/terrain/dark_grass/darkgrass_shore_edge_grass.png'
import darkgrass_corner_water from 'url:./assets/terrain/dark_grass/darkgrass_corner_water.png'
import darkgrass_inner_corner_water from 'url:./assets/terrain/dark_grass/darkgrass_inner_corner_water.png'
import berryBush from 'url:./assets/terrain/grass/berryBush.png'
import seedBush from 'url:./assets/terrain/grass/seedBush.png'
import water_interior from 'url:./assets/terrain/water/water_interior.png'
import playerImg from 'url:./assets/Players/playerImg.png'
import playerSwim from 'url:./assets/Players/playerSwim.png'
import house1 from 'url:./assets/house1.png'
import house2 from 'url:./assets/house2.png'
import well from 'url:./assets/well.png'
import dirt_interior from 'url:./assets/terrain/dirt/dirt_interior.png'
import dirt_edge_grass from 'url:./assets/terrain/dirt/dirt_edge_grass.png'
import dirt_corner_grass from 'url:./assets/terrain/dirt/dirt_corner_grass.png'
import dirt_edge_water from 'url:./assets/terrain/dirt/dirt_edge_water.png'
import dirt_shore_edge_grass from 'url:./assets/terrain/dirt/dirt_shore_edge_grass.png'
import dirt_corner_water from 'url:./assets/terrain/dirt/dirt_corner_water.png'
import dirt_inner_corner from 'url:./assets/terrain/dirt/dirt_inner_corner.png'
import dirt_inner_corner_water from 'url:./assets/terrain/dirt/dirt_inner_corner_water.png'
import dirt_diag_join from 'url:./assets/terrain/dirt/dirt_diag_join.png'
import road_interior from 'url:./assets/terrain/road/road_interior.png'
import road_edge_grass from 'url:./assets/terrain/road/road_edge_grass.png'
import road_corner_grass from 'url:./assets/terrain/road/road_corner_grass.png'
import road_edge_water from 'url:./assets/terrain/road/road_edge_water.png'
import road_shore_edge_grass from 'url:./assets/terrain/road/road_shore_edge_grass.png'
import road_corner_water from 'url:./assets/terrain/road/road_corner_water.png'
import road_inner_corner from 'url:./assets/terrain/road/road_inner_corner.png'
import road_inner_corner_water from 'url:./assets/terrain/road/road_inner_corner_water.png'
import road_diag_join from 'url:./assets/terrain/road/road_diag_join.png'
import dungeon_interior from 'url:./assets/terrain/dungeon/dungeon_interior.png'
import dungeon_edge_grass from 'url:./assets/terrain/dungeon/dungeon_edge_grass.png'
import dungeon_corner_grass from 'url:./assets/terrain/dungeon/dungeon_corner_grass.png'
import dungeon_edge_water from 'url:./assets/terrain/dungeon/dungeon_edge_water.png'
import dungeon_shore_edge_grass from 'url:./assets/terrain/dungeon/dungeon_shore_edge_grass.png'
import dungeon_corner_water from 'url:./assets/terrain/dungeon/dungeon_corner_water.png'
import dungeon_inner_corner from 'url:./assets/terrain/dungeon/dungeon_inner_corner.png'
import dungeon_inner_corner_water from 'url:./assets/terrain/dungeon/dungeon_inner_corner_water.png'
import dungeon_diag_join from 'url:./assets/terrain/dungeon/dungeon_diag_join.png'
import house1Img from 'url:./assets/house1Img.png'
import construction from 'url:./assets/construction.png'
import cropsSheet from 'url:./assets/terrain/crops/crops.png'
import grassBerry from 'url:./assets/grassBerry.png'
import grassRock from 'url:./assets/grassRock.png'
import grassWood from 'url:./assets/grassWood.png'
import storage from 'url:./assets/storage.png'
import pine2 from 'url:./assets/pine2.png'
import pine1 from 'url:./assets/pine1.png'
import rock2 from 'url:./assets/rock2.png'
import rock1 from 'url:./assets/rock1.png'
import goldOre3 from 'url:./assets/gold_ore3.png'
import goldOre2 from 'url:./assets/gold_ore2.png'
import goldOre1 from 'url:./assets/gold_ore1.png'
import tower from 'url:./assets/townTower.png'
import tower_destroyed from 'url:./assets/fortTiles/tower_destroyed.png'
import prison_closed from 'url:./assets/fortTiles/prison_closed.png'
import prison_opened from 'url:./assets/fortTiles/prison_opened.png'
import bank_closed from 'url:./assets/fortTiles/bank_closed.png'
import bank_opened from 'url:./assets/fortTiles/bank_opened.png'
import explosions from 'url:./assets/explosion.png'
import rewardMiniCard from 'url:./assets/reward/mini_card.png'
import rewardTreasureChest from 'url:./assets/reward/treasure_chest.png'
import smokeClearing from 'url:./assets/smoke_clearing.png'
import gunslingerBullet from 'url:./assets/weapons/gunslinger_bullet.png'
import hunterBullet from 'url:./assets/weapons/hunter_bullet.png'
import turretBullet from 'url:./assets/weapons/turret_bullet.png'
import hitEffect from 'url:./assets/weapons/hit_effect_tintable.png'

export class itemTab extends Phaser.Scene {

    static mapRef;

    constructor() {
        super('itemTab');
        this.numItems = 10;
    }

    preload(){}

    static preload(scene) {
        scene.load.image('image1', sand);  // Make sure the path and filename are correct
        scene.load.image('rock3', rock3);
        scene.load.image('rock2', rock2);
        scene.load.image('rock1', rock1);
        scene.load.image('gold_ore3', goldOre3);
        scene.load.image('gold_ore2', goldOre2);
        scene.load.image('gold_ore1', goldOre1);
        scene.load.image('image3', flower);
        scene.load.image('image4', brick);
        scene.load.image('image5', dirt_interior);
        scene.load.image('pine3', pine);
        scene.load.image('pine2', pine2);
        scene.load.image('pine1', pine1);
        scene.load.image('image7', turretBase)
        scene.load.image('image7a', turret)
        scene.load.image('catapult_base', catapultBase)
        scene.load.spritesheet('catapult_top', catapultTop, { frameWidth: 64, frameHeight: 64 });
        scene.load.spritesheet('rock_projectile', rockProjectile, { frameWidth: 38, frameHeight: 21 });
        scene.load.image('image8', water_interior); //water image
        scene.load.image('image9', playerImg); //water image
        scene.load.spritesheet('playerSwim', playerSwim, { frameWidth: 16, frameHeight: 16 });
        scene.load.image('image10', house1Img);
        scene.load.image('wall', Wall);
        scene.load.image('tWall', TWall); // Top wall
        scene.load.image('bWall', BWall); // Bottom wall
        scene.load.image('rWall', RWall); // Right wall
        scene.load.image('lWall', LWall); // Left wall
        scene.load.image('trcWall', TRCWall); // Top-right corner wall
        scene.load.image('brcWall', BRCWall); // Bottom-right corner wall
        scene.load.image('tlcWall', TLCWall); // Top-left corner wall
        scene.load.image('blcWall', BLCWall); // Bottom-left corner wall
        scene.load.image('grass_interior', grass_interior);
        scene.load.image('grass_overhang_edge', grass_overhang_edge);
        scene.load.image('grass_overhang_corner', grass_overhang_corner);
        scene.load.image('grass_edge_water', grass_edge_water);
        scene.load.image('grass_corner_water', grass_corner_water);
        scene.load.image('grass_inner_corner_water', grass_inner_corner_water);
        scene.load.image('darkgrass_interior', darkgrass_interior);
        scene.load.image('darkgrass_edge_grass', darkgrass_edge_grass);
        scene.load.image('darkgrass_edge_water', darkgrass_edge_water);
        scene.load.image('darkgrass_shore_edge_grass', darkgrass_shore_edge_grass);
        scene.load.image('darkgrass_corner_water', darkgrass_corner_water);
        scene.load.image('darkgrass_inner_corner_water', darkgrass_inner_corner_water);
        scene.load.image('berryBush', berryBush);
        scene.load.image('seedBush', seedBush);
        scene.load.image('dirt_interior', dirt_interior);
        scene.load.image('dirt_edge_grass', dirt_edge_grass);
        scene.load.image('dirt_corner_grass', dirt_corner_grass);
        scene.load.image('dirt_edge_water', dirt_edge_water);
        scene.load.image('dirt_shore_edge_grass', dirt_shore_edge_grass);
        scene.load.image('dirt_corner_water', dirt_corner_water);
        scene.load.image('dirt_inner_corner', dirt_inner_corner);
        scene.load.image('dirt_inner_corner_water', dirt_inner_corner_water);
        scene.load.image('dirt_diag_join', dirt_diag_join);
        scene.load.image('house1', house1); 
        scene.load.image('house2', house2); 
        scene.load.image('construction', construction);
        scene.load.image('well', well); 
        scene.load.image('road_interior', road_interior); 
        scene.load.image('road_edge_grass', road_edge_grass); 
        scene.load.image('road_corner_grass', road_corner_grass); 
        scene.load.image('road_edge_water', road_edge_water);
        scene.load.image('road_shore_edge_grass', road_shore_edge_grass);
        scene.load.image('road_corner_water', road_corner_water);
        scene.load.image('road_inner_corner', road_inner_corner);
        scene.load.image('road_inner_corner_water', road_inner_corner_water);
        scene.load.image('road_diag_join', road_diag_join);
        scene.load.image('dungeon_interior', dungeon_interior);
        scene.load.image('dungeon_edge_grass', dungeon_edge_grass);
        scene.load.image('dungeon_corner_grass', dungeon_corner_grass);
        scene.load.image('dungeon_edge_water', dungeon_edge_water);
        scene.load.image('dungeon_shore_edge_grass', dungeon_shore_edge_grass);
        scene.load.image('dungeon_corner_water', dungeon_corner_water);
        scene.load.image('dungeon_inner_corner', dungeon_inner_corner);
        scene.load.image('dungeon_inner_corner_water', dungeon_inner_corner_water);
        scene.load.image('dungeon_diag_join', dungeon_diag_join);
        scene.load.spritesheet('water', water_interior, { frameWidth: 32, frameHeight: 32 });
        scene.load.spritesheet('crops', cropsSheet, { frameWidth: 32, frameHeight: 32 });
        scene.load.image('grassBerry', grassBerry);
        scene.load.image('grassWood', grassWood);
        scene.load.image('grassRock', grassRock);
        scene.load.image('storage', storage);
        scene.load.spritesheet('tower', tower, { frameWidth: 96, frameHeight: 96 });
        scene.load.spritesheet('tower_destroyed', tower_destroyed, { frameWidth: 96, frameHeight: 96 });
        scene.load.spritesheet('prison_closed', prison_closed, { frameWidth: 64, frameHeight: 64 });
        scene.load.spritesheet('prison_opened', prison_opened, { frameWidth: 64, frameHeight: 64 });
        scene.load.spritesheet('bank_closed', bank_closed, { frameWidth: 64, frameHeight: 64 });
        scene.load.spritesheet('bank_opened', bank_opened, { frameWidth: 64, frameHeight: 64 });
        scene.load.spritesheet('explosions', explosions, { frameWidth: 80, frameHeight: 74 });
        scene.load.spritesheet('smoke_clearing', smokeClearing, { frameWidth: 64, frameHeight: 64 });
        scene.load.image('gunslinger_bullet', gunslingerBullet);
        scene.load.image('hunter_bullet', hunterBullet);
        scene.load.image('turret_bullet', turretBullet);
        scene.load.spritesheet('weapon_hit_effect', hitEffect, { frameWidth: 32, frameHeight: 32 });
        scene.load.image('reward_mini_card', rewardMiniCard);
        scene.load.spritesheet('reward_treasure_chest', rewardTreasureChest, { frameWidth: 100, frameHeight: 80 });
    }

    create() {
        // Create a container for the dialog box
        const dialogContainer = this.add.container(0, 0);
        const dialogWidth = 800;
        const dialogHeight = 800;

        // Add a background for the dialog
        const dialogBackground = this.add.rectangle(0, 0, dialogWidth, dialogHeight, 0x222222)
            .setOrigin(0)
            .setInteractive(); // Make the background interactive for scrolling
        dialogContainer.add(dialogBackground);

        // Create a content container to hold the images
        const contentContainer = this.add.container(0, 0);

        // Add images to the content container
        const imageSpacing = 100; // Spacing between images
        for (let i = 0; i < 11; i++) {
            let y = (i * imageSpacing + 80)
            let x = 80
            if(y > 700){
                y %= 700;
                x += 150
            }
            const image = this.add.image(x, y, `image${(i % this.numItems) + 1}`)
                .setInteractive()
                .setName(`image${(i % this.numItems) + 1}`);

            const price = itemTab.itemValues(`image${(i % this.numItems) + 1}`).price || 0;

            // Price label
            const priceText = this.add.text(x + 40, y, `$${price}`, {
                fontSize: '16px',
                fill: '#ffffff',
                stroke: '#000000',
                strokeThickness: 2
            }).setOrigin(0, 0.5);

            // Add selection behavior
            image.on('pointerdown', () => {
                if (itemTab.mapRef.money >= price) {
                    this.input.stopPropagation();
                    this.registry.set('image', image.name);
                    this.scene.switch('mapView');
                } else {
                    showAlert(this, 'Insufficient Funds', '#ff3333');
                }
            });

            // Add to content container
            contentContainer.add(image);
        }

        // Add the content container to the dialog
        dialogContainer.add(contentContainer);

        // Mask the content
        const maskShape = this.add.graphics().fillRect(0, 0, dialogWidth, dialogHeight);
        const mask = maskShape.createGeometryMask();
        contentContainer.setMask(mask);

        // Enable scrolling
        this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
            const newY = Phaser.Math.Clamp(contentContainer.y - deltaY, -(contentContainer.height - dialogHeight), 0);
            contentContainer.setY(newY);
        });

        this.sceneButtons()
    }

    sceneButtons(){
        // Add a button or event to switch back to SceneA
        const main = this.add.text(10, this.cameras.main.height - 40, 'Main', { fontSize: '24px', fill: '#00ff00' })
            .setInteractive()
            .on('pointerdown', () => {
                this.scene.selectMode = true;
                this.input.stopPropagation();
                this.scene.switch('mapView');
            })
        main.depth = UIDEPTH;
    }

    static itemValues(value){
        switch (value) {
            case 'image1':
                return TILE_TYPES.sand
            case 'image2':
                return {grid: 2, lenX: 3, lenY: 3, block: false, depth: FLOORDEPTH, value: 'image2', spread: false}
            case 'image3':
                return TILE_TYPES.grass;
            case 'image4': //wall
                return TILE_TYPES.wall;
            case 'image5':
                return TILE_TYPES.dirt;
            case 'image6':
                return TILE_TYPES.pine
            case 'image7':
                return TILE_TYPES.turret
            case 'image8':
                return TILE_TYPES.water
            case 'image9':
                return TILE_TYPES.player
            case 'image10':
                return TILE_TYPES.house1
            default:
                break;
        }
    }
}


