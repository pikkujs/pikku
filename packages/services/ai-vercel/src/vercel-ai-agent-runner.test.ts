import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { VercelAIAgentRunner } from './vercel-ai-agent-runner.js'

describe('VercelAIAgentRunner.withApiKey', () => {
  test('returns same instance when no providerFactory is set', () => {
    const providers = { openai: {} }
    const runner = new VercelAIAgentRunner(providers)
    const result = runner.withApiKey('my-key')
    assert.strictEqual(result, runner)
  })

  test('returns new runner with factory-derived providers when providerFactory is set', () => {
    const baseProviders = { openai: { base: true } }
    const factory = (apiKey: string) => ({ openai: { apiKey } })
    const runner = new VercelAIAgentRunner(baseProviders, factory)

    const scoped = runner.withApiKey('secret-123')

    assert.notStrictEqual(scoped, runner)
    assert.ok(scoped instanceof VercelAIAgentRunner)
    assert.deepEqual(scoped.providers, { openai: { apiKey: 'secret-123' } })
    assert.deepEqual(runner.providers, baseProviders)
  })

  test('each withApiKey call produces an independent runner', () => {
    const factory = (apiKey: string) => ({ openai: { apiKey } })
    const runner = new VercelAIAgentRunner({}, factory)

    const first = runner.withApiKey('key-a')
    const second = runner.withApiKey('key-b')

    assert.notStrictEqual(first, second)
    assert.deepEqual(first.providers, { openai: { apiKey: 'key-a' } })
    assert.deepEqual(second.providers, { openai: { apiKey: 'key-b' } })
  })
})
