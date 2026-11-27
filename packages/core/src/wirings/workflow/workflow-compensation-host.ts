import { getSingletonServices } from '../../pikku-state.js'
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
import { runInlineRetryLoop } from './workflow-step-retry.js'
import type { RunUnwindHost, RunUnwinds } from './workflow-unwind-lease.js'
import type { StepRpcArgs } from './workflow-wire.js'
import type { WorkflowRun } from './workflow.types.js'

/** What compensating needs from a workflow service besides its public API. */
export type CompensationService = {
  service: PikkuWorkflowService
  unwinds: RunUnwinds
  logger(): Logger | undefined
  /** Ask for the run to be looked at again after a wait, through the queue. */
  enqueueWake(runId: string): Promise<void>
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
  wake: async (runId) => {
    if (!getSingletonServices()?.queueService) return
    await deps.enqueueWake(runId)
  },
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
    drive: (runId) =>
      deps.unwinds.drive(
        createRunUnwindHost(deps, rpcService),
        runId,
        runId === leasedRunId,
        leaseLost
      ),
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
    runInline: (runId, step, retries, retryDelay, work) =>
      runInlineRetryLoop(
        service,
        step,
        retries,
        retryDelay,
        work,
        undefined,
        undefined,
        {
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
