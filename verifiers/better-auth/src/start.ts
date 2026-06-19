import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createConfig, createSingletonServices } from './services.js'
import '../.pikku/pikku-bootstrap.gen.js'
import './auth.wiring.js'
import './me.http.js'

import { fetch } from '@pikku/core'
import { betterAuthStatelessSession } from '@pikku/better-auth'
import { VERIFIER_OAUTH_PROVIDERS } from './providers.js'

const BASE = 'http://localhost'
const AUTH = `${BASE}/api/auth`

// better-auth enforces an Origin check on state-changing requests; a browser
// always sends one, so the verifier does too.
const JSON_HEADERS = {
  'Content-Type': 'application/json',
  Origin: BASE,
}

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

/** Pull the better-auth session cookie out of a response's Set-Cookie header. */
function extractSessionCookie(res: Response): string | null {
  const raw = res.headers.get('set-cookie') ?? ''
  const match = raw.match(/(better-auth\.session_token)=([^;]+)/)
  // A cleared cookie (sign-out) has an empty value — treat that as no cookie.
  return match && match[2] ? `${match[1]}=${match[2]}` : null
}

/**
 * Build a full `Cookie` header from *every* Set-Cookie the response carried —
 * crucially including `better-auth.session_data` (the signed {session,user}
 * cookie cache), which `extractSessionCookie` deliberately ignores. The
 * stateless middleware reads that cache cookie, so the round-trip test needs it.
 */
function extractAllCookies(res: Response): string {
  // undici's Headers exposes getSetCookie() which returns each Set-Cookie as a
  // discrete entry — the only reliable way to split multiple cookies, since a
  // single comma-joined header is ambiguous (cookie values contain commas).
  const entries =
    typeof (res.headers as any).getSetCookie === 'function'
      ? ((res.headers as any).getSetCookie() as string[])
      : [res.headers.get('set-cookie') ?? '']
  return entries
    .map((c) => c.split(';')[0]) // keep just `name=value`
    .filter((c) => c && !/=$/.test(c)) // drop cleared/empty cookies
    .join('; ')
}

function signUp(email: string, password: string): Promise<Response> {
  return fetch(
    new Request(`${AUTH}/sign-up/email`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: email.split('@')[0], email, password }),
    })
  )
}

function signIn(email: string, password: string): Promise<Response> {
  return fetch(
    new Request(`${AUTH}/sign-in/email`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ email, password }),
    })
  )
}

