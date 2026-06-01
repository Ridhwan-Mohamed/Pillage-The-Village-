import { UI_ITEM_TYPES } from "./UI/UIConstants";
import { StageState } from "./parcelController/StageState";
import {
  estimatePressureContractEconomy,
  getContractMoneyCost,
  getPressureClearBonus,
} from "./balance/GameBalance.js";
export function create2DArray(rows, cols) {
    let array = new Array(rows);
    for (let i = 0; i < rows; i++) {
        array[i] = new Array(cols).fill(1);
    }
    return array;
}
export let selected = 'image0'
export const GRID_HEIGHT    = 10
export const CONTROL_STATES = {
    USER_MODE: 0,
    TRACK_MODE: 1,
    ATTACK_MODE: 2,
    FARM_MODE: 3,
    HARVEST_MODE: 4,
    FISH_MODE: 5,
    HEAL_MODE: 6,
    BUILD_MODE_T: 7,
    BUILD_MODE_B: 8,
    DESTROY_MODE: 9,
    SEED_MODE: 10,
    R_FARM_MODE: 11,
    BACK_TO_TOWN: 12,
    TRACK_TARGET: 13,
    SEND_TO_STORAGE: 14, //general send item to store
    WATER_CROPS_MODE: 15,
    GET_WATER_MODE: 16,
    COOK_MODE: 18,
    GET_FROM_STORAGE: 19, //from storage
    SEND_TO_OVEN: 20, //to oven
    GET_FROM_OVEN: 21, //obtain from oven
    GET_BLOCK_RESOURCE: 22,
    SLEEP_MODE: 23,
    GO_HOME_MODE: 24,
    FLEE_MODE: 25,
    HEADING_TO_GUARD: 26,
    FIX_BUILDING: 27,
    SIEGE_MODE: 28,
    DESTROY_MODE_T: 29,
}

