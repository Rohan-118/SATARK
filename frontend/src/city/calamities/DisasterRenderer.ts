import * as THREE from 'three';
import { Calamity, FloodEnvironment } from '../../types/domain';
import { FloodRenderer } from './flood/FloodRenderer';
import { EarthquakeRenderer } from './earthquake/EarthquakeRenderer';
import { ZoneRenderer } from '../zones/ZoneRenderer';

export class DisasterRenderer {
  private floodRenderer: FloodRenderer;
  private earthquakeRenderer: EarthquakeRenderer;

  constructor(scene: THREE.Scene, zoneRenderer: ZoneRenderer) {
    this.floodRenderer = new FloodRenderer(scene, zoneRenderer);
    this.earthquakeRenderer = new EarthquakeRenderer(scene);
  }

  public updateCalamity(calamity: Calamity | null, environment?: FloodEnvironment) {
    if (!calamity) {
      this.floodRenderer.clear();
      this.earthquakeRenderer.clear();
      return;
    }

    if (calamity.type === 'FLOOD') {
      this.earthquakeRenderer.clear();
      this.floodRenderer.render(calamity, environment);
    } else if (calamity.type === 'EARTHQUAKE') {
      this.floodRenderer.clear();
      this.earthquakeRenderer.render(calamity);
    }
  }

  public clear() {
    this.updateCalamity(null);
  }

  public dispose() {
    this.floodRenderer.dispose();
    this.earthquakeRenderer.dispose();
  }
}

