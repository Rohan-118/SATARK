import * as THREE from 'three';
import { Zone, SafeZone } from '../../types/domain';
import { CityRenderer } from '../CityRenderer';
import { WorldBounds, VoronoiCell, Point2D, getDerivedZoneCellsWithFootprint } from './voronoi';

/**
 * ZoneRenderer — Phase 3.3 Voronoi boundary visualization.
 *
 * Renders subtle, irregular polygon boundary lines derived from the
 * 21 authoritative zone centers.  No zone fill — only thin edges.
 *
 * Also provides invisible interaction meshes for zone-click raycasting.
 *
 * DERIVED VISUALIZATION ONLY — the authoritative zone membership
 * rule (nearest-center) lives in spatial.ts and is unchanged.
 */
export class ZoneRenderer {
  private renderer: CityRenderer;
  private group: THREE.Group;
  private selectedZoneId: string | null = null;
  private safeZoneIds: Set<string> = new Set();
  private worldBounds: WorldBounds | null = null;
  private terrainFootprint: Point2D[] | null = null;

  // ── Derived cells (rebuilt only when zone data changes) ──
  private cells: Map<string, VoronoiCell> = new Map();

  // ── Visual boundary objects ──
  private boundaryLines: THREE.LineSegments | null = null;
  private selectedBoundaryLoop: THREE.LineLoop | null = null;

  // ── Invisible interaction meshes (one per zone cell) ──
  private interactionMeshes: Map<string, THREE.Mesh> = new Map();

