import { WorldSnapshot, RawWorldSnapshotDTO, SimulationStatus, FloodEnvironment } from '../types/domain';
import { validateAgentSnapshot } from './agentValidation';


/**
 * Validates a raw world snapshot payload and normalizes it into an authoritative WorldSnapshot domain object.
 * Returns null if the raw data is invalid or malformed.
 */
export function validateWorldSnapshot(raw: unknown): WorldSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    console.warn('[SnapshotValidation] Invalid world snapshot payload: expected object', raw);
    return null;
  }

  const dto = raw as RawWorldSnapshotDTO;

  // 1. Validate agents snapshot part
  // We construct a RawAgentSnapshotDTO-like object to pass to validateAgentSnapshot
  const agentSnapshotRaw = {
    tick: dto.currentTick,
    timestamp: dto.simulationTime,
    agents: dto.entities || []
  };
  const agentSnapshot = validateAgentSnapshot(agentSnapshotRaw);
  
  if (!agentSnapshot) {
    console.warn('[SnapshotValidation] Failed to validate agents within world snapshot');
    return null;
  }

  // 2. Extract Simulation Metadata
  const tick = typeof dto.currentTick === 'number' && Number.isFinite(dto.currentTick) ? dto.currentTick : 0;
  const timestamp = typeof dto.simulationTime === 'number' && Number.isFinite(dto.simulationTime) ? dto.simulationTime : Date.now();
  
  let status: SimulationStatus | undefined = undefined;
  let complete: boolean | undefined = undefined;
  let duration: number | undefined = undefined;
  if (dto.simulation) {
    if (dto.simulation.paused) status = 'paused';
    else if (dto.simulation.initialized) status = 'running';
    else status = 'idle';
    complete = dto.simulation.complete;
    duration = dto.simulation.duration;
  }

  // 3. Extract Zone States if any
  const zoneStates = dto.environment && typeof dto.environment === 'object' 
    ? (dto.environment as Record<string, unknown>)
    : undefined;

  // 4. Extract Calamity and Environment for 7B.1
  let activeCalamity: any = undefined;
  if (dto.activeCalamity === 'FLOOD' || dto.activeCalamity === 'EARTHQUAKE') {
    activeCalamity = {
      type: dto.activeCalamity,
      active: true
    };
  }

  const environment = (dto.environment && typeof dto.environment === 'object'
    ? dto.environment
    : {}) as unknown as FloodEnvironment;

  // Map root risk and recommendations into environment to satisfy frontend expectations
  if (dto.risk) {
    environment.risk = {
      available: true,
      assessment: dto.risk
    };
  }
  
  if (dto.recommendations) {
    environment.decision = environment.decision || {};
    environment.decision.recommendations = dto.recommendations;
  }

  if (dto.subsystems) {
    // @ts-ignore - dynamic properties
    environment.subsystems = dto.subsystems;
  }

  return {
    simulation: {
      tick,
      timestamp,
      ...(status ? { status } : {}),
      ...(complete !== undefined ? { complete } : {}),
      ...(duration !== undefined ? { duration } : {})
    },
    agents: agentSnapshot,
    ...(activeCalamity ? { activeCalamity } : {}),
    ...(environment ? { environment } : {}),
    ...(zoneStates ? { zoneStates } : {})
  };
}
