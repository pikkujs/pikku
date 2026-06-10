import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { config } from '../support/types.js'

async function rpc(name: string, data: Record<string, unknown> = {}) {
  const res = await fetch(`${config.apiUrl}/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })
  return res.json()
}

interface CsrfResult {
  csrfToken: string
  csrfCookieValue: string
}

async function fetchCsrf(sessionCookie?: string): Promise<CsrfResult> {
  const headers: Record<string, string> = {}
  if (sessionCookie) {
    headers['Cookie'] = `authjs.session-token=${sessionCookie}`
  }
  const res = await fetch(`${config.apiUrl}/auth/csrf`, { headers })
  const { csrfToken } = (await res.json()) as { csrfToken: string }

  const setCookie = res.headers.get('set-cookie') ?? ''
  const match = setCookie.match(/authjs\.csrf-token=([^;]+)/)
  const csrfCookieValue = match ? match[1] : ''

  return { csrfToken, csrfCookieValue }
}

interface AuthState {
  sessionCookie: string | null
  lastSignupError: string | null
  lastLoginError: string | null
  lastSessionData: Record<string, unknown> | null
}

const state: AuthState = {
  sessionCookie: null,
  lastSignupError: null,
  lastLoginError: null,
  lastSessionData: null,
}

Given('auth users are reset', async function () {
  await rpc('resetAuthUsers', {})
  state.sessionCookie = null
  state.lastSignupError = null
  state.lastLoginError = null
  state.lastSessionData = null
})

When(
  'I sign up as {string} with password {string}',
  async function (email: string, password: string) {
    const { csrfToken, csrfCookieValue } = await fetchCsrf()

    const body = new URLSearchParams({
      email,
      password,
      mode: 'signup',
      csrfToken,
      callbackUrl: config.apiUrl + '/',
    })

    const res = await fetch(`${config.apiUrl}/auth/callback/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `authjs.csrf-token=${csrfCookieValue}`,
      },
      body: body.toString(),
      redirect: 'manual',
    })

    const location = res.headers.get('location') ?? ''
    if (location.includes('error=CredentialsSignin')) {
      state.lastSignupError = 'CredentialsSignin'
      return
    }

    state.lastSignupError = null
    const setCookie = res.headers.get('set-cookie') ?? ''
    const match = setCookie.match(/authjs\.session-token=([^;]+)/)
    state.sessionCookie = match ? match[1] : null
  }
)

Then('the signup should succeed', function () {
  expect(state.lastSignupError).toBeNull()
})

Then('the signup should fail with {string}', function (expectedError: string) {
  expect(state.lastSignupError).toContain(expectedError)
})

Then('the user {string} should exist', async function (email: string) {
  const result = await rpc('userExists', { email })
  expect(result.exists).toBe(true)
})

Given(
  'I have signed up as {string} with password {string}',
  async function (email: string, password: string) {
    const { csrfToken, csrfCookieValue } = await fetchCsrf()
    const body = new URLSearchParams({
      email,
      password,
      mode: 'signup',
      csrfToken,
      callbackUrl: config.apiUrl + '/',
    })
    const res = await fetch(`${config.apiUrl}/auth/callback/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `authjs.csrf-token=${csrfCookieValue}`,
      },
      body: body.toString(),
      redirect: 'manual',
    })
    const location = res.headers.get('location') ?? ''
    if (location.includes('error=')) {
      throw new Error(`Signup failed unexpectedly: ${location}`)
    }
    const setCookie = res.headers.get('set-cookie') ?? ''
    const match = setCookie.match(/authjs\.session-token=([^;]+)/)
    state.sessionCookie = match ? match[1] : null
  }
)

When(
  'I log in as {string} with password {string}',
  async function (email: string, password: string) {
    const { csrfToken, csrfCookieValue } = await fetchCsrf()
    const body = new URLSearchParams({
      email,
      password,
      csrfToken,
      callbackUrl: config.apiUrl + '/',
    })
    const res = await fetch(`${config.apiUrl}/auth/callback/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `authjs.csrf-token=${csrfCookieValue}`,
      },
      body: body.toString(),
      redirect: 'manual',
    })

    const location = res.headers.get('location') ?? ''
    if (location.includes('error=CredentialsSignin')) {
      state.lastLoginError = 'CredentialsSignin'
      state.sessionCookie = null
      return
    }

    state.lastLoginError = null
    const setCookie = res.headers.get('set-cookie') ?? ''
    const match = setCookie.match(/authjs\.session-token=([^;]+)/)
    state.sessionCookie = match ? match[1] : null
  }
)

Given(
  'I am logged in as {string} with password {string}',
  async function (email: string, password: string) {
    const { csrfToken, csrfCookieValue } = await fetchCsrf()
    const body = new URLSearchParams({
      email,
      password,
      csrfToken,
      callbackUrl: config.apiUrl + '/',
    })
    const res = await fetch(`${config.apiUrl}/auth/callback/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `authjs.csrf-token=${csrfCookieValue}`,
      },
      body: body.toString(),
      redirect: 'manual',
    })
    const location = res.headers.get('location') ?? ''
    if (location.includes('error=')) {
      throw new Error(`Login failed unexpectedly: ${location}`)
    }
    const setCookie = res.headers.get('set-cookie') ?? ''
    const match = setCookie.match(/authjs\.session-token=([^;]+)/)
    state.sessionCookie = match ? match[1] : null
  }
)

Then('I should be logged in as {string}', async function (email: string) {
  expect(state.sessionCookie).toBeTruthy()
  const res = await fetch(`${config.apiUrl}/auth/session`, {
    headers: { Cookie: `authjs.session-token=${state.sessionCookie}` },
  })
  const session = (await res.json()) as any
  expect(session?.user?.email).toBe(email)
})

Then('I should not be logged in', function () {
  expect(state.sessionCookie).toBeFalsy()
  expect(state.lastLoginError).toBe('CredentialsSignin')
})

When('I log out', async function () {
  expect(state.sessionCookie).toBeTruthy()
  const { csrfToken, csrfCookieValue } = await fetchCsrf(
    state.sessionCookie ?? undefined
  )
  const body = new URLSearchParams({
    csrfToken,
    callbackUrl: config.apiUrl + '/',
  })
  const res = await fetch(`${config.apiUrl}/auth/signout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: `authjs.session-token=${state.sessionCookie}; authjs.csrf-token=${csrfCookieValue}`,
    },
    body: body.toString(),
    redirect: 'manual',
  })
  const location = res.headers.get('location') ?? ''
  expect(location).not.toContain('error=')
  state.sessionCookie = null
})

Then('I should be logged out', function () {
  expect(state.sessionCookie).toBeNull()
})

When('I fetch my session', async function () {
  const headers: Record<string, string> = {}
  if (state.sessionCookie) {
    headers['Cookie'] = `authjs.session-token=${state.sessionCookie}`
  }
  const res = await fetch(`${config.apiUrl}/auth/session`, { headers })
  state.lastSessionData = (await res.json()) as Record<string, unknown>
})

Then('the session email should be {string}', function (expectedEmail: string) {
  const session = state.lastSessionData as any
  expect(session?.user?.email).toBe(expectedEmail)
})

Then('the session should be empty', function () {
  const session = state.lastSessionData as any
  expect(session?.user).toBeFalsy()
})
