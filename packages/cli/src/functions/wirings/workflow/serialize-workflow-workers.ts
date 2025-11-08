/**
 * Generate queue workers and RPC functions for workflow steps and orchestrator
 */
export const serializeWorkflowWorkers = (pathToPikkuTypes: string) => {
  return `/**
 * Auto-generated workflow queue workers and RPC functions
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc, wireQueueWorker } from '${pathToPikkuTypes}'
import type { WorkflowStepInput, WorkflowOrchestratorInput, WorkflowSleeperInput } from '@pikku/core/workflow'

export const pikkuWorkflowWorker = pikkuSessionlessFunc<
  WorkflowStepInput,
  void
>({
  func: async ({ workflowState, rpc }, data) => {
    await workflowState.executeWorkflowStep(data, rpc.invoke.bind(rpc))
  },
  internal: true,
})

export const pikkuWorkflowOrchestrator = pikkuSessionlessFunc<
  WorkflowOrchestratorInput,
  void
>({
  func: async ({ workflowState, rpc }, data) => {
    await workflowState.orchestrateWorkflow(data, rpc.invoke.bind(rpc))
  },
  internal: true,
})

export const pikkuWorkflowSleeper = pikkuSessionlessFunc<
  WorkflowSleeperInput,
  void
>({
  func: async ({ workflowState }, data) => {
    await workflowState.executeWorkflowSleep(data)
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
