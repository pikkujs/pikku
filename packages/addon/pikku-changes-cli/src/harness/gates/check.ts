import { pikkuHarnessGate, type HarnessCliOutput } from '@pikku/core/harness'
import type { Finding } from '../finding.js'

/** One diagnostic of `pikku check --json`. */
type CheckDiagnostic = {
  severity: 'warn' | 'error' | 'critical'
  code: string
  message: string
  project?: string
  file?: string
  line?: number
  column?: number
}

/** The one result line `pikku check --json` prints. */
type CheckResult = {
  ok: boolean
  source: string
  diagnostics: CheckDiagnostic[]
  stuck?: { stage: string; message: string }
  durationMs?: number
}

const SEVERITY: Record<CheckDiagnostic['severity'], Finding['severity']> = {
  critical: 'high',
  error: 'high',
  warn: 'low',
}

const isResult = (value: unknown): value is CheckResult => {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  return typeof result.ok === 'boolean' && Array.isArray(result.diagnostics)
}

/**
 * Reads what `pikku check --json` printed (one JSON object per line on stdout; stderr holds notes
 * such as which pikku.config.json it used) into findings: an error or a critical diagnostic is high,
 * a warning low. It fails closed: no result line, a diagnostic it does not know, a run that got
 * stuck, or an `ok` that disagrees with the diagnostics or the exit code throws, and runCli reports
 * that as infra.
 */
export const parsePikkuCheck = ({
  stdout,
  code,
}: HarnessCliOutput): Finding[] => {
  const results = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as unknown)
    .filter(isResult)
  const result = results.at(-1)
  if (!result) throw new Error('pikku check printed no result line')
  if (result.stuck)
    throw new Error(
      `pikku check got stuck in ${result.stuck.stage}: ${result.stuck.message}`
    )
  const findings = result.diagnostics.map((d): Finding => {
    const severity = SEVERITY[d.severity]
    if (!severity || typeof d.message !== 'string')
      throw new Error(
        `pikku check reported a diagnostic it should not: ${JSON.stringify(d).slice(0, 200)}`
      )
    return {
      ...(d.file ? { file: d.file } : {}),
      ...(Number.isInteger(d.line) ? { line: d.line } : {}),
      severity,
      rule: `pikku/${d.code}`,
      // A file is relative to its pikku project (packages/functions), which the project name says.
      message: d.project ? `${d.message} (project ${d.project})` : d.message,
    }
  })
  const blocking = findings.some((f) => f.severity === 'high')
  if (result.ok === blocking)
    throw new Error(
      `pikku check said ok=${result.ok} with ${blocking ? 'errors' : 'no errors'} in its diagnostics`
    )
  if (result.ok !== (code === 0))
    throw new Error(`pikku check said ok=${result.ok} but exited ${code}`)
  return findings
}

/**
 * The first gate of an attempt: `pikku check --json` (codegen and the type-check) in the worktree
 * with the run's pinned pikku CLI, never the worktree's own. It writes only generated code under
 * `.pikku` (at the root or in a package), so it runs alone, before the fixers and the read-only
 * gates, which read what it generated.
 */
export const checkGate = pikkuHarnessGate({
  name: 'check',
  description:
    'Generates the code and type-checks the project with pikku check',
  failOn: 'high',
  writes: ['.pikku/**', '**/.pikku/**'],
  func: async (_services, _data, { gate }) =>
    gate.runCli(['check', '--json', '--timeout', '600'], {
      binary: gate.tool('pikku'),
      parse: parsePikkuCheck,
      okCodes: [0],
      timeoutMs: 660_000,
    }),
})
