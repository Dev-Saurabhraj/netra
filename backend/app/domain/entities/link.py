from enum import Enum
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class LinkStatus(str, Enum):
    ACTIVE = "ACTIVE"
    DEGRADED = "DEGRADED"
    DOWN = "DOWN"
    REMOVED = "REMOVED"
    CONFLICT = "CONFLICT"


class EvidenceItem(BaseModel):
    method: str  # LLDP, SNMP, MAC_TABLE, ARP, ICMP
    confidence_weight: float
    observed_at: datetime
    details: Dict[str, Any] = Field(default_factory=dict)


class LinkDomain(BaseModel):
    id: Optional[str] = None
    source_device_id: str
    source_interface_id: Optional[str] = None
    destination_device_id: str
    destination_interface_id: Optional[str] = None
    status: LinkStatus = LinkStatus.ACTIVE
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    discovery_methods: List[str] = Field(default_factory=list)
    evidence: List[EvidenceItem] = Field(default_factory=list)
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None

