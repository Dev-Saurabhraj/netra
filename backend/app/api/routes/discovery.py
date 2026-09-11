import uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.infrastructure.database.session import get_db
from app.infrastructure.database.models.discovery import DiscoveryRun, DiscoveryRunStatus, DiscoveryTarget
from app.infrastructure.database.models.user import User, UserRole
from app.api.dependencies import get_current_user, require_roles

router = APIRouter(prefix="/discovery", tags=["Discovery"])


class StartDiscoveryRequest(BaseModel):
    target_ids: Optional[List[str]] = None
    custom_subnets: Optional[List[str]] = None


@router.get("/runs", response_model=dict)
async def list_discovery_runs(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List discovery runs with execution metrics.
    """
    query = select(DiscoveryRun).order_by(DiscoveryRun.created_at.desc()).offset(skip).limit(limit)
    res = await db.execute(query)
    runs = res.scalars().all()

    run_list = []
    for r in runs:
        run_list.append({
            "id": r.id,
            "status": r.status.value,
            "total_targets": r.total_targets,
            "processed_targets": r.processed_targets,
            "successful_targets": r.successful_targets,
            "failed_targets": r.failed_targets,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    return {"data": run_list, "meta": {"total": len(run_list)}}


@router.get("/runs/{run_id}", response_model=dict)
async def get_discovery_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get detailed metrics and logs for a discovery run.
    """
    res = await db.execute(select(DiscoveryRun).where(DiscoveryRun.id == run_id))
    run = res.scalars().first()

    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "RUN_NOT_FOUND", "message": "Discovery run not found"}},
        )

    return {
        "data": {
            "id": run.id,
            "status": run.status.value,
            "total_targets": run.total_targets,
            "processed_targets": run.processed_targets,
            "successful_targets": run.successful_targets,
            "failed_targets": run.failed_targets,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
            "error_summary": run.error_summary,
            "logs": run.logs,
        },
        "meta": {}
    }


@router.post("/start", status_code=status.HTTP_202_ACCEPTED, response_model=dict)
async def start_discovery(
    req: StartDiscoveryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.OPERATOR])),
):
    """
    Trigger an asynchronous discovery run against configured targets.
    """
    # Count targets
    targets_query = select(DiscoveryTarget).where(DiscoveryTarget.is_enabled == True)
    if req.target_ids:
        targets_query = targets_query.where(DiscoveryTarget.id.in_(req.target_ids))
    
    t_res = await db.execute(targets_query)
    targets = t_res.scalars().all()
    total_target_count = len(targets) + (len(req.custom_subnets) if req.custom_subnets else 0)

    # Create DiscoveryRun record
    run = DiscoveryRun(
        status=DiscoveryRunStatus.RUNNING,
        total_targets=total_target_count,
        processed_targets=0,
        successful_targets=0,
        failed_targets=0,
        started_at=datetime.now(timezone.utc),
        logs=[{"timestamp": datetime.now(timezone.utc).isoformat(), "message": "Discovery run initialized"}],
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    return {
        "data": {
            "job_id": run.id,
            "status": run.status.value,
            "total_targets": run.total_targets,
            "message": "Discovery job queued and started",
        },
        "meta": {}
    }

