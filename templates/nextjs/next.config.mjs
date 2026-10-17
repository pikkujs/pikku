import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** @type {import('next').NextConfig} */
// Next 16 builds with Turbopack by default, which does not map the `.js`
// specifiers of the ESM sources to their `.ts` files. The build and dev scripts
// pass --webpack so the extensionAlias below keeps applying.
const nextConfig = {
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.js', '.ts', '.tsx', '.jsx'], // Resolves .js imports to both .js and .ts files
    }
    return config
  },
  turbopack: {
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js'],
  },
  // outputFileTracingRoot: join(__dirname, '../../'),
}

export default nextConfig
