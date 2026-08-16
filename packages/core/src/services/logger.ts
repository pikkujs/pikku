import type { Safe } from '../classification/secret-value.js'

export enum LogLevel {
  trace,
  debug,
  info,
  warn,
  error,
  critical,
}

/**
 * A log line is the easiest place to leak a vault secret, so every parameter is
 * `Safe<>`-guarded: a `SecretValue` anywhere in the message or the metadata,
 * however deeply nested, collapses to `never` and fails the build. Reveal it
 * first if you genuinely mean to log it.
 */
export interface Logger {
  info<M extends string | Record<string, any>, A extends unknown[]>(
    messageOrObj: Safe<M>,
    ...meta: { [K in keyof A]: Safe<A[K]> }
  ): void

  warn<M extends string | Record<string, any>, A extends unknown[]>(
    messageOrObj: Safe<M>,
    ...meta: { [K in keyof A]: Safe<A[K]> }
  ): void

  error<M extends string | Record<string, any> | Error, A extends unknown[]>(
    messageOrObj: Safe<M>,
    ...meta: { [K in keyof A]: Safe<A[K]> }
  ): void

  debug<A extends unknown[]>(
    message: string,
    ...meta: { [K in keyof A]: Safe<A[K]> }
  ): void

  trace?<A extends unknown[]>(
    message: string,
    ...meta: { [K in keyof A]: Safe<A[K]> }
  ): void

  setLevel(level: LogLevel): void

  /** A logger carrying a traceId on every entry, taken per-request to correlate calls. */
  scope?(traceId: string): Logger
}
