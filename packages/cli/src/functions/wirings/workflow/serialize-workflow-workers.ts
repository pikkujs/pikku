/**
 * Generate queue workers and RPC functions for workflow steps and orchestrator
 */
export const serializeWorkflowWorkers = (pathToPikkuTypes: string) => {
  return `/**
 * Auto-generated workflow queue workers and RPC functions
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc, wireQueueWorker } from '${pathToPikkuTypes}'

/**
 * Worker input types for generated queue workers
 */
export type WorkflowStepInput = {
  runId: string
  stepName: string
  rpcName: string
  data: any
}

export const pikkuWorkflowWorker = pikkuSessionlessFunc<
  WorkflowStepInput,
  void
>({
  func: async ({ workflowService }, { runId, stepName, rpcName, data }, { rpc }) => {
    await workflowService!.executeWorkflowStep(runId, stepName, rpcName, data, rpc)
  }
})

export const pikkuWorkflowOrchestrator = pikkuSessionlessFunc<
  { runId: string },
  void
>({
  func: async ({ workflowService }, { runId }, { rpc }) => {
    await workflowService!.orchestrateWorkflow(runId, rpc)
  }
})

export const pikkuWorkflowSleeper = pikkuSessionlessFunc<
  { runId: string, stepId: string },
  void
>({
  func: async ({ workflowService }, { runId, stepId }) => {
    await workflowService!.executeWorkflowSleep(runId, stepId)
  },
  name: 'pikkuWorkflowStepSleeper',
  internal: true,
})

/**
 * Generic remote RPC worker that invokes any internal RPC by name
 * This is used for executing internal RPCs via a queue (e.g., delayed workflow sleep steps)
 *
 * TODO: Security risk - this allows any RPC to be invoked by name. Should validate
 * that rpcName is in an allowlist of permitted internal RPCs to prevent unauthorized access.
 */
export const pikkuRemoteInternalRPC = pikkuSessionlessFunc<
  { rpcName: string, data?: any },
  any
>({
  func: async (_services, { rpcName, data }, { rpc }) => {
    return await (rpc.invoke as any)(rpcName, data)
  },
  internal: true,
})

wireQueueWorker({
  queueName: 'pikku-workflow-step-worker',
  func: pikkuWorkflowWorker,
})

wireQueueWorker({
  queueName: 'pikku-workflow-orchestrator',
  func: pikkuWorkflowOrchestrator,
})

wireQueueWorker({
  queueName: 'pikku-remote-internal-rpc',
  func: pikkuRemoteInternalRPC,
})
`
}
