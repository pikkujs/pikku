import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import { streamAgent, resumeAgent } from './agent-stream.js'
import type {
  CoreAgent,
  AgentStreamChannel,
  AgentStreamEvent,
} from './agent.types.js'
import type {
  AgentStepResult,
  AgentRunnerParams,
} from '../../services/agent-runner-service.js'

beforeEach(() => {
  resetPikkuState()
})

const registerAgent = (
  name: string,
  overrides: Partial<CoreAgent> = {},
  metaOverrides: Record<string, unknown> = {}
) => {
  const agent: CoreAgent = {
    name,
    description: `${name} agent`,
    instructions: name,
    model: 'test/test-model',
    ...overrides,
  }

  pikkuState(null, 'agent', 'agentsMeta')[name] = {
    ...agent,
    inputSchema: null,
    outputSchema: null,
    workingMemorySchema: null,
    ...metaOverrides,
  } as any
  pikkuState(null, 'agent', 'agents').set(name, agent)
  return agent
}

const makeStepResult = (
  overrides?: Partial<AgentStepResult>
): AgentStepResult => ({
  text: '',
  toolCalls: [],
  toolResults: [],
  usage: { inputTokens: 0, outputTokens: 0 },
  finishReason: 'stop',
  ...overrides,
})

const recordingChannel = (channelId: string) => {
  const events: AgentStreamEvent[] = []
  const channel = {
    channelId,
    openingData: undefined,
    state: 'open',
    send: (event: AgentStreamEvent) => {
      events.push(event)
    },
    sendBinary: () => {},
    setState: () => {},
    close: () => {},
  } as unknown as AgentStreamChannel
  return { channel, events }
}

const parentTextOf = (events: AgentStreamEvent[]) =>
  events
    .filter((e) => e.type === 'text-delta' && !(e as any).agent)
    .map((e) => (e as any).text as string)
    .join('')

/**
 * A parent that speaks either side of a hand-off to a specialist — the shape
 * the issue describes, with the model's text made deterministic so the
 * plumbing can be observed without a live call.
 */
const delegatingRunner = (
  script: { preHandoff: string; postHandoff: string } = {
    preHandoff: 'Planning. ',
    postHandoff: 'Handed off. <working_memory>{"phase":"two"}</working_memory>',
  }
) => {
  let parentStep = 0
  return {
    stream: async (params: AgentRunnerParams, channel: AgentStreamChannel) => {
      const subTool = params.tools.find((t) => t.name === 'sub')
      if (!subTool) {
        channel.send({ type: 'text-delta', text: 'specialist output' })
        channel.send({
          type: 'usage',
          tokens: { input: 1, output: 1 },
        } as AgentStreamEvent)
        return makeStepResult({ text: 'specialist output' })
      }

      if (parentStep++ === 0) {
        channel.send({ type: 'text-delta', text: script.preHandoff })

        await subTool.execute!({ message: 'do phase two', session: 's1' })

        channel.send({ type: 'text-delta', text: script.postHandoff })
        channel.send({
          type: 'usage',
          tokens: { input: 1, output: 1 },
        } as AgentStreamEvent)
        return makeStepResult({
          text: 'Planning. Handed off.',
          toolCalls: [
            {
              toolCallId: 'call-1',
              toolName: 'sub',
              args: { message: 'do phase two', session: 's1' },
            },
          ],
          toolResults: [
            {
              toolCallId: 'call-1',
              toolName: 'sub',
              result: 'specialist output',
            },
          ],
          finishReason: 'tool-calls',
        })
      }

      channel.send({
        type: 'text-delta',
        text: 'Done. <working_memory>{"phase":"three"}</working_memory>',
      })
      channel.send({
        type: 'usage',
        tokens: { input: 1, output: 1 },
      } as AgentStreamEvent)
      return makeStepResult({ text: 'Done.' })
    },
  }
}

const makeServices = (
  runner: { stream: any },
  savedWorkingMemory: unknown[],
  savedMessages: any[] = []
) => {
  let stored: Record<string, unknown> = {}
  return {
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    agentRunner: runner,
    agentRunState: {
      createRun: async () => 'run-1',
      updateRun: async () => {},
    },
    agentStorage: {
      createThread: async () => {},
      getMessages: async () => [],
      saveMessages: async (threadId: string, messages: any[]) => {
        savedMessages.push(
          ...messages.map((message) => ({ threadId, message }))
        )
      },
      getWorkingMemory: async () => stored,
      saveWorkingMemory: async (
        threadId: string,
        scope: string,
        value: any
      ) => {
        stored = value
        savedWorkingMemory.push({ threadId, scope, value })
      },
    },
  } as any
}

const wireDelegatingPair = (agentMode: 'delegate' | 'supervise') => {
  registerAgent('sub', { instructions: 'sub' })
  registerAgent(
    'parent',
    {
      instructions: 'parent',
      agentMode,
      memory: { workingMemory: true } as any,
    },
    { agents: ['sub'] }
  )
}

const runParent = async (script?: {
  preHandoff: string
  postHandoff: string
}) => {
  const savedWorkingMemory: unknown[] = []
  const savedMessages: any[] = []
  pikkuState(
    null,
    'package',
    'singletonServices',
    makeServices(delegatingRunner(script), savedWorkingMemory, savedMessages)
  )
  const { channel, events } = recordingChannel('c1')
  const fullText = await streamAgent(
    'parent',
    { message: 'go', threadId: 't1', resourceId: 'r1' },
    channel,
    {}
  )
  return { savedWorkingMemory, savedMessages, events, fullText }
}

