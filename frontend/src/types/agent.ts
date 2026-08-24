/**
 * Agent Domain & DTO Types for SATARK Digital Twin.
 * 
 * Agents represent human/pedestrian entities in the simulated environment.
 * The backend is authoritative for agent identity, position, zone, and simulation state.
 */

/**
 * Authoritative Agent State enum matching backend/core/enums.py:
 * NORMAL → PANIC → SAFE
 */
export type AgentState = 'NORMAL' | 'PANIC' | 'SAFE';

/**
 * 3D World position in GLB coordinate space:
 * X = world X
 * Y = vertical / height
 * Z = world / map Z
 */
export interface Position3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Authoritative frontend representation of an individual Agent.
 */
export interface Agent {
  /** Authoritative unique entity identifier */
  id: string;

  /** Authoritative world position in GLB coordinates */
  position: Position3D;

  /** Authoritative 21-zone ID (e.g. 'Z01' - 'Z21') */
  zoneId: string;

  /** Authoritative simulation state */
  state: AgentState;

  // ────────────────────────────────────────────────────────────
  // Optional forward-compatible fields (un-invented / backend-ready)
  // ────────────────────────────────────────────────────────────

  /** Target evacuation facility or safe zone ID if assigned by backend */
  targetFacilityId?: string;

  /** Agent movement speed if provided by simulation */
  speed?: number;
}

/**
 * Snapshot of agents at a given simulation moment.
 */
export interface AgentSnapshot {
  /** Simulation tick index if provided by authoritative backend */
  tick?: number;

  /** Epoch timestamp of the snapshot generation */
  timestamp?: number;

  /** Collection of validated agent entities */
  agents: Agent[];
}

/**
 * Raw DTO format expected from future Django/DRF REST snapshot payloads.
 */
export interface RawAgentDTO {
  id: string;
  position: {
    x: number;
    y: number;
    z?: number;
  };
  zoneId?: string;
  zone_id?: string;
  state?: string;
  type?: string;
  // Optional forward-compatible fields
  targetFacilityId?: string;
  target_facility_id?: string;
  speed?: number;
}

/**
 * @deprecated RawAgentSnapshotDTO is no longer used. Use RawWorldSnapshotDTO instead.
 */
export interface RawAgentSnapshotDTO {
  tick?: number;
  timestamp?: number;
  agents: RawAgentDTO[];
}
