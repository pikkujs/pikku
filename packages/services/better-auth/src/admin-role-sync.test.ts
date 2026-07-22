import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { CoreServices } from '@pikku/core'
import { ADMIN_SCOPES, ADMIN_SCOPE_ROOT } from './auth-scopes.js'
import { syncProjectedAdminRole } from './admin-role-sync.js'

type Updated = { userId: string; data: Record<string, any> }

const servicesWith = (
  plugins: Array<{ id?: string; options?: any }>,
  updates: Updated[],
  logger: any = { info() {}, warn() {} }
) =>
  ({
    logger,
    auth: async () => ({
      options: { plugins },
      $context: Promise.resolve({
        internalAdapter: {
          updateUser: async (userId: string, data: Record<string, any>) => {
            updates.push({ userId, data })
            return { id: userId, ...data }
          },
        },
      }),
    }),
  }) as unknown as CoreServices

const withAdminPlugin = (updates: Updated[], options?: any) =>
  servicesWith([{ id: 'bearer' }, { id: 'admin', options }], updates)

describe('syncProjectedAdminRole', () => {
  test('promotes a user holding a user-management scope', async () => {
    const updates: Updated[] = []
    await syncProjectedAdminRole(
      withAdminPlugin(updates),
      { id: 'u1', role: 'user' },
      [ADMIN_SCOPES.usersBan]
    )

    assert.deepEqual(updates, [{ userId: 'u1', data: { role: 'admin' } }])
  })

  test('the umbrella admin grant promotes via the parent-grant rule', async () => {
    const updates: Updated[] = []
    await syncProjectedAdminRole(
      withAdminPlugin(updates),
      { id: 'u1', role: 'user' },
      [ADMIN_SCOPE_ROOT]
    )

    assert.deepEqual(updates, [{ userId: 'u1', data: { role: 'admin' } }])
  })

  // The whole point of projecting from the user-management subtree rather than
  // from `admin:*`: being trusted to act as someone, or to read the directory,
  // must not hand over the ability to ban and delete people.
  test('impersonation alone does not promote', async () => {
    const updates: Updated[] = []
    await syncProjectedAdminRole(
      withAdminPlugin(updates),
      { id: 'u1', role: 'user' },
      [ADMIN_SCOPES.impersonate]
    )

    assert.deepEqual(updates, [])
  })

  test('reading the directory alone does not promote', async () => {
    const updates: Updated[] = []
    await syncProjectedAdminRole(
      withAdminPlugin(updates),
      { id: 'u1', role: 'user' },
      [ADMIN_SCOPES.usersList]
    )

    assert.deepEqual(updates, [])
  })

  // Creating a user runs through better-auth's own createUser endpoint, which
  // checks the *caller's* role — unlike the directory read, which goes straight
  // to the adapter. Without the projection the endpoint refuses the very caller
  // pikku just authorized.
  test('creating a user promotes, because better-auth gates that endpoint', async () => {
    const updates: Updated[] = []
    await syncProjectedAdminRole(
      withAdminPlugin(updates),
      { id: 'u1', role: 'user' },
      [ADMIN_SCOPES.usersCreate]
    )

    assert.deepEqual(updates, [
      { userId: 'u1', data: { role: ADMIN_SCOPE_ROOT } },
    ])
  })

  test('demotes a user whose grant was revoked', async () => {
    const updates: Updated[] = []
    await syncProjectedAdminRole(withAdminPlugin(updates), {
      id: 'u1',
      role: 'admin',
    })

    assert.deepEqual(updates, [{ userId: 'u1', data: { role: 'user' } }])
  })

  test('demotes to a configured defaultRole rather than better-auth’s', async () => {
    const updates: Updated[] = []
    await syncProjectedAdminRole(
      withAdminPlugin(updates, { defaultRole: 'member' }),
      { id: 'u1', role: 'admin' }
    )

    assert.deepEqual(updates, [{ userId: 'u1', data: { role: 'member' } }])
  })

  // The steady state has to be free, or this turns every authenticated request
  // into a write.
  test('writes nothing when the column already agrees', async () => {
    const updates: Updated[] = []
    await syncProjectedAdminRole(
      withAdminPlugin(updates),
      { id: 'u1', role: 'admin' },
      [ADMIN_SCOPES.usersRemove]
    )
    await syncProjectedAdminRole(withAdminPlugin(updates), {
      id: 'u2',
      role: 'user',
    })

    assert.deepEqual(updates, [])
  })

  test('treats a null role as the default rather than a mismatch', async () => {
    const updates: Updated[] = []
    await syncProjectedAdminRole(withAdminPlugin(updates), {
      id: 'u1',
      role: null,
    })

    assert.deepEqual(updates, [])
  })

  // An app with no admin() plugin has no role column at all; writing to it
  // would fail, so detection has to gate the whole thing.
  test('is inert when the admin plugin is not wired', async () => {
    const updates: Updated[] = []
    await syncProjectedAdminRole(
      servicesWith([{ id: 'bearer' }], updates),
      { id: 'u1', role: 'user' },
      [ADMIN_SCOPE_ROOT]
    )

    assert.deepEqual(updates, [])
  })

  test('is inert without a user', async () => {
    const updates: Updated[] = []
    await syncProjectedAdminRole(withAdminPlugin(updates), undefined, [
      ADMIN_SCOPE_ROOT,
    ])

    assert.deepEqual(updates, [])
  })

  // A stale column means better-auth refuses the caller, which is the safe
  // direction. Failing the request instead would turn drift into an outage.
  test('swallows and logs a write failure', async () => {
    const warnings: string[] = []
    const services = {
      logger: { info() {}, warn: (m: string) => warnings.push(m) },
      auth: async () => ({
        options: { plugins: [{ id: 'admin' }] },
        $context: Promise.resolve({
          internalAdapter: {
            updateUser: async () => {
              throw new Error('column "role" does not exist')
            },
          },
        }),
      }),
    } as unknown as CoreServices

    await syncProjectedAdminRole(services, { id: 'u1', role: 'user' }, [
      ADMIN_SCOPE_ROOT,
    ])

    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /could not project admin role for u1/)
  })
})
