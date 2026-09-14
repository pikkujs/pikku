import { DEFAULT_STEP_RETRIES, isStepLeaseLive } from './workflow-constants.js'
import {
  WorkflowStepFunctionMismatchError,
  WorkflowStepLeaseExpiredError,
} from './workflow-errors.js'
import type { StepState } from './workflow.types.js'

/** What claiming a step needs from the workflow service. */
export type StepClaimStore = {
  getStepState(runId: string, stepName: string): Promise<StepState>
  setStepRunning(stepId: string): Promise<void>
  setStepError(stepId: string, error: Error): Promise<void>
  refreshStepLease(stepId: string, expiresAt: Date | null): Promise<void>
  createRetryAttempt(
    failedStepId: string,
    status: 'pending' | 'running'
  ): Promise<StepState>
}

/**
 * Whether a step whose worker vanished may be handed to another one, or has
 * run out of attempts to spend on that.
 */
export const leaseAttemptsExhausted = (stepState: StepState): boolean =>
  stepState.attemptCount >= (stepState.retries ?? DEFAULT_STEP_RETRIES) + 1

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
  rpcName: string,
  leaseExpiresAt: Date
): Promise<StepState | null> => {
  const stepState = await store.getStepState(runId, stepName)
  // knowledge: decisions/security/a-step-runs-the-function-the-workflow-dispatched-it-with.md
  if (
    stepState.rpcName !== undefined &&
    stepState.rpcName !== (rpcName ?? null)
  ) {
    throw new WorkflowStepFunctionMismatchError(runId, stepName)
  }
  if (stepState.status === 'succeeded') {
    return null
  }
  if (stepState.status === 'running') {
    if (isStepLeaseLive(stepState.leaseExpiresAt)) {
      return null
    }
    if (leaseAttemptsExhausted(stepState)) {
      await store.setStepError(
        stepState.stepId,
        new WorkflowStepLeaseExpiredError(
          runId,
          stepName,
          stepState.attemptCount
        )
      )
      return null
    }
  }
  if (stepState.status === 'failed' || stepState.status === 'running') {
    const attempt = await store.createRetryAttempt(stepState.stepId, 'running')
    await store.refreshStepLease(attempt.stepId, leaseExpiresAt)
    return attempt
  }
  if (stepState.status === 'pending' || stepState.status === 'scheduled') {
    await store.setStepRunning(stepState.stepId)
    await store.refreshStepLease(stepState.stepId, leaseExpiresAt)
  }
  return stepState
}
