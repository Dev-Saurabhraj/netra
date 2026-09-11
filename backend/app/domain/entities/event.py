from enum import Enum
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class EventType(str, Enum):
    NEW_DEVICE = "NEW_DEVICE"
    DEVICE_REMOVED = "DEVICE_REMOVED"
    DEVICE_DOWN = "DEVICE_DOWN"
    DEVICE_RECOVERED = "DEVICE_RECOVERED"
    LINK_ADDED = "LINK_ADDED"
    LINK_REMOVED = "LINK_REMOVED"
    LINK_RECOVERED = "LINK_RECOVERED"
    INTERFACE_DOWN = "INTERFACE_DOWN"
    INTERFACE_RECOVERED = "INTERFACE_RECOVERED"
    TOPOLOGY_CONFLICT = "TOPOLOGY_CONFLICT"
    DISCOVERY_STARTED = "DISCOVERY_STARTED"
    DISCOVERY_COMPLETED = "DISCOVERY_COMPLETED"
    DISCOVERY_FAILED = "DISCOVERY_FAILED"


class EventSeverity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class EventDomain(BaseModel):
    id: Optional[str] = None
    event_type: EventType
    severity: EventSeverity
    device_id: Optional[str] = None
    link_id: Optional[str] = None
    interface_id: Optional[str] = None
    title: str
    description: str
    previous_state: Optional[Dict[str, Any]] = None
    new_state: Optional[Dict[str, Any]] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

