import { SQUARESIZE, FLOORDEPTH, WORLD_DIMENSIONX, WORLD_DIMENSIONY, TILE_TYPES, TILE_MAP, TILE_ARR, BLOCKDEPTH, CONTROL_STATES, UIDEPTH, PARCEL, showAlert, colorFor } from "./constants";
import Phaser from "phaser";
import { Turret } from "./buildings/Turret";
import { Catapult } from "./buildings/Catapult";
import { Player } from "./players/Player";
import { buildingArray, spawnPoints, townRoads } from "./town";
import { Teams } from "./Teams";
import { buildingManager } from "./Manager/buildingManager";
import { seedManager } from "./Manager/seedManager";
import { House } from "./buildings/House";
import { StorageBuilding } from "./buildings/Storage";
import { blockResourceManager } from "./Manager/BlockResourceManager";
import { ClayOven } from "./buildings/ClayOven";
import { mapView } from "./mapView";
import { PineTree } from "./buildings/pineTree";
import { RockNode } from "./buildings/RockNode";
import { VisibilitySystem } from "./UI/VisibilitySystem";
import { AudioManager } from "./Manager/AudioManager";
import { WallPlacementController } from "./Controllers/WallPlacementController";
import { Wall } from "./buildings/Wall";
import { StorageManager } from "./Manager/StorageManager";
import { TowerBuilding } from "./buildings/Tower";
import { OrderRunner } from "./orders/OrderRunner";

const colors = {
    green: { r: 14, g: 209, b: 69 },
    blue: { r: 60, g: 184, b: 241 },
    gray : {r: 88, g: 88, b: 88},
    brown: {r: 76, g: 43, b: 24},
    lightGray : {r: 195, g: 195, b: 195},
    darkGreen: {r: 0, g: 100, b: 0},
    darkRed: {r: 139, g: 0, b: 0},
    lightBrown: {r: 125, g: 73, b: 0},
    rockGray: {r: 90, g: 104, b: 43}
};

const OUTER_WATER_TILE_DIMENSION = 250;

export class Map{
    static barrier;
    static structureBarrier;
    static graphics;
    static grid;
    static navGrid
    static navMesh;
    static regionSystem;
    static regionDrawer;
    static enemyNavMesh;
    static enemyNavGrid;
    static enemyRegionSystem;
    static enemyRegionDrawer;
    static scene;
    static imageData;
    static placingItem = null; // The current item being placed
    static isPlacing = false; // Flag to indicate placement mode
    static blocks = [];
    static cropDict = {};  // add at top of map.js
    static waterBlocks = [];
    static outerWaterLayer;
    static outerWaterTileSprite;
    static outerWaterAmbienceOverlay;
    static renderCache = [];
    static cameraBounds;
    static worldPines = [];
    static worldStones = [];
    static worldSeedBushes = [];
    static worldBerryBushes = [];
    static worldSpawners = [];
    static navGridRevision = 0;
    static navGridRevisionReason = null;

    static getNavGridRevision() {
        return Math.max(0, Number(this.navGridRevision || 0));
    }

    static bumpNavGridRevision(reason = "nav_grid_change") {
        this.navGridRevision = this.getNavGridRevision() + 1;
        this.navGridRevisionReason = reason;
        return this.navGridRevision;
    }

    static _bindCropHover(block, x, y, teamNumber = "1") {
        if (!block) return;

        block.cropGridX = Number(x);
        block.cropGridY = Number(y);
        block.cropTeamNumber = String(teamNumber ?? "1");
        block.isHoverOnlyWorldObject = true;

        if (block._cropHoverBound) return;
        block._cropHoverBound = true;

        if (!block.input) {
            block.setInteractive();
        }

        block.on("pointerover", (pointer) => {
            block.scene?.showCropHoverCard?.(block, pointer);
        });
        block.on("pointerout", () => {
            block.scene?.hideCropHoverCard?.(block);
        });
        block.once?.("destroy", () => {
            block.scene?.hideCropHoverCard?.(block, { immediate: true });
        });
    }


    static initMap(){
        this._detailedWorldDrawn = false;
        this._detailedWorldDirty = false;
        this.blocks = [];
        this.waterBlocks = [];
        this.outerWaterTileSprite = null;
        this.outerWaterAmbienceOverlay = null;
        this.barrier = this.scene.physics.add.staticGroup();  // Ensure barriers are static bodies
        this.graphics = this.scene.add.graphics();
        Map.outerWaterLayer = Map.scene.add.layer();
        Map.outerWaterLayer.setName?.("outerWaterLayer");
        Map.outerWaterLayer.setDepth(FLOORDEPTH - 2);
        Map.worldLayer = Map.scene.add.layer();
        Map.worldLayer.setName?.("worldLayer");
        Map.worldStaticLayer = Map.scene.add.layer();   // NEW: buildings/trees/rocks/placing ghosts etc.
    }

    static resetRuntimeState() {
        this._detailedWorldDirty = false;
        try { this.placingItem?.destroy?.(); } catch {}
        this.placingItem = null;
        this.isPlacing = false;

        try { this.graphics?.destroy?.(); } catch {}
        this.graphics = null;

        try { this.barrier?.clear?.(true, true); } catch {}
        try { this.barrier?.destroy?.(); } catch {}
        this.barrier = null;

        try { this.structureBarrier?.clear?.(true, true); } catch {}
        try { this.structureBarrier?.destroy?.(); } catch {}
        this.structureBarrier = null;

        try { this.worldLayer?.removeAll?.(true); } catch {}
        try { this.worldLayer?.destroy?.(true); } catch {}
        this.worldLayer = null;

        try { this.outerWaterLayer?.removeAll?.(true); } catch {}
        try { this.outerWaterLayer?.destroy?.(true); } catch {}
        this.outerWaterLayer = null;
        this.outerWaterTileSprite = null;
        this.outerWaterAmbienceOverlay = null;

        try { this.worldStaticLayer?.removeAll?.(true); } catch {}
        try { this.worldStaticLayer?.destroy?.(true); } catch {}
        this.worldStaticLayer = null;

        this.grid = [];
        this.navGrid = [];
        this.navMesh = null;
        this.regionSystem = null;
        this.regionDrawer = null;
        this.enemyNavMesh = null;
        this.enemyNavGrid = [];
        this.enemyRegionSystem = null;
        this.enemyRegionDrawer = null;
        this.navGridRevision = 0;
        this.navGridRevisionReason = null;
        this.imageData = null;
        this.blocks = [];
        this.cropDict = {};
        this.waterBlocks = [];
        this.renderCache = [];
        this.cameraBounds = null;
        this.worldPines = [];
        this.worldStones = [];
        this.worldSeedBushes = [];
        this.worldBerryBushes = [];
        this.worldSpawners = [];
    }

    static initGrid(){ // precompute oriented frames + minimal base/top pairing
        const H = this.grid.length, W = this.grid[0].length;

        for (let y=0; y<H; y++){
            for (let x=0; x<W; x++){
            const cell = this.grid[y][x];

            if (Array.isArray(cell)) {
                const btm = TILE_MAP(cell[0]);
                const top = TILE_MAP(cell[1]);
                if (btm && TILE_TYPES[btm].complex) this.determineTileType(x,y,btm,0,0);
                if (top && TILE_TYPES[top].complex)  this.determineTileType(x,y,top,1,0);
                continue;
            }

            const name = TILE_MAP(cell);
            if (!name) continue;

            // Water always sits on base (avoid seams), even if interior
            if (name === 'water') {
                this.determineTileType(x,y,'water',-1,0);
                continue;
            }

            // Complex floors (dirt): orient; pair only if non-interior (edges/corners/island)
            if (TILE_TYPES[name].complex) {
                this.determineTileType(x,y,name,-1,0);
            }

            // Non-complex: leave as-is
            }
        }
        this._rebuildRenderCache();
    }

    static MapFromImage(canvas, image){
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        this.imageData = context.getImageData(0, 0, image.width, image.height);

        for (let y = 0; y < this.imageData.height; y++) {
            for (let x = 0; x < this.imageData.width; x++) {
                let sample = this.sample(x,y);
                this.grid[y][x] = sample;
                if(sample == TILE_TYPES.water.grid || sample == TILE_TYPES.wall.grid){
                    this.navGrid[y][x] = 0
                }else{
                    this.navGrid[y][x] = 1
                }
            }
        }
        this.bumpNavGridRevision("map_image_nav_grid");
        this.imageData = null;
        return this.grid;
    }

    static mapFromData(data){
        this._detailedWorldDrawn = false;
        this.blocks = [];
        this.waterBlocks = [];
        this.grid = data;
        this.initGrid();
    }

    static beginPlacing(item){
        this.placingItem = this.scene.add.sprite(0, 0, item.value)
            .setAlpha(0.5) // Make it semi-transparent
            .setDepth(item.depth) // Ensure it's above everything
            .setInteractive();
        this.placingItem._placementItem = item;
        this.placingItem.blocked = false;
       // Enable mouse-following behavior
        this.isPlacing = true; 
        this.scene.input.on('pointermove', (pointer) => {
            if (
                this.placingItem &&
                this.isPlacing &&
                Number.isFinite(pointer.worldX) &&
                Number.isFinite(pointer.worldY)
            ) {
                let lenX = item.lenX;
                let lenY = item.lenY;
                let x = Math.floor(pointer.worldX / SQUARESIZE) * SQUARESIZE;
                let y = Math.floor(pointer.worldY / SQUARESIZE) * SQUARESIZE;
                if(item.lenX%2 != 0){x += SQUARESIZE/2}
                if(item.lenY%2 != 0){y += SQUARESIZE/2}
                // compute the grid‐aligned top-left tile for the item
                const gridX = Math.floor(x / SQUARESIZE) - Math.floor(lenX / 2);
                const gridY = Math.floor(y / SQUARESIZE) - Math.floor(lenY / 2);
                // pass both dimensions into checkBlockPosition
                const tintColor = this.checkBlockPosition(
                    gridX,
                    gridY,
                    lenX,
                    lenY,
                    this.placingItem,
                    item?.block ? {
                        padding: 1,
                        protectFarmSpots: true,
                        paddingAllowWalls: true,
                        paddingProtectFarmSpots: false,
                        allowAutoClearSite: true,
                    } : {}
                );
                this.placingItem.setTint(tintColor);
                this.placingItem.setPosition(x, y);
            } else if (this.placingItem) {
                this._clearPlacementAutoClearPreview(this.placingItem);
            }
        });
    }

    static placeItem(x,y,item){
        const placingItem = this.scene.add.sprite(0, 0, item.value)
            .setDepth(item.depth) // Ensure it's above everything
            .setInteractive();
        placingItem.clearTint()
        placingItem.setAlpha(1); // Set full visibility
        if(item.lenX%2 != 0){x += SQUARESIZE/2}
        if(item.lenY%2 != 0){y += SQUARESIZE/2}
        placingItem.setPosition(x + Math.floor(item.lenX/2)*SQUARESIZE, y + Math.floor(item.lenY/2)*SQUARESIZE); // Finalize position
        x = Math.floor(x/SQUARESIZE)
        y = Math.floor(y/SQUARESIZE)
        if (item?.block && !this.isWithinMainIslandBuildInterior(x, y, item.lenX, item.lenY)) {
            return null;
        }
        this.drawRoadAround(x,y,item)
        this.addBlockItem(x,y,item)
        const itemToPlace = placingItem
        itemToPlace.setInteractive();
        itemToPlace.dontTrack = true;
        itemToPlace.sx = x
        itemToPlace.sy = y
        itemToPlace.lenX = item.lenX
        itemToPlace.lenY = item.lenY
        itemToPlace.on('pointerover', () => {
            if(this.scene.breakItems && this.scene.breakItems.text == "Place"){
                itemToPlace.setTint(0xaaaaaa); // Darken slightly on hover
            }
        });
        itemToPlace.on('pointerout', () => {
            if(this.scene.breakItems && this.scene.breakItems.text == "Place"){
                itemToPlace.clearTint(); // Restore original color
            }
        });
        itemToPlace.on('pointerdown', () => {
            if(this.scene.breakItems && this.scene.breakItems.text == "Place"){
                console.log('Destroying item...');
                Teams.teamLists['1'].destroyStates.push({
                    type: item,
                    value: itemToPlace,
                    x: x,
                    y: y,
                    duration: 100,
                    assigned: 0
                });
                buildingManager.assingTroopsToDestroy(1);
            }
        });
    }

    static drawRoadAround(x, y, item, team) {
        const startX = x - 1;
        const startY = y - 1;
        const endX   = x + item.lenX;
        const endY   = y + item.lenY;

        if (VisibilitySystem.viewRect == null) return;

        const roadList = (team != null && townRoads[team]) ? townRoads[team] : null;

        const inBounds = (gx, gy) =>
            gy >= 0 && gx >= 0 && gy < Map.grid.length && gx < Map.grid[0].length;

        const canPaintRoadOverBase = (baseTypeName) =>
            baseTypeName === "grass" ||
            baseTypeName === "dark_grass" ||
            baseTypeName === "road" ||
            baseTypeName === "dirt" ||
            baseTypeName === "fort_floor";

        // Floor-only gate: allow painting floor where base isn't blocking.
        const canWriteFloorHere = (gx, gy) => {
            if (!inBounds(gx, gy)) return false;
            const cell    = Map.grid[gy][gx];
            const baseVal = Array.isArray(cell) ? Map._pickFloorValFromCell(cell) : cell;
            const baseTypeName = TILE_MAP(baseVal);
            const baseTyp = TILE_TYPES[baseTypeName];
            if (!canPaintRoadOverBase(baseTypeName)) return false;
            return !baseTyp?.block; // floor must not be blocking
        };

        // 1) UNDERLAY: fill the whole building footprint with ROAD INTERIOR on the floor layer
        //    (so the building sits on road, like your old behavior)
        const roadInterior = TILE_TYPES.road.interior;
        for (let row = y; row < y + item.lenY; row++) {
            for (let col = x; col < x + item.lenX; col++) {
            if (!canWriteFloorHere(col, row)) continue;

            // Write a floor road interior, regardless of any other floor at this cell
            // (uses your depth-aware writer; okay to overwrite floor here)
            this.checkAndPlace(col, row, roadInterior, FLOORDEPTH);
            this.drawGridValue(col, row);
            }
        }

        // 2) RING: auto-tile the perimeter roads using placeTile (edges/corners/islands + neighbor updates)
        const ringCanLay = (gx, gy) => {
            if (!inBounds(gx, gy)) return false;

            const cell    = Map.grid[gy][gx];
            const baseVal = Array.isArray(cell) ? Map._pickFloorValFromCell(cell) : cell;
            const topVal  = Array.isArray(cell) ? (cell[0] === baseVal ? cell[1] : cell[0]) : null;

            const baseTypeName = TILE_MAP(baseVal);
            const baseType = TILE_TYPES[baseTypeName];
            const topType  = topVal != null ? TILE_TYPES[TILE_MAP(topVal)] : null;
            const topIsWall = !!Map._wallStructureInfoAt?.(gx, gy);

            // skip if a blocking top building is present, but allow painting road under walls/doors
            if (topType?.block && !topIsWall) return false;
            if (!canPaintRoadOverBase(baseTypeName)) return false;
            // skip if base already road (no need to repaint)
            if (TILE_MAP(baseVal) === 'road') return false;
            // leave planted crops alone on the perimeter ring
            if (Map._cellHasPlacedCrop?.(gx, gy)) return false;
            // skip if base itself is blocking
            if (baseType?.block) return false;

            return true;
        };

        // Pass 1: lay ring roads
        for (let row = startY; row <= endY; row++) {
            for (let col = startX; col <= endX; col++) {
            const isEdge = (row === startY || row === endY || col === startX || col === endX);
            if (!isEdge) continue;

            if (ringCanLay(col, row)) {
                this.placeTile(col, row, 'road'); // lets your auto-tiler pick edge/corner/island
                if (roadList) roadList.push([col, row]);
            }
            }
        }

        // Pass 2: light re-touch to finalize ring corners after full ring exists
        for (let row = startY; row <= endY; row++) {
            for (let col = startX; col <= endX; col++) {
            const isEdge = (row === startY || row === endY || col === startX || col === endX);
            if (!isEdge) continue;

            const cell    = Map.grid[row][col];
            const baseVal = Array.isArray(cell) ? Map._pickFloorValFromCell(cell) : cell;
            if (TILE_MAP(baseVal) === 'road') this.placeTile(col, row, 'road');
            }
        }
    }


