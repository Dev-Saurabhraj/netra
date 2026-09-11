import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, BigInteger, DateTime, Enum as SQLEnum, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from app.infrastructure.database.session import Base
from app.domain.entities.interface import InterfaceAdminStatus, InterfaceOperStatus


class Interface(Base):
    __tablename__ = "interfaces"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    device_id = Column(String(36), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    if_index = Column(Integer, nullable=False)
    description = Column(String(255), nullable=True)
    mac_address = Column(String(32), nullable=True, index=True)
    ip_address = Column(String(64), nullable=True, index=True)
    netmask = Column(String(64), nullable=True)
    admin_status = Column(SQLEnum(InterfaceAdminStatus), default=InterfaceAdminStatus.UP, nullable=False)
    oper_status = Column(SQLEnum(InterfaceOperStatus), default=InterfaceOperStatus.UNKNOWN, nullable=False)
    speed = Column(BigInteger, nullable=True)
    duplex = Column(String(32), nullable=True)
    vlan = Column(Integer, nullable=True)
    metadata_info = Column(JSON, default=dict, nullable=False)

    first_seen = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    last_seen = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    device = relationship("Device", back_populates="interfaces")

    __table_args__ = (
        UniqueConstraint("device_id", "if_index", name="uq_device_if_index"),
    )

    def __repr__(self) -> str:
        return f"<Interface {self.name} (idx: {self.if_index}) on Device {self.device_id}>"

