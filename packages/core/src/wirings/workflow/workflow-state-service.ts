import { runPikkuFunc } from '../../function/function-runner.js'
import { pikkuState } from '../../pikku-state.js'
import { parseDurationString } from '../../time-utils.js'
import {
  CoreSingletonServices,
  CreateSessionServices,
  PikkuWiringTypes,
  SerializedError,
} from '../../types/core.types.js'
import {
  WorkflowAsyncException,
  WorkflowNotFoundError,
} from './workflow-runner.js'
import type {
  PikkuWorkflowInteraction,
  StepState,
  WorkflowRun,
  WorkflowStatus,
} from './workflow.types.js'

/**
 * Abstract workflow state service
 * Implementations provide pluggable storage backends (SQLite, PostgreSQL, etc.)
 */
export abstract class WorkflowStateService {
  private singletonServices: CoreSingletonServices | undefined
  private createSessionServices: CreateSessionServices | undefined

  constructor() {}

  /**
   * Create a new workflow run
   * @param name - Workflow name
   * @param input - Input data for the workflow
   * @returns Run ID
   */
  abstract createRun(workflowName: string, input: any): Promise<string>

  /**
   * Get a workflow run by ID
   * @param id - Run ID
   * @returns Workflow run or null if not found
   */
  abstract getRun(id: string): Promise<WorkflowRun | null>

