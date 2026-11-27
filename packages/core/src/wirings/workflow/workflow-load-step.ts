import type { StepState } from './workflow.types.js'

/**
 * The step a replay is at, created where the run has none. `snapshot` is what
 * the replay read when it began.
 */
export const loadOrCreateStep = async (
  store: {
    getStepState(runId: string, stepName: string): Promise<StepState>
  },
  runId: string,
  stepName: string,
  create: () => Promise<StepState>,
  snapshot?: Map<string, StepState>
): Promise<StepState> => {
  if (snapshot) {
    const cached = snapshot.get(stepName)
    if (cached) {
      return cached
    }
  } else {
    try {
      return await store.getStepState(runId, stepName)
    } catch {
      // knowledge: decisions/internals/workflow-replay-reads-its-steps-once-and-caches-only-the-immutable-half.md
    }
  }

  let step: StepState
  try {
    step = await create()
  } catch (error) {
    try {
      step = await store.getStepState(runId, stepName)
    } catch {
      throw error
    }
  }
  snapshot?.set(stepName, step)
  return step
}
