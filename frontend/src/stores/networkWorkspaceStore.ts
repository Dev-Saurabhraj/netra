import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'SUCCESS' | 'INFO' | 'DEBUG' | 'WARN' | 'ERROR';
  ip?: string;
  status?: string;
  message: string;
  stage?: string;
  device?: {
    id: string;
    hostname: string;
    ip: string;
    mac?: string;
    vendor: string;
    type: string;
    method: string;
  };
}

export interface DiscoveredDevice {
  id: string;
  hostname: string;
  ip: string;
  mac?: string;
  vendor: string;
  type: string;
  method: string;
  timestamp: string;
}

export interface NetworkTab {
  id: string;
  title: string;
  subnet: string;
  createdAt: string;
  isScanning: boolean;
  activeRunId: string | null;
  stage: string;
  progress: {
    total: number;
    processed: number;
    successful: number;
    failed: number;
    percent: number;
    currentIp: string;
  };
  logs: LogEntry[];
  discoveredDevices: DiscoveredDevice[];
  isArchived: boolean;
}

interface NetworkWorkspaceState {
  tabs: NetworkTab[];
  activeTabId: string;
  hiddenDeviceIds: string[]; // Device IDs hidden from UI (non-destructive)

  // Actions
  setActiveTab: (tabId: string) => void;
  createTab: (title: string, subnet: string) => string;
  closeTab: (tabId: string) => void; // Moves to Tab History/Archive
  restoreTab: (tabId: string) => void; // Restores from Archive
  permanentlyRemoveFromHistory: (tabId: string) => void;
  
  // Real-time scan updates
  startScanning: (tabId: string, runId: string, totalTargets: number) => void;
  updateProgress: (
    tabId: string, 
    progress: Partial<NetworkTab['progress']>, 
    log?: LogEntry, 
    device?: DiscoveredDevice
  ) => void;
  setStage: (tabId: string, stage: string, log?: LogEntry) => void;
  completeScanning: (tabId: string, log?: LogEntry) => void;
  addLog: (tabId: string, log: LogEntry) => void;
  clearTabLogs: (tabId: string) => void;

  // Non-destructive device hiding
  hideDevice: (deviceId: string) => void;
  unhideDevice: (deviceId: string) => void;
  clearHiddenDevices: () => void;
}

const DEFAULT_TABS: NetworkTab[] = [
  {
    id: 'tab-airtel-wifi',
    title: '📶 Airtel Wi-Fi',
    subnet: '192.168.1.0/24',
    createdAt: new Date().toISOString(),
    isScanning: false,
    activeRunId: null,
    stage: 'IDLE',
    progress: {
      total: 254,
      processed: 254,
      successful: 11,
      failed: 243,
      percent: 100,
      currentIp: '',
    },
    logs: [],
    discoveredDevices: [],
    isArchived: false,
  },
  {
    id: 'tab-sim-lab',
    title: '🏢 Simulation Lab',
    subnet: '192.168.100.0/24',
    createdAt: new Date().toISOString(),
    isScanning: false,
    activeRunId: null,
    stage: 'IDLE',
    progress: {
      total: 6,
      processed: 6,
      successful: 6,
      failed: 0,
      percent: 100,
      currentIp: '',
    },
    logs: [],
    discoveredDevices: [],
    isArchived: true, // In archive by default to keep active view clean
  },
];

