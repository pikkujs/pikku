import { WorkflowAsyncException } from './workflow-errors.js'
import { refuseStep } from './workflow-step-refusal.js'
import {
  runInlineRetryLoop,
  startStepAttempt,
  type StepRetryStore,
} from './workflow-step-retry.js'
import type { StepState, WorkflowStepOptions } from './workflow.types.js'

/** What running a closure step needs from the workflow service. */
export type ClosureStepHost = StepRetryStore & {
  isInline(runId: string): Promise<boolean>
  throwIfRunStopped(runId: string): Promise<void>
  updateRunState(runId: string, name: string, value: unknown): Promise<void>
  scheduleOrchestratorRetry(
    runId: string,
    retryDelay?: number | string
  ): Promise<void>
}

/** The error a replay throws for a step already recorded as failed. */
export const recordedStepError = (stepName: string, step: StepState): Error => {
  const error = new Error(
    step.error?.message ||
      `Step '${stepName}' failed after exhausting all retries`
  )
  if (step.error) {
    Object.assign(error, step.error)
  }
  return error
}

/**
 * Run a step whose work is a closure from the workflow body: in-process for an
 * inline run, or else one attempt in this pass.
 */
export const runClosureStep = async (
  host: ClosureStepHost,
  runId: string,
  stepName: string,
  stepState: StepState,
  fn: Function,
  retries: number,
  retryDelay: WorkflowStepOptions['retryDelay']
): Promise<any> => {
  if (stepState.status === 'succeeded') {
    return stepState.result
  }

  // A replay of a failed step spends a retry, or throws what the step threw.
  let startFrom = stepState
  if (stepState.status === 'failed') {
    if (stepState.attemptCount > retries) {
      throw recordedStepError(stepName, stepState)
    }
    await host.throwIfRunStopped(runId)
    startFrom = await host.createRetryAttempt(
      stepState.stepId,
      'pending',
      stepState.attemptCount
    )
  }

  const throwIfStopped = () => host.throwIfRunStopped(runId)
  const onRefused = (step: StepState) => refuseStep(host, runId, stepName, step)

  if (await host.isInline(runId)) {
    return runInlineRetryLoop(
      host,
      startFrom,
      retries,
      retryDelay,
      () => fn(),
      undefined,
      throwIfStopped,
      { onRefused }
    )
  }

  await startStepAttempt(host, startFrom, throwIfStopped, onRefused)
  const { stepId, attemptCount } = startFrom
  let result: any
  try {
    result = await fn()
  } catch (error: any) {
    await host.setStepError(stepId, error, attemptCount)

    if (attemptCount <= retries) {
      await host.createRetryAttempt(stepId, 'pending', attemptCount)
      await host.scheduleOrchestratorRetry(runId, retryDelay)
      throw new WorkflowAsyncException(runId, stepName)
    }

    throw error
  }
  // Outside the try, so failing to record it does not run the work again.
  await host.setStepResult(stepId, result, attemptCount)
  return result
}
