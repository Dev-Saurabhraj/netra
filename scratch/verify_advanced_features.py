import urllib.request
import json
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_URL = "http://localhost:8000/api/v1"

def login():
    req = urllib.request.Request(
        f"{BASE_URL}/auth/login",
        data=b"username=admin@netra.local&password=AdminPassword123!",
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())["data"]["access_token"]

token = login()
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
print("=" * 70)
print("NETRA ADVANCED NETWORK INTELLIGENCE ENGINE: LIVE E2E VERIFICATION")
print("=" * 70)

# -------------------------------------------------------------
# 1. Verify Discovery Scheduler API
# -------------------------------------------------------------
print("\n[FEATURE 1] Periodic Automated Discovery Scheduler Verification")
sched_req = urllib.request.Request(f"{BASE_URL}/discovery/schedule", headers=headers)
with urllib.request.urlopen(sched_req) as resp:
    curr_sched = json.loads(resp.read().decode())["data"]
print(f"  Initial Scheduler Status: enabled={curr_sched['enabled']}, interval={curr_sched['interval_seconds']}s")

# Configure scheduler
post_sched = urllib.request.Request(
    f"{BASE_URL}/discovery/schedule",
    data=json.dumps({"enabled": True, "interval_seconds": 60}).encode("utf-8"),
    headers=headers
)
with urllib.request.urlopen(post_sched) as resp:
    updated_sched = json.loads(resp.read().decode())["data"]
print(f"  Configured Scheduler: enabled={updated_sched['enabled']}, interval={updated_sched['interval_seconds']}s, next_run={updated_sched['next_run_at']}")
assert updated_sched["enabled"] is True
assert updated_sched["interval_seconds"] == 60
print("  >>> FEATURE 1 PASSED: Scheduler configured and operational.")

# -------------------------------------------------------------
# 2. Verify End-to-End L2/L3 Path Tracer
# -------------------------------------------------------------
print("\n[FEATURE 2] End-to-End L2/L3 Path Tracer Verification")
topo_req = urllib.request.Request(f"{BASE_URL}/topology", headers=headers)
with urllib.request.urlopen(topo_req) as resp:
    topo = json.loads(resp.read().decode())["data"]

nodes = {n["data"]["label"]: n["data"]["id"] for n in topo["nodes"]}
print(f"  Available Network Nodes: {list(nodes.keys())}")

host1_id = next((nid for label, nid in nodes.items() if "Host1" in label), None)
r1_id = next((nid for label, nid in nodes.items() if "R1" in label), None)
assert host1_id and r1_id, "Host1 and R1 must exist in topology"

print(f"  Tracing route: Host1 ({host1_id}) -> R1 Core Router ({r1_id})...")
trace_req = urllib.request.Request(
    f"{BASE_URL}/topology/trace-path",
    data=json.dumps({"source_device_id": host1_id, "destination_device_id": r1_id}).encode("utf-8"),
    headers=headers
)
with urllib.request.urlopen(trace_req) as resp:
    trace_res = json.loads(resp.read().decode())["data"]

print(f"  Path Status: {trace_res['status']} | Total Hops: {trace_res['total_hops']} | Min Confidence: {int(trace_res['bottleneck_confidence'] * 100)}%")
for hop in trace_res["hops"]:
    print(f"    - Hop #{hop['hop_number']}: {hop['from_device']['label']} (port {hop['egress_port']}) --> {hop['to_device']['label']} (port {hop['ingress_port']}) | Confidence: {hop['confidence_percent']}%")

assert trace_res["found"] is True
assert trace_res["total_hops"] >= 1
print("  >>> FEATURE 2 PASSED: Path tracer computed shortest forwarding route.")

# -------------------------------------------------------------
# 3. Verify Topology History & Time-Travel Diff
# -------------------------------------------------------------
print("\n[FEATURE 3] Topology History & Time-Travel Diff Engine Verification")
snap_req = urllib.request.Request(f"{BASE_URL}/topology/snapshots?limit=5", headers=headers)
with urllib.request.urlopen(snap_req) as resp:
    snapshots = json.loads(resp.read().decode())["data"]
print(f"  Total Historical Snapshots Available: {len(snapshots)}")
assert len(snapshots) >= 1

latest_snap_id = snapshots[0]["id"]
detail_req = urllib.request.Request(f"{BASE_URL}/topology/snapshots/{latest_snap_id}", headers=headers)
with urllib.request.urlopen(detail_req) as resp:
    snap_detail = json.loads(resp.read().decode())["data"]
print(f"  Snapshot Details: ID={snap_detail['id']}, Nodes={len(snap_detail['graph']['nodes'])}, Edges={len(snap_detail['graph']['edges'])}")

# Diff test
diff_req = urllib.request.Request(f"{BASE_URL}/topology/snapshots/{latest_snap_id}/diff", headers=headers)
with urllib.request.urlopen(diff_req) as resp:
    diff_res = json.loads(resp.read().decode())["data"]
summary = diff_res["summary"]
print(f"  Snapshot Differential Analysis:")
print(f"    - Added Nodes: {summary['added_nodes_count']}")
print(f"    - Removed Nodes: {summary['removed_nodes_count']}")
print(f"    - Modified Nodes: {summary['modified_nodes_count']}")
print(f"    - Added Edges: {summary['added_edges_count']}")
print(f"    - Removed Edges: {summary['removed_edges_count']}")
assert "diff_graph" in diff_res
print("  >>> FEATURE 3 PASSED: Snapshot details and differential engine verified.")

print("\n" + "=" * 70)
print("ALL 3 ADVANCED NETWORK INTELLIGENCE CAPABILITIES VERIFIED SUCCESSFULLY!")
print("=" * 70)

