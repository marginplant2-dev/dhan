import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
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
})