export const MAX_CROP_GROWTH_STAGE = 2; // assuming 0-4 frames
export var WORLD_DIMENSIONX = 250;
export var WORLD_DIMENSIONY = 250;
export const UIDEPTH = 10
export const FLOORDEPTH = 2
export const BLOCKDEPTH = FLOORDEPTH+1
export const SQUARESIZE = 32;
export const CHUNK_SIZE = 60
export const EDGE_RATIO = CHUNK_SIZE/8
// --- TILE_TYPES (full) ---
export const TILE_TYPES = {
  grass : {
    name: "grass",
    spread: true,
    block: false,
    complex: true,
    grid: 1,
    interior: 1,
    sides: { up: 99, down: 100, left: 101, right: 102 },
    corners: { topLeft: 103, topRight: 104, bottomLeft: 105, bottomRight: 106 },
    depth: FLOORDEPTH,
    assets: {
      interior: { key: 'grass_interior', sheet: false },
      edge: { key: 'grass_edge_water', sheet: false },
      corner: { key: 'grass_corner_water', sheet: false },
      innerCorner: {
        water: { key: 'grass_inner_corner_water', sheet: false }
      }
    }
  },

  dark_grass : {
    name: "dark_grass",
    spread: true,
    block: false,
    complex: true,
    grid: 108,
    interior: 108,
    sides: { up: 109, down: 110, left: 111, right: 112 },
    corners: { topLeft: 113, topRight: 114, bottomLeft: 115, bottomRight: 116 },
    innerCorners: { topLeft: 117, topRight: 118, bottomRight: 119, bottomLeft: 120 },
    depth: FLOORDEPTH,
    assets: {
      interior: { key: 'darkgrass_interior', sheet: false },
      edge: {
        grass: { key: 'darkgrass_edge_grass', sheet: false },
        water: { key: 'darkgrass_edge_water', sheet: false },
        shoreGrass: { key: 'darkgrass_shore_edge_grass', sheet: false },
      },
      corner: {
        water: { key: 'darkgrass_corner_water', sheet: false }
      },
      innerCorner: {
        water: { key: 'darkgrass_inner_corner_water', sheet: false }
      }
    }
  },

  wall: {
    name: "wall",
    interior: 2,
    sides: { up: 3, down: 4, left: 5, right: 6 },
    corners: { topLeft: 7, topRight: 8, bottomLeft: 9, bottomRight: 10 },
    complex: true,
    price: { stone: 1 },         
    spread: true,
    block: true,
    grid: 2,
    depth: BLOCKDEPTH,
    spriteSheet: true,
    lenX: 1, lenY: 1,

    // OPTIONAL but recommended: new per-piece assets you mentioned
    // (keeps numeric mapping for grid/TILE_MAP but draw can use assets)
    assets: {
      interior: { key: 'wall_interior', sheet: false },
      edge:     { key: 'wall_edge',     sheet: false },   // "top edge" source; map.js flips/rotates
      corner:   { key: 'wall_corner',   sheet: false },   // "top-left corner" source; map.js flips/rotates
    }
  },

  sand: {
    name: "sand",
    value: 'image1',
    spread: false,
    block: true,
    complex: false,
    grid: 11,
    lenX: 3, lenY: 3,
    price: 10,
    depth: BLOCKDEPTH
  },

  pine: {
    name: "pine",
    value: 'pine3',
    price: 50,
    spread: false,
    block: true,
    complex: false,
    grid: 12,
    lenX: 2, lenY: 2,
    depth: BLOCKDEPTH+2,
    resource: UI_ITEM_TYPES.wood,
    images: ['pine1','pine2','pine3']
  },

  turret: {
    name: "turret",
    value: ['image7','image7a'],
    spread: false,
    block: true,
    complex: false,
    grid: 13,
    lenX: 2, lenY: 2,
    price: 200,
    depth: BLOCKDEPTH
  },

  catapult: {
    name: "catapult",
    value: ["catapult_base", "catapult_top"],
    spread: false,
    block: true,
    complex: false,
    grid: 107,
    lenX: 2, lenY: 2,
    price: 350,
    depth: BLOCKDEPTH,
    maxHealth: 420,
  },

  // ── Dirt (complex, numbered + island; draw uses assets, not TILE_ARR) ──
  dirt : {
    name: "dirt",
    spread: true,
    block: false,
    complex: true,
    grid: 14,                 // interior code
    interior: 14,             // interior
    island:   15,             // island (cap)
    sides:    { up: 16, down: 17, left: 18, right: 19 },
    corners:  { topLeft: 20, topRight: 21, bottomLeft: 22, bottomRight: 23 },
    innerCorners: { topLeft: 81, topRight: 82, bottomRight: 83, bottomLeft: 84 },
    diagJoins: { nwSe: 85, neSw: 86 },
    depth: FLOORDEPTH,
    assets: {
      interior: { key: 'dirt_interior', sheet: false },
      edge: {
        grass: { key: 'dirt_edge_grass', sheet: false },
        water: { key: 'dirt_edge_water', sheet: false },
        shoreGrass: { key: 'dirt_shore_edge_grass', sheet: false }
      },
      corner: {
        grass: { key: 'dirt_corner_grass', sheet: false },
        water: { key: 'dirt_corner_water', sheet: false }
      },
      innerCorner: {
        grass: { key: 'dirt_inner_corner', sheet: false },
        water: { key: 'dirt_inner_corner_water', sheet: false }
      },
      diagJoin: { key: 'dirt_diag_join', sheet: false }
    }
  },

  // ── Water (complex, numbered + island; draw uses assets, not TILE_ARR) ──
  water : {
    name: "water",
    spriteSheet: true, // interior is animated
    spread: true,
    block: false,
    complex: true,
    grid: 24,                 // interior code
    interior: 24,             // interior
    island:   25,             // island (cap)
    sides:    { up: 26, down: 27, left: 28, right: 29 },
    corners:  { topLeft: 30, topRight: 31, bottomLeft: 32, bottomRight: 33 },
    depth: BLOCKDEPTH,
    assets: {
      interior: { key: 'water', sheet: true, anim: 'water' }
    }
  },

  house1:{
    name: "house1",
    value: "house1",
    spriteSheet: false,
    spread: false,
    block: true,
    complex: false,
    grid: 34,
    depth: BLOCKDEPTH,
    lenX: 2, lenY: 2,
    cost: { wood: 4, stone: 4 }
  },

  house2:{
    name: "house2",
    value: "house2",
    spriteSheet: false,
    spread: false,
    block: true,
    complex: false,
    grid: 35,
    depth: BLOCKDEPTH,
    lenX: 2, lenY: 2,
    cost: { wood: 4, stone: 4 }
  },

  well:{
    name: "well",
    value: "well",
    spriteSheet: false,
    spread: false,
    block: true,
    complex: false,
    grid: 36,
    depth: BLOCKDEPTH,
    lenX: 4, lenY: 4
  },

  // ── Road (NEW: complex, interior/edge/corner/island; interior kept at 37) ──
  road : {
    name: "road",
    spread: true,
    block: false,
    complex: true,
    grid: 37,                 // interior code (kept the same)
    interior: 37,             // interior
    island:   48,             // island (cap)
    sides:    { up: 49, down: 50, left: 51, right: 52 },
    corners:  { topLeft: 53, topRight: 54, bottomLeft: 55, bottomRight: 56 },
    innerCorners: { topLeft: 87, topRight: 88, bottomRight: 89, bottomLeft: 90 },
    diagJoins: { nwSe: 91, neSw: 92 },
    depth: FLOORDEPTH,
    assets: {
      interior: { key: 'road_interior', sheet: false },
      edge: {
        grass: { key: 'road_edge_grass', sheet: false },
        water: { key: 'road_edge_water', sheet: false },
        shoreGrass: { key: 'road_shore_edge_grass', sheet: false }
      },
      corner: {
        grass: { key: 'road_corner_grass', sheet: false },
        water: { key: 'road_corner_water', sheet: false }
      },
      innerCorner: {
        grass: { key: 'road_inner_corner', sheet: false },
        water: { key: 'road_inner_corner_water', sheet: false }
      },
      diagJoin: { key: 'road_diag_join', sheet: false }
    }
  },

  player:{
    name: "player",
    block: true,
    value: 'image9',
    depth: BLOCKDEPTH+1,
    lenX: 1, lenY: 1,
  },

  crops: {
    name: "crops",
    block: false,
    value: 'crops',
    spriteSheet: true,
    depth: FLOORDEPTH,
    spread: true,
    complex: false,
    price: 5,
    grid: 38
  },

  grassCrop : {
    name: "grassCrop",
    spread: true,
    block: false,
    complex: false,
    grid: 39,
    depth: FLOORDEPTH,
    interactable: true
  },

  grassBerry : {
    name: "grassBerry",
    spread: true,
    block: false,
    complex: false,
    grid: 40,
    depth: FLOORDEPTH,
    interactable: true
  },

  spawn: {
    name: "spawn",
    value: "spawn",
    spriteSheet: false,
    spread: false,
    block: false,
    complex: false,
    grid: 41,
    depth: BLOCKDEPTH,
    lenX: 1, lenY: 1
  },

  clayOven: {
    name: "clayOven",
    value: "clayOven",
    spriteSheet: true,
    spread: false,
    block: true,
    complex: false,
    grid: 42,
    depth: BLOCKDEPTH,
    lenX: 2, lenY: 2,
    cost: { stone: 4 }
  },

  storage: {
    name: "storage",
    value: "storage",
    spriteSheet: false,
    spread: false,
    block: true,
    complex: false,
    grid: 43,
    depth: BLOCKDEPTH,
    lenX: 2, lenY: 2,
    cost: { wood: 4 }
  },

  grassWood : {
    name: "grassWood",
    spread: true,
    block: false,
    complex: false,
    grid: 44,
    depth: FLOORDEPTH,
    interactable: true
  },

  grassRock : {
    name: "grassRock",
    spread: true,
    block: false,
    complex: false,
    grid: 45,
    depth: FLOORDEPTH,
    interactable: true
  },

  rock: {
    name: "rock",
    value: 'rock3',
    spread: false,
    block: true,
    complex: false,
    grid: 46,
    lenX: 2, lenY: 2,
    depth: BLOCKDEPTH+2,
    resource: UI_ITEM_TYPES.stone,
    images: ['rock1','rock2','rock3']
  },

  goldOre: {
    name: "goldOre",
    label: "gold ore",
    value: 'gold_ore3',
    spread: false,
    block: true,
    complex: false,
    grid: 121,
    lenX: 2, lenY: 2,
    depth: BLOCKDEPTH+2,
    resource: null,
    gatherDuration: 4200,
    images: ['gold_ore1', 'gold_ore2', 'gold_ore3']
  },

  construction: {
    name: "construction",
    value: 'construction',
    spread: false,
    block: true,
    complex: false,
    grid: 47,
    lenX: 4, lenY: 4,
    depth: BLOCKDEPTH+2,
  },

    woodWall: {
    name: "woodWall",
    interior: 57,
    sides: { up: 58, down: 59, left: 60, right: 61 },
    corners: { topLeft: 62, topRight: 63, bottomLeft: 64, bottomRight: 65 },
    complex: true,
    price: 5,                 // or whatever
    spread: true,
    block: true,
    grid: 57,                 // IMPORTANT: used in MapFromImage “blocked” check if you add it
    depth: BLOCKDEPTH,
    cost: { wood: 1 },         // for your UI counters
    spriteSheet: true,
    lenX: 1, lenY: 1,
    // OPTIONAL recommended per-piece assets (your new naming scheme)
    assets: {
      interior: { key: 'woodWall_interior', sheet: false },
      edge:     { key: 'woodWall_edge',     sheet: false },
      corner:   { key: 'woodWall_corner',   sheet: false },
      // door can be separate later: { key:'woodWall_door', ... }
    }
  },
  // --- DOORS (NOT blocked; spriteSheet w/ 2 frames) ---
  wall_door: {
    value: 'wall_door',
    name: "wall_door",
    grid: 66,            // new numeric id
    block: false,        // IMPORTANT: doors do NOT block navmesh
    depth: BLOCKDEPTH,
    lenX: 1,
    lenY: 1,
    spriteSheet: true,   // IMPORTANT: 2-frame sheet
    complex: false,
    price: { stone: 1 }
  },
  woodWall_door: {
    value: 'woodWall_door',
    name: "woodWall_door",
    grid: 67,            // new numeric id
    block: false,
    depth: BLOCKDEPTH,
    lenX: 1,
    lenY: 1,
    spriteSheet: true,
    complex: false,
    price: { wood: 1 }
  },
  fort_floor : {
    name: "fort_floor",
    spread: true,
    block: false,
    complex: true,
    grid: 68,                 // interior code (kept the same)
    interior: 68,             // interior
    island:   69,             // island (cap)
    sides:    { up: 70, down: 71, left: 72, right: 73 },
    corners:  { topLeft: 74, topRight: 75, bottomLeft: 76, bottomRight: 77 },
    innerCorners: { topLeft: 93, topRight: 94, bottomRight: 95, bottomLeft: 96 },
    diagJoins: { nwSe: 97, neSw: 98 },
    depth: FLOORDEPTH,
    assets: {
      interior: { key: 'dungeon_interior', sheet: false },
      edge: {
        grass: { key: 'dungeon_edge_grass', sheet: false },
        water: { key: 'dungeon_edge_water', sheet: false },
        shoreGrass: { key: 'dungeon_shore_edge_grass', sheet: false }
      },
      corner: {
        grass: { key: 'dungeon_corner_grass', sheet: false },
        water: { key: 'dungeon_corner_water', sheet: false }
      },
      innerCorner: {
        grass: { key: 'dungeon_inner_corner', sheet: false },
        water: { key: 'dungeon_inner_corner_water', sheet: false }
      },
      diagJoin: { key: 'dungeon_diag_join', sheet: false }
    }
  },
  tower :  {
    name: "tower",
    value: "tower",
    displayName: "Town Tower",
    spriteSheet: true,
    spread: false,
    block: true,
    complex: false,
    grid: 78,
    depth: BLOCKDEPTH,
    lenX: 3, lenY: 3,
    stayBlocked: true,
    maxHealth: 600,
    cost: { money: 300, wood: 4, stone: 4 },
  },
    // ── Fort enemy buildings (64x64 sheets, 2 frames) ──
  prison: {
    name: "prison",
    value: "prison_closed",
    spriteSheet: true,
    spread: false,
    block: true,
    complex: false,
    grid: 79,
    depth: BLOCKDEPTH,
    lenX: 2,
    lenY: 2,
    maxHealth: 450,
    stayBlocked: true, 
  },

  bank: {
    name: "bank",
    value: "bank_closed",
    spriteSheet: true,
    spread: false,
    block: true,
    complex: false,
    grid: 80,
    depth: BLOCKDEPTH,
    lenX: 2,
    lenY: 2,
    maxHealth: 500,
    stayBlocked: true,
  },
};

