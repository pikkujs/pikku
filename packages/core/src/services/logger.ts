export enum LogLevel {
  'trace', // Add this level
  'debug',
  'info',
  'warn',
  'error',
  'critical',
}

/**
 * Interface for logging messages at various levels.
 */
export interface Logger {
  /**
   * Logs an informational message.
   * @param messageOrObj - The message or object to log.
   * @param meta - Additional metadata to log.
   */
  info(messageOrObj: string | Record<string, any>, ...meta: any[]): void

  /**
   * Logs a warning message.
   * @param messageOrObj - The message or object to log.
   * @param meta - Additional metadata to log.
   */
  warn(messageOrObj: string | Record<string, any>, ...meta: any[]): void

  /**
   * Logs an error message.
   * @param messageOrObj - The message, object, or error to log.
   * @param meta - Additional metadata to log.
   */
  error(
    messageOrObj: string | Record<string, any> | Error,
    ...meta: any[]
  ): void

  /**
   * Logs a debug message.
   * @param message - The message to log.
   * @param meta - Additional metadata to log.
   */
  debug(message: string, ...meta: any[]): void

  /**
   * Logs a trace message.
   * @param message - The message to log.
   * @param meta - Additional metadata to log.
   */
  trace?(message: string, ...meta: any[]): void

  /**
   * Sets the logging level.
   * @param level - The logging level to set.
   */
  setLevel(level: LogLevel): void

  /**
   * Creates a scoped logger with a traceId included in every log entry.
   * Used per-request to correlate logs across function calls.
   */
  scope?(traceId: string): Logger
}
