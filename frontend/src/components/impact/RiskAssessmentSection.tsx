import React from 'react';

interface RiskAssessmentSectionProps {
  environment: any;
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

export const RiskAssessmentSection: React.FC<RiskAssessmentSectionProps> = ({ environment }) => {
  const risk = environment?.risk;
  const casualties = environment?.subsystems?.casualties;
  const isAvailable = Boolean(risk?.available && risk.assessment);
  const assessment = risk?.assessment;

  let severityBadgeClass = 'sev-nominal';
  const severityText = assessment?.severity_label || 'NORMAL';
  if (severityText.toUpperCase().includes('CRITICAL') || severityText.toUpperCase().includes('HIGH')) {
    severityBadgeClass = 'sev-critical';
  } else if (severityText.toUpperCase().includes('MODERATE') || severityText.toUpperCase().includes('ELEVATED')) {
    severityBadgeClass = 'sev-hazardous';
  } else if (severityText.toUpperCase().includes('LOW')) {
    severityBadgeClass = 'sev-warning';
  }

  const infraRisk = assessment?.breakdown?.infrastructure !== undefined ? Number(assessment.breakdown.infrastructure) : null;
  const floodRisk = assessment?.breakdown?.flooding !== undefined ? Number(assessment.breakdown.flooding) : null;
  const congestionRisk = assessment?.breakdown?.congestion !== undefined ? Number(assessment.breakdown.congestion) : null;

  const totalAffected = casualties
    ? (casualties.total_fatalities ?? 0) + (casualties.total_injuries ?? 0)
    : null;

  return (
    <div className="telemetry-card risk-telemetry-card">
      <div className="telemetry-card-title">
        <span className="card-badge">RISK ENGINE</span>
        <h3>INTEGRATED RISK ASSESSMENT</h3>
      </div>

      {isAvailable && assessment ? (
        <>
          {/* Top Score Banner */}
          <div className="risk-score-banner">
            <div className="risk-score-block">
              <span className="risk-score-label">COMPOSITE SCORE</span>
              <span className="risk-score-number">{assessment.composite_risk_score}</span>
            </div>
            <div className={`risk-severity-pill ${severityBadgeClass}`}>
              <span className="pill-dot" />
              <span>{severityText.toUpperCase()}</span>
            </div>
          </div>

          {/* Breakdown Meters with Segmented LEDs */}
          <div className="risk-breakdown-list">
            <div className="risk-meter-row">
              <div className="risk-meter-header">
                <span className="stat-label">INFRASTRUCTURE VULNERABILITY</span>
                <span className="stat-value">{infraRisk !== null ? `${infraRisk}%` : 'N/A'}</span>
              </div>
              {infraRisk !== null && <SegmentedLedGauge percent={infraRisk} />}
            </div>

            <div className="risk-meter-row">
              <div className="risk-meter-header">
                <span className="stat-label">SURFACE INUNDATION THREAT</span>
                <span className="stat-value">{floodRisk !== null ? `${floodRisk}%` : 'N/A'}</span>
              </div>
              {floodRisk !== null && <SegmentedLedGauge percent={floodRisk} />}
            </div>

            <div className="risk-meter-row">
              <div className="risk-meter-header">
                <span className="stat-label">EVACUATION CONGESTION INDEX</span>
                <span className="stat-value">{congestionRisk !== null ? `${congestionRisk}%` : 'N/A'}</span>
              </div>
              {congestionRisk !== null && <SegmentedLedGauge percent={congestionRisk} />}
            </div>

            <div className="stat-row casualty-row">
              <span className="stat-label">PROJECTED AFFECTED CITIZENS</span>
              <span className="stat-value casualty-highlight">
                {totalAffected !== null ? `${totalAffected.toLocaleString()} citizens` : 'Under Modeling'}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="triage-empty">
          <p>Authoritative risk calculation active...</p>
        </div>
      )}
    </div>
  );
};

