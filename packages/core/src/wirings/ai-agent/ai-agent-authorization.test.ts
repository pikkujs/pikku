import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  resetPikkuState,
  pikkuState,
  setSingletonServices,
} from '../../pikku-state.js'
import { assertAgentAuthorized } from './ai-agent-prepare.js'
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

beforeEach(() => {
  resetPikkuState()
  clearPermissionsCache()
  setSingletonServices({ logger } as any)
})

const addAgent = (
  agentName: string,
  overrides: Partial<CoreAIAgent> = {}
): CoreAIAgent => {
  const agent: CoreAIAgent = {
    name: agentName,
    description: `${agentName} description`,
    goal: `${agentName} goal`,
    instructions: `${agentName} instructions`,
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

describe('assertAgentAuthorized', () => {
  test('resolves when the agent declares no authorization and a session exists', async () => {
    const agent = addAgent('open')
    await assertAgentAuthorized(
      agent,
      { sessionService: sessionService({ userId: 'u1' }) },
      null
    )
  })

  test('does not require a session unless auth is explicitly true', async () => {
    const agent = addAgent('sessionless')
    await assertAgentAuthorized(
      agent,
      { sessionService: sessionService(undefined) },
      null
    )
  })

  test('resolves with no sessionService at all (cron / queue invocation)', async () => {
    const agent = addAgent('no-session-service')
    await assertAgentAuthorized(agent, {}, null)
  })

  test('throws ForbiddenError when auth is explicitly true and no session exists', async () => {
    const agent = addAgent('needs-session', { auth: true })
    await assert.rejects(
      () =>
        assertAgentAuthorized(
          agent,
          { sessionService: sessionService(undefined) },
          null
        ),
      ForbiddenError
    )
  })

  test('enforces scopes even when auth is not required', async () => {
    const agent = addAgent('scoped-sessionless', { scopes: ['reports:read'] })
    await assert.rejects(
      () => assertAgentAuthorized(agent, {}, null),
      MissingScopeError
    )
  })

  test('throws ForbiddenError when the permission group denies', async () => {
    const agent = addAgent('guarded', {
      permissions: { admin: async () => false },
    })
    await assert.rejects(
      () =>
        assertAgentAuthorized(
          agent,
          { sessionService: sessionService({ userId: 'u1' }) },
          null
        ),
      ForbiddenError
    )
  })

  test('resolves when at least one permission branch passes', async () => {
    const agent = addAgent('or-group', {
      permissions: {
        admin: async () => false,
        owner: async () => true,
      },
    })
    await assertAgentAuthorized(
      agent,
      { sessionService: sessionService({ userId: 'u1' }) },
      null
    )
  })

  test('passes the session through to permission functions', async () => {
    let seen: CoreUserSession | undefined
    const agent = addAgent('sees-session', {
      permissions: {
        admin: async (_services: any, _data: any, wire: any) => {
          seen = wire.session
          return true
        },
      },
    })
    await assertAgentAuthorized(
      agent,
      { sessionService: sessionService({ userId: 'u1' }) },
      null
    )
    assert.equal(seen?.userId, 'u1')
  })

  test('throws MissingScopeError when a required scope is not held', async () => {
    const agent = addAgent('scoped', { scopes: ['reports:read'] })
    await assert.rejects(
      () =>
        assertAgentAuthorized(
          agent,
          { sessionService: sessionService({ userId: 'u1', scopes: [] }) },
          null
        ),
      MissingScopeError
    )
  })

  test('resolves when the session holds the required scope', async () => {
    const agent = addAgent('scoped-ok', { scopes: ['reports:read'] })
    await assertAgentAuthorized(
      agent,
      {
        sessionService: sessionService({
          userId: 'u1',
          scopes: ['reports:read'],
        }),
      },
      null
    )
  })

  test('resolves when an ancestor scope grant covers the requirement', async () => {
    const agent = addAgent('scoped-parent', { scopes: ['reports:read'] })
    await assertAgentAuthorized(
      agent,
      {
        sessionService: sessionService({ userId: 'u1', scopes: ['reports'] }),
      },
      null
    )
  })

  test('checks scopes before permissions', async () => {
    let permissionRan = false
    const agent = addAgent('scope-first', {
      scopes: ['reports:read'],
      permissions: {
        admin: async () => {
          permissionRan = true
          return true
        },
      },
    })
    await assert.rejects(
      () =>
        assertAgentAuthorized(
          agent,
          { sessionService: sessionService({ userId: 'u1', scopes: [] }) },
          null
        ),
      MissingScopeError
    )
    assert.equal(permissionRan, false)
  })
})
