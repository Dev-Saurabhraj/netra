import uuid
from enum import Enum
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Enum as SQLEnum, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
from app.infrastructure.database.session import Base
from app.domain.entities.observation import ObservationSourceType


class TargetType(str, Enum):
    IP = "IP"
    CIDR = "CIDR"
    HOSTNAME = "HOSTNAME"


class CredentialType(str, Enum):
    SNMP_V2C = "SNMP_V2C"
    SNMP_V3 = "SNMP_V3"
    SSH = "SSH"


class DiscoveryRunStatus(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class Credential(Base):
    __tablename__ = "credentials"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(128), unique=True, nullable=False)
    cred_type = Column(SQLEnum(CredentialType), default=CredentialType.SNMP_V2C, nullable=False)
    community = Column(String(128), default="public", nullable=True)
    username = Column(String(128), nullable=True)
    auth_password = Column(String(255), nullable=True)
    priv_password = Column(String(255), nullable=True)
    auth_protocol = Column(String(32), nullable=True)  # SHA, MD5
    priv_protocol = Column(String(32), nullable=True)  # AES, DES
    port = Column(Integer, default=161, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)


class DiscoveryTarget(Base):
    __tablename__ = "discovery_targets"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(128), nullable=False)
    target_type = Column(SQLEnum(TargetType), default=TargetType.IP, nullable=False)
    target_value = Column(String(255), nullable=False)  # e.g., 10.0.0.1 or 192.168.1.0/24
    credential_id = Column(String(36), ForeignKey("credentials.id", ondelete="SET NULL"), nullable=True)
    is_enabled = Column(Boolean, default=True, nullable=False)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)


class DiscoveryRun(Base):
    __tablename__ = "discovery_runs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    status = Column(SQLEnum(DiscoveryRunStatus), default=DiscoveryRunStatus.QUEUED, nullable=False, index=True)
    total_targets = Column(Integer, default=0, nullable=False)
    processed_targets = Column(Integer, default=0, nullable=False)
    successful_targets = Column(Integer, default=0, nullable=False)
    failed_targets = Column(Integer, default=0, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    error_summary = Column(Text, nullable=True)
    logs = Column(JSON, default=list, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    observations = relationship("Observation", back_populates="discovery_run", cascade="all, delete-orphan")


class Observation(Base):
    __tablename__ = "observations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    discovery_run_id = Column(String(36), ForeignKey("discovery_runs.id", ondelete="CASCADE"), nullable=True, index=True)
    source_type = Column(SQLEnum(ObservationSourceType), nullable=False, index=True)
    target = Column(String(128), nullable=False, index=True)
    observed_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    raw_payload = Column(JSON, default=dict, nullable=False)
    normalized_data = Column(JSON, default=dict, nullable=False)
    error = Column(Text, nullable=True)

    discovery_run = relationship("DiscoveryRun", back_populates="observations")

