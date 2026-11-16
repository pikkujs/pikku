import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { MockLanguageModelV4 } from 'ai/test'
import { simulateReadableStream } from 'ai'
import { VercelAgentRunner, readResponseCost } from './vercel-agent-runner.js'
import type { AgentRunnerParams } from '@pikku/core/services'

const usage = {
  inputTokens: { total: 9, noCache: 9, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 4, text: 4, reasoning: 0 },
}
const finishReason = { unified: 'stop' as const, raw: 'stop' }

const params = (): AgentRunnerParams => ({
  model: 'proxy/gpt-test',
  instructions: 'be brief',
  messages: [{ id: 'm', role: 'user', content: 'hi', createdAt: new Date() }],
  tools: [],
  maxSteps: 1,
  toolChoice: 'auto',
})

const runnerFor = (model: MockLanguageModelV4) =>
  new VercelAgentRunner({ proxy: { languageModel: () => model } })

const noop = { send: () => {}, close: () => {} } as never

describe('the cost an LLM proxy reports', () => {
  test('is read from the x-litellm-response-cost header of a generate call', async () => {
    const runner = runnerFor(
      new MockLanguageModelV4({
        doGenerate: async () => ({
          content: [{ type: 'text', text: 'hello' }],
          finishReason,
          usage,
          warnings: [],
          response: { headers: { 'x-litellm-response-cost': '0.00123' } },
        }),
      })
    )

    const result = await runner.run(params())

    assert.equal(result.cost, 0.00123)
    assert.deepEqual(result.usage, { inputTokens: 9, outputTokens: 4 })
  })

  test('is read from the header of a streamed call', async () => {
    const runner = runnerFor(
      new MockLanguageModelV4({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: 'text-start', id: 't' },
              { type: 'text-delta', id: 't', delta: 'hello' },
              { type: 'text-end', id: 't' },
              { type: 'finish', finishReason, usage },
            ],
          }) as never,
          response: { headers: { 'x-litellm-response-cost': '0.5' } },
        }),
      })
    )

    const result = await runner.stream(params(), noop)

    assert.equal(result.cost, 0.5)
    assert.equal(result.usage.inputTokens, 9)
  })

  test('is absent when the provider does not report one', async () => {
    const runner = runnerFor(
      new MockLanguageModelV4({
        doGenerate: async () => ({
          content: [{ type: 'text', text: 'hello' }],
          finishReason,
          usage,
          warnings: [],
        }),
      })
    )

    assert.equal('cost' in (await runner.run(params())), false)
  })

  test('ignores a value that is not a non-negative number', () => {
    assert.equal(readResponseCost({ 'X-LiteLLM-Response-Cost': '0.25' }), 0.25)
    assert.equal(
      readResponseCost({ 'x-litellm-response-cost': 'abc' }),
      undefined
    )
    assert.equal(
      readResponseCost({ 'x-litellm-response-cost': '-1' }),
      undefined
    )
    assert.equal(readResponseCost(undefined), undefined)
  })
})
