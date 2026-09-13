import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  Play, 
  Plus, 
  Clock, 
  Trash2, 
  Calendar, 
  CheckCircle, 
  PauseCircle, 
  Terminal, 
  X, 
  ChevronRight,
  Shield,
  Layers,
  Radio,
  ExternalLink,
  ArrowUpRight
} from 'lucide-react';
import { apiClient } from '../../lib/api';
import { useNetworkWorkspaceStore } from '../../stores/networkWorkspaceStore';

export const DiscoveryPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tabs, activeTabId } = useNetworkWorkspaceStore();
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs.filter(t => !t.isArchived)[0] || tabs[0];

  const [targetName, setTargetName] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [targetType, setTargetType] = useState('CIDR');
  const [selectedRunLogs, setSelectedRunLogs] = useState<{ id: string; logs: any[] } | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Fetch configured targets
  const { data: targetsRes } = useQuery({
    queryKey: ['targets'],
    queryFn: () => apiClient.get('/targets').then((r) => r.data.data),
  });

  // Fetch discovery runs
  const { data: runsRes } = useQuery({
    queryKey: ['discovery-runs'],
    queryFn: () => apiClient.get('/discovery/runs').then((r) => r.data.data),
    refetchInterval: 3000,
  });

  // Fetch scheduler status
  const { data: scheduleRes } = useQuery({
    queryKey: ['discovery-schedule'],
    queryFn: () => apiClient.get('/discovery/schedule').then((r) => r.data.data),
    refetchInterval: 4000,
  });

  // Update Scheduler Mutation
  const updateScheduleMutation = useMutation({
    mutationFn: (newCfg: { enabled: boolean; interval_seconds?: number }) =>
      apiClient.post('/discovery/schedule', newCfg),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discovery-schedule'] });
    },
  });

  // Add Target Mutation
  const addTargetMutation = useMutation({
    mutationFn: (newTarget: any) => apiClient.post('/targets', newTarget),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['targets'] });
      setTargetName('');
      setTargetValue('');
    },
  });

  // Delete Target Mutation
  const deleteTargetMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/targets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['targets'] });
    },
  });

  const handleInspectRunLogs = async (runId: string) => {
    setIsLoadingLogs(true);
    try {
      const res = await apiClient.get(`/discovery/runs/${runId}`);
      setSelectedRunLogs({
        id: runId,
        logs: res.data?.data?.logs || [],
      });
    } catch (e) {
      console.error('Failed to fetch run logs:', e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleAddTarget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetName || !targetValue) return;
    addTargetMutation.mutate({
      name: targetName,
      target_value: targetValue,
      target_type: targetType,
      is_enabled: true,
    });
  };

  const targets = targetsRes || [];
  const runs = runsRes || [];
  const schedule = scheduleRes || { enabled: false, interval_seconds: 60 };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide">Network Discovery Engine</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Discover connected network endpoints, query hardware telemetry, and synthesize topological relationships
          </p>
        </div>

        {activeTab && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-200 border border-border-subtle text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-accent-cyan animate-pulse"></span>
            <span className="text-slate-400">Current Scope:</span>
            <span className="text-white font-bold">{activeTab.title}</span>
            <span className="text-accent-cyan">({activeTab.subnet})</span>
          </div>
        )}
      </div>

      {/* 🚀 Dedicated Live NOC Terminal & Sweep Link Banner */}
      <div className="bg-gradient-to-r from-surface-200 via-surface-200 to-surface-300 border border-border-subtle rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-accent-cyan shrink-0">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              Live NOC Terminal & Active Probes
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-accent-cyan border border-cyan-500/30 font-semibold">
                Real-Time Console
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Execute live subnet sweeps, monitor ICMP/ARP packet traces in real-time, and view discovered device telemetry in the dedicated Live NOC Terminal.
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/terminal')}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-accent-cyan to-accent-blue text-black rounded-xl text-xs font-mono font-bold transition shadow-md shadow-cyan-950/40 hover:opacity-90 shrink-0"
        >
          <Terminal className="w-4 h-4 fill-black" />
          <span>Open Live NOC Terminal</span>
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>

      {/* Configuration & Historical Runs Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Automated Scheduling & Target Configuration */}
        <div className="space-y-6">
          {/* Automated Discovery Scheduler Card */}
          <div className="bg-surface-200 border border-border-subtle rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-accent-cyan" /> Automated Polling
              </h2>
              <button
                onClick={() =>
                  updateScheduleMutation.mutate({
                    enabled: !schedule.enabled,
                    interval_seconds: schedule.interval_seconds,
                  })
                }
                disabled={updateScheduleMutation.isPending}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold transition ${
                  schedule.enabled
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'bg-surface-300 text-slate-400 border border-border-subtle hover:text-white'
                }`}
              >
                {schedule.enabled ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Enabled</span>
                  </>
                ) : (
                  <>
                    <PauseCircle className="w-3.5 h-3.5 text-slate-400" />
                    <span>Paused</span>
                  </>
                )}
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-mono text-slate-400">Polling Interval</label>
              <div className="grid grid-cols-4 gap-1.5">
                {[30, 60, 120, 300].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() =>
                      updateScheduleMutation.mutate({
                        enabled: schedule.enabled,
                        interval_seconds: sec,
                      })
                    }
                    className={`py-1.5 text-xs font-mono rounded-lg border transition ${
                      schedule.interval_seconds === sec
                        ? 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/50 font-bold'
                        : 'bg-surface-300 text-slate-400 border-border-subtle hover:text-slate-200'
                    }`}
                  >
                    {sec < 60 ? `${sec}s` : `${sec / 60}m`}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-surface-300/80 p-3 rounded-xl border border-border-subtle space-y-1.5 text-[11px] font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Scheduler Engine:</span>
                <span className={schedule.is_running ? 'text-accent-cyan animate-pulse font-bold' : schedule.enabled ? 'text-emerald-400' : 'text-slate-500'}>
                  {schedule.is_running ? 'DISCOVERY IN PROGRESS' : schedule.enabled ? 'ACTIVE (Awaiting tick)' : 'STANDBY'}
                </span>
              </div>
              {schedule.next_run_at && schedule.enabled && (
                <div className="flex justify-between text-slate-400">
                  <span>Next Scheduled Run:</span>
                  <span className="text-slate-200">{new Date(schedule.next_run_at).toLocaleTimeString()}</span>
                </div>
              )}
              {schedule.last_run_at && (
                <div className="flex justify-between text-slate-400">
                  <span>Last Cycle Finished:</span>
                  <span className="text-slate-200">{new Date(schedule.last_run_at).toLocaleTimeString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Add Target Range */}
          <div className="bg-surface-200 border border-border-subtle rounded-2xl p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-accent-cyan" /> Add Discovery Target
            </h2>
            <form onSubmit={handleAddTarget} className="space-y-3">
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">Target Description</label>
                <input
                  type="text"
                  placeholder="e.g. Branch Office, Server VLAN"
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  className="w-full bg-surface-300 border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-accent-cyan/50 font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">Type</label>
                  <select
                    value={targetType}
                    onChange={(e) => setTargetType(e.target.value)}
                    className="w-full bg-surface-300 border border-border-subtle rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none font-mono"
                  >
                    <option value="CIDR">Subnet (CIDR)</option>
                    <option value="IP">Single IP</option>
                    <option value="HOSTNAME">Hostname</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">Target Address</label>
                  <input
                    type="text"
                    placeholder="192.168.2.0/24"
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                    className="w-full bg-surface-300 border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-accent-cyan/50 font-mono"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={addTargetMutation.isPending}
                className="w-full mt-2 bg-surface-100 hover:bg-surface-50 text-white text-xs font-semibold py-2 rounded-lg border border-border-subtle transition"
              >
                Save Target Range
              </button>
            </form>
          </div>

          {/* Configured Targets List */}
          <div className="bg-surface-200 border border-border-subtle rounded-2xl p-5 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold text-white">Configured Targets ({targets.length})</h2>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {targets.length === 0 ? (
                <p className="text-xs text-slate-500 font-mono text-center py-4">No custom targets saved yet.</p>
              ) : (
                targets.map((t: any) => (
                  <div key={t.id} className="p-2.5 bg-surface-300 border border-border-subtle rounded-lg flex items-center justify-between text-xs font-mono">
                    <div>
                      <p className="font-semibold text-slate-200">{t.name}</p>
                      <span className="text-[11px] text-accent-cyan">{t.target_value} ({t.target_type})</span>
                    </div>
                    <button
                      onClick={() => deleteTargetMutation.mutate(t.id)}
                      className="p-1 text-slate-400 hover:text-rose-400 transition"
                      title="Delete target"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Discovery Execution History */}
        <div className="lg:col-span-2 bg-surface-200 border border-border-subtle rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent-blue" /> Discovery Execution History
            </h2>
            <span className="text-xs font-mono text-slate-400">
              {runs.length} recorded run{runs.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
            {runs.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 font-mono space-y-2">
                <Clock className="w-6 h-6 mx-auto text-slate-600" />
                <p>No discovery cycles executed yet.</p>
                <p className="text-[11px]">Click "Scan Subnet Now" above to initiate your first discovery sweep.</p>
              </div>
            ) : (
              runs.map((r: any) => (
                <div 
                  key={r.id} 
                  className="p-4 bg-surface-300/80 border border-border-subtle hover:border-accent-cyan/30 rounded-xl space-y-3 transition shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        r.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                        r.status === 'RUNNING' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 animate-pulse' :
                        'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}>
                        {r.status}
                      </span>
                      <span className="text-xs font-mono text-slate-300 font-semibold">Run #{r.id.slice(0, 8)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-400">
                        {r.started_at ? new Date(r.started_at).toLocaleTimeString() : '—'}
                      </span>
                      <button
                        onClick={() => handleInspectRunLogs(r.id)}
                        className="px-2.5 py-1 bg-surface-200 hover:bg-surface-100 border border-border-subtle rounded-lg text-xs font-mono text-accent-cyan flex items-center gap-1.5 transition"
                        title="Audit recorded run logs"
                      >
                        <Terminal className="w-3 h-3" />
                        <span>Audit Logs</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
                    <div className="bg-surface-200 p-2 rounded-lg border border-border-subtle/50">
                      <span className="text-[10px] text-slate-500 block">TOTAL SCOPE</span>
                      <span className="text-white font-bold">{r.total_targets}</span>
                    </div>
                    <div className="bg-surface-200 p-2 rounded-lg border border-border-subtle/50">
                      <span className="text-[10px] text-slate-500 block">PROCESSED</span>
                      <span className="text-slate-200 font-bold">{r.processed_targets}</span>
                    </div>
                    <div className="bg-surface-200 p-2 rounded-lg border border-emerald-500/20">
                      <span className="text-[10px] text-emerald-500 block">ONLINE</span>
                      <span className="text-emerald-400 font-bold">{r.successful_targets}</span>
                    </div>
                    <div className="bg-surface-200 p-2 rounded-lg border border-border-subtle/50">
                      <span className="text-[10px] text-rose-500 block">UNREACHABLE</span>
                      <span className="text-rose-400 font-bold">{r.failed_targets}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Historical Run Log Modal */}
      {selectedRunLogs && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-surface-200 border border-border-subtle rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between bg-surface-300">
              <div className="flex items-center gap-2.5">
                <Terminal className="w-4 h-4 text-accent-cyan" />
                <span className="text-sm font-bold text-white font-mono">
                  Recorded Run Log Audit: #{selectedRunLogs.id.slice(0, 8)}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  ({selectedRunLogs.logs.length} entries)
                </span>
              </div>
              <button
                onClick={() => setSelectedRunLogs(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-surface-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-[#0b0f17] font-mono text-[11px] overflow-y-auto space-y-1 flex-1 select-text">
              {selectedRunLogs.logs.length === 0 ? (
                <div className="text-slate-500 italic text-center py-8">
                  No log entries recorded for this run.
                </div>
              ) : (
                selectedRunLogs.logs.map((log: any, idx: number) => {
                  const time = log.timestamp ? log.timestamp.slice(11, 19) : '--:--:--';
                  const isSuccess = log.level === 'SUCCESS' || log.status === 'ONLINE';
                  const isError = log.level === 'ERROR';
                  const isStage = Boolean(log.stage);

                  return (
                    <div 
                      key={idx} 
                      className={`flex items-start gap-2 py-0.5 px-1 rounded ${
                        isSuccess ? 'text-emerald-400 bg-emerald-950/20' :
                        isError ? 'text-rose-400 bg-rose-950/20' :
                        isStage ? 'text-cyan-300 bg-cyan-950/20 font-bold' :
                        'text-slate-400'
                      }`}
                    >
                      <span className="text-slate-500 shrink-0">[{time}]</span>
                      <span className={`shrink-0 font-bold ${
                        isSuccess ? 'text-emerald-500' :
                        isError ? 'text-rose-500' :
                        isStage ? 'text-cyan-400' : 'text-slate-500'
                      }`}>
                        {isSuccess ? '🟢 ONLINE' : isError ? '🔴 ERROR' : isStage ? '⚡ STAGE' : '⚪ PROBE'}
                      </span>
                      <span className="break-all">{log.message}</span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-5 py-3 border-t border-border-subtle bg-surface-300 flex justify-end">
              <button
                onClick={() => setSelectedRunLogs(null)}
                className="px-4 py-2 bg-surface-100 hover:bg-surface-50 text-white text-xs font-semibold rounded-lg transition"
              >
                Close Audit Logs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
