import chalk from 'chalk'
import type { Logger } from '@pikku/core/services'
import { LogLevel } from '@pikku/core/services'
import { isExpectedError } from '@pikku/core'
import type {
  ErrorCode,
  DiagnosticSeverity,
  CodedDiagnostic,
} from '@pikku/inspector'

// Compact one-line wordmark — the old multi-line ASCII art got cropped in
// short/narrow AI-agent panes. Coloured directly (not via the blue `info`
// path) so the cyan/bold render correctly.
const logo = `${chalk.cyan('◇◆')} ${chalk.bold('pikku')} ${chalk.cyan.bold('::')}`

const BASE_ERROR_URL = 'https://pikku.dev/docs/pikku-cli/errors'
const ANSI_ESCAPE_REGEX = /\x1B\[[0-?]*[ -/]*[@-~]/g
export type CLIOutputMode = 'text' | 'json'

export class CLILogger implements Logger {
  private silent: boolean
  private level: LogLevel = LogLevel.info // default to info level
  private diagnostics: CodedDiagnostic[] = []
  // Severities that should fail the build. Critical always blocks; error/warn
  // are opt-in via --fail-on-error / --fail-on-warn.
  private failOn: Set<DiagnosticSeverity> = new Set<DiagnosticSeverity>([
    'critical',
  ])
  private outputMode: CLIOutputMode = 'text'
  private jsonFlushHookRegistered = false

  constructor({
    logLogo,
    silent = false,
  }: {
    logLogo: boolean
    silent?: boolean
  }) {
    this.silent = silent
    if (logLogo && !silent) {
      this.logLogo()
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level
  }

  setSilent(silent: boolean): void {
    this.silent = silent
  }

  setOutputMode(mode: CLIOutputMode): void {
    this.outputMode = mode
    if (mode === 'json') {
      this.ensureJSONFlushHook()
    }
  }

  getOutputMode(): CLIOutputMode {
    return this.outputMode
  }

  isSilent(): boolean {
    return this.silent
  }

  private normalizeMessage(message: unknown): string {
    const str =
      typeof message === 'string'
        ? message
        : message instanceof Error
          ? (message.stack ?? message.message)
          : typeof message === 'object' && message !== null
            ? JSON.stringify(message)
            : String(message)
    if (this.outputMode === 'json') {
      return str.replace(ANSI_ESCAPE_REGEX, '')
    }
    return str
  }

  private writeJSONLine(payload: Record<string, unknown>): void {
    // Logs go to stderr so stdout is reserved for command data output.
    // This lets consumers pipe `pikku <cmd> --json | jq` or
    // `pikku meta context --json | pikku plan ingest -` without log noise.
    process.stderr.write(`${JSON.stringify(payload)}\n`)
  }

  private ensureJSONFlushHook(): void {
    if (this.jsonFlushHookRegistered) return
    this.jsonFlushHookRegistered = true
    process.once('beforeExit', () => this.flushJSONBuffer())
    process.once('exit', () => this.flushJSONBuffer())
  }

  // NDJSON records are written synchronously in `emit` so consumers can
  // stream output; nothing is buffered. Kept as a no-op because the
  // beforeExit/exit hooks installed by `ensureJSONFlushHook` still
  // reference it, and external callers may rely on the signature.
  flushJSONBuffer(): void {}

  private emit(
    level: 'debug' | 'info' | 'warn' | 'error' | 'critical',
    message: string,
    type?: string,
    code?: ErrorCode,
    data?: Record<string, unknown>
  ): void {
    const normalizedMessage = this.normalizeMessage(message)
    if (this.outputMode === 'json') {
      this.writeJSONLine({
        level,
        message: normalizedMessage,
        ...(type ? { type } : {}),
        ...(code ? { code } : {}),
        ...(code ? { url: `${BASE_ERROR_URL}/${code.toLowerCase()}` } : {}),
        ...(data ? { data } : {}),
        timestamp: new Date().toISOString(),
      })
      return
    }

    if (level === 'error') {
      console.error(chalk.red(normalizedMessage))
      return
    }

    if (level === 'warn') {
      console.error(chalk.yellow(normalizedMessage))
      return
    }

    if (level === 'critical') {
      console.error(chalk.red.bold(normalizedMessage))
      return
    }

    let c = level === 'info' ? chalk.blue : chalk.gray
    if (type === 'success') {
      c = chalk.green
    } else if (type === 'timing' && level === 'info') {
      c = chalk.gray
    }
    console.log(c(normalizedMessage))
  }

  info(
    message:
      | string
      | { message: string; type?: string; data?: Record<string, unknown> }
  ) {
    if (this.level > LogLevel.info || this.silent) return

    const msg = typeof message === 'string' ? message : message.message
    const type = typeof message === 'string' ? undefined : message.type
    const data = typeof message === 'string' ? undefined : message.data
    this.emit('info', msg, type, undefined, data)
  }

  error(
    message:
      | string
      | Error
      | { message: string; type?: string; data?: Record<string, unknown> }
  ) {
    if (this.level > LogLevel.error) return
    if (message instanceof Error) {
      // An expected failure (a deliberate PikkuError, e.g. a build gate
      // tripping) — its message says everything, so don't dump the stack.
      // Anything else is an uncaught error: show the full trace to debug it.
      this.emit(
        'error',
        isExpectedError(message)
          ? message.message
          : (message.stack ?? message.message)
      )
      return
    }
    const msg = typeof message === 'string' ? message : message.message
    const type = typeof message === 'string' ? undefined : message.type
    const data = typeof message === 'string' ? undefined : message.data
    this.emit('error', msg, type, undefined, data)
  }

  warn(
    message:
      | string
      | { message: string; type?: string; data?: Record<string, unknown> }
  ) {
    if (this.level > LogLevel.warn) return
    const msg = typeof message === 'string' ? message : message.message
    const type = typeof message === 'string' ? undefined : message.type
    const data = typeof message === 'string' ? undefined : message.data
    this.emit('warn', msg, type, undefined, data)
  }

  debug(
    message:
      | string
      | { message: string; type?: string; data?: Record<string, unknown> }
  ) {
    if (this.level > LogLevel.debug || this.silent) return

    const msg = typeof message === 'string' ? message : message.message
    const type = typeof message === 'string' ? undefined : message.type
    const data = typeof message === 'string' ? undefined : message.data
    this.emit('debug', msg, type, undefined, data)
  }

  diagnostic({ severity, code, message }: CodedDiagnostic) {
    const url = `${BASE_ERROR_URL}/${code.toLowerCase()}`
    const formattedMessage = `[${code}] ${message}\n  → ${url}`
    this.diagnostics.push({ severity, code, message })
    // critical → bold red, error → red, warn → yellow. Always printed so the
    // issue surfaces even when it doesn't fail the build.
    this.emit(severity, formattedMessage, undefined, code)
  }

  /** Sugar for `diagnostic({ severity: 'critical', code, message })`. */
  critical(code: ErrorCode, message: string) {
    this.diagnostic({ severity: 'critical', code, message })
  }

  /**
   * Configure which severities fail the build. Critical is always included.
   */
  setFailOn(severities: Iterable<DiagnosticSeverity>) {
    this.failOn = new Set<DiagnosticSeverity>(['critical', ...severities])
  }

  hasCriticalErrors(): boolean {
    return this.diagnostics.some((d) => d.severity === 'critical')
  }

  /**
   * True if any tracked diagnostic matches a severity configured to fail the
   * build (default: critical only).
   */
  hasBlockingDiagnostics(): boolean {
    return this.diagnostics.some((d) => this.failOn.has(d.severity))
  }

  /** Distinct severities among tracked diagnostics that would fail the build. */
  blockingSeverities(): DiagnosticSeverity[] {
    return [...this.failOn].filter((s) =>
      this.diagnostics.some((d) => d.severity === s)
    )
  }

  logLogo() {
    if (this.silent || this.outputMode === 'json') return
    console.log(`\n${logo}\n`)
  }
}
