# SATARK — Disaster-Response Digital Twin System

High-performance, zone-based disaster-response digital twin engineered for municipal flood simulation, critical infrastructure cascading failure analysis, and automated counterfactual decision optimization.

[![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-3776ab.svg)](https://www.python.org/)
[![Django 5.0+](https://img.shields.io/badge/Django-5.0%2B-092e20.svg)](https://www.djangoproject.com/)
[![React 18+](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-r164-black.svg)](https://threejs.org/)
[![Tests](https://img.shields.io/badge/Tests-93%20passed%20(100%25)-brightgreen.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Overview

SATARK (*Sensing, Analytics, Topographic Assessment & Real-time Knowledge*) is an authoritative, zone-based disaster-response digital twin designed for municipal emergency operation centers and disaster management authorities. Rapid urbanization and extreme cloudburst events often overwhelm city infrastructure, leaving operators with fragmented, lagging data where storm drain capacities, power grid dependencies, and shelter bottlenecks fail without early warning. SATARK solves this by coupling surface hydrology with 1D subsurface Manning drainage hydraulics, simulating cross-sector infrastructure cascading failures via an explainable DAG, and evaluating counterfactual emergency interventions to recommend mathematically optimal life-saving actions in sub-15ms simulation steps.

## Demo / Screenshot

SATARK delivers a dual command-center interface: a **3D Holographic Digital Twin** with real-time agent evacuation dynamics and water height rendering, coupled with an interactive **2D GIS Map** displaying georeferenced municipal ward boundaries, flood depth contours, and drainage surcharge warnings.

![SATARK 3D dashboard screenshot](images\3D.png)
![SATARK 2D dashboard screenshot](images\2D.png)

## Features

- **Coupled Surface Hydrology & 1D Subsurface Drainage Hydraulics**: Tracks physical water volumes, pipe capacity utilization ($Q_{\text{cap}}$ via Manning's formula), and back-propagation pipe surcharging.
- **Calibrated Temporal Hyetographs & 0–3h Nowcasting**: Models temporal storm distributions (including the historic Mumbai 2005 944mm cloudburst and Huff Quartile curves) with forward-projected inundation depths.
- **Explainable Critical Infrastructure Cascade DAG**: Simulates inter-dependency failure sequences across electric substations, water treatment plants, hospitals, and telecommunications towers.
- **Agent Evacuation & Dynamic Shelter Management**: Simulates 250 dynamic citizens with panic escalation, Dijkstra-based flood-safe routing, and shelter capacity monitoring.
- **Counterfactual Intervention Optimizer**: Quantifies the mathematical impact of candidate emergency actions (mobile pumps, backup power generators, evacuation corridors) against baseline projections.
- **Dual Spatial Command Center**: Seamless toggling between a 3D Three.js WebGL holographic city model and a 2D Leaflet GIS map with zero external paid API keys.
- **High-Performance Architecture**: Deterministic 9-step simulation pipeline completing 1-hour operational ticks in **12.2 ms** (8x faster than the 100 ms target).

## Table of Contents

- [Overview](#overview)
- [Demo / Screenshot](#demo--screenshot)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments / Credits](#acknowledgments--credits)
- [Contact](#contact)

## Installation

### Prerequisites

Ensure you have the following installed on your host system:
- **Python**: Version `3.11` or higher
- **Node.js**: Version `18.x` or `20.x` LTS (with `npm`)
- **Git**

### 1. Clone the Repository

```bash
git clone https://github.com/Rohan-118/SATARK.git
cd SATARK
```

### 2. Backend Setup

```bash
# Create and activate Python virtual environment
python -m venv .venv

# On Windows (PowerShell):
.venv\Scripts\Activate.ps1
# On Linux / macOS:
source .venv/bin/activate

# Install backend Python dependencies
pip install -r requirements.txt

# Run initial database migrations
python backend/manage.py migrate
```

### 3. Frontend Setup

```bash
cd frontend
npm install
cd ..
```

## Usage

### Simplest Example: Launching the System

Start the backend API server and frontend command dashboard in two separate terminal windows:

#### Terminal 1 — Start Authoritative Backend Digital Twin:
```bash
# From workspace root with activated virtual environment
python backend/manage.py runserver 8000
```
Backend API will be live at `http://127.0.0.1:8000/api/`.

#### Terminal 2 — Start Frontend Command Center:
```bash
# From workspace root
cd frontend
npm run dev
```
Open `http://localhost:5173/` in any modern browser.

### Operational Walkthrough

1. **Inspect Baseline State**: Open the dashboard to view the normal urban baseline with all 21 municipal sectors dry and agents wandering normally.
2. **Select Disaster Scenario**: Choose a preset scenario (e.g. *Standard Monsoon Rain*, *Severe Flash Flood*, or *Mumbai 2005 Cloudburst*).
3. **Step or Run Simulation**: Click **"Start Simulation"** to initiate the 9-step physical stepping pipeline.
4. **Scrub Forward Projections**: Click **Hour 1**, **Hour 2**, or **Hour 3** in the Nowcast bar to preview projected inundation depths and pipe surcharge before they occur.
5. **Switch to 2D GIS Map**: Click **"2D GIS MAP"** in the top navigation bar to inspect georeferenced flood contours, safe zones, and drainage statuses across the peninsula.
6. **Evaluate & Apply Interventions**: Review recommended emergency countermeasures (e.g. *Deploy Mobile Pumps*) in the right panel and approve them to observe real-time flood mitigation.

## Configuration

SATARK is configured via environment variables and standard Django settings.

| Variable | Description | Default |
|---|---|---|
| `DJANGO_SECRET_KEY` | Secret key for Django cryptographic signing | Auto-generated development key |
| `DEBUG` | Enable/disable Django debug mode | `True` |
| `ALLOWED_HOSTS` | Comma-separated allowed hostnames | `*` |
| `PORT` | Backend development server port | `8000` |
| `VITE_API_URL` | Base URL for backend REST API in frontend | `http://127.0.0.1:8000/api` |

## API Reference

The backend exposes a clean REST API for digital twin management, scenario execution, and decision support:

| Endpoint | Method | Description |
|---|---|---|
| `/api/simulation/initialize/` | `POST` | Initialize a new simulation scenario with custom rainfall and parameters |
| `/api/simulation/step/` | `POST` | Advance the digital twin by $N$ operational hours (ticks) |
| `/api/simulation/state/` | `GET` | Retrieve the latest authoritative digital twin state snapshot |
| `/api/simulation/nowcast/` | `GET` | Fork simulation state and compute 0–3 hour forward inundation projections |
| `/api/simulation/presets/` | `GET` | List available municipal disaster presets (Monsoon, Flash Flood, Cloudburst) |
| `/api/world/zones/` | `GET` | Retrieve the 21 simulation zones, GPS coordinates, elevation, and ward metadata |
| `/api/world/shelters/` | `GET` | Retrieve designated municipal safe zones and shelter capacities |
| `/api/navigation/route/` | `POST` | Calculate a flood-safe transit/evacuation route avoiding submerged roads ($>30\text{ cm}$) |
| `/api/decision/interventions/evaluate/` | `POST` | Run counterfactual comparison between baseline and candidate interventions |

## Project Structure

```
SATARK/
├── backend/
│   ├── algorithms/              # Physical, hydraulic, and ML algorithms
│   │   ├── drainage/            # Manning pipe conveyance & network coupling
│   │   ├── flood/               # Surface water propagation & impact models
│   │   └── rainfall/            # Huff curves & Mumbai 2005 hyetographs
│   ├── api/                     # Django REST Framework endpoints & serializers
│   ├── data/                    # Authoritative zone topology, bounds & shelters
│   ├── decision/                # Counterfactual optimization & recommendation engine
│   ├── infrastructure/          # Critical infrastructure dependency DAG
│   ├── ml/                      # Pre-trained Random Forest flood predictor
│   ├── simulation/              # 9-step simulation pipeline & engine core
│   └── tests/                   # 93 automated unit, integration & benchmark tests
├── frontend/
│   ├── public/                  # Static assets & 3D city meshes (city.glb)
│   ├── src/
│   │   ├── api/                 # REST client bindings for backend services
│   │   ├── city/                # Three.js 3D city renderer, GTAO shaders, agents
│   │   ├── components/          # React command center HUD, 2D GIS & sliders
│   │   ├── store/               # Zustand normalized state management
│   │   └── types/               # TypeScript domain interfaces
│   └── package.json
├── pytest.ini                   # Pytest test discovery & execution configuration
├── requirements.txt             # Backend Python dependencies
└── README.md                    # Project documentation
```

## Testing

SATARK includes an automated test suite covering unit physics, mass conservation, infrastructure cascades, navigation routing, and performance benchmarks.

### Running Backend Tests

```bash
# Run all 93 backend tests
pytest backend/tests/ -v

# Run performance benchmarks specifically
pytest backend/tests/test_benchmarks.py -v -s
```

### Running Frontend Verification

```bash
# Type-check and verify production bundle
npm --prefix frontend run build

# Run frontend linting
npm --prefix frontend run lint
```

## Roadmap

- [x] Coupled 1D Manning pipe hydraulics and surface surcharge backflow.
- [x] Multi-horizon (0–3h) forward nowcasting without state mutation.
- [x] Critical infrastructure cascading failure DAG.
- [x] Counterfactual intervention optimizer with side-by-side metric diffs.
- [x] 3D holographic digital twin with animated citizens and flood height shaders.
- [x] 2D GIS map with georeferenced municipal sectors and dark basemap.
- [ ] Real-time IoT sensor telemetry ingestion (MQTT / WebSockets).
- [ ] Multi-city expansion with automated OpenStreetMap building footprint ingestion.

## Contributing

Contributions are welcome! Please follow these steps:
1. **Fork** the repository on GitHub.
2. **Create a branch** for your feature or bug fix (`git checkout -b feature/amazing-feature`).
3. **Commit** your changes with clear, descriptive commit messages (`git commit -m "Add hydraulic pipe siltation factor"`).
4. **Ensure all tests pass** (`pytest backend/tests/` and `npm --prefix frontend run build`).
5. **Push** to your branch (`git push origin feature/amazing-feature`).
6. **Open a Pull Request** describing your changes.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Acknowledgments / Credits

- Developed for the **Smart India Hackathon (SIH)**.
- **Three.js** community for 3D WebGL rendering capabilities.
- **Leaflet & Esri ArcGIS** for open cartographic dark-canvas basemaps.
- **Municipal Corporation of Greater Mumbai (MCGM)** open historical rainfall data and flood reports for hyetograph calibration.

## Contact

- **Project Maintainer**: SN Omm Tripathy ([@Rohan-118](https://github.com/Rohan-118))
- **Repository**: [https://github.com/Rohan-118/SATARK](https://github.com/Rohan-118/SATARK)
- **Issue Tracker**: [https://github.com/Rohan-118/SATARK/issues](https://github.com/Rohan-118/SATARK/issues)
