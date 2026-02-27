import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import { streamAIAgent } from './ai-agent-stream.js'
import { ToolApprovalRequired } from './ai-agent-prepare.js'
import type { CoreAIAgent, AIStreamEvent } from './ai-agent.types.js'

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
      ['error', 'done']
    )
  })

  test('suspends run and emits approval request when tool approval is required (no throw)', async () => {
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
        stream: async () => {
          throw new ToolApprovalRequired('tool-call-1', 'tool-x', { id: 1 })
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

    await streamAIAgent(
      'approval-stream-agent',
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
      events.map((event) => event.type),
      ['approval-request', 'done']
    )
  })

  test('suspends with agent-call type when agentRunId is present', async () => {
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
        stream: async () => {
          throw new ToolApprovalRequired(
            'tool-call-2',
            'sub-agent',
            { message: 'hi' },
            undefined,
            'deleteTodo',
            { todoId: '2' },
            'sub-run-1'
          )
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
})
