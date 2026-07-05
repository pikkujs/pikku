/**
 * Generate the scenario instrumentation functions (`pikku scenario` coverage
 * snapshots and stub-call inspection) into the project scaffold, so scenario
 * runs work against any server without requiring the console addon.
 */
export const serializeScenarioFunctions = (
  pathToPikkuTypes: string,
  requireAuth: boolean = true
) => {
  const authFlag = requireAuth ? 'true' : 'false'
  return `/**
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
  type FunctionCoverageReport,
  type StubCall,
} from '@pikku/core/services'

export const pikkuScenarioTakeLiveCoverage = pikkuFunc<
  null,
  FunctionCoverageReport | null
>({
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

export const pikkuScenarioResetLiveCoverage = pikkuFunc<
  null,
  { enabled: boolean }
>({
  tags: ['pikku'],
  title: 'Reset Live Coverage',
  description:
    'Clears V8 precise-coverage call counts so the next takeLiveCoverage snapshot is attributable to a single scenario run. Reports enabled: false when the server was not started with coverage enabled.',
  expose: true,
  auth: ${authFlag},
  func: async ({ coverageService }) => {
    if (!coverageService) return { enabled: false }
    await coverageService.reset()
    return { enabled: true }
  },
})

export const pikkuScenarioResetStubs = pikkuFunc<null, { enabled: boolean }>({
  tags: ['pikku'],
  title: 'Reset Stubs',
  description:
    'Clears recorded stub calls so the next getStubCalls result is attributable to a single scenario run. Reports enabled: false when the server was not started in test mode.',
  expose: true,
  auth: ${authFlag},
  func: async () => {
    getStubTracker().reset()
    return { enabled: isTestRun() }
  },
})

export const pikkuScenarioGetStubCalls = pikkuFunc<
  { service?: string },
  StubCall[]
>({
  tags: ['pikku'],
  title: 'Get Stub Calls',
  description:
    'Returns calls recorded against stubbed/spied services (via the stub()/spy() core utils). Empty unless the server records service calls (pikku dev --test).',
  expose: true,
  auth: ${authFlag},
  func: async (_services, data) => {
    return getStubTracker().getCalls(data?.service ?? undefined)
  },
})
`
}
