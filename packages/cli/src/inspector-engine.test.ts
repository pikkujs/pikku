import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'
import { isStandaloneCli, resolveInspectorEngine } from './inspector-engine.js'

describe('resolveInspectorEngine', () => {
  test('defaults to native', () => {
    assert.equal(resolveInspectorEngine(), 'native')
    assert.equal(resolveInspectorEngine({}), 'native')
    assert.equal(
      resolveInspectorEngine({ nativeAvailable: () => true }),
      'native'
    )
  })

  test('the default falls back to typescript without a binary', () => {
    let warned = false
    assert.equal(
      resolveInspectorEngine({
        nativeAvailable: () => false,
        onFallback: () => (warned = true),
      }),
      'typescript'
    )
    assert.equal(warned, true)
  })

  test('a standalone pikku without a binary fails rather than fall back', () => {
    let warned = false
    assert.throws(
      () =>
        resolveInspectorEngine({
          nativeAvailable: () => false,
          onFallback: () => (warned = true),
          standalone: true,
          execPath: '/opt/homebrew/bin/pikku',
        }),
      /No pikku-inspect binary beside \/opt\/homebrew\/bin\/pikku/
    )
    assert.equal(warned, false)
    assert.equal(
      resolveInspectorEngine({ nativeAvailable: () => true, standalone: true }),
      'native'
    )
  })

  test('an explicit native never falls back', () => {
    const nativeAvailable = () => false
    assert.equal(
      resolveInspectorEngine({ config: 'native', nativeAvailable }),
      'native'
    )
    assert.equal(
      resolveInspectorEngine({ env: 'native', nativeAvailable }),
      'native'
    )
    assert.equal(
      resolveInspectorEngine({ flag: 'native', nativeAvailable }),
      'native'
    )
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

describe('isStandaloneCli', () => {
  test('recognises a bun --compile module url', () => {
    assert.equal(isStandaloneCli('file:///$bunfs/root/pikku'), true)
    assert.equal(isStandaloneCli('file:///B:/~BUN/root/pikku.exe'), true)
    assert.equal(
      isStandaloneCli(
        'file:///usr/lib/node_modules/@pikku/cli/dist/src/inspector-engine.js'
      ),
      false
    )
  })
})
