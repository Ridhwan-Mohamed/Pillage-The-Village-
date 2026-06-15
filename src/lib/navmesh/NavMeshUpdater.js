// navmeshUpdater.js
import { SQUARESIZE, WORLD_DIMENSIONX, WORLD_DIMENSIONY } from '../../constants.js';
import { NavMesh } from './navmesh.js';
import { buildPolysFromGridMap } from './map-parsers/build-polys-from-grid-map.js';
import { bindDebugHotkey } from '../../debug/DebugHotkeys.js';

export class NavMeshUpdater {
    constructor(navMesh, scene, opts) {
        this.navMesh = navMesh;
        this.scene = scene;
        this.debugGraphics = [];
        this.debugEnabled = false;

        this._toggleKey = opts.toggleKey ?? "M";
        this._fillColor = opts.fillColor ?? 0x00ff00;
        this._fillAlpha = opts.fillAlpha ?? 0.2;
        this._lineColor = opts.lineColor ?? 0xffffff;
        this._lineAlpha = opts.lineAlpha ?? 0.4;

        this._setupToggleKey();
    }

    _setupToggleKey() {
        this._onToggle = () => {
            this.debugEnabled = !this.debugEnabled;
            if (this.debugEnabled) this.drawDebug();
            else this.clearDebug();
        };
        this._debugHotkey = bindDebugHotkey(this.scene, this._toggleKey, this._onToggle);
    }

    destroy() {
        // remove key listener
        this._debugHotkey?.destroy?.();
        this._debugHotkey = null;
        this._onToggle = null;
        // kill any drawn graphics
        this.clearDebug();
    }

    drawDebug() {
        this.clearDebug();
    
        const drawnPortals = new Set(); // Prevent double-drawing of portals
        const polygons = this.navMesh.getPolygons ? this.navMesh.getPolygons() : this.navMesh.navPolygons;
    
        for (const polygon of polygons) {
            const graphics = this.scene.add.graphics();
            graphics.lineStyle(1, 0xffffff, 0.4);
            graphics.fillStyle(0x00ff00, 0.2);
            graphics.setDepth(100);
    
            // Draw polygon shape
            const [first, ...rest] = polygon.polygon.points;
            graphics.beginPath();
            graphics.moveTo(first.x, first.y);
            for (const point of rest) {
                if(point.x < 0 || point.x > WORLD_DIMENSIONX*SQUARESIZE || 
                    point.y < 0 || point.y > WORLD_DIMENSIONY*SQUARESIZE
                ) console.log(point)
                graphics.lineTo(point.x, point.y);
            }
            graphics.lineTo(first.x, first.y);
            graphics.strokePath();
            graphics.fillPath();
    
            this.debugGraphics.push(graphics);
    
            // --- Draw portals (black thick lines) ---
            for (const portal of polygon.portals) {
                const key = `${portal.start.x},${portal.start.y}-${portal.end.x},${portal.end.y}`;
                const reverseKey = `${portal.end.x},${portal.end.y}-${portal.start.x},${portal.start.y}`;
                if (drawnPortals.has(key) || drawnPortals.has(reverseKey)) continue;
    
                const portalGraphics = this.scene.add.graphics();
                portalGraphics.lineStyle(3, 0x000000, 1); // Thick black line
                portalGraphics.beginPath();
                portalGraphics.moveTo(portal.start.x, portal.start.y);
                portalGraphics.lineTo(portal.end.x, portal.end.y);
                portalGraphics.strokePath();
                portalGraphics.setDepth(101);
    
                drawnPortals.add(key);
                this.debugGraphics.push(portalGraphics);
            }
    
            // --- Draw centroid neighbor connections ---
            for (const neighbor of polygon.neighbors) {
                if (!neighbor) continue;
                
                const neighborGraphics = this.scene.add.graphics();
                neighborGraphics.lineStyle(2, 0x000000, 0.4); // Yellow faint line for neighbor connection
                neighborGraphics.beginPath();
                neighborGraphics.moveTo(polygon.centroid.x, polygon.centroid.y);
                neighborGraphics.lineTo(neighbor.centroid.x, neighbor.centroid.y);
                neighborGraphics.strokePath();
                neighborGraphics.setDepth(99);
    
                this.debugGraphics.push(neighborGraphics);
            }

        }
    }

    clearDebug() {
        for (const g of this.debugGraphics) {
            g.destroy();
        }
        this.debugGraphics = [];
    }

    /**
     * Block a single tile.
     */
    blockTile(x, y) {
        return this.blockTiles([{ x, y }]);
    }

