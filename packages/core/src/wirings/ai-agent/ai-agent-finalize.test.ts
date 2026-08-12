import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyOutputMiddleware,
  finalizeAgentRun,
  type FinalizedRun,
} from './ai-agent-finalize.js'
import type { AIAgentStep, PikkuAIMiddlewareHooks } from './ai-agent.types.js'
import type { AIRunStateService } from '../../services/ai-run-state-service.js'

const step = (
  toolCalls: NonNullable<AIAgentStep['toolCalls']>
): AIAgentStep => ({
  usage: { inputTokens: 0, outputTokens: 0 },
  toolCalls,
})

const call = (name: string, result: string) => ({
  name,
  args: {} as Record<string, unknown>,
  result,
})

describe('applyOutputMiddleware', () => {
  test('hands the middleware every tool call the run made, flattened across steps', async () => {
    const seen: string[][] = []
    const middleware: PikkuAIMiddlewareHooks[] = [
      {
        modifyOutput: (_services, ctx) => {
          seen.push(ctx.toolCalls.map((c) => c.name))
          return { text: ctx.text, messages: ctx.messages }
        },
      },
    ]

    await applyOutputMiddleware(
      middleware,
      {},
      {
        text: 'done',
        messages: [],
        steps: [step([call('search', 'a')]), step([call('fetch', 'b')])],
        usage: { inputTokens: 1, outputTokens: 2 },
      }
    )

    assert.deepEqual(seen, [['search', 'fetch']])
  })

  test('a rewritten tool call is redistributed back onto the step it came from', async () => {
    const middleware: PikkuAIMiddlewareHooks[] = [
      {
        modifyOutput: (_services, ctx) => ({
          text: ctx.text,
          messages: ctx.messages,
          toolCalls: ctx.toolCalls.map((c) => ({ ...c, result: '[redacted]' })),
        }),
      },
    ]

    const { steps } = await applyOutputMiddleware(
      middleware,
      {},
      {
        text: 'done',
        messages: [],
        steps: [
          step([call('search', 'secret')]),
          step([call('fetch', 'token')]),
        ],
        usage: { inputTokens: 0, outputTokens: 0 },
      }
    )

    assert.deepEqual(
      steps.map((s) => s.toolCalls?.map((c) => [c.name, c.result])),
      [[['search', '[redacted]']], [['fetch', '[redacted]']]]
    )
  })

  test('dropping a tool call collapses the calls into the last step rather than mis-attributing them', async () => {
    const middleware: PikkuAIMiddlewareHooks[] = [
      {
        modifyOutput: (_services, ctx) => ({
          text: ctx.text,
          messages: ctx.messages,
          toolCalls: ctx.toolCalls.filter((c) => c.name !== 'search'),
        }),
      },
    ]

    const { steps } = await applyOutputMiddleware(
      middleware,
      {},
      {
        text: 'done',
        messages: [],
        steps: [step([call('search', 'a')]), step([call('fetch', 'b')])],
        usage: { inputTokens: 0, outputTokens: 0 },
      }
    )

    assert.deepEqual(
      steps.map((s) => s.toolCalls?.map((c) => c.name)),
      [[], ['fetch']]
    )
  })

  test('runs the chain in reverse registration order, each hook seeing the previous rewrite', async () => {
    const order: string[] = []
    const middleware: PikkuAIMiddlewareHooks[] = [
      {
        modifyOutput: (_services, ctx) => {
          order.push(`first saw ${ctx.text}`)
          return { text: `${ctx.text}+first`, messages: ctx.messages }
        },
      },
      {
        modifyOutput: (_services, ctx) => {
          order.push(`second saw ${ctx.text}`)
          return { text: `${ctx.text}+second`, messages: ctx.messages }
        },
      },
    ]

    const { text } = await applyOutputMiddleware(
      middleware,
      {},
      {
        text: 'raw',
        messages: [],
        steps: [],
        usage: { inputTokens: 0, outputTokens: 0 },
      }
    )

    assert.deepEqual(order, ['second saw raw', 'first saw raw+second'])
    assert.equal(text, 'raw+second+first')
  })
})

describe('finalizeAgentRun', () => {
  const run = (usage: FinalizedRun['usage']): FinalizedRun => ({
    runId: 'run-1',
    agentName: 'assistant',
    threadId: 'thread-1',
    text: 'done',
    steps: [],
    usage,
  })

  test('completes the run and records its usage', async () => {
    const updates: unknown[] = []
    const aiRunState = {
      updateRun: async (_runId: string, update: unknown) => {
        updates.push(update)
      },
    } as unknown as AIRunStateService

    await finalizeAgentRun(
      aiRunState,
      run({ inputTokens: 10, outputTokens: 20, model: 'gpt-4o' })
    )

    assert.deepEqual(updates, [
      {
        status: 'completed',
        usage: { inputTokens: 10, outputTokens: 20, model: 'gpt-4o' },
      },
    ])
  })

  test('omits usage entirely when no model reported one', async () => {
    const updates: any[] = []
    const aiRunState = {
      updateRun: async (_runId: string, update: unknown) => {
        updates.push(update)
      },
    } as unknown as AIRunStateService

    await finalizeAgentRun(aiRunState, run({ inputTokens: 0, outputTokens: 0 }))

    assert.deepEqual(updates, [{ status: 'completed' }])
  })
})
