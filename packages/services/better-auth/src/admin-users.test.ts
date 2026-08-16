import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createAuthUser } from './admin-users.js'

const authWith = (internalAdapter: Record<string, any>) => {
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
