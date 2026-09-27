import { Calamity, FloodEnvironment } from '../../types/domain';
import { FloodRenderer } from './flood/FloodRenderer';
import { ZoneRenderer } from '../zones/ZoneRenderer';
import { CityRenderer } from '../CityRenderer';
import { RainRenderer } from './weather/RainRenderer';
import { LightningRenderer } from './weather/LightningRenderer';
import { useStore } from '../../store';

export class DisasterRenderer {
  private cityRenderer: CityRenderer;
  private floodRenderer: FloodRenderer;
  private rainRenderer: RainRenderer;
  private lightningRenderer: LightningRenderer;

  constructor(renderer: CityRenderer, zoneRenderer: ZoneRenderer) {
    this.cityRenderer = renderer;
    this.floodRenderer = new FloodRenderer(renderer, zoneRenderer);
    this.rainRenderer = new RainRenderer(renderer);
    this.lightningRenderer = new LightningRenderer(renderer);
  }

  public updateCalamity(calamity: Calamity | string | null, environment?: FloodEnvironment) {
    const workflowState = useStore.getState().workflowState;

    if (!calamity || workflowState === 'idle') {
      this.clear();
      return;
    }

    const isCalamityActive = typeof calamity === 'string'
      ? calamity.length > 0
      : Boolean(calamity.active !== false);

    if (!isCalamityActive) {
      this.clear();
      return;
    }

    const calamityType = typeof calamity === 'string'
      ? calamity.toUpperCase()
      : (calamity.type ? String(calamity.type).toUpperCase() : 'FLOOD');

    if (calamityType === 'FLOOD') {
      const calamityObj: Calamity = typeof calamity === 'object' && 'type' in calamity
        ? calamity
        : { type: 'FLOOD', active: true };

      this.floodRenderer.render(calamityObj, environment);

      // Weather lifecycle is active only while simulation is actively progressing
      if (workflowState === 'disaster-active') {
        const rainfall = environment?.rainfall_intensity ?? 190;
        const simStatus = useStore.getState().status;
        const isPaused = simStatus === 'paused';
        
        // 1. High-speed 3D rain streaks scaling with intensity (zero static drops)
        this.rainRenderer.updateRain(true, rainfall);

        // 2. Horizon sky lightning bursts (once every 2 hours)
        this.lightningRenderer.updateLightning(!isPaused, rainfall);

        // 3. Overcast stormy lighting and fog mist
        this.cityRenderer.setStormAtmosphere(1.0);
      } else if (workflowState === 'disaster-finished') {
        // Disaster has concluded: terminate rain, stop lightning
        this.onSimulationEnd();
      }
    }
  }

  /**
   * Called when disaster simulation ends or completes.
   * Rain smoothly ceases, lightning stops, and sunny lighting returns.
   */
  public onSimulationEnd() {
    this.rainRenderer.stopRain();
    this.lightningRenderer.clear();
    this.cityRenderer.resetAtmosphere();
  }

  public clear() {
    this.floodRenderer.clear();
    this.rainRenderer.clear();
    this.lightningRenderer.clear();
    this.cityRenderer.resetAtmosphere();
  }

  public dispose() {
    this.floodRenderer.dispose();
    this.rainRenderer.dispose();
    this.lightningRenderer.dispose();
    this.cityRenderer.resetAtmosphere();
  }
}
