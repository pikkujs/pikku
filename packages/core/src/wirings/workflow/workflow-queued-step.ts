import type { Logger } from '../../services/logger.js'
import { RPCNotFoundError } from '../rpc/rpc-runner.js'
import type { PikkuRPC } from '../rpc/rpc-types.js'
import {
  ChildWorkflowStartedException,
  executeGraphStep,
  stripInstanceOrdinal,
} from './graph/graph-runner.js'
import type { PikkuWorkflowService } from './pikku-workflow-service.js'
import { startQueuedChildStep } from './workflow-child-step.js'
import { compensatingForStep } from './workflow-compensation.js'
import {
  DEFAULT_STEP_RETRIES,
  forwardStepName,
  isCompensationStepName,
  isRunCancelled,
  isRunClosedToSteps,
} from './workflow-constants.js'
import { WorkflowStepTimeoutError } from './workflow-errors.js'
import { resolveWorkflowMeta } from './workflow-meta-resolver.js'
import { startStepLeaseRefresh } from './workflow-step-lease.js'
import { refuseStep } from './workflow-step-refusal.js'
import {
  runWithStepDeadline,
  type StepAttempt,
} from './workflow-step-signal.js'
import type { StepRpcArgs } from './workflow-wire.js'
import type { StepState } from './workflow.types.js'

/** What a step worker needs from the workflow service besides its public API. */
export type QueuedStepHost = {
  service: PikkuWorkflowService
  logger(): Logger | undefined
  leaseMs(rpcName: string): number
  claim(
    runId: string,
    stepName: string,
    rpcName: string,
    leaseMs: number
  ): Promise<StepState | null>
  openAttempt(
    runId: string,
    forward: boolean,
    leaseMs: number
  ): StepAttempt | undefined
  invoke(...args: StepRpcArgs): Promise<any>
}

const graphNodeIdFor = (
  stepName: string,
  nodes: Record<string, unknown> | undefined
): string | undefined => {
  if (!nodes) return undefined
  if (stepName in nodes) return stepName
  const base = stripInstanceOrdinal(stepName)
  return base !== stepName && base in nodes ? base : undefined
}

/** One delivery of a queued step: claim it, run it and record how it went. */
export const runQueuedStep = async (
  host: QueuedStepHost,
  runId: string,
  stepName: string,
  rpcName: string,
  data: any,
  rpcService: PikkuRPC
): Promise<void> => {
  const { service } = host
  const leaseMs = host.leaseMs(rpcName)
  const claimed = await host.claim(runId, stepName, rpcName, leaseMs)

  if (!claimed) {
    return
  }
  const stepState = claimed
  const attempt = stepState.attemptCount
  const forward = !isCompensationStepName(stepName)
  // Opened before the run is read below, so no cancel falls between the two.
  const stepAttempt = host.openAttempt(runId, forward, leaseMs)
  const stopLeaseRefresh = startStepLeaseRefresh(
    stepState.stepId,
    leaseMs,
    () => service.refreshStepLease(stepState.stepId, leaseMs, attempt),
    (reason) => stepAttempt?.abort(reason)
  )

  try {
    let result: any

    const run = await service.getRun(runId)
    if (!run) {
      throw new Error(`Workflow run not found: ${runId}`)
    }

    if (forward && isRunClosedToSteps(run.status)) {
      await refuseStep(service, runId, stepName, stepState, attempt)
      await service.resumeWorkflow(runId)
      return
    }

    const workflowMeta = resolveWorkflowMeta(run.workflow)?.meta
    const graphNodeId =
      workflowMeta?.source === 'graph'
        ? graphNodeIdFor(stepName, workflowMeta.nodes)
        : undefined
    if (graphNodeId) {
      result = await executeGraphStep(
        service,
        rpcService,
        runId,
        stepState.stepId,
        graphNodeId,
        workflowMeta!.nodes![graphNodeId].rpcName,
        data,
        run.workflow,
        { stepName, stepState, signal: stepAttempt?.signal }
      )
    } else {
      if (resolveWorkflowMeta(rpcName)) {
        result = await startQueuedChildStep(
          {
            startWorkflow: (...args) => service.startWorkflow(...args),
            setStepChildRunId: (...args) => service.setStepChildRunId(...args),
            getRun: (id) => service.getRun(id),
          },
          runId,
          stepState.stepId,
          rpcName,
          data,
          rpcService,
          run.wire
        )
      } else {
        const compensatingFor = forward
          ? undefined
          : compensatingForStep({
              ...(await service.getStepState(runId, forwardStepName(stepName))),
              stepName: forwardStepName(stepName),
            })
        result = await runWithStepDeadline(
          {
            runId,
            stepName,
            timeout: stepState.timeout,
            attempt: stepAttempt,
          },
          () =>
            host.invoke(
              runId,
              stepName,
              stepState,
              rpcName,
              data,
              rpcService,
              run,
              compensatingFor,
              stepAttempt?.signal
            )
        )
      }
    }

    await service.setStepResult(stepState.stepId, result, attempt)

    await service.resumeWorkflow(runId)
  } catch (error: any) {
    if (error instanceof ChildWorkflowStartedException) {
      // The step stays `running` with no worker on it, which is not the same
      // as abandoned: the child run is what completes it. Releasing the lease
      // says so, once no renewal in flight can undo it.
      await stopLeaseRefresh()
      await service.refreshStepLease(stepState.stepId, null, attempt)
      host
        .logger()
        ?.debug(
          `Workflow step '${stepName}': child workflow ${error.childRunId} started, waiting for completion`
        )
      return
    }

    // The abandoned function may never settle, so nothing else ends renewal.
    if (error instanceof WorkflowStepTimeoutError) {
      await stopLeaseRefresh()
    }

    await service.setStepError(stepState.stepId, error, attempt)

    // The run's own status decides, not the signal: a step may fail for a
    // cancel it has not been told about yet. Read once the failure is recorded,
    // so a cancel that lands while it is written still counts.
    const stopped = forward ? await service.getRun(runId) : null

    if (
      error instanceof RPCNotFoundError &&
      !(stopped && isRunClosedToSteps(stopped.status))
    ) {
      await service.updateRunStatus(runId, 'suspended', undefined, {
        message: `RPC '${rpcName}' not found. Deploy the missing function and resume.`,
        code: 'RPC_NOT_FOUND',
      })
      return
    }

    // Not rethrown, or the queue would deliver the step again.
    if (stopped && isRunCancelled(stopped)) {
      await service.resumeWorkflow(runId)
      return
    }

    const maxAttempts = (stepState.retries ?? DEFAULT_STEP_RETRIES) + 1
    const retriesExhausted = stepState.attemptCount >= maxAttempts

    if (retriesExhausted) {
      await service.resumeWorkflow(runId)
    }

    throw error
  } finally {
    stepAttempt?.close()
    await stopLeaseRefresh()
  }
}