    /**
     * Block multiple tiles at once (for multi-tile walls).
     */
    blockTiles(tileCoords, addTiles = false) {
        const cleanTileCoords = (Array.isArray(tileCoords) ? tileCoords : [])
            .filter((tile) => Number.isFinite(tile?.x) && Number.isFinite(tile?.y));
        if (!cleanTileCoords.length) {
            return { removedPolyIds: [], addedPolyIds: [], neighborPolyIds: [] };
        }

        const polygons = this.navMesh.getPolygons ? this.navMesh.getPolygons() : this.navMesh.navPolygons;
        const parcelTag = this.scene?.resolveParcelTagForTiles?.(cleanTileCoords) ?? null;
        const tileRects = cleanTileCoords.map(({ x, y }) => ({
            x: x * SQUARESIZE,
            y: y * SQUARESIZE,
            w: SQUARESIZE,
            h: SQUARESIZE
        }));
    
        // Step 1: Find affected polygons
        const affectedPolys = polygons.filter(poly => {
            if (!this._polyMatchesParcelTag(poly, parcelTag)) {
                return false;
            }

            return tileRects.some(tileRect => addTiles
                ? this._polygonTouchesRect(poly.polygon.points, tileRect)
                : this._polygonIntersectsRect(poly.polygon.points, tileRect)
            );
        });
    
        if (!affectedPolys.length && !addTiles) {
            return { removedPolyIds: [], addedPolyIds: [], neighborPolyIds: [] };
        }
    
        // Step 2: Gather unaffected neighbors
        // Step 3: Find bounds
        const bounds = this._getPatchWorldBounds(affectedPolys, tileRects);
    
        // Step 4: Build local nav grid
        const gridWidth = Math.ceil(bounds.w / SQUARESIZE);
        const gridHeight = Math.ceil(bounds.h / SQUARESIZE);
        const navGrid = Array.from({ length: gridHeight }, () => Array(gridWidth).fill(0)); // All blocked initially        
    
        // Step 5: Mark blocked tiles in nav grid
        for (let ty = 0; ty < gridHeight; ty++) {
            for (let tx = 0; tx < gridWidth; tx++) {
                const worldX = bounds.x + tx * SQUARESIZE + SQUARESIZE / 2;
                const worldY = bounds.y + ty * SQUARESIZE + SQUARESIZE / 2;
                for (const poly of affectedPolys) {
                    if (poly.contains({ x: worldX, y: worldY })) {
                        navGrid[ty][tx] = 1;
                        break;
                    }
                }
            }
        }
        //mark tile coords as 0
        const TILE_COORD_VAL = addTiles? 1 : 0;
        for (const { x, y } of cleanTileCoords) {
            const localX = Math.floor((x * SQUARESIZE - bounds.x) / SQUARESIZE);
            const localY = Math.floor((y * SQUARESIZE - bounds.y) / SQUARESIZE);
            if (navGrid[localY] && navGrid[localY][localX] !== undefined) {
                navGrid[localY][localX] = TILE_COORD_VAL;
            }
        }

        // Step 6: Create new polys from nav grid (simple rectangles)
        const newPolygons = this._extractPolygonsFromGrid(navGrid, bounds.x, bounds.y, { parcelTag });
    
        // Step 7: Replace only the affected polygons; NavMesh handles ID allocation and stitching.
        const { removedPolys, addedPolys, neighborPolys } = this.navMesh.replacePolygons(affectedPolys, newPolygons, {
            allowMerge: true,
            mergeWithActive: true,
            compactAll: true
        });
    
        if (this.debugEnabled) this.drawDebug();
        return {
            removedPolyIds: removedPolys.map((poly) => poly.id),
            addedPolyIds: addedPolys.map((poly) => poly.id),
            neighborPolyIds: neighborPolys.map((poly) => poly.id)
        };
    }

