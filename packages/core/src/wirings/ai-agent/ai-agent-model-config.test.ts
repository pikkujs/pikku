import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { resolveModelConfig } from './ai-agent-model-config.js'
import { resetPikkuState } from '../../pikku-state.js'

beforeEach(() => {
  resetPikkuState()
})

describe('resolveModelConfig', () => {
  test('passes through the provider-qualified agent model', () => {
    const result = resolveModelConfig('testAgent', {
      model: 'anthropic/claude-3',
      temperature: 0.7,
    })
    assert.strictEqual(result.model, 'anthropic/claude-3')
    assert.strictEqual(result.temperature, 0.7)
  })

  test('passes through temperature and maxSteps from the agent', () => {
    const result = resolveModelConfig('testAgent', {
      model: 'openai/gpt-4',
      temperature: 0.3,
      maxSteps: 10,
    })
    assert.strictEqual(result.model, 'openai/gpt-4')
    assert.strictEqual(result.temperature, 0.3)
    assert.strictEqual(result.maxSteps, 10)
  })

  test('leaves temperature and maxSteps undefined when not set', () => {
    const result = resolveModelConfig('testAgent', { model: 'openai/gpt-4' })
    assert.strictEqual(result.model, 'openai/gpt-4')
    assert.strictEqual(result.temperature, undefined)
    assert.strictEqual(result.maxSteps, undefined)
  })
})
