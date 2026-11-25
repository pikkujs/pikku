import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  emptyAddonsLock,
  readAddonsLock,
  serializeAddonsLock,
} from './remote-addon-sdk.js'

describe('pikku-addons.lock', () => {
  const inProject = (body: unknown, check: (rootDir: string) => void) => {
    const rootDir = mkdtempSync(join(tmpdir(), 'pikku-lock-'))
    try {
      mkdirSync(rootDir, { recursive: true })
      writeFileSync(join(rootDir, 'pikku-addons.lock'), JSON.stringify(body))
      check(rootDir)
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  }

  test('a version 1 lock reads as version 2 with no providers', () => {
    inProject(
      {
        lockfileVersion: 1,
        sdks: { '@a/b': { range: '^1', version: '1.0.0', integrity: 'x' } },
      },
      (rootDir) => {
        const lock = readAddonsLock(rootDir)
        assert.equal(lock.lockfileVersion, 2)
        assert.deepEqual(lock.providers, {})
        assert.deepEqual(Object.keys(lock.sdks), ['@a/b'])
      }
    )
  })

  test('one serializer writes both sections, sorted, with fixed key order', () => {
    const lock = emptyAddonsLock()
    lock.sdks['@z/z'] = { range: '^1', version: '1.0.0', integrity: 'z' }
    lock.sdks['@a/a'] = { range: '^1', version: '1.0.0', integrity: 'a' }
    const provider = {
      package: 'p',
      version: '1.0.0',
      metaHash: 'sha256-x',
      kind: 'singleton' as const,
      provides: ['k'],
      optionalProvides: [],
      imports: [],
      optionalImports: [],
      addsTo: null,
      replaces: [],
    }
    lock.providers['z/z'] = provider
    lock.providers['a/a'] = { ...provider }
    const parsed = JSON.parse(serializeAddonsLock(lock))
    assert.deepEqual(Object.keys(parsed), [
      'lockfileVersion',
      'sdks',
      'providers',
    ])
    assert.deepEqual(Object.keys(parsed.sdks), ['@a/a', '@z/z'])
    assert.deepEqual(Object.keys(parsed.providers), ['a/a', 'z/z'])
    assert.deepEqual(Object.keys(parsed.providers['a/a']), [
      'package',
      'version',
      'metaHash',
      'kind',
      'provides',
      'optionalProvides',
      'imports',
      'optionalImports',
      'addsTo',
      'replaces',
    ])
  })
})
