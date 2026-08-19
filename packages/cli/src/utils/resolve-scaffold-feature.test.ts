import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { resolveScaffoldFeature } from './resolve-scaffold-feature.js'

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
})
