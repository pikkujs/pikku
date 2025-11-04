import type {
  CoreWorkflow,
  PikkuWorkflowInteraction,
} from './workflow.types.js'
import type { CorePikkuFunctionConfig } from '../../function/functions.types.js'
import type {
  WorkflowRun,
} from './workflow-state.types.js'
import { PikkuError } from '../../errors/error-handler.js'
import { pikkuState } from '../../pikku-state.js'
import { runPikkuFunc } from '../../function/function-runner.js'
import { WorkflowAsyncException } from './workflow.types.js'
import { CoreSingletonServices, PikkuWiringTypes } from '../../types/core.types.js'

/**
 * Error class for workflow not found
 */
class WorkflowNotFoundError extends PikkuError {
  constructor(name: string) {
    super(`Workflow not found: ${name}`)
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

  // Store workflow definition in state
  const registrations = pikkuState('workflows', 'registrations')
  registrations.set(workflow.name, workflow)
}

/**
 * Start a new workflow run
 */
export async function startWorkflow<I>(
  name: string,
  input: I,
  singletonServices: CoreSingletonServices,
  rpcInvoke: Function,
): Promise<{ runId: string }> {
  const { workflowState, queueService } = singletonServices
  const registrations = pikkuState('workflows', 'registrations')
  const workflow = registrations.get(name)

  if (!workflow) {
    throw new WorkflowNotFoundError(name)
  }

  if (!workflowState) {
    throw new Error('WorkflowState service not available')
  }

  if (!queueService && workflow.executionMode === 'remote') {
    throw new Error(
      'QueueService is required for remote workflow execution mode'
    )
  }

  // Create workflow run in state
  const runId = await workflowState.createRun(name, input)

  // If inline mode, execute directly via runWorkflowJob
  if (workflow.executionMode === 'inline') {
    try {
      await runWorkflowJob(runId, singletonServices, rpcInvoke)
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
  await workflowState.addToQueue(name, runId)

  return { runId }
}

/**
 * Run a workflow job (called by orchestrator queue worker)
 * This replays the workflow function and schedules pending steps
 */
export async function runWorkflowJob(
  runId: string,
  singletonServices: CoreSingletonServices,
  rpcInvoke: Function,
): Promise<void> {
  const { workflowState, queueService } = singletonServices

  if (!workflowState) {
    throw new Error('WorkflowState service not available')
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
          // options parameter available but not used in MVP

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
              const result = await rpcInvoke(
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
          // options parameter available in dataOrOptions but not used in MVP

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
      sleep: async (stepName: string, _duration: string) => {
        // Check if stepName is string
        if (typeof stepName !== 'string') {
          throw new Error('Step name must be a string')
        }

        // Check step state
        const stepState = await workflowState.getStepState(runId, stepName)

        if (stepState.status === 'done') {
          // Sleep already completed, return immediately
          return
        }

        // For now, just use a 5 second timeout (duration parameter ignored)
        await new Promise((resolve) => setTimeout(resolve, 5000))

        // Mark sleep as done
        await workflowState.setStepResult(runId, stepName, null)
      },
    } as any

    // Get function metadata
    const meta = pikkuState('workflows', 'meta')
    const workflowMeta = meta[run.workflow]

    // Execute workflow function with workflow interaction
    try {
      const result = await runPikkuFunc(PikkuWiringTypes.workflow, workflowMeta.workflowName, workflowMeta.pikkuFuncName, {
        singletonServices,
        interaction: { workflow: workflowInteraction},
        getAllServices: async (singletonServices) => ({
          ...singletonServices,
          workflow: workflowInteraction,
        } as any),
        data: () => run.input,
      })
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
