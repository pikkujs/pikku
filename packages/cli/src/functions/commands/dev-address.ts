import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Where a running `pikku dev` says it ended up.
 *
 * The port a dev server announces is not the port it was asked for: `--port 0`
 * asks the OS for one, and a busy 3000 is the ordinary case on a machine that is
 * already running something. Everything downstream — a scenario run, a frontend
 * proxy, a person reading their own terminal — then targets the configured port
 * and gets a connection refused that looks like a broken app.
 *
 * It lives in the runtime directory rather than the generated one because it is
 * state about a process, not an artifact of codegen, and it is meaningless the
 * moment that process is gone.
 */
export interface DevAddress {
  apiUrl: string
  pid: number
  startedAt: string
}

const addressPath = (runtimeDir: string): string =>
  join(runtimeDir, 'dev-address.json')

export const writeDevAddress = (runtimeDir: string, apiUrl: string): void => {
  const path = addressPath(runtimeDir)
  mkdirSync(dirname(path), { recursive: true })
  const address: DevAddress = {
    apiUrl,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  }
  writeFileSync(path, `${JSON.stringify(address, null, 2)}\n`, 'utf8')
}

export const clearDevAddress = (runtimeDir: string): void => {
  rmSync(addressPath(runtimeDir), { force: true })
}

/**
 * The address only if the process that wrote it is still alive — a dev server
 * killed with SIGKILL, or one whose machine rebooted, never got to clear it, and
 * a stale address is worse than none. Signal 0 checks liveness without sending
 * anything; EPERM means a process owns that id, so it counts as alive.
 */
export const readDevAddress = (runtimeDir: string): DevAddress | null => {
  const path = addressPath(runtimeDir)
  if (!existsSync(path)) return null
  let address: DevAddress
  try {
    address = JSON.parse(readFileSync(path, 'utf8')) as DevAddress
  } catch {
    return null
  }
  if (typeof address?.apiUrl !== 'string' || typeof address?.pid !== 'number') {
    return null
  }
  try {
    process.kill(address.pid, 0)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EPERM') return null
  }
  return address
}
