import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MissingScopeError } from '#pikku/addon/error'
import { verifyScopes } from '@pikku/core/scope'

import { SecretAdminService } from '../services/secret-admin.service.js'
import { getAddonInstances } from './get-addon-instances.function.js'
import { getInstalledAddons } from './get-installed-addons.function.js'
import { getMyAccess } from './get-my-access.function.js'
import { getScorers } from './get-scorers.function.js'
import { secretGet } from './secret-get.function.js'
import { secretHas } from './secret-has.function.js'

test('getMyAccess returns only the caller own session', async () => {
  const out = await getMyAccess.func(
    {} as never,
    null as never,
    { session: { userId: 'alice', scopes: ['admin:users:list'] } } as never
  )
  assert.deepEqual(out, { userId: 'alice', scopes: ['admin:users:list'] })
})

test('getMyAccess reads empty for a session with no user', async () => {
  const out = await getMyAccess.func(
    {} as never,
    null as never,
    { session: {} } as never
  )
  assert.deepEqual(out, { userId: '', scopes: [] })
})

test('getMyAccess and getScorers declare no scope', () => {
  assert.equal(getMyAccess.scopes, undefined)
  assert.equal(getScorers.scopes, undefined)
})

for (const [name, fn] of [
  ['getInstalledAddons', getInstalledAddons],
  ['getAddonInstances', getAddonInstances],
] as const) {
  test(`${name} refuses a caller with no session`, () => {
    assert.throws(() => verifyScopes(fn.scopes, undefined), MissingScopeError)
  })
  test(`${name} refuses a holder of only a secrets scope`, () => {
    assert.throws(
      () =>
        verifyScopes(fn.scopes, {
          userId: 'alice',
          scopes: ['admin:secrets:read'],
        }),
      MissingScopeError
    )
  })
  test(`${name} admits admin:addons:read and the admin root`, () => {
    for (const scopes of [['admin:addons:read'], ['admin']]) {
      assert.doesNotThrow(() =>
        verifyScopes(fn.scopes, { userId: 'root', scopes })
      )
    }
  })
}

test('getInstalledAddons survives a host with no metaService', async () => {
  const out = await getInstalledAddons.func(
    {} as never,
    null as never,
    {} as never
  )
  assert.ok(Array.isArray(out))
})

test('getAddonInstances lists nothing for a package that is not wired', async () => {
  const out = await getAddonInstances.func(
    {} as never,
    { packageName: '@nope/not-wired' } as never,
    {} as never
  )
  assert.deepEqual(out, [])
})

test('getScorers lists declared scorers with the agents that name them', async () => {
  const out = await getScorers.func({} as never, undefined as never, {} as never)
  assert.ok(Array.isArray(out))
})

const secretsStub = (store: Record<string, unknown>) =>
  ({
    hasSecret: async (k: string) => k in store,
    getSecret: async (k: string) => ({ reveal: () => store[k] }),
    setSecret: async () => {},
  }) as never

test('secretHas never returns the value', async () => {
  const secretAdminService = new SecretAdminService(
    secretsStub({ KEY: 'sk_live' })
  )
  const out = await secretHas.func(
    { secretAdminService } as never,
    { secretId: 'KEY' } as never,
    {} as never
  )
  assert.deepEqual(out, { exists: true })
})

test('secretGet reveals the value, and reads a missing one as absent', async () => {
  const secretAdminService = new SecretAdminService(
    secretsStub({ KEY: 'sk_live' })
  )
  const svc = { secretAdminService } as never
  assert.deepEqual(
    await secretGet.func(svc, { secretId: 'KEY' } as never, {} as never),
    { exists: true, value: 'sk_live' }
  )
  assert.deepEqual(
    await secretGet.func(svc, { secretId: 'NOPE' } as never, {} as never),
    { exists: false, value: null }
  )
})
