import { useStore, StoreState } from '../store';
import { ZoneRenderer } from './zones/ZoneRenderer';
import { AgentRenderer } from './agents/AgentRenderer';
import { CameraController } from './camera/CameraController';
import { DisasterRenderer } from './calamities/DisasterRenderer';
import { InfrastructureRenderer } from './infrastructure/InfrastructureRenderer';
import { generateInitialAgents } from './agents/agentInitialization';

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
  private unsubscribeWorkflow?: () => void;
  
  private lastSelectedZoneId: string | null = null;
  private hasInitializedAgents = false;

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
    
    if (this.agentRenderer) {
       this.agentRenderer.setZoneRenderer(this.zoneRenderer);
    }

    // Listen to world state changes
    this.unsubscribeWorld = useStore.subscribe(
      (state: StoreState) => {
        this.zoneRenderer.updateZones(state.zones, state.safeZones);
        if (this.infrastructureRenderer) {
          // Future: update infrastructure from world state
          // this.infrastructureRenderer.updateInfrastructure(state.infrastructure);
        }
        this.initializeFrontendAgents(state);
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
          // console.log removed
          this.agentRenderer?.updateAgents(agentsArray);
        }
      );
    }
    
    // Listen to Simulation state changes for calamities
    if (this.disasterRenderer || this.agentRenderer) {
      this.unsubscribeSimulation = useStore.subscribe(
        (state: StoreState) => {
          // We call updateCalamity on every state change when disasterRenderer is present
          // so it can receive dynamic environment updates (like flood water levels)
          this.disasterRenderer?.updateCalamity(state.activeCalamity, state.environment);
          this.agentRenderer?.setActiveCalamity(!!state.activeCalamity);
        }
      );
    }

    // Listen to workflow state changes to reset agents when disaster finishes/closes
    this.unsubscribeWorkflow = useStore.subscribe(
      (state: StoreState, prevState: StoreState) => {
        const floodFinished = prevState.workflowState === 'disaster-active' && state.workflowState === 'disaster-finished';
        const earthquakeClosed = prevState.workflowState === 'earthquake-result' && state.workflowState === 'idle';
        const floodClosed = prevState.workflowState === 'disaster-finished' && state.workflowState === 'idle';
        
        if (floodFinished || earthquakeClosed || floodClosed) {
           this.agentRenderer?.resetAgentsToNormal();
           useStore.getState().resetAgentsToNormal();
        }
      }
    );

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
    
    this.initializeFrontendAgents(state);
  }

  private async initializeFrontendAgents(state: StoreState) {
    if (this.hasInitializedAgents) return;
    if (state.zones.length === 0) return;
    
    // Only initialize if agents don't exist yet
    if (Object.keys(state.agents).length > 0) return;
    
    // Generate agents based on the voronoi cells
    const cells = this.zoneRenderer.getCells();
    if (cells.size === 0) return; // Wait until cells are computed
    
    this.hasInitializedAgents = true;
    const initialAgents = await generateInitialAgents(state.zones, cells);
    
    // Check again in case state changed while fetching
    if (Object.keys(useStore.getState().agents).length === 0 && initialAgents.length > 0) {
       useStore.getState().setAgents(initialAgents);
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
    if (this.unsubscribeWorkflow) {
      this.unsubscribeWorkflow();
    }
  }
}


