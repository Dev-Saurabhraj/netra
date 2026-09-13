import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Server, 
  Search, 
  Filter, 
  RefreshCw, 
  ChevronRight, 
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  X, 
  Eye, 
  EyeOff, 
  Radio, 
  Layers, 
  Router, 
  Smartphone, 
  Laptop,
  ExternalLink
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../lib/api';
import { DeviceItem } from '../../types';
import { useNetworkWorkspaceStore } from '../../stores/networkWorkspaceStore';

export const DevicesPage: React.FC = () => {
  const navigate = useNavigate();
  const { 
    tabs, 
    activeTabId, 
    hiddenDeviceIds, 
    hideDevice, 
    unhideDevice, 
    clearHiddenDevices 
  } = useNetworkWorkspaceStore();

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs.filter(t => !t.isArchived)[0] || tabs[0];

  // Filters & State
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [scopeToActiveTab, setScopeToActiveTab] = useState<boolean>(true);
  const [showHiddenOnly, setShowHiddenOnly] = useState<boolean>(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  // Pagination State
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Fetch all devices from API
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['devices', search, typeFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (typeFilter) params.append('device_type', typeFilter);
      if (statusFilter) params.append('status_filter', statusFilter);
      params.append('limit', '200'); // Fetch ample pool for client-side tab scoping & pagination
      const res = await apiClient.get(`/devices?${params.toString()}`);
      return res.data;
    },
  });

  const { data: detailData, isLoading: loadingDetail } = useQuery({
    queryKey: ['device-detail', selectedDeviceId],
    queryFn: () => apiClient.get(`/devices/${selectedDeviceId}`).then((r) => r.data.data),
    enabled: !!selectedDeviceId,
  });

  const rawDevices: DeviceItem[] = data?.data || [];

  // Scoped & Filtered devices
  const filteredDevices = useMemo(() => {
    let list = rawDevices;

    // Filter by active workspace tab subnet
    if (scopeToActiveTab && activeTab?.subnet) {
      const prefix = activeTab.subnet.split('.').slice(0, 3).join('.') + '.';
      list = list.filter((d) => (d.management_ip || '').startsWith(prefix));
    }

    // Filter hidden vs visible
    if (showHiddenOnly) {
      list = list.filter((d) => hiddenDeviceIds.includes(d.id));
    } else {
      list = list.filter((d) => !hiddenDeviceIds.includes(d.id));
    }

    return list;
  }, [rawDevices, scopeToActiveTab, activeTab, showHiddenOnly, hiddenDeviceIds]);

  // Paginated devices
  const totalItems = filteredDevices.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginatedDevices = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredDevices.slice(startIndex, startIndex + pageSize);
  }, [filteredDevices, currentPage, pageSize]);

  const getDeviceIcon = (type: string, name: string) => {
    const t = (type || '').toUpperCase();
    const n = (name || '').toLowerCase();
    if (t === 'ROUTER' || n.includes('router') || n.includes('gateway')) {
      return <Router className="w-3.5 h-3.5 text-orange-400" />;
    }
    if (t === 'SWITCH' || n.includes('switch')) {
      return <Layers className="w-3.5 h-3.5 text-cyan-400" />;
    }
    if (n.includes('phone') || n.includes('realme') || n.includes('poco') || n.includes('oneplus') || n.includes('galaxy') || n.includes('iphone')) {
      return <Smartphone className="w-3.5 h-3.5 text-emerald-400" />;
    }
    if (n.includes('laptop') || n.includes('pc') || n.includes('desktop') || n.includes('saurabh')) {
      return <Laptop className="w-3.5 h-3.5 text-blue-400" />;
    }
    return <Server className="w-3.5 h-3.5 text-slate-400" />;
  };

  const getVendorBadge = (vendor?: string) => {
    const v = (vendor || '').toLowerCase();
    if (v.includes('apple')) return 'bg-slate-700/40 text-slate-200 border-slate-600';
    if (v.includes('realme') || v.includes('oppo')) return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    if (v.includes('poco') || v.includes('xiaomi')) return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
    if (v.includes('oneplus')) return 'bg-red-500/20 text-red-300 border-red-500/30';
    if (v.includes('samsung')) return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    if (v.includes('zyxel') || v.includes('cisco')) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    if (v.includes('intel')) return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
    return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide">Device Inventory</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Network device catalog with live MAC telemetry, interface tables, and non-destructive UI management
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-200 border border-border-subtle rounded-lg text-xs text-slate-300 hover:bg-surface-100 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="bg-surface-200 border border-border-subtle p-3.5 rounded-xl space-y-3">
        {/* Top Filter Row: Search & Scope */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by hostname, IP, MAC address, vendor..."
              className="w-full bg-surface-300 border border-border-subtle rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-cyan/50 font-mono"
            />
          </div>

          {/* Scope Selector: Active Tab vs All Networks */}
          <div className="flex items-center gap-1 bg-surface-300 p-1 rounded-lg border border-border-subtle text-xs font-mono shrink-0">
            <button
              onClick={() => { setScopeToActiveTab(true); setPage(1); }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                scopeToActiveTab
                  ? 'bg-accent-cyan text-black shadow-sm font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Radio className="w-3 h-3" />
              <span>{activeTab ? activeTab.title : 'Active Tab'}</span>
            </button>
            <button
              onClick={() => { setScopeToActiveTab(false); setPage(1); }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                !scopeToActiveTab
                  ? 'bg-accent-cyan text-black shadow-sm font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All Networks ({rawDevices.length})
            </button>
          </div>
        </div>

        {/* Bottom Filter Row: Type, Status, & Hidden Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border-subtle/60 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-2">
            {/* Device Type Filter */}
            <div className="flex items-center gap-1.5 bg-surface-300 px-2 py-1 rounded-lg border border-border-subtle">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
                className="bg-transparent text-slate-300 focus:outline-none cursor-pointer text-xs"
              >
                <option value="">All Types</option>
                <option value="ROUTER">Router</option>
                <option value="SWITCH">Switch</option>
                <option value="FIREWALL">Firewall</option>
                <option value="SERVER">Server</option>
                <option value="HOST">Host</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 bg-surface-300 px-2 py-1 rounded-lg border border-border-subtle">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="bg-transparent text-slate-300 focus:outline-none cursor-pointer text-xs"
              >
                <option value="">All Statuses</option>
                <option value="ONLINE">Online Only</option>
                <option value="OFFLINE">Offline Only</option>
              </select>
            </div>
          </div>

          {/* Clean UI & Hidden Device Controls */}
          <div className="flex items-center gap-2">
            {hiddenDeviceIds.length > 0 && (
              <>
                <button
                  onClick={() => setShowHiddenOnly(!showHiddenOnly)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition ${
                    showHiddenOnly
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                      : 'bg-surface-300 text-slate-400 border-border-subtle hover:text-white'
                  }`}
                  title="Toggle view of hidden devices"
                >
                  {showHiddenOnly ? <Eye className="w-3.5 h-3.5 text-amber-400" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>{showHiddenOnly ? 'Viewing Hidden' : `Hidden (${hiddenDeviceIds.length})`}</span>
                </button>
                <button
                  onClick={clearHiddenDevices}
                  className="px-2 py-1 bg-surface-300 hover:bg-surface-100 text-slate-400 hover:text-white border border-border-subtle rounded-lg text-[11px] transition"
                  title="Restore all hidden devices back to active inventory"
                >
                  Unhide All
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Layout: Table + Sticky Viewport Drawer */}
      <div className="flex items-start gap-6 relative">
        {/* Devices Table Card */}
        <div className="flex-1 bg-surface-200 border border-border-subtle rounded-xl overflow-hidden shadow-sm">
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
              <tbody className="divide-y divide-border-subtle font-mono">
                {paginatedDevices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500 font-mono">
                      {isLoading ? 'Loading devices from database...' : 'No devices found matching current filters.'}
                    </td>
                  </tr>
                ) : (
                  paginatedDevices.map((d) => {
                    const isSelected = selectedDeviceId === d.id;
                    const isHidden = hiddenDeviceIds.includes(d.id);
                    return (
                      <tr
                        key={d.id}
                        onClick={() => setSelectedDeviceId(d.id)}
                        className={`hover:bg-surface-100/60 cursor-pointer transition ${
                          isSelected ? 'bg-surface-100 border-l-2 border-accent-cyan' : ''
                        } ${isHidden ? 'opacity-50' : ''}`}
                      >
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono ${
                            d.status === 'ONLINE' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-slate-700/30 text-slate-400'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${d.status === 'ONLINE' ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`}></span>
                            {d.status}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-white flex items-center gap-2 font-sans">
                          {getDeviceIcon(d.device_type, d.hostname)}
                          <span>{d.hostname}</span>
                        </td>
                        <td className="p-3 font-mono text-accent-cyan font-bold">{d.management_ip}</td>
                        <td className="p-3 font-mono text-slate-400">{d.mac_address || '—'}</td>
                        <td className="p-3 font-mono text-slate-400">{d.device_type}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getVendorBadge(d.vendor)}`}>
                            {d.vendor || 'Generic'}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-slate-400">{d.interface_count || 0}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            {/* Non-destructive Hide / Unhide button */}
                            {isHidden ? (
                              <button
                                onClick={() => unhideDevice(d.id)}
                                className="p-1 text-amber-400 hover:text-white rounded hover:bg-surface-100"
                                title="Restore to active view"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => hideDevice(d.id)}
                                className="p-1 text-slate-500 hover:text-rose-400 rounded hover:bg-surface-100"
                                title="Hide from UI (non-destructive clean)"
                              >
                                <EyeOff className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls Bar */}
          <div className="bg-surface-300/80 px-4 py-3 border-t border-border-subtle flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            {/* Left: Range and Total Counts */}
            <div className="text-slate-400">
              Showing <span className="text-white font-bold">{totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1}</span> to{' '}
              <span className="text-white font-bold">{Math.min(currentPage * pageSize, totalItems)}</span> of{' '}
              <span className="text-accent-cyan font-bold">{totalItems}</span> devices
              {scopeToActiveTab && activeTab && (
                <span className="text-slate-500 ml-2">[{activeTab.title}]</span>
              )}
            </div>

            {/* Right: Page Size & Nav Buttons */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-slate-400">
                <span>Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="bg-surface-200 border border-border-subtle rounded px-2 py-0.5 text-white font-mono focus:outline-none"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <span className="text-slate-400 mr-1">
                  Page <span className="text-white font-bold">{currentPage}</span> of{' '}
                  <span className="text-white font-bold">{totalPages}</span>
                </span>

                {/* First Page */}
                <button
                  onClick={() => setPage(1)}
                  disabled={currentPage <= 1}
                  className="p-1 rounded bg-surface-200 hover:bg-surface-100 border border-border-subtle disabled:opacity-40 text-slate-300"
                  title="First Page"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>

                {/* Prev Page */}
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="p-1 rounded bg-surface-200 hover:bg-surface-100 border border-border-subtle disabled:opacity-40 text-slate-300"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {/* Next Page */}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="p-1 rounded bg-surface-200 hover:bg-surface-100 border border-border-subtle disabled:opacity-40 text-slate-300"
                  title="Next Page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                {/* Last Page */}
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={currentPage >= totalPages}
                  className="p-1 rounded bg-surface-200 hover:bg-surface-100 border border-border-subtle disabled:opacity-40 text-slate-300"
                  title="Last Page"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 🚀 Sticky Viewport Details Drawer (Never scrolls out of view!) */}
        {selectedDeviceId && (
          <div className="sticky top-6 self-start w-96 max-h-[calc(100vh-8rem)] bg-surface-200 border border-border-subtle rounded-xl p-4 shadow-2xl flex flex-col justify-between overflow-y-auto shrink-0 animate-in fade-in slide-in-from-right-4 duration-150 z-30">
            {loadingDetail ? (
              <div className="p-8 text-center text-xs text-slate-400 font-mono">
                <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-accent-cyan" />
                Loading device details...
              </div>
            ) : detailData ? (
              <div className="space-y-4">
                {/* Drawer Header */}
                <div className="flex items-start justify-between border-b border-border-subtle pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {getDeviceIcon(detailData.device_type, detailData.hostname)}
                      <h2 className="text-base font-bold text-white truncate max-w-[200px]">{detailData.hostname}</h2>
                    </div>
                    <span className="text-xs font-mono text-accent-cyan block mt-0.5">{detailData.management_ip}</span>
                  </div>
                  <button
                    onClick={() => setSelectedDeviceId(null)}
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-surface-300 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Quick Action Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => navigate('/topology')}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-accent-cyan/15 hover:bg-accent-cyan/25 text-accent-cyan border border-accent-cyan/30 rounded-lg text-xs font-mono font-semibold transition"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>View in Topology</span>
                  </button>
                  <button
                    onClick={() => hideDevice(detailData.id)}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-surface-300 hover:bg-rose-500/10 text-slate-300 hover:text-rose-400 border border-border-subtle rounded-lg text-xs font-mono transition"
                    title="Hide from UI to keep view clean (keeps data safe in DB)"
                  >
                    <EyeOff className="w-3 h-3" />
                    <span>Hide Device</span>
                  </button>
                </div>

                {/* Metadata cards */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="bg-surface-300 p-2.5 rounded-lg border border-border-subtle">
                    <span className="text-[10px] text-slate-500 block">TYPE</span>
                    <span className="font-semibold text-slate-200">{detailData.device_type}</span>
                  </div>
                  <div className="bg-surface-300 p-2.5 rounded-lg border border-border-subtle">
                    <span className="text-[10px] text-slate-500 block">VENDOR</span>
                    <span className="font-semibold text-slate-200">{detailData.vendor || 'Generic'}</span>
                  </div>
                  <div className="bg-surface-300 p-2.5 rounded-lg border border-border-subtle col-span-2">
                    <span className="text-[10px] text-slate-500 block">MAC / CHASSIS ID</span>
                    <span className="font-mono text-slate-200 break-all">{detailData.mac_address || detailData.chassis_id || 'N/A'}</span>
                  </div>
                  {detailData.status && (
                    <div className="bg-surface-300 p-2.5 rounded-lg border border-border-subtle col-span-2 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">OBSERVED STATUS</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        detailData.status === 'ONLINE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'
                      }`}>
                        {detailData.status}
                      </span>
                    </div>
                  )}
                </div>

                {/* Interfaces list */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono mb-2">
                    Interfaces ({detailData.interfaces?.length || 0})
                  </h3>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 font-mono">
                    {detailData.interfaces?.map((iface: any) => (
                      <div
                        key={iface.id}
                        className="p-2 bg-surface-300 border border-border-subtle rounded-lg flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${iface.oper_status === 'UP' ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                          <span className="text-slate-200 font-semibold">{iface.name}</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {iface.ip_address || iface.mac_address || iface.oper_status}
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
