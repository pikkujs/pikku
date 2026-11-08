import { spawn } from 'node:child_process'
import { PikkuError } from '@pikku/core/errors'
import {
  parseTscOutput,
  resolveTsc,
  type TscCheckResult,
} from '@pikku/code-edit/verify'

// A type-check failure is expected (the --tsc gate did its job) — throw a
// PikkuError so the runner logs the message alone, not a stack trace.
export class PikkuTypecheckFailedError extends PikkuError {}

export { parseTscOutput }

export type CheckProject = { name: string; tsconfig: string; dir: string }

export type CheckDiagnostic = {
  severity: 'warn' | 'error' | 'critical'
  code: string
  message: string
  project?: string
  file?: string
  line?: number
  column?: number
}

export type TypecheckResult = {
  diagnostics: CheckDiagnostic[]
  durationMs: number
}
export type { TscCheckResult, TscDiagnostic } from '@pikku/code-edit/verify'

const DEFAULT_MAX_LINES = 50
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024

/**
 * Compact, token-frugal render of a type-check result: a one-line header plus
 * one line per diagnostic (no code frames), capped. Used by `--tsc-summary` so
 * AI agents and CI logs get the signal without the flood.
 */
export const renderTscSummary = (
  result: TscCheckResult,
  maxLines: number = DEFAULT_MAX_LINES
): string => {
  if (result.errorCount === 0 && result.warningCount === 0) {
    return 'Type check passed — no errors.'
  }

  const counts: string[] = []
  if (result.errorCount > 0) {
    counts.push(
      `${result.errorCount} error${result.errorCount === 1 ? '' : 's'}`
    )
  }
  if (result.warningCount > 0) {
    counts.push(
      `${result.warningCount} warning${result.warningCount === 1 ? '' : 's'}`
    )
  }
  const fileLabel = `${result.fileCount} file${result.fileCount === 1 ? '' : 's'}`
  const lines = [`Type check: ${counts.join(', ')} in ${fileLabel}`]

  const shown = result.diagnostics.slice(0, maxLines)
  for (const d of shown) {
    const at = d.line > 0 ? `${d.file}:${d.line}:${d.column}` : d.file
    lines.push(`  ${at}  TS${d.code}  ${d.message}`)
  }
  const remaining = result.diagnostics.length - shown.length
  if (remaining > 0) {
    lines.push(
      `  … and ${remaining} more (run \`pikku all --tsc\` for full output)`
    )
  }
  return lines.join('\n')
}

/**
 * Full render: every project diagnostic, uncapped, one per line.
 */
export const renderTscFull = (result: TscCheckResult): string => {
  if (result.diagnostics.length === 0) return 'Type check passed — no errors.'
  return result.diagnostics
    .map((d) => {
      const at = d.line > 0 ? `${d.file}:${d.line}:${d.column}` : d.file
      return `${at}  TS${d.code}  ${d.message}`
    })
    .join('\n')
}

const KILL_GROUP = process.platform !== 'win32'
const running = new Set<() => void>()
let killedOnExit = false

/** An orphaned `tsc` would check a project nobody is waiting on. */
const killRunningOnExit = (): void => {
  if (killedOnExit) return
  killedOnExit = true
  process.on('exit', () => {
    for (const kill of running) kill()
  })
}

type TscRun = { signal?: AbortSignal; timeoutMs?: number }

/** Runs the compiler, its own process group so a kill reaches a native child too. */
const spawnTsc = (
  args: string[],
  cwd: string,
  { signal, timeoutMs }: TscRun
): Promise<{ output: string; code: number }> =>
  new Promise((done, fail) => {
    if (signal?.aborted) {
      fail(new PikkuTypecheckFailedError('The type check was superseded.'))
      return
    }
    const child = spawn(process.execPath, args, {
      cwd,
      detached: KILL_GROUP,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stopped: string | undefined
    let output = ''
    const kill = () => {
      try {
        if (!KILL_GROUP) throw new Error('no process groups')
        process.kill(-child.pid!, 'SIGKILL')
      } catch {
        child.kill('SIGKILL')
      }
    }
    const stop = (reason: string) => {
      stopped ??= reason
      kill()
    }
    const onAbort = () => stop('superseded')
    const timer =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => stop(`no result in ${timeoutMs}ms`), timeoutMs)
    const finish = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      running.delete(kill)
    }
    const collect = (chunk: Buffer) => {
      if (output.length < MAX_OUTPUT_BYTES) output += chunk
    }
    killRunningOnExit()
    running.add(kill)
    signal?.addEventListener('abort', onAbort, { once: true })
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.once('error', (error) => {
      finish()
      fail(error)
    })
    child.once('close', (code, killedBy) => {
      finish()
      // A killed tsc printed nothing, which would otherwise parse as a clean pass,
      // and so would one that died before it could report anything.
      if (
        stopped ||
        code === null ||
        (code !== 0 && !/\bTS\d+\b/.test(output))
      ) {
        const why = stopped ?? killedBy ?? `exit ${code}: ${output.trim()}`
        fail(
          new PikkuTypecheckFailedError(`tsc did not finish in ${cwd} (${why})`)
        )
        return
      }
      done({ output, code })
    })
  })

/**
 * Run a real `tsc --noEmit` over the project's own tsconfig — the correct
 * source of truth (lib, paths, strict), unlike the inspector's stripped-down
 * traversal program. Paths are reported from `rootDir` whichever project this is.
 */
export const runProjectTypecheck = async (
  tsconfigPath: string,
  rootDir: string,
  { cwd = rootDir, ...run }: TscRun & { cwd?: string } = {}
): Promise<TscCheckResult & { exitCode: number }> => {
  const { output, code } = await spawnTsc(
    [resolveTsc(cwd), '-p', tsconfigPath, '--noEmit', '--pretty', 'false'],
    cwd,
    run
  )
  return {
    ...parseTscOutput(output, rootDir, {
      maxMessageLength: Number.POSITIVE_INFINITY,
      cwd,
    }),
    exitCode: code,
  }
}

/** One `tsc` per project, side by side. The first to fail stops the others. */
export const typecheckProjects = async (
  projects: CheckProject[],
  rootDir: string,
  { signal, timeoutMs }: TscRun = {}
): Promise<TypecheckResult> => {
  const started = Date.now()
  const failed = new AbortController()
  const stop = signal ? AbortSignal.any([signal, failed.signal]) : failed.signal
  const checks = await Promise.all(
    projects.map(async (project) => {
      const { diagnostics, exitCode } = await runProjectTypecheck(
        project.tsconfig,
        rootDir,
        { cwd: project.dir, signal: stop, timeoutMs }
      ).catch((error) => {
        failed.abort()
        throw error
      })
      const reported = diagnostics.map((d): CheckDiagnostic => ({
        severity: d.category === 'error' ? 'error' : 'warn',
        code: `TS${d.code}`,
        message: d.message,
        project: project.name,
        ...(d.line > 0 ? { file: d.file, line: d.line, column: d.column } : {}),
      }))
      // The parser drops errors in node_modules and outside the root, but tsc
      // still exits non-zero for them, and so would the project's own build.
      if (exitCode !== 0 && !reported.some((d) => d.severity === 'error')) {
        reported.push({
          severity: 'error',
          code: 'TSC',
          message: `tsc exited ${exitCode} with errors only in files outside this project (node_modules, or beyond its root); run tsc -p ${project.tsconfig} to see them`,
          project: project.name,
        })
      }
      return reported
    })
  )
  return { diagnostics: checks.flat(), durationMs: Date.now() - started }
}
