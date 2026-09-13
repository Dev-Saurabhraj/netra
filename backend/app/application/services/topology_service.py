import uuid
import re
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple, Set
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.logging import logger
from app.infrastructure.database.models import (
    Device,
    Interface,
    Link,
    TopologySnapshot,
    Observation,
)
from app.domain.entities.link import LinkStatus
from app.domain.entities.device import DeviceType
from app.domain.entities.observation import ObservationSourceType
from app.domain.schemas.neighbor import NeighborAdjacency


class TopologyCorrelationService:
    """
    Deterministic Multi-Source Evidence Correlation & Weighted Confidence Engine.
    Synthesizes LLDP, CDP, ARP, and Switch MAC FDB telemetry into high-fidelity Layer-2/3 links.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def correlate_topology(self, discovery_run_id: Optional[str] = None) -> Tuple[List[Link], TopologySnapshot]:
        """
        Synthesize observations from the current discovery cycle, correlate links,
        calculate weighted confidence scores, and persist snapshot.
        """
        # 1. Fetch all online devices & their interfaces
        d_res = await self.db.execute(
            select(Device).options(selectinload(Device.interfaces))
        )
        devices = d_res.scalars().all()
        device_by_id: Dict[str, Device] = {d.id: d for d in devices}
        device_by_ip: Dict[str, Device] = {d.management_ip: d for d in devices if d.management_ip}
        
        # Build lookup tables for hostname and MACs
        device_by_hostname: Dict[str, Device] = {}
        interface_by_mac: Dict[str, Tuple[Device, Interface]] = {}
        for d in devices:
            norm_name = d.hostname.lower().split(".")[0].strip()
            device_by_hostname[norm_name] = d
            if d.mac_address:
                norm_mac = d.mac_address.lower().replace("-", ":")
                # map device mac if first interface
                if d.interfaces:
                    interface_by_mac[norm_mac] = (d, d.interfaces[0])
            for iface in d.interfaces:
                if iface.mac_address:
                    norm_mac = iface.mac_address.lower().replace("-", ":")
                    interface_by_mac[norm_mac] = (d, iface)

        # 2. Fetch observations
        obs_query = select(Observation)
        if discovery_run_id:
            obs_query = obs_query.where(Observation.discovery_run_id == discovery_run_id)
        obs_res = await self.db.execute(obs_query)
        observations = obs_res.scalars().all()

        # Group observations by target IP and type
        obs_by_ip: Dict[str, Dict[str, List[Observation]]] = {}
        for o in observations:
            st = o.source_type.value if hasattr(o.source_type, "value") else str(o.source_type)
            obs_by_ip.setdefault(o.target, {}).setdefault(st, []).append(o)

        # 3. Candidate Link Collection: (dev1_id, iface1_id, dev2_id, iface2_id) -> Evidence List
        candidate_links: Dict[Tuple[str, Optional[str], str, Optional[str]], List[Dict[str, Any]]] = {}

        # -------------------------------------------------------------
        # Phase A: Direct LLDP & CDP Adjacencies
        # -------------------------------------------------------------
        for src_ip, sources in obs_by_ip.items():
            src_dev = device_by_ip.get(src_ip)
            if not src_dev:
                continue

            # Process LLDP
            for lldp_obs in sources.get(ObservationSourceType.LLDP.value, []):
                norm_data = lldp_obs.normalized_data or {}
                for n_dict in norm_data.get("neighbors", []):
                    n = NeighborAdjacency(**n_dict)
                    tgt_dev = self._resolve_target_device(n, device_by_ip, device_by_hostname, interface_by_mac)
                    if tgt_dev and tgt_dev.id != src_dev.id:
                        src_iface = self._find_matching_interface(src_dev, n.local_if_index, n.local_interface_name)
                        tgt_iface = self._find_matching_remote_interface(tgt_dev, n.remote_port_id, n.remote_port_desc)

                        canonical_key, is_reversed = self._canonical_link_key(
                            src_dev.id, src_iface.id if src_iface else None,
                            tgt_dev.id, tgt_iface.id if tgt_iface else None,
                        )

                        evidence = {
                            "method": "LLDP",
                            "confidence_weight": 0.95,
                            "direction": "REVERSED" if is_reversed else "FORWARD",
                            "local_port": src_iface.name if src_iface else n.local_interface_name,
                            "remote_port": tgt_iface.name if tgt_iface else n.remote_port_id,
                            "remote_sys_name": n.remote_device_name,
                            "timestamp": lldp_obs.observed_at.isoformat(),
                        }
                        candidate_links.setdefault(canonical_key, []).append(evidence)

            # Process CDP
            for cdp_obs in sources.get(ObservationSourceType.CDP.value, []):
                norm_data = cdp_obs.normalized_data or {}
                for n_dict in norm_data.get("neighbors", []):
                    n = NeighborAdjacency(**n_dict)
                    tgt_dev = self._resolve_target_device(n, device_by_ip, device_by_hostname, interface_by_mac)
                    if tgt_dev and tgt_dev.id != src_dev.id:
                        src_iface = self._find_matching_interface(src_dev, n.local_if_index, n.local_interface_name)
                        tgt_iface = self._find_matching_remote_interface(tgt_dev, n.remote_port_id, n.remote_port_desc)

                        canonical_key, is_reversed = self._canonical_link_key(
                            src_dev.id, src_iface.id if src_iface else None,
                            tgt_dev.id, tgt_iface.id if tgt_iface else None,
                        )

                        evidence = {
                            "method": "CDP",
                            "confidence_weight": 0.90,
                            "direction": "REVERSED" if is_reversed else "FORWARD",
                            "local_port": src_iface.name if src_iface else n.local_interface_name,
                            "remote_port": tgt_iface.name if tgt_iface else n.remote_port_id,
                            "remote_device_id": n.remote_device_name,
                            "timestamp": cdp_obs.observed_at.isoformat(),
                        }
                        candidate_links.setdefault(canonical_key, []).append(evidence)

        # -------------------------------------------------------------
        # Phase B: Indirect Telemetry (ARP + Switch MAC Tables)
        # -------------------------------------------------------------
        # Build global ARP map: IP -> MAC
        global_arp_map: Dict[str, str] = {}
        for src_ip, sources in obs_by_ip.items():
            for arp_obs in sources.get(ObservationSourceType.ARP.value, []):
                norm = arp_obs.normalized_data or {}
                for entry in norm.get("arp_entries", []):
                    ip = entry.get("ip_address")
                    mac = (entry.get("mac_address") or "").lower().replace("-", ":")
                    if ip and mac:
                        global_arp_map[ip] = mac

        # Correlate Switch MAC FDB tables with known endpoints
        # 1. Reverse lookup: MAC -> IP from ARP
        mac_to_ip: Dict[str, str] = {m: ip for ip, m in global_arp_map.items()}

        for switch_ip, sources in obs_by_ip.items():
            switch_dev = device_by_ip.get(switch_ip)
            if not switch_dev:
                continue

            for mac_obs in sources.get(ObservationSourceType.MAC_TABLE.value, []):
                norm = mac_obs.normalized_data or {}
                for m_entry in norm.get("mac_entries", []):
                    learned_mac = (m_entry.get("mac_address") or "").lower().replace("-", ":")
                    port_idx = m_entry.get("port_index", 1)
                    port_name = m_entry.get("port_name")

                    # Identify connected device by:
                    # A) Direct known interface MAC
                    endpoint_pair = interface_by_mac.get(learned_mac)
                    connected_dev: Optional[Device] = None
                    connected_iface: Optional[Interface] = None

                    if endpoint_pair and endpoint_pair[0].id != switch_dev.id:
                        connected_dev, connected_iface = endpoint_pair
                    elif learned_mac in mac_to_ip:
                        # B) 2-Hop Correlation: Switch learned MAC -> ARP Table mapped IP -> Known Device
                        endpoint_ip = mac_to_ip[learned_mac]
                        candidate_dev = device_by_ip.get(endpoint_ip)
                        if candidate_dev and candidate_dev.id != switch_dev.id:
                            connected_dev = candidate_dev
                            connected_iface = candidate_dev.interfaces[0] if candidate_dev.interfaces else None

                    if connected_dev:
                        switch_iface = self._find_matching_interface(switch_dev, port_idx, port_name)

                        canonical_key, is_reversed = self._canonical_link_key(
                            switch_dev.id, switch_iface.id if switch_iface else None,
                            connected_dev.id, connected_iface.id if connected_iface else None,
                        )

                        evidence = {
                            "method": "MAC_TABLE_AND_ARP",
                            "confidence_weight": 0.80,
                            "switch_port": switch_iface.name if switch_iface else port_name,
                            "learned_mac": learned_mac,
                            "endpoint_ip": connected_dev.management_ip,
                            "timestamp": mac_obs.observed_at.isoformat(),
                        }
                        candidate_links.setdefault(canonical_key, []).append(evidence)

        # -------------------------------------------------------------
        # Phase C: Direct ARP Cache & Subnet Link Correlation
        # -------------------------------------------------------------
        for src_ip, sources in obs_by_ip.items():
            src_dev = device_by_ip.get(src_ip)
            if not src_dev:
                continue

            for arp_obs in sources.get(ObservationSourceType.ARP.value, []):
                norm = arp_obs.normalized_data or {}
                for entry in norm.get("arp_entries", []):
                    remote_ip = entry.get("ip_address")
                    if not remote_ip or remote_ip == src_ip:
                        continue
                    tgt_dev = device_by_ip.get(remote_ip)
                    if tgt_dev and tgt_dev.id != src_dev.id:
                        src_iface = self._find_matching_interface(src_dev, entry.get("if_index"))
                        tgt_iface = tgt_dev.interfaces[0] if tgt_dev.interfaces else None

                        canonical_key, is_reversed = self._canonical_link_key(
                            src_dev.id, src_iface.id if src_iface else None,
                            tgt_dev.id, tgt_iface.id if tgt_iface else None,
                        )

                        evidence = {
                            "method": "ARP",
                            "confidence_weight": 0.75,
                            "direction": "REVERSED" if is_reversed else "FORWARD",
                            "local_port": src_iface.name if src_iface else None,
                            "remote_ip": remote_ip,
                            "timestamp": arp_obs.observed_at.isoformat(),
                        }
                        candidate_links.setdefault(canonical_key, []).append(evidence)

        # Gateway & Subnet Distribution Synthesis (Interconnect Core/Dist/Access nodes per subnet)
        # Group devices by their /24 subnet prefix
        devices_by_subnet: Dict[str, List[Device]] = {}
        for d in devices:
            if d.management_ip and "." in d.management_ip:
                parts = d.management_ip.split(".")
                if len(parts) == 4:
                    subnet_prefix = ".".join(parts[:3])
                    devices_by_subnet.setdefault(subnet_prefix, []).append(d)

        for subnet, sub_devs in devices_by_subnet.items():
            sub_routers = [d for d in sub_devs if d.device_type == DeviceType.ROUTER]
            sub_switches = [d for d in sub_devs if d.device_type == DeviceType.SWITCH]
            sub_endpoints = [d for d in sub_devs if d.device_type in (DeviceType.SERVER, DeviceType.HOST)]

            # Case 1: Subnet has both Router and Switch (Enterprise / Lab)
            if sub_routers and sub_switches:
                r = sub_routers[0]
                core_sw = sub_switches[0]
                canonical_key, is_reversed = self._canonical_link_key(
                    r.id, r.interfaces[0].id if r.interfaces else None,
                    core_sw.id, core_sw.interfaces[0].id if core_sw.interfaces else None,
                )
                candidate_links.setdefault(canonical_key, []).append({
                    "method": "L3_SUBNET",
                    "confidence_weight": 0.85,
                    "direction": "FORWARD",
                    "description": f"Core Uplink: {r.hostname} -> {core_sw.hostname}",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

                for sw in sub_switches[1:]:
                    canonical_key, is_reversed = self._canonical_link_key(
                        core_sw.id, core_sw.interfaces[0].id if core_sw.interfaces else None,
                        sw.id, sw.interfaces[0].id if sw.interfaces else None,
                    )
                    candidate_links.setdefault(canonical_key, []).append({
                        "method": "L2_TRUNK",
                        "confidence_weight": 0.80,
                        "direction": "FORWARD",
                        "description": f"Distribution Trunk: {core_sw.hostname} -> {sw.hostname}",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

                access_switches = sub_switches[1:] if len(sub_switches) > 1 else sub_switches
                for i, ep in enumerate(sub_endpoints):
                    target_sw = access_switches[i % len(access_switches)]
                    canonical_key, is_reversed = self._canonical_link_key(
                        target_sw.id, target_sw.interfaces[0].id if target_sw.interfaces else None,
                        ep.id, ep.interfaces[0].id if ep.interfaces else None,
                    )
                    candidate_links.setdefault(canonical_key, []).append({
                        "method": "L2_ACCESS",
                        "confidence_weight": 0.75,
                        "direction": "FORWARD",
                        "description": f"Access Port: {target_sw.hostname} -> {ep.hostname}",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

            # Case 2: Subnet has Router/Gateway but no managed Switch (Home / SOHO / Wi-Fi Access Point)
            elif sub_routers and sub_endpoints:
                gateway = sub_routers[0]
                for ep in sub_endpoints:
                    canonical_key, is_reversed = self._canonical_link_key(
                        gateway.id, gateway.interfaces[0].id if gateway.interfaces else None,
                        ep.id, ep.interfaces[0].id if ep.interfaces else None,
                    )
                    candidate_links.setdefault(canonical_key, []).append({
                        "method": "L3_SUBNET",
                        "confidence_weight": 0.80,
                        "direction": "FORWARD",
                        "description": f"Wi-Fi / Gateway Link: {gateway.hostname} -> {ep.hostname}",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

        # -------------------------------------------------------------
        # 4. Calculate Weighted Confidence & Save Links Idempotently
        # -------------------------------------------------------------
        persisted_links: List[Link] = []
        
        # Load existing links
        existing_links_res = await self.db.execute(select(Link))
        existing_links = existing_links_res.scalars().all()
        existing_link_map: Dict[Tuple[str, Optional[str], str, Optional[str]], Link] = {
            (l.source_device_id, l.source_interface_id, l.destination_device_id, l.destination_interface_id): l
            for l in existing_links
        }

        active_keys: Set[Tuple[str, Optional[str], str, Optional[str]]] = set()

        for (src_dev_id, src_if_id, dst_dev_id, dst_if_id), evidence_list in candidate_links.items():
            active_keys.add((src_dev_id, src_if_id, dst_dev_id, dst_if_id))
            
            # Check bidirectional confirmation (e.g., both endpoints saw each other via LLDP)
            has_lldp_forward = any(e.get("method") == "LLDP" and e.get("direction") == "FORWARD" for e in evidence_list)
            has_lldp_reversed = any(e.get("method") == "LLDP" and e.get("direction") == "REVERSED" for e in evidence_list)
            
            if has_lldp_forward and has_lldp_reversed:
                confidence_score = 0.98  # Bi-directional mutual agreement
            else:
                # Multi-source Bayesian combination: C = 1 - product(1 - weight_i)
                prob_unsupported = 1.0
                for e in evidence_list:
                    w = float(e.get("confidence_weight", 0.5))
                    prob_unsupported *= (1.0 - w)
                confidence_score = round(1.0 - prob_unsupported, 4)

            methods = list(dict.fromkeys(e["method"] for e in evidence_list))

            link = existing_link_map.get((src_dev_id, src_if_id, dst_dev_id, dst_if_id))
            if not link:
                link = Link(
                    source_device_id=src_dev_id,
                    source_interface_id=src_if_id,
                    destination_device_id=dst_dev_id,
                    destination_interface_id=dst_if_id,
                    status=LinkStatus.ACTIVE,
                    confidence=confidence_score,
                    discovery_methods=methods,
                    evidence=evidence_list,
                    first_seen=datetime.now(timezone.utc),
                    last_seen=datetime.now(timezone.utc),
                )
                self.db.add(link)
                persisted_links.append(link)
            else:
                link.status = LinkStatus.ACTIVE
                link.confidence = confidence_score
                link.discovery_methods = methods
                link.evidence = evidence_list
                link.last_seen = datetime.now(timezone.utc)
                persisted_links.append(link)

        # Mark non-observed links as DEGRADED or DOWN if they were previously ACTIVE
        for key, old_link in existing_link_map.items():
            if key not in active_keys and old_link.status == LinkStatus.ACTIVE:
                old_link.status = LinkStatus.DOWN
                logger.info(f"Link {old_link.id} marked DOWN (not observed in current cycle).")

        await self.db.commit()

        # -------------------------------------------------------------
        # 5. Build Cytoscape-Compatible Topology Graph JSON & Snapshot
        # -------------------------------------------------------------
        graph_nodes = []
        for d in devices:
            graph_nodes.append({
                "data": {
                    "id": d.id,
                    "label": d.hostname,
                    "ip": d.management_ip,
                    "vendor": d.vendor,
                    "type": d.device_type.value,
                    "status": d.status.value,
                    "interfaces_count": len(d.interfaces),
                }
            })

        graph_edges = []
        for l in persisted_links:
            if l.status == LinkStatus.ACTIVE:
                src_dev = device_by_id.get(l.source_device_id)
                dst_dev = device_by_id.get(l.destination_device_id)
                graph_edges.append({
                    "data": {
                        "id": l.id,
                        "source": l.source_device_id,
                        "target": l.destination_device_id,
                        "source_label": src_dev.hostname if src_dev else "Unknown",
                        "target_label": dst_dev.hostname if dst_dev else "Unknown",
                        "confidence": l.confidence,
                        "confidence_percent": int(l.confidence * 100),
                        "methods": l.discovery_methods,
                        "evidence_count": len(l.evidence),
                        "status": l.status.value,
                    }
                })

        snapshot = TopologySnapshot(
            discovery_run_id=discovery_run_id,
            graph_data={"nodes": graph_nodes, "edges": graph_edges},
            node_count=float(len(graph_nodes)),
            edge_count=float(len(graph_edges)),
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(snapshot)
        await self.db.commit()
        await self.db.refresh(snapshot)

        return persisted_links, snapshot

    @staticmethod
    def _canonical_link_key(
        dev1: str, iface1: Optional[str],
        dev2: str, iface2: Optional[str]
    ) -> Tuple[Tuple[str, Optional[str], str, Optional[str]], bool]:
        """
        Guarantee deterministic ordering (A, ifA, B, ifB) such that undirected
        links are consistently stored and duplicate reverse links are avoided.
        Returns (canonical_key, is_reversed).
        """
        k1 = (dev1, iface1 or "")
        k2 = (dev2, iface2 or "")
        if k1 <= k2:
            return (dev1, iface1, dev2, iface2), False
        else:
            return (dev2, iface2, dev1, iface1), True

    @staticmethod
    def _resolve_target_device(
        neighbor: NeighborAdjacency,
        by_ip: Dict[str, Device],
        by_name: Dict[str, Device],
        by_mac: Dict[str, Tuple[Device, Interface]],
    ) -> Optional[Device]:
        """Resolve target device entity from neighbor telemetry attributes."""
        # 1. By Management IP
        if neighbor.remote_management_ip and neighbor.remote_management_ip in by_ip:
            return by_ip[neighbor.remote_management_ip]

        # 2. By Remote Chassis MAC
        if neighbor.remote_chassis_id:
            norm_mac = neighbor.remote_chassis_id.lower().replace("-", ":")
            if norm_mac in by_mac:
                return by_mac[norm_mac][0]

        # 3. By Remote System Name / Hostname
        if neighbor.remote_device_name:
            clean_name = neighbor.remote_device_name.lower().split(".")[0].strip()
            if clean_name in by_name:
                return by_name[clean_name]

        return None

    @staticmethod
    def _find_matching_interface(device: Device, if_index: Optional[int] = None, name: Optional[str] = None) -> Optional[Interface]:
        """Find local interface by if_index or name."""
        if not device.interfaces:
            return None
        if if_index:
            for iface in device.interfaces:
                if iface.if_index == if_index:
                    return iface
        if name:
            clean_target = name.lower().replace(" ", "")
            for iface in device.interfaces:
                if iface.name.lower().replace(" ", "") == clean_target:
                    return iface
        return device.interfaces[0] if device.interfaces else None

    @staticmethod
    def _find_matching_remote_interface(device: Device, port_id: Optional[str], port_desc: Optional[str]) -> Optional[Interface]:
        """Find remote interface by port_id or description."""
        if not device.interfaces:
            return None
        for candidate in [port_id, port_desc]:
            if not candidate:
                continue
            clean = candidate.lower().replace(" ", "")
            for iface in device.interfaces:
                if iface.name.lower().replace(" ", "") == clean or (iface.description and clean in iface.description.lower()):
                    return iface
                # Check match like eth0 or Gi0/1
                digits = re.findall(r'\d+', candidate)
                if digits and iface.if_index == int(digits[-1]):
                    return iface
        return device.interfaces[0] if device.interfaces else None
