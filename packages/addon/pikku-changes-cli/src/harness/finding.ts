export type Severity = 'low' | 'medium' | 'high'

export const SEVERITIES: readonly Severity[] = ['low', 'medium', 'high']

/** One thing a gate found. The engine compares `severity` with the gate's `failOn`. */
export type Finding = {
  file?: string
  line?: number
  severity: Severity
  rule?: string
  message: string
}

/**
 * Why a gate could not give an answer, as opposed to an answer with findings in it. Infra errors
 * never go to the builder: the engine maps them to a stopped run.
 */
export type InfraKind =
  | 'missing-binary'
  | 'timeout'
  | 'aborted'
  | 'unparseable'
  | 'exit-code'
  | 'write-outside-allowlist'
  | 'empty-commit'
  | 'git'
  /** The model provider refused for a usage or rate limit; wait (`retryAfterMs` when it said) and retry. */
  | 'provider-limit'

export class HarnessInfraError extends Error {
  readonly kind: InfraKind
  /** Cleaned, trimmed and redacted output of the failed call, when there was one. */
  readonly output?: string
  readonly exitCode?: number
  /** How long to wait before trying again, when the failing service said. */
  readonly retryAfterMs?: number

  constructor(
    kind: InfraKind,
    message: string,
    extra: { output?: string; exitCode?: number; retryAfterMs?: number } = {}
  ) {
    super(message)
    this.name = 'HarnessInfraError'
    this.kind = kind
    this.output = extra.output
    this.exitCode = extra.exitCode
    this.retryAfterMs = extra.retryAfterMs
  }
}

export const isFinding = (value: unknown): value is Finding => {
  if (!value || typeof value !== 'object') return false
  const finding = value as Record<string, unknown>
  return (
    typeof finding.message === 'string' &&
    SEVERITIES.includes(finding.severity as Severity) &&
    (finding.file === undefined || typeof finding.file === 'string') &&
    (finding.line === undefined ||
      (typeof finding.line === 'number' && Number.isInteger(finding.line))) &&
    (finding.rule === undefined || typeof finding.rule === 'string')
  )
}
