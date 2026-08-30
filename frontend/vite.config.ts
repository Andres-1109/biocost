import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Registro de Service Worker + manifest para instalación como PWA (HU-27).
    // La estrategia de cacheo offline real (HU-28, HU-29) se implementa en la Épica 7 —
    // por ahora Workbox solo precachea el build estático (comportamiento por defecto).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Biocost',
        short_name: 'Biocost',
        description:
          'Gestión de costos, rentabilidad y trazabilidad financiera para unidades productivas acuícolas.',
        theme_color: '#0f766e',
        background_color: '#0f766e',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
