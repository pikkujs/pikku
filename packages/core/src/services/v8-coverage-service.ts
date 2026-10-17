/** A V8 coverage range: byte offsets in the script and how often it ran. */
export interface CoverageRange {
  startOffset: number
  endOffset: number
  count: number
}

/** V8 coverage for one function in a script. */
export interface FunctionCoverage {
  functionName: string
  isBlockCoverage: boolean
  ranges: CoverageRange[]
}

/** V8 coverage for one loaded script. */
export interface ScriptCoverage {
  scriptId: string
  url: string
  functions: FunctionCoverage[]
}

/** Hit counts per line, keyed by file then line number. */
export type LineHits = Map<string, Map<number, number>>

/**
 * Coverage collected so far: raw V8 script coverage, or line hits from an
 * instrumented build.
 */
export type CoverageSnapshot =
  | {
      kind: 'v8-scripts'
      scripts: ScriptCoverage[]
      getScriptSource: (scriptId: string) => Promise<string>
    }
  | { kind: 'line-hits'; lineHits: LineHits }

/**
 * Whether a function's lines all ran, some ran, none ran, or its source could
 * not be mapped.
 */
export type CoverageStatus = 'covered' | 'partial' | 'uncovered' | 'unknown'

/** Line coverage for one pikku function. */
export interface FunctionCoverageEntry {
  name: string
  sourceFile: string
  exposed: boolean
  description: string | null
  coveredLines: number
  totalLines: number
  missedLines: number[]
  ratio: number
  status: CoverageStatus
}

/** Line coverage per pikku function, with totals. */
export interface FunctionCoverageReport {
  generatedAt: string
  summary: {
    total: number
    covered: number
    partial: number
    uncovered: number
    unknown: number
    overallRatio: number
  }
  functions: FunctionCoverageEntry[]
}

/**
 * Where a pikku function's body is in its source, for mapping coverage onto it.
 */
export interface CoverageFunctionMeta {
  name: string
  sourceFile: string
  bodySourceFile?: string
  exportedName?: string
  expose?: boolean
  description?: string | null
  bodyStart?: number
  bodyEnd?: number
  funcWrapper?: string
}

/**
 * Collects code coverage from a running app, so a scenario run can report which
 * functions it exercised. Provided as the `coverageService` singleton service
 * during development and test runs.
 */
export interface CoverageService {
  start(): Promise<void>
  takeCoverage(): Promise<CoverageSnapshot>
  /** Provided by the process that booted the backend (the pikku CLI); absent
   *  when the runtime only exposes raw snapshots. */
  takeReport?(
    functionsMeta: Record<string, CoverageFunctionMeta>
  ): Promise<FunctionCoverageReport>
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

/**
 * A {@link CoverageService} that collects precise coverage from the V8
 * inspector in the current Node process. Only `file://` scripts are reported.
 * Not for production: precise coverage slows execution.
 */
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
    // knowledge: decisions/internals/node-only-builtins-are-imported-dynamically.md
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
