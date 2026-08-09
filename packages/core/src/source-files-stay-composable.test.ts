import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname, relative } from 'node:path'

const srcRoot = dirname(fileURLToPath(import.meta.url))

/**
 * The ceiling a single module may reach before it has to be composed out of
 * smaller ones.
 */
const MAX_LINES = 2000

const collectSourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === 'dist' ? [] : collectSourceFiles(entryPath)
    }
    return entry.name.endsWith('.ts') ? [entryPath] : []
  })

describe('source files stay composable', () => {
  test(`no module in @pikku/core exceeds ${MAX_LINES} lines`, () => {
    const offenders = collectSourceFiles(srcRoot)
      .map((file) => ({
        file: relative(srcRoot, file),
        lines: readFileSync(file, 'utf-8').split('\n').length,
      }))
      .filter(({ lines }) => lines > MAX_LINES)
      .sort((a, b) => b.lines - a.lines)

    assert.deepEqual(
      offenders,
      [],
      `modules over ${MAX_LINES} lines:\n` +
        offenders.map(({ file, lines }) => `  ${lines}  ${file}`).join('\n')
    )
  })
})
