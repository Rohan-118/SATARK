import urllib.request
import json

base_url = "http://127.0.0.1:8000/api/simulation"
payload = {
    "duration": 60,
    "tick_rate": 1.0,
    "calamity_type": "FLOOD",
    "parameters": {
        "start_zone": "Z15",
        "intensity": 5.0
    }
}
data = json.dumps(payload).encode('utf-8')

req = urllib.request.Request(f"{base_url}/initialize/", data=data, headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req) as res:
        print(res.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    html = e.read().decode('utf-8')
    import re
    # Extract the exception value
    match = re.search(r'Exception Value:.*?</pre>', html, re.DOTALL)
    if match:
        print(match.group(0))
    match2 = re.search(r'Exception Location:.*?</pre>', html, re.DOTALL)
    if match2:
        print(match2.group(0))
    match3 = re.search(r'Traceback.*?</textarea>', html, re.DOTALL)
    if match3:
        print("Traceback:")
        print(match3.group(0))

