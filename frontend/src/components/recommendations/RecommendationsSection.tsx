import React, { useState } from 'react';
import { useStore } from '../../store';
import { applyIntervention } from '../../api/simulationApi';
import { InterventionList } from './InterventionList';

export const RecommendationsSection: React.FC = () => {
  const {
    environment,
    applyWorldSnapshot,
    isSimulationStepping,
    setIsSimulationMutating,
  } = useStore();

  const [selectedInterventionIds, setSelectedInterventionIds] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);

  const recommendations = environment?.decision?.recommendations || [];

  const handleToggle = (id: string) => {
    setSelectedInterventionIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleApply = async () => {
    if (selectedInterventionIds.length === 0) return;

    if (useStore.getState().isSimulationStepping) {
      return;
    }

    setApplying(true);
    setIsSimulationMutating(true);
    try {
      let updatedSnapshot = null;
      for (const id of selectedInterventionIds) {
        updatedSnapshot = await applyIntervention(id);
      }
      if (updatedSnapshot) {
        applyWorldSnapshot(updatedSnapshot);
      }
      setSelectedInterventionIds([]);
    } catch (e) {
      console.error('Failed to apply intervention', e);
      alert('Failed to apply intervention');
    } finally {
      setApplying(false);
      setIsSimulationMutating(false);
    }
  };

  return (
    <div className="telemetry-card interventions-telemetry-card">
      <div className="telemetry-card-title">
        <span className="card-badge">AI DECISION MATRIX</span>
        <h3>RECOMMENDED INTERVENTIONS</h3>
      </div>
      <InterventionList
        recommendations={recommendations}
        selectedInterventionIds={selectedInterventionIds}
        onToggleIntervention={handleToggle}
      />
      <button
        className="apply-btn cyber-apply-btn"
        disabled={selectedInterventionIds.length === 0 || applying || isSimulationStepping}
        onClick={handleApply}
      >
        {applying ? 'EXECUTING COUNTER-MEASURE...' : `AUTHORIZE INTERVENTIONS (${selectedInterventionIds.length})`}
      </button>
    </div>
  );
};

