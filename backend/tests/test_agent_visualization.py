import json
import pytest
from core.enums import CalamityType
from core.types import SimulationConfig
from simulation.scenario import Scenario
from simulation.engine import SimulationEngine
from api.serializers import WorldStateSerializer

def test_population_agent_initialization():
    with open('data/population.json', 'r', encoding='utf-8') as f:
        pop_data = json.load(f)
    with open('data/shelters.json', 'r', encoding='utf-8') as f:
        shelter_data = json.load(f)

    scenario = Scenario(
        config=SimulationConfig(
            duration=3600.0,
            tick_rate=1.0,
            calamity_type=CalamityType.FLOOD,
            random_seed=42,
        ),
        initial_state={
            "population_data": pop_data,
            "shelter_data": shelter_data,
        },
        parameters={
            "zone_mapping_path": "data/glb_zone_mapping.json",
            "infrastructure_path": "data/infrastructure.json",
            "zones_path": "data/glb_zone_mapping.json",
            "shelters_path": "data/shelters.json",
            "representative_agent_count": 250,
            "agent_speed": 1.0,
        },
    )

    engine = SimulationEngine(scenario=scenario)
    engine.initialize()

    # Verify WorldState and serialization
    state_data = WorldStateSerializer(engine.world.state).data
    human_agents = [e for e in state_data["entities"] if e["type"] == "HumanAgent"]

    assert len(human_agents) == 250
    first_agent = human_agents[0]
    assert "id" in first_agent
    assert "position" in first_agent
    assert "x" in first_agent["position"]
    assert "y" in first_agent["position"]
    assert "z" in first_agent["position"]
    assert first_agent["state"] in ("NORMAL", "PANIC", "SAFE")
    assert first_agent["zoneId"].startswith("Z")

    # Step simulation
    for _ in range(5):
        engine.step()

    state_after = WorldStateSerializer(engine.world.state).data
    agents_after = [e for e in state_after["entities"] if e["type"] == "HumanAgent"]
    assert len(agents_after) == 250
    
    agent_after_first = agents_after[0]
    assert agent_after_first["id"] == first_agent["id"]
