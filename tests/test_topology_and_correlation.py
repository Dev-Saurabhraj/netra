import pytest
from datetime import datetime, timezone
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.domain.entities.device import DeviceType, DeviceStatus
from app.domain.entities.link import LinkStatus
from app.domain.entities.event import EventType, EventSeverity
from app.domain.schemas.neighbor import NeighborAdjacency
from app.domain.schemas.telemetry import ArpEntry, MacTableEntry
from app.infrastructure.database.models import (
    Device,
    Interface,
    Link,
    Observation,
    TopologySnapshot,
    Event,
    User,
    UserRole,
)
from app.application.services.topology_service import TopologyCorrelationService
from app.application.services.change_detection_service import ChangeDetectionService
from app.core.security import create_access_token


@pytest.mark.asyncio
async def test_direct_neighbor_and_arp_schemas():
    """Verify domain schema validation for neighbor adjacencies and telemetry."""
    neighbor = NeighborAdjacency(
        local_interface_name="eth0",
        local_if_index=1,
        remote_device_name="netra-lab-sw1",
        remote_chassis_id="00:11:22:33:44:55",
        remote_port_id="eth1",
        protocol="LLDP",
        confidence_weight=0.95,
    )
    assert neighbor.protocol == "LLDP"
    assert neighbor.confidence_weight == 0.95
    assert neighbor.remote_device_name == "netra-lab-sw1"

    arp = ArpEntry(
        ip_address="192.168.100.10",
        mac_address="52:54:00:12:34:56",
        if_index=2,
        interface_name="eth1",
    )
    assert arp.ip_address == "192.168.100.10"
    assert arp.mac_address == "52:54:00:12:34:56"

    fdb = MacTableEntry(
        mac_address="52:54:00:12:34:56",
        port_index=2,
        port_name="eth1",
        status="learned",
    )
    assert fdb.status == "learned"
    assert fdb.port_index == 2


@pytest.mark.asyncio
async def test_bidirectional_lldp_topology_correlation(db_session: AsyncSession):
    """
    Test TopologyCorrelationService correctly correlates mutual LLDP between R1 and SW1
    and assigns high confidence score (>= 0.98).
    """
    # 1. Create Devices & Interfaces
    r1 = Device(
        hostname="netra-lab-r1",
        management_ip="192.168.100.1",
        mac_address="00:11:22:00:00:01",
        vendor="Cisco",
        device_type=DeviceType.ROUTER,
        status=DeviceStatus.ONLINE,
    )
    sw1 = Device(
        hostname="netra-lab-sw1",
        management_ip="192.168.100.2",
        mac_address="00:11:22:00:00:02",
        vendor="Cisco",
        device_type=DeviceType.SWITCH,
        status=DeviceStatus.ONLINE,
    )
    db_session.add_all([r1, sw1])
    await db_session.flush()

    r1_eth0 = Interface(device_id=r1.id, name="eth0", if_index=1, mac_address="00:11:22:00:00:01")
    sw1_eth0 = Interface(device_id=sw1.id, name="eth0", if_index=1, mac_address="00:11:22:00:00:02")
    db_session.add_all([r1_eth0, sw1_eth0])
    await db_session.flush()

    # 2. Add LLDP Observations (Both R1 and SW1 see each other)
    obs_r1 = Observation(
        source_type="LLDP",
        target="192.168.100.1",
        raw_payload={},
        normalized_data={
            "ip_address": "192.168.100.1",
            "lldp_enabled": True,
            "neighbors": [{
                "local_interface_name": "eth0",
                "local_if_index": 1,
                "remote_device_name": "netra-lab-sw1",
                "remote_chassis_id": "00:11:22:00:00:02",
                "remote_port_id": "eth0",
                "protocol": "LLDP",
                "confidence_weight": 0.95,
            }]
        }
    )
    obs_sw1 = Observation(
        source_type="LLDP",
        target="192.168.100.2",
        raw_payload={},
        normalized_data={
            "ip_address": "192.168.100.2",
            "lldp_enabled": True,
            "neighbors": [{
                "local_interface_name": "eth0",
                "local_if_index": 1,
                "remote_device_name": "netra-lab-r1",
                "remote_chassis_id": "00:11:22:00:00:01",
                "remote_port_id": "eth0",
                "protocol": "LLDP",
                "confidence_weight": 0.95,
            }]
        }
    )
    db_session.add_all([obs_r1, obs_sw1])
    await db_session.commit()

    # 3. Correlate Topology
    topo_service = TopologyCorrelationService(db_session)
    links, snapshot = await topo_service.correlate_topology()

    assert len(links) == 1
    link = links[0]
    assert link.status == LinkStatus.ACTIVE
    assert link.confidence >= 0.98  # Mutual bidirectional LLDP boost
    assert "LLDP" in link.discovery_methods
    assert snapshot.node_count == 2
    assert snapshot.edge_count == 1


