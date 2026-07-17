import { Before, Given, When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { createAuthClient } from 'better-auth/client'
import { Actor } from '@pikku/cucumber'
import { config } from '../support/types.js'

// Drives the REAL Better Auth client SDK over real HTTP, the same way a browser
// would, rather than hand-rolling the link endpoints — the point of #844 is that
// better-auth owns this flow, so the test must exercise better-auth's own API.
//
// Each named user gets an Actor (from @pikku/cucumber) owning its own cookie
// jar; `cookieFetch` replays the session cookie and stamps Origin, which
// better-auth requires on state-changing POSTs.

interface LinkedUser {
  actor: Actor
  client: ReturnType<typeof createAuthClient>
  userId: string
}

const users = new Map<string, LinkedUser>()
let current: LinkedUser
let lastRedirectUrl: string | undefined

/**
 * The real better-auth id of a user created by `a signed-in user {string}`.
 * Other step files address users by name; the credential is keyed by the id.
 */
export const linkedUserId = (name: string) => {
  const user = users.get(name)
  if (!user) {
    throw new Error(
      `No signed-in user "${name}" — add a 'Given a signed-in user "${name}"' step first.`
    )
  }
  return user.userId
}

Before({ tags: '@credential-oauth-link' }, function () {
  users.clear()
  lastRedirectUrl = undefined
})

const makeClient = (actor: Actor) =>
  createAuthClient({
    baseURL: config.apiUrl,
    fetchOptions: { customFetchImpl: actor.cookieFetch },
  })

const signIn = async function (name: string) {
  const existing = users.get(name)
  if (existing) {
    current = existing
    return
  }

  const actor = new Actor(name, {}, config.apiUrl)
  const client = makeClient(actor)
  // Better Auth persists tables for the server's lifetime, so keep emails
  // unique per run rather than resetting shared state between scenarios.
  const email = `${name}-${Date.now()}@example.com`
  const { error } = await client.signUp.email({
    name,
    email,
    password: 'e2e-password',
  })
  expect(error, `sign-up failed for ${name}`).toBeFalsy()

  const { data: session } = await client.getSession()
  expect(session?.user?.id, `no session for ${name}`).toBeTruthy()

  current = { actor, client, userId: session!.user.id }
  users.set(name, current)
}

Given('a signed-in user {string}', signIn)

// The suite's auth config treats the user named 'root' as the one who may
// connect a platform-wide credential (see canLinkSingleton in auth.ts).
Given('a signed-in admin {string}', signIn)

const requestLink = (user: LinkedUser, providerId: string) =>
  user.actor.cookieFetch(`${config.apiUrl}/api/auth/credential-oauth/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId, callbackURL: config.apiUrl }),
  })

/** Ask better-auth to start the link and return its redirect target. */
const startLink = async (user: LinkedUser, providerId: string) => {
  const res = await requestLink(user, providerId)
  const body = await res.json()
  expect(
    res.status,
    `link failed for ${providerId}: ${JSON.stringify(body)}`
  ).toBe(200)
  return body.url as string | undefined
}

When(
  '{string} starts linking the {string} provider',
  async function (name: string, providerId: string) {
    lastRedirectUrl = await startLink(users.get(name)!, providerId)
  }
)

Then('the link response should redirect to the mock provider', function () {
  expect(lastRedirectUrl).toBeTruthy()
  expect(lastRedirectUrl).toContain('/authorize')
})

Then('the redirect should carry the declared scopes', function () {
  const scope = new URL(lastRedirectUrl!).searchParams.get('scope')
  // The scopes declared on the wireCredential, not better-auth's defaults.
  expect(scope).toContain('read')
  expect(scope).toContain('write')
})

When(
  '{string} links the {string} provider',
  async function (name: string, providerId: string) {
    const user = users.get(name)!
    const url = await startLink(user, providerId)
    expect(url, 'no authorize url returned').toBeTruthy()

    // The mock provider auto-approves and 302s to better-auth's callback; the
    // callback needs the same cookie jar to match its state cookie.
    const authorizeRes = await user.actor.cookieFetch(url!, {
      redirect: 'manual',
    })
    const callbackUrl = authorizeRes.headers.get('location')
    expect(callbackUrl, 'mock provider did not redirect back').toBeTruthy()

    const callbackRes = await user.actor.cookieFetch(callbackUrl!, {
      redirect: 'manual',
    })
    expect(
      callbackRes.status,
      `callback failed: ${callbackRes.status}`
    ).toBeLessThan(400)
  }
)

When(
  '{string} unlinks the {string} provider',
  async function (name: string, providerId: string) {
    const { error } = await users
      .get(name)!
      .client.unlinkAccount({ providerId })
    expect(error, `unlink failed for ${providerId}`).toBeFalsy()
  }
)

const linkedProviders = async (user: LinkedUser) => {
  const { data } = await user.client.listAccounts()
  return (data ?? []).map((a: any) => a.providerId as string)
}

Then(
  'the {string} account should be linked',
  async function (providerId: string) {
    expect(await linkedProviders(current)).toContain(providerId)
  }
)

Then(
  'the {string} account should not be linked',
  async function (providerId: string) {
    expect(await linkedProviders(current)).not.toContain(providerId)
  }
)

/**
 * Reads through credentialService.get(name, userId) — the seam addons use. This
 * is the assertion that matters: it proves a linked better-auth account is what
 * makes the credential resolve, with no parallel token store involved.
 */
const resolveCredential = async (name: string, userId: string) => {
  const res = await fetch(`${config.apiUrl}/rpc/getCredential`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { name, userId } }),
  })
  const body = await res.json()
  return body.valueJson as string | null
}

Then(
  'the credential {string} should resolve for {string}',
  async function (name: string, userName: string) {
    const value = await resolveCredential(name, users.get(userName)!.userId)
    expect(value, `credential ${name} did not resolve`).toBeTruthy()
  }
)

Then(
  'the credential {string} should still resolve for {string}',
  async function (name: string, userName: string) {
    const value = await resolveCredential(name, users.get(userName)!.userId)
    expect(value, `credential ${name} stopped resolving`).toBeTruthy()
  }
)

Then(
  'the credential {string} should not resolve for {string}',
  async function (name: string, userName: string) {
    const value = await resolveCredential(name, users.get(userName)!.userId)
    expect(value).toBeNull()
  }
)

let lastLinkStatus: number | undefined

When(
  '{string} tries to link the {string} provider',
  async function (name: string, providerId: string) {
    const res = await requestLink(users.get(name)!, providerId)
    lastLinkStatus = res.status
  }
)

Then('the link should be forbidden', function () {
  expect(lastLinkStatus).toBe(403)
})

/**
 * A platform credential is read with NO userId — that is what makes it the
 * platform's rather than any one user's.
 */
const resolvePlatformCredential = async (name: string) => {
  const res = await fetch(`${config.apiUrl}/rpc/getCredential`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { name } }),
  })
  const body = await res.json()
  return body.valueJson as string | null
}

Then(
  'the platform credential {string} should resolve',
  async function (name: string) {
    expect(
      await resolvePlatformCredential(name),
      `platform credential ${name} did not resolve`
    ).toBeTruthy()
  }
)

Then(
  'the platform credential {string} should not resolve',
  async function (name: string) {
    expect(await resolvePlatformCredential(name)).toBeNull()
  }
)

/**
 * Goes through credentialService.delete with no session anywhere — the seam an
 * admin console revokes through (console:credentialDelete), and the only seam a
 * platform credential can be disconnected through at all.
 */
const revokeCredential = async (name: string, userId?: string) => {
  const res = await fetch(`${config.apiUrl}/rpc/deleteCredential`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { name, userId } }),
  })
  const body = await res.json()
  expect(
    res.status,
    `revoke failed for ${name}: ${JSON.stringify(body)}`
  ).toBe(200)
  expect(body.success, `revoke did not report success for ${name}`).toBe(true)
}

When(
  'the credential {string} is revoked server-side for {string}',
  async function (name: string, userName: string) {
    await revokeCredential(name, users.get(userName)!.userId)
  }
)

When(
  'the platform credential {string} is revoked server-side',
  async function (name: string) {
    await revokeCredential(name)
  }
)

Then(
  'the resolved credential should carry an access token from the provider',
  async function () {
    const value = await resolveCredential('user-oauth', current.userId)
    const parsed = JSON.parse(value!)
    // The mock provider mints `mock-access-token`; anything else means the
    // token came from somewhere other than the real exchange.
    expect(parsed.accessToken).toContain('mock')
  }
)
