from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func

from app.infrastructure.database.session import get_db
from app.infrastructure.database.models.event import Event
from app.domain.entities.event import EventSeverity, EventType
from app.api.dependencies import get_current_user
from app.infrastructure.database.models.user import User

router = APIRouter(prefix="/events", tags=["Events"])


@router.get("", response_model=dict)
async def list_events(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    severity: Optional[str] = None,
    event_type: Optional[str] = None,
    device_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List network change and topology events with filtering and pagination.
    """
    query = select(Event)

    if severity:
        query = query.where(Event.severity == severity)
    if event_type:
        query = query.where(Event.event_type == event_type)
    if device_id:
        query = query.where(Event.device_id == device_id)

    # Count
    count_query = select(func.count()).select_from(query.subquery())
    total_res = await db.execute(count_query)
    total_count = total_res.scalar() or 0

    # Paginate
    query = query.order_by(Event.timestamp.desc()).offset(skip).limit(limit)
    res = await db.execute(query)
    events = res.scalars().all()

    event_list = []
    for e in events:
        event_list.append({
            "id": e.id,
            "event_type": e.event_type.value,
            "severity": e.severity.value,
            "device_id": e.device_id,
            "link_id": e.link_id,
            "title": e.title,
            "description": e.description,
            "previous_state": e.previous_state,
            "new_state": e.new_state,
            "timestamp": e.timestamp.isoformat() if e.timestamp else None,
        })

    return {
        "data": event_list,
        "meta": {
            "total": total_count,
            "skip": skip,
            "limit": limit,
        }
    }

