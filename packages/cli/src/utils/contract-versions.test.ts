import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import {
  validateContracts,
  updateManifest,
  extractContractsFromMeta,
} from './contract-versions.js'
import type { ContractEntry } from './contract-versions.js'
import type { FunctionsMeta } from '@pikku/core'
import type { VersionManifest } from './contract-version.js'
import { ErrorCode } from '@pikku/inspector'

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
