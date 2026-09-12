from typing import List, Tuple, Any
from pysnmp.hlapi.asyncio import *

async def get_udp_transport(target_ip: str, port: int = 161, timeout: int = 3, retries: int = 1):
    """
    Constructs a UdpTransportTarget safely across different pysnmp versions.
    """
    if hasattr(UdpTransportTarget, "create"):
        return await UdpTransportTarget.create((target_ip, port), timeout=timeout, retries=retries)
    return UdpTransportTarget((target_ip, port), timeout=timeout, retries=retries)

async def snmp_walk(engine, auth_data, transport, root_oid: str) -> List[Tuple[str, Any]]:
    """
    Iteratively walks an OID tree using nextCmd and returns a list of (oid_str, pyasn1_value).
    """
    results: List[Tuple[str, Any]] = []
    current_oid = ObjectIdentity(root_oid)
    clean_root = root_oid.strip(".")
    while True:
        try:
            errorIndication, errorStatus, errorIndex, varBindTable = await nextCmd(
                engine, auth_data, transport, ContextData(),
                ObjectType(current_oid),
                lexicographicMode=False
            )
        except Exception:
            break

        if errorIndication or errorStatus or not varBindTable:
            break
        
        varBinds = varBindTable[0] if isinstance(varBindTable[0], (list, tuple)) else varBindTable
        stop = False
        for varBind in varBinds:
            oid_str = str(varBind[0]).strip(".")
            if not oid_str.startswith(clean_root):
                stop = True
                break
            results.append((oid_str, varBind[1]))
            current_oid = varBind[0]
        if stop or not varBinds:
            break
    return results

