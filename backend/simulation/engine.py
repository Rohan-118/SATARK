from __future__ import annotations

import json
import random
from copy import deepcopy
from dataclasses import is_dataclass, replace
from pathlib import Path
from typing import Any, Iterable, Mapping

from agents.manager import AgentManager

from algorithms.casualties.estimation import CasualtiesEngine
from algorithms.flood.impact import FloodImpactEngine
from algorithms.infrastructure.cascade import ExplainableNetwork
from algorithms.population.crowd import CrowdDynamicsEngine
from algorithms.population.evacuation import EvacuationEngine
from algorithms.population.panic import PanicEngine
from algorithms.intervention.recommendations import (
    RecommendationEngine as AlgorithmRecommendationEngine,
)

from calamities.flood import Flood

from core.enums import CalamityType
from infrastructure.facility import Facility
from risk.risk_engine import RiskAssessment, RiskEngine

from decision.recommendation import (
    Recommendation,
    RecommendationEngine,
)

from twin.entity import Entity

from simulation.clock import SimulationClock
from simulation.scenario import Scenario
from simulation.world import SimulationWorld
from decision.intervention import (
    CandidateIntervention,
    Intervention,
)

from decision.optimizer import (
    OptimizationEngine,
    OptimizationResult,
    SimulationEvaluation,
)

