import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { resolveModelConfig } from './ai-agent-model-config.js'
import { resetPikkuState, pikkuState } from '../../pikku-state.js'

beforeEach(() => {
  resetPikkuState()
})

describe('resolveModelConfig', () => {
  test('should return agent model when no config', () => {
    const result = resolveModelConfig('testAgent', {
      model: 'anthropic/claude-3',
      temperature: 0.7,
    })
    assert.strictEqual(result.model, 'anthropic/claude-3')
    assert.strictEqual(result.temperature, 0.7)
  })

  test('should resolve model alias to string', () => {
    pikkuState(null, 'models', 'config', {
      models: { fast: 'anthropic/claude-haiku' },
    } as any)

    const result = resolveModelConfig('testAgent', { model: 'fast' })
    assert.strictEqual(result.model, 'anthropic/claude-haiku')
  })

  test('should resolve model alias with temperature and maxSteps', () => {
    pikkuState(null, 'models', 'config', {
      models: {
        smart: {
          model: 'anthropic/claude-opus',
          temperature: 0.3,
          maxSteps: 10,
        },
      },
    } as any)

    const result = resolveModelConfig('testAgent', { model: 'smart' })
    assert.strictEqual(result.model, 'anthropic/claude-opus')
    assert.strictEqual(result.temperature, 0.3)
    assert.strictEqual(result.maxSteps, 10)
  })

  test('should throw for unknown model alias', () => {
    pikkuState(null, 'models', 'config', {
      models: {},
    } as any)

    assert.throws(() => resolveModelConfig('testAgent', { model: 'unknown' }), {
      message: "Unknown model alias 'unknown'.",
    })
  })

  test('should pass through model with slash (not an alias)', () => {
    pikkuState(null, 'models', 'config', {
      models: {},
    } as any)

    const result = resolveModelConfig('testAgent', { model: 'openai/gpt-4' })
    assert.strictEqual(result.model, 'openai/gpt-4')
  })

  test('should use agent override model', () => {
    pikkuState(null, 'models', 'config', {
      models: { fast: 'anthropic/haiku' },
      agentOverrides: { testAgent: { model: 'fast' } },
    } as any)

    const result = resolveModelConfig('testAgent', {
      model: 'anthropic/default',
    })
    assert.strictEqual(result.model, 'anthropic/haiku')
  })

  test('should use agent override temperature over alias', () => {
    pikkuState(null, 'models', 'config', {
      models: { smart: { model: 'anthropic/opus', temperature: 0.5 } },
      agentOverrides: { testAgent: { model: 'smart', temperature: 0.1 } },
    } as any)

    const result = resolveModelConfig('testAgent', {
      model: 'anthropic/default',
    })
    assert.strictEqual(result.temperature, 0.1)
  })

  test('should use agentDefaults as fallback', () => {
    pikkuState(null, 'models', 'config', {
      models: {},
      agentDefaults: { temperature: 0.5, maxSteps: 20 },
    } as any)

    const result = resolveModelConfig('testAgent', {
      model: 'anthropic/claude-3',
    })
    assert.strictEqual(result.temperature, 0.5)
    assert.strictEqual(result.maxSteps, 20)
  })

  test('should prioritize: override > alias > defaults > agent', () => {
    pikkuState(null, 'models', 'config', {
      models: { fast: { model: 'anthropic/haiku', temperature: 0.3 } },
      agentDefaults: { temperature: 0.5 },
      agentOverrides: { testAgent: { temperature: 0.1 } },
    } as any)

    const result = resolveModelConfig('testAgent', {
      model: 'fast',
      temperature: 0.9,
    })
    assert.strictEqual(result.temperature, 0.1)
  })
})
