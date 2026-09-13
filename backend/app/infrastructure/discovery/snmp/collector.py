import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from app.infrastructure.discovery.base import DiscoveryCollector
from app.infrastructure.discovery.snmp import oids
from app.domain.entities.observation import ObservationDomain, ObservationSourceType
from app.core.logging import logger


class SnmpCollector(DiscoveryCollector):
    """
    Asynchronous SNMP Collector pulling MIB-II system information and interface tables.
    """
    async def collect(self, target_ip: str, credentials: Optional[Dict[str, Any]] = None) -> ObservationDomain:
        community = (credentials or {}).get("community", "public")
        port = int((credentials or {}).get("port", 161))

        try:
            from pysnmp.hlapi.asyncio import (
                getCmd,
                SnmpEngine,
                CommunityData,
                ContextData,
                ObjectType,
                ObjectIdentity,
            )

            from app.infrastructure.discovery.snmp.transport import get_udp_transport

            engine = SnmpEngine()
            auth_data = CommunityData(community, mpModel=1)  # SNMPv2c
            transport = await get_udp_transport(
                target_ip, port,
                timeout=self.timeout_seconds,
                retries=self.max_retries
            )

            # 1. Fetch System Info (Scalar OIDs)
            errorIndication, errorStatus, errorIndex, varBinds = await getCmd(
                engine,
                auth_data,
                transport,
                ContextData(),
                ObjectType(ObjectIdentity(oids.SYS_NAME)),
                ObjectType(ObjectIdentity(oids.SYS_DESCR)),
                ObjectType(ObjectIdentity(oids.SYS_OBJECT_ID)),
                ObjectType(ObjectIdentity(oids.SYS_UPTIME)),
            )

            if errorIndication or errorStatus:
                err_msg = str(errorIndication or errorStatus.prettyPrint())
                return ObservationDomain(
                    source_type=ObservationSourceType.SNMP,
                    target=target_ip,
                    observed_at=datetime.now(timezone.utc),
                    raw_payload={},
                    normalized_data={},
                    error=f"SNMP Query Failed: {err_msg}",
                )

            sys_name = str(varBinds[0][1]) if len(varBinds) > 0 else f"node-{target_ip.replace('.', '-')}"
            sys_descr = str(varBinds[1][1]) if len(varBinds) > 1 else ""
            sys_object_id = str(varBinds[2][1]) if len(varBinds) > 2 else ""
            sys_uptime = int(varBinds[3][1]) if len(varBinds) > 3 and varBinds[3][1].hasValue() else 0

            # 2. Fetch Interface Table Walk
            interfaces = await self._walk_interfaces(engine, auth_data, transport)

            normalized = {
                "target_ip": target_ip,
                "sys_name": sys_name,
                "sys_descr": sys_descr,
                "sys_object_id": sys_object_id,
                "sys_uptime": sys_uptime,
                "interfaces": interfaces,
            }

            return ObservationDomain(
                source_type=ObservationSourceType.SNMP,
                target=target_ip,
                observed_at=datetime.now(timezone.utc),
                raw_payload={"sys_name": sys_name, "interface_count": len(interfaces)},
                normalized_data=normalized,
                error=None,
            )

        except Exception as e:
            return ObservationDomain(
                source_type=ObservationSourceType.SNMP,
                target=target_ip,
                observed_at=datetime.now(timezone.utc),
                raw_payload={},
                normalized_data={},
                error=f"SNMP Exception: {str(e)}",
            )

    async def _walk_interfaces(self, engine, auth_data, transport) -> List[Dict[str, Any]]:
        """Walk IF-MIB interface tables."""
        from app.infrastructure.discovery.snmp.transport import snmp_walk

        interfaces_map = {}

        try:
            # Walk ifDescr
            descr_rows = await snmp_walk(engine, auth_data, transport, oids.IF_DESCR_ENTRY)
            for oid_str, val in descr_rows:
                idx = int(oid_str.split(".")[-1])
                val_str = str(val).strip()
                interfaces_map[idx] = {
                    "if_index": idx,
                    "name": val_str if val_str and not val_str.startswith("0x") else f"eth{idx-1}",
                    "description": val_str,
                    "admin_status": "UP",
                    "oper_status": "UP"
                }

            # Walk ifName (RFC 2863) to get canonical port names (e.g., ge-0/0/1, GigabitEthernet0/1)
            try:
                name_rows = await snmp_walk(engine, auth_data, transport, oids.IF_NAME_ENTRY)
                for oid_str, val in name_rows:
                    idx = int(oid_str.split(".")[-1])
                    val_str = str(val).strip()
                    if idx in interfaces_map and val_str:
                        interfaces_map[idx]["name"] = val_str
            except Exception:
                pass

            # Walk ifOperStatus
            oper_rows = await snmp_walk(engine, auth_data, transport, oids.IF_OPER_STATUS_ENTRY)
            for oid_str, val in oper_rows:
                idx = int(oid_str.split(".")[-1])
                try:
                    oper_val = int(val)
                except Exception:
                    oper_val = 1
                if idx in interfaces_map:
                    interfaces_map[idx]["oper_status"] = "UP" if oper_val == 1 else "DOWN"

            # Walk ifAdminStatus
            admin_rows = await snmp_walk(engine, auth_data, transport, oids.IF_ADMIN_STATUS_ENTRY)
            for oid_str, val in admin_rows:
                idx = int(oid_str.split(".")[-1])
                try:
                    admin_val = int(val)
                except Exception:
                    admin_val = 1
                if idx in interfaces_map:
                    interfaces_map[idx]["admin_status"] = "UP" if admin_val == 1 else "DOWN"

            # Walk ifPhysAddress (MAC Address)
            phys_rows = await snmp_walk(engine, auth_data, transport, oids.IF_PHYS_ADDRESS_ENTRY)
            for oid_str, val in phys_rows:
                idx = int(oid_str.split(".")[-1])
                try:
                    raw_mac = val.asOctets() if hasattr(val, "asOctets") else bytes(val)
                    if raw_mac and len(raw_mac) == 6:
                        mac_str = ":".join(f"{b:02x}" for b in raw_mac)
                        if idx in interfaces_map:
                            interfaces_map[idx]["mac_address"] = mac_str
                except Exception:
                    pass

        except Exception as walk_err:
            logger.warning(f"Error during SNMP interface walk: {walk_err}")

        return list(interfaces_map.values())

