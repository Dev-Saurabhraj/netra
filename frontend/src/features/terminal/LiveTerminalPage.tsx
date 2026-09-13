import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Terminal, 
  Search, 
  Copy, 
  Check, 
  Trash2, 
  Radio, 
  RefreshCw, 
  Filter, 
  ChevronRight, 
  Wifi, 
  Server, 
  Globe, 
  Download, 
  Play, 
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNetworkWorkspaceStore } from '../../stores/networkWorkspaceStore';
import { DiscoveryLiveConsole } from '../discovery/DiscoveryLiveConsole';

export const LiveTerminalPage: React.FC = () => {
  const navigate = useNavigate();
  const { 
    tabs, 
    activeTabId, 
    setActiveTab, 
    clearTabLogs
  } = useNetworkWorkspaceStore();

  const activeTabs = tabs.filter((t) => !t.isArchived);
  const activeTab = tabs.find((t) => t.id === activeTabId) || activeTabs[0] || tabs[0];

  const isScanning = activeTab?.isScanning || false;
  const stage = activeTab?.stage || 'IDLE';
  const progress = activeTab?.progress || { total: 254, processed: 0, successful: 0, failed: 0, percent: 0 };
  const logs = activeTab?.logs || [];

  // Terminal Controls & Filters
  const [filter, setFilter] = useState<'ALL' | 'ONLINE' | 'STAGE' | 'ERROR' | 'PROBE'>('ALL');
  const [searchFilter, setSearchFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal to bottom
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll, filter, searchFilter]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filter === 'ONLINE' && log.level !== 'SUCCESS') return false;
      if (filter === 'STAGE' && !log.stage) return false;
      if (filter === 'ERROR' && log.level !== 'ERROR') return false;
      if (filter === 'PROBE' && (log.level === 'SUCCESS' || log.stage || log.level === 'ERROR')) return false;

      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const msg = (log.message || '').toLowerCase();
        const ip = (log.ip || '').toLowerCase();
        const host = (log.device?.hostname || '').toLowerCase();
        const vendor = (log.device?.vendor || '').toLowerCase();
        return msg.includes(q) || ip.includes(q) || host.includes(q) || vendor.includes(q);
      }
      return true;
    });
  }, [logs, filter, searchFilter]);

  // Counts for filter pills
  const counts = useMemo(() => {
    let online = 0;
    let stages = 0;
    let errors = 0;
    let probes = 0;
    for (const l of logs) {
      if (l.level === 'SUCCESS') online++;
      else if (l.stage) stages++;
      else if (l.level === 'ERROR') errors++;
      else probes++;
    }
    return { all: logs.length, online, stages, errors, probes };
  }, [logs]);

  const copyLogsToClipboard = () => {
    const text = filteredLogs
      .map((l) => `[${l.timestamp ? l.timestamp.slice(11, 19) : '--:--:--'}] [${l.level || 'INFO'}] ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadLogs = () => {
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.level}] ${l.stage ? `[STAGE: ${l.stage}] ` : ''}${l.message}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `netra-noc-log-${activeTab?.id || 'session'}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    if (activeTab) {
      clearTabLogs(activeTab.id);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-accent-cyan shadow-sm">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-wide">Live NOC Terminal & Discovery Console</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time multi-protocol sweeps, ICMP probe streams, ARP resolutions, and live device telemetry
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/discovery')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-200 hover:bg-surface-100 border border-border-subtle rounded-xl text-xs text-slate-300 font-mono transition"
          >
            <span>Discovery Settings & Targets</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-500" />
          </button>
        </div>
      </div>

      {/* 🚀 Active Discovery Console (Subnet sweep controls, progress bar, counters, & discovered devices) */}
      <DiscoveryLiveConsole />

      {/* Full Terminal Window */}
      <div className="bg-[#090d16] border border-border-subtle rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[460px]">
        {/* Terminal Titlebar & Filters */}
        <div className="bg-surface-300/80 px-4 py-2.5 border-b border-border-subtle flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Left: Window Dots & Stream Label */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-rose-500/80" />
              <div className="w-3 h-3 rounded-full bg-amber-500/80" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
            </div>
            <span className="text-xs font-mono text-slate-300 flex items-center gap-2 font-bold">
              <Radio className={`w-3.5 h-3.5 ${isScanning ? 'text-accent-cyan animate-pulse' : 'text-slate-500'}`} />
              <span>netra-live-stream.log</span>
              <span className="text-slate-500 font-normal">[{activeTab?.subnet}]</span>
            </span>
          </div>

          {/* Center/Right: Category Filter Buttons */}
          <div className="flex items-center gap-1.5 bg-surface-200 p-0.5 rounded-lg border border-border-subtle text-[11px] font-mono">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-2 py-0.5 rounded transition ${
                filter === 'ALL' ? 'bg-surface-50 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({counts.all})
            </button>
            <button
              onClick={() => setFilter('ONLINE')}
              className={`px-2 py-0.5 rounded transition ${
                filter === 'ONLINE' ? 'bg-emerald-500/25 text-emerald-300 font-bold' : 'text-slate-400 hover:text-emerald-400'
              }`}
            >
              Discovered ({counts.online})
            </button>
            <button
              onClick={() => setFilter('STAGE')}
              className={`px-2 py-0.5 rounded transition ${
                filter === 'STAGE' ? 'bg-cyan-500/25 text-cyan-300 font-bold' : 'text-slate-400 hover:text-cyan-400'
              }`}
            >
              Stages ({counts.stages})
            </button>
            <button
              onClick={() => setFilter('ERROR')}
              className={`px-2 py-0.5 rounded transition ${
                filter === 'ERROR' ? 'bg-rose-500/25 text-rose-300 font-bold' : 'text-slate-400 hover:text-rose-400'
              }`}
            >
              Errors ({counts.errors})
            </button>
            <button
              onClick={() => setFilter('PROBE')}
              className={`px-2 py-0.5 rounded transition ${
                filter === 'PROBE' ? 'bg-surface-100 text-slate-300 font-bold' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Probes ({counts.probes})
            </button>
          </div>

          {/* Right: Search, Auto-Scroll, Copy, Download, Clear */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter stream (IP, host, vendor)..."
                className="bg-surface-200 border border-border-subtle rounded-lg pl-8 pr-2 py-1 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-accent-cyan/60 w-36 sm:w-52"
              />
            </div>

            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-2.5 py-1 text-[11px] font-mono rounded-lg border transition ${
                autoScroll
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 font-bold'
                  : 'bg-surface-200 text-slate-400 border-border-subtle'
              }`}
              title="Toggle Auto-Scroll to bottom on incoming packets"
            >
              Auto-Scroll: {autoScroll ? 'ON' : 'OFF'}
            </button>

            <button
              onClick={copyLogsToClipboard}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-surface-200 transition"
              title="Copy visible logs to clipboard"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            <button
              onClick={downloadLogs}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-surface-200 transition"
              title="Download full session log as .txt"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={handleClear}
              className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-surface-200 transition"
              title="Clear terminal for active tab"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Terminal Output Body (Monospace, Selectable) */}
        <div 
          ref={terminalContainerRef}
          className="flex-1 p-4 font-mono text-xs leading-relaxed overflow-y-auto space-y-1 select-text scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent"
        >
          {filteredLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16 space-y-2 text-slate-500">
              <Terminal className="w-8 h-8 text-slate-700 mx-auto" />
              <p className="font-semibold text-slate-400">
                {logs.length === 0 
                  ? 'NOC Terminal stream is ready and listening.' 
                  : 'No logs match current category or search filters.'}
              </p>
              {logs.length === 0 && (
                <p className="text-[11px] max-w-sm text-slate-600">
                  Click "Scan Active Subnet" above to trigger a live multi-protocol sweep and monitor real-time packet activity.
                </p>
              )}
            </div>
          ) : (
            filteredLogs.map((log) => {
              const timeStr = log.timestamp ? log.timestamp.slice(11, 19) : '--:--:--';
              
              if (log.level === 'SUCCESS') {
                return (
                  <div 
                    key={log.id} 
                    className="flex items-start gap-2.5 text-emerald-400 hover:bg-emerald-950/20 py-0.5 px-1.5 rounded transition font-medium"
                  >
                    <span className="text-slate-600 shrink-0 select-none">[{timeStr}]</span>
                    <span className="text-emerald-400 font-bold shrink-0">🟢 DISCOVERED</span>
                    <span className="text-slate-200 break-all">{log.message}</span>
                  </div>
                );
              }

              if (log.stage) {
                return (
                  <div 
                    key={log.id} 
                    className="flex items-start gap-2.5 text-cyan-300 hover:bg-cyan-950/20 py-0.5 px-1.5 rounded transition font-bold"
                  >
                    <span className="text-slate-600 shrink-0 select-none">[{timeStr}]</span>
                    <span className="text-cyan-400 shrink-0">⚡ MILESTONE</span>
                    <span className="text-cyan-200 break-all">{log.message}</span>
                  </div>
                );
              }

              if (log.level === 'ERROR') {
                return (
                  <div 
                    key={log.id} 
                    className="flex items-start gap-2.5 text-rose-400 hover:bg-rose-950/20 py-0.5 px-1.5 rounded transition"
                  >
                    <span className="text-slate-600 shrink-0 select-none">[{timeStr}]</span>
                    <span className="text-rose-500 font-bold shrink-0">🔴 ERROR</span>
                    <span className="text-rose-300 break-all">{log.message}</span>
                  </div>
                );
              }

              // Normal probe / unassigned / offline
              return (
                <div 
                  key={log.id} 
                  className="flex items-start gap-2.5 text-slate-400 hover:bg-slate-900/40 py-0.5 px-1.5 rounded transition text-[11px]"
                >
                  <span className="text-slate-600 shrink-0 select-none">[{timeStr}]</span>
                  <span className="text-slate-600 shrink-0">⚪ PROBE</span>
                  <span className="text-slate-400 break-all">{log.message}</span>
                </div>
              );
            })
          )}
          <div ref={terminalEndRef} />
        </div>

        {/* Terminal Status Bar at Bottom */}
        <div className="bg-surface-300/60 border-t border-border-subtle/80 px-4 py-2 flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-4">
            <span>Showing: <strong className="text-white">{filteredLogs.length}</strong> of <strong className="text-white">{logs.length}</strong> log lines</span>
            <span>Online: <strong className="text-emerald-400">{counts.online}</strong></span>
            <span>Target Subnet: <strong className="text-accent-cyan">{activeTab?.subnet}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-300">STREAMING LISTENER: CONNECTED</span>
          </div>
        </div>
      </div>
    </div>
  );
};

