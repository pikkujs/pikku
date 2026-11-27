import type { Logger } from '../../services/logger.js'
import type { PikkuRPC } from '../rpc/rpc-types.js'
import type { PikkuWorkflowService } from './pikku-workflow-service.js'
import {
  driveUnwind,
  createUnwindHost,
  isChildWorkflowRecord,
  recordHasCompensation,
  type CompensationApi,
} from './workflow-compensation.js'
import { pickingUpLostRun } from './workflow-lost-lease.js'
import { takeBackLostInlineStep } from './workflow-step-claim.js'
import { runInlineRetryLoop } from './workflow-step-retry.js'
import type { RunUnwindHost, RunUnwinds } from './workflow-unwind-lease.js'
import type { StepRpcArgs } from './workflow-wire.js'
import type { WorkflowRun } from './workflow.types.js'

/** What compensating needs from a workflow service besides its public API. */
export type CompensationService = {
  service: PikkuWorkflowService
  unwinds: RunUnwinds
  logger(): Logger | undefined
  /** Ask for the run to be looked at again shortly, where there is a queue. */
  wake(runId: string): Promise<void>
  loadStep: CompensationApi['loadStep']
  dispatchStep: CompensationApi['dispatchStep']
  invoke(...args: StepRpcArgs): Promise<any>
  notifyParent(run: WorkflowRun, error: Error): Promise<void>
}

export const createRunUnwindHost = (
  deps: CompensationService,
  rpcService: PikkuRPC
): RunUnwindHost => ({
  withRunLease: (runId, fn) => deps.service.withRunLease(runId, fn),
  getRun: (runId) => deps.service.getRun(runId),
  logger: () => deps.logger(),
  unwind: (runId, leaseLost) =>
    driveUnwind(
      createUnwindHost(
        createCompensationApi(deps, rpcService, runId, leaseLost)
      ),
      runId
    ),
  wake: (runId) => deps.wake(runId),
})

/** `leaseLost` belongs to the lease the caller holds on `leasedRunId`. */
export const createCompensationApi = (
  deps: CompensationService,
  rpcService: PikkuRPC,
  leasedRunId?: string,
  leaseLost?: AbortSignal
): CompensationApi => {
  const { service } = deps
  return {
    leaseLost,
    drive: async (runId) => {
      const host = createRunUnwindHost(deps, rpcService)
      const held = runId === leasedRunId
      const drive = () => deps.unwinds.drive(host, runId, held, leaseLost)
      // A lease the caller holds is for its own pass to pick up.
      if (held) return drive()
      return (await pickingUpLostRun(host, runId, drive)).value
    },
    getRun: (...args) => service.getRun(...args),
    getRunSteps: (...args) => service.getRunSteps(...args),
    getRunState: (...args) => service.getRunState(...args),
    transitionRunStatus: (...args) => service.transitionRunStatus(...args),
    loadStep: deps.loadStep,
    insertStepState: (...args) => service.insertStepState(...args),
    dispatchStep: deps.dispatchStep,
    setStepScheduled: (id) => service.setStepScheduled(id),
    setStepResult: (...args) => service.setStepResult(...args),
    setStepError: (...args) => service.setStepError(...args),
    runInline: async (runId, stepName, step, retries, retryDelay, work) =>
      runInlineRetryLoop(
        service,
        await takeBackLostInlineStep(service, runId, stepName, step),
        retries,
        retryDelay,
        work,
        undefined,
        undefined,
        {
          leaseLost,
          openAttempt: () =>
            service.openInlineStepAttempt(runId, false, leaseLost),
        }
      ),
    invoke: (runId, stepName, step, rpcName, data, compensatingFor, signal) =>
      deps.invoke(
        runId,
        stepName,
        step,
        rpcName,
        data,
        rpcService,
        undefined,
        compensatingFor,
        signal
      ),
    failOrUnwind: (run, error) => service.failOrUnwind(run, error, rpcService),
    notifyParent: deps.notifyParent,
    hasCompensation: recordHasCompensation,
    isChildWorkflow: isChildWorkflowRecord,
  }
}
