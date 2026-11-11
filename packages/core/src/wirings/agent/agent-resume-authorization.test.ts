import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  resetPikkuState,
  pikkuState,
  setSingletonServices,
  getSingletonServices,
} from '../../pikku-state.js'
import { resumeAgentSync } from './agent-runner.js'
import { resumeAgent } from './agent-stream.js'
import { clearPermissionsCache } from '../../permissions.js'
import {
  ForbiddenError,
  MissingScopeError,
  MissingSessionError,
  NotFoundError,
} from '../../errors/errors.js'
import { rpcService } from '../rpc/rpc-runner.js'
import { createAgentRPC } from './agent-rpc.js'
import type { CoreAgent } from './agent.types.js'
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
    agentRunState: {
      getRun: async () => suspendedRun(agentName, resourceId),
      resolveApproval: async (toolCallId: string) => {
        resolved.push(toolCallId)
        return true
      },
    },
  } as any)
  return resolved
}

const addAgent = (
  agentName: string,
  overrides: Partial<CoreAgent> = {}
): CoreAgent => {
  const agent: CoreAgent = {
    name: agentName,
    description: `${agentName} description`,
    goal: `${agentName} goal`,
    model: 'test/test-model',
    ...overrides,
  } as CoreAgent

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

describe('resumeAgentSync authorization', () => {
  test('rejects when the agent permissions deny', async () => {
    const resolved = setup('denied-agent')
    addAgent('denied-agent', {
      permissions: { denied: async () => false },
    } as Partial<CoreAgent>)

    await assert.rejects(
      () =>
        resumeAgentSync(
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
        resumeAgentSync(
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

    await assert.rejects(
      () =>
        resumeAgentSync(
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
        resumeAgentSync(
          RUN_ID,
          [{ toolCallId: TOOL_CALL_ID, approved: true }],
          { sessionService: sessionService(undefined) } as any
        ),
      ForbiddenError
    )
  })
})

describe('resumeAgent (streaming) authorization', () => {
  const channel = {
    send: async () => {},
    close: async () => {},
  } as any

  test('rejects when the agent permissions deny', async () => {
    const resolved = setup('stream-denied')
    addAgent('stream-denied', {
      permissions: { denied: async () => false },
    } as Partial<CoreAgent>)

    await assert.rejects(
      () =>
        resumeAgent(
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
        resumeAgent(
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

describe('the owner gate on approve and resume', () => {
  const answer = { toolCallId: TOOL_CALL_ID, approved: true }
  const channel = { send: async () => {}, close: async () => {} } as any
  const paramsFor = (session?: CoreUserSession) =>
    ({ sessionService: sessionService(session) }) as any

  beforeEach(() => {
    resetPikkuState()
    clearPermissionsCache()
    addAgent('owned')
    setup('owned', 'owner')
  })

  for (const [label, session] of [
    ['another user', { userId: 'someone-else' }],
    ['no session', undefined],
  ] as const) {
    test(`resume refuses ${label}`, async () => {
      await assert.rejects(
        () =>
          resumeAgent(
            { runId: RUN_ID, ...answer },
            channel,
            paramsFor(session as CoreUserSession | undefined)
          ),
        ForbiddenError
      )
    })
  }

  describe('through the exposed entry, a route for another agent', () => {
    const exposed = (userId: string) =>
      createAgentRPC(
        { channel } as any,
        { sessionService: sessionService({ userId }) } as any,
        true
      )

    beforeEach(() => addAgent('other', { expose: true }))

    test('refuses the owner, who is told it is the wrong agent', async () => {
      await assert.rejects(
        () =>
          exposed('owner').resume(RUN_ID, {
            ...answer,
            expectedAgentName: 'other',
          }),
        { name: 'ForbiddenError', message: /does not belong to this agent/ }
      )
    })

    test('refuses a stranger with the ownership message, not the agent mismatch', async () => {
      await assert.rejects(
        () => exposed('stranger').approve(RUN_ID, [answer], 'other'),
        { name: 'ForbiddenError', message: 'Not authorized to access this run' }
      )
    })
  })
})

describe('rpc.exposedAgent is the external entry for an agent', () => {
  const exposedAgent = (services: any, wire: any = {}) =>
    rpcService.getContextRPCService(
      services,
      { channel: { send() {}, close() {} }, ...wire } as any,
      { sessionService: sessionService({ userId: 'u1' }) } as any,
      0
    ).exposedAgent
  const internalAgent = (services: any) =>
    rpcService.getContextRPCService(
      services,
      { channel: { send() {}, close() {} } } as any,
      { sessionService: sessionService({ userId: 'u1' }) } as any,
      0
    ).agent

  const input = { message: 'hi', threadId: 't', resourceId: 'u1' }
  const answer = { toolCallId: TOOL_CALL_ID, approved: true }

  const calls: Record<string, (name: string, services: any) => Promise<any>> = {
    run: (name, services) => exposedAgent(services).run(name, input),
    stream: (name, services) => exposedAgent(services).stream(name, input),
    approve: (name, services) =>
      exposedAgent(services).approve(RUN_ID, [answer], name),
    resume: (name, services) =>
      exposedAgent(services).resume(RUN_ID, {
        ...answer,
        expectedAgentName: name,
      }),
  }

  beforeEach(() => {
    resetPikkuState()
    clearPermissionsCache()
    // `resetPikkuState` clears what importing agent-rpc registered.
    pikkuState(null, 'agent', 'rpcFactory', createAgentRPC)
  })

  for (const [call, run] of Object.entries(calls)) {
    for (const name of ['hidden', 'hiddenPublic', 'nosuchagent']) {
      test(`${call} answers 404 for '${name}' and touches nothing`, async () => {
        const resolved = setup(name)
        addAgent('hidden')
        addAgent('hiddenPublic', { auth: false })
        await assert.rejects(
          () => run(name, getSingletonServices()),
          NotFoundError
        )
        assert.deepEqual(resolved, [])
      })
    }
  }

  test('approve and resume with no agent named are a 404, not a bypass', async () => {
    setup('exposed')
    addAgent('exposed', { expose: true })
    const rpc = exposedAgent(getSingletonServices())
    await assert.rejects(() => rpc.approve(RUN_ID, [answer]), NotFoundError)
    await assert.rejects(() => rpc.resume(RUN_ID, answer), NotFoundError)
  })

  test('an exposed agent is reached, and its own checks still decide', async () => {
    // Past the gate, the agent's own ownership check is what refuses.
    setup('exposed', 'someone-else')
    addAgent('exposed', { expose: true })
    await assert.rejects(
      () => calls.approve!('exposed', getSingletonServices()),
      ForbiddenError
    )
    await assert.rejects(
      () => calls.resume!('exposed', getSingletonServices()),
      ForbiddenError
    )
  })

  test('interrupt is not offered to a route', async () => {
    setup('exposed')
    addAgent('exposed', { expose: true })
    await assert.rejects(
      () => exposedAgent(getSingletonServices()).interrupt(RUN_ID),
      NotFoundError
    )
  })

  test('rpc.agent still reaches an agent that is not exposed', async () => {
    // The same run, refused by ownership rather than by the expose gate.
    setup('hidden', 'someone-else')
    addAgent('hidden')
    await assert.rejects(
      () =>
        internalAgent(getSingletonServices()).approve(
          RUN_ID,
          [answer],
          'hidden'
        ),
      ForbiddenError
    )
  })
})