    static handleMapClick(x, y, item) {
        // If we're in placing mode, finalize the placement
        if(item == TILE_TYPES.player && this.placingItem && !this.placingItem.blocked){
            Player.addPlayer(x, y, 0)
        }
        else {
            this.placeItem(x,y,item)
        }
    }

    // Helper: does a tile value block?
    // Accepts:
    // - null/undefined
    // - numeric tile value
    // - nested arrays like [floor, top] or even [[floorA, floorB], top]
    static _tileIsBlocking(val) {
        if (val == null) return false;
        // NEW: recursive array handling
        if (Array.isArray(val)) {
            // block if ANY element blocks (covers 2-floor weirdness + nested pairs)
            for (const v of val) {
                if (this._tileIsBlocking(v)) return true;
            }
            return false;
        }
        const name = TILE_MAP(val);
        if (!name) return false;
        const t = TILE_TYPES[name];
        return !!t?.block;
    }

    static _cellIsBlocking(x, y) {
        const row = this.grid[y];
        if (!row) return true;          // OOB blocked
        const cell = row[x];
        if (cell == null) return true;  // missing blocked

        // NEW: let _tileIsBlocking handle scalar OR array OR nested arrays
        return this._tileIsBlocking(cell);
    }

    static getMainIslandBounds() {
        const origin = this.scene?.parcelManager?.mainIslandOrigin ?? PARCEL.MAIN_ORIGIN;
        const minX = Number(origin?.x ?? PARCEL.MAIN_ORIGIN.x);
        const minY = Number(origin?.y ?? PARCEL.MAIN_ORIGIN.y);
        return {
            minX,
            minY,
            maxX: minX + PARCEL.SIZE - 1,
            maxY: minY + PARCEL.SIZE - 1,
        };
    }

    static isWithinMainIslandBuildInterior(posX, posY, lenX = 1, lenY = 1, margin = 1) {
        const { minX, minY, maxX, maxY } = this.getMainIslandBounds();
        return (
            posX >= minX + margin &&
            posY >= minY + margin &&
            (posX + lenX - 1) <= maxX - margin &&
            (posY + lenY - 1) <= maxY - margin
        );
    }

    static _cellHasPlacedCrop(x, y) {
        const row = this.grid?.[y];
        if (!row || row[x] == null) return false;

        const cell = row[x];
        if (TILE_MAP(this.grabDepth(cell, FLOORDEPTH)) === "crops") return true;
        return Array.isArray(cell) && cell.some((val) => TILE_MAP(val) === "crops");
    }

    static _cellHasProtectedFarmSpot(x, y, teamNumber = 1) {
        const row = this.grid?.[y];
        if (!row || row[x] == null) return false;

        const team =
            Teams.teamLists?.[`${teamNumber}`] ??
            Teams.teamLists?.[teamNumber];
        if (!team) return false;

        if (this._cellHasPlacedCrop(x, y)) return true;
        if (Teams.getCropAt?.(x, y, teamNumber)) return true;

        if (team.tileList?.some((spot) => spot?.x === x && spot?.y === y)) return true;
        if (team.TeamFarmSpots?.some((spot) => spot?.x === x && spot?.y === y)) return true;

        return false;
    }

    static _cellHasActualCrop(x, y, teamNumber = 1) {
        const key = `${x},${y}`;
        if (this._cellHasPlacedCrop(x, y)) return true;
        if (this.cropDict?.[key]?.active !== false && this.cropDict?.[key]) return true;

        const hasCropInTeam = (team) =>
            Array.isArray(team?.crops) &&
            team.crops.some((crop) => Number(crop?.x) === x && Number(crop?.y) === y);

        const team =
            Teams.teamLists?.[`${teamNumber}`] ??
            Teams.teamLists?.[teamNumber];
        if (hasCropInTeam(team)) return true;

        return Object.values(Teams.teamLists || {}).some(hasCropInTeam);
    }

    static _cellHasRealBuildingFootprint(x, y) {
        for (const team of Object.values(Teams.teamLists || {})) {
            const buildings = Array.isArray(team?.buildings) ? team.buildings : [];
            for (const entry of buildings) {
                const ref =
                    entry?.[3]?.buildingRef ??
                    entry?.[3] ??
                    entry?.buildingRef ??
                    entry?.value ??
                    null;

                if (ref?._destroyed || ref?._isDestroyed || ref?.active === false || ref?.sprite?.active === false) {
                    continue;
                }

                const type =
                    entry?.[2] ??
                    entry?.type ??
                    entry?.tileType ??
                    ref?.tileType ??
                    ref?.buildType ??
                    ref?.type ??
                    null;

                const startX = Number(entry?.[0] ?? entry?.x ?? ref?.gridX ?? ref?.x);
                const startY = Number(entry?.[1] ?? entry?.y ?? ref?.gridY ?? ref?.y);
                if (!Number.isFinite(startX) || !Number.isFinite(startY)) continue;

                const lenX = Math.max(1, Number(type?.lenX ?? ref?.lenX ?? 1) || 1);
                const lenY = Math.max(1, Number(type?.lenY ?? ref?.lenY ?? 1) || 1);
                if (
                    x >= startX &&
                    x < startX + lenX &&
                    y >= startY &&
                    y < startY + lenY
                ) {
                    return true;
                }
            }
        }

        return false;
    }

    static _cellHasAutoClearableSiteObstacle(x, y, options = {}) {
        if (this._wallStructureInfoAt?.(x, y)) return true;
        return !!options?.protectFarmSpots && this._cellHasActualCrop(x, y, options?.teamNumber ?? 1);
    }

    static _clearPlacementAutoClearPreview(previewItem = null) {
        const markers = previewItem?._autoClearPreviewMarkers ?? this._autoClearPreviewMarkers ?? [];
        for (const marker of markers) {
            marker?.tween?.remove?.();
            marker?.overlay?.destroy?.();
            marker?.xText?.destroy?.();
            marker?.label?.destroy?.();
        }
        if (previewItem) {
            previewItem._autoClearPreviewMarkers = [];
            previewItem._autoClearPreviewKey = "";
        } else {
            this._autoClearPreviewMarkers = [];
            this._autoClearPreviewKey = "";
        }
    }

    static _placementAutoClearTargets(posX, posY, lenX, lenY, options = {}, blocked = false) {
        if (blocked || !options?.allowAutoClearSite) return [];
        if (!this.isWithinMainIslandBuildInterior(posX, posY, lenX, lenY)) return [];

        const targets = [];
        const seen = new Set();

        for (let y = posY; y < posY + lenY; y++) {
            for (let x = posX; x < posX + lenX; x++) {
                const row = this.grid?.[y];
                if (!row || row[x] == null) return [];
                if (this._cellHasRealBuildingFootprint(x, y)) return [];

                const wallInfo = this._wallStructureInfoAt?.(x, y);
                const hasCrop = !!options?.protectFarmSpots && this._cellHasActualCrop(x, y, options?.teamNumber ?? 1);

                if (this._cellIsBlocking(x, y) && !wallInfo) return [];
                if (this._cellHasProtectedFarmSpot(x, y, options?.teamNumber ?? 1) && !hasCrop) return [];

                const kind = wallInfo ? "wall" : hasCrop ? "crop" : null;
                if (!kind) continue;

                const key = `${kind}:${x},${y}`;
                if (seen.has(key)) continue;
                seen.add(key);
                targets.push({ x, y, kind });
            }
        }

        return targets;
    }

    static _updatePlacementAutoClearPreview(posX, posY, lenX, lenY, previewItem = null, options = {}, blocked = false) {
        if (!previewItem || !this.scene?.add) return;
        if (this.scene?.zoomMixer?.mode === "overview") {
            this._clearPlacementAutoClearPreview(previewItem);
            return;
        }

        const targets = this._placementAutoClearTargets(posX, posY, lenX, lenY, options, blocked);
        const nextKey = targets.map((target) => `${target.kind}:${target.x},${target.y}`).join("|");
        if (previewItem._autoClearPreviewKey === nextKey) return;

        this._clearPlacementAutoClearPreview(previewItem);
        previewItem._autoClearPreviewKey = nextKey;
        if (!targets.length) return;

        if (!previewItem._autoClearPreviewDestroyBound) {
            previewItem._autoClearPreviewDestroyBound = true;
            previewItem.once?.("destroy", () => this._clearPlacementAutoClearPreview(previewItem));
        }

        previewItem._autoClearPreviewMarkers = targets.map((target) => {
            const cx = target.x * SQUARESIZE + SQUARESIZE / 2;
            const cy = target.y * SQUARESIZE + SQUARESIZE / 2;
            const overlay = this.scene.add.rectangle(cx, cy, SQUARESIZE * 0.92, SQUARESIZE * 0.92, 0xff2a2a, 0.22)
                .setStrokeStyle(2, 0xff3434, 0.95)
                .setDepth(UIDEPTH + 8)
                .setScrollFactor(1);
            const xText = this.scene.add.text(cx, cy - 1, "X", {
                fontSize: "20px",
                fill: "#ff1f1f",
                stroke: "#2b0000",
                strokeThickness: 5,
                fontFamily: "Bungee",
            })
                .setOrigin(0.5, 0.5)
                .setDepth(UIDEPTH + 9)
                .setScrollFactor(1);
            const label = this.scene.add.text(cx, cy + SQUARESIZE * 0.28, "CLEAR", {
                fontSize: "8px",
                fill: "#ffe1e1",
                stroke: "#2b0000",
                strokeThickness: 3,
                fontFamily: "Bungee",
            })
                .setOrigin(0.5, 0.5)
                .setDepth(UIDEPTH + 9)
                .setScrollFactor(1);

            const tween = this.scene.tweens?.add?.({
                targets: [overlay, xText, label],
                alpha: 0.35,
                duration: 360,
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut",
            }) ?? null;

            return { overlay, xText, label, tween };
        });
    }

    static _cellHasPlacementConflict(x, y, options = {}) {
        const {
            protectFarmSpots = false,
            treatOutOfBoundsAsBlocked = true,
            allowWallAdjacency = false,
            allowAutoClearSite = false,
        } = options;

        const row = this.grid?.[y];
        if (!row || row[x] == null) return treatOutOfBoundsAsBlocked;

        if (this._cellHasRealBuildingFootprint(x, y)) return true;

        if (allowWallAdjacency && this._wallStructureInfoAt?.(x, y)) {
            return false;
        }

        if (buildingManager._queuedBlockBuildCovers?.(x, y)) return true;
        if (allowAutoClearSite && this._cellHasAutoClearableSiteObstacle(x, y, options)) return false;
        if (this._cellIsBlocking(x, y)) return true;
        if (protectFarmSpots && this._cellHasProtectedFarmSpot(x, y)) return true;

        return false;
    }

    static _placementIsBlocked(posX, posY, lenX, lenY, options = {}) {
        const padding = Math.max(0, options?.padding ?? 0);

        for (let y = posY; y < posY + lenY; y++) {
            for (let x = posX; x < posX + lenX; x++) {
                if (this._cellHasPlacementConflict(x, y, options)) return true;
            }
        }

        if (padding <= 0) return false;

        for (let y = posY - padding; y < posY + lenY + padding; y++) {
            for (let x = posX - padding; x < posX + lenX + padding; x++) {
                const insideFootprint =
                    x >= posX &&
                    x < posX + lenX &&
                    y >= posY &&
                    y < posY + lenY;
                if (insideFootprint) continue;

                if (
                    this._cellHasPlacementConflict(x, y, {
                        ...options,
                        treatOutOfBoundsAsBlocked: false,
                        allowWallAdjacency: !!options?.paddingAllowWalls,
                        protectFarmSpots: options?.paddingProtectFarmSpots ?? options?.protectFarmSpots ?? false,
                    })
                ) {
                    return true;
                }
            }
        }

        return false;
    }

    static _shouldSkipManagedTopRender(typeName) {
        return (
            typeName === "house1" ||
            typeName === "house2" ||
            typeName === "storage" ||
            typeName === "clayOven" ||
            typeName === "tower" ||
            typeName === "turret" ||
            typeName === "catapult" ||
            typeName === "spawn" ||
            typeName === "prison" ||
            typeName === "bank"
        );
    }

    // New array-aware placement check (used for building previews)
    static checkBlockPosition(posX, posY, lenX, lenY, previewItem = this.placingItem, options = {}) {
        const blocked =
            !this.isWithinMainIslandBuildInterior(posX, posY, lenX, lenY) ||
            this._placementIsBlocked(posX, posY, lenX, lenY, options);
        if (previewItem) previewItem.blocked = blocked;
        this._updatePlacementAutoClearPreview(posX, posY, lenX, lenY, previewItem, options, blocked);
        if (blocked) {
            return Phaser.Display.Color.GetColor(200, 49, 19); // red
        }
        return Phaser.Display.Color.GetColor(14, 209, 69); // green
    }

    // (Optional) make the generator check consistent with the new rules
    static checkBlockPositionGen(posX, posY, lenX, lenY, options = {}) {
        if (options?.enforceMainIslandInterior && !this.isWithinMainIslandBuildInterior(posX, posY, lenX, lenY)) {
            return true;
        }
        return this._placementIsBlocked(posX, posY, lenX, lenY, options);
    }

    static checkSpreadPosition(posX, posY, endX, endY){
        const startX = Math.min(posX, endX);
        const startY = Math.min(posY, endY);
        const maxX = Math.max(posX, endX);
        const maxY = Math.max(posY, endY);
        const lenX = (maxX - startX) + 1;
        const lenY = (maxY - startY) + 1;

        if (!this.isWithinMainIslandBuildInterior(startX, startY, lenX, lenY)) {
            return true;
        }

        for (let y = startY; y <= maxY; y++) {
            for (let x = startX; x <= maxX; x++) {
                if(this._cellIsBlocking(x,y)){
                    return true;
                }
            }
        }
        return false;
    }

