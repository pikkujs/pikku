import { describe, test } from 'node:test'
import assert from 'node:assert'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { LIST_CHANGES_MAX } from '../lib/list-limit.js'

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : []
  })

describe('listChanges requests', () => {
  test('the server caps a page at 200, so no caller asks for more', () => {
    assert.strictEqual(LIST_CHANGES_MAX, 200)
    const root = join(import.meta.dirname, '..')
    let checked = 0
    for (const file of sources(root)) {
      const text = readFileSync(file, 'utf8')
      for (const call of text.matchAll(
        /'listChanges',\s*\{[^}]*?limit:\s*([\w.]+)/g
      )) {
        const limit = call[1]!
        checked++
        assert.ok(
          limit === 'LIST_CHANGES_MAX' || Number(limit) <= LIST_CHANGES_MAX,
          `${file} asks listChanges for limit ${limit}`
        )
      }
    }
    assert.ok(checked >= 4)
  })
})
