import * as THREE from 'three';
import { Calamity, FloodEnvironment } from '../../../types/domain';
import { ZoneRenderer } from '../../zones/ZoneRenderer';

export class FloodRenderer {
  private scene: THREE.Scene;
  private zoneRenderer: ZoneRenderer;
  private group: THREE.Group;
  private meshes: Map<string, THREE.Mesh> = new Map();
  private waterMaterial: THREE.MeshPhysicalMaterial;

  constructor(scene: THREE.Scene, zoneRenderer: ZoneRenderer) {
    this.scene = scene;
    this.zoneRenderer = zoneRenderer;
    this.group = new THREE.Group();
    // Offset slightly higher than the ZoneRenderer (which is 2) to avoid z-fighting
    this.group.position.y = 2.5; 
    this.scene.add(this.group);

    // Create a generic water material
    this.waterMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x2288ff,
      transparent: true,
      opacity: 0.65,
      roughness: 0.1,
      transmission: 0.5,
      thickness: 1.0,
      side: THREE.DoubleSide,
      depthWrite: false, // Prevents z-fighting artifacts with other transparent objects
    });
  }

  public render(_calamity: Calamity, environment?: FloodEnvironment | null) {
    console.log('[DEBUG FLOOD] FloodRenderer.render called with environment:', environment);
    if (!environment || !environment.flood_water_levels) {
      console.log('[DEBUG FLOOD] FloodRenderer clearing because no environment or water levels');
      this.clear();
      return;
    }

    const waterLevels = environment.flood_water_levels;
    const cells = this.zoneRenderer.getCells();

    // Track which zones we've processed this tick
    const activeZones = new Set<string>();

    for (const [zoneId, level] of Object.entries(waterLevels)) {
      if (level <= 0.05) continue; // Ignore negligible water

      activeZones.add(zoneId);
      const cell = cells.get(zoneId);
      if (!cell) continue;

      let mesh = this.meshes.get(zoneId);

      if (!mesh) {
        // Build new geometry from Voronoi cell
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
        geom.computeVertexNormals();

        mesh = new THREE.Mesh(geom, this.waterMaterial);
        mesh.userData = { zoneId };
        this.group.add(mesh);
        this.meshes.set(zoneId, mesh);
      }

      // Update water height visually
      // Assuming 'level' directly corresponds to Y-scale/position
      // A level of 1 might be 1 unit high. Scale the Y by a visual factor if needed.
      const heightFactor = 1.0; 
      // Instead of scaling (which requires 3D geometry), we just raise the plane
      mesh.position.y = level * heightFactor;
    }

    // Remove meshes for zones that are no longer flooded
    for (const [zoneId, mesh] of this.meshes.entries()) {
      if (!activeZones.has(zoneId)) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        this.meshes.delete(zoneId);
      }
    }
  }

  public clear() {
    for (const mesh of this.meshes.values()) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes.clear();
  }

  public dispose() {
    this.clear();
    this.scene.remove(this.group);
    this.waterMaterial.dispose();
  }
}

