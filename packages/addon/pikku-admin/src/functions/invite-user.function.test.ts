import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { pikkuState } from '@pikku/core/state'
import { inviteUser } from './invite-user.function.js'
import {
  InviteMailFailedError,
  InviteUnknownRoleError,
  InviteUserBannedError,
} from '../lib/invite-errors.js'

type Row = Record<string, any>

type FakeOptions = {
  users?: Row[]
  /** Makes the magic link send throw this error. */
  sendFails?: Error
  /** Leaves the magicLink plugin unwired. */
  noMagicLink?: boolean
}

/** One log for every write and send, so ordering is asserted directly. */
const fakeAuth = ({ users = [], sendFails, noMagicLink }: FakeOptions = {}) => {
  const log: string[] = []
  const ctx = {
    password: { config: { minPasswordLength: 8, maxPasswordLength: 128 } },
    internalAdapter: {
      findUserByEmail: async (email: string) => {
        const user = users.find((row) => row.email === email)
        return user ? { user } : null
      },
      createUser: async (values: Row) => {
        const user: Row = { id: `user-${users.length + 1}`, ...values }
        users.push(user)
        log.push(`create:${user.email}`)
        return user
      },
    },
  }
  const instance = {
    $context: Promise.resolve(ctx),
    api: noMagicLink
      ? {}
      : {
          signInMagicLink: async ({ body }: any) => {
            if (sendFails) {
              throw sendFails
            }
            log.push(`link:${body.email}`)
          },
        },
  }
  return { auth: (async () => instance) as any, users, log }
}

const fakeScopeService = (
  roles: Array<{ name: string; declared?: boolean }>,
  log: string[],
  held: Record<string, string[]> = {}
) => ({
  listRoles: async () => roles.map((role) => ({ scopes: [], ...role })),
  listUserRoles: async (userId: string) => held[userId] ?? [],
  addUserToRole: async (userId: string, role: string, grantedBy?: string) => {
    held[userId] = [...(held[userId] ?? []), role]
    log.push(`grant:${userId}:${role}:${grantedBy}`)
  },
})

const call = (
  services: any,
  data: any,
  session: any = { userId: 'admin-1', scopes: ['*'] }
) => (inviteUser as any).func(services, data, { session })

describe('admin inviteUser — the account', () => {
  test('creates a passwordless user for a new address, then sends the link', async () => {
    const { auth, users, log } = fakeAuth()

    const result = await call(
      { auth },
      { email: '  Ann@Example.COM ', name: 'Ann' }
    )

    assert.deepEqual(result, { userId: 'user-1', created: true })
    assert.deepEqual(log, ['create:ann@example.com', 'link:ann@example.com'])
    assert.equal(users[0].name, 'Ann')
  })

  test('reuses an existing account and only sends a new link', async () => {
    const { auth, log } = fakeAuth({
      users: [{ id: 'u-ann', email: 'ann@example.com' }],
    })

    const result = await call({ auth }, { email: 'ann@example.com' })

    assert.deepEqual(result, { userId: 'u-ann', created: false })
    assert.deepEqual(log, ['link:ann@example.com'])
  })

  test('calling it twice creates once and sends twice', async () => {
    const { auth, log } = fakeAuth()

    const first = await call({ auth }, { email: 'ann@example.com' })
    const second = await call({ auth }, { email: 'ANN@example.com' })

    assert.equal(first.created, true)
    assert.deepEqual(second, { userId: first.userId, created: false })
    assert.deepEqual(log, [
      'create:ann@example.com',
      'link:ann@example.com',
      'link:ann@example.com',
    ])
  })

  test('refuses something that is not an email, writing nothing', async () => {
    const { auth, log } = fakeAuth()

    await assert.rejects(
      () => call({ auth }, { email: 'not-an-email' }),
      /INVALID_EMAIL/
    )
    assert.deepEqual(log, [])
  })

  test('refuses a banned user without sending a link', async () => {
    const { auth, log } = fakeAuth({
      users: [{ id: 'u-ann', email: 'ann@example.com', banned: true }],
    })

    await assert.rejects(
      () => call({ auth }, { email: 'ann@example.com' }),
      InviteUserBannedError
    )
    assert.deepEqual(log, [])
  })

  test('invites a user whose ban has lapsed', async () => {
    const { auth, log } = fakeAuth({
      users: [
        {
          id: 'u-ann',
          email: 'ann@example.com',
          banned: true,
          banExpires: new Date(Date.now() - 60_000),
        },
      ],
    })

    const result = await call({ auth }, { email: 'ann@example.com' })

    assert.deepEqual(result, { userId: 'u-ann', created: false })
    assert.deepEqual(log, ['link:ann@example.com'])
  })
})

