from math import cos, floor, pi, sin, sqrt
from typing import Any, Dict, Iterable, List, Mapping, Optional

from core.enums import AgentState
from core.types import Position
from twin.state import WorldState

from agents.agent import HumanAgent


class AgentManager:
    """
    Manages human agents stored in the authoritative WorldState.
    """

    def __init__(self, world_state: WorldState) -> None:
        self.world_state = world_state

        self._processed_safe_agents: set[str] = set()

    # -------------------------------------------------------------------------
    # Registration
    # -------------------------------------------------------------------------

    def add_agent(self, agent: HumanAgent) -> None:
        """
        Add a human agent to the Digital Twin.
        """
        self.world_state.add_entity(agent)

    def add_agents(
        self,
        agents: Iterable[HumanAgent],
    ) -> None:
        """
        Add multiple human agents to the Digital Twin.
        """
        for agent in agents:
            self.add_agent(agent)

    # -------------------------------------------------------------------------
    # Retrieval
    # -------------------------------------------------------------------------

    def get_agent(
        self,
        agent_id: str,
    ) -> Optional[HumanAgent]:
        """
        Retrieve a human agent by ID.
        """
        entity = self.world_state.get_entity(agent_id)

        if entity is None:
            return None

        if not isinstance(entity, HumanAgent):
            raise TypeError(
                f"Entity '{agent_id}' is not a HumanAgent."
            )

        return entity

    def get_agents(self) -> List[HumanAgent]:
        """
        Return all human agents currently in the Digital Twin.
        """
        return [
            entity
            for entity in self.world_state.get_entities()
            if isinstance(entity, HumanAgent)
        ]


    # -------------------------------------------------------------------------
    # Population initialization
    # -------------------------------------------------------------------------

    def build_population_agents(
        self,
        population_data: Mapping[str, Any],
        zone_mapping: Mapping[str, Mapping[str, Any]],
        representative_agent_count: int = 250,
        default_speed: float = 1.0,
    ) -> List[HumanAgent]:
        """
        Build deterministic representative HumanAgent cohorts from the
        zone population dataset.
        """
        if representative_agent_count <= 0:
            raise ValueError(
                "representative_agent_count must be greater than zero."
            )

        if default_speed <= 0:
            raise ValueError(
                "default_speed must be positive."
            )

        zones = population_data.get("zones", [])

        if not isinstance(zones, list):
            raise TypeError(
                "population_data['zones'] must be a list."
            )

        normalized = []

        for zone in zones:
            if not isinstance(zone, Mapping):
                continue

            zone_id = zone.get("zone_id")
            if zone_id is None:
                continue

            try:
                population = float(
                    zone.get(
                        "resident_population_estimate",
                        0,
                    )
                )
            except (TypeError, ValueError):
                continue

            if population <= 0:
                continue

            zone_id = str(zone_id)

            if zone_id not in zone_mapping:
                raise ValueError(
                    f"Population zone '{zone_id}' is missing "
                    "from the authoritative zone mapping."
                )

            normalized.append(
                (zone_id, population)
            )

        if not normalized:
            return []

        total_population = sum(
            population
            for _, population in normalized
        )

        target_count = max(
            len(normalized),
            representative_agent_count,
        )

        raw = {
            zone_id: (
                population
                / total_population
                * target_count
            )
            for zone_id, population in normalized
        }

        counts = {
            zone_id: max(
                1,
                int(floor(value)),
            )
            for zone_id, value in raw.items()
        }

        current_count = sum(counts.values())

        while current_count > target_count:
            candidates = [
                zone_id
                for zone_id in counts
                if counts[zone_id] > 1
            ]

            if not candidates:
                break

            zone_id = min(
                candidates,
                key=lambda item: (
                    raw[item] - floor(raw[item]),
                    item,
                ),
            )

            counts[zone_id] -= 1
            current_count -= 1

        remainders = sorted(
            counts.keys(),
            key=lambda item: (
                raw[item] - floor(raw[item]),
                item,
            ),
            reverse=True,
        )

        index = 0
        while current_count < target_count:
            zone_id = remainders[
                index % len(remainders)
            ]
            counts[zone_id] += 1
            current_count += 1
            index += 1

        agents: List[HumanAgent] = []

        for zone_id, population in normalized:
            agent_count = counts[zone_id]
            center_position = self._zone_center_position(
                zone_mapping[zone_id]
            )
            base_route = self._build_zone_route(
                zone_id,
                zone_mapping,
            )
            cohort_size = population / agent_count

            for index in range(agent_count):
                if agent_count == 1:
                    dx, dz = 0.0, 0.0
                else:
                    import random
                    # Random dispersion within the zone (up to 45 units radius)
                    # Use a deterministic seed to keep the backend predictable across runs
                    rng = random.Random(f"{zone_id}_{index}")
                    radius = rng.uniform(0.0, 45.0)
                    angle = rng.uniform(0.0, 2.0 * pi)
                    dx = radius * cos(angle)
                    dz = radius * sin(angle)

                agent_position = Position(
                    x=center_position.x + dx,
                    y=center_position.y,
                    z=center_position.z + dz,
                )

                # Route starts with the next waypoint and loops back to starting position
                waypoints = base_route[1:] + [base_route[0]] if len(base_route) > 1 else base_route
                agent_route = [
                    Position(
                        x=p.x + dx,
                        y=p.y,
                        z=p.z + dz,
                    )
                    for p in waypoints
                ]

                agents.append(
                    HumanAgent(
                        id=(
                            f"agent_{zone_id}_"
                            f"{index + 1:03d}"
                        ),
                        position=agent_position,
                        state=AgentState.NORMAL,
                        speed=default_speed,
                        start_position=agent_position,
                        zone_id=zone_id,
                        cohort_size=cohort_size,
                        normal_route=agent_route,
                    )
                )

        return agents

    @staticmethod
    def _zone_center_position(
        zone: Mapping[str, Any],
    ) -> Position:
        """
        Convert the existing zone center to the backend Position type.
        """
        center = zone.get("center_world", {})

        if not isinstance(center, Mapping):
            raise ValueError(
                "Zone center_world must be a mapping."
            )

        if "x" not in center or "z" not in center:
            raise ValueError(
                "Zone center_world must contain x and z."
            )

        return Position(
            x=float(center["x"]),
            y=0.0,
            z=float(center["z"]),
        )

    @classmethod
    def _build_zone_route(
        cls,
        zone_id: str,
        zone_mapping: Mapping[str, Mapping[str, Any]],
    ) -> List[Position]:
        """
        Build a deterministic cyclic representative route from the
        current zone through its mapped neighbors.
        """
        zone = zone_mapping[zone_id]

        route = [
            cls._zone_center_position(zone)
        ]

        neighbors = zone.get("neighbors", [])

        if isinstance(neighbors, list):
            for neighbor_id in neighbors:
                neighbor_id = str(neighbor_id)
                if neighbor_id not in zone_mapping:
                    continue

                route.append(
                    cls._zone_center_position(
                        zone_mapping[neighbor_id]
                    )
                )

        if len(route) == 1:
            route.append(
                Position(
                    x=route[0].x + 0.001,
                    y=route[0].y,
                    z=route[0].z,
                )
            )

        return route

    # -------------------------------------------------------------------------
    # Zone membership
    # -------------------------------------------------------------------------

    def get_zone_population(
        self,
    ) -> Dict[str, float]:
        """
        Return modeled population by current authoritative agent zone.
        """
        result: Dict[str, float] = {}

        for agent in self.get_agents():
            if agent.zone_id is None:
                continue

            result[agent.zone_id] = (
                result.get(agent.zone_id, 0.0)
                + float(agent.cohort_size)
            )

        return result

    def update_zone_membership(
        self,
        zone_mapping: Mapping[str, Mapping[str, Any]],
    ) -> None:
        """
        Resolve each agent's current zone from its current position.
        """
        centers = {
            str(zone_id): self._zone_center_position(zone)
            for zone_id, zone in zone_mapping.items()
        }

        if not centers:
            return

        for agent in self.get_agents():
            nearest_zone = min(
                centers,
                key=lambda zone_id: (
                    self._distance_squared(
                        agent.position,
                        centers[zone_id],
                    ),
                    zone_id,
                ),
            )

            agent.set_zone(nearest_zone)

    @staticmethod
    def _distance_squared(
        first: Position,
        second: Position,
    ) -> float:
        dx = first.x - second.x
        dy = first.y - second.y
        dz = first.z - second.z

        return (
            dx * dx
            + dy * dy
            + dz * dz
        )

    # -------------------------------------------------------------------------
    # Evacuation bridge
    # -------------------------------------------------------------------------

    def assign_evacuation_routes(
        self,
        evacuation_routes: Mapping[str, Any],
        zone_mapping: Optional[
            Mapping[str, Mapping[str, Any]]
        ] = None,
    ) -> int:
        """
        Attach the zone-level Dijkstra route to each agent as explicit
        evacuation-route metadata.

        The existing HumanAgent NORMAL/PANIC/SAFE state machine remains
        authoritative for actual movement.
        """
        if not isinstance(evacuation_routes, Mapping):
            return 0

        assigned = 0

        for agent in self.get_agents():
            if agent.zone_id is None:
                continue

            route_info = evacuation_routes.get(
                agent.zone_id
            )

            if not isinstance(route_info, Mapping):
                continue

            path = route_info.get("path", [])

            if not isinstance(path, list) or not path:
                continue

            route = [
                str(zone_id)
                for zone_id in path
            ]

            route_positions = None

            if zone_mapping is not None:
                route_positions = [
                    self._zone_center_position(
                        zone_mapping[zone_id]
                    )
                    for zone_id in path
                    if zone_id in zone_mapping
                ]

            agent.set_evacuation_route(
                route=route,
                route_positions=route_positions,
            )

            assigned += 1

        return assigned

    # -------------------------------------------------------------------------
    # Zone-based panic transition
    # -------------------------------------------------------------------------

    def trigger_panic_for_zones(
        self,
        panic_by_zone: Mapping[str, float],
        safe_centers,
        threshold: float,
    ) -> int:
        """
        Trigger PANIC for NORMAL agents whose zone panic score reaches
        the configured threshold.
        """
        transitioned = 0

        for agent in self.get_normal_agents():
            if agent.zone_id is None:
                continue

            panic_value = float(
                panic_by_zone.get(
                    agent.zone_id,
                    0.0,
                )
            )

            if panic_value < threshold:
                continue

            if agent.enter_panic(safe_centers):
                transitioned += 1

        return transitioned

    # -------------------------------------------------------------------------
    # -------------------------------------------------------------------------
    # Shelter intake
    # -------------------------------------------------------------------------

    def register_safe_agent_intake(
        self,
    ) -> Dict[str, float]:
        """
        Return newly SAFE representative-agent population by target
        facility ID. Each SAFE agent is reported only once.
        """

        intake: Dict[str, float] = {}

        for agent in self.get_safe_agents():

            if agent.id in self._processed_safe_agents:
                continue

            if agent.target is None:
                continue

            facility_id = str(
                agent.target.id
            )

            amount = max(
                1.0,
                float(
                    agent.cohort_size
                ),
            )

            intake[facility_id] = (
                intake.get(
                    facility_id,
                    0.0,
                )
                + amount
            )

            self._processed_safe_agents.add(
                agent.id
            )

        return intake

    def reset_shelter_intake_tracking(
        self,
    ) -> None:
        """
        Reset SAFE-agent shelter-intake tracking.
        """

        self._processed_safe_agents.clear()

    def get_safe_population_by_zone(
        self,
    ) -> Dict[str, float]:
        """
        Return representative SAFE population grouped by zone.
        """

        result: Dict[str, float] = {}

        for agent in self.get_safe_agents():

            if agent.zone_id is None:
                continue

            result[agent.zone_id] = (
                result.get(
                    agent.zone_id,
                    0.0,
                )
                + float(
                    agent.cohort_size
                )
            )

        return result

    # State queries
    # -------------------------------------------------------------------------

    def get_agents_by_state(
        self,
        state: AgentState,
    ) -> List[HumanAgent]:
        """
        Return agents currently in the specified state.
        """
        return [
            agent
            for agent in self.get_agents()
            if agent.state == state
        ]

    def get_normal_agents(self) -> List[HumanAgent]:
        return self.get_agents_by_state(AgentState.NORMAL)

    def get_panicked_agents(self) -> List[HumanAgent]:
        return self.get_agents_by_state(AgentState.PANIC)

    def get_safe_agents(self) -> List[HumanAgent]:
        return self.get_agents_by_state(AgentState.SAFE)

    # -------------------------------------------------------------------------
    # State transitions
    # -------------------------------------------------------------------------

    def trigger_panic(
        self,
        agent_id: str,
        safe_centers,
    ) -> bool:
        """
        Trigger panic for a specific agent.

        Returns True if the transition succeeds.
        """
        agent = self.get_agent(agent_id)

        if agent is None:
            raise KeyError(
                f"Agent '{agent_id}' does not exist."
            )

        return agent.enter_panic(safe_centers)

    def trigger_panic_for_all(
        self,
        safe_centers,
    ) -> int:
        """
        Trigger panic for all agents that can successfully evacuate.

        Returns the number of agents transitioned to PANIC.
        """
        transitioned = 0

        for agent in self.get_normal_agents():
            if agent.enter_panic(safe_centers):
                transitioned += 1

        return transitioned

    # -------------------------------------------------------------------------
    # Simulation update
    # -------------------------------------------------------------------------

    def update_all(
        self,
        delta_time: float,
        safe_centers=None,
        zone_mapping: Optional[
            Mapping[str, Mapping[str, Any]]
        ] = None,
    ) -> None:
        """
        Advance all human agents and refresh authoritative zone membership.
        """
        for agent in self.get_agents():
            agent.update(
                delta_time=delta_time,
                safe_centers=safe_centers,
            )

        if zone_mapping is not None:
            self.update_zone_membership(
                zone_mapping
            )