async function main(): Promise<void> {
  const config = await createConfig()
  const singletonServices = await createSingletonServices(config)

  console.log('\nBetter Auth Verifier')
  console.log('====================')

  console.log('\n--- Credentials Signup ---')

  await runTest('signup creates user and returns session cookie', async () => {
    const res = await signUp('alice@example.com', 'password123')
    assertEqual(res.status, 200, 'signup status')
    assertTruthy(
      extractSessionCookie(res),
      'session cookie present after signup'
    )
  })

  await runTest('duplicate signup is rejected', async () => {
    await signUp('bob@example.com', 'password123')
    const res = await signUp('bob@example.com', 'password123')
    assertTruthy(
      res.status >= 400,
      `duplicate signup status ${res.status} >= 400`
    )
  })

  console.log('\n--- Session ---')

  await runTest(
    'GET /api/auth/get-session returns user after signup',
    async () => {
      const signupRes = await signUp('carol@example.com', 'password123')
      const cookie = extractSessionCookie(signupRes)
      assertTruthy(cookie, 'session cookie from signup')

      const res = await fetch(
        new Request(`${AUTH}/get-session`, { headers: { Cookie: cookie! } })
      )
      const session = (await res.json()) as any
      assertEqual(session?.user?.email, 'carol@example.com', 'session email')
    }
  )

  await runTest(
    'global session middleware decodes cookie into pikku session on /me',
    async () => {
      const signupRes = await signUp('dave@example.com', 'password123')
      // cookieCache is enabled, so the CLI wires the *stateless* session
      // middleware globally — it reads the signed `session_data` cache cookie,
      // so the request must carry the full cookie set, not just session_token.
      const cookie = extractAllCookies(signupRes)
      assertTruthy(cookie, 'session cookie')

      const res = await fetch(
        new Request(`${BASE}/me`, { headers: { Cookie: cookie } })
      )
      const body = (await res.json()) as any
      assertTruthy(body?.userId, 'userId from global session middleware')
    }
  )

  await runTest(
    'betterAuthStatelessSession verifies the cookie cache without the server',
    async () => {
      // Sign up, then read the session to learn the canonical user id.
      const signupRes = await signUp('heidi@example.com', 'password123')
      const cookieHeader = extractAllCookies(signupRes)
      assertTruthy(
        /better-auth\.session_data=/.test(cookieHeader),
        'session_data (cookie cache) present — cookieCache must be enabled'
      )

      const sessionRes = await fetch(
        new Request(`${AUTH}/get-session`, {
          headers: { Cookie: cookieHeader },
        })
      )
      const expectedUserId = ((await sessionRes.json()) as any)?.user?.id
      assertTruthy(expectedUserId, 'user id from get-session')

      // Drive the stateless middleware directly with the *same* cookie the
      // server just wrote. This is the one fact inspection can't establish:
      // does getCookieCache(secret) actually read what cookieCache writes?
      const headers = new Headers({ cookie: cookieHeader })
      let captured: any = null
      const mw = betterAuthStatelessSession()
      await mw(
        singletonServices as any,
        {
          http: { request: { headers: () => headers } },
          setSession: (s: any) => {
            captured = s
          },
          session: undefined,
        } as any,
        async () => {}
      )
      assertEqual(
        captured?.userId,
        expectedUserId,
        'stateless middleware populated session userId from the signed cookie'
      )
    }
  )

  await runTest('GET /me is unauthorized without a session', async () => {
    const res = await fetch(new Request(`${BASE}/me`))
    assertTruthy(
      res.status >= 400,
      `unauthenticated /me status ${res.status} >= 400`
    )
  })

  console.log('\n--- Login ---')

  await runTest('login with valid credentials succeeds', async () => {
    await signUp('eve@example.com', 'correct-password')
    const res = await signIn('eve@example.com', 'correct-password')
    assertEqual(res.status, 200, 'login status')
    assertTruthy(extractSessionCookie(res), 'session cookie after login')
  })

  await runTest('login with wrong password fails', async () => {
    await signUp('frank@example.com', 'correct-password')
    const res = await signIn('frank@example.com', 'wrong-password')
    assertEqual(res.status, 401, 'wrong-password status')
  })

  await runTest('login for unknown user fails', async () => {
    const res = await signIn('ghost@example.com', 'anything-here')
    assertEqual(res.status, 401, 'unknown-user status')
  })

  console.log('\n--- Social Providers ---')

  for (const provider of VERIFIER_OAUTH_PROVIDERS) {
    await runTest(
      `social sign-in for ${provider} builds an authorization URL`,
      async () => {
        const res = await fetch(
          new Request(`${AUTH}/sign-in/social`, {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify({ provider, callbackURL: '/' }),
          })
        )
        assertEqual(res.status, 200, `${provider} status`)
        const body = (await res.json()) as { url?: string }
        assertTruthy(body.url, `${provider} authorization url`)
        assertTruthy(
          body.url!.includes(`fake-${provider}-client-id`),
          `${provider} url carries the wired client id`
        )
      }
    )
  }

  console.log('\n--- Auth metadata (auth-meta.gen.json) ---')

  await runTest(
    'generates auth-meta.gen.json with all social providers and plugins',
    async () => {
      const metaPath = join(
        process.cwd(),
        '.pikku',
        'auth',
        'pikku-auth-meta.gen.json'
      )
      const meta = JSON.parse(await readFile(metaPath, 'utf-8')) as {
        hasCredentials: boolean
        providers: Array<{ id: string; displayName: string; secretId: string }>
        plugins: Array<{ id: string; displayName: string }>
      }
      assertEqual(meta.hasCredentials, true, 'hasCredentials')
      assertEqual(
        meta.providers.map((p) => p.id),
        VERIFIER_OAUTH_PROVIDERS,
        'meta provider ids'
      )
      assertEqual(
        meta.providers.find((p) => p.id === 'github')?.secretId,
        'GITHUB_OAUTH',
        'github secretId'
      )
      assertEqual(
        meta.plugins,
        [{ id: 'bearer', displayName: 'Bearer' }],
        'meta plugins'
      )
    }
  )

  console.log('\n--- Logout ---')

  await runTest('sign-out clears the session', async () => {
    const signupRes = await signUp('grace@example.com', 'password123')
    const cookie = extractSessionCookie(signupRes)
    assertTruthy(cookie, 'session cookie before logout')

    const signoutRes = await fetch(
      new Request(`${AUTH}/sign-out`, {
        method: 'POST',
        headers: { ...JSON_HEADERS, Cookie: cookie! },
        body: '{}',
      })
    )
    assertEqual(signoutRes.status, 200, 'sign-out status')
    const cleared = signoutRes.headers.get('set-cookie') ?? ''
    assertTruthy(
      cleared.includes('better-auth.session_token=') &&
        /Max-Age=0/i.test(cleared),
      'session cookie cleared by sign-out response'
    )
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
    console.log('\n✗ Some better-auth tests failed!')
    process.exit(1)
  } else {
    console.log('\n✓ All better-auth tests passed!')
  }
}

main().catch((e) => {
  console.error('\n✗ Fatal error:', e.message)
  console.error(e.stack)
  process.exit(1)
})
