import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, Lock, Mail, AlertCircle, ArrowRight } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('admin@netra.local');
  const [password, setPassword] = useState('AdminPassword123!');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((state) => state.setAuth);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('username', email);
      formData.append('password', password);

      const res = await apiClient.post('/auth/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const { access_token, user } = res.data.data;
      setAuth(access_token, user);
      navigate('/');
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Authentication failed. Please verify your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4">
      {/* Background glow decorations */}
      <div className="absolute w-96 h-96 bg-accent-cyan/5 rounded-full blur-3xl pointer-events-none -top-20 -left-20"></div>
      <div className="absolute w-96 h-96 bg-accent-blue/5 rounded-full blur-3xl pointer-events-none -bottom-20 -right-20"></div>

      <div className="w-full max-w-md bg-surface-200 border border-border-subtle rounded-xl p-8 shadow-2xl relative">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-tr from-accent-cyan to-accent-blue mb-4 shadow-lg shadow-cyan-950">
            <Radio className="w-6 h-6 text-black" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wide">NETRA Console</h1>
          <p className="text-xs text-slate-400 mt-1">Intelligent Network Discovery & Topology Intelligence</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-center gap-3 text-xs text-rose-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase text-slate-400 mb-1.5">Email / Username</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-surface-300 border border-border-subtle rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent-cyan/60 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono uppercase text-slate-400 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-surface-300 border border-border-subtle rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent-cyan/60 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-gradient-to-r from-accent-cyan to-accent-blue text-black font-semibold rounded-lg py-2.5 px-4 text-sm flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-50"
          >
            <span>{loading ? 'Authenticating...' : 'Sign In to NETRA'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-border-subtle text-center text-xs text-slate-500 font-mono">
          Default Lab Credentials: admin@netra.local / AdminPassword123!
        </div>
      </div>
    </div>
  );
};

