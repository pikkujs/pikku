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

  primary(message: string) {
    if (!this.silent) {
      console.log(chalk.green(message))
    }
  }
  success(message: string) {
    if (!this.silent) {
      console.log(chalk.green(message))
    }
  }
  info(message: string) {
    if (!this.silent) {
      console.log(chalk.blue(message))
    }
  }
  error(message: string) {
    console.error(chalk.red(message))
  }
  warn(message: string) {
    console.error(chalk.yellow(message))
  }
  debug(message: string) {
    if (process.env.DEBUG && !this.silent) {
      console.log(chalk.gray(message))
    }
  }

  timing(message: string) {
    console.log(chalk.gray(message))
  }

  private logPikkuLogo() {
    this.primary(logo)
    const packageJson = JSON.parse(
      readFileSync(`${dirname(__filename)}/../../package.json`, 'utf-8')
    )
    this.primary(`⚙️ Welcome to the Pikku CLI (v${packageJson.version})\n`)
  }
}
