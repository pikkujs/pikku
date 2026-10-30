import { spawn, type ChildProcess } from 'node:child_process'
import { assertPortFree } from '../../server/spawn-dev-server.js'
import type { PikkuFrontend } from '../../../types/config.js'
import type { Env } from './dev-env.js'

export type DevFrontend = {
  name: string
  cwd: string
  command: string[]
  port: number
  healthPath: string
  primary: boolean
}

/**
 * The frontends `pikku dev` runs: every one that declares `dev.command`, the
 * primary first. `only` narrows to the named ones; naming a frontend that does
 * not exist or has no dev command is an error rather than a silent skip.
 */
export const selectDevFrontends = (
  frontends: Record<string, PikkuFrontend> | undefined,
  only?: readonly string[]
): DevFrontend[] => {
  const entries = Object.entries(frontends ?? {})
  for (const name of only ?? []) {
    const frontend = frontends?.[name]
    if (!frontend) {
      throw new Error(
        `--frontend ${name}: no such frontend. Declared: ${entries.map(([n]) => n).join(', ') || 'none'}.`
      )
    }
    if (!frontend.dev?.command?.length) {
      throw new Error(
        `--frontend ${name}: it has no "dev.command" in pikku.config.json.`
      )
    }
  }
  return entries
    .filter(([name]) => !only || only.includes(name))
    .flatMap(([name, frontend]) =>
      frontend.dev?.command?.length
        ? [
            {
              name,
              cwd: frontend.cwd,
              command: frontend.dev.command,
              port: frontend.dev.port,
              healthPath: frontend.dev.healthPath,
              primary: !!frontend.primary,
            },
          ]
        : []
    )
    .sort((a, b) => Number(b.primary) - Number(a.primary))
}

/** `--frontend a,b` or a repeated flag, as a list of names. */
export const parseFrontendNames = (
  value: string | string[] | undefined
): string[] | undefined => {
  if (value === undefined) return undefined
  const names = (Array.isArray(value) ? value : [value])
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean)
  return names.length > 0 ? names : undefined
}

/** Prefix every complete line, holding a partial one until its newline arrives. */
export const createLinePrefixer = (
  prefix: string,
  write: (line: string) => void
) => {
  let pending = ''
  return {
    push(chunk: string) {
      pending += chunk
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) write(`${prefix}${line}`)
    },
    flush() {
      if (pending) write(`${prefix}${pending}`)
      pending = ''
    },
  }
}

/** Any HTTP answer below 500 means the dev server is up and routing. */
export const waitForHealth = async (
  url: string,
  options: {
    timeoutMs?: number
    pollMs?: number
    aborted: () => boolean
    fetchImpl?: typeof fetch
  }
): Promise<void> => {
  const { timeoutMs = 120_000, pollMs = 250, aborted } = options
  const doFetch = options.fetchImpl ?? fetch
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (aborted()) throw new Error('stopped before it became healthy')
    try {
      const res = await doFetch(url, { redirect: 'manual' })
      if (res.status < 500) return
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, pollMs))
  }
  throw new Error(`${url} did not answer within ${timeoutMs / 1000}s`)
}

export type RunningFrontends = {
  /** Resolves with the first failure; never resolves while everything runs. */
  failure: Promise<{ name: string; reason: string }>
  stop: () => void
  urls: Array<{ name: string; url: string; primary: boolean }>
}

export type StartFrontendsOptions = {
  frontends: DevFrontend[]
  /** Builds the environment for one frontend's directory. */
  envFor: (frontend: DevFrontend) => Env
  write: (line: string) => void
  host?: string
  healthTimeoutMs?: number
  spawnImpl?: typeof spawn
}

/**
 * Start every frontend's dev server beside the API, prefix its output with its
 * name, and wait until each answers on its health path. The returned `failure`
 * promise settles when any of them exits, so the caller can stop everything:
 * a half-running stack (frontend up, API down) reads as an app bug.
 */
export const startDevFrontends = async ({
  frontends,
  envFor,
  write,
  host = 'localhost',
  healthTimeoutMs,
  spawnImpl = spawn,
}: StartFrontendsOptions): Promise<RunningFrontends> => {
  for (const frontend of frontends) {
    await assertPortFree(frontend.port)
  }
  const width = Math.max(0, ...frontends.map((f) => f.name.length))
  const children: ChildProcess[] = []
  let stopped = false
  let reportFailure!: (failure: { name: string; reason: string }) => void
  const failure = new Promise<{ name: string; reason: string }>((resolve) => {
    reportFailure = resolve
  })

  const stop = () => {
    stopped = true
    for (const child of children) {
      if (child.exitCode === null && !child.killed) child.kill('SIGTERM')
    }
  }

  for (const frontend of frontends) {
    const prefix = `[${frontend.name.padEnd(width)}] `
    const [command, ...args] = frontend.command
    const child = spawnImpl(command!, args, {
      cwd: frontend.cwd,
      env: envFor(frontend) as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    children.push(child)
    const out = createLinePrefixer(prefix, write)
    const err = createLinePrefixer(prefix, write)
    child.stdout?.on('data', (d) => out.push(String(d)))
    child.stderr?.on('data', (d) => err.push(String(d)))
    child.on('error', (error) => {
      if (!stopped) {
        reportFailure({
          name: frontend.name,
          reason: `failed to start: ${error.message}`,
        })
      }
    })
    child.on('exit', (code, signal) => {
      out.flush()
      err.flush()
      if (!stopped) {
        reportFailure({
          name: frontend.name,
          reason: `exited (${signal ?? code})`,
        })
      }
    })
  }

  const urls = frontends.map((frontend) => ({
    name: frontend.name,
    url: `http://${host}:${frontend.port}${frontend.healthPath}`,
    primary: frontend.primary,
  }))

  try {
    await Promise.race([
      Promise.all(
        frontends.map((frontend, i) =>
          waitForHealth(urls[i]!.url, {
            timeoutMs: healthTimeoutMs,
            aborted: () => stopped,
          }).catch((error) => {
            throw new Error(
              `frontend "${frontend.name}": ${error instanceof Error ? error.message : String(error)}`
            )
          })
        )
      ),
      failure.then(({ name, reason }) => {
        throw new Error(`frontend "${name}" ${reason}`)
      }),
    ])
  } catch (error) {
    stop()
    throw error
  }
  return { failure, stop, urls }
}
