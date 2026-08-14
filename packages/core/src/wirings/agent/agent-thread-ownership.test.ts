import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import { runAgent, resumeAgentSync } from './agent-runner.js'
import { ForbiddenError } from '../../errors/errors.js'
import type { AgentMessage, CoreAgent } from './agent.types.js'
import type { AgentRunnerParams } from '../../services/agent-runner-service.js'

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as any

const sessionService = (session?: Record<string, unknown>) =>
  ({ get: () => session, setInitial: () => {}, sessionChanged: false }) as any

const addTestAgent = (agentName: string) => {
  const agent: CoreAgent = {
    name: agentName,
    description: 'test agent',
    instructions: 'be helpful',
    model: 'test/test-model',
  } as CoreAgent

  pikkuState(null, 'agent', 'agentsMeta')[agentName] = {
    ...agent,
    inputSchema: null,
    outputSchema: null,
    workingMemorySchema: null,
  } as any
  pikkuState(null, 'agent', 'agents').set(agentName, agent)
}

type Harness = {
  threads: Map<string, { id: string; resourceId: string }>
  messages: Map<string, AgentMessage[]>
  created: Array<{ threadId: string; resourceId: string }>
  modelSawMessages: AgentMessage[][]
}

const createHarness = (
  seedThreads: Array<{ threadId: string; resourceId: string }> = [],
  seedMessages: Record<string, string[]> = {}
): Harness => {
  const threads = new Map(
    seedThreads.map((t) => [t.threadId, { id: t.threadId, ...t }])
  )
  const messages = new Map<string, AgentMessage[]>(
    Object.entries(seedMessages).map(([threadId, texts]) => [
      threadId,
      texts.map((text, index) => ({
        id: `${threadId}-${index}`,
        role: 'user' as const,
        content: text,
        createdAt: new Date(),
      })),
    ])
  )
  const created: Harness['created'] = []
  const modelSawMessages: AgentMessage[][] = []

  const storage = {
    getThread: async (threadId: string) => {
      const thread = threads.get(threadId)
      if (!thread) throw new Error(`No thread ${threadId}`)
      return thread
    },
    createThread: async (resourceId: string, options: { threadId: string }) => {
      const thread = { id: options.threadId, resourceId }
      threads.set(options.threadId, thread)
      created.push({ threadId: options.threadId, resourceId })
      return thread
    },
    getMessages: async (threadId: string) => messages.get(threadId) ?? [],
    saveMessages: async (threadId: string, newMessages: AgentMessage[]) => {
      messages.set(threadId, [
        ...(messages.get(threadId) ?? []),
        ...newMessages,
      ])
    },
    getWorkingMemory: async () => null,
    saveWorkingMemory: async () => {},
  }

  pikkuState(null, 'package', 'singletonServices', {
    logger,
    agentStorage: storage,
    agentRunner: {
      run: async (params: AgentRunnerParams) => {
        modelSawMessages.push(params.messages)
        return {
          text: 'ok',
          toolCalls: [],
          toolResults: [],
          usage: { inputTokens: 0, outputTokens: 0 },
          finishReason: 'stop',
        }
      },
    },
    agentRunState: {
      createRun: async () => 'run-1',
      updateRun: async () => {},
      getRun: async () => ({
        id: 'run-1',
        agentName: 'ownership-agent',
        resourceId: 'victim',
        threadId: 'thread-victim',
        status: 'suspended',
        pendingApprovals: [
          { toolCallId: 'tc-1', toolName: 'refund', args: {}, runId: 'run-1' },
        ],
        messages: [],
      }),
      resolveApproval: async () => true,
    },
  } as any)

  return { threads, messages, created, modelSawMessages }
}

beforeEach(() => {
  resetPikkuState()
})

