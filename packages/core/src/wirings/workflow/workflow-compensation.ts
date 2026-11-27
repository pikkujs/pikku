import type { SerializedError } from '../../errors/serialized-error.js'
import type { CompensatingFor } from './dsl/workflow-dsl.types.js'
import {
  DEFAULT_STEP_RETRIES,
  NO_COMPENSATE_STATE_PREFIX,
  RUN_STATUS_SOURCES,
  STEP_SOURCES,
  unwindEntryStatuses,
  WORKFLOW_CANCELLED_CODE,
  WORKFLOW_TERMINAL_STATES,
  isRunStopped,
  compensationStepName,
} from './workflow-constants.js'
import { pikkuState } from '../../pikku-state.js'
import { resolveNamespace } from '../rpc/rpc-runner.js'
import { runningStepLease } from './workflow-step-lease.js'
import { throwIfLeaseLost, throwIfNotOwned } from './workflow-lost-lease.js'
import type { StepAttempt } from './workflow-step-signal.js'
import { isWorkflowName } from './workflow-meta-resolver.js'
import { planUnwind, type UnwindRecord } from './workflow-unwind-plan.js'
import type {
  StepState,
  WorkflowRun,
  StepStatus,
  WorkflowStatus,
  WorkflowStepOptions,
} from './workflow.types.js'

export type CompensationStepOutcome = 'done' | 'waiting' | 'stuck'

export interface UnwindHost {
  /** Aborts if the run lease this unwind is driven under is lost. */
  leaseLost?: AbortSignal
  getRun(runId: string): Promise<WorkflowRun | null>
  getRunSteps(runId: string): Promise<UnwindRecord[]>
  getRunState(runId: string): Promise<Record<string, unknown>>
  hasCompensation(record: UnwindRecord): boolean
  isChildWorkflow(record: UnwindRecord): boolean
  runCompensationStep(
    runId: string,
    forward: UnwindRecord,
    compensatingFor: CompensatingFor
  ): Promise<CompensationStepOutcome>
  finish(
    run: WorkflowRun,
    from: readonly WorkflowStatus[],
    status: WorkflowStatus,
    output: unknown,
    error: SerializedError | undefined
  ): Promise<void>
}

const UNWINDING: readonly WorkflowStatus[] = ['compensating']

export const compensatingForStep = (
  forward: Pick<UnwindRecord, 'status' | 'result' | 'error' | 'stepName'>
): CompensatingFor =>
  forward.status === 'succeeded'
    ? { ok: true, output: forward.result, stepName: forward.stepName }
    : {
        ok: false,
        output: null,
        error: forward.error ?? { message: 'step failed' },
        stepName: forward.stepName,
      }

export const skippedSteps = (state: Record<string, unknown>): Set<string> =>
  new Set(
    Object.keys(state)
      .filter((k) => k.startsWith(NO_COMPENSATE_STATE_PREFIX) && state[k])
      .map((k) => k.slice(NO_COMPENSATE_STATE_PREFIX.length))
  )

export const wouldCompensate = async (
  host: UnwindHost,
  runId: string
): Promise<boolean> => {
  const [records, state] = await Promise.all([
    host.getRunSteps(runId),
    host.getRunState(runId),
  ])
  const plan = planUnwind({
    records,
    skip: skippedSteps(state),
    hasCompensation: host.hasCompensation,
    isChildWorkflow: host.isChildWorkflow,
  })
  return plan.candidates.length > 0 || plan.forwardInFlight || !!plan.restedAt
}

export const driveUnwind = async (
  host: UnwindHost,
  runId: string
): Promise<'waiting' | 'finished'> => {
  for (;;) {
    const run = await host.getRun(runId)
    if (!run || WORKFLOW_TERMINAL_STATES.has(run.status)) return 'finished'

    const [records, state] = await Promise.all([
      host.getRunSteps(runId),
      host.getRunState(runId),
    ])
    const plan = planUnwind({
      records,
      skip: skippedSteps(state),
      hasCompensation: host.hasCompensation,
      isChildWorkflow: host.isChildWorkflow,
    })

    throwIfLeaseLost(host.leaseLost)
    if (plan.forwardInFlight) return 'waiting'

    if (plan.ready.length > 0) {
      let progressed = false
      for (const forward of plan.ready) {
        throwIfLeaseLost(host.leaseLost)
        const outcome = await host.runCompensationStep(
          runId,
          forward,
          compensatingForStep(forward)
        )
        if (outcome !== 'waiting') progressed = true
      }
      if (progressed) continue
      return 'waiting'
    }

    if (!plan.settled) return 'waiting'

    if (plan.stuck.length > 0) {
      await host.finish(
        run,
        UNWINDING,
        'compensation_failed',
        { stuckSteps: plan.stuck },
        run.error
      )
    } else if (plan.compensated || plan.restedAt) {
      const restedAt = plan.childRestedAt ?? plan.restedAt
      await host.finish(
        run,
        UNWINDING,
        'compensated',
        restedAt ? { restedAt } : undefined,
        run.error
      )
    } else {
      // A cancelled run with nothing to undo is still cancelled, not failed.
      const status =
        run.error?.code === WORKFLOW_CANCELLED_CODE ? 'cancelled' : 'failed'
      await host.finish(run, UNWINDING, status, undefined, run.error)
    }
    return 'finished'
  }
}

