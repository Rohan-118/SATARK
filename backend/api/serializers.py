from __future__ import annotations

from enum import Enum
from collections.abc import Mapping
from typing import Any

from rest_framework import serializers

from core.enums import CalamityType


class SimulationRequestSerializer(
    serializers.Serializer
):
    """
    Validate the JSON contract used to create a SATARK scenario.

    The serializer validates transport data only. It never executes
    simulation logic.
    """

    duration = serializers.FloatField(
        min_value=0.000001
    )

    tick_rate = serializers.FloatField(
        min_value=0.000001
    )

    calamity_type = serializers.ChoiceField(
        choices=[
            calamity.value
            for calamity in CalamityType
        ]
    )

    random_seed = serializers.IntegerField(
        required=False,
        allow_null=True,
    )

    initial_state = serializers.DictField(
        required=False,
        default=dict,
    )

    parameters = serializers.DictField(
        required=False,
        default=dict,
    )

    def validate_calamity_type(
        self,
        value: str,
    ) -> CalamityType:
        return CalamityType(
            value
        )


class InterventionRequestSerializer(
    serializers.Serializer
):
    """
    Validate an intervention request before handing it to the engine.
    """

    intervention_id = serializers.CharField(
        required=False
    )

    id = serializers.CharField(
        required=False
    )

    action = serializers.CharField(
        required=False
    )

    name = serializers.CharField(
        required=False,
        allow_blank=True,
    )

    description = serializers.CharField(
        required=False,
        allow_blank=True,
    )

    priority = serializers.CharField(
        required=False,
        allow_blank=True,
    )

    expected_effects = serializers.DictField(
        required=False,
        default=dict,
    )

    trigger = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )

    def validate(self, attrs):
        if not any(
            attrs.get(key)
            for key in (
                "intervention_id",
                "id",
                "action",
            )
        ):
            raise serializers.ValidationError(
                "Intervention requires "
                "'intervention_id', 'id', or 'action'."
            )

        return attrs


class OptimizationCandidateSerializer(
    serializers.Serializer
):
    """
    Validate one optimization candidate.
    """

    intervention_id = serializers.CharField()
    name = serializers.CharField()
    description = serializers.CharField()

    priority = serializers.CharField(
        required=False,
        default="MEDIUM",
    )

    expected_effects = serializers.DictField(
        required=False,
        default=dict,
    )

    trigger = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )

    source = serializers.CharField(
        required=False,
        default="api",
    )

    applicable = serializers.BooleanField(
        required=False,
        default=True,
    )


class SimulationActionResponseSerializer(
    serializers.Serializer
):
    """
    Generic serializer used to document JSON-ready simulation responses.
    """

    data = serializers.JSONField()


def _json_safe(
    value: Any,
) -> Any:
    """
    Convert SATARK domain values into JSON-safe primitives.

    This is deliberately a transport concern. It does not modify
    WorldState and does not introduce a second state representation.
    """

    if value is None:
        return None

    if isinstance(
        value,
        Enum,
    ):
        return value.value

    if isinstance(
        value,
        (str, int, float, bool),
    ):
        return value

    if isinstance(
        value,
        Mapping,
    ):
        return {
            str(key): _json_safe(
                item
            )
            for key, item
            in value.items()
        }

    if isinstance(
        value,
        (list, tuple, set),
    ):
        return [
            _json_safe(item)
            for item in value
        ]

    if hasattr(
        value,
        "to_dict",
    ):
        return _json_safe(
            value.to_dict()
        )

    if hasattr(
        value,
        "__dict__",
    ):
        return {
            str(key): _json_safe(
                item
            )
            for key, item
            in vars(value).items()
            if not key.startswith("_")
        }

    return str(value)


class WorldStateSerializer(
    serializers.Serializer
):
    """
    Serialize the authoritative Digital Twin WorldState.

    Entity objects are intentionally reduced to semantic frontend data:
    id, position, state, and zoneId when the current entity provides one.
    """

    def to_representation(
        self,
        instance,
    ) -> dict[str, Any]:

        entities = []

        for entity in (
            instance.get_entities()
        ):
            position = getattr(
                entity,
                "position",
                None,
            )

            position_data = {
                "x": float(
                    position.x
                ),
                "y": float(
                    position.y
                ),
                "z": float(
                    position.z
                ),
            }

            item = {
                "id": str(
                    entity.id
                ),
                "position": position_data,
            }

            state = getattr(
                entity,
                "state",
                None,
            )

            if state is not None:
                item["state"] = _json_safe(
                    state
                )

            zone_id = getattr(
                entity,
                "zone_id",
                None,
            )

            if zone_id is not None:
                item["zoneId"] = str(
                    zone_id
                )

            entity_type = (
                entity.__class__.__name__
            )

            item["type"] = entity_type

            entities.append(
                item
            )

        return {
            "currentTick": (
                int(
                    instance.current_tick
                )
            ),
            "simulationTime": float(
                instance.simulation_time
            ),
            "activeCalamity": _json_safe(
                instance.active_calamity
            ),
            "entities": entities,
            "environment": _json_safe(
                instance.environment
            ),
            "metrics": _json_safe(
                instance.metrics
            ),
            "events": _json_safe(
                instance.events
            ),
        }
