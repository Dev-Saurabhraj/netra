import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ShieldAlert, AlertTriangle, Info, RefreshCw } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { NetworkEvent } from '../../types';

export const EventsPage: React.FC = () => {
  const [severityFilter, setSeverityFilter] = useState<string>('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['events', severityFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (severityFilter) params.append('severity', severityFilter);
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

      {/* Filter */}
      <div className="flex items-center gap-3 bg-surface-200 border border-border-subtle p-3 rounded-xl">
        <span className="text-xs font-mono text-slate-400 uppercase">Filter Severity:</span>
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

      {/* Events List */}
      <div className="bg-surface-200 border border-border-subtle rounded-xl overflow-hidden">
        {events.length === 0 ? (
          <div className="p-8 text-center text-slate-500 font-mono text-xs">
            {isLoading ? 'Loading events...' : 'No events recorded.'}
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {events.map((event) => (
              <div key={event.id} className="p-4 hover:bg-surface-100/40 transition flex items-start gap-4">
                <div className="p-2 rounded-lg bg-surface-300 shrink-0">
                  {event.severity === 'CRITICAL' ? (
                    <ShieldAlert className="w-5 h-5 text-status-critical" />
                  ) : event.severity === 'WARNING' ? (
                    <AlertTriangle className="w-5 h-5 text-status-warning" />
                  ) : (
                    <Info className="w-5 h-5 text-accent-blue" />
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">{event.title}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-300 border border-border-subtle text-slate-300">
                        {event.event_type}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-slate-500">
                      {new Date(event.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">{event.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

