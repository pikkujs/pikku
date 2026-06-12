import { createConfig, createSingletonServices } from './services.js'
import '../.pikku/pikku-bootstrap.gen.js'
import './auth.wiring.js'
import './me.http.js'

import { fetch } from '@pikku/core'
import { resetStore } from './user-store.js'

const BASE = 'http://localhost'

interface TestResult {
  name: string
  passed: boolean
  error?: string
}

const results: TestResult[] = []

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    results.push({ name, passed: true })
    console.log(`  ✓ ${name}`)
  } catch (e: any) {
    results.push({ name, passed: false, error: e.message })
    console.log(`  ✗ ${name}: ${e.message}`)
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    )
  }
}

function assertTruthy(value: unknown, label: string): void {
  if (!value)
    throw new Error(`${label}: expected truthy, got ${JSON.stringify(value)}`)
}

function assertFalsy(value: unknown, label: string): void {
  if (value)
    throw new Error(`${label}: expected falsy, got ${JSON.stringify(value)}`)
}

interface CsrfResult {
  csrfToken: string
  csrfCookie: string
}

async function getCsrf(sessionCookie?: string): Promise<CsrfResult> {
  const headers: Record<string, string> = {}
  if (sessionCookie) headers['Cookie'] = sessionCookie

  const res = await fetch(new Request(`${BASE}/auth/csrf`, { headers }))
  const { csrfToken } = (await res.json()) as { csrfToken: string }

  const rawCookie = res.headers.get('set-cookie') ?? ''
  const csrfCookieMatch = rawCookie.match(/authjs\.csrf-token=([^;]+)/)
  const csrfCookie = csrfCookieMatch
    ? `authjs.csrf-token=${csrfCookieMatch[1]}`
    : ''

  return { csrfToken, csrfCookie }
}

