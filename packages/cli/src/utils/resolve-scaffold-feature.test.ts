import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { resolveScaffoldFeature } from './resolve-scaffold-feature.js'

describe('resolveScaffoldFeature', () => {
  test('an absent feature is off', () => {
    assert.deepEqual(resolveScaffoldFeature('rpc', undefined), {
      enabled: false,
      auth: true,
    })
  })

  test('false is off', () => {
    assert.deepEqual(resolveScaffoldFeature('rpc', false), {
      enabled: false,
      auth: true,
    })
  })

  test('true enables the surface WITH a session required', () => {
    // The whole point: the short form is the safe one.
    assert.deepEqual(resolveScaffoldFeature('rpc', true), {
      enabled: true,
      auth: true,
    })
  })

  test('going public requires typing it out', () => {
    assert.deepEqual(resolveScaffoldFeature('rpc', { auth: false }), {
      enabled: true,
      auth: false,
      path: undefined,
    })
  })

  test('an object without auth is still authenticated', () => {
    assert.equal(resolveScaffoldFeature('rpc', { path: 'a/b.ts' }).auth, true)
  })

  test('carries an explicit output path', () => {
    assert.equal(
      resolveScaffoldFeature('console', { path: 'src/console.gen.ts' }).path,
      'src/console.gen.ts'
    )
  })

  describe('the legacy string form', () => {
    test('"no-auth" is refused, not coerced to a path', () => {
      assert.throws(
        () => resolveScaffoldFeature('rpc', 'no-auth' as never),
        (error: Error) => {
          assert.match(error.message, /scaffold\.rpc/)
          assert.match(error.message, /no longer a mode/)
          assert.match(error.message, /"rpc": \{ "auth": false \}/)
          return true
        }
      )
    })

    test('"auth" is refused and maps to true', () => {
      assert.throws(
        () => resolveScaffoldFeature('console', 'auth' as never),
        (error: Error) => {
          assert.match(error.message, /"console": true/)
          return true
        }
      )
    })

    test('any other string is refused too', () => {
      // Under boolean | object a bare string is never valid, so an unrecognised
      // one must not fall through as a path.
      assert.throws(
        () => resolveScaffoldFeature('rpc', 'src/rpc.gen.ts' as never),
        /must be true, false, or an object/
      )
    })
  })

  test('a nonsense value is refused', () => {
    assert.throws(
      () => resolveScaffoldFeature('rpc', 42 as never),
      /must be true, false, or an object/
    )
  })
})
