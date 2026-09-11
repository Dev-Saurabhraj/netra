import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Enum as SQLEnum, JSON, Text
from sqlalchemy.orm import relationship
from app.infrastructure.database.session import Base
from app.domain.entities.device import DeviceType, DeviceStatus


class Device(Base):
    __tablename__ = "devices"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hostname = Column(String(255), index=True, nullable=False)
    management_ip = Column(String(64), index=True, nullable=False)
    mac_address = Column(String(32), index=True, nullable=True)
    chassis_id = Column(String(128), index=True, nullable=True)
    serial_number = Column(String(128), nullable=True)
    vendor = Column(String(128), default="Generic", nullable=False)
    model = Column(String(128), nullable=True)
    device_type = Column(SQLEnum(DeviceType), default=DeviceType.UNKNOWN, nullable=False, index=True)
    status = Column(SQLEnum(DeviceStatus), default=DeviceStatus.UNKNOWN, nullable=False, index=True)
    sys_descr = Column(Text, nullable=True)
    sys_object_id = Column(String(128), nullable=True)
    attributes = Column(JSON, default=dict, nullable=False)

    first_seen = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    last_seen = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    interfaces = relationship("Interface", back_populates="device", cascade="all, delete-orphan", lazy="selectin")
    source_links = relationship("Link", foreign_keys="Link.source_device_id", back_populates="source_device", cascade="all, delete-orphan")
    destination_links = relationship("Link", foreign_keys="Link.destination_device_id", back_populates="destination_device", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="device", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Device {self.hostname} ({self.management_ip}) - {self.device_type}>"