    replaceBounds(bounds, sourceGrid, opts = {}) {
        const normalized = this._normalizeGridBounds(bounds, sourceGrid);
        if (!normalized) {
            return { removedPolyIds: [], addedPolyIds: [], neighborPolyIds: [] };
        }

        const parcelTag = opts.parcelTag ?? bounds?.parcelTag ?? null;
        const requestedWorldRect = {
            x: normalized.minX * SQUARESIZE,
            y: normalized.minY * SQUARESIZE,
            w: normalized.width * SQUARESIZE,
            h: normalized.height * SQUARESIZE
        };

        const polygons = this.navMesh.getPolygons ? this.navMesh.getPolygons() : this.navMesh.navPolygons;
        const allowCrossTag = opts.allowCrossTagMerge === true || opts.allowMerge === true;
        const { rebuildBounds, affectedPolys } = this._resolveReplacementClosure(
            normalized,
            polygons,
            sourceGrid,
            requestedWorldRect,
            parcelTag,
            allowCrossTag
        );
        const worldRect = {
            x: rebuildBounds.minX * SQUARESIZE,
            y: rebuildBounds.minY * SQUARESIZE,
            w: rebuildBounds.width * SQUARESIZE,
            h: rebuildBounds.height * SQUARESIZE
        };

        const localGrid = [];
        for (let gy = rebuildBounds.minY; gy <= rebuildBounds.maxY; gy++) {
            const row = [];
            for (let gx = rebuildBounds.minX; gx <= rebuildBounds.maxX; gx++) {
                row.push(sourceGrid[gy]?.[gx] ? 1 : 0);
            }
            localGrid.push(row);
        }

        const newPolygons = this._extractPolygonsFromGrid(localGrid, worldRect.x, worldRect.y, { parcelTag });

        const { removedPolys, addedPolys, neighborPolys } = this.navMesh.replacePolygons(affectedPolys, newPolygons, {
            allowMerge: opts.allowMerge === true,
            mergeWithActive: opts.allowMerge === true,
            compactAll: opts.compactAll === true || opts.allowMerge === true
        });

        if (this.debugEnabled) this.drawDebug();
        return {
            removedPolyIds: removedPolys.map((poly) => poly.id),
            addedPolyIds: addedPolys.map((poly) => poly.id),
            neighborPolyIds: neighborPolys.map((poly) => poly.id)
        };
    }

    _resolveReplacementClosure(initialBounds, polygons, sourceGrid, requestedWorldRect, parcelTag, allowCrossTag) {
        let rebuildBounds = initialBounds;
        let closureRect = requestedWorldRect;
        let affectedPolys = [];

        for (let i = 0; i < 64; i++) {
            affectedPolys = polygons.filter((poly) => {
                if (!allowCrossTag && !this._polyMatchesParcelTag(poly, parcelTag)) {
                    return false;
                }
                return this._polygonIntersectsRect(poly.polygon.points, closureRect);
            });

            const nextBounds = this._expandGridBoundsForPolygons(rebuildBounds, affectedPolys, sourceGrid);
            if (
                nextBounds.minX === rebuildBounds.minX &&
                nextBounds.minY === rebuildBounds.minY &&
                nextBounds.maxX === rebuildBounds.maxX &&
                nextBounds.maxY === rebuildBounds.maxY
            ) {
                rebuildBounds = nextBounds;
                break;
            }

            rebuildBounds = nextBounds;
            closureRect = {
                x: rebuildBounds.minX * SQUARESIZE,
                y: rebuildBounds.minY * SQUARESIZE,
                w: rebuildBounds.width * SQUARESIZE,
                h: rebuildBounds.height * SQUARESIZE
            };
        }

        const finalWorldRect = {
            x: rebuildBounds.minX * SQUARESIZE,
            y: rebuildBounds.minY * SQUARESIZE,
            w: rebuildBounds.width * SQUARESIZE,
            h: rebuildBounds.height * SQUARESIZE
        };

        affectedPolys = polygons.filter((poly) => {
            if (!allowCrossTag && !this._polyMatchesParcelTag(poly, parcelTag)) {
                return false;
            }
            return this._polygonIntersectsRect(poly.polygon.points, finalWorldRect);
        });

        return { rebuildBounds, affectedPolys };
    }

