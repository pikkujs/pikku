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
import { dirname, join, relative } from 'node:path'
import type { CheckDiagnostic } from './warm-typecheck.js'

export type WatchStage = 'queued' | 'codegen' | 'messages' | 'typecheck'

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
  diagnostics: CheckDiagnostic[]
  durationMs?: number
  typecheck?: { durationMs: number; rssBytes: number }
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

const insideRoot = (path: string, root: string): string | null => {
  const rel = relative(root, path)
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

export type WatchedDirs = Pick<WatchStatus, 'codegenDirs' | 'typecheckDirs'>

/** The one rule for which files count, shared by the watcher and `pikku check`. */
export const classifyChange = (
  path: string,
  dirs: WatchedDirs
): 'codegen' | 'messages' | 'typecheck' | null => {
  if (isSkippedBelow(path, dirs)) return null
  if (dirs.codegenDirs.some((root) => insideRoot(path, root) !== null)) {
    return 'codegen'
  }
  const inFrontend = dirs.typecheckDirs.some((root) =>
    MESSAGES.test(insideRoot(path, root) ?? '')
  )
  if (inFrontend) return 'messages'
  return TYPECHECKED.test(path) ? 'typecheck' : null
}

export const isIgnoredByWatcher = (path: string, dirs: WatchedDirs): boolean =>
  isSkippedBelow(path, dirs)

/** A file saved after `since`, if there is one. */
export const findChangeSince = (
  dirs: WatchedDirs,
  since: number
): string | null => {
  const visit = (dir: string): string | null => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return null
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (isIgnoredByWatcher(path, dirs)) continue
      if (entry.isDirectory()) {
        const found = visit(path)
        if (found) return found
      } else if (classifyChange(path, dirs)) {
        try {
          if (statSync(path).mtimeMs > since) return path
        } catch {}
      }
    }
    return null
  }
  for (const dir of new Set([...dirs.codegenDirs, ...dirs.typecheckDirs])) {
    const found = visit(dir)
    if (found) return found
  }
  return null
}

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
  changeSince?: (dirs: WatchedDirs, since: number) => string | null
}

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
  changeSince = findChangeSince,
}: WaitOptions): Promise<WatcherWait> => {
  const deadline = now() + timeoutMs
  while (true) {
    const status = readWatchStatus(statusFile)
    if (!status || !isAlive(status.pid)) return { kind: 'none' }
    const newer =
      status.state === 'running' ? null : changeSince(status, status.sourcesAt)
    if (status.state !== 'running' && !newer) {
      return { kind: 'settled', status }
    }
    if (now() >= deadline) {
      return stuckMessage(status, newer, timeoutMs, now())
    }
    await sleep(pollMs)
  }
}
