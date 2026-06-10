import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'android/launchericon-48x48.png',
        'android/launchericon-72x72.png',
        'android/launchericon-96x96.png',
        'android/launchericon-144x144.png',
        'android/launchericon-192x192.png',
        'android/launchericon-512x512.png',
        'favicon.ico',
      ],
      manifest: {
        name: '家傳芋曉 POS',
        short_name: '家傳芋曉',
        description: '家傳芋曉 - 餐廳後台管理系統',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'minimal-ui',
        scope: '/',
        start_url: '/',
        orientation: 'portrait-primary',
        lang: 'zh-Hant',
        categories: ['business', 'food', 'productivity'],
        prefer_related_applications: false,
        icons: [
          { src: '/android/launchericon-48x48.png', sizes: '48x48', type: 'image/png' },
          { src: '/android/launchericon-72x72.png', sizes: '72x72', type: 'image/png' },
          { src: '/android/launchericon-96x96.png', sizes: '96x96', type: 'image/png' },
          { src: '/android/launchericon-144x144.png', sizes: '144x144', type: 'image/png' },
          { src: '/android/launchericon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/android/launchericon-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/android/launchericon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/android/launchericon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        ],
        screenshots: [],
        shortcuts: [],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              networkTimeoutSeconds: 10,
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // 代理 NVIDIA NIM API 請求，避免 CORS 問題
      '/api/nvidia': {
        target: 'https://integrate.api.nvidia.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nvidia/, ''),
      },
      // 代理其他後端 API 請求
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
