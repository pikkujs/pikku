import { readFile, rm, writeFile } from 'node:fs/promises'

/**
 * A process's start time in clock ticks since boot (field 22 of `/proc/<pid>/stat`), which tells a
 * process from a later one given the same pid. Undefined where there is no `/proc` or no process.
 */
export const processStartTime = async (
  pid: number
): Promise<string | undefined> => {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8')
    // the command name (field 2) is in parentheses and may hold spaces or parentheses itself
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    return fields[19]
  } catch {
    return undefined
  }
}

const zombie = async (pid: number) => {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z')
  } catch {
    return false
  }
}

const signalled = (target: number, signal: NodeJS.Signals | 0) => {
  try {
    process.kill(target, signal)
    return true
  } catch (error) {
    // EPERM: it is there, but not ours to signal
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** The process is running (an exited process not yet reaped is not). */
export const isAlive = async (pid: number) =>
  signalled(pid, 0) && !(await zombie(pid))

/** Some process of the group is still there. */
export const groupAlive = (pgid: number) => signalled(-pgid, 0)

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms))

const waitGone = async (pgid: number, ms: number) => {
  const until = Date.now() + ms
  while (groupAlive(pgid)) {
    if (Date.now() >= until) return false
    await pause(Math.min(50, ms))
  }
  return true
}

/**
 * Stops a whole process group: SIGTERM, then SIGKILL once `graceMs` has passed with any member
 * left. Resolves when the group is gone (or a short wait after SIGKILL). Returns how it ended.
 */
export const stopGroup = async (
  pgid: number,
  graceMs: number
): Promise<'gone' | 'terminated' | 'killed'> => {
  if (!groupAlive(pgid)) return 'gone'
  signalled(-pgid, 'SIGTERM')
  if (await waitGone(pgid, graceMs)) return 'terminated'
  signalled(-pgid, 'SIGKILL')
  await waitGone(pgid, 2_000)
  return 'killed'
}

/** What `pi.lock` records about the Pi process running in a worktree. */
export type PiLock = {
  pid: number
  /** Pi is started as the leader of its own group, so this equals `pid`. */
  pgid: number
  /** `processStartTime(pid)` when it was started; absent where it cannot be read. */
  startTime?: string
  sessionId: string
  startedAt: string
}

export const readLock = async (path: string): Promise<PiLock | undefined> => {
  try {
    const lock = JSON.parse(await readFile(path, 'utf8')) as PiLock
    return Number.isInteger(lock.pid) &&
      Number.isInteger(lock.pgid) &&
      lock.pid > 1 &&
      lock.pgid > 1
      ? lock
      : undefined
  } catch {
    return undefined
  }
}

export const writeLock = (path: string, lock: PiLock) =>
  writeFile(path, `${JSON.stringify(lock)}\n`)

/** Removes the lock if it is still the one `pid` wrote. */
export const removeLock = async (path: string, pid: number) => {
  const lock = await readLock(path)
  if (lock && lock.pid !== pid) return
  await rm(path, { force: true })
}

export type OrphanOutcome =
  | { action: 'none' }
  | { action: 'killed'; lock: PiLock; how: 'gone' | 'terminated' | 'killed' }
  | { action: 'stale'; lock: PiLock }

/**
 * Before a launch: a lock left by a Pi that is still running (same pid and same start time) means an
 * earlier process of ours died without stopping it, so its whole group is stopped. A lock whose pid
 * is gone or now belongs to another process (a different start time) is only removed.
 */
export const clearOrphan = async (
  path: string,
  graceMs: number
): Promise<OrphanOutcome> => {
  const raw = await readFile(path, 'utf8').catch(() => undefined)
  if (raw === undefined) return { action: 'none' }
  const lock = await readLock(path)
  if (!lock) {
    await rm(path, { force: true })
    return { action: 'none' }
  }
  const startTime = await processStartTime(lock.pid)
  const same =
    lock.pid !== process.pid &&
    lock.startTime !== undefined &&
    startTime === lock.startTime &&
    (await isAlive(lock.pid))
  // Pi itself is gone but what it started still runs: the kernel does not hand out a pid while a
  // group of that number exists, so the group is still the one Pi led.
  const leftovers =
    !same &&
    startTime === undefined &&
    lock.pgid === lock.pid &&
    lock.pid !== process.pid &&
    groupAlive(lock.pgid)
  if (!same && !leftovers) {
    await rm(path, { force: true })
    return { action: 'stale', lock }
  }
  const how = await stopGroup(lock.pgid, graceMs)
  await rm(path, { force: true })
  return { action: 'killed', lock, how }
}
