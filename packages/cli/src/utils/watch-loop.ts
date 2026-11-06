import { readVerifyProject } from '@pikku/code-edit/verify'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  classifyChange,
  writeWatchStatus,
  type WatchedDirs,
  type WatchStage,
  type WatchStatus,
} from './watch-status.js'
import type {
  CheckDiagnostic,
  CheckProject,
  TypecheckResult,
} from './warm-typecheck.js'

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
): WatchedDirs => ({
  codegenDirs: codegenDirs.map((dir) => resolve(rootDir, dir)),
  typecheckDirs: checkProjects(rootDir)
    .map(({ dir }) => dir)
    .filter((dir) => dir !== rootDir),
})

type WatchLoopOptions = {
  statusFile: string
  dirs: WatchedDirs
  debounceMs: number
  codegen: () => Promise<CodegenPass>
  typecheck: () => Promise<TypecheckResult>
  onError: (message: string) => void
  now?: () => number
}

/**
 * The one watch loop, used by `pikku watch` and `pikku dev`: codegen, then type
 * check, publishing each step to the status file. A change during a run makes
 * that run's result worthless, so it is dropped unpublished and the loop goes
 * round again; a codegen pass holds a whole ts.Program, so runs never overlap.
 */
export const createWatchLoop = ({
  statusFile,
  dirs,
  debounceMs,
  codegen,
  typecheck,
  onError,
  now = Date.now,
}: WatchLoopOptions) => {
  let generation = 0
  let active: Promise<void> | undefined
  let pending = false
  let codegenNeeded = false
  let codegenPass: CodegenPass = { ok: true, diagnostics: [] }
  let debounce: ReturnType<typeof setTimeout> | undefined
  let startedAt = now()

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
      sourcesAt: startedAt,
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

  const runOnce = async () => {
    pending = false
    const withCodegen = codegenNeeded || !codegenPass.ok
    codegenNeeded = false
    startedAt = now()
    generation++

    if (withCodegen) {
      running('codegen')
      codegenPass = await codegen()
      if (pending) return
    }
    running('typecheck')
    let checked: TypecheckResult | undefined
    let checkerError: CheckDiagnostic | undefined
    try {
      checked = await typecheck()
    } catch (error) {
      checkerError = {
        severity: 'error',
        code: 'TYPECHECK',
        message: error instanceof Error ? error.message : String(error),
      }
    }
    if (pending) return

    const diagnostics = [
      ...codegenPass.diagnostics,
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
            typecheck: {
              durationMs: checked.durationMs,
              rssBytes: checked.rssBytes,
            },
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
      return run()
    },
    /** Feed every file event here; it decides what, if anything, needs running. */
    onChange: (path: string): void => {
      const kind = classifyChange(path, dirs)
      if (!kind) return
      pending = true
      codegenNeeded ||= kind === 'codegen'
      if (!active) running('queued')
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => void run(), debounceMs)
    },
  }
}
