import { WorkflowAsyncException } from './workflow-errors.js'
import { refuseStep } from './workflow-step-refusal.js'
import {
  resumeInlineStep,
  takeBackLostInlineStep,
} from './workflow-step-claim.js'
import { throwIfNotOwned } from './workflow-lost-lease.js'
import type { OpenSteps } from './workflow-open-steps.js'
import {
  runInlineRetryLoop,
  startStepAttempt,
  type StepRetryStore,
} from './workflow-step-retry.js'
import type { StepState, WorkflowStepOptions } from './workflow.types.js'

/** What running a closure step needs from the workflow service. */
export type ClosureStepHost = StepRetryStore & {
  openSteps: OpenSteps
  logStepRerun(runId: string, stepName: string, attempt: number): Promise<void>
  logStepAttemptsExhausted(
    runId: string,
    stepName: string,
    attempts: number
  ): Promise<void>
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

type ClosureOutcome = { retryScheduled: true } | { result: any }

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
  retryDelay: WorkflowStepOptions['retryDelay'],
  leaseLost?: AbortSignal
): Promise<any> => {
  if (stepState.status === 'succeeded') {
    return stepState.result
  }

  // Without a run lease, another pass may be working the step right now.
  if (!leaseLost && host.openSteps.has(runId, stepName)) {
    throw new WorkflowAsyncException(runId, stepName)
  }

  const outcome = await host.openSteps.hold(runId, stepName, () =>
    attemptClosureStep(
      host,
      runId,
      stepName,
      stepState,
      fn,
      retries,
      retryDelay,
      leaseLost
    )
  )
  if ('result' in outcome) return outcome.result
  // Sent once the step is closed, so the pass it wakes can work the step.
  await host.scheduleOrchestratorRetry(runId, retryDelay)
  throw new WorkflowAsyncException(runId, stepName)
}

const attemptClosureStep = async (
  host: ClosureStepHost,
  runId: string,
  stepName: string,
  stepState: StepState,
  fn: Function,
  retries: number,
  retryDelay: WorkflowStepOptions['retryDelay'],
  leaseLost: AbortSignal | undefined
): Promise<ClosureOutcome> => {
  // A replay of a failed step spends a retry, or throws what the step threw.
  let startFrom = stepState
  if (stepState.status === 'failed') {
    if (stepState.attemptCount > retries) {
      throw recordedStepError(stepName, stepState)
    }
    await host.throwIfRunStopped(runId)
    startFrom = await resumeInlineStep(host, runId, stepName, stepState)
  }

  // `running` here is a pass that was lost mid-step.
  if (startFrom.status === 'running') {
    startFrom = await takeBackLostInlineStep(host, runId, stepName, {
      ...startFrom,
      retries,
    })
  }

  const throwIfStopped = () => host.throwIfRunStopped(runId)
  const onRefused = (step: StepState) => refuseStep(host, runId, stepName, step)

  if (await host.isInline(runId)) {
    return {
      result: await runInlineRetryLoop(
        host,
        startFrom,
        retries,
        retryDelay,
        () => fn(),
        undefined,
        throwIfStopped,
        { onRefused, leaseLost }
      ),
    }
  }

  await startStepAttempt(host, startFrom, throwIfStopped, {
    onRefused,
    leaseLost,
  })
  const { stepId, attemptCount } = startFrom
  let result: any
  try {
    result = await fn()
  } catch (error: any) {
    throwIfNotOwned(error, leaseLost)
    await host.setStepError(stepId, error, attemptCount)

    if (attemptCount <= retries) {
      await host.createRetryAttempt(stepId, 'pending', attemptCount)
      return { retryScheduled: true }
    }

    throw error
  }
  // Outside the try, so failing to record it does not run the work again.
  await host.setStepResult(stepId, result, attemptCount)
  return { result }
}