async function credentialsPost(
  email: string,
  password: string,
  csrfToken: string,
  csrfCookie: string,
  mode?: string
): Promise<Response> {
  const body = new URLSearchParams({
    email,
    password,
    csrfToken,
    callbackUrl: `${BASE}/`,
  })
  if (mode) body.set('mode', mode)

  return fetch(
    new Request(`${BASE}/auth/callback/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: csrfCookie,
      },
      body: body.toString(),
    })
  )
}

function extractSessionCookie(res: Response): string | null {
  const raw = res.headers.get('set-cookie') ?? ''
  const match = raw.match(/authjs\.session-token=([^;]+)/)
  return match ? `authjs.session-token=${match[1]}` : null
}

async function main(): Promise<void> {
  const config = await createConfig()
  await createSingletonServices(config)

  console.log('\nAuth.js Verifier')
  console.log('================')

  console.log('\n--- CSRF ---')

  await runTest('GET /auth/csrf returns csrfToken', async () => {
    const { csrfToken } = await getCsrf()
    assertTruthy(csrfToken, 'csrfToken')
  })

  console.log('\n--- Credentials Signup ---')

  await runTest('signup creates user and returns session cookie', async () => {
    resetStore()
    const { csrfToken, csrfCookie } = await getCsrf()
    const res = await credentialsPost(
      'alice@example.com',
      'password123',
      csrfToken,
      csrfCookie,
      'signup'
    )
    const location = res.headers.get('location') ?? ''
    assertFalsy(location.includes('error='), 'no error in redirect')
    const sessionCookie = extractSessionCookie(res)
    assertTruthy(sessionCookie, 'session cookie present after signup')
  })

  await runTest('duplicate signup fails with CredentialsSignin', async () => {
    resetStore()
    const { csrfToken: t1, csrfCookie: c1 } = await getCsrf()
    await credentialsPost('bob@example.com', 'pass', t1, c1, 'signup')
    const { csrfToken: t2, csrfCookie: c2 } = await getCsrf()
    const res = await credentialsPost(
      'bob@example.com',
      'other',
      t2,
      c2,
      'signup'
    )
    const location = res.headers.get('location') ?? ''
    assertTruthy(
      location.includes('error=CredentialsSignin'),
      'CredentialsSignin error'
    )
  })

  console.log('\n--- Session ---')

  await runTest('GET /auth/session returns user after login', async () => {
    resetStore()
    const { csrfToken, csrfCookie } = await getCsrf()
    const signupRes = await credentialsPost(
      'carol@example.com',
      'secret',
      csrfToken,
      csrfCookie,
      'signup'
    )
    const sessionCookie = extractSessionCookie(signupRes)
    assertTruthy(sessionCookie, 'session cookie from signup')

    const sessionRes = await fetch(
      new Request(`${BASE}/auth/session`, {
        headers: { Cookie: sessionCookie! },
      })
    )
    const session = (await sessionRes.json()) as any
    assertEqual(session?.user?.email, 'carol@example.com', 'session email')
  })

  await runTest(
    'authJsSession middleware decodes cookie into pikku session',
    async () => {
      resetStore()
      const { csrfToken, csrfCookie } = await getCsrf()
      const signupRes = await credentialsPost(
        'dave@example.com',
        'pass',
        csrfToken,
        csrfCookie,
        'signup'
      )
      const sessionCookie = extractSessionCookie(signupRes)
      assertTruthy(sessionCookie, 'session cookie')

      const meRes = await fetch(
        new Request(`${BASE}/me`, {
          headers: { Cookie: sessionCookie! },
        })
      )
      const body = (await meRes.json()) as any
      assertTruthy(body?.userId, 'userId from authJsSession')
    }
  )

  console.log('\n--- Login ---')

  await runTest('login with valid credentials succeeds', async () => {
    resetStore()
    const { csrfToken: t1, csrfCookie: c1 } = await getCsrf()
    await credentialsPost('eve@example.com', 'correct', t1, c1, 'signup')

    const { csrfToken: t2, csrfCookie: c2 } = await getCsrf()
    const loginRes = await credentialsPost('eve@example.com', 'correct', t2, c2)
    const location = loginRes.headers.get('location') ?? ''
    assertFalsy(location.includes('error='), 'no error in redirect')
    assertTruthy(extractSessionCookie(loginRes), 'session cookie after login')
  })

  await runTest('login with wrong password fails', async () => {
    resetStore()
    const { csrfToken: t1, csrfCookie: c1 } = await getCsrf()
    await credentialsPost('frank@example.com', 'correct', t1, c1, 'signup')

    const { csrfToken: t2, csrfCookie: c2 } = await getCsrf()
    const loginRes = await credentialsPost('frank@example.com', 'wrong', t2, c2)
    const location = loginRes.headers.get('location') ?? ''
    assertTruthy(
      location.includes('error=CredentialsSignin'),
      'CredentialsSignin error'
    )
  })

  await runTest('login for unknown user fails', async () => {
    const { csrfToken, csrfCookie } = await getCsrf()
    const res = await credentialsPost(
      'ghost@example.com',
      'anything',
      csrfToken,
      csrfCookie
    )
    const location = res.headers.get('location') ?? ''
    assertTruthy(
      location.includes('error=CredentialsSignin'),
      'CredentialsSignin error'
    )
  })

  console.log('\n--- Logout ---')

  await runTest('signout clears session', async () => {
    resetStore()
    const { csrfToken: t1, csrfCookie: c1 } = await getCsrf()
    const signupRes = await credentialsPost(
      'grace@example.com',
      'pass',
      t1,
      c1,
      'signup'
    )
    const sessionCookie = extractSessionCookie(signupRes)
    assertTruthy(sessionCookie, 'session cookie before logout')

    const { csrfToken: t2, csrfCookie: c2 } = await getCsrf(sessionCookie!)
    const body = new URLSearchParams({ csrfToken: t2, callbackUrl: `${BASE}/` })
    const signoutRes = await fetch(
      new Request(`${BASE}/auth/signout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: `${sessionCookie}; ${c2}`,
        },
        body: body.toString(),
      })
    )
    const location = signoutRes.headers.get('location') ?? ''
    assertFalsy(location.includes('error='), 'no error after signout')

    const sessionAfter = await fetch(new Request(`${BASE}/auth/session`))
    const data = await sessionAfter.json()
    assertFalsy(data, 'session is empty after logout')
  })

  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length

  console.log(`\n${'─'.repeat(40)}`)
  console.log(
    `Results: ${passed} passed, ${failed} failed, ${results.length} total`
  )

  if (failed > 0) {
    console.log('\nFailed tests:')
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ✗ ${r.name}: ${r.error}`)
    }
    console.log('\n✗ Some auth-js tests failed!')
    process.exit(1)
  } else {
    console.log('\n✓ All auth-js tests passed!')
  }
}

main().catch((e) => {
  console.error('\n✗ Fatal error:', e.message)
  console.error(e.stack)
  process.exit(1)
})
