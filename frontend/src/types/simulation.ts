import { AgentSnapshot, RawAgentDTO } from './agent';
import { Calamity, FloodEnvironment } from './domain';

/**
 * Basic simulation lifecycle status.
 */
export type SimulationStatus = 'idle' | 'running' | 'paused';

/**
 * Metadata corresponding to a specific point in simulated time.
 */
export interface SimulationMetadata {
  /** The authoritative tick integer from the backend */
  tick: number;
  /** Epoch timestamp of when this snapshot was created by the backend */
  timestamp: number;
  /** Simulation status if provided */
  status?: SimulationStatus;
  /** Whether the simulation has reached its duration */
  complete?: boolean;
  /** Configured duration of the simulation in simulation seconds */
  duration?: number;
}

/**
 * Authoritative World Snapshot containing the full state of the digital twin at a given tick.
 * This object is strictly a domain model and must not contain rendering-specific Three.js objects.
 */
export interface WorldSnapshot {
  simulation: SimulationMetadata;
  agents: AgentSnapshot;
  activeCalamity?: Calamity | null;
  environment?: FloodEnvironment;
  
  // Future proofing for zone dynamic state (e.g. population counts)
  zoneStates?: Record<string, unknown>; 
}

/**
 * Raw JSON payload DTO expected from the Django/DRF backend snapshot endpoint.
 */
export interface RawWorldSnapshotDTO {
  currentTick?: number;
  simulationTime?: number;
  activeCalamity?: string | null;
  entities: RawAgentDTO[];
  simulation?: {
    initialized: boolean;
    paused: boolean;
    complete: boolean;
    duration?: number;
  };
  environment?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  events?: unknown[];
  risk?: Record<string, unknown>;
  recommendations?: Record<string, unknown>;
  optimization?: Record<string, unknown>;
  intervention?: Record<string, unknown>;
  subsystems?: Record<string, unknown>;
}

/**
 * The runtime simulation state representation within the application.
 */
export interface Simulation {
  activeCalamity: Calamity | null;
  status: SimulationStatus;
  currentTick: number;
}

/**
 * @deprecated Use WorldSnapshot or RawWorldSnapshotDTO instead.
 */
export interface SimulationSnapshot {
  tick: number;
  // Will contain backend data later
}
