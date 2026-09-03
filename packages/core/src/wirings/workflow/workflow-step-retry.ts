import { getDurationInMilliseconds } from '../../time-utils.js'
import type { StepState, WorkflowStepOptions } from './workflow.types.js'

/** What running a step's retries in-process needs from the workflow service. */
export type StepRetryStore = {
  setStepRunning(stepId: string): Promise<void>
  setStepResult(stepId: string, result: any): Promise<void>
  setStepError(stepId: string, error: Error): Promise<void>
  createRetryAttempt(
    failedStepId: string,
    status: 'pending' | 'running'
  ): Promise<StepState>
}

/**
 * Spend a step's retry budget here and now, rather than by handing the run back
 * to the orchestrator between attempts. For an inline run there is nothing to
 * hand it back to.
 */
export const runInlineRetryLoop = async (
  store: StepRetryStore,
  stepState: StepState,
  retries: number,
  retryDelay: WorkflowStepOptions['retryDelay'],
  doWork: (currentStepState: StepState) => Promise<any>,
  onError?: (error: any) => Promise<void>
): Promise<any> => {
  let currentStepState = stepState
  while (true) {
    try {
      await store.setStepRunning(currentStepState.stepId)
      const result = await doWork(currentStepState)
      await store.setStepResult(currentStepState.stepId, result)
      return result
    } catch (error: any) {
      if (onError) await onError(error)

      await store.setStepError(currentStepState.stepId, error)

      if (currentStepState.attemptCount < retries) {
        currentStepState = await store.createRetryAttempt(
          currentStepState.stepId,
          'pending'
        )
        if (retryDelay) {
          await new Promise((resolve) =>
            setTimeout(resolve, getDurationInMilliseconds(retryDelay))
          )
        }
      } else {
        throw error
      }
    }
  }
}
