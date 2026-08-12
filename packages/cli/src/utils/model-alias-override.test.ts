import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { applyModelAliasOverride } from './model-alias-override.js'

const noopLogger = { warn: () => {} } as any

beforeEach(() => {
  delete process.env.PIKKU_MODEL_ALIASES
})

afterEach(() => {
  delete process.env.PIKKU_MODEL_ALIASES
})

describe('applyModelAliasOverride', () => {
  test('no flag leaves the environment alone', () => {
    applyModelAliasOverride(noopLogger, undefined)
    assert.equal(process.env.PIKKU_MODEL_ALIASES, undefined)
  })

  test('a single pair is published for the runtime to pick up', () => {
    applyModelAliasOverride(noopLogger, 'cheap:openai/gpt-5-nano')
    assert.equal(process.env.PIKKU_MODEL_ALIASES, 'cheap:openai/gpt-5-nano')
  })

  test('several pairs are kept comma-separated', () => {
    applyModelAliasOverride(
      noopLogger,
      'cheap:openai/gpt-5-nano,tool:anthropic/claude-haiku-4-5'
    )
    assert.equal(
      process.env.PIKKU_MODEL_ALIASES,
      'cheap:openai/gpt-5-nano,tool:anthropic/claude-haiku-4-5'
    )
  })

  test('an entry with no colon is rejected rather than silently ignored', () => {
    assert.throws(
      () => applyModelAliasOverride(noopLogger, 'openai/gpt-5-nano'),
      /alias:provider\/model/
    )
  })

  test('the alias side may not itself be provider-qualified', () => {
    assert.throws(
      () => applyModelAliasOverride(noopLogger, 'openai/gpt-4:openai/gpt-5'),
      /is not an alias/
    )
  })

  test('warns when an override would apply to nothing', () => {
    const warnings: string[] = []
    const logger = { warn: (m: string) => warnings.push(m) } as any
    applyModelAliasOverride(logger, 'cheap:openai/gpt-5-nano', {
      tool: 'openai/gpt-5',
    })
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /cheap/)
  })

  test('no warning when the alias is one the project configures', () => {
    const warnings: string[] = []
    const logger = { warn: (m: string) => warnings.push(m) } as any
    applyModelAliasOverride(logger, 'cheap:openai/gpt-5-nano', {
      cheap: 'openai/gpt-5-mini',
    })
    assert.deepEqual(warnings, [])
  })
})
