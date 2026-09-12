import asyncio
import ipaddress
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.logging import logger
from app.infrastructure.database.models import (
    DiscoveryRun,
    DiscoveryRunStatus,
    DiscoveryTarget,
    Observation,
    Device,
    Interface,
    Event,
    TopologySnapshot,
)
from app.domain.entities.event import EventType, EventSeverity
from app.domain.entities.device import DeviceStatus, DeviceType
from app.domain.entities.interface import InterfaceAdminStatus, InterfaceOperStatus
from app.infrastructure.discovery.icmp.collector import IcmpCollector
from app.infrastructure.discovery.snmp.collector import SnmpCollector
from app.infrastructure.discovery.lldp.collector import LldpCollector
from app.infrastructure.discovery.cdp.collector import CdpCollector
from app.infrastructure.discovery.arp.collector import ArpCollector
from app.infrastructure.discovery.mac_table.collector import MacTableCollector
from app.application.services.identity_service import IdentityResolutionService
from app.application.services.topology_service import TopologyCorrelationService
from app.application.services.change_detection_service import ChangeDetectionService
from app.infrastructure.websocket.hub import ws_hub


class DiscoveryService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.icmp_collector = IcmpCollector(timeout_seconds=2)
        self.snmp_collector = SnmpCollector(timeout_seconds=3)
        self.lldp_collector = LldpCollector(timeout_seconds=3)
        self.cdp_collector = CdpCollector(timeout_seconds=3)
        self.arp_collector = ArpCollector(timeout_seconds=3)
        self.mac_table_collector = MacTableCollector(timeout_seconds=3)
        self.topology_service = TopologyCorrelationService(db)
        self.change_service = ChangeDetectionService(db)
        self.semaphore = asyncio.Semaphore(settings.DISCOVERY_CONCURRENCY_LIMIT)
        self.db_lock = asyncio.Lock()

    async def execute_discovery_run(self, run_id: str, custom_targets: Optional[List[str]] = None):
        """
        Execute full asynchronous multi-protocol discovery pipeline with topology synthesis,
        change detection, and live WebSocket broadcasts.
        """
        res = await self.db.execute(select(DiscoveryRun).where(DiscoveryRun.id == run_id))
        run = res.scalars().first()
        if not run:
            logger.error(f"DiscoveryRun with ID {run_id} not found.")
            return

        run.status = DiscoveryRunStatus.RUNNING
        run.started_at = datetime.now(timezone.utc)
        run.logs = [{"timestamp": datetime.now(timezone.utc).isoformat(), "message": "Starting target resolution"}]
        await self.db.commit()

        await ws_hub.broadcast("DISCOVERY_STARTED", {"run_id": run.id, "status": "RUNNING"})

        # Fetch the most recent prior snapshot for change detection baseline
        prev_snap_res = await self.db.execute(
            select(TopologySnapshot).order_by(TopologySnapshot.created_at.desc()).limit(1)
        )
        previous_snapshot = prev_snap_res.scalars().first()

        # 1. Resolve Target IP List
        target_ips = []
        if custom_targets and len(custom_targets) > 0:
            for ct in custom_targets:
                target_ips.extend(self._expand_target(ct))
        else:
            t_res = await self.db.execute(select(DiscoveryTarget).where(DiscoveryTarget.is_enabled == True))
            targets = t_res.scalars().all()
            for t in targets:
                target_ips.extend(self._expand_target(t.target_value))

        # Default fallback to Network Simulation Lab subnet if no targets defined
        if not target_ips:
            target_ips = [
                "192.168.100.1",
                "192.168.100.2",
                "192.168.100.3",
                "192.168.100.4",
                "192.168.100.10",
                "192.168.100.20",
            ]

        # Deduplicate target list
        target_ips = list(dict.fromkeys(target_ips))
        run.total_targets = len(target_ips)
        run.processed_targets = 0
        run.successful_targets = 0
        run.failed_targets = 0
        await self.db.commit()

        logger.info(f"Discovery Run {run_id}: Scanning {len(target_ips)} targets concurrently...")

        # 2. Run Concurrent Scans with Bounded Semaphore
        tasks = [self._discover_target(ip, run) for ip in target_ips]
        await asyncio.gather(*tasks, return_exceptions=True)

        # 3. Multi-Source Topology Synthesis & Weighted Confidence Scoring
        logger.info(f"Discovery Run {run_id}: Synthesizing topology and correlating candidate links...")
        persisted_links, current_snapshot = await self.topology_service.correlate_topology(discovery_run_id=run.id)

        # 4. Graph Differential Change Detection
        new_events = await self.change_service.detect_changes(current_snapshot, previous_snapshot)

        # 5. Mark Run Completed
        run.status = DiscoveryRunStatus.COMPLETED
        run.completed_at = datetime.now(timezone.utc)
        run.logs.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message": f"Discovery completed. Processed: {run.processed_targets}, Success: {run.successful_targets}, Active Links: {len(persisted_links)}"
        })
        await self.db.commit()

        # Emit and broadcast DISCOVERY_COMPLETED event
        completed_event = Event(
            event_type=EventType.DISCOVERY_COMPLETED,
            severity=EventSeverity.INFO,
            title=f"Discovery Completed ({run.successful_targets}/{run.total_targets} devices, {len(persisted_links)} links)",
            description=f"Successfully discovered {run.successful_targets} nodes with {len(persisted_links)} verified links.",
            new_state={"run_id": run.id, "nodes": run.successful_targets, "links": len(persisted_links)},
        )
        self.db.add(completed_event)
        await self.db.commit()

        # Broadcast real-time notifications to UI
        await ws_hub.broadcast("TOPOLOGY_UPDATED", {
            "snapshot_id": current_snapshot.id,
            "node_count": current_snapshot.node_count,
            "edge_count": current_snapshot.edge_count,
            "graph": current_snapshot.graph_data,
        })
        for ev in new_events:
            await ws_hub.broadcast("EVENT_EMITTED", {
                "id": ev.id,
                "type": ev.event_type.value,
                "severity": ev.severity.value,
                "title": ev.title,
                "description": ev.description,
            })

        logger.info(f"Discovery Run {run_id} completed successfully.")

    def _expand_target(self, target_str: str) -> List[str]:
        """Expand single IP or CIDR subnet to IP list (capped at 50 per subnet)."""
        target_str = target_str.strip()
        try:
            if "/" in target_str:
                net = ipaddress.ip_network(target_str, strict=False)
                return [str(ip) for ip in net.hosts()][:50]
            else:
                return [target_str]
        except Exception:
            return [target_str]

    async def _discover_target(self, target_ip: str, run: DiscoveryRun):
        """Process a single target device with multi-protocol collectors."""
        async with self.semaphore:
            try:
                # Step 1: ICMP Ping Check (Network I/O)
                icmp_obs = await self.icmp_collector.collect(target_ip)
                is_reachable = icmp_obs.normalized_data.get("reachable", False)

                if not is_reachable:
                    async with self.db_lock:
                        obs_icmp = Observation(
                            discovery_run_id=run.id,
                            source_type=icmp_obs.source_type,
                            target=target_ip,
                            observed_at=datetime.now(timezone.utc),
                            raw_payload=icmp_obs.raw_payload,
                            normalized_data=icmp_obs.normalized_data,
                            error=icmp_obs.error,
                        )
                        self.db.add(obs_icmp)

                        # Check if device existed previously and mark OFFLINE
                        d_res = await self.db.execute(select(Device).where(Device.management_ip == target_ip))
                        existing_device = d_res.scalars().first()
                        if existing_device and existing_device.status == DeviceStatus.ONLINE:
                            existing_device.status = DeviceStatus.OFFLINE
                            event = Event(
                                event_type=EventType.DEVICE_DOWN,
                                severity=EventSeverity.CRITICAL,
                                device_id=existing_device.id,
                                title=f"Device Offline: {existing_device.hostname}",
                                description=f"Device at {target_ip} stopped responding to ICMP/SNMP telemetry.",
                                previous_state={"status": "ONLINE"},
                                new_state={"status": "OFFLINE"},
                            )
                            self.db.add(event)

                        run.processed_targets += 1
                        run.failed_targets += 1
                        await self.db.commit()
                    return

                credentials = {"community": settings.DEFAULT_SNMP_COMMUNITY}

                # Network I/O collectors (executed asynchronously per target)
                snmp_obs = await self.snmp_collector.collect(target_ip, credentials=credentials)
                lldp_obs = await self.lldp_collector.collect(target_ip, credentials=credentials)
                cdp_obs = await self.cdp_collector.collect(target_ip, credentials=credentials)
                arp_obs = await self.arp_collector.collect(target_ip, credentials=credentials)
                mac_obs = await self.mac_table_collector.collect(target_ip, credentials=credentials)

                # Identity Resolution & Classification
                norm_data = snmp_obs.normalized_data or {}
                raw_name = norm_data.get("sys_name") or f"node-{target_ip.replace('.', '-')}"
                hostname = IdentityResolutionService.normalize_hostname(raw_name)
                sys_descr = norm_data.get("sys_descr", "")
                sys_object_id = norm_data.get("sys_object_id", "")
                interfaces_data = norm_data.get("interfaces", [])

                vendor, device_type = IdentityResolutionService.classify_device(sys_descr, sys_object_id, hostname)
                mac_address = IdentityResolutionService.extract_stable_mac(interfaces_data)

                # Database Persistence (locked for thread-safety across concurrent workers)
                async with self.db_lock:
                    obs_icmp = Observation(
                        discovery_run_id=run.id,
                        source_type=icmp_obs.source_type,
                        target=target_ip,
                        observed_at=datetime.now(timezone.utc),
                        raw_payload=icmp_obs.raw_payload,
                        normalized_data=icmp_obs.normalized_data,
                        error=icmp_obs.error,
                    )
                    obs_snmp = Observation(
                        discovery_run_id=run.id,
                        source_type=snmp_obs.source_type,
                        target=target_ip,
                        observed_at=datetime.now(timezone.utc),
                        raw_payload=snmp_obs.raw_payload,
                        normalized_data=snmp_obs.normalized_data,
                        error=snmp_obs.error,
                    )
                    obs_lldp = Observation(
                        discovery_run_id=run.id,
                        source_type=lldp_obs.source_type,
                        target=target_ip,
                        observed_at=datetime.now(timezone.utc),
                        raw_payload=lldp_obs.raw_payload,
                        normalized_data=lldp_obs.normalized_data,
                        error=lldp_obs.error,
                    )
                    obs_cdp = Observation(
                        discovery_run_id=run.id,
                        source_type=cdp_obs.source_type,
                        target=target_ip,
                        observed_at=datetime.now(timezone.utc),
                        raw_payload=cdp_obs.raw_payload,
                        normalized_data=cdp_obs.normalized_data,
                        error=cdp_obs.error,
                    )
                    obs_arp = Observation(
                        discovery_run_id=run.id,
                        source_type=arp_obs.source_type,
                        target=target_ip,
                        observed_at=datetime.now(timezone.utc),
                        raw_payload=arp_obs.raw_payload,
                        normalized_data=arp_obs.normalized_data,
                        error=arp_obs.error,
                    )
                    obs_mac = Observation(
                        discovery_run_id=run.id,
                        source_type=mac_obs.source_type,
                        target=target_ip,
                        observed_at=datetime.now(timezone.utc),
                        raw_payload=mac_obs.raw_payload,
                        normalized_data=mac_obs.normalized_data,
                        error=mac_obs.error,
                    )
                    self.db.add_all([obs_icmp, obs_snmp, obs_lldp, obs_cdp, obs_arp, obs_mac])

                    # Idempotent Device Upsert
                    d_query = select(Device).where(Device.management_ip == target_ip)
                    d_res = await self.db.execute(d_query)
                    device = d_res.scalars().first()

                    is_new = False
                    if not device:
                        device = Device(
                            hostname=hostname,
                            management_ip=target_ip,
                            mac_address=mac_address,
                            vendor=vendor,
                            device_type=device_type,
                            status=DeviceStatus.ONLINE,
                            sys_descr=sys_descr,
                            sys_object_id=sys_object_id,
                            attributes={"sys_uptime": norm_data.get("sys_uptime", 0)},
                            first_seen=datetime.now(timezone.utc),
                            last_seen=datetime.now(timezone.utc),
                        )
                        self.db.add(device)
                        await self.db.flush()
                        is_new = True
                    else:
                        was_offline = (device.status == DeviceStatus.OFFLINE)
                        device.hostname = hostname
                        device.status = DeviceStatus.ONLINE
                        device.vendor = vendor
                        device.device_type = device_type
                        device.sys_descr = sys_descr
                        device.sys_object_id = sys_object_id
                        device.last_seen = datetime.now(timezone.utc)
                        if mac_address:
                            device.mac_address = mac_address

                        if was_offline:
                            event = Event(
                                event_type=EventType.DEVICE_RECOVERED,
                                severity=EventSeverity.INFO,
                                device_id=device.id,
                                title=f"Device Recovered: {device.hostname}",
                                description=f"Device at {target_ip} is back online.",
                                previous_state={"status": "OFFLINE"},
                                new_state={"status": "ONLINE"},
                            )
                            self.db.add(event)

                    # Upsert Interfaces
                    for iface_data in interfaces_data:
                        idx = iface_data.get("if_index", 1)
                        i_res = await self.db.execute(
                            select(Interface).where(Interface.device_id == device.id, Interface.if_index == idx)
                        )
                        iface = i_res.scalars().first()

                        admin_st = InterfaceAdminStatus.UP if iface_data.get("admin_status") == "UP" else InterfaceAdminStatus.DOWN
                        oper_st = InterfaceOperStatus.UP if iface_data.get("oper_status") == "UP" else InterfaceOperStatus.DOWN

                        if not iface:
                            iface = Interface(
                                device_id=device.id,
                                name=iface_data.get("name", f"eth{idx-1}"),
                                if_index=idx,
                                description=iface_data.get("description"),
                                mac_address=iface_data.get("mac_address"),
                                admin_status=admin_st,
                                oper_status=oper_st,
                                first_seen=datetime.now(timezone.utc),
                                last_seen=datetime.now(timezone.utc),
                            )
                            self.db.add(iface)
                        else:
                            iface.oper_status = oper_st
                            iface.admin_status = admin_st
                            iface.last_seen = datetime.now(timezone.utc)
                            if iface_data.get("mac_address"):
                                iface.mac_address = iface_data.get("mac_address")

                    # Step 10: Emit NEW_DEVICE Event
                    if is_new:
                        event = Event(
                            event_type=EventType.NEW_DEVICE,
                            severity=EventSeverity.INFO,
                            device_id=device.id,
                            title=f"New Device Discovered: {device.hostname}",
                            description=f"Discovered {device.vendor} {device.device_type.value} at {device.management_ip} ({len(interfaces_data)} interfaces).",
                            new_state={"hostname": device.hostname, "ip": device.management_ip, "vendor": device.vendor, "type": device.device_type.value},
                        )
                        self.db.add(event)

                    run.processed_targets += 1
                    run.successful_targets += 1
                    await self.db.commit()

                # Broadcast progress update
                await ws_hub.broadcast("DISCOVERY_PROGRESS", {
                    "run_id": run.id,
                    "processed": run.processed_targets,
                    "total": run.total_targets,
                    "current_device": hostname,
                    "current_ip": target_ip,
                })

            except Exception as e:
                logger.error(f"Error processing target {target_ip}: {e}")
                async with self.db_lock:
                    run.processed_targets += 1
                    run.failed_targets += 1
                    await self.db.commit()
