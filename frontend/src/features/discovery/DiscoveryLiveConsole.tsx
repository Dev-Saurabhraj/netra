import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Terminal, 
  CheckCircle2, 
  Radio, 
  RefreshCw, 
  Server, 
  Router, 
  Layers, 
  Smartphone, 
  Laptop,
  Activity,
  ExternalLink,
  ArrowUpRight
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../lib/api';
import { 
  useNetworkWorkspaceStore, 
  DiscoveredDevice, 
  LogEntry 
} from '../../stores/networkWorkspaceStore';

export type { DiscoveredDevice, LogEntry };

interface DiscoveryLiveConsoleProps {
  initialRunId?: string;
  compact?: boolean;
  onScanComplete?: () => void;
}

export const DiscoveryLiveConsole: React.FC<DiscoveryLiveConsoleProps> = ({
  initialRunId,
  compact = false,
  onScanComplete,
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeRunId, setActiveRunId] = useState<string | null>(initialRunId || null);

  const { 
    tabs, 
    activeTabId, 
    startScanning, 
    updateProgress,
    completeScanning
  } = useNetworkWorkspaceStore();

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs.filter(t => !t.isArchived)[0] || tabs[0];
  const isScanning = activeTab?.isScanning || false;
  const stage = activeTab?.stage || 'IDLE';
  const totalTargets = activeTab?.progress?.total || 254;
  const processedTargets = activeTab?.progress?.processed || 0;
  const successfulTargets = activeTab?.progress?.successful || 0;
  const failedTargets = activeTab?.progress?.failed || 0;
  const percent = activeTab?.progress?.percent || 0;
  const currentIp = activeTab?.progress?.currentIp || '';
  const discoveredDevices = activeTab?.discoveredDevices || [];

  // Target subnet input
  const [targetSubnet, setTargetSubnet] = useState(activeTab?.subnet || '192.168.1.0/24');

  // Sync input when active tab changes
  useEffect(() => {
    if (activeTab?.subnet) {
      setTargetSubnet(activeTab.subnet);
    }
  }, [activeTab?.id, activeTab?.subnet]);

  // Trigger scan mutation
  const startScanMutation = useMutation({
    mutationFn: (subnets?: string[]) => 
      apiClient.post('/discovery/start', {
        custom_subnets: subnets && subnets.length > 0 ? subnets : [targetSubnet]
      }),
    onMutate: () => {
      if (!activeTab) return;
      startScanning(activeTab.id, 'pending', 254);
      const initEntry: LogEntry = {
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: `Starting discovery cycle for [${activeTab.title}] (${targetSubnet})...`,
        stage: 'INIT'
      };
      updateProgress(activeTab.id, { total: 254, processed: 0, successful: 0, failed: 0, percent: 0 }, initEntry);
    },
    onSuccess: (res) => {
      if (res.data?.data?.job_id) {
        setActiveRunId(res.data.data.job_id);
      }
      queryClient.invalidateQueries({ queryKey: ['discovery-runs'] });
      if (onScanComplete) onScanComplete();
    },
    onError: (err: any) => {
      const errEntry: LogEntry = {
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message: `Discovery failed: ${err?.response?.data?.detail?.error?.message || err.message}`,
        stage: 'ERROR'
      };
      if (activeTab) {
        completeScanning(activeTab.id, errEntry);
      }
    }
  });

  const getDeviceIcon = (type?: string, name?: string) => {
    const t = (type || '').toUpperCase();
    const n = (name || '').toLowerCase();
    if (t === 'ROUTER' || n.includes('router') || n.includes('gateway')) {
      return <Router className="w-4 h-4 text-orange-400" />;
    }
    if (t === 'SWITCH' || n.includes('switch')) {
      return <Layers className="w-4 h-4 text-cyan-400" />;
    }
    if (n.includes('phone') || n.includes('realme') || n.includes('poco') || n.includes('oneplus') || n.includes('galaxy') || n.includes('iphone') || n.includes('mobile')) {
      return <Smartphone className="w-4 h-4 text-emerald-400" />;
    }
    if (n.includes('laptop') || n.includes('pc') || n.includes('desktop') || n.includes('saurabh') || n.includes('computer')) {
      return <Laptop className="w-4 h-4 text-blue-400" />;
    }
    return <Server className="w-4 h-4 text-slate-400" />;
  };

  const getVendorBadge = (vendor?: string) => {
    const v = (vendor || '').toLowerCase();
    if (v.includes('apple')) return 'bg-slate-700/50 text-slate-200 border-slate-600';
    if (v.includes('oneplus')) return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
    if (v.includes('realme') || v.includes('oppo')) return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    if (v.includes('poco') || v.includes('xiaomi')) return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
    if (v.includes('samsung')) return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    if (v.includes('arcadyan') || v.includes('airtel')) return 'bg-red-500/20 text-red-300 border-red-500/30';
    if (v.includes('zyxel') || v.includes('cisco')) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    if (v.includes('intel')) return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
    return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
  };

  return (
    <div className="bg-surface-200 border border-border-subtle rounded-2xl overflow-hidden shadow-xl space-y-5 p-4 lg:p-6">
      {/* 1. Header & Quick Scan Trigger Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border-subtle/80 pb-5">
        <div className="flex items-start sm:items-center gap-3">
          <div className="relative">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition ${
              isScanning 
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400 shadow-lg shadow-cyan-950/60' 
                : 'bg-surface-300 border-border-subtle text-slate-400'
            }`}>
              <Radio className={`w-6 h-6 ${isScanning ? 'animate-pulse text-accent-cyan' : ''}`} />
            </div>
            {isScanning && (
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-80"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-cyan-500"></span>
              </span>
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wide">
                Discovery Console:
              </h2>
              <span className="px-2.5 py-0.5 rounded-lg bg-surface-300 border border-border-subtle font-mono text-xs font-bold text-accent-cyan">
                {activeTab ? activeTab.title : 'Active Network'}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border transition ${
                isScanning 
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse' 
                  : stage === 'COMPLETED'
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                {isScanning ? `SCANNING: ${stage}` : stage === 'COMPLETED' ? 'READY / SCAN COMPLETE' : 'STANDBY'}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Target Subnet: <span className="text-slate-200 font-bold">{activeTab?.subnet || targetSubnet}</span> &bull; Multi-protocol sweep (ICMP, DHCP/DNS, OS ARP Cache & SNMP)
            </p>
          </div>
        </div>

        {/* Subnet Input & Primary Scan Action + Link to Terminal */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative">
            <input
              type="text"
              value={targetSubnet}
              onChange={(e) => setTargetSubnet(e.target.value)}
              disabled={isScanning}
              placeholder="e.g. 192.168.1.0/24"
              className="w-full sm:w-48 bg-surface-300 border border-border-subtle rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-accent-cyan/60 transition disabled:opacity-60 shadow-inner"
            />
          </div>
          <button
            onClick={() => startScanMutation.mutate([targetSubnet])}
            disabled={isScanning || startScanMutation.isPending}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-accent-cyan to-accent-blue text-black font-bold text-xs rounded-xl hover:opacity-90 transition shadow-lg shadow-cyan-950/50 disabled:opacity-50 whitespace-nowrap"
          >
            {isScanning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-black" />
                <span>Scanning Network...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-black" />
                <span>Scan Subnet Now</span>
              </>
            )}
          </button>
          <button
            onClick={() => navigate('/discovery')}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-surface-300 hover:bg-surface-100 text-slate-300 hover:text-white border border-border-subtle rounded-xl text-xs font-mono transition"
            title="Configure discovery targets, schedules, and view historical runs"
          >
            <span className="hidden sm:inline">Discovery Settings</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Subnet Quick Preset Chips */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-xs font-mono text-slate-400">Quick Targets:</span>
        <button
          onClick={() => setTargetSubnet('192.168.1.0/24')}
          disabled={isScanning}
          className={`px-3 py-1 rounded-lg text-xs font-mono border transition ${
            targetSubnet === '192.168.1.0/24'
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-bold shadow-sm'
              : 'bg-surface-300 text-slate-400 border-border-subtle hover:text-slate-200'
          }`}
        >
          📶 Wi-Fi (192.168.1.0/24)
        </button>
        <button
          onClick={() => setTargetSubnet('192.168.100.0/24')}
          disabled={isScanning}
          className={`px-3 py-1 rounded-lg text-xs font-mono border transition ${
            targetSubnet === '192.168.100.0/24'
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-bold shadow-sm'
              : 'bg-surface-300 text-slate-400 border-border-subtle hover:text-slate-200'
          }`}
        >
          🏢 Lab (192.168.100.0/24)
        </button>
        <button
          onClick={() => setTargetSubnet('10.21.220.0/24')}
          disabled={isScanning}
          className={`px-3 py-1 rounded-lg text-xs font-mono border transition ${
            targetSubnet === '10.21.220.0/24'
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-bold shadow-sm'
              : 'bg-surface-300 text-slate-400 border-border-subtle hover:text-slate-200'
          }`}
        >
          🌐 Core Campus (10.21.220.0/24)
        </button>
      </div>

      {/* 2. Progress Bar & Metric Counters */}
      <div className="bg-surface-300/60 border border-border-subtle rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-inner">
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Scan Progress:</span>
            <span className="text-white font-bold">{processedTargets} / {totalTargets || 254} targets</span>
            {currentIp && isScanning && (
              <span className="text-accent-cyan bg-cyan-950/70 px-2 py-0.5 rounded-md border border-cyan-800/50 animate-pulse">
                Probing: {currentIp}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Completion:</span>
            <span className="text-accent-cyan font-bold text-sm">{percent.toFixed(1)}%</span>
          </div>
        </div>

        {/* Dynamic Progress Bar */}
        <div className="w-full h-3 bg-surface-100 rounded-full overflow-hidden border border-border-subtle relative">
          <div 
            className="h-full bg-gradient-to-r from-accent-cyan via-accent-blue to-emerald-400 transition-all duration-300 ease-out relative rounded-full"
            style={{ width: `${Math.min(percent, 100)}%` }}
          >
            {isScanning && (
              <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite] w-full" />
            )}
          </div>
        </div>

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <div className="bg-surface-200 border border-border-subtle rounded-xl p-3 text-center">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Scope</span>
            <span className="text-base font-mono font-bold text-white mt-0.5 block">{totalTargets || 254} IPs</span>
          </div>
          <div className="bg-surface-200 border border-border-subtle rounded-xl p-3 text-center">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Scanned</span>
            <span className="text-base font-mono font-bold text-slate-200 mt-0.5 block">{processedTargets}</span>
          </div>
          <div className="bg-surface-200 border border-emerald-500/30 rounded-xl p-3 text-center bg-emerald-500/5">
            <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider block">Online Discovered</span>
            <span className="text-base font-mono font-bold text-emerald-400 mt-0.5 block">{successfulTargets} Devices</span>
          </div>
          <div className="bg-surface-200 border border-border-subtle rounded-xl p-3 text-center">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Unreachable</span>
            <span className="text-base font-mono font-bold text-slate-400 mt-0.5 block">{failedTargets}</span>
          </div>
        </div>
      </div>

      {/* 3. Discovered Devices Visual Grid (Prominent & Clean) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white tracking-wide">
              Discovered Devices in {activeTab?.title || 'Current Tab'}
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono text-xs font-bold">
              {discoveredDevices.length}
            </span>
          </div>
          {discoveredDevices.length > 0 && (
            <button
              onClick={() => navigate('/devices')}
              className="text-xs text-accent-cyan hover:underline font-mono flex items-center gap-1"
            >
              <span>View in Device Inventory</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>

        {discoveredDevices.length === 0 ? (
          <div className="p-8 text-center bg-surface-300/30 border border-border-subtle/80 rounded-xl text-slate-400 text-xs font-mono space-y-1">
            <Activity className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-white font-semibold">No devices discovered yet in this workspace.</p>
            <p className="text-slate-500 text-[11px]">
              Click "Scan Subnet Now" above to begin finding routers, smartphones, laptops, and switches.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-72 overflow-y-auto pr-1">
            {discoveredDevices.map((dev) => (
              <div 
                key={dev.ip}
                className="bg-surface-300/80 border border-border-subtle hover:border-accent-cyan/50 rounded-xl p-3 space-y-2 transition shadow-sm hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 truncate">
                    <div className="p-1.5 rounded-lg bg-surface-200 border border-border-subtle shrink-0">
                      {getDeviceIcon(dev.type, dev.hostname)}
                    </div>
                    <span className="font-bold text-xs text-white truncate" title={dev.hostname}>
                      {dev.hostname}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0 uppercase font-semibold">
                    {dev.type || 'HOST'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-accent-cyan font-bold">{dev.ip}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${getVendorBadge(dev.vendor)}`}>
                    {dev.vendor || 'Generic'}
                  </span>
                </div>

                {dev.mac && (
                  <div className="text-[10px] font-mono text-slate-400 truncate bg-surface-200/60 px-2 py-0.5 rounded border border-border-subtle/50">
                    MAC: {dev.mac}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
