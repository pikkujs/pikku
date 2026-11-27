import { isRunCancelled } from './workflow-constants.js'
import { childRunFailure } from './workflow-compensation.js'
import { pickingUpLostRun, type LostRunHost } from './workflow-lost-lease.js'
import type { WorkflowRun } from './workflow.types.js'

type InlineRunHost = Omit<LostRunHost, 'getRun'> & {
  getRun(runId: string): Promise<WorkflowRun | null>
  runJob(): Promise<void>
  /** Take the run's lease and drive its unwind. Throws if the run is taken. */
  unwind(): Promise<void>
}

/**
 * Work an inline run in the caller's process. Nothing else is bound to wake it,
 * so a pass that loses the run's lease picks it up again here.
 */
export const runInlineToItsEnd = async (
  host: InlineRunHost,
  runId: string
): Promise<void> => {
  const { pickedUp } = await pickingUpLostRun(
    host,
    runId,
    () => host.runJob(),
    // An unwind takes the lease here, so that a run someone else has is seen to
    // be refused.
    async () =>
      (await host.getRun(runId))?.status === 'compensating'
        ? host.unwind()
        : host.runJob()
  )
  if (!pickedUp) return
  // A pass that only finishes an unwind throws nothing, unlike the one that
  // began it, so the failure is read off the run.
  const run = await host.getRun(runId)
  if (run && !isRunCancelled(run)) {
    const failure = childRunFailure(run)
    if (failure) throw failure
  }
}
