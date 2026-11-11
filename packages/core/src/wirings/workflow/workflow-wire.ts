import { getDurationInMilliseconds } from '../../time-utils.js'
import { milestoneStepName } from './workflow-constants.js'
import type {
  PikkuWorkflowWire,
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
