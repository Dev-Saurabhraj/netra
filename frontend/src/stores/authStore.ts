import { create } from 'zustand';
import { UserProfile } from '../types';
import { apiClient } from '../lib/api';

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (token: string, user: UserProfile) => void;
  logout: () => void;
  fetchProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('netra_token'),
  user: null,
  isAuthenticated: !!localStorage.getItem('netra_token'),
  isLoading: !!localStorage.getItem('netra_token'),

  setAuth: (token: string, user: UserProfile) => {
    localStorage.setItem('netra_token', token);
    set({ token, user, isAuthenticated: true, isLoading: false });
  },

  logout: () => {
    localStorage.removeItem('netra_token');
    set({ token: null, user: null, isAuthenticated: false, isLoading: false });
  },

  fetchProfile: async () => {
    const token = localStorage.getItem('netra_token');
    if (!token) {
      set({ isLoading: false, isAuthenticated: false, user: null });
      return;
    }

    try {
      set({ isLoading: true });
      const res = await apiClient.get('/auth/me');
      set({ user: res.data.data, isAuthenticated: true, isLoading: false });
    } catch (err) {
      localStorage.removeItem('netra_token');
      set({ token: null, user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));

