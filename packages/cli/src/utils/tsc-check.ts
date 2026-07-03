import ts from 'typescript'
import { dirname, isAbsolute, relative } from 'node:path'
import { PikkuError } from '@pikku/core'

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

const CATEGORY: Record<ts.DiagnosticCategory, TscDiagnostic['category']> = {
  [ts.DiagnosticCategory.Error]: 'error',
  [ts.DiagnosticCategory.Warning]: 'warning',
  [ts.DiagnosticCategory.Suggestion]: 'suggestion',
  [ts.DiagnosticCategory.Message]: 'message',
}

const MAX_MESSAGE_LENGTH = 200
const DEFAULT_MAX_LINES = 50
const NO_FILE = '(project)'

const isProjectFile = (fileName: string, rootDir: string): boolean => {
  if (fileName.includes('/node_modules/')) return false
  const rel = relative(rootDir, fileName)
  return !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Turn raw tsc diagnostics into a filtered, structured result. Pure — it takes
 * already-computed diagnostics so it can be unit-tested without a program.
 * Anything under node_modules or outside the project root is dropped so the
 * output stays focused on the user's own code (and not lib .d.ts noise).
 */
export const collectTscDiagnostics = (
  diagnostics: readonly ts.Diagnostic[],
  rootDir: string
): TscCheckResult => {
  const files = new Set<string>()
  const collected: TscDiagnostic[] = []
  let errorCount = 0
  let warningCount = 0

  for (const d of diagnostics) {
    let file = NO_FILE
    let line = 0
    let column = 0
    if (d.file) {
      if (!isProjectFile(d.file.fileName, rootDir)) continue
      file = relative(rootDir, d.file.fileName)
      const lc = d.file.getLineAndCharacterOfPosition(d.start ?? 0)
      line = lc.line + 1
      column = lc.character + 1
    }

    const category = CATEGORY[d.category]
    if (category === 'error') errorCount++
    else if (category === 'warning') warningCount++

    let message = ts.flattenDiagnosticMessageText(d.messageText, ' ')
    if (message.length > MAX_MESSAGE_LENGTH) {
      message = `${message.slice(0, MAX_MESSAGE_LENGTH - 1)}…`
    }

    files.add(file)
    collected.push({ file, line, column, code: d.code, category, message })
  }

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
 * Full render: tsc's own formatter with code frames, filtered to project files.
 */
export const renderTscFull = (
  diagnostics: readonly ts.Diagnostic[],
  rootDir: string,
  formatHost: ts.FormatDiagnosticsHost
): string => {
  const filtered = diagnostics.filter(
    (d) => !d.file || isProjectFile(d.file.fileName, rootDir)
  )
  if (filtered.length === 0) return 'Type check passed — no errors.'
  return ts.formatDiagnosticsWithColorAndContext(filtered, formatHost)
}

/**
 * Run a real `tsc --noEmit` over the project's own tsconfig — the correct
 * source of truth (lib, paths, strict), unlike the inspector's stripped-down
 * traversal program. Returns both a structured result and the raw diagnostics
 * so the caller can pick the compact (`--tsc-summary`) or full (`--tsc`) render.
 */
export const runProjectTypecheck = (
  tsconfigPath: string,
  rootDir: string
): {
  result: TscCheckResult
  diagnostics: ts.Diagnostic[]
  formatHost: ts.FormatDiagnosticsHost
} => {
  const formatHost: ts.FormatDiagnosticsHost = {
    getCanonicalFileName: (f) => f,
    getCurrentDirectory: () => rootDir,
    getNewLine: () => ts.sys.newLine,
  }

  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  if (configFile.error) {
    const diagnostics = [configFile.error]
    return {
      result: collectTscDiagnostics(diagnostics, rootDir),
      diagnostics,
      formatHost,
    }
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(tsconfigPath)
  )
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: {
      ...parsed.options,
      noEmit: true,
      incremental: false,
      tsBuildInfoFile: undefined,
    },
  })
  const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)]
  return {
    result: collectTscDiagnostics(diagnostics, rootDir),
    diagnostics,
    formatHost,
  }
}
