import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The `api` backend's exposed SDK, imported as `@sdk/api/<file>`.
    // tsconfig `paths` teaches tsc; vite is told separately.
    alias: {
      '@sdk/api': fileURLToPath(
        new URL('../../.pikku/sdk/api/exposed', import.meta.url)
      ),
    },
  },
  server: {
    port: 7213,
    // The API is same-origin under /api in every deployed shape, so dev
    // proxies rather than pointing the client at another host — otherwise the
    // cookie Better Auth sets in dev is on the wrong origin.
    proxy: { '/api': 'http://localhost:4013' },
  },
})
