/**
 * Run: node --test packages/frontend/react/src/dev-actors.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDevActors,
  parseDevActorSecrets,
  signInAsActor,
} from './dev-actors.ts'

test('parseDevActors reads the JSON list the dev server bakes in', () => {
  const raw = JSON.stringify([
    {
      key: 'admin',
      email: 'admin@actors.example',
      name: 'Admin',
      jobTitle: 'Runs it',
    },
    {
      key: 'client',
      email: 'client@actors.example',
      name: 'Client',
      jobTitle: '',
    },
  ])
  const actors = parseDevActors(raw)
  assert.equal(actors.length, 2)
  assert.equal(actors[0]!.email, 'admin@actors.example')
})

test('parseDevActors yields an empty list for anything unusable', () => {
  // A broken dev affordance must never take the login screen down with it, so
  // every one of these is an empty list rather than a throw.
  for (const raw of [
    undefined,
    null,
    '',
    'not json',
    '{"key":"admin"}', // object, not an array
    '[]',
    42,
  ]) {
    assert.deepEqual(
      parseDevActors(raw),
      [],
      `unexpected parse of ${String(raw)}`
    )
  }
})

test('parseDevActors drops entries missing the fields the switcher needs', () => {
  const raw = JSON.stringify([
    { key: 'ok', email: 'ok@actors.example', name: 'Ok', jobTitle: '' },
    { key: 'no-email', name: 'Broken' },
    { email: 'no-key@actors.example' },
    // Both are drawn in the menu, so an entry without them is a row reading
    // "undefined" rather than an actor.
    { key: 'no-name', email: 'no-name@actors.example', jobTitle: 'Runs it' },
    {
      key: 'no-title',
      email: 'no-title@actors.example',
      name: 'No Title',
    },
    {
      key: 'wrong-types',
      email: 'wrong-types@actors.example',
      name: 42,
      jobTitle: null,
    },
    null,
  ])
  assert.deepEqual(
    parseDevActors(raw).map((a) => a.key),
    ['ok']
  )
})

test('signInAsActor posts that address own credential to the actor endpoint', async () => {
  let seen: { url: string; init: RequestInit } | null = null
  const original = globalThis.fetch
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen = { url, init }
    return { ok: true, status: 200 } as Response
  }) as unknown as typeof fetch

  try {
    await signInAsActor({
      apiUrl: 'http://localhost:5003/api',
      email: 'admin@actors.example',
      secret: 's3cret',
    })
  } finally {
    globalThis.fetch = original
  }

  assert.ok(seen)
  const { url, init } = seen as { url: string; init: RequestInit }
  assert.equal(url, 'http://localhost:5003/api/auth/sign-in/actor')
  assert.equal(init.method, 'POST')
  // Cookies must ride the request — the whole point is the session it sets.
  assert.equal(init.credentials, 'include')
  assert.deepEqual(JSON.parse(init.body as string), {
    email: 'admin@actors.example',
    secret: 's3cret',
  })
})

test('signInAsActor throws on a refused sign-in', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () =>
    ({ ok: false, status: 401 }) as Response) as unknown as typeof fetch
  try {
    await assert.rejects(
      signInAsActor({
        apiUrl: 'http://localhost:5003/api',
        email: 'real-user@example.com',
        secret: 'wrong',
      }),
      /401/
    )
  } finally {
    globalThis.fetch = original
  }
})

test('parseDevActorSecrets reads the credential map the dev server bakes in', () => {
  const raw = JSON.stringify({
    'admin@actors.example': 'admin-credential',
    'client@actors.example': 'client-credential',
  })
  assert.deepEqual(parseDevActorSecrets(raw), {
    'admin@actors.example': 'admin-credential',
    'client@actors.example': 'client-credential',
  })
})

test('parseDevActorSecrets takes an already-parsed map unchanged', () => {
  const map = { 'admin@actors.example': 'admin-credential' }
  assert.deepEqual(parseDevActorSecrets(map), map)
})

test('parseDevActorSecrets yields no credentials for anything unusable', () => {
  // Same reason as the actor list: a broken dev affordance renders nothing
  // rather than taking the login screen down.
  for (const raw of [undefined, null, '', 'not json', '[]', '"a string"', 42]) {
    assert.deepEqual(
      parseDevActorSecrets(raw),
      {},
      `unexpected parse of ${String(raw)}`
    )
  }
})

test('parseDevActorSecrets drops entries whose credential is not a string', () => {
  const raw = JSON.stringify({
    'ok@actors.example': 'a-credential',
    'broken@actors.example': 42,
    'also-broken@actors.example': null,
  })
  assert.deepEqual(parseDevActorSecrets(raw), {
    'ok@actors.example': 'a-credential',
  })
})
