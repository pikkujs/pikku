import { readVerifyProject } from '@pikku/code-edit/verify'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { routeWatchPaths } from './route-tree.js'
import { runScript } from './run-script.js'
import {
  classifyChange,
  findChangesSince,
  writeWatchStatus,
  type FileChange,
  type WatchedDirs,
  type WatchStage,
  type WatchStatus,
} from './watch-status.js'
import type {
  CheckDiagnostic,
  CheckProject,
  TypecheckResult,
} from './tsc-check.js'

export type CodegenPass = { ok: boolean; diagnostics: CheckDiagnostic[] }

/** The backend and every frontend, the projects `pikku verify` covers. */
export const checkProjects = (rootDir: string): CheckProject[] => {
  const project = readVerifyProject(rootDir)
  return [
    { name: 'functions', tsconfig: project.tsconfig, dir: rootDir },
    ...project.frontends.map(({ name, dir }) => ({
      name,
      tsconfig: join(dir, 'tsconfig.json'),
      dir,
    })),
  ].filter(({ tsconfig }) => existsSync(tsconfig))
}

/** What a watcher looks at: the codegen sources, plus each frontend to type-check. */
export const watchedDirs = (
  rootDir: string,
  codegenDirs: string[]
): WatchedDirs => {
  const typecheckDirs = checkProjects(rootDir)
    .map(({ dir }) => dir)
    .filter((dir) => dir !== rootDir)
  return {
    codegenDirs: codegenDirs.map((dir) => resolve(rootDir, dir)),
    typecheckDirs,
    routePaths: routeWatchPaths(typecheckDirs),
  }
}

const MESSAGE_SCRIPTS = ['paraglide', 'i18n:compile']
const messageScript = (dir: string): string | undefined => {
  try {
    const { scripts } = JSON.parse(
      readFileSync(join(dir, 'package.json'), 'utf8')
    ) as { scripts?: Record<string, string> }
    return MESSAGE_SCRIPTS.find((name) => scripts?.[name])
  } catch {
    return undefined
  }
}

/**
 * Compiled messages are generated and gitignored, so each frontend's type check
 * depends on them. Runs its own compile script, the step its `tsc` script runs.
 */
export const compileMessages = async (
  dirs: string[],
  timeoutMs?: number
): Promise<CheckDiagnostic[]> => {
  const problems: CheckDiagnostic[] = []
  for (const dir of dirs) {
    const script = messageScript(dir)
    if (!script) continue
    const failure = await runScript(dir, script, timeoutMs)
    if (failure) {
      problems.push({
        severity: 'error',
        code: 'MESSAGES',
        message: `The ${script} script failed in ${dir}: ${failure}`,
      })
    }
  }
  return problems
}

type WatchLoopOptions = {
  statusFile: string
  dirs: WatchedDirs
  debounceMs: number
  codegen: () => Promise<CodegenPass>
  messages: () => Promise<CheckDiagnostic[]>
  routes: () => Promise<CheckDiagnostic[]>
  /** Aborted when a newer edit makes its answer worthless. */
  typecheck: (signal: AbortSignal) => Promise<TypecheckResult>
  onError: (message: string) => void
  now?: () => number
  changesSince?: (dirs: WatchedDirs, since: number) => FileChange[]
}

/** How many runs in a row a file written behind a run can ask for. */
const MAX_CATCH_UPS = 5

/**
 * The one watch loop, used by `pikku watch` and `pikku dev`: codegen, compiled
 * messages, route trees, then type check, publishing each step to the status file. A change during a run makes
 * that run's result worthless, so it is dropped unpublished and the loop goes
 * round again; a codegen pass holds a whole ts.Program, so runs never overlap.
 */