    static addSpreadItem(posX, posY, item) {
        let index;
        for (let y = posY; y < posY + item.lenY + 1; y++) {
            for (let x = posX; x < posX + item.lenX + 1; x++) {
                item.depth == FLOORDEPTH? index = 0: index = 1
                this.addSpreadArr(x,y,item,index)
            }   
        }
    }

    static _floorInteriorValAtOrNear(x, y, fallbackType = "dirt") {
        const fromVal = (val) => {
            const name = TILE_MAP(val);
            const def = name ? TILE_TYPES[name] : null;
            if (!def || def.depth !== FLOORDEPTH) return null;
            return def.interior ?? def.grid ?? null;
        };

        const cell = this.grid?.[y]?.[x];
        if (Array.isArray(cell)) {
            const baseVal = fromVal(cell[0]);
            if (baseVal != null) return baseVal;
            const topVal = fromVal(cell[1]);
            if (topVal != null) return topVal;
        } else {
            const currentVal = fromVal(cell);
            if (currentVal != null) return currentVal;
        }

        const samples = [
            [0, -1], [1, 0], [0, 1], [-1, 0],
            [-1, -1], [1, -1], [1, 1], [-1, 1],
        ];
        for (const [dx, dy] of samples) {
            const nearby = this.grid?.[y + dy]?.[x + dx];
            if (Array.isArray(nearby)) {
                const baseVal = fromVal(nearby[0]);
                if (baseVal != null) return baseVal;
                const topVal = fromVal(nearby[1]);
                if (topVal != null) return topVal;
                continue;
            }

            const nearbyVal = fromVal(nearby);
            if (nearbyVal != null) return nearbyVal;
        }

        const fallback = TILE_TYPES[fallbackType];
        return fallback?.interior ?? fallback?.grid ?? null;
    }

    static addTopLayerItem(posX, posY, item, opts = {}) {
        const lenX = Math.max(1, Number(item?.lenX || 1) || 1);
        const lenY = Math.max(1, Number(item?.lenY || 1) || 1);
        const fallbackFloorType = opts?.fallbackFloorType || "dirt";

        for (let y = posY; y < posY + lenY; y++) {
            if (!this.grid?.[y]) continue;
            for (let x = posX; x < posX + lenX; x++) {
                if (this.grid[y][x] == null) continue;

                const floorVal = this._floorInteriorValAtOrNear(x, y, fallbackFloorType);
                if (floorVal == null) continue;
                this.grid[y][x] = [floorVal, item.grid];
                this._refreshRenderCacheAround(x, y);
            }
        }
    }

    static addBlockItem(posX, posY, item){
        let navChanged = false;
        for (let y = posY; y < posY + item.lenY; y++) {
            for (let x = posX; x < posX + item.lenX; x++) {
                this.checkAndPlace(x,y,item.grid,item.depth)
                if(item.block){
                    let barrierBlock = this.scene.physics.add.staticImage(x * SQUARESIZE + SQUARESIZE/2, y * SQUARESIZE + SQUARESIZE/2, 'barrier');
                    barrierBlock.setDisplaySize(SQUARESIZE, SQUARESIZE).setDepth(FLOORDEPTH).setAlpha(0);
                    this.barrier.add(barrierBlock);
                    if (Map.navGrid?.[y]?.[x] !== undefined) {
                        navChanged = navChanged || Map.navGrid[y][x] !== 0;
                        Map.navGrid[y][x] = 0;
                    }
                    if (Map.enemyNavGrid?.[y]?.[x] !== undefined) {
                        navChanged = navChanged || Map.enemyNavGrid[y][x] !== 0;
                        Map.enemyNavGrid[y][x] = 0;
                    }
                }
            }
        }
        if (navChanged) this.bumpNavGridRevision("block_item_nav_change");
        this.finalizeBlockPlacement(posX, posY, item);
    }

    static finalizeBlockPlacement(posX, posY, item) {
        if (!item?.block || !this._shouldSkipManagedTopRender?.(item.name)) return;
        const lenX = Math.max(1, Number(item.lenX || 1) || 1);
        const lenY = Math.max(1, Number(item.lenY || 1) || 1);
        this.redrawRect?.(posX - 1, posY - 1, lenX + 2, lenY + 2, 1);
        this.scene?.zoomMixer?.updateOverviewCell?.(posX - 1, posY - 1, this.grid, lenX + 2, lenY + 2);
    }

    // Return whichever layer in `cell` is floor-depth; if both are floor, prefer [0].
    static _pickFloorValFromCell(cell){
        if (!Array.isArray(cell)) return cell;
        const v0 = cell[0], v1 = cell[1];
        const t0 = TILE_TYPES[TILE_MAP(v0)];
        const t1 = TILE_TYPES[TILE_MAP(v1)];
        const d0 = t0?.depth, d1 = t1?.depth;
        if (d0 === FLOORDEPTH && d1 !== FLOORDEPTH) return v0;
        if (d1 === FLOORDEPTH && d0 !== FLOORDEPTH) return v1;
        return v0; // both floor (or neither): default to [0]
    }

    // Choose which layer index to write to in an existing array cell.
    // Prefer the layer that already holds `preferTypeName`; else the one matching `depth`.
    // If both match depth (two floors), prefer the layer that already contains the same type;
    // if still ambiguous, prefer index 1 for "overlay" feel; else fallback to 0.
    static _chooseLayerIndexForExistingCell(cell, depth, preferTypeName){
        const m0 = TILE_MAP(cell[0]);
        const m1 = TILE_MAP(cell[1]);
        if (preferTypeName) {
            if (m0 === preferTypeName) return 0;
            if (m1 === preferTypeName) return 1;
        }
        const d0 = TILE_TYPES[m0]?.depth, d1 = TILE_TYPES[m1]?.depth;
        const z0 = d0 === depth, z1 = d1 === depth;
        if (z0 && !z1) return 0;
        if (z1 && !z0) return 1;
        if (z0 && z1) {
            // both same depth (e.g., two floors). If one already matches the type, we’d have caught it above.
            return 1; // treat [1] as overlay by convention
        }
        return 0;
    }

    // Convenience: resolve index for (x,y)
    static _layerIndexFor(x, y, depth, preferTypeName){
        const cell = this.grid[y]?.[x];
        if (!Array.isArray(cell)) return depth === FLOORDEPTH ? 0 : 1;
        return this._chooseLayerIndexForExistingCell(cell, depth, preferTypeName);
    }

    static _reorientComplexCellAt(x, y) {
        const cell = this.grid?.[y]?.[x];
        if (cell == null) return;

        if (Array.isArray(cell)) {
            const baseName = TILE_MAP(cell[0]);
            const topName = TILE_MAP(cell[1]);
            if (baseName && TILE_TYPES[baseName]?.complex) this.determineTileType(x, y, baseName, 0, 0);
            if (topName && TILE_TYPES[topName]?.complex) this.determineTileType(x, y, topName, 1, 0);
            return;
        }

        const name = TILE_MAP(cell);
        if (name && TILE_TYPES[name]?.complex) this.determineTileType(x, y, name, -1, 0);
    }

    static _refreshTerrainShapesAround(x, y) {
        for (let gy = y - 1; gy <= y + 1; gy++) {
            for (let gx = x - 1; gx <= x + 1; gx++) {
                if (!this.grid?.[gy] || this.grid[gy][gx] == null) continue;
                this._reorientComplexCellAt(gx, gy);
            }
        }
        this._refreshRenderCacheAround(x, y);
    }

    static refreshTerrainShapesInRect(x0, y0, w, h, pad = 1) {
        const minY = Math.max(0, y0 - pad);
        const maxY = Math.min(this.grid.length - 1, y0 + h - 1 + pad);
        const minX = Math.max(0, x0 - pad);
        const maxX = Math.min(this.grid[0].length - 1, x0 + w - 1 + pad);

        for (let gy = minY; gy <= maxY; gy++) {
            for (let gx = minX; gx <= maxX; gx++) {
                if (!this.grid?.[gy] || this.grid[gy][gx] == null) continue;
                this._reorientComplexCellAt(gx, gy);
            }
        }

        for (let gy = minY; gy <= maxY; gy++) {
            for (let gx = minX; gx <= maxX; gx++) {
                if (!this.grid?.[gy] || this.grid[gy][gx] == null) continue;
                this._refreshRenderCacheAt(gx, gy);
            }
        }
    }

    static placeTile(x, y, tileType, index = -1) {
        // 1) Write current cell (let determineTileType auto-pair if needed)
        this.determineTileType(x, y, tileType, index);

        // 2) Depth comes from the type we just placed (don’t infer from cell)
        const depth = TILE_TYPES[tileType].depth;

        // 3) For each neighbor that contains this tileType in ANY layer, re-orient it.
        const upd = (gx, gy) => {
            if (!this.grid[gy]) return;
            if (!this._hasTypeAt(gx, gy, tileType)) return;
            if (tileType === "road" && this._cellHasPlacedCrop(gx, gy)) return;
                // choose the correct layer in the neighbor to rewrite
                const nIdx = this._layerIndexFor(gx, gy, depth, tileType);
                if (Array.isArray(this.grid[gy][gx])) {
                // compute the oriented numeric code AND write it into the chosen layer
                const oriented = this.determineTileType(gx, gy, tileType, nIdx);
                // ensure the numeric gets stored in the chosen layer, preserving the other
                if(oriented) this.checkAndPlace(gx, gy, oriented, depth, tileType);
            } else {
            // scalar cell → just rewrite it
            this.grid[gy][gx] = this.determineTileType(gx, gy, tileType);
            }
        };

        upd(x, y - 1); // up
        upd(x, y + 1); // down
        upd(x - 1, y); // left
        upd(x + 1, y); // right
        this._refreshRenderCacheAround(x, y);
    }


    static removeTile(posX, posY, lenX, lenY) {
        // Reset the tile
        for(let y = posY; y < posY+lenY+1; y++){
            for(let x = posX; x < posX+lenX+1; x++){
                this.grid[y][x] = 1;
                this.drawGridValue(x,y)
            }
        }
    }

    static navgridDraw(x, y) {
        if(Map.navGrid[y]){
            const value = Map.navGrid[y][x];
    
            const color = value !== 0 ? 0xffffff : 0x000000;
            const alpha = value !== 0 ? 0.3 : 0.6;
        
            const tile = this.scene.add.rectangle(
                x * SQUARESIZE,
                y * SQUARESIZE,
                SQUARESIZE,
                SQUARESIZE,
                color,
                alpha
            ).setOrigin(0)
             .setDepth(100);
        }
    }

    static drawBuildings(){
        let seededStarterTownTower = false;
        for(let i = 0; i < buildingArray.length; i++){
            const [gridX, gridY, tileType, teamNumber] = buildingArray[i];
            if(tileType.name === TILE_TYPES.house1.name || tileType.name == TILE_TYPES.house2.name) new House(gridX, gridY, tileType, teamNumber);
            else if(tileType.name === TILE_TYPES.storage.name) new StorageBuilding(gridX, gridY, teamNumber);
            else if(tileType.name === TILE_TYPES.clayOven.name) new ClayOven(gridX, gridY, teamNumber);
            else if(tileType.name === TILE_TYPES.pine.name) {
                const level = 1; // or derive from map/seed
                const pine = new PineTree(gridX, gridY, level);
                this.worldPines.push(pine);
            }
            else if(tileType.name === TILE_TYPES.rock.name) {
                const level = 1;
                const rock = new RockNode(gridX, gridY, level);
                this.worldStones.push(rock);
            }
            else if (tileType.name === TILE_TYPES.turret.name){
                new Turret(gridX, gridY, teamNumber ?? 1);
            }
            else if (tileType.name === TILE_TYPES.catapult.name){
                new Catapult(gridX, gridY, teamNumber ?? 1);
            }
            else if (tileType.name === TILE_TYPES.tower.name){
                const isTownTower = Number(teamNumber ?? 0) === 1;
                new TowerBuilding(gridX, gridY, teamNumber ?? 1, {
                    isTownTower,
                    isStarterTownTower: isTownTower && !seededStarterTownTower,
                    isFortObjective: !isTownTower,
                });
                if (isTownTower && !seededStarterTownTower) seededStarterTownTower = true;
            }
            else this.handleLoadNonSpread(gridX, gridY, tileType, i, teamNumber);
            if(tileType == TILE_TYPES.spawn) buildingArray.splice(i, 1);
        }
        const scene = this.scene;
        const startCfg = scene?.startCfg ?? scene?.draftStartCfg;
        const starterResources = startCfg?.resources ?? startCfg?.supplies;

        if (starterResources && !scene?._skipStarterResourceSeed) {
            this.seedStarterResources(scene, starterResources);
        }
        // map.js — after the draw loop inside drawBuildings(), add:
        const townLightSources = [];
        for (let i = 0; i < buildingArray.length; i++) {
            const [gx, gy, tileType, teamNumber] = buildingArray[i];
            const name = tileType?.name;

            // skip resource occluders — we light everything else
            if (name === 'pine' || name === 'rock') continue;

            const lenX = tileType.lenX || 1;
            const lenY = tileType.lenY || 1;

            // center of the building in GRID coords
            const cx = gx + lenX/2;
            const cy = gy + lenY/2;

            // heuristic radius: scale a bit with footprint, but keep bounded
            const r = Math.max(3, Math.min(7, Math.round((lenX + lenY) / 2 + 3)));
            const brightness = 1.75;

            townLightSources.push({ x: cx, y: cy, r, brightness });
        }

        // merge with existing lights (torches/players/etc.)
        const merged = (VisibilitySystem.lightSources || []).concat(townLightSources);

        // this rebuilds the chunk index:
        VisibilitySystem.setLightSources(merged);

        for (let i = 0; i < buildingArray.length; i++) {
            const [gx, gy, tileType] = buildingArray[i];
            const name = tileType?.name;
            if (name === 'pine' || name === 'rock') continue; // skip occluders

            const lenX = tileType.lenX || 1;
            const lenY = tileType.lenY || 1;
            const cx = gx + lenX / 2;
            const cy = gy + lenY / 2;

            // Use a similar radius as the building light
            const r = Math.max(3, Math.min(9, Math.round((lenX + lenY) / 2 + 5)));

            // slight visibility boost over ambient (0.1)
            if (buildingArray[i][3] === 1) {
                VisibilitySystem.addVisionBubble({ x: cx, y: cy, r, boost: 0.1 }, /*noRepaint=*/true);
            }else{
                continue;
            }
        }
        // finally rebuild once
        VisibilitySystem._rebuildViewFull();
    }

    static seedStarterResources(scene, starterResources) {
        const team1 = Teams.teamLists["1"];
        const storages = Array.isArray(team1?.storageList) ? team1.storageList : [];
        if (!storages.length) return;

        storages.forEach((storage) => storage?.clearStoredInventory?.(false));

        const addStarterItems = (itemType, amount) => {
            const n = Math.max(0, Math.floor(Number(amount) || 0));
            if (n > 0) StorageManager.grantItemToTeam("1", itemType, n, scene, { silent: true });
        };

        addStarterItems("seedCrop", starterResources.seeds);
        addStarterItems("seedBerry", starterResources.berries);
        addStarterItems("food", starterResources.food);
        addStarterItems("wood", starterResources.wood);
        addStarterItems("stone", starterResources.stone);
        addStarterItems("clean_water", starterResources.water ?? starterResources.clean_water);
        StorageManager.syncStorageBackedResourceCounters(scene, "1");
    }

