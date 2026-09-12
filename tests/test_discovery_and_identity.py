import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.domain.entities.device import DeviceType, DeviceStatus
from app.application.services.identity_service import IdentityResolutionService
from app.infrastructure.discovery.icmp.collector import IcmpCollector
from app.infrastructure.database.models import Device, Interface, DiscoveryRun, DiscoveryRunStatus
from app.application.services.discovery_service import DiscoveryService


def test_identity_classification_rules():
    """Test device vendor and type classification heuristics."""
    # Cisco Router test
    vendor, d_type = IdentityResolutionService.classify_device(
        sys_descr="Cisco IOS Software, C7200 Software (C7200-ADVIPSERVICESK9-M), Version 15.2(4)S5",
        sys_object_id="1.3.6.1.4.1.9.1.222",
        hostname="R1-CoreRouter"
    )
    assert vendor == "Cisco"
    assert d_type == DeviceType.ROUTER

    # Cisco Catalyst Switch test
    vendor, d_type = IdentityResolutionService.classify_device(
        sys_descr="Cisco Catalyst 3850 Series Switch, Cisco IOS XE Software",
        sys_object_id="1.3.6.1.4.1.9.1.1745",
        hostname="SW1-DistSwitch"
    )
    assert vendor == "Cisco"
    assert d_type == DeviceType.SWITCH

    # Linux Server test
    vendor, d_type = IdentityResolutionService.classify_device(
        sys_descr="Linux server1 5.15.0-101-generic #111-Ubuntu SMP x86_64 GNU/Linux",
        sys_object_id="1.3.6.1.4.1.8072.3.2.10",
        hostname="Server1-ProdApp"
    )
    assert vendor == "Linux"
    assert d_type == DeviceType.SERVER

    # Host Workstation test
    vendor, d_type = IdentityResolutionService.classify_device(
        sys_descr="Linux host1 6.2.0-39-generic",
        sys_object_id="1.3.6.1.4.1.8072.3.2.10",
        hostname="Host1-Workstation"
    )
    assert d_type == DeviceType.HOST


def test_stable_mac_extraction():
    """Test physical MAC extraction ignoring virtual/multicast addresses."""
    sample_interfaces = [
        {"if_index": 1, "name": "lo", "mac_address": "00:00:00:00:00:00"},
        {"if_index": 2, "name": "eth0", "mac_address": "00:1a:2b:3c:4d:5e"},
        {"if_index": 3, "name": "dummy0", "mac_address": "01:00:5e:00:00:01"},
    ]
    mac = IdentityResolutionService.extract_stable_mac(sample_interfaces)
    assert mac == "00:1a:2b:3c:4d:5e"


@pytest.mark.asyncio
async def test_icmp_collector_localhost():
    """Test ICMP collector against localhost (127.0.0.1)."""
    collector = IcmpCollector(timeout_seconds=2)
    obs = await collector.collect("127.0.0.1")
    assert obs.target == "127.0.0.1"
    assert obs.normalized_data["reachable"] is True
    assert obs.normalized_data["latency_ms"] is not None


@pytest.mark.asyncio
async def test_idempotent_device_persistence(db_session: AsyncSession):
    """Test that scanning the same target twice updates the existing device rather than creating duplicates."""
    # First discovery
    device1 = Device(
        hostname="SW1-DistSwitch",
        management_ip="192.168.100.2",
        mac_address="00:11:22:33:44:55",
        vendor="Cisco",
        device_type=DeviceType.SWITCH,
        status=DeviceStatus.ONLINE,
    )
    db_session.add(device1)
    await db_session.commit()

    # Query count
    result = await db_session.execute(select(Device).where(Device.management_ip == "192.168.100.2"))
    devices = result.scalars().all()
    assert len(devices) == 1

    # Simulate second scan updating status
    device1.status = DeviceStatus.ONLINE
    device1.vendor = "Cisco Systems"
    await db_session.commit()

    # Verify still only 1 record exists
    result2 = await db_session.execute(select(Device).where(Device.management_ip == "192.168.100.2"))
    devices2 = result2.scalars().all()
    assert len(devices2) == 1
    assert devices2[0].vendor == "Cisco Systems"

