import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@pikku/assistant-ui': path.resolve(
        __dirname,
        '../assistant-ui/src/index.ts'
      ),
      crypto: path.resolve(__dirname, 'src/polyfills/crypto.ts'),
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  server: {
    port: 7070,
    proxy: {
      '/rpc': { target: 'http://localhost:7103', changeOrigin: true },
      '/api': { target: 'http://localhost:7103', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
  },
})
