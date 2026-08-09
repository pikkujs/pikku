import { getDurationInMilliseconds } from '../../time-utils.js'
import {
  WorkflowApprovalResolvedError,
  WorkflowSuspendedException,
} from './workflow-errors.js'
import type {
  ApprovalOutcome,
  StepState,
  WorkflowApprovalOptions,
} from './workflow.types.js'

/** The durable step name an approval point is recorded under. */
export const approvalStepNameFor = (reason: string): string =>
  `__workflow_approval:${reason}`

/**
 * The run-state key holding an approval's decision.
 *
 * Hex-encoded because the key is composed from a caller-supplied reason, and
 * run state is a flat record — an unescaped reason could collide with, or
 * shadow, another key.
 */
export const approvalStateKey = (stepName: string): string => {
  let hex = ''
  for (const byte of new TextEncoder().encode(stepName)) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return `__approval_${hex}`
}

/** What the approval gate needs from the workflow service. */
export type ApprovalStore = {
  getStepState: (runId: string, stepName: string) => Promise<StepState>
  insertStepState: (
    runId: string,
    stepName: string,
    rpcName: string,
    input: unknown,
    output: undefined,
    fromStepName?: string
  ) => Promise<StepState>
  setStepRunning: (stepId: string) => Promise<void>
  setStepResult: (stepId: string, result: unknown) => Promise<void>
  getRunState: (runId: string) => Promise<Record<string, unknown>>
  updateRunState: (runId: string, key: string, value: unknown) => Promise<void>
  resumeWorkflow: (runId: string) => Promise<void>
  scheduleRunWake: (runId: string, delay: number) => Promise<void>
}

/**
 * Record a decision against an approval point and wake the run.
 *
 * A decision arriving for an already-settled approval is refused rather than
 * overwriting it: the run has moved on, and a second answer would be recorded
 * against a gate nobody is waiting at.
 */
export const recordApprovalDecision = async (
  store: ApprovalStore,
  runId: string,
  reason: string,
  decision: unknown
): Promise<void> => {
  const stepName = approvalStepNameFor(reason)
  const stateKey = approvalStateKey(stepName)

  let resolved: StepState | undefined
  try {
    resolved = await store.getStepState(runId, stepName)
  } catch {
    // knowledge: decisions/security/workflow-approval-payloads-are-validated-on-replay-inside-the-workflow.md
  }
  if (resolved?.stepId && resolved.status === 'succeeded') {
    const outcome = resolved.result as ApprovalOutcome<unknown> | undefined
    throw new WorkflowApprovalResolvedError(
      reason,
      outcome?.status ?? 'decided'
    )
  }

  const state = await store.getRunState(runId)
  const record = (state[stateKey] ?? {}) as Record<string, unknown>
  await store.updateRunState(runId, stateKey, {
    ...record,
    decision,
    decidedAt: new Date().toISOString(),
    error: undefined,
  })
  await store.resumeWorkflow(runId)
}

/**
 * Evaluate an approval gate on replay.
 *
 * The payload is validated here rather than where it was submitted, because the
 * schema is a value on the workflow and only the workflow has it. A payload
 * that fails validation is cleared and the run suspends again, so a bad
 * submission cannot settle the gate.
 */
export const evaluateApprovalStep = async (
  store: ApprovalStore,
  runId: string,
  reason: string,
  approvalStepName: string,
  fromStepName: string | undefined,
  options: WorkflowApprovalOptions
): Promise<ApprovalOutcome<unknown>> => {
  const insert = () =>
    store.insertStepState(
      runId,
      approvalStepName,
      'pikkuWorkflowApproval',
      { reason, expiry: options.expiry },
      undefined,
      fromStepName
    )

  let stepState: StepState
  try {
    stepState = await store.getStepState(runId, approvalStepName)
  } catch {
    stepState = await insert()
  }
  if (!stepState.stepId) {
    stepState = await insert()
  }

  if (stepState.status === 'succeeded') {
    return stepState.result as ApprovalOutcome<unknown>
  }

  const stateKey = approvalStateKey(approvalStepName)
  let record = ((await store.getRunState(runId))[stateKey] ?? {}) as {
    decision?: unknown
    decidedAt?: string
    expiresAt?: string
    error?: unknown
  }

  if (stepState.status === 'pending') {
    await store.setStepRunning(stepState.stepId)
    if (options.expiry !== undefined && !record.expiresAt) {
      const expiry = getDurationInMilliseconds(options.expiry)
      record = {
        ...record,
        expiresAt: new Date(Date.now() + expiry).toISOString(),
      }
      await store.updateRunState(runId, stateKey, record)
      await store.scheduleRunWake(runId, expiry)
    }
  }

  if (record.decision !== undefined) {
    const validation = await options.schema['~standard'].validate(
      record.decision
    )
    if (validation.issues) {
      await store.updateRunState(runId, stateKey, {
        ...record,
        decision: undefined,
        decidedAt: undefined,
        error: validation.issues.map((issue) => ({
          message: issue.message,
          path: issue.path?.map((segment) =>
            typeof segment === 'object' ? segment.key : segment
          ),
        })),
      })
      throw new WorkflowSuspendedException(runId, reason)
    }
    const outcome: ApprovalOutcome<unknown> = {
      status: 'decided',
      data: validation.value,
    }
    await store.setStepResult(stepState.stepId, outcome)
    return outcome
  }

  if (record.expiresAt && Date.now() >= Date.parse(record.expiresAt)) {
    const outcome: ApprovalOutcome<unknown> = { status: 'expired' }
    await store.setStepResult(stepState.stepId, outcome)
    return outcome
  }

  throw new WorkflowSuspendedException(runId, reason)
}
