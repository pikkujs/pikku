import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname, relative } from 'node:path'

const srcRoot = dirname(fileURLToPath(import.meta.url))
const thisFile = fileURLToPath(import.meta.url)

/**
 * Names removed from the public surface, each with the entry point that must
 * no longer carry it.
 *
 * They survived as throwing stubs only so the pinned bootstrap CLI could
 * resolve the import; `@pikku/cli@0.12.96` emits none of them, so the stubs
 * went too.
 */
const REMOVED = [
  { name: 'addTagPermission', entry: './middleware/index.js' },
  { name: 'addHTTPPermission', entry: './wirings/http/index.js' },
  { name: 'ZodLike', entry: './index.js' },
]

const collectSourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === 'dist' ? [] : collectSourceFiles(entryPath)
    }
    return /\.ts$/.test(entry.name) ? [entryPath] : []
  })

describe('removed legacy exports stay removed', () => {
  for (const { name, entry } of REMOVED) {
    test(`${entry} no longer exports ${name}`, async () => {
      const module = await import(entry)
      assert.equal(
        name in module,
        false,
        `${entry} exports ${name} again; it was removed in #972`
      )
    })
  }

  test('no source file mentions the removed permission wrappers', () => {
    const offenders = collectSourceFiles(srcRoot)
      .filter(
        (file) =>
          file !== thisFile &&
          /\baddTagPermission\b|\baddHTTPPermission\b|\bZodLike\b/.test(
            readFileSync(file, 'utf-8')
          )
      )
      .map((file) => relative(srcRoot, file))

    assert.deepEqual(
      offenders,
      [],
      `removed names still referenced in:\n${offenders.join('\n')}`
    )
  })
})
