export enum LogLevel {
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'critical',
}

export interface Logger {
  info(messageOrObj: string | Record<string, any>, ...meta: any[]): void

  warn(messageOrObj: string | Record<string, any>, ...meta: any[]): void

  error(
    messageOrObj: string | Record<string, any> | Error,
    ...meta: any[]
  ): void

  debug(message: string, ...meta: any[]): void

  trace?(message: string, ...meta: any[]): void

  setLevel(level: LogLevel): void

  /** A logger carrying a traceId on every entry, taken per-request to correlate calls. */
  scope?(traceId: string): Logger
}
