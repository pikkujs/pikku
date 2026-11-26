import { getDurationInMilliseconds } from '../../time-utils.js'
import { WorkflowCancelledException } from './workflow-errors.js'
import type { StepAttempt } from './workflow-step-signal.js'
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

/** What a step run in-process is given besides the loop itself. */
export type InlineStepHooks = {
  /** The signal of one attempt, opened before the run is checked for a stop. */
  openAttempt?: () => StepAttempt | undefined
  /** Gives a step that `beforeAttempt` refused to start its final outcome. */
  onRefused?: (stepState: StepState) => Promise<void>
}

/**
 * Spend a step's retry budget here and now, rather than by handing the run back
 * to the orchestrator between attempts. For an inline run there is nothing to
 * hand it back to. Nothing ends the run between attempts either, so a forward
 * step passes `beforeAttempt` to stop once the run has been cancelled.
 *
 * `retries` counts what follows the first attempt, as it does on the queue, so
 * a step gets `retries + 1` attempts.
 */
export const runInlineRetryLoop = async (
  store: StepRetryStore,
  stepState: StepState,
  retries: number,
  retryDelay: WorkflowStepOptions['retryDelay'],
  doWork: (currentStepState: StepState, attempt?: StepAttempt) => Promise<any>,
  onError?: (error: any) => Promise<void>,
  beforeAttempt?: () => Promise<void>,
  hooks?: InlineStepHooks
): Promise<any> => {
  let currentStepState = stepState
  while (true) {
    const attempt = hooks?.openAttempt?.()
    try {
      try {
        await beforeAttempt?.()
      } catch (error) {
        if (error instanceof WorkflowCancelledException) {
          await hooks?.onRefused?.(currentStepState)
        }
        throw error
      }
      let result: any
      try {
        await store.setStepRunning(currentStepState.stepId)
        result = await doWork(currentStepState, attempt)
      } catch (error: any) {
        if (onError) await onError(error)

        await store.setStepError(currentStepState.stepId, error)

        if (currentStepState.attemptCount > retries) {
          throw error
        }
        attempt?.close()
        // A stopped run gets no pending attempt, which nothing would finish.
        await beforeAttempt?.()
        currentStepState = await store.createRetryAttempt(
          currentStepState.stepId,
          'pending'
        )
        if (retryDelay) {
          await new Promise((resolve) =>
            setTimeout(resolve, getDurationInMilliseconds(retryDelay))
          )
        }
        continue
      }
      // Outside the try: the work is done, so failing to record it must not
      // count as a failed attempt and run the work again.
      await store.setStepResult(currentStepState.stepId, result)
      return result
    } finally {
      attempt?.close()
    }
  }
}
