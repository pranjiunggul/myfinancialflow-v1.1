import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  server: {
    host: true,
    port: 3000,
    open: true
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'MyFinancialFlow V1.1 - Smart Personal Finance',
        short_name: 'MyFinancialFlow V1.1',
        description: 'Lightweight, offline-first personal finance tracker with visible Drive sync and smart insights',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        shortcuts: [
          {
            name: 'Fast Glance',
            short_name: 'Glance',
            description: 'Instant overview of balances and today spend',
            url: '/?mode=glance',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
          },
          {
            name: 'Add Expense',
            short_name: 'Add',
            description: 'Quickly record a new transaction',
            url: '/?mode=add',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
          },
          {
            name: 'Scan Receipt',
            short_name: 'Scan',
            description: 'Scan receipt with OCR',
            url: '/?mode=scan',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
          }
        ]
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-charts': ['chart.js', 'react-chartjs-2'],
          'vendor-db': ['dexie', 'dexie-react-hooks'],
          'vendor-react': ['react', 'react-dom']
        }
      }
    }
  }
});
