# NETRA — Intelligent Network Discovery & Topology Intelligence Platform
# 🌐 NETRA — Intelligent Network Discovery & Topology Intelligence Platform

> **Network Exploration, Topology & Relationship Analytics**  
> **N**etwork **E**xploration, **T**opology & **R**elationship **A**nalytics  
> *"See Your Network. Understand Every Connection."*

[![Python](https://img.shields.io/badge/Python-3.11%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![Cytoscape.js](https://img.shields.io/badge/Cytoscape.js-3.28-ea5455.svg)](https://js.cytoscape.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-dc382d.svg)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ed.svg)](https://www.docker.com/)

---

## 📋 Architectural Principles
## 📌 Problem Statement

NETRA is an evidence-driven, confidence-scored network discovery and topology intelligence platform.
In modern heterogeneous enterprise and campus networks, IT and Network Operations (NOC) teams face critical blind spots:

```text
Reachability (ICMP) ≠ Connectivity (ARP / MAC) ≠ Topology (LLDP / CDP / SNMP)
```
1. **Stale & Manual Network Documentation:**  
   Most organizations rely on outdated Visio diagrams, spreadsheets, or manual audits. When a cable is moved, a switch reconfigured, or a new server plugged in, diagrams immediately drift from reality.

```text
Presentation (React + Cytoscape.js)
      ↓
Application (Use Cases & Services)
      ↓
Domain (Graph, Evidence, Confidence, Changes)
      ↓
Infrastructure (FastAPI, PostgreSQL, Redis, Network Collectors)
```
2. **The "Ping ≠ Topology" Trap:**  
   Traditional tools confuse simple IP reachability (ICMP ping) with physical connectivity. Knowing an IP responds to a ping **does not tell you which switch port it is plugged into**, what neighbors it connects to, or what path traffic takes.

3. **Vendor Heterogeneity & Protocol Silos:**  
   Enterprises operate devices from Cisco, Juniper, Aruba, Linux servers, and generic whiteboxes. Discovering true Layer-2 and Layer-3 topology requires correlating distinct protocols (**LLDP**, **CDP**, **SNMP MIBs**, **Bridge MAC Tables**, and **ARP**) across multi-vendor hardware.

4. **High Mean Time to Detect (MTTD) & Root Cause Analysis (MTTR):**  
   When a link goes down or a device reboots, engineers spend precious hours tracing cables and hopping across CLIs rather than having an instant, real-time visual graph showing exact link failures and blast radius.

---

## 🧭 Master Delivery Matrix
## 💡 The NETRA Solution

| Phase | Milestone | Deliverable | Status |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Foundation & Base Architecture** | FastAPI + PostgreSQL + Alembic + Auth + Base Models + React UI | ✅ **Completed** |
| **Phase 2** | **Network Simulation Lab** | Containerized Network Lab (R1, SW1, SW2, SW3, Hosts) + SNMP/LLDP | ✅ **Completed** |
| **Phase 3** | **Discovery (ICMP & SNMP)** | Ping reachability, SNMP MIB extractor, Device Identity Resolution | ✅ **Completed** |
| **Phase 4** | **Direct Neighbors (LLDP & CDP)** | Layer-2 Port-to-Port Neighbor Adjacency Discovery | ✅ **Completed** |
| **Phase 5** | **Endpoint Placement (ARP & MAC Tables)** | Switch FDB + ARP L2/L3 Correlation Engine | ✅ **Completed** |
| **Phase 6** | **Deterministic Topology & Correlation** | Multi-source Evidence Synthesis & Weighted Confidence (0–100%) | ✅ **Completed** |
| **Phase 7** | **Change Detection & Event Engine** | Graph Differential Engine (Link Down/Up, New Device, Recovery) | ✅ **Completed** |
| **Phase 8** | **Background Workers & WebSockets** | Bounded Concurrency Worker Queue + Real-Time Event Stream | ✅ **Completed** |
| **Phase 9** | **NOC Operations UI & Cytoscape Canvas** | Interactive Topology Graph + Detail Drawers + NOC Dark Theme | ✅ **Completed** |
| **Phase 10** | **Hardening, Tests & SIH Demo Suite** | 4 Deterministic Demo Scenarios + Pytest/Vitest Suites | ✅ **Completed** |
**NETRA** is an evidence-driven, deterministic network discovery and topology intelligence platform.

Instead of guessing connections, NETRA operates on a rigorous architectural axiom:
$$\text{Reachability (ICMP)} \neq \text{Connectivity (ARP / MAC)} \neq \text{Topology (LLDP / CDP / SNMP)}$$

NETRA gathers multi-source evidence across Layer-2 and Layer-3 protocols, calculates an exact mathematical **Confidence Score (0–100%)** for every connection using Bayesian evidence synthesis, continuously tracks graph differentials (link additions, drops, device recoveries), and renders an interactive, real-time NOC topology canvas.

---

## 🛠️ Step-by-Step Task Breakdown
## 🏗️ Architecture & How It Works

### 🚀 Phase 1: Foundation, DB, Auth & Base API
- [x] **Task 1.1: Project Directory Structure & Docker Setup**
  - Created directory layout: `backend/`, `frontend/`, `network-lab/`, `docs/`, `tests/`
  - Created `docker-compose.yml` (PostgreSQL 16, Redis 7, Backend, Frontend), `.env.example`, `.gitignore`
- [x] **Task 1.2: Backend Core Configuration**
  - Implemented `app/core/config.py` (Pydantic v2 Settings for DB, JWT, Redis)
  - Implemented `app/core/logging.py` (Structured JSON logging with correlation fields)
  - Implemented `app/core/security.py` (Bcrypt password hashing, JWT token creation/verification)
  - Implemented `app/core/exceptions.py` (Standard error envelope handler)
- [x] **Task 1.3: Database Infrastructure & Domain Models**
  - Implemented `app/infrastructure/database/session.py` (Async SQLAlchemy 2 engine)
  - Defined database models: `User`, `UserRole`, `Device`, `Interface`, `Credential`, `DiscoveryTarget`, `DiscoveryRun`, `Observation`, `Link`, `TopologySnapshot`, `Event`, `AuditLog`
  - Initialized Alembic migration environment and created initial migration script `20260831_0001_initial_schema.py`
- [x] **Task 1.4: Base API Routes & Health Checks**
  - `GET /api/v1/health` (Health check for DB and system)
  - `POST /api/v1/auth/login` (JWT token exchange)
  - `GET /api/v1/auth/me` (Protected profile)
  - `GET /api/v1/devices` & `GET /api/v1/devices/{id}` (Inventory & telemetry details)
  - `GET`, `POST`, `DELETE /api/v1/targets` (Discovery targets)
  - `GET /api/v1/topology` (Cytoscape graph payload)
  - `GET /api/v1/events` (Severity-filtered network logs)
  - `POST /api/v1/discovery/start` (Discovery job queuing)
- [x] **Task 1.5: Frontend Foundation & NOC Dark UI**
  - Initialized React + TypeScript + Vite + Tailwind CSS with dark NOC design tokens
  - Implemented `AppLayout` with navigation sidebar, status badge, and global search
  - Built `DashboardPage`, `TopologyPage`, `DevicesPage`, `EventsPage`, `DiscoveryPage`, and `LoginPage`
  - Configured TanStack Query, Axios client with JWT interceptor, and Zustand auth store
- [x] **Task 1.6: Automated Tests**
  - Built Pytest suite `tests/test_health_and_auth.py` with async SQLite fixtures
```
                     ┌──────────────────────────────────────────────────────────┐
                     │                 React 18 + Cytoscape.js                  │
                     │          NOC Dark Theme | Universal Search (Ctrl+K)       │
                     └────────────────────────────┬─────────────────────────────┘
                                                  │ REST API & WebSockets
                                                  ▼
                     ┌──────────────────────────────────────────────────────────┐
                     │                   FastAPI Application                    │
                     │           (Async Python 3.11+, Domain-Driven Design)     │
                     └──────┬─────────────────────┬──────────────────────┬──────┘
                            │                     │                      │
                            ▼                     ▼                      ▼
               ┌───────────────────────┐ ┌──────────────────┐ ┌───────────────────┐
               │   Discovery Engine    │ │ Topology Engine  │ │ Event Diff Engine │
               │ (Bounded Concurrency) │ │ (Bayesian Link   │ │ (Graph State      │
               │   Asyncio Semaphore   │ │  Confidence)     │ │  Delta Tracker)   │
               └───────────┬───────────┘ └────────┬─────────┘ └─────────┬─────────┘
                           │                      │                     │
       ┌───────────────────┴──────────────────────┼─────────────────────┴────────┐
       ▼                                          ▼                                    ▼
┌───────────────┐                          ┌───────────────┐                    ┌──────────────┐
│  PostgreSQL   │                          │    Redis 7    │                    │ Network Lab/ │
│  (SQLAlchemy  │                          │ (Task Queue & │                    │ Real Subnet  │
│  2 + Alembic) │                          │  Pub/Sub WS)  │                    │ (SNMP/LLDP/  │
└───────────────┘                          └───────────────┘                    │  ARP/CDP)    │
                                                                                └──────────────┘
```

### 🔄 End-to-End Discovery Pipeline

1. **Target Ingestion & ICMP Sweep:**  
   Subnets (e.g., `192.168.100.0/24` or `10.21.216.0/21`) or individual IPs are targeted. An asynchronous ping sweep discovers reachable hosts and records round-trip latency.

2. **Multi-Protocol Telemetry Extraction:**  
   For responsive hosts, asynchronous collectors query:
   * **SNMP System MIB (`RFC 1213`)**: Fetches `sysDescr`, `sysObjectID`, `sysName`, and `sysUpTime`.
   * **SNMP Interface MIB (`IF-MIB / ifXTable`)**: Extracts all physical/virtual ports, operational status (`up`/`down`), MAC addresses, and speed.
   * **LLDP MIB (`IEEE 802.1AB`) & Cisco CDP MIB**: Extracts direct neighbor chassis IDs, remote port descriptions, and neighbor management IPs.
   * **Bridge Forwarding Database (FDB / `BRIDGE-MIB`) & IP-MIB (`ipNetToMediaTable`)**: Collects switch MAC address tables and router ARP tables to correlate access switch ports with connected client endpoints.

3. **Deterministic Identity Resolution & Classification:**  
   Devices are uniquely identified and de-duplicated based on a strict hierarchy:  
   $$\text{Chassis ID} \succ \text{Stable Interface MAC} \succ \text{FQDN / Hostname} \succ \text{Management IP}$$  
   Devices are automatically classified into roles: **Router**, **Switch**, **Server**, or **Host/Workstation**.

4. **Bayesian Link Synthesis & Confidence Scoring:**  
   Connections are assigned weighted confidence based on supporting evidence:
   * Bi-directional LLDP: **98%**
   * Single-sided LLDP: **95%**
   * Cisco CDP Adjacency: **90%**
   * Correlated Switch MAC FDB + Router ARP: **80%**
   * Subnet IP Adjacency heuristic: **30%**

5. **Graph Differential & Change Detection:**  
   Every new discovery cycle compares the fresh graph state against the previous `TopologySnapshot`. It emits structured events: `NEW_DEVICE`, `DEVICE_DOWN`, `DEVICE_RECOVERED`, `LINK_ADDED`, or `LINK_REMOVED`.

---

### 🌐 Phase 2: Network Simulation Lab
- [x] **Task 2.1: Lab Topology Definition** (`R1`, `SW1`, `SW2`, `SW3`, `Server1`, `Host1` in `docker-compose.lab.yml`)
- [x] **Task 2.2: Telemetry Emulation** (`snmpd-r1.conf` to `snmpd-host1.conf` with standard MIBs, `lldpd` daemon)
- [x] **Task 2.3: Fault Injection Scripts** (`lab-control.ps1` & `lab-control.sh` with `start`, `stop`, `link-down-sw2`, `link-up-sw2`, `add-sw4`, `remove-sw4`)
## ✨ Key Features

* 🗺️ **Interactive Cytoscape.js Topology Canvas:**
  * **Role-Based Geometric Shapes:** 🔷 Diamond for Routers, ▰ Rounded Rectangles for Switches, █ Tall Boxes for Servers, ⬤ Ellipses for Hosts.
  * **Dynamic Layout Engine:** Switch seamlessly between *Force-Directed (Organic)*, *Hierarchical Tree (Top-Down)*, *Radial (Concentric)*, and *Grid*.
  * **Vitality & Health Cues:** Glowing neon borders for active devices; dashed crimson alerts for offline nodes.
  * **Filter Chips:** 1-click filters to isolate Routers, Switches, Servers, Hosts, or Online-only nodes.
  * **High-Res Diagram Export:** Download professional PNG snapshots of your network architecture directly from the browser.

* 🔍 **Universal Real-Time Search Engine:**
  * **Global Header Search (`Ctrl+K` or `/`):** Search any device by hostname, IP address, MAC, or vendor with an instant suggestion popover.
  * **Topology In-Canvas Quick-Search:** Search any node to smoothly pan and zoom the camera directly to it with a neon spotlight halo.
  * **Events Search:** Instant keyword and severity filtering across the entire network audit log.

* 📊 **Deep Device & Interface Inspection:**
  * Click any node to open a telemetry drawer showing interface counts, active ports, MAC addresses, firmware, uptime, and vendor details.
  * Click any link to inspect the exact protocol evidence (LLDP, ARP, MAC table) and confidence percentage.

* ⚡ **Live Real-Time WebSockets:**
  * Discovery sweeps, topology recalculations, and state alerts push instantly to the UI without page reloads.

* 🧪 **Built-In Multi-Node Emulation Lab:**
  * Includes a containerized enterprise lab (`R1`, `SW1`, `SW2`, `SW3`, `Server1`, `Host1`) with simulated SNMP/LLDP daemons and fault-injection scripts (`lab-control.ps1` / `lab-control.sh`).

---

### 🔍 Phase 3: ICMP & SNMP Discovery Engine
- [x] **Task 3.1: Collector Base Contract** (`DiscoveryCollector` abstract base class with timeouts, retries, and normalized `ObservationDomain`)
- [x] **Task 3.2: ICMP Reachability Collector** (Async ping collector recording latency ms without false topology assumptions)
- [x] **Task 3.3: SNMP MIB Collectors** (Extract `sysName`, `sysDescr`, `sysObjectID`, `sysUpTime`, `ifTable`/`ifXTable` interfaces, and IP tables)
- [x] **Task 3.4: Device Identity Resolution Engine** (`IdentityResolutionService` prioritizing Chassis ID > Stable MAC > Hostname > IP with vendor & type classification)
- [x] **Task 3.5: Concurrent Discovery Pipeline** (`DiscoveryService` with `asyncio.Semaphore` bounded concurrency and idempotent device/interface upserts)
- [x] **Task 3.6: Automated Test Verification** (`tests/test_discovery_and_identity.py` passing 100%)
## ⚖️ Pros & Advantages of NETRA

| Advantage | NETRA | Traditional Tools (Nagios, PRTG, Basic Ping Tools) |
|---|---|---|
| **True L2/L3 Physical Topology** | ✅ Yes — Correlates LLDP, CDP, MAC FDB, & ARP | ❌ No — Only lists whether an IP responds to ping |
| **Evidence & Confidence Transparency** | ✅ Yes — Every link displays exact proof & confidence % | ❌ No — Black-box guesses or manual lines |
| **Automated Port-Level Mapping** | ✅ Yes — Shows exact switch port connecting to host | ❌ No — Requires manual switch CLI inspection |
| **Real-Time Graph Differential** | ✅ Yes — Automatically logs link drop, recovery & new nodes | ❌ No — Alert lists without topological context |
| **Lightweight & Standards-Compliant** | ✅ Yes — Non-intrusive standard SNMP/LLDP (Agentless) | ❌ No — Heavy proprietary agents or vendor lock-in |

---

### 🔗 Phase 4: Direct Neighbor Discovery (LLDP & CDP)
- [x] **Task 4.1: LLDP Collector** (`LldpCollector` querying IEEE 802.1AB `lldpRemTable`)
- [x] **Task 4.2: CDP Collector** (`CdpCollector` querying CISCO-CDP-MIB `cdpCacheTable`)
- [x] **Task 4.3: Neighbor Normalization** (`NeighborAdjacency` schema)
## 🚀 Getting Started & Installation

### Prerequisites
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (v24.0+)
* [Python 3.11+](https://www.python.org/)
* [Node.js 18+](https://nodejs.org/) & `npm`

---

### 🧩 Phase 5: Indirect Endpoint Discovery (ARP & Switch MAC Tables)
- [x] **Task 5.1: ARP Collector** (`ArpCollector` querying RFC 1213 / IP-MIB `ipNetToMediaTable`)
- [x] **Task 5.2: Switch MAC FDB Collector** (`MacTableCollector` querying BRIDGE-MIB `dot1dTpFdbTable`)
- [x] **Task 5.3: L2/L3 Correlation Engine** (Switch Port ↔ MAC ↔ IP endpoint placement)
### Option 1: Quickstart with Docker Compose (Recommended)

To launch the entire platform (PostgreSQL, Redis, Backend API, Frontend, and Emulated Network Lab) in one command:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/netra.git
   cd netra
   ```

2. **Configure Environment Variables:**
   ```bash
   cp .env.example .env
   ```

3. **Start Core Infrastructure:**
   ```bash
   docker-compose up -d
   ```

4. **Start the Network Emulation Lab (Optional for simulated testing):**
   ```bash
   docker-compose -f docker-compose.lab.yml up -d
   ```

5. **Access the Applications:**
   * **Frontend Dashboard:** [http://localhost:3000](http://localhost:3000)
   * **Backend REST API & Swagger Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
   * **Default Admin Credentials:** `admin@netra.local` / `admin123`

---

### 🧠 Phase 6: Deterministic Topology & Correlation Engine
- [x] **Task 6.1: Candidate Link Generator** (Bi-directional interface pairing & canonical key ordering)
- [x] **Task 6.2: Weighted Confidence Scoring Engine** (Bi-directional LLDP: 0.98, LLDP: 0.95, CDP: 0.90, MAC+ARP: 0.80, Bayesian formula: $C = 1 - \prod(1 - c_i)$)
- [x] **Task 6.3: Topology Reconciliation & Snapshots** (Idempotent updates and `TopologySnapshot` archives)
### Option 2: Local Development Setup (Manual)

#### 1. Backend Setup
```bash
cd backend
python -m venv .venv

# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt

# Run Database Migrations
alembic upgrade head

# Start FastAPI server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
The frontend dev server runs at `http://localhost:3000`.

---

### ⚡ Phase 7: Change Detection & Event Engine
- [x] **Task 7.1: Differential State Engine** (`ChangeDetectionService` detecting `NEW_DEVICE`, `LINK_ADDED`, `LINK_REMOVED`, `DEVICE_DOWN`, `DEVICE_RECOVERED`)
- [x] **Task 7.2: Event Generation & Audit Trail** (Severity-assigned structured events with before/after diffs)
## 📖 How to Use NETRA

### 1. Logging In
* Navigate to `http://localhost:3000`.
* Log in with:
  * **Email:** `admin@netra.local`
  * **Password:** `admin123`

### 2. Discovering Your Network
1. Go to the **Discovery** tab in the sidebar.
2. Under **New Discovery Target**, enter a target subnet or IP:
   * **Simulation Lab:** `192.168.100.0/24` (SNMP community: `public`)
   * **Physical Network (e.g. your Wi-Fi router / switch):** `192.168.1.1` or your default gateway.
3. Click **Add Target**, then click **Run Discovery**.
4. Watch the live progress bar and collector logs update in real time.

### 3. Visualizing & Exploring Topology
1. Click on the **Topology** tab.
2. **Change Views:** Use the **Layout** selector (top-left) to switch between:
   * `Hierarchical Tree`: Best for viewing Core Routers ➔ Aggregation Switches ➔ Access Endpoints.
   * `Force-Directed`: Best for observing organic meshed networks.
   * `Concentric (Radial)`: Best for hub-and-spoke topologies.
3. **Filter Nodes:** Click the pill buttons (`ROUTERS`, `SWITCHES`, `SERVERS`, `HOSTS`) to declutter the canvas.
4. **Inspect Connections:** Click any device or connection line to view port names, MAC addresses, and confidence evidence.
5. **Export Diagram:** Click **Export PNG** to save a snapshot of your network map.

### 4. Simulating Network Faults & Link Drops (Lab Mode)
You can inject faults into the simulated lab to watch NETRA detect changes live:

* **Simulate Switch 2 Link Down:**
  ```powershell
  # Windows PowerShell:
  .\network-lab\lab-control.ps1 link-down-sw2
  # Linux/macOS:
  ./network-lab/lab-control.sh link-down-sw2
  ```
* Trigger another discovery sweep in the UI:
  * Watch the link disappear on the Topology Canvas.
  * Check the **Events** tab to see a `LINK_REMOVED` critical alert.
* **Recover the Link:**
  ```powershell
  .\network-lab\lab-control.ps1 link-up-sw2
  ```
  * Run discovery: NETRA detects `LINK_ADDED` and restores the edge with full confidence history.

---

### 🔄 Phase 8: Background Workers & WebSockets
- [x] **Task 8.1: Async Discovery Queue** (Bounded concurrency via `asyncio.Semaphore(10)`)
- [x] **Task 8.2: WebSocket Hub** (`ws_hub` broadcasting `DISCOVERY_STARTED`, `DISCOVERY_PROGRESS`, `TOPOLOGY_UPDATED`, `EVENT_EMITTED`)
## 🧪 Running Automated Tests

NETRA includes a comprehensive test suite covering authentication, SNMP/LLDP collection, device identity resolution, link correlation, and change detection.

```bash
# Run backend pytest suite (from root or backend directory):
pytest -v tests

# Run frontend build verification:
cd frontend
npm run build
```

---

### 🖥️ Phase 9: NOC-Style Frontend & Cytoscape Graph
- [x] **Task 9.1: NOC Overview Dashboard** (Summary metrics, health cards, quick device preview, live events)
- [x] **Task 9.2: Cytoscape.js Topology Canvas** (Color-coded device nodes, pan/zoom/fit, auto-layouts)
- [x] **Task 9.3: Detail Drawers** (Device telemetry drawer, link evidence provenance breakdown & confidence score %)
- [x] **Task 9.4: Inventory & Event Tables** (Live searchable tables with type & severity filters)
- [x] **Task 9.5: Discovery Console** (Target range manager and discovery execution history)
## 📂 Project Structure

```text
netra/
├── backend/
│   ├── app/
│   │   ├── api/routes/          # REST endpoints (auth, devices, topology, events)
│   │   ├── application/         # Orchestration services (discovery, topology, changes)
│   │   ├── core/                # Config, JWT security, structured logging
│   │   ├── domain/              # Entities, value objects & models
│   │   └── infrastructure/      # Database session, SNMP/LLDP/ARP/CDP collectors
│   ├── alembic/                 # Database migrations
│   └── requirements.txt         # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/layout/   # AppLayout, sidebar & global search
│   │   ├── features/            # Dashboard, Topology canvas, Devices, Events
│   │   └── services/            # Axios API clients & WebSocket handlers
│   ├── package.json
│   └── vite.config.ts
├── network-lab/                 # Dockerized enterprise simulation lab
│   ├── configs/                 # SNMPd & LLDPd daemon configs per node
│   ├── lab-control.ps1          # Fault injection control script (PowerShell)
│   └── lab-control.sh           # Fault injection control script (Bash)
├── tests/                       # Automated pytest test suites
├── docker-compose.yml           # Core production stack (DB, Redis, Backend, Frontend)
├── docker-compose.lab.yml       # Emulated multi-node network lab
└── README.md                    # Project documentation
```

---

### 🛡️ Phase 10: Hardening, Automated Tests & SIH Demo Suite
- [x] **Task 10.1: Automated Pytest Suite** (13 passing tests across health, auth, discovery, identity, correlation, and change detection)
- [x] **Task 10.2: 4 SIH Demo Scenarios** (Initial Discovery, Link Down, Link Recovery, New Device)
- [x] **Task 10.3: Documentation & Production Packaging**
## 🔒 Security & Best Practices

* **Agentless Non-Intrusive Operation:** Discovers devices using standard, read-only SNMP queries without requiring custom agent installations on target hardware.
* **Bounded Concurrency:** Discovery engine throttles outbound requests using `asyncio.Semaphore` to protect edge routers from traffic spikes.
* **Role-Based Access Control (RBAC):** All administrative APIs and discovery executions are protected with secure bcrypt password hashing and short-lived JWT tokens.

---

## 👥 Contributors & License

Developed for enterprise network intelligence, observability, and NOC operations.  
Licensed under the **MIT License**.
