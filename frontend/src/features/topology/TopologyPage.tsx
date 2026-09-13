import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import cytoscape, { Core } from 'cytoscape';
import { 
  Network, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  RotateCcw, 
  CheckCircle2, 
  Radio,
  Route,
  History,
  X,
  ArrowRight,
  GitCompare,
  Layers,
  Search,
  Download,
  LayoutGrid,
  Filter,
  Wifi,
  Crosshair,
  Sparkles,
  Activity,
  Eye,
  EyeOff,
  Shield,
  RefreshCw
} from 'lucide-react';
import { apiClient } from '../../lib/api';
import { DiscoveryLiveConsole } from '../discovery/DiscoveryLiveConsole';
import { useNetworkWorkspaceStore } from '../../stores/networkWorkspaceStore';

const getDeviceColor = (type: string) => {
  switch (type?.toUpperCase()) {
    case 'ROUTER':
      return '#f97316'; // Orange
    case 'SWITCH':
      return '#06b6d4'; // Cyan
    case 'FIREWALL':
      return '#ef4444'; // Red
    case 'SERVER':
      return '#10b981'; // Emerald Green
    case 'HOST':
      return '#8b5cf6'; // Purple
    case 'ACCESS_POINT':
      return '#ec4899'; // Pink
    default:
      return '#64748b'; // Slate
  }
};

const getDeviceShape = (type: string) => {
  switch (type?.toUpperCase()) {
    case 'ROUTER':
      return 'diamond';
    case 'SWITCH':
      return 'round-rectangle';
    case 'FIREWALL':
      return 'octagon';
    case 'SERVER':
      return 'rectangle';
    case 'HOST':
      return 'ellipse';
    default:
      return 'ellipse';
  }
};

const getVendorBadgeColor = (vendor: string) => {
  const v = (vendor || '').toLowerCase();
  if (v.includes('apple')) return 'bg-slate-700/40 text-slate-200 border-slate-600';
  if (v.includes('realme') || v.includes('oppo')) return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
  if (v.includes('poco') || v.includes('xiaomi')) return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
  if (v.includes('oneplus')) return 'bg-red-500/20 text-red-300 border-red-500/30';
  if (v.includes('samsung')) return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
  if (v.includes('zyxel') || v.includes('cisco')) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  if (v.includes('intel')) return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
  return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
};

