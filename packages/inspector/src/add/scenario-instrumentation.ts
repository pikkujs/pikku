/**
 * The instrumentation RPCs `pikku scenario run` calls on the server it is
 * testing: snapshot/reset live coverage, and reset/read recorded stub calls.
 *
 * They are pikku's own, not the application's. They used to be scaffolded into
 * the project as ordinary `pikkuFunc`s, which made them indistinguishable from
 * application code — so they were registered in the app bootstrap, listed in the
 * app's function and RPC meta, and shipped, `expose: true`, in every deployed
 * bundle. A deployment has no use for them: coverage and stub inspection are
 * things you do to a development server.
 *
 * The inspector therefore ignores these names wherever it finds them, and
 * `pikku dev` registers the implementations itself. Ignoring by name (rather
 * than deleting the scaffold and requiring every project to regenerate) is what
 * keeps an existing project's checked-in `scenarios.gen.ts` from deploying.
 */
export const SCENARIO_INSTRUMENTATION_FUNCTIONS = [
  'pikkuScenarioTakeLiveCoverage',
  'pikkuScenarioResetLiveCoverage',
  'pikkuScenarioResetStubs',
  'pikkuScenarioGetStubCalls',
] as const

export type ScenarioInstrumentationFunction =
  (typeof SCENARIO_INSTRUMENTATION_FUNCTIONS)[number]

const names = new Set<string>(SCENARIO_INSTRUMENTATION_FUNCTIONS)

/**
 * True for a scenario instrumentation function, by name. Versioned ids
 * (`name@v2`) are matched on their base so a project that bumps one is still
 * covered.
 */
export const isScenarioInstrumentationFunction = (
  name: string | undefined
): boolean => (name ? names.has(name.split('@')[0]!) : false)
