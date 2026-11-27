import { RPCNotFoundError } from '../rpc/rpc-runner.js'
import type { PikkuRPC } from '../rpc/rpc-types.js'
import type { PikkuWorkflowService } from './pikku-workflow-service.js'
import { runInlineChildStep } from './workflow-child-step.js'
import { isRunClosedToSteps } from './workflow-constants.js'
import { resolveWorkflowMeta } from './workflow-meta-resolver.js'
import { resumeInlineStep } from './workflow-step-claim.js'
import { forwardStepHooks } from './workflow-step-refusal.js'
import {
  childStepRetryStore,
  runInlineRetryLoop,
} from './workflow-step-retry.js'
import { runWithStepDeadline } from './workflow-step-signal.js'
import type { StepRpcArgs } from './workflow-wire.js'
import type {
  StepState,
  WorkflowRpcStepOptions,
  WorkflowRun,
} from './workflow.types.js'

/** What running an RPC step in-process needs besides the service's public API. */
export type InlineRpcStepHost = {
  service: PikkuWorkflowService
  invoke(...args: StepRpcArgs): Promise<any>
  awaitChildEnd(childRunId: string): Promise<WorkflowRun>
}

type InlineRpcStep = {
  runId: string
  stepName: string
  stepState: StepState
  rpcName: string
  data: any
  rpcService: PikkuRPC
  options: WorkflowRpcStepOptions
  retries: number
  /** Aborts if the run lease the calling pass holds is lost. */
  leaseLost: AbortSignal | undefined
}

/** Run an RPC step of a workflow body in this process, retries and all. */
export const runInlineRpcStep = async (
  { service, invoke, awaitChildEnd }: InlineRpcStepHost,
  {
    runId,
    stepName,
    stepState,
    rpcName,
    data,
    rpcService,
    options,
    retries,
    leaseLost,
  }: InlineRpcStep
): Promise<any> => {
  const startsChildRun = !options.virtualUser && !!resolveWorkflowMeta(rpcName)
  // A stopped run gets no further attempt.
  if (stepState.status === 'failed') await service.throwIfRunStopped(runId)

  return runInlineRetryLoop(
    startsChildRun ? childStepRetryStore(service) : service,
    await resumeInlineStep(service, runId, stepName, stepState),
    retries,
    options.retryDelay,
    (currentStepState, attempt) =>
      runWithStepDeadline(
        { runId, stepName, timeout: options.timeout, attempt },
        async () => {
          if (options.virtualUser) {
            return options.virtualUser.invoke(rpcName, data)
          }
          if (startsChildRun) {
            return runInlineChildStep(
              {
                startWorkflow: (...args) => service.startWorkflow(...args),
                setStepChildRunId: (...args) =>
                  service.setStepChildRunId(...args),
                getRun: (id) => service.getRun(id),
                cancelRun: (...args) => service.cancelRun(...args),
                awaitRunEnd: awaitChildEnd,
              },
              runId,
              currentStepState.stepId,
              rpcName,
              data,
              rpcService,
              (await service.getRunIdentity(runId))?.wire
            )
          }

          return invoke(
            runId,
            stepName,
            currentStepState,
            rpcName,
            data,
            rpcService,
            undefined,
            undefined,
            attempt?.signal
          )
        }
      ),
    async (error) => {
      if (
        error instanceof RPCNotFoundError &&
        !isRunClosedToSteps((await service.getRun(runId))?.status ?? '')
      ) {
        await service.updateRunStatus(runId, 'suspended', undefined, {
          message: `RPC '${rpcName}' not found. Deploy the missing function and resume.`,
          code: 'RPC_NOT_FOUND',
        })
        throw error
      }
    },
    () => service.throwIfRunStopped(runId),
    forwardStepHooks(service, runId, stepName, leaseLost)
  )
}
