import { WorkflowSuspendedException } from './workflow-errors.js'
import type { ApprovalStore } from './workflow-approval.js'
import type { StepState } from './workflow.types.js'

/** The durable step name a suspension point is recorded under. */
export const suspendStepNameFor = (reason: string): string =>
  `__workflow_suspend:${reason}`

/** What the suspend gate needs from the workflow service. */
export type SuspendStore = Pick<
  ApprovalStore,
  'getStepState' | 'insertStepState' | 'setStepRunning' | 'setStepResult'
>

/**
 * Record a suspension point and unwind the run.
 *
 * A suspension that has already succeeded returns instead of throwing, so a
 * replay walks past a gate the run has already passed through.
 */
export const recordSuspension = async (
  store: SuspendStore,
  runId: string,
  reason: string,
  stepName: string,
  fromStepName: string | undefined
): Promise<void> => {
  const insert = () =>
    store.insertStepState(
      runId,
      stepName,
      'pikkuWorkflowSuspend',
      { reason },
      undefined,
      fromStepName
    )

  let stepState: StepState
  try {
    stepState = await store.getStepState(runId, stepName)
  } catch {
    stepState = await insert()
  }
  if (!stepState.stepId) {
    stepState = await insert()
  }

  if (stepState.status === 'succeeded') {
    return
  }

  if (stepState.status === 'pending') {
    await store.setStepRunning(stepState.stepId)
  }

  await store.setStepResult(stepState.stepId, {
    reason,
    suspendedAt: new Date().toISOString(),
  })
  throw new WorkflowSuspendedException(runId, reason)
}
