import React, { useState } from 'react';
import { useStore } from '../../store';
import { applyIntervention } from '../../api/simulationApi';
import './RightPanel.css';

export const RightPanel: React.FC = () => {
  const { workflowState, setWorkflowState, setSelectedZoneId, environment, applyWorldSnapshot } = useStore();
  const [selectedInterventionId, setSelectedInterventionId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // Right Panel is only visible if a disaster is active, finished, or earthquake-result
  if (workflowState !== 'disaster-active' && workflowState !== 'disaster-finished' && workflowState !== 'earthquake-result') {
    return null;
  }

  const handleCloseDisaster = () => {
    // Reset to idle state
    setWorkflowState('idle');
    setSelectedZoneId(null);
  };

  return (
    <div className="right-panel">
      <div className="panel-content">
        {(workflowState === 'disaster-active' || workflowState === 'earthquake-result') && (
          <>
            <div className="risk-section" style={{ marginBottom: '20px' }}>
              <h3>RISK ASSESSMENT</h3>
              {environment?.risk?.available && environment.risk.assessment ? (
                <>
                  <div className="stat-row">
                    <span className="stat-label">Risk Score</span>
                    <span className="stat-value">{environment.risk.assessment.composite_risk_score}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Severity</span>
                    <span className="stat-value">{environment.risk.assessment.severity_label}</span>
                  </div>
                  <div className="stat-row" style={{ marginTop: '10px' }}>
                    <span className="stat-label">Infrastructure Risk</span>
                    <span className="stat-value">{environment.risk.assessment.breakdown?.infrastructure !== undefined ? `${environment.risk.assessment.breakdown.infrastructure}%` : 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Estimated Affected</span>
                    <span className="stat-value">
                      {environment.subsystems?.casualties
                        ? ((environment.subsystems.casualties.total_fatalities ?? 0) + (environment.subsystems.casualties.total_injuries ?? 0)).toLocaleString()
                        : 'Unavailable'}
                    </span>
                  </div>
                  {workflowState !== 'earthquake-result' && (
                    <>
                      <div className="stat-row">
                        <span className="stat-label">Flooding Risk</span>
                        <span className="stat-value">{environment.risk.assessment.breakdown?.flooding !== undefined ? `${environment.risk.assessment.breakdown.flooding}%` : 'N/A'}</span>
                      </div>
                      <div className="stat-row">
                        <span className="stat-label">Congestion Risk</span>
                        <span className="stat-value">{environment.risk.assessment.breakdown?.congestion !== undefined ? `${environment.risk.assessment.breakdown.congestion}%` : 'N/A'}</span>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="intervention-list">
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', padding: '10px 0' }}>Risk unavailable</p>
                </div>
              )}
            </div>

            <div className="interventions-section">
              <h3>RECOMMENDED INTERVENTIONS</h3>
              {environment?.decision?.recommendations && environment.decision.recommendations.length > 0 ? (
                <div className="intervention-list">
                  {environment.decision.recommendations.map((rec: any) => (
                    <div className="intervention-item" key={rec.intervention?.intervention_id}>
                      <input 
                        type="checkbox" 
                        checked={selectedInterventionId === rec.intervention?.intervention_id}
                        onChange={() => setSelectedInterventionId(
                          selectedInterventionId === rec.intervention?.intervention_id ? null : rec.intervention?.intervention_id
                        )}
                      />
                      <label>{rec.intervention?.name || rec.intervention?.intervention_id?.replace(/_/g, ' ').toUpperCase()}</label>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="intervention-list">
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', padding: '10px 0' }}>No recommendation returned</p>
                </div>
              )}
              
              <button 
                className="apply-btn" 
                disabled={!selectedInterventionId || applying}
                onClick={async () => {
                  if (!selectedInterventionId) return;
                  setApplying(true);
                  try {
                    const updatedSnapshot = await applyIntervention(selectedInterventionId);
                    applyWorldSnapshot(updatedSnapshot);
                    setSelectedInterventionId(null);
                  } catch (e) {
                    console.error("Failed to apply intervention", e);
                    alert("Failed to apply intervention");
                  } finally {
                    setApplying(false);
                  }
                }}
              >
                  {applying ? 'APPLYING...' : 'APPLY INTERVENTION'}
              </button>
            </div>
            
            {workflowState === 'earthquake-result' && (
                <button className="close-disaster-btn" onClick={handleCloseDisaster} style={{ marginTop: '20px' }}>
                    CLOSE DISASTER
                </button>
            )}
          </>
        )}

        {workflowState === 'disaster-finished' && (
          <>
            <div className="final-summary">
              <h3>FINAL DISASTER SUMMARY</h3>
              <div className="summary-stats">
                <div className="stat-row">
                  <span className="stat-label">FINAL RISK</span>
                  <span className="stat-value">NO DATA</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">CASUALTIES</span>
                  <span className="stat-value">NO DATA</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">PROPERTY DAMAGE</span>
                  <span className="stat-value">NO DATA</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">INFRASTRUCTURE DAMAGE</span>
                  <span className="stat-value">NO DATA</span>
                </div>
              </div>
            </div>
            
            <button className="close-disaster-btn" onClick={handleCloseDisaster}>
              CLOSE DISASTER
            </button>
          </>
        )}
      </div>
    </div>
  );
};