    static deleteAllGridElements(){
        this.graphics.clear();
        this.blocks.forEach(Map._destroyNode);
        this.blocks = [];
        this.waterBlocks.forEach(child => child.destroy());
        this._clearOuterWaterBackdrop();
        this.barrier.clear(true);
        this._detailedWorldDrawn = false;
        this._detailedWorldDirty = false;
    }

    static _destroyNode(node){
        if(!node) return;
        if (Array.isArray(node)) { node.forEach(Map._destroyNode); return; }
        if (node.destroy) node.destroy();
    }

    static _storeAt(x,y,layerIndex,sprites){ // 0=floor, 1=block
        const idx = y*WORLD_DIMENSIONX + x;
        if (!Array.isArray(this.blocks[idx])) {
            // nuke old single sprite if present and ensure [floor,block] shape
            if (this.blocks[idx]?.destroy) this.blocks[idx].destroy();
            this.blocks[idx] = [null, null];
        }
        // clear old content at that layer (can be sprite or array)
        this._destroyNode(this.blocks[idx][layerIndex]);
        this.blocks[idx][layerIndex] = sprites;
    }

    static reDraw(width = null, height = null) {
        width = Math.max(1, Math.floor(Number(width ?? this.grid?.[0]?.length ?? WORLD_DIMENSIONX)));
        height = Math.max(1, Math.floor(Number(height ?? this.grid?.length ?? WORLD_DIMENSIONY)));
        this.graphics.clear();
        this.blocks.forEach(Map._destroyNode);
        this.blocks = [];
        this.waterBlocks.forEach(child => child.destroy());
        this.barrier.clear(true);

        // remove any prior world-layer children created last redraw
        if (this.worldLayer) this.worldLayer.removeAll(true);
        this._drawOuterWaterBackdrop(width, height);

        // Full-world redraw (no camera chunk windowing).
        const topLeftX = 0;
        const topLeftY = 0;
        const bottomRightX = width;
        const bottomRightY = height;

        PineTree.rebuildVisibleForGridRange(topLeftX, topLeftY, bottomRightX, bottomRightY);
        VisibilitySystem.setViewRect(topLeftX, topLeftY, bottomRightX-topLeftX, bottomRightY-topLeftY);
        VisibilitySystem._rebuildViewFull();

        this.cameraBounds = new Phaser.Geom.Rectangle(
            0,
            0,
            width * SQUARESIZE,
            height * SQUARESIZE
        );

        // Draw the full world grid.
        for (let y = topLeftY; y < bottomRightY; y++) {
            for (let x = topLeftX; x < bottomRightX; x++) {
                this._drawGridCell(x, y, { allowWallNavSync: true });
            }
        }

        // After we've rebuilt visible world objects:
        AudioManager.updateFromRedraw({
        topLeftX,
        topLeftY,
        bottomRightX,
        bottomRightY,
        grid: this.grid,
        width,
        height,
        buildingArray
        });
        
        // After we've rebuilt visible world objects:
        this._uiIgnoreWorldLayer();
        this._detailedWorldDrawn = true;
        this._detailedWorldDirty = false;
    }   

    static _clearOuterWaterBackdrop() {
        this.outerWaterAmbienceOverlay?.destroy?.();
        this.outerWaterAmbienceOverlay = null;
        this.outerWaterTileSprite?.destroy?.();
        this.outerWaterTileSprite = null;
        this.outerWaterLayer?.removeAll?.(true);
    }

    static setOuterWaterAmbience(ambientBrightness = 1, tintColor = 0x020716) {
        const overlay = this.outerWaterAmbienceOverlay;
        if (!overlay) return;

        const brightness = Phaser.Math.Clamp(Number(ambientBrightness), 0, 1);
        const alpha = 1 - brightness;
        const color = Number.isFinite(Number(tintColor)) ? Number(tintColor) : 0x020716;

        overlay
            .setFillStyle(color, 1)
            .setAlpha(alpha)
            .setVisible(alpha > 0.001);
    }

    static getOuterWaterTileRect(width = null, height = null) {
        const mapWidth = Math.max(1, Math.floor(Number(width ?? this.grid?.[0]?.length ?? WORLD_DIMENSIONX)));
        const mapHeight = Math.max(1, Math.floor(Number(height ?? this.grid?.length ?? WORLD_DIMENSIONY)));
        const tileWidth = Math.max(mapWidth, OUTER_WATER_TILE_DIMENSION);
        const tileHeight = Math.max(mapHeight, OUTER_WATER_TILE_DIMENSION);
        const gx0 = Math.floor((mapWidth - tileWidth) / 2);
        const gy0 = Math.floor((mapHeight - tileHeight) / 2);
        const gx1 = Math.ceil((mapWidth + tileWidth) / 2);
        const gy1 = Math.ceil((mapHeight + tileHeight) / 2);

        return {
            gx0,
            gy0,
            tilesW: Math.max(1, gx1 - gx0),
            tilesH: Math.max(1, gy1 - gy0),
        };
    }

    static _drawOuterWaterBackdrop(width = null, height = null) {
        width = Math.max(1, Math.floor(Number(width ?? this.grid?.[0]?.length ?? WORLD_DIMENSIONX)));
        height = Math.max(1, Math.floor(Number(height ?? this.grid?.length ?? WORLD_DIMENSIONY)));
        if (!this.scene?.textures?.exists?.("water")) return;
        if (!this.outerWaterLayer) {
            this.outerWaterLayer = this.scene.add.layer();
            this.outerWaterLayer.setName?.("outerWaterLayer");
            this.outerWaterLayer.setDepth(FLOORDEPTH - 2);
        }

        const tileWidth = Math.max(width, OUTER_WATER_TILE_DIMENSION);
        const tileHeight = Math.max(height, OUTER_WATER_TILE_DIMENSION);
        const worldWidth = width * SQUARESIZE;
        const worldHeight = height * SQUARESIZE;
        const totalWidth = tileWidth * SQUARESIZE;
        const totalHeight = tileHeight * SQUARESIZE;
        const x = (worldWidth - totalWidth) / 2;
        const y = (worldHeight - totalHeight) / 2;

        this._clearOuterWaterBackdrop();
        this.outerWaterTileSprite = this.scene.add.tileSprite(
            x + totalWidth / 2,
            y + totalHeight / 2,
            totalWidth,
            totalHeight,
            "water",
            1
        )
            .setDepth(FLOORDEPTH - 2)
            .setAlpha(1);
        this.outerWaterTileSprite.setFrame?.(1);
        this.outerWaterLayer.add(this.outerWaterTileSprite);

        this.outerWaterAmbienceOverlay = this.scene.add.rectangle(
            x + totalWidth / 2,
            y + totalHeight / 2,
            totalWidth,
            totalHeight,
            VisibilitySystem.ambientTintColor ?? 0x020716,
            1
        )
            .setDepth(FLOORDEPTH - 1.9)
            .setOrigin(0.5)
            .setAlpha(0)
            .setVisible(false);
        this.outerWaterLayer.add(this.outerWaterAmbienceOverlay);
        this.setOuterWaterAmbience(VisibilitySystem.ambient, VisibilitySystem.ambientTintColor);
    }

    static redrawRect(x, y, w, h, pad = 1) {
        const rect = this._normalizeGridRect(x, y, w, h, pad);
        if (!rect) return;

        this.refreshTerrainShapesInRect(x, y, w, h, pad);

        if (this.scene?.zoomMixer?.mode === "overview") {
            this._detailedWorldDirty = true;
            this._refreshOverviewTextureForRect(rect.minX, rect.minY, rect.width, rect.height);
            this.setDetailedWorldVisible?.(false);
            this.setDetailedWorldPaused?.(true);
            this._uiIgnoreWorldLayer();
            return;
        }

        for (let gy = rect.minY; gy <= rect.maxY; gy++) {
            for (let gx = rect.minX; gx <= rect.maxX; gx++) {
                this._clearStoredCellSprites(gx, gy);
            }
        }

        for (let gy = rect.minY; gy <= rect.maxY; gy++) {
            for (let gx = rect.minX; gx <= rect.maxX; gx++) {
                this._drawGridCell(gx, gy, { allowWallNavSync: false });
            }
        }

        this._uiIgnoreWorldLayer();
    }

    static handleCrops(x,y){
        const key = `${x},${y}`;
        if(!this.cropDict[key]){
            this.drawGridValue(x, y);
        }
    }

    static _destroyCropWaterIndicator(crop) {
        crop?.waterNeedTween?.remove?.();
        if (crop) crop.waterNeedTween = null;
        if (crop?.waterNeedIcon) {
            this.removeFromWorldStatic?.(crop.waterNeedIcon);
            crop.waterNeedIcon = null;
        }
    }

    static _fallbackFloorForClearedCrop(x, y) {
        const floorFromVal = (val) => {
            const name = TILE_MAP(val);
            if (!name || name === "crops") return null;
            const def = TILE_TYPES[name];
            if (!def || def.depth !== FLOORDEPTH) return null;
            return def.interior ?? def.grid ?? null;
        };

        const cell = this.grid?.[y]?.[x];
        if (Array.isArray(cell)) {
            for (const val of cell) {
                const floor = floorFromVal(val);
                if (floor != null) return floor;
            }
        } else {
            const floor = floorFromVal(cell);
            if (floor != null) return floor;
        }

        const samples = [
            [0, -1], [1, 0], [0, 1], [-1, 0],
            [-1, -1], [1, -1], [1, 1], [-1, 1],
        ];
        for (const [dx, dy] of samples) {
            const nearby = this.grid?.[y + dy]?.[x + dx];
            const values = Array.isArray(nearby) ? nearby : [nearby];
            for (const val of values) {
                const floor = floorFromVal(val);
                if (floor != null) return floor;
            }
        }

        return TILE_TYPES.dirt?.interior ?? TILE_TYPES.dirt?.grid ?? TILE_TYPES.grass?.grid ?? 1;
    }

