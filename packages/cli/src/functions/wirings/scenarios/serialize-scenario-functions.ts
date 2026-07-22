export interface ScenarioGenOutput {
  schemas: string
  functions: string
}

/**
 * Generate the scenario instrumentation functions (`pikku scenario` coverage
 * snapshots and stub-call inspection) into the project scaffold, so scenario
 * runs work against any server without requiring the console addon.
 */
export const serializeScenarioFunctions = (
  pathToPikkuTypes: string,
  requireAuth: boolean = true
): ScenarioGenOutput => {
  const authFlag = requireAuth ? 'true' : 'false'

  const schemas = `/**
 * Auto-generated scenario instrumentation schemas
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { z } from 'zod'

export const StubCallsQuery = z.object({
  service: z.string().optional(),
})

export const Enabled = z.object({ enabled: z.boolean() })
`

  const functions = `/**
 * Auto-generated scenario instrumentation functions
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pikkuFunc } from '${pathToPikkuTypes}'
import {
  getStubTracker,
  isTestRun,
  type CoverageFunctionMeta,
} from '@pikku/core/services'
import { StubCallsQuery, Enabled } from './scenarios.schemas.gen.js'

export const pikkuScenarioTakeLiveCoverage = pikkuFunc({
  tags: ['pikku'],
  title: 'Take Live Coverage',
  description:
    'Snapshots the live coverage collected since the server started (or since the last reset) — V8 precise coverage on Node, istanbul instrumentation on Bun — and maps it onto function body spans. Returns null unless the server was started with coverage enabled (pikku dev --coverage).',
  expose: true,
  auth: ${authFlag},
  func: async ({ coverageService, metaService }) => {
    if (!coverageService?.takeReport || !metaService?.basePath) return null
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
    return await coverageService.takeReport(functionsMeta)
  },
})

export const pikkuScenarioResetLiveCoverage = pikkuFunc({
  tags: ['pikku'],
  title: 'Reset Live Coverage',
  description:
    'Clears V8 precise-coverage call counts so the next takeLiveCoverage snapshot is attributable to a single scenario run. Reports enabled: false when the server was not started with coverage enabled.',
  expose: true,
  auth: ${authFlag},
  output: Enabled,
  func: async ({ coverageService }) => {
    if (!coverageService) return { enabled: false }
    await coverageService.reset()
    return { enabled: true }
  },
})

export const pikkuScenarioResetStubs = pikkuFunc({
  tags: ['pikku'],
  title: 'Reset Stubs',
  description:
    'Clears recorded stub calls so the next getStubCalls result is attributable to a single scenario run. Reports enabled: false when the server was not started in test mode.',
  expose: true,
  auth: ${authFlag},
  output: Enabled,
  func: async () => {
    getStubTracker().reset()
    return { enabled: isTestRun() }
  },
})

export const pikkuScenarioGetStubCalls = pikkuFunc({
  tags: ['pikku'],
  title: 'Get Stub Calls',
  description:
    'Returns calls recorded against stubbed/spied services (via the stub()/spy() core utils). Empty unless the server records service calls (pikku dev --test).',
  expose: true,
  auth: ${authFlag},
  input: StubCallsQuery,
  func: async (_services, data) => {
    return getStubTracker().getCalls(data?.service ?? undefined)
  },
})
`

  return { schemas, functions }
}