  // ── Materials ──
  // Normal boundary — subtle cool steel
  private normalLineMaterial = new THREE.LineBasicMaterial({
    color: 0x88aacc,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  // Selected boundary — warm amber highlight
  private selectedLineMaterial = new THREE.LineBasicMaterial({
    color: 0xffcc44,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  // Safe-zone boundary — soft green tint
  private safeLineMaterial = new THREE.LineBasicMaterial({
    color: 0x66ddaa,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  // Invisible interaction material (not rendered, but raycastable)
  private interactionMaterial = new THREE.MeshBasicMaterial({
    visible: false,
    side: THREE.DoubleSide,
  });

  /** Y offset above the terrain to avoid z-fighting. */
  private static readonly Y_OFFSET = 2;

  constructor(renderer: CityRenderer) {
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.group.position.y = ZoneRenderer.Y_OFFSET;
    this.renderer.addOverlay(this.group);
  }

  // ────────────────────────────────────────────────────────────
  // World bounds (set once by CityScene after loading)
  // ────────────────────────────────────────────────────────────

  public setWorldBounds(bounds: WorldBounds): void {
    this.worldBounds = bounds;
  }

  /**
   * Set the terrain footprint polygon for Voronoi clipping.
   * When set, zone boundary cells will be clipped to the actual
   * terrain shape instead of the rectangular world bounds.
   * Called once by CityScene after GLB loads.
   */
  public setTerrainFootprint(footprint: Point2D[]): void {
    this.terrainFootprint = footprint;
  }

  // ────────────────────────────────────────────────────────────
  // Zone data update (called by CityStateAdapter)
  // ────────────────────────────────────────────────────────────

  public updateZones(zones: Zone[], safeZones: SafeZone[]): void {
    this.safeZoneIds = new Set(safeZones.map((sz) => sz.zoneId));

    if (!this.worldBounds || zones.length === 0) return;

    // Rebuild derived Voronoi cells, clipped to terrain footprint
    try {
      this.cells = getDerivedZoneCellsWithFootprint(
        zones,
        this.worldBounds,
        this.terrainFootprint,
      );
    } catch (err) {
      console.error('ZoneRenderer: Voronoi computation failed', err);
      return;
    }

    // Rebuild all visual geometry
    this.rebuildBoundaryGeometry();
    this.rebuildInteractionMeshes();
    this.updateSelectedHighlight();
  }

  // ────────────────────────────────────────────────────────────
  // Selected zone
  // ────────────────────────────────────────────────────────────

  public setSelectedZone(zoneId: string | null): void {
    if (this.selectedZoneId === zoneId) return;
    this.selectedZoneId = zoneId;
    this.updateSelectedHighlight();
  }

  // ────────────────────────────────────────────────────────────
  // Interactive objects for CityInteraction raycasting
  // ────────────────────────────────────────────────────────────

  public getInteractiveObjects(): THREE.Object3D[] {
    return Array.from(this.interactionMeshes.values());
  }

  // ────────────────────────────────────────────────────────────
  // Disposal
  // ────────────────────────────────────────────────────────────

  public dispose(): void {
    this.renderer.removeOverlay(this.group);

    // Dispose boundary lines
    this.disposeBoundaryLines();
    this.disposeSelectedLoop();

    // Dispose interaction meshes
    for (const mesh of this.interactionMeshes.values()) {
      mesh.geometry.dispose();
    }
    this.interactionMeshes.clear();

    // Dispose materials (owned by this renderer)
    this.normalLineMaterial.dispose();
    this.selectedLineMaterial.dispose();
    this.safeLineMaterial.dispose();
    this.interactionMaterial.dispose();
  }

  // ────────────────────────────────────────────────────────────
  // Internal accessors
  // ────────────────────────────────────────────────────────────

  public getCells(): Map<string, VoronoiCell> {
    return this.cells;
  }

  // ────────────────────────────────────────────────────────────
  // PRIVATE — boundary geometry construction
  // ────────────────────────────────────────────────────────────

  /**
   * Build a single THREE.LineSegments containing all zone boundary
   * edges EXCEPT the selected zone (which gets its own highlight).
   *
   * To achieve clean shared edges without duplication, we collect
   * every cell edge as an ordered pair of vertex strings and
   * deduplicate.  Two adjacent cells share the same edge — we only
   * emit it once.
   */
  private rebuildBoundaryGeometry(): void {
    this.disposeBoundaryLines();

    // Collect unique edge segments for non-selected zones.
    // Also collect safe-zone edges separately for tinting.
    const normalEdges: number[] = [];
    const safeEdges: number[] = [];

    const emittedEdges = new Set<string>();

    for (const [zoneId, cell] of this.cells) {
      if (zoneId === this.selectedZoneId) continue; // selected zone rendered separately

      const isSafe = this.safeZoneIds.has(zoneId);
      const verts = cell.vertices;

      for (let i = 0; i < verts.length; i++) {
        const a = verts[i];
        const b = verts[(i + 1) % verts.length];

        // Canonical edge key (order-independent for dedup)
        const keyA = `${a.x.toFixed(6)}_${a.z.toFixed(6)}`;
        const keyB = `${b.x.toFixed(6)}_${b.z.toFixed(6)}`;
        const edgeKey = keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;

        if (emittedEdges.has(edgeKey)) continue;
        emittedEdges.add(edgeKey);

        const target = isSafe ? safeEdges : normalEdges;
        target.push(a.x, 0, a.z, b.x, 0, b.z);
      }
    }

    // Create normal boundary lines
    if (normalEdges.length > 0) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(normalEdges, 3));
      this.boundaryLines = new THREE.LineSegments(geom, this.normalLineMaterial);
      this.group.add(this.boundaryLines);
    }

    // Create safe-zone boundary lines (separate object for different material)
    if (safeEdges.length > 0) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(safeEdges, 3));
      const safeLines = new THREE.LineSegments(geom, this.safeLineMaterial);
      this.group.add(safeLines);
    }
  }

  /**
   * Create or update the selected-zone highlight loop.
   */
  private updateSelectedHighlight(): void {
    this.disposeSelectedLoop();

    if (!this.selectedZoneId) return;

    const cell = this.cells.get(this.selectedZoneId);
    if (!cell) return;

    const positions: number[] = [];
    for (const v of cell.vertices) {
      positions.push(v.x, 0, v.z);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.selectedBoundaryLoop = new THREE.LineLoop(geom, this.selectedLineMaterial);
    this.group.add(this.selectedBoundaryLoop);

    // Also rebuild the base boundary lines to exclude the newly-selected zone
    this.rebuildBoundaryGeometry();
  }

  // ────────────────────────────────────────────────────────────
  // PRIVATE — interaction mesh construction
  // ────────────────────────────────────────────────────────────

  /**
   * Create one invisible mesh per zone cell for raycasting.
   * Uses THREE.ShapeUtils.triangulateShape for robust triangulation
   * of arbitrary (including non-convex / terrain-clipped) polygons.
   */
  private rebuildInteractionMeshes(): void {
    // Remove old meshes
    for (const mesh of this.interactionMeshes.values()) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    this.interactionMeshes.clear();

    for (const [zoneId, cell] of this.cells) {
      const verts = cell.vertices;
      if (verts.length < 3) continue;

      const shapePoints = verts.map((v) => new THREE.Vector2(v.x, v.z));
      const faces = THREE.ShapeUtils.triangulateShape(shapePoints, []);
      if (faces.length === 0) continue;

      const positions: number[] = [];
      for (let i = 0; i < verts.length; i++) {
        positions.push(verts[i].x, 0, verts[i].z);
      }

      const indices: number[] = [];
      for (const face of faces) {
        indices.push(face[0], face[1], face[2]);
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setIndex(indices);
      geom.computeBoundingSphere();

      const mesh = new THREE.Mesh(geom, this.interactionMaterial);
      mesh.userData = { isZone: true, zoneId };

      this.group.add(mesh);
      this.interactionMeshes.set(zoneId, mesh);
    }
  }

  // ────────────────────────────────────────────────────────────
  // PRIVATE — disposal helpers
  // ────────────────────────────────────────────────────────────

  private disposeBoundaryLines(): void {
    // Remove all LineSegments children from the group (boundary lines).
    // Preserve selectedBoundaryLoop (LineLoop) and interaction meshes.
    const toRemove: THREE.Object3D[] = [];
    for (const child of this.group.children) {
      if (child instanceof THREE.LineSegments) {
        toRemove.push(child);
      }
    }
    for (const obj of toRemove) {
      this.group.remove(obj);
      if ((obj as THREE.LineSegments).geometry) {
        (obj as THREE.LineSegments).geometry.dispose();
      }
    }
    this.boundaryLines = null;
  }

  private disposeSelectedLoop(): void {
    if (this.selectedBoundaryLoop) {
      this.group.remove(this.selectedBoundaryLoop);
      this.selectedBoundaryLoop.geometry.dispose();
      this.selectedBoundaryLoop = null;
    }
  }
}