export const DRAFT_UI_X_SHIFT = 120;

export const teamSetupArray = {
    smallTeam: [TILE_TYPES.tower, TILE_TYPES.clayOven, TILE_TYPES.house2, TILE_TYPES.house1, TILE_TYPES.storage],
    bigTeam: [TILE_TYPES.well,TILE_TYPES.house1,TILE_TYPES.house2,TILE_TYPES.house1,TILE_TYPES.house1,TILE_TYPES.house2,TILE_TYPES.house1,TILE_TYPES.house2,TILE_TYPES.house1,TILE_TYPES.house2,TILE_TYPES.house1,TILE_TYPES.house1,TILE_TYPES.house2,TILE_TYPES.house1]
}

export const TILE_ARR = [
  0,
  'grass',                // 1  grass

  // wall (2..10)
  'wall',                 // 2  interior
  'tWall',                // 3
  'bWall',                // 4
  'lWall',                // 5
  'rWall',                // 6
  'tlcWall',              // 7
  'trcWall',              // 8
  'blcWall',              // 9
  'brcWall',              // 10

  'image1',               // 11 sand
  'pine3',                // 12 pine
  ['image7','image7a'],   // 13 turret

  // dirt (14..23) — compatibility only (draw uses assets)
  'Dirt',     // 14
  'iDirt',    // 15
  'tDirt',    // 16
  'bDirt',    // 17
  'lDirt',    // 18
  'rDirt',    // 19
  'tlcDirt',  // 20
  'trcDirt',  // 21
  'blcDirt',  // 22
  'brcDirt',  // 23

  // water (24..33) — compatibility only (draw uses assets)
  'water',     // 24
  'iwater',    // 25
  'twater',    // 26
  'bwater',    // 27
  'lwater',    // 28
  'rwater',    // 29
  'tlcwater',  // 30
  'trcwater',  // 31
  'blcwater',  // 32
  'brcwater',  // 33

  'house1',     // 34
  'house2',     // 35
  'well',       // 36

  // road interior kept as 37 for legacy sampling
  'road_interior', // 37

  'crops',      // 38
  'grassCrop',  // 39
  'grassBerry', // 40
  'spawn',      // 41
  'clayOven',   // 42
  'storage',    // 43
  'grassWood',  // 44
  'grassRock',  // 45
  'rock3',      // 46
  'construction', // 47

  // road (48..56) — compatibility only (draw uses assets + rotation)
  'road_island',  // 48
  'road_edge',    // 49 (N)
  'road_edge',    // 50 (S)
  'road_edge',    // 51 (L/W)
  'road_edge',    // 52 (R/E)
  'road_corner',  // 53 (TL)
  'road_corner',  // 54 (TR)
  'road_corner',  // 55 (BL)
  'road_corner',   // 56 (BR)

  'woodWall',   // 57 interior
  'wood_tWall', // 58
  'wood_bWall', // 59
  'wood_lWall', // 60
  'wood_rWall', // 61
  'wood_tlcWall', // 62
  'wood_trcWall', // 63
  'wood_blcWall', // 64
  'wood_brcWall', // 65
  'wall_door',     // 66 wall door
  'woodWall_door',  // 67 wood wall door

  'fort_interior', // 68 fort floor interior
  'fort_island',   // 69 fort floor island
  'fort_edge',     // 70 fort floor edge
  'fort_edge',     // 71 fort floor edge (flipped)
  'fort_edge',     // 72 fort floor edge (rotated)
  'fort_edge',     // 73 fort floor edge (rotated+flipped)
  'fort_corner',   // 74 fort floor corner (TL)
  'fort_corner',   // 75 fort floor corner (TR)
  'fort_corner',   // 76 fort floor corner (BL)
  'fort_corner',   // 77 fort floor corner (BR)

  'tower',      // 78
  'prison_closed', // 79
  'bank_closed',   // 80
  'dirt_inner_corner', // 81
  'dirt_inner_corner', // 82
  'dirt_inner_corner', // 83
  'dirt_inner_corner', // 84
  'dirt_diag_join',    // 85
  'dirt_diag_join',    // 86
  'road_inner_corner', // 87
  'road_inner_corner', // 88
  'road_inner_corner', // 89
  'road_inner_corner', // 90
  'road_diag_join',    // 91
  'road_diag_join',    // 92
  'dungeon_inner_corner', // 93
  'dungeon_inner_corner', // 94
  'dungeon_inner_corner', // 95
  'dungeon_inner_corner', // 96
  'dungeon_diag_join',    // 97
  'dungeon_diag_join',    // 98
  'grass_edge',           // 99
  'grass_edge',           // 100
  'grass_edge',           // 101
  'grass_edge',           // 102
  'grass_corner',         // 103
  'grass_corner',         // 104
  'grass_corner',         // 105
  'grass_corner',         // 106
  ['catapult_base', 'catapult_top'], // 107 catapult
  'darkgrass_interior',   // 108
  'darkgrass_edge',       // 109
  'darkgrass_edge',       // 110
  'darkgrass_edge',       // 111
  'darkgrass_edge',       // 112
  'darkgrass_corner',     // 113
  'darkgrass_corner',     // 114
  'darkgrass_corner',     // 115
  'darkgrass_corner',     // 116
  'darkgrass_inner_corner', // 117
  'darkgrass_inner_corner', // 118
  'darkgrass_inner_corner', // 119
  'darkgrass_inner_corner', // 120
  'gold_ore3',             // 121
];

