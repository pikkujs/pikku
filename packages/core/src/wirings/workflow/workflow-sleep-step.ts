import { getDurationInMilliseconds } from '../../time-utils.js'
import {
  WorkflowAsyncException,
  WorkflowCancelledException,
  WorkflowDispatchException,
} from './workflow-errors.js'
import { throwIfLeaseLost } from './workflow-lost-lease.js'
import type { StepState } from './workflow.types.js'

/** What sleeping needs from the workflow service. */
export type SleepStepHost = {
  /** Resolves `false` when there is nothing to wake the run later. */
  scheduleSleep(
    runId: string,
    stepId: string,
    duration: number
  ): Promise<boolean>
  setStepScheduled(stepId: string): Promise<void>
  waitUnlessCancelled(
    runId: string,
    ms: number,
    leaseLost?: AbortSignal
  ): Promise<boolean>
  completeSleep(stepId: string): Promise<void>
}

/** Schedule a sleep to wake the run later, or else sit it out in this pass. */
export const runSleepStep = async (
  host: SleepStepHost,
  runId: string,
  stepName: string,
  stepState: StepState,
  duration: number,
  leaseLost: AbortSignal | undefined
): Promise<void> => {
  if (stepState.status === 'succeeded') {
    return
  }

  if (stepState.status === 'scheduled') {
    throw new WorkflowAsyncException(runId, stepName)
  }

  let scheduled: boolean
  try {
    scheduled = await host.scheduleSleep(runId, stepState.stepId, duration)
  } catch (cause) {
    throw new WorkflowDispatchException(runId, stepName, { cause })
  }
  if (scheduled) {
    await host.setStepScheduled(stepState.stepId)
    throw new WorkflowAsyncException(runId, stepName)
  }

  const cancelled = await host.waitUnlessCancelled(
    runId,
    getDurationInMilliseconds(duration),
    leaseLost
  )
  throwIfLeaseLost(leaseLost)
  if (cancelled) throw new WorkflowCancelledException(runId)
  await host.completeSleep(stepState.stepId)
}
