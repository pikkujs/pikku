import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { addFunction } from '@pikku/core/ecosystem/function'
import { pikkuState } from '@pikku/core/ecosystem'
import {
  isTestRun,
  getStubTracker,
  type CoverageFunctionMeta,
} from '@pikku/core/ecosystem/services'
import {
  enableScoreSnapshots,
  getScoreSnapshot,
  gradeRun as coreGradeRun,
} from '@pikku/core/ecosystem/agent-scorer'
import type { FunctionsMeta } from '@pikku/core/ecosystem/services'

/**
 * The instrumentation `pikku scenario run` calls on the server under test:
 * snapshot/reset live coverage, and reset/read recorded stub calls.
 *
 * These are pikku's, not the application's. They were previously scaffolded into
 * the project as ordinary `pikkuFunc`s, which is why they ended up registered in
 * the app bootstrap and shipped — `expose: true` — inside every deployed bundle.
 * Registering them here instead means the only process that has them is the one
 * that should: a development server. Nothing is generated, nothing is written to
 * the user's source tree, and a bundle cannot carry what was never in its
 * bootstrap.
 *
 * The bodies are unchanged from the generated ones, minus their schemas: an
 * instrumentation endpoint with a single optional string argument has nothing to
 * validate, and dropping the schemas drops the `zod` dependency the scaffold
 * silently required of every project.
 */

const takeLiveCoverage = {
  func: async ({ coverageService, metaService }: any) => {
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
}

const resetLiveCoverage = {
  func: async ({ coverageService }: any) => {
    if (!coverageService) return { enabled: false }
    await coverageService.reset()
    return { enabled: true }
  },
}

const resetStubs = {
  func: async () => {
    getStubTracker().reset()
    return { enabled: isTestRun() }
  },
}

const getStubCalls = {
  func: async (_services: any, data: { service?: string } | undefined) =>
    getStubTracker().getCalls(data?.service ?? undefined),
}

/**
 * Grade a finished agent run on demand, from the snapshot the runtime kept.
 *
 * Deliberately not sampled and not persisted: a scenario asserting on a grade
 * needs that grade every time, and the assertion is the outcome — writing a
 * test's score alongside production's would make the live figures unreadable.
 */
const gradeRun = {
  func: async (
    services: any,
    data: { runId: string; scorer: string; reference?: string }
  ) => {
    const run = getScoreSnapshot(data.runId)
    if (!run) {
      throw new Error(
        `No finished run '${data.runId}' is available to grade. A run is gradeable only from the server that produced it, and only while it is among the most recent — check the scenario graded the run it just triggered.`
      )
    }
    return await coreGradeRun(
      {
        ...run,
        ...(data.reference !== undefined ? { reference: data.reference } : {}),
        scorerName: data.scorer,
      },
      services,
      { persist: false }
    )
  },
}

const instrumentation: Record<
  string,
  { func: (...args: any[]) => any; title: string; description: string }
> = {
  pikkuScenarioTakeLiveCoverage: {
    ...takeLiveCoverage,
    title: 'Take Live Coverage',
    description:
      'Snapshots the live coverage collected since the server started (or since the last reset) — V8 precise coverage on Node, istanbul instrumentation on Bun — and maps it onto function body spans. Returns null unless the server was started with coverage enabled (pikku dev --coverage).',
  },
  pikkuScenarioResetLiveCoverage: {
    ...resetLiveCoverage,
    title: 'Reset Live Coverage',
    description:
      'Clears coverage call counts so the next takeLiveCoverage snapshot is attributable to a single scenario run. Reports enabled: false when the server was not started with coverage enabled.',
  },
  pikkuScenarioResetStubs: {
    ...resetStubs,
    title: 'Reset Stubs',
    description:
      'Clears recorded stub calls so the next getStubCalls result is attributable to a single scenario run. Reports enabled: false when the server was not started in test mode.',
  },
  pikkuScenarioGetStubCalls: {
    ...getStubCalls,
    title: 'Get Stub Calls',
    description:
      'Returns calls recorded against stubbed/spied services (via the stub()/spy() core utils). Empty unless the server records service calls (pikku dev --test).',
  },
  pikkuScenarioGradeRun: {
    ...gradeRun,
    title: 'Grade Run',
    description:
      "Runs one declared scorer against a finished agent run and returns the grade, ignoring the scorer's live sample rate. Accepts a reference answer, which is the only way a reference-based judge is reachable. The grade is returned, never recorded.",
  },
}

/**
 * Register the instrumentation into the running dev server's state, so the
 * scenario runner can reach it over `/rpc/<name>` exactly as before.
 *
 * They are registered sessionless: `auth` decides whether a session is
 * *required*, and a sessioned function would demand one regardless of the flag.
 * `scaffold.scenarios: true` therefore requires a session; `{ auth: false }` is
 * what opens them.
 */
export const registerScenarioInstrumentation = (requireAuth: boolean) => {
  const meta = pikkuState(null, 'function', 'meta') as FunctionsMeta

  // Retaining finished runs is what makes them gradeable, and this is the only
  // place that can grade one — so the buffer is turned on here rather than by a
  // flag someone has to remember, and stays absent from every other process.
  enableScoreSnapshots()

  for (const [name, { func, title, description }] of Object.entries(
    instrumentation
  )) {
    addFunction(name, { func, auth: requireAuth } as any)
    meta[name] = {
      pikkuFuncId: name,
      inputSchemaName: null,
      outputSchemaName: null,
      expose: true,
      sessionless: true,
      tags: ['pikku'],
      title,
      description,
    }
  }

  pikkuState(null, 'function', 'meta', meta)
}
