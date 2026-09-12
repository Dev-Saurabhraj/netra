import asyncio
import time
import platform
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from app.infrastructure.discovery.base import DiscoveryCollector
from app.domain.entities.observation import ObservationDomain, ObservationSourceType


class IcmpCollector(DiscoveryCollector):
    """
    Asynchronous ICMP ping collector to measure reachability and round-trip latency.
    Important Rule: Reachability != Connectivity != Topology.
    """
    async def collect(self, target_ip: str, credentials: Optional[Dict[str, Any]] = None) -> ObservationDomain:
        start_time = time.time()
        is_windows = platform.system().lower() == "windows"
        
        # Build OS-specific ping command
        if is_windows:
            cmd = ["ping", "-n", "1", "-w", str(self.timeout_seconds * 1000), target_ip]
        else:
            cmd = ["ping", "-c", "1", "-W", str(self.timeout_seconds), target_ip]

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=self.timeout_seconds + 1)
            duration_ms = round((time.time() - start_time) * 1000, 2)

            is_reachable = (process.returncode == 0)
            if not is_reachable and target_ip in ("127.0.0.1", "::1", "localhost"):
                # Windows Firewall default rules often block inbound ICMP Echo even on 127.0.0.1
                is_reachable = True
                duration_ms = duration_ms or 0.1

            normalized = {
                "target_ip": target_ip,
                "reachable": is_reachable,
                "latency_ms": duration_ms if is_reachable else None,
            }

            return ObservationDomain(
                source_type=ObservationSourceType.ICMP,
                target=target_ip,
                observed_at=datetime.now(timezone.utc),
                raw_payload={
                    "stdout": stdout.decode(errors="ignore") if stdout else "",
                    "exit_code": process.returncode
                },
                normalized_data=normalized,
                error=None if is_reachable else "Host unreachable (ping timeout)",
            )
        except Exception as e:
            return ObservationDomain(
                source_type=ObservationSourceType.ICMP,
                target=target_ip,
                observed_at=datetime.now(timezone.utc),
                raw_payload={},
                normalized_data={"target_ip": target_ip, "reachable": False, "latency_ms": None},
                error=str(e),
            )

