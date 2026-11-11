import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  analyticsOriginLockEnabled,
  resolveScaffoldFeature,
} from './resolve-scaffold-feature.js'

describe('resolveScaffoldFeature', () => {
  test('an absent feature is off', () => {
    assert.deepEqual(resolveScaffoldFeature('rpc', undefined), {
      enabled: false,
    })
  })

  test('false is off', () => {
    assert.deepEqual(resolveScaffoldFeature('rpc', false), {
      enabled: false,
    })
  })

  test('true enables the surface', () => {
    assert.deepEqual(resolveScaffoldFeature('rpc', true), {
      enabled: true,
    })
  })

  test('an object enables the surface', () => {
    assert.deepEqual(resolveScaffoldFeature('rpc', {}), {
      enabled: true,
      path: undefined,
    })
  })

  test('carries an explicit output path', () => {
    assert.equal(
      resolveScaffoldFeature('console', { path: 'src/console.gen.ts' }).path,
      'src/console.gen.ts'
    )
  })

  test('says nothing about auth', () => {
    for (const value of [undefined, false, true, { path: 'a/b.ts' }] as const) {
      assert.ok(
        !('auth' in resolveScaffoldFeature('rpc', value)),
        `expected no auth key for ${JSON.stringify(value)}`
      )
    }
  })

  test('a bare string is refused, not read as a path', () => {
    assert.throws(
      () => resolveScaffoldFeature('rpc', 'src/rpc.gen.ts' as never),
      (error: Error) => {
        assert.match(error.message, /scaffold\.rpc/)
        assert.match(error.message, /must be true, false, or an object/)
        assert.match(error.message, /never a shorthand for a path/)
        return true
      }
    )
  })

  test('a nonsense value is refused', () => {
    assert.throws(
      () => resolveScaffoldFeature('rpc', 42 as never),
      /must be true, false, or an object/
    )
  })

  test('the removed auth key is refused by name', () => {
    assert.throws(
      () => resolveScaffoldFeature('console', { auth: false } as never),
      (error: Error) => {
        assert.match(error.message, /scaffold\.console/)
        assert.match(error.message, /no longer takes "auth"/)
        assert.match(error.message, /who may call it/)
        return true
      }
    )
  })

  test('an unknown key is refused rather than ignored', () => {
    assert.throws(
      () => resolveScaffoldFeature('rpc', { paths: 'src/rpc.gen.ts' } as never),
      (error: Error) => {
        assert.match(error.message, /scaffold\.rpc/)
        assert.match(error.message, /"paths"/)
        assert.match(error.message, /"path"/)
        return true
      }
    )
  })

  test('null is off, not an empty object', () => {
    assert.throws(
      () => resolveScaffoldFeature('rpc', null as never),
      /must be true, false, or an object/
    )
  })
})

describe('per-feature options', () => {
  test('true and {} carry no options', () => {
    assert.equal(resolveScaffoldFeature('analytics', true).options, undefined)
    assert.equal(resolveScaffoldFeature('analytics', {}).options, undefined)
  })

  test('an option is carried alongside path', () => {
    assert.deepEqual(
      resolveScaffoldFeature('analytics', {
        originLock: false,
        path: 'a.ts',
      } as never),
      { enabled: true, path: 'a.ts', options: { originLock: false } }
    )
    assert.deepEqual(
      resolveScaffoldFeature('cors', { port: 5173 } as never).options,
      {
        port: 5173,
      }
    )
  })

  test('an option of the wrong type is refused', () => {
    assert.throws(
      () => resolveScaffoldFeature('analytics', { originLock: 'no' } as never),
      /scaffold\.analytics\.originLock must be a boolean/
    )
  })

  test('an option belonging to another feature is refused', () => {
    assert.throws(
      () => resolveScaffoldFeature('rpc', { originLock: false } as never),
      /scaffold\.rpc has no "originLock" option/
    )
    assert.throws(
      () => resolveScaffoldFeature('cors', { originLock: false } as never),
      /"port"/
    )
  })

  test('the analytics origin lock is on by default and only off when asked', () => {
    assert.equal(analyticsOriginLockEnabled(undefined), false)
    assert.equal(analyticsOriginLockEnabled({ analytics: false }), false)
    assert.equal(analyticsOriginLockEnabled({ analytics: true }), true)
    assert.equal(analyticsOriginLockEnabled({ analytics: {} }), true)
    assert.equal(
      analyticsOriginLockEnabled({ analytics: { originLock: false } as never }),
      false
    )
  })
})