describe('delegate mode and working memory', () => {
  test('collects working memory the parent writes after a hand-off', async () => {
    wireDelegatingPair('delegate')
    const { savedWorkingMemory } = await runParent()

    assert.deepEqual(
      savedWorkingMemory.map((s: any) => s.value.phase),
      ['two', 'three']
    )
  })

  test('still collects working memory written before the hand-off', async () => {
    wireDelegatingPair('delegate')
    const { savedWorkingMemory } = await runParent({
      preHandoff: 'Planning. <working_memory>{"phase":"one"}</working_memory>',
      postHandoff: 'Handed off. ',
    })

    assert.deepEqual(
      savedWorkingMemory.map((s: any) => s.value.phase),
      ['one', 'three']
    )
  })

  test('the client receives no parent text after the hand-off', async () => {
    wireDelegatingPair('delegate')
    const { events } = await runParent()

    assert.equal(parentTextOf(events), 'Planning. ')
  })

  test('the parent assistant text persisted stays suppressed', async () => {
    wireDelegatingPair('delegate')
    const { fullText, savedMessages } = await runParent()

    assert.equal(fullText, 'Planning. ')
    const assistantText = savedMessages
      .filter(
        ({ threadId, message }: any) =>
          threadId === 't1' && message.role === 'assistant'
      )
      .map(({ message }: any) =>
        typeof message.content === 'string'
          ? message.content
          : (message.content ?? [])
              .filter((part: any) => part.type === 'text')
              .map((part: any) => part.text)
              .join('')
      )
      .join('')
    assert.equal(assistantText, 'Planning. ')
  })

  test('supervise mode streams every parent delta and collects every update', async () => {
    wireDelegatingPair('supervise')
    const { events, savedWorkingMemory } = await runParent()

    assert.equal(parentTextOf(events), 'Planning. Handed off. Done. ')
    assert.deepEqual(
      savedWorkingMemory.map((s: any) => s.value.phase),
      ['two', 'three']
    )
  })

  test('user channel middleware sees exactly the deltas the client sees', async () => {
    wireDelegatingPair('delegate')
    const seen: string[] = []
    const agent = pikkuState(null, 'agent', 'agents').get('parent')!
    agent.channelMiddleware = [
      async (_services: any, event: any, next: any) => {
        if (event.type === 'text-delta') seen.push(event.text)
        await next(event)
      },
    ] as any
    pikkuState(null, 'agent', 'agents').set('parent', agent)

    const { events } = await runParent({
      preHandoff: 'Planning. <working_memory>{"phase":"one"}</working_memory>',
      postHandoff: 'Handed off. ',
    })

    const clientDeltas = events
      .filter((e) => e.type === 'text-delta' && !(e as any).agent)
      .map((e) => (e as any).text as string)

    assert.deepEqual(seen, clientDeltas)
    assert.deepEqual(seen, ['Planning. '])
  })

  test('the raw text a delegating parent speaks still reaches afterStep', async () => {
    wireDelegatingPair('delegate')

    const stepTexts: string[] = []
    const agent = pikkuState(null, 'agent', 'agents').get('parent')!
    agent.agentMiddleware = [
      {
        afterStep: async (_services: any, ctx: any) => {
          stepTexts.push(ctx.text)
        },
      },
    ] as any
    pikkuState(null, 'agent', 'agents').set('parent', agent)

    await runParent()

    assert.deepEqual(stepTexts, ['Planning. Handed off.', 'Done.'])
  })
})

describe('delegate mode on the resume path', () => {
  test('suppresses parent text after a hand-off and still collects working memory', async () => {
    wireDelegatingPair('delegate')

    const savedWorkingMemory: unknown[] = []
    const services = makeServices(delegatingRunner(), savedWorkingMemory)
    let pendingApprovals: unknown[] = [
      {
        type: 'tool-call',
        toolCallId: 'tc-1',
        toolName: 'sub',
        args: { message: 'approved hand-off', session: 's0' },
        runId: 'run-1',
      },
    ]
    services.agentRunState = {
      createRun: async () => 'run-1',
      updateRun: async () => {},
      resolveApproval: async () => {
        pendingApprovals = []
        return true
      },
      getRun: async () => ({
        runId: 'run-1',
        id: 'run-1',
        agentName: 'parent',
        threadId: 't1',
        resourceId: 'r1',
        status: 'suspended',
        pendingApprovals,
        messages: [],
      }),
    }
    pikkuState(null, 'package', 'singletonServices', services)

    const { channel, events } = recordingChannel('c1')
    await resumeAgent(
      { runId: 'run-1', toolCallId: 'tc-1', approved: true },
      channel,
      {
        sessionService: {
          get: () => ({ userId: 'r1' }),
          setInitial: () => {},
          sessionChanged: false,
        },
      } as any
    )

    assert.equal(parentTextOf(events), 'Planning. ')
    assert.deepEqual(
      savedWorkingMemory.map((s: any) => s.value.phase),
      ['two', 'three']
    )
  })
})
