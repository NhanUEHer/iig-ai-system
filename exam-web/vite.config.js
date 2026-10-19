import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5180,
    proxy: {
      '/api': 'http://127.0.0.1:5005',
      '/question-bank-media': 'http://127.0.0.1:5005',
    },
  },
})
