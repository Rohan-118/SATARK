from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping

from core.types import SimulationConfig


@dataclass(frozen=True)
class Scenario:
    """
    Immutable description of one SATARK simulation scenario.

    Scenario describes what should be simulated.
    WorldState contains what is currently happening.

    Runtime file/data paths remain scenario parameters so the API layer
    does not need to know how the simulation consumes them.
    """

    config: SimulationConfig

    initial_state: Mapping[str, Any] = field(
        default_factory=dict
    )

    parameters: Mapping[str, Any] = field(
        default_factory=dict
    )

    intervention: Mapping[str, Any] | None = None

    @property
    def duration(self) -> float:
        return self.config.duration

    @property
    def tick_rate(self) -> float:
        return self.config.tick_rate

    @property
    def calamity_type(self):
        return self.config.calamity_type

    @property
    def random_seed(self) -> int | None:
        return self.config.random_seed

    # ------------------------------------------------------------------
    # Runtime parameter compatibility
    # ------------------------------------------------------------------

    @property
    def zone_mapping_path(self) -> Any:
        return self.get_parameter(
            "zone_mapping_path"
        )

    @property
    def infrastructure_path(self) -> Any:
        return self.get_parameter(
            "infrastructure_path"
        )

    @property
    def population_path(self) -> Any:
        return self.get_parameter(
            "population_path"
        )

    @property
    def shelters_path(self) -> Any:
        return self.get_parameter(
            "shelters_path"
        )

    @property
    def rainfall_intensity(self) -> float:
        return float(
            self.get_parameter(
                "rainfall_intensity",
                0.0,
            )
        )

    @property
    def flood_model_step_seconds(self) -> float:
        return float(
            self.get_parameter(
                "flood_model_step_seconds",
                60.0,
            )
        )

    @property
    def severity(self) -> int:
        return int(
            self.get_parameter(
                "severity",
                2,
            )
        )

    @property
    def intervention_level(self) -> float:
        return float(
            self.get_parameter(
                "intervention_level",
                0.0,
            )
        )

    @property
    def zones_path(self) -> Any:
        return self.get_parameter(
            "zones_path"
        )

    @property
    def shelters_path(self) -> Any:
        return self.get_parameter(
            "shelters_path"
        )

    def get_parameter(
        self,
        key: str,
        default: Any = None,
    ) -> Any:
        return self.parameters.get(
            key,
            default,
        )

    def get_initial_state(
        self,
        key: str,
        default: Any = None,
    ) -> Any:
        return self.initial_state.get(
            key,
            default,
        )
