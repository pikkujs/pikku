import * as pino from 'pino'

import { LogLevel } from '@pikku/core/services'
import type { Logger } from '@pikku/core/services'
import type { Safe } from '@pikku/core/secret-value'

export class PinoLogger implements Logger {
  public pino: pino.Logger

  constructor() {
    this.pino = pino.pino()
  }

  setLevel(level: LogLevel): void {
    // Using any here since we know they map
    this.pino.level = LogLevel[level]
  }

  info<M extends string | Record<string, any> | Error, A extends unknown[]>(
    messageOrObj: Safe<M>,
    ...meta: { [K in keyof A]: Safe<A[K]> }
  ): void {
    this.pino.info(messageOrObj as any, ...(meta as any[]))
  }

  warn<M extends string | Record<string, any> | Error, A extends unknown[]>(
    messageOrObj: Safe<M>,
    ...meta: { [K in keyof A]: Safe<A[K]> }
  ): void {
    this.pino.warn(messageOrObj as any, ...(meta as any[]))
  }

  error<M extends string | Record<string, any> | Error, A extends unknown[]>(
    messageOrObj: Safe<M>,
    ...meta: { [K in keyof A]: Safe<A[K]> }
  ): void {
    this.pino.error(messageOrObj as any, ...(meta as any[]))
  }

  debug<A extends unknown[]>(
    message: string,
    ...meta: { [K in keyof A]: Safe<A[K]> }
  ): void {
    this.pino.debug(message as any, ...(meta as any[]))
  }
}
