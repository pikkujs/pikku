import chalk from 'chalk'
import { Logger, LogLevel } from '@pikku/core'
import { ErrorCode } from '@pikku/inspector'

const logo = `
 ______ _ _     _
(_____ (_) |   | |
 _____) )| |  _| |  _ _   _
|  ____/ | |_/ ) |_/ ) | | |
| |    | |  _ (|  _ (|  _ (| |_| |
|_|    |_|_| _)_| _)____/
`

const BASE_ERROR_URL = 'https://pikku.dev/errors'

export class CLILogger implements Logger {
  private silent: boolean
  private level: LogLevel = LogLevel.warn // default to warn level
  private criticalErrors: string[] = []

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

  isSilent(): boolean {
    return this.silent
  }

  info(message: string | { message: string; type?: string }) {
    if (this.level > LogLevel.info || this.silent) return

    let c = chalk.blue
    if (typeof message === 'object') {
      if (message.type === 'success') {
        c = chalk.green
      } else if (message.type === 'timing') {
        c = chalk.gray
      }
    }
    console.log(c(typeof message === 'string' ? message : message.message))
  }

  error(message: string) {
    if (this.level > LogLevel.error) return
    console.error(chalk.red(message))
  }

  warn(message: string) {
    if (this.level > LogLevel.warn) return
    console.error(chalk.yellow(message))
  }

  debug(message: string | { message: string; type?: string }) {
    if (this.level > LogLevel.debug || this.silent) return

    let c = chalk.gray
    if (typeof message === 'object') {
      if (message.type === 'success') {
        c = chalk.green
      }
    }
    console.log(c(typeof message === 'string' ? message : message.message))
  }

  critical(code: ErrorCode, message: string) {
    const url = `${BASE_ERROR_URL}/${code.toLowerCase()}`
    const formattedMessage = `[${code}] ${message}\n  → ${url}`
    this.criticalErrors.push(formattedMessage)
    console.error(chalk.red.bold(formattedMessage))
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
      console.log(chalk.green(message))
    }
  }
}