export const compensationRpcName = (rpcName: string): string =>
  `${rpcName}:compensate`

export interface CompensationApi {
  /** Aborts if the run lease the caller holds is lost. */
  leaseLost?: AbortSignal
  getRun(runId: string): Promise<WorkflowRun | null>
  getRunSteps(runId: string): Promise<UnwindRecord[]>
  getRunState(runId: string): Promise<Record<string, unknown>>
  transitionRunStatus(
    runId: string,
    from: readonly WorkflowStatus[],
    status: WorkflowStatus,
    output?: unknown,
    error?: SerializedError
  ): Promise<boolean>
  loadStep(
    runId: string,
    stepName: string,
    create: () => Promise<StepState>
  ): Promise<StepState>
  insertStepState(
    runId: string,
    stepName: string,
    rpcName: string | null,
    data: unknown,
    options: WorkflowStepOptions,
    fromStepName: string
  ): Promise<StepState>
  dispatchStep(
    runId: string,
    stepName: string,
    rpcName: string,
    data: unknown,
    options: WorkflowStepOptions,
    fromStepName: string
  ): Promise<boolean>
  setStepScheduled(stepId: string): Promise<void>
  runInline(
    runId: string,
    stepState: StepState,
    retries: number,
    retryDelay: WorkflowStepOptions['retryDelay'],
    work: (current: StepState, attempt?: StepAttempt) => Promise<unknown>
  ): Promise<unknown>
  invoke(
    runId: string,
    stepName: string,
    stepState: StepState,
    rpcName: string,
    data: unknown,
    compensatingFor: CompensatingFor,
    signal?: AbortSignal
  ): Promise<unknown>
  failOrUnwind(run: WorkflowRun, error: Error): Promise<unknown>
  /** `driveUnwind` under the run's lease, taken here unless the caller holds it. */
  drive(runId: string): Promise<'waiting' | 'finished'>
  setStepResult(
    stepId: string,
    result: unknown,
    attempt?: number,
    from?: readonly StepStatus[]
  ): Promise<void>
  setStepError(
    stepId: string,
    error: Error,
    attempt?: number,
    from?: readonly StepStatus[]
  ): Promise<void>
  notifyParent(run: WorkflowRun, error: Error): Promise<void>
  hasCompensation(record: UnwindRecord): boolean
  isChildWorkflow(record: UnwindRecord): boolean
}

export const createUnwindHost = (api: CompensationApi): UnwindHost => ({
  leaseLost: api.leaseLost,
  getRun: (id) => api.getRun(id),
  getRunSteps: (id) => api.getRunSteps(id),
  getRunState: (id) => api.getRunState(id),
  hasCompensation: (r) => api.hasCompensation(r),
  isChildWorkflow: (r) => api.isChildWorkflow(r),
  runCompensationStep: (runId, forward, compensatingFor) =>
    api.isChildWorkflow(forward)
      ? compensateChildStep(api, runId, forward)
      : compensateFunctionStep(api, runId, forward, compensatingFor),
  finish: async (run, from, status, output, error) => {
    // Refused: another writer settled the run, and tells the parent itself.
    if (!(await api.transitionRunStatus(run.id, from, status, output, error))) {
      return
    }
    const settled = (await api.getRun(run.id)) ?? run
    await api.notifyParent(
      settled,
      childCompensationError(status, output, error)
    )
  },
})

export const childCompensationError = (
  status: WorkflowStatus,
  output: unknown,
  error: SerializedError | undefined
): Error & { childCompensation: ChildCompensationInfo } => {
  const source = output as
    { restedAt?: string; stuckSteps?: Array<{ stepName: string }> } | undefined
  const message =
    status === 'compensation_failed'
      ? `Sub-workflow compensation failed at ${source?.stuckSteps?.map((s) => s.stepName).join(', ')}`
      : error?.message || 'Sub-workflow failed'
  return Object.assign(new Error(message), {
    childCompensation: { status, ...(source ?? {}) } as ChildCompensationInfo,
  })
}

