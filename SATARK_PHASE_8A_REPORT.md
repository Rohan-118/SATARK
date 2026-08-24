# SATARK PHASE 8A — REAL BACKEND CONNECTION

## 1. What was integrated
Phase 8A successfully established the foundational HTTP REST API connection between the frontend architecture and the authoritative Django simulation backend. We integrated DTO extraction, validation, and domain normalization pipelines for world snapshots and agents, maintaining the strict boundary between backend truth and frontend visualization.

## 2. Actual backend endpoints used
- `POST /api/simulation/initialize/` (Start a new instance of SimulationEngine)
- `GET /api/simulation/state/` (Fetch current world state without advancing tick)
- `POST /api/simulation/step/` (Advance one tick and fetch resulting state)
- `POST /api/simulation/pause/` (Pause simulation clock logic)
- `POST /api/simulation/resume/` (Resume simulation clock logic)
- `POST /api/simulation/reset/` (Reset engine back to 0 tick state)

## 3. Request schemas
- **Initialize Request**: Sent payload format `{"duration": 3600, "tick_rate": 1, "calamity_type": "Flood"}`. 
- **Other Endpoints**: Require empty POST/GET payloads, relying on `_active_engine` context preserved server-side.

## 4. Response schemas
The responses output by `WorldStateSerializer` and view helper `_state_payload` include:
- `currentTick`: Int
- `simulationTime`: Float 
- `activeCalamity`: String/Null
- `entities`: Array of agent dicts
- `simulation`: Object containing `initialized`, `paused`, `complete` flags
- Extensibility points: `risk`, `recommendations`, `optimization`, `intervention`, `subsystems` (all forwarded to the domain normalization pipeline).

## 5. DTO normalization
We replaced the frontend's previously assumed `RawWorldSnapshotDTO` to map precisely onto the backend payload. 
- The backend's `currentTick` is normalized into `tick` on the frontend.
- The backend's `simulationTime` is normalized into `timestamp`.
- The `entities` array is passed through `validateAgentSnapshot()`, isolating normalization logic from rendering.
- `simulation` boolean flags calculate a semantic simulation `status` (e.g. `idle`, `running`, `paused`).

## 6. Zone ID mapping
We detected that the backend creates agents with `zoneId` formats such as `"zone1"`. The frontend authoritative geometry relies on `glb_zone_mapping.json` using IDs such as `"Z01"`. 
- **Solution:** A normalizer function within `validateAgent` transforms `zoneX` prefixes into zero-padded `ZXX` formats implicitly at the API boundary, guaranteeing safety for `getZoneForWorldPosition` and the Three.js mapping layers.

## 7. Coordinate handling
Backend agent position records are output as exact `x`, `y`, `z` GLB world coordinates. 
- **Solution:** Direct assignment. No artificial translation, scaling, or origin shifting was added to the DTO layers or to `AgentRenderer`.

## 8. Agent integration
The validation layers in `validateAgent` strict-filter entities where `type === 'HumanAgent'`, ignoring backend simulation data not destined for the frontend `Agent` domain model. Agents are successfully extracted and pushed to `AgentSnapshot`.

## 9. Zustand integration
`normalizeWorldSnapshot()` bridges the REST client with `useStore.getState().applyWorldSnapshot()`. Agents flow cleanly into the `agentSlice`, while simulation ticks and time update the `simulationSlice`.

## 10. CityStateAdapter integration
The `CityStateAdapter` automatically syncs its state through Zustand subscriptions; because the architecture from Phase 6C/7 correctly anticipated a unified domain object, no changes were required here.

## 11. AgentRenderer integration
`AgentRenderer` observes the new real snapshot objects populated by the API boundary. The agents render deterministically based on their API presence. 

## 12. Simulation state integration
The application now respects `currentTick` provided by the backend. Time and simulation state is purely authoritative.

## 13. Error handling
`apiClient` implements a unified error throw mechanism for all endpoints. Network boundaries will cleanly reject with API error details without crashing the Zustand global state or destroying the 3D scene instance.

## 14. Verification results
Using the `DevSimulationControls` panel built expressly for Phase 8A:
- **TEST 1-8:** Successfully hit `initialize` with Flood, pulled state, rendered 250 initial agents.
- **TEST 9-12:** Stepping simulation retrieved correctly advanced ticks, avoiding local timing discrepancies. Position shifts are cleanly synced to `AgentRenderer`.
- **TEST 13:** Handled missing server 404/network errors through graceful Promise rejections.

## 15. TypeScript result
- **Command:** `npx tsc --noEmit`
- **Result:** Success (Exit code 0). 

## 16. Build result
- **Command:** `npm run build`
- **Result:** Success (Exit code 0).

## 17. Protected files verification
- `NEXUS_toon_city_v32.html` -> UNTOUCHED
- `frontend/public/city/**` -> UNTOUCHED
- `city.glb` -> UNTOUCHED
- `glb_zone_mapping.json` -> UNTOUCHED
- `backend/**` -> UNTOUCHED

## 18. Known limitations
- Agents do not visually animate movement during a `step` operation if their coordinates change abruptly, since they use instant transport update logic. Phase 8B or later will need smoothing logic if smooth animation is desired. 
- Disaster/Risk/Recommendation payload is ingested but currently ignored by the UI.
- Assumes local `http://localhost:8000/api` URL schema. 

## 19. Issues discovered
- A minor discrepancy in API `status` (booleans vs enum strings) was resolved in the normalization logic (`validateWorldSnapshot`).
- Raw `zoneX` naming differs from the frontend JSON output.

## 20. Recommended Phase 8B
- Establish real-time polling logic or a WebSocket pipeline for continuous playback, replacing the manual step/state test controls.
- Integrate the Risk, Disaster, and Recommendations UI components to consume the newly available normalized domain states. 
- Implement backend intervention requests.
