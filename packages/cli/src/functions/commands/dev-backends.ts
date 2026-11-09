import { spawn, type ChildProcess } from 'node:child_process'
import {
  assertPortFree,
  createReadyBarrier,
} from '../../server/spawn-dev-server.js'
import { selectBackends } from '../../utils/select-backends.js'
import { createLinePrefixer } from './dev-frontends.js'
import { resolveDevPort } from './environment.js'
import type { PikkuEnvironment } from './environment.js'

/** The signal a backend process takes as "the parent finished a codegen pass". */
export const BACKEND_RELOAD_SIGNAL = 'SIGUSR2'

/** What `pikku dev` was given that a backend process must be given too. */
export type DevPassthrough = {
  config?: string
  logLevel?: string
  coverage?: boolean
  test?: boolean
  model?: string
  hmr?: boolean
}

export type DevBackendProcess = {
  name: string
  port: number
  /** Arguments after the CLI script, in the order they are passed. */
  args: string[]
}

/**
 * How one `pikku dev` invocation is carried out.
 *
 * - `inline`: this process is the server. One backend is selected, either the
 *   only one declared or the one `--backend` names. `backend` is set only when
 *   it was named, in which case the process serves that backend's generated
 *   tree under its filter; with the lone backend unnamed it serves the shared
 *   `.pikku` as it always has.
 * - `parent`: two or more backends are selected. This process runs codegen once
 *   and watches; each backend is its own child process on its own port, serving
 *   `.pikku/backends/<name>` and running no codegen of its own.
 */
export type DevPlan =
  | { mode: 'inline'; backend?: string; port: number }
  | { mode: 'parent'; processes: DevBackendProcess[] }

type PlanConfig = {
  backends?: Record<string, { dev?: { port?: number } }>
  environments?: Record<string, PikkuEnvironment>
}

/** Arguments that make a child serve one backend and nothing else. */
export const backendProcessArgs = (
  name: string,
  port: number,
  passthrough: DevPassthrough
): string[] => {
  const args = [
    'dev',
    '--backend',
    name,
    '--port',
    String(port),
    // The parent owns codegen, the watcher, the frontends and the dev address.
    '--serveOnly',
    '--no-watch',
    '--no-frontends',
  ]
  if (passthrough.config) args.push(`--config=${passthrough.config}`)
  if (passthrough.logLevel) args.push(`--logLevel=${passthrough.logLevel}`)
  if (passthrough.coverage) args.push('--coverage')
  if (passthrough.test) args.push('--test')
  if (passthrough.model) args.push(`--model=${passthrough.model}`)
  if (passthrough.hmr === false) args.push('--no-hmr')
  return args
}

export const planDev = (
  config: PlanConfig,
  options: {
    backend?: string
    port?: string
    passthrough?: DevPassthrough
  }
): DevPlan => {
  const selected = selectBackends(config.backends, options.backend)
  const hasPort = options.port !== undefined && options.port !== ''
  if (selected.length <= 1) {
    const [name] = selected
    // A named backend that declares its own port serves there; --port still wins.
    const declared = options.backend
      ? config.backends?.[options.backend]?.dev?.port
      : undefined
    const port =
      !hasPort && declared !== undefined
        ? declared
        : resolveDevPort(options.port, config.environments ?? {})
    return {
      mode: 'inline',
      ...(options.backend ? { backend: name } : {}),
      port,
    }
  }
  if (hasPort) {
    throw new Error(
      `--port names one port and ${selected.length} backends are selected (${selected.join(', ')}). Each runs on its own backends.<name>.dev.port; pick one with --backend <name> to use --port.`
    )
  }
  return {
    mode: 'parent',
    processes: selected.map((name) => {
      const port = config.backends![name]?.dev?.port
      if (port === undefined) {
        throw new Error(
          `backends.${name}.dev.port is required: ${selected.length} backends are selected and each runs as its own process on its own port.`
        )
      }
      return {
        name,
        port,
        args: backendProcessArgs(name, port, options.passthrough ?? {}),
      }
    }),
  }
}

