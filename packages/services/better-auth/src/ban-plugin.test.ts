import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { pikkuBan } from './ban-plugin.js'

const hook = (plugin: any) =>
  plugin.init().options.databaseHooks.session.create.before

const contextFor = (user: any) => {
  const updates: Array<[string, any]> = []
  return {
    updates,
    ctx: {
      context: {
        internalAdapter: {
          findUserById: async () => user,
          updateUser: async (id: string, data: any) => {
            updates.push([id, data])
          },
        },
      },
    },
  }
}

describe('ban plugin', () => {
  test('declares the three columns a ban lives in, and no role', () => {
    const fields = (pikkuBan().schema as any).user.fields
    assert.deepEqual(Object.keys(fields).sort(), [
      'banExpires',
      'banReason',
      'banned',
    ])
    assert.equal(fields.banned.defaultValue, false)
  })

  test('lets an unbanned user through', async () => {
    const { ctx, updates } = contextFor({ id: 'u1', banned: false })
    await hook(pikkuBan())({ userId: 'u1' }, ctx)
    assert.deepEqual(updates, [])
  })

  test('refuses a session for a banned user', async () => {
    const { ctx } = contextFor({ id: 'u1', banned: true })
    await assert.rejects(hook(pikkuBan())({ userId: 'u1' }, ctx), /banned/i)
  })

  test('the refusal carries the configured message', async () => {
    const { ctx } = contextFor({ id: 'u1', banned: true })
    await assert.rejects(
      hook(pikkuBan({ message: 'Talk to support' }))({ userId: 'u1' }, ctx),
      /Talk to support/
    )
  })

  // An expired ban is settled at the only moment it matters — the sign-in that
  // would otherwise be refused — rather than by a sweep that has to be run.
  test('an expired ban lapses and the session is allowed', async () => {
    const { ctx, updates } = contextFor({
      id: 'u1',
      banned: true,
      banExpires: new Date(Date.now() - 1000),
    })
    await hook(pikkuBan())({ userId: 'u1' }, ctx)
    assert.deepEqual(updates, [
      ['u1', { banned: false, banReason: null, banExpires: null }],
    ])
  })

  test('a ban that has not expired yet still holds', async () => {
    const { ctx, updates } = contextFor({
      id: 'u1',
      banned: true,
      banExpires: new Date(Date.now() + 60_000),
    })
    await assert.rejects(hook(pikkuBan())({ userId: 'u1' }, ctx), /banned/i)
    assert.deepEqual(updates, [])
  })

  // Without a request context there is nothing to read the user through, and a
  // server-minted session is not a sign-in to refuse.
  test('is inert without a context', async () => {
    assert.equal(await hook(pikkuBan())({ userId: 'u1' }, undefined), undefined)
  })
})
