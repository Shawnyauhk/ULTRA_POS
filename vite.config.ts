import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
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
      // 代理 NVIDIA NIM API 請求，避免 CORS 問題
      // 注意：前端用 /api/nvidia/chat/completions，Vite 代理到 NVIDIA
      '/api/nvidia': {
        target: 'https://integrate.api.nvidia.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nvidia/, '/v1'),
      },
      // 代理其他後端 API 請求
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
