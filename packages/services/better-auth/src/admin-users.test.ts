import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  createAuthUser,
  deleteAuthUser,
  revokeAuthUserSessions,
  sendAuthUserSignInLink,
  setAuthUserPassword,
} from './admin-users.js'

const authWith = (
  internalAdapter: Record<string, any>,
  context: Record<string, any> = {}
) => {
  const calls: string[] = []
  const traced = Object.fromEntries(
    Object.entries(internalAdapter).map(([name, fn]) => [
      name,
      async (...args: any[]) => {
        calls.push(name)
        return fn(...args)
      },
    ])
  )
  const auth = async () =>
    ({
      $context: {
        password: {
          config: { minPasswordLength: 8, maxPasswordLength: 128 },
          hash: async (password: string) => `hashed:${password}`,
        },
        internalAdapter: traced,
        ...context,
      },
    }) as any
  return { auth, calls }
}

describe('createAuthUser', () => {
  test('an empty password is checked against the policy, not treated as absent', async () => {
    const { auth, calls } = authWith({
      findUserByEmail: async () => null,
      createUser: async () => ({ id: 'user-1' }),
      linkAccount: async () => undefined,
      deleteUser: async () => undefined,
    })

    await assert.rejects(
      createAuthUser(auth, { email: 'a@b.com', password: '' }),
      /at least 8 characters/
    )
    assert.deepEqual(calls, [])
  })

  test('an omitted password creates a user with no credential account', async () => {
    const { auth, calls } = authWith({
      findUserByEmail: async () => null,
      createUser: async () => ({ id: 'user-1' }),
      linkAccount: async () => undefined,
      deleteUser: async () => undefined,
    })

    assert.equal(await createAuthUser(auth, { email: 'A@B.com' }), 'user-1')
    assert.deepEqual(calls, ['findUserByEmail', 'createUser'])
  })

  test('a failed account link removes the user it was for', async () => {
    const { auth, calls } = authWith({
      findUserByEmail: async () => null,
      createUser: async () => ({ id: 'user-1' }),
      linkAccount: async () => {
        throw new Error('link exploded')
      },
      deleteUser: async () => undefined,
    })

    await assert.rejects(
      createAuthUser(auth, { email: 'a@b.com', password: 'longenough' }),
      /link exploded/
    )
    assert.deepEqual(calls, [
      'findUserByEmail',
      'createUser',
      'linkAccount',
      'deleteUser',
    ])
  })

  test('a failed cleanup reports the user it could not remove', async () => {
    const { auth } = authWith({
      findUserByEmail: async () => null,
      createUser: async () => ({ id: 'user-1' }),
      linkAccount: async () => {
        throw new Error('link exploded')
      },
      deleteUser: async () => {
        throw new Error('delete exploded')
      },
    })

    await assert.rejects(
      createAuthUser(auth, { email: 'a@b.com', password: 'longenough' }),
      /user user-1 could not be removed/
    )
  })
})

describe('credential accounts across better-auth schema versions', () => {
  test('a legacy schema is linked without an issuer it has no column for', async () => {
    let linked: any
    const { auth } = authWith(
      {
        findUserByEmail: async () => null,
        createUser: async () => ({ id: 'user-1' }),
        linkAccount: async (account: any) => {
          linked = account
        },
        deleteUser: async () => undefined,
      },
      { tables: { account: { fields: {} } } }
    )

    await createAuthUser(auth, { email: 'a@b.com', password: 'longenough' })

    // Before 1.7 the column does not exist and writing it fails the insert.
    assert.equal('issuer' in linked, false)
    assert.equal(linked.accountId, 'user-1')
  })

  test('an issuer-aware schema is linked with the credential issuer', async () => {
    let linked: any
    const { auth } = authWith(
      {
        findUserByEmail: async () => null,
        createUser: async () => ({ id: 'user-1' }),
        linkAccount: async (account: any) => {
          linked = account
        },
        deleteUser: async () => undefined,
      },
      { tables: { account: { fields: { issuer: {} } } } }
    )

    await createAuthUser(auth, { email: 'a@b.com', password: 'longenough' })

    // From 1.7 sign-in filters on the issuer, so an account written without
    // one is invisible to every path that would use it.
    assert.equal(linked.issuer, 'local:credential')
    assert.equal(linked.accountId, 'user-1')
  })
})