// --- TILE_MAP (full) ---
export function TILE_MAP(val){
  if (val == 1) return "grass";
  else if (val >= 2 && val <= 10) return "wall";
  else if (val == 11) return "sand";
  else if (val == 12) return "pine";
  else if (val == 13) return "turret";

  // dirt 14..23
  else if (val >= 14 && val <= 23) return "dirt";

  // water 24..33
  else if (val >= 24 && val <= 33) return "water";

  else if (val == 34) return "house1";
  else if (val == 35) return "house2";
  else if (val == 36) return "well";

  // road interior (37) + road variants 48..56
  else if (val == 37 || (val >= 48 && val <= 56)) return "road";

  else if (val == 38) return "crops";
  else if (val == 39) return "grassCrop";
  else if (val == 40) return "grassBerry";
  else if (val == 41) return "spawn";
  else if (val == 42) return "clayOven";
  else if (val == 43) return "storage";
  else if (val == 44) return "grassWood";
  else if (val == 45) return "grassRock";
  else if (val == 46) return "rock";
  else if (val == 47) return "construction";
  else if (val >= 57 && val <= 65) return "woodWall";
  else if (val == 66) return "wall_door";
  else if (val == 67) return "woodWall_door";
  else if (val >= 68 && val <= 77) return "fort_floor";
  else if (val == 78) return "tower";
  else if (val == 79) return "prison";
  else if (val == 80) return "bank";
  else if (val >= 81 && val <= 86) return "dirt";
  else if (val >= 87 && val <= 92) return "road";
  else if (val >= 93 && val <= 98) return "fort_floor";
  else if (val >= 99 && val <= 106) return "grass";
  else if (val == 107) return "catapult";
  else if (val >= 108 && val <= 120) return "dark_grass";
  else if (val == 121) return "goldOre";

  return null;
}


