import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname, relative, basename } from 'node:path'

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
 * The `@pikku/core/ecosystem/*` tier was deleted in favour of one door per
 * name. Nothing resolves those specifiers any more, but a dead one is easy to
 * miss: a type-only import is erased before it can fail at runtime, and the
 * service packages exclude `**\/*.test.ts` from their tsconfig, so neither the
 * test run nor `yarn tsc` reports it.
 */
describe('the ecosystem entry-point tier is gone', () => {
  test('no source file imports from @pikku/core/ecosystem', () => {
    const self = basename(fileURLToPath(import.meta.url)).replace(/\.ts$/, '')
    const offenders = collectSourceFiles(repoRoot)
      .filter(
        (file) =>
          !basename(file).startsWith(self) &&
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
