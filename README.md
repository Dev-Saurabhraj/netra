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
| **Phase 2** | **Network Simulation Lab** | Containerized Network Lab (R1, SW1, SW2, SW3, Hosts) + SNMP/LLDP | ✅ **Completed** |
| **Phase 3** | **Discovery (ICMP & SNMP)** | Ping reachability, SNMP MIB extractor, Device Identity Resolution | ✅ **Completed** |
| **Phase 4** | **Direct Neighbors (LLDP & CDP)** | Layer-2 Port-to-Port Neighbor Adjacency Discovery | ✅ **Completed** |
| **Phase 5** | **Endpoint Placement (ARP & MAC Tables)** | Switch FDB + ARP L2/L3 Correlation Engine | ✅ **Completed** |
| **Phase 6** | **Deterministic Topology & Correlation** | Multi-source Evidence Synthesis & Weighted Confidence (0–100%) | ✅ **Completed** |
| **Phase 7** | **Change Detection & Event Engine** | Graph Differential Engine (Link Down/Up, New Device, Recovery) | ✅ **Completed** |
| **Phase 8** | **Background Workers & WebSockets** | Bounded Concurrency Worker Queue + Real-Time Event Stream | ✅ **Completed** |
| **Phase 9** | **NOC Operations UI & Cytoscape Canvas** | Interactive Topology Graph + Detail Drawers + NOC Dark Theme | ✅ **Completed** |
| **Phase 10** | **Hardening, Tests & SIH Demo Suite** | 4 Deterministic Demo Scenarios + Pytest/Vitest Suites | ✅ **Completed** |

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

### 🌐 Phase 2: Network Simulation Lab
- [x] **Task 2.1: Lab Topology Definition** (`R1`, `SW1`, `SW2`, `SW3`, `Server1`, `Host1` in `docker-compose.lab.yml`)
- [x] **Task 2.2: Telemetry Emulation** (`snmpd-r1.conf` to `snmpd-host1.conf` with standard MIBs, `lldpd` daemon)
- [x] **Task 2.3: Fault Injection Scripts** (`lab-control.ps1` & `lab-control.sh` with `start`, `stop`, `link-down-sw2`, `link-up-sw2`, `add-sw4`, `remove-sw4`)

---

### 🔍 Phase 3: ICMP & SNMP Discovery Engine
- [x] **Task 3.1: Collector Base Contract** (`DiscoveryCollector` abstract base class with timeouts, retries, and normalized `ObservationDomain`)
- [x] **Task 3.2: ICMP Reachability Collector** (Async ping collector recording latency ms without false topology assumptions)
- [x] **Task 3.3: SNMP MIB Collectors** (Extract `sysName`, `sysDescr`, `sysObjectID`, `sysUpTime`, `ifTable`/`ifXTable` interfaces, and IP tables)
- [x] **Task 3.4: Device Identity Resolution Engine** (`IdentityResolutionService` prioritizing Chassis ID > Stable MAC > Hostname > IP with vendor & type classification)
- [x] **Task 3.5: Concurrent Discovery Pipeline** (`DiscoveryService` with `asyncio.Semaphore` bounded concurrency and idempotent device/interface upserts)
- [x] **Task 3.6: Automated Test Verification** (`tests/test_discovery_and_identity.py` passing 100%)

---

### 🔗 Phase 4: Direct Neighbor Discovery (LLDP & CDP)
- [x] **Task 4.1: LLDP Collector** (`LldpCollector` querying IEEE 802.1AB `lldpRemTable`)
- [x] **Task 4.2: CDP Collector** (`CdpCollector` querying CISCO-CDP-MIB `cdpCacheTable`)
- [x] **Task 4.3: Neighbor Normalization** (`NeighborAdjacency` schema)

---

### 🧩 Phase 5: Indirect Endpoint Discovery (ARP & Switch MAC Tables)
- [x] **Task 5.1: ARP Collector** (`ArpCollector` querying RFC 1213 / IP-MIB `ipNetToMediaTable`)
- [x] **Task 5.2: Switch MAC FDB Collector** (`MacTableCollector` querying BRIDGE-MIB `dot1dTpFdbTable`)
- [x] **Task 5.3: L2/L3 Correlation Engine** (Switch Port ↔ MAC ↔ IP endpoint placement)

---

### 🧠 Phase 6: Deterministic Topology & Correlation Engine
- [x] **Task 6.1: Candidate Link Generator** (Bi-directional interface pairing & canonical key ordering)
- [x] **Task 6.2: Weighted Confidence Scoring Engine** (Bi-directional LLDP: 0.98, LLDP: 0.95, CDP: 0.90, MAC+ARP: 0.80, Bayesian formula: $C = 1 - \prod(1 - c_i)$)
- [x] **Task 6.3: Topology Reconciliation & Snapshots** (Idempotent updates and `TopologySnapshot` archives)

---

### ⚡ Phase 7: Change Detection & Event Engine
- [x] **Task 7.1: Differential State Engine** (`ChangeDetectionService` detecting `NEW_DEVICE`, `LINK_ADDED`, `LINK_REMOVED`, `DEVICE_DOWN`, `DEVICE_RECOVERED`)
- [x] **Task 7.2: Event Generation & Audit Trail** (Severity-assigned structured events with before/after diffs)

---

### 🔄 Phase 8: Background Workers & WebSockets
- [x] **Task 8.1: Async Discovery Queue** (Bounded concurrency via `asyncio.Semaphore(10)`)
- [x] **Task 8.2: WebSocket Hub** (`ws_hub` broadcasting `DISCOVERY_STARTED`, `DISCOVERY_PROGRESS`, `TOPOLOGY_UPDATED`, `EVENT_EMITTED`)

---

### 🖥️ Phase 9: NOC-Style Frontend & Cytoscape Graph
- [x] **Task 9.1: NOC Overview Dashboard** (Summary metrics, health cards, quick device preview, live events)
- [x] **Task 9.2: Cytoscape.js Topology Canvas** (Color-coded device nodes, pan/zoom/fit, auto-layouts)
- [x] **Task 9.3: Detail Drawers** (Device telemetry drawer, link evidence provenance breakdown & confidence score %)
- [x] **Task 9.4: Inventory & Event Tables** (Live searchable tables with type & severity filters)
- [x] **Task 9.5: Discovery Console** (Target range manager and discovery execution history)

---

### 🛡️ Phase 10: Hardening, Automated Tests & SIH Demo Suite
- [x] **Task 10.1: Automated Pytest Suite** (13 passing tests across health, auth, discovery, identity, correlation, and change detection)
- [x] **Task 10.2: 4 SIH Demo Scenarios** (Initial Discovery, Link Down, Link Recovery, New Device)
- [x] **Task 10.3: Documentation & Production Packaging**
