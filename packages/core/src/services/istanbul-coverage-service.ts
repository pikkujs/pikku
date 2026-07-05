import type {
  CoverageService,
  CoverageSnapshot,
  LineHits,
} from './v8-coverage-service.js'

interface IstanbulStatementLocation {
  start: { line: number }
  end: { line: number }
}

interface IstanbulFileCoverage {
  path: string
  statementMap: Record<string, IstanbulStatementLocation>
  s: Record<string, number>
  b: Record<string, number[]>
  f: Record<string, number>
}

type IstanbulCoverageGlobal = Record<string, IstanbulFileCoverage>

const getCoverageGlobal = (): IstanbulCoverageGlobal | undefined =>
  (globalThis as { __coverage__?: IstanbulCoverageGlobal }).__coverage__

/**
 * Reads istanbul-instrumented counters from the `__coverage__` global —
 * the coverage backend for runtimes without V8 precise coverage (e.g. Bun,
 * where source files are instrumented at load time by a Bun loader plugin).
 */
export class IstanbulCoverageService implements CoverageService {
  async start(): Promise<void> {}

  async takeCoverage(): Promise<CoverageSnapshot> {
    const coverage = getCoverageGlobal()
    const lineHits: LineHits = new Map()
    for (const file of Object.values(coverage ?? {})) {
      let hits = lineHits.get(file.path)
      if (!hits) {
        hits = new Map()
        lineHits.set(file.path, hits)
      }
      // istanbul line semantics: a statement's count belongs to its start
      // line only, so an enclosing multi-line statement never masks an
      // unexecuted inner statement (e.g. a throw inside a taken if).
      for (const [id, location] of Object.entries(file.statementMap)) {
        const count = file.s[id] ?? 0
        const line = location.start.line
        hits.set(line, Math.max(hits.get(line) ?? 0, count))
      }
    }
    return { kind: 'line-hits', lineHits }
  }

  async reset(): Promise<void> {
    for (const file of Object.values(getCoverageGlobal() ?? {})) {
      for (const id of Object.keys(file.s)) file.s[id] = 0
      for (const id of Object.keys(file.f)) file.f[id] = 0
      for (const id of Object.keys(file.b)) {
        file.b[id] = file.b[id]!.map(() => 0)
      }
    }
  }

  async stop(): Promise<void> {}
}
