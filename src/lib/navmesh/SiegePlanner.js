// SiegePlanner.js
// Uses RegionSystem's cached breach graph to choose wall/door chains to break.
// Thick walls are represented as weighted region edges whose cost is the number
// of wall tiles in a chain through a connected wall component. RegionSystem can
// expose many breach options for the same region pair; the planner keeps wall
// break count primary and uses tile distance only as a tie-breaker.

export class SiegePlanner {
  constructor(opts) {
    this.squareSize = opts.squareSize; // SQUARESIZE
    this.enemyNavGrid = opts.enemyNavGrid; // Map.enemyNavGrid
    this.isBreachableTile = opts.isBreachableTile; 
    this.regionSystem = opts.regionSystem; // e.g. Map.enemyRegionSystem
    // (x,y) => true if tile is wall or door (for raiders)
    this.isHardBlockedTile = opts.isHardBlockedTile || (() => false);
    // (x,y) => true if should be treated as impossible even for breach search (optional)
  }

  // Return tiles (grid coords) raiders should break to get from startWorld -> any target tile.
  // targets = array of {x,y} grid tiles (usually POI perimeter tiles)
  planBreach(startWorldX, startWorldY, targets) {
    const rs = this.regionSystem;
    if (!rs?.getRegionIdForWorldPoint || !rs?.regionGraph) {
      return null;
    }

    const key = (a, b) => `${Math.min(a, b)}|${Math.max(a, b)}`;

    const startPoint = this._resolveWalkableStartPoint(startWorldX, startWorldY);
    if (!startPoint) return null;

    const startTile = this._worldToTile(startPoint.x, startPoint.y);
    const startRid = this._strictRegionIdForWorldPoint(startPoint.x, startPoint.y);
    if (startRid === -1) return null;

    // Collect unique target regions
    const targetRegions = new Set();
    for (const t of targets) {
      for (const rid of this._regionsForTargetTile(t.x, t.y)) {
        targetRegions.add(rid);
      }
    }
    if (targetRegions.size === 0) return null;

    // If blocked perimeter sampling also saw the outside/start region, keep looking
    // for a non-start goal region instead of declaring the target reachable.
    const goalRegions = new Set(targetRegions);
    if (goalRegions.size > 1) goalRegions.delete(startRid);
    if (goalRegions.size === 0) return [];

    // ---- Dijkstra over weighted breach edges ----
    const open = [startRid];
    const dist = new Map([[startRid, 0]]);
    const prev = new Map([[startRid, null]]);
    const prevEdge = new Map();
    const closed = new Set();

    let goal = null;
    while (open.length) {
      open.sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity));
      const r = open.shift();
      if (closed.has(r)) continue;
      closed.add(r);

      if (goalRegions.has(r)) { goal = r; break; }

      const neigh = rs.regionGraph.get(r);
      if (!neigh) continue;