describe('setAuthUserPassword', () => {
  const passwordContext = (
    accounts: any[],
    fields: Record<string, unknown>
  ) => {
    const updatedAccounts: Array<[string, any]> = []
    const passwords: Array<[string, string]> = []
    let created: any
    const { auth, calls } = authWith(
      {
        findUserById: async () => ({ id: 'user-1' }),
        findAccounts: async () => accounts,
        updateAccount: async (id: string, values: any) =>
          updatedAccounts.push([id, values]),
        updatePassword: async (userId: string, hashed: string) =>
          passwords.push([userId, hashed]),
        createAccount: async (account: any) => {
          created = account
        },
      },
      { tables: { account: { fields } } }
    )
    return {
      auth,
      calls,
      updatedAccounts,
      passwords,
      created: () => created,
    }
  }

  test('a missing user is refused before anything is written', async () => {
    const { auth, calls } = authWith({
      findUserById: async () => null,
      findAccounts: async () => [],
      createAccount: async () => undefined,
    })

    await assert.rejects(
      setAuthUserPassword(auth, {
        userId: 'user-1',
        newPassword: 'longenough',
      }),
      /User not found/
    )
    assert.deepEqual(calls, ['findUserById'])
  })

  test('a short password is refused before the user is even looked up', async () => {
    const { auth, calls } = authWith({
      findUserById: async () => ({ id: 'user-1' }),
      findAccounts: async () => [],
      createAccount: async () => undefined,
    })

    await assert.rejects(
      setAuthUserPassword(auth, { userId: 'user-1', newPassword: 'short' }),
      /at least 8 characters/
    )
    assert.deepEqual(calls, [])
  })

  test('a user with no credential account gets one created', async () => {
    const ctx = passwordContext([{ id: 'acc-1', providerId: 'google' }], {})

    await setAuthUserPassword(ctx.auth, {
      userId: 'user-1',
      newPassword: 'longenough',
    })

    assert.equal(ctx.created().accountId, 'user-1')
    assert.equal(ctx.created().providerId, 'credential')
    assert.equal(ctx.created().password, 'hashed:longenough')
    assert.equal('issuer' in ctx.created(), false)
  })

  test('a created credential account carries the issuer when the schema has one', async () => {
    const ctx = passwordContext([], { issuer: {} })

    await setAuthUserPassword(ctx.auth, {
      userId: 'user-1',
      newPassword: 'longenough',
    })

    assert.equal(ctx.created().issuer, 'local:credential')
    assert.equal(ctx.created().accountId, 'user-1')
  })

  test('an existing credential account has its password updated in place', async () => {
    const ctx = passwordContext(
      [{ id: 'acc-1', providerId: 'credential', issuer: 'local:credential' }],
      { issuer: {} }
    )

    await setAuthUserPassword(ctx.auth, {
      userId: 'user-1',
      newPassword: 'longenough',
    })

    assert.deepEqual(ctx.passwords, [['user-1', 'hashed:longenough']])
    assert.equal(ctx.created(), undefined)
  })

  test('a credential account written without an issuer is repaired', async () => {
    const ctx = passwordContext([{ id: 'acc-1', providerId: 'credential' }], {
      issuer: {},
    })

    await setAuthUserPassword(ctx.auth, {
      userId: 'user-1',
      newPassword: 'longenough',
    })

    // An account stamped by an older pikku is invisible to 1.7 sign-in until
    // its issuer matches what sign-in filters on.
    assert.deepEqual(ctx.updatedAccounts, [
      ['acc-1', { issuer: 'local:credential' }],
    ])
    assert.deepEqual(ctx.passwords, [['user-1', 'hashed:longenough']])
  })

  test('a matching issuer is left alone', async () => {
    const ctx = passwordContext(
      [{ id: 'acc-1', providerId: 'credential', issuer: 'local:credential' }],
      { issuer: {} }
    )

    await setAuthUserPassword(ctx.auth, {
      userId: 'user-1',
      newPassword: 'longenough',
    })

    assert.deepEqual(ctx.updatedAccounts, [])
  })

  test('a legacy schema never writes the column it does not have', async () => {
    const ctx = passwordContext([{ id: 'acc-1', providerId: 'credential' }], {})

    await setAuthUserPassword(ctx.auth, {
      userId: 'user-1',
      newPassword: 'longenough',
    })

    assert.deepEqual(ctx.updatedAccounts, [])
    assert.deepEqual(ctx.passwords, [['user-1', 'hashed:longenough']])
  })
})

