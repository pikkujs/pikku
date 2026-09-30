import type { SerializedError } from '../../errors/serialized-error.js'
import type { CompensatingFor } from './dsl/workflow-dsl.types.js'
import {
  DEFAULT_STEP_RETRIES,
  NO_COMPENSATE_STATE_PREFIX,
  WORKFLOW_TERMINAL_STATES,
  compensationStepName,
} from './workflow-constants.js'
import { pikkuState } from '../../pikku-state.js'
import { resolveNamespace } from '../rpc/rpc-runner.js'
import { runningStepLease } from './workflow-step-lease.js'
import { planUnwind, type UnwindRecord } from './workflow-unwind-plan.js'
import type {
  StepState,
  WorkflowRun,
  WorkflowStatus,
  WorkflowStepOptions,
} from './workflow.types.js'

export type CompensationStepOutcome = 'done' | 'waiting' | 'stuck'

export interface UnwindHost {
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
    status: WorkflowStatus,
    output: unknown,
    error: SerializedError | undefined
  ): Promise<void>
}

const ENTERABLE: ReadonlySet<string> = new Set([
  'running',
  'suspended',
  'failed',
  'cancelled',
  'completed',
])

export const canEnterCompensation = (status: string): boolean =>
  ENTERABLE.has(status)

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

    if (plan.forwardInFlight) return 'waiting'

    if (plan.ready.length > 0) {
      let progressed = false
      for (const forward of plan.ready) {
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
        'compensation_failed',
        { stuckSteps: plan.stuck },
        run.error
      )
    } else if (plan.compensated || plan.restedAt) {
      const restedAt = plan.childRestedAt ?? plan.restedAt
      await host.finish(
        run,
        'compensated',
        restedAt ? { restedAt } : undefined,
        run.error
      )
    } else {
      await host.finish(run, 'failed', undefined, run.error)
    }
    return 'finished'
  }
}

export const compensationRpcName = (rpcName: string): string =>
  `${rpcName}:compensate`

export interface CompensationApi {
  getRun(runId: string): Promise<WorkflowRun | null>
  getRunSteps(runId: string): Promise<UnwindRecord[]>
  getRunState(runId: string): Promise<Record<string, unknown>>
  updateRunStatus(
    runId: string,
    status: WorkflowStatus,
    output?: unknown,
    error?: SerializedError
  ): Promise<void>
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
    stepState: StepState,
    retries: number,
    retryDelay: WorkflowStepOptions['retryDelay'],
    work: (current: StepState) => Promise<unknown>
  ): Promise<unknown>
  invoke(
    runId: string,
    stepName: string,
    stepState: StepState,
    rpcName: string,
    data: unknown,
    compensatingFor: CompensatingFor
  ): Promise<unknown>
  failOrUnwind(run: WorkflowRun, error: Error): Promise<unknown>
  setStepResult(stepId: string, result: unknown): Promise<void>
  setStepError(stepId: string, error: Error): Promise<void>
  notifyParent(run: WorkflowRun, error: Error): Promise<void>
  hasCompensation(record: UnwindRecord): boolean
  isChildWorkflow(record: UnwindRecord): boolean
}

export const createUnwindHost = (api: CompensationApi): UnwindHost => ({
  getRun: (id) => api.getRun(id),
  getRunSteps: (id) => api.getRunSteps(id),
  getRunState: (id) => api.getRunState(id),
  hasCompensation: (r) => api.hasCompensation(r),
  isChildWorkflow: (r) => api.isChildWorkflow(r),
  runCompensationStep: (runId, forward, compensatingFor) =>
    api.isChildWorkflow(forward)
      ? compensateChildStep(api, runId, forward)
      : compensateFunctionStep(api, runId, forward, compensatingFor),
  finish: async (run, status, output, error) => {
    await api.updateRunStatus(run.id, status, output, error)
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
): Error => {
  const source = output as
    { restedAt?: string; stuckSteps?: Array<{ stepName: string }> } | undefined
  const message =
    status === 'compensation_failed'
      ? `Sub-workflow compensation failed at ${source?.stuckSteps?.map((s) => s.stepName).join(', ')}`
      : error?.message || 'Sub-workflow failed'
  return Object.assign(new Error(message), {
    childCompensation: { status, ...(source ?? {}) },
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
    await api.runInline(state, options.retries!, undefined, (current) =>
      api.invoke(
        runId,
        stepName,
        current,
        rpcName,
        forward.data,
        compensatingFor
      )
    )
    return 'done'
  } catch {
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
  if (!forward.childRunId) {
    await api.setStepResult(state.stepId, undefined)
    return 'done'
  }

  const child = await api.getRun(forward.childRunId)
  if (child?.status === 'completed') {
    await api.failOrUnwind(child, new Error('unwind'))
  }
  const after = await api.getRun(forward.childRunId)
  switch (after?.status) {
    case 'compensated': {
      const restedAt = (after.output as { restedAt?: string } | undefined)
        ?.restedAt
      await api.setStepResult(state.stepId, restedAt ? { restedAt } : undefined)
      return 'done'
    }
    case 'compensation_failed':
      await api.setStepError(
        state.stepId,
        new Error('child compensation failed')
      )
      return 'stuck'
    case 'failed':
      await api.setStepResult(state.stepId, undefined)
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
  !!record.rpcName &&
  pikkuState(null, 'workflows', 'meta')[record.rpcName] !== undefined

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

export const beginUnwind = async (
  api: CompensationApi,
  host: UnwindHost,
  run: WorkflowRun,
  cause: UnwindCause
): Promise<'unwinding' | 'finished' | 'not-needed'> => {
  const child = cause.childCompensation
  if (child?.status === 'compensation_failed') {
    await host.finish(
      run,
      'compensation_failed',
      { stuckSteps: child.stuckSteps },
      cause
    )
    return 'finished'
  }
  if (child?.status === 'compensated' && child.restedAt) {
    await host.finish(run, 'compensated', { restedAt: child.restedAt }, cause)
    return 'finished'
  }
  if (!(await wouldCompensate(host, run.id))) return 'not-needed'

  const fresh = await api.getRun(run.id)
  if (!fresh || !canEnterCompensation(fresh.status)) return 'finished'
  await api.updateRunStatus(run.id, 'compensating', undefined, cause)
  return (await driveUnwind(host, run.id)) === 'waiting'
    ? 'unwinding'
    : 'finished'
}

export const isUnwound = (status: string | undefined): boolean =>
  status === 'compensating' ||
  status === 'compensated' ||
  status === 'compensation_failed'

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
  await api.updateRunStatus(run.id, 'failed', undefined, cause)
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
  runId: string
): Promise<WorkflowStatus | undefined> => {
  const run = await api.getRun(runId)
  if (!run) return undefined
  if (WORKFLOW_TERMINAL_STATES.has(run.status) || isUnwound(run.status)) {
    return run.status
  }
  for (const step of await host.getRunSteps(runId)) {
    if (step.childRunId) await cancelAndUnwind(api, host, step.childRunId)
  }
  const cause: SerializedError = {
    message: 'Workflow cancelled',
    stack: '',
    code: 'WORKFLOW_CANCELLED',
  }
  await api.updateRunStatus(runId, 'cancelled', undefined, cause)
  await beginUnwind(api, host, run, cause)
  return (await api.getRun(runId))?.status
}
