import urllib.request
import json
import time
import sys

BASE_URL = "http://127.0.0.1:8000/api/simulation"

def post(endpoint, data=None):
    req = urllib.request.Request(f"{BASE_URL}{endpoint}")
    req.add_header('Content-Type', 'application/json')
    if data:
        data = json.dumps(data).encode('utf-8')
    try:
        with urllib.request.urlopen(req, data=data) as response:
            return response.status, json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')
    except Exception as e:
        return 0, str(e)

def get(endpoint):
    req = urllib.request.Request(f"{BASE_URL}{endpoint}")
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')
    except Exception as e:
        return 0, str(e)

print("1. Initialize flood")
init_data = {
    "duration": 3600,
    "tick_rate": 1,
    "calamity_type": "FLOOD",
    "parameters": {
        "zone_mapping_path": "data/glb_zone_mapping.json",
        "infrastructure_path": "data/infrastructure.json",
        "severity": 3,
        "intervention_level": 0.5
    }
}
status, res = post("/initialize/", init_data)
print("Init Status:", status)
if status == 0:
    print("Backend not running. Exiting.")
    sys.exit(1)

print("\n2. Fetch state")
status, res = get("/state/")
print("State Status:", status)
print("Keys before:", list(res.keys()))

print("\n3. Step once")
status, res = post("/step/", data={})
print("Step Status:", status)
if status != 200:
    print("Step Error:", res)

print("\n4. Fetch state again")
status, res = get("/state/")
print("State Status:", status)
print("Keys after:", list(res.keys()))
if "world_time" in res:
    print("world_time:", res["world_time"])
elif "metrics" in res:
    print("metrics:", res["metrics"])
