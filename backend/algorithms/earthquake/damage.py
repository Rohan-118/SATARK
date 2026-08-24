import math

class SeismicDamageEngine:
    def __init__(self, zone_data, infrastructure_data):
        """
        Initializes the damage engine with zone profiles and structural assets.
        """
        self.zones = zone_data
        self.infrastructure = infrastructure_data

    def calculate_structural_damage(self, pga_map):
        """
        Evaluates structural collapse probabilities across all zones and critical assets 
        based on the generated PGA map.
        """
        zone_damage_report = {}
        infrastructure_damage_report = {}
        
        # 1. Calculate Zone-Level Residential/Commercial Building Damage
        for zone_id, pga in pga_map.items():
            zone_info = self.zones.get(zone_id, {})
            # Average structural resilience of the zone (e.g., 1.0 = standard, 1.3 = reinforced)
            resilience = zone_info.get('seismic_resilience', 1.0)
            
            # Compute damage state probabilities (Slight, Moderate, Extensive, Complete)
            damage_probs = self._compute_fragility_probabilities(pga, resilience)
            
            zone_damage_report[zone_id] = {
                "pga": pga,
                "damage_states": damage_probs,
                # Estimated percentage of buildings completely collapsed or heavily compromised
                "collapse_ratio": round(damage_probs['complete'] + (damage_probs['extensive'] * 0.5), 3)
            }
            
        # 2. Calculate Critical Infrastructure Specific Damage
        for node in self.infrastructure:
            node_id = node['id']
            zone_id = node['zone_id']
            pga = pga_map.get(zone_id, 0.0)
            
            # Critical facilities might have specific hardening (e.g., hospitals vs standard substations)
            asset_resilience = node.get('seismic_resilience', 1.2)
            
            node_probs = self._compute_fragility_probabilities(pga, asset_resilience)
            
            # Determine immediate functional capacity drop from physical damage
            # Complete collapse = 0.0 capacity, Extensive = 0.2, etc.
            capacity_modifier = 1.0 - (
                (node_probs['complete'] * 1.0) +
                (node_probs['extensive'] * 0.7) +
                (node_probs['moderate'] * 0.3)
            )
            
            infrastructure_damage_report[node_id] = {
                "zone_id": zone_id,
                "type": node['type'],
                "structural_integrity": round(max(0.0, capacity_modifier), 2),
                "probabilities": node_probs
            }
            
        return {
            "zone_damage": zone_damage_report,
            "infrastructure_damage": infrastructure_damage_report
        }

    def _compute_fragility_probabilities(self, pga, resilience):
        """
        Calculates cumulative probabilities for damage states using lognormal distribution logic.
        Median thresholds (medians for slight, moderate, extensive, complete damage in terms of PGA 'g').
        """
        if pga <= 0.05:
            return {"slight": 0.0, "moderate": 0.0, "extensive": 0.0, "complete": 0.0}
            
        # Adjust medians based on the structural resilience of the asset/zone
        # Higher resilience shifts the vulnerability curve to the right (requires more shaking to damage)
        slight_median = 0.15 * resilience
        moderate_median = 0.30 * resilience
        extensive_median = 0.55 * resilience
        complete_median = 0.85 * resilience
        
        # Standard deviation (dispersion) parameter for building fragility
        beta = 0.4
        
        p_slight = self._lognormal_cdf(pga, slight_median, beta)
        p_moderate = self._lognormal_cdf(pga, moderate_median, beta)
        p_extensive = self._lognormal_cdf(pga, extensive_median, beta)
        p_complete = self._lognormal_cdf(pga, complete_median, beta)
        
        # Convert cumulative probabilities into mutually exclusive state probabilities
        p_complete_exclusive = p_complete
        p_extensive_exclusive = max(0.0, p_extensive - p_complete)
        p_moderate_exclusive = max(0.0, p_moderate - p_extensive)
        p_slight_exclusive = max(0.0, p_slight - p_moderate)
        p_none = max(0.0, 1.0 - p_slight)
        
        return {
            "none": round(p_none, 3),
            "slight": round(p_slight_exclusive, 3),
            "moderate": round(p_moderate_exclusive, 3),
            "extensive": round(p_extensive_exclusive, 3),
            "complete": round(p_complete_exclusive, 3)
        }

    def _lognormal_cdf(self, x, median, beta):
        """
        Calculates the standard lognormal cumulative distribution function value.
        """
        if x <= 0:
            return 0.0
        try:
            val = (math.log(x / median)) / beta
            return 0.5 * (1.0 + math.erf(val / math.sqrt(2.0))) # Standard approximation or standard normal CDF
        except ValueError:
            return 0.0