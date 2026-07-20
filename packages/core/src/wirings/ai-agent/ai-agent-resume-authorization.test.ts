import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  resetPikkuState,
  pikkuState,
  setSingletonServices,
} from '../../pikku-state.js'
import { resumeAIAgentSync } from './ai-agent-runner.js'
import { resumeAIAgent } from './ai-agent-stream.js'
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

const RUN_ID = 'run-1'
const TOOL_CALL_ID = 'tc-1'

const suspendedRun = (agentName: string, resourceId: string) => ({
  id: RUN_ID,
  agentName,
  resourceId,
  threadId: 'thread-1',
  status: 'suspended',
  pendingApprovals: [
    { toolCallId: TOOL_CALL_ID, toolName: 'refund', args: {}, runId: RUN_ID },
  ],
  messages: [],
})

const setup = (agentName: string, resourceId = 'u1') => {
  const resolved: string[] = []
  setSingletonServices({
    logger,
    aiRunState: {
      getRun: async () => suspendedRun(agentName, resourceId),
      resolveApproval: async (toolCallId: string) => {
        resolved.push(toolCallId)
      },
    },
  } as any)
  return resolved
}

const addAgent = (
  agentName: string,
  overrides: Partial<CoreAIAgent> = {}
): CoreAIAgent => {
  const agent: CoreAIAgent = {
    name: agentName,
    description: `${agentName} description`,
    goal: `${agentName} goal`,
    model: 'test/test-model',
    ...overrides,
  } as CoreAIAgent

  pikkuState(null, 'agent', 'agents').set(agentName, agent)
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
})

describe('resumeAIAgentSync authorization', () => {
  test('rejects when the agent permissions deny', async () => {
    const resolved = setup('denied-agent')
    addAgent('denied-agent', {
      permissions: { denied: async () => false },
    } as Partial<CoreAIAgent>)

    await assert.rejects(
      () =>
        resumeAIAgentSync(
          RUN_ID,
          [{ toolCallId: TOOL_CALL_ID, approved: true }],
          { sessionService: sessionService({ userId: 'u1' }) } as any
        ),
      ForbiddenError
    )
    assert.deepEqual(
      resolved,
      [],
      'approvals must not be resolved when authorization fails'
    )
  })

  test('rejects when a required scope is no longer held', async () => {
    const resolved = setup('scoped-agent')
    addAgent('scoped-agent', { scopes: ['admin:refund'] })

    await assert.rejects(
      () =>
        resumeAIAgentSync(
          RUN_ID,
          [{ toolCallId: TOOL_CALL_ID, approved: true }],
          {
            sessionService: sessionService({
              userId: 'u1',
              scopes: ['support'],
            }),
          } as any
        ),
      MissingScopeError
    )
    assert.deepEqual(resolved, [], 'a revoked scope must block resumption')
  })

  test('passes the gate when the session still holds the scope', async () => {
    setup('scoped-agent-ok')
    addAgent('scoped-agent-ok', { scopes: ['admin:refund'] })

    // Gets past authorization and fails later on the unconfigured provider,
    // which is how we know the gate admitted it.
    await assert.rejects(
      () =>
        resumeAIAgentSync(
          RUN_ID,
          [{ toolCallId: TOOL_CALL_ID, approved: true }],
          {
            sessionService: sessionService({
              userId: 'u1',
              scopes: ['admin:refund'],
            }),
          } as any
        ),
      (error: Error) =>
        !(error instanceof ForbiddenError) &&
        !(error instanceof MissingScopeError)
    )
  })

  test('rejects when auth is required and the session is gone', async () => {
    setup('auth-agent')
    addAgent('auth-agent', { auth: true })

    await assert.rejects(
      () =>
        resumeAIAgentSync(
          RUN_ID,
          [{ toolCallId: TOOL_CALL_ID, approved: true }],
          { sessionService: sessionService(undefined) } as any
        ),
      ForbiddenError
    )
  })
})

describe('resumeAIAgent (streaming) authorization', () => {
  const channel = {
    send: async () => {},
    close: async () => {},
  } as any

  test('rejects when the agent permissions deny', async () => {
    const resolved = setup('stream-denied')
    addAgent('stream-denied', {
      permissions: { denied: async () => false },
    } as Partial<CoreAIAgent>)

    await assert.rejects(
      () =>
        resumeAIAgent(
          { runId: RUN_ID, toolCallId: TOOL_CALL_ID, approved: true },
          channel,
          { sessionService: sessionService({ userId: 'u1' }) } as any
        ),
      ForbiddenError
    )
    assert.deepEqual(resolved, [])
  })

  test('rejects when a required scope is no longer held', async () => {
    setup('stream-scoped')
    addAgent('stream-scoped', { scopes: ['admin:refund'] })

    await assert.rejects(
      () =>
        resumeAIAgent(
          { runId: RUN_ID, toolCallId: TOOL_CALL_ID, approved: true },
          channel,
          {
            sessionService: sessionService({
              userId: 'u1',
              scopes: ['support'],
            }),
          } as any
        ),
      MissingScopeError
    )
  })
})
