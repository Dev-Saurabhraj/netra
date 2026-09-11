import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Enum as SQLEnum, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
from app.infrastructure.database.session import Base
from app.domain.entities.event import EventType, EventSeverity


class Event(Base):
    __tablename__ = "events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_type = Column(SQLEnum(EventType), nullable=False, index=True)
    severity = Column(SQLEnum(EventSeverity), default=EventSeverity.INFO, nullable=False, index=True)
    device_id = Column(String(36), ForeignKey("devices.id", ondelete="CASCADE"), nullable=True, index=True)
    link_id = Column(String(36), ForeignKey("links.id", ondelete="SET NULL"), nullable=True, index=True)
    interface_id = Column(String(36), ForeignKey("interfaces.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    previous_state = Column(JSON, nullable=True)
    new_state = Column(JSON, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    # Relationships
    device = relationship("Device", back_populates="events")

    def __repr__(self) -> str:
        return f"<Event {self.event_type} - {self.severity}: {self.title}>"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String(128), nullable=False, index=True)  # e.g., USER_LOGIN, START_DISCOVERY, CREATE_TARGET
    resource_type = Column(String(64), nullable=True)
    resource_id = Column(String(64), nullable=True)
    details = Column(JSON, default=dict, nullable=False)
    ip_address = Column(String(64), nullable=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    def __repr__(self) -> str:
        return f"<AuditLog {self.action} by User {self.user_id}>"

