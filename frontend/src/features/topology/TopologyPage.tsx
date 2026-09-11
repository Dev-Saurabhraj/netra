import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import cytoscape, { Core } from 'cytoscape';
import { 
  Network, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  RotateCcw, 
  CheckCircle2, 
  HelpCircle, 
  ShieldCheck, 
  Radio 
} from 'lucide-react';
import { apiClient } from '../../lib/api';

export const TopologyPage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [selectedEdge, setSelectedEdge] = useState<any>(null);

  const { data: topoRes, isLoading, refetch } = useQuery({
    queryKey: ['topology'],
    queryFn: () => apiClient.get('/topology').then((r) => r.data.data),
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const elements: any[] = [];

    // Add nodes
    if (topoRes?.nodes) {
      topoRes.nodes.forEach((n: any) => {
        elements.push({
          group: 'nodes',
          data: {
            id: n.data.id,
            label: `${n.data.label}\n(${n.data.ip})`,
            raw: n.data,
          },
        });
      });
    }

    // Add edges
    if (topoRes?.edges) {
      topoRes.edges.forEach((e: any) => {
        elements.push({
          group: 'edges',
          data: {
            id: e.data.id,
            source: e.data.source,
            target: e.data.target,
            label: `${e.data.confidence_percent}%`,
            raw: e.data,
          },
        });
      });
    }

    // Initialize Cytoscape
    const cy = cytoscape({
      container: containerRef.current,
      elements: elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#1e293b',
            'border-width': 2,
            'border-color': '#06b6d4',
            'label': 'data(label)',
            'color': '#f8fafc',
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'font-family': 'JetBrains Mono',
            'font-size': '10px',
            'text-wrap': 'wrap',
            'width': 44,
            'height': 44,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': '#3b82f6',
            'border-width': 4,
            'background-color': '#0f172a',
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
            'text-background-opacity': 0.8,
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
      ],
      layout: {
        name: 'cose',
        animate: true,
      },
    });

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      setSelectedNode(node.data('raw'));
      setSelectedEdge(null);
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
  }, [topoRes]);

  const handleFit = () => cyRef.current?.fit();
  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.2);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8);
  const handleReset = () => {
    cyRef.current?.layout({ name: 'cose', animate: true }).run();
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-4 relative">
      {/* Topology Toolbar */}
      <div className="flex items-center justify-between bg-surface-200 border border-border-subtle px-4 py-2.5 rounded-xl">
        <div className="flex items-center gap-3">
          <Network className="w-5 h-5 text-accent-cyan" />
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide">Interactive Topology Graph</h1>
            <span className="text-[10px] text-slate-400 font-mono">Evidence-driven adjacency rendering</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5 bg-surface-300 p-1 rounded-lg border border-border-subtle">
          <button onClick={handleZoomIn} className="p-1.5 hover:bg-surface-100 text-slate-300 rounded" title="Zoom In">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={handleZoomOut} className="p-1.5 hover:bg-surface-100 text-slate-300 rounded" title="Zoom Out">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={handleFit} className="p-1.5 hover:bg-surface-100 text-slate-300 rounded" title="Fit to Screen">
            <Maximize2 className="w-4 h-4" />
          </button>
          <button onClick={handleReset} className="p-1.5 hover:bg-surface-100 text-slate-300 rounded" title="Reorganize Layout">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Canvas & Detail Drawer Container */}
      <div className="flex-1 bg-surface-200 border border-border-subtle rounded-xl overflow-hidden relative">
        <div ref={containerRef} className="w-full h-full" />

        {/* Selected Node Details Drawer */}
        {selectedNode && (
          <div className="absolute top-4 right-4 w-80 bg-surface-300/95 backdrop-blur border border-border-subtle rounded-xl p-4 shadow-2xl space-y-4">
            <div className="border-b border-border-subtle pb-2">
              <span className="text-[10px] font-mono text-accent-cyan uppercase">Device Telemetry</span>
              <h3 className="text-sm font-bold text-white">{selectedNode.label}</h3>
              <p className="text-xs font-mono text-slate-300">{selectedNode.ip}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-surface-200 p-2 rounded">
                <span className="text-[9px] text-slate-500 block">TYPE</span>
                <span className="text-slate-200 font-semibold">{selectedNode.device_type}</span>
              </div>
              <div className="bg-surface-200 p-2 rounded">
                <span className="text-[9px] text-slate-500 block">STATUS</span>
                <span className="text-emerald-400 font-semibold">{selectedNode.status}</span>
              </div>
            </div>
          </div>
        )}

        {/* Selected Edge (Link) Evidence & Confidence Drawer */}
        {selectedEdge && (
          <div className="absolute top-4 right-4 w-80 bg-surface-300/95 backdrop-blur border border-border-subtle rounded-xl p-4 shadow-2xl space-y-4">
            <div className="border-b border-border-subtle pb-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-accent-blue uppercase">Topology Relationship</span>
                <span className="text-xs font-mono font-bold text-accent-cyan">{selectedEdge.confidence_percent}% Confidence</span>
              </div>
              <p className="text-xs text-white font-mono mt-1">{selectedEdge.source_port} ↔ {selectedEdge.target_port}</p>
            </div>

            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase block mb-1.5">Evidence Provenance</span>
              <div className="space-y-1">
                {selectedEdge.discovery_methods?.map((method: string) => (
                  <div key={method} className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-surface-200 p-1.5 rounded">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{method} Telemetry Verified</span>
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

