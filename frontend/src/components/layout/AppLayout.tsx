import React from 'react';
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
  Radio
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

export const AppLayout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/', label: 'Overview', icon: LayoutDashboard },
    { to: '/topology', label: 'Topology Graph', icon: Network },
    { to: '/devices', label: 'Device Inventory', icon: Server },
    { to: '/events', label: 'Event History', icon: Activity },
    { to: '/discovery', label: 'Discovery Console', icon: Compass },
  ];

  return (
    <div className="flex h-screen bg-background text-slate-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-surface-200 border-r border-border-subtle flex flex-col justify-between shrink-0">
        <div>
          {/* Logo Brand Header */}
          <div className="h-16 flex items-center px-6 border-b border-border-subtle gap-3">
            <div className="w-8 h-8 rounded-md bg-gradient-to-tr from-accent-cyan to-accent-blue flex items-center justify-center shadow-lg shadow-cyan-950">
              <Radio className="w-5 h-5 text-black font-bold" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-wider text-white">NETRA</span>
              <span className="text-[10px] block text-accent-cyan tracking-widest uppercase font-mono">Telemetry NOC</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-surface-50 text-accent-cyan border border-accent-cyan/20 shadow-sm'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-surface-100'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Footer / User Profile */}
        <div className="p-4 border-t border-border-subtle bg-surface-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 truncate">
              <div className="w-7 h-7 rounded-full bg-accent-blue/20 border border-accent-blue/40 flex items-center justify-center text-xs font-mono text-accent-blue">
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
        {/* Top Header */}
        <header className="h-16 bg-surface-200/80 backdrop-blur border-b border-border-subtle px-6 flex items-center justify-between shrink-0">
          {/* Global Search Bar */}
          <div className="relative w-96">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search IP, MAC, hostname, interface..."
              className="w-full bg-surface-300 border border-border-subtle rounded-md pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-cyan/50 transition"
            />
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

