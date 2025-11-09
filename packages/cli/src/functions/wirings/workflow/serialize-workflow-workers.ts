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

export type WorkflowOrchestratorInput = {
  runId: string
}

export type WorkflowSleeperInput = {
  runId: string
  stepId: string
}

export const pikkuWorkflowWorker = pikkuSessionlessFunc<
  WorkflowStepInput,
  void
>({
  func: async ({ workflowService, rpc }, data) => {
    await workflowService!.executeWorkflowStep(data, rpc)
  },
  internal: true,
})

export const pikkuWorkflowOrchestrator = pikkuSessionlessFunc<
  WorkflowOrchestratorInput,
  void
>({
  func: async ({ workflowService, rpc }, data) => {
    await workflowService!.orchestrateWorkflow(data, rpc)
  },
  internal: true,
})

export const pikkuWorkflowSleeper = pikkuSessionlessFunc<
  WorkflowSleeperInput,
  void
>({
  func: async ({ workflowService }, data) => {
    await workflowService!.executeWorkflowSleep(data)
  },
  name: 'pikkuWorkflowStepSleeper',
  expose: true,
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