export function gridPos(x, y){
    return {
        x: Math.floor(x % WORLD_DIMENSIONX),
        y: Math.floor(y % WORLD_DIMENSIONY)
    };
}

export function distanceBetween(x1,y1,x2,y2){
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

export function handleGridXY(x,y,itemX,itemY){
    let finalX, finalY;
    if(itemX%2 == 1){
        finalX = x - x%SQUARESIZE + SQUARESIZE/2
    }
    else{
        finalX = x - x%SQUARESIZE + SQUARESIZE/2
    }
    if(itemY%2 == 1){
        finalY = y - y%SQUARESIZE + SQUARESIZE/2
    }
    else{
        finalY = y - y%SQUARESIZE + SQUARESIZE/2
    }

    return [finalX,finalY]
}

function parseAlertColor(color = "#ffffff") {
    const hex = String(color || "").trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
    };
}

function isErrorAlert(message = "", color = "#ffffff") {
    const upper = String(message || "").toUpperCase();
    const isErrorMessage =
        upper.includes("ERROR")
        || upper.includes("FAILED")
        || upper.includes("INVALID")
        || upper.includes("COULD NOT")
        || upper.includes("MISSED")
        || upper.includes("REQUIRED")
        || upper.includes("CANNOT");

    const parsed = parseAlertColor(color);
    const isErrorColor = !!parsed
        && parsed.r >= 180
        && parsed.r > (parsed.g * 1.14)
        && parsed.r > (parsed.b * 1.14);

    return isErrorMessage || isErrorColor;
}

