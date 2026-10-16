import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import * as ts from 'typescript'
import { getCachedSourceFile } from './source-file-cache.js'

const esm: ts.CreateSourceFileOptions = {
  languageVersion: ts.ScriptTarget.ESNext,
  impliedNodeFormat: ts.ModuleKind.ESNext,
}

describe('getCachedSourceFile', () => {
  test('a second program parsing the same file at the same settings reuses it', () => {
    const first = getCachedSourceFile('/cache/a.ts', 'export const a = 1', esm)
    const second = getCachedSourceFile('/cache/a.ts', 'export const a = 1', esm)
    assert.equal(first.reused, false)
    assert.equal(second.reused, true)
    assert.equal(second.file, first.file)
  })

  test('changed text is re-parsed', () => {
    getCachedSourceFile('/cache/b.ts', 'export const b = 1', esm)
    const changed = getCachedSourceFile(
      '/cache/b.ts',
      'export const b = 2',
      esm
    )
    assert.equal(changed.reused, false)
  })

  test('a file parsed under different settings is not shared', () => {
    const asEsm = getCachedSourceFile('/cache/c.ts', 'export {}', esm)
    const asCjs = getCachedSourceFile('/cache/c.ts', 'export {}', {
      ...esm,
      impliedNodeFormat: ts.ModuleKind.CommonJS,
    })
    const atOlderTarget = getCachedSourceFile(
      '/cache/c.ts',
      'export {}',
      ts.ScriptTarget.ES2021
    )
    assert.equal(asCjs.reused, false)
    assert.notEqual(asCjs.file, asEsm.file)
    assert.equal(atOlderTarget.reused, false)
  })

  test('populate: false reads the cache but never adds to it', () => {
    getCachedSourceFile('/cache/d.ts', 'export {}', esm, { populate: false })
    const later = getCachedSourceFile('/cache/d.ts', 'export {}', esm, {
      populate: false,
    })
    assert.equal(later.reused, false)

    const owned = getCachedSourceFile('/cache/d.ts', 'export {}', esm)
    const borrowed = getCachedSourceFile('/cache/d.ts', 'export {}', esm, {
      populate: false,
    })
    assert.equal(borrowed.reused, true)
    assert.equal(borrowed.file, owned.file)
  })
})
