import { DEFAULT_STEP_RETRIES, isStepLeaseLive } from './workflow-constants.js'
import {
  WorkflowStepFunctionMismatchError,
  WorkflowStepLeaseExpiredError,
} from './workflow-errors.js'
import { deriveInvocationId } from './workflow-invocation-id.js'
import type { StepState } from './workflow.types.js'
import type { Logger } from '../../services/logger.js'
import { parseTraceparent, tracedLogger } from '../../trace.js'

/** What claiming a step needs from the workflow service. */
export type StepClaimStore = {
  getStepState(runId: string, stepName: string): Promise<StepState>
  setStepRunning(stepId: string): Promise<void>
  setStepError(stepId: string, error: Error, attempt?: number): Promise<void>
  refreshStepLease(stepId: string, leaseMs: number | null): Promise<boolean>
  createRetryAttempt(
    failedStepId: string,
    status: 'pending' | 'running'
  ): Promise<StepState>
  /**
   * Requeue the orchestrator so it sees the failure. Without it a step failed
   * for lease exhaustion leaves the run `running` until a sweep notices.
   */
  resumeWorkflow?(runId: string): Promise<void>
  logStepRerun?(runId: string, stepName: string, attempt: number): Promise<void>
  logStepAttemptsExhausted?(
    runId: string,
    stepName: string,
    attempts: number
  ): Promise<void>
}

/** Where the warnings about a lost step go, and the trace of its run. */
export type LostStepLog = {
  logger(): Logger | undefined
  traceparent(runId: string): Promise<string | undefined>
}

const warnLostStep = async (
  log: LostStepLog,
  runId: string,
  stepName: string,
  attempt: number,
  message: string
): Promise<void> => {
  // The step has already moved on, so no failure here may reach the claim.
  try {
    const logger = log.logger()
    if (!logger) return
    const traceparent = await log.traceparent(runId).catch(() => undefined)
    tracedLogger(logger, parseTraceparent(traceparent)?.traceId).warn({
      message,
      runId,
      stepName,
      attempt,
      invocationId: deriveInvocationId(runId, stepName),
    })
  } catch {}
}

export const warnStepRerun = (
  log: LostStepLog,
  runId: string,
  stepName: string,
  attempt: number
): Promise<void> =>
  warnLostStep(
    log,
    runId,
    stepName,
    attempt,
    `Workflow step '${stepName}' (run ${runId}) lost its worker and is running again as attempt ${attempt}`
  )

export const warnStepAttemptsExhausted = (
  log: LostStepLog,
  runId: string,
  stepName: string,
  attempts: number
): Promise<void> =>
  warnLostStep(
    log,
    runId,
    stepName,
    attempts,
    `Workflow step '${stepName}' (run ${runId}) lost its worker on attempt ${attempts} with no attempts left, so it failed`
  )

/**
 * Whether a step whose worker vanished may be handed to another one, or has
 * run out of attempts to spend on that.
 */
export const leaseAttemptsExhausted = (stepState: StepState): boolean =>
  stepState.attemptCount >= (stepState.retries ?? DEFAULT_STEP_RETRIES) + 1

/**
 * A pass holds its run's lease for as long as it works a step inline, so one
 * that meets its own step already `running` is looking at a pass that died
 * mid-step. Running it again is a new attempt, counted as one so a step that
 * takes its process down every time runs out instead of looping forever. The
 * invocation id comes from the step's name, so the attempt keeps it.
 */
export const takeBackLostInlineStep = async (
  store: Pick<
    StepClaimStore,
    | 'setStepError'
    | 'createRetryAttempt'
    | 'logStepRerun'
    | 'logStepAttemptsExhausted'
  >,
  runId: string,
  stepName: string,
  stepState: StepState
): Promise<StepState> => {
  if (stepState.status !== 'running') {
    return stepState
  }
  if (leaseAttemptsExhausted(stepState)) {
    const error = new WorkflowStepLeaseExpiredError(
      runId,
      stepName,
      stepState.attemptCount
    )
    await store.setStepError(stepState.stepId, error, stepState.attemptCount)
    await store.logStepAttemptsExhausted?.(
      runId,
      stepName,
      stepState.attemptCount
    )
    throw error
  }
  const attempt = await store.createRetryAttempt(stepState.stepId, 'pending')
  await store.logStepRerun?.(runId, stepName, attempt.attemptCount)
  return attempt
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
  rpcName: string,
  leaseMs: number
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
        ),
        stepState.attemptCount
      )
      await store.logStepAttemptsExhausted?.(
        runId,
        stepName,
        stepState.attemptCount
      )
      await store.resumeWorkflow?.(runId)
      return null
    }
  }
  // A failed step that has spent every attempt is settled, however it failed;
  // a redelivered message must not buy it another one.
  if (stepState.status === 'failed' && leaseAttemptsExhausted(stepState)) {
    return null
  }
  if (stepState.status === 'failed' || stepState.status === 'running') {
    const attempt = await store.createRetryAttempt(stepState.stepId, 'running')
    await store.refreshStepLease(attempt.stepId, leaseMs)
    // A `failed` step threw, and this is its ordinary retry.
    if (stepState.status === 'running') {
      await store.logStepRerun?.(runId, stepName, attempt.attemptCount)
    }
    return attempt
  }
  if (stepState.status === 'pending' || stepState.status === 'scheduled') {
    await store.setStepRunning(stepState.stepId)
    await store.refreshStepLease(stepState.stepId, leaseMs)
  }
  return stepState
}
