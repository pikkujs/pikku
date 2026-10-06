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

// Opting a subpath out of the edge check is a deliberate act: it has to be
// added here too, where a reviewer sees it.
const EXPECTED_SERVER_SUBPATHS = [
  './dev',
  './node-host-resolver',
  './services/file-scenario-run-store',
  './services/istanbul-coverage',
  './services/local-content',
  './services/local-content-request-handler',
  './services/local-meta',
  './services/temporary-file-service',
  './services/v8-coverage',
  './testing',
]

// Node globals do not show up as imports, so the built-in check cannot see
// them. A use is allowed only behind a guard that proves the global exists
// (`typeof Buffer !== 'undefined'`, `globalThis.process`) or in a try/catch
// that treats a ReferenceError as "unknown".
const NODE_GLOBAL = /(?<![.\w$'"`])(Buffer|process|__dirname|__filename)\b/
const GUARDED =
  /typeof\s+(Buffer|process)\b|globalThis\.process|globalThis as \{ process|process\.env\.NODE_ENV/

const stripCommentsAndStrings = (code: string) =>
  code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')

// The CLI runners read argv, stdin and exit codes by definition: they only run
// in a process, and the defaults are evaluated when called, not at load.
const PROCESS_BOUND = /^src\/wirings\/cli\//

describe('@pikku/core edge-tier entry points', () => {
  test('cloudsupport lists core as edge', () => {
    assert.equal(support?.runtime, 'edge')
  })

  test('the set of server-only subpaths is the reviewed one', () => {
    assert.deepEqual([...serverSubpaths].sort(), EXPECTED_SERVER_SUBPATHS)
  })

  test('edge subpaths use no unguarded Node global', async () => {
    const reachable = new Set<string>()
    for (const [subpath, value] of Object.entries(pkg.exports)) {
      if (serverSubpaths.has(subpath)) continue
      const dist = target(value)
      if (!dist?.startsWith('./dist/')) continue
      const result = await build({
        entryPoints: [
          join(root, dist.replace('./dist/', 'src/').replace(/\.js$/, '.ts')),
        ],
        bundle: true,
        write: false,
        metafile: true,
        platform: 'neutral',
        format: 'esm',
        logLevel: 'silent',
        packages: 'external',
      })
      for (const file of Object.keys(result.metafile.inputs)) {
        if (!file.includes('node_modules')) reachable.add(file)
      }
    }

    const offenders: string[] = []
    for (const file of reachable) {
      if (PROCESS_BOUND.test(file)) continue
      const lines = stripCommentsAndStrings(
        readFileSync(join(root, file), 'utf8')
      ).split('\n')
      lines.forEach((line, i) => {
        const nearby = lines.slice(Math.max(0, i - 2), i + 1).join('\n')
        if (NODE_GLOBAL.test(line) && !GUARDED.test(nearby)) {
          offenders.push(`${file}:${i + 1}: ${line.trim()}`)
        }
      })
    }
    assert.deepEqual(offenders, [])
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
