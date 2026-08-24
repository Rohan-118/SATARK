import * as THREE from 'three';
import { Calamity, FloodEnvironment } from '../../../types/domain';
import { ZoneRenderer } from '../../zones/ZoneRenderer';
import { CityRenderer } from '../../CityRenderer';

export class FloodRenderer {
  private scene: THREE.Scene;
  private zoneRenderer: ZoneRenderer;
  private group: THREE.Group;
  
  // Phase 3: Cache the static geometry for each zone.
  private cachedGeometries: Map<string, THREE.BufferGeometry> = new Map();
  // Phase 2: Simple diagnostic color, no transparency, etc.
  private sharedMaterial: THREE.MeshPhongMaterial;
  
  // Track active meshes
  private meshes: Map<string, THREE.Mesh> = new Map();

  constructor(cityRenderer: CityRenderer, zoneRenderer: ZoneRenderer) {
    this.scene = cityRenderer.getScene();
    this.zoneRenderer = zoneRenderer;
    this.group = new THREE.Group();
    this.group.position.y = 0.0;
    this.scene.add(this.group);

    this.sharedMaterial = new THREE.MeshPhongMaterial({
      color: 0x0077be, // Blue water color
      transparent: true,
      opacity: 0.7,
      shininess: 90,
      specular: 0x55aaff,
      side: THREE.DoubleSide,
      depthWrite: false
    });
  }

  private getOrCreateGeometry(zoneId: string): THREE.BufferGeometry | null {
    if (this.cachedGeometries.has(zoneId)) {
      return this.cachedGeometries.get(zoneId)!;
    }
    
    const cells = this.zoneRenderer.getCells();
    const cell = cells.get(zoneId);
    if (!cell) return null;
    
    const verts = cell.vertices;
    if (verts.length < 3) return null;

    const shapePoints = verts.map((v) => new THREE.Vector2(v.x, v.z));
    const faces = THREE.ShapeUtils.triangulateShape(shapePoints, []);
    if (faces.length === 0) return null;

    const positions: number[] = [];
    const uvs: number[] = [];
    const uvScale = 0.01;
    
    for (let i = 0; i < verts.length; i++) {
      positions.push(verts[i].x, 0, verts[i].z);
      uvs.push(verts[i].x * uvScale, verts[i].z * uvScale);
    }

    const indices: number[] = [];
    for (const face of faces) {
      indices.push(face[0], face[1], face[2]);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    geom.computeBoundingBox();
    geom.computeBoundingSphere();
    
    this.cachedGeometries.set(zoneId, geom);
    return geom;
  }

  public render(_calamity: Calamity, environment?: FloodEnvironment | null) {
    if (!environment || !environment.flood_water_levels) {
      this.clear();
      return;
    }

    const waterLevels = environment.flood_water_levels;
    const activeZones = new Set<string>();

    for (const [zoneId, level] of Object.entries(waterLevels)) {
      if (level <= 0) continue;
      
      const geom = this.getOrCreateGeometry(zoneId);
      if (!geom) continue;

      activeZones.add(zoneId);
      
      let mesh = this.meshes.get(zoneId);
      if (!mesh) {
        // Phase 2: Create ONE extremely simple THREE.Mesh
        mesh = new THREE.Mesh(geom, this.sharedMaterial);
        mesh.userData = { zoneId };
        // Disable frustum culling temporarily to ensure it renders during diagnosis
        mesh.frustumCulled = false; 
        this.group.add(mesh);
        this.meshes.set(zoneId, mesh);
      }

      // Phase 2: Place it at Y = flood level + a tiny epsilon
      mesh.position.y = level + 0.1;
    }

    // Phase 3: Only remove meshes for zones that transition >0 -> 0
    for (const [zoneId, mesh] of this.meshes.entries()) {
      if (!activeZones.has(zoneId)) {
        this.group.remove(mesh);
        // We do NOT dispose of geometry or material here because they are cached/shared
        this.meshes.delete(zoneId);
      }
    }
  }

  public clear() {
    for (const mesh of this.meshes.values()) {
      this.group.remove(mesh);
    }
    this.meshes.clear();
  }

  public dispose() {
    this.clear();
    this.scene.remove(this.group);
    for (const geom of this.cachedGeometries.values()) {
      geom.dispose();
    }
    this.cachedGeometries.clear();
    this.sharedMaterial.dispose();
  }
}
