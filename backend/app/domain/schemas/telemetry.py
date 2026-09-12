from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class ArpEntry(BaseModel):
    """
    Standard normalized ARP cache entry.
    """
    ip_address: str
    mac_address: str
    if_index: Optional[int] = None
    interface_name: Optional[str] = None
    entry_type: str = "dynamic"  # dynamic, static, other


class MacTableEntry(BaseModel):
    """
    Standard normalized Switch Forwarding Database (FDB) MAC table entry.
    """
    mac_address: str
    port_index: int
    port_name: Optional[str] = None
    vlan_id: Optional[int] = None
    status: str = "learned"  # learned, self, mgmt, static


class EndpointPlacement(BaseModel):
    """
    Synthesized Layer-2 attachment placement mapping an IP endpoint
    to a specific switch interface via correlated ARP + MAC FDB.
    """
    endpoint_ip: str
    endpoint_mac: str
    switch_ip: str
    switch_port_index: int
    switch_port_name: Optional[str] = None
    confidence_weight: float = Field(default=0.80, ge=0.0, le=1.0)
    provenance: Dict[str, Any] = Field(default_factory=dict)

