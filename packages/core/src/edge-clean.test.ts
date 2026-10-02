import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join } from 'node:path'
import { build } from 'esbuild'
import { CLOUDSUPPORT, cloudSupportFor } from '@pikku/deploy'

const root = join(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  exports: Record<string, string | { import?: string; default?: string }>
}

const builtins = new Set(builtinModules)
const isBuiltin = (specifier: string) =>
  specifier.startsWith('node:') || builtins.has(specifier.split('/')[0]!)

const target = (value: string | { import?: string; default?: string }) =>
  typeof value === 'string' ? value : (value.import ?? value.default)

const support = cloudSupportFor(
  CLOUDSUPPORT,
  '@pikku/core',
  undefined
)?.declaration
const serverSubpaths = new Set(
  Object.entries(support?.exports ?? {})
    .filter(([, tier]) => tier === 'server')
    .map(([subpath]) => subpath)
)

describe('@pikku/core edge-tier entry points', () => {
  test('cloudsupport lists core as edge', () => {
    assert.equal(support?.runtime, 'edge')
  })

  // Every subpath not declared `server` must bundle for a neutral platform
  // without reaching a single Node built-in. There is no allowance list: an
  // import that cannot run on an edge isolate belongs in a `server` subpath.
  for (const [subpath, value] of Object.entries(pkg.exports)) {
    if (serverSubpaths.has(subpath)) continue
    const dist = target(value)
    if (!dist?.startsWith('./dist/')) continue
    const source = join(
      root,
      dist.replace('./dist/', 'src/').replace(/\.js$/, '.ts')
    )

    test(`${subpath} reaches no Node built-in`, async () => {
      const result = await build({
        entryPoints: [source],
        bundle: true,
        write: false,
        metafile: true,
        platform: 'neutral',
        format: 'esm',
        logLevel: 'silent',
        // Bare specifiers (packages and built-ins) stay external so we can
        // inspect exactly which ones core's own code asks for.
        packages: 'external',
      })

      const offenders = new Set<string>()
      for (const [file, meta] of Object.entries(result.metafile.inputs)) {
        // Only core's own source is under test; packages are external.
        if (file.includes('node_modules')) continue
        for (const imp of meta.imports) {
          if (isBuiltin(imp.path)) offenders.add(`${imp.path} (from ${file})`)
        }
      }
      assert.deepEqual([...offenders], [])
    })
  }
})
