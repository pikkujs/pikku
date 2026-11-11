import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pikkuSessionlessFunc } from '#pikku/function'
import type { CLILogger } from '../../services/cli-logger.service.js'
import { added, dim, removed } from '../../utils/output.js'
import {
  typecheckProjects,
  type CheckDiagnostic,
} from '../../utils/tsc-check.js'
import { generateRouteTrees } from '../../utils/route-tree.js'
import { checkProjects, compileMessages } from '../../utils/watch-loop.js'
import {
  waitForWatcher,
  watchStatusFile,
  type WatcherWait,
} from '../../utils/watch-status.js'
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
/** All of it fits a `tail -30`, and the causes print first. */
const MAX_LINES = 30

type CliConfig = {
  rootDir: string
  config?: string
  outDir: string
  logLevel?: string
  security?: boolean
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
        security: config.security,
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

  const projects = checkProjects(config.rootDir, config.config)
  const frontends = projects
    .map(({ dir }) => dir)
    .filter((dir) => dir !== config.rootDir)
  diagnostics.push(
    ...(await compileMessages(frontends, Math.max(1, deadline - Date.now()))),
    ...(await generateRouteTrees(frontends, Math.max(1, deadline - Date.now())))
  )

  try {
    const checked = await typecheckProjects(projects, config.rootDir, {
      timeoutMs: Math.max(1, deadline - Date.now()),
    })
    diagnostics.push(...checked.diagnostics)
  } catch (error) {
    return {
      diagnostics,
      stuck: {
        stage: 'typecheck',
        message: error instanceof Error ? error.message : String(error),
      },
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
    const security = (config as CliConfig).security
    const waited: WatcherWait = await waitForWatcher({
      statusFile: watchStatusFile(pikkuDir),
      timeoutMs,
      security,
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
    } else if (started + timeoutMs - Date.now() <= 0) {
      // The watcher took the whole budget before it turned out to be gone.
      result = {
        ok: false,
        source: 'full-run',
        diagnostics: [],
        stuck: {
          stage: 'waiting',
          message: `The watcher was gone after ${seconds}s, so there was no time left for a full run.`,
        },
        durationMs: Date.now() - started,
      }
    } else {
      const { diagnostics, stuck } = await fullRun(
        config as CliConfig,
        started + timeoutMs - Date.now()
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
  const blocking = result.diagnostics.filter(isBlocking)
  const lines = [
    result.stuck
      ? `${removed('✗')} check stuck in ${result.stuck.stage}: ${result.stuck.message}`
      : result.ok
        ? `${added('✓')} ok ${from}`
        : `${removed('✗')} ${blocking.length} problem${blocking.length === 1 ? '' : 's'} ${from}`,
  ]
  let shown = 0
  for (const diagnostic of blocking) {
    const text = describe(diagnostic).split('\n')
    const room = MAX_LINES - 1 - lines.length
    if (text.length > room && shown > 0) break
    lines.push(...text.slice(0, room))
    shown++
  }
  if (shown < blocking.length) {
    lines.push(
      `  … and ${blocking.length - shown} more (--json lists them all)`
    )
  }
  process.stdout.write(`${lines.join('\n')}\n`)
}
