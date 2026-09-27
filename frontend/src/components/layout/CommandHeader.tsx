import React from 'react';
import { ViewportModeToggle } from './ViewportModeToggle';
import { useStore } from '../../store';
import './CommandHeader.css';

export const CommandHeader: React.FC = () => {
  const { workflowState, activeCalamity, currentTick, environment } = useStore();

  // Calculate live water depth for DEFCON threat calculation
  let maxWaterCm = 0;
  if (environment?.flood_water_levels) {
    const levels = Object.values(environment.flood_water_levels as Record<string, number>);
    if (levels.length > 0) {
      maxWaterCm = Math.round(Math.max(...levels) * 100);
    }
  }

  // Derive DEFCON and threat assessment
  let defconLevel = 'DEFCON 5';
  let threatLabel = 'ALL SYSTEMS NOMINAL';
  let threatClass = 'threat-nominal';

  if (workflowState === 'disaster-active') {
    if (maxWaterCm >= 35) {
      defconLevel = 'DEFCON 1';
      threatLabel = `CRITICAL INUNDATION (${maxWaterCm}cm)`;
      threatClass = 'threat-critical';
    } else if (maxWaterCm >= 15) {
      defconLevel = 'DEFCON 2';
      threatLabel = `SEVERE FLOOD ALERT (${maxWaterCm}cm)`;
      threatClass = 'threat-severe';
    } else {
      defconLevel = 'DEFCON 3';
      threatLabel = 'MONSOON SURGE ADVISORY';
      threatClass = 'threat-warning';
    }
  } else if (workflowState === 'disaster-finished') {
    defconLevel = 'DEFCON 4';
    threatLabel = 'POST-INCIDENT STABILIZATION';
    threatClass = 'threat-stabilized';
  } else if (workflowState === 'zone-selected') {
    defconLevel = 'DEFCON 4';
    threatLabel = 'ZONE TARGETED';
    threatClass = 'threat-targeted';
  }

  const getStatusText = () => {
    switch (workflowState) {
      case 'disaster-active':
        return 'ACTIVE SIMULATION';
      case 'disaster-finished':
        return 'SIMULATION FINISHED';
      case 'zone-selected':
        return 'ZONE SELECTED';
      default:
        return 'STANDBY';
    }
  };

  const getStatusClass = () => {
    switch (workflowState) {
      case 'disaster-active':
        return 'status-running';
      case 'disaster-finished':
        return 'status-completed';
      case 'zone-selected':
        return 'status-paused';
      default:
        return 'status-idle';
    }
  };

  // Live military simulation time based on tick
  const simBaseHour = 14; // Mumbai 2005 starts at 14:00
  const simCurrentHour = (simBaseHour + currentTick) % 24;
  const simTimeDisplay = `${String(simCurrentHour).padStart(2, '0')}:00 UTC`;
  const tickDisplay = `T+${String(currentTick).padStart(2, '0')}H`;

  return (
    <div className="command-header">
      {/* Brand & Tactical Radar Beacon */}
      <div className="command-header-brand">
        <div className={`radar-beacon-container ${threatClass}`}>
          <svg className="radar-beacon-svg" viewBox="0 0 32 32">
            <circle className="radar-ring radar-ring-outer" cx="16" cy="16" r="13" />
            <circle className="radar-ring radar-ring-inner" cx="16" cy="16" r="7" />
            <circle className="radar-center-dot" cx="16" cy="16" r="3" />
            <line className="radar-sweep-arm" x1="16" y1="16" x2="29" y2="16" />
          </svg>
        </div>
        <div className="brand-text-col">
          <div className="brand-title-row">
            <h1>SATARK</h1>
            <span className="brand-tag">MIL-SPEC DT-01</span>
          </div>
          <span className="brand-subtitle">DISASTER-RESPONSE DIGITAL TWIN</span>
        </div>
      </div>

      {/* Center Viewport Switcher */}
      <ViewportModeToggle />

      {/* Right Metrics & Telemetry Chips */}
      <div className="command-header-metrics">
        {/* Tactical Military Time Chip */}
        <div className="header-chip sim-time-chip">
          <span className="chip-label">SIM TIME</span>
          <span className="chip-value">
            <span className="sim-clock-glow">{simTimeDisplay}</span>
            <span className="sim-tick-badge">{tickDisplay}</span>
          </span>
        </div>

        {/* Threat Level / DEFCON Badge */}
        <div className={`header-chip threat-badge ${threatClass}`}>
          <span className="threat-defcon">{defconLevel}</span>
          <span className="threat-title">{threatLabel}</span>
        </div>

        {/* Calamity & System Status */}
        <div className="metric">
          <span className="metric-label">CALAMITY</span>
          <span className="metric-value">
            {activeCalamity?.type ?? 'FLOOD'}
          </span>
        </div>

        <div className="metric">
          <span className="metric-label">SYSTEM STATUS</span>
          <span className={`metric-value ${getStatusClass()}`}>
            {getStatusText()}
          </span>
        </div>
      </div>
    </div>
  );
};


