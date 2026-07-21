import { Before, Given, When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { createAuthClient } from 'better-auth/client'
import { Actor } from '@pikku/cucumber'
import { config } from '../support/types.js'
import { ADMIN_USER, GUEST_USER } from '../../src/auth-fixtures.js'

// Drives the console addon's RPCs over real HTTP with a real Better Auth
// session cookie, the same way the console does — the point is to prove the
// addon's privileged surface is gated by the global admin permission, not to
// mock the check. The seeded admin/guest users are provisioned at server boot
// (src/lifecycle.ts → seedAuthUsers), the admin then granted the umbrella
// `admin` scope by seedScopes.

const accounts = { admin: ADMIN_USER, guest: GUEST_USER }

let actor: Actor
let lastStatus: number | undefined

Before({ tags: '@console-authz' }, function () {
  lastStatus = undefined
})

Given(
  'a signed-in console user with the seeded {string} account',
  async function (which: string) {
    const user = accounts[which as keyof typeof accounts]
    expect(user, `unknown seeded account "${which}"`).toBeTruthy()

    actor = new Actor(which, {}, config.apiUrl)
    const client = createAuthClient({
      baseURL: config.apiUrl,
      fetchOptions: { customFetchImpl: actor.cookieFetch },
    })
    // The seed users are created in afterStart (async, after the server is
    // already listening), so the very first scenario can outrun the seed's
    // sign-up. Retry a few times on invalid-credentials to absorb that startup
    // race — any other error surfaces immediately.
    let error: unknown
    for (let attempt = 0; attempt < 10; attempt++) {
      ;({ error } = await client.signIn.email({
        email: user.email,
        password: user.password,
      }))
      if (!error || (error as { status?: number }).status !== 401) {
        break
      }
      await new Promise((r) => setTimeout(r, 300))
    }
    expect(
      error,
      `sign-in failed for ${which}: ${JSON.stringify(error)}`
    ).toBeFalsy()
  }
)

const callConsoleRpc = async (name: string, data: unknown) => {
  const res = await actor.cookieFetch(`${config.apiUrl}/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })
  lastStatus = res.status
}

When('they call the console RPC {string}', async function (name: string) {
  await callConsoleRpc(name, {})
})

When(
  /^they call the console RPC "([^"]+)" with (.+)$/,
  async function (name: string, json: string) {
    await callConsoleRpc(name, JSON.parse(json))
  }
)

Then('the console RPC is forbidden', function () {
  expect(lastStatus).toBe(403)
})

// "Allowed" only asserts the admin cleared the gate — any non-403 status means
// the permission passed and the function ran (a 200, or a domain error from the
// function body, but never the authorization 403).
Then('the console RPC is allowed', function () {
  expect(lastStatus).not.toBe(403)
  expect(lastStatus).toBeLessThan(500)
})