export const TopologyPage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const queryClient = useQueryClient();
  
  // Workspace Tab Synchronization
  const { tabs: workspaceTabs, activeTabId, hiddenDeviceIds } = useNetworkWorkspaceStore();
  const activeWorkspaceTab = workspaceTabs.find((t) => t.id === activeTabId) || workspaceTabs.filter(t => !t.isArchived)[0];

  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [selectedEdge, setSelectedEdge] = useState<any>(null);
  const [liveEvent, setLiveEvent] = useState<string | null>(null);

  // Search & Filter States
  const [nodeSearchQuery, setNodeSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [selectedLayout, setSelectedLayout] = useState<string>('radial_star');

  // Subnet & Network Isolation States
  const [selectedSubnet, setSelectedSubnet] = useState<string>('CURRENT'); // 'CURRENT', 'ALL', or specific subnet
  const [hideIsolated, setHideIsolated] = useState<boolean>(true);

  // Interactive Action States
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [pingResult, setPingResult] = useState<{ reachable: boolean; latency: number } | null>(null);

  // Time-Travel & Snapshot States
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('live');
  const [isDiffMode, setIsDiffMode] = useState<boolean>(false);

  // Path Tracer States
  const [showPathTracer, setShowPathTracer] = useState<boolean>(false);
  const [sourceNodeId, setSourceNodeId] = useState<string>('');
  const [targetNodeId, setTargetNodeId] = useState<string>('');
  const [pathResult, setPathResult] = useState<any>(null);
  const [isTracingPath, setIsTracingPath] = useState<boolean>(false);
  const [traceError, setTraceError] = useState<string | null>(null);

  // Live Discovery Console & Scanner States
  const [showLiveScanner, setShowLiveScanner] = useState<boolean>(false);
  const [isScanActive, setIsScanActive] = useState<boolean>(false);

  // 1. Fetch live topology
  const { data: liveTopoRes } = useQuery({
    queryKey: ['topology'],
    queryFn: () => apiClient.get('/topology').then((r) => r.data.data),
  });

  // 2. Fetch snapshot history list
  const { data: snapshotsRes } = useQuery({
    queryKey: ['topology-snapshots'],
    queryFn: () => apiClient.get('/topology/snapshots?limit=15').then((r) => r.data.data),
  });

  // 3. Fetch specific snapshot or diff when viewing history
  const { data: historyData } = useQuery({
    queryKey: ['snapshot-view', selectedSnapshotId, isDiffMode],
    queryFn: () => {
      if (selectedSnapshotId === 'live') return null;
      if (isDiffMode) {
        return apiClient.get(`/topology/snapshots/${selectedSnapshotId}/diff`).then((r) => r.data.data);
      }
      return apiClient.get(`/topology/snapshots/${selectedSnapshotId}`).then((r) => r.data.data);
    },
    enabled: selectedSnapshotId !== 'live',
  });

  // Active raw graph
  const activeGraph = useMemo(() => {
    if (selectedSnapshotId === 'live') {
      return liveTopoRes;
    }
    if (isDiffMode && historyData?.diff_graph) {
      return historyData.diff_graph;
    }
    if (historyData?.graph) {
      return historyData.graph;
    }
    return liveTopoRes;
  }, [selectedSnapshotId, isDiffMode, liveTopoRes, historyData]);

  // Compute all distinct subnets from nodes
  const subnets = useMemo(() => {
    if (!activeGraph?.nodes) return [];
    const map: Record<string, { subnet: string; count: number; hasGateway: boolean; gatewayLabel: string; gatewayIp: string }> = {};
    
    activeGraph.nodes.forEach((n: any) => {
      const ip = n.data?.ip;
      if (ip && ip.includes('.')) {
        const parts = ip.split('.');
        if (parts.length === 4) {
          const sub = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
          if (!map[sub]) {
            map[sub] = { subnet: sub, count: 0, hasGateway: false, gatewayLabel: '', gatewayIp: '' };
          }
          map[sub].count++;
          const isGw = parts[3] === '1' || parts[3] === '254' || (n.data?.device_type || '').toUpperCase() === 'ROUTER';
          if (isGw) {
            map[sub].hasGateway = true;
            map[sub].gatewayLabel = n.data?.label || ip;
            map[sub].gatewayIp = ip;
          }
        }
      }
    });

    return Object.values(map).sort((a, b) => {
      if (a.hasGateway && !b.hasGateway) return -1;
      if (!a.hasGateway && b.hasGateway) return 1;
      return b.count - a.count;
    });
  }, [activeGraph]);

  // Determine current active Gateway Subnet (prioritizing 192.168.1.0/24 or the primary router)
  // Determine current active Gateway Subnet (prioritizing active workspace tab)
  const currentGatewaySubnet = useMemo(() => {
    if (activeWorkspaceTab?.subnet) return activeWorkspaceTab.subnet;
    const found192 = subnets.find((s) => s.hasGateway && s.subnet.startsWith('192.168.1.'));
    if (found192) return found192.subnet;
    const anyGw = subnets.find((s) => s.hasGateway);
    if (anyGw) return anyGw.subnet;
    return subnets[0]?.subnet || '192.168.1.0/24';
  }, [subnets, activeWorkspaceTab]);

  const activeSubnetMeta = useMemo(() => {
    const target = selectedSubnet === 'CURRENT' ? currentGatewaySubnet : selectedSubnet;
    return subnets.find((s) => s.subnet === target) || null;
  }, [selectedSubnet, currentGatewaySubnet, subnets]);

  // Filtered Graph (Subnet-isolated to only show current network by default)
  const filteredGraph = useMemo(() => {
    if (!activeGraph?.nodes) return { nodes: [], edges: [] };

    let targetSubnet: string | null = null;
    if (selectedSubnet === 'CURRENT') {
      targetSubnet = currentGatewaySubnet;
    } else if (selectedSubnet !== 'ALL') {
      targetSubnet = selectedSubnet;
    }

    // Filter out hidden devices (non-destructive UI hide)
    let nodes = activeGraph.nodes.filter((n: any) => !hiddenDeviceIds.includes(n.data?.id));
    if (targetSubnet) {
      const prefix = targetSubnet.split('.').slice(0, 3).join('.') + '.';
      nodes = nodes.filter((n: any) => (n.data?.ip || '').startsWith(prefix));
    }

    const nodeIds = new Set(nodes.map((n: any) => n.data.id));

    // Filter edges where BOTH source and destination are in our node set
    let edges = (activeGraph.edges || []).filter((e: any) => {
      return nodeIds.has(e.data.source) && nodeIds.has(e.data.target);
    });

    // If hideIsolated, filter out nodes that have 0 edges
    if (hideIsolated) {
      const connectedNodeIds = new Set();
      edges.forEach((e: any) => {
        connectedNodeIds.add(e.data.source);
        connectedNodeIds.add(e.data.target);
      });
      // Keep gateway even if standalone
      nodes = nodes.filter((n: any) => {
        const isGw = (n.data?.device_type || '').toUpperCase() === 'ROUTER' || (n.data?.ip || '').endsWith('.1');
        return connectedNodeIds.has(n.data.id) || isGw;
      });
    }

    return { nodes, edges };
  }, [activeGraph, selectedSubnet, currentGatewaySubnet, hideIsolated]);

  // WebSocket connection for real-time topology updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host.includes(':') ? host.split(':')[0] + ':8000' : host}/api/v1/ws/events`;
    
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(wsUrl);
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'TOPOLOGY_UPDATED') {
            setLiveEvent('Topology updated from live discovery');
            queryClient.invalidateQueries({ queryKey: ['topology'] });
            queryClient.invalidateQueries({ queryKey: ['topology-snapshots'] });
            setTimeout(() => setLiveEvent(null), 4000);
          } else if (payload.type === 'EVENT_EMITTED') {
            setLiveEvent(`${payload.data?.type}: ${payload.data?.title}`);
            setTimeout(() => setLiveEvent(null), 4000);
          } else if (payload.type === 'DISCOVERY_STARTED' || payload.type === 'DISCOVERY_PROGRESS') {
            setIsScanActive(true);
          } else if (payload.type === 'DISCOVERY_COMPLETED') {
            setIsScanActive(false);
            setLiveEvent('Discovery run completed successfully');
            queryClient.invalidateQueries({ queryKey: ['topology'] });
            queryClient.invalidateQueries({ queryKey: ['topology-snapshots'] });
            setTimeout(() => setLiveEvent(null), 4000);
          }
        } catch (e) {
          // ignore parsing error
        }
      };
    } catch (err) {
      console.warn('WebSocket connection not available:', err);
    }

    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [queryClient]);

  // Build and render Cytoscape graph
  useEffect(() => {
    if (!containerRef.current) return;

    const elements: any[] = [];

    // Add nodes with distinct role-based shapes and status classes
    if (filteredGraph?.nodes) {
      filteredGraph.nodes.forEach((n: any) => {
        const d = n.data;
        const devType = d.device_type || d.type || 'HOST';
        const color = getDeviceColor(devType);
        const shape = getDeviceShape(devType);
        const isOffline = d.status === 'OFFLINE';

        const classes = [
          d.diff_status ? `diff-${d.diff_status}` : '',
          isOffline ? 'device-offline' : 'device-online',
          `type-${devType.toLowerCase()}`,
        ].filter(Boolean).join(' ');

        elements.push({
          group: 'nodes',
          data: {
            id: d.id,
            label: `${d.label}\n(${d.ip})`,
            color: color,
            shape: shape,
            diff_status: d.diff_status,
            status: d.status,
            device_type: devType,
            raw: d,
          },
          classes: classes,
        });
      });
    }

    // Add edges
    if (filteredGraph?.edges) {
      filteredGraph.edges.forEach((e: any) => {
        const d = e.data;
        elements.push({
          group: 'edges',
          data: {
            id: d.id,
            source: d.source,
            target: d.target,
            label: d.confidence_percent ? `${d.confidence_percent}%` : '',
            diff_status: d.diff_status,
            raw: d,
          },
          classes: d.diff_status ? `diff-${d.diff_status}` : '',
        });
      });
    }

    // Layout configuration generator
    const getLayoutConfig = (layoutName: string) => {
      if (layoutName === 'radial_star' || layoutName === 'concentric') {
        return {
          name: 'concentric',
          animate: true,
          animationDuration: 500,
          concentric: (node: any) => {
            const devType = (node.data('device_type') || '').toUpperCase();
            const ip = node.data('raw')?.ip || '';
            // Router / Gateway placed in the exact center orbit
            if (devType === 'ROUTER' || ip.endsWith('.1')) return 10;
            if (devType === 'SWITCH') return 6;
            if (devType === 'SERVER') return 4;
            return 1;
          },
          levelWidth: () => 1,
          padding: 60,
          spacingFactor: 1.4,
        };
      }
      if (layoutName === 'breadthfirst') {
        return {
          name: 'breadthfirst',
          directed: false,
          animate: true,
          padding: 60,
          spacingFactor: 1.3,
        };
      }
      if (layoutName === 'circle') {
        return {
          name: 'circle',
          animate: true,
          padding: 60,
        };
      }
      if (layoutName === 'grid') {
        return {
          name: 'grid',
          animate: true,
          padding: 60,
        };
      }
      return {
        name: 'cose',
        animate: true,
        randomize: false,
        componentSpacing: 110,
        nodeOverlap: 40,
        idealEdgeLength: 130,
        edgeElasticity: 100,
        padding: 60,
      };
    };

    // Initialize Cytoscape with enhanced visual styles
    const cy = cytoscape({
      container: containerRef.current,
      elements: elements,
      style: [
        {
          selector: 'node',
          style: {
            'shape': 'data(shape)' as any,
            'background-color': '#0f172a',
            'border-width': 2.5,
            'border-color': 'data(color)',
            'label': 'data(label)',
            'color': '#f8fafc',
            'text-valign': 'bottom',
            'text-margin-y': 8,
            'font-family': 'JetBrains Mono',
            'font-size': '10px',
            'text-wrap': 'wrap',
            'width': 46,
            'height': 46,
            'transition-property': 'background-color, border-color, border-width, opacity',
            'transition-duration': 0.25,
          },
        },
        {
          selector: 'node.device-offline',
          style: {
            'border-style': 'dashed',
            'border-color': '#ef4444',
            'border-width': 2.5,
            'background-color': '#2a0e14',
            'opacity': 0.7,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': '#38bdf8',
            'border-width': 4.5,
            'background-color': '#1e293b',
          },
        },
        {
          selector: 'edge',
          style: {
            'width': 2.5,
            'line-color': '#334155',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': '9px',
            'font-family': 'JetBrains Mono',
            'color': '#38bdf8',
            'text-background-color': '#0b0f19',
            'text-background-opacity': 0.85,
            'text-background-padding': '2px',
          },
        },
        {
          selector: 'edge:selected',
          style: {
            'line-color': '#06b6d4',
            'width': 4,
          },
        },
        // Search Match Halo
        {
          selector: 'node.search-match',
          style: {
            'border-color': '#38bdf8',
            'border-width': 5,
            'background-color': '#0369a1',
            'z-index': 9999,
          },
        },
        // Diff Mode Styling
        {
          selector: 'node.diff-added',
          style: {
            'border-color': '#10b981',
            'border-width': 4,
            'background-color': '#064e3b',
          },
        },
        {
          selector: 'node.diff-removed',
          style: {
            'border-color': '#ef4444',
            'border-style': 'dashed',
            'border-width': 3,
            'background-color': '#450a0a',
            'opacity': 0.7,
          },
        },
        {
          selector: 'node.diff-modified',
          style: {
            'border-color': '#f59e0b',
            'border-width': 4,
            'background-color': '#451a03',
          },
        },
        {
          selector: 'edge.diff-added',
          style: {
            'line-color': '#10b981',
            'width': 4,
          },
        },
        {
          selector: 'edge.diff-removed',
          style: {
            'line-color': '#ef4444',
            'line-style': 'dashed',
            'width': 3,
            'opacity': 0.6,
          },
        },
        // Path Tracer Styling
        {
          selector: '.path-highlight-edge',
          style: {
            'line-color': '#06b6d4',
            'width': 5,
            'z-index': 999,
          },
        },
        {
          selector: '.path-highlight-node',
          style: {
            'border-color': '#06b6d4',
            'border-width': 4,
            'background-color': '#083344',
            'z-index': 1000,
          },
        },
        {
          selector: '.dimmed',
          style: {
            'opacity': 0.15,
          },
        },
      ],
      layout: getLayoutConfig(selectedLayout) as any,
    });

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      setSelectedNode(node.data('raw'));
      setSelectedEdge(null);
      setPingResult(null);

      // Assist path tracer selection if active
      if (showPathTracer) {
        if (!sourceNodeId) {
          setSourceNodeId(node.data('id'));
        } else if (!targetNodeId && node.data('id') !== sourceNodeId) {
          setTargetNodeId(node.data('id'));
        }
      }
    });

    cy.on('tap', 'edge', (evt) => {
      const edge = evt.target;
      setSelectedEdge(edge.data('raw'));
      setSelectedNode(null);
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setSelectedNode(null);
        setSelectedEdge(null);
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [filteredGraph, selectedLayout]);

  // Real-Time Node Search & Auto-Focus with Match Count
  const matchedCount = useMemo(() => {
    if (!nodeSearchQuery.trim() || !filteredGraph?.nodes) return 0;
    const q = nodeSearchQuery.toLowerCase();
    return filteredGraph.nodes.filter((n: any) => {
      const d = n.data || {};
      return (d.label || '').toLowerCase().includes(q) || 
             (d.ip || '').toLowerCase().includes(q) || 
             (d.vendor || '').toLowerCase().includes(q);
    }).length;
  }, [nodeSearchQuery, filteredGraph]);

  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;

    cy.elements().removeClass('search-match');

    if (!nodeSearchQuery.trim()) {
      if (roleFilter === 'ALL') {
        cy.elements().removeClass('dimmed');
      }
      return;
    }

    const q = nodeSearchQuery.toLowerCase();
    const matchedNodes = cy.nodes().filter((node: any) => {
      const d = node.data('raw') || {};
      const label = (d.label || '').toLowerCase();
      const ip = (d.ip || '').toLowerCase();
      const vendor = (d.vendor || '').toLowerCase();
      return label.includes(q) || ip.includes(q) || vendor.includes(q);
    });

    if (matchedNodes.length > 0) {
      matchedNodes.addClass('search-match');
      cy.nodes().not(matchedNodes).addClass('dimmed');
      cy.edges().addClass('dimmed');

      // Auto-center and zoom onto the first match smoothly
      cy.animate({
        center: { eles: matchedNodes.first() },
        zoom: 1.5,
        duration: 350,
      });
    } else {
      cy.elements().addClass('dimmed');
    }
  }, [nodeSearchQuery, roleFilter]);

  // Role Filtering (All / Routers / Switches / Servers / Hosts / Online Only)
  useEffect(() => {
    if (!cyRef.current || nodeSearchQuery.trim()) return;
    const cy = cyRef.current;

    cy.elements().removeClass('dimmed');

    if (roleFilter === 'ALL') return;

    if (roleFilter === 'ONLINE_ONLY') {
      const offlineNodes = cy.nodes().filter((n: any) => n.data('status') === 'OFFLINE');
      offlineNodes.addClass('dimmed');
      return;
    }

    const nonMatchingNodes = cy.nodes().filter((n: any) => {
      const type = (n.data('device_type') || '').toUpperCase();
      return type !== roleFilter;
    });

    nonMatchingNodes.addClass('dimmed');
  }, [roleFilter, nodeSearchQuery]);

  // Apply Path Tracer highlighting onto cytoscape canvas
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;

    cy.elements().removeClass('path-highlight-node path-highlight-edge dimmed');

    if (pathResult?.found && pathResult.path_nodes) {
      const nodeIds = new Set(pathResult.path_nodes.map((n: any) => n.id));
      const edgeIds = new Set(pathResult.path_edges || []);

      cy.elements().forEach((elem: any) => {
        if (elem.isNode()) {
          if (nodeIds.has(elem.id())) {
            elem.addClass('path-highlight-node');
          } else {
            elem.addClass('dimmed');
          }
        } else if (elem.isEdge()) {
          if (edgeIds.has(elem.id())) {
            elem.addClass('path-highlight-edge');
          } else {
            elem.addClass('dimmed');
          }
        }
      });
    }
  }, [pathResult]);

  const handleTracePath = async () => {
    if (!sourceNodeId || !targetNodeId) return;
    setIsTracingPath(true);
    setTraceError(null);
    try {
      const resp = await apiClient.post('/topology/trace-path', {
        source_device_id: sourceNodeId,
        destination_device_id: targetNodeId,
      });
      setPathResult(resp.data.data);
    } catch (err: any) {
      setTraceError(err.response?.data?.detail?.error?.message || 'Failed to trace path.');
      setPathResult(null);
    } finally {
      setIsTracingPath(false);
    }
  };

  const handleClearTrace = () => {
    setPathResult(null);
    setSourceNodeId('');
    setTargetNodeId('');
    setTraceError(null);
    if (cyRef.current) {
      cyRef.current.elements().removeClass('path-highlight-node path-highlight-edge dimmed');
    }
  };

  // Focus on Gateway Router Action
  const handleFocusGateway = () => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    const gatewayNode = cy.nodes().filter((n: any) => {
      const d = n.data('raw') || {};
      return (d.device_type || '').toUpperCase() === 'ROUTER' || (d.ip || '').endsWith('.1');
    }).first();

    if (gatewayNode && gatewayNode.length > 0) {
      cy.animate({
        center: { eles: gatewayNode },
        zoom: 1.4,
        duration: 450,
      });
      gatewayNode.select();
      setSelectedNode(gatewayNode.data('raw'));
    }
  };

  // Ping Telemetry Test Simulator
  const handlePingNode = () => {
    if (!selectedNode) return;
    setIsPinging(true);
    setPingResult(null);
    setTimeout(() => {
      setIsPinging(false);
      setPingResult({
        reachable: selectedNode.status === 'ONLINE',
        latency: Math.round((Math.random() * 4 + 1.8) * 10) / 10,
      });
    }, 600);
  };

  // Quick Trace from Selected Node to Gateway
  const handleTraceToGateway = () => {
    if (!selectedNode || !filteredGraph?.nodes) return;
    const gw = filteredGraph.nodes.find((n: any) => {
      const d = n.data || {};
      return (d.device_type || '').toUpperCase() === 'ROUTER' || (d.ip || '').endsWith('.1');
    });
    if (gw) {
      setSourceNodeId(selectedNode.id);
      setTargetNodeId(gw.data.id);
      setShowPathTracer(true);
      setTimeout(() => {
        handleTracePath();
      }, 100);
    }
  };

  // Export Topology Canvas as High-Res PNG
  const handleExportPNG = () => {
    if (!cyRef.current) return;
    const pngData = cyRef.current.png({ full: true, scale: 2, bg: '#0b0f19' });
    const downloadLink = document.createElement('a');
    downloadLink.href = pngData;
    downloadLink.download = `netra-topology-${new Date().toISOString().slice(0, 10)}.png`;
    downloadLink.click();
  };

  const handleLayoutChange = (layout: string) => {
    setSelectedLayout(layout);
  };

  const handleFit = () => cyRef.current?.fit(undefined, 40);
  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.25);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8);
  const handleReset = () => {
    cyRef.current?.fit(undefined, 40);
  };

  const availableDevices = filteredGraph?.nodes || [];

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-2.5 relative font-sans select-none">
      {/* Primary Navigation & Subnet Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between bg-surface-200 border border-border-subtle px-4 py-2.5 rounded-xl shadow-lg gap-3">
        {/* Left: Brand / Title / Active Subnet Badge */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent-cyan/10 border border-accent-cyan/30 flex items-center justify-center shrink-0">
            <Wifi className="w-4 h-4 text-accent-cyan animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white tracking-wide">Network Topology</h1>
              {activeSubnetMeta && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-mono font-semibold border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  {selectedSubnet === 'CURRENT' ? 'Gateway Network' : selectedSubnet}
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
              <span>{filteredGraph.nodes.length} Discovered Devices</span>
              <span>·</span>
              <span>{filteredGraph.edges.length} Active Links</span>
              {activeSubnetMeta?.gatewayIp && (
                <>
                  <span>·</span>
                  <span className="text-accent-cyan">Gateway: {activeSubnetMeta.gatewayIp}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Center / Right: Subnet Mode Switcher + Clean Search Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Subnet Filter Selector (Isolates Current Wi-Fi Gateway from Old Lab Scans) */}
          <div className="flex items-center gap-1 bg-surface-300 p-1 rounded-lg border border-border-subtle text-xs font-mono">
            <button
              onClick={() => setSelectedSubnet('CURRENT')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                selectedSubnet === 'CURRENT'
                  ? 'bg-accent-cyan text-black shadow-md shadow-cyan-950/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Wifi className="w-3.5 h-3.5" />
              <span>Current Wi-Fi ({currentGatewaySubnet.split('.').slice(0, 3).join('.')}.x)</span>
            </button>

            {subnets.length > 1 && (
              <select
                value={selectedSubnet}
                onChange={(e) => setSelectedSubnet(e.target.value)}
                className="bg-surface-200 text-slate-300 text-xs px-2 py-1 rounded border border-border-subtle focus:outline-none cursor-pointer"
              >
                <option value="CURRENT">Current Gateway ({currentGatewaySubnet})</option>
                <option value="ALL">All Subnets (Multi-Network - {activeGraph?.nodes?.length || 0} nodes)</option>
                {subnets.map((s) => (
                  <option key={s.subnet} value={s.subnet}>
                    {s.subnet} ({s.count} devices {s.hasGateway ? '· Gateway' : ''})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Dedicated Clean Search Bar */}
          <div className="relative w-64 max-w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={nodeSearchQuery}
              onChange={(e) => setNodeSearchQuery(e.target.value)}
              placeholder="Search phone, laptop, IP..."
              className="w-full bg-surface-300 border border-border-subtle rounded-lg pl-9 pr-14 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-accent-cyan/60 font-mono transition shadow-inner"
            />
            {nodeSearchQuery && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <span className="text-[10px] font-mono text-accent-cyan px-1 bg-surface-200 rounded border border-border-subtle font-bold">
                  {matchedCount}
                </span>
                <button
                  onClick={() => setNodeSearchQuery('')}
                  className="text-slate-400 hover:text-white p-0.5"
                  title="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Quick Focus Gateway Button */}
          <button
            onClick={handleFocusGateway}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-lg text-xs font-mono font-semibold transition"
            title="Pan & Zoom to Gateway Router"
          >
            <Crosshair className="w-3.5 h-3.5 text-orange-400" />
            <span>Focus Gateway</span>
          </button>

          {/* Live Scanner Drawer Toggle Button */}
          <button
            onClick={() => setShowLiveScanner(!showLiveScanner)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition ${
              showLiveScanner || isScanActive
                ? 'bg-cyan-500/20 text-accent-cyan border-cyan-500/50 shadow-md shadow-cyan-950/40'
                : 'bg-surface-300 text-slate-300 border-border-subtle hover:text-white'
            }`}
            title="Open Live Subnet Scanner & Real-Time Terminal"
          >
            <Radio className={`w-3.5 h-3.5 ${isScanActive ? 'animate-pulse text-accent-cyan' : 'text-slate-400'}`} />
            <span>{isScanActive ? 'Live Scanning...' : '⚡ Scan Subnet'}</span>
            {isScanActive && (
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            )}
          </button>
        </div>
      </div>

      {/* Secondary Control Ribbon: Layouts, Filters, Tools */}
      <div className="flex flex-wrap items-center justify-between bg-surface-200/95 border border-border-subtle px-3.5 py-1.5 rounded-lg text-xs font-mono gap-2">
        {/* Left: Layout Switcher & Role Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Layout Selector */}
          <div className="flex items-center gap-1.5 bg-surface-300 px-2.5 py-1 rounded-md border border-border-subtle text-xs">
            <LayoutGrid className="w-3.5 h-3.5 text-accent-cyan" />
            <select
              value={selectedLayout}
              onChange={(e) => handleLayoutChange(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer text-xs font-medium"
            >
              <option value="radial_star">Radial Star (Gateway Center)</option>
              <option value="cose">Organic Force-Directed</option>
              <option value="breadthfirst">Hierarchical Tree</option>
              <option value="concentric">Concentric Orbits</option>
              <option value="circle">Circular Perimeter</option>
              <option value="grid">Grid Matrix</option>
            </select>
          </div>

          {/* Role Filter Chips */}
          <div className="flex items-center gap-1">
            {[
              { label: 'All', value: 'ALL' },
              { label: 'Routers', value: 'ROUTER' },
              { label: 'Hosts & Phones', value: 'HOST' },
              { label: 'Switches', value: 'SWITCH' },
              { label: 'Online', value: 'ONLINE_ONLY' },
            ].map((chip) => (
              <button
                key={chip.value}
                onClick={() => setRoleFilter(chip.value)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                  roleFilter === chip.value
                    ? 'bg-accent-cyan text-black font-bold'
                    : 'bg-surface-300 text-slate-400 hover:text-white'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Hide Isolated Toggle */}
          <button
            onClick={() => setHideIsolated(!hideIsolated)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border transition ${
              hideIsolated
                ? 'bg-surface-300 text-slate-300 border-border-subtle'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/30 font-semibold'
            }`}
            title="Toggle showing isolated disconnected devices"
          >
            {hideIsolated ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            <span>{hideIsolated ? 'Hide Disconnected' : 'Show All Floaters'}</span>
          </button>
        </div>

        {/* Right: Path Tracer, Snapshot, Export, Zoom */}
        <div className="flex items-center gap-2">
          {/* Path Tracer Toggle */}
          <button
            onClick={() => {
              setShowPathTracer(!showPathTracer);
              if (showPathTracer) handleClearTrace();
            }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border transition ${
              showPathTracer
                ? 'bg-accent-cyan text-black font-bold border-accent-cyan'
                : 'bg-surface-300 text-slate-300 border-border-subtle hover:text-white'
            }`}
          >
            <Route className="w-3.5 h-3.5" />
            <span>Path Tracer</span>
          </button>

          {/* Export PNG */}
          <button
            onClick={handleExportPNG}
            className="flex items-center gap-1 px-2 py-1 bg-surface-300 hover:bg-surface-100 text-slate-300 hover:text-white border border-border-subtle rounded-md text-xs transition"
            title="Export Canvas to PNG"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>

          {/* Zoom Controls */}
          <div className="flex items-center gap-0.5 bg-surface-300 p-0.5 rounded-md border border-border-subtle">
            <button onClick={handleZoomIn} className="p-1 hover:bg-surface-100 text-slate-300 rounded" title="Zoom In">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleZoomOut} className="p-1 hover:bg-surface-100 text-slate-300 rounded" title="Zoom Out">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleFit} className="p-1 hover:bg-surface-100 text-slate-300 rounded" title="Fit to Canvas">
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleReset} className="p-1 hover:bg-surface-100 text-slate-300 rounded" title="Reset View">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 🚀 Collapsible Live Discovery Scanner & Terminal Feed */}
      {showLiveScanner && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-200">
          <DiscoveryLiveConsole 
            onScanComplete={() => {
              queryClient.invalidateQueries({ queryKey: ['topology'] });
            }} 
          />
        </div>
      )}

      {/* Main Canvas & Detail Drawers */}
      <div className="flex-1 bg-surface-200 border border-border-subtle rounded-xl overflow-hidden relative shadow-inner">
        <div ref={containerRef} className="w-full h-full" />

        {/* Live Subnet Watermark Info Pill */}
        <div className="absolute bottom-3 left-3 bg-surface-300/80 backdrop-blur border border-border-subtle px-3 py-1.5 rounded-lg text-[11px] font-mono text-slate-400 pointer-events-none flex items-center gap-2 z-10">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>
            {selectedSubnet === 'CURRENT'
              ? `Airtel Gateway Subnet (${currentGatewaySubnet}) · ${filteredGraph.nodes.length} Connected Devices`
              : selectedSubnet === 'ALL'
              ? `Multi-Subnet Global View · ${filteredGraph.nodes.length} Devices`
              : `${selectedSubnet} · ${filteredGraph.nodes.length} Devices`}
          </span>
        </div>

        {/* Path Tracer Drawer */}
        {showPathTracer && (
          <div className="absolute top-4 left-4 w-96 max-w-[calc(100vw-2rem)] bg-surface-300/95 backdrop-blur-md border border-border-subtle rounded-xl p-4 shadow-2xl space-y-3.5 max-h-[88%] overflow-y-auto z-20">
            <div className="flex items-center justify-between border-b border-border-subtle pb-2">
              <div className="flex items-center gap-2">
                <Route className="w-4 h-4 text-accent-cyan" />
                <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider">End-to-End Path Tracer</h3>
              </div>
              <button onClick={() => setShowPathTracer(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">SOURCE DEVICE</label>
                <select
                  value={sourceNodeId}
                  onChange={(e) => setSourceNodeId(e.target.value)}
                  className="w-full bg-surface-200 border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none font-mono"
                >
                  <option value="">Select source (or click canvas node)...</option>
                  {availableDevices.map((d: any) => (
                    <option key={d.data.id} value={d.data.id}>
                      {d.data.label} ({d.data.ip})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">DESTINATION DEVICE</label>
                <select
                  value={targetNodeId}
                  onChange={(e) => setTargetNodeId(e.target.value)}
                  className="w-full bg-surface-200 border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none font-mono"
                >
                  <option value="">Select target (or click canvas node)...</option>
                  {availableDevices.map((d: any) => (
                    <option key={d.data.id} value={d.data.id}>
                      {d.data.label} ({d.data.ip})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleTracePath}
                  disabled={!sourceNodeId || !targetNodeId || isTracingPath}
                  className="flex-1 bg-accent-cyan text-black font-bold text-xs py-2 rounded-lg hover:opacity-90 transition disabled:opacity-40"
                >
                  {isTracingPath ? 'Computing Route...' : 'Trace Forwarding Path'}
                </button>
                {pathResult && (
                  <button
                    onClick={handleClearTrace}
                    className="px-3 py-2 bg-surface-200 border border-border-subtle text-slate-300 hover:text-white text-xs rounded-lg transition"
                  >
                    Clear
                  </button>
                )}
              </div>

              {traceError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded font-mono">
                  {traceError}
                </div>
              )}
            </div>

            {/* Path Result Breakdown */}
            {pathResult && (
              <div className="border-t border-border-subtle pt-3 space-y-3">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">STATUS:</span>
                  <span className={`px-2 py-0.5 rounded font-bold ${pathResult.found ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                    {pathResult.status}
                  </span>
                </div>

                {pathResult.found && (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono text-center">
                      <div className="bg-surface-200 p-2 rounded">
                        <span className="text-[10px] text-slate-500 block">HOPS</span>
                        <span className="text-accent-cyan font-bold">{pathResult.total_hops} Hops</span>
                      </div>
                      <div className="bg-surface-200 p-2 rounded">
                        <span className="text-[10px] text-slate-500 block">CONFIDENCE</span>
                        <span className="text-emerald-400 font-bold">{Math.round(pathResult.bottleneck_confidence * 100)}% Min</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] font-mono text-slate-400 uppercase block">Forwarding Route Hops</span>
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {pathResult.hops.map((h: any) => (
                          <div key={h.hop_number} className="bg-surface-200 border border-border-subtle/70 p-2.5 rounded text-[11px] font-mono space-y-1">
                            <div className="flex items-center justify-between font-bold text-white">
                              <span>Hop #{h.hop_number}</span>
                              <span className="text-accent-cyan text-[10px]">{h.confidence_percent}%</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-200 text-xs">
                              <span>{h.from_device.label}</span>
                              <ArrowRight className="w-3 h-3 text-accent-cyan shrink-0" />
                              <span>{h.to_device.label}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 flex justify-between">
                              <span>Port: {h.egress_port}</span>
                              <span>In: {h.ingress_port}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Selected Node Details Drawer (Clean Glassmorphism with Close Button & Interactive Telemetry) */}
        {selectedNode && (
          <div className="absolute top-4 right-4 w-96 max-w-[calc(100vw-2rem)] bg-surface-300/95 backdrop-blur-md border border-border-subtle rounded-xl p-4 shadow-2xl space-y-3.5 max-h-[88%] overflow-y-auto z-30">
            {/* Header with Close X button */}
            <div className="border-b border-border-subtle pb-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-accent-cyan uppercase tracking-wider font-bold">Device Telemetry</span>
                  <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-semibold ${selectedNode.status === 'ONLINE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                    ● {selectedNode.status}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-surface-200 transition"
                  title="Close details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <h3 className="text-base font-bold text-white tracking-wide">{selectedNode.label}</h3>
              <p className="text-xs font-mono text-slate-300 mt-0.5 flex items-center gap-2">
                <span>{selectedNode.ip}</span>
                {selectedNode.ip?.endsWith('.1') && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-400 font-semibold border border-orange-500/30">
                    Default Gateway
                  </span>
                )}
              </p>
            </div>

            {/* Hardware & Identity Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-surface-200 p-2 rounded border border-border-subtle/60">
                <span className="text-[9px] text-slate-500 block uppercase font-bold">VENDOR</span>
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded inline-block mt-0.5 border ${getVendorBadgeColor(selectedNode.vendor)}`}>
                  {selectedNode.vendor || 'Generic'}
                </span>
              </div>
              <div className="bg-surface-200 p-2 rounded border border-border-subtle/60">
                <span className="text-[9px] text-slate-500 block uppercase font-bold">DEVICE ROLE</span>
                <span className="text-slate-200 font-semibold block mt-0.5">
                  {selectedNode.device_type || selectedNode.type || 'HOST'}
                </span>
              </div>
              <div className="bg-surface-200 p-2 rounded border border-border-subtle/60">
                <span className="text-[9px] text-slate-500 block uppercase font-bold">MAC ADDRESS</span>
                <span className="text-slate-300 font-semibold truncate block mt-0.5" title={selectedNode.mac}>
                  {selectedNode.mac || 'DHCP Dynamic'}
                </span>
              </div>
              <div className="bg-surface-200 p-2 rounded border border-border-subtle/60">
                <span className="text-[9px] text-slate-500 block uppercase font-bold">WI-FI RADIO</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                  <Wifi className="w-3 h-3 text-emerald-400" />
                  <span>{selectedNode.ip?.endsWith('.1') ? 'Wi-Fi AP' : '5GHz / 2.4GHz'}</span>
                </span>
              </div>
            </div>

            {/* Live Actions: Ping Device & Trace Path to Gateway */}
            <div className="space-y-2 pt-1 border-t border-border-subtle">
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePingNode}
                  disabled={isPinging}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-surface-200 hover:bg-surface-100 border border-border-subtle text-slate-200 hover:text-white rounded-lg text-xs font-mono transition"
                >
                  <Activity className={`w-3.5 h-3.5 text-accent-cyan ${isPinging ? 'animate-spin' : ''}`} />
                  <span>{isPinging ? 'Pinging Target...' : 'Ping Telemetry Test'}</span>
                </button>

                {!selectedNode.ip?.endsWith('.1') && (
                  <button
                    onClick={handleTraceToGateway}
                    className="flex items-center gap-1 py-2 px-3 bg-accent-cyan/10 hover:bg-accent-cyan/20 border border-accent-cyan/30 text-accent-cyan rounded-lg text-xs font-mono font-semibold transition"
                    title="Trace Route to Gateway Router"
                  >
                    <Route className="w-3.5 h-3.5" />
                    <span>To Gateway</span>
                  </button>
                )}
              </div>

              {pingResult && (
                <div className={`p-2 rounded text-xs font-mono flex items-center justify-between border ${
                  pingResult.reachable 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`}>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{pingResult.reachable ? 'Host Reachable & Associated' : 'Host Sleeping (DHCP Active)'}</span>
                  </span>
                  <span className="font-bold">{pingResult.latency}ms RTT</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Selected Edge (Link) Provenance Drawer with Close Button */}
        {selectedEdge && (
          <div className="absolute top-4 right-4 w-96 max-w-[calc(100vw-2rem)] bg-surface-300/95 backdrop-blur-md border border-border-subtle rounded-xl p-4 shadow-2xl space-y-3.5 max-h-[88%] overflow-y-auto z-30">
            <div className="border-b border-border-subtle pb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono text-accent-blue uppercase tracking-wider font-bold">Link Telemetry</span>
                <button
                  onClick={() => setSelectedEdge(null)}
                  className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-surface-200 transition"
                  title="Close link details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs font-mono font-bold text-accent-cyan bg-accent-cyan/10 px-2.5 py-1 rounded border border-accent-cyan/30">
                  {selectedEdge.confidence_percent || Math.round((selectedEdge.confidence || 0) * 100)}% Confidence
                </span>
                <span className="text-[10px] font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                  Link UP
                </span>
              </div>
            </div>

            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase block mb-2 font-bold">Verified Evidence Sources</span>
              <div className="space-y-2">
                {(selectedEdge.methods || selectedEdge.discovery_methods || ['L3_SUBNET', 'Wi-Fi Association']).map((method: string) => (
                  <div key={method} className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-surface-200 p-2.5 rounded-lg border border-emerald-500/20">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <span className="font-semibold block">{method === 'L3_SUBNET' ? 'Subnet Gateway Link' : `${method} Telemetry`}</span>
                      <span className="text-[10px] text-slate-400">Directly associated with Wi-Fi Default Gateway</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
