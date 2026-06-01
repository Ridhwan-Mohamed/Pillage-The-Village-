// src/parcel_system/ParcelTerrain.js
// Terrain painters for contract parcels.

import { PARCEL_SIZE } from "./ParcelConfig.js";

function randInt(rng, a, b) { // inclusive
  return a + Math.floor(rng() * (b - a + 1));
}

function key(x, y) { return `${x},${y}`; }

function macroKey(mx, my) { return `${mx},${my}`; }

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const MACRO_DIRS = Object.freeze([
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
]);

function rotateDir(dir, clockwise) {
  if (!dir) return null;
  return clockwise
    ? { dx: -dir.dy, dy: dir.dx }
    : { dx: dir.dy, dy: -dir.dx };
}

/**
 * Build clustered lakes from 2x2 macro-chunks.
 * Returns a Set of "x,y" local coords.
 */
function buildPondCells({ size, rng, edgeBuffer = 2, pondTiles = 30 }) {
  const min = edgeBuffer;
  const max = size - 1 - edgeBuffer;
  const availableTiles = max - min + 1;
  const macroW = Math.floor(availableTiles / 2);
  const macroH = Math.floor(availableTiles / 2);
  if (macroW <= 0 || macroH <= 0) return new Set();

  const requestedPondTiles = Math.max(0, Number(pondTiles || 0));
  if (requestedPondTiles <= 0) return new Set();
  const chunkTarget = Math.max(1, Math.round(requestedPondTiles / 4));
  const bodyCount = chunkTarget >= 7 && rng() < 0.38 ? 2 : 1;
  const bodyTargets = [];

  if (bodyCount === 2) {
    const firstMin = Math.max(3, Math.floor(chunkTarget * 0.42));
    const firstMax = Math.max(firstMin, Math.min(chunkTarget - 3, Math.ceil(chunkTarget * 0.62)));
    const first = randInt(rng, firstMin, firstMax);
    bodyTargets.push(first, Math.max(1, chunkTarget - first));
  } else {
    bodyTargets.push(chunkTarget);
  }

  const chunks = [];
  const occupied = new Map();

  const inMacroBounds = (mx, my) => mx >= 0 && my >= 0 && mx < macroW && my < macroH;
  const chunkTooCloseToOtherBody = (mx, my, bodyId) => {
    for (const other of chunks) {
      if (other.bodyId === bodyId) continue;
      const dx = Math.abs(mx - other.mx);
      const dy = Math.abs(my - other.my);
      if (dx <= 1 && dy <= 1) return true;
    }
    return false;
  };
  const canPlaceChunk = (mx, my, bodyId) =>
    inMacroBounds(mx, my) &&
    !occupied.has(macroKey(mx, my)) &&
    !chunkTooCloseToOtherBody(mx, my, bodyId);

  const addChunk = (mx, my, bodyId) => {
    const chunk = { mx, my, bodyId };
    chunks.push(chunk);
    occupied.set(macroKey(mx, my), chunk);
    return chunk;
  };

  const findStart = (bodyId) => {
    const marginX = Math.max(0, Math.floor(macroW * 0.18));
    const marginY = Math.max(0, Math.floor(macroH * 0.18));

    for (let attempt = 0; attempt < 80; attempt++) {
      const mx = randInt(rng, marginX, Math.max(marginX, macroW - 1 - marginX));
      const my = randInt(rng, marginY, Math.max(marginY, macroH - 1 - marginY));
      if (canPlaceChunk(mx, my, bodyId)) return { mx, my };
    }

    const candidates = [];
    for (let my = 0; my < macroH; my++) {
      for (let mx = 0; mx < macroW; mx++) {
        if (canPlaceChunk(mx, my, bodyId)) candidates.push({ mx, my });
      }
    }
    if (!candidates.length) return null;
    return candidates[randInt(rng, 0, candidates.length - 1)];
  };

  const growBody = (bodyId, targetCount) => {
    const start = findStart(bodyId);
    if (!start) return 0;

    const body = [addChunk(start.mx, start.my, bodyId)];
    let lastDir = MACRO_DIRS[randInt(rng, 0, MACRO_DIRS.length - 1)];
    let active = body[0];
    let misses = 0;

    while (body.length < targetCount && misses < 120) {
      const base = rng() < 0.62
        ? active
        : body[randInt(rng, 0, body.length - 1)];
      const preferred = rng() < 0.58 && lastDir ? [lastDir] : [];
      const turns = lastDir
        ? [rotateDir(lastDir, true), rotateDir(lastDir, false)].filter(Boolean)
        : [];
      const directions = shuffleInPlace([
        ...preferred,
        ...turns,
        ...MACRO_DIRS,
      ], rng);

      let placed = null;
      const seenDirs = new Set();
      for (const dir of directions) {
        const dirKey = `${dir.dx},${dir.dy}`;
        if (seenDirs.has(dirKey)) continue;
        seenDirs.add(dirKey);

        const mx = base.mx + dir.dx;
        const my = base.my + dir.dy;
        if (!canPlaceChunk(mx, my, bodyId)) continue;

        placed = addChunk(mx, my, bodyId);
        body.push(placed);
        active = placed;
        lastDir = dir;
        break;
      }

      if (placed) {
        misses = 0;
      } else {
        active = body[randInt(rng, 0, body.length - 1)];
        lastDir = MACRO_DIRS[randInt(rng, 0, MACRO_DIRS.length - 1)];
        misses++;
      }
    }

    return body.length;
  };

  let made = 0;
  for (let bodyId = 0; bodyId < bodyTargets.length; bodyId++) {
    made += growBody(bodyId, bodyTargets[bodyId]);
  }

  // If a separated body could not fit, put the remaining coverage into the
  // existing bodies without violating the same inter-body gap rule.
  let refillMisses = 0;
  while (made < chunkTarget && chunks.length && refillMisses < 120) {
    const base = chunks[randInt(rng, 0, chunks.length - 1)];
    const dirs = shuffleInPlace(MACRO_DIRS.slice(), rng);
    let placed = false;
    for (const dir of dirs) {
      const mx = base.mx + dir.dx;
      const my = base.my + dir.dy;
      if (!canPlaceChunk(mx, my, base.bodyId)) continue;
      addChunk(mx, my, base.bodyId);
      made++;
      placed = true;
      break;
    }
    refillMisses = placed ? 0 : refillMisses + 1;
  }

  const cells = new Set();
  for (const chunk of chunks) {
    const lx = min + chunk.mx * 2;
    const ly = min + chunk.my * 2;
    cells.add(key(lx, ly));
    cells.add(key(lx + 1, ly));
    cells.add(key(lx, ly + 1));
    cells.add(key(lx + 1, ly + 1));
  }

  return cells;
}