describe('admin inviteUser — the role', () => {
  test('is granted after the link, by the calling admin', async () => {
    const { auth, log } = fakeAuth()
    const scopeService = fakeScopeService([{ name: 'editor' }], log)

    await call({ auth, scopeService }, { email: 'a@x.io', role: 'editor' })

    assert.deepEqual(log, [
      'create:a@x.io',
      'link:a@x.io',
      'grant:user-1:editor:admin-1',
    ])
  })

  test('an unknown role is refused before anything is created', async () => {
    const { auth, users, log } = fakeAuth()
    const scopeService = fakeScopeService([{ name: 'editor' }], log)

    await assert.rejects(
      () => call({ auth, scopeService }, { email: 'a@x.io', role: 'owner' }),
      InviteUnknownRoleError
    )
    assert.deepEqual(log, [])
    assert.equal(users.length, 0)
  })

  test('a system role no longer declared counts as unknown', async () => {
    const { auth, log } = fakeAuth()
    const scopeService = fakeScopeService(
      [{ name: 'legacy', declared: false }],
      log
    )

    await assert.rejects(
      () => call({ auth, scopeService }, { email: 'a@x.io', role: 'legacy' }),
      InviteUnknownRoleError
    )
    assert.deepEqual(log, [])
  })

  test('needs admin:scopes:manage, checked before anything is created', async () => {
    const { auth, log } = fakeAuth()
    const scopeService = fakeScopeService([{ name: 'editor' }], log)

    await assert.rejects(
      () =>
        call(
          { auth, scopeService },
          { email: 'a@x.io', role: 'editor' },
          { userId: 'admin-1', scopes: ['admin:users:create'] }
        ),
      /admin:scopes:manage/
    )
    assert.deepEqual(log, [])
  })

  test('an invite without a role needs no scope beyond admin:users:create', async () => {
    const { auth } = fakeAuth()

    const result = await call(
      { auth },
      { email: 'a@x.io' },
      { userId: 'admin-1', scopes: ['admin:users:create'] }
    )

    assert.equal(result.created, true)
  })

  test('a host with no scope service refuses a role before creating anything', async () => {
    const { auth, log } = fakeAuth()

    await assert.rejects(
      () => call({ auth }, { email: 'a@x.io', role: 'editor' }),
      /MissingServiceError/
    )
    assert.deepEqual(log, [])
  })

  test('a re-invite adds a role not yet held and does not grant one twice', async () => {
    const { auth, log } = fakeAuth({
      users: [{ id: 'u-ann', email: 'ann@example.com' }],
    })
    const held: Record<string, string[]> = { 'u-ann': ['editor'] }
    const scopeService = fakeScopeService(
      [{ name: 'editor' }, { name: 'viewer' }],
      log,
      held
    )

    await call(
      { auth, scopeService },
      { email: 'ann@example.com', role: 'editor' }
    )
    await call(
      { auth, scopeService },
      { email: 'ann@example.com', role: 'viewer' }
    )

    assert.deepEqual(log, [
      'link:ann@example.com',
      'link:ann@example.com',
      'grant:u-ann:viewer:admin-1',
    ])
    assert.deepEqual(held['u-ann'], ['editor', 'viewer'])
  })
})

describe('admin inviteUser — when the link does not go out', () => {
  test('keeps the new user, grants no role and says MAIL_FAILED', async () => {
    const { auth, users, log } = fakeAuth({
      sendFails: new Error('smtp.internal:587 refused'),
    })
    const scopeService = fakeScopeService([{ name: 'editor' }], log)

    await assert.rejects(
      () => call({ auth, scopeService }, { email: 'a@x.io', role: 'editor' }),
      (error: Error) => {
        assert.ok(error instanceof InviteMailFailedError)
        assert.equal(
          error.message,
          'MAIL_FAILED: the sign-in link could not be sent',
          'the mailer own words are not passed on'
        )
        return true
      }
    )
    assert.equal(users.length, 1, 'the account stays, so a re-invite resends')
    assert.deepEqual(log, ['create:a@x.io'], 'no role without a link')
  })

  test('keeps better-auth wording when the magicLink plugin is missing', async () => {
    const { auth } = fakeAuth({ noMagicLink: true })

    await assert.rejects(
      () => call({ auth }, { email: 'a@x.io' }),
      /MAIL_FAILED: Sign-in links require the magicLink\(\) plugin/
    )
  })
})

describe('admin inviteUser — what a caller is answered', () => {
  // Every status is one a client can read the message from (below 500) and
  // none is 403, 404, 409 or 502-504, which clients read as not allowed,
  // missing function or app not running.
  const cases: Array<[Error, number, string]> = [
    [new InviteUserBannedError(), 422, 'USER_BANNED'],
    [new InviteUnknownRoleError('owner'), 400, 'UNKNOWN_ROLE'],
    [new InviteMailFailedError(new Error('x')), 422, 'MAIL_FAILED'],
  ]

  for (const [error, status, code] of cases) {
    test(`${code} answers ${status} with a message that starts with the code`, () => {
      const response = pikkuState(null, 'misc', 'errors').get(
        error.constructor as any
      )
      assert.equal(response?.status, status)
      assert.ok(response?.message.startsWith(`${code}:`))
      assert.ok(error.message.startsWith(`${code}:`))
    })
  }
})
