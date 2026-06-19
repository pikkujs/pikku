import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'

const BIN_DIR = path.join(process.cwd(), 'node_modules/.bin')

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

async function waitForServer(url: string, requireOk = true): Promise<void> {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok || (!requireOk && res.status > 0)) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function getAvailablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to determine free port'))
        return
      }

      const { port } = address
      server.close((error) => {
        if (error) reject(error)
        else resolve(port)
      })
    })
  })
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve()
  }

  return new Promise((resolve) => child.once('exit', () => resolve()))
}

async function main(): Promise<void> {
  const frontendPort = await getAvailablePort()
  const backendPort = await getAvailablePort()
  const FRONTEND = `http://127.0.0.1:${frontendPort}`
  const BACKEND = `http://127.0.0.1:${backendPort}`
  const AUTH = `${FRONTEND}/api/auth`
  const DB_FILE = path.join(
    process.cwd(),
    `.better-auth-${process.pid}-${Date.now()}.sqlite`
  )

  rmSync(path.join(process.cwd(), 'src/routes/index.js'), { force: true })
  rmSync(path.join(process.cwd(), 'src/routes/__root.js'), { force: true })
  rmSync(path.join(process.cwd(), 'src/routes/api/me.js'), { force: true })
  rmSync(path.join(process.cwd(), 'src/routes/api/auth/$.js'), { force: true })

  const backend = spawn(path.join(BIN_DIR, 'tsx'), ['src/backend.ts'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    env: {
      ...process.env,
      PORT: String(backendPort),
      BETTER_AUTH_DB_FILE: DB_FILE,
      FRONTEND_URL: FRONTEND,
    },
  })
  backend.stdout?.on('data', (chunk) =>
    process.stdout.write(`[backend] ${chunk}`)
  )
  backend.stderr?.on('data', (chunk) =>
    process.stderr.write(`[backend] ${chunk}`)
  )

  const frontend = spawn(
    path.join(BIN_DIR, 'vite'),
    ['dev', '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort'],
    {
      cwd: process.cwd(),
      stdio: 'pipe',
      env: {
        ...process.env,
        VITE_API_URL: BACKEND,
        BETTER_AUTH_DB_FILE: DB_FILE,
        FRONTEND_URL: FRONTEND,
      },
    }
  )
  frontend.stdout?.on('data', (chunk) =>
    process.stdout.write(`[frontend] ${chunk}`)
  )
  frontend.stderr?.on('data', (chunk) =>
    process.stderr.write(`[frontend] ${chunk}`)
  )

  try {
    await waitForServer(`${BACKEND}/health-check`)
    await waitForServer(FRONTEND, false)

    const home = await fetch(FRONTEND)
    const html = await home.text()
    assertTruthy(
      html.includes('Hello TanStack from TanStack verifier'),
      'SSR page renders TanStack makeApi data'
    )

    const signUpRes = await fetch(`${AUTH}/sign-up/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: FRONTEND,
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

    const meRes = await fetch(`${FRONTEND}/api/me`, {
      headers: { Cookie: cookie! },
    })
    assertEqual(meRes.status, 200, '/api/me status')
    const me = (await meRes.json()) as { email?: string }
    assertEqual(me.email, 'alice@example.com', 'session email')

    console.log('✓ TanStack Start Better Auth verifier passed')
  } finally {
    frontend.kill('SIGTERM')
    backend.kill('SIGTERM')
    await Promise.all([
      waitForExit(frontend),
      waitForExit(backend),
    ])
    rmSync(DB_FILE, { force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
