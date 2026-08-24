from __future__ import annotations

from typing import Any

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.enums import CalamityType
from core.types import SimulationConfig

from decision.intervention import (
    CandidateIntervention,
    Intervention,
)

from simulation.engine import SimulationEngine
from simulation.scenario import Scenario

from api.serializers import (
    InterventionRequestSerializer,
    OptimizationCandidateSerializer,
    SimulationRequestSerializer,
    WorldStateSerializer,
)


_active_engine: SimulationEngine | None = None


def _require_engine() -> SimulationEngine:
    if _active_engine is None:
        raise RuntimeError(
            "No active simulation exists. "
            "Initialize a simulation first."
        )

    return _active_engine


def _state_payload(
    engine: SimulationEngine,
) -> dict[str, Any]:
    state = WorldStateSerializer(
        engine.world.state
    ).data

    state["simulation"] = {
        "initialized": (
            engine.is_initialized
        ),
        "paused": (
            engine.is_paused
        ),
        "complete": (
            engine.is_complete
        ),
    }

    state["risk"] = (
        engine.risk_state
    )

    state["recommendations"] = (
        engine.recommendation_state
    )

    state["optimization"] = (
        engine.optimization_state
    )

    state["intervention"] = (
        engine.active_intervention
    )

    state["interventions"] = (
        engine.active_interventions
    )

    state["subsystems"] = {
        "panic": engine.panic_state,
        "evacuation": engine.evacuation_routes,
        "crowd": engine.crowd_state,
        "casualties": engine.casualty_state,
        "infrastructure": (
            engine.infrastructure_state
        ),
    }

    return state


class SimulationInitializeView(
    APIView
):
    """
    Create and initialize one in-memory SATARK SimulationEngine.

    The API owns no simulation state itself; it only retains a reference
    to the current engine instance for HTTP request continuity.
    """

    def post(
        self,
        request,
        *args,
        **kwargs,
    ):
        global _active_engine

        serializer = (
            SimulationRequestSerializer(
                data=request.data
            )
        )

        serializer.is_valid(
            raise_exception=True
        )

        validated = serializer.validated_data

        config = SimulationConfig(
            duration=validated["duration"],
            tick_rate=validated["tick_rate"],
            calamity_type=(
                validated["calamity_type"]
            ),
            random_seed=(
                validated.get(
                    "random_seed"
                )
            ),
        )

        scenario = Scenario(
            config=config,
            initial_state=(
                validated.get(
                    "initial_state",
                    {},
                )
            ),
            parameters=(
                validated.get(
                    "parameters",
                    {},
                )
            ),
        )

        engine = SimulationEngine(
            scenario=scenario
        )

        engine.initialize()
        
        if config.calamity_type == CalamityType.EARTHQUAKE:
            engine.step()

        _active_engine = engine

        return Response(
            _state_payload(
                engine
            ),
            status=status.HTTP_201_CREATED,
        )


class SimulationStateView(
    APIView
):
    """
    Return the current authoritative simulation state.
    """

    def get(
        self,
        request,
        *args,
        **kwargs,
    ):
        try:
            engine = _require_engine()
        except RuntimeError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            _state_payload(
                engine
            )
        )


class SimulationStepView(
    APIView
):
    """
    Advance exactly one simulation tick.
    """

    def post(
        self,
        request,
        *args,
        **kwargs,
    ):
        try:
            engine = _require_engine()

            engine.step()

        except RuntimeError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            _state_payload(
                engine
            )
        )


class SimulationRunView(
    APIView
):
    """
    Run the current simulation until its configured duration.
    """

    def post(
        self,
        request,
        *args,
        **kwargs,
    ):
        try:
            engine = _require_engine()

            while not engine.is_complete:
                engine.step()

        except RuntimeError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            _state_payload(
                engine
            )
        )


class SimulationPauseView(
    APIView
):
    def post(
        self,
        request,
        *args,
        **kwargs,
    ):
        try:
            engine = _require_engine()
            engine.pause()
        except RuntimeError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            _state_payload(
                engine
            )
        )


class SimulationResumeView(
    APIView
):
    def post(
        self,
        request,
        *args,
        **kwargs,
    ):
        try:
            engine = _require_engine()
            engine.resume()
        except RuntimeError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            _state_payload(
                engine
            )
        )


class SimulationResetView(
    APIView
):
    def post(
        self,
        request,
        *args,
        **kwargs,
    ):
        try:
            engine = _require_engine()
            engine.reset()
        except RuntimeError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            _state_payload(
                engine
            )
        )


class RiskView(
    APIView
):
    def get(
        self,
        request,
        *args,
        **kwargs,
    ):
        try:
            engine = _require_engine()
        except RuntimeError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            engine.risk_state
        )


class RecommendationView(
    APIView
):
    def get(
        self,
        request,
        *args,
        **kwargs,
    ):
        try:
            engine = _require_engine()
        except RuntimeError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "recommendations": (
                    engine.recommendation_state
                )
            }
        )


class OptimizationView(
    APIView
):
    def post(
        self,
        request,
        *args,
        **kwargs,
    ):
        try:
            engine = _require_engine()
        except RuntimeError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_404_NOT_FOUND,
            )

        candidates_payload = request.data.get(
            "candidates",
            []
        )

        if not isinstance(
            candidates_payload,
            list,
        ):
            return Response(
                {
                    "detail": (
                        "'candidates' must be a list."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = OptimizationCandidateSerializer(
            data=candidates_payload,
            many=True,
        )

        serializer.is_valid(
            raise_exception=True
        )

        candidates = []

        for item in serializer.validated_data:

            intervention = Intervention(
                intervention_id=item[
                    "intervention_id"
                ],
                name=item[
                    "name"
                ],
                description=item[
                    "description"
                ],
                priority=item.get(
                    "priority",
                    "MEDIUM",
                ),
                expected_effects=item.get(
                    "expected_effects",
                    {},
                ),
                trigger=item.get(
                    "trigger"
                ),
                source=item.get(
                    "source",
                    "api",
                ),
            )

            candidates.append(
                CandidateIntervention(
                    intervention=intervention,
                    applicable=item.get(
                        "applicable",
                        True,
                    ),
                )
            )

        try:
            result = (
                engine.optimize_interventions(
                    candidates
                )
            )
        except (
            RuntimeError,
            ValueError,
            TypeError,
        ) as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            result.to_dict()
        )


class InterventionView(
    APIView
):
    def post(
        self,
        request,
        *args,
        **kwargs,
    ):
        try:
            engine = _require_engine()
        except RuntimeError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = (
            InterventionRequestSerializer(
                data=request.data
            )
        )

        serializer.is_valid(
            raise_exception=True
        )

        try:
            result = engine.apply_intervention(
                serializer.validated_data
            )
        except (
            RuntimeError,
            ValueError,
            TypeError,
        ) as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            {
                "intervention": result,
                "state": _state_payload(
                    engine
                ),
            }
        )


class SelectedInterventionView(
    APIView
):
    def post(
        self,
        request,
        *args,
        **kwargs,
    ):
        try:
            engine = _require_engine()

            result = (
                engine
                .apply_selected_intervention()
            )

        except RuntimeError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            {
                "intervention": result,
                "state": _state_payload(
                    engine
                ),
            }
        )
