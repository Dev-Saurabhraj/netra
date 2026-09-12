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
  Filter
} from 'lucide-react';
import { apiClient } from '../../lib/api';

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

export const TopologyPage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const queryClient = useQueryClient();
  
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [selectedEdge, setSelectedEdge] = useState<any>(null);
  const [liveEvent, setLiveEvent] = useState<string | null>(null);

  // Search & Filter States
  const [nodeSearchQuery, setNodeSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [selectedLayout, setSelectedLayout] = useState<string>('cose');

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

  // Active graph to render
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
    if (activeGraph?.nodes) {
      activeGraph.nodes.forEach((n: any) => {
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
    if (activeGraph?.edges) {
      activeGraph.edges.forEach((e: any) => {
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
            'text-margin-y': 7,
            'font-family': 'JetBrains Mono',
            'font-size': '10px',
            'text-wrap': 'wrap',
            'width': 44,
            'height': 44,
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
            'opacity': 0.75,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': '#38bdf8',
            'border-width': 4,
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
        // Search Match Styling
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
      layout: {
        name: selectedLayout,
        animate: true,
      } as any,
    });

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      setSelectedNode(node.data('raw'));
      setSelectedEdge(null);

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
  }, [activeGraph, showPathTracer, sourceNodeId, targetNodeId, selectedLayout]);

  // Real-Time Node Search & Auto-Focus
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

      // Auto-center and zoom onto the first match
      cy.animate({
        center: { eles: matchedNodes.first() },
        zoom: 1.6,
        duration: 400,
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
    if (cyRef.current) {
      cyRef.current.layout({ name: layout, animate: true } as any).run();
    }
  };

  const handleFit = () => cyRef.current?.fit();
  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.2);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8);
  const handleReset = () => {
    cyRef.current?.layout({ name: selectedLayout, animate: true } as any).run();
  };

  const availableDevices = liveTopoRes?.nodes || [];

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-3 relative font-sans">
      {/* Top Primary Control & Toolbar */}
      <div className="flex flex-wrap items-center justify-between bg-surface-200 border border-border-subtle px-4 py-2 rounded-xl shadow-lg gap-3">
        <div className="flex items-center gap-3">
          <Network className="w-5 h-5 text-accent-cyan animate-pulse shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
              <span>Interactive Topology Canvas</span>
              {selectedSnapshotId !== 'live' && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono font-semibold border border-amber-500/30">
                  Historical Snapshot View
                </span>
              )}
            </h1>
            <span className="text-[10px] text-slate-400 font-mono">
              {activeGraph?.nodes?.length || 0} Nodes · {activeGraph?.edges?.length || 0} Links
            </span>
          </div>
        </div>

        {/* Live Notification Banner */}
        {liveEvent && (
          <div className="flex items-center gap-2 bg-accent-cyan/10 border border-accent-cyan/30 px-3 py-1 rounded-full text-accent-cyan text-xs font-mono animate-bounce">
            <Radio className="w-3.5 h-3.5" />
            <span>{liveEvent}</span>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Node Search Bar in Canvas */}
          <div className="relative w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={nodeSearchQuery}
              onChange={(e) => setNodeSearchQuery(e.target.value)}
              placeholder="Find node / IP..."
              className="w-full bg-surface-300 border border-border-subtle rounded-lg pl-8 pr-7 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-accent-cyan/50 font-mono"
            />
            {nodeSearchQuery && (
              <button
                onClick={() => setNodeSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Layout Switcher (Tree / Force / Concentric / Grid) */}
          <div className="flex items-center gap-1 bg-surface-300 px-2 py-1 rounded-lg border border-border-subtle text-xs font-mono">
            <LayoutGrid className="w-3.5 h-3.5 text-accent-cyan" />
            <select
              value={selectedLayout}
              onChange={(e) => handleLayoutChange(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer text-xs"
            >
              <option value="cose">Force-Directed (Organic)</option>
              <option value="breadthfirst">Hierarchical Tree</option>
              <option value="concentric">Concentric (Radial)</option>
              <option value="grid">Grid Alignment</option>
            </select>
          </div>

          {/* Time-Travel Dropdown */}
          <div className="flex items-center gap-1.5 bg-surface-300 px-2.5 py-1 rounded-lg border border-border-subtle text-xs font-mono">
            <History className="w-3.5 h-3.5 text-accent-blue" />
            <select
              value={selectedSnapshotId}
              onChange={(e) => {
                setSelectedSnapshotId(e.target.value);
                handleClearTrace();
              }}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer text-xs"
            >
              <option value="live">Live Topology (Current)</option>
              {snapshotsRes?.map((s: any) => (
                <option key={s.id} value={s.id}>
                  Snapshot ({new Date(s.created_at).toLocaleTimeString()}) - {s.node_count} nodes
                </option>
              ))}
            </select>
          </div>

          {/* Time-Travel Diff Toggle */}
          {selectedSnapshotId !== 'live' && (
            <button
              onClick={() => setIsDiffMode(!isDiffMode)}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded-lg border transition ${
                isDiffMode
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 font-bold'
                  : 'bg-surface-300 text-slate-300 border-border-subtle hover:text-white'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>{isDiffMode ? 'Diff Active' : 'Show Diff'}</span>
            </button>
          )}

          {/* Path Tracer Toggle Button */}
          <button
            onClick={() => {
              setShowPathTracer(!showPathTracer);
              if (showPathTracer) handleClearTrace();
            }}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded-lg border transition ${
              showPathTracer
                ? 'bg-accent-cyan text-black border-accent-cyan font-bold shadow-lg shadow-cyan-950/40'
                : 'bg-surface-300 text-slate-300 border-border-subtle hover:text-white'
            }`}
          >
            <Route className="w-3.5 h-3.5" />
            <span>Path Tracer</span>
          </button>

          {/* Export PNG */}
          <button
            onClick={handleExportPNG}
            title="Download PNG Diagram"
            className="flex items-center gap-1 px-2.5 py-1 bg-surface-300 hover:bg-surface-100 text-slate-300 hover:text-white border border-border-subtle rounded-lg text-xs font-mono transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>

          {/* Cytoscape Zoom/Fit Controls */}
          <div className="flex items-center gap-1 bg-surface-300 p-1 rounded-lg border border-border-subtle">
            <button onClick={handleZoomIn} className="p-1 hover:bg-surface-100 text-slate-300 rounded transition-colors" title="Zoom In">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleZoomOut} className="p-1 hover:bg-surface-100 text-slate-300 rounded transition-colors" title="Zoom Out">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleFit} className="p-1 hover:bg-surface-100 text-slate-300 rounded transition-colors" title="Fit to Screen">
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleReset} className="p-1 hover:bg-surface-100 text-slate-300 rounded transition-colors" title="Reorganize Layout">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Sub-Toolbar: Role Filter Chips & Legend */}
      <div className="flex flex-wrap items-center justify-between bg-surface-200/90 border border-border-subtle px-4 py-1.5 rounded-lg text-xs font-mono gap-2">
        {/* Device Filter Chips */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-400 font-bold flex items-center gap-1 mr-1">
            <Filter className="w-3 h-3 text-accent-cyan" /> Filter:
          </span>
          {[
            { label: 'All', value: 'ALL' },
            { label: 'Routers', value: 'ROUTER' },
            { label: 'Switches', value: 'SWITCH' },
            { label: 'Servers', value: 'SERVER' },
            { label: 'Hosts', value: 'HOST' },
            { label: 'Online Only', value: 'ONLINE_ONLY' },
          ].map((chip) => (
            <button
              key={chip.value}
              onClick={() => setRoleFilter(chip.value)}
              className={`px-2 py-0.5 rounded text-[11px] transition ${
                roleFilter === chip.value
                  ? 'bg-accent-cyan text-black font-bold'
                  : 'bg-surface-300 text-slate-400 hover:text-white'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Visual Shape & Color Legend */}
        <div className="hidden lg:flex items-center gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rotate-45 border border-orange-500 bg-orange-500/20 inline-block"></span>
            Router (Diamond)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-2 rounded-sm border border-cyan-500 bg-cyan-500/20 inline-block"></span>
            Switch (Round-Rect)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 border border-emerald-500 bg-emerald-500/20 inline-block"></span>
            Server (Square)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full border border-purple-500 bg-purple-500/20 inline-block"></span>
            Host (Circle)
          </span>
        </div>
      </div>

      {/* Diff Legend Pill */}
      {isDiffMode && historyData?.summary && (
        <div className="flex items-center gap-4 bg-surface-200 border border-border-subtle px-4 py-1.5 rounded-lg text-xs font-mono">
          <span className="text-slate-400 font-bold flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-accent-cyan" /> Snapshot Differential:
          </span>
          <span className="text-emerald-400 font-semibold">+{historyData.summary.added_nodes_count} Nodes Added</span>
          <span className="text-red-400 font-semibold">-{historyData.summary.removed_nodes_count} Nodes Removed</span>
          <span className="text-amber-400 font-semibold">~{historyData.summary.modified_nodes_count} Modified</span>
          <span className="text-slate-400 ml-auto text-[11px]">Green: Added · Red (Dashed): Removed · Amber: Changed</span>
        </div>
      )}

      {/* Canvas & Detail Drawer Container */}
      <div className="flex-1 bg-surface-200 border border-border-subtle rounded-xl overflow-hidden relative shadow-inner">
        <div ref={containerRef} className="w-full h-full" />

        {/* Path Tracer Drawer */}
        {showPathTracer && (
          <div className="absolute top-4 left-4 w-96 bg-surface-300/95 backdrop-blur border border-border-subtle rounded-xl p-4 shadow-2xl space-y-4 max-h-[88%] overflow-y-auto z-20">
            <div className="flex items-center justify-between border-b border-border-subtle pb-2">
              <div className="flex items-center gap-2">
                <Route className="w-4 h-4 text-accent-cyan" />
                <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider">End-to-End Path Tracer</h3>
              </div>
              <button onClick={() => setShowPathTracer(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">SOURCE DEVICE</label>
                <select
                  value={sourceNodeId}
                  onChange={(e) => setSourceNodeId(e.target.value)}
                  className="w-full bg-surface-200 border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                >
                  <option value="">Select source (or tap canvas node)...</option>
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
                  className="w-full bg-surface-200 border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                >
                  <option value="">Select target (or tap canvas node)...</option>
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
                  className="flex-1 bg-accent-cyan text-black font-semibold text-xs py-2 rounded-lg hover:opacity-90 transition disabled:opacity-40"
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

        {/* Selected Node Details Drawer */}
        {selectedNode && (
          <div className="absolute top-4 right-4 w-84 bg-surface-300/95 backdrop-blur border border-border-subtle rounded-xl p-4 shadow-2xl space-y-4 max-h-[85%] overflow-y-auto z-10">
            <div className="border-b border-border-subtle pb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono text-accent-cyan uppercase tracking-wider">Device Telemetry</span>
                <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-semibold ${selectedNode.status === 'ONLINE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                  {selectedNode.status}
                </span>
              </div>
              <h3 className="text-sm font-bold text-white">{selectedNode.label}</h3>
              <p className="text-xs font-mono text-slate-300">{selectedNode.ip}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-surface-200 p-2 rounded">
                <span className="text-[9px] text-slate-500 block">VENDOR</span>
                <span className="text-slate-200 font-semibold">{selectedNode.vendor || 'Generic'}</span>
              </div>
              <div className="bg-surface-200 p-2 rounded">
                <span className="text-[9px] text-slate-500 block">ROLE</span>
                <span className="text-slate-200 font-semibold">{selectedNode.device_type || selectedNode.type}</span>
              </div>
              <div className="bg-surface-200 p-2 rounded">
                <span className="text-[9px] text-slate-500 block">MAC ADDR</span>
                <span className="text-slate-200 font-semibold truncate block">{selectedNode.mac || 'N/A'}</span>
              </div>
              <div className="bg-surface-200 p-2 rounded">
                <span className="text-[9px] text-slate-500 block">INTERFACES</span>
                <span className="text-slate-200 font-semibold">{selectedNode.interface_count || selectedNode.interfaces_count || 0} Ports</span>
              </div>
            </div>
          </div>
        )}

        {/* Selected Edge (Link) Evidence & Confidence Drawer */}
        {selectedEdge && (
          <div className="absolute top-4 right-4 w-84 bg-surface-300/95 backdrop-blur border border-border-subtle rounded-xl p-4 shadow-2xl space-y-4 max-h-[85%] overflow-y-auto z-10">
            <div className="border-b border-border-subtle pb-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-accent-blue uppercase tracking-wider">Topology Provenance</span>
                <span className="text-xs font-mono font-bold text-accent-cyan bg-accent-cyan/10 px-2 py-0.5 rounded border border-accent-cyan/30">
                  {selectedEdge.confidence_percent || Math.round((selectedEdge.confidence || 0) * 100)}% Confidence
                </span>
              </div>
              <p className="text-xs text-white font-mono mt-2 font-semibold">
                {selectedEdge.source_label || selectedEdge.source_port} ↔ {selectedEdge.target_label || selectedEdge.target_port}
              </p>
            </div>

            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase block mb-2">Discovery Evidence Sources</span>
              <div className="space-y-1.5">
                {(selectedEdge.methods || selectedEdge.discovery_methods || ['L2/L3 Adjacency']).map((method: string) => (
                  <div key={method} className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-surface-200 p-2 rounded border border-emerald-500/20">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="font-semibold">{method} Telemetry Verified</span>
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
