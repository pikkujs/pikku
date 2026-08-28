/**
 * Environment variable a desktop shell uses to tell its sidecar which process
 * it must not outlive.
 */
export const PARENT_PID_ENV = 'PIKKU_PARENT_PID'

/**
 * Environment variable a desktop shell uses to tell its sidecar where the
 * SQLite file, uploaded content and runtime state belong. The shell resolves
 * it from the platform's own app-data location, because a binary launched by
 * double-click has no meaningful working directory.
 */
export const DATA_DIR_ENV = 'PIKKU_DATA_DIR'

export type ParentWatchOptions = {
  /** Where the parent pid is read from. Defaults to `process.env`. */
  env?: Record<string, string | undefined>
  /** Probe for whether a pid is still running. Defaults to signal 0. */
  isAlive?: (pid: number) => boolean
  /** Run when the parent is found to be gone. Defaults to exiting cleanly. */
  onOrphaned?: () => void
  intervalMs?: number
}

export type ParentWatch = {
  /** False when no usable parent pid was supplied — the watch is inert. */
  readonly watching: boolean
  readonly parentPid: number | undefined
  /** True only if the poll timer would hold the event loop open. */
  readonly holdsProcessOpen: boolean
  /** Probe immediately rather than waiting for the next interval. */
  checkNow(): void
  stop(): void
}

/**
 * A pid is alive if signalling it succeeds. `EPERM` also means alive — the
 * process exists but belongs to another user — and only `ESRCH` means gone.
 */
const defaultIsAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

const parsePid = (raw: string | undefined): number | undefined => {
  if (!raw) return undefined
  if (!/^\d+$/.test(raw)) return undefined
  const pid = Number(raw)
  return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined
}

/**
 * Exit when the process that spawned us does.
 *
 * Tauri kills its sidecar on a clean exit, but a hard crash of the shell never
 * runs that path. An orphaned pikku server keeps the SQLite file open, and the
 * next launch — which single-instance only guards against a second *shell* —
 * would be a second writer against the same database. Polling the parent is the only portable answer: neither
 * `process.on('disconnect')` (no IPC channel here) nor a closed stdin is
 * reliable across the platforms a desktop build targets.
 *
 * With no parent pid in the environment the watch is inert, so a server run
 * from a terminal or a container behaves exactly as it did before.
 */
export const watchParentProcess = (
  options: ParentWatchOptions = {}
): ParentWatch => {
  const env = options.env ?? process.env
  const isAlive = options.isAlive ?? defaultIsAlive
  const onOrphaned = options.onOrphaned ?? (() => process.exit(0))
  const intervalMs = options.intervalMs ?? 1_000

  const parentPid = parsePid(env[PARENT_PID_ENV])

  let timer: ReturnType<typeof setInterval> | undefined
  let fired = false

  const stop = () => {
    if (timer) {
      clearInterval(timer)
      timer = undefined
    }
  }

  const checkNow = () => {
    if (parentPid === undefined || fired) return
    if (isAlive(parentPid)) return
    fired = true
    stop()
    onOrphaned()
  }

  if (parentPid !== undefined) {
    timer = setInterval(checkNow, intervalMs)
    // The watch is a guard, not a reason to stay running: a server that has
    // finished its work must still be allowed to exit.
    timer.unref?.()
  }

  return {
    get watching() {
      return timer !== undefined
    },
    parentPid,
    get holdsProcessOpen() {
      return timer?.hasRef?.() ?? false
    },
    checkNow,
    stop,
  }
}