      for (const n of neigh) {
        if (closed.has(n)) continue;
        const edge = this._chooseBreachOption(rs, key(r, n), r, n, startTile, targets);
        if (!edge?.breachTiles?.length) continue;

        const cost = Math.max(1, Number(edge.planCost || edge.cost || edge.breachTiles.length || 1));
        const nextDist = (dist.get(r) ?? Infinity) + cost;
        if (nextDist >= (dist.get(n) ?? Infinity)) continue;

        dist.set(n, nextDist);
        prev.set(n, r);
        prevEdge.set(n, { edge, fromRegion: r, toRegion: n });
        open.push(n);
      }
    }

    if (goal == null) {
      return null;
    }

    // Reconstruct weighted wall-chain edges: start region -> ... -> goal region.
    const edgePath = [];
    for (let cur = goal; cur !== startRid; cur = prev.get(cur)) {
      const step = prevEdge.get(cur);
      if (!step) return null;
      edgePath.push(step);
    }
    edgePath.reverse();

    const breachTiles = [];
    for (const step of edgePath) {
      const edge = step.edge;
      const forward =
        step.fromRegion === edge.fromRegion &&
        step.toRegion === edge.toRegion;
      const tiles = forward ? edge.breachTiles : [...edge.breachTiles].reverse();

      for (const tile of tiles) {
        if (!tile) continue;
        if (!this.isBreachableTile(tile.x, tile.y)) continue;
        if (this.isHardBlockedTile(tile.x, tile.y)) continue;
        breachTiles.push({ x: tile.x, y: tile.y });
      }
    }

    return breachTiles.length ? this._uniqTiles(breachTiles) : null;
  }

  // Build POI perimeter target tiles (grid coords) for a footprint rectangle (x,y,lenX,lenY).
  static buildPerimeterTargets(x, y, lenX, lenY, gridW, gridH) {
    const targets = [];
    // ring around the footprint
    for (let ty = y - 1; ty <= y + lenY; ty++) {
      for (let tx = x - 1; tx <= x + lenX; tx++) {
        const inside = (tx >= x && tx < x + lenX && ty >= y && ty < y + lenY);
        if (inside) continue;
        if (tx < 0 || ty < 0 || tx >= gridW || ty >= gridH) continue;
        targets.push({ x: tx, y: ty });
      }
    }
    return targets;
  }

  _worldToTile(wx, wy) {
    return {
      x: Math.floor(wx / this.squareSize),
      y: Math.floor(wy / this.squareSize),
    };
  }

  _worldCenterOfTile(tx, ty) {
    return {
      x: tx * this.squareSize + this.squareSize / 2,
      y: ty * this.squareSize + this.squareSize / 2,
    };
  }

  _meshContainsWorldPoint(wx, wy) {
    const navMesh = this.regionSystem?.navMesh;
    if (!navMesh?.isPointInMesh) return true;
    return !!navMesh.isPointInMesh({ x: wx, y: wy });
  }

  _strictRegionIdForWorldPoint(wx, wy) {
    if (!this._meshContainsWorldPoint(wx, wy)) return -1;
    return this.regionSystem?.getRegionIdForWorldPoint?.(wx, wy) ?? -1;
  }

  _regionIdForWalkableTile(tx, ty) {
    if (!this._inBounds(tx, ty) || this.enemyNavGrid?.[ty]?.[tx] !== 1) return -1;
    const w = this._worldCenterOfTile(tx, ty);
    return this._strictRegionIdForWorldPoint(w.x, w.y);
  }

  _resolveWalkableStartPoint(wx, wy) {
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) return null;
    const tile = this._worldToTile(wx, wy);
    const center = (tx, ty) => this._worldCenterOfTile(tx, ty);

    if (this._regionIdForWalkableTile(tile.x, tile.y) !== -1) {
      return center(tile.x, tile.y);
    }

    let best = null;
    let bestDist = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = tile.x + dx;
        const ny = tile.y + dy;
        if (this._regionIdForWalkableTile(nx, ny) === -1) continue;
        const candidate = center(nx, ny);
        const dist = Math.hypot(wx - candidate.x, wy - candidate.y);
        if (dist < bestDist) {
          best = candidate;
          bestDist = dist;
        }
      }
    }

    return bestDist <= this.squareSize * 0.8 ? best : null;
  }

  // Targets are usually perimeter tiles. Walkable target tiles map directly.
  // Blocked tiles may be walls, so include every adjacent walkable region and
  // let the planner ignore the start-side region when a deeper goal exists.
  _regionsForTargetTile(tx, ty) {
    const regions = new Set();
    if (!this._inBounds(tx, ty)) return regions;

    const directRid = this._regionIdForWalkableTile(tx, ty);
    if (directRid !== -1) {
      regions.add(directRid);
      return regions;
    }

    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const rid = this._regionIdForWalkableTile(tx + dx, ty + dy);
      if (rid !== -1) regions.add(rid);
    }

    return regions;
  }

  _orientedTilesForOption(option, fromRegion, toRegion) {
    if (!option?.breachTiles?.length) return null;
    const forward =
      fromRegion === option.fromRegion &&
      toRegion === option.toRegion;
    return forward ? option.breachTiles : [...option.breachTiles].reverse();
  }

  _tileManhattan(a, b) {
    if (!a || !b) return 0;
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  _nearestTargetTileDistance(tile, targets) {
    if (!tile || !Array.isArray(targets) || !targets.length) return 0;
    let best = Infinity;
    for (const target of targets) {
      const d = this._tileManhattan(tile, target);
      if (d < best) best = d;
    }
    return Number.isFinite(best) ? best : 0;
  }

  _chooseBreachOption(regionSystem, edgeKey, fromRegion, toRegion, startTile, targets) {
    const options = regionSystem.breachEdgeOptions?.get?.(edgeKey) ?? [];
    const fallback = regionSystem.breachEdges?.get?.(edgeKey);
    const candidates = options.length ? options : (fallback ? [fallback] : []);
    if (!candidates.length) return null;

    let best = null;
    let bestScore = Infinity;
    for (const option of candidates) {
      const tiles = this._orientedTilesForOption(option, fromRegion, toRegion);
      if (!tiles?.length) continue;

      const first = tiles[0];
      const last = tiles[tiles.length - 1];
      const wallCost = Math.max(1, Number(option.cost || tiles.length || 1));
      const tieBreakDistance =
        this._tileManhattan(startTile, first) +
        this._nearestTargetTileDistance(last, targets);
      const score = wallCost + Math.min(999, tieBreakDistance) * 0.001;

      if (score >= bestScore) continue;
      bestScore = score;
      best = {
        ...option,
        fromRegion,
        toRegion,
        breachTiles: tiles,
        planCost: score,
      };
    }

    return best;
  }

  _inBounds(x, y) {
    return y >= 0 && y < this.enemyNavGrid.length && x >= 0 && x < this.enemyNavGrid[0].length;
  }

  _uniqTiles(arr) {
    const out = [];
    const seen = new Set();
    for (const t of arr) {
      const k = `${t.x},${t.y}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
    return out;
  }
}
