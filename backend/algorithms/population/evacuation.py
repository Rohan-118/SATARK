import json
import heapq

class EvacuationEngine:
    def __init__(self, zones_path, shelters_path):
        # Load the graph structure (who neighbors who)
        with open(zones_path, 'r') as f:
            self.zones = {z['id']: z for z in json.load(f)['zones']}
            
        # Load shelter locations and capacities
        with open(shelters_path, 'r') as f:
            self.shelters = {s.get('shelter_id', s.get('id')): s for s in json.load(f)['shelters']}
            
    def calculate_evacuation_routes(self, flood_states, panic_states):
        """
        Calculates the safest route from each zone to the nearest viable shelter,
        factoring in flood levels blocking the roads.
        """
        routes = {}
        congested_edges = {} # Tracks how many people are using a path (for UI heatmap)
        
        # 1. Identify valid shelter destinations
        # Exclude shelters in severely flooded zones
        active_shelter_zones = [
            s['zone_id'] for s in self.shelters.values() 
            if flood_states.get(s['zone_id'], 0.0) < 0.4 # Shelter is inaccessible if water is > 0.4
        ]
        
        if not active_shelter_zones:
            return {"status": "CRITICAL", "message": "All shelters compromised!"}

        # 2. Pathfinding for each zone
        for start_zone in self.zones.keys():
            if start_zone in active_shelter_zones:
                routes[start_zone] = {"path": [start_zone], "safe": True, "cost": 0.0}
                continue
                
            # Dijkstra's Algorithm to find safest path to ANY active shelter
            # Priority Queue stores: (accumulated_danger_cost, current_zone, path_taken)
            pq = [(0.0, start_zone, [start_zone])]
            visited = set()
            best_route = None
            
            while pq:
                cost, current_node, path = heapq.heappop(pq)
                
                if current_node in active_shelter_zones:
                    best_route = {"path": path, "cost": cost, "safe": True}
                    break
                    
                if current_node in visited:
                    continue
                visited.add(current_node)
                
                for neighbor in self.zones[current_node]['neighbors']:
                    if neighbor not in visited:
                        # Edge weight depends on water level + panic
                        water_penalty = flood_states.get(neighbor, 0.0)
                        panic_penalty = panic_states.get(neighbor, 0.0)
                        
                        # If water is too high, the road is completely blocked
                        if water_penalty > 0.8:
                            continue 
                            
                        # Travel cost formula
                        travel_cost = 1.0 + (water_penalty * 5.0) + (panic_penalty * 2.0)
                        
                        heapq.heappush(pq, (cost + travel_cost, neighbor, path + [neighbor]))
            
            if best_route:
                routes[start_zone] = best_route
            else:
                routes[start_zone] = {"path": [], "safe": False, "cost": 9999.0}
                
        return routes