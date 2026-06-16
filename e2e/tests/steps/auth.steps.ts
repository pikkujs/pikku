import { Before, Given, When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { createAuthClient } from 'better-auth/client'
import { Actor } from '@pikku/cucumber'
import { config } from '../support/types.js'

// Drive the REAL Better Auth client SDK (the same one a frontend uses) over
// real HTTP against the running e2e server — no hand-rolled endpoint calls.
//
// The browser persists the session cookie automatically; in this Node process
// an `Actor` (from @pikku/cucumber) owns the cookie jar. Its `cookieFetch`
// replays the `better-auth.session_token` cookie and stamps the `Origin` header
// (Better Auth rejects state-changing POSTs without an Origin matching the
// baseURL); we hand it to the client SDK as the `customFetchImpl`.

let actor: Actor
let authClient: ReturnType<typeof createAuthClient>
let lastSignupOk: boolean | null = null
let lastLoginError: string | null = null
let lastSession: { user?: { email?: string } } | null = null

// Better Auth persists its tables for the server's lifetime and the suite uses
// unique emails per scenario, so there is nothing to reset server-side. Each
// scenario gets a fresh Actor (a clean cookie jar) plus reset assertion state so
// sessions don't leak across scenarios.
Before({ tags: '@auth' }, function () {
  actor = new Actor('user', {}, config.apiUrl)
  authClient = createAuthClient({
    baseURL: config.apiUrl,
    fetchOptions: { customFetchImpl: actor.cookieFetch },
  })
  lastSignupOk = null
  lastLoginError = null
  lastSession = null
})

When(
  'I sign up as {string} with password {string}',
  async function (email: string, password: string) {
    const { error } = await authClient.signUp.email({
      name: email,
      email,
      password,
    })
    lastSignupOk = !error
    if (error) actor.clearCookies()
  }
)

Then('the signup should succeed', function () {
  expect(lastSignupOk).toBe(true)
})

Then('the signup should fail', function () {
  expect(lastSignupOk).toBe(false)
})

Given(
  'I have signed up as {string} with password {string}',
  async function (email: string, password: string) {
    const { error } = await authClient.signUp.email({
      name: email,
      email,
      password,
    })
    if (error) {
      throw new Error(`Signup failed unexpectedly: ${JSON.stringify(error)}`)
    }
  }
)

When(
  'I log in as {string} with password {string}',
  async function (email: string, password: string) {
    actor.clearCookies()
    const { error } = await authClient.signIn.email({ email, password })
    lastLoginError = error ? `sign-in failed (${error.status})` : null
    if (error) actor.clearCookies()
  }
)

Given(
  'I am logged in as {string} with password {string}',
  async function (email: string, password: string) {
    const { error } = await authClient.signIn.email({ email, password })
    if (error) {
      throw new Error(`Login failed unexpectedly: ${JSON.stringify(error)}`)
    }
  }
)

Then('I should be logged in as {string}', async function (email: string) {
  const { data } = await authClient.getSession()
  expect(data?.user?.email).toBe(email)
})

Then('I should not be logged in', async function () {
  expect(lastLoginError).toBeTruthy()
  const { data } = await authClient.getSession()
  expect(data?.user).toBeFalsy()
})

When('I log out', async function () {
  const { error } = await authClient.signOut()
  if (error) {
    throw new Error(`Sign out failed unexpectedly: ${JSON.stringify(error)}`)
  }
})

Then('I should be logged out', async function () {
  const { data } = await authClient.getSession()
  expect(data?.user).toBeFalsy()
})

When('I fetch my session', async function () {
  const { data } = await authClient.getSession()
  lastSession = data
})

Then('the session email should be {string}', function (expectedEmail: string) {
  expect(lastSession?.user?.email).toBe(expectedEmail)
})

Then('the session should be empty', function () {
  expect(lastSession?.user).toBeFalsy()
})
