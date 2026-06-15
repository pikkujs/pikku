import { Before, Given, When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { createAuthClient } from 'better-auth/client'
import { config } from '../support/types.js'

// Drive the REAL Better Auth client SDK (the same one a frontend uses) over
// real HTTP against the running e2e server — no hand-rolled endpoint calls.
//
// The browser persists the session cookie automatically; in this Node process
// we supply a `customFetchImpl` with a tiny cookie jar that replays the
// `better-auth.session_token` cookie and stamps the `Origin` header (Better
// Auth rejects state-changing POSTs without an Origin matching the baseURL).

let jar: Record<string, string> = {}

function cookieHeader(): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

function storeSetCookie(res: Response): void {
  const cookies =
    (res.headers as { getSetCookie?: () => string[] }).getSetCookie?.() ?? []
  for (const c of cookies) {
    const [pair] = c.split(';')
    const idx = pair.indexOf('=')
    if (idx === -1) continue
    const name = pair.slice(0, idx).trim()
    const value = pair.slice(idx + 1).trim()
    if (!name.startsWith('better-auth')) continue
    // Max-Age=0 clears emit an empty value — drop the cookie.
    if (value === '') delete jar[name]
    else jar[name] = value
  }
}

const customFetchImpl: typeof fetch = async (input, init = {}) => {
  const headers = new Headers(init?.headers as HeadersInit | undefined)
  const cookie = cookieHeader()
  if (cookie) headers.set('cookie', cookie)
  if (!headers.has('origin')) headers.set('origin', config.apiUrl)
  const res = await fetch(input as RequestInfo, { ...init, headers })
  storeSetCookie(res)
  return res
}

const authClient = createAuthClient({
  baseURL: config.apiUrl,
  fetchOptions: { customFetchImpl },
})

let lastSignupOk: boolean | null = null
let lastLoginError: string | null = null
let lastSession: { user?: { email?: string } } | null = null

// Better Auth's in-memory store persists for the server's lifetime and has no
// reset hook — scenarios use unique emails. Reset only the per-client cookie
// jar + assertion state between scenarios so sessions don't leak across them.
Before({ tags: '@auth' }, function () {
  jar = {}
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
    if (error) jar = {}
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
    jar = {}
    const { error } = await authClient.signIn.email({ email, password })
    lastLoginError = error ? `sign-in failed (${error.status})` : null
    if (error) jar = {}
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
