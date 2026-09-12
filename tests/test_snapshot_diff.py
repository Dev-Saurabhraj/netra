import pytest
from httpx import AsyncClient
from datetime import datetime, timezone, timedelta
from app.infrastructure.database.models import TopologySnapshot, User, UserRole
from app.core.security import create_access_token


@pytest.mark.asyncio
async def test_snapshot_details_and_diff(client: AsyncClient, db_session):
    """Verify snapshot retrieval and graph diff computation."""
    now = datetime.now(timezone.utc)
    
    # Snapshot 1: DevA and DevB with Link AB
    snap1 = TopologySnapshot(
        graph_data={
            "nodes": [
                {"data": {"id": "dev-a", "label": "DevA", "ip": "10.0.0.1", "status": "ONLINE"}},
                {"data": {"id": "dev-b", "label": "DevB", "ip": "10.0.0.2", "status": "ONLINE"}},
            ],
            "edges": [
                {"data": {"id": "edge-ab", "source": "dev-a", "target": "dev-b", "confidence": 0.9}},
            ]
        },
        node_count=2,
        edge_count=1,
        created_at=now - timedelta(minutes=10),
    )

    # Snapshot 2: DevA is now OFFLINE, DevB still ONLINE, DevC added with Link BC
    snap2 = TopologySnapshot(
        graph_data={
            "nodes": [
                {"data": {"id": "dev-a", "label": "DevA", "ip": "10.0.0.1", "status": "OFFLINE"}},
                {"data": {"id": "dev-b", "label": "DevB", "ip": "10.0.0.2", "status": "ONLINE"}},
                {"data": {"id": "dev-c", "label": "DevC", "ip": "10.0.0.3", "status": "ONLINE"}},
            ],
            "edges": [
                {"data": {"id": "edge-ab", "source": "dev-a", "target": "dev-b", "confidence": 0.9}},
                {"data": {"id": "edge-bc", "source": "dev-b", "target": "dev-c", "confidence": 0.85}},
            ]
        },
        node_count=3,
        edge_count=2,
        created_at=now,
    )

    user = User(email="test@netra.test", hashed_password="pw", full_name="Tester", role=UserRole.VIEWER, is_active=True)
    db_session.add_all([snap1, snap2, user])
    await db_session.commit()

    token = create_access_token(subject=user.id)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Fetch snapshot 1 details
    res1 = await client.get(f"/api/v1/topology/snapshots/{snap1.id}", headers=headers)
    assert res1.status_code == 200
    assert len(res1.json()["data"]["graph"]["nodes"]) == 2

    # 2. Fetch diff between snap2 and snap1
    diff_res = await client.get(f"/api/v1/topology/snapshots/{snap2.id}/diff?compare_to={snap1.id}", headers=headers)
    assert diff_res.status_code == 200
    diff_data = diff_res.json()["data"]

    # DevC was added
    assert diff_data["summary"]["added_nodes_count"] == 1
    assert diff_data["added_nodes"][0]["id"] == "dev-c"

    # DevA was modified (ONLINE -> OFFLINE)
    assert diff_data["summary"]["modified_nodes_count"] == 1
    assert diff_data["modified_nodes"][0]["id"] == "dev-a"
    assert diff_data["modified_nodes"][0]["old_status"] == "ONLINE"
    assert diff_data["modified_nodes"][0]["new_status"] == "OFFLINE"

    # Edge BC was added
    assert diff_data["summary"]["added_edges_count"] == 1
    assert diff_data["added_edges"][0]["id"] == "edge-bc"

    # Diff graph elements
    diff_graph = diff_data["diff_graph"]
    node_statuses = {n["data"]["id"]: n["data"]["diff_status"] for n in diff_graph["nodes"]}
    assert node_statuses["dev-c"] == "added"
    assert node_statuses["dev-a"] == "modified"
    assert node_statuses["dev-b"] == "unchanged"