function isGoodAlert(message = "", color = "#ffffff") {
    const upper = String(message || "").toUpperCase();
    if (
        upper.startsWith("+")
        || upper.includes("BOUGHT")
        || upper.includes("STOCKED")
        || upper.includes("STARTED")
        || upper.includes("BUILT")
        || upper.includes("RECRUITED")
        || upper.includes("REWARD")
        || upper.includes("GAIN")
        || upper.includes("LEVEL UP")
        || upper.includes("SAVED")
        || upper.includes("DEPLOYED")
        || upper.includes("SURVIVED")
        || upper.includes("PICKED")
        || upper.includes("UNLOCK")
        || upper.includes("COMPLETE")
        || upper.includes("COMPLETED")
        || upper.includes("RECOVERED")
    ) {
        return true;
    }

    const parsed = parseAlertColor(color);
    if (!parsed || upper.includes("BEGIN PLACING")) return false;
    return parsed.g >= 170 && parsed.g > (parsed.r * 1.03) && parsed.g >= (parsed.b * 0.9);
}

export function getAlertTone(message = "", color = "#ffffff") {
    if (isErrorAlert(message, color)) return "bad";
    if (isGoodAlert(message, color)) return "good";
    return "neutral";
}

function maybePlayAlertSound(targetScene, message, color) {
    const tone = getAlertTone(message, color);
    const soundKey = tone === "bad"
        ? "sfx_ui_error"
        : tone === "good"
            ? "sfx_ui_notification_good"
            : "sfx_ui_notification";
    if (!targetScene?.cache?.audio?.exists?.(soundKey)) return;

    const volume = tone === "bad" ? 0.24 : tone === "good" ? 0.23 : 0.22;
    const rate = tone === "bad"
        ? 0.94 + Math.random() * 0.09
        : tone === "good"
            ? 0.98 + Math.random() * 0.05
            : 0.97 + Math.random() * 0.06;

    targetScene.sound?.play?.(soundKey, {
        volume,
        rate,
    });
}