  /**
   * Update workflow run status
   * @param id - Run ID
   * @param status - New status
   */
  abstract updateRunStatus(
    id: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<void>

  /**
   * Get step state by cache key
   * @param runId - Run ID
   * @param stepName - Step cache key (from workflow.do)
   * @returns Step state
   */
  abstract getStepState(runId: string, stepName: string): Promise<StepState>

  /**
   * Mark step as scheduled (queued for execution)
   * @param stepId - Step ID
   */
  abstract setStepScheduled(stepId: string): Promise<void>

  /**
   * Store step result
   * @param stepId - Step ID
   * @param result - Step result
   */
  abstract setStepResult(stepId: string, result: any): Promise<void>

  /**
   * Store step error
   * @param stepId - Step ID
   * @param error - Error object
   */
  abstract setStepError(stepId: string, error: Error): Promise<void>

  /**
   * Execute function within a run lock to prevent concurrent modifications
   * @param id - Run ID
   * @param fn - Function to execute
   * @returns Function result
   */
  abstract withRunLock<T>(id: string, fn: () => Promise<T>): Promise<T>

  /**
   * Close any open connections
   */
  abstract close(): Promise<void>

  /**
   * Add orchestrator job to queue for remote workflow execution
   * @param workflowName - Workflow name
   * @param runId - Run ID
   */
  async addToQueue(workflowName: string, runId: string): Promise<void> {
    if (!this.singletonServices?.queueService) {
      throw new Error(
        'QueueService not configured. Remote workflows require a queue service.'
      )
    }
    await this.singletonServices.queueService.add(
      'pikku-workflow-orchestrator',
      { runId }
    )
  }

  public setServices(
    singletonServices: CoreSingletonServices,
    createSessionServices: CreateSessionServices
  ) {
    this.singletonServices = singletonServices
    this.createSessionServices = createSessionServices
  }

  /**
   * Start a new workflow run
   */
  public async startWorkflow<I>(
    name: string,
    input: I,
    rpcInvoke: Function
  ): Promise<{ runId: string }> {
    const registrations = pikkuState('workflows', 'registrations')
    const workflow = registrations.get(name)

    if (!workflow) {
      throw new WorkflowNotFoundError(name)
    }

    // Create workflow run in state
    const runId = await this.createRun(name, input)

    // If inline mode, execute directly via runWorkflowJob
    if (workflow.executionMode === 'inline') {
      await this.runWorkflowJob(runId, rpcInvoke)
    } else {
      await this.addToQueue(name, runId)
    }

    return { runId }
  }

  public async runWorkflowJob(
    runId: string,
    rpcInvoke: Function
  ): Promise<void> {
    if (!this.singletonServices) {
      throw new Error('Singleton services not set in WorkflowStateService')
    }

    // Get the run
    const run = await this.getRun(runId)
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
    await this.withRunLock(runId, async () => {
      // Create workflow interaction object
      const workflowInteraction: PikkuWorkflowInteraction = {
        workflowName: run.workflow,
        runId,
        getRun: async () => (await this.getRun(runId)) as WorkflowRun,

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
            const stepState = await this.getStepState(runId, stepName)

            if (stepState.status === 'done') {
              // Return cached result
              return stepState.result
            }

            if (stepState.status === 'scheduled') {
              // Step is already scheduled, pause workflow
              throw new WorkflowAsyncException(runId, stepName)
            }

            // Step is pending - schedule it
            await this.setStepScheduled(stepState.stepId)

            // Enqueue step worker
            if (this.singletonServices!.queueService) {
              await this.singletonServices!.queueService.add(
                'pikku-workflow-step-worker',
                {
                  runId,
                  stepName,
                  rpcName,
                  data,
                }
              )
            } else {
              // No queue service - execute inline (for inline workflow mode)
              // TODO: if its remote throw an error
              try {
                const result = await rpcInvoke(rpcName, data)
                await this.setStepResult(stepState.stepId, result)
                return result
              } catch (error: any) {
                await this.setStepError(stepState.stepId, error)
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
            const stepState = await this.getStepState(runId, stepName)

            if (stepState.status === 'done') {
              // Return cached result
              return stepState.result
            }

            // Execute function and cache result
            try {
              const result = await fn()
              await this.setStepResult(stepState.stepId, result)
              return result
            } catch (error: any) {
              await this.setStepError(stepState.stepId, error)
              throw error
            }
          }
        },

        // Implement workflow.sleep()
        sleep: async (stepName: string, duration: string | number) => {
          // Check if stepName is string
          if (typeof stepName !== 'string') {
            throw new Error('Step name must be a string')
          }

          // Check step state
          const stepState = await this.getStepState(runId, stepName)

          if (stepState.status === 'done') {
            // Sleep already completed, return immediately
            return
          }

          if (stepState.status === 'scheduled') {
            // Sleep is already scheduled, pause workflow
            throw new WorkflowAsyncException(runId, stepName)
          }

          // Step is pending - schedule it
          await this.setStepScheduled(stepState.stepId)

          // Check if we have queue service (remote mode) or inline mode
          if (this.singletonServices!.schedulerService) {
            // Remote mode - enqueue sleep worker with delay
            await this.singletonServices!.schedulerService.scheduleRPC(
              duration,
              'pikku-workflow-step-sleeper',
              {
                runId,
                stepName,
                stepId: stepState.stepId,
              }
            )
          } else {
            const durationMs =
              typeof duration === 'string'
                ? parseDurationString(duration)
                : duration
            // Inline mode - use setTimeout with actual duration
            await new Promise((resolve) => setTimeout(resolve, durationMs))
            await this.setStepResult(stepState.stepId, null)
            return
          }

          // Pause workflow - sleep will callback when done
          throw new WorkflowAsyncException(runId, stepName)
        },
      } as any

      // Get function metadata
      const meta = pikkuState('workflows', 'meta')
      const workflowMeta = meta[run.workflow]

      // Execute workflow function with workflow interaction
      try {
        const getAllServices = () => {
          let sessionServices = {}
          const interaction = { workflow: workflowInteraction }
          if (this.createSessionServices) {
            sessionServices = this.createSessionServices(
              this.singletonServices!,
              interaction,
              undefined
            )
          }
          return {
            ...this.singletonServices,
            ...sessionServices,
            ...interaction,
          } as any
        }
        const result = await runPikkuFunc(
          PikkuWiringTypes.workflow,
          workflowMeta.workflowName,
          workflowMeta.pikkuFuncName,
          {
            singletonServices: this.singletonServices!,
            interaction: { workflow: workflowInteraction },
            getAllServices,
            data: () => run.input,
          }
        )

        // Workflow completed successfully
        await this.updateRunStatus(runId, 'completed', result)
      } catch (error: any) {
        // Check if it's a WorkflowAsyncException
        if (error instanceof WorkflowAsyncException) {
          // Normal - workflow paused for step execution
          throw error
        }

        // Real error - mark as failed
        await this.updateRunStatus(runId, 'failed', undefined, {
          message: error.message,
          stack: error.stack,
          code: error.code,
        })

        throw error
      }
    })
  }

  /**
   * Execute a single workflow step (called by worker)
   * Handles idempotency, RPC execution, result storage, and orchestrator triggering
   */
  public async executeWorkflowStep(
    runId: string,
    stepName: string,
    rpcName: string,
    data: any,
    rpcInvoke: Function
  ): Promise<void> {
    // Idempotency check - skip if already done
    const stepState = await this.getStepState(runId, stepName)
    if (stepState.status === 'done') {
      return
    }

    try {
      // Execute RPC
      const result = await rpcInvoke(rpcName, data)

      // Store result
      await this.setStepResult(stepState.stepId, result)

      // Trigger orchestrator to continue workflow
      await this.addToQueue('pikku-workflow-orchestrator', runId)
    } catch (error: any) {
      // Store error
      await this.setStepError(stepState.stepId, error)

      // Mark workflow as failed
      await this.updateRunStatus(runId, 'failed', undefined, {
        message: error.message,
        stack: error.stack,
        code: error.code,
      })

      throw error
    }
  }

  /**
   * Orchestrate workflow execution (called by orchestrator)
   * Runs workflow job and handles async exceptions
   */
  public async orchestrateWorkflow(
    runId: string,
    rpcInvoke: Function
  ): Promise<void> {
    try {
      // Run workflow job (replays with caching)
      await this.runWorkflowJob(runId, rpcInvoke)
    } catch (error: any) {
      // WorkflowAsyncException is not an error - it means we scheduled a step
      if (error.name === 'WorkflowAsyncException') {
        // Workflow paused waiting for step completion
        return
      }

      // Real error - mark workflow as failed
      await this.updateRunStatus(runId, 'failed', undefined, {
        message: error.message,
        stack: error.stack,
        code: error.code,
      })

      throw error
    }
  }
}
