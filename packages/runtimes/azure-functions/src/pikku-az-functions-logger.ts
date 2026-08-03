import type { InvocationContext } from '@azure/functions'
import type { Logger, LogLevel } from '@pikku/core/services'

export class AzInvocationLogger implements Logger {
  // private logLevel: LogLevel = LogLevel.info

  constructor(private context: InvocationContext) {}

  public info(
    messageOrObj: string | Record<string, any>,
    ...meta: any[]
  ): void {
    this.context.info(messageOrObj, ...meta)
  }

  public warn(
    messageOrObj: string | Record<string, any>,
    ...meta: any[]
  ): void {
    this.context.warn(messageOrObj, ...meta)
  }

  public error(
    messageOrObj: string | Record<string, any> | Error,
    ...meta: any[]
  ): void {
    this.context.error(messageOrObj, ...meta)
  }

  public debug(message: string, ...meta: any[]): void {
    this.context.debug(message, ...meta)
  }

  public trace(message: string, ...meta: any[]): void {
    this.context.trace(message, ...meta)
  }

  public setLevel(level: LogLevel): void {
    // this.logLevel = level
  }
}
