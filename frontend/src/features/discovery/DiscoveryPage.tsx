import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Compass, Play, Plus, CheckCircle2, Clock, AlertCircle, Trash2 } from 'lucide-react';
import { apiClient } from '../../lib/api';

export const DiscoveryPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [targetName, setTargetName] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [targetType, setTargetType] = useState('IP');

  // Fetch targets
  const { data: targetsRes, isLoading: loadingTargets } = useQuery({
    queryKey: ['targets'],
    queryFn: () => apiClient.get('/targets').then((r) => r.data.data),
  });

  // Fetch discovery runs
  const { data: runsRes, isLoading: loadingRuns } = useQuery({
    queryKey: ['discovery-runs'],
    queryFn: () => apiClient.get('/discovery/runs').then((r) => r.data.data),
    refetchInterval: 3000, // Poll every 3 seconds for active runs
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

  // Start Discovery Mutation
  const startDiscoveryMutation = useMutation({
    mutationFn: () => apiClient.post('/discovery/start', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discovery-runs'] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['topology'] });
    },
  });

  // Delete Target Mutation
  const deleteTargetMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/targets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['targets'] });
    },
  });

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide">Discovery Management Console</h1>
          <p className="text-xs text-slate-400 mt-0.5">Configure IP/Subnet discovery targets and trigger multi-source discovery cycles</p>
        </div>
        <button
          onClick={() => startDiscoveryMutation.mutate()}
          disabled={startDiscoveryMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent-cyan to-accent-blue text-black font-semibold text-xs rounded-lg hover:opacity-90 transition shadow-lg shadow-cyan-950/40 disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5 fill-black" />
          <span>{startDiscoveryMutation.isPending ? 'Queuing Run...' : 'Start Discovery Cycle'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Target Configuration & Add Target */}
        <div className="space-y-6">
          <div className="bg-surface-200 border border-border-subtle rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-accent-cyan" /> Add Target Range
            </h2>
            <form onSubmit={handleAddTarget} className="space-y-3">
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">Target Name</label>
                <input
                  type="text"
                  placeholder="e.g. Core Lab Subnet"
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  className="w-full bg-surface-300 border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-accent-cyan/50"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">Type</label>
                  <select
                    value={targetType}
                    onChange={(e) => setTargetType(e.target.value)}
                    className="w-full bg-surface-300 border border-border-subtle rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none"
                  >
                    <option value="IP">Single IP</option>
                    <option value="CIDR">Subnet (CIDR)</option>
                    <option value="HOSTNAME">Hostname</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">Target Value</label>
                  <input
                    type="text"
                    placeholder="10.0.0.1 or 10.0.0.0/24"
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                    className="w-full bg-surface-300 border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-accent-cyan/50"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={addTargetMutation.isPending}
                className="w-full mt-2 bg-surface-100 border border-border-subtle hover:bg-surface-50 text-white text-xs font-semibold py-2 rounded-lg transition"
              >
                Save Target
              </button>
            </form>
          </div>

          {/* Configured Targets List */}
          <div className="bg-surface-200 border border-border-subtle rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Configured Targets ({targets.length})</h2>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {targets.length === 0 ? (
                <p className="text-xs text-slate-500 font-mono text-center py-4">No targets defined.</p>
              ) : (
                targets.map((t: any) => (
                  <div key={t.id} className="p-2.5 bg-surface-300 border border-border-subtle rounded-lg flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-slate-200">{t.name}</p>
                      <span className="text-[11px] font-mono text-accent-cyan">{t.target_value} ({t.target_type})</span>
                    </div>
                    <button
                      onClick={() => deleteTargetMutation.mutate(t.id)}
                      className="p-1 text-slate-400 hover:text-rose-400 transition"
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
        <div className="lg:col-span-2 bg-surface-200 border border-border-subtle rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent-blue" /> Discovery Execution History
          </h2>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {runs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 font-mono">
                No discovery cycles executed yet. Click "Start Discovery Cycle" above.
              </div>
            ) : (
              runs.map((r: any) => (
                <div key={r.id} className="p-4 bg-surface-300 border border-border-subtle rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        r.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' :
                        r.status === 'RUNNING' ? 'bg-cyan-500/20 text-cyan-400 animate-pulse' :
                        'bg-rose-500/20 text-rose-400'
                      }`}>
                        {r.status}
                      </span>
                      <span className="text-xs font-mono text-slate-400">Run #{r.id.slice(0, 8)}</span>
                    </div>
                    <span className="text-xs font-mono text-slate-500">
                      {r.started_at ? new Date(r.started_at).toLocaleTimeString() : '—'}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
                    <div className="bg-surface-200 p-2 rounded">
                      <span className="text-[10px] text-slate-500 block">TOTAL</span>
                      <span className="text-white font-bold">{r.total_targets}</span>
                    </div>
                    <div className="bg-surface-200 p-2 rounded">
                      <span className="text-[10px] text-slate-500 block">PROCESSED</span>
                      <span className="text-slate-200 font-bold">{r.processed_targets}</span>
                    </div>
                    <div className="bg-surface-200 p-2 rounded">
                      <span className="text-[10px] text-emerald-500 block">SUCCESS</span>
                      <span className="text-emerald-400 font-bold">{r.successful_targets}</span>
                    </div>
                    <div className="bg-surface-200 p-2 rounded">
                      <span className="text-[10px] text-rose-500 block">FAILED</span>
                      <span className="text-rose-400 font-bold">{r.failed_targets}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

