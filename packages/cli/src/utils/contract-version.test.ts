import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { canonicalJSON } from './hash.js'
import {
  computeContractHash,
  createEmptyManifest,
  serializeManifest,
} from './contract-version.js'
import type { VersionManifest } from './contract-version.js'

describe('canonicalJSON', () => {
  test('sorts object keys alphabetically', () => {
    assert.strictEqual(canonicalJSON({ b: 2, a: 1 }), '{"a":1,"b":2}')
  })

  test('sorts nested objects recursively', () => {
    const input = { z: { b: 2, a: 1 }, a: { d: 4, c: 3 } }
    const expected = '{"a":{"c":3,"d":4},"z":{"a":1,"b":2}}'
    assert.strictEqual(canonicalJSON(input), expected)
  })

  test('preserves array order', () => {
    assert.strictEqual(canonicalJSON([3, 1, 2]), '[3,1,2]')
    assert.strictEqual(
      canonicalJSON([
        { b: 1, a: 2 },
        { d: 3, c: 4 },
      ]),
      '[{"a":2,"b":1},{"c":4,"d":3}]'
    )
  })

  test('handles null/undefined/primitives', () => {
    assert.strictEqual(canonicalJSON(null), 'null')
    assert.strictEqual(canonicalJSON(undefined), undefined)
    assert.strictEqual(canonicalJSON(42), '42')
    assert.strictEqual(canonicalJSON('hello'), '"hello"')
    assert.strictEqual(canonicalJSON(true), 'true')
  })

  test('deterministic regardless of insertion order', () => {
    const a: Record<string, number> = {}
    a['x'] = 1
    a['a'] = 2
    a['m'] = 3

    const b: Record<string, number> = {}
    b['m'] = 3
    b['a'] = 2
    b['x'] = 1

    assert.strictEqual(canonicalJSON(a), canonicalJSON(b))
  })
})

describe('computeContractHash', () => {
  test('returns 16-char hex string', () => {
    const hash = computeContractHash({
      functionKey: 'createUser',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
    })
    assert.match(hash, /^[0-9a-f]{16}$/)
  })

  test('stable across calls', () => {
    const data = {
      functionKey: 'getUser',
      inputSchema: { id: 'string' },
      outputSchema: { name: 'string' },
    }
    assert.strictEqual(computeContractHash(data), computeContractHash(data))
  })

  test('different functionKey produces different hash', () => {
    const schema = { type: 'object' }
    const hash1 = computeContractHash({
      functionKey: 'createUser',
      inputSchema: schema,
      outputSchema: schema,
    })
    const hash2 = computeContractHash({
      functionKey: 'deleteUser',
      inputSchema: schema,
      outputSchema: schema,
    })
    assert.notStrictEqual(hash1, hash2)
  })

  test('different schema produces different hash', () => {
    const hash1 = computeContractHash({
      functionKey: 'createUser',
      inputSchema: { type: 'string' },
      outputSchema: null,
    })
    const hash2 = computeContractHash({
      functionKey: 'createUser',
      inputSchema: { type: 'number' },
      outputSchema: null,
    })
    assert.notStrictEqual(hash1, hash2)
  })
})

describe('createEmptyManifest', () => {
  test('returns empty manifest with version 1', () => {
    assert.deepStrictEqual(createEmptyManifest(), {
      manifestVersion: 1,
      contracts: {},
    })
  })
})

describe('serializeManifest', () => {
  test('sorts contract keys alphabetically', () => {
    const manifest: VersionManifest = {
      manifestVersion: 1,
      contracts: {
        zeta: { latest: 1, versions: { '1': 'abc' } },
        alpha: { latest: 1, versions: { '1': 'def' } },
      },
    }
    const result = serializeManifest(manifest)
    const keys = Object.keys(JSON.parse(result).contracts)
    assert.deepStrictEqual(keys, ['alpha', 'zeta'])
  })

  test('sorts version keys numerically', () => {
    const manifest: VersionManifest = {
      manifestVersion: 1,
      contracts: {
        func: { latest: 10, versions: { '10': 'c', '2': 'b', '1': 'a' } },
      },
    }
    const result = serializeManifest(manifest)
    const versionKeys = Object.keys(JSON.parse(result).contracts.func.versions)
    assert.deepStrictEqual(versionKeys, ['1', '2', '10'])
  })

  test('ends with trailing newline', () => {
    const manifest: VersionManifest = {
      manifestVersion: 1,
      contracts: {},
    }
    const result = serializeManifest(manifest)
    assert.ok(result.endsWith('\n'))
  })

  test('idempotent', () => {
    const manifest: VersionManifest = {
      manifestVersion: 1,
      contracts: {
        beta: { latest: 2, versions: { '2': 'xyz', '1': 'abc' } },
        alpha: { latest: 1, versions: { '1': 'def' } },
      },
    }
    const first = serializeManifest(manifest)
    const second = serializeManifest(JSON.parse(first))
    assert.strictEqual(first, second)
  })
})
