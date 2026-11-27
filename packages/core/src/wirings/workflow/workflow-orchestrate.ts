import { getSingletonServices } from '../../pikku-state.js'
import type { SerializedError } from '../../errors/serialized-error.js'
import { RUN_LEASE_RETRY_MS } from './workflow-constants.js'
import { isOwnershipError } from './workflow-lost-lease.js'
import { isRunLeaseError } from './workflow-run-lease.js'
import type { WorkflowAwaitedStep } from './workflow-queue-workers.js'

/** What an orchestrator message needs from the workflow service. */
export type OrchestrationHost = {
  runJob(): Promise<void>
  /** Queue this message again, to be handled after `delayMs`. */
  requeue(delayMs: number): Promise<void>
  markFailedUnlessUnwound(error: SerializedError): Promise<void>
  /** Wake the run again if the step it was woken for still reads as leased. */
  wakeWhileStepLeased(awaitedStep: WorkflowAwaitedStep): Promise<void>
}

/** One orchestrator message: a pass over the run, and how its ending is taken. */
export const orchestrateRun = async (
  host: OrchestrationHost,
  runId: string,
  awaitedStep: WorkflowAwaitedStep | undefined
): Promise<void> => {
  try {
    await host.runJob()
  } catch (error: any) {
    if (
      error.name !== 'WorkflowAsyncException' &&
      error.name !== 'WorkflowCancelledException' &&
      error.name !== 'WorkflowSuspendedException'
    ) {
      // Another orchestrator holds the run. Its pass may already have read the
      // state this message was sent to report, so the message cannot simply be
      // dropped — and handing it back to the queue spends the retry budget the
      // queue keeps for real failures, which a long pass exhausts. Wake the run
      // again once the holder has had time to finish.
      if (isRunLeaseError(error) || isOwnershipError(error)) {
        getSingletonServices()!.logger.info(
          `Workflow run ${runId} is being orchestrated elsewhere; waking it again in ${RUN_LEASE_RETRY_MS}ms`
        )
        await host.requeue(RUN_LEASE_RETRY_MS)
        return
      }

      if (error.name === 'WorkflowDispatchException') {
        getSingletonServices()!.logger.warn(
          `Workflow run ${runId} could not dispatch a step (queue unavailable); leaving run for orchestrator retry`,
          error
        )
        throw error
      }

      await host.markFailedUnlessUnwound({
        message: error.message,
        stack: error.stack,
        code: error.code,
      })

      throw error
    }
  }
  if (awaitedStep) {
    await host.wakeWhileStepLeased(awaitedStep)
  }
}
