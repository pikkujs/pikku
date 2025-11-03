import type { CoreServices } from '../../types/core.types.js'
import type { CoreWorkflow } from './workflow.types.js'
import type { CorePikkuFunctionConfig } from '../../function/functions.types.js'
import type {
  WorkflowStateService,
  WorkflowRun,
} from './workflow-state.types.js'
import { PikkuError } from '../../errors/error-handler.js'
import { pikkuState } from '../../pikku-state.js'
import { addFunction } from '../../function/function-runner.js'

/**
 * Error class for workflow not found
 */
class WorkflowNotFoundError extends PikkuError {
  constructor(name: string) {
    super(`Workflow not found: ${name}`)
  }
}

/**
 * Error class for workflow state service not configured
 */
class WorkflowStateServiceNotConfiguredError extends PikkuError {
  constructor() {
    super(
      'WorkflowStateService not configured. Please provide a workflowState service in your service factory.'
    )
  }
}

/**
 * Register a workflow with the system
 */
export const wireWorkflow = <
  PikkuFunctionConfig extends CorePikkuFunctionConfig<
    any,
    any,
    any
  > = CorePikkuFunctionConfig<any, any, any>,
>(
  workflow: CoreWorkflow<PikkuFunctionConfig>
) => {
  // Get workflow metadata from inspector
  const meta = pikkuState('workflows', 'meta')
  const workflowMeta = meta[workflow.name]
  if (!workflowMeta) {
    throw new Error(
      `Workflow metadata not found for '${workflow.name}'. Make sure to run the CLI to generate metadata.`
    )
  }

  // Register the function with pikku
  addFunction(workflowMeta.pikkuFuncName, {
    func: workflow.func.func,
    auth: workflow.func.auth,
    permissions: workflow.func.permissions,
    middleware: workflow.func.middleware as any,
    tags: workflow.func.tags,
    docs: workflow.func.docs as any,
  })

  // Store workflow definition in state
  const registrations = pikkuState('workflows', 'registrations')
  registrations.set(workflow.name, workflow)
}

/**
 * Get all registered workflows
 */
export function getWorkflows(): Map<string, CoreWorkflow> {
  return pikkuState('workflows', 'registrations')
}

/**
 * Start a new workflow run
 */
export async function startWorkflow<I>(
  name: string,
  input: I,
  singletonServices: CoreServices
): Promise<{ runId: string }> {
  const registrations = pikkuState('workflows', 'registrations')
  const workflow = registrations.get(name)

  if (!workflow) {
    throw new WorkflowNotFoundError(name)
  }

  const workflowState = (singletonServices as any)
    .workflowState as WorkflowStateService
  if (!workflowState) {
    throw new WorkflowStateServiceNotConfiguredError()
  }

  // Get workflow metadata
  const meta = pikkuState('workflows', 'meta')
  const workflowMeta = meta[name]

  // Create workflow run in state
  const runId = await workflowState.createRun(workflowMeta.meta, input)

  // If inline mode, execute directly (TODO: implement execution logic)
  if (workflow.executionMode === 'inline') {
    // For MVP, just return the runId
    // Full implementation will execute the workflow function directly
    return { runId }
  }

  // If remote mode, enqueue orchestrator job (TODO: implement queue scheduling)
  // For MVP, just return the runId
  // Full implementation will:
  // 1. Get queue service from singletonServices
  // 2. Schedule orchestrator job: queue.add(`workflow-${name}-orchestrator`, { runId })

  return { runId }
}

/**
 * Run a workflow job (called by orchestrator queue worker)
 * This replays the workflow function and schedules pending steps
 */
export async function runWorkflowJob(
  runId: string,
  singletonServices: CoreServices
): Promise<void> {
  const workflowState = (singletonServices as any)
    .workflowState as WorkflowStateService
  if (!workflowState) {
    throw new WorkflowStateServiceNotConfiguredError()
  }

  // Get the run
  const run = await workflowState.getRun(runId)
  if (!run) {
    throw new Error(`Workflow run not found: ${runId}`)
  }

  // Get workflow registration
  const registrations = pikkuState('workflows', 'registrations')
  const workflow = registrations.get(run.workflow)
  if (!workflow) {
    throw new WorkflowNotFoundError(run.workflow)
  }

  // TODO: Implement replay logic
  // For MVP, this is a placeholder
  // Full implementation will:
  // 1. Create workflow interaction object with workflow.do() implementation
  // 2. Execute the workflow function with input
  // 3. Handle WorkflowAsyncException (step needs to be scheduled)
  // 4. Mark workflow as completed if function finishes
}

/**
 * Get a workflow run by ID
 */
export async function getWorkflowRun(
  runId: string,
  singletonServices: CoreServices
): Promise<WorkflowRun | null> {
  const workflowState = (singletonServices as any)
    .workflowState as WorkflowStateService
  if (!workflowState) {
    throw new WorkflowStateServiceNotConfiguredError()
  }

  return workflowState.getRun(runId)
}

/**
 * Cancel a running workflow
 */
export async function cancelWorkflowRun(
  runId: string,
  singletonServices: CoreServices
): Promise<void> {
  const workflowState = (singletonServices as any)
    .workflowState as WorkflowStateService
  if (!workflowState) {
    throw new WorkflowStateServiceNotConfiguredError()
  }

  // TODO: Implement cancellation logic
  // For MVP, this is a placeholder
  // Full implementation will:
  // 1. Mark run as failed with cancelled status
  // 2. Clean up any pending queue jobs
}

/**
 * Remove a workflow from the registry
 */
export async function removeWorkflow(name: string): Promise<void> {
  const registrations = pikkuState('workflows', 'registrations')
  const registration = registrations.get(name)

  if (!registration) {
    throw new WorkflowNotFoundError(name)
  }

  registrations.delete(name)
}
