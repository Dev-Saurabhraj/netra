import pytest
from httpx import AsyncClient
from app.application.services.scheduler_service import DiscoveryScheduler
from app.infrastructure.database.models import User, UserRole
from app.core.security import create_access_token


def test_scheduler_singleton_configure():
    """Verify in-memory scheduler configuration state changes."""
    sched = DiscoveryScheduler()
    status = sched.configure(enabled=True, interval_seconds=120)
    assert status["enabled"] is True
    assert status["interval_seconds"] == 120
    assert status["next_run_at"] is not None

    status_disabled = sched.configure(enabled=False)
    assert status_disabled["enabled"] is False
    assert status_disabled["next_run_at"] is None


@pytest.mark.asyncio
async def test_scheduler_api_routes(client: AsyncClient, db_session):
    """Verify /discovery/schedule endpoints with authenticated requests."""
    # Seed admin user
    user = User(
        email="admin@netra.test",
        hashed_password="hash",
        full_name="Admin Test",
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    token = create_access_token(subject=user.id)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Get schedule
    get_res = await client.get("/api/v1/discovery/schedule", headers=headers)
    assert get_res.status_code == 200
    data = get_res.json()["data"]
    assert "enabled" in data
    assert "interval_seconds" in data

    # 2. Configure schedule
    post_res = await client.post(
        "/api/v1/discovery/schedule",
        headers=headers,
        json={"enabled": True, "interval_seconds": 90}
    )
    assert post_res.status_code == 200
    updated = post_res.json()["data"]
    assert updated["enabled"] is True
    assert updated["interval_seconds"] == 90
