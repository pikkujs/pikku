import { getSingletonServices } from '../../pikku-state.js'
import type { PikkuRPC } from '../rpc/rpc-types.js'

export interface WorkflowStepInput {
  runId: string
  stepName: string
  rpcName: string
  data: unknown
  fromStepName?: string
}

export interface PikkuWorkflowOrchestratorInput {
  runId: string
}

export interface PikkuWorkflowSleeperInput {
  runId: string
  stepId: string
}

export async function pikkuWorkflowWorkerFunc(
  _services: Record<string, unknown>,
  { runId, stepName, rpcName, data }: WorkflowStepInput,
  { rpc }: { rpc: PikkuRPC }
): Promise<void> {
  const services = getSingletonServices()
  if (!services?.workflowService) {
    throw new Error(
      `Workflow service not initialized: cannot execute workflow step for runId ${runId}, stepName ${stepName}`
    )
  }
  await services.workflowService.executeWorkflowStep(
    runId,
    stepName,
    rpcName,
    data,
    rpc
  )
}

export async function pikkuWorkflowOrchestratorFunc(
  _services: Record<string, unknown>,
  { runId }: PikkuWorkflowOrchestratorInput,
  { rpc }: { rpc: PikkuRPC }
): Promise<void> {
  const services = getSingletonServices()
  if (!services?.workflowService) {
    throw new Error(
      `Workflow service not initialized: cannot orchestrate workflow for runId ${runId}`
    )
  }
  await services.workflowService.orchestrateWorkflow(runId, rpc)
}

export async function pikkuWorkflowSleeperFunc(
  _services: Record<string, unknown>,
  { runId, stepId }: PikkuWorkflowSleeperInput
): Promise<void> {
  const services = getSingletonServices()
  if (!services?.workflowService) {
    throw new Error(
      `Workflow service not initialized: cannot execute workflow sleep completed for runId ${runId}, stepId ${stepId}`
    )
  }
  await services.workflowService.executeWorkflowSleepCompleted(runId, stepId)
}