class SimulationEngine:
    """
    Central SATARK simulation orchestrator.

    Integrated execution order:

        Scenario
            ↓
        Flood
            ↓
        FloodImpactEngine
            ↓
        ExplainableNetwork
            ↓
        PanicEngine
            ↓
        EvacuationEngine
            ↓
        CrowdDynamicsEngine
            ↓
        CasualtiesEngine
            ↓
        RiskEngine
            ↓
        Decision / Priority
            ↓
        Recommendation
            ↓
        Optional Scenario Intervention
            ↓
        WorldState

    The individual algorithms remain authoritative in their respective
    algorithm modules.

    SimulationEngine owns orchestration and state transfer only.

    Decision logic does not duplicate the existing algorithms.
    """

    def __init__(
        self,
        scenario: Scenario,
        *,
        world: SimulationWorld | None = None,
        entities: Iterable[Entity] | None = None,
    ) -> None:

        self.scenario = scenario

        self.world = (
            world
            if world is not None
            else SimulationWorld()
        )

        self.clock = SimulationClock(
            tick_rate=scenario.tick_rate
        )

        self.random = random.Random(
            scenario.random_seed
        )

        self._initial_entities = (
            list(entities)
            if entities is not None
            else []
        )

        # --------------------------------------------------------------
        # Agents
        # --------------------------------------------------------------

        self._agent_manager: (
            AgentManager | None
        ) = None

        # --------------------------------------------------------------
        # Flood
        # --------------------------------------------------------------

        self._flood: Flood | None = None

        self._flood_impact: (
            FloodImpactEngine | None
        ) = None

        self._flood_zone_data: (
            dict[str, dict[str, Any]]
        ) = {}

        # --------------------------------------------------------------
        # Optimization
        # --------------------------------------------------------------

        self._optimization_engine = (
            OptimizationEngine(
                simulation_provider=(
                    self._provide_simulation_evaluation
                )
            )
        )

        self._optimization_result: (
            OptimizationResult | None
        ) = None

        # --------------------------------------------------------------
        # Infrastructure
        # --------------------------------------------------------------

        self._infrastructure_network: (
            ExplainableNetwork | None
        ) = None

        self._infrastructure_state: (
            dict[str, dict[str, Any]]
        ) = {}

        # --------------------------------------------------------------
        # Human response
        # --------------------------------------------------------------

        self._panic_engine: (
            PanicEngine | None
        ) = None

        self._evacuation_engine: (
            EvacuationEngine | None
        ) = None

        self._crowd_engine: (
            CrowdDynamicsEngine | None
        ) = None

        self._casualties_engine: (
            CasualtiesEngine | None
        ) = None

        self._panic_state: dict[
            str,
            float,
        ] = {}

        self._evacuation_routes: dict[
            str,
            Any,
        ] = {}

        self._crowd_state: dict[
            str,
            Any,
        ] = {}

        self._casualty_state: dict[
            str,
            Any,
        ] = {}

        self._casualty_population_reduction: dict[
            str,
            float,
        ] = {}

        self._population_data: (
            Mapping[str, Any] | None
        ) = None

        self._shelter_data: (
            Mapping[str, Any] | None
        ) = None

        self._human_response_enabled = False

        self._panic_accumulator = 0.0

        self._population_model_step_seconds = 1.0

        self._panic_threshold = 0.5

        # --------------------------------------------------------------
        # Risk
        # --------------------------------------------------------------

        self._risk_engine = RiskEngine()

        self._risk_assessment: (
            RiskAssessment | None
        ) = None

        self._risk_state: dict[
            str,
            Any,
        ] = {}

        # --------------------------------------------------------------
        # Decision
        # --------------------------------------------------------------

        self._algorithm_recommendation_engine = (
            AlgorithmRecommendationEngine()
        )

        self._recommendation_engine = (
            RecommendationEngine()
        )

        self._priority_state: dict[
            str,
            Any,
        ] = {}

        self._recommendations: list[
            Recommendation
        ] = []

        self._active_intervention: (
            dict[str, Any] | None
        ) = None

        self._intervention_applied = False

        # --------------------------------------------------------------
        # Lifecycle
        # --------------------------------------------------------------

        self._initialized = False

        self._paused = False

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def state(self):
        """
        Return the authoritative Digital Twin WorldState.
        """

        return self.world.state

    @property
    def is_initialized(
        self,
    ) -> bool:
        return self._initialized

    @property
    def is_paused(
        self,
    ) -> bool:
        return self._paused

    @property
    def is_complete(
        self,
    ) -> bool:
        return (
            self.clock.simulation_time
            >= self.scenario.duration
        )

    @property
    def flood(
        self,
    ) -> Flood | None:
        return self._flood

    @property
    def infrastructure_state(
        self,
    ) -> dict[
        str,
        dict[str, Any],
    ]:
        return {
            node_id: dict(
                node_state
            )
            for node_id, node_state
            in self._infrastructure_state.items()
        }

    @property
    def panic_state(
        self,
    ) -> dict[
        str,
        float,
    ]:
        return dict(
            self._panic_state
        )

    @property
    def evacuation_routes(
        self,
    ) -> dict[
        str,
        Any,
    ]:
        return dict(
            self._evacuation_routes
        )

    @property
    def crowd_state(
        self,
    ) -> dict[
        str,
        Any,
    ]:
        return dict(
            self._crowd_state
        )

    @property
    def casualty_state(
        self,
    ) -> dict[
        str,
        Any,
    ]:
        return dict(
            self._casualty_state
        )

    @property
    def risk_assessment(
        self,
    ) -> RiskAssessment | None:
        return self._risk_assessment

    @property
    def risk_state(
        self,
    ) -> dict[
        str,
        Any,
    ]:
        return dict(
            self._risk_state
        )

    @property
    def priority_state(
        self,
    ) -> dict[
        str,
        Any,
    ]:
        return dict(
            self._priority_state
        )

    @property
    def recommendations(
        self,
    ) -> list[
        Recommendation
    ]:
        return list(
            self._recommendations
        )

    @property
    def recommendation_state(
        self,
    ) -> list[
        dict[str, Any]
    ]:
        return [
            recommendation.to_dict()
            for recommendation
            in self._recommendations
        ]

    @property
    def active_intervention(
        self,
    ) -> dict[
        str,
        Any
    ] | None:
        if self._active_intervention is None:
            return None

        return dict(
            self._active_intervention
        )

    @property
    def optimization_result(
        self,
    ) -> OptimizationResult | None:
        """
        Return the latest baseline-vs-intervention optimization result.
        """

        return self._optimization_result

    @property
    def optimization_state(
        self,
    ) -> dict[str, Any] | None:
        """
        Return the latest optimization result as serializable state.
        """

        if self._optimization_result is None:
            return None

        return self._optimization_result.to_dict()

    # ------------------------------------------------------------------
    # Initialization
    # ------------------------------------------------------------------

    def initialize(
        self,
    ) -> None:
        """
        Initialize the Digital Twin and all configured simulation
        subsystems.
        """

        self.clock.reset()

        self.world.initialize(
            entities=self._initial_entities,
            calamity_type=(
                self.scenario.calamity_type
            ),
        )

        self._agent_manager = AgentManager(
            self.world.state
        )

        # Calamity/infrastructure state must exist before the human-response
        # layer constructs its casualty infrastructure adapter.
        self._initialize_calamity()

        self._initialize_human_response()

        self._initialize_population_agents()

        self._initialize_risk()

        self._initialize_decision()

        self._optimization_result = None

        self._sync_world_time()

        self.world.state.record_event(
            {
                "type": (
                    "SIMULATION_INITIALIZED"
                ),
                "calamity": (
                    self.scenario
                    .calamity_type
                    .value
                ),
                "human_response_enabled": (
                    self._human_response_enabled
                ),
                "risk_engine_enabled": True,
                "decision_engine_enabled": True,
            }
        )

        self._initialized = True

        self._paused = False

    # ------------------------------------------------------------------
    # Human-response initialization
    # ------------------------------------------------------------------

    def _initialize_human_response(
        self,
    ) -> None:

        self._panic_engine = None

        self._evacuation_engine = None

        self._crowd_engine = None

        self._casualties_engine = None

        self._panic_state = {}

        self._evacuation_routes = {}

        self._crowd_state = {}

        self._casualty_state = {}

        self._human_response_enabled = False

        self._population_data = (
            self.scenario.get_initial_state(
                "population_data"
            )
        )

        if self._population_data is None and self.scenario.population_path:
            with open(self.scenario.population_path, 'r', encoding='utf-8') as f:
                self._population_data = json.load(f)

        self._shelter_data = (
            self.scenario.get_initial_state(
                "shelter_data"
            )
        )

        if self._shelter_data is None and self.scenario.shelters_path:
            with open(self.scenario.shelters_path, 'r', encoding='utf-8') as f:
                self._shelter_data = json.load(f)

        self._panic_threshold = float(
            self.scenario.get_parameter(
                "panic_threshold",
                0.5,
            )
        )

        self._population_model_step_seconds = float(
            self.scenario.get_parameter(
                "population_model_step_seconds",
                1.0,
            )
        )

        if not 0.0 <= self._panic_threshold <= 1.0:
            raise ValueError(
                "panic_threshold must be between 0.0 and 1.0."
            )

        if self._population_model_step_seconds <= 0:
            raise ValueError(
                "population_model_step_seconds "
                "must be greater than 0."
            )

        if self._population_data is None:

            self.world.state.environment[
                "human_response"
            ] = {
                "enabled": False,
                "reason": (
                    "population_data is not configured "
                    "in Scenario.initial_state."
                ),
                "panic_by_zone": {},
                "evacuation_routes": {},
                "crowd": {},
                "casualties": {},
            }

            return

        if not isinstance(
            self._population_data,
            Mapping,
        ):
            raise TypeError(
                "population_data must be a mapping."
            )

        if "zones" not in self._population_data:
            raise ValueError(
                "population_data must contain 'zones'."
            )

        self._panic_engine = PanicEngine(
            self._population_data
        )

        self._panic_state = dict(
            self._panic_engine.panic_state
        )

        if self._shelter_data is None:

            self._human_response_enabled = True

            self.world.state.environment[
                "human_response"
            ] = {
                "enabled": True,
                "partial": True,
                "panic_by_zone": dict(
                    self._panic_state
                ),
                "evacuation_routes": {},
                "crowd": {},
                "casualties": {},
            }

            return

        if not isinstance(
            self._shelter_data,
            Mapping,
        ):
            raise TypeError(
                "shelter_data must be a mapping."
            )

        if "shelters" not in self._shelter_data:
            raise ValueError(
                "shelter_data must contain 'shelters'."
            )

        zones_path = (
            self.scenario.get_parameter(
                "zones_path"
            )
        )

        shelters_path = (
            self.scenario.get_parameter(
                "shelters_path"
            )
        )

        if not zones_path or not shelters_path:

            self._human_response_enabled = True

            return

        zones_file = Path(
            zones_path
        )

        shelters_file = Path(
            shelters_path
        )

        if not zones_file.exists():
            raise FileNotFoundError(
                "Evacuation zone file not found: "
                f"{zones_file}"
            )

        if not shelters_file.exists():
            raise FileNotFoundError(
                "Evacuation shelter file not found: "
                f"{shelters_file}"
            )

        self._evacuation_engine = (
            EvacuationEngine(
                zones_path=zones_file,
                shelters_path=shelters_file,
            )
        )

        self._crowd_engine = (
            CrowdDynamicsEngine(
                population_data=(
                    self._population_data
                ),
                shelter_data=(
                    self._shelter_data
                ),
            )
        )

        self._casualties_engine = (
            CasualtiesEngine(
                self._build_casualty_infrastructure_data()
            )
        )

        self._human_response_enabled = True

    # ------------------------------------------------------------------
    # Population → HumanAgent initialization
    # ------------------------------------------------------------------

    def _initialize_population_agents(
        self,
    ) -> None:
        """
        Populate the authoritative WorldState with deterministic
        representative HumanAgent cohorts.
        """
        if self._agent_manager is None:
            raise RuntimeError(
                "AgentManager must be initialized before population agents."
            )

        if self._population_data is None:
            self.world.state.environment[
                "population_agents"
            ] = {
                "enabled": False,
                "representative_agent_count": 0,
                "modeled_population": 0.0,
                "zone_population": {},
            }
            return

        zone_mapping = (
            self._load_agent_zone_mapping()
        )

        representative_count = int(
            self.scenario.get_parameter(
                "representative_agent_count",
                250,
            )
        )

        agent_speed = float(
            self.scenario.get_parameter(
                "agent_speed",
                1.0,
            )
        )

        agents = (
            self._agent_manager
            .build_population_agents(
                population_data=(
                    self._population_data
                ),
                zone_mapping=zone_mapping,
                representative_agent_count=(
                    representative_count
                ),
                default_speed=agent_speed,
            )
        )

        self._agent_manager.add_agents(
            agents
        )

        zone_population = (
            self._agent_manager
            .get_zone_population()
        )

        modeled_population = sum(
            zone_population.values()
        )

        self.world.state.environment[
            "population_agents"
        ] = {
            "enabled": True,
            "representative_agent_count": (
                len(agents)
            ),
            "modeled_population": (
                modeled_population
            ),
            "zone_population": dict(
                zone_population
            ),
            "representation": (
                "representative_cohorts"
            ),
        }

        self.world.state.update_metric(
            "representative_agent_count",
            float(len(agents)),
        )

        self.world.state.update_metric(
            "modeled_population",
            float(modeled_population),
        )

        self.world.state.record_event(
            {
                "type": (
                    "POPULATION_AGENTS_INITIALIZED"
                ),
                "tick": (
                    self.clock.current_tick
                ),
                "representative_agent_count": (
                    len(agents)
                ),
                "modeled_population": (
                    modeled_population
                ),
            }
        )

    def _load_agent_zone_mapping(
        self,
    ) -> dict[
        str,
        dict[str, Any],
    ]:
        """
        Load the same zone mapping used by the simulation algorithms.
        """
        mapping_path = (
            self.scenario.zone_mapping_path
        )

        if mapping_path:
            path = Path(mapping_path)
        elif self._flood_zone_data:
            return {
                str(zone_id): dict(zone)
                for zone_id, zone
                in self._flood_zone_data.items()
            }
        else:
            raise ValueError(
                "A zone_mapping_path is required for "
                "population-agent initialization."
            )

        if not path.exists():
            raise FileNotFoundError(
                "Agent zone mapping file not found: "
                f"{path}"
            )

        with path.open(
            "r",
            encoding="utf-8",
        ) as handle:
            data = json.load(handle)

        zones = data.get("zones")

        if not isinstance(zones, list):
            raise ValueError(
                "Zone mapping must contain a 'zones' list."
            )

        return {
            str(zone["id"]): dict(zone)
            for zone in zones
            if isinstance(zone, Mapping)
            and "id" in zone
        }

    # ------------------------------------------------------------------
    # Risk initialization
    # ------------------------------------------------------------------

    def _initialize_risk(
        self,
    ) -> None:

        self._risk_engine = RiskEngine()

        self._risk_assessment = None

        self._risk_state = {}

        self.world.state.environment[
            "risk"
        ] = {
            "available": True,
            "assessment": None,
        }

    # ------------------------------------------------------------------
    # Decision initialization
    # ------------------------------------------------------------------

    def _initialize_decision(
        self,
    ) -> None:
        """
        Initialize the decision layer.

        The actual computational intervention rules remain in
        algorithms/intervention/recommendations.py.
        """

        self._algorithm_recommendation_engine = (
            AlgorithmRecommendationEngine()
        )

        self._recommendation_engine = (
            RecommendationEngine()
        )

        self._priority_state = {}

        self._recommendations = []

        self._active_intervention = None

        self._intervention_applied = False

        self.world.state.environment[
            "decision"
        ] = {
            "priority": None,
            "recommendations": [],
            "active_intervention": None,
        }

    # ------------------------------------------------------------------
    # Casualty infrastructure adapter
    # ------------------------------------------------------------------

    def _build_casualty_infrastructure_data(
        self,
    ) -> dict[
        str,
        list[
            dict[str, Any]
        ],
    ]:

        infrastructure = []

        if self._infrastructure_state:
            source = self._infrastructure_state.items()

            for (
                node_id,
                node_state,
            ) in source:

                infrastructure.append(
                    {
                        "id": node_id,
                        "type": node_state.get(
                            "type",
                            "UNKNOWN",
                        ),
                        "zone_id": node_state.get(
                            "zone_id"
                        ),
                    }
                )

        elif self._infrastructure_network is not None:
            for (
                node_id,
                node_state,
            ) in self._infrastructure_network.nodes.items():

                infrastructure.append(
                    {
                        "id": node_id,
                        "type": node_state.get(
                            "type",
                            "UNKNOWN",
                        ),
                        "zone_id": node_state.get(
                            "zone_id"
                        ),
                    }
                )

        return {
            "infrastructure": infrastructure
        }

    # ------------------------------------------------------------------
    # Calamity
    # ------------------------------------------------------------------

    def _initialize_calamity(
        self,
    ) -> None:

        if (
            self.scenario.calamity_type
            == CalamityType.FLOOD
        ):
            self._initialize_flood()
            return

        if (
            self.scenario.calamity_type
            == CalamityType.EARTHQUAKE
        ):
            raise NotImplementedError(
                "Earthquake simulation integration "
                "will be implemented in a later phase."
            )

        raise ValueError(
            "Unsupported calamity type: "
            f"{self.scenario.calamity_type}"
        )

    def _initialize_flood(
        self,
    ) -> None:

        zone_mapping_path = (
            self.scenario.zone_mapping_path
        )

        if not zone_mapping_path:
            raise ValueError(
                "Flood scenarios require the "
                "'zone_mapping_path' parameter."
            )

        mapping_path = Path(
            zone_mapping_path
        )

        if not mapping_path.exists():
            raise FileNotFoundError(
                "Flood zone mapping file not found: "
                f"{mapping_path}"
            )

        self._flood = Flood(
            zone_mapping_path=mapping_path,
            rainfall_intensity=(
                self.scenario
                .rainfall_intensity
            ),
            model_step_seconds=(
                self.scenario
                .flood_model_step_seconds
            ),
        )

        self._flood.initialize()

        flood_state = self._flood.state
        if flood_state:
            self.world.state.environment[
                "flood_water_levels"
            ] = dict(
                flood_state.get(
                    "water_levels",
                    {}
                )
            )
            self.world.state.environment[
                "rainfall_intensity"
            ] = (
                self.scenario
                .rainfall_intensity
            )

        self._flood_zone_data = {
            zone["id"]: zone
            for zone in (
                self._flood
                .propagator
                .zone_data
            )
        }

        self._flood_impact = (
            FloodImpactEngine()
        )

        infrastructure_path = (
            self.scenario.infrastructure_path
        )

        if not infrastructure_path:
            raise ValueError(
                "Flood scenarios require the "
                "'infrastructure_path' parameter."
            )

        infrastructure_file = Path(
            infrastructure_path
        )

        if not infrastructure_file.exists():
            raise FileNotFoundError(
                "Infrastructure data file not found: "
                f"{infrastructure_file}"
            )

        self._infrastructure_network = (
            ExplainableNetwork(
                str(infrastructure_file)
            )
        )

        self._infrastructure_state = {}

    # ------------------------------------------------------------------
    # Phase 14 — Intervention execution
    # ------------------------------------------------------------------

    def apply_intervention(
        self,
        intervention: Intervention | Mapping[
            str,
            Any,
        ],
    ) -> dict[str, Any]:
        """
        Explicitly execute an intervention against the current live
        Digital Twin.

        Phase 13 answers:

            "Which intervention performs best?"

        Phase 14 answers:

            "Apply this selected intervention to the current world."

        This method deliberately does NOT execute automatically after
        optimization. The caller must explicitly choose to intervene.

        The existing intervention algorithm remains authoritative for
        the mechanical effect. SimulationEngine only:

            1. validates the action,
            2. builds the algorithm input,
            3. executes the existing algorithm,
            4. transfers the resulting state into WorldState,
            5. records the intervention event.

        The current live simulation state is mutated only here.
        """

        if not self._initialized:
            self.initialize()

        normalized = (
            self._normalize_intervention(
                intervention
            )
        )

        intervention_id = (
            normalized["intervention_id"]
        )

        if self._intervention_applied:
            raise RuntimeError(
                "An intervention has already been applied to this "
                "SimulationEngine instance."
            )

        environment = (
            self._build_intervention_environment()
        )

        updated_environment = (
            self._algorithm_recommendation_engine
            .apply_intervention(
                intervention_id,
                environment,
            )
        )

        self._merge_intervention_environment(
            updated_environment
        )

        self._active_intervention = (
            dict(normalized)
        )

        self._intervention_applied = True

        self._record_intervention_application()

        return dict(
            self._active_intervention
        )

    def apply_selected_intervention(
        self,
    ) -> dict[str, Any]:
        """
        Apply the intervention selected by the most recent Phase 13
        optimization.

        Raises RuntimeError if optimization has not selected an action.
        """

        if self._optimization_result is None:
            raise RuntimeError(
                "No optimization result is available. "
                "Run optimize_interventions() first."
            )

        selected = (
            self._optimization_result
            .selected_intervention
        )

        if selected is None:
            raise RuntimeError(
                "Optimization did not select an intervention."
            )

        return self.apply_intervention(
            selected
        )

    def apply_recommendation(
        self,
        recommendation: Recommendation,
    ) -> dict[str, Any]:
        """
        Apply a structured Recommendation produced by the decision layer.

        Recommendation remains a decision-layer object; the simulation
        engine extracts its Intervention contract and executes it through
        the existing intervention algorithm.
        """

        if not isinstance(
            recommendation,
            Recommendation,
        ):
            raise TypeError(
                "recommendation must be a Recommendation."
            )

        return self.apply_intervention(
            recommendation.intervention
        )

    @staticmethod
    def _normalize_intervention(
        intervention: Intervention | Mapping[
            str,
            Any,
        ],
    ) -> dict[str, Any]:
        """
        Normalize an Intervention dataclass or mapping into the single
        authoritative dictionary contract used by the live engine.
        """

        if isinstance(
            intervention,
            Intervention,
        ):
            normalized = intervention.to_dict()

        elif isinstance(
            intervention,
            Mapping,
        ):
            normalized = dict(
                intervention
            )

        else:
            raise TypeError(
                "intervention must be an Intervention or mapping."
            )

        intervention_id = (
            normalized.get(
                "intervention_id"
            )
            or normalized.get(
                "id"
            )
            or normalized.get(
                "action"
            )
        )

        if not intervention_id:
            raise ValueError(
                "Intervention must contain "
                "'intervention_id', 'id', or 'action'."
            )

        normalized[
            "intervention_id"
        ] = str(
            intervention_id
        )

        return normalized

    def _record_intervention_application(
        self,
    ) -> None:
        """
        Persist the current intervention state in the authoritative
        WorldState and emit a chronological event.
        """

        decision_state = (
            self.world.state.environment.get(
                "decision",
                {},
            )
        )

        if not isinstance(
            decision_state,
            Mapping,
        ):
            decision_state = {}

        self.world.state.environment[
            "decision"
        ] = {
            "priority": dict(
                self._priority_state
            ),
            "recommendations": [
                recommendation.to_dict()
                for recommendation
                in self._recommendations
            ],
            "active_intervention": (
                dict(
                    self._active_intervention
                )
                if self._active_intervention
                is not None
                else None
            ),
        }

        self.world.state.environment[
            "intervention"
        ] = {
            "status": "ACTIVE",
            "applied": True,
            "applied_tick": (
                self.clock.current_tick
            ),
            "applied_simulation_time": (
                self.clock.simulation_time
            ),
            "action": (
                dict(
                    self._active_intervention
                )
                if self._active_intervention
                is not None
                else None
            ),
        }

        self.world.state.record_event(
            {
                "type": "INTERVENTION_APPLIED",
                "tick": (
                    self.clock.current_tick
                ),
                "simulation_time": (
                    self.clock.simulation_time
                ),
                "intervention": (
                    dict(
                        self._active_intervention
                    )
                    if self._active_intervention
                    is not None
                    else None
                ),
            }
        )

    def get_intervention_state(
        self,
    ) -> dict[str, Any] | None:
        """
        Return the authoritative live intervention state.

        This is intentionally read-only from the caller's perspective.
        """

        intervention_state = (
            self.world.state.environment.get(
                "intervention"
            )
        )

        if not isinstance(
            intervention_state,
            Mapping,
        ):
            return None

        return dict(
            intervention_state
        )

    def clear_intervention(
        self,
    ) -> None:
        """
        Clear the intervention marker from the live Digital Twin.

        This does NOT attempt to reverse mechanical changes already made
        by the intervention algorithm.

        A reversal would require an explicit compensating intervention
        contract and must not be inferred or fabricated.
        """

        if not self._intervention_applied:
            return

        previous = (
            dict(
                self._active_intervention
            )
            if self._active_intervention
            is not None
            else None
        )

        self._active_intervention = None
        self._intervention_applied = False

        self.world.state.environment[
            "intervention"
        ] = {
            "status": "CLEARED",
            "applied": False,
            "cleared_tick": (
                self.clock.current_tick
            ),
            "cleared_simulation_time": (
                self.clock.simulation_time
            ),
            "previous_action": previous,
        }

        self.world.state.environment[
            "decision"
        ] = {
            "priority": dict(
                self._priority_state
            ),
            "recommendations": [
                recommendation.to_dict()
                for recommendation
                in self._recommendations
            ],
            "active_intervention": None,
        }

        self.world.state.record_event(
            {
                "type": "INTERVENTION_CLEARED",
                "tick": (
                    self.clock.current_tick
                ),
                "simulation_time": (
                    self.clock.simulation_time
                ),
                "previous_intervention": previous,
            }
        )

    # ------------------------------------------------------------------
    # Phase 13 — Baseline vs intervention optimization
    # ------------------------------------------------------------------

    def optimize_interventions(
        self,
        candidates: list[
            CandidateIntervention
        ],
    ) -> OptimizationResult:
        """
        Compare the current scenario with every applicable intervention.

        The baseline and every candidate are executed using independent
        SimulationEngine instances.

        The current engine/world is never reused as a mutable simulation
        container for a candidate run.

        This is the public Phase 13 entry point.
        """

        if not self._initialized:
            self.initialize()

        if not candidates:
            raise ValueError(
                "At least one intervention candidate is required."
            )

        baseline_scenario = {
            "scenario": self.scenario,
        }

        self._optimization_result = (
            self._optimization_engine.optimize(
                baseline_scenario=baseline_scenario,
                candidates=candidates,
            )
        )

        self.world.state.environment[
            "optimization"
        ] = self._optimization_result.to_dict()

        self.world.state.record_event(
            {
                "type": "OPTIMIZATION_COMPLETED",
                "tick": self.clock.current_tick,
                "candidate_count": len(
                    self._optimization_result.candidates
                ),
                "selected_intervention": (
                    self._optimization_result
                    .selected_intervention
                    .to_dict()
                    if (
                        self._optimization_result
                        .selected_intervention
                        is not None
                    )
                    else None
                ),
            }
        )

        return self._optimization_result

    def _provide_simulation_evaluation(
        self,
        scenario_payload: Mapping[
            str,
            Any,
        ] | None,
    ) -> SimulationEvaluation:
        """
        Execute one isolated scenario and convert its final state into
        the optimizer's SimulationEvaluation contract.

        The optimizer calls this once for the baseline and once for each
        applicable intervention.

        No simulated result is estimated or copied from another run.
        """

        if scenario_payload is None:
            base_scenario = self.scenario
            intervention = None

        else:
            supplied_scenario = scenario_payload.get(
                "scenario",
                self.scenario,
            )

            if not isinstance(
                supplied_scenario,
                Scenario,
            ):
                raise TypeError(
                    "Optimization scenario payload must contain "
                    "a Scenario under the 'scenario' key."
                )

            base_scenario = supplied_scenario
            intervention = scenario_payload.get(
                "intervention"
            )

        evaluation_scenario = (
            self._clone_scenario_with_intervention(
                base_scenario,
                intervention,
            )
        )

        evaluation_engine = SimulationEngine(
            scenario=evaluation_scenario,
            entities=self._clone_initial_entities(),
        )

        evaluation_engine.initialize()

        while not evaluation_engine.is_complete:
            evaluation_engine.step()

        return (
            evaluation_engine
            ._build_simulation_evaluation()
        )

    @staticmethod
    def _clone_scenario_with_intervention(
        scenario: Scenario,
        intervention: Mapping[
            str,
            Any,
        ] | None,
    ) -> Scenario:
        """
        Produce an isolated Scenario copy.

        The baseline always receives no intervention.

        Candidate scenarios receive the intervention generated by the
        decision layer.

        Scenario remains the owner of configuration; SimulationEngine
        merely creates an isolated what-if copy.
        """

        if intervention is not None:
            intervention_value: Any = dict(
                intervention
            )
        else:
            intervention_value = None

        if is_dataclass(scenario):
            try:
                return replace(
                    scenario,
                    intervention=intervention_value,
                )
            except TypeError:
                pass

        scenario_copy = deepcopy(
            scenario
        )

        try:
            setattr(
                scenario_copy,
                "intervention",
                intervention_value,
            )
        except (
            AttributeError,
            TypeError,
        ) as exc:
            raise TypeError(
                "Scenario must support an 'intervention' field "
                "for baseline/intervention optimization."
            ) from exc

        return scenario_copy

    def _clone_initial_entities(
        self,
    ) -> list[Entity]:
        """
        Return independent copies of the initial Digital Twin entities.

        Entity objects are mutable, so sharing them between baseline and
        candidate simulations would contaminate subsequent scenarios.
        """

        return [
            deepcopy(entity)
            for entity in self._initial_entities
        ]

    def _build_simulation_evaluation(
        self,
    ) -> SimulationEvaluation:
        """
        Convert the completed authoritative WorldState into the compact
        result required by OptimizationEngine.

        All values are derived from actual final simulation state.
        """

        final_risk_score = 0.0

        if self._risk_assessment is not None:
            final_risk_score = float(
                self._risk_assessment
                .composite_risk_score
            )

        fatalities = float(
            self._casualty_state.get(
                "total_fatalities",
                self.world.state.metrics.get(
                    "total_fatalities",
                    0.0,
                ),
            )
        )

        injuries = float(
            self._casualty_state.get(
                "total_injuries",
                self.world.state.metrics.get(
                    "total_injuries",
                    0.0,
                ),
            )
        )

        total_casualties = (
            fatalities
            + injuries
        )

        infrastructure_damage = (
            self._calculate_infrastructure_damage()
        )

        congestion = (
            self._calculate_congestion()
        )

        metrics = {
            key: float(value)
            for key, value
            in self.world.state.metrics.items()
        }

        additional_data = {
            "current_tick": (
                self.clock.current_tick
            ),
            "simulation_time": (
                self.clock.simulation_time
            ),
            "severity": (
                self._risk_assessment
                .severity_label
                if self._risk_assessment is not None
                else None
            ),
            "risk_breakdown": (
                dict(
                    self._risk_assessment
                    .breakdown
                )
                if self._risk_assessment is not None
                else {}
            ),
            "fatalities": fatalities,
            "injuries": injuries,
            "active_intervention": (
                dict(
                    self._active_intervention
                )
                if self._active_intervention is not None
                else None
            ),
        }

        return SimulationEvaluation(
            metrics=metrics,
            final_risk_score=final_risk_score,
            casualties=total_casualties,
            infrastructure_damage=(
                infrastructure_damage
            ),
            congestion=congestion,
            additional_data=additional_data,
        )

    def _calculate_infrastructure_damage(
        self,
    ) -> float:
        """
        Calculate normalized final infrastructure damage.

        0.0 = no measured capacity loss.
        1.0 = complete normalized capacity loss.
        """

        if not self._infrastructure_state:
            return 0.0

        capacities: list[float] = []

        for node_state in (
            self._infrastructure_state.values()
        ):
            try:
                capacity = float(
                    node_state.get(
                        "capacity",
                        1.0,
                    )
                )
            except (
                TypeError,
                ValueError,
            ):
                continue

            capacities.append(
                max(
                    0.0,
                    min(
                        1.0,
                        capacity,
                    ),
                )
            )

        if not capacities:
            return 0.0

        average_capacity = (
            sum(capacities)
            / len(capacities)
        )

        return max(
            0.0,
            min(
                1.0,
                1.0
                - average_capacity,
            ),
        )

    def _calculate_congestion(
        self,
    ) -> float:
        """
        Calculate normalized final congestion from authoritative crowd
        bottleneck state.

        If bottleneck values are already ratios, they are used directly.
        """

        bottlenecks = (
            self.world.state.environment.get(
                "bottlenecks",
                {},
            )
        )

        if not isinstance(
            bottlenecks,
            Mapping,
        ):
            return 0.0

        values: list[float] = []

        for value in (
            bottlenecks.values()
        ):
            try:
                numeric_value = float(
                    value
                )
            except (
                TypeError,
                ValueError,
            ):
                continue

            values.append(
                max(
                    0.0,
                    numeric_value,
                )
            )

        if not values:
            return 0.0

        return max(
            0.0,
            min(
                1.0,
                max(values),
            ),
        )

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def pause(
        self,
    ) -> None:

        self._paused = True

    def resume(
        self,
    ) -> None:

        if not self._initialized:
            raise RuntimeError(
                "Simulation must be initialized "
                "before resuming."
            )

        self._paused = False

    def reset(
        self,
    ) -> None:

        self.clock.reset()

        if self._flood is not None:
            self._flood.reset()

        self.world.reset()

        self._agent_manager = None

        self._flood = None

        self._flood_impact = None

        self._flood_zone_data = {}

        self._infrastructure_network = None

        self._infrastructure_state = {}

        self._panic_engine = None

        self._evacuation_engine = None

        self._crowd_engine = None

        self._casualties_engine = None

        self._panic_state = {}

        self._evacuation_routes = {}

        self._crowd_state = {}

        self._casualty_state = {}

        self._casualty_population_reduction = {}

        self._population_data = None

        self._shelter_data = None

        self._risk_engine = RiskEngine()

        self._risk_assessment = None

        self._risk_state = {}

        self._algorithm_recommendation_engine = (
            AlgorithmRecommendationEngine()
        )

        self._recommendation_engine = (
            RecommendationEngine()
        )

        self._priority_state = {}

        self._recommendations = []

        self._active_intervention = None

        self._intervention_applied = False

        self._optimization_result = None

        self._human_response_enabled = False

        self._panic_accumulator = 0.0

        self._initialized = False

        self._paused = False

    # ------------------------------------------------------------------
    # Simulation progression
    # ------------------------------------------------------------------

    def step(
        self,
    ) -> None:

        if not self._initialized:
            self.initialize()

        if self._paused:
            raise RuntimeError(
                "Simulation is paused."
            )

        if self.is_complete:
            raise RuntimeError(
                "Simulation duration has already "
                "been reached."
            )

        delta_time = (
            self.clock.advance()
        )

        self._sync_world_time()

        # --------------------------------------------------------------
        # 1. Disaster
        # --------------------------------------------------------------

        self._step_calamity(
            delta_time
        )

        # --------------------------------------------------------------
        # 2. Human response
        # --------------------------------------------------------------

        self._step_human_response(
            delta_time
        )

        # --------------------------------------------------------------
        # 3. Risk
        # --------------------------------------------------------------

        self._step_risk()

        # --------------------------------------------------------------
        # 4. Decision
        # --------------------------------------------------------------

        self._step_decision()

        # --------------------------------------------------------------
        # 5. Metrics
        # --------------------------------------------------------------

        self._update_basic_metrics()

        self.world.state.record_event(
            {
                "type": "SIMULATION_TICK",
                "tick": (
                    self.clock.current_tick
                ),
            }
        )

    # ------------------------------------------------------------------
    # Calamity progression
    # ------------------------------------------------------------------

    def _step_calamity(
        self,
        delta_time: float,
    ) -> None:

        if (
            self.scenario.calamity_type
            == CalamityType.FLOOD
        ):
            self._step_flood(
                delta_time
            )

    def _apply_live_intervention_to_flood(
        self,
    ) -> None:
        """
        Transfer the active flood intervention into the authoritative
        FloodPropagator state before the next flood-model step.

        The intervention algorithm remains responsible for producing the
        modified drainage values. This method only transfers those values
        into the existing flood simulation.
        """

        if self._flood is None:
            return

        if self._flood.propagator is None:
            return

        intervention_zones = (
            self.world.state.environment.get(
                "intervention_zones",
                {},
            )
        )

        if not isinstance(
            intervention_zones,
            Mapping,
        ):
            return

        for zone_id, zone_state in intervention_zones.items():
            if not isinstance(zone_state, Mapping):
                continue

            drainage_rate = zone_state.get(
                "drainage_rate"
            )

            if drainage_rate is None:
                continue

            zone_state_in_model = (
                self._flood.propagator.state.get(
                    zone_id
                )
            )

            if zone_state_in_model is not None:
                zone_state_in_model[
                    "drainage_capacity"
                ] = max(
                    0.0,
                    float(drainage_rate),
                )

    def _apply_live_intervention_to_infrastructure(
        self,
    ) -> None:
        """
        Transfer intervention-provided backup power into the canonical
        ExplainableNetwork before its next cascade calculation.
        """

        if self._infrastructure_network is None:
            return

        intervention_nodes = (
            self.world.state.environment.get(
                "intervention_infrastructure",
                {},
            )
        )

        if not isinstance(
            intervention_nodes,
            Mapping,
        ):
            return

        for node_id, intervention_state in intervention_nodes.items():
            if not isinstance(intervention_state, Mapping):
                continue

            node = self._infrastructure_network.nodes.get(
                node_id
            )

            if node is None:
                continue

            if "backup_power" in intervention_state:
                node["backup_power"] = max(
                    float(
                        node.get(
                            "backup_power",
                            0.0,
                        )
                    ),
                    float(
                        intervention_state[
                            "backup_power"
                        ]
                    ),
                )

    def _apply_live_intervention_to_crowd(
        self,
    ) -> None:
        """
        Transfer intervention-adjusted transit capacities into the
        existing CrowdDynamicsEngine.
        """

        if self._crowd_engine is None:
            return

        transit_capacities = (
            self.world.state.environment.get(
                "transit_capacities",
                {},
            )
        )

        if not isinstance(
            transit_capacities,
            Mapping,
        ):
            return

        self._crowd_engine.transit_capacities = {
            str(zone_id): max(
                0.0,
                float(capacity),
            )
            for zone_id, capacity
            in transit_capacities.items()
        }

    def _get_effective_crowd_panic_states(
        self,
    ) -> dict[str, float]:
        """
        Convert the active movement-speed intervention into the panic
        movement rate used by the existing crowd algorithm.

        CrowdDynamicsEngine currently derives movement as:

            0.4 + (0.4 * panic)

        Therefore the multiplier can be applied exactly to that movement
        rate without changing the underlying crowd algorithm.
        """

        panic_states = dict(
            self._panic_state
        )

        intervention = self._active_intervention

        if not intervention:
            return panic_states

        intervention_id = str(
            intervention.get(
                "intervention_id",
                intervention.get(
                    "id",
                    intervention.get(
                        "action",
                        "",
                    ),
                ),
            )
        )

        if intervention_id != "mandatory_evacuation_order":
            return panic_states

        effect = (
            intervention.get(
                "expected_effects",
                intervention.get(
                    "effect",
                    {},
                ),
            )
        )

        if not isinstance(
            effect,
            Mapping,
        ):
            return panic_states

        multiplier = float(
            effect.get(
                "movement_speed_multiplier",
                1.0,
            )
        )

        if multiplier <= 1.0:
            return panic_states

        effective = {}

        for zone_id, panic in panic_states.items():
            base_rate = 0.4 + (
                0.4 * float(panic)
            )
            target_rate = min(
                1.0,
                base_rate * multiplier,
            )
            effective_panic = (
                (target_rate - 0.4)
                / 0.4
            )
            effective[str(zone_id)] = max(
                0.0,
                min(
                    1.0,
                    effective_panic,
                ),
            )

        return effective

    def _step_flood(
        self,
        delta_time: float,
    ) -> None:

        if self._flood is None:
            raise RuntimeError(
                "Flood calamity has not been initialized."
            )

        if self._flood_impact is None:
            raise RuntimeError(
                "Flood impact engine has not been initialized."
            )

        if self._infrastructure_network is None:
            raise RuntimeError(
                "Infrastructure cascade network "
                "has not been initialized."
            )

        self._apply_live_intervention_to_flood()

        flood_state = self._flood.step(
            delta_time
        )

        water_levels = flood_state[
            "water_levels"
        ]
        
        num_flooded = len([v for v in water_levels.values() if v > 0])
        max_level = max(water_levels.values()) if water_levels else 0.0
        print(f"[BACKEND FLOOD STEP] delta_time={delta_time} simTimeBefore=??? simTimeAfter={self.clock.simulation_time} "
              f"rainfall={self.scenario.rainfall_intensity} floodedZones={num_flooded} maxWater={max_level}")

        self.world.state.environment[
            "rainfall_intensity"
        ] = (
            self.scenario
            .rainfall_intensity
        )

        self.world.state.environment[
            "flood_water_levels"
        ] = dict(
            water_levels
        )

        for (
            zone_id,
            water_level,
        ) in water_levels.items():

            self.world.state.update_metric(
                f"flood_water_{zone_id}",
                float(
                    water_level
                ),
            )

        day = max(
            1,
            int(
                self.clock.simulation_time
                / 86400.0
            ) + 1,
        )

        impact_scores = (
            self._flood_impact
            .calculate_impacts(
                water_levels,
                self._flood_zone_data,
                severity=(
                    self.scenario.severity
                ),
                day=day,
                intervention_level=(
                    self.scenario
                    .intervention_level
                ),
            )
        )

        self.world.state.environment[
            "flood_impact_scores"
        ] = dict(
            impact_scores
        )

        for (
            zone_id,
            impact,
        ) in impact_scores.items():

            self.world.state.update_metric(
                f"flood_impact_{zone_id}",
                float(
                    impact
                ),
            )

        self._step_infrastructure(
            impact_scores
        )

        self.world.state.record_event(
            {
                "type": "FLOOD_STATE_UPDATED",
                "tick": (
                    self.clock.current_tick
                ),
                "water_levels": dict(
                    water_levels
                ),
                "impact_scores": dict(
                    impact_scores
                ),
            }
        )

    # ------------------------------------------------------------------
    # Infrastructure
    # ------------------------------------------------------------------

    def _step_infrastructure(
        self,
        impact_scores: Mapping[
            str,
            float,
        ],
    ) -> None:

        if (
            self._infrastructure_network
            is None
        ):
            raise RuntimeError(
                "Infrastructure cascade network "
                "has not been initialized."
            )

        self._apply_live_intervention_to_infrastructure()

        self._infrastructure_network.simulate_timestep(
            dict(
                impact_scores
            )
        )

        infrastructure_state: dict[
            str,
            dict[str, Any],
        ] = {}

        for (
            node_id,
            node,
        ) in (
            self._infrastructure_network
            .nodes
            .items()
        ):

            capacity = float(
                node.get(
                    "capacity",
                    1.0,
                )
            )

            reason = str(
                node.get(
                    "status_reason",
                    "Unknown",
                )
            )

            node_state = {
                "id": node_id,
                "name": node.get(
                    "name",
                    node_id,
                ),
                "type": node.get(
                    "type",
                    "UNKNOWN",
                ),
                "zone_id": node.get(
                    "zone_id"
                ),
                "capacity": capacity,
                "status_reason": reason,
            }

            infrastructure_state[
                node_id
            ] = node_state

            self.world.state.update_metric(
                f"infrastructure_capacity_{node_id}",
                capacity,
            )

        self._infrastructure_state = (
            infrastructure_state
        )

        self.world.state.environment[
            "infrastructure"
        ] = {
            node_id: dict(
                node_state
            )
            for (
                node_id,
                node_state,
            ) in infrastructure_state.items()
        }

        self.world.state.record_event(
            {
                "type": (
                    "INFRASTRUCTURE_STATE_UPDATED"
                ),
                "tick": (
                    self.clock.current_tick
                ),
                "infrastructure": {
                    node_id: dict(
                        node_state
                    )
                    for (
                        node_id,
                        node_state,
                    ) in infrastructure_state.items()
                },
            }
        )

    # ------------------------------------------------------------------
    # Evacuation / infrastructure coupling
    # ------------------------------------------------------------------

    def _build_effective_evacuation_flood_states(
        self,
        flood_states: Mapping[str, float],
    ) -> dict[str, float]:
        """
        Translate infrastructure degradation into additional evacuation
        hazard while keeping the existing Dijkstra implementation
        authoritative.
        """

        effective = {
            str(zone_id): max(
                0.0,
                min(
                    1.0,
                    float(value),
                ),
            )
            for zone_id, value
            in flood_states.items()
        }

        route_capacities: dict[
            str,
            list[float],
        ] = {}

        for node_state in self._infrastructure_state.values():

            zone_id = node_state.get("zone_id")

            if zone_id is None:
                continue

            node_type = str(
                node_state.get(
                    "type",
                    "",
                )
            ).lower()

            if not any(
                token in node_type
                for token in (
                    "road",
                    "bridge",
                    "transport",
                    "corridor",
                    "route",
                )
            ):
                continue

            try:
                capacity = float(
                    node_state.get(
                        "capacity",
                        1.0,
                    )
                )
            except (
                TypeError,
                ValueError,
            ):
                continue

            route_capacities.setdefault(
                str(zone_id),
                [],
            ).append(
                max(
                    0.0,
                    min(
                        1.0,
                        capacity,
                    ),
                )
            )

        for zone_id, capacities in route_capacities.items():

            if not capacities:
                continue

            minimum_capacity = min(
                capacities
            )

            base_water = effective.get(
                zone_id,
                0.0,
            )

            if minimum_capacity <= 0.0:
                # Existing evacuation logic blocks traversal at high water.
                effective[zone_id] = 1.0

            elif minimum_capacity < 0.5:
                # Severely degraded route infrastructure becomes blocked.
                effective[zone_id] = max(
                    base_water,
                    0.81,
                )

            elif minimum_capacity < 0.9:
                # Degraded but usable route: increase its Dijkstra cost.
                effective[zone_id] = max(
                    base_water,
                    min(
                        0.79,
                        base_water
                        + (
                            (1.0 - minimum_capacity)
                            * 0.35
                        ),
                    ),
                )

        return effective

    # ------------------------------------------------------------------
    # Human response
    # ------------------------------------------------------------------

    def _step_human_response(
        self,
        delta_time: float,
    ) -> None:

        if not self._human_response_enabled:
            return

        if self._panic_engine is None:
            return

        self._panic_accumulator += (
            delta_time
        )

        if (
            self._panic_accumulator
            < self._population_model_step_seconds
        ):
            return

        self._panic_accumulator = (
            self._panic_accumulator
            % self._population_model_step_seconds
        )

        flood_states = (
            self.world.state.environment.get(
                "flood_water_levels",
                {},
            )
        )

        flood_impacts = (
            self.world.state.environment.get(
                "flood_impact_scores",
                {},
            )
        )

        if not isinstance(
            flood_states,
            Mapping,
        ):
            flood_states = {}

        if not isinstance(
            flood_impacts,
            Mapping,
        ):
            flood_impacts = {}

        # --------------------------------------------------------------
        # Panic
        # --------------------------------------------------------------

        self._panic_state = (
            self._panic_engine.update_panic(
                flood_impacts=dict(
                    flood_impacts
                ),
                infra_states=(
                    self._infrastructure_state
                ),
            )
        )

        self.world.state.environment[
            "panic_by_zone"
        ] = dict(
            self._panic_state
        )

        for (
            zone_id,
            panic_level,
        ) in self._panic_state.items():

            self.world.state.update_metric(
                f"panic_{zone_id}",
                float(
                    panic_level
                ),
            )

        # --------------------------------------------------------------
        # Evacuation
        # --------------------------------------------------------------

        if (
            self._evacuation_engine
            is not None
        ):

            effective_evacuation_flood_states = (
                self._build_effective_evacuation_flood_states(
                    flood_states
                )
            )

            self.world.state.environment[
                "evacuation_hazard_states"
            ] = dict(
                effective_evacuation_flood_states
            )

            evacuation_result = (
                self._evacuation_engine
                .calculate_evacuation_routes(
                    flood_states=dict(
                        effective_evacuation_flood_states
                    ),
                    panic_states=dict(
                        self._panic_state
                    ),
                )
            )

            if (
                isinstance(
                    evacuation_result,
                    Mapping,
                )
                and evacuation_result.get(
                    "status"
                )
                == "CRITICAL"
            ):
                self._evacuation_routes = {}

            else:
                self._evacuation_routes = dict(
                    evacuation_result
                )

                if (
                    self._agent_manager
                    is not None
                ):

                    assigned = (
                        self._agent_manager
                        .assign_evacuation_routes(
                            self._evacuation_routes,
                            zone_mapping=(
                                self._load_agent_zone_mapping()
                            ),
                        )
                    )

                    self.world.state.update_metric(
                        "agents_with_evacuation_routes",
                        float(
                            assigned
                        ),
                    )

            self.world.state.environment[
                "evacuation_routes"
            ] = dict(
                self._evacuation_routes
            )

        # --------------------------------------------------------------
        # Agent panic
        # --------------------------------------------------------------

        safe_centers = [
            entity
            for entity in (
                self.world.state
                .get_entities()
            )
            if isinstance(
                entity,
                Facility,
            )
            and entity.is_safe_center
            and entity.is_operational
            and entity.available_capacity > 0
        ]

        transitioned = 0

        if (
            self._agent_manager
            is not None
        ):

            transitioned = (
                self._agent_manager
                .trigger_panic_for_zones(
                    panic_by_zone=(
                        self._panic_state
                    ),
                    safe_centers=(
                        safe_centers
                    ),
                    threshold=(
                        self._panic_threshold
                    ),
                )
            )

            # HumanAgents now advance after the zone-level evacuation
            # route is calculated and before crowd/casualty calculations.
            self._update_agents(
                delta_time
            )

            self._reconcile_shelter_intake()

        # --------------------------------------------------------------
    # ------------------------------------------------------------------
    # Shelter intake reconciliation
    # ------------------------------------------------------------------

        # --------------------------------------------------------------
        # Crowd
        # --------------------------------------------------------------

        if (
            self._crowd_engine
            is not None
        ):

            self._apply_live_intervention_to_crowd()

            crowd_panic_states = (
                self._get_effective_crowd_panic_states()
            )

            self._crowd_state = (
                self._crowd_engine
                .simulate_movement_step(
                    evacuation_routes=(
                        self._evacuation_routes
                    ),
                    panic_states=(
                        crowd_panic_states
                    ),
                )
            )

            self.world.state.environment[
                "crowd"
            ] = dict(
                self._crowd_state
            )

            self.world.state.environment[
                "shelter_occupancy"
            ] = {
                str(shelter_id): float(
                    shelter.get(
                        "current_occupancy",
                        0.0,
                    )
                )
                for shelter_id, shelter
                in self._crowd_engine.shelters.items()
                if isinstance(
                    shelter,
                    Mapping,
                )
            }

            bottlenecks = (
                self._crowd_state.get(
                    "bottlenecks",
                    {},
                )
            )

            if isinstance(
                bottlenecks,
                Mapping,
            ):

                self.world.state.environment[
                    "bottlenecks"
                ] = dict(
                    bottlenecks
                )

                for zone_id, value in bottlenecks.items():

                    self.world.state.update_metric(
                        f"bottleneck_{zone_id}",
                        float(value),
                    )

        # --------------------------------------------------------------
        # Casualties
        # --------------------------------------------------------------

        if (
            self._casualties_engine
            is not None
        ):

            current_populations = (
                self._get_current_populations()
            )

            bottlenecks = (
                self._crowd_state.get(
                    "bottlenecks",
                    {},
                )
            )

            self._casualty_state = (
                self._casualties_engine
                .update_casualties(
                    current_populations=(
                        current_populations
                    ),
                    flood_states=dict(
                        flood_states
                    ),
                    bottlenecks=dict(
                        bottlenecks
                    ),
                    panic_states=dict(
                        self._panic_state
                    ),
                    infra_states=(
                        self._infrastructure_state
                    ),
                )
            )

            self.world.state.environment[
                "casualties"
            ] = dict(
                self._casualty_state
            )

            self.world.state.update_metric(
                "total_fatalities",
                float(
                    self._casualty_state.get(
                        "total_fatalities",
                        0,
                    )
                ),
            )

            self.world.state.update_metric(
                "total_injuries",
                float(
                    self._casualty_state.get(
                        "total_injuries",
                        0,
                    )
                ),
            )

            self._apply_cumulative_casualty_reduction()

        self.world.state.record_event(
            {
                "type": (
                    "HUMAN_RESPONSE_UPDATED"
                ),
                "tick": (
                    self.clock.current_tick
                ),
                "panic_by_zone": dict(
                    self._panic_state
                ),
                "evacuation_routes": dict(
                    self._evacuation_routes
                ),
                "agents_transitioned_to_panic": (
                    transitioned
                ),
                "crowd": dict(
                    self._crowd_state
                ),
                "casualties": dict(
                    self._casualty_state
                ),
            }
        )

    # ------------------------------------------------------------------
    # Shelter intake reconciliation
    # ------------------------------------------------------------------

    def _reconcile_shelter_intake(
        self,
    ) -> Dict[str, float]:
        """
        Reconcile SAFE HumanAgent intake with the existing crowd shelter
        state without double-counting people already admitted by the
        CrowdDynamicsEngine.
        """

        if (
            self._agent_manager is None
            or self._crowd_engine is None
        ):
            return {}

        intake = (
            self._agent_manager
            .register_safe_agent_intake()
        )

        if not intake:
            return {}

        shelter_state: Dict[str, float] = {}

        for shelter_id, amount in intake.items():

            shelter = (
                self._crowd_engine
                .shelters
                .get(
                    shelter_id
                )
            )

            if not isinstance(
                shelter,
                Mapping,
            ):
                continue

            current = float(
                shelter.get(
                    "current_occupancy",
                    0.0,
                )
            )

            capacity = float(
                shelter.get(
                    "capacity",
                    0.0,
                )
            )

            # The crowd algorithm already performs aggregate intake.
            # Never add the same cohort a second time.
            reconciled = min(
                capacity,
                max(
                    current,
                    float(amount),
                ),
            )

            shelter[
                "current_occupancy"
            ] = reconciled

            shelter_state[
                str(shelter_id)
            ] = reconciled

        self.world.state.environment[
            "shelter_agent_intake"
        ] = dict(
            intake
        )

        return shelter_state

    # ------------------------------------------------------------------
    # Casualty population feedback
    # ------------------------------------------------------------------

    def _apply_cumulative_casualty_reduction(
        self,
    ) -> None:
        """
        Remove cumulative fatalities from active crowd populations.

        CasualtiesEngine owns cumulative casualty estimation.
        CrowdDynamicsEngine owns population movement. This bridge makes
        fatalities persistent in the aggregate population state.
        """

        if self._crowd_engine is None:
            return

        breakdown = (
            self._casualty_state.get(
                "zone_breakdown",
                {},
            )
            if isinstance(
                self._casualty_state,
                Mapping,
            )
            else {}
        )

        if not isinstance(
            breakdown,
            Mapping,
        ):
            return

        for zone_id, casualty_state in breakdown.items():

            if not isinstance(
                casualty_state,
                Mapping,
            ):
                continue

            try:
                cumulative_fatalities = max(
                    0.0,
                    float(
                        casualty_state.get(
                            "fatalities",
                            0.0,
                        )
                    ),
                )
            except (
                TypeError,
                ValueError,
            ):
                continue

            zone_key = str(
                zone_id
            )

            previous = (
                self._casualty_population_reduction.get(
                    zone_key,
                    0.0,
                )
            )

            newly_removed = max(
                0.0,
                cumulative_fatalities
                - previous,
            )

            self._casualty_population_reduction[
                zone_key
            ] = cumulative_fatalities

            if newly_removed <= 0:
                continue

            current = float(
                self._crowd_engine
                .zone_populations
                .get(
                    zone_id,
                    0.0,
                )
            )

            self._crowd_engine.zone_populations[
                zone_id
            ] = max(
                0.0,
                current - newly_removed,
            )

        active_population = {
            str(zone_id): float(
                population
            )
            for zone_id, population
            in self._crowd_engine
            .zone_populations.items()
        }

        self.world.state.environment[
            "active_zone_population"
        ] = dict(
            active_population
        )

        self.world.state.update_metric(
            "active_population",
            float(
                sum(
                    active_population.values()
                )
            ),
        )

    def _get_current_populations(
        self,
    ) -> dict[
        str,
        float,
    ]:

        if (
            self._crowd_engine
            is not None
        ):

            populations = {
                str(zone_id): float(
                    population
                )
                for (
                    zone_id,
                    population,
                ) in (
                    self._crowd_engine
                    .zone_populations
                    .items()
                )
            }

            self.world.state.environment[
                "zone_population"
            ] = dict(
                populations
            )

            self.world.state.environment[
                "active_zone_population"
            ] = dict(
                populations
            )

            self.world.state.update_metric(
                "active_population",
                float(
                    sum(
                        populations.values()
                    )
                ),
            )

            return populations

        if (
            self._agent_manager
            is not None
        ):

            return {
                zone_id: float(
                    population
                )
                for (
                    zone_id,
                    population,
                ) in (
                    self._agent_manager
                    .get_zone_population()
                    .items()
                )
            }

        return {}

    # ------------------------------------------------------------------
    # Risk
    # ------------------------------------------------------------------

    def _step_risk(
        self,
    ) -> None:
        """
        Evaluate overall risk from authoritative simulation outputs.
        """

        flood_states = (
            self.world.state.environment.get(
                "flood_water_levels",
                {},
            )
        )

        bottlenecks = (
            self.world.state.environment.get(
                "bottlenecks",
                {},
            )
        )

        casualties = (
            self.world.state.environment.get(
                "casualties",
                {},
            )
        )

        infrastructure = (
            self.world.state.environment.get(
                "infrastructure",
                {},
            )
        )

        if not isinstance(
            flood_states,
            Mapping,
        ):
            flood_states = {}

        if not isinstance(
            bottlenecks,
            Mapping,
        ):
            bottlenecks = {}

        if not isinstance(
            casualties,
            Mapping,
        ):
            casualties = {}

        if not isinstance(
            infrastructure,
            Mapping,
        ):
            infrastructure = {}

        active_population = (
            self.world.state.environment.get(
                "active_zone_population",
                {},
            )
        )

        if isinstance(
            active_population,
            Mapping,
        ):
            total_population = int(
                round(
                    sum(
                        float(value)
                        for value
                        in active_population.values()
                    )
                )
            )
        else:
            total_population = (
                self._get_base_total_population()
            )

        if total_population <= 0:
            total_population = (
                self._get_base_total_population()
            )

        self._risk_assessment = (
            self._risk_engine.evaluate(
                casualties=(
                    casualties
                ),
                infrastructure=(
                    infrastructure
                ),
                flood_states=(
                    flood_states
                ),
                bottlenecks=(
                    bottlenecks
                ),
                base_total_population=(
                    total_population
                ),
            )
        )

        self._risk_state = (
            self._risk_assessment
            .to_dict()
        )

        self.world.state.environment[
            "risk"
        ] = {
            "available": True,
            "assessment": dict(
                self._risk_state
            ),
        }

        self.world.state.update_metric(
            "composite_risk_score",
            float(
                self._risk_assessment
                .composite_risk_score
            ),
        )

        self.world.state.record_event(
            {
                "type": (
                    "RISK_ASSESSMENT_UPDATED"
                ),
                "tick": (
                    self.clock.current_tick
                ),
                "assessment": dict(
                    self._risk_state
                ),
            }
        )

    # ------------------------------------------------------------------
    # Base population
    # ------------------------------------------------------------------

    def _get_base_total_population(
        self,
    ) -> int:

        if self._population_data is None:
            return 0

        zones = (
            self._population_data.get(
                "zones",
                [],
            )
        )

        if not isinstance(
            zones,
            list,
        ):
            return 0

        total_population = 0

        for zone in zones:

            if not isinstance(
                zone,
                Mapping,
            ):
                continue

            population = zone.get(
                "resident_population_estimate",
                0,
            )

            try:
                total_population += int(
                    population
                )
            except (
                TypeError,
                ValueError,
            ):
                continue

        return total_population

    # ------------------------------------------------------------------
    # Phase 12 — Decision
    # ------------------------------------------------------------------

    def _step_decision(
        self,
    ) -> None:
        """
        Convert the current RiskAssessment into:

            priority
            ↓
            algorithm recommendations
            ↓
            structured recommendations
            ↓
            optional explicit intervention

        The system recommendation is NOT automatically applied.

        Automatic application would destroy the baseline simulation
        required for Phase 13 scenario comparison.

        An intervention is applied only when explicitly supplied through
        Scenario.intervention.
        """

        if self._risk_assessment is None:
            return

        risk_assessment = dict(
            self._risk_state
        )

        # --------------------------------------------------------------
        # Priority
        # --------------------------------------------------------------

        priority_result = (
            self._recommendation_engine
            .priority_engine
            .evaluate(
                risk_assessment
            )
        )

        self._priority_state = (
            priority_result.to_dict()
        )

        self.world.state.environment[
            "decision"
        ] = {
            "priority": dict(
                self._priority_state
            ),
            "recommendations": [],
            "active_intervention": (
                self._active_intervention
            ),
        }

        # --------------------------------------------------------------
        # Existing recommendation algorithm
        # --------------------------------------------------------------

        raw_recommendations = (
            self._algorithm_recommendation_engine
            .generate_recommendations(
                risk_assessment
            )
        )

        # --------------------------------------------------------------
        # Decision-layer adapter
        # --------------------------------------------------------------

        self._recommendations = (
            self._recommendation_engine
            .recommend(
                risk_assessment=(
                    risk_assessment
                ),
                algorithm_recommendations=(
                    raw_recommendations
                ),
            )
        )

        recommendation_state = [
            recommendation.to_dict()
            for recommendation
            in self._recommendations
        ]

        self.world.state.environment[
            "decision"
        ] = {
            "priority": dict(
                self._priority_state
            ),
            "recommendations": (
                recommendation_state
            ),
            "active_intervention": (
                self._active_intervention
            ),
        }

        # --------------------------------------------------------------
        # Explicit scenario intervention
        # --------------------------------------------------------------

        if (
            self.scenario.intervention
            is not None
            and not self._intervention_applied
        ):

            self._apply_scenario_intervention(
                self.scenario.intervention
            )

        self.world.state.record_event(
            {
                "type": (
                    "DECISION_STATE_UPDATED"
                ),
                "tick": (
                    self.clock.current_tick
                ),
                "priority": dict(
                    self._priority_state
                ),
                "recommendations": (
                    recommendation_state
                ),
                "active_intervention": (
                    self._active_intervention
                ),
            }
        )

    # ------------------------------------------------------------------
    # Intervention application
    # ------------------------------------------------------------------

    def _apply_scenario_intervention(
        self,
        intervention: Mapping[
            str,
            Any,
        ],
    ) -> None:
        """
        Apply an explicitly supplied Scenario intervention.

        The existing algorithm implementation performs the mechanical
        mutation.

        SimulationEngine remains responsible for updating the
        authoritative WorldState around that operation.
        """

        if not isinstance(
            intervention,
            Mapping,
        ):
            raise TypeError(
                "Scenario.intervention must be a mapping."
            )

        intervention_id = (
            intervention.get(
                "intervention_id"
            )
            or intervention.get(
                "id"
            )
            or intervention.get(
                "action"
            )
        )

        if not intervention_id:
            raise ValueError(
                "Scenario intervention must contain "
                "intervention_id, id, or action."
            )

        environment = (
            self._build_intervention_environment()
        )

        updated_environment = (
            self._algorithm_recommendation_engine
            .apply_intervention(
                str(
                    intervention_id
                ),
                environment,
            )
        )

        self._merge_intervention_environment(
            updated_environment
        )

        self._active_intervention = dict(
            intervention
        )

        self._active_intervention[
            "intervention_id"
        ] = str(
            intervention_id
        )

        self._intervention_applied = True

        self.world.state.environment[
            "decision"
        ] = {
            "priority": dict(
                self._priority_state
            ),
            "recommendations": [
                recommendation.to_dict()
                for recommendation
                in self._recommendations
            ],
            "active_intervention": dict(
                self._active_intervention
            ),
        }

        self.world.state.record_event(
            {
                "type": (
                    "INTERVENTION_APPLIED"
                ),
                "tick": (
                    self.clock.current_tick
                ),
                "intervention": dict(
                    self._active_intervention
                ),
            }
        )

    def _build_intervention_environment(
        self,
    ) -> dict[
        str,
        Any,
    ]:
        """
        Build the environment contract expected by the existing
        intervention algorithm.

        This is an adapter only.

        No intervention mathematics is implemented here.
        """

        zones = {}

        flood_zones = (
            self.world.state.environment.get(
                "flood_water_levels",
                {},
            )
        )

        if isinstance(
            flood_zones,
            Mapping,
        ):

            for (
                zone_id,
                water_level,
            ) in flood_zones.items():

                drainage_rate = 0.0

                if (
                    self._flood is not None
                    and self._flood.propagator is not None
                ):
                    zone_state = (
                        self._flood.propagator.state.get(
                            zone_id,
                            {},
                        )
                    )
                    if isinstance(zone_state, Mapping):
                        drainage_rate = float(
                            zone_state.get(
                                "drainage_capacity",
                                0.0,
                            )
                        )

                zones[
                    str(
                        zone_id
                    )
                ] = {
                    "water_level": float(
                        water_level
                    ),
                    "drainage_rate": max(
                        0.0,
                        drainage_rate,
                    ),
                }

        transit_capacities = {}

        if self._crowd_engine is not None:
            transit_capacities = {
                str(zone_id): float(capacity)
                for zone_id, capacity
                in self._crowd_engine.transit_capacities.items()
            }

        infrastructure_nodes = {}

        for (
            node_id,
            node_state,
        ) in (
            self._infrastructure_state.items()
        ):

            infrastructure_nodes[
                str(
                    node_id
                )
            ] = {
                "capacity": float(
                    node_state.get(
                        "capacity",
                        1.0,
                    )
                ),
                "backup_power": float(
                    self._infrastructure_network.nodes
                    .get(
                        node_id,
                        {},
                    )
                    .get(
                        "backup_power",
                        0.0,
                    )
                ),
                "zone_id": node_state.get(
                    "zone_id"
                ),
                "type": node_state.get(
                    "type",
                    "UNKNOWN",
                ),
            }

        return {
            "zones": zones,
            "transit_capacities": (
                transit_capacities
            ),
            "infrastructure_nodes": (
                infrastructure_nodes
            ),
        }

    def _merge_intervention_environment(
        self,
        intervention_environment: Mapping[
            str,
            Any,
        ],
    ) -> None:
        """
        Merge intervention effects back into WorldState.

        The intervention algorithm is the authority for the effect.

        This method only transfers its resulting state into the
        authoritative Digital Twin representation.
        """

        zones = (
            intervention_environment.get(
                "zones",
                {},
            )
        )

        if isinstance(
            zones,
            Mapping,
        ):

            self.world.state.environment[
                "intervention_zones"
            ] = {
                str(
                    zone_id
                ): dict(
                    zone_state
                )
                if isinstance(
                    zone_state,
                    Mapping,
                )
                else zone_state
                for (
                    zone_id,
                    zone_state,
                ) in zones.items()
            }

        transit_capacities = (
            intervention_environment.get(
                "transit_capacities",
                {},
            )
        )

        if isinstance(
            transit_capacities,
            Mapping,
        ):

            self.world.state.environment[
                "transit_capacities"
            ] = {
                str(
                    zone_id
                ): float(
                    capacity
                )
                for (
                    zone_id,
                    capacity,
                ) in transit_capacities.items()
            }

        infrastructure_nodes = (
            intervention_environment.get(
                "infrastructure_nodes",
                {},
            )
        )

        if isinstance(
            infrastructure_nodes,
            Mapping,
        ):

            self.world.state.environment[
                "intervention_infrastructure"
            ] = {
                str(
                    node_id
                ): dict(
                    node_state
                )
                if isinstance(
                    node_state,
                    Mapping,
                )
                else node_state
                for (
                    node_id,
                    node_state,
                ) in infrastructure_nodes.items()
            }

    # ------------------------------------------------------------------
    # Agent movement
    # ------------------------------------------------------------------

    def _get_movement_speed_multiplier(
        self,
    ) -> float:
        """Return the active mandatory-evacuation movement multiplier."""

        intervention = self._active_intervention

        if not intervention:
            return 1.0

        intervention_id = str(
            intervention.get(
                "intervention_id",
                intervention.get(
                    "id",
                    intervention.get(
                        "action",
                        "",
                    ),
                ),
            )
        )

        if intervention_id != "mandatory_evacuation_order":
            return 1.0

        effect = intervention.get(
            "expected_effects",
            intervention.get(
                "effect",
                {},
            ),
        )

        if not isinstance(effect, Mapping):
            return 1.0

        try:
            return max(
                1.0,
                float(
                    effect.get(
                        "movement_speed_multiplier",
                        1.0,
                    )
                ),
            )
        except (TypeError, ValueError):
            return 1.0

    def _update_agents(
        self,
        delta_time: float,
    ) -> None:

        if self._agent_manager is None:
            return

        safe_centers = [
            entity
            for entity in (
                self.world.state
                .get_entities()
            )
            if isinstance(
                entity,
                Facility,
            )
            and entity.is_safe_center
            and entity.is_operational
            and entity.available_capacity > 0
        ]

        movement_speed_multiplier = self._get_movement_speed_multiplier()

        panic_behaviors = []

        if movement_speed_multiplier != 1.0:
            for agent in self._agent_manager.get_panicked_agents():
                behavior = agent.panic_behavior
                original_speed = behavior.speed
                behavior.speed = (
                    original_speed
                    * movement_speed_multiplier
                )
                panic_behaviors.append(
                    (
                        behavior,
                        original_speed,
                    )
                )

        try:
            self._agent_manager.update_all(
                delta_time=delta_time,
                safe_centers=safe_centers,
                zone_mapping=(
                    self._load_agent_zone_mapping()
                ),
            )
        finally:
            for behavior, original_speed in panic_behaviors:
                behavior.speed = original_speed

    # ------------------------------------------------------------------
    # World synchronization
    # ------------------------------------------------------------------

    def _sync_world_time(
        self,
    ) -> None:

        self.world.state.current_tick = (
            self.clock.current_tick
        )

        self.world.state.simulation_time = (
            self.clock.simulation_time
        )

    # ------------------------------------------------------------------
    # Metrics
    # ------------------------------------------------------------------

    def _update_basic_metrics(
        self,
    ) -> None:

        if self._agent_manager is None:
            return

        agents = (
            self._agent_manager
            .get_agents()
        )

        self.world.state.update_metric(
            "agent_count",
            float(
                len(agents)
            ),
        )

        self.world.state.update_metric(
            "normal_agents",
            float(
                len(
                    self._agent_manager
                    .get_normal_agents()
                )
            ),
        )

        self.world.state.update_metric(
            "panicked_agents",
            float(
                len(
                    self._agent_manager
                    .get_panicked_agents()
                )
            ),
        )

        self.world.state.update_metric(
            "safe_agents",
            float(
                len(
                    self._agent_manager
                    .get_safe_agents()
                )
            ),
        )

        agent_zone_population = (
            self._agent_manager
            .get_zone_population()
        )

        self.world.state.environment[
            "agent_zone_population"
        ] = dict(
            agent_zone_population
        )

        self.world.state.update_metric(
            "agent_modeled_population",
            float(
                sum(
                    agent_zone_population.values()
                )
            ),
        )

        active_population = (
            self.world.state.environment.get(
                "active_zone_population",
                {},
            )
        )

        if isinstance(
            active_population,
            Mapping,
        ):
            self.world.state.update_metric(
                "active_population",
                float(
                    sum(
                        float(value)
                        for value
                        in active_population.values()
                    )
                ),
            )

        shelter_occupancy = (
            self.world.state.environment.get(
                "shelter_occupancy",
                {},
            )
        )

        if isinstance(
            shelter_occupancy,
            Mapping,
        ):
            self.world.state.update_metric(
                "shelter_occupancy",
                float(
                    sum(
                        float(value)
                        for value
                        in shelter_occupancy.values()
                    )
                ),
            )

        if self._panic_state:

            self.world.state.update_metric(
                "max_panic",
                float(
                    max(
                        self._panic_state.values()
                    )
                ),
            )

        if self._casualty_state:

            self.world.state.update_metric(
                "total_fatalities",
                float(
                    self._casualty_state.get(
                        "total_fatalities",
                        0,
                    )
                ),
            )

            self.world.state.update_metric(
                "total_injuries",
                float(
                    self._casualty_state.get(
                        "total_injuries",
                        0,
                    )
                ),
            )

        if self._risk_assessment is not None:

            self.world.state.update_metric(
                "composite_risk_score",
                float(
                    self._risk_assessment
                    .composite_risk_score
                ),
            )

        if self._priority_state:

            priority = (
                self._priority_state.get(
                    "overall_priority"
                )
            )

            priority_scores = {
                "LOW": 1.0,
                "MEDIUM": 2.0,
                "HIGH": 3.0,
                "CRITICAL": 4.0,
            }

            if priority in priority_scores:

                self.world.state.update_metric(
                    "decision_priority",
                    priority_scores[
                        priority
                    ],
                )