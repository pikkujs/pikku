import type { Logger } from './logger.js'
import { LogLevel } from './logger.js'

/**
 * Text-mode console logger.
 * Output: `INFO: message` or `[traceId] INFO: message`
 */
export class ConsoleLogger implements Logger {
  private level: LogLevel = LogLevel.info
  private prefix: string

  constructor(traceId?: string) {
    this.prefix = traceId ? `[${traceId}]` : ''
  }

  setLevel(level: LogLevel): void {
    this.level = level
  }

  scope(traceId: string): Logger {
    const scoped = new ConsoleLogger(traceId)
    scoped.level = this.level
    return scoped
  }

  trace(message: string, ...meta: any[]): void {
    if (this.level <= LogLevel.trace) {
      console.trace(this.prefix, 'TRACE:', message, ...meta)
    }
  }

  debug(message: string, ...meta: any[]): void {
    if (this.level <= LogLevel.debug) {
      console.debug(this.prefix, 'DEBUG:', message, ...meta)
    }
  }

  info(messageOrObj: string | Record<string, any>, ...meta: any[]): void {
    if (this.level <= LogLevel.info) {
      console.info(this.prefix, 'INFO:', messageOrObj, ...meta)
    }
  }

  warn(messageOrObj: string | Record<string, any>, ...meta: any[]): void {
    if (this.level <= LogLevel.warn) {
      console.warn(this.prefix, 'WARN:', messageOrObj, ...meta)
    }
  }

  error(
    messageOrObj: string | Record<string, any> | Error,
    ...meta: any[]
  ): void {
    if (this.level <= LogLevel.error) {
      console.error(
        this.prefix,
        'ERROR:',
        messageOrObj instanceof Error ? messageOrObj.message : messageOrObj,
        ...meta
      )
      if (messageOrObj instanceof Error) {
        console.error(this.prefix, 'STACK:', messageOrObj.stack)
      }
    }
  }

  log(level: string, message: string, ...meta: any[]): void {
    const logLevel = LogLevel[level as keyof typeof LogLevel]
    if (this.level <= logLevel) {
      console.log(this.prefix, `${level.toUpperCase()}:`, message, ...meta)
    }
  }
}

/**
 * JSON-mode console logger.
 * Output: `{"level":"info","message":"...","traceId":"..."}`
 * CF Workers Logs auto-indexes JSON keys for filtering.
 */
export class JsonConsoleLogger implements Logger {
  private level: LogLevel = LogLevel.info
  private traceId: string | undefined

  constructor(traceId?: string) {
    this.traceId = traceId
  }

  setLevel(level: LogLevel): void {
    this.level = level
  }

  scope(traceId: string): Logger {
    const scoped = new JsonConsoleLogger(traceId)
    scoped.level = this.level
    return scoped
  }

  trace(message: string, ...meta: any[]): void {
    if (this.level <= LogLevel.trace) {
      this.emit(console.debug, 'trace', message, meta)
    }
  }

  debug(message: string, ...meta: any[]): void {
    if (this.level <= LogLevel.debug) {
      this.emit(console.debug, 'debug', message, meta)
    }
  }

  info(messageOrObj: string | Record<string, any>, ...meta: any[]): void {
    if (this.level <= LogLevel.info) {
      this.emit(console.info, 'info', messageOrObj, meta)
    }
  }

  warn(messageOrObj: string | Record<string, any>, ...meta: any[]): void {
    if (this.level <= LogLevel.warn) {
      this.emit(console.warn, 'warn', messageOrObj, meta)
    }
  }

  error(
    messageOrObj: string | Record<string, any> | Error,
    ...meta: any[]
  ): void {
    if (this.level <= LogLevel.error) {
      if (messageOrObj instanceof Error) {
        this.emit(console.error, 'error', messageOrObj.message, meta)
        console.error(
          JSON.stringify({
            level: 'error',
            message: 'stack',
            stack: messageOrObj.stack,
            ...(this.traceId ? { traceId: this.traceId } : {}),
          })
        )
      } else {
        this.emit(console.error, 'error', messageOrObj, meta)
      }
    }
  }

  log(level: string, message: string, ...meta: any[]): void {
    const logLevel = LogLevel[level as keyof typeof LogLevel]
    if (this.level <= logLevel) {
      this.emit(console.log, level, message, meta)
    }
  }

  private emit(
    fn: (...args: any[]) => void,
    level: string,
    messageOrObj: string | Record<string, any>,
    meta: any[]
  ): void {
    const entry: Record<string, unknown> = { level }
    if (this.traceId) entry.traceId = this.traceId
    if (typeof messageOrObj === 'string') {
      entry.message = messageOrObj
    } else {
      Object.assign(entry, messageOrObj)
    }
    if (meta.length > 0) entry.meta = meta
    fn(JSON.stringify(entry))
  }
}
