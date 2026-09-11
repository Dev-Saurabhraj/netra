from enum import Enum
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class DeviceType(str, Enum):
    ROUTER = "ROUTER"
    SWITCH = "SWITCH"
    FIREWALL = "FIREWALL"
    SERVER = "SERVER"
    ACCESS_POINT = "ACCESS_POINT"
    HOST = "HOST"
    UNKNOWN = "UNKNOWN"


class DeviceStatus(str, Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    WARNING = "WARNING"
    DEGRADED = "DEGRADED"
    UNKNOWN = "UNKNOWN"


class DeviceDomain(BaseModel):
    id: Optional[str] = None
    hostname: str
    management_ip: str
    mac_address: Optional[str] = None
    chassis_id: Optional[str] = None
    serial_number: Optional[str] = None
    vendor: Optional[str] = "Generic"
    model: Optional[str] = None
    device_type: DeviceType = DeviceType.UNKNOWN
    status: DeviceStatus = DeviceStatus.UNKNOWN
    sys_descr: Optional[str] = None
    sys_object_id: Optional[str] = None
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    attributes: Dict[str, Any] = Field(default_factory=dict)

