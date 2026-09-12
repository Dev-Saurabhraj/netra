from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class NeighborAdjacency(BaseModel):
    """
    Standard normalized neighbor representation across LLDP and CDP protocols.
    """
    local_interface_name: Optional[str] = None
    local_if_index: Optional[int] = None
    remote_device_name: Optional[str] = None
    remote_chassis_id: Optional[str] = None
    remote_port_id: Optional[str] = None
    remote_port_desc: Optional[str] = None
    remote_system_desc: Optional[str] = None
    remote_management_ip: Optional[str] = None
    protocol: str = Field(..., description="LLDP or CDP")
    confidence_weight: float = Field(default=0.95, ge=0.0, le=1.0)
    raw_attributes: Dict[str, Any] = Field(default_factory=dict)


class DirectNeighborDiscoveryResult(BaseModel):
    """
    Direct neighbor discovery output for a specific device IP.
    """
    ip_address: str
    lldp_enabled: bool = False
    cdp_enabled: bool = False
    neighbors: List[NeighborAdjacency] = Field(default_factory=list)

