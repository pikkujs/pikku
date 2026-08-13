import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import { streamAIAgent } from './ai-agent-stream.js'
import type { CoreAIAgent, PikkuAIMiddlewareHooks } from './ai-agent.types.js'
import type { AIAgentStepResult } from '../../services/ai-agent-runner-service.js'

beforeEach(() => {
  resetPikkuState()
})

const addTestAgent = (agentName: string) => {
  const agent: CoreAIAgent = {
    name: agentName,
    description: 'test agent',
    instructions: 'be helpful',
    model: 'test/test-model',
  }

  pikkuState(null, 'agent', 'agentsMeta')[agentName] = {
    ...agent,
    inputSchema: null,
    outputSchema: null,
    workingMemorySchema: null,
  }
  pikkuState(null, 'agent', 'agents').set(agentName, agent)
}

const makeStepResult = (
  overrides?: Partial<AIAgentStepResult>
): AIAgentStepResult => ({
  text: '',
  toolCalls: [],
  toolResults: [],
  usage: { inputTokens: 0, outputTokens: 0 },
  finishReason: 'stop',
  ...overrides,
})

describe('streamAIAgent output hooks', () => {
  test('does not run modifyOutput on a streamed run, and warns the hook it is inert there', async () => {
    addTestAgent('stream-modify-output-agent')

    const warnings: unknown[][] = []
    const modifyOutputCalls: unknown[] = []
    const sideEffects: string[] = []

    const middleware: PikkuAIMiddlewareHooks = {
      modifyOutput: async (_services, ctx) => {
        modifyOutputCalls.push(ctx)
        sideEffects.push(ctx.text)
        return { text: `${ctx.text} [redacted]`, messages: ctx.messages }
      },
    }
    const agent = pikkuState(null, 'agent', 'agents').get(
      'stream-modify-output-agent'
    )!
    agent.aiMiddleware = [middleware] as any
    pikkuState(null, 'agent', 'agents').set('stream-modify-output-agent', agent)

    const mockServices = {
      logger: {
        info: () => {},
        warn: (...args: unknown[]) => warnings.push(args),
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async (_params: any, channel: any) => {
          channel.send({ type: 'text-delta', text: 'Hello' })
          return makeStepResult({ text: 'Hello', finishReason: 'stop' })
        },
      },
      aiRunState: {
        createRun: async () => 'run-modify-output',
        updateRun: async () => {},
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    const result = await streamAIAgent(
      'stream-modify-output-agent',
      {
        message: 'hello',
        threadId: 'thread-modify-output',
        resourceId: 'resource-modify-output',
      },
      {
        channelId: 'channel-modify-output',
        openingData: undefined,
        state: 'open',
        send: () => {},
        close: () => {},
      },
      {}
    )

    // It does not run at all — nothing on this path could act on what it
    // returns, and the one hook that used to rely on the side effect (working
    // memory) now persists from its own modifyOutputStream.
    assert.equal(modifyOutputCalls.length, 0)
    assert.deepEqual(sideEffects, [])
    assert.equal(result, 'Hello')

    // And the author of that hook has to be told, or the gap is silent.
    assert.equal(
      warnings.filter((args) =>
        args.some(
          (arg) =>
            typeof arg === 'string' &&
            arg.includes('modifyOutput') &&
            arg.includes('stream-modify-output-agent')
        )
      ).length,
      1
    )
  })

  test('persists working memory from a streamed run', async () => {
    addTestAgent('stream-working-memory-agent')

    const savedWorkingMemory: unknown[] = []

    const agent = pikkuState(null, 'agent', 'agents').get(
      'stream-working-memory-agent'
    )!
    agent.memory = { workingMemory: true } as any
    pikkuState(null, 'agent', 'agents').set(
      'stream-working-memory-agent',
      agent
    )

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async (_params: any, channel: any) => {
          channel.send({
            type: 'text-delta',
            text: 'Noted <working_memory>{"city":"Berlin"}</working_memory>',
          })
          return makeStepResult({ text: 'Noted', finishReason: 'stop' })
        },
      },
      aiRunState: {
        createRun: async () => 'run-working-memory',
        updateRun: async () => {},
      },
      aiStorage: {
        createThread: async () => {},
        getMessages: async () => [],
        saveMessages: async () => {},
        getWorkingMemory: async () => ({}),
        saveWorkingMemory: async (
          threadId: string,
          scope: string,
          value: unknown
        ) => {
          savedWorkingMemory.push({ threadId, scope, value })
        },
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    await streamAIAgent(
      'stream-working-memory-agent',
      {
        message: 'remember I live in Berlin',
        threadId: 'thread-working-memory',
        resourceId: 'resource-working-memory',
      },
      {
        channelId: 'channel-working-memory',
        openingData: undefined,
        state: 'open',
        send: () => {},
        close: () => {},
      },
      {}
    )

    // The block never reaches modifyOutput on this path: the middleware's own
    // stream hook strips it before the persisting channel accumulates the text.
    // Persisting has to happen from the stream hook, where the raw text is.
    assert.deepEqual(savedWorkingMemory, [
      {
        threadId: 'thread-working-memory',
        scope: 'thread',
        value: { city: 'Berlin' },
      },
    ])
  })

  test('a failing tool on a streamed run is persisted as a failure, not as text that reads like one', async () => {
    addTestAgent('stream-tool-error-agent')

    const savedMessages: any[] = []

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async (_params: any, channel: any) => {
          channel.send({
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'lookup',
            args: { city: 'Berlin' },
          })
          channel.send({
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'lookup',
            result: 'Error: upstream refused',
            error: 'upstream refused',
          })
          channel.send({
            type: 'tool-call',
            toolCallId: 'call-2',
            toolName: 'echo',
            args: {},
          })
          channel.send({
            type: 'tool-result',
            toolCallId: 'call-2',
            toolName: 'echo',
            result: 'Error: this is just what the tool said',
          })
          return makeStepResult({ text: 'done', finishReason: 'stop' })
        },
      },
      aiRunState: {
        createRun: async () => 'run-tool-error',
        updateRun: async () => {},
      },
      aiStorage: {
        createThread: async () => {},
        getMessages: async () => [],
        saveMessages: async (_threadId: string, messages: any[]) => {
          savedMessages.push(...messages)
        },
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    await streamAIAgent(
      'stream-tool-error-agent',
      {
        message: 'look it up',
        threadId: 'thread-tool-error',
        resourceId: 'resource-tool-error',
      },
      {
        channelId: 'channel-tool-error',
        openingData: undefined,
        state: 'open',
        send: () => {},
        close: () => {},
      },
      {}
    )

    const toolResults = savedMessages
      .filter((message) => message.role === 'tool')
      .flatMap((message) => message.toolResults ?? [])

    assert.deepEqual(
      toolResults.map((r: any) => [r.name, r.error]),
      [
        ['lookup', 'upstream refused'],
        ['echo', undefined],
      ]
    )
  })

  test('does not warn about modifyOutput when the middleware also handles the stream', async () => {
    addTestAgent('stream-both-hooks-agent')

    const warnings: unknown[][] = []

    const middleware: PikkuAIMiddlewareHooks = {
      modifyOutput: async (_services, ctx) => ({
        text: ctx.text,
        messages: ctx.messages,
      }),
      modifyOutputStream: async (_services, ctx) => ctx.event,
    }
    const agent = pikkuState(null, 'agent', 'agents').get(
      'stream-both-hooks-agent'
    )!
    agent.aiMiddleware = [middleware] as any
    pikkuState(null, 'agent', 'agents').set('stream-both-hooks-agent', agent)

    const mockServices = {
      logger: {
        info: () => {},
        warn: (...args: unknown[]) => warnings.push(args),
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async (_params: any, channel: any) => {
          channel.send({ type: 'text-delta', text: 'Hi' })
          return makeStepResult({ text: 'Hi', finishReason: 'stop' })
        },
      },
      aiRunState: {
        createRun: async () => 'run-both-hooks',
        updateRun: async () => {},
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    await streamAIAgent(
      'stream-both-hooks-agent',
      {
        message: 'hello',
        threadId: 'thread-both-hooks',
        resourceId: 'resource-both-hooks',
      },
      {
        channelId: 'channel-both-hooks',
        openingData: undefined,
        state: 'open',
        send: () => {},
        close: () => {},
      },
      {}
    )

    assert.deepEqual(
      warnings.filter((args) =>
        args.some(
          (arg) => typeof arg === 'string' && arg.includes('modifyOutput')
        )
      ),
      []
    )
  })
})
