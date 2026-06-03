import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import {
  addAIAgent,
  approveAIAgent,
  getAIAgents,
  getAIAgentsMeta,
} from './ai-agent-registry.js'

beforeEach(() => {
  resetPikkuState()
})

describe('addAIAgent', () => {
  test('skips registration when metadata is missing and warns', () => {
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (message?: any) => {
      warnings.push(String(message))
    }

    try {
      addAIAgent('missing-agent', {
        name: 'missing-agent',
        description: 'desc',
        goal: 'goal',
        instructions: 'help',
        model: 'model',
      } as any)
    } finally {
      console.warn = originalWarn
    }

    assert.equal(getAIAgents().has('missing-agent'), false)
    assert.match(warnings[0], /Skipping AI agent 'missing-agent'/)
  })

  test('adds agents when metadata exists and rejects duplicates', () => {
    pikkuState(null, 'agent', 'agentsMeta').assistant = {
      name: 'assistant',
      description: 'desc',
      goal: 'goal',
    } as any

    addAIAgent('assistant', {
      name: 'assistant',
      description: 'desc',
      goal: 'goal',
      instructions: 'help',
      model: 'model',
    } as any)

    assert.equal(getAIAgents().get('assistant')?.name, 'assistant')
    assert.throws(
      () =>
        addAIAgent('assistant', {
          name: 'assistant',
          description: 'desc',
          goal: 'goal',
          instructions: 'help',
          model: 'model',
        } as any),
      {
        message: 'AI agent already exists: assistant',
      }
    )
  })
})

describe('approveAIAgent', () => {
  test('throws when run state service is missing, run is missing, or run is not suspended', async () => {
    await assert.rejects(() => approveAIAgent(null as any, 'run-1', []), {
      message: 'AIRunStateService not available',
    })

    await assert.rejects(
      () =>
        approveAIAgent(
          {
            getRun: async () => null,
            updateRun: async () => {},
          } as any,
          'run-1',
          []
        ),
      {
        message: 'Run not found: run-1',
      }
    )

    await assert.rejects(
      () =>
        approveAIAgent(
          {
            getRun: async () => ({
              runId: 'run-1',
              agentName: 'agent',
              threadId: 'thread-1',
              resourceId: 'resource-1',
              status: 'completed',
              usage: {
                inputTokens: 0,
                outputTokens: 0,
                model: 'test/test-model',
              },
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
            updateRun: async () => {},
          } as any,
          'run-1',
          []
        ),
      {
        message: 'Run is not suspended: completed',
      }
    )
  })

  test('rejects approval when run agent does not match expected agent', async () => {
    const aiRunState = {
      getRun: async () => ({
        runId: 'run-1',
        agentName: 'internal-agent',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        status: 'suspended',
        pendingApprovals: [],
        usage: { inputTokens: 0, outputTokens: 0, model: 'test/test-model' },
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      updateRun: async () => {},
    } as any

    await assert.rejects(
      () =>
        approveAIAgent(
          aiRunState,
          'run-1',
          [{ toolCallId: 'call-1', approved: true }],
          'public-agent'
        ),
      {
        message:
          "Run run-1 belongs to agent 'internal-agent', not 'public-agent'",
      }
    )
  })

  test('marks run resumed when at least one approval is granted', async () => {
    const updates: any[] = []
    const result = await approveAIAgent(
      {
        getRun: async () => ({
          runId: 'run-2',
          agentName: 'assistant',
          threadId: 'thread-1',
          resourceId: 'resource-1',
          status: 'suspended',
          pendingApprovals: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'a',
              args: {},
            },
            {
              type: 'tool-call',
              toolCallId: 'call-2',
              toolName: 'b',
              args: {},
            },
          ],
          usage: { inputTokens: 0, outputTokens: 0, model: 'test/test-model' },
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        updateRun: async (_runId: string, patch: any) => {
          updates.push(patch)
        },
      } as any,
      'run-2',
      [
        { toolCallId: 'call-1', approved: true },
        { toolCallId: 'call-3', approved: false },
      ]
    )

    assert.deepEqual(updates, [
      {
        status: 'running',
        pendingApprovals: [
          { type: 'tool-call', toolCallId: 'call-2', toolName: 'b', args: {} },
        ],
      },
    ])
    assert.deepEqual(result, {
      status: 'resumed',
      runId: 'run-2',
      approved: ['call-1'],
      rejected: ['call-3'],
      remainingApprovals: 1,
    })
  })

  test('keeps run suspended when nothing is approved', async () => {
    const updates: any[] = []
    const result = await approveAIAgent(
      {
        getRun: async () => ({
          runId: 'run-3',
          agentName: 'assistant',
          threadId: 'thread-1',
          resourceId: 'resource-1',
          status: 'suspended',
          pendingApprovals: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'a',
              args: {},
            },
          ],
          usage: { inputTokens: 0, outputTokens: 0, model: 'test/test-model' },
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        updateRun: async (_runId: string, patch: any) => {
          updates.push(patch)
        },
      } as any,
      'run-3',
      [{ toolCallId: 'call-1', approved: false }]
    )

    assert.deepEqual(updates, [
      {
        status: 'suspended',
        pendingApprovals: undefined,
      },
    ])
    assert.deepEqual(result, {
      status: 'suspended',
      runId: 'run-3',
      approved: [],
      rejected: ['call-1'],
      remainingApprovals: 0,
    })
  })
})

describe('getAIAgentsMeta', () => {
  test('returns the shared metadata registry', () => {
    const meta = getAIAgentsMeta()
    meta.assistant = { name: 'assistant' } as any
    assert.equal(
      pikkuState(null, 'agent', 'agentsMeta').assistant.name,
      'assistant'
    )
  })
})
