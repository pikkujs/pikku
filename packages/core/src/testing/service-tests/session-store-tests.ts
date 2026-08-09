import { describe, test, before } from 'node:test'
import assert from 'node:assert/strict'

import type { SessionStore } from '../../services/session-store.js'
import type { CoreUserSession } from '../../types/core.types.js'
import type { ServiceTestConfig } from '../service-tests.js'

type AppSession = CoreUserSession & Record<string, unknown>

/** Conformance suite for `sessionStore`. Runs only when a backend supplies one. */
export const defineSessionStoreTests = (
  name: string,
  sessionStore: NonNullable<ServiceTestConfig['services']['sessionStore']>
): void => {
  const factory = sessionStore
  describe(`SessionStore [${name}]`, () => {
    let store: SessionStore

    before(async () => {
      store = await factory()
    })

    test('get returns undefined for unknown user', async () => {
      const result = await store.get('unknown-user')
      assert.equal(result, undefined)
    })

    test('set and get round-trip', async () => {
      const session: AppSession = {
        userId: 'user-1',
        organizationId: 'org-1',
      }
      await store.set('user-1', session)

      const result = await store.get('user-1')
      assert.deepEqual(result, session)
    })

    test('set overwrites previous session', async () => {
      const asAdmin: AppSession = { userId: 'user-2', role: 'admin' }
      const asMember: AppSession = { userId: 'user-2', role: 'member' }
      await store.set('user-2', asAdmin)
      await store.set('user-2', asMember)

      const result = await store.get('user-2')
      assert.deepEqual(result, { userId: 'user-2', role: 'member' })
    })

    test('clear removes session', async () => {
      await store.set('user-3', { userId: 'user-3' })
      assert.ok(await store.get('user-3'))

      await store.clear('user-3')
      const result = await store.get('user-3')
      assert.equal(result, undefined)
    })

    test('clear is no-op for unknown user', async () => {
      await store.clear('nonexistent')
    })
  })
}
