import { connect } from 'net'

/**
 * Rejects if anything is already listening on `port`.
 *
 * The readiness poll cannot tell "my backend" from "someone else's": it accepts
 * any 2xx from a seeded guest sign-in, and several agents share this checkout,
 * so a stale backend left on the target port silently absorbs a whole suite run
 * and reports failures that belong to code nobody is looking at. A TCP-level
 * check before spawning is the only point at which the two are distinguishable
 * — after spawn, both processes answer on the same address.
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
          `Port ${port} is already in use — another backend is listening on ${host}:${port}. ` +
            `Stop it, or run this suite against a free port with API_URL=http://localhost:<port>.`
        )
      )
    )
    // Nothing listening, or unreachable: either way this process is free to bind.
    socket.on('error', () => settle())
    socket.on('timeout', () => settle())
  })
