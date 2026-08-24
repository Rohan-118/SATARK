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
  
  // Earthquake state
  const [magnitude, setMagnitude] = useState<number>(7.0);
  const [depthKm, setDepthKm] = useState<number>(10.0);

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
      let epicenterLat = 0.0;
      let epicenterLon = 0.0;
      
      if (disasterType === 'EARTHQUAKE') {
          try {
              const res = await fetch('/data/glb_zone_mapping.json');
              const data = await res.json();
              const zoneInfo = data.zones?.find((z: any) => z.id === selectedZoneId);
              if (zoneInfo) {
                  epicenterLat = zoneInfo.lat || 0.0;
                  epicenterLon = zoneInfo.lon || 0.0;
              }
          } catch (e) {
              console.warn("Could not fetch glb_zone_mapping.json for lat/lon", e);
          }
      }

      const payload = {
        duration: payloadDuration,
        tick_rate: 1.0 / 60.0, // 1 tick = 60 simulation seconds
        calamity_type: disasterType,
        parameters: {
          zone_mapping_path: "data/glb_zone_mapping.json",
          infrastructure_path: "data/infrastructure.json",
          population_path: "data/population.json",
          shelters_path: "data/shelters.json",
          representative_agent_count: 250,
          severity: severityMap[severity] || 2,
          rainfall_intensity: (severityMap[severity] || 2) * 20.0,
          intervention_level: 0.0,
          zone_id: selectedZoneId,
          ...(disasterType === 'EARTHQUAKE' ? {
              magnitude: magnitude,
              depth_km: depthKm,
              epicenter_lat: epicenterLat,
              epicenter_lon: epicenterLon
          } : {})
        }
      };

      const snapshot = await initializeSimulation(payload);
      applyWorldSnapshot(snapshot);
      
      if (disasterType === 'EARTHQUAKE') {
          setWorkflowState('earthquake-result');
      } else {
          setWorkflowState('disaster-active');
      }
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

        {disasterType === 'FLOOD' && (
            <>
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
            </>
        )}

        {disasterType === 'EARTHQUAKE' && (
            <>
                <div className="form-group">
                    <label>MAGNITUDE</label>
                    <div className="duration-input-wrapper">
                        <input 
                            type="number" 
                            step="0.1"
                            min={1.0} 
                            max={10.0} 
                            value={magnitude}
                            onChange={(e) => setMagnitude(Math.min(Math.max(1.0, parseFloat(e.target.value) || 1.0), 10.0))}
                            className="duration-input"
                        />
                        <span className="unit-label">Mw</span>
                    </div>
                </div>
                <div className="form-group">
                    <label>DEPTH (KM)</label>
                    <div className="duration-input-wrapper">
                        <input 
                            type="number" 
                            step="0.1"
                            min={1.0} 
                            max={700.0} 
                            value={depthKm}
                            onChange={(e) => setDepthKm(Math.min(Math.max(1.0, parseFloat(e.target.value) || 1.0), 700.0))}
                            className="duration-input"
                        />
                        <span className="unit-label">KM</span>
                    </div>
                </div>
                <div className="form-group">
                    <label>EPICENTER ZONE</label>
                    <div className="helper-text" style={{marginTop: '4px', color: 'rgba(255,255,255,0.7)'}}>
                        {selectedZoneId || 'None Selected'}
                    </div>
                </div>
            </>
        )}

        {error && <div className="error-message" style={{ color: '#ff4d4f', marginBottom: '10px' }}>{error}</div>}
        
        <button 
          className="simulate-action-btn" 
          onClick={handleStartSimulation} 
          disabled={loading}
        >
          {loading ? 'INITIALIZING...' : 'START SIMULATION'}
        </button>
      </div>
    </div>
  );
};
