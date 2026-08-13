import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { ScopedCredentialService } from './scoped-credential-service.js'
import type { CredentialService } from './credential-service.js'

const createCredentialService = (): CredentialService => {
  const store: Record<string, Record<string, unknown>> = {
    'user-1': { slack: 'slack-token', stripe: 'stripe-key' },
    'user-2': { slack: 'other-slack-token' },
  }
  return {
    get: async (name, userId = 'user-1') =>
      (store[userId]?.[name] ?? null) as never,
    set: async (name, value, userId = 'user-1') => {
      store[userId] = { ...store[userId], [name]: value }
    },
    delete: async (name, userId = 'user-1') => {
      delete store[userId]?.[name]
    },
    has: async (name, userId = 'user-1') => name in (store[userId] ?? {}),
    getAll: async (userId) => store[userId] ?? {},
    getUsersWithCredential: async (name) =>
      Object.keys(store).filter((userId) => name in store[userId]!),
    getAllUsers: async () => Object.keys(store),
  }
}

const scoped = (names: string[]) =>
  new ScopedCredentialService(createCredentialService(), new Set(names))

describe('ScopedCredentialService', () => {
  test('a declared credential is readable and writable', async () => {
    const credentials = scoped(['slack'])

    assert.equal(await credentials.get('slack'), 'slack-token')
    assert.equal(await credentials.has('slack'), true)
    await credentials.set('slack', 'refreshed')
    assert.equal(await credentials.get('slack'), 'refreshed')
    await credentials.delete('slack')
    assert.equal(await credentials.get('slack'), null)
  })

  test('an undeclared credential is denied on every accessor', async () => {
    const credentials = scoped(['slack'])

    await assert.rejects(() => credentials.get('stripe'), /denied/i)
    await assert.rejects(() => credentials.has('stripe'), /denied/i)
    await assert.rejects(() => credentials.set('stripe', 'x'), /denied/i)
    await assert.rejects(() => credentials.delete('stripe'), /denied/i)
    await assert.rejects(
      () => credentials.getUsersWithCredential('stripe'),
      /denied/i
    )
  })

  test('getAll returns only the declared credentials, not the whole user', async () => {
    const credentials = scoped(['slack'])

    assert.deepEqual(await credentials.getAll('user-1'), {
      slack: 'slack-token',
    })
  })

  test('enumerating every user of the app is denied outright', async () => {
    const credentials = scoped(['slack'])

    await assert.rejects(() => credentials.getAllUsers(), /denied/i)
  })

  test('the users of a declared credential are still visible', async () => {
    const credentials = scoped(['slack'])

    assert.deepEqual(await credentials.getUsersWithCredential('slack'), [
      'user-1',
      'user-2',
    ])
  })

  test('an addon that declares nothing reaches nothing', async () => {
    const credentials = scoped([])

    await assert.rejects(() => credentials.get('slack'), /denied/i)
    assert.deepEqual(await credentials.getAll('user-1'), {})
  })
})
