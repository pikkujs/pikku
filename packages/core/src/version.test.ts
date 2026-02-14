import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import {
  formatVersionedId,
  parseVersionedId,
  isVersionedId,
} from './version.js'

describe('formatVersionedId', () => {
  test('formats base name with version', () => {
    assert.strictEqual(formatVersionedId('createUser', 1), 'createUser@v1')
    assert.strictEqual(formatVersionedId('createUser', 2), 'createUser@v2')
    assert.strictEqual(formatVersionedId('createUser', 10), 'createUser@v10')
  })

  test('handles namespaced base names', () => {
    assert.strictEqual(
      formatVersionedId('pkg:createUser', 3),
      'pkg:createUser@v3'
    )
  })
})

describe('parseVersionedId', () => {
  test('parses versioned IDs', () => {
    assert.deepStrictEqual(parseVersionedId('createUser@v1'), {
      baseName: 'createUser',
      version: 1,
    })
    assert.deepStrictEqual(parseVersionedId('createUser@v2'), {
      baseName: 'createUser',
      version: 2,
    })
    assert.deepStrictEqual(parseVersionedId('createUser@v10'), {
      baseName: 'createUser',
      version: 10,
    })
  })

  test('returns null version for unversioned IDs', () => {
    assert.deepStrictEqual(parseVersionedId('createUser'), {
      baseName: 'createUser',
      version: null,
    })
  })

  test('returns null version for invalid version suffix', () => {
    assert.deepStrictEqual(parseVersionedId('createUser@vx'), {
      baseName: 'createUser@vx',
      version: null,
    })
    assert.deepStrictEqual(parseVersionedId('createUser@v0'), {
      baseName: 'createUser@v0',
      version: null,
    })
    assert.deepStrictEqual(parseVersionedId('createUser@v-1'), {
      baseName: 'createUser@v-1',
      version: null,
    })
  })

  test('handles namespaced versioned IDs', () => {
    assert.deepStrictEqual(parseVersionedId('pkg:createUser@v3'), {
      baseName: 'pkg:createUser',
      version: 3,
    })
  })
})

describe('isVersionedId', () => {
  test('returns true for versioned IDs', () => {
    assert.strictEqual(isVersionedId('createUser@v1'), true)
    assert.strictEqual(isVersionedId('createUser@v99'), true)
  })

  test('returns false for unversioned IDs', () => {
    assert.strictEqual(isVersionedId('createUser'), false)
    assert.strictEqual(isVersionedId('createUser@vx'), false)
  })
})
