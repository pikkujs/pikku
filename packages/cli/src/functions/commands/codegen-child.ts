import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readdirSync, statSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CodedDiagnostic } from '@pikku/inspector'
import type { CodegenPass } from '../../utils/watch-loop.js'
import {
  LOGGED_ERROR_CODE,
  codegenFailureDiagnostics,
  failureTail,
} from '../../utils/codegen-failure.js'

export type CodegenChildOptions = {
  command: string[]
  config?: string
  outDir?: string
  logLevel?: string
  output?: string
  security?: boolean
  inheritStdout: boolean
  /** The child writes its coded diagnostics here. */
  diagnosticsFile?: string
  /** Kills the child after this long, so a hung pass cannot hang its caller. */
  timeoutMs?: number
}

/** What the codegen child recorded, or nothing if it died before recording any. */
export const readCodegenDiagnostics = async (
  file: string
): Promise<CodedDiagnostic[]> => {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as CodedDiagnostic[]
  } catch {
    return []
  }
}

/**
 * One codegen pass and the diagnostics it reported. `pass` is handed the file to
 * name as `diagnosticsFile`; its failure is an outcome here, not a throw.
 */
export const collectCodegenPass = async (
  pass: (diagnosticsFile: string) => Promise<void>
): Promise<CodegenPass> => {
  const diagnosticsFile = join(
    tmpdir(),
    `pikku-diagnostics-${randomBytes(8).toString('hex')}.json`
  )
  const recorded = async () => {
    const all = await readCodegenDiagnostics(diagnosticsFile)
    const isLogged = ({ code }: CodedDiagnostic) =>
      (code as string) === LOGGED_ERROR_CODE
    return {
      coded: all.filter((diagnostic) => !isLogged(diagnostic)),
      logged: all.filter(isLogged).map(({ message }) => message),
    }
  }
  try {
    await pass(diagnosticsFile)
    return { ok: true, diagnostics: (await recorded()).coded }
  } catch (error) {
    const { coded, logged } = await recorded()
    const message = error instanceof Error ? error.message : String(error)
    const output = error instanceof CodegenChildError ? error.output : ''
    const found = codegenFailureDiagnostics({ logged, output })
    const fallback = {
      severity: 'critical',
      code: 'CODEGEN',
      message: output ? `${message}\n${failureTail(output)}` : message,
    } as const
    const reasons = found.length > 0 ? found : [fallback]
    return {
      ok: false,
      diagnostics: [
        ...coded.filter(({ severity }) => severity !== 'warn'),
        ...reasons,
        ...coded.filter(({ severity }) => severity === 'warn'),
      ],
    }
  } finally {
    await rm(diagnosticsFile, { force: true })
  }
}

export const codegenStateFile = (): string =>
  join(tmpdir(), `pikku-state-${randomBytes(8).toString('hex')}.json`)

/** Enough for the error lines, which print long before the stack at the end. */
const MAX_FAILURE_OUTPUT = 256 * 1024

/** A failed child, with what it printed. */
export class CodegenChildError extends Error {
  constructor(
    message: string,
    readonly output: string
  ) {
    super(message)
  }
}

export const runCodegenChild = (
  stateFile: string,
  options: CodegenChildOptions
): Promise<void> => {
  const args = [
    ...process.execArgv,
    process.argv[1]!,
    ...options.command,
    `--stateOutput=${stateFile}`,
  ]
  if (options.config) args.push(`--config=${options.config}`)
  if (options.outDir) args.push(`--outDir=${options.outDir}`)
  if (options.logLevel) args.push(`--logLevel=${options.logLevel}`)
  if (options.output) args.push(`--output=${options.output}`)
  if (options.security) args.push('--security')

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: ['ignore', options.inheritStdout ? 'inherit' : 'ignore', 'pipe'],
      env: {
        ...process.env,
        PIKKU_NO_LOGO: '1',
        ...(options.diagnosticsFile
          ? { PIKKU_DIAGNOSTICS_FILE: options.diagnosticsFile }
          : {}),
      },
    })
    // Passed through as ever, and kept: most failures reach only stderr, and
    // `pikku check` has to say what went wrong.
    let stderrTail = ''
    child.stderr!.on('data', (chunk: Buffer) => {
      if (options.inheritStdout) process.stderr.write(chunk)
      stderrTail = (stderrTail + chunk).slice(-MAX_FAILURE_OUTPUT)
    })
    const timer = options.timeoutMs
      ? setTimeout(() => child.kill('SIGKILL'), options.timeoutMs)
      : undefined
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else
        reject(
          new CodegenChildError(
            `pikku ${options.command.join(' ')} failed (${signal ?? `exit ${code}`})`,
            stderrTail
          )
        )
    })
  })
}

export const hasChangesSince = (
  directories: string[],
  since: number
): boolean => {
  const visit = (dir: string): boolean => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return false
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.git')) {
        continue
      }
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (visit(path)) return true
        continue
      }
      if (/\.gen\.tsx?$/.test(entry.name)) continue
      try {
        if (statSync(path).mtimeMs > since) return true
      } catch {}
    }
    return false
  }
  return directories.some(visit)
}
