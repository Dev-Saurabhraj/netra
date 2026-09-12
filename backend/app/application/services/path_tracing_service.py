import collections
from typing import Dict, Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.logging import logger
from app.infrastructure.database.models.device import Device
from app.infrastructure.database.models.topology import Link, LinkStatus


class PathTracingService:
    """
    End-to-End L2/L3 Network Path Tracer.
    Traverses active evidence-correlated links using breadth-first shortest path search
    to determine the forwarding path between any two network devices with hop-by-hop interface telemetry.
    """
    def __init__(self, db: AsyncSession):
        self.db = db

    async def trace_path(self, source_device_id: str, destination_device_id: str) -> Dict[str, Any]:
        """
        Trace forwarding route between source and destination devices.
        Returns:
            - found (bool)
            - total_hops (int)
            - path_nodes (list)
            - path_edges (list of link IDs)
            - hops (detailed step-by-step hop diagnostics)
            - bottleneck_confidence (float)
        """
        # 1. Fetch Source and Destination Devices
        dev_res = await self.db.execute(
            select(Device).where(Device.id.in_([source_device_id, destination_device_id]))
        )
        devices = {d.id: d for d in dev_res.scalars().all()}

        source_dev = devices.get(source_device_id)
        dest_dev = devices.get(destination_device_id)

        if not source_dev:
            raise ValueError(f"Source device '{source_device_id}' not found.")
        if not dest_dev:
            raise ValueError(f"Destination device '{destination_device_id}' not found.")

        # Trivial path: same device
        if source_device_id == destination_device_id:
            return {
                "found": True,
                "status": "SAME_NODE",
                "total_hops": 0,
                "path_nodes": [{
                    "id": source_dev.id,
                    "label": source_dev.hostname,
                    "ip": source_dev.management_ip,
                    "type": source_dev.device_type.value,
                    "vendor": source_dev.vendor,
                }],
                "path_edges": [],
                "hops": [],
                "bottleneck_confidence": 1.0,
            }

        # 2. Fetch all Active Links with Devices and Interfaces eager-loaded
        link_query = select(Link).where(
            Link.status == LinkStatus.ACTIVE
        ).options(
            selectinload(Link.source_device),
            selectinload(Link.destination_device),
            selectinload(Link.source_interface),
            selectinload(Link.destination_interface),
        )
        link_res = await self.db.execute(link_query)
        active_links = link_res.scalars().all()

        # 3. Build Bidirectional Graph Adjacency List
        adj: Dict[str, List[Dict[str, Any]]] = collections.defaultdict(list)
        for link in active_links:
            src_id = link.source_device_id
            dst_id = link.destination_device_id

            # Forward direction
            adj[src_id].append({
                "neighbor_id": dst_id,
                "neighbor_dev": link.destination_device,
                "link": link,
                "egress_port": link.source_interface.name if link.source_interface else "N/A",
                "ingress_port": link.destination_interface.name if link.destination_interface else "N/A",
            })
            # Reverse direction
            adj[dst_id].append({
                "neighbor_id": src_id,
                "neighbor_dev": link.source_device,
                "link": link,
                "egress_port": link.destination_interface.name if link.destination_interface else "N/A",
                "ingress_port": link.source_interface.name if link.source_interface else "N/A",
            })

        # 4. Breadth-First Search (BFS) to find shortest path
        queue = collections.deque([(source_device_id, [])])
        visited = {source_device_id}

        found_hops: Optional[List[Dict[str, Any]]] = None

        while queue:
            curr_id, path_so_far = queue.popleft()

            if curr_id == destination_device_id:
                found_hops = path_so_far
                break

            for edge in adj.get(curr_id, []):
                nxt_id = edge["neighbor_id"]
                if nxt_id not in visited:
                    visited.add(nxt_id)
                    new_step = {
                        "from_device_id": curr_id,
                        "to_device_id": nxt_id,
                        "egress_port": edge["egress_port"],
                        "ingress_port": edge["ingress_port"],
                        "link": edge["link"],
                    }
                    queue.append((nxt_id, path_so_far + [new_step]))

        if found_hops is None:
            return {
                "found": False,
                "status": "UNREACHABLE",
                "total_hops": 0,
                "path_nodes": [],
                "path_edges": [],
                "hops": [],
                "bottleneck_confidence": 0.0,
            }

        # 5. Construct Detailed Hop Diagnostic Sequence
        hops = []
        path_nodes = [{
            "id": source_dev.id,
            "label": source_dev.hostname,
            "ip": source_dev.management_ip,
            "type": source_dev.device_type.value,
            "vendor": source_dev.vendor,
        }]
        path_edges = []
        min_confidence = 1.0

        for idx, step in enumerate(found_hops, start=1):
            lnk: Link = step["link"]
            path_edges.append(lnk.id)
            if lnk.confidence < min_confidence:
                min_confidence = lnk.confidence

            # Get source & dest node objects for this hop
            from_dev = lnk.source_device if lnk.source_device_id == step["from_device_id"] else lnk.destination_device
            to_dev = lnk.destination_device if lnk.destination_device_id == step["to_device_id"] else lnk.source_device

            hops.append({
                "hop_number": idx,
                "from_device": {
                    "id": from_dev.id,
                    "label": from_dev.hostname,
                    "ip": from_dev.management_ip,
                    "type": from_dev.device_type.value,
                },
                "to_device": {
                    "id": to_dev.id,
                    "label": to_dev.hostname,
                    "ip": to_dev.management_ip,
                    "type": to_dev.device_type.value,
                },
                "egress_port": step["egress_port"],
                "ingress_port": step["ingress_port"],
                "link_id": lnk.id,
                "confidence": lnk.confidence,
                "confidence_percent": int(lnk.confidence * 100),
                "methods": lnk.discovery_methods,
            })

            path_nodes.append({
                "id": to_dev.id,
                "label": to_dev.hostname,
                "ip": to_dev.management_ip,
                "type": to_dev.device_type.value,
                "vendor": to_dev.vendor,
            })

        return {
            "found": True,
            "status": "PATH_FOUND",
            "total_hops": len(hops),
            "path_nodes": path_nodes,
            "path_edges": path_edges,
            "hops": hops,
            "bottleneck_confidence": round(min_confidence, 2),
        }

