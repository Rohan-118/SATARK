import React from 'react';
import { useStore } from '../../store';
import { ZonePanel } from '../digitalTwin/ZonePanel';
import { ZoneConfiguration } from './ZoneConfiguration';
import './LeftPanel.css';

export const LeftPanel: React.FC = () => {
  const { workflowState, selectedZoneId, environment } = useStore();

  const eqState = environment?.earthquake_state;
  const casualties = environment?.subsystems?.casualties;

  // Left Panel is only visible if a zone is selected OR a disaster is active/finished
  if (workflowState === 'idle') {
    return null;
  }

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
            <h3>DISASTER MONITORING</h3>
            <div className="monitoring-stats">
              <div className="stat-row">
                <span className="stat-label">STATUS</span>
                <span className="stat-value">ACTIVE</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">TIME REMAINING</span>
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
            </div>
            <p className="backend-pending">Waiting for authoritative backend simulation data...</p>
          </div>
        )}

        {workflowState === 'earthquake-result' && eqState && (
          <div className="disaster-monitoring">
            <h3>EARTHQUAKE</h3>
            <div className="monitoring-stats" style={{ marginBottom: '20px' }}>
              <div className="stat-row">
                <span className="stat-label">Magnitude</span>
                <span className="stat-value">{eqState.magnitude}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Depth</span>
                <span className="stat-value">{eqState.depth_km} km</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Epicenter</span>
                <span className="stat-value">
                  {eqState.epicenter?.latitude?.toFixed(4) || '0'}, {eqState.epicenter?.longitude?.toFixed(4) || '0'}
                </span>
              </div>
            </div>

            <h3>EARTHQUAKE IMPACT</h3>
            <div className="monitoring-stats">
              <div className="stat-row">
                <span className="stat-label">PGA</span>
                <span className="stat-value">
                  {eqState.pga && Object.keys(eqState.pga).length > 0
                    ? Math.max(...Object.values(eqState.pga as Record<string, number>)).toFixed(2) + ' g'
                    : 'N/A'}
                </span>
              </div>
              <div className="stat-row" style={{ marginTop: '10px' }}>
                <span className="stat-label">Estimated Fatalities</span>
                <span className="stat-value">{casualties?.total_fatalities ?? 'N/A'}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Estimated Injuries</span>
                <span className="stat-value">{casualties?.total_injuries ?? 'N/A'}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Estimated Total Casualties</span>
                <span className="stat-value">
                  {(casualties?.total_fatalities !== undefined || casualties?.total_injuries !== undefined)
                    ? (casualties.total_fatalities || 0) + (casualties.total_injuries || 0)
                    : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        )}

        {workflowState === 'disaster-finished' && (
          <div className="intervention-impact">
            <h3>INTERVENTION IMPACT</h3>
            <div className="impact-section">
              <h4>APPLIED MEASURES</h4>
              <p className="no-data">NO DATA</p>
            </div>
            <div className="impact-section">
              <h4>REDUCED EXPOSURE</h4>
              <p className="no-data">NO DATA</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
