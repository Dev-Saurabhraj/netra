from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_, func
from sqlalchemy.orm import selectinload

from app.infrastructure.database.session import get_db
from app.infrastructure.database.models.device import Device
from app.infrastructure.database.models.interface import Interface
from app.infrastructure.database.models.topology import Link
from app.api.dependencies import get_current_user
from app.infrastructure.database.models.user import User

router = APIRouter(prefix="/devices", tags=["Devices"])


@router.get("", response_model=dict)
async def list_devices(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    device_type: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List network devices with search, filtering, and server-side pagination.
    """
    query = select(Device).options(selectinload(Device.interfaces))

    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(
                Device.hostname.ilike(search_pattern),
                Device.management_ip.ilike(search_pattern),
                Device.mac_address.ilike(search_pattern),
                Device.vendor.ilike(search_pattern),
                Device.model.ilike(search_pattern),
            )
        )

    if device_type:
        query = query.where(Device.device_type == device_type)

    if status_filter:
        query = query.where(Device.status == status_filter)

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total_count = total_result.scalar() or 0

    # Paginate
    query = query.order_by(Device.hostname.asc()).offset(skip).limit(limit)
    result = await db.execute(query)
    devices = result.scalars().all()

    device_list = []
    for d in devices:
        device_list.append({
            "id": d.id,
            "hostname": d.hostname,
            "management_ip": d.management_ip,
            "mac_address": d.mac_address,
            "vendor": d.vendor,
            "model": d.model,
            "device_type": d.device_type.value,
            "status": d.status.value,
            "interface_count": len(d.interfaces),
            "first_seen": d.first_seen.isoformat() if d.first_seen else None,
            "last_seen": d.last_seen.isoformat() if d.last_seen else None,
        })

    return {
        "data": device_list,
        "meta": {
            "total": total_count,
            "skip": skip,
            "limit": limit,
        }
    }


@router.get("/{device_id}", response_model=dict)
async def get_device_detail(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get detailed device info including its interfaces and metadata.
    """
    query = select(Device).options(selectinload(Device.interfaces)).where(Device.id == device_id)
    result = await db.execute(query)
    device = result.scalars().first()

    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "DEVICE_NOT_FOUND", "message": f"Device with ID '{device_id}' was not found"}}
        )

    interfaces_data = []
    for iface in device.interfaces:
        interfaces_data.append({
            "id": iface.id,
            "name": iface.name,
            "if_index": iface.if_index,
            "description": iface.description,
            "mac_address": iface.mac_address,
            "ip_address": iface.ip_address,
            "admin_status": iface.admin_status.value,
            "oper_status": iface.oper_status.value,
            "speed": iface.speed,
            "duplex": iface.duplex,
            "vlan": iface.vlan,
            "last_seen": iface.last_seen.isoformat() if iface.last_seen else None,
        })

    return {
        "data": {
            "id": device.id,
            "hostname": device.hostname,
            "management_ip": device.management_ip,
            "mac_address": device.mac_address,
            "chassis_id": device.chassis_id,
            "serial_number": device.serial_number,
            "vendor": device.vendor,
            "model": device.model,
            "device_type": device.device_type.value,
            "status": device.status.value,
            "sys_descr": device.sys_descr,
            "sys_object_id": device.sys_object_id,
            "attributes": device.attributes,
            "first_seen": device.first_seen.isoformat() if device.first_seen else None,
            "last_seen": device.last_seen.isoformat() if device.last_seen else None,
            "interfaces": interfaces_data,
        },
        "meta": {}
    }


@router.get("/{device_id}/neighbors", response_model=dict)
async def get_device_neighbors(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get discovered neighbor links for a specific device.
    """
    query = select(Link).where(
        or_(
            Link.source_device_id == device_id,
            Link.destination_device_id == device_id
        )
    ).options(
        selectinload(Link.source_device),
        selectinload(Link.destination_device),
        selectinload(Link.source_interface),
        selectinload(Link.destination_interface),
    )
    result = await db.execute(query)
    links = result.scalars().all()

    neighbors = []
    for link in links:
        is_source = link.source_device_id == device_id
        remote_device = link.destination_device if is_source else link.source_device
        local_iface = link.source_interface if is_source else link.destination_interface
        remote_iface = link.destination_interface if is_source else link.source_interface

        neighbors.append({
            "link_id": link.id,
            "remote_device_id": remote_device.id if remote_device else None,
            "remote_hostname": remote_device.hostname if remote_device else "Unknown",
            "remote_ip": remote_device.management_ip if remote_device else "Unknown",
            "remote_device_type": remote_device.device_type.value if remote_device else "UNKNOWN",
            "local_port": local_iface.name if local_iface else "Unknown",
            "remote_port": remote_iface.name if remote_iface else "Unknown",
            "confidence": link.confidence,
            "discovery_methods": link.discovery_methods,
            "evidence": link.evidence,
            "status": link.status.value,
        })

    return {
        "data": neighbors,
        "meta": {"total": len(neighbors)}
    }

