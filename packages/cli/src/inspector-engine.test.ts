import { strict as assert } from 'node:assert'
import { afterEach, describe, test } from 'node:test'
import { getInspectorEngine } from '@pikku/inspector-go'
import {
  DEFAULT_ENGINE,
  resolveInspectorEngine,
  selectInspectorEngine,
} from './inspector-engine.js'

describe('inspector engine selection', () => {
  const saved = process.env.PIKKU_INSPECTOR
  afterEach(() => {
    if (saved === undefined) delete process.env.PIKKU_INSPECTOR
    else process.env.PIKKU_INSPECTOR = saved
  })

  test('falls back to the CLI default, Rust', () => {
    assert.equal(DEFAULT_ENGINE, 'rs')
    assert.equal(resolveInspectorEngine({ env: {} }), 'rs')
  })

  for (const engine of ['go', 'rs'] as const) {
    const other = engine === 'go' ? 'rs' : 'go'
    test(`the config key selects ${engine}`, () => {
      assert.equal(resolveInspectorEngine({ config: engine, env: {} }), engine)
    })
    test(`--inspector ${engine} beats PIKKU_INSPECTOR and the config key`, () => {
      assert.equal(
        resolveInspectorEngine({
          flag: engine,
          config: other,
          env: { PIKKU_INSPECTOR: other },
        }),
        engine
      )
    })
    test(`PIKKU_INSPECTOR=${engine} beats the config key`, () => {
      assert.equal(
        resolveInspectorEngine({
          config: other,
          env: { PIKKU_INSPECTOR: engine },
        }),
        engine
      )
    })
  }

  test('selecting tells the inspector package, and --inspector reaches children', () => {
    delete process.env.PIKKU_INSPECTOR
    selectInspectorEngine({ flag: 'go' })
    assert.equal(getInspectorEngine(), 'go')
    assert.equal(process.env.PIKKU_INSPECTOR, 'go')
    delete process.env.PIKKU_INSPECTOR
    selectInspectorEngine({})
    assert.equal(getInspectorEngine(), 'rs')
  })

  test('refuses an unknown engine, naming where it came from', () => {
    assert.throws(
      () => resolveInspectorEngine({ flag: 'ts' }),
      /--inspector is "ts"; expected one of go, rs/
    )
    assert.throws(
      () => resolveInspectorEngine({ config: 'tsgo', env: {} }),
      /"inspector" in pikku.config.json is "tsgo"/
    )
    assert.throws(
      () => resolveInspectorEngine({ env: { PIKKU_INSPECTOR: 'ts' } }),
      /PIKKU_INSPECTOR is "ts"/
    )
  })
})
