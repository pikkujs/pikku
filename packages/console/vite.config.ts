import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import path from 'path'

export default defineConfig({
  plugins: [
    // Compile messages/*.json → src/paraglide so `m`/`mKey` resolve, with HMR
    // on message edits. Must run first.
    paraglideVitePlugin({ project: './project.inlang', outdir: './src/paraglide' }),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      crypto: path.resolve(__dirname, 'src/polyfills/crypto.ts'),
      '@pikku/mantine/core': path.resolve(
        __dirname,
        '../frontend/mantine/src/core/index.ts'
      ),
      '@pikku/react': path.resolve(__dirname, '../frontend/react/src/index.ts'),
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  server: {
    port: 7070,
    proxy: {
      '/rpc': { target: 'http://localhost:7103', changeOrigin: true },
      '/api': { target: 'http://localhost:7103', changeOrigin: true },
      '/function-tests': { target: 'http://localhost:7103', changeOrigin: true },
      '/workflow-run': { target: 'http://localhost:7103', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
  },
})
