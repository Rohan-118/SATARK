import urllib.request
import json

with open('data/population.json', 'r', encoding='utf-8') as f:
    pop_data = json.load(f)
with open('data/shelters.json', 'r', encoding='utf-8') as f:
    shelter_data = json.load(f)

payload = {
    'duration': 3600,
    'tick_rate': 1,
    'calamity_type': 'FLOOD',
    'initial_state': {
        'population_data': pop_data,
        'shelter_data': shelter_data,
    },
    'parameters': {
        'zone_mapping_path': 'data/glb_zone_mapping.json',
        'infrastructure_path': 'data/infrastructure.json',
        'zones_path': 'data/glb_zone_mapping.json',
        'shelters_path': 'data/shelters.json',
        'representative_agent_count': 250,
        'agent_speed': 1.0,
    }
}

def post(endpoint, data):
    req = urllib.request.Request(
        f'http://127.0.0.1:8000/api/simulation{endpoint}',
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

def get(endpoint):
    req = urllib.request.Request(f'http://127.0.0.1:8000/api/simulation{endpoint}')
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

init_resp = post('/initialize/', payload)
agents_0 = [e for e in init_resp.get('entities', []) if e.get('type') == 'HumanAgent']
print(f"Init tick={init_resp.get('currentTick')}, HumanAgents={len(agents_0)}")

step_resp = post('/step/', {})
agents_1 = [e for e in step_resp.get('entities', []) if e.get('type') == 'HumanAgent']
print(f"Step 1 tick={step_resp.get('currentTick')}, HumanAgents={len(agents_1)}")

pos_0 = agents_0[0]['position']
pos_1 = agents_1[0]['position']
print(f"Agent 1 moved: pos_0=({pos_0['x']:.2f}, {pos_0['z']:.2f}) -> pos_1=({pos_1['x']:.2f}, {pos_1['z']:.2f})")
assert pos_0 != pos_1, "Agent should have moved on step"

unique_pos_1 = set((a['position']['x'], a['position']['y'], a['position']['z']) for a in agents_1)
print(f"Unique positions after step: {len(unique_pos_1)}")
assert len(unique_pos_1) == 250, "All 250 positions must remain unique after step"
print("All assertions passed successfully!")
