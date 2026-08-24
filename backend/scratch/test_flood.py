import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.enums import CalamityType
from core.types import SimulationConfig
from simulation.engine import SimulationEngine
from simulation.scenario import Scenario

def run_test():
    config = SimulationConfig(
        duration=7 * 86400,
        tick_rate=1,
        calamity_type=CalamityType.FLOOD,
        random_seed=42,
    )
    
    # We provide the parameters just like the frontend
    parameters = {
        "zone_mapping_path": "data/glb_zone_mapping.json",
        "infrastructure_path": "data/infrastructure.json",
        "population_path": "data/population.json",
        "shelters_path": "data/shelters.json",
        "representative_agent_count": 250,
        "severity": 2,
        "rainfall_intensity": 40.0,
        "intervention_level": 0.0,
    }

    scenario = Scenario(
        config=config,
        initial_state={},
        parameters=parameters,
    )

    engine = SimulationEngine(scenario=scenario)
    engine.initialize()

    print(f"Active calamity: {engine.world.state.active_calamity.value if engine.world.state.active_calamity else None}")
    
    env = engine.world.state.environment
    print(f"Rainfall forcing: {env.get('rainfall_intensity')}")
    print(f"Initial water levels: {env.get('flood_water_levels')}")
    
    # Step 1
    engine.step()
    env1 = engine.world.state.environment
    levels1 = env1.get('flood_water_levels', {})
    gt_zero1 = sum(1 for v in levels1.values() if v > 0)
    print(f"Water levels after step 1: {levels1}")
    print(f"Number of zones with water > 0 after step 1: {gt_zero1}")
    
    # Step 2
    engine.step()
    env2 = engine.world.state.environment
    levels2 = env2.get('flood_water_levels', {})
    gt_zero2 = sum(1 for v in levels2.values() if v > 0)
    print(f"Water levels after step 2: {levels2}")
    print(f"Number of zones with water > 0 after step 2: {gt_zero2}")
    
    # Step a bit more to see if it eventually accumulates
    for _ in range(58):
        engine.step()
        
    env60 = engine.world.state.environment
    levels60 = env60.get('flood_water_levels', {})
    gt_zero60 = sum(1 for v in levels60.values() if v > 0)
    print(f"Number of zones with water > 0 after 60 steps: {gt_zero60}")
    print(f"Max water level after 60 steps: {max(levels60.values()) if levels60 else 0}")

if __name__ == '__main__':
    run_test()
