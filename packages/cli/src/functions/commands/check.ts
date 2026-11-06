import { rm } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { pikkuSessionlessFunc } from '#pikku/function'
import type { CLILogger } from '../../services/cli-logger.service.js'
import { added, dim, removed } from '../../utils/output.js'
import { runProjectTypecheck } from '../../utils/tsc-check.js'
import { checkProjects } from '../../utils/watch-loop.js'
import {
  waitForWatcher,
  watchStatusFile,
  type WatcherWait,
} from '../../utils/watch-status.js'
import type { CheckDiagnostic } from '../../utils/warm-typecheck.js'
import {
  codegenStateFile,
  collectCodegenPass,
  runCodegenChild,
} from './codegen-child.js'

export type CheckResult = {
  ok: boolean
  /** Whether the answer came from the running watcher or a full run here. */
  source: 'watcher' | 'full-run'
  diagnostics: CheckDiagnostic[]
  /** Set when no answer arrived in time, naming what it was stuck on. */
  stuck?: { stage: string; message: string }
  generation?: number
  durationMs: number
}

const DEFAULT_TIMEOUT_SECONDS = 120
const MAX_DIAGNOSTICS_SHOWN = 30

type CliConfig = {
  rootDir: string
  config?: string
  outDir: string
  logLevel?: string
}

const fullRun = async (
  config: CliConfig,
  timeoutMs: number
): Promise<Pick<CheckResult, 'diagnostics' | 'stuck'>> => {
  const deadline = Date.now() + timeoutMs
  const codegen = await collectCodegenPass(async (diagnosticsFile) => {
    const stateFile = codegenStateFile()
    try {
      await runCodegenChild(stateFile, {
        command: ['all'],
        config: config.config,
        outDir: config.outDir,
        logLevel: config.logLevel,
        inheritStdout: false,
        diagnosticsFile,
        timeoutMs,
      })
    } finally {
      await rm(stateFile, { force: true })
    }
  })
  const diagnostics = [...codegen.diagnostics]
  if (!codegen.ok && Date.now() >= deadline) {
    return {
      diagnostics,
      stuck: {
        stage: 'codegen',
        message: `pikku all did not finish in ${Math.round(timeoutMs / 1000)}s.`,
      },
    }
  }

  for (const project of checkProjects(config.rootDir)) {
    try {
      const result = runProjectTypecheck(
        project.tsconfig,
        project.dir,
        Math.max(1, deadline - Date.now())
      )
      diagnostics.push(
        ...result.diagnostics.map((d): CheckDiagnostic => ({
          severity: d.category === 'error' ? 'error' : 'warn',
          code: `TS${d.code}`,
          message: d.message,
          project: project.name,
          file: relative(config.rootDir, resolve(project.dir, d.file)),
          ...(d.line > 0 ? { line: d.line, column: d.column } : {}),
        }))
      )
    } catch (error) {
      return {
        diagnostics,
        stuck: {
          stage: 'typecheck',
          message: `Type-checking ${project.name} did not finish in ${Math.round(timeoutMs / 1000)}s: ${error instanceof Error ? error.message : error}`,
        },
      }
    }
  }
  return { diagnostics }
}

const isBlocking = (d: CheckDiagnostic) => d.severity !== 'warn'

export const check = pikkuSessionlessFunc<{ timeout?: string }, CheckResult>({
  func: async ({ config }, { timeout }) => {
    const started = Date.now()
    const seconds =
      Number(timeout) > 0 ? Number(timeout) : DEFAULT_TIMEOUT_SECONDS
    const timeoutMs = seconds * 1000
    const pikkuDir = resolve(config.rootDir, config.outDir)
    const waited: WatcherWait = await waitForWatcher({
      statusFile: watchStatusFile(pikkuDir),
      timeoutMs,
    })

    let result: CheckResult
    if (waited.kind === 'stuck') {
      result = {
        ok: false,
        source: 'watcher',
        diagnostics: [],
        stuck: { stage: waited.stage, message: waited.message },
        durationMs: Date.now() - started,
      }
    } else if (waited.kind === 'settled') {
      result = {
        ok: waited.status.state === 'ok',
        source: 'watcher',
        diagnostics: waited.status.diagnostics,
        generation: waited.status.generation,
        durationMs: Date.now() - started,
      }
    } else {
      const { diagnostics, stuck } = await fullRun(
        config as CliConfig,
        timeoutMs
      )
      result = {
        ok: !stuck && !diagnostics.some(isBlocking),
        source: 'full-run',
        diagnostics,
        ...(stuck ? { stuck } : {}),
        durationMs: Date.now() - started,
      }
    }
    if (!result.ok) process.exitCode = 1
    return result
  },
})

const describe = (d: CheckDiagnostic): string => {
  const at = d.file
    ? `${d.file}${d.line ? `:${d.line}:${d.column ?? 1}` : ''}  `
    : ''
  return `  ${at}${dim(d.code)}  ${d.message}`
}

export const renderCheck = (
  { logger }: { logger: CLILogger },
  result: CheckResult
): void => {
  if (logger.getOutputMode() === 'json') {
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return
  }
  const from = dim(`(${result.source}, ${result.durationMs}ms)`)
  if (result.stuck) {
    process.stdout.write(
      `${removed('✗')} check stuck in ${result.stuck.stage}: ${result.stuck.message}\n`
    )
    return
  }
  const blocking = result.diagnostics.filter(isBlocking)
  const lines = [
    result.ok
      ? `${added('✓')} ok ${from}`
      : `${removed('✗')} ${blocking.length} problem${blocking.length === 1 ? '' : 's'} ${from}`,
    ...blocking.slice(0, MAX_DIAGNOSTICS_SHOWN).map(describe),
  ]
  if (blocking.length > MAX_DIAGNOSTICS_SHOWN) {
    lines.push(
      `  … and ${blocking.length - MAX_DIAGNOSTICS_SHOWN} more (--json lists them all)`
    )
  }
  process.stdout.write(`${lines.join('\n')}\n`)
}
