import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from app.infrastructure.discovery.base import DiscoveryCollector
from app.infrastructure.discovery.snmp import oids
from app.domain.entities.observation import ObservationDomain, ObservationSourceType
from app.domain.schemas.telemetry import ArpEntry
from app.core.logging import logger


class ArpCollector(DiscoveryCollector):
    """
    Asynchronous ARP Table Collector querying RFC 1213 / IP-MIB (ipNetToMediaTable).
    Extracts IP-to-MAC address resolution bindings from routers and Layer-3 switches.
    """

    async def collect(self, target_ip: str, credentials: Optional[Dict[str, Any]] = None) -> ObservationDomain:
        community = (credentials or {}).get("community", "public")
        port = int((credentials or {}).get("port", 161))

        arp_entries: List[Dict[str, Any]] = []

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

            # Map from (if_index, ip) -> entry details
            table_map: Dict[str, Dict[str, Any]] = {}

            # Walk ipNetToMediaPhysAddress (MAC)
            rows = await snmp_walk(engine, auth_data, transport, oids.IP_NET_TO_MEDIA_PHYS_ADDRESS)
            for oid_str, val in rows:
                suffix = oid_str.replace(oids.IP_NET_TO_MEDIA_PHYS_ADDRESS.strip("."), "").strip(".")
                parts = suffix.split(".")
                if len(parts) >= 5:
                    if_idx = int(parts[0])
                    ip_addr = ".".join(parts[1:5])
                    try:
                        raw_mac = val.asOctets() if hasattr(val, "asOctets") else bytes(val)
                        if raw_mac and len(raw_mac) == 6:
                            mac_str = ":".join(f"{b:02x}" for b in raw_mac)
                            key = f"{if_idx}_{ip_addr}"
                            table_map[key] = {
                                "if_index": if_idx,
                                "ip_address": ip_addr,
                                "mac_address": mac_str,
                                "entry_type": "dynamic",
                            }
                    except Exception:
                        pass

            # Walk ipNetToMediaType (Type: 1=other, 2=invalid, 3=dynamic, 4=static)
            rows = await snmp_walk(engine, auth_data, transport, oids.IP_NET_TO_MEDIA_TYPE)
            for oid_str, val in rows:
                suffix = oid_str.replace(oids.IP_NET_TO_MEDIA_TYPE.strip("."), "").strip(".")
                parts = suffix.split(".")
                if len(parts) >= 5:
                    if_idx = int(parts[0])
                    ip_addr = ".".join(parts[1:5])
                    key = f"{if_idx}_{ip_addr}"
                    try:
                        val_int = int(val)
                    except Exception:
                        val_int = 3
                    type_str = "dynamic" if val_int == 3 else ("static" if val_int == 4 else "other")
                    if key in table_map:
                        table_map[key]["entry_type"] = type_str

            for entry_data in table_map.values():
                entry = ArpEntry(
                    ip_address=entry_data["ip_address"],
                    mac_address=entry_data["mac_address"],
                    if_index=entry_data["if_index"],
                    interface_name=f"eth{entry_data['if_index'] - 1}",
                    entry_type=entry_data["entry_type"],
                )
                arp_entries.append(entry.model_dump())

            return ObservationDomain(
                source_type=ObservationSourceType.ARP,
                target=target_ip,
                observed_at=datetime.now(timezone.utc),
                raw_payload={"entries_count": len(arp_entries)},
                normalized_data={"target_ip": target_ip, "arp_entries": arp_entries},
                error=None,
            )

        except Exception as e:
            logger.warning(f"ARP table collection failed for {target_ip}: {e}")
            return ObservationDomain(
                source_type=ObservationSourceType.ARP,
                target=target_ip,
                observed_at=datetime.now(timezone.utc),
                raw_payload={},
                normalized_data={"target_ip": target_ip, "arp_entries": []},
                error=f"ARP Exception: {str(e)}",
            )

