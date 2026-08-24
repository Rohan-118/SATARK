import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from django.test import Client
import json
from django.conf import settings
settings.ALLOWED_HOSTS = ['*']

c = Client()
resp = c.post('/api/simulation/initialize/', json.dumps({
    'duration': 86400,
    'tick_rate': 60.0,
    'calamity_type': 'FLOOD',
    'parameters': {
        'zone_mapping_path': '../frontend/public/data/glb_zone_mapping.json',
        'infrastructure_path': '../frontend/public/data/infrastructure.json',
        'shelters_path': '../frontend/public/data/shelters.json',
        'population_path': '../frontend/public/data/population.json',
        'rainfall_intensity': 40.0,
        'intervention_level': 0.0,
        'zone_id': 'Z01'
    }
}), content_type='application/json')

print("INIT R:", json.dumps(resp.json().get('risk', {}), indent=2))

resp2 = c.post('/api/simulation/step/')
print("STEP C:", json.dumps(resp2.json().get('subsystems', {}).get('casualties', {}), indent=2))
print("STEP R:", json.dumps(resp2.json().get('risk', {}), indent=2))
print("STEP B:", json.dumps(resp2.json().get('subsystems', {}).get('crowd', {}).get('bottlenecks', {}), indent=2))
