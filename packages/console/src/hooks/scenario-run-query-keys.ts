/**
 * The react-query keys for the scenario-run domain.
 *
 * Separate from `workflowQueryKeys` because a scenario run is not a workflow
 * run: it is a whole invocation of the suite, kept in its own store with its
 * own lifetime, and invalidating one has nothing to do with the other.
 */
export const scenarioRunQueryKeys = {
  /** The run list, optionally capped — invalidation only when called bare. */
  runs: (limit?: number) => ['scenario-runs', limit] as const,
  allRuns: () => ['scenario-runs'] as const,
  run: (runId: string | null) => ['scenario-run', runId] as const,
}

/**
 * How often a run still in flight is re-read. The console has no push channel
 * for scenario runs, so the list polls; a suite takes minutes, and a scenario
 * lands every few seconds.
 */
export const SCENARIO_RUN_POLL_MS = 3000

export const isScenarioRunActive = (status?: string): boolean =>
  status === 'running'

export const hasActiveScenarioRun = (runs?: { status?: string }[]): boolean =>
  !!runs?.some((run) => isScenarioRunActive(run.status))