const compensateFunctionStep = async (
  api: CompensationApi,
  runId: string,
  forward: UnwindRecord,
  compensatingFor: CompensatingFor
): Promise<CompensationStepOutcome> => {
  const stepName = compensationStepName(forward.stepName)
  const rpcName = compensationRpcName(forward.rpcName!)
  const options: WorkflowStepOptions = {
    retries: forward.retries ?? DEFAULT_STEP_RETRIES,
  }
  const state = await api.loadStep(runId, stepName, () =>
    api.insertStepState(
      runId,
      stepName,
      rpcName,
      forward.data,
      options,
      forward.stepName
    )
  )
  if (state.status === 'succeeded') return 'done'
  if (state.status === 'failed') return 'stuck'
  if (state.status === 'scheduled') return 'waiting'
  const lease = runningStepLease(state)
  if (lease === 'held') return 'waiting'

  const dispatched = await api.dispatchStep(
    runId,
    stepName,
    rpcName,
    forward.data,
    options,
    forward.stepName
  )
  if (dispatched) {
    if (lease !== 'lapsed') await api.setStepScheduled(state.stepId)
    return 'waiting'
  }

  try {
    await api.runInline(
      runId,
      state,
      options.retries!,
      undefined,
      (current, attempt) =>
        api.invoke(
          runId,
          stepName,
          current,
          rpcName,
          forward.data,
          compensatingFor,
          attempt?.signal
        )
    )
    return 'done'
  } catch (error) {
    throwIfNotOwned(error, api.leaseLost)
    return 'stuck'
  }
}

const compensateChildStep = async (
  api: CompensationApi,
  runId: string,
  forward: UnwindRecord
): Promise<CompensationStepOutcome> => {
  const stepName = compensationStepName(forward.stepName)
  const state = await api.loadStep(runId, stepName, () =>
    api.insertStepState(
      runId,
      stepName,
      null,
      { childRunId: forward.childRunId },
      { retries: 0 },
      forward.stepName
    )
  )
  if (state.status === 'succeeded') return 'done'
  if (state.status === 'failed') return 'stuck'
  // A child's row has no function of its own, so it is settled as it stands.
  const settle = (result: unknown) =>
    api.setStepResult(
      state.stepId,
      result,
      state.attemptCount,
      STEP_SOURCES.unsettled
    )
  if (!forward.childRunId) {
    await settle(undefined)
    return 'done'
  }

  const child = await api.getRun(forward.childRunId)
  if (child?.status === 'completed') {
    await api.failOrUnwind(child, new Error('unwind'))
  }
  const after = await api.getRun(forward.childRunId)
  throwIfLeaseLost(api.leaseLost)
  switch (after?.status) {
    case 'compensated': {
      const restedAt = (after.output as { restedAt?: string } | undefined)
        ?.restedAt
      await settle(restedAt ? { restedAt } : undefined)
      return 'done'
    }
    case 'compensation_failed':
      await api.setStepError(
        state.stepId,
        new Error('child compensation failed'),
        state.attemptCount,
        STEP_SOURCES.unsettled
      )
      return 'stuck'
    case 'failed':
      await settle(undefined)
      return 'done'
    default:
      return 'waiting'
  }
}

export const functionHasCompensation = (rpcName: string): boolean => {
  const funcId = pikkuState(null, 'rpc', 'meta')[rpcName]
  const local = pikkuState(null, 'function', 'meta')[
    typeof funcId === 'string' ? funcId : rpcName
  ]
  if (local) return local.compensate === true
  const resolved = resolveNamespace(rpcName)
  return resolved
    ? pikkuState(resolved.package, 'function', 'meta')[resolved.function]
        ?.compensate === true
    : false
}

export const isChildWorkflowRecord = (record: UnwindRecord): boolean =>
  !!record.rpcName && isWorkflowName(record.rpcName)

export const recordHasCompensation = (record: UnwindRecord): boolean =>
  isChildWorkflowRecord(record)
    ? !!record.childRunId
    : !!record.rpcName && functionHasCompensation(record.rpcName)

export interface ChildCompensationInfo {
  status: WorkflowStatus
  restedAt?: string
  stuckSteps?: Array<{ stepName: string; error: string }>
}

export type UnwindCause = SerializedError & {
  childCompensation?: ChildCompensationInfo
}

export const childRunFailure = (childRun: WorkflowRun): Error | null => {
  switch (childRun.status) {
    case 'failed':
      return new Error(childRun.error?.message || 'Sub-workflow failed')
    case 'cancelled':
      return new Error('Sub-workflow was cancelled')
    case 'compensated':
    case 'compensation_failed':
      return childCompensationError(
        childRun.status,
        childRun.output,
        childRun.error
      )
    default:
      return null
  }
}

/**
 * The error carrying a child's compensation outcome does not survive a step
 * boundary, so a queued parent finds it again from the failed child step.
 */
