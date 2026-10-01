import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { parsePackageName } from './dep-extractor.js'

describe('parsePackageName', () => {
  it('names the package behind a deep or scoped import', () => {
    assert.equal(parsePackageName('pg/lib/client'), 'pg')
    assert.equal(parsePackageName('@pikku/core/services'), '@pikku/core')
  })

  it('leaves node and bun builtins out of the dependencies', () => {
    assert.equal(parsePackageName('node:fs'), null)
    assert.equal(parsePackageName('fs'), null)
    assert.equal(parsePackageName('bun:sqlite'), null)
    assert.equal(parsePackageName('bun:ffi'), null)
    assert.equal(parsePackageName('bun'), null)
  })
})
