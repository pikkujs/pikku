import { APPROVAL_STEP_RPC_NAME } from './workflow-approval.js'
import { handBackSettledChild } from './workflow-child-step.js'
import {
  DEFAULT_STEP_LEASE_MS,
  STEP_IN_FLIGHT_STATES,
  STEP_SOURCES,
} from './workflow-constants.js'
import {
  WorkflowRunStoppedError,
  WorkflowStepLeaseExpiredError,
} from './workflow-errors.js'
import { isWorkflowName } from './workflow-meta-resolver.js'
import { throwIfLeaseLost } from './workflow-lost-lease.js'
import { failLostStep, type StepClaimStore } from './workflow-step-claim.js'
import { refuseStep } from './workflow-step-refusal.js'
import { unlessSuperseded } from './workflow-step-retry.js'
import { SUSPEND_STEP_RPC_NAME } from './workflow-suspend.js'
import type { StepState, StepStatus, WorkflowRun } from './workflow.types.js'
import type { Logger } from '../../services/logger.js'

const WAIT_WARNING_INTERVAL_MS = 60_000
const MAX_REMEMBERED_WARNINGS = 1_000

/** Names each step an unwind waits on, at most once a minute. */
export class StepWaitWarnings {
  private readonly warnedAt = new Map<string, number>()

  warn(logger: Logger | undefined, runId: string, stepName: string): void {
    const key = `${runId}:${stepName}`
    const now = Date.now()
    const last = this.warnedAt.get(key)
    if (last !== undefined && now - last < WAIT_WARNING_INTERVAL_MS) return
    this.warnedAt.delete(key)
    this.warnedAt.set(key, now)
    if (this.warnedAt.size > MAX_REMEMBERED_WARNINGS) {
      this.warnedAt.delete(this.warnedAt.keys().next().value!)
    }
    logger?.warn(
      `Workflow run ${runId}: its unwind is waiting for step '${stepName}', which is still in flight`
    )
  }
}

/** What settling the steps an unwind waits for needs. */
export type AwaitedStepApi = {
  /** Aborts if the run lease the driver holds is lost. */
  leaseLost?: AbortSignal
  claimStore: StepClaimStore
  /**
   * Whether every attempt that can be working a step of this store is in this
   * process's open-step registry.
   */
  openStepsAreAllSteps: boolean
  isStepOpen(runId: string, stepName: string): boolean
  getRun(runId: string): Promise<WorkflowRun | null>
  setStepResult(
    stepId: string,
    result: unknown,
    attempt?: number
  ): Promise<void>
  setStepError(
    stepId: string,
    error: Error,
    attempt?: number,
    from?: readonly StepStatus[]
  ): Promise<void>
  updateRunState(runId: string, name: string, value: unknown): Promise<void>
}

const GATE_RPC_NAMES: ReadonlySet<string> = new Set([
  APPROVAL_STEP_RPC_NAME,
  SUSPEND_STEP_RPC_NAME,
])

/**
 * Settle one in-flight forward step if nothing will: refuse what never started,
 * and fail what was lost. Resolves `false` for a step still being worked.
 */
const settleAwaitedStep = async (
  api: AwaitedStepApi,
  runId: string,
  stepName: string
): Promise<boolean> => {
  const step = await api.claimStore.getStepState(runId, stepName)
  if (!STEP_IN_FLIGHT_STATES.has(step.status)) return true
  throwIfLeaseLost(api.leaseLost)

  // Whoever is working it here gives it its outcome, `pending` ones included:
  // a sleep, or a retry sitting out its delay.
  if (api.isStepOpen(runId, stepName)) return false
  if (step.status === 'pending' || step.status === 'scheduled') {
    return refuseUnstartedStep(api, runId, stepName, step)
  }

  const fail = async (error: Error) => {
    await unlessSuperseded(() =>
      api.setStepError(
        step.stepId,
        error,
        step.attemptCount,
        STEP_SOURCES.inFlight
      )
    )
    return true
  }
  if (step.rpcName && GATE_RPC_NAMES.has(step.rpcName)) {
    return fail(new WorkflowRunStoppedError(runId, stepName))
  }

  const isChild =
    step.childRunId != null || (!!step.rpcName && isWorkflowName(step.rpcName))
  if (step.childRunId != null) {
    return handBackSettledChild(
      {
        getRun: (id) => api.getRun(id),
        getStepState: (...args) => api.claimStore.getStepState(...args),
        setStepResult: (...args) => api.setStepResult(...args),
        setStepError: (...args) => api.setStepError(...args),
      },
      runId,
      stepName
    )
  }
  if (step.leaseExpiresAt != null) {
    return failLostStep(
      api.claimStore,
      runId,
      stepName,
      step,
      DEFAULT_STEP_LEASE_MS
    )
  }
  if (isChild) return false

  // A pass works the step under the run's lease. Holding a real one shows the
  // pass is gone.
  if (api.leaseLost === undefined && !api.openStepsAreAllSteps) return false
  return fail(
    new WorkflowStepLeaseExpiredError(runId, stepName, step.attemptCount, false)
  )
}

/**
 * Taken first, so a worker claiming it at the same moment either has it or
 * never gets it. The skip mark is only written once it can no longer run.
 */
const refuseUnstartedStep = async (
  api: AwaitedStepApi,
  runId: string,
  stepName: string,
  step: StepState
): Promise<boolean> => {
  const claimed = await api.claimStore.claimStepStatus(
    step,
    STEP_SOURCES.unclaimed,
    DEFAULT_STEP_LEASE_MS
  )
  if (claimed) {
    await unlessSuperseded(() =>
      refuseStep(
        api,
        runId,
        stepName,
        { ...step, status: 'running' },
        step.attemptCount
      )
    )
  }
  return true
}

/**
 * Settle whatever can be among the forward steps an unwind waits for, and name
 * the rest in the log. Resolves `true` if the unwind is to be planned again.
 */
export const settleAwaitedSteps = async (
  api: AwaitedStepApi,
  warnings: StepWaitWarnings,
  logger: Logger | undefined,
  runId: string,
  stepNames: string[]
): Promise<boolean> => {
  let changed = false
  const waiting: string[] = []
  for (const stepName of stepNames) {
    if (await settleAwaitedStep(api, runId, stepName)) changed = true
    else waiting.push(stepName)
  }
  if (!changed) {
    for (const stepName of waiting) warnings.warn(logger, runId, stepName)
  }
  return changed
}
