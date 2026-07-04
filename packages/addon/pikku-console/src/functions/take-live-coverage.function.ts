import { pikkuFunc } from '#pikku'
import type { FunctionCoverageReport } from './get-function-coverage.function.js'
import {
  mapPreciseCoverage,
  type CoverageFunctionMeta,
} from '../lib/precise-coverage-map.js'

export const takeLiveCoverage = pikkuFunc<null, FunctionCoverageReport | null>({
  title: 'Take Live Coverage',
  description:
    'Snapshots the V8 precise coverage collected since the server started (or since the last resetLiveCoverage) and maps it onto function body spans. Returns null unless the server was started with coverage enabled (pikku dev --coverage).',
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
    const scripts = await coverageService.takeCoverage()
    return mapPreciseCoverage(
      scripts,
      (scriptId) => coverageService.getScriptSource(scriptId),
      functionsMeta
    )
  },
})
