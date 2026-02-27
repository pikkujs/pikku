import * as pino from 'pino'

import type { Logger } from '@pikku/core/services'
import { LogLevel } from '@pikku/core/services'

export class PinoLogger implements Logger {
  public pino: pino.Logger

  constructor() {
    this.pino = pino.pino()
  }

  setLevel(level: LogLevel): void {
    // Using any here since we know they map
    this.pino.level = LogLevel[level]
  }

  info(messageOrObj: string | Record<string, any> | Error): void {
    this.pino.info(messageOrObj)
  }

  warn(messageOrObj: string | Record<string, any> | Error): void {
    this.pino.warn(messageOrObj)
  }

  error(messageOrObj: string | Record<string, any> | Error): void {
    this.pino.error(messageOrObj)
  }

  debug(messageOrObj: string | Record<string, any>): void {
    this.pino.debug(messageOrObj)
  }
}
