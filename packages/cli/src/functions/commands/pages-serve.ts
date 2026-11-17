import { createServer } from 'node:net'
import { resolve } from 'node:path'
import type { spawn } from 'node:child_process'
import {
  selectDevFrontends,
  startDevFrontends,
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
 * `isolate` (a changeset worktree): whatever answers on the configured port
 * may be another checkout's code, so it is never used. The dev command is
 * started on a free port (`--port <n>` appended, PORT set) and stopped after.
 */

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
  stop: () => void
}

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
}): Promise<Served> => {
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
    apiUrl && !(await answersAtAll(apiUrl, fetchImpl))
      ? `The API at ${apiUrl} did not answer, so pages that load data were photographed without it. Run \`pikku dev\` first to compare them with their data.`
      : null
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
        if (apiUrl) env.VITE_API_PROXY ??= apiUrl
        return env
      },
      write: (line) => {
        tail.push(line)
        if (tail.length > 20) tail.shift()
      },
      healthTimeoutMs,
      ...(spawnImpl ? { spawnImpl } : {}),
    })
  } catch (error) {
    throw new Error(
      `Could not start ${frontend.name} for the compare (${command} in ${frontend.cwd}): ${error instanceof Error ? error.message : String(error)}${tail.length ? `\n${tail.join('\n')}` : ''}\n${isolate ? `In a changeset worktree the compare starts its own server on a free port (${command}); the dev command has to accept --port. ` : ''}Start it yourself, or pass --baseUrl.`
    )
  }
  return { baseUrl, started: true, command, apiNote, stop: running.stop }
}
