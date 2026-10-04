import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

export interface TscDiagnostic {
  file: string
  line: number
  column: number
  code: number
  category: 'error' | 'warning' | 'suggestion' | 'message'
  message: string
}

export interface TscCheckResult {
  errorCount: number
  warningCount: number
  fileCount: number
  diagnostics: TscDiagnostic[]
}

const NO_FILE = '(project)'
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024

const DIAGNOSTIC_LINE =
  /^(?:(.+?)\((\d+),(\d+)\): )?(error|warning|message|suggestion) TS(\d+): (.*)$/

const isProjectFile = (fileName: string, rootDir: string): boolean => {
  if (fileName.includes('/node_modules/')) return false
  const rel = relative(rootDir, fileName)
  return !rel.startsWith('..') && !isAbsolute(rel)
}

/** The project's own `tsc` entry point, falling back to the one this package was installed with. */
export const resolveTsc = (rootDir: string): string => {
  try {
    const fromProject = createRequire(join(rootDir, 'noop.cjs'))
    return join(
      dirname(fromProject.resolve('typescript/package.json')),
      'bin',
      'tsc'
    )
  } catch {
    const own = createRequire(import.meta.url)
    return join(dirname(own.resolve('typescript/package.json')), 'bin', 'tsc')
  }
}

/** Turns raw `tsc --pretty false` output into structured diagnostics, dropping node_modules and anything outside `rootDir`. */
export const parseTscOutput = (
  output: string,
  rootDir: string,
  {
    maxMessageLength = 200,
    cwd = rootDir,
  }: { maxMessageLength?: number; cwd?: string } = {}
): TscCheckResult => {
  const files = new Set<string>()
  const collected: TscDiagnostic[] = []
  let errorCount = 0
  let warningCount = 0
  let current: TscDiagnostic | null = null

  const flush = () => {
    if (!current) return
    if (current.message.length > maxMessageLength) {
      current.message = `${current.message.slice(0, maxMessageLength - 1)}…`
    }
    if (current.category === 'error') errorCount++
    else if (current.category === 'warning') warningCount++
    files.add(current.file)
    collected.push(current)
    current = null
  }

  for (const raw of output.split('\n')) {
    const line = raw.replace(/\r$/, '')
    const match = DIAGNOSTIC_LINE.exec(line)
    if (match) {
      flush()
      const [, fileName, lineNo, columnNo, category, code, message] = match
      if (fileName) {
        const absolute = isAbsolute(fileName)
          ? fileName
          : resolve(cwd, fileName)
        if (!isProjectFile(absolute, rootDir)) continue
        current = {
          file: relative(rootDir, absolute),
          line: Number(lineNo),
          column: Number(columnNo),
          code: Number(code),
          category: category as TscDiagnostic['category'],
          message: message ?? '',
        }
      } else {
        current = {
          file: NO_FILE,
          line: 0,
          column: 0,
          code: Number(code),
          category: category as TscDiagnostic['category'],
          message: message ?? '',
        }
      }
      continue
    }
    if (current && /^\s+\S/.test(line)) {
      current.message = `${current.message} ${line.trim()}`
    }
  }
  flush()

  collected.sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1
  )
  return {
    errorCount,
    warningCount,
    fileCount: files.size,
    diagnostics: collected,
  }
}

export type SpawnResult = {
  status: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  error?: Error
}

/** Runs a command without blocking the event loop, killing it after `timeoutMs`. */
export const spawnBounded = (
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<SpawnResult> =>
  new Promise((done) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const child = spawn(command, args, { cwd, env: process.env })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.stdout.on('data', (chunk) => {
      if (stdout.length < MAX_OUTPUT_BYTES) stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      done({ status: null, stdout, stderr, timedOut, error })
    })
    child.on('close', (status) => {
      clearTimeout(timer)
      done({ status, stdout, stderr, timedOut })
    })
  })

/** `tsc --noEmit -p <tsconfig>` run from `cwd`, keeping full messages for files under `reportRoot`. */
export const runTypecheck = async (
  tsconfig: string,
  cwd: string,
  reportRoot: string,
  timeoutMs: number
): Promise<{ result: TscCheckResult; run: SpawnResult }> => {
  const run = await spawnBounded(
    process.execPath,
    [resolveTsc(cwd), '-p', tsconfig, '--noEmit', '--pretty', 'false'],
    cwd,
    timeoutMs
  )
  return {
    run,
    result: parseTscOutput(`${run.stdout}\n${run.stderr}`, reportRoot, {
      maxMessageLength: Number.POSITIVE_INFINITY,
      cwd,
    }),
  }
}
