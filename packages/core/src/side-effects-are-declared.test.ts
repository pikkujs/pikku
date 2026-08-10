import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname, relative } from 'node:path'

const srcRoot = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(srcRoot, '..')

/**
 * A statement that runs when the module is imported, rather than when
 * something in it is called. Today every one is an `addError(...)` registering
 * an error class in the runtime registry.
 */
const TOP_LEVEL_CALL = /^[a-zA-Z_$][\w.$]*\(/

const collectSourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === 'dist' ? [] : collectSourceFiles(entryPath)
    }
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
      ? [entryPath]
      : []
  })

/** Source modules that do something merely by being imported. */
const modulesWithSideEffects = (): string[] =>
  collectSourceFiles(srcRoot)
    .filter((file) =>
      readFileSync(file, 'utf-8')
        .split('\n')
        .some((line) => TOP_LEVEL_CALL.test(line))
    )
    .map((file) => `./dist/${relative(srcRoot, file).replace(/\.ts$/, '.js')}`)
    .sort()

const declared = (): string[] => {
  const pkg = JSON.parse(
    readFileSync(join(packageRoot, 'package.json'), 'utf-8')
  )
  return [...(pkg.sideEffects ?? [])].sort()
}

/**
 * `sideEffects` tells a bundler which modules it may not drop. Claiming
 * `false` outright would be untrue — the error registry is built by
 * `addError(...)` calls that run on import, and a bundler that dropped
 * `errors/errors.js` would leave `getErrorResponse` unable to find any of
 * them. Naming the modules exactly lets everything else be tree-shaken.
 *
 * knowledge: decisions/internals/side-effects-are-an-allowlist-not-a-boolean.md
 */
describe('every module with import-time side effects is declared', () => {
  test('the allowlist matches the modules that actually have them', () => {
    const actual = modulesWithSideEffects()
    const listed = declared()

    assert.deepEqual(
      { missing: actual.filter((m) => !listed.includes(m)) },
      { missing: [] },
      'a module runs code on import but is not in package.json sideEffects. ' +
        'A bundler may drop it, and whatever it registered will be absent at ' +
        'runtime.'
    )

    assert.deepEqual(
      { stale: listed.filter((m) => !actual.includes(m)) },
      { stale: [] },
      'package.json sideEffects names a module that no longer has any — ' +
        'remove it so bundlers can tree-shake it.'
    )
  })

  test('the detector finds a known side effect', () => {
    // Guards the test above: a detector matching nothing would pass whatever
    // package.json claimed.
    assert.ok(
      modulesWithSideEffects().includes('./dist/errors/errors.js'),
      'errors/errors.js registers every error class at import and must match'
    )
  })
})
