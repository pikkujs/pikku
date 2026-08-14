import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { resolveModelAlias, resolveModelConfig } from './agent-model-config.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'

const setAliases = (aliases: Record<string, string>) =>
  pikkuState(null, 'agent', 'modelAliases', aliases)

beforeEach(() => {
  resetPikkuState()
  delete process.env.PIKKU_MODEL_ALIASES
})

afterEach(() => {
  delete process.env.PIKKU_MODEL_ALIASES
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

  test('resolves an aliased agent model through the table', () => {
    setAliases({ cheap: 'openai/gpt-5-mini' })
    const result = resolveModelConfig('testAgent', {
      model: 'cheap',
      temperature: 0.2,
    })
    assert.strictEqual(result.model, 'openai/gpt-5-mini')
    assert.strictEqual(result.temperature, 0.2)
  })
})

describe('resolveModelAlias', () => {
  test('a provider-qualified model is never treated as an alias', () => {
    setAliases({ 'openai/gpt-4': 'anthropic/claude-3' })
    assert.strictEqual(resolveModelAlias('openai/gpt-4'), 'openai/gpt-4')
  })

  test('an alias resolves to its provider-qualified model', () => {
    setAliases({
      cheap: 'openai/gpt-5-mini',
      tool: 'anthropic/claude-sonnet-5',
    })
    assert.strictEqual(resolveModelAlias('cheap'), 'openai/gpt-5-mini')
    assert.strictEqual(resolveModelAlias('tool'), 'anthropic/claude-sonnet-5')
  })

  test('PIKKU_MODEL_ALIASES beats the generated table', () => {
    setAliases({ cheap: 'openai/gpt-5-mini' })
    process.env.PIKKU_MODEL_ALIASES = 'cheap:anthropic/claude-haiku-4-5'
    assert.strictEqual(resolveModelAlias('cheap'), 'anthropic/claude-haiku-4-5')
  })

  test('an env override splits on the first colon only', () => {
    // A model id may itself contain a colon — `ollama/qwen2.5:7b` is the shape
    // the runner's own error message cites. It stays provider-qualified so the
    // resolved value is one `VercelAgentRunner.parseModel` would accept; a
    // bare `bedrock:nova-lite:1` would pass here and fail the moment anything
    // tried to use it.
    process.env.PIKKU_MODEL_ALIASES = 'cheap:ollama/qwen2.5:7b'
    assert.strictEqual(resolveModelAlias('cheap'), 'ollama/qwen2.5:7b')
  })

  test('an env override leaves aliases it does not name alone', () => {
    setAliases({ cheap: 'openai/gpt-5-mini', tool: 'openai/gpt-5' })
    process.env.PIKKU_MODEL_ALIASES = 'cheap:openai/gpt-5-nano'
    assert.strictEqual(resolveModelAlias('tool'), 'openai/gpt-5')
  })

  test('an unknown alias throws rather than reaching a provider', () => {
    setAliases({ cheap: 'openai/gpt-5-mini' })
    assert.throws(() => resolveModelAlias('expensive'), /expensive/)
  })

  test('the error names the aliases that do exist', () => {
    setAliases({ cheap: 'openai/gpt-5-mini', tool: 'openai/gpt-5' })
    assert.throws(() => resolveModelAlias('exspensive'), /cheap, tool/)
  })
})
