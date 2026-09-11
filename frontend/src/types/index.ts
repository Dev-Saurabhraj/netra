export type DeviceType = 
  | 'ROUTER'
  | 'SWITCH'
  | 'FIREWALL'
  | 'SERVER'
  | 'ACCESS_POINT'
  | 'HOST'
  | 'UNKNOWN';

export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'WARNING' | 'DEGRADED' | 'UNKNOWN';

export type LinkStatus = 'ACTIVE' | 'DEGRADED' | 'DOWN' | 'REMOVED' | 'CONFLICT';

export type EventSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface InterfaceItem {
  id: string;
  name: string;
  if_index: number;
  description?: string;
  mac_address?: string;
  ip_address?: string;
  admin_status: 'UP' | 'DOWN' | 'TESTING';
  oper_status: 'UP' | 'DOWN' | 'TESTING' | 'UNKNOWN';
  speed?: number;
  duplex?: string;
  vlan?: number;
  last_seen?: string;
}

export interface DeviceItem {
  id: string;
  hostname: string;
  management_ip: string;
  mac_address?: string;
  chassis_id?: string;
  serial_number?: string;
  vendor: string;
  model?: string;
  device_type: DeviceType;
  status: DeviceStatus;
  sys_descr?: string;
  sys_object_id?: string;
  interface_count?: number;
  interfaces?: InterfaceItem[];
  first_seen?: string;
  last_seen?: string;
}

export interface EvidenceItem {
  method: string;
  confidence_weight: number;
  observed_at: string;
  details?: Record<string, any>;
}

export interface LinkItem {
  id: string;
  source_device_id: string;
  destination_device_id: string;
  source_interface_name?: string;
  destination_interface_name?: string;
  status: LinkStatus;
  confidence: number;
  confidence_percent: number;
  discovery_methods: string[];
  evidence: EvidenceItem[];
  last_seen?: string;
}

export interface TopologyData {
  nodes: Array<{
    data: {
      id: string;
      label: string;
      ip: string;
      mac?: string;
      device_type: DeviceType;
      vendor: string;
      model?: string;
      status: DeviceStatus;
      interface_count: number;
      last_seen?: string;
    };
  }>;
  edges: Array<{
    data: {
      id: string;
      source: string;
      target: string;
      source_port: string;
      target_port: string;
      confidence: number;
      confidence_percent: number;
      status: LinkStatus;
      discovery_methods: string[];
      evidence: EvidenceItem[];
      last_seen?: string;
    };
  }>;
  summary: {
    total_devices: number;
    total_links: number;
  };
}

export interface NetworkEvent {
  id: string;
  event_type: string;
  severity: EventSeverity;
  device_id?: string;
  link_id?: string;
  title: string;
  description: string;
  previous_state?: Record<string, any>;
  new_state?: Record<string, any>;
  timestamp: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
}

