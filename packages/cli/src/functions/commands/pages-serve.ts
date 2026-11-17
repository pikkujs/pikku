import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process'
import type { spawn } from 'node:child_process'
import {
  selectDevFrontends,
  onProcessEnd,
  startDevFrontends,
  waitForHealth,
  type DevFrontend,
} from './dev-frontends.js'
import type { Env } from './dev-env.js'

/**
 * `pikku ui pages compare` without --baseUrl: the frontend's own dev server,
 * from `frontends.<name>.dev` in pikku.config.json. One already answering on
 * its port is used as it is; otherwise its dev command is started from its
 * directory, waited for on its healthPath, and stopped when the compare is
 * done. Only the frontend is started: the API is not. A data-driven page is
 * compared as served, so with no API running it is photographed without its
 * data, and the result says so.
 *
 * `isolate` (a changeset worktree of a parallel loop): whatever answers on the
 * configured ports may be another checkout's code, so it is never used. This
 * tree's backend (`backend`, `pikku dev --serveOnly`) is started on a free
 * port, the dev command on another (`--port <n>` appended, PORT set) with
 * VITE_API_PROXY pointing at that backend, and both are stopped after, each
 * as its whole process group. With no backend to start, data pages go to
 * whatever answers on the API's configured port, and the result says so.
 */

/**
 * How this tree's own backend is started: the command, `--port <n>` is appended.
 * `migrate` runs first: a worktree's dev database starts empty (it is not in
 * git), and the backend refuses to start on a schema it does not have.
 */
export type OwnBackend = { cwd: string; command: string[]; migrate?: string[] }

/** A port nothing is listening on right now. */
export const findFreePort = (): Promise<number> =>
  new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() =>
        typeof address === 'object' && address
          ? resolvePort(address.port)
          : reject(new Error('no free port'))
      )
    })
  })

export type Served = {
  baseUrl: string
  /** True when this compare started the dev server (and will stop it). */
  started: boolean
  command: string | null
  /** Set when the API the frontend proxies to did not answer. */
  apiNote: string | null
  stop: () => void | Promise<void>
}

type Group = { child: ChildProcess; stop: () => Promise<void> }

/**
 * A process started in its own group, so stopping it takes whatever it
 * started too (bun run → vite, pikku dev → its runner): SIGTERM to the group,
 * SIGKILL after `graceMs`. If this process exits first, the group is killed.
 */