export function paintResourceParcel({
  origin,
  size = PARCEL_SIZE,
  rng,
  setGroundRect,
  setWater,
  groundType = "dirt",
  // pond controls
  pondTiles = 30,
  edgeBuffer = 2,
}) {
  const plan = buildResourceParcelTerrainPlan({
    origin,
    size,
    rng,
    groundType,
    pondTiles,
    edgeBuffer,
  });

  // one-shot fill (NO per-tile loops)
  setGroundRect(origin.x, origin.y, size, size, groundType);

  for (const cell of plan.cells) {
    if (cell.tileType !== "water") continue;
    setWater(cell.x, cell.y);
  }

  return plan;
}

export function buildResourceParcelTerrainPlan({
  origin,
  size = PARCEL_SIZE,
  rng,
  groundType = "dirt",
  pondTiles = 30,
  edgeBuffer = 2,
}) {
  const pond = buildPondCells({ size, rng, edgeBuffer, pondTiles });
  const cells = [];
  const tileTypeByKey = new Map();

  for (let ly = 0; ly < size; ly++) {
    for (let lx = 0; lx < size; lx++) {
      const tileType = pond.has(key(lx, ly)) ? "water" : groundType;
      const x = origin.x + lx;
      const y = origin.y + ly;
      const cell = { x, y, lx, ly, tileType };
      cells.push(cell);
      tileTypeByKey.set(key(x, y), tileType);
    }
  }

  return {
    origin: { x: origin.x, y: origin.y },
    size,
    groundType,
    cells,
    pondCells: Array.from(pond).map((kk) => {
      const [lx, ly] = kk.split(",").map(Number);
      return { x: origin.x + lx, y: origin.y + ly, lx, ly, tileType: "water" };
    }),
    tileTypeByKey,
  };
}

export function paintWaterRect({ origin, size = PARCEL_SIZE, setWaterRect }) {
  setWaterRect(origin.x, origin.y, size, size);
}
