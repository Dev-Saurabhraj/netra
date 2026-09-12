from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.logging import logger
from app.infrastructure.database.models import (
    Device,
    Link,
    Event,
    TopologySnapshot,
    AuditLog,
)
from app.domain.entities.link import LinkStatus
from app.domain.entities.device import DeviceStatus
from app.domain.entities.event import EventType, EventSeverity


class ChangeDetectionService:
    """
    Differential Graph & Telemetry Engine.
    Detects topology changes, device reachability shifts, severed links, and recovery events.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def detect_changes(
        self,
        current_snapshot: TopologySnapshot,
        previous_snapshot: Optional[TopologySnapshot] = None,
    ) -> List[Event]:
        """
        Compare current topology snapshot against the previous snapshot.
        Generates and persists typed network events with before/after diffs.
        """
        generated_events: List[Event] = []

        if not previous_snapshot:
            logger.info("First topology snapshot recorded — no prior baseline to diff.")
            return generated_events

        curr_data = current_snapshot.graph_data or {}
        prev_data = previous_snapshot.graph_data or {}

        curr_nodes: Dict[str, Dict[str, Any]] = {n["data"]["id"]: n["data"] for n in curr_data.get("nodes", [])}
        prev_nodes: Dict[str, Dict[str, Any]] = {n["data"]["id"]: n["data"] for n in prev_data.get("nodes", [])}

        curr_edges: Dict[str, Dict[str, Any]] = {e["data"]["id"]: e["data"] for e in curr_data.get("edges", [])}
        prev_edges: Dict[str, Dict[str, Any]] = {e["data"]["id"]: e["data"] for e in prev_data.get("edges", [])}

        # -------------------------------------------------------------
        # 1. Device Diffs
        # -------------------------------------------------------------
        # New Devices
        for dev_id, n_data in curr_nodes.items():
            if dev_id not in prev_nodes:
                event = Event(
                    event_type=EventType.NEW_DEVICE,
                    severity=EventSeverity.INFO,
                    device_id=dev_id,
                    title=f"New Network Node: {n_data.get('label')}",
                    description=f"Device {n_data.get('label')} ({n_data.get('ip')}) added to topology graph.",
                    new_state=n_data,
                )
                self.db.add(event)
                generated_events.append(event)

        # Device Status Changes (Online / Offline)
        for dev_id, prev_node in prev_nodes.items():
            if dev_id in curr_nodes:
                curr_node = curr_nodes[dev_id]
                prev_st = prev_node.get("status")
                curr_st = curr_node.get("status")

                if prev_st == DeviceStatus.ONLINE.value and curr_st == DeviceStatus.OFFLINE.value:
                    event = Event(
                        event_type=EventType.DEVICE_DOWN,
                        severity=EventSeverity.CRITICAL,
                        device_id=dev_id,
                        title=f"Node Unreachable: {curr_node.get('label')}",
                        description=f"Device at {curr_node.get('ip')} became unreachable.",
                        previous_state={"status": prev_st},
                        new_state={"status": curr_st},
                    )
                    self.db.add(event)
                    generated_events.append(event)

                elif prev_st == DeviceStatus.OFFLINE.value and curr_st == DeviceStatus.ONLINE.value:
                    event = Event(
                        event_type=EventType.DEVICE_RECOVERED,
                        severity=EventSeverity.INFO,
                        device_id=dev_id,
                        title=f"Node Restored: {curr_node.get('label')}",
                        description=f"Device at {curr_node.get('ip')} returned online.",
                        previous_state={"status": prev_st},
                        new_state={"status": curr_st},
                    )
                    self.db.add(event)
                    generated_events.append(event)

        # -------------------------------------------------------------
        # 2. Edge / Link Diffs
        # -------------------------------------------------------------
        # New Links Added
        for edge_id, e_data in curr_edges.items():
            if edge_id not in prev_edges:
                event = Event(
                    event_type=EventType.LINK_ADDED,
                    severity=EventSeverity.INFO,
                    link_id=edge_id,
                    title=f"Adjacency Established: {e_data.get('source_label')} ↔ {e_data.get('target_label')}",
                    description=f"New link discovered via {', '.join(e_data.get('methods', []))} with {e_data.get('confidence_percent')}% confidence.",
                    new_state=e_data,
                )
                self.db.add(event)
                generated_events.append(event)

        # Links Removed or Down
        for edge_id, prev_edge in prev_edges.items():
            if edge_id not in curr_edges:
                event = Event(
                    event_type=EventType.LINK_REMOVED,
                    severity=EventSeverity.WARNING,
                    link_id=edge_id,
                    title=f"Adjacency Lost: {prev_edge.get('source_label')} ↔ {prev_edge.get('target_label')}",
                    description=f"Physical connection between {prev_edge.get('source_label')} and {prev_edge.get('target_label')} is no longer observed.",
                    previous_state=prev_edge,
                    new_state={"status": "DOWN"},
                )
                self.db.add(event)
                generated_events.append(event)

        if generated_events:
            await self.db.commit()
            logger.info(f"Change detection emitted {len(generated_events)} new topology events.")

        return generated_events

