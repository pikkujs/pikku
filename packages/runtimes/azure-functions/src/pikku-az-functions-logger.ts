import type { InvocationContext } from '@azure/functions'
import type { Logger, LogLevel } from '@pikku/core/services'

export class AzInvocationLogger implements Logger {
  // private logLevel: LogLevel = LogLevel.info

  constructor(private context: InvocationContext) {}

  public info(messageOrObj: string | Record<string, any>): void {
    this.context.info(messageOrObj)
  }

  public warn(messageOrObj: string | Record<string, any>): void {
    this.context.warn(messageOrObj)
  }

  public error(messageOrObj: string | Record<string, any> | Error): void {
    this.context.error(messageOrObj)
  }

  public debug(message: string): void {
    this.context.debug(message)
  }

  public trace(message: string): void {
    this.context.trace(message)
  }

  public setLevel(level: LogLevel): void {
    // this.logLevel = level
  }
}
