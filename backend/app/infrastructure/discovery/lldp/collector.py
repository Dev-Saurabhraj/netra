import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from app.infrastructure.discovery.base import DiscoveryCollector
from app.infrastructure.discovery.snmp import oids
from app.domain.entities.observation import ObservationDomain, ObservationSourceType
from app.domain.schemas.neighbor import NeighborAdjacency, DirectNeighborDiscoveryResult
from app.core.logging import logger
from app.infrastructure.discovery.snmp.transport import get_udp_transport, snmp_walk


class LldpCollector(DiscoveryCollector):
    """
    Asynchronous LLDP Collector querying IEEE 802.1AB LLDP-MIB (lldpRemTable).
    Discovers Layer-2 neighbor adjacencies, remote chassis IDs, and remote port IDs.
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

            # Table walk on LLDP remote table
            rem_entries: Dict[str, Dict[str, Any]] = {}

            # Walk lldpRemSysName
            rows = await snmp_walk(engine, auth_data, transport, oids.LLDP_REM_SYS_NAME)
            for oid_str, val in rows:
                suffix = oid_str.replace(oids.LLDP_REM_SYS_NAME.strip("."), "").strip(".")
                rem_entries.setdefault(suffix, {})["remote_sys_name"] = str(val)

            # Walk lldpRemChassisId
            rows = await snmp_walk(engine, auth_data, transport, oids.LLDP_REM_CHASSIS_ID)
            for oid_str, val in rows:
                suffix = oid_str.replace(oids.LLDP_REM_CHASSIS_ID.strip("."), "").strip(".")
                try:
                    octets = val.asOctets() if hasattr(val, "asOctets") else bytes(val)
                    if len(octets) == 6:
                        chassis_val = ":".join(f"{b:02x}" for b in octets)
                    else:
                        chassis_val = str(val)
                except Exception:
                    chassis_val = str(val)
                rem_entries.setdefault(suffix, {})["remote_chassis_id"] = chassis_val

            # Walk lldpRemPortId
            rows = await snmp_walk(engine, auth_data, transport, oids.LLDP_REM_PORT_ID)
            for oid_str, val in rows:
                suffix = oid_str.replace(oids.LLDP_REM_PORT_ID.strip("."), "").strip(".")
                rem_entries.setdefault(suffix, {})["remote_port_id"] = str(val)

            # Walk lldpRemPortDesc
            rows = await snmp_walk(engine, auth_data, transport, oids.LLDP_REM_PORT_DESC)
            for oid_str, val in rows:
                suffix = oid_str.replace(oids.LLDP_REM_PORT_DESC.strip("."), "").strip(".")
                rem_entries.setdefault(suffix, {})["remote_port_desc"] = str(val)

            # Walk lldpRemSysDesc
            rows = await snmp_walk(engine, auth_data, transport, oids.LLDP_REM_SYS_DESC)
            for oid_str, val in rows:
                suffix = oid_str.replace(oids.LLDP_REM_SYS_DESC.strip("."), "").strip(".")
                rem_entries.setdefault(suffix, {})["remote_sys_desc"] = str(val)

            # Normalize gathered LLDP entries
            for suffix, item in rem_entries.items():
                parts = suffix.split(".")
                local_port_num = int(parts[1]) if len(parts) >= 2 and parts[1].isdigit() else None
                
                remote_name = item.get("remote_sys_name") or ""
                remote_chassis = item.get("remote_chassis_id") or ""
                remote_port = item.get("remote_port_id") or item.get("remote_port_desc") or ""

                if remote_name or remote_chassis:
                    adjacency = NeighborAdjacency(
                        local_if_index=local_port_num,
                        local_interface_name=f"eth{local_port_num - 1}" if local_port_num else None,
                        remote_device_name=remote_name,
                        remote_chassis_id=remote_chassis,
                        remote_port_id=remote_port,
                        remote_port_desc=item.get("remote_port_desc"),
                        remote_system_desc=item.get("remote_sys_desc"),
                        protocol="LLDP",
                        confidence_weight=0.95,
                        raw_attributes={"suffix": suffix, **item},
                    )
                    neighbors.append(adjacency.model_dump())
                    raw_rows.append(item)

            normalized_result = DirectNeighborDiscoveryResult(
                ip_address=target_ip,
                lldp_enabled=len(neighbors) > 0,
                cdp_enabled=False,
                neighbors=[NeighborAdjacency(**n) for n in neighbors],
            )

            return ObservationDomain(
                source_type=ObservationSourceType.LLDP,
                target=target_ip,
                observed_at=datetime.now(timezone.utc),
                raw_payload={"raw_entries_count": len(raw_rows), "entries": raw_rows},
                normalized_data=normalized_result.model_dump(),
                error=None,
            )

        except Exception as e:
            logger.warning(f"LLDP collection failed for {target_ip}: {e}")
            return ObservationDomain(
                source_type=ObservationSourceType.LLDP,
                target=target_ip,
                observed_at=datetime.now(timezone.utc),
                raw_payload={},
                normalized_data={"ip_address": target_ip, "lldp_enabled": False, "neighbors": []},
                error=f"LLDP Exception: {str(e)}",
            )

