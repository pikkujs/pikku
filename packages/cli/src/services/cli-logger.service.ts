import chalk from 'chalk'
import type { Logger } from '@pikku/core/services'
import { LogLevel } from '@pikku/core/services'
import type { ErrorCode } from '@pikku/inspector'

const logo = `
 ______ _ _     _
(_____ (_) |   | |
 _____) )| |  _| |  _ _   _
|  ____/ | |_/ ) |_/ ) | | |
| |    | |  _ (|  _ (|  _ (| |_| |
|_|    |_|_| _)_| _)____/
`

const BASE_ERROR_URL = 'https://pikku.dev/docs/pikku-cli/errors'
const ANSI_ESCAPE_REGEX = /\x1B\[[0-?]*[ -/]*[@-~]/g
export type CLIOutputMode = 'text' | 'json'

export class CLILogger implements Logger {
  private silent: boolean
  private level: LogLevel = LogLevel.warn // default to warn level
  private criticalErrors: string[] = []
  private outputMode: CLIOutputMode = 'text'

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
  }

  getOutputMode(): CLIOutputMode {
    return this.outputMode
  }

  isSilent(): boolean {
    return this.silent
  }

  private normalizeMessage(message: string): string {
    if (this.outputMode === 'json') {
      return message.replace(ANSI_ESCAPE_REGEX, '')
    }
    return message
  }

  private writeJSONLine(payload: Record<string, unknown>): void {
    process.stdout.write(`${JSON.stringify(payload)}\n`)
  }

  private emit(
    level: 'debug' | 'info' | 'warn' | 'error' | 'critical',
    message: string,
    type?: string,
    code?: ErrorCode
  ): void {
    const normalizedMessage = this.normalizeMessage(message)
    if (this.outputMode === 'json') {
      this.writeJSONLine({
        level,
        message: normalizedMessage,
        ...(type ? { type } : {}),
        ...(code ? { code } : {}),
        ...(code ? { url: `${BASE_ERROR_URL}/${code.toLowerCase()}` } : {}),
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

  info(message: string | { message: string; type?: string }) {
    if (this.level > LogLevel.info || this.silent) return

    const msg = typeof message === 'string' ? message : message.message
    const type = typeof message === 'string' ? undefined : message.type
    this.emit('info', msg, type)
  }

  error(message: string) {
    if (this.level > LogLevel.error) return
    this.emit('error', message)
  }

  warn(message: string) {
    if (this.level > LogLevel.warn) return
    this.emit('warn', message)
  }

  debug(message: string | { message: string; type?: string }) {
    if (this.level > LogLevel.debug || this.silent) return

    const msg = typeof message === 'string' ? message : message.message
    const type = typeof message === 'string' ? undefined : message.type
    this.emit('debug', msg, type)
  }

  critical(code: ErrorCode, message: string) {
    const url = `${BASE_ERROR_URL}/${code.toLowerCase()}`
    const formattedMessage = `[${code}] ${message}\n  → ${url}`
    this.criticalErrors.push(formattedMessage)
    this.emit('critical', formattedMessage, undefined, code)
  }

  hasCriticalErrors(): boolean {
    return this.criticalErrors.length > 0
  }

  logLogo() {
    this.primary(logo)
    // // When running from dist/, __filename is dist/src/services/cli-logger.service.js
    // // So we need to go up 3 levels: dist/src/services -> dist/src -> dist -> package.json
    // const packageJson = JSON.parse(
    //   readFileSync(`${dirname(__filename)}/../../../package.json`, 'utf-8')
    // )
    // this.primary(`⚙️  Welcome to the Pikku CLI (v${packageJson.version})\n`)
  }

  private primary(message: string) {
    if (!this.silent) {
      this.emit('info', message)
    }
  }
}