export const createWatchLoop = ({
  statusFile,
  dirs,
  debounceMs,
  codegen,
  messages,
  routes,
  typecheck,
  onError,
  now = Date.now,
  changesSince = findChangesSince,
}: WatchLoopOptions) => {
  let generation = 0
  let active: Promise<void> | undefined
  let pending = false
  let codegenNeeded = false
  let codegenPass: CodegenPass = { ok: true, diagnostics: [] }
  let messagesNeeded = false
  let messageProblems: CheckDiagnostic[] = []
  let routesNeeded = false
  let routeProblems: CheckDiagnostic[] = []
  let debounce: ReturnType<typeof setTimeout> | undefined
  let startedAt = now()
  let sourcesAt = startedAt
  let catchUps = 0
  let readByRun = new Map<string, number>()
  let inFlightCheck: AbortController | undefined

  const publish = (
    fields: Pick<WatchStatus, 'state' | 'stage' | 'diagnostics'> &
      Partial<WatchStatus>
  ) => {
    const at = now()
    const status: WatchStatus = {
      version: 1,
      pid: process.pid,
      generation,
      updatedAt: at,
      stageStartedAt: at,
      sourcesAt,
      wakes: true,
      ...dirs,
      ...fields,
    }
    try {
      writeWatchStatus(statusFile, status)
    } catch (error) {
      onError(`Could not write ${statusFile}: ${error}`)
    }
  }

  const running = (stage: WatchStage) =>
    publish({ state: 'running', stage, diagnostics: [] })

  const mark = (path: string) => {
    const kind = classifyChange(path, dirs)
    if (!kind) return
    pending = true
    inFlightCheck?.abort()
    codegenNeeded ||= kind === 'codegen'
    messagesNeeded ||= kind === 'messages'
    routesNeeded ||= kind === 'routes'
  }

  /**
   * Whether a file got in behind this run. A file event can be lost or arrive
   * after the run ends, and `pikku check` goes by mtime, so a run is only finished
   * once nothing is newer than it, whoever wrote the file. Bounded, so that
   * something writing forever gets a published result rather than a spin. A file
   * still newer but already seen, say one dated in the future, was read by this
   * run, so the result covers it and stays current.
   */
  const fellBehind = async (): Promise<boolean> => {
    const changes = changesSince(dirs, startedAt)
    const unread = changes.filter(
      ({ path, mtimeMs }) => readByRun.get(path) !== mtimeMs
    )
    readByRun = new Map(changes.map((c) => [c.path, c.mtimeMs]))
    if (unread.length === 0) {
      sourcesAt = Math.max(startedAt, ...changes.map((c) => c.mtimeMs))
      catchUps = 0
      return false
    }
    sourcesAt = startedAt
    if (catchUps >= MAX_CATCH_UPS) {
      catchUps = 0
      return false
    }
    catchUps++
    await new Promise((resolve) => setTimeout(resolve, debounceMs))
    for (const { path } of unread) mark(path)
    return true
  }

  const runOnce = async () => {
    pending = false
    const withCodegen = codegenNeeded || !codegenPass.ok
    codegenNeeded = false
    const withMessages = messagesNeeded || messageProblems.length > 0
    messagesNeeded = false
    const withRoutes = routesNeeded || routeProblems.length > 0
    routesNeeded = false
    startedAt = now()
    sourcesAt = startedAt
    generation++

    if (withCodegen) {
      running('codegen')
      codegenPass = await codegen()
      if (pending) return
    }
    if (withMessages) {
      running('messages')
      messageProblems = await messages()
      if (pending) return
    }
    if (withRoutes) {
      running('routes')
      routeProblems = await routes()
      if (pending) return
    }
    running('typecheck')
    let checked: TypecheckResult | undefined
    let checkerError: CheckDiagnostic | undefined
    inFlightCheck = new AbortController()
    try {
      checked = await typecheck(inFlightCheck.signal)
    } catch (error) {
      checkerError = {
        severity: 'error',
        code: 'TYPECHECK',
        message: error instanceof Error ? error.message : String(error),
      }
    }
    inFlightCheck = undefined
    if (pending || (await fellBehind()) || pending) return

    const diagnostics = [
      ...codegenPass.diagnostics,
      ...messageProblems,
      ...routeProblems,
      ...(checked?.diagnostics ?? []),
      ...(checkerError ? [checkerError] : []),
    ]
    publish({
      state:
        codegenPass.ok && !diagnostics.some((d) => d.severity !== 'warn')
          ? 'ok'
          : 'failed',
      stage: null,
      diagnostics,
      durationMs: now() - startedAt,
      ...(checked
        ? {
            typecheck: { durationMs: checked.durationMs },
          }
        : {}),
    })
  }

  const run = (): Promise<void> => {
    active ??= (async () => {
      try {
        do {
          await runOnce()
        } while (pending)
      } finally {
        active = undefined
      }
    })()
    return active
  }

  return {
    /** Runs the first pass. `codegen: false` when the caller has just done one. */
    start: ({ codegen: withCodegen }: { codegen: boolean }): Promise<void> => {
      codegenNeeded = withCodegen
      messagesNeeded = true
      routesNeeded = true
      return run()
    },
    /** Runs if the files are ahead of the last result; a running loop checks itself. */
    wake: (): void => {
      if (active) return
      const changes = changesSince(dirs, sourcesAt)
      if (changes.length === 0) return
      for (const { path } of changes) mark(path)
      running('queued')
      void run()
    },
    /** Feed every file event here; it decides what, if anything, needs running. */
    onChange: (path: string): void => {
      if (!classifyChange(path, dirs)) return
      mark(path)
      if (!active) running('queued')
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => void run(), debounceMs)
    },
  }
}
