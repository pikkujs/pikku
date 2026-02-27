import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import { streamAIAgent } from './ai-agent-stream.js'
import { ToolApprovalRequired } from './ai-agent-prepare.js'
import type { CoreAIAgent, AIStreamEvent } from './ai-agent.types.js'
import type { AIAgentStepResult } from '../../services/ai-agent-runner-service.js'

beforeEach(() => {
  resetPikkuState()
})

const addTestAgent = (agentName: string) => {
  const agent: CoreAIAgent = {
    name: agentName,
    description: 'test agent',
    instructions: 'be helpful',
    model: 'test-model',
  }

  pikkuState(null, 'agent', 'agentsMeta')[agentName] = {
    ...agent,
    inputSchema: null,
    outputSchema: null,
    workingMemorySchema: null,
  }
  pikkuState(null, 'agent', 'agents').set(agentName, agent)
  pikkuState(null, 'models', 'config', {
    models: { 'test-model': 'test/test-model' },
  })
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

describe('streamAIAgent', () => {
  test('marks run as failed and emits error/done when stream runner throws', async () => {
    addTestAgent('failing-stream-agent')

    const updates: Array<{ runId: string; patch: unknown }> = []
    const events: AIStreamEvent[] = []

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async () => {
          throw new Error('stream failed')
        },
      },
      aiRunState: {
        createRun: async () => 'run-1',
        updateRun: async (runId: string, patch: unknown) => {
          updates.push({ runId, patch })
        },
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    await streamAIAgent(
      'failing-stream-agent',
      {
        message: 'hello',
        threadId: 'thread-1',
        resourceId: 'resource-1',
      },
      {
        channelId: 'channel-1',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => {
          events.push(event)
        },
        close: () => {},
      },
      {}
    )

    assert.deepEqual(updates, [{ runId: 'run-1', patch: { status: 'failed' } }])
    assert.deepEqual(
      events.map((event) => event.type),
      ['step-start', 'error', 'done']
    )
  })

  test('completes normally when stream returns no tool calls', async () => {
    addTestAgent('simple-stream-agent')

    const updates: Array<{ runId: string; patch: unknown }> = []
    const events: AIStreamEvent[] = []

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async (): Promise<AIAgentStepResult> => {
          return makeStepResult({ text: 'Hello world' })
        },
      },
      aiRunState: {
        createRun: async () => 'run-simple',
        updateRun: async (runId: string, patch: unknown) => {
          updates.push({ runId, patch })
        },
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    await streamAIAgent(
      'simple-stream-agent',
      {
        message: 'hello',
        threadId: 'thread-simple',
        resourceId: 'resource-simple',
      },
      {
        channelId: 'channel-simple',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => {
          events.push(event)
        },
        close: () => {},
      },
      {}
    )

    assert.deepEqual(updates, [
      { runId: 'run-simple', patch: { status: 'completed' } },
    ])
    assert.ok(events.some((e) => e.type === 'done'))
  })

  test('suspends run when tool needs approval (needsApproval flag)', async () => {
    addTestAgent('approval-stream-agent')

    const updates: Array<{ runId: string; patch: unknown }> = []
    const events: AIStreamEvent[] = []

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async (): Promise<AIAgentStepResult> => {
          return makeStepResult({
            toolCalls: [
              {
                toolCallId: 'tool-call-1',
                toolName: 'tool-x',
                args: { id: 1 },
              },
            ],
          })
        },
      },
      aiRunState: {
        createRun: async () => 'run-2',
        updateRun: async (runId: string, patch: unknown) => {
          updates.push({ runId, patch })
        },
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    const agentName = 'approval-stream-agent'
    const agent = pikkuState(null, 'agent', 'agents').get(agentName)!
    agent.tools = ['tool-x']
    pikkuState(null, 'agent', 'agents').set(agentName, agent)
    pikkuState(null, 'agent', 'agentsMeta')[agentName].tools = ['tool-x']
    pikkuState(null, 'rpc', 'meta')['tool-x'] = 'tool-x'
    pikkuState(null, 'function', 'meta')['tool-x'] = {
      description: 'test tool',
      requiresApproval: true,
    }
    pikkuState(null, 'misc', 'schemas').set('ToolXInput', {
      type: 'object',
      properties: { id: { type: 'number' } },
    })

    await streamAIAgent(
      agentName,
      {
        message: 'hello',
        threadId: 'thread-2',
        resourceId: 'resource-2',
      },
      {
        channelId: 'channel-2',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => {
          events.push(event)
        },
        close: () => {},
      },
      {},
      undefined,
      { requiresToolApproval: 'all' }
    )

    assert.deepEqual(updates, [
      {
        runId: 'run-2',
        patch: {
          status: 'suspended',
          suspendReason: 'approval',
          pendingApprovals: [
            {
              type: 'tool-call',
              toolCallId: 'tool-call-1',
              toolName: 'tool-x',
              args: { id: 1 },
            },
          ],
        },
      },
    ])

    const approvalEvent = events.find(
      (e) => e.type === 'approval-request'
    ) as any
    assert.ok(approvalEvent)
    assert.equal(approvalEvent.toolCallId, 'tool-call-1')
    assert.equal(approvalEvent.toolName, 'tool-x')
    assert.deepEqual(approvalEvent.args, { id: 1 })

    assert.deepEqual(
      events
        .filter((e) => e.type === 'approval-request' || e.type === 'done')
        .map((e) => e.type),
      ['approval-request', 'done']
    )
  })

  test('suspends with agent-call type when sub-agent returns approval sentinel', async () => {
    addTestAgent('parent-agent')

    const updates: Array<{ runId: string; patch: unknown }> = []
    const events: AIStreamEvent[] = []

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async (): Promise<AIAgentStepResult> => {
          return makeStepResult({
            toolCalls: [
              {
                toolCallId: 'tool-call-2',
                toolName: 'sub-agent',
                args: { message: 'hi' },
              },
            ],
            toolResults: [
              {
                toolCallId: 'tool-call-2',
                toolName: 'sub-agent',
                result: {
                  __approvalRequired: true,
                  toolName: 'sub-agent',
                  args: { message: 'hi' },
                  displayToolName: 'deleteTodo',
                  displayArgs: { todoId: '2' },
                  agentRunId: 'sub-run-1',
                },
              },
            ],
          })
        },
      },
      aiRunState: {
        createRun: async () => 'run-3',
        updateRun: async (runId: string, patch: unknown) => {
          updates.push({ runId, patch })
        },
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    await streamAIAgent(
      'parent-agent',
      {
        message: 'hello',
        threadId: 'thread-3',
        resourceId: 'resource-3',
      },
      {
        channelId: 'channel-3',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => {
          events.push(event)
        },
        close: () => {},
      },
      {}
    )

    assert.deepEqual(updates, [
      {
        runId: 'run-3',
        patch: {
          status: 'suspended',
          suspendReason: 'approval',
          pendingApprovals: [
            {
              type: 'agent-call',
              toolCallId: 'tool-call-2',
              agentName: 'sub-agent',
              agentRunId: 'sub-run-1',
              displayToolName: 'deleteTodo',
              displayArgs: { todoId: '2' },
            },
          ],
        },
      },
    ])

    const approvalEvent = events.find(
      (e) => e.type === 'approval-request'
    ) as any
    assert.ok(approvalEvent)
    assert.equal(approvalEvent.toolCallId, 'tool-call-2')
    assert.equal(approvalEvent.toolName, 'deleteTodo')
    assert.deepEqual(approvalEvent.args, { todoId: '2' })
  })

  test('loops through multiple steps when tools are called', async () => {
    addTestAgent('multi-step-agent')

    const updates: Array<{ runId: string; patch: unknown }> = []
    const events: AIStreamEvent[] = []
    let callCount = 0

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async (): Promise<AIAgentStepResult> => {
          callCount++
          if (callCount === 1) {
            return makeStepResult({
              text: 'Calling tool...',
              toolCalls: [
                { toolCallId: 'tc-1', toolName: 'myTool', args: { q: 'test' } },
              ],
              toolResults: [
                {
                  toolCallId: 'tc-1',
                  toolName: 'myTool',
                  result: 'tool result',
                },
              ],
              finishReason: 'tool-calls',
            })
          }
          return makeStepResult({ text: 'Final answer', finishReason: 'stop' })
        },
      },
      aiRunState: {
        createRun: async () => 'run-multi',
        updateRun: async (runId: string, patch: unknown) => {
          updates.push({ runId, patch })
        },
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    await streamAIAgent(
      'multi-step-agent',
      {
        message: 'hello',
        threadId: 'thread-multi',
        resourceId: 'resource-multi',
      },
      {
        channelId: 'channel-multi',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => {
          events.push(event)
        },
        close: () => {},
      },
      {}
    )

    assert.equal(callCount, 2)
    assert.deepEqual(updates, [
      { runId: 'run-multi', patch: { status: 'completed' } },
    ])
    assert.ok(events.some((e) => e.type === 'done'))
  })
})
