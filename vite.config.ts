import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: [
        'android/launchericon-192x192.png',
        'android/launchericon-512x512.png'
      ],
      manifest: {
        name: '家傳芋曉 POS',
        short_name: '家傳芋曉',
        description: '家傳芋曉 - 餐廳後台管理系統',
        theme_color: '#1a1a2e',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/android/launchericon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/android/launchericon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/android/launchericon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MB
      }
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
