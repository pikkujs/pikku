import { describe, it } from 'node:test'
import assert from 'node:assert'
import { validateAgentConfig } from './validate-agent-config.function.js'

const valid = (config: any) =>
  (validateAgentConfig as any).func({}, config) as Promise<{
    valid: boolean
    errors: string[]
  }>

const goodConfig = {
  config: {
    instructions: 'Help users manage their todos by listing and creating items',
    description: 'Todo manager agent',
    model: 'openai/o4-mini',
    tools: ['listTodos', 'addTodo'],
    maxSteps: 10,
    toolChoice: 'auto',
  },
  availableToolNames: ['listTodos', 'addTodo', 'deleteTodo'],
}

describe('validateAgentConfig', () => {
  it('passes a valid config', async () => {
    const result = await valid(goodConfig)
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.errors.length, 0)
  })

  it('rejects short instructions', async () => {
    const result = await valid({
      ...goodConfig,
      config: { ...goodConfig.config, instructions: 'too short' },
    })
    assert.strictEqual(result.valid, false)
    assert.ok(result.errors.some((e) => e.includes('instructions')))
  })

  it('rejects empty description', async () => {
    const result = await valid({
      ...goodConfig,
      config: { ...goodConfig.config, description: '' },
    })
    assert.strictEqual(result.valid, false)
    assert.ok(result.errors.some((e) => e.includes('description')))
  })

  it('rejects invalid model format', async () => {
    const result = await valid({
      ...goodConfig,
      config: { ...goodConfig.config, model: 'no-slash' },
    })
    assert.strictEqual(result.valid, false)
    assert.ok(result.errors.some((e) => e.includes('model')))
  })

  it('rejects unknown tools', async () => {
    const result = await valid({
      ...goodConfig,
      config: { ...goodConfig.config, tools: ['nonExistent'] },
    })
    assert.strictEqual(result.valid, false)
    assert.ok(result.errors.some((e) => e.includes('nonExistent')))
  })

  it('rejects maxSteps out of range', async () => {
    const result = await valid({
      ...goodConfig,
      config: { ...goodConfig.config, maxSteps: 0 },
    })
    assert.strictEqual(result.valid, false)
    assert.ok(result.errors.some((e) => e.includes('maxSteps')))
  })

  it('rejects temperature out of range', async () => {
    const result = await valid({
      ...goodConfig,
      config: { ...goodConfig.config, temperature: 5 },
    })
    assert.strictEqual(result.valid, false)
    assert.ok(result.errors.some((e) => e.includes('temperature')))
  })

  it('accepts valid temperature', async () => {
    const result = await valid({
      ...goodConfig,
      config: { ...goodConfig.config, temperature: 0.7 },
    })
    assert.strictEqual(result.valid, true)
  })

  it('rejects invalid toolChoice', async () => {
    const result = await valid({
      ...goodConfig,
      config: { ...goodConfig.config, toolChoice: 'invalid' },
    })
    assert.strictEqual(result.valid, false)
    assert.ok(result.errors.some((e) => e.includes('toolChoice')))
  })

  it('rejects unknown middleware', async () => {
    const result = await valid({
      ...goodConfig,
      config: { ...goodConfig.config, aiMiddleware: ['unknownMw'] },
    })
    assert.strictEqual(result.valid, false)
    assert.ok(result.errors.some((e) => e.includes('unknownMw')))
  })

  it('accepts known middleware', async () => {
    const result = await valid({
      ...goodConfig,
      config: { ...goodConfig.config, aiMiddleware: ['voiceInput'] },
    })
    assert.strictEqual(result.valid, true)
  })

  it('rejects too many tools', async () => {
    const tools = Array.from({ length: 21 }, (_, i) => `tool${i}`)
    const result = await valid({
      config: { ...goodConfig.config, tools },
      availableToolNames: tools,
    })
    assert.strictEqual(result.valid, false)
    assert.ok(result.errors.some((e) => e.includes('Too many tools')))
  })

  it('collects multiple errors', async () => {
    const result = await valid({
      ...goodConfig,
      config: {
        ...goodConfig.config,
        instructions: '',
        description: '',
        model: 'bad',
        toolChoice: 'wrong',
      },
    })
    assert.strictEqual(result.valid, false)
    assert.ok(result.errors.length >= 4)
  })
})
