from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.config import settings
from app.core.security import verify_password, get_password_hash, create_access_token
from app.infrastructure.database.session import get_db
from app.infrastructure.database.models.user import User, UserRole
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    role: UserRole
    is_active: bool


@router.post("/login", response_model=dict)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """
    Authenticate user via email/username & password and return a JWT access token.
    """
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalars().first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "INVALID_CREDENTIALS", "message": "Incorrect email or password"}},
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "INACTIVE_ACCOUNT", "message": "Account is inactive"}},
        )

    access_token = create_access_token(subject=user.id)

    return {
        "data": {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role.value,
            }
        },
        "meta": {}
    }


@router.get("/me", response_model=dict)
async def get_me(current_user: User = Depends(get_current_user)):
    """
    Get current logged in user details.
    """
    return {
        "data": {
            "id": current_user.id,
            "email": current_user.email,
            "full_name": current_user.full_name,
            "role": current_user.role.value,
            "is_active": current_user.is_active,
            "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
        },
        "meta": {}
    }


@router.post("/seed-admin", status_code=status.HTTP_200_OK)
async def seed_initial_admin(db: AsyncSession = Depends(get_db)):
    """
    Idempotently seed the initial superuser if not already present.
    """
    result = await db.execute(select(User).where(User.email == settings.FIRST_SUPERUSER_EMAIL))
    existing = result.scalars().first()
    
    if existing:
        return {
            "data": {
                "message": "Admin user already exists",
                "email": existing.email,
                "role": existing.role.value,
            },
            "meta": {}
        }

    admin_user = User(
        email=settings.FIRST_SUPERUSER_EMAIL,
        hashed_password=get_password_hash(settings.FIRST_SUPERUSER_PASSWORD),
        full_name="NETRA Administrator",
        role=UserRole.ADMIN,
        is_active=True,
    )
    db.add(admin_user)
    await db.commit()
    await db.refresh(admin_user)

    return {
        "data": {
            "message": "Superuser created successfully",
            "email": admin_user.email,
            "role": admin_user.role.value,
        },
        "meta": {}
    }

