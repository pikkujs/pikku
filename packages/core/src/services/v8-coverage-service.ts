/**
 * In-process V8 precise-coverage collector for `pikku dev --coverage`.
 *
 * Wraps a `node:inspector` session: `start()` begins precise coverage with
 * call counts, `takeCoverage()` snapshots per-script coverage, `reset()`
 * clears counts so callers can attribute coverage to a single scenario run,
 * and `getScriptSource()` fetches the executed (transpiled) source whose
 * inline source map lets consumers translate offsets back to TypeScript.
 *
 * `node:inspector` is imported lazily inside `start()` so this module stays
 * loadable on runtimes without it (e.g. Cloudflare Workers) as long as
 * coverage is never started there.
 */

export interface CoverageRange {
  startOffset: number
  endOffset: number
  count: number
}

export interface FunctionCoverage {
  functionName: string
  isBlockCoverage: boolean
  ranges: CoverageRange[]
}

export interface ScriptCoverage {
  scriptId: string
  url: string
  functions: FunctionCoverage[]
}

export interface CoverageService {
  start(): Promise<void>
  takeCoverage(): Promise<ScriptCoverage[]>
  getScriptSource(scriptId: string): Promise<string>
  reset(): Promise<void>
  stop(): Promise<void>
}

type InspectorSession = {
  connect(): void
  disconnect(): void
  post(
    method: string,
    params?: unknown,
    callback?: (err: Error | null, result?: any) => void
  ): void
}

export class V8CoverageService implements CoverageService {
  private session: InspectorSession | null = null

  private post<T>(method: string, params?: unknown): Promise<T> {
    const session = this.session
    if (!session) {
      throw new Error('V8CoverageService not started — call start() first')
    }
    return new Promise<T>((resolve, reject) => {
      session.post(method, params, (err, result) =>
        err ? reject(err) : resolve(result as T)
      )
    })
  }

  async start(): Promise<void> {
    if (this.session) return
    const inspector = await import('node:inspector')
    this.session = new inspector.Session() as unknown as InspectorSession
    this.session.connect()
    await this.post('Profiler.enable')
    await this.post('Debugger.enable')
    await this.post('Profiler.startPreciseCoverage', {
      callCount: true,
      detailed: true,
    })
  }

  async takeCoverage(): Promise<ScriptCoverage[]> {
    const { result } = await this.post<{ result: ScriptCoverage[] }>(
      'Profiler.takePreciseCoverage'
    )
    return result.filter((script) => script.url.startsWith('file://'))
  }

  async getScriptSource(scriptId: string): Promise<string> {
    const { scriptSource } = await this.post<{ scriptSource: string }>(
      'Debugger.getScriptSource',
      { scriptId }
    )
    return scriptSource
  }

  async reset(): Promise<void> {
    await this.post('Profiler.stopPreciseCoverage')
    await this.post('Profiler.startPreciseCoverage', {
      callCount: true,
      detailed: true,
    })
  }

  async stop(): Promise<void> {
    if (!this.session) return
    try {
      await this.post('Profiler.stopPreciseCoverage')
      await this.post('Profiler.disable')
      await this.post('Debugger.disable')
    } finally {
      this.session.disconnect()
      this.session = null
    }
  }
}
