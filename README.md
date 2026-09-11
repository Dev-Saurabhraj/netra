# NETRA — Intelligent Network Discovery & Topology Intelligence Platform

> **Network Exploration, Topology & Relationship Analytics**  
> *"See Your Network. Understand Every Connection."*

---

## 📋 Architectural Principles

NETRA is an evidence-driven, confidence-scored network discovery and topology intelligence platform.

```text
Reachability (ICMP) ≠ Connectivity (ARP / MAC) ≠ Topology (LLDP / CDP / SNMP)
```

```text
Presentation (React + Cytoscape.js)
      ↓
Application (Use Cases & Services)
      ↓
Domain (Graph, Evidence, Confidence, Changes)
      ↓
Infrastructure (FastAPI, PostgreSQL, Redis, Network Collectors)
```

---

## 🧭 Master Delivery Matrix

| Phase | Milestone | Deliverable | Status |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Foundation & Base Architecture** | FastAPI + PostgreSQL + Alembic + Auth + Base Models + React UI | ✅ **Completed** |
| **Phase 2** | **Network Simulation Lab** | Containerized Network Lab (R1, SW1, SW2, SW3, Hosts) + SNMP/LLDP | 🔄 *Next Up* |
| **Phase 3** | **Discovery (ICMP & SNMP)** | Ping reachability, SNMP MIB extractor, Device Identity Resolution | ⏳ *Pending* |
| **Phase 4** | **Direct Neighbors (LLDP & CDP)** | Layer-2 Port-to-Port Neighbor Adjacency Discovery | ⏳ *Pending* |
| **Phase 5** | **Endpoint Placement (ARP & MAC Tables)** | Switch FDB + ARP L2/L3 Correlation Engine | ⏳ *Pending* |
| **Phase 6** | **Deterministic Topology & Correlation** | Multi-source Evidence Synthesis & Weighted Confidence (0–100%) | ⏳ *Pending* |
| **Phase 7** | **Change Detection & Event Engine** | Graph Differential Engine (Link Down/Up, New Device, Recovery) | ⏳ *Pending* |
| **Phase 8** | **Background Workers & WebSockets** | Bounded Concurrency Worker Queue + Real-Time Event Stream | ⏳ *Pending* |
| **Phase 9** | **NOC Operations UI & Cytoscape Canvas** | Interactive Topology Graph + Detail Drawers + NOC Dark Theme | ⏳ *Pending* |
| **Phase 10** | **Hardening, Tests & SIH Demo Suite** | 4 Deterministic Demo Scenarios + Pytest/Vitest Suites | ⏳ *Pending* |

---

## 🛠️ Step-by-Step Task Breakdown

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

---

### 🌐 Phase 2: Network Simulation Lab (Next Task)
- [ ] **Task 2.1: Lab Topology Definition** (`R1`, `SW1`, `SW2`, `SW3`, `Server1`, `Host1` in Docker Compose)
- [ ] **Task 2.2: Telemetry Emulation** (`snmpd.conf` with standard MIBs, `lldpd.conf` with neighbor links)
- [ ] **Task 2.3: Fault Injection Scripts** (`lab-link-down.sh`, `lab-link-up.sh`, `lab-add-device.sh`, `lab-remove-device.sh`)

---

### 🔍 Phase 3: ICMP & SNMP Discovery Engine
- [ ] **Task 3.1: Collector Base Contract** (`DiscoveryCollector` abstract base class)
- [ ] **Task 3.2: ICMP Reachability Collector** (Async ping collector)
- [ ] **Task 3.3: SNMP MIB Collectors** (System ID, Interface Table, IP Address Table)
- [ ] **Task 3.4: Device Identity Resolution Engine** (`Chassis ID` > `Stable MAC` > `Hostname` > `Management IP`)

---

### 🔗 Phase 4: Direct Neighbor Discovery (LLDP & CDP)
- [ ] **Task 4.1: LLDP Collector** (`lldpRemTable` parser)
- [ ] **Task 4.2: CDP Collector** (`cdpCacheTable` parser)
- [ ] **Task 4.3: Neighbor Normalization** (`NeighborObservation` schema)

---

### 🧩 Phase 5: Indirect Endpoint Discovery (ARP & Switch MAC Tables)
- [ ] **Task 5.1: ARP Collector** (`ipNetToMediaTable` parser)
- [ ] **Task 5.2: Switch MAC FDB Collector** (`dot1dTpFdbTable` parser)
- [ ] **Task 5.3: L2/L3 Correlation Engine** (IP → MAC → Switch Port mapping)

---

### 🧠 Phase 6: Deterministic Topology & Correlation Engine
- [ ] **Task 6.1: Candidate Link Generator** (Interface-to-interface pairing)
- [ ] **Task 6.2: Weighted Confidence Scoring Engine** (LLDP 0.95, SNMP 0.85, MAC Table 0.75, ARP 0.60, ICMP 0.40)
- [ ] **Task 6.3: Topology Reconciliation & Snapshots** (Idempotent updates, zero duplicate entities)

---

### ⚡ Phase 7: Change Detection & Event Engine
- [ ] **Task 7.1: Differential State Engine** (Detect `NEW_DEVICE`, `LINK_REMOVED`, `DEVICE_DOWN`, `RECOVERED`, etc.)
- [ ] **Task 7.2: Event Generation & Audit Trail** (Severity-assigned structured events with before/after diffs)

---

### 🔄 Phase 8: Background Workers & WebSockets
- [ ] **Task 8.1: Async Discovery Queue** (Bounded concurrency via `asyncio.Semaphore(10)`)
- [ ] **Task 8.2: WebSocket Hub** (`DISCOVERY_STARTED`, `DISCOVERY_PROGRESS`, `DEVICE_DISCOVERED`, etc.)

---

### 🖥️ Phase 9: NOC-Style Frontend & Cytoscape Graph
- [ ] **Task 9.1: NOC Overview Dashboard** (Summary metrics, health cards, mini-topology preview, live events)
- [ ] **Task 9.2: Cytoscape.js Topology Canvas** (Device icons, pan/zoom/fit, auto-layouts, path highlighter)
- [ ] **Task 9.3: Detail Drawers** (Node interface list, Link evidence provenance checklist & confidence score %)
- [ ] **Task 9.4: Inventory & Event Tables** (Server-side paginated tables with filters)
- [ ] **Task 9.5: Discovery Console** (Target IP/subnet manager and live discovery progress bar)

---

### 🛡️ Phase 10: Hardening, Automated Tests & SIH Demo Suite
- [ ] **Task 10.1: Automated Pytest Suite** (Identity resolution, correlation, confidence scoring, idempotency)
- [ ] **Task 10.2: 4 SIH Demo Scenarios** (Initial Discovery, Link Down, Link Recovery, New Device)
- [ ] **Task 10.3: Documentation & Production Packaging**
