import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHttpVirtualUsers } from './http-virtual-users.js'
import { wireVirtualUserSignIn } from '../wirings/virtual-user/wire-virtual-user-sign-in.js'
import { resetPikkuState } from '../pikku-state.js'
import type { ResolvedVirtualUser } from './virtual-users-service.js'

const susan = {
  id: 'susan',
  name: 'Susan',
  email: 'susan@virtualuser.invalid',
} as ResolvedVirtualUser
const realFetch = globalThis.fetch
let requests: Headers[] = []

beforeEach(() => {
  requests = []
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    requests.push(new Headers(init?.headers))
    return new Response('{}', { status: 200 })
  }) as typeof fetch
})
afterEach(() => {
  globalThis.fetch = realFetch
  resetPikkuState()
})

test('a wired sign-in logs the virtual user in, and its headers are optional', async () => {
  const seen: string[] = []
  wireVirtualUserSignIn(() => ({
    login: async (_jar, u) => void seen.push(u.id),
  }))
  const virtualUsers = createHttpVirtualUsers({
    apiUrl: 'http://app.test/api',
    virtualUsers: { susan },
  })
  await virtualUsers.susan!.invokeRaw('ping', {})
  assert.deepEqual(seen, ['susan'])
  wireVirtualUserSignIn(() => ({
    login: async () => {},
    headers: () => ({ 'x-as': 'susan' }),
  }))
  await createHttpVirtualUsers({
    apiUrl: 'http://app.test/api',
    virtualUsers: { susan },
  }).susan!.invokeRaw('ping', {})
  assert.equal(requests.at(-1)!.get('x-as'), 'susan')
})

test('a wired sign-in together with a secret is refused', () => {
  wireVirtualUserSignIn(() => ({ login: async () => {} }))
  assert.throws(
    () =>
      createHttpVirtualUsers({
        apiUrl: 'http://app.test/api',
        secret: 'shh',
        virtualUsers: { susan },
      }),
    /replaces secret/
  )
})
