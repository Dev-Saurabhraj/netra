import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Network, 
  Server, 
  Activity, 
  Compass, 
  Settings, 
  LogOut, 
  Search, 
  ShieldCheck, 
  Radio,
  X,
  ArrowRight,
  Clock,
  ChevronRight,
  Terminal
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { apiClient } from '../../lib/api';
import { useNetworkWorkspaceStore } from '../../stores/networkWorkspaceStore';
import { NetworkTabBar } from './NetworkTabBar';

export const AppLayout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { 
    tabs, 
    activeTabId, 
    startScanning, 
    updateProgress, 
    setStage, 
    completeScanning 
  } = useNetworkWorkspaceStore();

  const scanningTab = tabs.find((t) => t.isScanning);

  // App-Wide Singleton WebSocket stream for persistent discovery telemetry
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host.includes(':') ? host.split(':')[0] + ':8000' : host}/api/v1/ws/events`;

    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(wsUrl);

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const type = payload.type;
          const data = payload.data;

          const currentActiveTab = useNetworkWorkspaceStore.getState().activeTabId;

          if (type === 'DISCOVERY_STARTED') {
            startScanning(currentActiveTab, data.run_id, data.total_targets);
            if (data.log) {
              updateProgress(currentActiveTab, {}, {
                id: Math.random().toString(36).substring(7),
                timestamp: data.log.timestamp || new Date().toISOString(),
                level: data.log.level || 'INFO',
                message: data.log.message,
                stage: data.log.stage || 'INIT'
              });
            }
          } else if (type === 'DISCOVERY_PROGRESS') {
            const currentTabs = useNetworkWorkspaceStore.getState().tabs;
            const targetTab = currentTabs.find(t => t.activeRunId === data.run_id)?.id || currentActiveTab;
            
            const logEntry = data.log ? {
              id: Math.random().toString(36).substring(7),
              timestamp: data.log.timestamp || new Date().toISOString(),
              level: data.log.level || (data.status === 'ONLINE' ? 'SUCCESS' : 'DEBUG'),
              ip: data.log.ip || data.current_ip,
              status: data.log.status || data.status,
              message: data.log.message || `${data.current_ip} processed`,
              device: data.device
            } : undefined;

            const devEntry = data.device ? {
              ...data.device,
              timestamp: new Date().toISOString()
            } : undefined;

            updateProgress(targetTab, {
              processed: data.processed,
              total: data.total,
              successful: data.successful,
              failed: data.failed,
              percent: data.percent,
              currentIp: data.current_ip,
            }, logEntry, devEntry);
          } else if (type === 'DISCOVERY_STAGE') {
            const currentTabs = useNetworkWorkspaceStore.getState().tabs;
            const targetTab = currentTabs.find(t => t.activeRunId === data.run_id)?.id || currentActiveTab;
            const logEntry = data.log ? {
              id: Math.random().toString(36).substring(7),
              timestamp: data.log.timestamp || new Date().toISOString(),
              level: data.log.level || 'INFO',
              message: data.log.message,
              stage: data.stage
            } : undefined;
            setStage(targetTab, data.stage, logEntry);
          } else if (type === 'DISCOVERY_COMPLETED') {
            const currentTabs = useNetworkWorkspaceStore.getState().tabs;
            const targetTab = currentTabs.find(t => t.activeRunId === data.run_id)?.id || currentActiveTab;
            const logEntry = data.log ? {
              id: Math.random().toString(36).substring(7),
              timestamp: data.log.timestamp || new Date().toISOString(),
              level: data.log.level || 'SUCCESS',
              message: data.log.message,
              stage: 'COMPLETED'
            } : undefined;
            completeScanning(targetTab, logEntry);

            // Invalidate React Query caches globally
            queryClient.invalidateQueries({ queryKey: ['topology'] });
            queryClient.invalidateQueries({ queryKey: ['devices'] });
            queryClient.invalidateQueries({ queryKey: ['discovery-runs'] });
          } else if (type === 'TOPOLOGY_UPDATED') {
            queryClient.invalidateQueries({ queryKey: ['topology'] });
            queryClient.invalidateQueries({ queryKey: ['devices'] });
          }
        } catch (e) {
          // ignore parsing error
        }
      };
    } catch (err) {
      console.warn('AppLayout WebSocket error:', err);
    }

    return () => {
      if (socket) socket.close();
    };
  }, [startScanning, updateProgress, setStage, completeScanning, queryClient]);

  // Global Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{ devices: any[]; events: any[] }>({ devices: [], events: [] });
  const [showDropdown, setShowDropdown] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Keyboard shortcut (Ctrl+K or /) to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key === 'k') || (e.key === '/' && document.activeElement !== searchInputRef.current)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setShowDropdown(false);
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults({ devices: [], events: [] });
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const [devRes, evRes] = await Promise.all([
          apiClient.get(`/devices?search=${encodeURIComponent(searchQuery)}&limit=5`),
          apiClient.get(`/events?search=${encodeURIComponent(searchQuery)}&limit=4`),
        ]);
        setSearchResults({
          devices: devRes.data?.data || [],
          events: evRes.data?.data || [],
        });
        setShowDropdown(true);
      } catch (err) {
        console.error('Global search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleDeviceClick = (dev: any) => {
    setShowDropdown(false);
    setSearchQuery('');
    navigate('/devices');
  };

  const handleEventClick = () => {
    setShowDropdown(false);
    setSearchQuery('');
    navigate('/events');
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setShowDropdown(false);
    navigate(`/devices`);
  };

  return (
    <div className="h-screen w-screen flex bg-background text-slate-100 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-surface-200 border-r border-border-subtle flex flex-col justify-between shrink-0">
        <div>
          {/* Logo & Brand */}
          <div className="h-16 flex items-center px-6 gap-3 border-b border-border-subtle">
            <div className="w-8 h-8 rounded-lg bg-accent-cyan/10 border border-accent-cyan/30 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-accent-cyan" />
            </div>
            <div>
              <span className="font-bold tracking-wider text-white text-base">NETRA</span>
              <span className="block text-[10px] text-slate-400 font-mono -mt-1">NOC OBSERVABILITY</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1.5">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                  isActive
                    ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-surface-300'
                }`
              }
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>NOC Dashboard</span>
            </NavLink>

            <NavLink
              to="/topology"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                  isActive
                    ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-surface-300'
                }`
              }
            >
              <Network className="w-4 h-4" />
              <span>Topology Map</span>
            </NavLink>

            <NavLink
              to="/devices"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                  isActive
                    ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-surface-300'
                }`
              }
            >
              <Server className="w-4 h-4" />
              <span>Device Inventory</span>
            </NavLink>

            <NavLink
              to="/events"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                  isActive
                    ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-surface-300'
                }`
              }
            >
              <Activity className="w-4 h-4" />
              <span>Events & Alerts</span>
            </NavLink>

            <NavLink
              to="/discovery"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                  isActive
                    ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-surface-300'
                }`
              }
            >
              <Compass className="w-4 h-4" />
              <span>Discovery Engine</span>
            </NavLink>

            <NavLink
              to="/terminal"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                  isActive
                    ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-surface-300'
                }`
              }
            >
              <Terminal className="w-4 h-4" />
              <div className="flex items-center justify-between flex-1">
                <span>Live NOC Logs</span>
                {scanningTab && (
                  <span className="w-2 h-2 rounded-full bg-accent-cyan animate-ping" />
                )}
              </div>
            </NavLink>
          </nav>
        </div>

        {/* User Profile & Logout Bottom Dock */}
        <div className="p-4 border-t border-border-subtle">
          <div className="flex items-center justify-between bg-surface-300 p-2 rounded-lg border border-border-subtle">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-7 h-7 rounded-full bg-accent-blue/20 text-accent-blue flex items-center justify-center font-bold text-xs shrink-0">
                {user?.email ? user.email.slice(0, 2).toUpperCase() : 'AD'}
              </div>
              <div className="truncate">
                <p className="text-xs font-medium text-slate-200 truncate">{user?.email || 'admin@netra.local'}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-healthy animate-status-pulse"></span>
                  <span className="text-[10px] text-slate-400 font-mono uppercase">{user?.role || 'ADMIN'}</span>
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header with Functional Global Search */}
        <header className="h-16 bg-surface-200/80 backdrop-blur border-b border-border-subtle px-6 flex items-center justify-between shrink-0 relative z-30">
          {/* Global Search Bar */}
          <div ref={searchContainerRef} className="relative w-96">
            <form onSubmit={handleSearchSubmit}>
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchQuery.trim() && setShowDropdown(true)}
                placeholder="Search IP, MAC, hostname, role... (Ctrl+K)"
                className="w-full bg-surface-300 border border-border-subtle rounded-md pl-9 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-cyan/50 transition font-mono"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setShowDropdown(false);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </form>

            {/* Global Search Live Results Dropdown Popover */}
            {showDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-surface-300 border border-border-subtle rounded-xl shadow-2xl overflow-hidden z-50 max-h-96 overflow-y-auto font-mono text-xs">
                {isSearching ? (
                  <div className="p-4 text-center text-slate-400 text-xs">
                    Searching network telemetry...
                  </div>
                ) : searchResults.devices.length === 0 && searchResults.events.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-xs">
                    No matching devices or events found for "{searchQuery}".
                  </div>
                ) : (
                  <div>
                    {/* Devices Group */}
                    {searchResults.devices.length > 0 && (
                      <div>
                        <div className="px-3 py-1.5 bg-surface-200/90 text-[10px] font-bold text-accent-cyan uppercase tracking-wider border-b border-border-subtle flex justify-between items-center">
                          <span>Matching Devices ({searchResults.devices.length})</span>
                          <span className="text-slate-500 lowercase">click to open</span>
                        </div>
                        {searchResults.devices.map((d: any) => (
                          <div
                            key={d.id}
                            onClick={() => handleDeviceClick(d)}
                            className="px-3 py-2.5 hover:bg-surface-200 cursor-pointer flex items-center justify-between border-b border-border-subtle/40 last:border-0 transition"
                          >
                            <div className="flex items-center gap-2.5">
                              <Server className="w-4 h-4 text-slate-400" />
                              <div>
                                <span className="text-white font-semibold block">{d.hostname}</span>
                                <span className="text-[11px] text-slate-400 font-mono">
                                  {d.management_ip} · {d.device_type}
                                </span>
                              </div>
                            </div>
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded font-bold ${
                                d.status === 'ONLINE'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-rose-500/20 text-rose-400'
                              }`}
                            >
                              {d.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Events Group */}
                    {searchResults.events.length > 0 && (
                      <div>
                        <div className="px-3 py-1.5 bg-surface-200/90 text-[10px] font-bold text-accent-blue uppercase tracking-wider border-b border-border-subtle flex justify-between items-center">
                          <span>Matching Events ({searchResults.events.length})</span>
                          <span className="text-slate-500 lowercase">click to open</span>
                        </div>
                        {searchResults.events.map((ev: any) => (
                          <div
                            key={ev.id}
                            onClick={handleEventClick}
                            className="px-3 py-2 hover:bg-surface-200 cursor-pointer border-b border-border-subtle/40 last:border-0 transition text-[11px]"
                          >
                            <div className="flex items-center justify-between mb-0.5">
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                  ev.severity === 'CRITICAL'
                                    ? 'bg-rose-500/20 text-rose-400'
                                    : ev.severity === 'WARNING'
                                    ? 'bg-amber-500/20 text-amber-400'
                                    : 'bg-cyan-500/20 text-cyan-400'
                                }`}
                              >
                                {ev.severity}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {new Date(ev.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-slate-200 font-sans truncate">{ev.title}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Top Status & Controls */}
          <div className="flex items-center gap-3">
            {/* Live Global Scanning Indicator Pill */}
            {scanningTab && (
              <button
                onClick={() => navigate('/terminal')}
                className="flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 font-mono text-xs animate-pulse hover:bg-cyan-500/25 transition"
                title="Discovery scan in progress - Click to view live NOC terminal"
              >
                <Radio className="w-3.5 h-3.5 text-accent-cyan animate-spin" />
                <span className="font-bold">SCANNING: {scanningTab.title}</span>
                <span className="text-slate-400">({scanningTab.progress.processed}/{scanningTab.progress.total})</span>
              </button>
            )}

            <div className="flex items-center gap-2 px-3 py-1 rounded bg-surface-300 border border-border-subtle text-xs">
              <span className="w-2 h-2 rounded-full bg-status-healthy"></span>
              <span className="text-slate-300 font-mono text-[11px]">NOC ENGINE: ACTIVE</span>
            </div>
          </div>
        </header>

        {/* 🚀 Browser-Style Network Tabs & Workspace Bar */}
        <NetworkTabBar />

        {/* Dynamic Route Body */}
        <main className="flex-1 overflow-y-auto bg-background p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
