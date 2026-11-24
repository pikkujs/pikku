import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

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

/** A process's group (field 5 of `/proc/<pid>/stat`); undefined where it cannot be read. */
export const processGroupOf = async (
  pid: number
): Promise<number | undefined> => {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8')
    const group = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2])
    return Number.isInteger(group) && group > 0 ? group : undefined
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

/** Process groups started here; if this process exits or is stopped by SIGTERM or SIGINT they go with it. */
const liveGroups = new Set<number>()
let exitHooked = false
let signalsHooked = false

const killLiveGroups = () => {
  for (const group of liveGroups)
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // already gone
    }
}

/**
 * A signal ends this process without an `exit` event, so the groups are killed on SIGTERM and SIGINT
 * too (not SIGHUP: under nohup a handler would undo the ignore). A listener stops the default exit,
 * so when no other listener handles the signal it is raised again and the process ends as it would
 * have. A process that handles the signal and goes on is hooked again by its next tracked group.
 */
const hookSignals = () => {
  if (signalsHooked) return
  signalsHooked = true
  const handlers = (['SIGTERM', 'SIGINT'] as const).map((signal) => {
    const handler = () => {
      for (const [hooked, listener] of handlers) process.off(hooked, listener)
      signalsHooked = false
      killLiveGroups()
      if (!process.listenerCount(signal)) process.kill(process.pid, signal)
    }
    return [signal, handler] as const
  })
  for (const [signal, handler] of handlers) process.on(signal, handler)
}

/** Records a group this process started, so it is killed when this process exits or is stopped, and never taken for an orphan. */
export const trackGroup = (pgid: number) => {
  liveGroups.add(pgid)
  hookSignals()
  if (exitHooked) return
  exitHooked = true
  process.once('exit', killLiveGroups)
}

export const untrackGroup = (pgid: number) => liveGroups.delete(pgid)

/** What a lock file records about a process group started here: Pi in a worktree (`pi.lock`) or a gate's tool. */
export type ProcessLock = {
  pid: number
  /** The process is started as the leader of its own group, so this equals `pid`. */
  pgid: number
  /** `processStartTime(pid)` when it was started; absent where it cannot be read. */
  startTime?: string
  /** Pi's session. */
  sessionId?: string
  /** A gate's tool, redacted. */
  tool?: string
  startedAt: string
}

export const readLock = async (
  path: string
): Promise<ProcessLock | undefined> => {
  try {
    const lock = JSON.parse(await readFile(path, 'utf8')) as ProcessLock
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

export const writeLock = (path: string, lock: ProcessLock) =>
  writeFile(path, `${JSON.stringify(lock)}\n`)

/** Removes the lock if it is still the one `pid` wrote. */
export const removeLock = async (path: string, pid: number) => {
  const lock = await readLock(path)
  if (lock && lock.pid !== pid) return
  await rm(path, { force: true })
}

export type OrphanOutcome =
  | { action: 'none' }
  | {
      action: 'killed'
      lock: ProcessLock
      how: 'gone' | 'terminated' | 'killed'
    }
  | { action: 'stale'; lock: ProcessLock }

/**
 * Before a launch: a lock left by a Pi or a tool that is still running (same pid and same start
 * time) means an earlier process of ours died without stopping it, so its whole group is stopped. A
 * lock whose pid is gone or now belongs to another process (a different start time) is only removed.
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

/**
 * The same for a directory of locks (`<pid>.lock`), one per tool: each lock left by a group this
 * process is not running is cleared as `clearOrphan` clears one. Returns what was found.
 */
export const clearOrphans = async (
  dir: string,
  graceMs: number
): Promise<OrphanOutcome[]> => {
  const names = await readdir(dir).catch(() => [] as string[])
  const found: OrphanOutcome[] = []
  for (const name of names) {
    const pid = Number(name.replace(/\.lock$/, ''))
    if (!name.endsWith('.lock') || liveGroups.has(pid)) continue
    const outcome = await clearOrphan(join(dir, name), graceMs)
    if (outcome.action !== 'none') found.push(outcome)
  }
  return found
}