    static clearCropAt(x, y, teamNumber = 1, opts = {}) {
        x = Number(x);
        y = Number(y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

        const key = `${x},${y}`;
        let cleared = false;
        const cropSprite = this.cropDict?.[key] ?? null;
        if (cropSprite) {
            this.removeFromWorldStatic?.(cropSprite);
            delete this.cropDict[key];
            cleared = true;
        }

        const teams = teamNumber == null
            ? Object.values(Teams.teamLists || {})
            : [Teams.teamLists?.[`${teamNumber}`] ?? Teams.teamLists?.[teamNumber]];

        const pruneTaskList = (list) => {
            if (!Array.isArray(list)) return;
            for (let i = list.length - 1; i >= 0; i -= 1) {
                const task = list[i];
                if (Number(task?.x) !== x || Number(task?.y) !== y) continue;
                list.splice(i, 1);
                cleared = true;
            }
        };

        for (const team of teams) {
            if (!team) continue;
            if (Array.isArray(team.crops)) {
                for (let i = team.crops.length - 1; i >= 0; i -= 1) {
                    const crop = team.crops[i];
                    if (Number(crop?.x) !== x || Number(crop?.y) !== y) continue;
                    this._destroyCropWaterIndicator(crop);
                    if (crop?.sprite && crop.sprite !== cropSprite) {
                        this.removeFromWorldStatic?.(crop.sprite);
                    }
                    team.crops.splice(i, 1);
                    cleared = true;
                }
            }

            pruneTaskList(team.wateringList);
            pruneTaskList(team.cropList);
            pruneTaskList(team.TeamFarmSpots);
            pruneTaskList(team.tileList);
        }

        const cropWorkStates = new Set([
            CONTROL_STATES.FARM_MODE,
            CONTROL_STATES.R_FARM_MODE,
            CONTROL_STATES.WATER_CROPS_MODE,
        ]);
        for (const troop of Player.troops || []) {
            const task = troop?.task;
            if (!task || Number(task.x) !== x || Number(task.y) !== y) continue;
            const state = troop.taskMeta?.state ?? troop.state;
            if (!cropWorkStates.has(state)) continue;
            if (typeof task.assigned === "number" && task.assigned > 0) task.assigned -= 1;
            troop.timer?.remove?.(false);
            troop.timer = null;
            troop.task = null;
            troop.taskMeta = null;
            troop.destX = null;
            troop.destY = null;
            troop.currentPath?.splice?.(0);
            troop.body?.setVelocity?.(0, 0);
            troop.play?.(troop.idle);
            Teams.movePlayerState(troop, CONTROL_STATES.TRACK_MODE);
        }

        const cell = this.grid?.[y]?.[x];
        const isCropVal = (val) => TILE_MAP(val) === "crops";
        if (Array.isArray(cell) && cell.some(isCropVal)) {
            const remaining = cell.filter((val) => !isCropVal(val));
            if (remaining.length >= 2) this.grid[y][x] = remaining.slice(0, 2);
            else if (remaining.length === 1) this.grid[y][x] = remaining[0];
            else this.grid[y][x] = this._fallbackFloorForClearedCrop(x, y);
            this._refreshRenderCacheAround(x, y);
            cleared = true;
        } else if (isCropVal(cell)) {
            this.grid[y][x] = this._fallbackFloorForClearedCrop(x, y);
            this._refreshRenderCacheAround(x, y);
            cleared = true;
        }

        if (!cleared) return false;

        if (opts.redraw !== false) {
            if (this.redrawRect) this.redrawRect(x, y, 1, 1, 1);
            else this.drawGridValue(x, y);
        }
        this.scene?.zoomMixer?.updateOverviewCell?.(x, y, this.grid);
        this.regionSystem?.markDirty?.();
        this.regionDrawer?.markDirty?.();
        this.enemyRegionSystem?.markDirty?.();
        this.enemyRegionDrawer?.markDirty?.();
        return true;
    }

    static _drawGridCell(x, y, opts = {}) {
        const cell = this.grid?.[y]?.[x];
        if (cell == null) return;

        if (cell == TILE_TYPES.crops.grid) {
            this.handleCrops(x, y);
            return;
        }

        if (Array.isArray(cell)) {
            const type = TILE_TYPES[TILE_MAP(cell[1])];
            this.drawGridValue(x, y, 0);
            if (Wall.isWallOrDoorCell(cell)) {
                if (opts.allowWallNavSync === false) {
                    this._redrawWallCell(x, y, cell);
                } else {
                    buildingManager.makeWallNoBuild(x, y, cell[1]);
                }
            } else if (type && type.spread) {
                this.drawGridValue(x, y, 1);
            }
            return;
        }

        this.drawGridValue(x, y);
    }

    static _redrawWallCell(x, y, cell = null) {
        const sourceCell = cell ?? this.grid?.[y]?.[x];
        const overlayVal = Array.isArray(sourceCell) ? sourceCell[1] : sourceCell;
        if (overlayVal == null) return;

        const ownerWall = Wall.getAt?.(x, y);
        const inferredOwnerTeam =
            (this.navGrid?.[y]?.[x] === 0 && this.enemyNavGrid?.[y]?.[x] === 1) ? 0 :
            (this.navGrid?.[y]?.[x] === 1 && this.enemyNavGrid?.[y]?.[x] === 0) ? 1 :
            1;
        const ownerTeam = ownerWall?.team ?? inferredOwnerTeam;

        this.drawGridValue(x, y, 1);
        Wall.ensureAt(this.scene, x, y, ownerTeam);
        this.refreshWallShapesAround?.(x, y);
    }

    static _shapeAndAngle(def, val) {
        // Map the stored number to (shape, angle) for NESW
        if (val === def.interior) return { shape: 'interior', angle: 0 };
        if (def.island != null && val === def.island) return { shape: 'island', angle: 0 };

        // sides
        if (val === def.sides?.up)    return { shape: 'edge',   angle: 0   };
        if (val === def.sides?.right) return { shape: 'edge',   angle: 90  };
        if (val === def.sides?.down)  return { shape: 'edge',   angle: 180 };
        if (val === def.sides?.left)  return { shape: 'edge',   angle: 270 };

        // corners (we treat sprites as "top-left" rotated; adjust to your atlas)
        if (val === def.corners?.topLeft)     return { shape: 'corner', angle: 0   };
        if (val === def.corners?.topRight)    return { shape: 'corner', angle: 90  };
        if (val === def.corners?.bottomRight) return { shape: 'corner', angle: 180 };
        if (val === def.corners?.bottomLeft)  return { shape: 'corner', angle: 270 };

        if (val === def.innerCorners?.topLeft)     return { shape: 'innerCorner', angle: 0   };
        if (val === def.innerCorners?.topRight)    return { shape: 'innerCorner', angle: 90  };
        if (val === def.innerCorners?.bottomRight) return { shape: 'innerCorner', angle: 180 };
        if (val === def.innerCorners?.bottomLeft)  return { shape: 'innerCorner', angle: 270 };

        if (val === def.diagJoins?.nwSe) return { shape: 'diagJoin', angle: 0 };
        if (val === def.diagJoins?.neSw) return { shape: 'diagJoin', angle: 90 };

        return { shape: 'interior', angle: 0 };
    }

    static _spawnSpec(cx, cy, depth, spec, angle = 0, flipX = false, flipY = false) {
        const node = spec.sheet
            ? this.scene.add.sprite(cx, cy, spec.key).setDepth(depth)
            : this.scene.add.image (cx, cy, spec.key).setDepth(depth);
        if (spec.sheet) {
            node._pauseInOverview = spec.key === "water" || spec.anim === "water";
            node.play(spec.anim || spec.key);
        }
        this._worldAdd(node); 
        if (angle) node.setAngle(angle);
        if (flipX || flipY) node.setFlip(flipX, flipY);
        return node;
    }

    static _ensureRenderCache() {
        const h = this.grid?.length || 0;
        const w = h ? (this.grid[0]?.length || 0) : 0;
        if (this.renderCache.length === h && (!h || this.renderCache[0]?.length === w)) return;
        this.renderCache = Array.from({ length: h }, () => Array.from({ length: w }, () => [null, null]));
    }

    static _makeRenderEntry(spec, angle = 0, flipX = false, flipY = false) {
        return spec ? { spec, angle, flipX, flipY } : null;
    }

    static _buildTerrainRenderEntries(x, y, val) {
        const name = TILE_MAP(val);
        if (!name) return null;
        const def = TILE_TYPES[name];
        if (!def) return null;

        if (!(name === 'grass' || name === 'dark_grass' || name === 'dirt' || name === 'road' || name === 'fort_floor' || name === 'water')) return null;

        const { shape, angle } = this._shapeAndAngle(def, val);
        const a = def.assets;
        if (name === 'water' || shape === 'island') {
            return [this._makeRenderEntry(a.interior, 0)];
        }
        if (shape === 'interior') {
            return this._appendGrassWaterInnerOverlay([this._makeRenderEntry(a.interior, 0)], x, y, name);
        }
        if (shape === 'innerCorner') {
            const innerKind = this._innerCornerTransitionKind(x, y, angle);
            if (innerKind === 'water' && a.innerCorner?.water) {
                return [this._makeRenderEntry(a.innerCorner.water, this._innerCornerWaterAngle(angle))];
            }
            const innerSpec = a.innerCorner?.grass || a.innerCorner || a.interior;
            return [this._makeRenderEntry(innerSpec, angle)];
        }
        if (shape === 'diagJoin') return [this._makeRenderEntry(a.diagJoin || a.interior, angle)];

        if (name === 'grass') {
            const spec = shape === 'edge' ? (a.edge || a.interior) : (a.corner || a.interior);
            return this._appendGrassWaterInnerOverlay([this._makeRenderEntry(spec, angle)], x, y, name);
        }

        const contact = this._terrainTransitionKind(x, y, shape, angle);
        if (contact === 'water' && a.edge?.shoreGrass) {
            const waterSideAngle = this._singleWaterSideAngle(x, y);
            const shoreTransform = waterSideAngle != null ? this._shoreGrassEdgeTransform(x, y, waterSideAngle) : null;
            if (shoreTransform) {
                return this._appendGrassWaterInnerOverlay([
                    this._makeRenderEntry(
                        a.edge.shoreGrass,
                        shoreTransform.angle,
                        shoreTransform.flipX,
                        shoreTransform.flipY
                    )
                ], x, y, name);
            }
        }
        if (name === 'dark_grass' && contact === 'grass') {
            const spec = a.edge?.grass || a.interior;
            return this._appendGrassWaterInnerOverlay([this._makeRenderEntry(spec, angle)], x, y, name);
        }
        const spec = shape === 'edge'
            ? (a.edge?.[contact] || a.edge?.grass || a.interior)
            : (a.corner?.[contact] || a.corner?.grass || a.interior);
        return this._appendGrassWaterInnerOverlay([this._makeRenderEntry(spec, angle)], x, y, name);
    }

    static _refreshRenderCacheAt(x, y) {
        if (!this.grid?.[y] || this.grid[y][x] == null) return;
        this._ensureRenderCache();
        const cell = this.grid[y][x];
        const slot = [null, null];
        if (Array.isArray(cell)) {
            slot[0] = this._buildTerrainRenderEntries(x, y, cell[0]);
            slot[1] = this._buildTerrainRenderEntries(x, y, cell[1]);
        } else {
            const def = TILE_TYPES[TILE_MAP(cell)];
            const idx = def?.depth === BLOCKDEPTH ? 1 : 0;
            slot[idx] = this._buildTerrainRenderEntries(x, y, cell);
        }
        this.renderCache[y][x] = slot;
    }

    static _refreshRenderCacheAround(x, y) {
        for (let gy = y - 1; gy <= y + 1; gy++) {
            for (let gx = x - 1; gx <= x + 1; gx++) {
                if (!this.grid?.[gy] || this.grid[gy][gx] == null) continue;
                this._refreshRenderCacheAt(gx, gy);
            }
        }
    }

    static _rebuildRenderCache() {
        this._ensureRenderCache();
        for (let y = 0; y < this.grid.length; y++) {
            for (let x = 0; x < this.grid[0].length; x++) {
                this._refreshRenderCacheAt(x, y);
            }
        }
    }

    static _terrainNameAt(x, y) {
        const cell = this.grid[y]?.[x];
        if (cell == null) return null;
        if (!Array.isArray(cell)) return TILE_MAP(cell);
        const top = TILE_MAP(cell[1]);
        const base = TILE_MAP(cell[0]);
        const topDef = TILE_TYPES[top];
        if (topDef?.depth === FLOORDEPTH) return top;
        return base;
    }

    static _contactTypeAt(x, y) {
        const name = this._terrainNameAt(x, y);
        if (name === 'water') return 'water';
        return 'grass';
    }

    static _edgeDelta(angle) {
        if (angle === 0) return [0, -1];
        if (angle === 90) return [1, 0];
        if (angle === 180) return [0, 1];
        return [-1, 0];
    }

    static _cornerDeltas(angle) {
        if (angle === 0) return [[0, -1], [-1, 0], [-1, -1]];
        if (angle === 90) return [[0, -1], [1, 0], [1, -1]];
        if (angle === 180) return [[0, 1], [1, 0], [1, 1]];
        return [[0, 1], [-1, 0], [-1, 1]];
    }

    static _terrainTransitionKind(x, y, shape, angle) {
        const sample = shape === 'corner' ? this._cornerDeltas(angle) : [this._edgeDelta(angle)];
        let sawGrass = false;
        for (const [dx, dy] of sample) {
            const contact = this._contactTypeAt(x + dx, y + dy);
            if (contact === 'water') return 'water';
            if (contact === 'grass') sawGrass = true;
        }
        return sawGrass ? 'grass' : 'grass';
    }

    static _innerCornerTransitionKind(x, y, angle) {
        let dx = -1, dy = -1;
        if (angle === 90) { dx = 1; dy = -1; }
        else if (angle === 180) { dx = 1; dy = 1; }
        else if (angle === 270) { dx = -1; dy = 1; }
        return this._terrainNameAt(x + dx, y + dy) === 'water' ? 'water' : 'grass';
    }

    static _innerCornerWaterAngle(angle) {
        return (angle + 270) % 360;
    }

    static _supportsGrassWaterInnerOverlay(name) {
        return name === 'grass' || name === 'dark_grass' || name === 'dirt' || name === 'road' || name === 'fort_floor';
    }

    static _isGrassStyleNeighborFor(x, y) {
        const neighborName = this._terrainNameAt(x, y);
        if (!neighborName || neighborName === 'water') return false;
        if (neighborName === 'grass' || neighborName === 'dark_grass') return true;
        if (!(neighborName === 'dirt' || neighborName === 'road' || neighborName === 'fort_floor')) return false;

        const cell = this.grid?.[y]?.[x];
        if (cell == null) return false;

        const val = Array.isArray(cell) ? this._pickFloorValFromCell(cell) : cell;
        const def = TILE_TYPES[neighborName];
        if (!def?.assets) return false;

        const { shape, angle } = this._shapeAndAngle(def, val);

        if (shape === 'diagJoin' || shape === 'innerCorner') return true;
        if (shape !== 'edge' && shape !== 'corner') return false;

        const contact = this._terrainTransitionKind(x, y, shape, angle);
        if (contact === 'grass') return true;

        if (contact === 'water' && def.assets.edge?.shoreGrass) {
            const waterSideAngle = this._singleWaterSideAngle(x, y);
            return !!(waterSideAngle != null && this._shoreGrassEdgeTransform(x, y, waterSideAngle));
        }

        return false;
    }

    static _grassWaterInnerOverlayAngles(x, y, currentName) {
        if (!this._supportsGrassWaterInnerOverlay(currentName)) return [];

        const overlays = [];

        if (
            this._terrainNameAt(x - 1, y - 1) === 'water' &&
            this._isGrassStyleNeighborFor(x, y - 1) &&
            this._isGrassStyleNeighborFor(x - 1, y)
        ) overlays.push(0);

        if (
            this._terrainNameAt(x + 1, y - 1) === 'water' &&
            this._isGrassStyleNeighborFor(x, y - 1) &&
            this._isGrassStyleNeighborFor(x + 1, y)
        ) overlays.push(90);

        if (
            this._terrainNameAt(x + 1, y + 1) === 'water' &&
            this._isGrassStyleNeighborFor(x + 1, y) &&
            this._isGrassStyleNeighborFor(x, y + 1)
        ) overlays.push(180);

        if (
            this._terrainNameAt(x - 1, y + 1) === 'water' &&
            this._isGrassStyleNeighborFor(x, y + 1) &&
            this._isGrassStyleNeighborFor(x - 1, y)
        ) overlays.push(270);

        return overlays;
    }

    static _appendGrassWaterInnerOverlay(entries, x, y, currentName) {
        const overlaySpec = TILE_TYPES[currentName]?.assets?.innerCorner?.water || TILE_TYPES.grass?.assets?.innerCorner?.water;
        if (!overlaySpec) return entries;

        const overlayAngles = this._grassWaterInnerOverlayAngles(x, y, currentName);
        if (!overlayAngles.length) return entries;

        const next = [...entries];
        overlayAngles.forEach(angle => next.push(this._makeRenderEntry(overlaySpec, angle)));
        return next;
    }

    static _shoreGrassEdgeTransform(x, y, waterSideAngle) {
        const at = (dx, dy) => this._terrainNameAt(x + dx, y + dy);
        let grassSideAngle = null;

        if (waterSideAngle === 0) {
            if (at(1, 0) === 'grass') grassSideAngle = 90;
            else if (at(-1, 0) === 'grass') grassSideAngle = 270;
        } else if (waterSideAngle === 90) {
            if (at(0, 1) === 'grass') grassSideAngle = 180;
            else if (at(0, -1) === 'grass') grassSideAngle = 0;
        } else if (waterSideAngle === 180) {
            if (at(-1, 0) === 'grass') grassSideAngle = 270;
            else if (at(1, 0) === 'grass') grassSideAngle = 90;
        } else {
            if (at(0, -1) === 'grass') grassSideAngle = 0;
            else if (at(0, 1) === 'grass') grassSideAngle = 180;
        }

        if (grassSideAngle == null) return null;

        // Source art default:
        // - water on the right
        // - grass on the bottom
        // - studied terrain on the left
        const angle = (waterSideAngle - 90 + 360) % 360;
        const clockwiseJoin = grassSideAngle === (waterSideAngle + 90) % 360;
        const counterClockwiseJoin = grassSideAngle === (waterSideAngle + 270) % 360;

        if (clockwiseJoin) return { angle, flipX: false, flipY: false };
        if (counterClockwiseJoin) return { angle, flipX: false, flipY: true };
        return null;
    }

    static _singleWaterSideAngle(x, y) {
        const at = (dx, dy) => this._terrainNameAt(x + dx, y + dy);
        const hits = [];
        if (at(0, -1) === 'water') hits.push(0);
        if (at(1, 0) === 'water') hits.push(90);
        if (at(0, 1) === 'water') hits.push(180);
        if (at(-1, 0) === 'water') hits.push(270);
        return hits.length === 1 ? hits[0] : null;
    }

    static _spawnGrassOverlays(x, y, depth) {
        const def = TILE_TYPES.grass;
        const overhang = def.assets?.overhang || {};
        const water = def.assets?.water || {};
        const cx = x * SQUARESIZE + SQUARESIZE / 2;
        const cy = y * SQUARESIZE + SQUARESIZE / 2;
        const overlays = [];
        const lowerTypes = new Set(['dirt', 'road', 'fort_floor']);
        const at = (dx, dy) => this._terrainNameAt(x + dx, y + dy);
        const pickEdge = (kind) => kind === 'water' ? water.edge : overhang.edge;
        const pickCorner = (kind) => kind === 'water' ? water.corner : overhang.corner;
        const sides = [
            { angle: 0, dx: 0, dy: -1 },
            { angle: 90, dx: 1, dy: 0 },
            { angle: 180, dx: 0, dy: 1 },
            { angle: 270, dx: -1, dy: 0 }
        ];

        for (const side of sides) {
            const neighbor = at(side.dx, side.dy);
            if (neighbor === 'water') overlays.push(this._addOverlayAt(cx, cy, depth, pickEdge('water'), side.angle));
            else if (lowerTypes.has(neighbor)) overlays.push(this._addOverlayAt(cx, cy, depth, pickEdge('overhang'), side.angle));
        }

        const corners = [
            { angle: 0, a: [0, -1], b: [-1, 0], d: [-1, -1] },
            { angle: 90, a: [0, -1], b: [1, 0], d: [1, -1] },
            { angle: 180, a: [0, 1], b: [1, 0], d: [1, 1] },
            { angle: 270, a: [0, 1], b: [-1, 0], d: [-1, 1] }
        ];

        for (const corner of corners) {
            const neighbors = [at(...corner.a), at(...corner.b), at(...corner.d)];
            const waterTouches = neighbors.filter((name) => name === 'water').length;
            const lowerTouches = neighbors.filter((name) => lowerTypes.has(name)).length;
            if (waterTouches >= 2 || neighbors[2] === 'water') {
                overlays.push(this._addOverlayAt(cx, cy, depth, pickCorner('water'), corner.angle));
            } else if (lowerTouches >= 2 || lowerTypes.has(neighbors[2])) {
                overlays.push(this._addOverlayAt(cx, cy, depth, pickCorner('overhang'), corner.angle));
            }
        }

        return overlays.filter(Boolean);
    }

    static _spawnInnerCornerOverlays(x, y, typeName, depth, spec) {
        if (!spec) return [];
        const cx = x * SQUARESIZE + SQUARESIZE / 2;
        const cy = y * SQUARESIZE + SQUARESIZE / 2;
        const n = this._hasTypeAt(x, y - 1, typeName);
        const s = this._hasTypeAt(x, y + 1, typeName);
        const w = this._hasTypeAt(x - 1, y, typeName);
        const e = this._hasTypeAt(x + 1, y, typeName);
        const nw = this._hasTypeAt(x - 1, y - 1, typeName);
        const ne = this._hasTypeAt(x + 1, y - 1, typeName);
        const sw = this._hasTypeAt(x - 1, y + 1, typeName);
        const se = this._hasTypeAt(x + 1, y + 1, typeName);
        const overlays = [];

        if (n && w && !nw) overlays.push(this._addOverlayAt(cx, cy, depth, spec, 0));
        if (n && e && !ne) overlays.push(this._addOverlayAt(cx, cy, depth, spec, 90));
        if (s && e && !se) overlays.push(this._addOverlayAt(cx, cy, depth, spec, 180));
        if (s && w && !sw) overlays.push(this._addOverlayAt(cx, cy, depth, spec, 270));

        return overlays.filter(Boolean);
    }

    static _spawnDiagJoinOverlay(x, y, typeName, depth, spec) {
        if (!spec) return [];
        const n = this._hasTypeAt(x, y - 1, typeName);
        const s = this._hasTypeAt(x, y + 1, typeName);
        const w = this._hasTypeAt(x - 1, y, typeName);
        const e = this._hasTypeAt(x + 1, y, typeName);
        const nw = this._hasTypeAt(x - 1, y - 1, typeName);
        const ne = this._hasTypeAt(x + 1, y - 1, typeName);
        const sw = this._hasTypeAt(x - 1, y + 1, typeName);
        const se = this._hasTypeAt(x + 1, y + 1, typeName);

        if (!(n && s && w && e)) return [];

        let angle = null;
        // Canonical source orientation:
        // R R x
        // R R R
        // x R R
        if (nw && se && !ne && !sw) angle = 0;
        else if (ne && sw && !nw && !se) angle = 90;
        else return [];

        const cx = x * SQUARESIZE + SQUARESIZE / 2;
        const cy = y * SQUARESIZE + SQUARESIZE / 2;
        return [this._addOverlayAt(cx, cy, depth, spec, angle)].filter(Boolean);
    }


    // Convenience for bulk painting rectangles
    static fillGroundRect(x0, y0, w, h, tileType) {
        for (let y = y0; y < y0 + h; y++) {
            for (let x = x0; x < x0 + w; x++) {
            if (!this.grid[y] || this.grid[y][x] == null) continue;
            this.setGroundTile(x, y, tileType);
            }
        }
    }

    static setGroundRect(x, y, w, h, tileType = "dirt") {
    this.fillGroundRect(x, y, w, h, tileType);
    }

    static setWater(x, y, opts = {}) {
    this.setGroundTile(x, y, "water", opts);
    }

    static setWaterRect(x, y, w, h, opts = {}) {
    this.fillGroundRect(x, y, w, h, "water", opts);
    }
    
    static drawGridValue(x, y, index = -1) {
        const cell = this.grid[y]?.[x];
        if (cell == null) return;

        if (this.scene?.zoomMixer?.mode === "overview") {
            this._detailedWorldDirty = true;
            this._refreshOverviewTextureForRect(x, y, 1, 1);
            this.setDetailedWorldVisible?.(false);
            this.setDetailedWorldPaused?.(true);
            return null;
        }

        const paired = Array.isArray(cell);
        const baseVal = paired ? cell[0] : cell;
        const topVal  = paired ? cell[1] : null;

        const isCrops = (val) => TILE_MAP(val) === 'crops';

        // --- CROPS (legacy seed + team logic)
        const cropsCandidate =
            index === 1 ? topVal :
            index === 0 ? baseVal :
            (paired ? (isCrops(topVal) ? topVal : (isCrops(baseVal) ? baseVal : null))
                    : (isCrops(baseVal) ? baseVal : null));

        if (cropsCandidate && isCrops(cropsCandidate)) {
            const key = `${x},${y}`;
            if (!this.cropDict[key]) {
                const def = TILE_TYPES.crops;
                const cx  = x * SQUARESIZE + SQUARESIZE / 2;
                const cy  = y * SQUARESIZE + SQUARESIZE / 2;
                const block = this.scene.add.sprite(cx, cy, 'crops').setDepth(def.depth);
                this.addToWorldStatic(block); 
                block.setFrame(1);
                this._bindCropHover(block, x, y, "1");
                WallPlacementController.bindStructureLightAndVision(block, x, y, {
                    lenX: def.lenX ?? 1,
                    lenY: def.lenY ?? 1,
                    r: 6,
                    boost: 0.12,
                    intensity: 1.1
                });
                block.hasSeed = true;
                this.handleGridDelete(block, def, x, y);
            }
            return;
        }
        // --- /CROPS

        // NEW: walls + doors are STATIC STRUCTURES, not part of redraw blocks
        if (index != 0 && Wall.isWallOrDoorCell(cell)) {
            // ensure the static sprite exists (stored in Map.worldStaticLayer)
            Wall.ensureAt(this.scene, x, y);
            return null; // IMPORTANT: do not store/draw as normal grid element
        }

        const drawOne = (val, layerIndex = 0) => {
            if (val == null) return null;
            const name = TILE_MAP(val);
            if (!name) return null;
            if (layerIndex === 1 && this._shouldSkipManagedTopRender(name)) return null;
            const def  = TILE_TYPES[name];
            if (!def) return null;
            const cx = x * SQUARESIZE + SQUARESIZE / 2;
            const cy = y * SQUARESIZE + SQUARESIZE / 2;
            let node;
            const cachedEntries = this.renderCache?.[y]?.[x]?.[layerIndex];

            if (cachedEntries?.length) {
                const nodes = cachedEntries.map(({ spec, angle = 0, flipX = false, flipY = false }) => this._spawnSpec(cx, cy, def.depth, spec, angle, flipX, flipY));
                node = nodes.length === 1 ? nodes[0] : nodes;
            } else if (def.assets) {
                const assetEntries = this._buildTerrainRenderEntries(x, y, val);
                if (assetEntries?.length) {
                    const nodes = assetEntries.map(({ spec, angle = 0, flipX = false, flipY = false }) => this._spawnSpec(cx, cy, def.depth, spec, angle, flipX, flipY));
                    node = nodes.length === 1 ? nodes[0] : nodes;
                } else if(def.name == "wall" || def.name == "woodWall") {
                    const { shape, angle } = Map._shapeAndAngle(def, val);
                    const a = def.assets;
                    const spec = shape === 'edge'
                        ? (a.edge || a.interior)
                        : shape === 'corner'
                            ? (a.corner || a.interior)
                            : a.interior;
                    node = this._spawnSpec(cx, cy, def.depth, spec, angle);
                    WallPlacementController.bindStructureLightAndVision(node, x, y, {
                        lenX: def.lenX ?? 1,
                        lenY: def.lenY ?? 1,
                        r: 6,
                        boost: 0.12,
                        intensity: 1.1
                    });
                }
            } else {
                const tileKey = TILE_ARR[val];

                const isDoor =
                    tileKey === "wall_door" || tileKey === "woodWall_door" ||
                    name === "wallDoor" || name === "woodWallDoor";

                if (def.spriteSheet) {
                    node = this.scene.add.sprite(cx, cy, tileKey).setDepth(def.depth);

                    // map.js (inside drawGridValue -> after creating `node` as a sprite)

                    if (isDoor) {
                        node.setFrame(0); // closed

                        // Rotate 90° if vertical wall (above/below neighbors), else 0°
                        // IMPORTANT: pass the DOOR type name (wall_door / woodWall_door)
                        const doorTypeName = (tileKey === "woodWall_door") ? "woodWall_door" : "wall_door";
                        node.setAngle(WallPlacementController.doorAngleForCell(this.grid, x, y, doorTypeName));

                        // ✅ put this door into the door physics group so overlap works
                        WallPlacementController.bindDoorSprite(this.scene, node);
                        WallPlacementController.bindStructureLightAndVision(node, x, y, {
                            lenX: def.lenX ?? 1,
                            lenY: def.lenY ?? 1,
                            r: 6,
                            boost: 0.12,
                            intensity: 1.1
                        });
                    }
                    else {
                        node.play(tileKey);
                    }
                } else {
                    node = this.scene.add.image(cx, cy, tileKey).setDepth(def.depth);
                }

                this._worldAdd(node); 
            }

            // Basic rotation logic preserved
            if (def.block) {
                const barrierNode = Array.isArray(node) ? node[0] : node;
                barrierNode.setDisplaySize(SQUARESIZE, SQUARESIZE);
                this.barrier.add(barrierNode);
            }

            // ✅ handle interactable seed-type logic here
            if (def.interactable) {
                // link to seedManager
                seedManager.makeClickable(x, y, node);
            }

            return node;
        };

        // --- draw layers
        if (index === 0) {
            const n = drawOne(baseVal, 0);
            this._storeAt(x, y, 0, n);
            return;
        }
        if (index === 1 && paired) {
            const n = drawOne(topVal, 1);
            this._storeAt(x, y, 1, n);
            return;
        }

        const floorNode = drawOne(baseVal, 0);
        if (paired) {
            const topNode = drawOne(topVal, 1);
            this._storeAt(x, y, 0, floorNode);
            this._storeAt(x, y, 1, topNode);
        } else {
            this._storeAt(x, y, 0, floorNode);
        }
    }

    static _sameAs(x,y,typeName){
        const cell = this.grid[y]?.[x];
        if (cell == null) return false;
        const top  = Array.isArray(cell) ? TILE_MAP(cell[1]) : null;
        const base = Array.isArray(cell) ? TILE_MAP(cell[0]) : TILE_MAP(cell);
        return (top === typeName) || (base === typeName);
    }

    static _texExists(key){ return this.scene.textures.exists(key); }

    static _overlaySpec(spec) {
        // Accept legacy string ('shore_edge') or object {key, sheet, anim}
        if (!spec) return null;
        return (typeof spec === 'string') ? { key: spec, sheet: false } : spec;
    }

    static _addOverlayAt(cx, cy, depth, spec, angle) {
        if (!spec || !spec.key) return null;
        const node = spec.sheet
            ? this.scene.add.sprite(cx, cy, spec.key).setDepth(depth)
            : this.scene.add.image (cx, cy, spec.key).setDepth(depth);
        this._worldAdd(node); 
        if (spec.sheet) {
            node._pauseInOverview = spec.key === "water" || spec.anim === "water";
            node.play(spec.anim || spec.key);
        }
        node.setAngle(angle);
        return node;
    }

    static _stampOverlays(x, y, type){
        const specEdge   = this._overlaySpec(type.overlay?.edge);
        const specCorner = this._overlaySpec(type.overlay?.corner);
        if (!specEdge && !specCorner) return [];

        const cx = x * SQUARESIZE + SQUARESIZE/2;
        const cy = y * SQUARESIZE + SQUARESIZE/2;

        const n  = this._sameAs(x, y-1, type.name);
        const s  = this._sameAs(x, y+1, type.name);
        const w  = this._sameAs(x-1, y, type.name);
        const e  = this._sameAs(x+1, y, type.name);
        const nw = this._sameAs(x-1, y-1, type.name);
        const ne = this._sameAs(x+1, y-1, type.name);
        const sw = this._sameAs(x-1, y+1, type.name);
        const se = this._sameAs(x+1, y+1, type.name);

        const overlays = [];

        // Edges (rotate one north-facing strip): 0=N, 90=E, 180=S, 270=W
        if (specEdge) {
            if (!n) overlays.push(this._addOverlayAt(cx, cy, type.depth, specEdge,   0));
            if (!e) overlays.push(this._addOverlayAt(cx, cy, type.depth, specEdge,  90));
            if (!s) overlays.push(this._addOverlayAt(cx, cy, type.depth, specEdge, 180));
            if (!w) overlays.push(this._addOverlayAt(cx, cy, type.depth, specEdge, 270));
        }

        // Corners (rotate one top-left quarter)
        if (specCorner) {
            if ( n &&  w && !nw) overlays.push(this._addOverlayAt(cx, cy, type.depth, specCorner,   0)); // TL
            if ( n &&  e && !ne) overlays.push(this._addOverlayAt(cx, cy, type.depth, specCorner,  90)); // TR
            if ( s &&  e && !se) overlays.push(this._addOverlayAt(cx, cy, type.depth, specCorner, 180)); // BR
            if ( s &&  w && !sw) overlays.push(this._addOverlayAt(cx, cy, type.depth, specCorner, 270)); // BL
        }

        return overlays.filter(Boolean);
    }

// --- map.js (DROP-IN REPLACEMENT) -----------------------------------------

// Kill whatever sprites we previously stored for this cell in Map.blocks
static _clearStoredCellSprites(gx, gy) {
  const idx = gy * WORLD_DIMENSIONX + gx;
  const existing = this.blocks[idx];
  if (!existing) return;

  // existing can be sprite OR [floorSprite, blockSprite] OR nested arrays of sprites
  this._destroyNode(existing);
  this.blocks[idx] = null;
}

static _normalizeGridRect(x, y, w, h, pad = 0) {
  if (!this.grid?.length || !this.grid[0]?.length) return null;

  const startX = Math.floor(Number(x));
  const startY = Math.floor(Number(y));
  const width = Math.floor(Number(w));
  const height = Math.floor(Number(h));
  const extra = Math.max(0, Math.floor(Number(pad) || 0));

  if (!Number.isFinite(startX) || !Number.isFinite(startY) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;

  const minX = Math.max(0, startX - extra);
  const minY = Math.max(0, startY - extra);
  const maxX = Math.min(this.grid[0].length - 1, startX + width - 1 + extra);
  const maxY = Math.min(this.grid.length - 1, startY + height - 1 + extra);

  if (maxX < minX || maxY < minY) return null;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

static _refreshOverviewTextureForRect(x, y, w = 1, h = 1) {
  const mixer = this.scene?.zoomMixer;
  if (!mixer || !Array.isArray(this.grid) || !Array.isArray(this.grid[0])) return false;

  if (mixer.overviewImage?.active) {
    mixer.updateOverviewCell?.(x, y, this.grid, w, h);
  } else {
    mixer.buildOverviewTextureFromGrid?.(this.grid, SQUARESIZE, (cell) => colorFor(cell));
  }

  const overviewImage = mixer.ensureOverviewImage?.();
  overviewImage?.setVisible?.(true);
  overviewImage?.setAlpha?.(1);
  return true;
}

// Returns true if val (numeric tile code) maps to water
static _isWaterVal(val) {
  return TILE_MAP(val) === "water";
}

// map.js
static setGroundTile(gx, gy, tileType, opts = {}) {
  const def = TILE_TYPES[tileType];
  if (!def) return;
  if (!this.grid?.[gy] || this.grid[gy][gx] == null) return;

  // Ground terrain should stay scalar. Only building/block placements create [floor, block].
  if (tileType === "water") {
    this.grid[gy][gx] = def.interior;
    this._refreshTerrainShapesAround(gx, gy);
  } else if (def.complex) {
    this.placeTile(gx, gy, tileType);
    this._refreshTerrainShapesAround(gx, gy);
  } else {
    const depth = (def.depth != null) ? def.depth : FLOORDEPTH;
    this.checkAndPlace(gx, gy, def.grid, depth);
    this._refreshTerrainShapesAround(gx, gy);
  }

  const walkableWater = tileType === "water" && opts.walkable === true;
  const blocks = ((tileType === "water" && !walkableWater) || tileType === "wall" || tileType === "woodWall");
  const nextNav = blocks ? 0 : 1;
  let navChanged = false;
  if (this.navGrid?.[gy] && this.navGrid[gy][gx] !== undefined) {
    navChanged = navChanged || this.navGrid[gy][gx] !== nextNav;
    this.navGrid[gy][gx] = nextNav;
  }
  if (this.enemyNavGrid?.[gy] && this.enemyNavGrid[gy][gx] !== undefined) {
    navChanged = navChanged || this.enemyNavGrid[gy][gx] !== nextNav;
    this.enemyNavGrid[gy][gx] = nextNav;
  }
  if (navChanged) this.bumpNavGridRevision("ground_tile_nav_change");
}

// Bulk paint helper
static fillGroundRect(x0, y0, w, h, tileType, opts = {}) {
  for (let y = y0; y < y0 + h; y++) {
    if (!this.grid[y]) continue;
    for (let x = x0; x < x0 + w; x++) {
      if (this.grid[y][x] == null) continue;
      this.setGroundTile(x, y, tileType, opts);
    }
  }
}

    // --- /map.js --------------------------------------------------------------
    static handleGridDelete(block, type, x, y){
        if(type.name == "wall" || type.name == "woodWall" || type.name == "wall_door" || type.name == "woodWall_door"){
            const idx = y * WORLD_DIMENSIONX + x;
            const slot = this.blocks[idx];
            if (slot && Array.isArray(slot)) {
                // In normal (non-overview) mode this will be the old ground sprite
                if (Array.isArray(slot[1])) {
                    slot[1][0]?.destroy?.();
                    slot[1][1]?.destroy?.();
                } else {
                    slot[1]?.destroy?.();
                }
                this.blocks[idx] = slot[0] ?? null;
            }
            if(Array.isArray(this.grid[y][x])){
                this.grid[y][x] = this.grid[y][x][0];
            }
            return;
        }
        if (type.name === "crops") {
            const key = `${x},${y}`;
            Map.cropDict[key] = block;
            const cropState = {
                sprite: block,
                x: x,
                y: y,
                teamNumber: '1',
                dailyWatered: false,
                growthStage: 0,
                hasSeed: true,
                harvestsRemaining: 0
            };
            Map._bindCropHover(block, x, y, cropState.teamNumber);
            Teams.teamLists['1'].crops.push(cropState);
            Teams.teamLists['1'].wateringList.push({
                x: x,
                y: y,
                assigned: 0,
                sprite: block
            });
            Teams.syncCropWaterIndicator?.(cropState);
            // track this crop separately
            const idx = y * WORLD_DIMENSIONX + x;
            const slot = this.blocks[idx];

            if (slot && !Array.isArray(slot)) {
                // In normal (non-overview) mode this will be the old ground sprite
                if (slot.destroy) slot.destroy();
            }
            // Safe even if blocks is [] or empty at this index (overview mode)
            this.blocks[idx] = null;
            return;  // don’t fall through into the normal blocks[] logic
        }
        else if(type.depth == BLOCKDEPTH){
            if(!Array.isArray(this.blocks[y*WORLD_DIMENSIONX+x])){
                this.blocks[y*WORLD_DIMENSIONX+x] = [this.blocks[y*WORLD_DIMENSIONX+x], block];
            }
            else{
                if(Array.isArray(this.blocks[y*WORLD_DIMENSIONX+x][1])){
                    this.blocks[y*WORLD_DIMENSIONX+x][1][0].destroy();
                    this.blocks[y*WORLD_DIMENSIONX+x][1][1].destroy();
                }else{this.blocks[y*WORLD_DIMENSIONX+x][1]?.destroy();}
                this.blocks[y*WORLD_DIMENSIONX+x][1] = block;
            }
        }
        else{
            if(!Array.isArray(this.blocks[y*WORLD_DIMENSIONX+x])){
                let Sblock = this.blocks[y*WORLD_DIMENSIONX+x];
                this.blocks[y*WORLD_DIMENSIONX+x]?.destroy();
                this.blocks[y*WORLD_DIMENSIONX+x] = block;
            }
            else{
                this.blocks[y*WORLD_DIMENSIONX+x][0]?.destroy();
                this.blocks[y*WORLD_DIMENSIONX+x][0] = block;
                if(this.blocks[y*WORLD_DIMENSIONX+x]?.[1]?.body){
                    const navChanged =
                        (Map.navGrid?.[y]?.[x] !== undefined && Map.navGrid[y][x] !== 0) ||
                        (Map.enemyNavGrid?.[y]?.[x] !== undefined && Map.enemyNavGrid[y][x] !== 0);
                    if (Map.navGrid?.[y]?.[x] !== undefined) Map.navGrid[y][x] = 0;
                    if (Map.enemyNavGrid?.[y]?.[x] !== undefined) Map.enemyNavGrid[y][x] = 0;
                    if (navChanged) this.bumpNavGridRevision("layered_block_nav_change");
                }
            }
        }
        if(type.interactable){
            seedManager.makeClickable(x, y, block);
        }
    }

    static _hasTypeAt(gx, gy, typeName) {
        const c = this.grid[gy]?.[gx];
        if (c == null) return false;

        // Wall-family equivalence:
        // - "wall" should treat "wall_door" as same family
        // - "woodWall" should treat "woodWall_door" as same family
        // (but if you ask specifically for a door type, keep it exact)
        const matches = (mapped) => {
            if (!mapped) return false;

            // family match for adjacency logic
            if (typeName === "wall")      return mapped === "wall" || mapped === "wall_door";
            if (typeName === "woodWall")  return mapped === "woodWall" || mapped === "woodWall_door";
            if (typeName === "road")      return mapped === "road" || mapped === "crops";

            // optional convenience if you ever want it:
            if (typeName === "door") return mapped === "wall_door" || mapped === "woodWall_door";

            // otherwise exact match
            return mapped === typeName;
        };

        if (Array.isArray(c)) {
            // check top and base; either can be this type family
            return matches(TILE_MAP(c[0])) || matches(TILE_MAP(c[1]));
        }

        return matches(TILE_MAP(c));
    }

    static _isWallStructureName(name) {
        return (
            name === "wall" ||
            name === "woodWall" ||
            name === "wall_door" ||
            name === "woodWall_door"
        );
    }

    static _wallStructureInfoAt(gx, gy) {
        const cell = this.grid?.[gy]?.[gx];
        if (cell == null) return null;

        if (Array.isArray(cell)) {
            const topName = TILE_MAP(cell[1]);
            if (this._isWallStructureName(topName)) {
                return { name: topName, value: cell[1], index: 1 };
            }

            const baseName = TILE_MAP(cell[0]);
            if (this._isWallStructureName(baseName)) {
                return { name: baseName, value: cell[0], index: 0 };
            }

            return null;
        }

        const name = TILE_MAP(cell);
        if (!this._isWallStructureName(name)) return null;
        return { name, value: cell, index: -1 };
    }

    static _wallTeamAt(gx, gy) {
        const team = Wall.getAt(gx, gy)?.team;
        const normalized = Number(team);
        return Number.isFinite(normalized) ? normalized : null;
    }

    static _hasSameTeamWallAt(gx, gy, teamNumber) {
        const info = this._wallStructureInfoAt(gx, gy);
        if (!info) return false;

        const neighborTeam = this._wallTeamAt(gx, gy);
        const selfTeam = Number(teamNumber);
        if (!Number.isFinite(selfTeam) || neighborTeam == null) return false;
        return neighborTeam === selfTeam;
    }

    static _isWallOrDoorAt(gx, gy) {
        return !!this._wallStructureInfoAt(gx, gy);
    }

    static refreshWallShapesAround(x, y, pad = 1) {
        const minY = Math.max(0, y - pad);
        const maxY = Math.min(this.grid.length - 1, y + pad);
        const minX = Math.max(0, x - pad);
        const maxX = Math.min(this.grid[0].length - 1, x + pad);

        for (let gy = minY; gy <= maxY; gy++) {
            for (let gx = minX; gx <= maxX; gx++) {
                const info = this._wallStructureInfoAt(gx, gy);
                if (!info) continue;
                if (info.name === "wall" || info.name === "woodWall") {
                    this.determineTileType(gx, gy, info.name, info.index, 0);
                }
            }
        }

        for (let gy = minY; gy <= maxY; gy++) {
            for (let gx = minX; gx <= maxX; gx++) {
                if (!this._wallStructureInfoAt(gx, gy)) continue;
                this.drawGridValue(gx, gy);
            }
        }
    }

    static determineTileType(x, y, tileType, index = -1, draw = 1) {
        const def = TILE_TYPES[tileType];

        //dont handle doors
        if(index && (TILE_MAP(this.grid[y][x][1]) == "woodWall_door" || TILE_MAP(this.grid[y][x][1]) == "wall_door")){
            return;
        }

        const write = (val) => {
            const cell = this.grid[y]?.[x];

            if (Array.isArray(cell)) {
                const targetIndex = index > -1 ? index : (def.block ? 1 : 0);
                this.grid[y][x][targetIndex] = val;
                if (draw) this.drawGridValue(x, y);
                return val;
            }

            if (cell != null && def.block) {
                this.grid[y][x] = [cell, val];
                if (draw) this.drawGridValue(x, y, 1);
                return val;
            }

            this.grid[y][x] = val;
            if (draw) this.drawGridValue(x, y);
            return val;
        };

        if (def.name === "water") {
            return write(def.interior);
        }

        if (def.name === "grass") {
            const isWaterAt = (gx, gy) => this._terrainNameAt(gx, gy) === "water";
            const A = isWaterAt(x, y - 1);
            const B = isWaterAt(x, y + 1);
            const L = isWaterAt(x - 1, y);
            const R = isWaterAt(x + 1, y);
            const NW = isWaterAt(x - 1, y - 1);
            const NE = isWaterAt(x + 1, y - 1);
            const SW = isWaterAt(x - 1, y + 1);
            const SE = isWaterAt(x + 1, y + 1);

            if (A && L && (NW || (!R && !B))) return write(def.corners.topLeft);
            if (A && R && (NE || (!L && !B))) return write(def.corners.topRight);
            if (B && L && (SW || (!R && !A))) return write(def.corners.bottomLeft);
            if (B && R && (SE || (!L && !A))) return write(def.corners.bottomRight);

            if (A) return write(def.sides.up);
            if (R) return write(def.sides.right);
            if (B) return write(def.sides.down);
            if (L) return write(def.sides.left);
            return write(def.interior);
        }

        const isWallType = def.name === "wall" || def.name === "woodWall";
        const hasNeighbor = (gx, gy) =>
            isWallType
                ? this._isWallOrDoorAt(gx, gy)
                : this._hasTypeAt(gx, gy, tileType);

        const A = hasNeighbor(x, y-1); // above
        const B = hasNeighbor(x, y+1); // below
        const L = hasNeighbor(x-1, y); // left
        const R = hasNeighbor(x+1, y); // right
        const NW = hasNeighbor(x-1, y-1);
        const NE = hasNeighbor(x+1, y-1);
        const SW = hasNeighbor(x-1, y+1);
        const SE = hasNeighbor(x+1, y+1);
        const cnt = (A?1:0) + (B?1:0) + (L?1:0) + (R?1:0);
        const supportsExtendedShapes = (tileType === 'dirt' || tileType === 'road' || tileType === 'fort_floor' || tileType === 'dark_grass');

        // 0 neighbors → interior
        if (cnt === 0 && (def.name != "wall" && def.name != "woodWall")) return write(def.interior);

        // 1 neighbor → ATTACHED-ISLAND (dirt only), else a side
        if (cnt === 1 && (def.name != "wall" && def.name != "woodWall")) {
            if (def.island != null) return write(def.island);   // dirt & water islands
            if (A) return write(def.sides.up);
            if (R) return write(def.sides.right);
            if (B) return write(def.sides.down);
            return write(def.sides.left);
        } else if ((def.name == "wall" || def.name == "woodWall")) {

            const floorUnderHere = this._pickFloorValFromCell(this.grid[y]?.[x]);

            if(cnt === 1){
                if (A) return write(def.sides.right, floorUnderHere);
                if (R) return write(def.sides.up,    floorUnderHere);
                if (B) return write(def.sides.left,  floorUnderHere);
                return      write(def.sides.down,  floorUnderHere);
            }
            else if(cnt === 2){
                if (A && B && !L && !R) return write(def.sides.right,         floorUnderHere);
                if (L && R && !A && !B) return write(def.sides.up,            floorUnderHere);
                if (A && L && !R && !B) return write(def.corners.bottomRight, floorUnderHere);
                if (A && R && !L && !B) return write(def.corners.bottomLeft,  floorUnderHere);
                if (B && L && !R && !A) return write(def.corners.topRight,    floorUnderHere);
                if (B && R && !L && !A) return write(def.corners.topLeft,     floorUnderHere);
            }
            else if(cnt === 3){
                return write(def.interior, floorUnderHere);
            }
            else{
                return write(def.interior, floorUnderHere);
            }
        }


        // 2 neighbors: orthogonal → outer corner; opposite → interior run
        if (A && L && !R && !B) return write(def.corners.bottomRight);
        if (A && R && !L && !B) return write(def.corners.bottomLeft);
        if (B && L && !R && !A) return write(def.corners.topRight);
        if (B && R && !L && !A) return write(def.corners.topLeft);
        if (A && B && !L && !R) return write(def.interior);
        if (L && R && !A && !B) return write(def.interior);

        // 3 neighbors → side facing the missing one
        if (!A && L && R && B) return write(def.sides.up);
        if (!R && A && B && L) return write(def.sides.right);
        if (!B && L && R && A) return write(def.sides.down);
        if (!L && A && B && R) return write(def.sides.left);

        if (supportsExtendedShapes && A && B && L && R) {
            if (NW && SE && !NE && !SW) return write(def.diagJoins?.nwSe ?? def.interior);
            if (NE && SW && !NW && !SE) return write(def.diagJoins?.neSw ?? def.interior);
            if (!NW) return write(def.innerCorners?.topLeft ?? def.interior);
            if (!NE) return write(def.innerCorners?.topRight ?? def.interior);
            if (!SE) return write(def.innerCorners?.bottomRight ?? def.interior);
            if (!SW) return write(def.innerCorners?.bottomLeft ?? def.interior);
        }

        // 4 neighbors → interior
        return write(def.interior);
    }

    
    static addSpreadArr(x, y, newItem, index){
        if(newItem.block){
            let navChanged = false;
            if (Map.navGrid?.[y]?.[x] !== undefined) {
                navChanged = navChanged || Map.navGrid[y][x] !== 0;
                Map.navGrid[y][x] = 0;
            }
            if (Map.enemyNavGrid?.[y]?.[x] !== undefined) {
                navChanged = navChanged || Map.enemyNavGrid[y][x] !== 0;
                Map.enemyNavGrid[y][x] = 0;
            }
            if (navChanged) this.bumpNavGridRevision("spread_block_nav_change");
        }
        if(Array.isArray(this.grid[y][x])){
            const targetIndex = index > -1 ? index : (newItem.depth === FLOORDEPTH ? 0 : 1);
            this.grid[y][x][targetIndex] = newItem.grid
            this._refreshRenderCacheAround(x, y);
            return newItem.complex ? this.placeTile(x,y,newItem.name,targetIndex) : this.drawGridValue(x,y,targetIndex)
        }
        let oldItem = TILE_TYPES[TILE_MAP(this.grid[y][x])]
        if(oldItem && newItem.block && !oldItem.block){
            this.grid[y][x] = [oldItem.grid, newItem.grid]
            this._refreshRenderCacheAround(x, y);
            return newItem.complex ? this.placeTile(x,y,newItem.name,1) : this.drawGridValue(x,y,1)
        }
        else if(newItem.complex){
            this.grid[y][x] = newItem.grid;
            this._refreshRenderCacheAround(x, y);
            this.placeTile(x,y,newItem.name)
        }
        else {this.grid[y][x] = newItem.grid; this._refreshRenderCacheAround(x, y); this.drawGridValue(x,y)}
    }

    static grabIndex(arr,index){
        if(Array.isArray(arr) && index > -1){
            return arr[index]
        }
        return arr
    }

    static grabDepth(arr, depth){
        if(Array.isArray(arr)){
            return depth == FLOORDEPTH? arr[0]: arr[1]
        }
        return arr
    }

    static checkAndPlace(x, y, val, depth){
        if(Array.isArray(this.grid[y][x])){
            depth == FLOORDEPTH? this.grid[y][x][0] = val: this.grid[y][x][1] = val
            this._refreshRenderCacheAround(x, y);
            return;
        }
        const oldItem = TILE_TYPES[TILE_MAP(this.grid[y][x])]
        const newItem = TILE_TYPES[TILE_MAP(val)]
        if(oldItem && newItem.block && !oldItem.block){
            newItem.depth == FLOORDEPTH? this.grid[y][x] = [newItem.grid, oldItem.grid]: this.grid[y][x] = [oldItem.grid, newItem.grid] 
            this._refreshRenderCacheAround(x, y);
            return
        }
        this.grid[y][x] = val
        this._refreshRenderCacheAround(x, y);
    }

    static sample(x, y){
        let rgb = this.getPixelRGBA(x,y);
        const distances = {
            1  : this.colorDistance(rgb, colors.green),      // grass
            2  : this.colorDistance(rgb, colors.lightGray),  // wall
            24 : this.colorDistance(rgb, colors.blue),       // water interior
            37 : this.colorDistance(rgb, colors.gray),       // road  (shifted from 36)
            14 : this.colorDistance(rgb, colors.brown),      // dirt interior
            43 : this.colorDistance(rgb, colors.lightBrown), // storage (shifted from 42)
            34 : this.colorDistance(rgb, colors.darkRed),    // house1 (shifted from 33)
            12 : this.colorDistance(rgb, colors.darkGreen),  // pine
            46 : this.colorDistance(rgb, colors.rockGray)    // rock (shifted from 45)
        };


        // Find the color category with the smallest distance to the given rgb color
        return Number(Object.keys(distances).reduce((a, b) => distances[a] < distances[b] ? a : b));
    }
    
    static addValToIndex(x,y,val){
        const oldItem = TILE_TYPES[TILE_MAP(this.grid[y][x])]
        const newItem = TILE_TYPES[TILE_MAP(val)]
        if(oldItem && newItem.block && !oldItem.block){
            newItem.depth == FLOORDEPTH? this.grid[y][x] = [newItem.grid, oldItem.grid]: this.grid[y][x] = [oldItem.grid, newItem.grid] 
            return
        }
        this.grid[y][x] = newItem.grid
    }

    static handleLoadNonSpread(posX,posY,item,index=-1,teamNumber=null){
        if(item?.name === TILE_TYPES.pine.name){
            this.addBlockItem(posX,posY,item)
            return new PineTree(posX, posY);
        }
        if(item?.name === TILE_TYPES.rock.name || item?.name === TILE_TYPES.goldOre?.name){
            this.addBlockItem(posX,posY,item)
            return new RockNode(posX, posY, 1, { tileType: item });
        }
        if(item?.name === TILE_TYPES.turret.name){
            return new Turret(posX, posY, teamNumber ?? buildingArray[index]?.[3] ?? 1);
        }
        if(item?.name === TILE_TYPES.catapult.name){
            return new Catapult(posX, posY, teamNumber ?? buildingArray[index]?.[3] ?? 1);
        }
        else{
            this.placingItem = this.scene.add.sprite(posX*SQUARESIZE+item.lenX/2*SQUARESIZE, posY*SQUARESIZE+item.lenY/2*SQUARESIZE, item.value)
                .setDepth(item.depth) // Ensure it's above everything
                .setInteractive({ cursor: 'pointer' });
            this.addBlockItem(posX,posY,item)
            const itemToPlace = this.placingItem
            itemToPlace.startFlash = () => {
                if (itemToPlace.flashTween) return;
                itemToPlace.flashTween = Map.scene.tweens.addCounter({
                    from: 0,
                    to: 1,
                    duration: 350,
                    yoyo: true,
                    repeat: -1,
                    onUpdate: (tw) => {
                        const on = tw.getValue() > 0.5;
                        if (on) itemToPlace.setTint(0x636363); 
                        else itemToPlace.clearTint();
                    }
                });
            };

            itemToPlace.stopFlash = () => {
                if (itemToPlace.flashTween) {
                    itemToPlace.flashTween.stop();
                    itemToPlace.flashTween.remove();
                    itemToPlace.flashTween = null;
                }
                itemToPlace.clearTint();
            };
            
            itemToPlace.sx = posX + Math.floor(item.lenX)
            itemToPlace.sy = posY + Math.floor(item.lenY)
            itemToPlace.lenX = item.lenX
            itemToPlace.lenY = item.lenY
            itemToPlace.gridX = posX
            itemToPlace.gridY = posY
            const blockerTeam = Number.isFinite(Number(teamNumber)) ? Number(teamNumber) : null;
            if (blockerTeam != null) {
                itemToPlace.team = blockerTeam;
                itemToPlace.teamNumber = blockerTeam;
            }
            if (item?.block) {
                itemToPlace._structureBarrierCollider = this.addStructureBarrier(
                    posX * SQUARESIZE + (Math.max(1, Number(item.lenX || 1)) * SQUARESIZE) / 2,
                    posY * SQUARESIZE + (Math.max(1, Number(item.lenY || 1)) * SQUARESIZE) / 2,
                    Math.max(1, Number(item.lenX || 1)) * SQUARESIZE,
                    Math.max(1, Number(item.lenY || 1)) * SQUARESIZE,
                    {
                        team: blockerTeam,
                        structureOwner: itemToPlace,
                    }
                );
                itemToPlace.once?.("destroy", () => {
                    Map.removeStructureBarrier(itemToPlace._structureBarrierCollider);
                    itemToPlace._structureBarrierCollider = null;
                });
            }
            if(item == TILE_TYPES.spawn) spawnPoints.push([posX, posY, itemToPlace])
            if(index>-1) buildingArray[index][3] = itemToPlace;
            if (item.name === 'pine') {
                itemToPlace.resourceType = item.name;
                itemToPlace.resourceTileType = item;
                itemToPlace.resourceKind = "wood";
                itemToPlace.health = 3;

                itemToPlace.on('pointerdown', () => {
                    const sceneNow = this.scene.time.now;
                    const selection = OrderRunner.getSelectionProfile();

                    // DOUBLE CLICK: cancel this resource job and stop foragers
                    if (itemToPlace._lastClickTime && (sceneNow - itemToPlace._lastClickTime) < 300) {
                        blockResourceManager.cancelManualClickTasksForNode(1, itemToPlace);

                        // remove from resource arrays so it isn’t targeted again
                        return;
                    }
                    itemToPlace._lastClickTime = sceneNow;

                    // ✅ accessibility gate for legacy sprites (pine/rock)
                    if (!buildingManager.isBlockAccessible(posX, posY, item)) {
                        showAlert(this.scene, "Can't reach that resource");
                        return;
                    }

                    if (selection.allForagers && OrderRunner.hasPendingGatherPlacement()) {
                        OrderRunner.issuePendingGatherPlacement(selection.troops, itemToPlace.x, itemToPlace.y);
                        return;
                    }

                    blockResourceManager.queueManualClickTask(itemToPlace, {
                        teamNumber: 1,
                        eligibleTroopIds: selection.allForagers ? selection.troops.map(troop => troop.id) : null,
                    });
                });
                if (item.name === 'pine') Map.worldPines.push(itemToPlace);
                this._worldAdd(itemToPlace);
            }
            itemToPlace.on('pointerover', () => {
                if(this.scene.breakItems && this.scene.breakItems.text == "Place"){
                    itemToPlace.setTint(0xaaaaaa); // Darken slightly on hover
                }
            });
            itemToPlace.on('pointerout', () => {
                if(this.scene.breakItems && this.scene.breakItems.text == "Place"){
                    itemToPlace.clearTint(); // Restore original color
                }
            });
            itemToPlace.on('pointerdown', () => {
                if(this.scene.breakItems && this.scene.breakItems.text == "Place"){
                    console.log('Destroying item...');
                    Teams.teamLists['1'].destroyStates.push({
                        type: item,
                        value: itemToPlace,
                        x: posX,
                        y: posY,
                        duration: 100,
                        assigned: 0
                    });
                    buildingManager.assingTroopsToDestroy(1);
                    // itemToPlace.destroy(); // Destroy the specific item
                    // this.removeTile(itemToPlace.sx, itemToPlace.sy, itemToPlace.lenX, itemToPlace.lenY)
                }
            });
            this.placingItem = null;
            return itemToPlace;
        }
    }

    static _worldAdd(obj) {
        if (!obj) return obj;
        if (this.worldLayer) this.worldLayer.add(obj);
        return obj;
    }

    static addToWorldStatic(obj) {
        if (!obj) return obj;

        // put into static world layer (so it's logically grouped)
        Map.worldStaticLayer.add(obj);

        return obj;
    }

    static removeFromWorldStatic(obj, destroy = true) {
        if (!obj) return;
        Map.worldStaticLayer?.remove(obj);

        if (destroy && obj.destroy) obj.destroy();
    }

    static addStructureBarrier(centerX, centerY, width, height, meta = {}) {
        if (!this.scene?.physics?.add?.staticImage || !this.structureBarrier) return null;

        const collider = this.scene.physics.add.staticImage(centerX, centerY, "barrier");
        collider.setAlpha?.(0);
        collider.setDisplaySize?.(width, height);
        collider.refreshBody?.();
        collider.body?.setSize?.(width, height, true);
        collider.team = meta.team ?? collider.team ?? null;
        collider.blocksLineOfFire = meta.blocksLineOfFire !== false;
        collider.blocksProjectiles = meta.blocksProjectiles !== false;
        if (meta.wallRef) collider.wallRef = meta.wallRef;
        if (meta.buildingRef) collider.buildingRef = meta.buildingRef;
        if (meta.structureOwner) collider.structureOwner = meta.structureOwner;
        this.structureBarrier.add(collider);
        return collider;
    }

    static removeStructureBarrier(collider) {
        if (!collider) return;
        this.structureBarrier?.remove?.(collider, true, true);
        collider.destroy?.();
    }

    static _uiIgnoreWorldLayer() {
        return;
    }

    static hasDetailedWorldElements() {
        if (!this._detailedWorldDrawn) return false;
        const isLiveNode = (node) => {
            if (!node) return false;
            if (Array.isArray(node)) return node.some(isLiveNode);
            if (node.active === false) return false;
            if (node.scene && node.scene !== this.scene) return false;
            return !!node.scene || !!node.parentContainer || !!node.parentList;
        };

        if (Array.isArray(this.blocks) && this.blocks.some(isLiveNode)) return true;
        return Array.isArray(this.worldLayer?.list) && this.worldLayer.list.some(isLiveNode);
    }

    static _setNodeAnimationPaused(node, paused) {
        if (!node) return;
        if (Array.isArray(node)) {
            node.forEach((child) => this._setNodeAnimationPaused(child, paused));
            return;
        }

        if (node._pauseInOverview && node.anims) {
            if (paused) {
                if (!node._pausedForOverview) {
                    node._wasAnimatingBeforeOverview = !!node.anims.isPlaying;
                    if (node.anims.isPlaying) node.anims.pause();
                    node._pausedForOverview = true;
                }
            } else if (node._pausedForOverview) {
                if (node._wasAnimatingBeforeOverview) node.anims.resume();
                node._pausedForOverview = false;
                node._wasAnimatingBeforeOverview = false;
            }
        }

        if (node.list && Array.isArray(node.list)) {
            node.list.forEach((child) => this._setNodeAnimationPaused(child, paused));
        }
    }

    static setDetailedWorldPaused(paused = true) {
        this._detailedWorldPaused = !!paused;
        this._setNodeAnimationPaused(this.blocks, this._detailedWorldPaused);
    }

    static setDetailedWorldVisible(visible = true) {
        this.outerWaterLayer?.setVisible?.(visible);
        this.worldLayer?.setVisible?.(visible);
        this.worldStaticLayer?.setVisible?.(visible);
        this.graphics?.setVisible?.(visible);
    }

    static getPixelRGBA(x, y) {

        const index = (x + y * this.imageData.width) * 4; // Calculate the index in the array
        const r = this.imageData.data[index];     // Red value
        const g = this.imageData.data[index + 1]; // Green value
        const b = this.imageData.data[index + 2]; // Blue value
        const a = this.imageData.data[index + 3]; // Alpha value (opacity)

        return { r, g, b, a };
    }

    static colorDistance(color1, color2) {
        return Math.sqrt(
            (color1.r - color2.r) ** 2 +
            (color1.g - color2.g) ** 2 +
            (color1.b - color2.b) ** 2
        );
    }

    item = [{x: 2, y:4}, {x: 6, y:4}]
}
