import { pikkuFunc } from '#pikku'
import type { FunctionCoverageReport } from './get-function-coverage.function.js'
import {
  mapPreciseCoverage,
  mapLineHitsToReport,
  type CoverageFunctionMeta,
} from '../lib/precise-coverage-map.js'

export const takeLiveCoverage = pikkuFunc<null, FunctionCoverageReport | null>({
  title: 'Take Live Coverage',
  description:
    'Snapshots the live coverage collected since the server started (or since the last resetLiveCoverage) — V8 precise coverage on Node, istanbul instrumentation on Bun — and maps it onto function body spans. Returns null unless the server was started with coverage enabled (pikku dev --coverage).',
  expose: true,
  func: async ({ coverageService, metaService }) => {
    if (!coverageService || !metaService?.basePath) return null
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    let functionsMeta: Record<string, CoverageFunctionMeta>
    try {
      const content = await readFile(
        join(
          metaService.basePath,
          'function',
          'pikku-functions-meta-verbose.gen.json'
        ),
        'utf-8'
      )
      functionsMeta = JSON.parse(content)
    } catch {
      return null
    }
    const snapshot = await coverageService.takeCoverage()
    if (snapshot.kind === 'line-hits') {
      return mapLineHitsToReport(snapshot.lineHits, functionsMeta)
    }
    return mapPreciseCoverage(
      snapshot.scripts,
      snapshot.getScriptSource,
      functionsMeta
    )
  },
})
