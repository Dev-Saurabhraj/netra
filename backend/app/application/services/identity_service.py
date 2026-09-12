import re
from typing import Dict, Any, Tuple, Optional, List
from app.domain.entities.device import DeviceType, DeviceStatus


class IdentityResolutionService:
    """
    Strict device identity resolution, deduplication, and heuristic classification engine.
    Priority: Chassis ID > Stable MAC > Normalized Hostname > Management IP.
    """
    @staticmethod
    def classify_device(sys_descr: str, sys_object_id: str, hostname: str) -> Tuple[str, DeviceType]:
        """
        Classify vendor and device role based on SNMP sysDescr, sysObjectID, and hostname.
        """
        descr = (sys_descr or "").lower()
        oid = (sys_object_id or "").strip()
        host = (hostname or "").lower()

        # 1. Vendor Classification
        vendor = "Generic"
        if "cisco" in descr or oid.startswith("1.3.6.1.4.1.9.") or "ios" in descr:
            vendor = "Cisco"
        elif "juniper" in descr or oid.startswith("1.3.6.1.4.1.2636.") or "junos" in descr:
            vendor = "Juniper"
        elif "arista" in descr or oid.startswith("1.3.6.1.4.1.30065.") or "eos" in descr:
            vendor = "Arista"
        elif "fortinet" in descr or "fortigate" in descr or oid.startswith("1.3.6.1.4.1.12356."):
            vendor = "Fortinet"
        elif "mikrotik" in descr or "routeros" in descr or oid.startswith("1.3.6.1.4.1.14988."):
            vendor = "MikroTik"
        elif "hp" in descr or "procurve" in descr or "aruba" in descr or oid.startswith("1.3.6.1.4.1.11."):
            vendor = "Aruba/HP"
        elif "linux" in descr or "ubuntu" in descr or "debian" in descr or "centos" in descr or "redhat" in descr:
            vendor = "Linux"
        elif "windows" in descr or oid.startswith("1.3.6.1.4.1.311."):
            vendor = "Microsoft"

        # 2. Device Type Classification
        device_type = DeviceType.UNKNOWN

        if any(term in descr for term in ["c7200", "asr", "isr", "router", "routeros", "vyos"]) or re.search(r'\br\d+\b', host) or host.startswith("r-") or host.startswith("r_") or "router" in host:
            device_type = DeviceType.ROUTER
        elif any(term in descr for term in ["catalyst", "3850", "2960", "nexus", "switch", "procurve", "ex2200", "ex3300", "ex4200"]) or re.search(r'\bsw\d+\b', host) or host.startswith("sw-") or host.startswith("sw_") or "switch" in host:
            device_type = DeviceType.SWITCH
        elif any(term in descr for term in ["firewall", "fortigate", "asa", "paloalto", "pan-os", "pfsense", "srx"]) or "fw" in host or "firewall" in host:
            device_type = DeviceType.FIREWALL
        elif any(term in descr for term in ["access point", "aironet", "unifi", "wap"]) or re.search(r'\bap\d*\b', host) or host.startswith("ap-") or host.startswith("ap_"):
            device_type = DeviceType.ACCESS_POINT
        elif "host" in host or "workstation" in host or "pc" in host or "desktop" in host:
            device_type = DeviceType.HOST
        elif any(term in descr for term in ["server", "smp", "ubuntu", "debian", "redhat", "centos", "windows server"]) or "server" in host or "srv" in host:
            device_type = DeviceType.SERVER
        elif vendor == "Linux":
            device_type = DeviceType.SERVER

        return vendor, device_type

    @staticmethod
    def extract_stable_mac(interfaces: List[Dict[str, Any]]) -> Optional[str]:
        """
        Extract the first valid physical MAC address for deduplication.
        Ignores virtual, broadcast, multicast, and loopback MACs.
        """
        for iface in interfaces:
            mac = (iface.get("mac_address") or "").strip().lower()
            if mac and mac != "00:00:00:00:00:00" and not mac.startswith("01:00:5e") and not mac.startswith("ff:ff:ff:ff:ff:ff"):
                return mac
        return None

    @staticmethod
    def normalize_hostname(hostname: str) -> str:
        """Clean and normalize hostname."""
        if not hostname:
            return "unknown-node"
        # Strip domain suffix if present
        clean = hostname.split(".")[0].strip()
        return clean
