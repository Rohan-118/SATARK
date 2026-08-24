import React, { useState } from 'react';
import { CalamityType } from '../../types/domain';
import { useStore } from '../../store';
import { initializeSimulation } from '../../api/simulationApi';
import './ZoneConfiguration.css';

export const ZoneConfiguration: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [disasterType, setDisasterType] = useState<CalamityType>('FLOOD');
  const [duration, setDuration] = useState<number>(3); // Default 3 days for Flood
  const [severity, setSeverity] = useState<string>('Medium');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { selectedZoneId, applyWorldSnapshot, setWorkflowState } = useStore();

  const handleTypeChange = (type: CalamityType) => {
    setDisasterType(type);
    if (type === 'FLOOD') {
      setDuration(3);
    } else {
      setDuration(15); // Default 15 mins for Earthquake
    }
  };

  const maxDuration = disasterType === 'FLOOD' ? 7 : 60;
  const durationUnit = disasterType === 'FLOOD' ? 'DAYS' : 'MINUTES';

  const handleStartSimulation = async () => {
    if (!selectedZoneId) {
      setError('Please select a zone first.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payloadDuration = disasterType === 'FLOOD' ? duration * 86400 : duration * 60;
      const severityMap: Record<string, number> = { 'Low': 1, 'Medium': 2, 'High': 3 };
      
      const payload = {
        duration: payloadDuration,
        tick_rate: 1, 
        calamity_type: disasterType,
        parameters: {
          zone_mapping_path: "data/glb_zone_mapping.json",
          infrastructure_path: "data/infrastructure.json",
          population_path: "data/population.json",
          shelters_path: "data/shelters.json",
          representative_agent_count: 250,
          severity: severityMap[severity] || 2,
          intervention_level: 0.0,
          zone_id: selectedZoneId
        }
      };

      const snapshot = await initializeSimulation(payload);
      applyWorldSnapshot(snapshot);
      setWorkflowState('disaster-active');
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  if (!isExpanded) {
    return (
      <div className="zone-configuration-collapsed">
        <button className="simulate-btn" onClick={() => setIsExpanded(true)}>
          SIMULATE DISASTER
        </button>
      </div>
    );
  }

  return (
    <div className="zone-configuration">
      <div className="config-header">
        <h4>DISASTER CONFIGURATION</h4>
        <button className="collapse-btn" onClick={() => setIsExpanded(false)}>&times;</button>
      </div>
      
      <div className="config-body">
        <div className="form-group">
          <label>CALAMITY TYPE</label>
          <div className="button-group">
            <button 
              className={`config-btn ${disasterType === 'FLOOD' ? 'active' : ''}`}
              onClick={() => handleTypeChange('FLOOD')}
            >
              FLOOD
            </button>
            <button 
              className={`config-btn ${disasterType === 'EARTHQUAKE' ? 'active' : ''}`}
              onClick={() => handleTypeChange('EARTHQUAKE')}
            >
              EARTHQUAKE
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>SEVERITY</label>
          <div className="button-group">
            <button 
              className={`config-btn ${severity === 'Low' ? 'active' : ''}`}
              onClick={() => setSeverity('Low')}
            >
              LOW
            </button>
            <button 
              className={`config-btn ${severity === 'Medium' ? 'active' : ''}`}
              onClick={() => setSeverity('Medium')}
            >
              MEDIUM
            </button>
            <button 
              className={`config-btn ${severity === 'High' ? 'active' : ''}`}
              onClick={() => setSeverity('High')}
            >
              HIGH
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>DURATION ({durationUnit})</label>
          <div className="duration-input-wrapper">
            <input 
              type="number" 
              min={1} 
              max={maxDuration} 
              value={duration}
              onChange={(e) => setDuration(Math.min(Math.max(1, parseInt(e.target.value) || 1), maxDuration))}
              className="duration-input"
            />
            <span className="unit-label">{durationUnit}</span>
          </div>
          <div className="helper-text">Maximum: {maxDuration} {durationUnit.toLowerCase()}</div>
        </div>

        {error && <div className="error-message" style={{ color: '#ff4d4f', marginBottom: '10px' }}>{error}</div>}
        
        <button 
          className="simulate-action-btn" 
          onClick={handleStartSimulation} 
          disabled={loading || disasterType === 'EARTHQUAKE'}
        >
          {loading ? 'INITIALIZING...' : 'START SIMULATION'}
        </button>
      </div>
    </div>
  );
};
