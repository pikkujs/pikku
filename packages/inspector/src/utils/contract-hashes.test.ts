import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { canonicalJSON } from './hash.js'
import {
  computeContractHash,
  createEmptyManifest,
  serializeManifest,
  validateContracts,
  updateManifest,
  extractContractsFromMeta,
} from './contract-hashes.js'
import type { ContractEntry, VersionManifest } from './contract-hashes.js'
import type { FunctionsMeta } from '@pikku/core'
import { ErrorCode } from '../error-codes.js'

function makeContracts(
  entries: Record<
    string,
    { functionKey: string; version: number; contractHash: string }
  >
): Map<string, ContractEntry> {
  const map = new Map<string, ContractEntry>()
  for (const [id, entry] of Object.entries(entries)) {
    map.set(id, entry)
  }
  return map
}

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

describe('validateContracts', () => {
  describe('PKU861 — FUNCTION_VERSION_MODIFIED', () => {
    test('hash changed for existing version produces error', () => {
      const manifest: VersionManifest = {
        manifestVersion: 1,
        contracts: {
          createUser: { latest: 1, versions: { '1': 'oldhash1234567890' } },
        },
      }
      const contracts = makeContracts({
        createUser: {
          functionKey: 'createUser',
          version: 1,
          contractHash: 'newhash1234567890',
        },
      })
      const result = validateContracts(manifest, contracts)
      assert.strictEqual(result.valid, false)
      assert.strictEqual(result.errors.length, 1)
      assert.strictEqual(
        result.errors[0].code,
        ErrorCode.FUNCTION_VERSION_MODIFIED
      )
    })

    test('hash unchanged for existing version produces no error', () => {
      const manifest: VersionManifest = {
        manifestVersion: 1,
        contracts: {
          createUser: { latest: 1, versions: { '1': 'samehash123456789' } },
        },
      }
      const contracts = makeContracts({
        createUser: {
          functionKey: 'createUser',
          version: 1,
          contractHash: 'samehash123456789',
        },
      })
      const result = validateContracts(manifest, contracts)
      assert.strictEqual(result.valid, true)
      assert.strictEqual(result.errors.length, 0)
    })
  })

  describe('PKU862 — CONTRACT_CHANGED_REQUIRES_BUMP', () => {
    test('latest hash changed without recorded version produces bump error', () => {
      const manifest: VersionManifest = {
        manifestVersion: 1,
        contracts: {
          getUser: { latest: 1, versions: {} },
        },
      }
      const contracts = makeContracts({
        getUser: {
          functionKey: 'getUser',
          version: 1,
          contractHash: 'newhash1234567890',
        },
      })
      const result = validateContracts(manifest, contracts)
      const bump = result.errors.find(
        (e) => e.code === ErrorCode.CONTRACT_CHANGED_REQUIRES_BUMP
      )
      assert.ok(bump)
    })

    test('function removed from code but still in manifest produces no error', () => {
      const manifest: VersionManifest = {
        manifestVersion: 1,
        contracts: {
          deletedFunc: { latest: 1, versions: { '1': 'abc1234567890abc' } },
        },
      }
      const contracts = makeContracts({})
      const result = validateContracts(manifest, contracts)
      assert.strictEqual(result.valid, true)
      assert.strictEqual(result.errors.length, 0)
    })
  })

  describe('PKU863 — VERSION_REGRESSION_OR_CONFLICT', () => {
    test('new version <= latest but not recorded produces error', () => {
      const manifest: VersionManifest = {
        manifestVersion: 1,
        contracts: {
          createUser: {
            latest: 3,
            versions: { '1': 'aaa', '2': 'bbb', '3': 'ccc' },
          },
        },
      }
      const contracts = makeContracts({
        'createUser@v2': {
          functionKey: 'createUser',
          version: 2,
          contractHash: 'bbb',
        },
        'createUser@v3': {
          functionKey: 'createUser',
          version: 3,
          contractHash: 'ccc',
        },
        'createUser@v1': {
          functionKey: 'createUser',
          version: 1,
          contractHash: 'different_hash!',
        },
      })
      const result = validateContracts(manifest, contracts)
      const regression = result.errors.find(
        (e) => e.code === ErrorCode.VERSION_REGRESSION_OR_CONFLICT
      )
      assert.strictEqual(regression, undefined)

      const manifest2: VersionManifest = {
        manifestVersion: 1,
        contracts: {
          myFunc: { latest: 3, versions: { '1': 'aaa', '3': 'ccc' } },
        },
      }
      const contracts2 = makeContracts({
        'myFunc@v2': { functionKey: 'myFunc', version: 2, contractHash: 'xxx' },
        'myFunc@v3': { functionKey: 'myFunc', version: 3, contractHash: 'ccc' },
      })
      const result2 = validateContracts(manifest2, contracts2)
      const regression2 = result2.errors.find(
        (e) => e.code === ErrorCode.VERSION_REGRESSION_OR_CONFLICT
      )
      assert.ok(regression2)
    })
  })

  describe('PKU864 — VERSION_GAP_NOT_ALLOWED', () => {
    test('new version > latest + 1 produces error', () => {
      const manifest: VersionManifest = {
        manifestVersion: 1,
        contracts: {
          createUser: { latest: 1, versions: { '1': 'aaa' } },
        },
      }
      const contracts = makeContracts({
        'createUser@v3': {
          functionKey: 'createUser',
          version: 3,
          contractHash: 'xxx',
        },
      })
      const result = validateContracts(manifest, contracts)
      const gap = result.errors.find(
        (e) => e.code === ErrorCode.VERSION_GAP_NOT_ALLOWED
      )
      assert.ok(gap)
    })
  })

  describe('PKU865 — MANIFEST_INTEGRITY_ERROR', () => {
    test('latest field not matching max version key produces error', () => {
      const manifest: VersionManifest = {
        manifestVersion: 1,
        contracts: {
          createUser: { latest: 1, versions: { '1': 'aaa', '2': 'bbb' } },
        },
      }
      const contracts = makeContracts({})
      const result = validateContracts(manifest, contracts)
      const integrity = result.errors.find(
        (e) => e.code === ErrorCode.MANIFEST_INTEGRITY_ERROR
      )
      assert.ok(integrity)
    })
  })

  describe('happy paths', () => {
    test('new function not in manifest is valid', () => {
      const manifest: VersionManifest = {
        manifestVersion: 1,
        contracts: {},
      }
      const contracts = makeContracts({
        createUser: {
          functionKey: 'createUser',
          version: 1,
          contractHash: 'abc123',
        },
      })
      const result = validateContracts(manifest, contracts)
      assert.strictEqual(result.valid, true)
    })

    test('correct version bump is valid', () => {
      const manifest: VersionManifest = {
        manifestVersion: 1,
        contracts: {
          createUser: { latest: 1, versions: { '1': 'aaa' } },
        },
      }
      const contracts = makeContracts({
        'createUser@v1': {
          functionKey: 'createUser',
          version: 1,
          contractHash: 'aaa',
        },
        'createUser@v2': {
          functionKey: 'createUser',
          version: 2,
          contractHash: 'bbb',
        },
      })
      const result = validateContracts(manifest, contracts)
      assert.strictEqual(result.valid, true)
    })

    test('empty manifest with new contracts is valid', () => {
      const manifest: VersionManifest = {
        manifestVersion: 1,
        contracts: {},
      }
      const contracts = makeContracts({
        funcA: { functionKey: 'funcA', version: 1, contractHash: 'aaa' },
        funcB: { functionKey: 'funcB', version: 1, contractHash: 'bbb' },
      })
      const result = validateContracts(manifest, contracts)
      assert.strictEqual(result.valid, true)
    })
  })
})

