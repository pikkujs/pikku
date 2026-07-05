// node:inspector is imported lazily inside start() so this module stays
// loadable on runtimes without it (e.g. Cloudflare Workers).

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

export type LineHits = Map<string, Map<number, number>>

export type CoverageSnapshot =
  | {
      kind: 'v8-scripts'
      scripts: ScriptCoverage[]
      getScriptSource: (scriptId: string) => Promise<string>
    }
  | { kind: 'line-hits'; lineHits: LineHits }

export interface CoverageService {
  start(): Promise<void>
  takeCoverage(): Promise<CoverageSnapshot>
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
  private startPromise: Promise<void> | null = null

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

  start(): Promise<void> {
    this.startPromise ??= this.doStart()
    return this.startPromise
  }

  private async doStart(): Promise<void> {
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

  async takeCoverage(): Promise<CoverageSnapshot> {
    const { result } = await this.post<{ result: ScriptCoverage[] }>(
      'Profiler.takePreciseCoverage'
    )
    return {
      kind: 'v8-scripts',
      scripts: result.filter((script) => script.url.startsWith('file://')),
      getScriptSource: (scriptId) => this.getScriptSource(scriptId),
    }
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
      this.startPromise = null
    }
  }
}
