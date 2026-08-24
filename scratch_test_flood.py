import urllib.request
import json

base_url = "http://127.0.0.1:8000/api/simulation"

def print_flood_levels(tick, data):
    print(f"=== TICK {tick} ===")
    
    state = data
    print(f"currentTick: {state.get('currentTick')}")
    print(f"simulationTime: {state.get('simulationTime')}")
    if "activeCalamity" in state:
        print(f"activeCalamity type: {state['activeCalamity']}")
    
    env = state.get("environment", {})
    levels = env.get("flood_water_levels", {})
    if not levels:
        print("NO FLOOD LEVELS RETURNED.")
        print(f"Environment keys: {list(env.keys()) if isinstance(env, dict) else 'not dict'}")
    else:
        print("tick | zoneId | floodLevel")
        for k, v in levels.items():
            if v > 0:
                print(f"{tick:4} | {k:6} | {v:.2f}")

payload = {
    "duration": 259200,
    "tick_rate": 3600,
    "calamity_type": "FLOOD",
    "parameters": {
      "zone_mapping_path": "data/glb_zone_mapping.json",
      "infrastructure_path": "data/infrastructure.json",
      "population_path": "data/population.json",
      "shelters_path": "data/shelters.json",
      "representative_agent_count": 250,
      "severity": 2,
      "rainfall_intensity": 50.0,
      "intervention_level": 0.0,
      "zone_id": "Z15"
    }
}
data = json.dumps(payload).encode('utf-8')

req = urllib.request.Request(f"{base_url}/initialize/", data=data, headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req) as res:
        print_flood_levels(0, json.loads(res.read().decode('utf-8')))
except urllib.error.HTTPError as e:
    print(f"Error initializing: {e.code} {e.reason}")

for i in range(1, 4):
    req = urllib.request.Request(f"{base_url}/step/", data=b'{}', headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as res:
            print_flood_levels(i, json.loads(res.read().decode('utf-8')))
    except urllib.error.HTTPError as e:
        print(f"Error step {i}: {e.code} {e.reason}")
