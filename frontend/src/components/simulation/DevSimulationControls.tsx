import React, { useState } from 'react';
import { useStore } from '../../store';
import { 
  initializeSimulation, 
  fetchWorldSnapshot, 
  stepSimulation, 
  pauseSimulation, 
  resumeSimulation, 
  resetSimulation 
} from '../../api/simulationApi';
import './DevSimulationControls.css';

export const DevSimulationControls: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const simulationState = useStore((state) => state.status);
  const currentTick = useStore((state) => state.currentTick);
  const applySnapshot = useStore((state) => state.applyWorldSnapshot);

  const handleAction = async (action: () => Promise<any>, actionName: string) => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await action();
      applySnapshot(snapshot);
    } catch (err: any) {
      console.error(`[DevControls] ${actionName} failed:`, err);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dev-simulation-controls">
      <div className="dev-header">
        <h4>Dev Backend Control</h4>
        <span className="dev-status">Tick: {currentTick} | Status: {simulationState}</span>
      </div>
      <div className="dev-actions">
        <button disabled={loading} onClick={() => handleAction(() => initializeSimulation({
          duration: 3600,
          tick_rate: 1,
          calamity_type: 'FLOOD',
          parameters: {
            zone_mapping_path: "data/glb_zone_mapping.json",
            infrastructure_path: "data/infrastructure.json",
            population_path: "data/population.json",
            shelters_path: "data/shelters.json",
            representative_agent_count: 250,
            severity: 2,
            intervention_level: 0.5
          }
        }), 'Initialize (Flood)')}>Init</button>
        <button disabled={loading} onClick={() => handleAction(() => fetchWorldSnapshot(), 'Fetch State')}>State</button>
        <button disabled={loading} onClick={() => handleAction(() => stepSimulation(), 'Step')}>Step</button>
        <button disabled={loading} onClick={() => handleAction(() => pauseSimulation(), 'Pause')}>Pause</button>
        <button disabled={loading} onClick={() => handleAction(() => resumeSimulation(), 'Resume')}>Resume</button>
        <button disabled={loading} onClick={() => handleAction(() => resetSimulation(), 'Reset')}>Reset</button>
      </div>
      {error && <div className="dev-error">{error}</div>}
    </div>
  );
};
