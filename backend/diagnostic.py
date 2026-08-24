import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from django.test import Client
import json

c = Client(HTTP_HOST='localhost')

def run_diagnostic(calamity, duration, tick_rate, payload_params, num_steps):
    print(f"\n==================== DIAGNOSTIC: {calamity} ====================")
    try:
        resp = c.post('/api/simulation/initialize/', json.dumps({
            'duration': duration,
            'tick_rate': tick_rate,
            'calamity_type': calamity,
            'parameters': payload_params
        }), content_type='application/json')
        
        if resp.status_code not in (200, 201):
            print("INIT ERROR STATUS:", resp.status_code)
            html = resp.content.decode('utf-8', errors='ignore')
            for line in html.split('\n'):
                if 'Exception Value:' in line or 'Traceback' in line or 'Error' in line:
                    if 'html' not in line.lower() and 'css' not in line.lower():
                        print(line.strip())
            return

        res = resp.json()
        for i in range(num_steps):
            step_resp = c.post('/api/simulation/step/')
            if step_resp.status_code in (200, 201):
                res = step_resp.json()
            else:
                print(f"STEP {i} ERROR:", step_resp.status_code)
                break
                
        print("EARTHQUAKE STATE:", bool(res.get('environment', {}).get('earthquake_state')))
        print("CASUALTIES (subsystems):", json.dumps(res.get('subsystems', {}).get('casualties', {}), indent=2))
        print("BOTTLENECKS (environment):", json.dumps(res.get('environment', {}).get('bottlenecks', {}), indent=2))
        
        risk = res.get('risk', {})
        print("RISK ASSESSMENT:", json.dumps({
            "composite_risk_score": risk.get("assessment", {}).get("composite_risk_score", risk.get("composite_risk_score")),
            "severity_label": risk.get("assessment", {}).get("severity_label", risk.get("severity_label"))
        }, indent=2))
        print("RISK BREAKDOWN:", json.dumps(risk.get("assessment", {}).get("breakdown", risk.get("breakdown", {})), indent=2))
    except Exception as e:
        print("EXCEPTION:", str(e))

params = {
    'zone_mapping_path': '../frontend/public/data/glb_zone_mapping.json',
    'infrastructure_path': '../frontend/public/data/infrastructure.json',
    'shelters_path': '../frontend/public/data/shelters.json',
    'population_path': '../frontend/public/data/population.json',
    'zone_id': 'Z01',
    'magnitude': 8.0,
    'depth_km': 10.0,
    'rainfall_intensity': 40.0,
    'intervention_level': 0.0,
}

run_diagnostic('EARTHQUAKE', 10, 1/60.0, params, 0)
run_diagnostic('FLOOD', 86400, 1/60.0, params, 65)
