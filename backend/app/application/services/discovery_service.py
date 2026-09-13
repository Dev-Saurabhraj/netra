import asyncio
import ipaddress
import re
import subprocess
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

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
from app.domain.entities.observation import ObservationDomain, ObservationSourceType
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
        self.icmp_collector = IcmpCollector(timeout_seconds=0.4)
        self.snmp_collector = SnmpCollector(timeout_seconds=3)
        self.lldp_collector = LldpCollector(timeout_seconds=3)
        self.cdp_collector = CdpCollector(timeout_seconds=3)
        self.arp_collector = ArpCollector(timeout_seconds=3)
        self.mac_table_collector = MacTableCollector(timeout_seconds=3)
        self.topology_service = TopologyCorrelationService(db)
        self.change_service = ChangeDetectionService(db)
        self.semaphore = asyncio.Semaphore(40)
        self.db_lock = asyncio.Lock()

    def _append_run_log(self, run: DiscoveryRun, entry: Dict[str, Any]):
        """Append log entry and trigger SQLAlchemy dirty detection on JSON column."""
        logs = list(run.logs or [])
        logs.append(entry)
        run.logs = logs
        flag_modified(run, "logs")

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
        run.logs = [{
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": "INFO",
            "stage": "INIT",
            "message": "Initializing discovery run and resolving target scopes..."
        }]
        flag_modified(run, "logs")
        await self.db.commit()

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
        
        start_log = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": "INFO",
            "stage": "PROBING",
            "message": f"Resolved {len(target_ips)} targets ({target_ips[0]} ... {target_ips[-1] if len(target_ips) > 1 else target_ips[0]}). Commencing multi-protocol sweep..."
        }
        self._append_run_log(run, start_log)
        await self.db.commit()

        # Broadcast live started event
        await ws_hub.broadcast("DISCOVERY_STARTED", {
            "run_id": run.id,
            "status": "RUNNING",
            "total_targets": len(target_ips),
            "target_range": f"{target_ips[0]} - {target_ips[-1]}" if len(target_ips) > 1 else target_ips[0],
            "started_at": run.started_at.isoformat() if run.started_at else datetime.now(timezone.utc).isoformat(),
            "log": start_log
        })

        logger.info(f"Discovery Run {run_id}: Scanning {len(target_ips)} targets concurrently...")

        # 2. Run Concurrent Scans with Bounded Semaphore
        tasks = [self._discover_target(ip, run) for ip in target_ips]
        await asyncio.gather(*tasks, return_exceptions=True)

        # 2.5 Post-Scan ARP Backfill: Enrich endpoints (Laptops/PCs/Servers) using Router/Switch ARP tables
        arp_log = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": "INFO",
            "stage": "ARP_BACKFILL",
            "message": f"Correlating router ARP & switch forwarding tables for {run.successful_targets} discovered devices..."
        }
        async with self.db_lock:
            self._append_run_log(run, arp_log)
            await self.db.commit()
        await ws_hub.broadcast("DISCOVERY_STAGE", {"run_id": run.id, "stage": "ARP_BACKFILL", "log": arp_log})

        await self._backfill_endpoints_from_arp(run.id)

        # 3. Multi-Source Topology Synthesis & Weighted Confidence Scoring
        topo_log = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": "INFO",
            "stage": "TOPOLOGY_SYNTHESIS",
            "message": "Synthesizing multi-layer topology graph and computing edge confidences..."
        }
        async with self.db_lock:
            self._append_run_log(run, topo_log)
            await self.db.commit()
        await ws_hub.broadcast("DISCOVERY_STAGE", {"run_id": run.id, "stage": "TOPOLOGY_SYNTHESIS", "log": topo_log})

        logger.info(f"Discovery Run {run_id}: Synthesizing topology and correlating candidate links...")
        persisted_links, current_snapshot = await self.topology_service.correlate_topology(discovery_run_id=run.id)

        # 4. Graph Differential Change Detection
        new_events = await self.change_service.detect_changes(current_snapshot, previous_snapshot)

        # 5. Mark Run Completed
        run.status = DiscoveryRunStatus.COMPLETED
        run.completed_at = datetime.now(timezone.utc)
        completion_log = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": "SUCCESS",
            "stage": "COMPLETED",
            "message": f"Discovery cycle complete! Successfully mapped {run.successful_targets} online devices with {len(persisted_links)} verified links (processed {run.processed_targets}/{run.total_targets} IPs)."
        }
        self._append_run_log(run, completion_log)
        await self.db.commit()

        # Emit DISCOVERY_COMPLETED event
        await ws_hub.broadcast("DISCOVERY_COMPLETED", {
            "run_id": run.id,
            "status": "COMPLETED",
            "total_targets": run.total_targets,
            "processed_targets": run.processed_targets,
            "successful_targets": run.successful_targets,
            "failed_targets": run.failed_targets,
            "active_links": len(persisted_links),
            "log": completion_log
        })

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
        """Expand single IP or CIDR subnet to IP list (capped at 256 per subnet)."""
        target_str = target_str.strip()
        try:
            if "/" in target_str:
                net = ipaddress.ip_network(target_str, strict=False)
                return [str(ip) for ip in net.hosts()][:256]
            else:
                return [target_str]
        except Exception:
            return [target_str]

    @staticmethod
    def _get_local_host_arp_table() -> Dict[str, str]:
        """
        Query the host OS kernel ARP / neighbor table to extract IP-to-MAC bindings
        for devices on local subnets (vital for Wi-Fi environments where endpoints sleep or home routers lack SNMP).
        Returns a dict mapping ip_address -> normalized mac_address.
        """
        ip_to_mac: Dict[str, str] = {}
        try:
            cmd = ["arp", "-a"]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=3)
            if res.returncode == 0:
                for line in res.stdout.splitlines():
                    m = re.search(r"(\d{1,3}(?:\.\d{1,3}){3}).*?([0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2})", line)
                    if m:
                        ip = m.group(1)
                        mac = m.group(2).lower().replace("-", ":")
                        # Ignore broadcast and multicast MACs
                        if mac not in ("ff:ff:ff:ff:ff:ff", "00:00:00:00:00:00") and not mac.startswith("01:00:5e"):
                            ip_to_mac[ip] = mac
        except Exception as e:
            logger.debug(f"Local host ARP cache query exception: {e}")
        return ip_to_mac

    async def _discover_target(self, target_ip: str, run: DiscoveryRun):
        """Process a single target device with multi-protocol collectors."""
        async with self.semaphore:
            try:
                # Step 1: ICMP Ping Check (Network I/O)
                icmp_obs = await self.icmp_collector.collect(target_ip)
                is_reachable = icmp_obs.normalized_data.get("reachable", False)

                # Step 1.5: Passive / Gateway DHCP & DNS Lease Verification:
                # Wi-Fi smartphones (Android/iOS) commonly enter sleep mode and drop ICMP echo requests.
                dns_name = ""
                if not is_reachable:
                    dns_name = IdentityResolutionService.resolve_dns_ptr(target_ip)
                    if dns_name:
                        is_reachable = True
                        icmp_obs.normalized_data["reachable"] = True
                        icmp_obs.normalized_data["discovered_via"] = "DHCP_DNS"
                        icmp_obs.error = None

                # Step 1.7: Local Host OS ARP Cache Verification:
                # Devices on local Wi-Fi that don't answer ping or DNS often exist in the OS kernel ARP table!
                if not is_reachable:
                    local_arp = self._get_local_host_arp_table()
                    if target_ip in local_arp:
                        is_reachable = True
                        icmp_obs.normalized_data["reachable"] = True
                        icmp_obs.normalized_data["discovered_via"] = "LOCAL_ARP"
                        icmp_obs.normalized_data["mac"] = local_arp[target_ip]
                        icmp_obs.error = None

                if not is_reachable:
                    log_entry = {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "level": "DEBUG",
                        "ip": target_ip,
                        "status": "OFFLINE",
                        "message": f"{target_ip} - Unreachable (no ICMP, DHCP, or local ARP response)",
                    }
                    async with self.db_lock:
                        run.processed_targets += 1
                        run.failed_targets += 1
                        self._append_run_log(run, log_entry)

                        # Only update DB if this device existed previously
                        d_res = await self.db.execute(select(Device).where(Device.management_ip == target_ip))
                        existing_device = d_res.scalars().first()
                        if existing_device and existing_device.status == DeviceStatus.ONLINE:
                            existing_device.status = DeviceStatus.OFFLINE
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
                            await self.db.commit()

                    pct = round((run.processed_targets / max(run.total_targets, 1)) * 100, 1)
                    await ws_hub.broadcast("DISCOVERY_PROGRESS", {
                        "run_id": run.id,
                        "processed": run.processed_targets,
                        "total": run.total_targets,
                        "successful": run.successful_targets,
                        "failed": run.failed_targets,
                        "percent": pct,
                        "current_ip": target_ip,
                        "status": "OFFLINE",
                        "log": log_entry,
                    })
                    return

                credentials = {"community": settings.DEFAULT_SNMP_COMMUNITY}

                # Step 2: Primary SNMP Identity Check
                snmp_obs = await self.snmp_collector.collect(target_ip, credentials=credentials)
                has_snmp = (snmp_obs.error is None and bool(snmp_obs.normalized_data))

                # Step 3: Only query secondary SNMP tables (LLDP, CDP, ARP, MAC) if SNMP agent is present!
                # If target is a regular PC/laptop/phone without SNMP, this skips 80+ seconds of dead UDP timeouts.
                if has_snmp:
                    lldp_obs = await self.lldp_collector.collect(target_ip, credentials=credentials)
                    cdp_obs = await self.cdp_collector.collect(target_ip, credentials=credentials)
                    arp_obs = await self.arp_collector.collect(target_ip, credentials=credentials)
                    mac_obs = await self.mac_table_collector.collect(target_ip, credentials=credentials)
                else:
                    lldp_obs = ObservationDomain(source_type=ObservationSourceType.LLDP, target=target_ip, observed_at=datetime.now(timezone.utc), raw_payload={}, normalized_data={}, error="SNMP agent inactive")
                    cdp_obs = ObservationDomain(source_type=ObservationSourceType.CDP, target=target_ip, observed_at=datetime.now(timezone.utc), raw_payload={}, normalized_data={}, error="SNMP agent inactive")
                    arp_obs = ObservationDomain(source_type=ObservationSourceType.ARP, target=target_ip, observed_at=datetime.now(timezone.utc), raw_payload={}, normalized_data={}, error="SNMP agent inactive")
                    mac_obs = ObservationDomain(source_type=ObservationSourceType.MAC_TABLE, target=target_ip, observed_at=datetime.now(timezone.utc), raw_payload={}, normalized_data={}, error="SNMP agent inactive")

                # Identity Resolution & Classification
                norm_data = snmp_obs.normalized_data or {}
                raw_sys_name = norm_data.get("sys_name")
                sys_descr = norm_data.get("sys_descr", "")
                sys_object_id = norm_data.get("sys_object_id", "")
                interfaces_data = norm_data.get("interfaces", [])

                vendor, device_type = IdentityResolutionService.classify_device(sys_descr, sys_object_id, raw_sys_name or target_ip)
                mac_address = IdentityResolutionService.extract_stable_mac(interfaces_data)

                # Check for MAC embedded in hostname (e.g. Unknown_2e:1f:19:6e:30:a3)
                if not mac_address:
                    candidate_name = dns_name or raw_sys_name or ""
                    mac_match = re.search(r'([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}', candidate_name)
                    if mac_match:
                        mac_address = mac_match.group(0).lower().replace("-", ":")

                if (not vendor or vendor == "Generic") and mac_address:
                    vendor = IdentityResolutionService.classify_vendor_by_mac(mac_address)

                hostname = IdentityResolutionService.generate_friendly_hostname(
                    ip=target_ip,
                    vendor=vendor,
                    device_type=device_type,
                    mac=mac_address,
                    sys_name=raw_sys_name or dns_name,
                )

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

                    # If non-SNMP device has a known MAC, ensure at least one interface exists
                    if not interfaces_data and mac_address:
                        i_res = await self.db.execute(
                            select(Interface).where(Interface.device_id == device.id)
                        )
                        if not i_res.scalars().first():
                            default_iface = Interface(
                                device_id=device.id,
                                name="wlan0",
                                if_index=1,
                                description="Wi-Fi / Access Interface",
                                mac_address=mac_address,
                                admin_status=InterfaceAdminStatus.UP,
                                oper_status=InterfaceOperStatus.UP,
                                first_seen=datetime.now(timezone.utc),
                                last_seen=datetime.now(timezone.utc),
                            )
                            self.db.add(default_iface)

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

                    method_tag = icmp_obs.normalized_data.get("discovered_via", "ICMP_PING")
                    if has_snmp:
                        method_tag = "SNMP_v2c"
                    
                    device_payload = {
                        "id": device.id,
                        "hostname": hostname,
                        "ip": target_ip,
                        "mac": mac_address,
                        "vendor": vendor,
                        "type": device.device_type.value,
                        "method": method_tag,
                    }
                    log_entry = {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "level": "SUCCESS",
                        "ip": target_ip,
                        "status": "ONLINE",
                        "message": f"Discovered {hostname} ({device.device_type.value}) - {vendor} [{method_tag}]",
                        "device": device_payload,
                    }
                    self._append_run_log(run, log_entry)
                    run.processed_targets += 1
                    run.successful_targets += 1
                    await self.db.commit()

                # Broadcast progress update with discovered device
                pct = round((run.processed_targets / max(run.total_targets, 1)) * 100, 1)
                await ws_hub.broadcast("DISCOVERY_PROGRESS", {
                    "run_id": run.id,
                    "processed": run.processed_targets,
                    "total": run.total_targets,
                    "successful": run.successful_targets,
                    "failed": run.failed_targets,
                    "percent": pct,
                    "current_ip": target_ip,
                    "current_device": hostname,
                    "status": "ONLINE",
                    "device": device_payload,
                    "log": log_entry,
                })

            except Exception as e:
                logger.error(f"Error processing target {target_ip}: {e}")
                log_entry = {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "level": "ERROR",
                    "ip": target_ip,
                    "status": "ERROR",
                    "message": f"Scan error on {target_ip}: {str(e)[:120]}",
                }
                async with self.db_lock:
                    run.processed_targets += 1
                    run.failed_targets += 1
                    self._append_run_log(run, log_entry)
                    await self.db.commit()

                pct = round((run.processed_targets / max(run.total_targets, 1)) * 100, 1)
                await ws_hub.broadcast("DISCOVERY_PROGRESS", {
                    "run_id": run.id,
                    "processed": run.processed_targets,
                    "total": run.total_targets,
                    "successful": run.successful_targets,
                    "failed": run.failed_targets,
                    "percent": pct,
                    "current_ip": target_ip,
                    "status": "ERROR",
                    "log": log_entry,
                })

    async def _backfill_endpoints_from_arp(self, run_id: str) -> None:
        """
        Correlate ARP observations from routers and switches with discovered endpoints.
        For devices that only responded to ping (or lack SNMP credentials), this method:
          1. Sets device.mac_address using the router's ARP table.
          2. Classifies vendor via MAC OUI (Intel, Dell, Apple, VMware, etc.).
          3. Sets device_type to HOST if currently UNKNOWN.
          4. Creates a default Interface (eth0) with that MAC so topology links connect cleanly.
        """
        try:
            # 1. Fetch all ARP observations for this run
            obs_res = await self.db.execute(
                select(Observation).where(
                    Observation.discovery_run_id == run_id,
                    Observation.source_type == "ARP",
                )
            )
            arp_observations = obs_res.scalars().all()

            # Build IP -> MAC lookup table
            ip_to_mac: Dict[str, str] = {}
            for obs in arp_observations:
                norm = obs.normalized_data or {}
                for entry in norm.get("arp_entries", []):
                    ip = entry.get("ip_address")
                    mac = (entry.get("mac_address") or "").lower().replace("-", ":")
                    if ip and mac and mac != "00:00:00:00:00:00":
                        ip_to_mac[ip] = mac

            # Merge local host OS ARP table (vital for consumer Wi-Fi where routers do not expose SNMP)
            local_host_arp = self._get_local_host_arp_table()
            for ip, mac in local_host_arp.items():
                if ip not in ip_to_mac:
                    ip_to_mac[ip] = mac

            if not ip_to_mac:
                return

            # 2. Fetch all online devices
            d_res = await self.db.execute(
                select(Device).options(selectinload(Device.interfaces))
            )
            devices = d_res.scalars().all()

            updated = False
            for d in devices:
                if not d.management_ip or d.management_ip not in ip_to_mac:
                    continue

                learned_mac = ip_to_mac[d.management_ip]

                # If device has no MAC or was generic/unknown, enrich it
                if not d.mac_address:
                    d.mac_address = learned_mac
                    updated = True

                if d.device_type == DeviceType.UNKNOWN:
                    d.device_type = DeviceType.HOST
                    updated = True

                if not d.vendor or d.vendor == "Generic":
                    d.vendor = IdentityResolutionService.classify_vendor_by_mac(learned_mac)
                    updated = True

                # Upgrade hostname if currently generic or fallback
                if not d.hostname or d.hostname.startswith("node-") or d.hostname.startswith("host-") or d.hostname.startswith("Host-"):
                    d.hostname = IdentityResolutionService.generate_friendly_hostname(
                        ip=d.management_ip,
                        vendor=d.vendor,
                        device_type=d.device_type,
                        mac=learned_mac,
                    )
                    updated = True

                # Ensure device has at least one interface with this MAC
                if not d.interfaces:
                    iface = Interface(
                        device_id=d.id,
                        name="eth0",
                        if_index=1,
                        description="Access Interface (resolved via ARP)",
                        mac_address=learned_mac,
                        admin_status=InterfaceAdminStatus.UP,
                        oper_status=InterfaceOperStatus.UP,
                        first_seen=datetime.now(timezone.utc),
                        last_seen=datetime.now(timezone.utc),
                    )
                    self.db.add(iface)
                    updated = True
                elif not d.interfaces[0].mac_address:
                    d.interfaces[0].mac_address = learned_mac
                    updated = True

            if updated:
                await self.db.commit()
                logger.info("Successfully enriched non-SNMP endpoints with ARP bindings.")

        except Exception as e:
            logger.warning(f"Failed to backfill endpoints from ARP: {e}")

