import { CalamityType, WorldSnapshot, RawWorldSnapshotDTO } from '../types/domain';
import { validateWorldSnapshot } from '../utils/snapshotValidation';
import { apiClient } from './client';

/**
 * Normalizes a raw world snapshot payload received from the backend.
 * Returns null if the payload fails validation.
 */
export function normalizeWorldSnapshot(raw: RawWorldSnapshotDTO): WorldSnapshot | null {
  return validateWorldSnapshot(raw);
}


export interface SimulationInitPayload {
  duration: number;
  tick_rate: number;
  calamity_type: CalamityType;
  parameters: Record<string, any>;
}

export const startSimulation = async (_calamityType: CalamityType): Promise<void> => {
  throw new Error('Not implemented: startSimulation. Backend DRF endpoint not yet available.');
};

export const fetchWorldSnapshot = async (_tick?: number): Promise<WorldSnapshot> => {
  const data = await apiClient.get('/simulation/state/');
  const snapshot = normalizeWorldSnapshot(data);
  if (!snapshot) {
    throw new Error('Received invalid world snapshot from backend');
  }
  return snapshot;
};

export const initializeSimulation = async (payload: SimulationInitPayload): Promise<WorldSnapshot> => {
  const data = await apiClient.post('/simulation/initialize/', payload);
  const snapshot = normalizeWorldSnapshot(data);
  if (!snapshot) {
    throw new Error('Received invalid world snapshot from backend');
  }
  return snapshot;
};

export const stepSimulation = async (): Promise<WorldSnapshot> => {
  console.log('[STEP REQUEST] POST /api/simulation/step/');
  const data = await apiClient.post('/simulation/step/');
  
  const rawEnv = (data?.environment || {}) as any;
  const rawLevels = rawEnv?.flood_water_levels || {};
  const rawEntries = Object.entries(rawLevels);
  const rawGtZero = rawEntries.filter((e: any) => e[1] > 0).length;
  const rawMax = rawEntries.length > 0 ? Math.max(...rawEntries.map((e: any) => e[1] as number)) : 0;
  
  console.log(`[STEP RAW RESPONSE]
tick=${data?.currentTick}
simulationTime=${data?.simulationTime}
activeCalamity=${data?.activeCalamity}
rainfall=${rawEnv?.rainfall_intensity}
floodedZones=${rawGtZero}
maxWater=${rawMax}`);

  const snapshot = normalizeWorldSnapshot(data);
  
  const normEnv = (snapshot?.environment || {}) as any;
  const normLevels = normEnv?.flood_water_levels || {};
  const normEntries = Object.entries(normLevels);
  const normGtZero = normEntries.filter((e: any) => e[1] > 0).length;
  const normMax = normEntries.length > 0 ? Math.max(...normEntries.map((e: any) => e[1] as number)) : 0;

  console.log(`[STEP NORMALIZED RESPONSE]
tick=${snapshot?.simulation?.tick}
simulationTime=${snapshot?.simulation?.timestamp}
activeCalamity=${snapshot?.activeCalamity?.type}
rainfall=${normEnv?.rainfall_intensity}
floodedZones=${normGtZero}
maxWater=${normMax}`);

  if (!snapshot) {
    throw new Error('Received invalid world snapshot from backend');
  }
  return snapshot;
};

export const pauseSimulation = async (): Promise<WorldSnapshot> => {
  const data = await apiClient.post('/simulation/pause/');
  const snapshot = normalizeWorldSnapshot(data);
  if (!snapshot) {
    throw new Error('Received invalid world snapshot from backend');
  }
  return snapshot;
};

export const resumeSimulation = async (): Promise<WorldSnapshot> => {
  const data = await apiClient.post('/simulation/resume/');
  const snapshot = normalizeWorldSnapshot(data);
  if (!snapshot) {
    throw new Error('Received invalid world snapshot from backend');
  }
  return snapshot;
};

export const resetSimulation = async (): Promise<WorldSnapshot> => {
  const data = await apiClient.post('/simulation/reset/');
  const snapshot = normalizeWorldSnapshot(data);
  if (!snapshot) {
    throw new Error('Received invalid world snapshot from backend');
  }
  return snapshot;
};
