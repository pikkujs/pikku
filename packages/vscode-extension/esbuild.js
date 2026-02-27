const esbuild = require('esbuild')

const watch = process.argv.includes('--watch')

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  sourcemap: true,
  external: ['vscode'],
  minify: !watch,
  logLevel: 'info',
  // Shim import.meta.url for ESM deps bundled into CJS (e.g. tsx)
  define: {
    'import.meta.url': 'importMetaUrl',
  },
  banner: {
    js: 'var importMetaUrl = require("url").pathToFileURL(__filename).href;',
  },
}

if (watch) {
  esbuild.context(buildOptions).then((ctx) => {
    ctx.watch()
    console.log('Watching for changes...')
  })
} else {
  esbuild.build(buildOptions).then(() => {
    console.log('Build complete: dist/extension.js')
  })
}
