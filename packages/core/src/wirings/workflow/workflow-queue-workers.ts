import { getSingletonServices } from '../../pikku-state.js'
import type { PikkuRPC } from '../rpc/rpc-types.js'

/** The job the workflow step-worker queue carries: one step of one run. */
export interface WorkflowStepInput {
  runId: string
  stepName: string
  rpcName: string
  data: unknown
  fromStepName?: string
}

/** An attempt of a step whose worker lost its lease. */
export interface WorkflowAwaitedStep {
  stepName: string
  attempt: number
}

/** The job the workflow orchestrator queue carries: a run to advance. */
export interface PikkuWorkflowOrchestratorInput {
  runId: string
  /** The run is woken again for as long as this attempt reads as leased. */
  awaitedStep?: WorkflowAwaitedStep
}

/** The job that wakes a run when a `sleep` step's duration has passed. */
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
  { runId, awaitedStep }: PikkuWorkflowOrchestratorInput,
  { rpc }: { rpc: PikkuRPC }
): Promise<void> {
  const services = getSingletonServices()
  if (!services?.workflowService) {
    throw new Error(
      `Workflow service not initialized: cannot orchestrate workflow for runId ${runId}`
    )
  }
  await services.workflowService.orchestrateWorkflow(runId, rpc, awaitedStep)
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
