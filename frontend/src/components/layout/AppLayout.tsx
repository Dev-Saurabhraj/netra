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
  ChevronRight
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { apiClient } from '../../lib/api';

export const AppLayout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

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
        <header className="h-16 bg-surface-200/80 backdrop-blur border-b border-border-subtle px-6 flex items-center justify-between shrink-0">
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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 rounded bg-surface-300 border border-border-subtle text-xs">
              <span className="w-2 h-2 rounded-full bg-status-healthy"></span>
              <span className="text-slate-300 font-mono text-[11px]">NOC ENGINE: ACTIVE</span>
            </div>
          </div>
        </header>

        {/* Dynamic Route Body */}
        <main className="flex-1 overflow-y-auto bg-background p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
