import json
import math
from core.types import Position
from agents.agent import HumanAgent
from core.enums import AgentState

with open('data/population.json', 'r', encoding='utf-8') as f:
    pop_data = json.load(f)
with open('data/glb_zone_mapping.json', 'r', encoding='utf-8') as f:
    zone_data = json.load(f)
    zone_mapping = {z['id']: z for z in zone_data['zones']}

def build_distributed_agents(pop_data, zone_mapping, representative_agent_count=250, default_speed=1.0):
    zones = pop_data.get("zones", [])
    normalized = []
    for zone in zones:
        zone_id = str(zone.get("zone_id"))
        pop = float(zone.get("resident_population_estimate", 0))
        if pop > 0 and zone_id in zone_mapping:
            normalized.append((zone_id, pop))
    
    total_pop = sum(p for _, p in normalized)
    target_count = max(len(normalized), representative_agent_count)
    raw = {zid: pop / total_pop * target_count for zid, pop in normalized}
    counts = {zid: max(1, int(math.floor(val))) for zid, val in raw.items()}
    current_count = sum(counts.values())

    while current_count > target_count:
        candidates = [zid for zid in counts if counts[zid] > 1]
        if not candidates:
            break
        zid = min(candidates, key=lambda item: (raw[item] - math.floor(raw[item]), item))
        counts[zid] -= 1
        current_count -= 1

    remainders = sorted(counts.keys(), key=lambda item: (raw[item] - math.floor(raw[item]), item), reverse=True)
    index = 0
    while current_count < target_count:
        zid = remainders[index % len(remainders)]
        counts[zid] += 1
        current_count += 1
        index += 1

    agents = []
    for zone_id, population in normalized:
        agent_count = counts[zone_id]
        center = zone_mapping[zone_id]["center_world"]
        center_pos = Position(x=float(center["x"]), y=0.0, z=float(center["z"]))
        
        # Base route
        neighbors = zone_mapping[zone_id].get("neighbors", [])
        base_route_points = [center_pos]
        for nid in neighbors:
            if nid in zone_mapping:
                nc = zone_mapping[nid]["center_world"]
                base_route_points.append(Position(x=float(nc["x"]), y=0.0, z=float(nc["z"])))
        if len(base_route_points) == 1:
            base_route_points.append(Position(x=center_pos.x + 0.001, y=0.0, z=center_pos.z))

        cohort_size = population / agent_count

        for idx in range(agent_count):
            if agent_count == 1:
                dx, dz = 0.0, 0.0
            else:
                # Deterministic sunflower/golden-spiral dispersion within ~15-60 units radius
                radius = 15.0 + 45.0 * math.sqrt((idx + 0.5) / agent_count)
                angle = idx * 2.399963229728653  # Golden angle in radians
                dx = radius * math.cos(angle)
                dz = radius * math.sin(angle)

            agent_pos = Position(
                x=center_pos.x + dx,
                y=center_pos.y,
                z=center_pos.z + dz
            )

            # Offset route targets so agents walk in a spaced formation
            agent_route = [
                Position(x=p.x + dx, y=p.y, z=p.z + dz)
                for p in base_route_points
            ]

            agents.append(
                HumanAgent(
                    id=f"agent_{zone_id}_{idx + 1:03d}",
                    position=agent_pos,
                    state=AgentState.NORMAL,
                    speed=default_speed,
                    start_position=agent_pos,
                    zone_id=zone_id,
                    cohort_size=cohort_size,
                    normal_route=agent_route,
                )
            )

    return agents

agents = build_distributed_agents(pop_data, zone_mapping)
print(f"Total agents: {len(agents)}")
unique_ids = set(a.id for a in agents)
print(f"Unique IDs: {len(unique_ids)}")
unique_positions = set((a.position.x, a.position.y, a.position.z) for a in agents)
print(f"Unique positions: {len(unique_positions)}")

# Check zone consistency
mismatches = 0
for a in agents:
    # Find nearest zone center
    closest_zid = min(
        zone_mapping.keys(),
        key=lambda zid: (
            (a.position.x - zone_mapping[zid]["center_world"]["x"])**2 +
            (a.position.z - zone_mapping[zid]["center_world"]["z"])**2
        )
    )
    if closest_zid != a.zone_id:
        mismatches += 1

print(f"Zone membership mismatches: {mismatches} (must be 0)")
print("\nSample 5 agents:")
for a in agents[:5]:
    print(f"  {a.id}: pos=({a.position.x:.3f}, {a.position.y:.3f}, {a.position.z:.3f}), zone={a.zone_id}")
