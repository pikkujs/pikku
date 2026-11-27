import { isParkedOnChild } from './workflow-child-step.js'
import {
  CLAIMABLE_STEP_STATUSES,
  DEFAULT_STEP_RETRIES,
  STEP_SOURCES,
  isCompensationStepName,
  isRunClosedToSteps,
} from './workflow-constants.js'
import {
  WorkflowStepFunctionMismatchError,
  WorkflowStepLeaseExpiredError,
  WorkflowStepSupersededError,
} from './workflow-errors.js'
import { deriveInvocationId } from './workflow-invocation-id.js'
import type { StepState, StepStatus } from './workflow.types.js'
import type { Logger } from '../../services/logger.js'
import { parseTraceparent, tracedLogger } from '../../trace.js'

/** What claiming a step needs from the workflow service. */
export type StepClaimStore = {
  getStepState(runId: string, stepName: string): Promise<StepState>
  getRun(runId: string): Promise<{ status: string } | null>
  /** The atomic take of a step; see `WorkflowStepWrites.claimStepStatus`. */
  claimStepStatus(
    stepState: StepState,
    from: readonly StepStatus[],
    leaseMs: number
  ): Promise<boolean>
  setStepRunning(stepId: string, attempt?: number): Promise<void>
  setStepError(stepId: string, error: Error, attempt?: number): Promise<void>
  refreshStepLease(stepId: string, leaseMs: number | null): Promise<boolean>
  createRetryAttempt(
    failedStepId: string,
    status: 'pending' | 'running',
    attempt?: number
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
  const attempt = await store.createRetryAttempt(
    stepState.stepId,
    'pending',
    stepState.attemptCount
  )
  await store.logStepRerun?.(runId, stepName, attempt.attemptCount)
  return attempt
}

/**
 * The attempt an inline pass goes on from. A `failed` step reaches here only
 * with retries left: whatever recorded the failure ended before it created the
 * next attempt.
 */
export const resumeInlineStep = async (
  store: Parameters<typeof takeBackLostInlineStep>[0],
  runId: string,
  stepName: string,
  stepState: StepState
): Promise<StepState> =>
  stepState.status === 'failed'
    ? store.createRetryAttempt(
        stepState.stepId,
        'pending',
        stepState.attemptCount
      )
    : takeBackLostInlineStep(store, runId, stepName, stepState)

/**
 * The part of a claim every store shares: whether the step is one no dispatch
 * may run. Resolves `true` when there is nothing to claim.
 *
 * A lost step that must not run again, because its attempts are spent or its run
 * was stopped, is failed here. It is taken first, so a worker whose lease is
 * live at that moment keeps it. A compensation is run however its run stands.
 */
export const settleUnclaimableStep = async (
  store: StepClaimStore,
  runId: string,
  stepName: string,
  stepState: StepState,
  leaseMs: number
): Promise<boolean> => {
  if (
    !CLAIMABLE_STEP_STATUSES.has(stepState.status) ||
    isParkedOnChild(stepState)
  ) {
    return true
  }
  const exhausted = leaseAttemptsExhausted(stepState)
  // A failed step that has spent every attempt is settled, however it failed;
  // a redelivered message must not buy it another one.
  if (stepState.status === 'failed') return exhausted
  if (stepState.status !== 'running') return false

  const stopped =
    !isCompensationStepName(stepName) &&
    isRunClosedToSteps((await store.getRun(runId))?.status ?? '')
  if (!exhausted && !stopped) return false
  if (
    !(await store.claimStepStatus(stepState, STEP_SOURCES.inFlight, leaseMs))
  ) {
    return true
  }
  const { stepId, attemptCount } = stepState
  await store.setStepError(
    stepId,
    new WorkflowStepLeaseExpiredError(runId, stepName, attemptCount, exhausted),
    attemptCount
  )
  if (exhausted) {
    await store.logStepAttemptsExhausted?.(runId, stepName, attemptCount)
  }
  // A null claim reads as "another dispatch owns it", which resumes nothing.
  await store.resumeWorkflow?.(runId)
  return true
}

/**
 * Claim a step: read it, then take it with a write that applies only while it is
 * as it was read.
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
  // Read before any write, which may change `stepState` in place.
  const { status, attemptCount } = stepState
  if (await settleUnclaimableStep(store, runId, stepName, stepState, leaseMs)) {
    return null
  }
  if (status === 'pending' || status === 'scheduled') {
    if (
      !(await store.claimStepStatus(stepState, STEP_SOURCES.unclaimed, leaseMs))
    ) {
      return null
    }
    await store.setStepRunning(stepState.stepId, attemptCount)
    return { ...stepState, status: 'running' }
  }
  const lost = status === 'running'
  // Takes nothing unless the lease has lapsed.
  if (
    lost &&
    !(await store.claimStepStatus(stepState, STEP_SOURCES.lost, leaseMs))
  ) {
    return null
  }
  let attempt: StepState
  try {
    attempt = await store.createRetryAttempt(
      stepState.stepId,
      'running',
      attemptCount
    )
  } catch (error) {
    // Another dispatch retried this attempt first.
    if (error instanceof WorkflowStepSupersededError) return null
    throw error
  }
  await store.refreshStepLease(attempt.stepId, leaseMs)
  // A `failed` step threw, and this is its ordinary retry.
  if (!lost) return attempt
  await store.logStepRerun?.(runId, stepName, attempt.attemptCount)
  return { ...attempt, lapsedAttempt: attemptCount }
}
