import { spawnSync } from 'node:child_process'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { PikkuError } from '@pikku/core/errors'

// A type-check failure is expected (the --tsc gate did its job) — throw a
// PikkuError so the runner logs the message alone, not a stack trace.
export class PikkuTypecheckFailedError extends PikkuError {}

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

const MAX_MESSAGE_LENGTH = 200
const DEFAULT_MAX_LINES = 50
const NO_FILE = '(project)'
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024

// `<file>(<line>,<col>): <category> TS<code>: <message>`, with the location
// absent on project-wide diagnostics such as TS18003 (no inputs found).
const DIAGNOSTIC_LINE =
  /^(?:(.+?)\((\d+),(\d+)\): )?(error|warning|message|suggestion) TS(\d+): (.*)$/

const isProjectFile = (fileName: string, rootDir: string): boolean => {
  if (fileName.includes('/node_modules/')) return false
  const rel = relative(rootDir, fileName)
  return !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Locate the compiler to type-check with, preferring the PROJECT's own — a
 * different major than the project's produces diagnostics its real `tsc` never
 * would (seen as phantom TS2591 "Cannot find name 'process'" on a tsconfig that
 * is clean under the project's compiler). Falls back to the CLI's typescript.
 *
 * Resolved through `typescript/package.json` rather than `node_modules/.bin`
 * so it works on every platform, and run with `process.execPath` so a project
 * on TypeScript 7 — which ships a binary but no importable compiler API — is
 * driven exactly like one on 5 or 6.
 */
const resolveTsc = (rootDir: string): string => {
  const fromProject = createRequire(join(rootDir, 'noop.cjs'))
  try {
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

/**
 * Turn raw `tsc --pretty false` output into a filtered, structured result.
 * Pure — it takes already-captured output so it can be unit-tested without
 * running a compiler. Anything under node_modules or outside the project root
 * is dropped so the output stays focused on the user's own code (and not lib
 * .d.ts noise).
 */
export const parseTscOutput = (
  output: string,
  rootDir: string
): TscCheckResult => {
  const files = new Set<string>()
  const collected: TscDiagnostic[] = []
  let errorCount = 0
  let warningCount = 0
  let current: TscDiagnostic | null = null

  const flush = () => {
    if (!current) return
    if (current.message.length > MAX_MESSAGE_LENGTH) {
      current.message = `${current.message.slice(0, MAX_MESSAGE_LENGTH - 1)}…`
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
          : resolve(rootDir, fileName)
        // Skip the whole diagnostic, elaborations included.
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
    // Indented lines continue the previous message (tsc's elaborations);
    // anything else — blank lines, the trailing "Found N errors" — is noise.
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

/**
 * Run a real `tsc --noEmit` over the project's own tsconfig — the correct
 * source of truth (lib, paths, strict), unlike the inspector's stripped-down
 * traversal program. Returns the structured result so the caller can pick the
 * compact (`--tsc-summary`) or full (`--tsc`) render.
 */
export const runProjectTypecheck = (
  tsconfigPath: string,
  rootDir: string
): TscCheckResult => {
  const run = spawnSync(
    process.execPath,
    [resolveTsc(rootDir), '-p', tsconfigPath, '--noEmit', '--pretty', 'false'],
    { cwd: rootDir, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES }
  )
  return parseTscOutput(`${run.stdout ?? ''}\n${run.stderr ?? ''}`, rootDir)
}
