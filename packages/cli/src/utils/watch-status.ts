import { randomBytes } from 'node:crypto'
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import type { CheckDiagnostic } from './tsc-check.js'

export type WatchStage =
  'queued' | 'codegen' | 'messages' | 'routes' | 'typecheck'

/** `.pikku/status.json`: what the watcher last concluded about the project. */
export type WatchStatus = {
  version: 1
  pid: number
  state: 'running' | 'ok' | 'failed'
  /** What it is doing, while running. */
  stage: WatchStage | null
  generation: number
  stageStartedAt: number
  updatedAt: number
  /** The result covers file contents up to this moment and no later. */
  sourcesAt: number
  codegenDirs: string[]
  typecheckDirs: string[]
  /** Frontend route directories and trees; older status files have none. */
  routePaths?: string[]
  /** It reruns on SIGUSR2, which would end a watcher that doesn't handle it. */
  wakes?: boolean
  /** Whether codegen runs the data-classification lint; a result without it cannot answer `check --security`. */
  security?: boolean
  diagnostics: CheckDiagnostic[]
  durationMs?: number
  typecheck?: { durationMs: number }
}

export const watchStatusFile = (pikkuDir: string): string =>
  join(pikkuDir, 'status.json')

/** Replaced by rename, so a reader never sees half a file. */
export const writeWatchStatus = (file: string, status: WatchStatus): void => {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.${randomBytes(4).toString('hex')}.tmp`
  try {
    writeFileSync(temporary, JSON.stringify(status))
    renameSync(temporary, file)
  } finally {
    rmSync(temporary, { force: true })
  }
}

export const readWatchStatus = (file: string): WatchStatus | null => {
  try {
    const status = JSON.parse(readFileSync(file, 'utf8')) as WatchStatus
    return status.version === 1 ? status : null
  } catch {
    return null
  }
}

const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'coverage'])
const GENERATED = /\.gen\.[^/]+$/
/** `.js` counts: with allowJs, compiled output such as paraglide's is part of the program. */
const TYPECHECKED = /\.(tsx?|mts|cts|jsx?|mjs|cjs|json)$/
const MESSAGES = /(^|\/)messages\/[^/]+\.json$/

/** `path` below `root` with `/` separators, or null when it is not below it. */
const insideRoot = (path: string, root: string): string | null => {
  const rel = relative(root, path).split(sep).join('/')
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('/'))
    ? rel
    : null
}

const isSkippedDir = (part: string) =>
  part.startsWith('.') || SKIPPED_DIRS.has(part)

/**
 * Judged only below the watched root: a project may well live under a path such
 * as `~/.pikkustudio/local`. Generated files are skipped where codegen writes
 * them, or each pass would start the next. A frontend's are part of its program,
 * and a type check writes nothing, so they count there.
 */
const isSkippedBelow = (
  path: string,
  { codegenDirs, typecheckDirs }: WatchedDirs
): boolean => {
  for (const root of codegenDirs) {
    const rel = insideRoot(path, root)
    if (rel === null) continue
    const parts = rel.split('/')
    return parts.some((part) => isSkippedDir(part) || GENERATED.test(part))
  }
  for (const root of typecheckDirs) {
    const rel = insideRoot(path, root)
    if (rel !== null) return rel.split('/').some(isSkippedDir)
  }
  return false
}

export type WatchedDirs = Pick<
  WatchStatus,
  'codegenDirs' | 'typecheckDirs' | 'routePaths'
>

/** `tsr.config.json` names the routes directory and tree, so editing it moves them. */
const isRouterConfig = (path: string, dirs: WatchedDirs): boolean =>
  basename(path) === 'tsr.config.json' &&
  dirs.typecheckDirs.includes(dirname(path))

/** A frontend's `messages/<locale>.json`, which its compile script reads. */
export const isMessageFile = (path: string, dirs: WatchedDirs): boolean =>
  dirs.typecheckDirs.some((root) => MESSAGES.test(insideRoot(path, root) ?? ''))

/** The one rule for which files count, shared by the watcher and `pikku check`. */
export const classifyChange = (
  path: string,
  dirs: WatchedDirs
): 'codegen' | 'messages' | 'routes' | 'typecheck' | null => {
  if (isSkippedBelow(path, dirs)) return null
  if (dirs.routePaths?.some((root) => insideRoot(path, root) !== null)) {
    return 'routes'
  }
  if (isRouterConfig(path, dirs)) return 'routes'
  if (dirs.codegenDirs.some((root) => insideRoot(path, root) !== null)) {
    return 'codegen'
  }
  if (isMessageFile(path, dirs)) return 'messages'
  return TYPECHECKED.test(path) ? 'typecheck' : null
}

export const isIgnoredByWatcher = (path: string, dirs: WatchedDirs): boolean =>
  isSkippedBelow(path, dirs)

export type FileChange = { path: string; mtimeMs: number }

const statIsFile = (path: string): boolean => {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/** Every file saved after `since`. */
export const findChangesSince = (
  dirs: WatchedDirs,
  since: number
): FileChange[] => {
  const changes: FileChange[] = []
  const seen = new Set<string>()
  const record = (path: string) => {
    if (seen.has(path)) return
    seen.add(path)
    try {
      const { mtimeMs } = statSync(path)
      if (mtimeMs > since) changes.push({ path, mtimeMs })
    } catch {}
  }
  const visit = (dir: string) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (isIgnoredByWatcher(path, dirs)) continue
      if (entry.isDirectory()) {
        visit(path)
      } else if (classifyChange(path, dirs)) {
        record(path)
      }
    }
  }
  const roots = new Set([
    ...dirs.codegenDirs,
    ...dirs.typecheckDirs,
    ...(dirs.routePaths ?? []),
  ])
  for (const root of roots) {
    // A route path is a directory or the tree file, and may lie outside every root.
    if (statIsFile(root)) {
      if (classifyChange(root, dirs)) record(root)
    } else {
      visit(root)
    }
  }
  return changes
}

/** A file saved after `since`, if there is one. */
export const findChangeSince = (
  dirs: WatchedDirs,
  since: number
): string | null => findChangesSince(dirs, since)[0]?.path ?? null

const isRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export type WatcherWait =
  | { kind: 'settled'; status: WatchStatus }
  | { kind: 'none' }
  | { kind: 'stuck'; stage: WatchStage | 'waiting'; message: string }

type WaitOptions = {
  statusFile: string
  timeoutMs: number
  pollMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  isAlive?: (pid: number) => boolean
  wake?: (pid: number) => void
  changeSince?: (dirs: WatchedDirs, since: number) => string | null
  /** The caller needs the security lint's verdict: a watcher that skips it cannot answer. */
  security?: boolean
}

export const WAKE_SIGNAL = 'SIGUSR2'

const wakeWatcher = (pid: number) => {
  try {
    process.kill(pid, WAKE_SIGNAL)
  } catch {}
}

/** A queued stage this fresh means an edit arrived just now. */
const STILL_WRITING_SECONDS = 5

const stuckMessage = (
  status: WatchStatus,
  newer: string | null,
  timeoutMs: number,
  now: number
): WatcherWait => {
  const seconds = Math.round(timeoutMs / 1000)
  if (status.state === 'running') {
    const stage = status.stage ?? 'queued'
    const inStage = Math.round((now - status.stageStartedAt) / 1000)
    // The watcher waits for quiet before it runs, and it is healthy: restarting
    // it would not help while something else is still writing.
    if (stage === 'queued' && inStage < STILL_WRITING_SECONDS) {
      return {
        kind: 'stuck',
        stage,
        message: `Files kept changing for ${seconds}s, so the watcher could not start a run${newer ? `, most recently ${newer}` : ''} (pid ${status.pid}). Stop whatever is writing them and check again.`,
      }
    }
    return {
      kind: 'stuck',
      stage,
      message: `The watcher did not finish in ${seconds}s: it has been in its ${stage} stage for ${inStage}s (pid ${status.pid}). Restart pikku dev or pikku watch.`,
    }
  }
  return {
    kind: 'stuck',
    stage: 'waiting',
    message: `The watcher did not pick up ${newer} in ${seconds}s, so its last result is out of date (pid ${status.pid}). Restart pikku dev or pikku watch.`,
  }
}

/**
 * Waits until the watcher has a result for the files as they are now. A result
 * older than the newest edit is never returned, however finished it looks.
 */
export const waitForWatcher = async ({
  statusFile,
  timeoutMs,
  pollMs = 100,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  isAlive = isRunning,
  wake = wakeWatcher,
  changeSince = findChangeSince,
  security = false,
}: WaitOptions): Promise<WatcherWait> => {
  const deadline = now() + timeoutMs
  let wokenFor: number | undefined
  while (true) {
    const status = readWatchStatus(statusFile)
    if (!status || !isAlive(status.pid)) return { kind: 'none' }
    if (security && !status.security) return { kind: 'none' }
    const newer =
      status.state === 'running' ? null : changeSince(status, status.sourcesAt)
    if (status.state !== 'running' && !newer) {
      return { kind: 'settled', status }
    }
    // An idle watcher with a newer file missed its event: a file it can't have
    // heard about would otherwise hold every check until the deadline. Once per
    // result, so a file that keeps changing can't turn this into a poll.
    if (newer && status.wakes && wokenFor !== status.updatedAt) {
      wokenFor = status.updatedAt
      wake(status.pid)
    }
    if (now() >= deadline) {
      const changing = newer ?? changeSince(status, status.sourcesAt)
      return stuckMessage(status, changing, timeoutMs, now())
    }
    await sleep(pollMs)
  }
}
