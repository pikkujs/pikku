import { strict as assert } from 'node:assert'
import { afterEach, describe, test } from 'node:test'
import {
  DEFAULT_ENGINE,
  resolveInspectorEngine,
  configureInspectorEngine,
} from '@pikku/inspector-go'
import { selectInspectorEngine } from './inspector-engine.js'

describe('selectInspectorEngine', () => {
  const saved = process.env.PIKKU_INSPECTOR
  afterEach(() => {
    if (saved === undefined) delete process.env.PIKKU_INSPECTOR
    else process.env.PIKKU_INSPECTOR = saved
    configureInspectorEngine(undefined)
  })

  test('falls back to the package default', () => {
    delete process.env.PIKKU_INSPECTOR
    selectInspectorEngine({})
    assert.equal(resolveInspectorEngine(), DEFAULT_ENGINE)
  })

  for (const engine of ['go', 'rs'] as const) {
    test(`the config key selects ${engine}`, () => {
      delete process.env.PIKKU_INSPECTOR
      selectInspectorEngine({ config: engine })
      assert.equal(resolveInspectorEngine(), engine)
    })

    test(`--inspector ${engine} beats PIKKU_INSPECTOR and the config key`, () => {
      process.env.PIKKU_INSPECTOR = engine === 'go' ? 'rs' : 'go'
      selectInspectorEngine({
        flag: engine,
        config: engine === 'go' ? 'rs' : 'go',
      })
      assert.equal(resolveInspectorEngine(), engine)
    })
  }

  test('PIKKU_INSPECTOR beats the config key', () => {
    process.env.PIKKU_INSPECTOR = 'rs'
    selectInspectorEngine({ config: 'go' })
    assert.equal(resolveInspectorEngine(), 'rs')
  })

  test('refuses an unknown engine, naming where it came from', () => {
    assert.throws(
      () => selectInspectorEngine({ flag: 'ts' }),
      /--inspector is "ts"; expected one of go, rs/
    )
    assert.throws(
      () => selectInspectorEngine({ config: 'tsgo' }),
      /"inspector" in pikku.config.json is "tsgo"/
    )
  })
})
