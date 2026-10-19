import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 7213,
    // The API is same-origin under /api in every deployed shape, so dev
    // proxies rather than pointing the client at another host — otherwise the
    // cookie Better Auth sets in dev is on the wrong origin.
    proxy: { '/api': 'http://localhost:4013' },
  },
})
