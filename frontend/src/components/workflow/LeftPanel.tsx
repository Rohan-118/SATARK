import React from 'react';
import { useStore } from '../../store';
import { ZonePanel } from '../digitalTwin/ZonePanel';
import { ZoneConfiguration } from '../simulation/ZoneConfiguration';
import './LeftPanel.css';

export const LeftPanel: React.FC = () => {
  const {
    workflowState,
    selectedZoneId,
    setSelectedZoneId,
    zones,
    agents,
    environment,
    finalEnvironment,
    activeCalamity,
    duration,
    currentTick,
  } = useStore();

  const displayEnv = workflowState === 'disaster-finished' ? finalEnvironment : environment;

  // Left Panel is hidden if idle
  if (workflowState === 'idle') {
    return null;
  }

  // Calculate days / hours remaining
  let remainingTimeDisplay = 'T+0H';
  let totalHours = 24;
  if (activeCalamity?.type === 'FLOOD' && duration !== undefined) {
    totalHours = Math.max(1, Math.floor(duration / 3600));
    const hoursRemaining = Math.max(0, totalHours - currentTick);
    remainingTimeDisplay = `${hoursRemaining}h remaining`;
  }

  // Extract Live Ward Triage: Top 5 most flooded wards
  const waterLevels: Record<string, number> = displayEnv?.flood_water_levels || {};
  const triageList = Object.entries(waterLevels)
    .map(([zid, depthMeters]) => {
      const zoneData = zones.find((z) => z.id === zid);
      const depthCm = Math.round(depthMeters * 100);
      return {
        id: zid,
        name: zoneData?.ward_name || zoneData?.name || `Zone ${zid}`,
        wardCode: zoneData?.ward_code || zid,
        depthCm,
        depthMeters,
      };
    })
    .sort((a, b) => b.depthCm - a.depthCm)
    .slice(0, 5);

  // Stormwater Hydraulic Drainage Telemetry
  const drainage = displayEnv?.drainage;
  const avgPipeLoad = drainage?.avg_pipe_utilization !== undefined
    ? Math.round(drainage.avg_pipe_utilization * 100)
    : Math.min(95, Math.round(35 + (currentTick * 5.5)));
  
  // Count surcharging zones
  let surchargingZonesCount = 0;
  if (drainage?.zone_drainage) {
    surchargingZonesCount = Object.values(drainage.zone_drainage as Record<string, any>).filter(
      (zd) => zd.is_surcharging
    ).length;
  } else if (triageList.length > 0) {
    surchargingZonesCount = triageList.filter((t) => t.depthCm >= 25).length;
  }

  // Citizen Evacuation Progress Telemetry
  const agentArray = Object.values(agents);
  const totalAgents = agentArray.length > 0 ? agentArray.length : 250;
  const safeAgents = agentArray.filter((a) => a.state === 'SAFE').length;
  const panicAgents = agentArray.filter((a) => a.state === 'PANIC').length;
  const evacuatingAgents = totalAgents - safeAgents;
  const shelteredPercent = Math.round((safeAgents / totalAgents) * 100);

  const handleFlyToZone = (zoneId: string) => {
    setSelectedZoneId(zoneId);
    window.dispatchEvent(
      new CustomEvent('satark:focus-zone', {
        detail: { zoneId, force: true },
      })
    );
  };

  return (
    <div className="left-panel">
      <div className="panel-content">
        {workflowState === 'zone-selected' && (
          <>
            {selectedZoneId ? (
              <ZonePanel />
            ) : (
              <div className="panel-placeholder">
                <p>No zone selected.</p>
              </div>
            )}
            <ZoneConfiguration />
          </>
        )}

        {workflowState === 'disaster-active' && (
          <div className="disaster-monitoring">
            {/* Header Telemetry Card */}
            <div className="telemetry-card header-telemetry-card">
              <div className="telemetry-card-title">
                <span className="card-badge">LIVE FEED</span>
                <h3>TACTICAL STORM TELEMETRY</h3>
              </div>
              <div className="monitoring-stats">
                <div className="stat-row">
                  <span className="stat-label">STORM PHASE</span>
                  <span className="stat-value status-active-pulse">INUNDATION PEAK</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">SIMULATION TICK</span>
                  <span className="stat-value">T+{String(currentTick).padStart(2, '0')}H ({remainingTimeDisplay})</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">RAINFALL RATE</span>
                  <span className="stat-value accent-cyan">
                    {displayEnv?.rainfall_intensity ? `${Math.round(displayEnv.rainfall_intensity)} mm/h` : '190 mm/h'}
                  </span>
                </div>
              </div>
            </div>

            {/* Live Ward Triage Leaderboard */}
            <div className="telemetry-card triage-board-card">
              <div className="telemetry-card-title">
                <span className="card-badge triage-badge">PRIORITY</span>
                <h4>WARD TRIAGE LEADERBOARD</h4>
              </div>
              <p className="telemetry-hint">Click any ward to lock tactical 3D viewport</p>
              
              <div className="triage-list">
                {triageList.length > 0 ? (
                  triageList.map((item, index) => {
                    let severityClass = 'sev-nominal';
                    let severityLabel = 'NOMINAL';
                    if (item.depthCm >= 35) {
                      severityClass = 'sev-critical';
                      severityLabel = 'CRITICAL BREACH';
                    } else if (item.depthCm >= 20) {
                      severityClass = 'sev-hazardous';
                      severityLabel = 'HAZARDOUS';
                    } else if (item.depthCm >= 8) {
                      severityClass = 'sev-warning';
                      severityLabel = 'MODERATE';
                    }

                    return (
                      <div
                        key={item.id}
                        className={`triage-row ${severityClass}`}
                        onClick={() => handleFlyToZone(item.id)}
                        title={`Click to focus 3D camera on ${item.name}`}
                      >
                        <div className="triage-rank">#{index + 1}</div>
                        <div className="triage-info">
                          <span className="triage-name">{item.name}</span>
                          <span className="triage-id">ID: {item.id}</span>
                        </div>
                        <div className="triage-metrics">
                          <span className="triage-depth">{item.depthCm} cm</span>
                          <span className={`triage-tag ${severityClass}`}>{severityLabel}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="triage-empty">Scanning urban elevation zones...</div>
                )}
              </div>
            </div>

            {/* Hydraulic Pipe Network Load Gauge */}
            <div className="telemetry-card gauge-card">
              <div className="telemetry-card-title">
                <span className="card-badge">HYDRAULICS</span>
                <h4>DRAINAGE NETWORK LOAD</h4>
              </div>
              <div className="hydraulic-gauge-container">
                <div className="gauge-header">
                  <span className="gauge-label">Pipe Capacity Utilization</span>
                  <span className="gauge-value">{avgPipeLoad}%</span>
                </div>
                <div className="segmented-led-bar">
                  {Array.from({ length: 12 }).map((_, i) => {
                    const threshold = ((i + 1) / 12) * 100;
                    const isLit = avgPipeLoad >= threshold;
                    let segmentClass = 'led-green';
                    if (i >= 9) segmentClass = 'led-red';
                    else if (i >= 6) segmentClass = 'led-amber';

                    return (
                      <span
                        key={i}
                        className={`led-segment ${segmentClass} ${isLit ? 'lit' : 'unlit'}`}
                      />
                    );
                  })}
                </div>
                {surchargingZonesCount > 0 && (
                  <div className="surcharge-warning-badge">
                    <span className="warning-icon">⚠</span>
                    <span>{surchargingZonesCount} Wards Surcharging Backflow</span>
                  </div>
                )}
              </div>
            </div>

            {/* Citizen Evacuation Progress Meter */}
            <div className="telemetry-card gauge-card">
              <div className="telemetry-card-title">
                <span className="card-badge">EVACUATION</span>
                <h4>CITIZEN SAFETY STATUS</h4>
              </div>
              <div className="evacuation-telemetry">
                <div className="gauge-header">
                  <span className="gauge-label">Safe in Shelters</span>
                  <span className="gauge-value safe-count">
                    {safeAgents} / {totalAgents} ({shelteredPercent}%)
                  </span>
                </div>
                <div className="evac-progress-bar-bg">
                  <div
                    className="evac-progress-bar-fill"
                    style={{ width: `${Math.max(5, shelteredPercent)}%` }}
                  />
                </div>
                <div className="evac-sub-stats">
                  <span className="sub-stat">
                    <span className="dot dot-safe" /> Safe: <strong>{safeAgents}</strong>
                  </span>
                  <span className="sub-stat">
                    <span className="dot dot-panic" /> Evacuating: <strong>{panicAgents || evacuatingAgents}</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {workflowState === 'disaster-finished' && (
          <div className="intervention-impact">
            <div className="telemetry-card header-telemetry-card">
              <div className="telemetry-card-title">
                <span className="card-badge">EVALUATION</span>
                <h3>INCIDENT RESOLUTION</h3>
              </div>
              <div className="impact-section">
                <h4>APPLIED INTERVENTIONS</h4>
                {displayEnv?.decision?.active_interventions &&
                displayEnv.decision.active_interventions.length > 0 ? (
                  <ul className="applied-measures-list">
                    {displayEnv.decision.active_interventions.map((measure: any) => (
                      <li key={measure.intervention_id}>
                        {measure.name || measure.intervention_id.replace(/_/g, ' ').toUpperCase()}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="no-data">No active counter-measures applied</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

