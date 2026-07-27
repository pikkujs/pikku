import { spawn, type ChildProcess } from 'node:child_process'
import { connect } from 'node:net'

import { SERVER_READY_MARKER } from './server-ready.js'

/**
 * Rejects if anything is already listening on `port`.
 *
 * A readiness check cannot tell "my server" from "someone else's": both answer
 * on the same address once spawned, so a stale server left on the target port
 * silently absorbs a whole run and reports failures that belong to code nobody
 * is looking at. A TCP-level check before spawning is the only point at which
 * the two are distinguishable.
 */
export const assertPortFree = (
  port: number,
  host = '127.0.0.1',
  timeoutMs = 1000
): Promise<void> =>
  new Promise((resolve, reject) => {
    const socket = connect({ port, host })

    const settle = (error?: Error) => {
      socket.removeAllListeners()
      socket.destroy()
      error ? reject(error) : resolve()
    }

    socket.setTimeout(timeoutMs)
    socket.on('connect', () =>
      settle(
        new Error(
          `Port ${port} is already in use — something is already listening on ${host}:${port}. ` +
            `Stop it, or point this environment's apiUrl at a free port.`
        )
      )
    )
    // Nothing listening, or unreachable: either way this process is free to bind.
    socket.on('error', () => settle())
    socket.on('timeout', () => settle())
  })

export interface ReadyBarrier {
  /** Feed a chunk of the child's output. */
  observe: (text: string) => void
  /** Record that the child exited, so the wait fails fast instead of timing out. */
  markExited: (code: number | null) => void
  wait: (options?: { timeoutMs?: number; pollMs?: number }) => Promise<void>
}

/**
 * Watches a spawned server's output for the ready marker. Separated from the
 * spawn so the three outcomes that matter — ready, the child died, nothing
 * happened for long enough — are testable without a real process.
 */
export const createReadyBarrier = (label: string): ReadyBarrier => {
  let ready = false
  let exit: { code: number | null } | undefined
  // Stdout arrives in arbitrary chunks, so the marker can straddle two of them.
  // Keep just enough of the tail to rejoin a split marker.
  let tail = ''

  return {
    observe: (text: string) => {
      if (ready) return
      const window = tail + text
      if (window.includes(SERVER_READY_MARKER)) {
        ready = true
        tail = ''
        return
      }
      tail = window.slice(-SERVER_READY_MARKER.length)
    },
    markExited: (code: number | null) => {
      exit = { code }
    },
    wait: async ({ timeoutMs = 120_000, pollMs = 100 } = {}) => {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        if (ready) return
        if (exit) {
          throw new Error(
            `${label} exited with code ${exit.code} before it was ready`
          )
        }
        await new Promise((r) => setTimeout(r, pollMs))
      }
      throw new Error(
        `${label} did not report ready within ${timeoutMs / 1000} seconds`
      )
    },
  }
}

export interface SpawnedServer {
  /** Kills the whole process group, so the server's own children go with it. */
  stop: () => void
  /** Resolves on the ready marker; rejects if the server dies or never reports. */
  waitUntilReady: (options?: { timeoutMs?: number }) => Promise<void>
}

export interface SpawnDevServerOptions {
  cwd: string
  port: number
  hostname?: string
  coverage?: boolean
  /** Passed through as `--test`, which sets PIKKU_TEST_RUN for isTestRun(). */
  test?: boolean
  env?: NodeJS.ProcessEnv
  /** Where the server's own output goes. Defaults to this process's streams. */
  onOutput?: (text: string) => void
}

/**
 * Start `pikku dev` as its own process group and stream its output under a
 * `[server]` prefix. Does not wait — call `waitUntilReady`.
 */
export const spawnDevServer = async (
  options: SpawnDevServerOptions
): Promise<SpawnedServer> => {
  const {
    cwd,
    port,
    hostname = '127.0.0.1',
    coverage,
    test = true,
    env,
    onOutput = (text) => process.stdout.write(text),
  } = options

  await assertPortFree(port, hostname)

  const args = ['pikku', 'dev', '--port', String(port)]
  if (coverage) args.push('--coverage')
  if (test) args.push('--test')

  const child: ChildProcess = spawn('npx', args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'pipe',
    detached: true,
  })

  const barrier = createReadyBarrier('Server')

  const forward = (chunk: Buffer) => {
    const text = chunk.toString()
    barrier.observe(text)
    onOutput(
      text
        .split('\n')
        .map((line) => (line ? `[server] ${line}` : line))
        .join('\n')
    )
  }
  child.stdout?.on('data', forward)
  child.stderr?.on('data', forward)
  child.on('exit', (code) => barrier.markExited(code))

  return {
    waitUntilReady: barrier.wait,
    stop: () => {
      child.stdout?.destroy()
      child.stderr?.destroy()
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGTERM')
        } catch {
          // Process group may already be gone
        }
      }
    },
  }
}
