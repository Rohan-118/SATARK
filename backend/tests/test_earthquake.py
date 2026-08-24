import json
import pytest

from core.enums import CalamityType
from core.types import SimulationConfig
from simulation.engine import SimulationEngine
from simulation.scenario import Scenario

def test_earthquake_one_shot_execution(tmp_path):
    # 1. Setup mock data files
    zones_data = {
        "zones": [
            {
                "id": "zone-1",
                "zone_id": "zone-1",
                "seismic_resilience": 1.0,
                "resident_population_estimate": 1000,
                "population_weight": 0.5,
                "building_footprint_proxy": 100,
                "lat": 1.0,
                "lon": 1.0,
                "center_world": {"x": 0.0, "y": 0.0, "z": 0.0}
            }
        ]
    }
    zones_path = tmp_path / "zones.json"
    zones_path.write_text(json.dumps(zones_data))

    infra_data = {
        "infrastructure": [
            {
                "id": "hospital-1",
                "type": "MEDICAL",
                "zone_id": "zone-1",
                "seismic_resilience": 1.0
            }
        ]
    }
    infra_path = tmp_path / "infrastructure.json"
    infra_path.write_text(json.dumps(infra_data))

    shelters_data = {
        "shelters": [
            {
                "id": "shelter-1",
                "zone_id": "zone-1",
                "capacity": 500,
                "type": "EVACUATION_CENTER",
                "lat": 1.0,
                "lon": 1.0
            }
        ]
    }
    shelters_path = tmp_path / "shelters.json"
    shelters_path.write_text(json.dumps(shelters_data))

    # 2. Configure scenario
    config = SimulationConfig(
        duration=1.0,
        tick_rate=1.0,
        calamity_type=CalamityType.EARTHQUAKE,
    )

    scenario = Scenario(
        config=config,
        parameters={
            "zone_mapping_path": str(zones_path),
            "zones_path": str(zones_path),
            "infrastructure_path": str(infra_path),
            "shelters_path": str(shelters_path),
            "magnitude": 8.0,
            "depth_km": 10.0,
            "zone_id": "zone-1"
        },
        initial_state={
            "population_data": zones_data,
            "shelter_data": shelters_data,
        }
    )

    engine = SimulationEngine(scenario=scenario)
    
    # 3. Execution
    engine.initialize()
    
    # Assert earthquake state was populated during initialization
    assert "earthquake_state" in engine.world.state.environment
    eq_state = engine.world.state.environment["earthquake_state"]
    assert eq_state["magnitude"] == 8.0
    
    # Structural damage should be populated in infrastructure_state
    assert "hospital-1" in engine._infrastructure_state
    infra_node = engine._infrastructure_state["hospital-1"]
    # With magnitude 8.0, structural integrity should drop
    assert infra_node["capacity"] < 1.0
    
    # 4. Trigger the one-shot step to compute risk and decisions
    engine.step()
    
    # 5. Assert Risk was calculated
    risk_state = engine.risk_state
    assert risk_state is not None
    assert risk_state["breakdown"]["infrastructure"] > 0
    assert risk_state["breakdown"]["casualties"] > 0
    
    # 6. Assert Casualties were populated
    assert engine.casualty_state["total_fatalities"] > 0
    assert engine.casualty_state["total_injuries"] > 0

    # 7. Assert Recommendations were generated (if threshold is met)
    assert len(engine.recommendation_state) > 0
