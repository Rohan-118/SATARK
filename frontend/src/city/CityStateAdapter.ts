import { useStore, StoreState } from '../store';
import { ZoneRenderer } from './zones/ZoneRenderer';
import { AgentRenderer } from './agents/AgentRenderer';
import { CameraController } from './camera/CameraController';
import { DisasterRenderer } from './calamities/DisasterRenderer';
import { InfrastructureRenderer } from './infrastructure/InfrastructureRenderer';

export class CityStateAdapter {
  private zoneRenderer: ZoneRenderer;
  private agentRenderer?: AgentRenderer;
  private cameraController?: CameraController;
  private disasterRenderer?: DisasterRenderer;
  private infrastructureRenderer?: InfrastructureRenderer;
  
  private unsubscribeWorld: () => void;
  private unsubscribeUi: () => void;
  private unsubscribeAgents?: () => void;
  private unsubscribeSimulation?: () => void;
  
  private lastSelectedZoneId: string | null = null;

  constructor(
    zoneRenderer: ZoneRenderer,
    agentRenderer?: AgentRenderer,
    cameraController?: CameraController,
    disasterRenderer?: DisasterRenderer,
    infrastructureRenderer?: InfrastructureRenderer
  ) {
    this.zoneRenderer = zoneRenderer;
    this.agentRenderer = agentRenderer;
    this.cameraController = cameraController;
    this.disasterRenderer = disasterRenderer;
    this.infrastructureRenderer = infrastructureRenderer;

    // Listen to world state changes
    this.unsubscribeWorld = useStore.subscribe(
      (state: StoreState) => {
        this.zoneRenderer.updateZones(state.zones, state.safeZones);
        if (this.infrastructureRenderer) {
          // Future: update infrastructure from world state
          // this.infrastructureRenderer.updateInfrastructure(state.infrastructure);
        }
      }
    );

    // Listen to UI state changes
    this.lastSelectedZoneId = useStore.getState().selectedZoneId;
    this.unsubscribeUi = useStore.subscribe(
      (state: StoreState) => {
        const newSelectedZoneId = state.selectedZoneId;
        if (newSelectedZoneId !== this.lastSelectedZoneId) {
          this.lastSelectedZoneId = newSelectedZoneId;
          this.zoneRenderer.setSelectedZone(newSelectedZoneId);
          if (newSelectedZoneId) {
            this.cameraController?.focusOnZone(newSelectedZoneId);
          }
        }
      }
    );

    // Listen to Agent state changes
    if (this.agentRenderer) {
      this.unsubscribeAgents = useStore.subscribe(
        (state: StoreState) => {
          const agentsArray = Object.values(state.agents);
          console.log('[DEBUG AGENTS] CityStateAdapter received agents update:', agentsArray.length);
          this.agentRenderer?.updateAgents(agentsArray);
        }
      );
    }
    
    // Listen to Simulation state changes for calamities
    if (this.disasterRenderer) {
      this.unsubscribeSimulation = useStore.subscribe(
        (state: StoreState) => {
          // We call updateCalamity on every state change when disasterRenderer is present
          // so it can receive dynamic environment updates (like flood water levels)
          console.log('[DEBUG FLOOD] CityStateAdapter calling disasterRenderer.updateCalamity', { activeCalamity: state.activeCalamity, environment: state.environment });
          this.disasterRenderer?.updateCalamity(state.activeCalamity, state.environment);
        }
      );
    }

    // Initial sync
    const state = useStore.getState();
    this.zoneRenderer.updateZones(state.zones, state.safeZones);
    this.zoneRenderer.setSelectedZone(state.selectedZoneId);
    if (this.agentRenderer) {
      this.agentRenderer.updateAgents(Object.values(state.agents));
    }
    if (this.disasterRenderer) {
      this.disasterRenderer.updateCalamity(state.activeCalamity, state.environment);
    }
  }

  public dispose() {
    this.unsubscribeWorld();
    this.unsubscribeUi();
    if (this.unsubscribeAgents) {
      this.unsubscribeAgents();
    }
    if (this.unsubscribeSimulation) {
      this.unsubscribeSimulation();
    }
  }
}


