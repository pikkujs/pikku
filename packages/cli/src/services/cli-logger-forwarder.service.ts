import { Logger, LogLevel, PikkuChannel } from '@pikku/core'
import { ErrorCode } from '@pikku/inspector'

/**
 * Log message structure sent through the channel
 */
export interface ForwardedLogMessage {
  message: string
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error'
  type?: string
}

/**
 * A logger implementation that forwards log messages to a CLI channel
 * instead of logging to console directly.
 */
export class CLILoggerForwarder implements Logger {
  private level: LogLevel = LogLevel.info

  constructor(
    private logger: Logger,
    private channel: PikkuChannel<unknown, any>
  ) {}

  setLevel(level: LogLevel): void {
    this.level = level
  }

  private log(
    level: ForwardedLogMessage['level'],
    logLevel: LogLevel,
    messageOrObj: string | Record<string, any> | Error,
    type?: string
  ) {
    if (this.level > logLevel) return

    let message: string

    if (messageOrObj instanceof Error) {
      this.logger.error(messageOrObj)
      message = messageOrObj.message
    } else if (typeof messageOrObj === 'object') {
      if (
        'message' in messageOrObj &&
        typeof messageOrObj.message === 'string'
      ) {
        message = messageOrObj.message
        type = type || (messageOrObj.type as string)
      } else {
        message = JSON.stringify(messageOrObj)
      }
    } else {
      message = messageOrObj
    }

    this.channel.send({ message, level, type })
  }

  info(messageOrObj: string | Record<string, any>, ..._meta: any[]) {
    this.log('info', LogLevel.info, messageOrObj)
  }

  error(messageOrObj: string | Record<string, any> | Error, ..._meta: any[]) {
    this.log('error', LogLevel.error, messageOrObj)
  }

  warn(messageOrObj: string | Record<string, any>, ..._meta: any[]) {
    this.log('warn', LogLevel.warn, messageOrObj)
  }

  debug(message: string, ..._meta: any[]) {
    this.log('debug', LogLevel.debug, message)
  }

  trace(message: string, ..._meta: any[]) {
    this.log('trace', LogLevel.trace, message)
  }

  critical(code: ErrorCode, message: string) {
    const url = `https://pikku.dev/docs/cli-errors/${code.toLowerCase()}`
    const formattedMessage = `[${code}] ${message}\n  → ${url}`
    this.error(formattedMessage)
  }

  hasCriticalErrors(): boolean {
    // The underlying logger (CLILogger) tracks critical errors
    return (this.logger as any).hasCriticalErrors?.() ?? false
  }
}
