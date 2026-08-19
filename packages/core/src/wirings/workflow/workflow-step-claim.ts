import { WorkflowStepFunctionMismatchError } from './workflow-errors.js'
import type { StepState } from './workflow.types.js'

/** What claiming a step needs from the workflow service. */
export type StepClaimStore = {
  getStepState(runId: string, stepName: string): Promise<StepState>
  setStepRunning(stepId: string): Promise<void>
  createRetryAttempt(
    failedStepId: string,
    status: 'pending' | 'running'
  ): Promise<StepState>
}

/**
 * Decide whether this dispatch owns the step, by reading its state and then
 * writing it — which only excludes a concurrent dispatch when the caller holds
 * a lock that genuinely excludes one.
 *
 * A store that can express the whole decision as a single conditional write
 * should do that instead of calling this.
 */
export const claimStepByReadThenWrite = async (
  store: StepClaimStore,
  runId: string,
  stepName: string,
  rpcName: string
): Promise<StepState | null> => {
  const stepState = await store.getStepState(runId, stepName)
  // knowledge: decisions/security/a-step-runs-the-function-the-workflow-dispatched-it-with.md
  if (
    stepState.rpcName !== undefined &&
    stepState.rpcName !== (rpcName ?? null)
  ) {
    throw new WorkflowStepFunctionMismatchError(runId, stepName)
  }
  if (stepState.status === 'succeeded' || stepState.status === 'running') {
    return null
  }
  if (stepState.status === 'failed') {
    return store.createRetryAttempt(stepState.stepId, 'running')
  }
  if (stepState.status === 'pending' || stepState.status === 'scheduled') {
    await store.setStepRunning(stepState.stepId)
  }
  return stepState
}
