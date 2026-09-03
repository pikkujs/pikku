import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname, relative } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')

const skipped = new Set([
  'node_modules',
  'dist',
  '.pikku',
  '.next',
  'build',
  '.git',
  '.deploy',
  'coverage',
  // Nested checkouts of this same repository. A worktree under `.claude`
  // carries its own copy of this file, and a copy of a scan for a specifier
  // necessarily contains that specifier — so the guard reports itself, once
  // per worktree, on a machine that happens to have some. Dropping the
  // extension excludes only *this* path, not the same path inside another
  // tree, and the failure never reproduces in CI, whose checkout is clean.
  '.claude',
])

const collectSourceFiles = (
  directory: string,
  out: string[] = []
): string[] => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skipped.has(entry.name)) {
        collectSourceFiles(join(directory, entry.name), out)
      }
    } else if (/\.(ts|tsx|js|mjs|mts|cts)$/.test(entry.name)) {
      out.push(join(directory, entry.name))
    }
  }
  return out
}

/**
 * A stale compiled `.test.js` next to this file would otherwise read as an
 * offender of its own scan, which is how a sibling removal guard in this
 * directory reports a phantom failure on a dirty tree. Comparing paths with
 * the extension dropped excludes this file and its build artifacts without
 * excluding a neighbour that merely shares the prefix.
 */
const withoutExtension = (file: string): string =>
  file.replace(/\.(ts|tsx|js|mjs|mts|cts)$/, '')

/**
 * The `@pikku/core/ecosystem/*` tier was deleted in favour of one door per
 * name. Nothing resolves those specifiers any more, but a dead one is easy to
 * miss: a type-only import is erased before it can fail at runtime, and the
 * service packages exclude `**\/*.test.ts` from their tsconfig, so neither the
 * test run nor `yarn tsc` reports it.
 */
describe('the ecosystem entry-point tier is gone', () => {
  test('no source file imports from @pikku/core/ecosystem', () => {
    const self = withoutExtension(fileURLToPath(import.meta.url))
    const offenders = collectSourceFiles(repoRoot)
      .filter(
        (file) =>
          withoutExtension(file) !== self &&
          /@pikku\/core\/ecosystem/.test(readFileSync(file, 'utf-8'))
      )
      .map((file) => relative(repoRoot, file))
    assert.deepEqual(
      offenders,
      [],
      `@pikku/core/ecosystem imports found in:\n${offenders.join('\n')}`
    )
  })
})
