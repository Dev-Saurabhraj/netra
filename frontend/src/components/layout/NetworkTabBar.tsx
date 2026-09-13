import React, { useState } from 'react';
import { 
  Plus, 
  X, 
  FolderArchive, 
  RotateCcw, 
  Trash2, 
  Wifi, 
  Server, 
  Globe, 
  Search,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { useNetworkWorkspaceStore } from '../../stores/networkWorkspaceStore';

export const NetworkTabBar: React.FC = () => {
  const { 
    tabs, 
    activeTabId, 
    setActiveTab, 
    createTab, 
    closeTab, 
    restoreTab, 
    permanentlyRemoveFromHistory 
  } = useNetworkWorkspaceStore();

  const [showNewTabModal, setShowNewTabModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState('');
  
  // New Tab Form
  const [newTitle, setNewTitle] = useState('');
  const [newSubnet, setNewSubnet] = useState('192.168.1.0/24');

  const activeTabs = tabs.filter((t) => !t.isArchived);
  const archivedTabs = tabs.filter((t) => t.isArchived);

  const handleCreateTab = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubnet.trim()) return;
    const title = newTitle.trim() || `Network (${newSubnet})`;
    createTab(title, newSubnet);
    setNewTitle('');
    setShowNewTabModal(false);
  };

  const getTabIcon = (subnet: string, title: string) => {
    const s = (subnet + ' ' + title).toLowerCase();
    if (s.includes('wifi') || s.includes('airtel') || s.includes('wlan')) {
      return <Wifi className="w-3.5 h-3.5 text-accent-cyan" />;
    }
    if (s.includes('lab') || s.includes('100.')) {
      return <Server className="w-3.5 h-3.5 text-purple-400" />;
    }
    return <Globe className="w-3.5 h-3.5 text-emerald-400" />;
  };

  const filteredArchivedTabs = archivedTabs.filter((t) => {
    if (!archiveSearch.trim()) return true;
    const q = archiveSearch.toLowerCase();
    return t.title.toLowerCase().includes(q) || t.subnet.toLowerCase().includes(q);
  });

  return (
    <div className="relative z-20 bg-[#0e131f] border-b border-border-subtle/80 px-4 pt-2 flex items-center justify-between gap-3 select-none">
      {/* 1. Browser-Style Active Tabs (Scrollable Horizontally) */}
      <div className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5 min-w-0">
        {activeTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-lg border-t border-l border-r text-xs font-mono transition cursor-pointer max-w-[220px] shrink-0 ${
                isActive
                  ? 'bg-surface-200 border-border-subtle text-white font-bold shadow-sm'
                  : 'bg-surface-300/40 border-transparent text-slate-400 hover:text-slate-200 hover:bg-surface-300/70'
              }`}
            >
              {/* Icon & Live Scan Pulse */}
              <div className="relative shrink-0">
                {getTabIcon(tab.subnet, tab.title)}
                {tab.isScanning && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                  </span>
                )}
              </div>

              {/* Title & Subnet */}
              <div className="truncate flex flex-col min-w-0">
                <span className="truncate leading-tight">{tab.title}</span>
                <span className="text-[9px] text-slate-500 font-mono -mt-0.5 truncate">{tab.subnet}</span>
              </div>

              {/* Close Tab Button (Archives safely to Tab History) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className={`p-0.5 rounded text-slate-500 hover:text-rose-400 hover:bg-surface-100 transition ml-1 shrink-0 ${
                  isActive ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                title="Close Tab (Safely archives to Tab History)"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        {/* New Tab '+' Button */}
        <button
          onClick={() => setShowNewTabModal(true)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-300 transition flex items-center gap-1 text-xs font-mono shrink-0 ml-1 border border-border-subtle/50"
          title="Open New Network Scan Tab"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="text-[11px] hidden sm:inline">New Tab</span>
        </button>
      </div>

      {/* 2. Tab History & Archive Button */}
      <div className="shrink-0 pb-1 flex items-center gap-2">
        <button
          onClick={() => setShowArchiveModal(true)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono border transition ${
            archivedTabs.length > 0
              ? 'bg-surface-300/80 hover:bg-surface-200 text-slate-200 border-border-subtle shadow-sm'
              : 'bg-surface-300/30 text-slate-400 border-border-subtle/40 hover:text-slate-200'
          }`}
          title="View Closed / Archived Network Workspaces"
        >
          <FolderArchive className="w-3.5 h-3.5 text-accent-cyan" />
          <span>Tab History</span>
          <span className="px-1.5 py-0.2 rounded-full bg-surface-100 text-[10px] text-accent-cyan font-bold">
            {archivedTabs.length}
          </span>
        </button>
      </div>

      {/* 🚀 3. Tab History Archive Management Modal (Clean, High-z-index, Never behind screen) */}
      {showArchiveModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setShowArchiveModal(false)}
        >
          <div 
            className="bg-surface-200 border border-border-subtle rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-border-subtle/80 flex items-center justify-between bg-surface-300/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-accent-cyan">
                  <FolderArchive className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">Network Tab History</h3>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {archivedTabs.length} archived workspace{archivedTabs.length === 1 ? '' : 's'} preserved in database
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowArchiveModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-surface-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Explanatory Banner & Search */}
            <div className="p-4 border-b border-border-subtle space-y-3 bg-surface-200/50">
              <p className="text-xs text-slate-300 leading-relaxed">
                Closing a network tab keeps all its discovered devices, logs, and topology safely saved in PostgreSQL. You can restore any past network session back to your active tabs with a single click.
              </p>

              {archivedTabs.length > 0 && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={archiveSearch}
                    onChange={(e) => setArchiveSearch(e.target.value)}
                    placeholder="Search archived networks by title or subnet..."
                    className="w-full bg-surface-300 border border-border-subtle rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-accent-cyan/60"
                  />
                </div>
              )}
            </div>

            {/* List of Archived Tabs */}
            <div className="p-4 overflow-y-auto space-y-2 flex-1 max-h-96">
              {archivedTabs.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <FolderArchive className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-400 font-mono">No archived tabs yet.</p>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                    When you close a network tab from the top bar (using the &times; button), it is safely moved here instead of being lost.
                  </p>
                </div>
              ) : filteredArchivedTabs.length === 0 ? (
                <div className="text-center py-8 text-xs font-mono text-slate-500">
                  No archived networks match "{archiveSearch}".
                </div>
              ) : (
                filteredArchivedTabs.map((tab) => (
                  <div 
                    key={tab.id}
                    className="p-3 bg-surface-300 border border-border-subtle rounded-xl flex items-center justify-between gap-3 hover:border-accent-cyan/30 transition shadow-sm"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="font-semibold text-sm text-white truncate flex items-center gap-2">
                        {getTabIcon(tab.subnet, tab.title)}
                        <span className="truncate">{tab.title}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                        <span className="text-accent-cyan font-bold">{tab.subnet}</span>
                        <span>&bull;</span>
                        <span className="text-slate-300">
                          {tab.discoveredDevices?.length || tab.progress?.successful || 0} devices discovered
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          restoreTab(tab.id);
                          setShowArchiveModal(false);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-accent-cyan to-accent-blue text-black font-semibold text-xs rounded-lg hover:opacity-90 transition shadow-md shadow-cyan-950/40"
                        title="Restore this network workspace to your active tabs"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restore Tab</span>
                      </button>
                      <button
                        onClick={() => permanentlyRemoveFromHistory(tab.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-surface-200 transition"
                        title="Remove from history list (database records remain intact)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border-subtle bg-surface-300/30 flex justify-end">
              <button
                onClick={() => setShowArchiveModal(false)}
                className="px-4 py-2 bg-surface-200 hover:bg-surface-100 text-slate-300 hover:text-white text-xs font-semibold rounded-lg border border-border-subtle transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. New Network Tab Modal */}
      {showNewTabModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setShowNewTabModal(false)}
        >
          <div 
            className="bg-surface-200 border border-border-subtle rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-accent-cyan">
                  <Plus className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white">Create New Network Tab</h3>
              </div>
              <button
                onClick={() => setShowNewTabModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-surface-300 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Open a clean, isolated network workspace. Devices, scan logs, and topology for this subnet will be tracked independently in this tab.
            </p>

            <form onSubmit={handleCreateTab} className="space-y-4">
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">WORKSPACE TAB NAME</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Office Wi-Fi, Guest Net, Lab Network"
                  className="w-full bg-surface-300 border border-border-subtle rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-accent-cyan/60 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">TARGET SUBNET (CIDR)</label>
                <input
                  type="text"
                  value={newSubnet}
                  onChange={(e) => setNewSubnet(e.target.value)}
                  placeholder="e.g. 192.168.1.0/24"
                  className="w-full bg-surface-300 border border-border-subtle rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-accent-cyan/60 font-mono"
                  required
                />
              </div>

              {/* Subnet Quick Presets */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono text-slate-400">Quick Presets:</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setNewSubnet('192.168.1.0/24');
                      if (!newTitle) setNewTitle('📶 Local Wi-Fi');
                    }}
                    className="px-2.5 py-1 rounded bg-surface-300 hover:bg-surface-100 border border-border-subtle text-[11px] font-mono text-slate-300 transition"
                  >
                    📶 192.168.1.0/24
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewSubnet('192.168.100.0/24');
                      if (!newTitle) setNewTitle('🏢 Simulation Lab');
                    }}
                    className="px-2.5 py-1 rounded bg-surface-300 hover:bg-surface-100 border border-border-subtle text-[11px] font-mono text-slate-300 transition"
                  >
                    🏢 192.168.100.0/24
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewSubnet('10.21.220.0/24');
                      if (!newTitle) setNewTitle('🌐 Core Campus');
                    }}
                    className="px-2.5 py-1 rounded bg-surface-300 hover:bg-surface-100 border border-border-subtle text-[11px] font-mono text-slate-300 transition"
                  >
                    🌐 10.21.220.0/24
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setShowNewTabModal(false)}
                  className="px-4 py-2 bg-surface-300 hover:bg-surface-100 text-slate-300 text-xs font-semibold rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gradient-to-r from-accent-cyan to-accent-blue text-black font-semibold text-xs rounded-lg hover:opacity-90 transition shadow-md shadow-cyan-950/40"
                >
                  Open Workspace Tab
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
