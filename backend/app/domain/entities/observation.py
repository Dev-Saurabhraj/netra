from enum import Enum
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class ObservationSourceType(str, Enum):
    ICMP = "ICMP"
    SNMP = "SNMP"
    LLDP = "LLDP"
    CDP = "CDP"
    ARP = "ARP"
    MAC_TABLE = "MAC_TABLE"


class ObservationDomain(BaseModel):
    id: Optional[str] = None
    discovery_run_id: Optional[str] = None
    source_type: ObservationSourceType
    target: str
    observed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    raw_payload: Dict[str, Any] = Field(default_factory=dict)
    normalized_data: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None

