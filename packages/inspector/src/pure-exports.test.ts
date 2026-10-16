import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Exports of `@pikku/inspector` that do no TypeScript analysis. Each must load
 * without the `typescript` package, so the Go engine can drop that dependency
 * and these keep working: a shared module that imports the compiler for an
 * unrelated helper is enough to drag it in.
 */
const PURE_EXPORTS = [
  'getInitialInspectorState',
  'finalizeInspectorState',
  'ErrorCode',
  'AUTH_HANDLER_FUNC_ID',
  'SCENARIO_INSTRUMENTATION_FUNCTIONS',
  'serializeInspectorState',
  'deserializeInspectorState',
  'filterInspectorState',
  'deserializeDslWorkflow',
  'deserializeGraphWorkflow',
  'deserializeAllDslWorkflows',
  'getFilesAndMethods',
  'resolveFunctionMeta',
  'addonResolutionDirs',
]

const srcDir = dirname(fileURLToPath(import.meta.url))

/** The module `index.ts` takes each export from. */
const moduleOf = (name: string): string => {
  const index = readFileSync(join(srcDir, 'index.ts'), 'utf8')
  for (const match of index.matchAll(
    /^export\s+\{([^}]*)\}\s+from\s+'([^']+)'/gm
  )) {
    const names = match[1]!
      .split(',')
      .map((each) => each.trim())
      .filter(Boolean)
    if (names.includes(name)) {
      return resolve(srcDir, match[2]!.replace(/\.js$/, '.ts'))
    }
  }
  throw new Error(`index.ts does not export ${name}`)
}

const blocker = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-pure-exports-'))
  const file = join(dir, 'block-typescript.ts')
  writeFileSync(
    file,
    `Bun.plugin({
  name: 'block-typescript',
  setup(build) {
    build.onLoad({ filter: /[\\\\/]typescript[\\\\/]lib[\\\\/]typescript\\.js$/ }, () => {
      throw new Error('typescript was loaded')
    })
  },
})
`
  )
  return file
}

describe('pure exports', () => {
  const preload = blocker()

  test('the blocker stops a module that imports typescript', () => {
    const result = Bun.spawnSync([
      process.execPath,
      '--preload',
      preload,
      '-e',
      `await import(${JSON.stringify(join(srcDir, 'inspector.ts'))})`,
    ])
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toContain('typescript was loaded')
  })

  for (const name of PURE_EXPORTS) {
    test(`${name} loads without typescript`, () => {
      const script = `const m = await import(${JSON.stringify(moduleOf(name))})
if (m[${JSON.stringify(name)}] === undefined) throw new Error('missing export')`
      const result = Bun.spawnSync([
        process.execPath,
        '--preload',
        preload,
        '-e',
        script,
      ])
      expect(result.stderr.toString()).toBe('')
      expect(result.exitCode).toBe(0)
    })
  }
})
