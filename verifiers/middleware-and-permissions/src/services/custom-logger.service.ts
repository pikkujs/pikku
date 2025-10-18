import { ConsoleLogger } from '@pikku/core/services'

export class CustomLogger extends ConsoleLogger {
  private logs: any[] = []

  public info(messageOrObj: string | Record<string, any>, ...meta: any[]) {
    super.info(messageOrObj, ...meta)
    this.logs.push(messageOrObj)
  }

  getLogs() {
    return this.logs
  }

  clear() {
    this.logs = []
  }
}