@pytest.mark.asyncio
async def test_switch_mac_table_endpoint_correlation(db_session: AsyncSession):
    """
    Test Switch MAC FDB table + ARP correlates endpoint (Server1) attached to Switch (SW2).
    """
    sw2 = Device(
        hostname="netra-lab-sw2",
        management_ip="192.168.100.3",
        mac_address="00:11:22:00:00:03",
        vendor="Cisco",
        device_type=DeviceType.SWITCH,
        status=DeviceStatus.ONLINE,
    )
    server1 = Device(
        hostname="netra-lab-server1",
        management_ip="192.168.100.10",
        mac_address="52:54:00:aa:bb:cc",
        vendor="Linux",
        device_type=DeviceType.SERVER,
        status=DeviceStatus.ONLINE,
    )
    db_session.add_all([sw2, server1])
    await db_session.flush()

    sw2_port2 = Interface(device_id=sw2.id, name="eth1", if_index=2)
    server1_eth0 = Interface(device_id=server1.id, name="eth0", if_index=1, mac_address="52:54:00:aa:bb:cc")
    db_session.add_all([sw2_port2, server1_eth0])
    await db_session.flush()

    # Switch 2 observed server1 MAC on port 2
    obs_mac = Observation(
        source_type="MAC_TABLE",
        target="192.168.100.3",
        raw_payload={},
        normalized_data={
            "target_ip": "192.168.100.3",
            "mac_entries": [{
                "mac_address": "52:54:00:aa:bb:cc",
                "port_index": 2,
                "port_name": "eth1",
                "status": "learned"
            }]
        }
    )
    db_session.add(obs_mac)
    await db_session.commit()

    topo_service = TopologyCorrelationService(db_session)
    links, snapshot = await topo_service.correlate_topology()

    assert len(links) == 1
    link = links[0]
    assert link.status == LinkStatus.ACTIVE
    assert link.confidence == 0.80  # MAC table confidence
    assert "MAC_TABLE_AND_ARP" in link.discovery_methods


@pytest.mark.asyncio
async def test_fdb_plus_arp_two_hop_endpoint_correlation(db_session: AsyncSession):
    """
    Test Switch MAC FDB table + Router ARP table correlates a non-SNMP endpoint (Laptop)
    that has NO local interface MAC pre-configured on the device record.
    """
    # 1. Core Switch
    sw_core = Device(
        hostname="KIET_CORE_SWITCH",
        management_ip="10.21.216.1",
        mac_address="c0:bf:a7:73:09:41",
        vendor="Juniper",
        device_type=DeviceType.SWITCH,
        status=DeviceStatus.ONLINE,
    )
    # 2. Non-SNMP Laptop (e.g. user laptop on Wi-Fi/access port)
    laptop = Device(
        hostname="node-10-21-220-1",
        management_ip="10.21.220.1",
        mac_address=None,  # Not known via SNMP
        vendor="Generic",
        device_type=DeviceType.UNKNOWN,
        status=DeviceStatus.ONLINE,
    )
    db_session.add_all([sw_core, laptop])
    await db_session.flush()

    sw_port36 = Interface(device_id=sw_core.id, name="eth36", if_index=36)
    db_session.add(sw_port36)
    await db_session.flush()

    # Router / Core Switch has ARP entry mapping IP 10.21.220.1 -> MAC 96:46:d1:a0:ec:34
    obs_arp = Observation(
        source_type="ARP",
        target="10.21.216.1",
        raw_payload={},
        normalized_data={
            "arp_entries": [{
                "if_index": 1,
                "ip_address": "10.21.220.1",
                "mac_address": "96:46:d1:a0:ec:34",
                "entry_type": "dynamic"
            }]
        }
    )

    # Core Switch has FDB entry showing MAC 96:46:d1:a0:ec:34 learned on port index 36 (eth36)
    obs_mac = Observation(
        source_type="MAC_TABLE",
        target="10.21.216.1",
        raw_payload={},
        normalized_data={
            "mac_entries": [{
                "mac_address": "96:46:d1:a0:ec:34",
                "port_index": 36,
                "port_name": "eth36",
                "status": "learned"
            }]
        }
    )
    db_session.add_all([obs_arp, obs_mac])
    await db_session.commit()

    topo_service = TopologyCorrelationService(db_session)
    links, snapshot = await topo_service.correlate_topology()

    # Link must be formed connecting switch to laptop!
    assert len(links) >= 1
    fdb_link = next(l for l in links if "MAC_TABLE_AND_ARP" in l.discovery_methods)
    assert fdb_link.status == LinkStatus.ACTIVE
    assert fdb_link.confidence >= 0.80  # Combined Bayesian confidence (FDB 0.80 + ARP 0.75 = 0.95)
    assert "MAC_TABLE_AND_ARP" in fdb_link.discovery_methods
    assert "ARP" in fdb_link.discovery_methods
    assert {fdb_link.source_device_id, fdb_link.destination_device_id} == {sw_core.id, laptop.id}


