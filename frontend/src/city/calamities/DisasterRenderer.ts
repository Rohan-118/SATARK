import { Calamity, FloodEnvironment } from '../../types/domain';
import { FloodRenderer } from './flood/FloodRenderer';
import { EarthquakeRenderer } from './earthquake/EarthquakeRenderer';
import { ZoneRenderer } from '../zones/ZoneRenderer';

import { CityRenderer } from '../CityRenderer';

export class DisasterRenderer {
  private floodRenderer: FloodRenderer;
  private earthquakeRenderer: EarthquakeRenderer;

  constructor(renderer: CityRenderer, zoneRenderer: ZoneRenderer) {
    this.floodRenderer = new FloodRenderer(renderer, zoneRenderer);
    this.earthquakeRenderer = new EarthquakeRenderer(renderer.getScene());
  }

  public updateCalamity(calamity: Calamity | null, environment?: FloodEnvironment) {
    console.log('[TRACE 5] DisasterRenderer activeCalamity:', calamity);
    console.log('[TRACE 5] DisasterRenderer flood_water_levels:', environment?.flood_water_levels);
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

