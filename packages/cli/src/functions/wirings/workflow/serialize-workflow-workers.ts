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
  func: async ({ workflowService, rpc }, interaction, { runId, stepName, rpcName, data }) => {
    await workflowService!.executeWorkflowStep(runId, stepName, rpcName, data, rpc)
  }
})

export const pikkuWorkflowOrchestrator = pikkuSessionlessFunc<
  { runId: string },
  void
>({
  func: async ({ workflowService, rpc }, interaction, { runId }) => {
    await workflowService!.orchestrateWorkflow(runId, rpc)
  }
})

export const pikkuWorkflowSleeper = pikkuSessionlessFunc<
  { runId: string, stepId: string },
  void
>({
  func: async ({ workflowService }, interaction, { runId, stepId }) => {
    await workflowService!.executeWorkflowSleep(runId, stepId)
  },
  name: 'pikkuWorkflowStepSleeper',
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
`
}
