/**
 * Generate queue workers for workflow orchestration
 */
export const serializeWorkflowWorkers = (pathToPikkuTypes: string) => {
  return `/**
 * Workflow queue workers
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc, wireQueueWorker } from '${pathToPikkuTypes}'
import { MissingServiceError } from '@pikku/core/errors'

function assertWorkflowService(workflowService: unknown): asserts workflowService {
  if (!workflowService) throw new MissingServiceError('workflowService is required')
}

export type WorkflowStepInput = {
  runId: string
  stepName: string
  rpcName: string
  data: any
}

export const pikkuWorkflowWorker = pikkuSessionlessFunc<WorkflowStepInput, void>({
  func: async ({ workflowService }, { runId, stepName, rpcName, data }, { rpc }) => {
    assertWorkflowService(workflowService)
    await workflowService.executeWorkflowStep(runId, stepName, rpcName, data, rpc)
  }
})

export const pikkuWorkflowOrchestrator = pikkuSessionlessFunc<{ runId: string }, void>({
  func: async ({ workflowService }, { runId }, { rpc }) => {
    assertWorkflowService(workflowService)
    await workflowService.orchestrateWorkflow(runId, rpc)
  }
})

export const pikkuWorkflowSleeper = pikkuSessionlessFunc<{ runId: string, stepId: string }, void>({
  func: async ({ workflowService }, { runId, stepId }) => {
    assertWorkflowService(workflowService)
    await workflowService.executeWorkflowSleepCompleted(runId, stepId)
  },
  remote: true,
})

wireQueueWorker({ name: 'pikku-workflow-step-worker', func: pikkuWorkflowWorker })
wireQueueWorker({ name: 'pikku-workflow-orchestrator', func: pikkuWorkflowOrchestrator })
`
}
