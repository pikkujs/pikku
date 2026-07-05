import {
  V8CoverageService,
  IstanbulCoverageService,
  type CoverageService,
} from '@pikku/core/services'
import { registerBunCoverageLoader } from './bun-coverage-loader.js'

interface CoverageLogger {
  info(message: string): void
  warn(message: string): void
}

const isBunRuntime = (): boolean =>
  typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'

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
      'Istanbul coverage enabled (Bun) — snapshot via console:takeLiveCoverage, reset via console:resetLiveCoverage'
    )
    return new IstanbulCoverageService()
  }
  const coverageService = new V8CoverageService()
  try {
    await coverageService.start()
    logger.info(
      'V8 precise coverage enabled — snapshot via console:takeLiveCoverage, reset via console:resetLiveCoverage'
    )
    return coverageService
  } catch (e) {
    logger.warn(
      `V8 precise coverage is not supported on this runtime — continuing without coverage: ${e instanceof Error ? e.message : e}`
    )
    return undefined
  }
}
