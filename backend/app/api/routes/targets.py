from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.infrastructure.database.session import get_db
from app.infrastructure.database.models.discovery import DiscoveryTarget, Credential, TargetType, CredentialType
from app.infrastructure.database.models.user import User, UserRole
from app.api.dependencies import get_current_user, require_roles

router = APIRouter(prefix="/targets", tags=["Discovery Targets"])


class CreateTargetRequest(BaseModel):
    name: str = Field(..., json_schema_extra={"example": "Core Network Subnet"})
    target_type: TargetType = Field(default=TargetType.IP, json_schema_extra={"example": "CIDR"})
    target_value: str = Field(..., json_schema_extra={"example": "10.0.0.0/24"})
    credential_id: Optional[str] = None
    is_enabled: bool = True


class CreateCredentialRequest(BaseModel):
    name: str = Field(..., json_schema_extra={"example": "Standard SNMPv2c"})
    cred_type: CredentialType = Field(default=CredentialType.SNMP_V2C)
    community: Optional[str] = "public"
    username: Optional[str] = None
    auth_password: Optional[str] = None
    priv_password: Optional[str] = None
    port: int = 161


@router.get("", response_model=dict)
async def list_targets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all configured discovery targets.
    """
    result = await db.execute(select(DiscoveryTarget).order_by(DiscoveryTarget.created_at.desc()))
    targets = result.scalars().all()

    target_list = []
    for t in targets:
        target_list.append({
            "id": t.id,
            "name": t.name,
            "target_type": t.target_type.value,
            "target_value": t.target_value,
            "credential_id": t.credential_id,
            "is_enabled": t.is_enabled,
            "last_run_at": t.last_run_at.isoformat() if t.last_run_at else None,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })

    return {"data": target_list, "meta": {"total": len(target_list)}}


@router.post("", status_code=status.HTTP_201_CREATED, response_model=dict)
async def create_target(
    req: CreateTargetRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.OPERATOR])),
):
    """
    Create a new discovery target.
    """
    new_target = DiscoveryTarget(
        name=req.name,
        target_type=req.target_type,
        target_value=req.target_value,
        credential_id=req.credential_id,
        is_enabled=req.is_enabled,
    )
    db.add(new_target)
    await db.commit()
    await db.refresh(new_target)

    return {
        "data": {
            "id": new_target.id,
            "name": new_target.name,
            "target_type": new_target.target_type.value,
            "target_value": new_target.target_value,
            "is_enabled": new_target.is_enabled,
        },
        "meta": {}
    }


@router.delete("/{target_id}", status_code=status.HTTP_200_OK, response_model=dict)
async def delete_target(
    target_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN])),
):
    """
    Delete a discovery target.
    """
    result = await db.execute(select(DiscoveryTarget).where(DiscoveryTarget.id == target_id))
    target = result.scalars().first()
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "TARGET_NOT_FOUND", "message": "Discovery target not found"}},
        )

    await db.delete(target)
    await db.commit()

    return {"data": {"message": "Target deleted successfully", "id": target_id}, "meta": {}}

