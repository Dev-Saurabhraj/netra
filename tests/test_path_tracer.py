import pytest
from httpx import AsyncClient
from datetime import datetime, timezone
from app.domain.entities.device import DeviceType, DeviceStatus
from app.domain.entities.link import LinkStatus
from app.infrastructure.database.models import Device, Interface, Link, User, UserRole
from app.application.services.path_tracing_service import PathTracingService
from app.core.security import create_access_token


@pytest.mark.asyncio
async def test_path_tracing_multihop(db_session):
    """Verify BFS shortest path traversal across a 3-hop network topology."""
    now = datetime.now(timezone.utc)
    
    # 1. Create devices: R1 -> SW1 -> SW2 -> Host1
    r1 = Device(hostname="R1", management_ip="192.168.100.1", device_type=DeviceType.ROUTER, status=DeviceStatus.ONLINE, first_seen=now, last_seen=now)
    sw1 = Device(hostname="SW1", management_ip="192.168.100.2", device_type=DeviceType.SWITCH, status=DeviceStatus.ONLINE, first_seen=now, last_seen=now)
    sw2 = Device(hostname="SW2", management_ip="192.168.100.3", device_type=DeviceType.SWITCH, status=DeviceStatus.ONLINE, first_seen=now, last_seen=now)
    host1 = Device(hostname="Host1", management_ip="192.168.100.20", device_type=DeviceType.HOST, status=DeviceStatus.ONLINE, first_seen=now, last_seen=now)
    isolated = Device(hostname="Isolated", management_ip="192.168.100.99", device_type=DeviceType.HOST, status=DeviceStatus.ONLINE, first_seen=now, last_seen=now)

    db_session.add_all([r1, sw1, sw2, host1, isolated])
    await db_session.flush()

    # Interfaces
    i_r1 = Interface(device_id=r1.id, name="eth0", if_index=1, first_seen=now, last_seen=now)
    i_sw1_0 = Interface(device_id=sw1.id, name="eth0", if_index=1, first_seen=now, last_seen=now)
    i_sw1_1 = Interface(device_id=sw1.id, name="eth1", if_index=2, first_seen=now, last_seen=now)
    i_sw2_0 = Interface(device_id=sw2.id, name="eth0", if_index=1, first_seen=now, last_seen=now)
    i_sw2_1 = Interface(device_id=sw2.id, name="eth1", if_index=2, first_seen=now, last_seen=now)
    i_host1 = Interface(device_id=host1.id, name="eth0", if_index=1, first_seen=now, last_seen=now)

    db_session.add_all([i_r1, i_sw1_0, i_sw1_1, i_sw2_0, i_sw2_1, i_host1])
    await db_session.flush()

    # Links: R1 <-> SW1, SW1 <-> SW2, SW2 <-> Host1
    l1 = Link(source_device_id=r1.id, source_interface_id=i_r1.id, destination_device_id=sw1.id, destination_interface_id=i_sw1_0.id, confidence=0.9, status=LinkStatus.ACTIVE, discovery_methods=["LLDP"], first_seen=now, last_seen=now)
    l2 = Link(source_device_id=sw1.id, source_interface_id=i_sw1_1.id, destination_device_id=sw2.id, destination_interface_id=i_sw2_0.id, confidence=0.85, status=LinkStatus.ACTIVE, discovery_methods=["LLDP"], first_seen=now, last_seen=now)
    l3 = Link(source_device_id=sw2.id, source_interface_id=i_sw2_1.id, destination_device_id=host1.id, destination_interface_id=i_host1.id, confidence=0.8, status=LinkStatus.ACTIVE, discovery_methods=["MAC_TABLE"], first_seen=now, last_seen=now)

    db_session.add_all([l1, l2, l3])
    await db_session.commit()

    # Test Path: Host1 to R1
    service = PathTracingService(db_session)
    res = await service.trace_path(host1.id, r1.id)

    assert res["found"] is True
    assert res["total_hops"] == 3
    assert len(res["hops"]) == 3
    assert res["hops"][0]["from_device"]["label"] == "Host1"
    assert res["hops"][0]["to_device"]["label"] == "SW2"
    assert res["hops"][1]["from_device"]["label"] == "SW2"
    assert res["hops"][1]["to_device"]["label"] == "SW1"
    assert res["hops"][2]["from_device"]["label"] == "SW1"
    assert res["hops"][2]["to_device"]["label"] == "R1"
    assert res["bottleneck_confidence"] == 0.8

    # Test Unreachable path
    unreach_res = await service.trace_path(host1.id, isolated.id)
    assert unreach_res["found"] is False
    assert unreach_res["status"] == "UNREACHABLE"

    # Test Same node
    same_res = await service.trace_path(host1.id, host1.id)
    assert same_res["found"] is True
    assert same_res["total_hops"] == 0


@pytest.mark.asyncio
async def test_trace_path_api_endpoint(client: AsyncClient, db_session):
    """Verify /topology/trace-path API route."""
    now = datetime.now(timezone.utc)
    d1 = Device(hostname="DevA", management_ip="10.0.0.1", device_type=DeviceType.ROUTER, status=DeviceStatus.ONLINE, first_seen=now, last_seen=now)
    d2 = Device(hostname="DevB", management_ip="10.0.0.2", device_type=DeviceType.SWITCH, status=DeviceStatus.ONLINE, first_seen=now, last_seen=now)
    db_session.add_all([d1, d2])
    await db_session.flush()

    link = Link(source_device_id=d1.id, destination_device_id=d2.id, confidence=0.9, status=LinkStatus.ACTIVE, discovery_methods=["LLDP"], first_seen=now, last_seen=now)
    user = User(email="user@netra.test", hashed_password="pw", full_name="User", role=UserRole.OPERATOR, is_active=True)
    db_session.add_all([link, user])
    await db_session.commit()

    token = create_access_token(subject=user.id)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/v1/topology/trace-path",
        headers=headers,
        json={"source_device_id": d1.id, "destination_device_id": d2.id}
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["found"] is True
    assert data["total_hops"] == 1
