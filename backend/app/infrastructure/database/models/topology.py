import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, DateTime, Enum as SQLEnum, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from app.infrastructure.database.session import Base
from app.domain.entities.link import LinkStatus


class Link(Base):
    __tablename__ = "links"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source_device_id = Column(String(36), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True)
    source_interface_id = Column(String(36), ForeignKey("interfaces.id", ondelete="SET NULL"), nullable=True, index=True)
    destination_device_id = Column(String(36), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True)
    destination_interface_id = Column(String(36), ForeignKey("interfaces.id", ondelete="SET NULL"), nullable=True, index=True)
    
    status = Column(SQLEnum(LinkStatus), default=LinkStatus.ACTIVE, nullable=False, index=True)
    confidence = Column(Float, default=0.0, nullable=False)
    discovery_methods = Column(JSON, default=list, nullable=False)  # e.g., ["LLDP", "SNMP", "MAC_TABLE"]
    evidence = Column(JSON, default=list, nullable=False)  # Full evidence provenance array

    first_seen = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    last_seen = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    source_device = relationship("Device", foreign_keys=[source_device_id], back_populates="source_links")
    destination_device = relationship("Device", foreign_keys=[destination_device_id], back_populates="destination_links")
    source_interface = relationship("Interface", foreign_keys=[source_interface_id])
    destination_interface = relationship("Interface", foreign_keys=[destination_interface_id])

    __table_args__ = (
        UniqueConstraint("source_device_id", "source_interface_id", "destination_device_id", "destination_interface_id", name="uq_device_link_endpoints"),
    )

    def __repr__(self) -> str:
        return f"<Link {self.source_device_id} <-> {self.destination_device_id} ({self.confidence * 100:.1f}%)>"


class TopologySnapshot(Base):
    __tablename__ = "topology_snapshots"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    discovery_run_id = Column(String(36), ForeignKey("discovery_runs.id", ondelete="SET NULL"), nullable=True, index=True)
    graph_data = Column(JSON, nullable=False)  # Complete nodes and edges graph json
    node_count = Column(Float, default=0, nullable=False)
    edge_count = Column(Float, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    def __repr__(self) -> str:
        return f"<TopologySnapshot {self.id} - Nodes: {self.node_count}, Edges: {self.edge_count}>"

