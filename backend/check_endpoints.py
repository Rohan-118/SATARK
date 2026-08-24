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
    'initial_state': {},
    'parameters': {
        'zone_mapping_path': 'data/glb_zone_mapping.json',
        'infrastructure_path': 'data/infrastructure.json',
        'zones_path': 'data/glb_zone_mapping.json',
        'population_path': 'data/population.json',
        'shelters_path': 'data/shelters.json',
        'representative_agent_count': 250,
        'agent_speed': 1.0,
    }
}

req = urllib.request.Request(
    'http://127.0.0.1:8000/api/simulation/initialize/',
    data=json.dumps(payload).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)

try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        entities = data.get('entities', [])
        human_agents = [e for e in entities if e.get('type') == 'HumanAgent']
        unique_ids = set(e.get('id') for e in human_agents)
        zones = set(e.get('zoneId') for e in human_agents)
        print('=== POST /api/simulation/initialize/ ===')
        print(f'Total entities: {len(entities)}')
        print(f'HumanAgent entities returned: {len(human_agents)}')
        print(f'Unique HumanAgent IDs: {len(unique_ids)}')
        print(f'Zones represented: {len(zones)}')
        flood_water = data.get('environment', {}).get('flood_water_levels', {})
        print(f'Flood water levels: {len(flood_water)} zones')
        print(f'Sample flood water: {list(flood_water.items())[:3]}')
        positions = set((a['position']['x'], a['position']['y'], a['position']['z']) for a in human_agents)
        print(f'Unique positions: {len(positions)}')
        print('Representative positions of first 5 agents:')
        for a in human_agents[:5]:
            print(f"  {a['id']}: pos=({a['position']['x']}, {a['position']['y']}, {a['position']['z']}), zone={a.get('zoneId')}, state={a.get('state')}")
except Exception as e:
    print('Error on initialize:', e)

req2 = urllib.request.Request(
    'http://127.0.0.1:8000/api/simulation/state/'
)
try:
    with urllib.request.urlopen(req2) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        entities = data.get('entities', [])
        human_agents = [e for e in entities if e.get('type') == 'HumanAgent']
        unique_ids = set(e.get('id') for e in human_agents)
        zones = set(e.get('zoneId') for e in human_agents)
        print('\n=== GET /api/simulation/state/ ===')
        print(f'Total entities: {len(entities)}')
        print(f'HumanAgent entities returned: {len(human_agents)}')
        print(f'Unique HumanAgent IDs: {len(unique_ids)}')
        print(f'Zones represented: {len(zones)}')
        positions = set((a['position']['x'], a['position']['y'], a['position']['z']) for a in human_agents)
        print(f'Unique positions: {len(positions)}')
        print('Representative positions of first 5 agents:')
        for a in human_agents[:5]:
            print(f"  {a['id']}: pos=({a['position']['x']}, {a['position']['y']}, {a['position']['z']}), zone={a.get('zoneId')}, state={a.get('state')}")
except Exception as e:
    print('Error on state:', e)
