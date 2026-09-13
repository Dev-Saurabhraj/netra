# 🌐 NETRA — Intelligent Network Discovery & Topology Intelligence Platform

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

## 📌 Problem Statement

In modern heterogeneous enterprise and campus networks, IT and Network Operations (NOC) teams face critical blind spots:

1. **Stale & Manual Network Documentation:**  
   Most organizations rely on outdated Visio diagrams, spreadsheets, or manual audits. When a cable is moved, a switch reconfigured, or a new server plugged in, diagrams immediately drift from reality.

2. **The "Ping ≠ Topology" Trap:**  
   Traditional tools confuse simple IP reachability (ICMP ping) with physical connectivity. Knowing an IP responds to a ping **does not tell you which switch port it is plugged into**, what neighbors it connects to, or what path traffic takes.

3. **Vendor Heterogeneity & Protocol Silos:**  
   Enterprises operate devices from Cisco, Juniper, Aruba, Linux servers, and generic whiteboxes. Discovering true Layer-2 and Layer-3 topology requires correlating distinct protocols (**LLDP**, **CDP**, **SNMP MIBs**, **Bridge MAC Tables**, and **ARP**) across multi-vendor hardware.

4. **High Mean Time to Detect (MTTD) & Root Cause Analysis (MTTR):**  
   When a link goes down or a device reboots, engineers spend precious hours tracing cables and hopping across CLIs rather than having an instant, real-time visual graph showing exact link failures and blast radius.

---

## 💡 The NETRA Solution

**NETRA** is an evidence-driven, deterministic network discovery and topology intelligence platform.

Instead of guessing connections, NETRA operates on a rigorous architectural axiom:
$$\text{Reachability (ICMP)} \neq \text{Connectivity (ARP / MAC)} \neq \text{Topology (LLDP / CDP / SNMP)}$$

NETRA gathers multi-source evidence across Layer-2 and Layer-3 protocols, calculates an exact mathematical **Confidence Score (0–100%)** for every connection using Bayesian evidence synthesis, continuously tracks graph differentials (link additions, drops, device recoveries), and renders an interactive, real-time NOC topology canvas.

---

## 🏗️ Architecture & How It Works

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

## ⚖️ Pros & Advantages of NETRA

| Advantage | NETRA | Traditional Tools (Nagios, PRTG, Basic Ping Tools) |
|---|---|---|
| **True L2/L3 Physical Topology** | ✅ Yes — Correlates LLDP, CDP, MAC FDB, & ARP | ❌ No — Only lists whether an IP responds to ping |
| **Evidence & Confidence Transparency** | ✅ Yes — Every link displays exact proof & confidence % | ❌ No — Black-box guesses or manual lines |
| **Automated Port-Level Mapping** | ✅ Yes — Shows exact switch port connecting to host | ❌ No — Requires manual switch CLI inspection |
| **Real-Time Graph Differential** | ✅ Yes — Automatically logs link drop, recovery & new nodes | ❌ No — Alert lists without topological context |
| **Lightweight & Standards-Compliant** | ✅ Yes — Non-intrusive standard SNMP/LLDP (Agentless) | ❌ No — Heavy proprietary agents or vendor lock-in |

---

## 🚀 Getting Started & Installation

### Prerequisites
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (v24.0+)
* [Python 3.11+](https://www.python.org/)
* [Node.js 18+](https://nodejs.org/) & `npm`

---

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

## 🔒 Security & Best Practices

* **Agentless Non-Intrusive Operation:** Discovers devices using standard, read-only SNMP queries without requiring custom agent installations on target hardware.
* **Bounded Concurrency:** Discovery engine throttles outbound requests using `asyncio.Semaphore` to protect edge routers from traffic spikes.
* **Role-Based Access Control (RBAC):** All administrative APIs and discovery executions are protected with secure bcrypt password hashing and short-lived JWT tokens.

---

## 👥 Contributors & License

Developed for enterprise network intelligence, observability, and NOC operations.  
Licensed under the **MIT License**.
