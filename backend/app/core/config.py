from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    ENVIRONMENT: str = "development"
    PROJECT_NAME: str = "NETRA"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # Security & JWT
    SECRET_KEY: str = "netra_super_secret_jwt_key_change_in_production_for_security"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://netra_user:netra_password@localhost:5432/netra_db"
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "netra_user"
    POSTGRES_PASSWORD: str = "netra_password"
    POSTGRES_DB: str = "netra_db"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Initial Superuser Seed
    FIRST_SUPERUSER_EMAIL: str = "admin@netra.local"
    FIRST_SUPERUSER_PASSWORD: str = "AdminPassword123!"

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # Discovery Limits & Tuning
    DEFAULT_SNMP_COMMUNITY: str = "public"
    DISCOVERY_CONCURRENCY_LIMIT: int = 10
    DISCOVERY_TIMEOUT_SECONDS: int = 5
    DISCOVERY_MAX_RETRIES: int = 2


settings = Settings()

