import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Server, 
  Network, 
  ShieldAlert, 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  Play, 
  ArrowUpRight 
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiClient } from '../../lib/api';

export const DashboardPage: React.FC = () => {
  // Query devices
  const { data: devicesRes, isLoading: loadingDevices } = useQuery({
    queryKey: ['devices'],
    queryFn: () => apiClient.get('/devices?limit=100').then((res) => res.data),
  });

  // Query topology
  const { data: topoRes, isLoading: loadingTopo } = useQuery({
    queryKey: ['topology'],
    queryFn: () => apiClient.get('/topology').then((res) => res.data),
  });

  // Query events
  const { data: eventsRes, isLoading: loadingEvents } = useQuery({
    queryKey: ['events'],
    queryFn: () => apiClient.get('/events?limit=5').then((res) => res.data),
  });

  const devices = devicesRes?.data || [];
  const links = topoRes?.data?.edges || [];
  const events = eventsRes?.data || [];

  const onlineDevices = devices.filter((d: any) => d.status === 'ONLINE').length;
  const criticalEvents = events.filter((e: any) => e.severity === 'CRITICAL').length;
  const healthPercent = devices.length > 0 ? Math.round((onlineDevices / devices.length) * 100) : 100;

  const stats = [
    { label: 'Discovered Devices', value: devices.length, subtext: `${onlineDevices} Online`, icon: Server, color: 'text-accent-cyan' },
    { label: 'Topology Links', value: links.length, subtext: 'Evidence Verified', icon: Network, color: 'text-accent-blue' },
    { label: 'Network Health', value: `${healthPercent}%`, subtext: 'Operational', icon: Activity, color: 'text-status-healthy' },
    { label: 'Active Alerts', value: criticalEvents, subtext: 'Requires Attention', icon: ShieldAlert, color: criticalEvents > 0 ? 'text-status-critical' : 'text-slate-400' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide">Network Operations Overview</h1>
          <p className="text-xs text-slate-400 mt-0.5">Continuous telemetry, multi-source evidence & live relationship graph</p>
        </div>
        <Link
          to="/discovery"
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent-cyan to-accent-blue text-black font-semibold text-xs rounded-lg hover:opacity-90 transition shadow-lg shadow-cyan-950/40"
        >
          <Play className="w-3.5 h-3.5 fill-black" />
          <span>Run Discovery Cycle</span>
        </Link>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="bg-surface-200 border border-border-subtle rounded-xl p-5 relative overflow-hidden">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{stat.label}</p>
                  <h3 className="text-2xl font-bold text-white mt-1 font-mono">{stat.value}</h3>
                  <span className="text-[11px] text-slate-500 mt-1 block font-mono">{stat.subtext}</span>
                </div>
                <div className={`p-2.5 rounded-lg bg-surface-300 border border-border-subtle ${stat.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid: Topology Quick Preview & Recent Events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Discovered Device Quick Table */}
        <div className="lg:col-span-2 bg-surface-200 border border-border-subtle rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-accent-cyan" />
                <h2 className="text-sm font-semibold text-white">Discovered Devices</h2>
              </div>
              <Link to="/devices" className="text-xs text-accent-cyan hover:underline flex items-center gap-1">
                View All Inventory <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>

            {devices.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-center p-6 border border-dashed border-border-subtle rounded-lg">
                <Network className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-sm font-medium text-slate-300">No devices discovered yet</p>
                <p className="text-xs text-slate-500 mt-1">Configure targets in Discovery Console and trigger a scan.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border-subtle text-slate-400 font-mono">
                      <th className="pb-2">STATUS</th>
                      <th className="pb-2">HOSTNAME</th>
                      <th className="pb-2">MANAGEMENT IP</th>
                      <th className="pb-2">TYPE</th>
                      <th className="pb-2">INTERFACES</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {devices.slice(0, 5).map((device: any) => (
                      <tr key={device.id} className="hover:bg-surface-100/50 transition">
                        <td className="py-2.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono ${
                            device.status === 'ONLINE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400'
                          }`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                            {device.status}
                          </span>
                        </td>
                        <td className="py-2.5 font-medium text-white">{device.hostname}</td>
                        <td className="py-2.5 font-mono text-slate-300">{device.management_ip}</td>
                        <td className="py-2.5 font-mono text-slate-400">{device.device_type}</td>
                        <td className="py-2.5 font-mono text-slate-400">{device.interface_count} ports</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Live Network Events Feed */}
        <div className="bg-surface-200 border border-border-subtle rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-accent-blue" />
                <h2 className="text-sm font-semibold text-white">Recent Event Stream</h2>
              </div>
              <Link to="/events" className="text-xs text-accent-cyan hover:underline flex items-center gap-1">
                All Logs <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>

            {events.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-center p-6 border border-dashed border-border-subtle rounded-lg">
                <CheckCircle2 className="w-8 h-8 text-status-healthy/60 mb-2" />
                <p className="text-sm font-medium text-slate-300">System Normal</p>
                <p className="text-xs text-slate-500 mt-1">No anomalous topology changes detected.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {events.map((event: any) => (
                  <div key={event.id} className="p-2.5 rounded-lg bg-surface-300 border border-border-subtle text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        event.severity === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400' :
                        event.severity === 'WARNING' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {event.severity}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="font-medium text-slate-200">{event.title}</p>
                    <p className="text-[11px] text-slate-400">{event.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

