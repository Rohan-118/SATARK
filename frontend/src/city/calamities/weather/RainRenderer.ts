import * as THREE from 'three';
import { CityRenderer } from '../../CityRenderer';

/**
 * 3D Rain Particle Streak System for SATARK.
 * 
 * Simulates high-velocity falling raindrops dynamically scaled with authoritative backend
 * rainfall_intensity (mm/h). Particles follow the active camera in a bounded volume,
 * ensuring high visual density and 60 FPS performance.
 * 
 * Key Guarantees:
 * - ZERO Static Drops:
 *   - Geometry draw range strictly matches `activeCount * 2`.
 *   - Inactive buffer slots are parked at y = -99999 offscreen.
 *   - Continuous terminal velocity fall without freezing mid-air.
 * - Dynamic Coupling:
 *   - 35 mm/h: ~1,800 active falling streaks.
 *   - 75 mm/h: ~4,200 active falling streaks.
 *   - 190 mm/h: ~7,200 active falling streaks with high wind slant.
 * - Clean Lifecycle:
 *   - When simulation finishes, rain falls out of view and draw range is set to 0.
 *   - Immediate full cleanup on reset/stop.
 */
export class RainRenderer {
  private renderer: CityRenderer;
  private scene: THREE.Scene;
  private lineSegments: THREE.LineSegments | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.LineBasicMaterial | null = null;
  private unsubscribeTick: (() => void) | null = null;

  private targetRainOpacity = 0.0;
  private currentRainOpacity = 0.0;
  private isStopping = false;

  // Maximum particle capacity
  private readonly maxParticles = 7500;
  private activeCount = 0;
  private windSlantFactor = 1.0;
  private speedFactor = 1.0;

  // Bounded camera-following volume
  private readonly boxWidth = 450;
  private readonly boxDepth = 450;
  private readonly boxHeight = 500;

  // Pre-allocated static buffers
  private positions: Float32Array; // maxParticles * 6 (2 vertices * 3 coords)
  private colors: Float32Array;    // maxParticles * 6 (2 vertices * 3 rgb)
  private velocities: Float32Array; // maxParticles * 3 (vx, vy, vz)
  private streakLengths: Float32Array; // maxParticles

  // Scratch vector for camera tracking without allocations
  private scratchCamPos = new THREE.Vector3();

  constructor(renderer: CityRenderer) {
    this.renderer = renderer;
    this.scene = renderer.getScene();

    this.positions = new Float32Array(this.maxParticles * 6);
    this.colors = new Float32Array(this.maxParticles * 6);
    this.velocities = new Float32Array(this.maxParticles * 3);
    this.streakLengths = new Float32Array(this.maxParticles);

    this.initializeRainData();
    this.setupLineSegments();

    this.onTick = this.onTick.bind(this);
    this.unsubscribeTick = this.renderer.onTick(this.onTick);
  }

  private initializeRainData() {
    for (let i = 0; i < this.maxParticles; i++) {
      const pIdx = i * 6;
      const vIdx = i * 3;

      // Park all positions far offscreen so zero uninitialized vertices can ever be visible
      this.positions[pIdx + 0] = 0;
      this.positions[pIdx + 1] = -99999;
      this.positions[pIdx + 2] = 0;
      this.positions[pIdx + 3] = 0;
      this.positions[pIdx + 4] = -99999;
      this.positions[pIdx + 5] = 0;

      const isForeground = i % 5 < 2;
      const len = isForeground ? (20 + Math.random() * 14) : (10 + Math.random() * 8);
      this.streakLengths[i] = len;

      // Vertex color gradient: ethereal cyan tail -> bright luminous droplet head
      this.colors[pIdx + 0] = 0.48;
      this.colors[pIdx + 1] = 0.70;
      this.colors[pIdx + 2] = 0.95;

      this.colors[pIdx + 3] = 0.92;
      this.colors[pIdx + 4] = 0.98;
      this.colors[pIdx + 5] = 1.00;

      // Base terminal velocity: high speed downward
      this.velocities[vIdx + 0] = 36 + Math.random() * 22; // Wind drift +X
      this.velocities[vIdx + 1] = -(480 + Math.random() * 200); // Downward velocity
      this.velocities[vIdx + 2] = 14 + Math.random() * 12; // Slight +Z
    }
  }

