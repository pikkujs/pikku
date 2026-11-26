import { getDurationInMilliseconds } from '../../time-utils.js'
import { milestoneStepName } from './workflow-constants.js'
import { deriveInvocationId } from './workflow-invocation-id.js'
import { assertRunSessionStore } from './workflow-graph-session.js'
import { runTraceWire } from './workflow-run-trace.js'
import { stepSignalWire } from './workflow-step-signal.js'
import type { PikkuRPC } from '../rpc/rpc-types.js'
import type { CompensatingFor } from './dsl/workflow-dsl.types.js'
import type {
  PikkuWorkflowWire,
  StepState,
  WorkflowApprovalOptions,
  WorkflowRun,
} from './workflow.types.js'

/** The steps a wire drives, already bound to its run. */
export type WorkflowWireSteps = {
  getRun: () => Promise<WorkflowRun | null | undefined>
  verifyStepName: (stepName: string) => void
  rpcStep: (
    stepName: string,
    rpcName: string,
    data: any,
    options?: any
  ) => Promise<any>
  inlineStep: (stepName: string, fn: any, options?: any) => Promise<any>
  sleepStep: (stepName: string, ms: number) => Promise<void>
  suspendStep: (reason: string) => Promise<void>
  approvalStep: (
    reason: string,
    options: WorkflowApprovalOptions
  ) => Promise<any>
}

/** The `workflowStep` wire of one attempt of a step: its run, step, invocation id, the attempt it replays and its signal. */
export const buildWorkflowStepWire = (
  runId: string,
  stepName: string,
  stepState: StepState,
  signal?: AbortSignal
) => ({
  ...(signal ? { signal } : {}),
  runId,
  stepId: stepState.stepId,
  invocationId: deriveInvocationId(runId, stepName),
  attemptCount: stepState.attemptCount,
  fromInvocationId: stepState.fromStepName
    ? deriveInvocationId(runId, stepState.fromStepName)
    : undefined,
})

export const buildWorkflowWire = (
  name: string,
  runId: string,
  addonNamespace: string | null | undefined,
  steps: WorkflowWireSteps
): PikkuWorkflowWire => ({
  name,
  runId,
  getRun: async () => (await steps.getRun()) as WorkflowRun,

  do: async (
    stepName: string,
    rpcNameOrFn: any,
    dataOrOptions?: any,
    options?: any
  ) => {
    steps.verifyStepName(stepName)
    if (typeof rpcNameOrFn === 'string') {
      const resolvedRpcName =
        addonNamespace && !rpcNameOrFn.includes(':')
          ? `${addonNamespace}:${rpcNameOrFn}`
          : rpcNameOrFn
      return await steps.rpcStep(
        stepName,
        resolvedRpcName,
        dataOrOptions,
        options
      )
    }
    return await steps.inlineStep(stepName, rpcNameOrFn, dataOrOptions)
  },

  sleep: async (stepName: string, duration: string | number) => {
    steps.verifyStepName(stepName)
    await steps.sleepStep(stepName, getDurationInMilliseconds(duration))
  },

  suspend: async (reason: string) => {
    steps.verifyStepName(reason)
    await steps.suspendStep(reason)
  },

  milestone: async (name: string) => {
    steps.verifyStepName(name)
    await steps.inlineStep(milestoneStepName(name), async () => ({ name }))
  },

  approval: (async (reason: string, options: WorkflowApprovalOptions) => {
    steps.verifyStepName(reason)
    return await steps.approvalStep(reason, options)
  }) as PikkuWorkflowWire['approval'],
})

export type StepRpcArgs = [
  runId: string,
  stepName: string,
  stepState: StepState,
  rpcName: string,
  data: any,
  rpcService: PikkuRPC,
  knownRun?: WorkflowRun | null,
  compensatingFor?: CompensatingFor,
  signal?: AbortSignal,
]

/** Invoke a step's function as its run: on the run's trace and as its user. */
export const invokeStepRpc = async (
  service: {
    getRunIdentity: (runId: string) => Promise<WorkflowRun | null>
    createWorkflowWire: (
      name: string,
      runId: string,
      rpcService: PikkuRPC
    ) => PikkuWorkflowWire
  },
  ...[
    runId,
    stepName,
    stepState,
    rpcName,
    data,
    rpcService,
    knownRun,
    compensatingFor,
    signal,
  ]: StepRpcArgs
): Promise<any> => {
  const run = knownRun ?? (await service.getRunIdentity(runId))
  assertRunSessionStore(run?.wire?.pikkuUserId)
  return rpcService.rpcWithWire(rpcName, data, {
    ...runTraceWire(run?.wire?.traceparent, {
      runId,
      stepId: stepState.stepId,
    }),
    ...(run?.wire?.pikkuUserId ? { pikkuUserId: run.wire.pikkuUserId } : {}),
    ...(compensatingFor
      ? {
          workflow: {
            ...service.createWorkflowWire(
              run?.workflow ?? '',
              runId,
              rpcService
            ),
            compensatingFor,
          },
        }
      : {}),
    ...stepSignalWire(signal),
    workflowStep: buildWorkflowStepWire(runId, stepName, stepState, signal),
  })
}
