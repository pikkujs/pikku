import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  resetPikkuState,
  pikkuState,
  setSingletonServices,
} from '../../pikku-state.js'
import {
  addAIAgent,
  approveAIAgent,
  getAIAgents,
  getAIAgentsMeta,
} from './ai-agent-registry.js'
import { clearPermissionsCache } from '../../permissions.js'
import { ForbiddenError, MissingScopeError } from '../../errors/errors.js'
import type { CoreAIAgent } from './ai-agent.types.js'
import type { CoreUserSession } from '../../types/core.types.js'

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as any

const registerAgent = (
  agentName: string,
  overrides: Partial<CoreAIAgent> = {}
) => {
  const agent = {
    name: agentName,
    description: `${agentName} description`,
    goal: `${agentName} goal`,
    model: 'test/test-model',
    ...overrides,
  } as CoreAIAgent
  pikkuState(null, 'agent', 'agents').set(agentName, agent)
  pikkuState(null, 'agent', 'agentsMeta')[agentName] = { ...agent } as any
  return agent
}

const sessionService = (session: CoreUserSession | undefined) =>
  ({
    get: () => session,
    setInitial: () => {},
    sessionChanged: false,
  }) as any

beforeEach(() => {
  resetPikkuState()
  clearPermissionsCache()
  setSingletonServices({ logger } as any)
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
    registerAgent('agent')

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
    registerAgent('internal-agent')
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
    registerAgent('assistant')
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
    registerAgent('assistant')
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

describe('approveAIAgent authorization', () => {
  const suspendedRun = (agentName: string, resourceId: string) => ({
    runId: 'run-auth',
    agentName,
    threadId: 'thread-1',
    resourceId,
    status: 'suspended',
    pendingApprovals: [
      { type: 'tool-call', toolCallId: 'call-1', toolName: 'refund', args: {} },
    ],
    usage: { inputTokens: 0, outputTokens: 0, model: 'test/test-model' },
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  const runStateFor = (agentName: string, resourceId: string) => {
    const updates: any[] = []
    return {
      updates,
      aiRunState: {
        getRun: async () => suspendedRun(agentName, resourceId),
        updateRun: async (_runId: string, patch: any) => {
          updates.push(patch)
        },
      } as any,
    }
  }

  test('rejects when the run belongs to another session principal', async () => {
    registerAgent('owned-agent')
    const { updates, aiRunState } = runStateFor('owned-agent', 'user-a:default')

    await assert.rejects(
      () =>
        approveAIAgent(
          aiRunState,
          'run-auth',
          [{ toolCallId: 'call-1', approved: true }],
          undefined,
          { sessionService: sessionService({ userId: 'user-b' }) } as any
        ),
      ForbiddenError
    )
    assert.deepEqual(updates, [], 'run state must not be mutated')
  })

  test('rejects when the agent permissions deny', async () => {
    registerAgent('denied-agent', {
      permissions: { denied: async () => false },
    } as Partial<CoreAIAgent>)
    const { updates, aiRunState } = runStateFor('denied-agent', 'u1')

    await assert.rejects(
      () =>
        approveAIAgent(
          aiRunState,
          'run-auth',
          [{ toolCallId: 'call-1', approved: true }],
          undefined,
          { sessionService: sessionService({ userId: 'u1' }) } as any
        ),
      ForbiddenError
    )
    assert.deepEqual(updates, [], 'run state must not be mutated')
  })

  test('rejects when a required scope is no longer held', async () => {
    registerAgent('scoped-agent', { scopes: ['admin:refund'] })
    const { updates, aiRunState } = runStateFor('scoped-agent', 'u1')

    await assert.rejects(
      () =>
        approveAIAgent(
          aiRunState,
          'run-auth',
          [{ toolCallId: 'call-1', approved: true }],
          undefined,
          {
            sessionService: sessionService({
              userId: 'u1',
              scopes: ['support'],
            }),
          } as any
        ),
      MissingScopeError
    )
    assert.deepEqual(updates, [])
  })

  test('rejects when auth is required and the session is gone', async () => {
    registerAgent('auth-agent', { auth: true })
    const { updates, aiRunState } = runStateFor('auth-agent', 'resource-1')

    await assert.rejects(
      () =>
        approveAIAgent(aiRunState, 'run-auth', [
          { toolCallId: 'call-1', approved: true },
        ]),
      ForbiddenError
    )
    assert.deepEqual(updates, [])
  })

  test('allows the owning session through the gate', async () => {
    registerAgent('owned-agent', { scopes: ['admin:refund'] })
    const { updates, aiRunState } = runStateFor('owned-agent', 'user-a:default')

    const result = await approveAIAgent(
      aiRunState,
      'run-auth',
      [{ toolCallId: 'call-1', approved: true }],
      undefined,
      {
        sessionService: sessionService({
          userId: 'user-a',
          scopes: ['admin:refund'],
        }),
      } as any
    )

    assert.equal(result.status, 'resumed')
    assert.deepEqual(updates, [
      { status: 'running', pendingApprovals: undefined },
    ])
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
