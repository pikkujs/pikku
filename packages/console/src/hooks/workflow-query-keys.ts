/**
 * The single source of truth for every react-query key in the workflow-run
 * domain.
 *
 * These keys are part of the package's public surface: an embedder that hosts
 * the workflow panels inside its own app shares this package's QueryClient, and
 * needs to invalidate the same entries when it learns a run has advanced
 * out-of-band (a deploy webhook, a stage poll, its own SSE feed). Before this
 * module existed the only way to do that was to hardcode the key tuples, which
 * silently broke on any rename here.
 *
 * Prefer {@link useWorkflowRunRefresh} over reaching for these directly.
 */
export const workflowQueryKeys = {
  /** The workflow graph/meta behind a single workflow or scenario id. */
  meta: (workflowId: string | null) =>
    ['workflow-meta-by-id', workflowId] as const,
  /** The run list for one workflow, optionally narrowed to a status. */
  runs: (workflowName?: string, status?: string) =>
    ['workflow-runs', workflowName, status] as const,
  /** Every run list, regardless of workflow or status — invalidation only. */
  allRuns: () => ['workflow-runs'] as const,
  run: (runId: string | null) => ['workflow-run', runId] as const,
  runSteps: (runId: string | null) => ['workflow-run-steps', runId] as const,
  runHistory: (runId: string | null) =>
    ['workflow-run-history', runId] as const,
  /** A historical graph, pinned by the hash the run was started against. */
  version: (name: string | null, graphHash: string | null) =>
    ['workflow-version', name, graphHash] as const,
  runNames: () => ['workflow-run-names'] as const,
  aiWorkflows: () => ['ai-workflows'] as const,
}

/**
 * Run statuses the console treats as still in flight. Exported so an embedder
 * driving its own refresh cadence classifies runs the same way the panels do,
 * rather than maintaining a parallel copy of the vocabulary.
 */
export const ACTIVE_RUN_STATUSES = new Set(['running'])

/** Step statuses the console treats as still in flight. See above. */
export const ACTIVE_STEP_STATUSES = new Set(['running', 'pending'])

export const isRunActive = (status?: string): boolean =>
  !!status && ACTIVE_RUN_STATUSES.has(status)

export const isStepActive = (status?: string): boolean =>
  !!status && ACTIVE_STEP_STATUSES.has(status)

export const hasActiveStep = (steps?: { status?: string }[]): boolean =>
  !!steps?.some((step) => isStepActive(step.status))
