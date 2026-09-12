from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
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


@router.get("/snapshots/{snapshot_id}", response_model=dict)
async def get_snapshot(
    snapshot_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get full graph data for a specific historical topology snapshot."""
    res = await db.execute(select(TopologySnapshot).where(TopologySnapshot.id == snapshot_id))
    snapshot = res.scalars().first()
    if not snapshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "SNAPSHOT_NOT_FOUND", "message": "Topology snapshot not found"}},
        )

    return {
        "data": {
            "id": snapshot.id,
            "discovery_run_id": snapshot.discovery_run_id,
            "node_count": snapshot.node_count,
            "edge_count": snapshot.edge_count,
            "created_at": snapshot.created_at.isoformat() if snapshot.created_at else None,
            "graph": snapshot.graph_data,
        },
        "meta": {}
    }


@router.get("/snapshots/{snapshot_id}/diff", response_model=dict)
async def get_snapshot_diff(
    snapshot_id: str,
    compare_to: Optional[str] = Query(None, description="Optional target snapshot ID to compare against."),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Compute graph differential between two topology snapshots.
    Returns added, removed, and modified nodes/edges, and an annotated diff_graph.
    """
    res = await db.execute(select(TopologySnapshot).where(TopologySnapshot.id == snapshot_id))
    target_snap = res.scalars().first()
    if not target_snap:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "SNAPSHOT_NOT_FOUND", "message": "Target topology snapshot not found"}},
        )

    base_snap = None
    if compare_to:
        b_res = await db.execute(select(TopologySnapshot).where(TopologySnapshot.id == compare_to))
        base_snap = b_res.scalars().first()
        if not base_snap:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": {"code": "SNAPSHOT_NOT_FOUND", "message": "Base topology snapshot for comparison not found"}},
            )
    else:
        prev_res = await db.execute(
            select(TopologySnapshot)
            .where(TopologySnapshot.created_at < target_snap.created_at)
            .order_by(TopologySnapshot.created_at.desc())
            .limit(1)
        )
        base_snap = prev_res.scalars().first()

    target_nodes = (target_snap.graph_data or {}).get("nodes", [])
    target_edges = (target_snap.graph_data or {}).get("edges", [])

    base_nodes = (base_snap.graph_data or {}).get("nodes", []) if base_snap else []
    base_edges = (base_snap.graph_data or {}).get("edges", []) if base_snap else []

    target_node_map = {n["data"]["id"]: n["data"] for n in target_nodes}
    base_node_map = {n["data"]["id"]: n["data"] for n in base_nodes}

    added_nodes = []
    removed_nodes = []
    modified_nodes = []
    diff_nodes = []

    for nid, ndata in target_node_map.items():
        if nid not in base_node_map:
            added_nodes.append(ndata)
            diff_nodes.append({
                "group": "nodes",
                "data": {**ndata, "diff_status": "added"}
            })
        else:
            base_data = base_node_map[nid]
            if base_data.get("status") != ndata.get("status"):
                modified_nodes.append({
                    "id": nid,
                    "old_status": base_data.get("status"),
                    "new_status": ndata.get("status"),
                    "label": ndata.get("label")
                })
                diff_nodes.append({
                    "group": "nodes",
                    "data": {**ndata, "diff_status": "modified", "previous_status": base_data.get("status")}
                })
            else:
                diff_nodes.append({
                    "group": "nodes",
                    "data": {**ndata, "diff_status": "unchanged"}
                })

    for nid, ndata in base_node_map.items():
        if nid not in target_node_map:
            removed_nodes.append(ndata)
            diff_nodes.append({
                "group": "nodes",
                "data": {**ndata, "diff_status": "removed"}
            })

    def edge_key(edata):
        src, dst = sorted([str(edata.get("source", "")), str(edata.get("target", ""))])
        return f"{src}--{dst}"

    target_edge_map = {edge_key(e["data"]): e["data"] for e in target_edges}
    base_edge_map = {edge_key(e["data"]): e["data"] for e in base_edges}

    added_edges = []
    removed_edges = []
    diff_edges = []

    for ekey, edata in target_edge_map.items():
        if ekey not in base_edge_map:
            added_edges.append(edata)
            diff_edges.append({
                "group": "edges",
                "data": {**edata, "diff_status": "added"}
            })
        else:
            diff_edges.append({
                "group": "edges",
                "data": {**edata, "diff_status": "unchanged"}
            })

    for ekey, edata in base_edge_map.items():
        if ekey not in target_edge_map:
            removed_edges.append(edata)
            diff_edges.append({
                "group": "edges",
                "data": {**edata, "diff_status": "removed"}
            })

    return {
        "data": {
            "target_snapshot_id": target_snap.id,
            "base_snapshot_id": base_snap.id if base_snap else None,
            "summary": {
                "added_nodes_count": len(added_nodes),
                "removed_nodes_count": len(removed_nodes),
                "modified_nodes_count": len(modified_nodes),
                "added_edges_count": len(added_edges),
                "removed_edges_count": len(removed_edges),
            },
            "added_nodes": added_nodes,
            "removed_nodes": removed_nodes,
            "modified_nodes": modified_nodes,
            "added_edges": added_edges,
            "removed_edges": removed_edges,
            "diff_graph": {
                "nodes": diff_nodes,
                "edges": diff_edges,
            }
        },
        "meta": {}
    }


class PathTraceRequest(BaseModel):
    source_device_id: str
    destination_device_id: str


@router.post("/trace-path", response_model=dict)
async def trace_network_path(
    req: PathTraceRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Compute hop-by-hop forwarding route between two devices in current active topology.
    """
    from app.application.services.path_tracing_service import PathTracingService
    service = PathTracingService(db)
    try:
        result = await service.trace_path(req.source_device_id, req.destination_device_id)
        return {"data": result, "meta": {}}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "DEVICE_NOT_FOUND", "message": str(e)}}
        )


