import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { paraglideEnums } from '@pikku/paraglide/vite'
import { fileURLToPath, URL } from 'node:url'
import { crossSiteSession } from './dev/cross-site-session.plugin'

// Plain TanStack Start config (Node target) — used for local sandbox dev. This
// template is deploy-provider agnostic: it ships NO @cloudflare/vite-plugin. At
// deploy, fabric CI injects the CF adapter (vite.config.cf.ts merges cloudflare()
// on top of this config) to emit the CF Workers SSR bundle. Do not add cloudflare
// here — that would double-apply it and couple the template to a provider.
export default defineConfig({
  plugins: [
    // Compile messages/*.json → src/paraglide so `m` resolves, with HMR
    // on message edits. Must run first.
    paraglideVitePlugin({ project: './project.inlang', outdir: './src/paraglide' }),
    // AFTER paraglideVitePlugin — the generated module imports the compiled `m`.
    // Reconciles the message catalog against the database's own enums, so a
    // state the DB allows and the catalog has no label for is a compile error
    // rather than a raw value leaking onto a page.
    paraglideEnums({
      enumsFile: '../../packages/functions/.pikku/db/enums.gen.ts',
    }),
    tanstackStart(),
    react(),
    // Dev-only (apply: 'serve'), and nothing in src/ imports it: keeps the app
    // signed in inside the console's cross-site preview iframe on browsers that
    // drop third-party cookies. See dev/cross-site-session.plugin.ts.
    crossSiteSession(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    // Local dev only — mirrors the sandbox edge (Caddy): /api/auth/* keeps its
    // prefix (Better Auth mounts there), every other /api/* reaches the pikku
    // dev server unprefixed (/rpc/...). In the sandbox Caddy handles /api
    // before Vite, so this proxy never fires there.
    // changeOrigin stays false so the backend sees Host = the app origin —
    // Better Auth trusts the request origin only when it matches Host.
    proxy: {
      '/api/auth': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:3000',
        changeOrigin: false,
      },
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:3000',
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
        // `ws: true` or channels simply do not work in dev. Vite does not
        // forward the upgrade request without it, so every websocket dies at the
        // handshake — which looks exactly like a channel nobody is publishing
        // to, and is why the realtime surface went unnoticed as broken.
        ws: true,
      },
      // File content: the pikku dev server serves uploads (PUT) and assets (GET)
      // AT these prefixes (pikku.config.json content.uploadUrlPrefix/assetUrlPrefix),
      // so proxy them through WITHOUT a rewrite. `/content` (not `/assets`) avoids
      // colliding with Vite/TanStack's own built asset paths. In the sandbox Caddy
      // handles these before Vite, so this proxy only fires in local dev.
      '/upload': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:3000',
        changeOrigin: false,
      },
      '/content': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
})
