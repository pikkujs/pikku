import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

/**
 * The app the browser scenarios drive, served by the dev server at `/app`.
 *
 * `base` has to match the mount prefix or the built asset URLs are absolute
 * from the origin and 404 behind it. The generated client is imported straight
 * out of the e2e app's `.pikku`, the way a frontend in the same repository
 * would — nothing here is published, so there is no package boundary to keep.
 *
 * `--mode native` builds the same app for the Tauri shell in `src-tauri`: the
 * webview serves it from its own root, and `.env.native` names the server it
 * talks to, since its own origin is the app's and not the API's. It writes to
 * `dist-native` so the build the scenarios serve is left alone.
 */
export default defineConfig(({ mode }) => {
  const native = mode === 'native'
  return {
    base: native ? '/' : '/app/',
    plugins: [react()],
    resolve: {
      alias: {
        '#pikku': fileURLToPath(new URL('../../.pikku', import.meta.url)),
      },
    },
    build: {
      outDir: native ? 'dist-native' : 'dist',
      emptyOutDir: true,
    },
  }
})