const failedChildCompensation = async (
  api: CompensationApi,
  runId: string
): Promise<ChildCompensationInfo | undefined> => {
  const steps = await api.getRunSteps(runId)
  let rested: ChildCompensationInfo | undefined
  for (const step of steps) {
    if (step.status !== 'failed' || !step.childRunId) continue
    const child = await api.getRun(step.childRunId)
    if (child?.status === 'compensation_failed') {
      return childCompensationError(child.status, child.output, child.error)
        .childCompensation
    }
    if (child?.status === 'compensated') {
      rested ??= childCompensationError(
        child.status,
        child.output,
        child.error
      ).childCompensation
    }
  }
  return rested
}

export const beginUnwind = async (
  api: CompensationApi,
  host: UnwindHost,
  run: WorkflowRun,
  cause: UnwindCause
): Promise<'unwinding' | 'finished' | 'not-needed'> => {
  const child =
    cause.childCompensation ?? (await failedChildCompensation(api, run.id))
  throwIfLeaseLost(api.leaseLost)
  if (child?.status === 'compensation_failed') {
    await host.finish(
      run,
      unwindEntryStatuses(cause),
      'compensation_failed',
      { stuckSteps: child.stuckSteps },
      cause
    )
    return 'finished'
  }
  if (child?.status === 'compensated' && child.restedAt) {
    await host.finish(
      run,
      unwindEntryStatuses(cause),
      'compensated',
      { restedAt: child.restedAt },
      cause
    )
    return 'finished'
  }
  if (!(await wouldCompensate(host, run.id))) return 'not-needed'
  throwIfLeaseLost(api.leaseLost)

  const entered = await api.transitionRunStatus(
    run.id,
    unwindEntryStatuses(cause),
    'compensating',
    undefined,
    cause
  )
  if (!entered) return 'finished'
  return (await api.drive(run.id)) === 'waiting' ? 'unwinding' : 'finished'
}

export const isUnwound = (status: string | undefined): boolean =>
  status === 'compensating' ||
  status === 'compensated' ||
  status === 'compensation_failed'

/**
 * The status of a run that can no longer take an outcome from a pass of its
 * own. An unwind that stopped to wait on the steps in flight is finished here:
 * those steps were this pass's, and nothing else will wake an inline run.
 */
export const settleStoppedRun = async (
  api: CompensationApi,
  runId: string
): Promise<WorkflowStatus | undefined> => {
  const status = (await api.getRun(runId))?.status
  if (!status || !isRunStopped(status)) return undefined
  if (status === 'compensating') {
    await api.drive(runId)
  }
  return status
}

export const failRunOrUnwind = async (
  api: CompensationApi,
  run: WorkflowRun,
  error: Error & { code?: string; childCompensation?: ChildCompensationInfo },
  onFailed: () => Promise<void>
): Promise<'unwinding' | 'finished' | 'failed'> => {
  const cause: UnwindCause = {
    message: error.message,
    stack: error.stack,
    code: error.code,
    ...(error.childCompensation
      ? { childCompensation: error.childCompensation }
      : {}),
  }
  const outcome = await beginUnwind(api, createUnwindHost(api), run, cause)
  if (outcome !== 'not-needed') return outcome
  throwIfLeaseLost(api.leaseLost)
  const failed = await api.transitionRunStatus(
    run.id,
    run.status === 'completed'
      ? [...RUN_STATUS_SOURCES.failed, 'completed']
      : RUN_STATUS_SOURCES.failed,
    'failed',
    undefined,
    cause
  )
  if (!failed) return 'finished'
  await onFailed()
  return 'failed'
}

/**
 * Child workflows are cancelled first so nothing keeps producing effects under
 * a parent that is unwinding. A run with nothing to undo stays `cancelled`.
 */
export const cancelAndUnwind = async (
  api: CompensationApi,
  host: UnwindHost,
  runId: string,
  reason?: string
): Promise<WorkflowStatus | undefined> => {
  const run = await api.getRun(runId)
  if (!run) return undefined
  if (WORKFLOW_TERMINAL_STATES.has(run.status) || isUnwound(run.status)) {
    return run.status
  }
  const cause: SerializedError = {
    message: reason || 'Workflow cancelled',
    stack: '',
    code: WORKFLOW_CANCELLED_CODE,
  }
  const cancelled = await api.transitionRunStatus(
    runId,
    RUN_STATUS_SOURCES.cancelled,
    'cancelled',
    undefined,
    cause
  )
  if (!cancelled) return (await api.getRun(runId))?.status
  // Read after the write above, which `startLinkedChildRun` relies on.
  for (const step of await host.getRunSteps(runId)) {
    if (step.childRunId) {
      await cancelAndUnwind(api, host, step.childRunId, reason)
    }
  }
  await beginUnwind(api, host, run, cause)
  return (await api.getRun(runId))?.status
}
