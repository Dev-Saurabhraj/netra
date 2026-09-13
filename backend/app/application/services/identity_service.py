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
        elif host.endswith("-1") or host.endswith(".1"):
            # Standard default gateway IP heuristic (e.g. 192.168.1.1, 10.0.0.1)
            device_type = DeviceType.ROUTER
        else:
            # Endpoints on access subnet
            device_type = DeviceType.HOST

        return vendor, device_type

    @staticmethod
    def classify_vendor_by_mac(mac: str) -> str:
        """Heuristic vendor classification based on IEEE MAC Organizationally Unique Identifier (OUI)."""
        if not mac:
            return "Generic"
        clean_mac = mac.lower().replace("-", ":").strip()
        oui_map = {
            # Virtualization & Cloud
            "00:50:56": "VMware",
            "00:0c:29": "VMware",
            "00:15:5d": "Microsoft Hyper-V",
            # Network Infrastructure
            "00:1a:2b": "Cisco",
            "00:00:0c": "Cisco",
            "48:8f:5a": "Cisco",
            "70:4f:57": "Cisco",
            "00:1c:10": "Cisco/Linksys",
            "c0:bf:a7": "Juniper",
            "00:10:db": "Juniper",
            "00:11:88": "Arista",
            "fc:ec:da": "TP-Link",
            "84:d8:1b": "TP-Link",
            "b0:be:76": "TP-Link",
            "14:cc:20": "TP-Link",
            "50:c7:bf": "TP-Link",
            "fc:9f:2a": "Zyxel",
            "ec:43:f6": "Zyxel",
            "40:4a:03": "Zyxel",
            "d8:3b:bf": "ASUS",
            "f4:34:f0": "ASUS",
            "20:e5:2a": "Netgear",
            "00:09:b0": "D-Link",
            "30:b5:c2": "D-Link",
            # Compute & Mobile Hardware
            "96:46:d1": "Intel/Workstation",
            "00:1e:67": "Intel",
            "e0:d5:5e": "Intel",
            "74:a2:e7": "Intel",
            "a0:c5:89": "Intel",
            "00:21:5a": "HP",
            "3c:52:82": "HP",
            "00:23:7d": "Dell",
            "00:26:b9": "Dell",
            "f8:bc:12": "Dell",
            "ac:de:48": "Apple",
            "3c:22:fb": "Apple",
            "f0:18:98": "Apple",
            "f0:2f:74": "Apple",
            "6c:8d:77": "Apple",
            "88:66:a5": "Apple",
            "28:d0:43": "AzureWave",
            "44:6d:57": "AzureWave",
            "a8:20:66": "Samsung",
            "b4:2e:99": "Samsung",
            "7c:10:c9": "Samsung",
            "48:2c:6a": "Realme/Oppo",
            "5c:e9:1e": "Realme/Oppo",
            "04:42:1a": "Xiaomi",
            "dc:a6:32": "Raspberry Pi",
            "b8:27:eb": "Raspberry Pi",
            "e4:5f:01": "Raspberry Pi",
            "24:0a:c4": "Espressif IoT",
            "30:ae:a4": "Espressif IoT",
        }
        for p, v in oui_map.items():
            if clean_mac.startswith(p):
                return v
        return "Generic"

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

    @staticmethod
    def resolve_dns_ptr(ip: str, dns_server: Optional[str] = None, timeout: float = 0.08) -> str:
        """
        Resolve device hostname via DNS PTR query (targeting local subnet gateway DNS or OS resolver).
        Returns clean hostname if resolved, or empty string.
        """
        import socket
        import struct

        parts = ip.split(".")
        if len(parts) != 4:
            return ""

        servers_to_try = []
        if dns_server:
            servers_to_try.append(dns_server)
        gateway = f"{parts[0]}.{parts[1]}.{parts[2]}.1"
        if gateway not in servers_to_try:
            servers_to_try.append(gateway)

        rev_name = f"{parts[3]}.{parts[2]}.{parts[1]}.{parts[0]}.in-addr.arpa"
        tid = 0x5A5A
        flags = 0x0100  # standard query with recursion desired
        header = struct.pack("!HHHHHH", tid, flags, 1, 0, 0, 0)
        qname = b"".join(bytes([len(p)]) + p.encode("ascii") for p in rev_name.split(".")) + b"\x00"
        question = qname + struct.pack("!HH", 12, 1)  # PTR, IN
        packet = header + question

        for srv in servers_to_try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(timeout)
            try:
                sock.sendto(packet, (srv, 53))
                resp, _ = sock.recvfrom(512)
                if len(resp) <= len(packet):
                    continue
                r_tid, r_flags, r_qd, r_an, r_ns, r_ar = struct.unpack("!HHHHHH", resp[:12])
                if r_an == 0:
                    continue
                offset = len(packet)
                if offset >= len(resp):
                    continue
                if (resp[offset] & 0xC0) == 0xC0:
                    offset += 2
                else:
                    while offset < len(resp) and resp[offset] != 0:
                        offset += 1 + resp[offset]
                    offset += 1
                if offset + 10 > len(resp):
                    continue
                rtype, rclass, rttl, rdlen = struct.unpack("!HHIH", resp[offset:offset+10])
                offset += 10
                if rtype == 12:  # PTR
                    labels = []
                    idx = offset
                    end_idx = offset + rdlen
                    while idx < min(end_idx, len(resp)):
                        b = resp[idx]
                        if b == 0:
                            break
                        if (b & 0xC0) == 0xC0:
                            ptr = struct.unpack("!H", resp[idx:idx+2])[0] & 0x3FFF
                            while ptr < len(resp) and resp[ptr] != 0:
                                l = resp[ptr]
                                if (l & 0xC0) == 0xC0:
                                    ptr = struct.unpack("!H", resp[ptr:ptr+2])[0] & 0x3FFF
                                    continue
                                labels.append(resp[ptr+1:ptr+1+l].decode("utf-8", errors="ignore"))
                                ptr += 1 + l
                            break
                        else:
                            labels.append(resp[idx+1:idx+1+b].decode("utf-8", errors="ignore"))
                            idx += 1 + b
                    if labels:
                        res = ".".join(labels).split(".")[0].strip()
                        if res and not res.startswith("ip-") and not res.replace(".", "-").startswith("node-"):
                            return res
            except Exception:
                pass
            finally:
                sock.close()

        return ""

    @classmethod
    def generate_friendly_hostname(
        cls,
        ip: str,
        vendor: str = "Generic",
        device_type: DeviceType = DeviceType.UNKNOWN,
        mac: Optional[str] = None,
        sys_name: Optional[str] = None,
    ) -> str:
        """
        Generate a human-friendly, identifiable hostname for a node.
        Priority:
          1. Valid SNMP sys_name (e.g. Cisco/Juniper/Arista lab nodes: R1-CoreRouter, SW1-DistSwitch)
          2. Reverse DNS / DHCP Option 12 Hostname (e.g. 'realme-P3-Ultra-5G', 'saurabhrajput', 'Som')
          3. Subnet Gateway / Router Heuristic (.1 or .254 or ROUTER) -> 'Zyxel-Gateway' or 'Gateway-Router'
          4. Vendor + Role + Last Octet (e.g. 'AzureWave-Host-4', 'Apple-Workstation-13')
          5. Private MAC heuristic (Mobile phone) -> 'Mobile-Client-13'
          6. Role Fallback -> 'Host-16' or 'Switch-1'
        """
        # 1. SNMP sys_name if meaningful
        if sys_name:
            clean_snmp = cls.normalize_hostname(sys_name)
            if clean_snmp and not clean_snmp.startswith("node-") and not clean_snmp.startswith("host-") and clean_snmp != "unknown-node":
                return clean_snmp

        # 2. DNS PTR / DHCP Client Name
        dns_name = cls.resolve_dns_ptr(ip)
        if dns_name:
            clean_dns = cls.normalize_hostname(dns_name)
            if clean_dns and not clean_dns.startswith("node-") and not clean_dns.startswith("host-") and clean_dns != "unknown-node":
                return clean_dns

        # Extract last octet
        parts = ip.split(".")
        last_octet = parts[-1] if len(parts) == 4 else ip.replace(".", "-")

        # 3. Gateway Heuristic (.1, .254, or ROUTER)
        is_gateway = (parts[-1] in ("1", "254")) or (device_type == DeviceType.ROUTER)
        if is_gateway:
            if vendor and vendor != "Generic":
                return f"{vendor}-Gateway"
            return "Gateway-Router"

        # 4. Vendor + Role Heuristic
        effective_vendor = vendor
        if (not effective_vendor or effective_vendor == "Generic") and mac:
            effective_vendor = cls.classify_vendor_by_mac(mac)

        if effective_vendor and effective_vendor != "Generic":
            clean_vendor = effective_vendor.split("/")[0].replace(" ", "")
            if device_type == DeviceType.SWITCH:
                return f"{clean_vendor}-Switch-{last_octet}"
            elif device_type == DeviceType.FIREWALL:
                return f"{clean_vendor}-Firewall-{last_octet}"
            elif device_type == DeviceType.ACCESS_POINT:
                return f"{clean_vendor}-AP-{last_octet}"
            elif device_type == DeviceType.SERVER:
                return f"{clean_vendor}-Server-{last_octet}"
            else:
                return f"{clean_vendor}-Host-{last_octet}"

        # 5. Private / Randomized MAC heuristic (typical of iOS / Android phones on Wi-Fi)
        if mac:
            clean_mac = mac.lower().replace("-", ":").strip()
            first_byte_str = clean_mac.split(":")[0]
            try:
                first_byte = int(first_byte_str, 16)
                if (first_byte & 0x02) != 0:  # Locally Administered MAC address
                    return f"Mobile-Client-{last_octet}"
            except Exception:
                pass

        # 6. Role Fallback
        if device_type == DeviceType.SWITCH:
            return f"Switch-{last_octet}"
        elif device_type == DeviceType.SERVER:
            return f"Server-{last_octet}"
        elif device_type == DeviceType.ACCESS_POINT:
            return f"AP-{last_octet}"
        else:
            return f"Host-{last_octet}"
