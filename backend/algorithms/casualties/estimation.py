import json

class CasualtiesEngine:
    def __init__(self, infrastructure_data):
        """
        Initializes the casualty tracker and identifies medical facilities.
        """
        self.total_fatalities = 0
        self.total_injuries = 0
        self.zone_casualties = {}
        
        # Identify all hospitals to track the medical system's health
        self.hospitals = {
            node['id']: node for node in infrastructure_data['infrastructure']
            if node['type'] == 'medical'
        }

    def update_casualties(self, current_populations, flood_states, bottlenecks, panic_states, infra_states, earthquake_state=None):
        """
        Calculates new injuries and fatalities for this simulation tick.
        
        current_populations: dict of {zone_id: people_currently_outside} from crowd.py
        flood_states: dict of {zone_id: water_level_0_to_1}
        bottlenecks: dict of {zone_id: congestion_ratio} from crowd.py
        panic_states: dict of {zone_id: panic_level_0_to_1} from panic.py
        infra_states: dict of real-time infrastructure node health
        earthquake_state: optional dict containing earthquake damage data
        """
        new_injuries_this_tick = 0
        new_fatalities_this_tick = 0
        
        # 1. Assess Regional Medical Capacity
        # If hospitals fail (due to flood or blackout), the death rate of injured people spikes.
        hospital_health_sum = 0
        for hosp_id in self.hospitals.keys():
            # Get current capacity from the DAG simulation (1.0 = fine, 0.0 = offline)
            hosp_state = infra_states.get(hosp_id, {'capacity': 1.0})
            hospital_health_sum += hosp_state['capacity']
            
        # Average health of the medical grid (0.0 to 1.0)
        avg_medical_health = hospital_health_sum / max(len(self.hospitals), 1)
        
        # 2. Calculate Casualties per Zone
        for zone_id, people_exposed in current_populations.items():
            if people_exposed <= 0:
                continue
                
            if zone_id not in self.zone_casualties:
                self.zone_casualties[zone_id] = {"fatalities": 0, "injuries": 0}

            # Retrieve states for this zone
            water_level = flood_states.get(zone_id, 0.0)
            bottleneck = bottlenecks.get(zone_id, 0.0)
            panic = panic_states.get(zone_id, 0.0)
            
            # --- Vector A: Environmental Casualties (Flood) ---
            # Water above 0.3 starts causing injuries (debris, slipping). 
            # Water above 0.7 causes severe drowning risks.
            env_injury_rate = (water_level ** 2) * 0.02 
            env_fatality_rate = (water_level ** 3) * 0.005 if water_level > 0.5 else 0.0
            
            # --- Vector B: Crowd Dynamics Casualties (Crush/Stampede) ---
            # Crush injuries only happen if a bottleneck is severe (>1.2) AND people are panicked
            crush_injury_rate = 0.0
            crush_fatality_rate = 0.0
            if bottleneck > 1.2 and panic > 0.5:
                # Severity scales with how far over capacity the road is
                over_capacity = bottleneck - 1.0
                crush_injury_rate = (over_capacity * panic) * 0.03
                crush_fatality_rate = (over_capacity * panic) * 0.002

            # --- Vector C: Structural Collapse (Earthquake) ---
            eq_injury_rate = 0.0
            eq_fatality_rate = 0.0
            if earthquake_state and zone_id in earthquake_state.get("damage", {}).get("zone_damage", {}):
                collapse = earthquake_state["damage"]["zone_damage"][zone_id].get("collapse_ratio", 0.0)
                # 10% fatality and 30% injury rate of the exposed population for a total collapse
                eq_fatality_rate = collapse * 0.10
                eq_injury_rate = collapse * 0.30

            # Calculate raw numbers for this hour
            raw_injuries = int(people_exposed * (env_injury_rate + crush_injury_rate + eq_injury_rate))
            raw_fatalities = int(people_exposed * (env_fatality_rate + crush_fatality_rate + eq_fatality_rate))
            
            # --- Vector D: Medical System Collapse ---
            # If the hospitals have failed, a percentage of the new injuries become fatalities
            triage_failure_rate = 1.0 - avg_medical_health
            fatalities_from_untreated_injuries = int(raw_injuries * (triage_failure_rate * 0.15))
            
            # Adjust final tallies
            final_injuries = raw_injuries - fatalities_from_untreated_injuries
            final_fatalities = raw_fatalities + fatalities_from_untreated_injuries
            
            # Update Zone State
            self.zone_casualties[zone_id]['injuries'] += final_injuries
            self.zone_casualties[zone_id]['fatalities'] += final_fatalities
            
            # Update Global State
            new_injuries_this_tick += final_injuries
            new_fatalities_this_tick += final_fatalities
            
        self.total_injuries += new_injuries_this_tick
        self.total_fatalities += new_fatalities_this_tick
        
        return {
            "total_fatalities": self.total_fatalities,
            "total_injuries": self.total_injuries,
            "zone_breakdown": self.zone_casualties,
            "medical_system_health": round(avg_medical_health, 2)
        }