export const useNetworkWorkspaceStore = create<NetworkWorkspaceState>()(
  persist(
    (set, get) => ({
      tabs: DEFAULT_TABS,
      activeTabId: 'tab-airtel-wifi',
      hiddenDeviceIds: [],

      setActiveTab: (tabId: string) => {
        set({ activeTabId: tabId });
      },

      createTab: (title: string, subnet: string) => {
        const id = `tab-${Date.now().toString(36)}`;
        const cleanTitle = title.trim() || `Network ${subnet}`;
        const cleanSubnet = subnet.trim();
        
        const newTab: NetworkTab = {
          id,
          title: cleanTitle,
          subnet: cleanSubnet,
          createdAt: new Date().toISOString(),
          isScanning: false,
          activeRunId: null,
          stage: 'IDLE',
          progress: {
            total: 254,
            processed: 0,
            successful: 0,
            failed: 0,
            percent: 0,
            currentIp: '',
          },
          logs: [{
            id: Math.random().toString(36).substring(7),
            timestamp: new Date().toISOString(),
            level: 'INFO',
            message: `Workspace created for subnet ${cleanSubnet}`,
            stage: 'INIT',
          }],
          discoveredDevices: [],
          isArchived: false,
        };

        set((state) => ({
          tabs: [...state.tabs, newTab],
          activeTabId: id,
        }));

        return id;
      },

      closeTab: (tabId: string) => {
        const { tabs, activeTabId } = get();
        // Archive tab so data is never destroyed
        const updated = tabs.map((t) => (t.id === tabId ? { ...t, isArchived: true } : t));
        
        // If active tab was closed, switch active to another unarchived tab
        let nextActiveId = activeTabId;
        if (activeTabId === tabId) {
          const remaining = updated.filter((t) => !t.isArchived);
          nextActiveId = remaining.length > 0 ? remaining[0].id : '';
        }

        set({ tabs: updated, activeTabId: nextActiveId });
      },

      restoreTab: (tabId: string) => {
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, isArchived: false } : t)),
          activeTabId: tabId,
        }));
      },

      permanentlyRemoveFromHistory: (tabId: string) => {
        const { tabs, activeTabId } = get();
        const filtered = tabs.filter((t) => t.id !== tabId);
        let nextActive = activeTabId;
        if (activeTabId === tabId) {
          const remaining = filtered.filter((t) => !t.isArchived);
          nextActive = remaining.length > 0 ? remaining[0].id : '';
        }
        set({ tabs: filtered, activeTabId: nextActive });
      },

      startScanning: (tabId: string, runId: string, totalTargets: number) => {
        set((state) => ({
          tabs: state.tabs.map((t) => {
            if (t.id !== tabId) return t;
            return {
              ...t,
              isScanning: true,
              activeRunId: runId,
              stage: 'PROBING',
              progress: {
                total: totalTargets || 254,
                processed: 0,
                successful: 0,
                failed: 0,
                percent: 0,
                currentIp: '',
              },
            };
          }),
        }));
      },

      updateProgress: (tabId, progress, log, device) => {
        set((state) => ({
          tabs: state.tabs.map((t) => {
            if (t.id !== tabId) return t;
            
            const updatedProgress = { ...t.progress, ...progress };
            const nextLogs = log ? [...t.logs, log].slice(-1000) : t.logs;
            
            let nextDevices = t.discoveredDevices;
            if (device && device.ip) {
              const exists = nextDevices.some((d) => d.ip === device.ip);
              if (exists) {
                nextDevices = nextDevices.map((d) => (d.ip === device.ip ? { ...d, ...device } : d));
              } else {
                nextDevices = [...nextDevices, device];
              }
            }

            return {
              ...t,
              progress: updatedProgress,
              logs: nextLogs,
              discoveredDevices: nextDevices,
            };
          }),
        }));
      },

      setStage: (tabId, stage, log) => {
        set((state) => ({
          tabs: state.tabs.map((t) => {
            if (t.id !== tabId) return t;
            return {
              ...t,
              stage,
              logs: log ? [...t.logs, log].slice(-1000) : t.logs,
            };
          }),
        }));
      },

      completeScanning: (tabId, log) => {
        set((state) => ({
          tabs: state.tabs.map((t) => {
            if (t.id !== tabId) return t;
            return {
              ...t,
              isScanning: false,
              stage: 'COMPLETED',
              progress: {
                ...t.progress,
                percent: 100,
              },
              logs: log ? [...t.logs, log].slice(-1000) : t.logs,
            };
          }),
        }));
      },

      addLog: (tabId, log) => {
        set((state) => ({
          tabs: state.tabs.map((t) => {
            if (t.id !== tabId) return t;
            return {
              ...t,
              logs: [...t.logs, log].slice(-1000),
            };
          }),
        }));
      },

      clearTabLogs: (tabId) => {
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, logs: [] } : t)),
        }));
      },

      hideDevice: (deviceId: string) => {
        set((state) => ({
          hiddenDeviceIds: Array.from(new Set([...state.hiddenDeviceIds, deviceId])),
        }));
      },

      unhideDevice: (deviceId: string) => {
        set((state) => ({
          hiddenDeviceIds: state.hiddenDeviceIds.filter((id) => id !== deviceId),
        }));
      },

      clearHiddenDevices: () => {
        set({ hiddenDeviceIds: [] });
      },
    }),
    {
      name: 'netra-network-workspaces-v1',
    }
  )
);

