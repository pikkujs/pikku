import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHttpPersonas } from './http-personas.js'
import { wirePersonaSignIn } from '../wirings/persona/wire-persona-sign-in.js'
import { resetPikkuState } from '../pikku-state.js'
import type { ResolvedPersona } from './personas-service.js'

const susan = {
  id: 'susan',
  name: 'Susan',
  email: 'susan@actors.local',
} as ResolvedPersona
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

test('a wired sign-in logs the persona in, and its headers are optional', async () => {
  const seen: string[] = []
  wirePersonaSignIn(() => ({ login: async (_jar, p) => void seen.push(p.id) }))
  const personas = createHttpPersonas({
    apiUrl: 'http://app.test/api',
    personas: { susan },
  })
  await personas.susan!.invokeRaw('ping', {})
  assert.deepEqual(seen, ['susan'])
  wirePersonaSignIn(() => ({
    login: async () => {},
    headers: () => ({ 'x-as': 'susan' }),
  }))
  await createHttpPersonas({
    apiUrl: 'http://app.test/api',
    personas: { susan },
  }).susan!.invokeRaw('ping', {})
  assert.equal(requests.at(-1)!.get('x-as'), 'susan')
})

test('a wired sign-in together with a secret is refused', () => {
  wirePersonaSignIn(() => ({ login: async () => {} }))
  assert.throws(
    () =>
      createHttpPersonas({
        apiUrl: 'http://app.test/api',
        secret: 'shh',
        personas: { susan },
      }),
    /replaces secret/
  )
})
