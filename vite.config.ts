import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import fs from 'fs'

function versionPlugin(): import('vite').Plugin {
  return {
    name: 'version-plugin',
    configResolved(config) {
      const isBuild = config.command === 'build'
      const now = new Date()
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
      const timeStr = now.toTimeString().slice(0, 5)
      const version = { version: `${dateStr}-01`, buildTime: `${now.toISOString().slice(0, 10)} ${timeStr}` }
      const outDir = isBuild ? path.resolve(__dirname, 'dist') : path.resolve(__dirname, 'public')
      fs.writeFileSync(path.resolve(outDir, 'version.json'), JSON.stringify(version, null, 2))
      console.log(`[version] ${version.version}`)
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 禁用開發時的 SW（只在 build 時生成）
      devOptions: { enabled: false },

      // 自動註冊 SW，每次更新自動向用戶提示
      registerType: 'autoUpdate',

      // Workbox 策略：確保全量自動更新
      workbox: {
        // 預快取所有建置產出（HTML/JS/CSS）
        globPatterns: ['**/*.{html,js,css,ico,png,svg,jpg,webp}'],

        // HTML：Network First → 確保新版 HTML 立即生效
        runtimeCaching: [
          {
            urlPattern: /\/$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 },
            },
          },
          {
            // API 請求：Network First（不離線緩存）
            urlPattern: /\/api\/.*/,
            handler: 'NetworkOnly',
          },
          {
            // 圖片等靜態資源：Stale While Revalidate
            urlPattern: /\.(png|jpg|jpeg|svg|gif|webp|ico)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'image-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],

        // 跳過等待：新 SW 立刻啟用（配合 autoUpdate 模式）
        skipWaiting: true,
        clientsClaim: true,
      },

      // PWA Manifest
      manifest: {
        name: '家傳芋曉 POS',
        short_name: '芋曉POS',
        description: '家傳芋曉餐廳後台管理系統',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'portrait',
        icons: [
          { src: '/android/launchericon-48x48.png', sizes: '48x48', type: 'image/png' },
          { src: '/android/launchericon-72x72.png', sizes: '72x72', type: 'image/png' },
          { src: '/android/launchericon-96x96.png', sizes: '96x96', type: 'image/png' },
          { src: '/android/launchericon-144x144.png', sizes: '144x144', type: 'image/png' },
          { src: '/android/launchericon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/android/launchericon-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['lucide-react', 'recharts'],
          'vendor-utils': ['date-fns', 'xlsx', 'zod', 'zustand'],
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
  server: {
    proxy: {
      // 統一代理所有 /api 請求到後端（包括 /api/nvidia 和 /api/ocr）
      // server.js 會處理 NVIDIA API 轉發和 OCR 處理
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
