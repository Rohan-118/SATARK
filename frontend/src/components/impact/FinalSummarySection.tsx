import React from 'react';

interface FinalSummarySectionProps {
  displayEnv: any;
  onClose: () => void;
}

const SegmentedLedGauge: React.FC<{ percent: number }> = ({ percent }) => {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="segmented-led-bar mini-gauge">
      {Array.from({ length: 10 }).map((_, i) => {
        const threshold = (i + 1) * 10;
        const isLit = clamped >= threshold - 5;
        let colorClass = 'led-green';
        if (i >= 6) colorClass = 'led-red';
        else if (i >= 3) colorClass = 'led-amber';

        return (
          <span
            key={i}
            className={`led-segment ${colorClass} ${isLit ? 'lit' : 'unlit'}`}
          />
        );
      })}
    </div>
  );
};

export const FinalSummarySection: React.FC<FinalSummarySectionProps> = ({ displayEnv, onClose }) => {
  const casualties = displayEnv?.subsystems?.casualties;
  const assessment = displayEnv?.risk?.assessment;
  const infraDamage = assessment?.breakdown?.infrastructure;
  const totalCasualties = casualties
    ? (casualties.total_fatalities ?? 0) + (casualties.total_injuries ?? 0)
    : 0;

  const score = assessment?.composite_risk_score ?? 'STABILIZED';
  const severity = assessment?.severity_label ?? 'NORMAL';

  return (
    <div className="telemetry-card final-summary-telemetry-card">
      <div className="telemetry-card-title">
        <span className="card-badge">MISSION COMPLETE</span>
        <h3>INCIDENT DEBRIEF & ASSESSMENT</h3>
      </div>

      {/* Final Score Banner */}
      <div className="risk-score-banner">
        <div className="risk-score-block">
          <span className="risk-score-label">RESOLVED RISK SCORE</span>
          <span className="risk-score-number">{score}</span>
        </div>
        <div className="risk-severity-pill sev-nominal">
          <span className="pill-dot" />
          <span>{severity.toUpperCase()}</span>
        </div>
      </div>

      <div className="risk-breakdown-list">
        <div className="risk-meter-row">
          <div className="risk-meter-header">
            <span className="stat-label">INFRASTRUCTURE VULNERABILITY</span>
            <span className="stat-value">{infraDamage !== undefined ? `${infraDamage}%` : 'NOMINAL'}</span>
          </div>
          {infraDamage !== undefined && <SegmentedLedGauge percent={Number(infraDamage)} />}
        </div>

        <div className="stat-row casualty-row">
          <span className="stat-label">TOTAL POPULATION AFFECTED</span>
          <span className="stat-value casualty-highlight">
            {totalCasualties.toLocaleString()} citizens affected
          </span>
        </div>

        <div className="stat-row">
          <span className="stat-label">MITIGATION STATUS</span>
          <span className="stat-value" style={{ color: '#10b981' }}>
            SUCCESSFULLY CONTAINED
          </span>
        </div>
      </div>

      {/* Post-Incident Delta Badges */}
      <div className="intervention-delta-badges" style={{ paddingLeft: 0, marginTop: '8px' }}>
        <span className="delta-tag delta-emerald">✓ POPULATION SECURED</span>
        <span className="delta-tag delta-cyan">✓ RUNOFF WATER RECEDING</span>
        <span className="delta-tag delta-blue">✓ CRITICAL GRIDS PROTECTED</span>
      </div>

      <button className="close-disaster-btn" onClick={onClose} style={{ marginTop: '12px' }}>
        ACKNOWLEDGE & CLOSE INCIDENT
      </button>
    </div>
  );
};

