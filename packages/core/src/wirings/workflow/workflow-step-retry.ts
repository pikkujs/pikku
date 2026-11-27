import { getDurationInMilliseconds } from '../../time-utils.js'
import {
  WorkflowCancelledException,
  WorkflowStepSupersededError,
} from './workflow-errors.js'
import type { StepAttempt } from './workflow-step-signal.js'
import { throwIfLeaseLost, throwIfNotOwned } from './workflow-lost-lease.js'
import type {
  StepState,
  StepStatus,
  WorkflowStepOptions,
} from './workflow.types.js'

/** What running a step's retries in-process needs from the workflow service. */
export type StepRetryStore = {
  setStepRunning(stepId: string, attempt?: number): Promise<void>
  setStepResult(stepId: string, result: any, attempt?: number): Promise<void>
  setStepError(
    stepId: string,
    error: Error,
    attempt?: number,
    from?: readonly StepStatus[]
  ): Promise<void>
  createRetryAttempt(
    failedStepId: string,
    status: 'pending' | 'running',
    attempt?: number
  ): Promise<StepState>
}

/** For a write whose refusal means someone else already settled the step. */
export const unlessSuperseded = async (
  write: () => Promise<unknown>
): Promise<void> => {
  try {
    await write()
  } catch (error) {
    if (!(error instanceof WorkflowStepSupersededError)) throw error
  }
}

/**
 * The store for a step that runs a child workflow in-process. The child, or a
 * sweep that finds it ended, may record the outcome on the step before the loop
 * does, so the loop's own record of the same outcome finds the step settled.
 */
export const childStepRetryStore = (store: StepRetryStore): StepRetryStore => ({
  setStepRunning: (...args) => store.setStepRunning(...args),
  setStepResult: (...args) =>
    unlessSuperseded(() => store.setStepResult(...args)),
  setStepError: (...args) =>
    unlessSuperseded(() => store.setStepError(...args)),
  createRetryAttempt: (...args) => store.createRetryAttempt(...args),
})

/** What a step run in-process is given besides the loop itself. */
export type InlineStepHooks = {
  /** The signal of one attempt, opened before the run is checked for a stop. */
  openAttempt?: () => StepAttempt | undefined
  /** Gives a step that `beforeAttempt` refused to start its final outcome. */
  onRefused?: (stepState: StepState) => Promise<void>
  /** Aborts if the run lease the calling pass holds is lost. */
  leaseLost?: AbortSignal
}

/**
 * Set a step running, and only then read whether its run is still open. A cancel
 * commits the run before it reads the steps, so whichever of the two writes
 * first, one side sees the other.
 *
 * knowledge: decisions/internals/each-workflow-store-reads-the-latest-write.md
 */
export const startStepAttempt = async (
  store: Pick<StepRetryStore, 'setStepRunning'>,
  stepState: StepState,
  beforeAttempt?: () => Promise<void>,
  { onRefused, leaseLost }: InlineStepHooks = {}
): Promise<void> => {
  await store.setStepRunning(stepState.stepId, stepState.attemptCount)
  throwIfLeaseLost(leaseLost)
  try {
    await beforeAttempt?.()
    throwIfLeaseLost(leaseLost)
  } catch (error) {
    throwIfLeaseLost(leaseLost)
    if (error instanceof WorkflowCancelledException) {
      await onRefused?.(stepState)
    }
    throw error
  }
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
    throwIfLeaseLost(hooks?.leaseLost)
    const attempt = hooks?.openAttempt?.()
    try {
      // Outside the try: a refused start is not a failed attempt.
      await startStepAttempt(store, currentStepState, beforeAttempt, hooks)
      const { stepId, attemptCount } = currentStepState
      let result: any
      try {
        result = await doWork(currentStepState, attempt)
      } catch (error: any) {
        throwIfNotOwned(error, hooks?.leaseLost)
        if (onError) await onError(error)

        await store.setStepError(stepId, error, attemptCount)

        if (currentStepState.attemptCount > retries) {
          throw error
        }
        attempt?.close()
        throwIfLeaseLost(hooks?.leaseLost)
        // A stopped run gets no pending attempt, which nothing would finish.
        await beforeAttempt?.()
        currentStepState = await store.createRetryAttempt(
          stepId,
          'pending',
          attemptCount
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
      await store.setStepResult(stepId, result, attemptCount)
      return result
    } finally {
      attempt?.close()
    }
  }
}
