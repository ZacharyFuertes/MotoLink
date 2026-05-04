import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    hmr: {
      host: 'localhost',
      protocol: 'ws'
    },
    proxy: {
      '/api/sendgrid': {
        target: 'https://api.sendgrid.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/sendgrid/, '')
      }
    }
  }
})