export type RunningBackends = {
  /** Resolves with the first failure; never resolves while everything runs. */
  failure: Promise<{ name: string; reason: string }>
  /** Tell every backend the shared codegen output changed. */
  reload: () => void
  /** SIGTERM to every backend, then SIGKILL to any still up after `graceMs`. */
  stop: (graceMs?: number) => Promise<void>
}

export type StartBackendsOptions = {
  processes: DevBackendProcess[]
  cwd: string
  env?: NodeJS.ProcessEnv
  write: (line: string) => void
  readyTimeoutMs?: number
  spawnImpl?: typeof spawn
  /** Defaults to this CLI's own script, run with this runtime. */
  command?: { execPath: string; leading: string[] }
}

/**
 * Start each backend as its own process, prefix its output with its name, and
 * wait until each has printed the ready line. `failure` settles when any exits,
 * so the caller can stop everything: one backend down reads as an app bug.
 */
export const startDevBackends = async ({
  processes,
  cwd,
  env,
  write,
  readyTimeoutMs,
  spawnImpl = spawn,
  command = {
    execPath: process.execPath,
    leading: [...process.execArgv, process.argv[1]!],
  },
}: StartBackendsOptions): Promise<RunningBackends> => {
  for (const { port } of processes) await assertPortFree(port)
  const width = Math.max(0, ...processes.map((p) => p.name.length))
  const children: ChildProcess[] = []
  let stopped = false
  let reportFailure!: (failure: { name: string; reason: string }) => void
  const failure = new Promise<{ name: string; reason: string }>((resolve) => {
    reportFailure = resolve
  })
  const stop = async (graceMs = 5000) => {
    stopped = true
    const alive = children.filter((c) => c.exitCode === null && !c.killed)
    const exited = Promise.all(
      alive.map(
        (c) => new Promise<void>((done) => c.once('exit', () => done()))
      )
    )
    for (const child of alive) child.kill('SIGTERM')
    const timer = setTimeout(() => {
      for (const child of alive) {
        if (child.exitCode === null) child.kill('SIGKILL')
      }
    }, graceMs)
    await exited
    clearTimeout(timer)
  }
  const barriers = processes.map((p) =>
    createReadyBarrier(`backend "${p.name}"`)
  )

  processes.forEach((proc, i) => {
    const prefix = `[${proc.name.padEnd(width)}] `
    const child = spawnImpl(
      command.execPath,
      [...command.leading, ...proc.args],
      {
        cwd,
        env: { ...process.env, ...env, PIKKU_NO_LOGO: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    )
    children.push(child)
    const out = createLinePrefixer(prefix, write)
    const err = createLinePrefixer(prefix, write)
    child.stdout?.on('data', (d) => {
      barriers[i]!.observe(String(d))
      out.push(String(d))
    })
    child.stderr?.on('data', (d) => err.push(String(d)))
    child.on('error', (error) => {
      barriers[i]!.markExited(null)
      if (!stopped) {
        reportFailure({
          name: proc.name,
          reason: `failed to start: ${error.message}`,
        })
      }
    })
    child.on('exit', (code, signal) => {
      out.flush()
      err.flush()
      barriers[i]!.markExited(code)
      if (!stopped) {
        reportFailure({ name: proc.name, reason: `exited (${signal ?? code})` })
      }
    })
  })

  try {
    await Promise.all(
      barriers.map((b) => b.wait({ timeoutMs: readyTimeoutMs }))
    )
  } catch (error) {
    await stop()
    throw error
  }
  return {
    failure,
    stop,
    reload: () => {
      for (const child of children) {
        if (child.exitCode === null && !child.killed) {
          child.kill(BACKEND_RELOAD_SIGNAL)
        }
      }
    },
  }
}