describe('updateManifest', () => {
  test('adds new function to empty manifest', () => {
    const manifest: VersionManifest = { manifestVersion: 1, contracts: {} }
    const contracts = makeContracts({
      createUser: {
        functionKey: 'createUser',
        version: 1,
        contractHash: 'abc',
      },
    })
    const result = updateManifest(manifest, contracts)
    assert.strictEqual(result.contracts.createUser.latest, 1)
    assert.strictEqual(result.contracts.createUser.versions['1'], 'abc')
  })

  test('adds new version to existing function and updates latest', () => {
    const manifest: VersionManifest = {
      manifestVersion: 1,
      contracts: {
        createUser: { latest: 1, versions: { '1': 'aaa' } },
      },
    }
    const contracts = makeContracts({
      'createUser@v1': {
        functionKey: 'createUser',
        version: 1,
        contractHash: 'aaa',
      },
      'createUser@v2': {
        functionKey: 'createUser',
        version: 2,
        contractHash: 'bbb',
      },
    })
    const result = updateManifest(manifest, contracts)
    assert.strictEqual(result.contracts.createUser.latest, 2)
    assert.strictEqual(result.contracts.createUser.versions['2'], 'bbb')
    assert.strictEqual(result.contracts.createUser.versions['1'], 'aaa')
  })

  test('preserves deleted functions', () => {
    const manifest: VersionManifest = {
      manifestVersion: 1,
      contracts: {
        removedFunc: { latest: 1, versions: { '1': 'old' } },
      },
    }
    const contracts = makeContracts({
      newFunc: { functionKey: 'newFunc', version: 1, contractHash: 'new' },
    })
    const result = updateManifest(manifest, contracts)
    assert.ok(result.contracts.removedFunc)
    assert.strictEqual(result.contracts.removedFunc.latest, 1)
    assert.ok(result.contracts.newFunc)
  })

  test('does not mutate input manifest', () => {
    const manifest: VersionManifest = {
      manifestVersion: 1,
      contracts: {
        createUser: { latest: 1, versions: { '1': 'aaa' } },
      },
    }
    const before = JSON.stringify(manifest)
    const contracts = makeContracts({
      'createUser@v2': {
        functionKey: 'createUser',
        version: 2,
        contractHash: 'bbb',
      },
    })
    updateManifest(manifest, contracts)
    assert.strictEqual(JSON.stringify(manifest), before)
  })
})

describe('extractContractsFromMeta', () => {
  test('extracts entries where contractHash is set', () => {
    const meta: FunctionsMeta = {
      createUser: {
        pikkuFuncId: 'createUser',
        inputSchemaName: 'CreateUserInput',
        outputSchemaName: 'CreateUserOutput',
        contractHash: 'abc123',
      },
    }
    const result = extractContractsFromMeta(meta)
    assert.strictEqual(result.size, 1)
    assert.ok(result.has('createUser'))
    assert.strictEqual(result.get('createUser')!.contractHash, 'abc123')
    assert.strictEqual(result.get('createUser')!.functionKey, 'createUser')
    assert.strictEqual(result.get('createUser')!.version, 1)
  })

  test('skips internal functions', () => {
    const meta: FunctionsMeta = {
      internalFunc: {
        pikkuFuncId: 'internalFunc',
        inputSchemaName: null,
        outputSchemaName: null,
        internal: true,
        contractHash: 'shouldskip',
      },
    }
    const result = extractContractsFromMeta(meta)
    assert.strictEqual(result.size, 0)
  })

  test('skips functions without contractHash', () => {
    const meta: FunctionsMeta = {
      noHash: {
        pikkuFuncId: 'noHash',
        inputSchemaName: null,
        outputSchemaName: null,
      },
    }
    const result = extractContractsFromMeta(meta)
    assert.strictEqual(result.size, 0)
  })
})
