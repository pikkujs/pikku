import chalk from 'chalk'
import { readFileSync } from 'fs'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { Logger, LogLevel } from '@pikku/core'

const __filename = fileURLToPath(import.meta.url)

const logo = `
 ______ _ _     _
(_____ (_) |   | |
 _____) )| |  _| |  _ _   _
|  ____/ | |_/ ) |_/ ) | | |
| |    | |  _ (|  _ (|  _ (| |_| |
|_|    |_|_| _)_| _)____/
`

export class CLILogger implements Logger {
  private silent: boolean
  private level: LogLevel = LogLevel.info

  constructor({
    logLogo,
    silent = false,
  }: {
    logLogo: boolean
    silent?: boolean
  }) {
    this.silent = silent
    if (logLogo && !silent) {
      this.logPikkuLogo()
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level
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

  debug(message: string) {
    if (this.level > LogLevel.debug || this.silent) return
    console.log(chalk.gray(message))
  }

  private logPikkuLogo() {
    this.primary(logo)
    // When running from dist/, __filename is dist/src/services/cli-logger.service.js
    // So we need to go up 3 levels: dist/src/services -> dist/src -> dist -> package.json
    const packageJson = JSON.parse(
      readFileSync(`${dirname(__filename)}/../../../package.json`, 'utf-8')
    )
    this.primary(`⚙️  Welcome to the Pikku CLI (v${packageJson.version})\n`)
  }

  private primary(message: string) {
    if (!this.silent) {
      console.log(chalk.green(message))
    }
  }
}
