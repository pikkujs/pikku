/**
 * Queue worker functions for workflow orchestration.
 *
 * These are registered as queue consumers by the codegen pipeline
 * (injected into queue meta when workflows exist). They provide
 * the runtime implementations that process queued workflow jobs.
 */

import { getSingletonServices } from '../../pikku-state.js'
import type { PikkuRPC } from '../rpc/rpc-types.js'

export interface WorkflowStepInput {
  runId: string
  stepName: string
  rpcName: string
  data: unknown
}

export interface PikkuWorkflowOrchestratorInput {
  runId: string
}

export interface PikkuWorkflowSleeperInput {
  runId: string
  stepId: string
}

/**
 * Step worker — executes individual workflow steps dispatched via queue.
 * The orchestrator queues steps here when they're async (not inline).
 */
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

/**
 * Orchestrator — resumes workflow execution after an async step completes.
 * Called when a step worker finishes and the workflow needs to continue.
 */
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

/**
 * Sleeper — wakes a workflow after a workflow.sleep() duration expires.
 * Triggered by a delayed queue message or scheduler callback.
 */
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
