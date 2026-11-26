import { NO_COMPENSATE_STATE_PREFIX } from './workflow-constants.js'
import { WorkflowRunStoppedError } from './workflow-errors.js'
import type { InlineStepHooks } from './workflow-step-retry.js'
import type { StepAttempt } from './workflow-step-signal.js'
import type { StepState } from './workflow.types.js'

type RefusalStore = {
  updateRunState(runId: string, name: string, value: unknown): Promise<void>
  setStepError(stepId: string, error: Error, attempt?: number): Promise<void>
}

/**
 * Give a forward step that will not be started, because its run was stopped, a
 * final outcome: one left in flight would hold the unwind open for good. A step
 * on its first attempt never ran, so the unwind skips it. A later attempt
 * follows one that did run, and stays for the unwind to compensate.
 */
export const refuseStep = async (
  store: RefusalStore,
  runId: string,
  stepName: string,
  stepState: StepState,
  attempt?: number
): Promise<void> => {
  if (stepState.status === 'failed') return
  // Marked first, so no unwind sees the step failed and not yet skipped.
  if (stepState.attemptCount === 1) {
    await store.updateRunState(
      runId,
      `${NO_COMPENSATE_STATE_PREFIX}${stepName}`,
      true
    )
  }
  await store.setStepError(
    stepState.stepId,
    new WorkflowRunStoppedError(runId, stepName),
    attempt
  )
}

/** How the in-process retry loop treats a forward step that runs a function. */
export const forwardStepHooks = (
  service: RefusalStore & {
    openInlineStepAttempt(
      runId: string,
      forward: boolean
    ): StepAttempt | undefined
  },
  runId: string,
  stepName: string
): InlineStepHooks => ({
  openAttempt: () => service.openInlineStepAttempt(runId, true),
  onRefused: (stepState) => refuseStep(service, runId, stepName, stepState),
})
