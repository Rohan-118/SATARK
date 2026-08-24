import { StateCreator } from 'zustand';
import { Calamity, WorldSnapshot, SimulationStatus, FloodEnvironment } from '../types/domain';
import type { StoreState } from './index';

export interface SimulationSlice {
  activeCalamity: Calamity | null;
  status: SimulationStatus;
  currentTick: number;
  lastUpdated: number | null; // Tracks when the last snapshot was received
  environment?: FloodEnvironment; 
  finalEnvironment?: FloodEnvironment;
  duration?: number;
  
  isSimulationStepping: boolean;
  isSimulationMutating: boolean;

  // Actions
  setActiveCalamity: (calamity: Calamity | null) => void;
  setStatus: (status: SimulationStatus) => void;
  setCurrentTick: (tick: number) => void;
  setIsSimulationStepping: (stepping: boolean) => void;
  setIsSimulationMutating: (mutating: boolean) => void;
  setFinalEnvironment: (env?: FloodEnvironment) => void;

  /**
   * Applies an authoritative WorldSnapshot to the global state.
   * This handles distributing snapshot parts to the appropriate slices (e.g. agents).
   */
  applyWorldSnapshot: (snapshot: WorldSnapshot) => void;
}

export const createSimulationSlice: StateCreator<
  StoreState,
  [],
  [],
  SimulationSlice
> = (set, get) => ({
  activeCalamity: null,
  status: 'idle',
  currentTick: 0,
  lastUpdated: null,
  environment: undefined,
  finalEnvironment: undefined,
  duration: undefined,
  isSimulationStepping: false,
  isSimulationMutating: false,
  
  setActiveCalamity: (activeCalamity) => set({ activeCalamity }),
  setStatus: (status) => set({ status }),
  setCurrentTick: (currentTick) => set({ currentTick }),
  setIsSimulationStepping: (isSimulationStepping) => set({ isSimulationStepping }),
  setIsSimulationMutating: (isSimulationMutating) => set({ isSimulationMutating }),
  setFinalEnvironment: (finalEnvironment) => set({ finalEnvironment }),

  applyWorldSnapshot: (snapshot) => {
    // 1. Distribute agent state to agentSlice
    get().setAgentSnapshot(snapshot.agents);

    // 2. Update simulation metadata in this slice
    set({
      currentTick: snapshot.simulation.tick,
      lastUpdated: snapshot.simulation.timestamp,
      ...(snapshot.simulation.status ? { status: snapshot.simulation.status } : {}),
      ...(snapshot.simulation.duration !== undefined ? { duration: snapshot.simulation.duration } : {}),
      activeCalamity: snapshot.activeCalamity !== undefined ? snapshot.activeCalamity : get().activeCalamity,
      environment: snapshot.environment
    });
  }
});
