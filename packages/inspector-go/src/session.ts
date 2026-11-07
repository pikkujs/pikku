import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { findInspectorBinary } from './binary.js'
import { InspectorHelperError } from './helpers.js'

export type TypeDiagnostic = {
  message: string
  code: number
  severity: 'error' | 'warning' | 'info'
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

type Pending = {
  child: ChildProcess
  resolve: (result: any) => void
  reject: (error: Error) => void
}

type Response = {
  id: number
  result?: unknown
  error?: { name?: string; message: string }
  /** The Rust engine leaks per request; it asks to be retired once its budget is spent. */
  recycle?: boolean
}

/**
 * A long-lived `pikku-inspect serve` process. Its parsed files and per-workspace
 * state survive between calls, which a one-shot helper cannot offer. The process
 * starts on first use, restarts after it dies, and never keeps this one alive.
 */
export class InspectorSession {
  private child: ChildProcess | undefined
  private readonly pending = new Map<number, Pending>()
  private nextId = 1

  constructor(private readonly binary: () => string = findInspectorBinary) {}

  /** Type-checks one file of the workspace at `root`; `content` stands in for the file on disk when given. */
  typeDiagnostics(
    root: string,
    path: string,
    content?: string
  ): Promise<TypeDiagnostic[]> {
    return this.call('typeDiagnostics', { root, path, content })
  }

  close(): void {
    const child = this.child
    this.child = undefined
    child?.stdin?.end()
    child?.kill()
  }

  private start(): ChildProcess {
    if (this.child) return this.child
    const binary = this.binary()
    const child = spawn(binary, ['serve'], {
      stdio: ['pipe', 'pipe', 'inherit'],
    })
    this.hold(child, false)
    createInterface({ input: child.stdout! }).on('line', (line) => {
      let response: Response
      try {
        response = JSON.parse(line)
      } catch {
        return
      }
      const waiting = this.pending.get(response.id)
      if (!waiting) return
      this.pending.delete(response.id)
      if (response.recycle) this.retire(child)
      if (!this.waitingOn(child)) this.hold(child, false)
      if (response.error)
        waiting.reject(
          new InspectorHelperError(
            response.error.message,
            response.error.name || undefined
          )
        )
      else waiting.resolve(response.result)
    })
    const fail = (message: string) => {
      if (this.child === child) this.child = undefined
      for (const [id, waiting] of this.pending) {
        if (waiting.child !== child) continue
        this.pending.delete(id)
        waiting.reject(new InspectorHelperError(message))
      }
      this.hold(child, false)
    }
    child.on('error', (error) =>
      fail(`Could not start ${binary}: ${error.message}`)
    )
    child.on('close', (code, signal) =>
      fail(`${binary} serve exited with ${signal ?? `code ${code}`}`)
    )
    this.child = child
    return child
  }

  private waitingOn(child: ChildProcess): boolean {
    for (const waiting of this.pending.values()) {
      if (waiting.child === child) return true
    }
    return false
  }

  /**
   * Stops sending to `child`; it answers what it already has and exits at EOF,
   * and the next call starts a new process.
   */
  private retire(child: ChildProcess): void {
    if (this.child === child) this.child = undefined
    child.stdin?.end()
  }

  /** Keeps the process alive only while a request is waiting on it. */
  private hold(child: ChildProcess, held: boolean): void {
    const handles = [child, child.stdin, child.stdout] as {
      ref?: () => void
      unref?: () => void
    }[]
    for (const handle of handles) held ? handle?.ref?.() : handle?.unref?.()
  }

  private call<T>(method: string, params: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const child = this.start()
      const id = this.nextId++
      this.pending.set(id, { child, resolve, reject })
      this.hold(child, true)
      child.stdin!.write(JSON.stringify({ id, method, params }) + '\n')
    })
  }
}