    _getPolygonsBounds(allPoints) {
        const xs = allPoints.flat().map(p => p.x);
        const ys = allPoints.flat().map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    _getPatchWorldBounds(affectedPolys, tileRects) {
        const allRects = [];
        for (const poly of affectedPolys) {
            allRects.push(this._getPolygonBounds(poly.polygon.points));
        }
        allRects.push(...tileRects);

        const minX = Math.min(...allRects.map((rect) => rect.x));
        const minY = Math.min(...allRects.map((rect) => rect.y));
        const maxX = Math.max(...allRects.map((rect) => rect.x + rect.w));
        const maxY = Math.max(...allRects.map((rect) => rect.y + rect.h));

        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    _expandGridBoundsForPolygons(bounds, affectedPolys, sourceGrid) {
        const width = sourceGrid[0].length;
        const height = sourceGrid.length;
        let minX = bounds.minX;
        let minY = bounds.minY;
        let maxX = bounds.maxX;
        let maxY = bounds.maxY;

        for (const poly of affectedPolys) {
            const polyBounds = this._getPolygonBounds(poly.polygon.points);
            minX = Math.min(minX, Math.floor(polyBounds.x / SQUARESIZE));
            minY = Math.min(minY, Math.floor(polyBounds.y / SQUARESIZE));
            maxX = Math.max(maxX, Math.ceil((polyBounds.x + polyBounds.w) / SQUARESIZE) - 1);
            maxY = Math.max(maxY, Math.ceil((polyBounds.y + polyBounds.h) / SQUARESIZE) - 1);
        }

        minX = Math.max(0, minX);
        minY = Math.max(0, minY);
        maxX = Math.min(width - 1, maxX);
        maxY = Math.min(height - 1, maxY);

        return {
            minX,
            minY,
            maxX,
            maxY,
            width: maxX - minX + 1,
            height: maxY - minY + 1
        };
    }

    _extractPolygonsFromGrid(grid, originX, originY, opts = {}) {

        // Create a new navmesh instance (locally, not touching your main one)
        const tempNavMesh = new NavMesh(buildPolysFromGridMap(grid, SQUARESIZE, SQUARESIZE, undefined, 0));
    
        // 2. Extract polygons from the temp navmesh and shift back into world coordinates
        const worldPolys = [];
    
        for (const navPoly of tempNavMesh.getPolygons()) {
            const shiftedPoints = navPoly.polygon.points.map(p => ({
                x: p.x + originX,
                y: p.y + originY
            }));
            const parcelTags = this._collectParcelTagsForPolygon(shiftedPoints, grid, originX, originY, opts);
    
            worldPolys.push({
                points: shiftedPoints,
                parcelTags,
                parcelTag: parcelTags.length === 1 ? parcelTags[0] : null
            });
        }
    
        return worldPolys;
    }

    _collectParcelTagsForPolygon(points, grid, originX, originY, opts = {}) {
        const bounds = this._getPolygonBounds(points);
        const gridWidth = grid[0]?.length ?? 0;
        const gridHeight = grid.length;
        const minLocalX = Math.max(0, Math.floor((bounds.x - originX) / SQUARESIZE));
        const minLocalY = Math.max(0, Math.floor((bounds.y - originY) / SQUARESIZE));
        const maxLocalX = Math.min(
            gridWidth - 1,
            Math.ceil((bounds.x + bounds.w - originX) / SQUARESIZE) - 1
        );
        const maxLocalY = Math.min(
            gridHeight - 1,
            Math.ceil((bounds.y + bounds.h - originY) / SQUARESIZE) - 1
        );
        const tags = [];

        for (let localY = minLocalY; localY <= maxLocalY; localY++) {
            for (let localX = minLocalX; localX <= maxLocalX; localX++) {
                if (!grid[localY]?.[localX]) {
                    continue;
                }

                const worldX = originX + localX * SQUARESIZE + SQUARESIZE / 2;
                const worldY = originY + localY * SQUARESIZE + SQUARESIZE / 2;
                if (
                    worldX < bounds.x ||
                    worldX >= bounds.x + bounds.w ||
                    worldY < bounds.y ||
                    worldY >= bounds.y + bounds.h
                ) {
                    continue;
                }

                const tileX = Math.floor(worldX / SQUARESIZE);
                const tileY = Math.floor(worldY / SQUARESIZE);
                const tag = this.scene?.resolveParcelTagForTile?.(tileX, tileY) ?? opts.parcelTag ?? "main";
                if (!tags.includes(tag)) {
                    tags.push(tag);
                }
            }
        }

        if (!tags.length && opts.parcelTag != null) {
            tags.push(opts.parcelTag);
        }

        return this._normalizeParcelTags(tags);
    }

    _polygonIntersectsRect(points, rect) {
        const polyBounds = this._getPolygonBounds(points);

        return !(
            polyBounds.x + polyBounds.w <= rect.x ||    // polygon is left of tile
            polyBounds.x >= rect.x + rect.w ||          // polygon is right of tile
            polyBounds.y + polyBounds.h <= rect.y ||    // polygon is above tile
            polyBounds.y >= rect.y + rect.h             // polygon is below tile
        );
    }    

    _polygonTouchesRect(points, rect) {
        return this._polygonIntersectsRect(points, rect) || this._polygonIsAdjacentToRect(points, rect);
    }

    _getPolygonBounds(points) {
        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        return {
            x: minX,
            y: minY,
            w: maxX - minX,
            h: maxY - minY
        };
    }

    _splitRectAround(bounds, hole) {
        const results = [];

        // Top
        if (hole.y > bounds.y) {
            results.push({
                x: bounds.x,
                y: bounds.y,
                w: bounds.w,
                h: hole.y - bounds.y
            });
        }

        // Bottom
        if (hole.y + hole.h < bounds.y + bounds.h) {
            results.push({
                x: bounds.x,
                y: hole.y + hole.h,
                w: bounds.w,
                h: (bounds.y + bounds.h) - (hole.y + hole.h)
            });
        }

        // Left
        if (hole.x > bounds.x) {
            results.push({
                x: bounds.x,
                y: Math.max(bounds.y, hole.y),
                w: hole.x - bounds.x,
                h: Math.min(bounds.h, hole.h)
            });
        }

        // Right
        if (hole.x + hole.w < bounds.x + bounds.w) {
            results.push({
                x: hole.x + hole.w,
                y: Math.max(bounds.y, hole.y),
                w: (bounds.x + bounds.w) - (hole.x + hole.w),
                h: Math.min(bounds.h, hole.h)
            });
        }

        return results.filter(r => r.w > 0 && r.h > 0);
    }

    setupAddAndRemove(){
        return this.navMesh;
    }

    _polygonIsAdjacentToRect(points, rect) {
        const polyBounds = this._getPolygonBounds(points);
    
        const horizontallyAdjacent =
            (polyBounds.x + polyBounds.w === rect.x || polyBounds.x === rect.x + rect.w) &&
            !(polyBounds.y + polyBounds.h <= rect.y || polyBounds.y >= rect.y + rect.h);
    
        const verticallyAdjacent =
            (polyBounds.y + polyBounds.h === rect.y || polyBounds.y === rect.y + rect.h) &&
            !(polyBounds.x + polyBounds.w <= rect.x || polyBounds.x >= rect.x + rect.w);
    
        return horizontallyAdjacent || verticallyAdjacent;
    }

    _normalizeGridBounds(bounds, sourceGrid) {
        if (!bounds || !Array.isArray(sourceGrid) || !sourceGrid.length || !Array.isArray(sourceGrid[0])) {
            return null;
        }

        const width = sourceGrid[0].length;
        const height = sourceGrid.length;
        const hasNormalizedBounds =
            bounds.minX != null &&
            bounds.minY != null &&
            (
                (bounds.maxX != null && bounds.maxY != null) ||
                (bounds.width != null && bounds.height != null)
            );

        let minX;
        let minY;
        let maxX;
        let maxY;

        if (hasNormalizedBounds) {
            minX = Math.floor(Number(bounds.minX));
            minY = Math.floor(Number(bounds.minY));
            maxX = bounds.maxX != null
                ? Math.floor(Number(bounds.maxX))
                : Math.floor(Number(bounds.minX) + Number(bounds.width) - 1);
            maxY = bounds.maxY != null
                ? Math.floor(Number(bounds.maxY))
                : Math.floor(Number(bounds.minY) + Number(bounds.height) - 1);
        } else {
            const x = Math.floor(Number(bounds.x));
            const y = Math.floor(Number(bounds.y));
            const w = Math.floor(Number(bounds.w));
            const h = Math.floor(Number(bounds.h));

            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
                return null;
            }

            minX = x;
            minY = y;
            maxX = x + w - 1;
            maxY = y + h - 1;
        }

        if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
            return null;
        }

        minX = Math.max(0, minX);
        minY = Math.max(0, minY);
        maxX = Math.min(width - 1, maxX);
        maxY = Math.min(height - 1, maxY);

        if (maxX < minX || maxY < minY) {
            return null;
        }

        return {
            minX,
            minY,
            maxX,
            maxY,
            width: maxX - minX + 1,
            height: maxY - minY + 1
        };
    }

    _polyMatchesParcelTag(poly, parcelTag) {
        if (parcelTag == null) return true;
        return this._getPolyParcelTags(poly).includes(parcelTag);
    }

    _getPolyParcelTags(poly) {
        if (!poly) return [];

        const tags = [];
        const addTag = (tag) => {
            if (typeof tag === "string" && tag.length && !tags.includes(tag)) {
                tags.push(tag);
            }
        };
        const readMeta = (meta) => {
            if (!meta) return;
            if (Array.isArray(meta.parcelTags)) {
                for (const tag of meta.parcelTags) addTag(tag);
            }
            addTag(meta.parcelTag);
        };

        readMeta(poly);
        readMeta(poly.navMeta);
        readMeta(poly.__navMeta);

        return this._normalizeParcelTags(tags);
    }

    _normalizeParcelTags(tags) {
        const unique = [];
        for (const tag of tags || []) {
            if (typeof tag !== "string" || !tag.length || unique.includes(tag)) {
                continue;
            }
            unique.push(tag);
        }

        unique.sort((a, b) => {
            if (a === "main") return -1;
            if (b === "main") return 1;
            return a.localeCompare(b);
        });
        return unique;
    }
    
}