export function showAlert(scene, message, color = '#ffffff', duration = 1400) {
    const uiScene = scene?.uiScene
        || scene?.scene?.get?.('GameUIScene')
        || scene;

    if (uiScene && uiScene !== scene && typeof uiScene.showAlertMessage === 'function') {
        return uiScene.showAlertMessage(message, color, duration);
    }

    if (uiScene && typeof uiScene.showAlertMessage === 'function') {
        return uiScene.showAlertMessage(message, color, duration);
    }

    maybePlayAlertSound(uiScene, message, color);

    const alert = uiScene.add.text(
        uiScene.cameras.main.width / 2, 0, message,
        { fontSize: '24px', fill: color, stroke: '#000000', strokeThickness: 3 }
    )
    .setOrigin(0.5, 0)
    .setScrollFactor(0)
    .setDepth(UIDEPTH);

    const tweenScale = Number(uiScene?.tweens?.timeScale);
    const unscaledTweenTimeScale = Number.isFinite(tweenScale) && tweenScale > 0 ? 1 / tweenScale : 1;

    uiScene.tweens.add({
        targets: alert,
        y: 50,
        alpha: 0,
        duration: duration,
        timeScale: unscaledTweenTimeScale,
        ease: 'Cubic.easeOut',
        onComplete: () => alert.destroy()
    });

    return alert;
}

export function intDiv(n,d){
    return Math.floor(n/d)
}

export function clearTaskPlusTimer(sprite){
    if(sprite.task){
        sprite.task = null;
    }
    if(sprite.timer){
        sprite.timer.remove(false);
        sprite.timer = null;
    }
}

export const gridColors = {
    water:  0x156c99,
    wall: 0x808080,
    woodWall: 0x65350f,
    wall_door: 0x5a5a5a,
    woodWall_door: 0x2e1503,
    dirt:   0x4c2b18,
    grass:  0x33cc33,
    dark_grass: 0x0b6b5c,
    house1: 0x8b0000,
    house2: 0x006400,
    road:   0x555555,
    well:   0xADD8E6,
    grassCrop: 0x33cc33,
    grassBerry:0x33cc33,
    grassWood: 0x33cc33,
    grassRock: 0x33cc33,
    spawn:  0x333333,
    storage:0x7d4900,
    tower: 0x2f7fe6,
    clayOven: 0xb64536,
    pine: 0x006400,
    rock: 0x5a682b,
    goldOre: 0xb6941f,
    catapult: 0x8b5b2b,
    crops: 0xFCF55F,
    fort_floor: 0x777777,
};

export const GHOST_ITEM_ICONS = {
  food: '🍖',
  clean_water: '💧',
  unclean_water: '💧',
  wood: '🌲',
  stone: '🗿',
  crop: '🌾',
  seedCrop: '🌱',
  seedBerry: '🍒',
};


export const colorFor = (cell) => {
    const type = Array.isArray(cell) ? TILE_MAP(cell[1]) : TILE_MAP(cell);
    return gridColors[type] || 0xffffff;
};

export function showGhostText(scene, x, y, text, teamNumber, isCrit = false, isMiss = false, colorGiven = false) {
    let color;

    if(colorGiven){
      color = colorGiven
    } else if (isMiss) {
        color = '#888888'; // Gray for MISS
    } else if (teamNumber === 1) {
        color = '#44ff44'; // Green for player/team 0 hit
    } else {
        color = isCrit ? '#ff4444' : '#ffffff'; // Red or white for enemies
    }

    const ghost = scene.add.text(x, y, text, {
        fontSize: '16px',
        fill: color,
        fontFamily: 'Bungee',
        stroke: '#000000',
        strokeThickness: 2
    }).setDepth(1000).setOrigin(0.5);

    scene.tweens.add({
        targets: ghost,
        y: y - 20,
        alpha: 0,
        duration: 600,
        onComplete: () => ghost.destroy()
    });

} 

// --- Enemy building hover panel tuning (Bank + Prison) -----------------
export const ENEMY_BUILDING_HOVER_UI = {
  // how far above the sprite's TOP the panel sits (bigger = higher)
  PANEL_Y_OFFSET: 0,

  // text offsets *within* the panel (relative to panel center)
  LINE1_DY: -9,
  LINE2_DY: 6,
};

