# SATARK PHASE 7 — FULL SYSTEM AUDIT

## 1. Executive Summary

This document represents the Phase 7 Full System Audit for SATARK. It explores the current state of both the frontend and backend architectures immediately prior to their formal integration. The primary goal is to map the models, APIs, coordinates, and lifecycles between the two systems, and to identify any mismatches or integration blockers. 

Based on the audit, the systems exhibit a high degree of architectural alignment, primarily because the frontend has anticipated the structure of the backend models and both systems derive their spatial understanding from the same underlying geographic data (`glb_zone_mapping.json`). The primary challenge for integration will be handling REST-based polling efficiently and ensuring smooth agent state normalization.

## 2. Current Architecture

- **Backend:** Django/DRF application running a deterministic, tick-based Simulation Engine in-memory. State is maintained inside a `SimulationEngine` instance, containing entities (like `HumanAgent`) and sub-engines (Flood, Panic, Risk, Evacuation).
- **Frontend:** React + Three.js application using Zustand for state management. Uses a tick-driven simulation slice, updating 3D renders based on current state.

## 3. Repository Inventory

```
SATARK/
├── backend/
│   ├── agents/            # HumanAgent, AgentManager, Panic/Normal Behaviors
│   ├── algorithms/        # Casualties, Flood Impact, Crowd, Evacuation algorithms
│   ├── api/               # REST Views and Serializers for Simulation control
│   ├── calamities/        # Disaster engines (Flood)
│   ├── data/              # glb_zone_mapping.json and other datasets
│   ├── decision/          # Interventions, Optimizer, Recommendations
│   ├── infrastructure/    # Network logic and Facility models
│   ├── simulation/        # Core SimulationEngine, Clock, World
│   └── twin/              # Authoritative WorldState and Entity definitions
├── frontend/
│   ├── src/
│   │   ├── api/           # Frontend API clients (worldApi, etc.)
│   │   ├── city/          # Three.js renderers (AgentRenderer, Scene, Voronoi)
│   │   ├── components/    # React UI components
│   │   ├── store/         # Zustand slices (agentSlice, simulationSlice)
│   │   └── types/         # Domain mappings (Agent, Position3D, etc.)
```

## 4. Frontend Architecture

The frontend follows a unidirectional data flow architecture using Zustand to manage application state and drive Three.js renderers.

- **State:** `AgentSnapshot`, `WorldSnapshot` drive the UI.
- **Rendering:** `AgentRenderer` listens to `agentSlice` and animates `Capsule` characters based on `AgentState`. Zone boundaries are visualized dynamically using a Sutherland-Hodgman Voronoi clipping algorithm over 21 zone centers.
- **Assumption:** The frontend assumes it will receive data via an API client and normalize it to its domain types.

## 5. Backend Architecture

The backend implements an in-memory `SimulationEngine` that orchestrates various sub-engines sequentially per tick:
`Scenario -> Flood -> FloodImpact -> ExplainableNetwork -> Panic -> Evacuation -> CrowdDynamics -> Casualties -> Risk -> Decision -> Recommendation -> Intervention -> WorldState`

- **State:** Owned completely by the `SimulationEngine` and `WorldState`. The REST API simply retains a global reference (`_active_engine`) to serve subsequent requests.
- **API:** Django REST Framework exposes initialization, step, run, pause, and intervention views.

## 6. Agent System Audit

| Backend | Frontend | Compatible? | Required action |
|---------|----------|-------------|-----------------|
| `HumanAgent` (Entity) | `Agent` | ✅ YES | None |
| string ID | string `id` | ✅ YES | None |
| `Position` (x,y,z floats) | `Position3D` | ✅ YES | Direct map. |
| `AgentState` enum | `AgentState` | ✅ YES | Values: `NORMAL`, `PANIC`, `SAFE` |
| `zone_id` (string) | `zoneId` | ⚠️ ADAPTER | Map `zone_id` -> `zoneId` |
| Route / `speed` | `speed`, target | ✅ YES | Optional usage in frontend. |

**Observation:** The frontend model `Agent` and the backend `HumanAgent` serializer output are functionally identical. `WorldStateSerializer` intentionally projects `HumanAgent` properties down to standard primitives: `id`, `position`, `state`, and `zoneId`.

