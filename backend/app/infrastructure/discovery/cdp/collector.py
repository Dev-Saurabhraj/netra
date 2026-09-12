import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from app.infrastructure.discovery.base import DiscoveryCollector
from app.infrastructure.discovery.snmp import oids
from app.domain.entities.observation import ObservationDomain, ObservationSourceType
from app.domain.schemas.neighbor import NeighborAdjacency, DirectNeighborDiscoveryResult
from app.core.logging import logger


class CdpCollector(DiscoveryCollector):
    """
    Asynchronous CDP Collector querying CISCO-CDP-MIB (cdpCacheTable).
    Discovers Layer-2 Cisco neighbor adjacencies, remote platform, device ID, and remote port.
    """

    async def collect(self, target_ip: str, credentials: Optional[Dict[str, Any]] = None) -> ObservationDomain:
        community = (credentials or {}).get("community", "public")
        port = int((credentials or {}).get("port", 161))

        neighbors: List[Dict[str, Any]] = []
        raw_rows: List[Dict[str, Any]] = []

        try:
            from pysnmp.hlapi.asyncio import (
                SnmpEngine,
                CommunityData,
            )

            from app.infrastructure.discovery.snmp.transport import get_udp_transport, snmp_walk

            engine = SnmpEngine()
            auth_data = CommunityData(community, mpModel=1)  # SNMPv2c
            transport = await get_udp_transport(
                target_ip, port,
                timeout=self.timeout_seconds,
                retries=self.max_retries,
            )

            cdp_entries: Dict[str, Dict[str, Any]] = {}

            # Walk cdpCacheDeviceId (Remote Hostname / System)
            rows = await snmp_walk(engine, auth_data, transport, oids.CDP_CACHE_DEVICE_ID)
            for oid_str, val in rows:
                suffix = oid_str.replace(oids.CDP_CACHE_DEVICE_ID.strip("."), "").strip(".")
                cdp_entries.setdefault(suffix, {})["device_id"] = str(val)

            # Walk cdpCacheDevicePort (Remote Port)
            rows = await snmp_walk(engine, auth_data, transport, oids.CDP_CACHE_DEVICE_PORT)
            for oid_str, val in rows:
                suffix = oid_str.replace(oids.CDP_CACHE_DEVICE_PORT.strip("."), "").strip(".")
                cdp_entries.setdefault(suffix, {})["device_port"] = str(val)

            # Walk cdpCachePlatform (Remote Platform e.g. cisco 3850)
            rows = await snmp_walk(engine, auth_data, transport, oids.CDP_CACHE_PLATFORM)
            for oid_str, val in rows:
                suffix = oid_str.replace(oids.CDP_CACHE_PLATFORM.strip("."), "").strip(".")
                cdp_entries.setdefault(suffix, {})["platform"] = str(val)

            # Walk cdpCacheAddress (Remote IP)
            rows = await snmp_walk(engine, auth_data, transport, oids.CDP_CACHE_ADDRESS)
            for oid_str, val in rows:
                suffix = oid_str.replace(oids.CDP_CACHE_ADDRESS.strip("."), "").strip(".")
                try:
                    octets = val.asOctets() if hasattr(val, "asOctets") else bytes(val)
                    if len(octets) == 4:
                        ip_val = ".".join(str(b) for b in octets)
                    else:
                        ip_val = str(val)
                except Exception:
                    ip_val = str(val)
                cdp_entries.setdefault(suffix, {})["remote_ip"] = ip_val

            # Normalize gathered CDP entries
            for suffix, item in cdp_entries.items():
                parts = suffix.split(".")
                local_if_index = int(parts[0]) if len(parts) >= 1 and parts[0].isdigit() else None
                
                device_id = item.get("device_id") or ""
                device_port = item.get("device_port") or ""

                if device_id:
                    adjacency = NeighborAdjacency(
                        local_if_index=local_if_index,
                        local_interface_name=f"eth{local_if_index - 1}" if local_if_index else None,
                        remote_device_name=device_id,
                        remote_port_id=device_port,
                        remote_system_desc=item.get("platform"),
                        remote_management_ip=item.get("remote_ip"),
                        protocol="CDP",
                        confidence_weight=0.90,
                        raw_attributes={"suffix": suffix, **item},
                    )
                    neighbors.append(adjacency.model_dump())
                    raw_rows.append(item)

            normalized_result = DirectNeighborDiscoveryResult(
                ip_address=target_ip,
                lldp_enabled=False,
                cdp_enabled=len(neighbors) > 0,
                neighbors=[NeighborAdjacency(**n) for n in neighbors],
            )

            return ObservationDomain(
                source_type=ObservationSourceType.CDP,
                target=target_ip,
                observed_at=datetime.now(timezone.utc),
                raw_payload={"raw_entries_count": len(raw_rows), "entries": raw_rows},
                normalized_data=normalized_result.model_dump(),
                error=None,
            )

        except Exception as e:
            logger.warning(f"CDP collection failed for {target_ip}: {e}")
            return ObservationDomain(
                source_type=ObservationSourceType.CDP,
                target=target_ip,
                observed_at=datetime.now(timezone.utc),
                raw_payload={},
                normalized_data={"ip_address": target_ip, "cdp_enabled": False, "neighbors": []},
                error=f"CDP Exception: {str(e)}",
            )

