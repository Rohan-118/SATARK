import urllib.request
import json
import re

payload = {
    "duration": 259200,
    "tick_rate": 1,
    "calamity_type": "FLOOD",
    "parameters": {
        "zone_mapping_path": "data/glb_zone_mapping.json",
        "infrastructure_path": "data/infrastructure.json",
        "severity": 2,
        "intervention_level": 0.0,
        "zone_id": "zone-1"
    }
}

req = urllib.request.Request('http://127.0.0.1:8000/api/simulation/initialize/', data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
try:
    res = urllib.request.urlopen(req)
    data = json.loads(res.read().decode())
    print("Num entities:", len(data.get("entities", [])))
    print("Environment:", data.get("environment"))
except urllib.error.HTTPError as e:
    html = e.read().decode()
    m = re.search(r'<pre class="exception_value">(.*?)</pre>', html, re.DOTALL)
    if m:
        print("EXCEPTION:", m.group(1).strip())
    else:
        print("ERROR:", e.code)
