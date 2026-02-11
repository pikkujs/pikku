/**
 * Generate queue workers for workflow orchestration
 */
export const serializeWorkflowWorkers = (pathToPikkuTypes: string) => {
  return `/**
 * Workflow queue workers for orchestration
 */
import { pikkuSessionlessFunc, wireQueueWorker } from '${pathToPikkuTypes}'

export type WorkflowStepInput = {
  runId: string
  stepName: string
  rpcName: string
  data: any
}

export const pikkuWorkflowWorker = pikkuSessionlessFunc<WorkflowStepInput, void>({
  func: async ({ workflowService }, { runId, stepName, rpcName, data }, { rpc }) => {
    await workflowService!.executeWorkflowStep(runId, stepName, rpcName, data, rpc)
  }
})

export const pikkuWorkflowOrchestrator = pikkuSessionlessFunc<{ runId: string }, void>({
  func: async ({ workflowService }, { runId }, { rpc }) => {
    await workflowService!.orchestrateWorkflow(runId, rpc)
  }
})

export const pikkuWorkflowSleeper = pikkuSessionlessFunc<{ runId: string, stepId: string }, void>({
  func: async ({ workflowService }, { runId, stepId }) => {
    await workflowService!.executeWorkflowSleepCompleted(runId, stepId)
  },
  internal: true,
})

export const pikkuRemoteInternalRPC = pikkuSessionlessFunc<{ rpcName: string, data?: any }, any>({
  func: async (_services, { rpcName, data }, { rpc }) => {
    return await (rpc.invoke as any)(rpcName, data)
  },
  internal: true,
})

wireQueueWorker({ name: 'pikku-workflow-step-worker', func: pikkuWorkflowWorker })
wireQueueWorker({ name: 'pikku-workflow-orchestrator', func: pikkuWorkflowOrchestrator })
wireQueueWorker({ name: 'pikku-remote-internal-rpc', func: pikkuRemoteInternalRPC })
`
}
