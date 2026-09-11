/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0a0d14',
        surface: {
          50: '#1e2638',
          100: '#161c2b',
          200: '#111722',
          300: '#0d111a',
          DEFAULT: '#111722',
        },
        border: {
          subtle: '#1e293b',
          muted: '#334155',
          DEFAULT: '#1e293b',
        },
        status: {
          healthy: '#10b981',
          warning: '#f59e0b',
          critical: '#ef4444',
          unknown: '#6b7280',
          info: '#3b82f6',
        },
        accent: {
          cyan: '#06b6d4',
          blue: '#3b82f6',
          purple: '#8b5cf6',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}

