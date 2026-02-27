import type { Logger } from './logger.js'
import { LogLevel } from './logger.js'

/**
 * A logger implementation that logs messages to the console.
 */
export class ConsoleLogger implements Logger {
  /**
   * The current logging level.
   */
  private level: LogLevel = LogLevel.info

  /**
   * Sets the logging level.
   * @param level - The logging level to set.
   */
  setLevel(level: LogLevel): void {
    this.level = level
  }

  /**
   * Logs a trace message.
   * @param message - The message to log.
   * @param meta - Additional metadata to log.
   */
  trace?(message: string, ...meta: any[]): void {
    if (this.level <= LogLevel.trace) {
      console.trace('TRACE:', message, ...meta)
    }
  }

  /**
   * Logs a debug message.
   * @param message - The message to log.
   * @param meta - Additional metadata to log.
   */
  debug(message: string, ...meta: any[]): void {
    if (this.level <= LogLevel.debug) {
      console.debug('DEBUG:', message, ...meta)
    }
  }

  /**
   * Logs an informational message.
   * @param messageOrObj - The message or object to log.
   * @param meta - Additional metadata to log.
   */
  info(messageOrObj: string | Record<string, any>, ...meta: any[]): void {
    if (this.level <= LogLevel.info) {
      console.info('INFO:', messageOrObj, ...meta)
    }
  }

  /**
   * Logs a warning message.
   * @param messageOrObj - The message or object to log.
   * @param meta - Additional metadata to log.
   */
  warn(messageOrObj: string | Record<string, any>, ...meta: any[]): void {
    if (this.level <= LogLevel.warn) {
      console.warn('WARN:', messageOrObj, ...meta)
    }
  }

  /**
   * Logs an error message.
   * @param messageOrObj - The message, object, or error to log.
   * @param meta - Additional metadata to log.
   */
  error(
    messageOrObj: string | Record<string, any> | Error,
    ...meta: any[]
  ): void {
    if (this.level <= LogLevel.error) {
      console.error(
        'ERROR:',
        messageOrObj instanceof Error ? messageOrObj.message : messageOrObj,
        ...meta
      )
      if (messageOrObj instanceof Error) {
        console.error('STACK:', messageOrObj.stack)
      }
    }
  }

  /**
   * Logs a message at a specified level.
   * @param level - The logging level.
   * @param message - The message to log.
   * @param meta - Additional metadata to log.
   */
  log(level: string, message: string, ...meta: any[]): void {
    const logLevel = LogLevel[level as keyof typeof LogLevel]
    if (this.level <= logLevel) {
      console.log(`${level.toUpperCase()}:`, message, ...meta)
    }
  }
}
