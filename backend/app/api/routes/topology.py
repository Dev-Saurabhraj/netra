from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.infrastructure.database.session import get_db
from app.infrastructure.database.models.device import Device
from app.infrastructure.database.models.topology import Link, TopologySnapshot
from app.infrastructure.database.models.interface import Interface
from app.api.dependencies import get_current_user
from app.infrastructure.database.models.user import User

router = APIRouter(prefix="/topology", tags=["Topology"])


@router.get("", response_model=dict)
async def get_current_topology(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get current network topology formatted for Cytoscape.js graph rendering.
    Returns:
      - nodes (devices with status, type, interface count)
      - edges (links with confidence score, evidence provenance, source/target ports)
    """
    # Fetch all devices
    dev_query = select(Device).options(selectinload(Device.interfaces))
    dev_res = await db.execute(dev_query)
    devices = dev_res.scalars().all()

    # Fetch all active/degraded links
    link_query = select(Link).options(
        selectinload(Link.source_device),
        selectinload(Link.destination_device),
        selectinload(Link.source_interface),
        selectinload(Link.destination_interface),
    )
    link_res = await db.execute(link_query)
    links = link_res.scalars().all()

    nodes = []
    for d in devices:
        nodes.append({
            "data": {
                "id": d.id,
                "label": d.hostname,
                "ip": d.management_ip,
                "mac": d.mac_address,
                "device_type": d.device_type.value,
                "vendor": d.vendor,
                "model": d.model,
                "status": d.status.value,
                "interface_count": len(d.interfaces),
                "last_seen": d.last_seen.isoformat() if d.last_seen else None,
            }
        })

    edges = []
    for l in links:
        source_port = l.source_interface.name if l.source_interface else "port"
        dest_port = l.destination_interface.name if l.destination_interface else "port"

        edges.append({
            "data": {
                "id": l.id,
                "source": l.source_device_id,
                "target": l.destination_device_id,
                "source_port": source_port,
                "target_port": dest_port,
                "confidence": l.confidence,
                "confidence_percent": round(l.confidence * 100, 1),
                "status": l.status.value,
                "discovery_methods": l.discovery_methods,
                "evidence": l.evidence,
                "last_seen": l.last_seen.isoformat() if l.last_seen else None,
            }
        })

    return {
        "data": {
            "nodes": nodes,
            "edges": edges,
            "summary": {
                "total_devices": len(nodes),
                "total_links": len(edges),
            }
        },
        "meta": {}
    }


@router.get("/snapshots", response_model=dict)
async def list_snapshots(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List historical topology snapshots.
    """
    query = select(TopologySnapshot).order_by(TopologySnapshot.created_at.desc()).offset(skip).limit(limit)
    res = await db.execute(query)
    snapshots = res.scalars().all()

    snapshot_list = []
    for s in snapshots:
        snapshot_list.append({
            "id": s.id,
            "discovery_run_id": s.discovery_run_id,
            "node_count": s.node_count,
            "edge_count": s.edge_count,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })

    return {"data": snapshot_list, "meta": {"total": len(snapshot_list)}}

