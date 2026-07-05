import {
  V8CoverageService,
  IstanbulCoverageService,
  type CoverageService,
  type CoverageFunctionMeta,
  type FunctionCoverageReport,
} from '@pikku/core/services'
import { registerBunCoverageLoader } from './bun-coverage-loader.js'
import {
  mapPreciseCoverage,
  mapLineHitsToReport,
} from '../../utils/precise-coverage-map.js'

interface CoverageLogger {
  info(message: string): void
  warn(message: string): void
}

const isBunRuntime = (): boolean =>
  typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'

// The source-map-aware span mapping (and its @jridgewell/trace-mapping
// dependency) lives in the CLI, not @pikku/core — the scaffolded
// pikkuScenarioTakeLiveCoverage function reaches it through the optional
// CoverageService.takeReport, which only the CLI-booted service provides.
const withTakeReport = (service: CoverageService): CoverageService => {
  service.takeReport = async (
    functionsMeta: Record<string, CoverageFunctionMeta>
  ): Promise<FunctionCoverageReport> => {
    const snapshot = await service.takeCoverage()
    if (snapshot.kind === 'line-hits') {
      return mapLineHitsToReport(snapshot.lineHits, functionsMeta)
    }
    return mapPreciseCoverage(
      snapshot.scripts,
      snapshot.getScriptSource,
      functionsMeta
    )
  }
  return service
}

/**
 * Starts the coverage backend for `pikku dev --coverage`: V8 precise coverage
 * on Node, istanbul load-time instrumentation on Bun. Must run before the
 * user bootstrap is imported so the Bun loader plugin sees every module.
 * Returns undefined (with a warning) when no backend is available.
 */
export async function startCoverageService(
  logger: CoverageLogger,
  rootDir: string
): Promise<CoverageService | undefined> {
  if (isBunRuntime()) {
    await registerBunCoverageLoader({ rootDir })
    logger.info(
      'Istanbul coverage enabled (Bun) — snapshot via pikkuScenarioTakeLiveCoverage, reset via pikkuScenarioResetLiveCoverage'
    )
    return withTakeReport(new IstanbulCoverageService())
  }
  const coverageService = new V8CoverageService()
  try {
    await coverageService.start()
    logger.info(
      'V8 precise coverage enabled — snapshot via pikkuScenarioTakeLiveCoverage, reset via pikkuScenarioResetLiveCoverage'
    )
    return withTakeReport(coverageService)
  } catch (e) {
    logger.warn(
      `V8 precise coverage is not supported on this runtime — continuing without coverage: ${e instanceof Error ? e.message : e}`
    )
    return undefined
  }
}
