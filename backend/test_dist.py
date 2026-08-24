import json
import math
from core.types import Position

with open('data/glb_zone_mapping.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
zones = data['zones']

for z in zones:
    cx, cz = z['center_world']['x'], z['center_world']['z']
    min_dist = float('inf')
    for o in zones:
        if o['id'] == z['id']:
            continue
        ox, oz = o['center_world']['x'], o['center_world']['z']
        d = math.sqrt((ox - cx)**2 + (oz - cz)**2)
        if d < min_dist:
            min_dist = d
    print(f"Zone {z['id']}: min neighbor dist = {min_dist:.1f}, suggested max dispersion radius = {min_dist * 0.35:.1f}")
