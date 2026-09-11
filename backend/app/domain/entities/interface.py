from enum import Enum
from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class InterfaceOperStatus(str, Enum):
    UP = "UP"
    DOWN = "DOWN"
    TESTING = "TESTING"
    UNKNOWN = "UNKNOWN"
    DORMANT = "DORMANT"
    NOT_PRESENT = "NOT_PRESENT"
    LOWER_LAYER_DOWN = "LOWER_LAYER_DOWN"


class InterfaceAdminStatus(str, Enum):
    UP = "UP"
    DOWN = "DOWN"
    TESTING = "TESTING"


class InterfaceDomain(BaseModel):
    id: Optional[str] = None
    device_id: str
    name: str
    if_index: int
    description: Optional[str] = None
    mac_address: Optional[str] = None
    ip_address: Optional[str] = None
    netmask: Optional[str] = None
    admin_status: InterfaceAdminStatus = InterfaceAdminStatus.UP
    oper_status: InterfaceOperStatus = InterfaceOperStatus.UNKNOWN
    speed: Optional[int] = None  # Speed in bits/sec or Mbps
    duplex: Optional[str] = None  # full, half, auto
    vlan: Optional[int] = None
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

