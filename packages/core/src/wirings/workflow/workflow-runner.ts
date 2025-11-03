import type { CoreServices } from '../../types/core.types.js'
import type {
  CoreWorkflow,
  PikkuWorkflowInteraction,
} from './workflow.types.js'
import type { CorePikkuFunctionConfig } from '../../function/functions.types.js'
import type {
  WorkflowStateService,
  WorkflowRun,
} from './workflow-state.types.js'
import { PikkuError } from '../../errors/error-handler.js'
import { pikkuState } from '../../pikku-state.js'
import { addFunction, invokeFunction } from '../../function/function-runner.js'
import { WorkflowAsyncException } from './workflow.types.js'

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

  // If inline mode, execute directly via runWorkflowJob
  if (workflow.executionMode === 'inline') {
    try {
      await runWorkflowJob(runId, singletonServices)
      return { runId }
    } catch (error: any) {
      // Mark as failed
      await workflowState.updateRunStatus(runId, 'failed', undefined, {
        message: error.message,
        stack: error.stack,
        code: error.code,
      })
      throw error
    }
  }

  // If remote mode, enqueue orchestrator job
  const queueService = (singletonServices as any).queue
  if (!queueService) {
    throw new Error(
      'QueueService not configured. Remote workflows require a queue service.'
    )
  }

  // Schedule orchestrator job
  await queueService.add(`workflow-${name}-orchestrator`, { runId })

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

  const queueService = (singletonServices as any).queue

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

  // Use lock to prevent concurrent execution
  await workflowState.withRunLock(runId, async () => {
    // Create workflow interaction object
    const workflowInteraction: PikkuWorkflowInteraction = {
      workflowName: run.workflow,
      runId,
      getRun: async () => (await workflowState.getRun(runId)) as WorkflowRun,

      // Implement workflow.do() - RPC form
      do: async (
        stepName: string,
        rpcNameOrFn: any,
        dataOrOptions?: any,
        options?: any
      ) => {
        // Check if stepName is string
        if (typeof stepName !== 'string') {
          throw new Error('Step name must be a string')
        }

        // Differentiate between RPC and Inline forms
        const isRpcForm = typeof rpcNameOrFn === 'string'

        if (isRpcForm) {
          // RPC form: workflow.do(stepName, rpcName, data, options?)
          const rpcName = rpcNameOrFn
          const data = dataOrOptions
          const stepOptions = options

          // Check step state
          const stepState = await workflowState.getStepState(runId, stepName)

          if (stepState.status === 'done') {
            // Return cached result
            return stepState.result
          }

          if (stepState.status === 'scheduled') {
            // Step is already scheduled, pause workflow
            throw new WorkflowAsyncException(runId, stepName)
          }

          // Step is pending - schedule it
          await workflowState.setStepScheduled(runId, stepName)

          // Enqueue step worker
          if (queueService) {
            await queueService.add(`workflow-${run.workflow}-${stepName}`, {
              runId,
              stepName,
              rpcName,
              data,
            })
          } else {
            // No queue service - execute inline (for inline workflow mode)
            try {
              const result = await (singletonServices as any).rpc.invoke(
                rpcName,
                data
              )
              await workflowState.setStepResult(runId, stepName, result)
              return result
            } catch (error: any) {
              await workflowState.setStepError(runId, stepName, error)
              throw error
            }
          }

          // Pause workflow - step will callback when done
          throw new WorkflowAsyncException(runId, stepName)
        } else {
          // Inline form: workflow.do(stepName, fn, options?)
          const fn = rpcNameOrFn
          const stepOptions = dataOrOptions

          // Check step state
          const stepState = await workflowState.getStepState(runId, stepName)

          if (stepState.status === 'done') {
            // Return cached result
            return stepState.result
          }

          // Execute function and cache result
          try {
            const result = await fn()
            await workflowState.setStepResult(runId, stepName, result)
            return result
          } catch (error: any) {
            await workflowState.setStepError(runId, stepName, error)
            throw error
          }
        }
      },

      // Implement workflow.sleep()
      sleep: async (duration: string | number, options?: any) => {
        // TODO: Implement sleep functionality
        // For now, just wait
        const ms =
          typeof duration === 'string' ? parseDuration(duration) : duration
        await new Promise((resolve) => setTimeout(resolve, ms))
      },
    } as any

    // Get function metadata
    const meta = pikkuState('workflows', 'meta')
    const workflowMeta = meta[run.workflow]

    // Execute workflow function with workflow interaction
    try {
      const result = await invokeFunction(
        workflowMeta.pikkuFuncName,
        run.input,
        singletonServices,
        null as any, // No session for workflows
        { workflow: workflowInteraction } as any
      )

      // Workflow completed successfully
      await workflowState.updateRunStatus(runId, 'completed', result)
    } catch (error: any) {
      // Check if it's a WorkflowAsyncException
      if (error instanceof WorkflowAsyncException) {
        // Normal - workflow paused for step execution
        throw error
      }

      // Real error - mark as failed
      await workflowState.updateRunStatus(runId, 'failed', undefined, {
        message: error.message,
        stack: error.stack,
        code: error.code,
      })
      throw error
    }
  })
}

/**
 * Parse duration string to milliseconds
 * Supports: '1s', '5m', '1h', '2d'
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/)
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`)
  }

  const value = parseInt(match[1], 10)
  const unit = match[2]

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  }

  return value * multipliers[unit]
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
