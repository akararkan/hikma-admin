import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev proxy: /api and /actuator go to the Spring backend on :8080.
// Override target with VITE_PROXY_TARGET, or bypass the proxy entirely by
// setting VITE_API_BASE (the client then calls that origin directly / CORS).
export default defineConfig(() => {
  const target = process.env.VITE_PROXY_TARGET || 'http://localhost:8080'
  return {
    plugins: [react()],
    server: {
      port: 5174,
      proxy: {
        '/api': { target, changeOrigin: true },
        '/actuator': { target, changeOrigin: true },
      },
    },
  }
})