## 7. Coordinate System Audit

**BLOCKER STATUS:** Clear / Resolved.

- **Backend Coordinate System:** `glb_zone_mapping.json` defines absolute GLB coordinates:
  - X = GLB World X
  - Y = Vertical Axis
  - Z = Map Axis (World Z)
  - World Bounds: X: `[-178356.8, -173331.4]`, Z: `[150612.9, 159912.2]`
- **Frontend Coordinate System:** `Position3D` utilizes standard X, Y, Z floats matching the GLB world coordinates. Three.js is configured to match these bounds.
- **Transformation:** The backend explicitly states it uses GLB coordinates, meaning **Backend Position == GLB World Position**. No artificial transformations or axis swaps are required.

## 8. Zone System Audit

| Backend | Frontend | Compatible? | Required action |
|---------|----------|-------------|-----------------|
| `Z01` ... `Z21` | `Z01` ... `Z21` | ✅ YES | None |
| `glb_zone_mapping.json` | imports `glb_zone_mapping.json` | ✅ YES | Frontend currently imports JSON directly; must switch to API. |

Both systems utilize 21 authoritative zones driven by the same exact mapping file. The backend dictates the boundaries; the frontend derives visualization Voronois from the provided centers.

## 9. Zone Connectivity Audit

- **Data Source:** Connectivity is strictly defined by the `neighbors` array in `glb_zone_mapping.json` for each zone.
- **Backend Usage:** Used for evacuation routing (Dijkstra-based zone hopping in `EvacuationEngine`).
- **Symmetry:** Assumed symmetric and strictly planar based on the dataset.

## 10. Simulation Engine Audit

- **Tick Ownership:** Backend `SimulationClock` owns `current_tick` and `simulation_time`.
- **Integration Profile:**
  - `SimulationStepView` advances exactly one tick.
  - `SimulationRunView` runs to completion.
  - `SimulationPauseView` / `SimulationResumeView`.
- **Mismatch:** Frontend expects a continuous feed or snapshot polling. If the frontend controls playback by calling `/step` in a loop, it takes over the clock pacing.

## 11. Disaster System Audit

- **Flood:** Authoritative. `FloodImpactEngine` calculates damage.
- **Earthquake:** (Not deeply implemented in core view engine yet, but anticipated by `CalamityType`).
- **Compatibility:** Backend serializes `active_calamity` into WorldState. Frontend will consume this string and render accordingly.

## 12. Flood Audit

The backend implements `Flood` propagation and depth calculation. `FloodImpactEngine` ties this into infrastructure, triggering cascades in `ExplainableNetwork`.

## 13. Earthquake Audit

Not fully visible in the active `api/views.py` payload outside of `CalamityType`. Will likely follow the same projection pattern.

## 14. Risk System Audit

- **Backend:** `RiskEngine` calculates `risk_state` and returns it inside `_state_payload()`.
- **Frontend:** Consumes risk per zone.
- **Compatibility:** Exact payload structure of `risk_state` must be observed, but it travels with the main state payload.

## 15. Intervention Audit

- **Backend:** Exposes `/api/optimization` for assessing candidates, and `/api/intervention` for applying a selected intervention. Interventions are structured as `Intervention(intervention_id, name, description, priority, expected_effects, ...)`.
- **Compatibility:** High. The frontend Phase 6C UI perfectly mirrors these parameters.

## 16. Casualty/Damage Audit

- **Backend:** `CasualtiesEngine` calculates casualty states and reduces population capacity. Returned as `casualty_state` and `infrastructure_state`.
- **Units:** Exact integer reductions and severity scores.

## 17. Infrastructure Audit

Facilities (shelters, safe zones) are initialized from `Scenario.initial_state["shelter_data"]`. Agents route to these during the `PANIC` phase via `EvacuationEngine`.

## 18. API Audit