export function createBubbleText({
    scene,
    target,
    text,
    textColor = '#ffffff',
    bgColor = 'rgba(0,0,0,0.6)',
    fontSize = 10,
    duration = 1200,
    floatOffset = 18,
    fadeDuration = 350
}) {
    if (!scene || !target) return;

    // Base text (world-space)
    const label = scene.add.text(target.x, target.y - 20, text, {
        fontSize: `${fontSize}px`,
        fontFamily: 'Bungee',
        color: textColor,
        stroke: '#000000',
        strokeThickness: 2
    })
    .setDepth(10000)
    .setOrigin(0.5)
    .setScrollFactor(1, 1);   // 🔹 world, not UI

    // Background auto-sized to text
    const padding = 4;
    const bg = scene.add.rectangle(
        label.x, label.y,
        label.width + padding * 2,
        label.height + padding * 2,
        Phaser.Display.Color.HexStringToColor(bgColor).color,
        1
    )
    .setOrigin(0.5)
    .setDepth(9999)
    .setScrollFactor(1, 1);   // 🔹 world, not UI

    const container = { label, bg, target };

    // Follow target
    container.update = () => {
        if (!container.target || !container.label.active || !container.bg.active) return;

        const newX = container.target.x;
        const newY = container.target.y - floatOffset;

        container.label.x = newX;
        container.label.y = newY;
        container.bg.x    = newX;
        container.bg.y    = newY;
    };

    scene.events.on('update', container.update);

    // Float then fade
    scene.tweens.add({
        targets: [label, bg],
        y: label.y - 15,
        duration,
        ease: 'Linear',
        onComplete: () => {
            scene.tweens.add({
                targets: [label, bg],
                alpha: 0,
                duration: fadeDuration,
                onComplete: () => {
                    label.destroy();
                    bg.destroy();
                    scene.events.off('update', container.update);
                }
            });
        }
    });

    return container;
}

//parcel
// ---- Parcel/Contract system (add to constants.js) ----
export const PARCEL = {
  SIZE: 25,
  // Main island top-left (world is 100x100; main parcel at 37,37 → 25 down/right)
  MAIN_ORIGIN: { x: 37, y: 37 },
  // Contract parcels sit one parcel away from main island; add a gap so UI isn't touching
  GAP_TILES: 0, // distance between parcel edges
  // World-space slot layout: W / S / E around the main parcel (N reserved for fort)
  SLOTS: {
    W: { dx: -25, dy: 0 },
    S: { dx: 0, dy: 25 },
    E: { dx: 25, dy: 0 },
  },
};

export const PRESSURE_CONTRACT = {
  DIFFICULTY_MIN: 1,
  DIFFICULTY_MAX: 3,

  // how many spawners per difficulty (1..3)
  SPAWNERS_BY_DIFFICULTY: { 1: 1, 2: 2, 3: 3 },

  // total raiders quota per spawner at stage 1 (scaled with stageIndex later)
  BASE_QUOTA_PER_SPAWNER: 3,

  // spawn interval (ms) drops as stage increases, down to MIN_INTERVAL_MS.
  BASE_INTERVAL_MS: 4000,
  MIN_INTERVAL_MS: 1500,
  INTERVAL_DROP_PER_STAGE_MS: 250, // e.g., stage 5 => 4000 - 1000
};

// ---- Contract economy (costs + rewards) ----
export const CONTRACT_ECON = {
  STAGE_MULT: 0.25,

  COST_BASE: {
    FARM: 150,
    FOREST: 150,
    ROCK: 125,
    MILITIA: 200,
    PRESSURE: 120,
  },

  PRESSURE_PER_DIFFICULTY: 60,

  PRESSURE_BONUS_BASE: 150,
  PRESSURE_BONUS_PER_DIFFICULTY: 75,

  // ✅ deterministic raider pay (matches raider.killReward=40)
  KILL_PAY_BASE: 40,
};

export function getContractStage(scene) {
  // ✅ preferred: global stage state
  if (StageState?.stageIndex != null) return StageState.stageIndex;

  // fallback if you ever run without StageState wired
  if (!scene.contractStage) scene.contractStage = 1;
  return scene.contractStage;
}

export function estimatePressureContract(scene, difficulty = 1) {
  const econ = estimatePressureContractEconomy(scene, difficulty);
  return {
    stage: getContractStage(scene),
    spawners: econ.spawnerCount,
    quotaPerSpawner: econ.quotaPerSpawner,
    totalKills: econ.totalPlannedEnemies,
    killPay: Math.round(econ.killTotal / Math.max(1, econ.totalPlannedEnemies)),
    killTotal: econ.killTotal,
    bonus: econ.bonus,
    cost: econ.cost,
    gross: econ.gross,
    net: econ.net,
  };
}

export function removeFromArray(arr, obj) {
  if (!Array.isArray(arr)) return;
  const i = arr.indexOf(obj);
  if (i !== -1) arr.splice(i, 1);
}

export function calcStageScaled(value, stage, mult) {
  const m = 1 + mult * Math.max(0, stage - 1);
  return Math.round(value * m);
}

export function calcContractCost(scene, type, difficulty = 1) {
  return getContractMoneyCost(scene, type, difficulty);
}

export function calcPressureBonus(scene, difficulty = 1) {
  return getPressureClearBonus(scene, difficulty);
}

export const RESOURCE_PARCEL = {
  // how much water "spots" to scatter (percent of tiles)
  WATER_SPOT_PCT: 0.06, // 6%
  // min distance from parcel edge to place water so you don’t create open-water borders
  WATER_EDGE_BUFFER: 2,
};
