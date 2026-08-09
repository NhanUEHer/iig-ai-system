import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const rootPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION || rootPackage.version),
    __APP_ENVIRONMENT__: JSON.stringify(process.env.VITE_APP_ENV || (mode === 'production' ? 'production' : 'development')),
    __APP_COMMIT__: JSON.stringify(process.env.VITE_APP_COMMIT || '')
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:5005',
        changeOrigin: true,
        secure: false,
      },
      '/local_audio': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:5005',
        changeOrigin: true,
        secure: false,
      },
      '/tmp_local': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:5005',
        changeOrigin: true,
        secure: false,
      },
      '/local_voices': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:5005',
        changeOrigin: true,
        secure: false,
      }
    }
  }
}))
