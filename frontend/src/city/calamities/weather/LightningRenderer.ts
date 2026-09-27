import * as THREE from 'three';
import { CityRenderer } from '../../CityRenderer';

/**
 * Horizon Sky Lightning Flash System for SATARK.
 * 
 * Simulates realistic double-flicker atmospheric lightning discharges during
 * severe storm conditions (rainfall_intensity > 50 mm/h).
 * 
 * Realistic Physics & Discharge Timing:
 * - Stochastic Trigger: Random interval every 12 to 24 seconds (8 to 15s during violent cloudbursts).
 * - Azimuthal Randomization: Discharges originate from dynamic horizon bearings (radius 2,000m - 3,200m).
 * - True Double-Flicker Timing:
 *   1. Primary burst (t = 0ms, 80ms duration): 100% power, intense light surge.
 *   2. Dark interval (t = 80ms, 40ms duration): Sudden 12% dip.
 *   3. Secondary echo (t = 120ms, 60ms duration): 70% power re-strike.
 *   4. Exponential decay (t = 180ms - 290ms): Stepped decay back to storm overcast baseline.
 * - Distant Horizon Sky Illumination Plane:
 *   - 5,000m radius additive disc tilted above the clouds with electric cyan-white tint (#93c5fd).
 * - Strict Lifecycle & Pause Safety:
 *   - Timers freeze/abort when simulation is paused, finished, or reset.
 */
export class LightningRenderer {
  private renderer: CityRenderer;
  private scene: THREE.Scene;
  private skyFlashMesh: THREE.Mesh | null = null;
  private skyFlashMaterial: THREE.MeshBasicMaterial | null = null;

  private isActive = false;
  private rainfallIntensity = 0;
  private timerId: number | null = null;
  private activeTimeouts: number[] = [];

  constructor(renderer: CityRenderer) {
    this.renderer = renderer;
    this.scene = renderer.getScene();

    this.setupSkyFlashMesh();
  }

  /**
   * Sets up a distant horizon sky dome flash plane situated directly above the cloud deck.
   */
  private setupSkyFlashMesh() {
    // Large circular disk situated just above the cloud layer at y = 1150m
    const geometry = new THREE.CircleGeometry(4500, 32);
    geometry.rotateX(Math.PI / 2); // Facing downward toward the city footprint

    this.skyFlashMaterial = new THREE.MeshBasicMaterial({
      color: 0x93c5fd, // Electric cyan-white tint
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.skyFlashMesh = new THREE.Mesh(geometry, this.skyFlashMaterial);
    this.skyFlashMesh.position.set(0, 1150, 0);
    this.skyFlashMesh.visible = false;
    this.skyFlashMesh.frustumCulled = false;

    this.scene.add(this.skyFlashMesh);
  }

  /**
   * Activates or deactivates lightning based on disaster state and authoritative rainfall intensity.
   */
  public updateLightning(active: boolean, rainfallIntensity: number = 0) {
    const wasActive = this.isActive;
    this.isActive = active;
    this.rainfallIntensity = rainfallIntensity;

    // Lightning requires active disaster and heavy rainfall (> 50 mm/h)
    const shouldRun = active && rainfallIntensity >= 50;

    if (shouldRun) {
      if (!wasActive || this.timerId === null) {
        this.clearPendingTimers();
        this.scheduleNextFlash();
      }
    } else {
      this.clearPendingTimers();
      this.resetAtmosphereFlash();
    }
  }

  /**
   * Schedules lightning strike once every two hours.
   */
  private scheduleNextFlash() {
    if (!this.isActive || this.rainfallIntensity < 50) return;

    // Trigger once every two hours (7,200,000 ms)
    const TWO_HOURS_MS = 2000;

    this.timerId = window.setTimeout(() => {
      this.triggerDoubleFlickerFlash();
      this.scheduleNextFlash();
    }, TWO_HOURS_MS);
  }

  /**
   * Executes a realistic double-flicker lightning discharge with stepped exponential decay.
   */
  private triggerDoubleFlickerFlash() {
    if (!this.isActive || !this.skyFlashMesh || !this.skyFlashMaterial) return;

    // Randomize horizon strike bearing (offset towards distant skyline perimeter)
    const strikeBearing = Math.random() * Math.PI * 2;
    const strikeDistance = 1600 + Math.random() * 1400;
    this.skyFlashMesh.position.set(
      Math.cos(strikeBearing) * strikeDistance,
      1150,
      Math.sin(strikeBearing) * strikeDistance
    );

    this.skyFlashMesh.visible = true;

    // 1. Primary Strike: t = 0ms (100% power, 80ms duration)
    this.setFlashIntensity(1.0);

    // 2. Dark Interval Dip: t = 80ms (12% power, 40ms duration)
    const t1 = window.setTimeout(() => {
      this.setFlashIntensity(0.12);
    }, 80);
    this.activeTimeouts.push(t1);

    // 3. Secondary Echo Re-strike: t = 120ms (70% power, 60ms duration)
    const t2 = window.setTimeout(() => {
      this.setFlashIntensity(0.70);
    }, 120);
    this.activeTimeouts.push(t2);

    // 4. Stepped Exponential Decay: t = 180ms (35% power, 50ms)
    const t3 = window.setTimeout(() => {
      this.setFlashIntensity(0.35);
    }, 180);
    this.activeTimeouts.push(t3);

    // 5. Residual Afterglow: t = 230ms (12% power, 60ms)
    const t4 = window.setTimeout(() => {
      this.setFlashIntensity(0.12);
    }, 230);
    this.activeTimeouts.push(t4);

    // 6. Complete Decay: t = 290ms (return to overcast storm atmosphere)
    const t5 = window.setTimeout(() => {
      this.resetAtmosphereFlash();
    }, 290);
    this.activeTimeouts.push(t5);
  }

  private setFlashIntensity(intensity: number) {
    if (this.skyFlashMaterial) {
      this.skyFlashMaterial.opacity = intensity * 0.82;
    }
    this.renderer.flashLightning(intensity);
  }

  private resetAtmosphereFlash() {
    if (this.skyFlashMaterial) {
      this.skyFlashMaterial.opacity = 0.0;
    }
    if (this.skyFlashMesh) {
      this.skyFlashMesh.visible = false;
    }
    // Return lighting to storm baseline
    this.renderer.setStormAtmosphere(this.isActive ? 1.0 : 0.0);
  }

  private clearPendingTimers() {
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
    for (const tid of this.activeTimeouts) {
      window.clearTimeout(tid);
    }
    this.activeTimeouts = [];
  }

  /**
   * Resets and immediately cancels all lightning effects and timers.
   */
  public clear() {
    this.isActive = false;
    this.rainfallIntensity = 0;
    this.clearPendingTimers();
    this.resetAtmosphereFlash();
  }

  /**
   * Cleanly disposes of all meshes, materials, and timeouts.
   */
  public dispose() {
    this.clear();
    if (this.skyFlashMesh) {
      this.scene.remove(this.skyFlashMesh);
      this.skyFlashMesh.geometry.dispose();
      this.skyFlashMesh = null;
    }
    if (this.skyFlashMaterial) {
      this.skyFlashMaterial.dispose();
      this.skyFlashMaterial = null;
    }
  }
}
