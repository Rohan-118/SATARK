"""
SATARK risk assessment engine.

This module converts simulation/calamity/cascade information into
one structured overall risk assessment.

Risk is rule-based in the current MVP.

It does not:
    - simulate disasters
    - predict ML impact
    - modify infrastructure
    - control human agents
    - optimize interventions
    - generate recommendations
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


# ----------------------------------------------------------------------
# Default risk weights
# ----------------------------------------------------------------------

DEFAULT_RISK_WEIGHTS = {
    "casualties": 0.35,
    "infrastructure_failure": 0.25,
    "flooding_severity": 0.20,
    "crowd_congestion": 0.20,
}


# ----------------------------------------------------------------------
# Structured risk result
# ----------------------------------------------------------------------


@dataclass(frozen=True)
class RiskAssessment:
    """
    Structured result of one SATARK risk evaluation.

    composite_risk_score:
        Overall risk score from 0 to 100.

    severity_label:
        Human-readable severity classification.

    breakdown:
        Individual component scores, each from 0 to 100.

    explainable_summary:
        Human-readable reasons contributing to the risk level.
    """

    composite_risk_score: float

    severity_label: str

    breakdown: dict[str, float]

    explainable_summary: list[str]

    def to_dict(self) -> dict[str, Any]:
        """
        Return a JSON-compatible representation.
        """

        return {
            "composite_risk_score": round(
                self.composite_risk_score,
                1,
            ),
            "severity_label": self.severity_label,
            "breakdown": {
                key: round(
                    value,
                    1,
                )
                for key, value in self.breakdown.items()
            },
            "explainable_summary": list(
                self.explainable_summary
            ),
        }


# ----------------------------------------------------------------------
# Risk engine
# ----------------------------------------------------------------------


class RiskEngine:
    """
    Rule-based composite risk engine for SATARK.

    Inputs are already-computed simulation results.

    The engine does not own or mutate the Digital Twin.

    Expected information:

        casualties
        infrastructure state
        flood state
        crowd bottlenecks
        total population

    Output:

        RiskAssessment
    """

    def __init__(
        self,
        weights: Mapping[str, float] | None = None,
    ) -> None:

        self.weights = self._validate_weights(
            weights
        )

    # ------------------------------------------------------------------
    # Main API
    # ------------------------------------------------------------------

    def evaluate(
        self,
        *,
        casualties: Mapping[str, Any] | None = None,
        infrastructure: Mapping[
            str,
            Mapping[str, Any],
        ] | None = None,
        flood_states: Mapping[str, float] | None = None,
        bottlenecks: Mapping[str, float] | None = None,
        base_total_population: int = 0,
    ) -> RiskAssessment:
        """
        Evaluate overall system risk.

        Args:
            casualties:
                Casualty information.

                Expected fields include:
                    total_fatalities
                    total_injuries

            infrastructure:
                Infrastructure node states.

                Each node should contain a normalized
                `capacity` value in [0, 1].

            flood_states:
                Zone -> water depth.

            bottlenecks:
                Zone -> congestion ratio.

            base_total_population:
                Population used to normalize casualty impact.

        Returns:
            RiskAssessment
        """

        casualties = casualties or {}
        infrastructure = infrastructure or {}
        flood_states = flood_states or {}
        bottlenecks = bottlenecks or {}

        casualty_score = (
            self._calculate_casualty_score(
                casualties=casualties,
                base_total_population=(
                    base_total_population
                ),
            )
        )

        infrastructure_score = (
            self._calculate_infrastructure_score(
                infrastructure
            )
        )

        flooding_score = (
            self._calculate_flooding_score(
                flood_states
            )
        )

        congestion_score = (
            self._calculate_congestion_score(
                bottlenecks
            )
        )

        composite_score = (
            casualty_score
            * self.weights["casualties"]
            +
            infrastructure_score
            * self.weights[
                "infrastructure_failure"
            ]
            +
            flooding_score
            * self.weights[
                "flooding_severity"
            ]
            +
            congestion_score
            * self.weights[
                "crowd_congestion"
            ]
        )

        composite_score = self._clamp_score(
            composite_score
        )

        severity_label = (
            self._get_severity_label(
                composite_score
            )
        )

        drivers = (
            self._build_explainable_summary(
                casualty_score=casualty_score,
                infrastructure_score=(
                    infrastructure_score
                ),
                flooding_score=flooding_score,
                congestion_score=(
                    congestion_score
                ),
            )
        )

        return RiskAssessment(
            composite_risk_score=round(
                composite_score,
                1,
            ),
            severity_label=severity_label,
            breakdown={
                "casualties": round(
                    casualty_score,
                    1,
                ),
                "infrastructure": round(
                    infrastructure_score,
                    1,
                ),
                "flooding": round(
                    flooding_score,
                    1,
                ),
                "congestion": round(
                    congestion_score,
                    1,
                ),
            },
            explainable_summary=drivers,
        )

    # ------------------------------------------------------------------
    # Casualty component
    # ------------------------------------------------------------------

    @staticmethod
    def _calculate_casualty_score(
        *,
        casualties: Mapping[str, Any],
        base_total_population: int,
    ) -> float:
        """
        Calculate casualty contribution to overall risk.

        Fatalities receive a weight of 3.
        Injuries receive a weight of 1.

        The result is normalized against total population.
        """

        fatalities = float(
            casualties.get(
                "total_fatalities",
                0,
            )
        )

        injuries = float(
            casualties.get(
                "total_injuries",
                0,
            )
        )

        weighted_casualties = (
            fatalities * 3.0
            +
            injuries
        )

        population = max(
            int(base_total_population),
            1,
        )

        score = (
            weighted_casualties
            / population
        ) * 200.0

        return RiskEngine._clamp_score(
            score
        )

    # ------------------------------------------------------------------
    # Infrastructure component
    # ------------------------------------------------------------------

    @staticmethod
    def _calculate_infrastructure_score(
        infrastructure: Mapping[
            str,
            Mapping[str, Any],
        ],
    ) -> float:
        """
        Calculate infrastructure failure risk.

        Uses:

            1 - average infrastructure capacity

        Capacity must be normalized to [0, 1].
        """

        if not infrastructure:
            return 0.0

        capacities = []

        for node_id, node in (
            infrastructure.items()
        ):
            if "capacity" not in node:
                raise ValueError(
                    "Infrastructure node "
                    f"'{node_id}' is missing "
                    "'capacity'."
                )

            capacity = float(
                node["capacity"]
            )
            backup_power = float(
                node.get("backup_power", 0.0)
            )
            effective_capacity = max(capacity, backup_power)

            if not 0.0 <= effective_capacity <= 1.0:
                raise ValueError(
                    "Infrastructure capacity for "
                    f"'{node_id}' must be within [0, 1]."
                )

            capacities.append(
                effective_capacity
            )

        average_capacity = (
            sum(capacities)
            / len(capacities)
        )

        score = (
            1.0
            - average_capacity
        ) * 100.0

        return RiskEngine._clamp_score(
            score
        )

    # ------------------------------------------------------------------
    # Flooding component
    # ------------------------------------------------------------------

    @staticmethod
    def _calculate_flooding_score(
        flood_states: Mapping[
            str,
            float,
        ],
    ) -> float:
        """
        Calculate flood severity risk.

        Peak water depth is normalized against a 3 metre maximum.
        """

        if not flood_states:
            return 0.0

        max_flood = max(
            float(depth)
            for depth in flood_states.values()
        )

        if max_flood < 0:
            raise ValueError(
                "Flood water depth cannot be negative."
            )

        score = (
            max_flood
            / 3.0
        ) * 100.0

        return RiskEngine._clamp_score(
            score
        )

    # ------------------------------------------------------------------
    # Congestion component
    # ------------------------------------------------------------------

    @staticmethod
    def _calculate_congestion_score(
        bottlenecks: Mapping[
            str,
            float,
        ],
    ) -> float:
        """
        Calculate crowd-congestion risk.

        A congestion ratio:

            <= 1.0
                no additional congestion risk

            1.0 -> 3.0
                scaled to 0 -> 100

            >= 3.0
                capped at 100
        """

        if not bottlenecks:
            return 0.0

        max_bottleneck = max(
            float(value)
            for value in bottlenecks.values()
        )

        if max_bottleneck < 0:
            raise ValueError(
                "Bottleneck ratio cannot be negative."
            )

        score = (
            (
                max_bottleneck
                - 1.0
            )
            / 2.0
        ) * 100.0

        return RiskEngine._clamp_score(
            score
        )

    # ------------------------------------------------------------------
    # Explainability
    # ------------------------------------------------------------------

    @staticmethod
    def _build_explainable_summary(
        *,
        casualty_score: float,
        infrastructure_score: float,
        flooding_score: float,
        congestion_score: float,
    ) -> list[str]:
        """
        Build human-readable explanations for the risk result.

        Thresholds preserve the existing risk algorithm's behaviour.
        """

        drivers: list[str] = []

        if flooding_score > 50:
            drivers.append(
                "Severe flooding detected with "
                "peak depths reaching hazardous levels."
            )

        if infrastructure_score > 40:
            drivers.append(
                "Critical infrastructure grid "
                "degradation is impacting emergency "
                "response and medical triage."
            )

        if congestion_score > 30:
            drivers.append(
                "Major transit bottlenecks are "
                "trapping crowds in high-risk zones."
            )

        if casualty_score > 25:
            drivers.append(
                "Casualty numbers are rising due to "
                "environmental exposure and system strain."
            )

        if not drivers:
            drivers.append(
                "The situation is currently stable "
                "with minimal systemic disruption."
            )

        return drivers

    # ------------------------------------------------------------------
    # Severity
    # ------------------------------------------------------------------

    @staticmethod
    def _get_severity_label(
        score: float,
    ) -> str:
        """
        Convert a numerical risk score to a severity label.
        """

        if score >= 75:
            return "CRITICAL EMERGENCY"

        if score >= 50:
            return "HIGH RISK"

        if score >= 25:
            return "MODERATE STRAIN"

        return "STABLE"

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    @staticmethod
    def _validate_weights(
        weights: Mapping[
            str,
            float,
        ] | None,
    ) -> dict[str, float]:
        """
        Validate and normalize risk weights.

        The weights must contain exactly the four known risk
        components and must sum to 1.
        """

        if weights is None:
            return dict(
                DEFAULT_RISK_WEIGHTS
            )

        expected_keys = set(
            DEFAULT_RISK_WEIGHTS.keys()
        )

        received_keys = set(
            weights.keys()
        )

        missing = (
            expected_keys
            - received_keys
        )

        unexpected = (
            received_keys
            - expected_keys
        )

        if missing:
            raise ValueError(
                "Missing risk weight(s): "
                f"{sorted(missing)}"
            )

        if unexpected:
            raise ValueError(
                "Unexpected risk weight(s): "
                f"{sorted(unexpected)}"
            )

        normalized = {
            key: float(
                weights[key]
            )
            for key in expected_keys
        }

        if any(
            value < 0
            for value in normalized.values()
        ):
            raise ValueError(
                "Risk weights cannot be negative."
            )

        total = sum(
            normalized.values()
        )

        if abs(
            total - 1.0
        ) > 1e-9:
            raise ValueError(
                "Risk weights must sum to 1.0."
            )

        return normalized

    @staticmethod
    def _clamp_score(
        score: float,
    ) -> float:
        """
        Clamp a score to the standard 0-100 risk range.
        """

        return max(
            0.0,
            min(
                100.0,
                float(score),
            )
        )