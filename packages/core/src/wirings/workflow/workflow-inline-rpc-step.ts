import { RPCNotFoundError } from '../rpc/rpc-runner.js'
import type { PikkuRPC } from '../rpc/rpc-types.js'
import type { PikkuWorkflowService } from './pikku-workflow-service.js'
import { runInlineChildStep } from './workflow-child-step.js'
import { isRunClosedToSteps } from './workflow-constants.js'
import { WorkflowAsyncException } from './workflow-errors.js'
import { resolveWorkflowMeta } from './workflow-meta-resolver.js'
import type { OpenSteps } from './workflow-open-steps.js'
import { stepDispatchTarget } from './workflow-queue-routing.js'
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

/**
 * Whether a `failed` step has retries this pass is to spend. A queued step's are
 * the queue's. One run inline with retries left lost its pass before the next
 * attempt was created.
 */
export const retriesFailedRpcStep = async (
  host: { isInline(runId: string): Promise<boolean> },
  runId: string,
  stepName: string,
  {
    stepState,
    retries,
    rpcName,
    virtualUser,
  }: {
    stepState: StepState
    retries: number
    rpcName: string
    virtualUser: WorkflowRpcStepOptions['virtualUser']
  }
): Promise<boolean> =>
  stepState.attemptCount <= retries &&
  (!!virtualUser ||
    (await stepDispatchTarget(rpcName, stepName, () =>
      host.isInline(runId)
    )) === 'inline')

/** `runInlineRpcStep`, with the step counted as open in this process. */
export const holdInlineRpcStep = async (
  { openSteps, ...host }: InlineRpcStepHost & { openSteps: OpenSteps },
  step: InlineRpcStep
): Promise<any> => {
  const { runId, stepName, stepState, leaseLost } = step
  // Without a run lease, a pass may be between two attempts of this step.
  if (
    stepState.status === 'failed' &&
    !leaseLost &&
    openSteps.has(runId, stepName)
  ) {
    throw new WorkflowAsyncException(runId, stepName)
  }
  return openSteps.hold(runId, stepName, () => runInlineRpcStep(host, step))
}

/** Run an RPC step of a workflow body in this process, retries and all. */
const runInlineRpcStep = async (
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
