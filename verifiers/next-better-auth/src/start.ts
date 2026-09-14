import { spawn, type ChildProcess } from 'node:child_process'
import { rmSync } from 'node:fs'
import path from 'node:path'

const BASE = 'http://127.0.0.1:3110'
const AUTH = `${BASE}/api/auth`
const DB_FILE = path.join(process.cwd(), '.better-auth.sqlite')

function assertTruthy(value: unknown, label: string): asserts value {
  if (!value) throw new Error(`${label}: expected truthy, got ${value}`)
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    )
  }
}

function extractCookies(res: Response): string {
  const headers = res.headers as Headers & {
    getSetCookie?: () => string[]
  }

  const rawCookies =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : (res.headers.get('set-cookie') ?? '')
          .split(/,(?=[^;]+=[^;]+)/g)
          .filter(Boolean)

  return rawCookies
    .map((cookie) => cookie.split(';', 1)[0]?.trim())
    .filter((cookie): cookie is string => Boolean(cookie))
    .join('; ')
}

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve()
  }

  return new Promise((resolve) => child.once('exit', () => resolve()))
}

/**
 * Signal the child and everything it started.
 *
 * `npx` forks rather than execs, so signalling the returned child reaches the
 * wrapper and leaves `next-server` holding the pipes that keep this process
 * alive — the verifier prints "passed" and node then never exits, so the job is
 * killed at its ten-minute cap. `detached: true` puts the whole tree in its own
 * process group, and the group is what gets signalled; SIGKILL sits behind a
 * grace period so a server that ignores SIGTERM cannot hang the run either.
 */
function signalTree(child: ChildProcess, name: NodeJS.Signals): void {
  try {
    process.kill(-child.pid!, name)
  } catch {
    child.kill(name)
  }
}

async function main(): Promise<void> {
  rmSync(DB_FILE, { force: true })

  const child = spawn(
    'npx',
    ['next', 'dev', '--hostname', '127.0.0.1', '--port', '3110'],
    {
      cwd: process.cwd(),
      stdio: 'pipe',
      detached: true,
      env: { ...process.env, BETTER_AUTH_DB_FILE: DB_FILE },
    }
  )

  child.stdout?.on('data', (chunk) => process.stdout.write(`[next] ${chunk}`))
  child.stderr?.on('data', (chunk) => process.stderr.write(`[next] ${chunk}`))

  try {
    await waitForServer(BASE)

    const home = await fetch(BASE)
    const html = await home.text()
    assertTruthy(
      html.includes('Hello from Next verifier'),
      'SSR page renders PikkuNextJS data'
    )

    const signUpRes = await fetch(`${AUTH}/sign-up/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: BASE,
      },
      body: JSON.stringify({
        name: 'alice',
        email: 'alice@example.com',
        password: 'password123',
      }),
    })
    assertEqual(signUpRes.status, 200, 'signup status')
    const cookie = extractCookies(signUpRes)
    assertTruthy(cookie, 'cookies after signup')

    const meRes = await fetch(`${BASE}/api/me`, {
      headers: { Cookie: cookie! },
    })
    assertEqual(meRes.status, 200, '/api/me status')
    const me = (await meRes.json()) as { userId?: string }
    assertTruthy(me.userId, 'pikku protected route userId')

    const signOutRes = await fetch(`${AUTH}/sign-out`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie!,
        Origin: BASE,
      },
      body: '{}',
    })
    assertEqual(signOutRes.status, 200, 'sign-out status')

    console.log('✓ Next Better Auth verifier passed')
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = waitForExit(child)
      signalTree(child, 'SIGTERM')
      await Promise.race([
        exited,
        new Promise<void>((resolve) => {
          setTimeout(() => {
            signalTree(child, 'SIGKILL')
            resolve()
          }, 5_000)
        }),
      ])
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
