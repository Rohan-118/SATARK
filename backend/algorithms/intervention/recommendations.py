class RecommendationEngine:
    def __init__(self):
        # Define available government interventions and their mechanical effects
        self.available_interventions = {
            "deploy_mobile_pumps": {
                "name": "Deploy High-Capacity Mobile Drainage Pumps",
                "target": "flood",
                "effect": {"drainage_rate_boost": 0.05}, # Adds 5cm/hr drainage capacity
                "description": "Alleviates water logging in targeted commercial/residential zones."
            },
            "reroute_traffic": {
                "name": "Emergency Traffic Rerouting & Corridor Clearing",
                "target": "crowd",
                "effect": {"capacity_multiplier": 1.4}, # Expands transit capacity by 40%
                "description": "Opens secondary escape paths to relieve severe bridge/zone bottlenecks."
            },
            "deploy_backup_generators": {
                "name": "Dispatch Mobile Generators to Critical Substations",
                "target": "infrastructure",
                "effect": {"min_capacity_floor": 0.5}, # Ensures hospitals/pumps don't drop below 50% power
                "description": "Prevents medical system collapse and keeps water treatment operational."
            },
            "mandatory_evacuation_order": {
                "name": "Issue Zone-Wide Mandatory Evacuation Order",
                "target": "panic_and_movement",
                "effect": {"movement_speed_multiplier": 1.5}, # Accelerates evacuation pace
                "description": "Forces rapid clearance of low-lying areas before flood levels peak."
            }
        }

    def generate_recommendations(self, risk_assessment_report, applied_intervention_ids=None):
        """
        Analyzes the risk breakdown and suggests the top interventions to mitigate losses.
        """
        if applied_intervention_ids is None:
            applied_intervention_ids = []
            
        breakdown = risk_assessment_report.get("breakdown", {})
        recommendations = []

        # Flood Rules
        if breakdown.get("flooding", 0) > 40:
            recommendations.append({
                "id": "deploy_mobile_pumps",
                "priority": "HIGH",
                **self.available_interventions["deploy_mobile_pumps"]
            })

        if breakdown.get("congestion", 0) > 30:
            recommendations.append({
                "id": "reroute_traffic",
                "priority": "HIGH",
                **self.available_interventions["reroute_traffic"]
            })

        if breakdown.get("infrastructure", 0) > 30:
            recommendations.append({
                "id": "deploy_backup_generators",
                "priority": "MEDIUM",
                **self.available_interventions["deploy_backup_generators"]
            })

        if risk_assessment_report.get("composite_risk_score", 0) > 60:
            recommendations.append({
                "id": "mandatory_evacuation_order",
                "priority": "CRITICAL",
                **self.available_interventions["mandatory_evacuation_order"]
            })

        # Earthquake Expansion Rules (Triggered if there's infrastructure or casualty risk, but not necessarily flooding)
        # Using existing interventions
        if breakdown.get("infrastructure", 0) > 20 and breakdown.get("flooding", 0) == 0:
            recommendations.append({
                "id": "deploy_backup_generators",
                "priority": "MEDIUM",
                **self.available_interventions["deploy_backup_generators"]
            })

        if risk_assessment_report.get("composite_risk_score", 0) > 40 and breakdown.get("flooding", 0) == 0:
            recommendations.append({
                "id": "reroute_traffic",
                "priority": "HIGH",
                **self.available_interventions["reroute_traffic"]
            })
            
        if risk_assessment_report.get("composite_risk_score", 0) > 70 and breakdown.get("flooding", 0) == 0:
            recommendations.append({
                "id": "mandatory_evacuation_order",
                "priority": "CRITICAL",
                **self.available_interventions["mandatory_evacuation_order"]
            })

        # Fallback for Earthquake scenario where base rules don't trigger
        # Ensures there is always at least one recommendation for valid disasters
        if not recommendations and (breakdown.get("casualties", 0) > 0 or breakdown.get("infrastructure", 0) > 0):
            recommendations.append({
                "id": "deploy_backup_generators",
                "priority": "LOW",
                **self.available_interventions["deploy_backup_generators"]
            })

        # Filter out already applied interventions
        unique_recs = []
        seen = set(applied_intervention_ids)
        for rec in recommendations:
            if rec["id"] not in seen:
                unique_recs.append(rec)
                seen.add(rec["id"])

        return unique_recs

    def apply_intervention(self, intervention_id, simulation_environment_state):
        """
        Mutates the simulation state variables when a government intervention is selected,
        triggering the 'best-case scenario' recovery curve.
        """
        if intervention_id not in self.available_interventions:
            raise ValueError(f"Unknown intervention ID: {intervention_id}")

        intervention = self.available_interventions[intervention_id]
        effect = intervention["effect"]

        # Apply the mechanical changes based on the intervention type
        if intervention["target"] == "flood":
            for zone_id in simulation_environment_state["zones"]:
                simulation_environment_state["zones"][zone_id]["drainage_rate"] += effect["drainage_rate_boost"]

        elif intervention["target"] == "crowd":
            for zone_id in simulation_environment_state["transit_capacities"]:
                simulation_environment_state["transit_capacities"][zone_id] *= effect["capacity_multiplier"]

        elif intervention["target"] == "infrastructure":
            for node_id in simulation_environment_state["infrastructure_nodes"]:
                current_backup = simulation_environment_state["infrastructure_nodes"][node_id].get("backup_power", 0.0)
                simulation_environment_state["infrastructure_nodes"][node_id]["backup_power"] = max(
                    current_backup, effect["min_capacity_floor"]
                )

        return simulation_environment_state