import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeModelAliases } from './serialize-model-aliases.js'

describe('serializeModelAliases', () => {
  test('bakes the table into state so it ships with the build', () => {
    const result = serializeModelAliases(
      { cheap: 'openai/gpt-5-mini', tool: 'anthropic/claude-sonnet-5' },
      null
    )

    assert.match(result, /pikkuState\(null, 'agent', 'modelAliases', \{/)
    assert.match(result, /"cheap": "openai\/gpt-5-mini"/)
    assert.match(result, /"tool": "anthropic\/claude-sonnet-5"/)
  })

  test('an addon registers under its own package name', () => {
    const result = serializeModelAliases(
      { cheap: 'openai/gpt-5-mini' },
      'my-addon'
    )
    assert.match(result, /pikkuState\('my-addon', 'agent', 'modelAliases'/)
  })

  test('no configured models still emits an empty table', () => {
    const result = serializeModelAliases(undefined, null)
    assert.match(result, /pikkuState\(null, 'agent', 'modelAliases', \{\}\)/)
  })
})
