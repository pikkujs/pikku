/**
 * Generate queue workers for workflow steps and orchestrator
 */
export const serializeWorkflowWorkers = () => {
  return `/**
 * Auto-generated workflow queue workers
 *
 * This file contains:
 * - RPC step workers (one per RPC form step)
 * - Orchestrator workers (one per workflow)
 *
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
  }
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
  }
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
    await workflowState.addToQueue('pikku-workflow-orchestrator', runId)
  },
  name: 'pikku-workflow-step-sleeper'
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
  queueName: 'pikku-workflow-step-sleeper',
  func: pikkuWorkflowSleeper,
})
`
}