describe('deleteAuthUser, revokeAuthUserSessions and sendAuthUserSignInLink', () => {
  const realAuth = async (plugins: any[] = []) => {
    const { betterAuth } = await import('better-auth')
    const { memoryAdapter } = await import('better-auth/adapters/memory')
    const db: Record<string, any[]> = {
      user: [],
      session: [],
      account: [],
      verification: [],
    }
    const auth = betterAuth({
      baseURL: 'http://localhost:3000',
      secret: 'a-test-secret-for-admin-users-0123456789',
      database: memoryAdapter(db),
      emailAndPassword: { enabled: true },
      plugins,
    })
    const signedUp = await auth.api.signUpEmail({
      body: { email: 'jane@example.com', password: 'password1234', name: 'J' },
    })
    return { auth, db, userId: signedUp.user.id, getAuth: async () => auth }
  }

  test('deleteAuthUser removes the user, its sessions and its accounts', async () => {
    const { db, userId, getAuth } = await realAuth()
    assert.equal(db.session!.length, 1)
    await deleteAuthUser(getAuth, userId)
    assert.equal(db.user!.length, 0)
    assert.equal(db.session!.length, 0)
    assert.equal(db.account!.length, 0)
  })

  test('deleteAuthUser refuses an unknown user', async () => {
    const { getAuth } = await realAuth()
    await assert.rejects(deleteAuthUser(getAuth, 'nobody'), /User not found/)
  })

  test('revokeAuthUserSessions signs the user out but keeps the account', async () => {
    const { db, userId, getAuth } = await realAuth()
    await revokeAuthUserSessions(getAuth, userId)
    assert.equal(db.session!.length, 0)
    assert.equal(db.user!.length, 1)
    assert.equal(db.account!.length, 1)
  })

  test('sendAuthUserSignInLink mails a magic link to a normalised address', async () => {
    const { magicLink } = await import('better-auth/plugins')
    const sent: Array<{ email: string; url: string }> = []
    const { getAuth } = await realAuth([
      magicLink({
        disableSignUp: true,
        sendMagicLink: async ({ email, url }) => {
          sent.push({ email, url })
        },
      }),
    ])
    await sendAuthUserSignInLink(getAuth, {
      email: '  Jane@Example.com ',
      callbackURL: '/welcome',
    })
    assert.equal(sent.length, 1)
    assert.equal(sent[0]!.email, 'jane@example.com')
    assert.match(sent[0]!.url, /callbackURL=%2Fwelcome/)
  })

  test('sendAuthUserSignInLink needs the magicLink plugin', async () => {
    const { getAuth } = await realAuth()
    await assert.rejects(
      sendAuthUserSignInLink(getAuth, { email: 'jane@example.com' }),
      /magicLink\(\) plugin/
    )
  })

  test('every operation refuses when better-auth is not wired', async () => {
    await assert.rejects(deleteAuthUser(undefined, 'u'), /services\.auth/)
    await assert.rejects(
      revokeAuthUserSessions(undefined, 'u'),
      /services\.auth/
    )
    await assert.rejects(
      sendAuthUserSignInLink(undefined, { email: 'a@b.c' }),
      /services\.auth/
    )
  })
})
