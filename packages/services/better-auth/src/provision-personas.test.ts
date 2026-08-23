import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { provisionPersonas } from './provision-personas.js'

const ENVIRONMENTS = {
  local: {},
  prod: { production: true },
}

const PERSONAS: Record<string, any> = {
  susan: {
    id: 'susan',
    name: 'Susan',
    email: 'susan@e2e.test',
    roles: ['report-viewer'],
  },
  mo: {
    id: 'mo',
    name: 'Mo',
    email: 'mo@e2e.test',
    roles: ['platform-admin'],
    disposition: 'accountable',
    environments: ['prod'],
  },
  target: {
    id: 'target',
    name: 'Target',
    email: 'target@e2e.test',
    roles: [],
  },
}

/**
 * A better-auth context over an in-memory user table, and a scope service over
 * an in-memory grant set — enough of both for the two questions provisioning
 * asks: does this address already belong to somebody, and does this account
 * already hold this role.
 */
const harness = (users: Array<Record<string, any>> = []) => {
  const grants = new Map<string, Set<string>>()
  const created: string[] = []
  const auth = async () =>
    ({
      $context: {
        internalAdapter: {
          findUserByEmail: async (email: string) => {
            const user = users.find((u) => u.email === email)
            return user ? { user } : null
          },
          createUser: async (values: Record<string, any>) => {
            const user = { id: `user-${users.length + 1}`, ...values }
            users.push(user)
            created.push(user.email)
            return user
          },
        },
      },
    }) as any

  const scopeService = {
    listUserRoles: async (userId: string) => [...(grants.get(userId) ?? [])],
    addUserToRole: async (userId: string, role: string) => {
      const held = grants.get(userId) ?? new Set<string>()
      held.add(role)
      grants.set(userId, held)
    },
  } as any

  const logs: string[] = []
  const logger = {
    info: (msg: string) => logs.push(msg),
    warn: (msg: string) => logs.push(msg),
  } as any

  const rolesOf = (email: string) => {
    const user = users.find((u) => u.email === email)
    return user ? [...(grants.get(user.id) ?? [])].sort() : []
  }

  return { auth, scopeService, logger, logs, users, created, rolesOf }
}

describe('provisionPersonas', () => {
  test('creates each account as an actor and grants the roles it declares', async () => {
    const h = harness()

    const result = await provisionPersonas(h, {
      personas: PERSONAS,
      environments: ENVIRONMENTS,
      environment: 'local',
    })

    assert.deepEqual(h.created.sort(), ['susan@e2e.test', 'target@e2e.test'])
    assert.deepEqual(h.rolesOf('susan@e2e.test'), ['report-viewer'])
    assert.ok(h.users.every((u) => u.actor === true))
    assert.equal(result.created, 2)
    assert.equal(result.granted, 1)
  })

  // The rule that decides who may run decides who is provisioned. `mo` names
  // production and nothing else, so `local` is not theirs.
  test('skips a persona that does not act in this environment', async () => {
    const h = harness()

    const result = await provisionPersonas(h, {
      personas: PERSONAS,
      environments: ENVIRONMENTS,
      environment: 'local',
    })

    assert.ok(!h.created.includes('mo@e2e.test'))
    assert.equal(result.skipped.length, 1)
    assert.match(result.skipped[0]!, /persona 'mo'/)
  })

  test('provisions only the accountable persona into production', async () => {
    const h = harness()

    await provisionPersonas(h, {
      personas: PERSONAS,
      environments: ENVIRONMENTS,
      environment: 'prod',
    })

    assert.deepEqual(h.created, ['mo@e2e.test'])
    assert.deepEqual(h.rolesOf('mo@e2e.test'), ['platform-admin'])
  })

  // A deploy runs this on every boot, so the second one has to be a no-op
  // rather than a second account or a duplicate grant.
  test('running twice creates nothing new and grants nothing new', async () => {
    const h = harness()

    await provisionPersonas(h, {
      personas: PERSONAS,
      environments: ENVIRONMENTS,
      environment: 'local',
    })
    const second = await provisionPersonas(h, {
      personas: PERSONAS,
      environments: ENVIRONMENTS,
      environment: 'local',
    })

    assert.equal(second.created, 0)
    assert.equal(second.granted, 0)
    assert.equal(second.held, 1)
    assert.equal(h.users.length, 2)
  })

  // The one case where provisioning would hand a stranger's account an admin
  // grant.
  test('refuses an address held by a real user', async () => {
    const h = harness([{ id: 'a-real-person', email: 'susan@e2e.test' }])

    await assert.rejects(
      () =>
        provisionPersonas(h, {
          personas: { susan: PERSONAS.susan },
          environments: ENVIRONMENTS,
          environment: 'local',
        }),
      /is a real user here, not an actor/
    )
    assert.deepEqual(h.rolesOf('susan@e2e.test'), [])
  })

  // Nothing about an environment we cannot name is safe to assume, least of
  // all that it is not production.
  test('provisions nobody when no environment is resolved', async () => {
    const h = harness()

    const result = await provisionPersonas(h, {
      personas: PERSONAS,
      environments: ENVIRONMENTS,
      environment: undefined,
    })

    assert.deepEqual(h.created, [])
    assert.equal(result.skipped.length, 3)
  })

  test('a project with no personas never asks for the auth context', async () => {
    const logs: string[] = []
    const result = await provisionPersonas(
      {
        auth: undefined as any,
        scopeService: {} as any,
        logger: { info: (m: string) => logs.push(m), warn: () => {} } as any,
      },
      { personas: {}, environments: ENVIRONMENTS, environment: 'local' }
    )

    assert.deepEqual(result, { created: 0, granted: 0, held: 0, skipped: [] })
    assert.deepEqual(logs, [])
  })

  test('a project with personas and no better-auth says so', async () => {
    await assert.rejects(
      () =>
        provisionPersonas(
          {
            auth: undefined as any,
            scopeService: {} as any,
            logger: { info: () => {}, warn: () => {} } as any,
          },
          {
            personas: PERSONAS,
            environments: ENVIRONMENTS,
            environment: 'local',
          }
        ),
      /requires better-auth to be wired/
    )
  })
})
