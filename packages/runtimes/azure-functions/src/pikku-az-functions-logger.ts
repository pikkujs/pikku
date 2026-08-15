import type { InvocationContext } from '@azure/functions'
import type { Logger, LogLevel } from '@pikku/core/ecosystem/services'
import type { Safe } from '@pikku/core/ecosystem/types'

export class AzInvocationLogger implements Logger {
  // private logLevel: LogLevel = LogLevel.info

  constructor(private context: InvocationContext) {}

  public info<M extends string | Record<string, any>, A extends unknown[]>(
    messageOrObj: Safe<M>,
    ...meta: { [K in keyof A]: Safe<A[K]> }
  ): void {
    this.context.info(messageOrObj as any, ...meta)
  }

  public warn<M extends string | Record<string, any>, A extends unknown[]>(
    messageOrObj: Safe<M>,
    ...meta: { [K in keyof A]: Safe<A[K]> }
  ): void {
    this.context.warn(messageOrObj as any, ...meta)
  }

  public error<
    M extends string | Record<string, any> | Error,
    A extends unknown[],
  >(messageOrObj: Safe<M>, ...meta: { [K in keyof A]: Safe<A[K]> }): void {
    this.context.error(messageOrObj as any, ...meta)
  }

  public debug<A extends unknown[]>(
    message: string,
    ...meta: { [K in keyof A]: Safe<A[K]> }
  ): void {
    this.context.debug(message, ...meta)
  }

  public trace<A extends unknown[]>(
    message: string,
    ...meta: { [K in keyof A]: Safe<A[K]> }
  ): void {
    this.context.trace(message, ...meta)
  }

  public setLevel(level: LogLevel): void {
    // this.logLevel = level
  }
}
