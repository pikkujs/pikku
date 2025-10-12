export interface MiddlewareEvent {
  type: 'global' | 'http' | 'wire' | 'function'
  name: string
  phase: 'before' | 'after' | 'execute'
}

export interface MiddlewareCheckerService {
  log(event: MiddlewareEvent): void
  getLastRun(): MiddlewareEvent[]
  clear(): void
}

export class MiddlewareChecker implements MiddlewareCheckerService {
  private lastRun: MiddlewareEvent[] = []

  log(event: MiddlewareEvent) {
    const timestamp = new Date().toISOString().split('T')[1]
    const indent = '  '.repeat(
      this.lastRun.filter((e) => e.phase === 'before').length
    )
    console.log(
      `${indent}[${timestamp}] ${event.type}:${event.name} - ${event.phase}`
    )
    this.lastRun.push(event)
  }

  getLastRun() {
    return [...this.lastRun]
  }

  clear() {
    this.lastRun = []
  }
}
