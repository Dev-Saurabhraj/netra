import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ShieldAlert, AlertTriangle, Info, RefreshCw, Search, X } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { NetworkEvent } from '../../types';

export const EventsPage: React.FC = () => {
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['events', severityFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (severityFilter) params.append('severity', severityFilter);
      if (search) params.append('search', search);
      const res = await apiClient.get(`/events?${params.toString()}`);
      return res.data;
    },
  });

  const events: NetworkEvent[] = data?.data || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide">Network Event History</h1>
          <p className="text-xs text-slate-400 mt-0.5">Topology change detections, state transitions & operational audit stream</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-1.5 bg-surface-200 border border-border-subtle rounded-lg text-xs text-slate-300 hover:bg-surface-100 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Bar with Search & Severity Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-200 border border-border-subtle p-3 rounded-xl">
        {/* Keyword Search */}
        <div className="relative flex-1 min-w-[280px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events by keyword, device, or title..."
            className="w-full bg-surface-300 border border-border-subtle rounded-lg pl-9 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-cyan/50 font-mono"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Severity Filter Pills */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400 uppercase">Severity:</span>
          {['', 'INFO', 'WARNING', 'CRITICAL'].map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-3 py-1 rounded text-xs font-mono transition ${
                severityFilter === sev
                  ? 'bg-accent-cyan text-black font-semibold'
                  : 'bg-surface-300 text-slate-400 hover:text-white'
              }`}
            >
              {sev || 'ALL'}
            </button>
          ))}
        </div>
      </div>

      {/* Events List */}
      <div className="bg-surface-200 border border-border-subtle rounded-xl overflow-hidden">
        {events.length === 0 ? (
          <div className="p-8 text-center text-slate-500 font-mono text-xs">
            {isLoading ? 'Loading events...' : 'No network events found matching current criteria.'}
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {events.map((e) => (
              <div key={e.id} className="p-4 flex items-start gap-4 hover:bg-surface-100/50 transition">
                <div className="mt-0.5">
                  {e.severity === 'CRITICAL' && <ShieldAlert className="w-5 h-5 text-status-offline" />}
                  {e.severity === 'WARNING' && <AlertTriangle className="w-5 h-5 text-status-warning" />}
                  {e.severity === 'INFO' && <Info className="w-5 h-5 text-accent-cyan" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                        e.severity === 'CRITICAL'
                          ? 'bg-red-500/20 text-red-400'
                          : e.severity === 'WARNING'
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-cyan-500/20 text-cyan-400'
                      }`}
                    >
                      {e.event_type}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {new Date(e.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-white truncate">{e.title}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{e.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