export const spawnGroup = (
  command: string[],
  options: {
    cwd: string
    env: NodeJS.ProcessEnv
    write: (line: string) => void
  },
  spawnImpl: typeof spawn = nodeSpawn,
  graceMs = 5000
): Group => {
  const [cmd, ...args] = command
  const child = spawnImpl(cmd!, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  for (const stream of [child.stdout, child.stderr])
    stream?.on('data', (d) =>
      String(d)
        .split('\n')
        .filter(Boolean)
        .forEach((line) => options.write(line))
    )
  child.on('error', () => {})
  const kill = (signal: NodeJS.Signals) => {
    if (!child.pid) return
    try {
      process.kill(-child.pid, signal)
    } catch {}
  }
  const offEnd = onProcessEnd(() => kill('SIGKILL'))
  const exited = new Promise<void>((done) => {
    if (child.exitCode !== null || child.signalCode !== null) done()
    child.once('exit', () => done())
    child.once('error', () => done())
  })
  const stop = async () => {
    offEnd()
    kill('SIGTERM')
    const timer = new Promise<'late'>((done) =>
      setTimeout(() => done('late'), graceMs).unref()
    )
    if (
      (await Promise.race([exited.then(() => 'gone' as const), timer])) ===
      'late'
    )
      kill('SIGKILL')
    // the leader is gone; anything it left in the group goes too
    kill('SIGKILL')
  }
  return { child, stop }
}

/** Runs a command to its end; resolves with the tail of its output when it fails, else null. */
const runOnce = (
  command: string[],
  cwd: string,
  spawnImpl: typeof nodeSpawn,
  timeoutMs = 120_000
): Promise<string | null> =>
  new Promise((done) => {
    const [cmd, ...args] = command
    let tail = ''
    const child = spawnImpl(cmd!, args, {
      cwd,
      env: { ...process.env, PIKKU_NO_LOGO: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const keep = (d: unknown) => (tail = (tail + String(d)).slice(-800))
    child.stdout?.on('data', keep)
    child.stderr?.on('data', keep)
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.once('error', (error) => (clearTimeout(timer), done(error.message)))
    child.once(
      'close',
      (code) => (
        clearTimeout(timer),
        done(
          code === 0
            ? null
            : tail.trim().split('\n').slice(-6).join('\n') || `exit ${code}`
        )
      )
    )
  })

/** The frontend whose directory is `appDir`, among those with a dev command. */
export const devFrontendFor = (
  frontends: Parameters<typeof selectDevFrontends>[0],
  appDir: string
): DevFrontend | null =>
  selectDevFrontends(frontends).find(
    (frontend) => resolve(frontend.cwd) === resolve(appDir)
  ) ?? null

/** Does `url` answer 2xx or 3xx? */
export const answersOk = async (
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> => {
  try {
    const res = await fetchImpl(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    })
    return res.status >= 200 && res.status < 400
  } catch {
    return false
  }
}

/** Does anything answer at `url` at all (any status)? */
const answersAtAll = async (
  url: string,
  fetchImpl: typeof fetch
): Promise<boolean> => {
  try {
    await fetchImpl(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    })
    return true
  } catch {
    return false
  }
}

export const serveFrontend = async ({
  frontend,
  apiUrl,
  envFor,
  write = (line) => process.stderr.write(`${line}\n`),
  healthTimeoutMs = 120_000,
  fetchImpl = fetch,
  spawnImpl,
  isolate = false,
  freePort = findFreePort,
  backend,
}: {
  frontend: DevFrontend
  /** The API the frontend proxies to (VITE_API_PROXY), as `pikku dev` sets it. */
  apiUrl?: string
  envFor: (frontend: DevFrontend) => Env
  write?: (line: string) => void
  healthTimeoutMs?: number
  fetchImpl?: typeof fetch
  spawnImpl?: typeof spawn
  /** Never reuse a server on the configured port; start one on a free port. */
  isolate?: boolean
  freePort?: () => Promise<number>
  /** With `isolate`: this tree's backend, started on its own free port. */
  backend?: OwnBackend | null
}): Promise<Served> => {
  let ownBackend: Group | null = null
  let isolateNote: string | null = null
  if (isolate && backend) {
    const apiPort = await freePort()
    const tail: string[] = []
    const command = [...backend.command, '--port', String(apiPort)]
    const migrateFailed = backend.migrate
      ? await runOnce(
          backend.migrate,
          backend.cwd,
          (spawnImpl ?? nodeSpawn) as typeof nodeSpawn
        )
      : null
    if (migrateFailed)
      write(`${backend.migrate!.slice(1).join(' ')} failed: ${migrateFailed}`)
    write(
      `Starting this tree's backend (${command.join(' ')}) on port ${apiPort} for the compare...`
    )
    const group = spawnGroup(
      command,
      {
        cwd: backend.cwd,
        env: { ...process.env, PIKKU_NO_LOGO: '1' },
        write: (line) => {
          tail.push(line)
          if (tail.length > 20) tail.shift()
        },
      },
      spawnImpl
    )
    let gone = false
    group.child.once('exit', () => {
      gone = true
    })
    try {
      await waitForHealth(`http://localhost:${apiPort}/`, {
        timeoutMs: healthTimeoutMs,
        aborted: () => gone,
        fetchImpl,
      })
      ownBackend = group
    } catch (error) {
      await group.stop()
      // never another checkout's API: pages that load data go without it
      isolateNote = `This tree's backend did not start for the compare (${command.join(' ')} in ${backend.cwd}: ${error instanceof Error ? error.message : String(error)}), so pages that load data were photographed without their data.${tail.length ? `\n${tail.slice(-8).join('\n')}` : ''}${migrateFailed ? `\nIts database migration failed first (${backend.migrate!.slice(1).join(' ')}): ${migrateFailed}` : ''}`
    }
    // the proxy goes to this tree's backend, or to nothing at all
    apiUrl = `http://localhost:${apiPort}`
  } else if (isolate) {
    isolateNote = `This changeset worktree's backend was not started (no backends.<name> in pikku.config.json), so pages that load data were photographed against ${apiUrl ?? 'whatever answers on the API port'}, which may be another checkout's backend.`
  }
  const proxy = isolate && backend ? apiUrl : undefined
  if (isolate) {
    const port = await freePort()
    frontend = {
      ...frontend,
      port,
      command: [...frontend.command, '--port', String(port)],
    }
    const base = envFor
    envFor = (f) => ({ ...base(f), PORT: String(port) })
  }
  const baseUrl = `http://localhost:${frontend.port}`
  const apiNote =
    isolateNote ??
    (apiUrl && !(await answersAtAll(apiUrl, fetchImpl))
      ? `The API at ${apiUrl} did not answer, so pages that load data were photographed without it. Run \`pikku dev\` first to compare them with their data.`
      : null)
  if (
    !isolate &&
    (await answersOk(`${baseUrl}${frontend.healthPath}`, fetchImpl))
  )
    return { baseUrl, started: false, command: null, apiNote, stop: () => {} }
  const command = frontend.command.join(' ')
  write(
    `Starting ${frontend.name} (${command}) on port ${frontend.port} for the compare...`
  )
  // the dev server's own output would bury the report; its last lines are
  // kept for when it does not come up
  const tail: string[] = []
  let running: Awaited<ReturnType<typeof startDevFrontends>>
  try {
    running = await startDevFrontends({
      frontends: [frontend],
      envFor: (f) => {
        const env = envFor(f)
        if (proxy) env.VITE_API_PROXY = proxy
        else if (apiUrl) env.VITE_API_PROXY ??= apiUrl
        return env
      },
      group: isolate,
      write: (line) => {
        tail.push(line)
        if (tail.length > 20) tail.shift()
      },
      healthTimeoutMs,
      ...(spawnImpl ? { spawnImpl } : {}),
    })
  } catch (error) {
    await ownBackend?.stop()
    throw new Error(
      `Could not start ${frontend.name} for the compare (${command} in ${frontend.cwd}): ${error instanceof Error ? error.message : String(error)}${tail.length ? `\n${tail.join('\n')}` : ''}\n${isolate ? `In a changeset worktree the compare starts its own server on a free port (${command}); the dev command has to accept --port. ` : ''}Start it yourself, or pass --baseUrl.`
    )
  }
  const stopFrontend = running.stop
  return {
    baseUrl,
    started: true,
    command: ownBackend
      ? `${command} (API: this tree's backend at ${apiUrl})`
      : command,
    apiNote,
    stop: async () => {
      await stopFrontend()
      await ownBackend?.stop()
    },
  }
}
