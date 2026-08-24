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
  console.log('[DEBUG AGENTS] raw /api/simulation/initialize/ response:', data);
  const snapshot = normalizeWorldSnapshot(data);
  console.log('[DEBUG AGENTS] normalizedWorldSnapshot output:', snapshot?.agents?.agents?.length, 'agents. Full:', snapshot);

  if (!snapshot) {
    throw new Error('Received invalid world snapshot from backend');
  }
  return snapshot;
};

export const stepSimulation = async (): Promise<WorldSnapshot> => {
  const data = await apiClient.post('/simulation/step/');
  console.log('[DEBUG FLOOD] raw /api/simulation/step/ response:', data);
  const snapshot = normalizeWorldSnapshot(data);
  console.log('[DEBUG FLOOD] normalizedWorldSnapshot output:', { activeCalamity: snapshot?.activeCalamity, environment: snapshot?.environment });
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