@pytest.mark.asyncio
async def test_change_detection_engine(db_session: AsyncSession):
    """
    Test differential change detection engine detects added links and removed links.
    """
    dev1 = Device(id="dev-1", hostname="R1", management_ip="10.0.0.1", status=DeviceStatus.ONLINE)
    dev2 = Device(id="dev-2", hostname="SW1", management_ip="10.0.0.2", status=DeviceStatus.ONLINE)
    db_session.add_all([dev1, dev2])
    await db_session.commit()

    # Baseline Snapshot with 1 link
    snap1 = TopologySnapshot(
        id="snap-1",
        graph_data={
            "nodes": [
                {"data": {"id": "dev-1", "label": "R1", "ip": "10.0.0.1", "status": "ONLINE"}},
                {"data": {"id": "dev-2", "label": "SW1", "ip": "10.0.0.2", "status": "ONLINE"}},
            ],
            "edges": [
                {"data": {"id": "link-1", "source": "dev-1", "target": "dev-2", "source_label": "R1", "target_label": "SW1", "confidence_percent": 98, "methods": ["LLDP"]}}
            ]
        },
        node_count=2,
        edge_count=1,
    )
    db_session.add(snap1)
    await db_session.commit()

    # New Snapshot where link-1 is lost (Link Down) and new dev-3 is added
    snap2 = TopologySnapshot(
        id="snap-2",
        graph_data={
            "nodes": [
                {"data": {"id": "dev-1", "label": "R1", "ip": "10.0.0.1", "status": "ONLINE"}},
                {"data": {"id": "dev-2", "label": "SW1", "ip": "10.0.0.2", "status": "ONLINE"}},
                {"data": {"id": "dev-3", "label": "SW4", "ip": "10.0.0.4", "status": "ONLINE"}},
            ],
            "edges": []
        },
        node_count=3,
        edge_count=0,
    )
    db_session.add(snap2)
    await db_session.commit()

    change_service = ChangeDetectionService(db_session)
    events = await change_service.detect_changes(current_snapshot=snap2, previous_snapshot=snap1)

    assert len(events) >= 2
    event_types = [e.event_type for e in events]
    assert EventType.NEW_DEVICE in event_types
    assert EventType.LINK_REMOVED in event_types


@pytest.mark.asyncio
async def test_topology_api_endpoint(client: AsyncClient, db_session: AsyncSession):
    """
    Test GET /api/v1/topology returns nodes, edges, confidence, and evidence.
    """
    # Seed user for auth
    user = User(
        email="viewer@netra.local",
        hashed_password="dummy",
        full_name="Viewer",
        role=UserRole.VIEWER,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    token = create_access_token(subject=user.id)

    # Seed device & link
    d1 = Device(hostname="Router-Core", management_ip="10.0.0.1", vendor="Cisco", device_type=DeviceType.ROUTER, status=DeviceStatus.ONLINE)
    d2 = Device(hostname="Switch-Dist", management_ip="10.0.0.2", vendor="Cisco", device_type=DeviceType.SWITCH, status=DeviceStatus.ONLINE)
    db_session.add_all([d1, d2])
    await db_session.flush()

    link = Link(
        source_device_id=d1.id,
        destination_device_id=d2.id,
        status=LinkStatus.ACTIVE,
        confidence=0.98,
        discovery_methods=["LLDP"],
        evidence=[{"method": "LLDP", "confidence_weight": 0.95}],
    )
    db_session.add(link)
    await db_session.commit()

    # Query API
    res = await client.get("/api/v1/topology", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()["data"]
    assert "nodes" in data
    assert "edges" in data
    assert len(data["nodes"]) == 2
    assert len(data["edges"]) == 1
    assert data["edges"][0]["data"]["confidence_percent"] == 98.0
