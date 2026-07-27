import { spawn, type ChildProcess } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

import { ADMIN_USER } from '../src/auth-fixtures.js'
import { assertPortFree } from './backend-port.js'

const DEFAULT_API_URL = process.env.API_URL || 'http://localhost:4077'

export interface BackendHandle {
  apiUrl: string
  /** Kills the whole process group, so `pikku dev`'s children go with it. */
  stop: () => void
  /** The exit result once the backend has exited, `undefined` while it runs. */
  hasExited: () => { code: number | null } | undefined
}

export interface StartBackendOptions {
  apiUrl?: string
}

export interface WaitForSeededBackendOptions {
  timeoutMs?: number
  intervalMs?: number
  hasExited?: () => { code: number | null } | undefined
  fetchImpl?: typeof fetch
}

/**
 * The defaults every e2e entry point runs under. Applied by `startBackend`, but
 * exported because the actor secret is needed by whatever signs actors in — so
 * a run against an already-live backend needs it just as much as a spawned one.
 */
export const applyTestEnvDefaults = (): void => {
  process.env.SCENARIO_ACTOR_SECRET ??= 'e2e-actor-secret'

  // The deterministic agent suite scripts the model instead of calling OpenAI.
  // Opt out with PIKKU_MOCK_LLM=0 to run the @ai-live tier against a real key.
  process.env.PIKKU_MOCK_LLM ??= '1'
}

/**
 * Spawn the e2e backend as its own process group and stream its output under a
 * `[backend]` prefix. Does NOT wait for readiness — pair it with
 * `waitForSeededBackend`, which needs the returned `hasExited` to fail fast.
 */
export const startBackend = async (
  options: StartBackendOptions = {}
): Promise<BackendHandle> => {
  const apiUrl = options.apiUrl ?? DEFAULT_API_URL
  const { port, hostname } = new URL(apiUrl)
  const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

  await assertPortFree(Number(port), hostname)

  applyTestEnvDefaults()

  const backendProcess: ChildProcess = spawn(
    'npx',
    ['pikku', 'dev', '--port', port, '--coverage', '--test'],
    {
      cwd: projectDir,
      env: { ...process.env, API_URL: apiUrl },
      stdio: 'pipe',
      detached: true,
    }
  )

  backendProcess.stderr?.on('data', (d: Buffer) =>
    process.stderr.write(`[backend] ${d}`)
  )
  backendProcess.stdout?.on('data', (d: Buffer) =>
    process.stdout.write(`[backend] ${d}`)
  )

  let exit: { code: number | null } | undefined
  backendProcess.on('exit', (code) => {
    exit = { code }
  })

  return {
    apiUrl,
    hasExited: () => exit,
    stop: () => {
      backendProcess.stderr?.destroy()
      backendProcess.stdout?.destroy()
      if (backendProcess.pid) {
        try {
          process.kill(-backendProcess.pid, 'SIGTERM')
        } catch {
          // Process group may already be gone
        }
      }
    },
  }
}

/**
 * Wait for the backend to be ready AND for seeding to have finished. Seeding
 * (seedAuthUsers, then seedScopes) runs in afterStart — async, AFTER the
 * server starts accepting requests — so a bare connectivity check races ahead
 * of it and UI sign-ins fail against not-yet-seeded users. Poll the seeded
 * admin all the way through a console RPC instead: a non-403 proves both that
 * the user rows exist and that seedScopes has granted the `admin` scope the
 * console's global gate checks, which is the very last thing seeding does.
 * A backend that dies on startup would otherwise burn the whole 120s window
 * before reporting, and the reason would already have scrolled past.
 */
export const waitForSeededBackend = async (
  apiUrl: string,
  options: WaitForSeededBackendOptions = {}
): Promise<void> => {
  const {
    timeoutMs = 120_000,
    intervalMs = 500,
    hasExited,
    fetchImpl = fetch,
  } = options

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const exit = hasExited?.()
    if (exit) {
      throw new Error(
        `Backend exited with code ${exit.code} before it was ready`
      )
    }
    try {
      const res = await fetchImpl(`${apiUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: apiUrl,
        },
        body: JSON.stringify({
          email: ADMIN_USER.email,
          password: ADMIN_USER.password,
        }),
      })
      const cookie = res.headers.get('set-cookie')
      if (res.ok && cookie) {
        const ping = await fetchImpl(`${apiUrl}/rpc/console:ping`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({ data: {} }),
        })
        if (ping.ok) return // server up, users seeded, scopes granted
      }
    } catch {
      // server not accepting connections yet — keep polling
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(
    `Backend did not start / seed within ${timeoutMs / 1000} seconds on ${apiUrl}`
  )
}
