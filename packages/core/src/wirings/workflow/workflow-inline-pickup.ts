import { isExpectedError } from '../../errors/error-handler.js'
import type { SerializedError } from '../../errors/serialized-error.js'
import { getSingletonServices } from '../../pikku-state.js'
import { isRunCancelled } from './workflow-constants.js'
import { childRunFailure, isUnwound } from './workflow-compensation.js'
import {
  isOwnershipError,
  pickingUpLostRun,
  type LostRunHost,
} from './workflow-lost-lease.js'
import { isRunLeaseError } from './workflow-run-lease.js'
import { runLogger } from './workflow-run-trace.js'
import type { WorkflowRun, WorkflowRunWire } from './workflow.types.js'

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

type FailedInlineRunHost = {
  getRun(runId: string): Promise<WorkflowRun | null>
  markFailedUnlessUnwound(runId: string, error: SerializedError): Promise<void>
}

/**
 * What the caller of an inline run is given for how its pass ended: nothing for
 * a pass that went as far as it could, or else the error, with the run marked
 * failed when the error is the run's own.
 */
export const endFailedInlineRun = async (
  host: FailedInlineRunHost,
  runId: string,
  name: string,
  wire: WorkflowRunWire,
  error: any
): Promise<void> => {
  // A lease error says nothing about how the run went — a lost lease is only
  // seen once the body has already written its outcome — so the run keeps
  // whatever status it reached.
  if (
    error.name === 'WorkflowDispatchException' ||
    isRunLeaseError(error) ||
    isOwnershipError(error)
  ) {
    throw error
  }
  if (
    error.name === 'WorkflowAsyncException' ||
    error.name === 'WorkflowCancelledException' ||
    error.name === 'WorkflowSuspendedException'
  ) {
    return
  }
  await host.markFailedUnlessUnwound(runId, {
    name: error.name,
    message: error.message,
    stack: error.stack,
  } as SerializedError)
  runLogger(getSingletonServices()!.logger, wire).error(
    `Workflow ${name} (run ${runId}) failed:`,
    isExpectedError(error) ? error.message : error
  )
  const settled = await host.getRun(runId)
  if (settled?.wire?.type === 'workflow' && isUnwound(settled.status)) {
    throw childRunFailure(settled) ?? error
  }
  throw error
}
