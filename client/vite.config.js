import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Every API call falls back to http://localhost:3001 when VITE_API_URL is
  // unset. In a production bundle that fallback is invisible until the browser
  // reports "Server not reachable", so fail the build here instead — a clean
  // checkout has no .env.production (it is gitignored).
  if (mode === 'production' && !loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL) {
    throw new Error('VITE_API_URL is not set — create client/.env.production before building.');
  }
  return {
  plugins: [react()],
  build: {
    // Split large third-party libs into their own long-term-cacheable chunks so
    // app-code changes don't bust the vendor cache and the main chunk shrinks.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'chart-vendor': ['lightweight-charts'],
          'ui-vendor': ['framer-motion', 'lucide-react', 'react-icons'],
          'net-vendor': ['socket.io-client', 'zustand'],
        },
      },
    },
  },
  };
})