  private setupLineSegments() {
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    // Strictly draw 0 vertices until activated
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.lineSegments = new THREE.LineSegments(this.geometry, this.material);
    this.lineSegments.frustumCulled = false;
    this.lineSegments.visible = false;

    this.scene.add(this.lineSegments);
  }

  /**
   * Updates rain based on calamity status and authoritative rainfall intensity (mm/h).
   */
  public updateRain(active: boolean, rainfallIntensity: number = 75) {
    if (active && rainfallIntensity > 0) {
      this.isStopping = false;

      // Dynamic particle scaling
      if (rainfallIntensity <= 35) {
        const t = Math.max(0.1, rainfallIntensity / 35);
        this.activeCount = Math.floor(1400 + t * 600);
        this.windSlantFactor = 0.55 + t * 0.25;
        this.speedFactor = 0.85 + t * 0.15;
        this.targetRainOpacity = 0.50 + t * 0.15;
      } else if (rainfallIntensity <= 75) {
        const t = (rainfallIntensity - 35) / 40;
        this.activeCount = Math.floor(2000 + t * 2400);
        this.windSlantFactor = 0.80 + t * 0.35;
        this.speedFactor = 0.95 + t * 0.20;
        this.targetRainOpacity = 0.65 + t * 0.15;
      } else {
        const t = Math.min(1.0, (rainfallIntensity - 75) / 115);
        this.activeCount = Math.floor(4400 + t * 2800);
        this.windSlantFactor = 1.15 + t * 0.40;
        this.speedFactor = 1.15 + t * 0.30;
        this.targetRainOpacity = 0.80 + t * 0.15;
      }

      // Initialize any newly active particles into the camera frustum volume
      this.renderer.getCameraPosition(this.scratchCamPos);
      const camX = this.scratchCamPos.x;
      const camY = this.scratchCamPos.y;
      const camZ = this.scratchCamPos.z;

      let hasNewSpawns = false;
      for (let i = 0; i < this.activeCount; i++) {
        const pIdx = i * 6;
        if (this.positions[pIdx + 1] < -90000) {
          const rx = camX + (Math.random() - 0.5) * this.boxWidth;
          const ry = camY + (Math.random() - 0.5) * this.boxHeight;
          const rz = camZ + (Math.random() - 0.5) * this.boxDepth;
          const len = this.streakLengths[i];

          this.positions[pIdx + 0] = rx;
          this.positions[pIdx + 1] = ry;
          this.positions[pIdx + 2] = rz;
          this.positions[pIdx + 3] = rx - len * 0.13 * this.windSlantFactor;
          this.positions[pIdx + 4] = ry - len;
          this.positions[pIdx + 5] = rz - len * 0.05 * this.windSlantFactor;
          hasNewSpawns = true;
        }
      }

      if (this.geometry) {
        if (hasNewSpawns) {
          (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        }
        this.geometry.setDrawRange(0, this.activeCount * 2);
      }

      if (this.lineSegments) {
        this.lineSegments.visible = true;
      }
    } else {
      this.stopRain();
    }
  }

  /**
   * Smoothly ceases rain: active streaks fall out of view, then draw range collapses to 0.
   */
  public stopRain() {
    this.isStopping = true;
    this.targetRainOpacity = 0.0;
  }

  /**
   * Continuous render loop tick callback.
   */
  private onTick(delta: number) {
    if (!this.lineSegments || !this.material || !this.geometry) return;

    // Smooth opacity lerp
    if (Math.abs(this.currentRainOpacity - this.targetRainOpacity) > 0.005) {
      if (this.currentRainOpacity < this.targetRainOpacity) {
        this.currentRainOpacity = Math.min(this.targetRainOpacity, this.currentRainOpacity + delta * 2.0);
      } else {
        const fadeSpeed = this.isStopping ? 1.6 : 2.5;
        this.currentRainOpacity = Math.max(0.0, this.currentRainOpacity - delta * fadeSpeed);
      }

      this.material.opacity = this.currentRainOpacity;

      if (this.currentRainOpacity <= 0.002 && this.targetRainOpacity === 0.0) {
        this.lineSegments.visible = false;
        this.activeCount = 0;
        this.geometry.setDrawRange(0, 0);
        return;
      } else {
        this.lineSegments.visible = true;
      }
    }

    if (!this.lineSegments.visible || this.activeCount === 0) {
      this.geometry.setDrawRange(0, 0);
      return;
    }

    // Strictly enforce draw range so NO unmoving vertices are ever rendered
    this.geometry.setDrawRange(0, this.activeCount * 2);

    // Track active camera position without allocations
    this.renderer.getCameraPosition(this.scratchCamPos);
    const camX = this.scratchCamPos.x;
    const camY = this.scratchCamPos.y;
    const camZ = this.scratchCamPos.z;

    const halfW = this.boxWidth * 0.5;
    const halfD = this.boxDepth * 0.5;
    const halfH = this.boxHeight * 0.5;

    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const posArray = posAttr.array as Float32Array;

    const slant = this.windSlantFactor;
    const speed = this.speedFactor;

    // Update ALL active particles every frame
    for (let i = 0; i < this.activeCount; i++) {
      const pIdx = i * 6;
      const vIdx = i * 3;

      const vy = this.velocities[vIdx + 1] * speed;
      const vx = this.velocities[vIdx + 0] * slant;
      const vz = this.velocities[vIdx + 2] * slant;
      const len = this.streakLengths[i];

      // Advance falling position
      let topY = posArray[pIdx + 1] + vy * delta;
      let topX = posArray[pIdx + 0] + vx * delta;
      let topZ = posArray[pIdx + 2] + vz * delta;

      // Recycle when fallen below camera frustum
      if (topY < camY - halfH) {
        if (this.isStopping) {
          topY = -99999; // Park fallen streak far offscreen
        } else {
          topY = camY + halfH + (Math.random() * 40);
          topX = camX + (Math.random() - 0.5) * this.boxWidth;
          topZ = camZ + (Math.random() - 0.5) * this.boxDepth;
        }
      }

      // Horizontal camera wrap
      if (!this.isStopping) {
        if (topX > camX + halfW) topX -= this.boxWidth;
        if (topX < camX - halfW) topX += this.boxWidth;
        if (topZ > camZ + halfD) topZ -= this.boxDepth;
        if (topZ < camZ - halfD) topZ += this.boxDepth;
      }

      // Top vertex
      posArray[pIdx + 0] = topX;
      posArray[pIdx + 1] = topY;
      posArray[pIdx + 2] = topZ;

      // Bottom vertex (droplet head with slant)
      posArray[pIdx + 3] = topX - len * (0.13 * slant);
      posArray[pIdx + 4] = topY - len;
      posArray[pIdx + 5] = topZ - len * (0.05 * slant);
    }

    posAttr.needsUpdate = true;
  }

  /**
   * Immediately clears all rain particles and hides the system.
   */
  public clear() {
    this.targetRainOpacity = 0.0;
    this.currentRainOpacity = 0.0;
    this.activeCount = 0;
    this.isStopping = false;

    if (this.geometry) {
      this.geometry.setDrawRange(0, 0);
      const posArray = this.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < posArray.length; i += 3) {
        posArray[i + 1] = -99999;
      }
      (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    if (this.material) this.material.opacity = 0.0;
    if (this.lineSegments) this.lineSegments.visible = false;
  }

  /**
   * Cleanly disposes of all resources.
   */
  public dispose() {
    if (this.unsubscribeTick) {
      this.unsubscribeTick();
      this.unsubscribeTick = null;
    }
    if (this.lineSegments) {
      this.scene.remove(this.lineSegments);
      this.lineSegments = null;
    }
    if (this.geometry) {
      this.geometry.dispose();
      this.geometry = null;
    }
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
  }
}
