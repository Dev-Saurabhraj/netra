import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from app.infrastructure.discovery.base import DiscoveryCollector
from app.infrastructure.discovery.snmp import oids
from app.domain.entities.observation import ObservationDomain, ObservationSourceType
from app.domain.schemas.telemetry import MacTableEntry
from app.core.logging import logger
from app.infrastructure.discovery.snmp.transport import get_udp_transport, snmp_walk


class MacTableCollector(DiscoveryCollector):
    """
    Asynchronous Switch Forwarding Database (FDB) MAC Collector querying BRIDGE-MIB (RFC 1493).
    Extracts Layer-2 switch port-to-MAC associations.
    Asynchronous SNMP Bridge MIB (dot1dTpFdbTable) collector.
    Extracts Layer-2 MAC address forwarding tables to identify which physical switch
    ports learned specific endpoint MAC addresses.
    """

    async def collect(self, target_ip: str, credentials: Optional[Dict[str, Any]] = None) -> ObservationDomain:
        community = (credentials or {}).get("community", "public")
        port = int((credentials or {}).get("port", 161))

        mac_entries: List[Dict[str, Any]] = []

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

            # 1. Walk dot1dBasePortIfIndex to map Bridge Port -> ifIndex
            port_to_ifindex: Dict[int, int] = {}
            rows = await snmp_walk(engine, auth_data, transport, oids.DOT1D_BASE_PORT_IF_INDEX)
            for oid_str, val in rows:
                suffix = oid_str.replace(oids.DOT1D_BASE_PORT_IF_INDEX.strip("."), "").strip(".")
                if suffix.isdigit():
                    try:
                        port_to_ifindex[int(suffix)] = int(val)
                    except Exception:
                        pass

            # 2. Walk dot1dTpFdbPort (Bridge Port where MAC was learned)
            fdb_map: Dict[str, Dict[str, Any]] = {}
            rows = await snmp_walk(engine, auth_data, transport, oids.DOT1D_TP_FDB_PORT)
            for oid_str, val in rows:
                suffix = oid_str.replace(oids.DOT1D_TP_FDB_PORT.strip("."), "").strip(".")
                parts = suffix.split(".")
                if len(parts) >= 6:
                    try:
                        mac_str = ":".join(f"{int(p):02x}" for p in parts[:6])
                        b_port = int(val)
                        if b_port > 0:
                            fdb_map[mac_str] = {
                                "mac_address": mac_str,
                                "bridge_port": b_port,
                                "if_index": port_to_ifindex.get(b_port, b_port),
                                "status": "learned",
                            }
                    except Exception:
                        continue

            # 3. Walk dot1dTpFdbStatus (1=other, 2=invalid, 3=learned, 4=self, 5=mgmt)
            rows = await snmp_walk(engine, auth_data, transport, oids.DOT1D_TP_FDB_STATUS)
            for oid_str, val in rows:
                suffix = oid_str.replace(oids.DOT1D_TP_FDB_STATUS.strip("."), "").strip(".")
                parts = suffix.split(".")
                if len(parts) >= 6:
                    try:
                        mac_str = ":".join(f"{int(p):02x}" for p in parts[:6])
                        val_int = int(val)
                        status_name = "learned" if val_int == 3 else ("self" if val_int == 4 else ("mgmt" if val_int == 5 else "other"))
                        if mac_str in fdb_map:
                            fdb_map[mac_str]["status"] = status_name
                    except Exception:
                        continue

            for m_data in fdb_map.values():
                entry = MacTableEntry(
                    mac_address=m_data["mac_address"],
                    port_index=m_data["if_index"],
                    port_name=f"eth{m_data['if_index'] - 1}",
                    status=m_data["status"],
                )
                mac_entries.append(entry.model_dump())

            return ObservationDomain(
                source_type=ObservationSourceType.MAC_TABLE,
                target=target_ip,
                observed_at=datetime.now(timezone.utc),
                raw_payload={"entries_count": len(mac_entries)},
                normalized_data={"target_ip": target_ip, "mac_entries": mac_entries},
                error=None,
            )

        except Exception as e:
            logger.warning(f"MAC FDB table collection failed for {target_ip}: {e}")
            return ObservationDomain(
                source_type=ObservationSourceType.MAC_TABLE,
                target=target_ip,
                observed_at=datetime.now(timezone.utc),
                raw_payload={},
                normalized_data={"target_ip": target_ip, "mac_entries": []},
                error=f"MAC Table Exception: {str(e)}",
            )

