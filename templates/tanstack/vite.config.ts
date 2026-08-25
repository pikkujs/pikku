import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

/**
 * The pikku server this app talks to. `pikku dev` and `pikku serve` both listen
 * here, and the same paths are proxied in dev so the browser only ever sees one
 * origin — the shape it gets for free once `pikku serve` mounts `dist/client`.
 */
const PIKKU_SERVER = 'http://localhost:4002'

/** Paths that belong to pikku rather than to the client-side router. */
const API_PATHS = ['/todos', '/_pikku']

export default defineConfig({
  server: {
    port: 4003,
    proxy: Object.fromEntries(
      API_PATHS.map((path) => [
        path,
        { target: PIKKU_SERVER, changeOrigin: true },
      ])
    ),
  },
  plugins: [
    tanstackStart({
      srcDirectory: 'web',
      /**
       * A client-only build, written where `frontend.dir` in pikku.config.json
       * points. The prerender output is renamed from TanStack's `_shell.html`
       * because pikku serves — and SPA-falls-back to — `index.html`.
       */
      spa: {
        enabled: true,
        prerender: { outputPath: '/index.html' },
      },
    }),
    viteReact(),
  ],
})
