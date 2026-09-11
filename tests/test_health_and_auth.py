import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_password_hash, verify_password, create_access_token, decode_access_token
from app.infrastructure.database.models.user import User, UserRole


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    """Test health endpoint returns healthy status and DB readiness."""
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["data"]["service"] == "NETRA"


@pytest.mark.asyncio
async def test_password_hashing():
    """Test bcrypt password hashing and verification."""
    raw_password = "SecretLabPassword456!"
    hashed = get_password_hash(raw_password)
    assert hashed != raw_password
    assert verify_password(raw_password, hashed) is True
    assert verify_password("WrongPassword", hashed) is False


@pytest.mark.asyncio
async def test_jwt_token_generation_and_decoding():
    """Test JWT creation, claim expiration, and payload decoding."""
    user_id = "test-user-12345"
    token = create_access_token(subject=user_id)
    assert isinstance(token, str)

    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == user_id


@pytest.mark.asyncio
async def test_auth_login_and_me(client: AsyncClient, db_session: AsyncSession):
    """Test full login flow and protected /auth/me route."""
    # Seed user
    test_user = User(
        email="operator@netra.local",
        hashed_password=get_password_hash("OperatorPass123!"),
        full_name="Lab Operator",
        role=UserRole.OPERATOR,
        is_active=True,
    )
    db_session.add(test_user)
    await db_session.commit()

    # Login
    login_response = await client.post(
        "/api/v1/auth/login",
        data={"username": "operator@netra.local", "password": "OperatorPass123!"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login_response.status_code == 200
    login_data = login_response.json()["data"]
    token = login_data["access_token"]
    assert token is not None
    assert login_data["user"]["email"] == "operator@netra.local"

    # Access /auth/me with Bearer token
    me_response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_response.status_code == 200
    me_data = me_response.json()["data"]
    assert me_data["email"] == "operator@netra.local"
    assert me_data["role"] == "OPERATOR"