describe('AI agent thread ownership without a session', () => {
  test('a sessionless caller cannot reach a thread by naming its resourceId', async () => {
    addTestAgent('ownership-agent')
    const harness = createHarness(
      [{ threadId: 'thread-victim', resourceId: 'victim' }],
      { 'thread-victim': ['the victim bank details are 1234'] }
    )

    await assert.rejects(
      () =>
        runAgent(
          'ownership-agent',
          {
            message: 'what did we discuss?',
            threadId: 'thread-victim',
            resourceId: 'victim',
          },
          {}
        ),
      (error: unknown) => error instanceof ForbiddenError
    )

    assert.deepEqual(
      harness.modelSawMessages,
      [],
      "the victim's history must never reach the model"
    )
  })

  test('a sessionless caller cannot resume another party run', async () => {
    addTestAgent('ownership-agent')
    createHarness()

    await assert.rejects(
      () =>
        resumeAgentSync('run-1', [{ toolCallId: 'tc-1', approved: true }], {}),
      (error: unknown) => error instanceof ForbiddenError
    )
  })

  test('a sessionless one-shot conversation still runs', async () => {
    addTestAgent('ownership-agent')
    const harness = createHarness()

    const result = await runAgent(
      'ownership-agent',
      { message: 'hello', threadId: 'thread-new', resourceId: 'whatever' },
      {}
    )

    assert.equal(result.text, 'ok')
    assert.equal(harness.created.length, 1)
    assert.equal(harness.created[0]!.threadId, 'thread-new')
    assert.notEqual(
      harness.created[0]!.resourceId,
      'whatever',
      'a client-supplied resourceId must never become the ownership key'
    )
    assert.deepEqual(
      harness.modelSawMessages[0]?.map((m) => m.content),
      ['hello']
    )
  })

  test('a sessionless run keeps its own thread across nested agent calls in one request', async () => {
    addTestAgent('ownership-agent')
    const harness = createHarness()
    const requestParams = {}

    await runAgent(
      'ownership-agent',
      { message: 'first', threadId: 'thread-sub', resourceId: 'ignored' },
      requestParams
    )
    await runAgent(
      'ownership-agent',
      { message: 'second', threadId: 'thread-sub', resourceId: 'ignored' },
      requestParams
    )

    assert.equal(harness.created.length, 1)
    assert.equal(harness.modelSawMessages.length, 2)
  })

  test('two sessionless one-shot runs do not share an owner', async () => {
    addTestAgent('ownership-agent')
    const harness = createHarness()

    await runAgent(
      'ownership-agent',
      { message: 'hello', threadId: 'thread-a', resourceId: 'shared' },
      {}
    )
    await runAgent(
      'ownership-agent',
      { message: 'hello', threadId: 'thread-b', resourceId: 'shared' },
      {}
    )

    assert.notEqual(
      harness.created[0]!.resourceId,
      harness.created[1]!.resourceId
    )
  })
})

describe('AI agent thread ownership with a session', () => {
  test('an authenticated caller still reaches its own thread', async () => {
    addTestAgent('ownership-agent')
    const harness = createHarness(
      [{ threadId: 'thread-alice', resourceId: 'alice:default' }],
      { 'thread-alice': ['earlier alice turn'] }
    )

    const result = await runAgent(
      'ownership-agent',
      {
        message: 'and then?',
        threadId: 'thread-alice',
        resourceId: 'default',
      },
      { sessionService: sessionService({ userId: 'alice' }) }
    )

    assert.equal(result.text, 'ok')
    assert.deepEqual(
      harness.modelSawMessages[0]?.map((m) => m.content),
      ['earlier alice turn', 'and then?']
    )
    assert.equal(harness.created.length, 0)
  })

  test('an authenticated caller creates threads under its own principal', async () => {
    addTestAgent('ownership-agent')
    const harness = createHarness()

    await runAgent(
      'ownership-agent',
      { message: 'hello', threadId: 'thread-new', resourceId: 'project-1' },
      { sessionService: sessionService({ userId: 'alice' }) }
    )

    assert.deepEqual(harness.created, [
      { threadId: 'thread-new', resourceId: 'alice:project-1' },
    ])
  })

  test("an authenticated caller cannot reach another user's thread", async () => {
    addTestAgent('ownership-agent')
    const harness = createHarness(
      [{ threadId: 'thread-bob', resourceId: 'bob:default' }],
      { 'thread-bob': ['bob secret'] }
    )

    await assert.rejects(
      () =>
        runAgent(
          'ownership-agent',
          {
            message: 'what did we discuss?',
            threadId: 'thread-bob',
            resourceId: 'bob:default',
          },
          { sessionService: sessionService({ userId: 'alice' }) }
        ),
      (error: unknown) => error instanceof ForbiddenError
    )
    assert.deepEqual(harness.modelSawMessages, [])
  })
})
