from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.future import select

from app.core.config import settings
from app.core.logging import logger
from app.core.security import get_password_hash
from app.core.exceptions import NetraException
from app.infrastructure.database.session import engine, Base, AsyncSessionLocal
from app.infrastructure.database.models import User, UserRole

# Import API routers
from app.api.routes.health import router as health_router
from app.api.routes.auth import router as auth_router
from app.api.routes.devices import router as devices_router
from app.api.routes.targets import router as targets_router
from app.api.routes.topology import router as topology_router
from app.api.routes.events import router as events_router
from app.api.routes.discovery import router as discovery_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application startup and shutdown lifespan events.
    Creates tables if not present and seeds the initial admin user.
    """
    logger.info(f"Starting {settings.PROJECT_NAME} (v{settings.VERSION}) in {settings.ENVIRONMENT} mode...")
    
    # Auto-create tables (for initial dev / test environments)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed initial superuser idempotently
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == settings.FIRST_SUPERUSER_EMAIL))
        admin_user = result.scalars().first()
        if not admin_user:
            admin_user = User(
                email=settings.FIRST_SUPERUSER_EMAIL,
                hashed_password=get_password_hash(settings.FIRST_SUPERUSER_PASSWORD),
                full_name="NETRA Administrator",
                role=UserRole.ADMIN,
                is_active=True,
            )
            session.add(admin_user)
            await session.commit()
            logger.info(f"Default admin user created: {settings.FIRST_SUPERUSER_EMAIL}")

    yield

    logger.info(f"Shutting down {settings.PROJECT_NAME}...")
    await engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="NETRA — Network Exploration, Topology & Relationship Analytics API",
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan,
)

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Exception Handlers
@app.exception_handler(NetraException)
async def netra_exception_handler(request: Request, exc: NetraException):
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"error": {"code": "VALIDATION_ERROR", "message": "Request payload validation failed", "details": exc.errors()}},
    )


# Mount API V1 Routers
api_v1 = FastAPI()
api_v1.include_router(health_router)
api_v1.include_router(auth_router)
api_v1.include_router(devices_router)
api_v1.include_router(targets_router)
api_v1.include_router(topology_router)
api_v1.include_router(events_router)
api_v1.include_router(discovery_router)

app.mount(settings.API_V1_STR, api_v1)


@app.get("/")
async def root():
    return {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": f"{settings.API_V1_STR}/docs",
        "health": f"{settings.API_V1_STR}/health",
    }