**API Ownership:** Backend `api/views.py`.
- `POST /simulation/initialize`: Creates simulation, returns full state.
- `GET /simulation/state`: Returns current state.
- `POST /simulation/step`: Advances one tick, returns full state.
- `POST /simulation/run`: Runs to end.
- `POST /simulation/pause`
- `POST /simulation/resume`
- `POST /simulation/reset`
- `GET /risk`: Returns risk state.
- `GET /recommendation`: Returns recommendation state.
- `POST /optimization`: Evaluates candidate interventions.
- `POST /intervention`: Applies an intervention.
- `POST /intervention/selected`: Applies the active/selected intervention.

## 19. API ↔ Frontend Comparison

| Feature | Backend API | Frontend Expectation | Adaptation |
|---------|-------------|----------------------|------------|
| Initialization | `POST /initialize` | World API / Initialize | Direct mapping. |
| World Snapshot | `GET /state` | `WorldSnapshot` | Adapter needed to parse `entities` array into `AgentSnapshot`. |
| Controls | `POST /step`, `/pause` | UI Controls | Standard REST clients needed. |

## 20. REST/Polling/WebSocket Audit

**CRITICAL FINDING:** The backend currently relies **strictly on REST HTTP calls** (`APIView`). There is NO WebSocket or SSE implementation in `api/views.py`.
- **Implication:** The frontend must implement HTTP Polling to fetch `WorldState` if the simulation is running continuously on the backend (e.g. after a `/resume` call), or it must drive the simulation manually via repeated `/step` calls.
- **Decision Required:** Is the frontend driving the ticks (calling `/step`), or is the backend driving the ticks while the frontend polls (`GET /state`)?

## 21. World Snapshot Audit

```text
Backend World State (`api.serializers.WorldStateSerializer`)
        ↓
JSON payload:
{
  "currentTick": int,
  "simulationTime": float,
  "activeCalamity": str,
  "entities": [ { "id", "position": {"x","y","z"}, "state", "zoneId", "type" } ],
  "environment": {...},
  "metrics": {...},
  "events": [...]
}
        ↓
Frontend Normalization Layer
        ↓
Split into: `SimulationSnapshot` (Tick, Time, Calamity), `AgentSnapshot` (Entities filter type="HumanAgent").
```

## 22. State Ownership Audit

| State | Authoritative Owner | Frontend Copy | Integration Rule |
| ----- | ------------------- | ------------- | ---------------- |
| Simulation Tick | Backend | `simulationSlice` | UI must strictly adopt backend tick. |
| Selected Zone | Frontend | `uiSlice` | Purely a visual selection concept. |
| Agent Position | Backend | `agentSlice` | Frontend animates between positions based on latest backend snapshot. |
| Agent State | Backend | `agentSlice` | UI visualizes (NORMAL/PANIC/SAFE). |
| Risk / Casualties | Backend | UI State | Consumed as read-only widgets. |

## 23. Naming Audit

- **zoneId vs zone_id:** Backend `HumanAgent` uses `zone_id`, but `WorldStateSerializer` explicitly converts this to `zoneId`. **COMPATIBLE.**
- **Calamity vs Disaster:** Both use `calamity` or `calamityType`. **COMPATIBLE.**

## 24. Time/Units Audit

- Simulation Time: `float` (seconds).
- Coordinates: GLB absolute floats (Meters/Arbitrary geographic grid matching `.glb`).
- Agent Speed: `float` (units per simulation step).

## 25. Identity Audit

- All entity IDs are stringified in the API serializer. Frontend assumes strings. **COMPATIBLE.**

## 26. Data Lifecycle Audit

- **Agents:** Populated during `/initialize` via `AgentManager.build_population_agents()`. Tracked continuously until `/reset`.

## 27. Performance Audit

- **Snapshot Size:** 250,000 modeled residents are condensed into a **representative agent count** (default 250) during initialization.
  - The backend only simulates and serializes these 250 representative agents.
  - Snapshot size will be small and performant.

## 28. Security/Validation Audit

- Backend validates inputs via DRF serializers (`SimulationRequestSerializer`). Error responses are standard HTTP 400/409.

## 29. Test Audit

Backend validation scripts exist (`scripts/validate_data.py`). Integration testing requires verifying end-to-end REST calls.

## 30. Architectural Conflicts

