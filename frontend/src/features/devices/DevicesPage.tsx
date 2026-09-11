import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Server, Search, Filter, RefreshCw, ChevronRight, X } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { DeviceItem } from '../../types';

export const DevicesPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['devices', search, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (typeFilter) params.append('device_type', typeFilter);
      const res = await apiClient.get(`/devices?${params.toString()}`);
      return res.data;
    },
  });

  const { data: detailData, isLoading: loadingDetail } = useQuery({
    queryKey: ['device-detail', selectedDeviceId],
    queryFn: () => apiClient.get(`/devices/${selectedDeviceId}`).then((r) => r.data.data),
    enabled: !!selectedDeviceId,
  });

  const devices: DeviceItem[] = data?.data || [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide">Device Inventory</h1>
          <p className="text-xs text-slate-400 mt-0.5">Deduplicated network node inventory with interface telemetry</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-1.5 bg-surface-200 border border-border-subtle rounded-lg text-xs text-slate-300 hover:bg-surface-100 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-4 bg-surface-200 border border-border-subtle p-3 rounded-xl">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by hostname, management IP, MAC address, vendor..."
            className="w-full bg-surface-300 border border-border-subtle rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-cyan/50"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-surface-300 border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-accent-cyan/50"
          >
            <option value="">All Device Types</option>
            <option value="ROUTER">Router</option>
            <option value="SWITCH">Switch</option>
            <option value="FIREWALL">Firewall</option>
            <option value="SERVER">Server</option>
            <option value="HOST">Host</option>
          </select>
        </div>
      </div>

      {/* Main Content Layout (Table + Slide-in Detail Drawer) */}
      <div className="flex gap-6 relative">
        <div className="flex-1 bg-surface-200 border border-border-subtle rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-300 text-slate-400 font-mono">
                  <th className="p-3">STATUS</th>
                  <th className="p-3">HOSTNAME</th>
                  <th className="p-3">MANAGEMENT IP</th>
                  <th className="p-3">MAC ADDRESS</th>
                  <th className="p-3">TYPE</th>
                  <th className="p-3">VENDOR</th>
                  <th className="p-3">INTERFACES</th>
                  <th className="p-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {devices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500">
                      {isLoading ? 'Loading devices...' : 'No devices found matching query.'}
                    </td>
                  </tr>
                ) : (
                  devices.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => setSelectedDeviceId(d.id)}
                      className={`hover:bg-surface-100/60 cursor-pointer transition ${
                        selectedDeviceId === d.id ? 'bg-surface-100 border-l-2 border-accent-cyan' : ''
                      }`}
                    >
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono ${
                          d.status === 'ONLINE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400'
                        }`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                          {d.status}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-white">{d.hostname}</td>
                      <td className="p-3 font-mono text-slate-300">{d.management_ip}</td>
                      <td className="p-3 font-mono text-slate-400">{d.mac_address || '—'}</td>
                      <td className="p-3 font-mono text-slate-400">{d.device_type}</td>
                      <td className="p-3 text-slate-300">{d.vendor || 'Generic'}</td>
                      <td className="p-3 font-mono text-slate-400">{d.interface_count || 0} ports</td>
                      <td className="p-3 text-right">
                        <ChevronRight className="w-4 h-4 inline text-slate-500" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Slide-out Device Details Drawer */}
        {selectedDeviceId && (
          <div className="w-96 bg-surface-200 border border-border-subtle rounded-xl p-5 shrink-0 flex flex-col justify-between">
            {loadingDetail ? (
              <div className="p-8 text-center text-xs text-slate-400 font-mono">Loading telemetry details...</div>
            ) : detailData ? (
              <div className="space-y-5">
                <div className="flex items-start justify-between border-b border-border-subtle pb-4">
                  <div>
                    <h2 className="text-base font-bold text-white">{detailData.hostname}</h2>
                    <span className="text-xs font-mono text-accent-cyan">{detailData.management_ip}</span>
                  </div>
                  <button
                    onClick={() => setSelectedDeviceId(null)}
                    className="p-1 text-slate-400 hover:text-white rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Metadata details */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-surface-300 p-2.5 rounded-lg border border-border-subtle">
                    <span className="text-[10px] text-slate-500 font-mono block">DEVICE TYPE</span>
                    <span className="font-semibold text-slate-200">{detailData.device_type}</span>
                  </div>
                  <div className="bg-surface-300 p-2.5 rounded-lg border border-border-subtle">
                    <span className="text-[10px] text-slate-500 font-mono block">VENDOR</span>
                    <span className="font-semibold text-slate-200">{detailData.vendor}</span>
                  </div>
                  <div className="bg-surface-300 p-2.5 rounded-lg border border-border-subtle col-span-2">
                    <span className="text-[10px] text-slate-500 font-mono block">MAC / CHASSIS ID</span>
                    <span className="font-mono text-slate-200">{detailData.mac_address || detailData.chassis_id || 'N/A'}</span>
                  </div>
                </div>

                {/* Interfaces list */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono mb-2">
                    Interfaces ({detailData.interfaces?.length || 0})
                  </h3>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {detailData.interfaces?.map((iface: any) => (
                      <div
                        key={iface.id}
                        className="p-2 bg-surface-300 border border-border-subtle rounded-lg flex items-center justify-between text-xs font-mono"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${iface.oper_status === 'UP' ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                          <span className="text-slate-200">{iface.name}</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {iface.ip_address ? iface.ip_address : iface.oper_status}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

