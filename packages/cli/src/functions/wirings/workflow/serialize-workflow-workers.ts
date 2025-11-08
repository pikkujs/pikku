/**
 * Generate queue workers and RPC functions for workflow steps and orchestrator
 */
export const serializeWorkflowWorkers = () => {
  return `/**
 * Auto-generated workflow queue workers and RPC functions
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc, wireQueueWorker } from '../../.pikku/pikku-types.gen.js'

export const pikkuWorkflowWorker = pikkuSessionlessFunc<
  { runId: string, stepName: string, rpcName: string, data: any },
  void
>({
  func: async ({ workflowState, rpc }, { runId, stepName, rpcName, data }) => {
    if (!workflowState) {
      throw new Error('WorkflowState service not available in step worker')
    }

    await workflowState.executeWorkflowStep(
      runId,
      stepName,
      rpcName,
      data,
      rpc.invoke.bind(rpc)
    )
  },
  internal: true,
})

export const pikkuWorkflowOrchestrator = pikkuSessionlessFunc<
  { runId: string },
  void
>({
  func: async ({ workflowState, rpc }, { runId }) => {
    if (!workflowState) {
      throw new Error('WorkflowState service not available in orchestrator')
    }

    await workflowState.orchestrateWorkflow(runId, rpc.invoke.bind(rpc))
  },
  internal: true,
})

export const pikkuWorkflowSleeper = pikkuSessionlessFunc<
  { runId: string, stepId: string },
  void
>({
  func: async ({ workflowState }, { runId, stepId }) => {
    if (!workflowState) {
      throw new Error('WorkflowState service not available in sleeper')
    }

    // Mark sleep as done
    await workflowState.setStepResult(stepId, null)

    // Trigger orchestrator to continue workflow
    await workflowState.resumeWorkflow(runId)
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
