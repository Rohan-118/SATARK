import json
import tempfile
import pathlib

from rest_framework.test import APITestCase
from rest_framework import status

class InterventionRegressionTests(APITestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.tmp_path = pathlib.Path(self.temp_dir.name)

        self.zones_data = {
            "zones": [
                {
                    "id": "zone-1",
                    "zone_id": "zone-1",
                    "seismic_resilience": 1.0,
                    "resident_population_estimate": 1000,
                    "population_weight": 0.5,
                    "building_footprint_proxy": 100,
                    "lat": 1.0,
                    "lon": 1.0,
                    "center_world": {"x": 0.0, "y": 0.0, "z": 0.0},
                    "center_normalized": {"x": 0.0, "y": 0.0, "z": 0.0},
                    "neighbors": []
                }
            ]
        }
        self.zones_path = self.tmp_path / "zones.json"
        self.zones_path.write_text(json.dumps(self.zones_data))

        self.infra_data = {
            "infrastructure": [
                {
                    "id": "hospital-1",
                    "type": "MEDICAL",
                    "zone_id": "zone-1",
                    "seismic_resilience": 1.0
                }
            ]
        }
        self.infra_path = self.tmp_path / "infrastructure.json"
        self.infra_path.write_text(json.dumps(self.infra_data))

        self.shelters_data = {
            "shelters": [
                {
                    "id": "shelter-1",
                    "zone_id": "zone-1",
                    "capacity": 500,
                    "type": "EVACUATION_CENTER",
                    "lat": 1.0,
                    "lon": 1.0
                }
            ]
        }
        self.shelters_path = self.tmp_path / "shelters.json"
        self.shelters_path.write_text(json.dumps(self.shelters_data))

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_intervention_regression(self):
        # 1. Initialize Flood
        payload_flood = {
            "duration": 1.0,
            "tick_rate": 10.0,
            "calamity_type": "FLOOD",
            "parameters": {
                "zone_mapping_path": str(self.zones_path),
                "zones_path": str(self.zones_path),
                "infrastructure_path": str(self.infra_path),
                "shelters_path": str(self.shelters_path),
            },
            "initial_state": {
                "population_data": self.zones_data,
                "shelter_data": self.shelters_data,
            }
        }
        response = self.client.post("/api/simulation/initialize/", payload_flood, format="json")
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        
        data = response.json()
        self.assertIn("intervention", data)
        self.assertIsNone(data["intervention"])
        self.assertIn("interventions", data)
        self.assertEqual(len(data["interventions"]), 0)
        
        # Apply Intervention A
        intervention_a = {
            "id": "deploy_mobile_pumps",
            "action": "deploy_mobile_pumps"
        }
        response = self.client.post("/api/simulation/intervention/", intervention_a, format="json")
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        
        # State check
        response = self.client.get("/api/simulation/state/")
        data = response.json()
        self.assertEqual(data["intervention"]["id"], "deploy_mobile_pumps")
        self.assertEqual(len(data["interventions"]), 1)
        
        # Apply Intervention B
        intervention_b = {
            "id": "reroute_traffic",
            "action": "reroute_traffic"
        }
        response = self.client.post("/api/simulation/intervention/", intervention_b, format="json")
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        
        # State check
        response = self.client.get("/api/simulation/state/")
        data = response.json()
        self.assertEqual(data["intervention"]["id"], "reroute_traffic")
        self.assertEqual(len(data["interventions"]), 2)
        self.assertEqual(data["interventions"][0]["id"], "deploy_mobile_pumps")
        self.assertEqual(data["interventions"][1]["id"], "reroute_traffic")

        # 2. Initialize Earthquake
        payload_eq = {
            "duration": 1.0,
            "tick_rate": 10.0,
            "calamity_type": "EARTHQUAKE",
            "parameters": {
                "magnitude": 8.0,
                "depth_km": 10.0,
                "zone_id": "zone-1",
                "zone_mapping_path": str(self.zones_path),
                "zones_path": str(self.zones_path),
                "infrastructure_path": str(self.infra_path),
                "shelters_path": str(self.shelters_path),
            },
            "initial_state": {
                "population_data": self.zones_data,
                "shelter_data": self.shelters_data,
            }
        }
        response = self.client.post("/api/simulation/initialize/", payload_eq, format="json")
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        
        data = response.json()
        self.assertIn("intervention", data)
        self.assertIsNone(data["intervention"])
        self.assertIn("interventions", data)
        self.assertEqual(len(data["interventions"]), 0)
