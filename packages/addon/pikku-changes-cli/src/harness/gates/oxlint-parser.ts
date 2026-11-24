import type { Finding, Severity } from '../finding.js'
import type { HarnessCliOutput } from '@pikku/core/harness'

type OxlintDiagnostic = {
  message: string
  code?: string
  severity: string
  help?: string
  filename?: string
  labels?: { span?: { line?: number } }[]
}

const SEVERITY: Record<string, Severity> = {
  error: 'high',
  warning: 'medium',
  advice: 'low',
}

/** `eslint(no-debugger)` -> `eslint/no-debugger`. */
const ruleName = (code: string) => code.replace(/^([^(]+)\((.+)\)$/, '$1/$2')

/**
 * `oxlint --format=json`: one JSON object with a `diagnostics` array. oxlint may print a plain
 * notice line before it (for example "No files found to lint"), so the object starts at the first
 * line that opens with `{`.
 */
export const parseOxlint = ({ stdout }: HarnessCliOutput): Finding[] => {
  const lines = stdout.split('\n')
  const start = lines.findIndex((line) => line.startsWith('{'))
  if (start < 0) throw new Error('no JSON object in oxlint output')
  const report = JSON.parse(lines.slice(start).join('\n')) as {
    diagnostics?: unknown
  }
  if (!report || !Array.isArray(report.diagnostics))
    throw new Error('oxlint output has no diagnostics array')
  return (report.diagnostics as OxlintDiagnostic[]).map((diagnostic) => {
    const severity = SEVERITY[diagnostic.severity]
    if (!severity || typeof diagnostic.message !== 'string')
      throw new Error(
        `unknown oxlint diagnostic severity ${diagnostic.severity}`
      )
    const line = diagnostic.labels?.[0]?.span?.line
    return {
      ...(diagnostic.filename ? { file: diagnostic.filename } : {}),
      ...(typeof line === 'number' ? { line } : {}),
      severity,
      ...(diagnostic.code ? { rule: ruleName(diagnostic.code) } : {}),
      message: diagnostic.help
        ? `${diagnostic.message}. ${diagnostic.help}`
        : diagnostic.message,
    }
  })
}