- **Playback Ownership:** Backend exposes `/run` and `/resume` which imply the backend has a background task advancing ticks. However, a standard Django APIView does not have an asynchronous background event loop running the simulation natively between HTTP requests unless celery/threading is used (which is not visible in `views.py`). It is highly probable the simulation only advances when explicitly told to, or runs in a blocking loop during `/run`.
  - **Resolution:** Frontend should likely drive the simulation via `/step` for controlled playback, or understand that `/run` will block the HTTP request until completion.

## 31. Compatibility Matrix

| System        | Backend | Frontend | Status | Action |
| ------------- | ------- | -------- | ------ | ------ |
| Coordinates   | GLB     | GLB      | ✅ COMPATIBLE | None. |
| Zones         | 21 JSON | 21 JSON  | ✅ COMPATIBLE | Replace frontend static JSON import with API fetch. |
| Agents        | 250 Rep | `Agent`  | ✅ COMPATIBLE | Serializer perfectly matches frontend. |
| Simulation    | Tick    | Tick     | ⚠️ ADAPTER   | Must clarify tick-drive ownership (REST vs Loop). |
| Risk          | Backend | Widget   | ✅ COMPATIBLE | None. |
| Interventions | DRF API | UI Slice | ✅ COMPATIBLE | Map JSON payload to UI. |
| API           | REST    | Axios/Fetch| ⚠️ ADAPTER | Build Axios REST client in frontend. |

## 32. Integration Blockers

There are **NO SEVERE BLOCKERS** to integration.
- The coordinate systems naturally align.
- The agent state maps perfectly.
- Representative agent caps ensure rendering will not crash the browser.

**LOW PRIORITY BLOCKER:**
- Define simulation playback loop (Frontend driven `/step` vs Backend async).

## 33. SATARK Integration Contract

1. **Coordinate contract:** Absolute GLB coordinates. No transformation required.
2. **Zone contract:** 21 zones mapped from `glb_zone_mapping.json`.
3. **Agent contract:** Backend outputs `{ id, position: {x,y,z}, state, zoneId, type }`. Frontend consumes directly.
4. **Simulation contract:** Backend owns tick. Frontend renders.
5. **Disaster contract:** Backend drives severity and affected zones. Frontend observes via `activeCalamity`.
6. **Risk contract:** Backend risk API dictates risk values per zone.
7. **Intervention contract:** Interventions trigger algorithm outputs which then propagate to world state.
8. **World snapshot contract:** Frontend normalizes `entities` array into `AgentSnapshot`.
9. **API contract:** REST API over HTTP. Payload is JSON.
10. **Time/unit contract:** Base time is float (seconds). Base spatial unit is GLB coordinate.
11. **ID contract:** Strings across all domains.
12. **State ownership contract:** Backend owns source of truth. Frontend owns presentation and caching.

## 34. Phased Integration Plan

**PHASE 8A: API Foundation & Zone Contract**
- Implement `apiClient.ts` in frontend.
- Replace static `glb_zone_mapping.json` import with an initialization API call to fetch world bounds and zones.

**PHASE 8B: World State Synchronization**
- Implement polling/stepping loop to fetch `WorldState` from `/api/simulation/state`.
- Parse `entities` into `AgentSnapshot` and push to Zustand.

**PHASE 8C: Simulation Controls**
- Hook up Command Center Play/Pause/Step buttons to POST endpoints.

**PHASE 8D: Disaster & Risk Integration**
- Consume `risk` and `environment` from `_state_payload`.
- Display dynamic flood/disaster overlays based on backend data.

**PHASE 8E: Interventions**
- Hook up recommendation ingestion.
- POST selected interventions to `/api/intervention/selected`.
- Display impacts on the command center.

**PHASE 8F: Disaster visualization**
- Enhance existing frontend tools to ingest disaster extent dynamically.

**PHASE 8G: End-to-end lifecycle**
- Simulate an entire scenario run and document runtime deviations.

**PHASE 8H: Performance + reliability**
- Optimize React renders based on continuous polling streams.

## 35. Recommended Next Action

**Yes, we can begin integration immediately.**
The systems are extraordinarily well-aligned. The best next action is to execute **PHASE 8A**: replacing the temporary static JSON imports in the frontend with a real API client configuration to speak to the local Django server.
