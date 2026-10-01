import { spawnSync } from 'node:child_process'
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
