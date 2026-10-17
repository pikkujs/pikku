import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'
import { resolveInspectorEngine } from './inspector-engine.js'

describe('resolveInspectorEngine', () => {
  test('defaults to typescript', () => {
    assert.equal(resolveInspectorEngine(), 'typescript')
    assert.equal(resolveInspectorEngine({}), 'typescript')
  })

  test('config opts into typescript', () => {
    assert.equal(resolveInspectorEngine({ config: 'typescript' }), 'typescript')
  })

  test('env beats config', () => {
    assert.equal(
      resolveInspectorEngine({ env: 'typescript', config: 'native' }),
      'typescript'
    )
    assert.equal(
      resolveInspectorEngine({ env: 'native', config: 'typescript' }),
      'native'
    )
  })

  test('flag beats env and config', () => {
    assert.equal(
      resolveInspectorEngine({
        flag: 'native',
        env: 'typescript',
        config: 'typescript',
      }),
      'native'
    )
    assert.equal(
      resolveInspectorEngine({
        flag: 'typescript',
        env: 'native',
        config: 'native',
      }),
      'typescript'
    )
  })

  test('an empty value falls through to the next source', () => {
    assert.equal(
      resolveInspectorEngine({ flag: '', env: '', config: 'typescript' }),
      'typescript'
    )
  })

  test('rejects an unknown engine and names where it came from', () => {
    assert.throws(
      () => resolveInspectorEngine({ flag: 'tsc' }),
      /--inspector must be one of 'native', 'typescript', not 'tsc'/
    )
    assert.throws(
      () => resolveInspectorEngine({ env: 'go' }),
      /PIKKU_INSPECTOR must be/
    )
    assert.throws(
      () => resolveInspectorEngine({ config: 'rust' }),
      /pikku\.config\.json's `inspector` must be/
    )
  })

  test('an invalid higher-precedence value is an error, not skipped', () => {
    assert.throws(() =>
      resolveInspectorEngine({ flag: 'nope', config: 'typescript' })
    )
  })
})
