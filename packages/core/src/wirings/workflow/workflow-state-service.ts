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
  WorkflowCancelledException,
  WorkflowNotFoundError,
} from './workflow-runner.js'
import type {
  PikkuWorkflowInteraction,
  StepState,
  WorkflowRun,
  WorkflowStatus,
  WorkflowOrchestratorService,
  WorkflowStepService,
} from './workflow.types.js'

/**
 * Abstract workflow state service
 * Implementations provide pluggable storage backends (SQLite, PostgreSQL, etc.)
 * Combines orchestration and step execution
 */
export abstract class WorkflowStateService
  implements WorkflowOrchestratorService, WorkflowStepService
{
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
   * Get workflow run history (all step attempts in chronological order)
   * @param runId - Run ID
   * @returns Array of step states with step names, ordered oldest to newest
   */
  abstract getRunHistory(
    runId: string
  ): Promise<Array<StepState & { stepName: string }>>

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
   * Insert initial step state (called by orchestrator)
   * Creates pending step in both workflow_step and workflow_step_history
   * @param runId - Run ID
   * @param stepName - Step cache key
   * @param rpcName - RPC function name
   * @param data - Step input data
   * @param stepOptions - Step options (retries, retryDelay)
   * @returns Step state with generated stepId
   */
  abstract insertStepState(
    runId: string,
    stepName: string,
    rpcName: string | null,
    data: any,
    stepOptions?: { retries?: number; retryDelay?: string | number }
  ): Promise<StepState>

  /**
   * Get step state by cache key (read-only)
   * @param runId - Run ID
   * @param stepName - Step cache key (from workflow.do)
   * @returns Step state with attemptCount calculated from history
   */
  abstract getStepState(runId: string, stepName: string): Promise<StepState>

  /**
   * Mark step as running
   * Updates both workflow_step and workflow_step_history
   * @param stepId - Step ID
   */
  abstract setStepRunning(stepId: string): Promise<void>

  /**
   * Mark step as scheduled (queued for execution)
   * Updates both workflow_step and workflow_step_history
   * @param stepId - Step ID
   */
  abstract setStepScheduled(stepId: string): Promise<void>

  /**
   * Store step result and mark as succeeded
   * Updates both workflow_step and workflow_step_history
   * @param stepId - Step ID
   * @param result - Step result
   */
  abstract setStepResult(stepId: string, result: any): Promise<void>

  /**
   * Store step error and mark as failed
   * Updates both workflow_step and workflow_step_history
   * @param stepId - Step ID
   * @param error - Error object
   */
  abstract setStepError(stepId: string, error: Error): Promise<void>

  /**
   * Create a new retry attempt for a failed step
   * Inserts new pending step in both workflow_step and workflow_step_history
   * Resets status to 'pending' with new stepId
   * Copies metadata (rpcName, data, retries, retryDelay) from failed attempt
   * @param failedStepId - Failed step ID to copy from
   * @returns New step state for the retry attempt
   */
  abstract createRetryAttempt(failedStepId: string): Promise<StepState>

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
   * Resume a paused workflow by triggering the orchestrator
   * @param runId - Run ID
   */
  async resumeWorkflow(runId: string): Promise<void> {
    this.singletonServices?.logger.info(
      `[WORKFLOW] Resuming workflow: runId=${runId}`
    )
    if (!this.singletonServices?.queueService) {
      throw new Error(
        'QueueService not configured. Remote workflows require a queue service.'
      )
    }
    await this.singletonServices.queueService.add(
      'pikku-workflow-orchestrator',
      { runId }
    )
    this.singletonServices?.logger.info(
      `[WORKFLOW] Enqueued orchestrator job: runId=${runId}`
    )
  }

  /**
   * Execute a workflow sleep step completion
   * Sets the step result to null and resumes the workflow
   * @param data - Sleeper input data
   */
  async executeWorkflowSleep(data: {
    runId: string
    stepId: string
  }): Promise<void> {
    await this.setStepResult(data.stepId, null)
    await this.resumeWorkflow(data.runId)
  }

  /**
   * Schedule orchestrator retry with delay
   * @param runId - Run ID
   * @param retryDelay - Delay in milliseconds or duration string (optional)
   */
  protected async scheduleOrchestratorRetry(
    runId: string,
    retryDelay?: number | string
  ): Promise<void> {
    if (!this.singletonServices?.queueService) {
      throw new Error(
        'QueueService not configured. Remote workflows require a queue service.'
      )
    }

    // Parse delay if it's a string
    const delayMs =
      typeof retryDelay === 'string'
        ? parseDurationString(retryDelay)
        : retryDelay

    // Add orchestrator job with delay option
    await this.singletonServices.queueService.add(
      'pikku-workflow-orchestrator',
      { runId },
      delayMs ? { delay: delayMs } : undefined
    )

    this.singletonServices?.logger.info(
      delayMs
        ? `[WORKFLOW] Scheduled orchestrator retry with ${delayMs}ms delay: runId=${runId}`
        : `[WORKFLOW] Enqueued orchestrator job: runId=${runId}`
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
    rpcService: any
  ): Promise<{ runId: string }> {
    const registrations = pikkuState('workflows', 'registrations')
    const workflow = registrations.get(name)

    if (!workflow) {
      throw new WorkflowNotFoundError(name)
    }

    // Create workflow run in state
    const runId = await this.createRun(name, input)

    // If queue service is available, use remote execution (queue-based)
    // Otherwise, execute directly (inline/synchronous)
    if (this.singletonServices?.queueService) {
      // Queue orchestrator to start the workflow
      await this.resumeWorkflow(runId)
    } else {
      // No queue service - execute directly via runWorkflowJob
      await this.runWorkflowJob(runId, rpcService)
    }

    return { runId }
  }

  public async runWorkflowJob(runId: string, rpcService: any): Promise<void> {
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
            const stepOptions = options

            // Check if step already exists
            let stepState: StepState
            try {
              stepState = await this.getStepState(runId, stepName)
            } catch (error: any) {
              // Step doesn't exist - create it
              stepState = await this.insertStepState(
                runId,
                stepName,
                rpcName,
                data,
                stepOptions
              )
            }

            if (stepState.status === 'succeeded') {
              // Return cached result
              return stepState.result
            }

            if (stepState.status === 'failed') {
              // Step failed with retries exhausted - throw error to fail the workflow
              const error = new Error(
                stepState.error?.message ||
                  `Step '${stepName}' failed after exhausting all retries`
              )
              // Preserve original error properties if available
              if (stepState.error) {
                Object.assign(error, stepState.error)
              }
              this.singletonServices?.logger.error(
                `[WORKFLOW] Step failed with retries exhausted: runId=${runId}, stepName=${stepName}, error=${error.message}`
              )
              throw error
            }

            if (stepState.status === 'scheduled') {
              // Step is already scheduled, pause workflow
              throw new WorkflowAsyncException(runId, stepName)
            }

            // Step is pending - schedule it
            await this.setStepScheduled(stepState.stepId)

            // Enqueue step worker
            if (this.singletonServices!.queueService) {
              // Map step retry options to queue job options
              const retries = stepOptions?.retries ?? 0
              const retryDelay = stepOptions?.retryDelay

              await this.singletonServices!.queueService.add(
                'pikku-workflow-step-worker',
                {
                  runId,
                  stepName,
                  rpcName,
                  data,
                },
                {
                  // attempts includes initial attempt, retries doesn't
                  attempts: retries + 1,
                  // Map retry delay to backoff
                  backoff:
                    typeof retryDelay === 'number'
                      ? { type: 'fixed', delay: retryDelay }
                      : retryDelay === 'exponential'
                        ? 'exponential'
                        : { type: 'fixed', delay: 0 },
                }
              )
            } else {
              // No queue service - execute locally
              const retries = stepOptions?.retries ?? 0
              const retryDelay = stepOptions?.retryDelay
              const attemptCount = stepState.attemptCount

              this.singletonServices?.logger.info(
                `[WORKFLOW RETRY] Executing step inline: runId=${runId}, stepId=${stepState.stepId}, attemptCount=${attemptCount}/${retries}`
              )

              try {
                const result = await rpcService.rpcWithInteraction(
                  rpcName,
                  data,
                  {
                    workflowStep: {
                      runId,
                      stepId: stepState.stepId,
                      attemptCount: stepState.attemptCount,
                    },
                  }
                )
                this.singletonServices?.logger.info(
                  `[WORKFLOW RETRY] Step succeeded on attempt ${attemptCount}: runId=${runId}, stepId=${stepState.stepId}`
                )
                await this.setStepResult(stepState.stepId, result)
                return result
              } catch (error: any) {
                this.singletonServices?.logger.error(
                  `[WORKFLOW RETRY] Step failed on attempt ${attemptCount}: runId=${runId}, stepId=${stepState.stepId}, error=${error.message}`
                )

                // Record the error (marks step as failed)
                await this.setStepError(stepState.stepId, error)

                // Check if we should retry
                if (attemptCount < retries) {
                  this.singletonServices?.logger.info(
                    `[WORKFLOW RETRY] Scheduling retry ${attemptCount + 1}/${retries}: runId=${runId}, stepId=${stepState.stepId}, delay=${retryDelay}`
                  )

                  // Create a new pending retry attempt (copies metadata from failed step)
                  await this.createRetryAttempt(stepState.stepId)

                  // Schedule orchestrator to retry after delay
                  await this.scheduleOrchestratorRetry(runId, retryDelay)

                  // Pause workflow - orchestrator will replay and pick up new attempt
                  throw new WorkflowAsyncException(runId, stepName)
                }

                this.singletonServices?.logger.error(
                  `[WORKFLOW RETRY] Retries exhausted (${attemptCount}/${retries}): runId=${runId}, stepId=${stepState.stepId}`
                )

                // No more retries, fail the workflow
                throw error
              }
            }

            // Pause workflow - step will callback when done
            throw new WorkflowAsyncException(runId, stepName)
          } else {
            // Inline form: workflow.do(stepName, fn, options?)
            const fn = rpcNameOrFn
            const stepOptions = dataOrOptions

            // Check if step already exists
            let stepState: StepState
            try {
              stepState = await this.getStepState(runId, stepName)
            } catch (error: any) {
              // Step doesn't exist - create it (inline, no RPC)
              stepState = await this.insertStepState(
                runId,
                stepName,
                null, // No RPC for inline steps
                null, // No data for inline steps
                stepOptions
              )
            }

            if (stepState.status === 'succeeded') {
              // Return cached result
              return stepState.result
            }

            // Execute inline function
            const retries = stepOptions?.retries ?? 0
            const retryDelay = stepOptions?.retryDelay
            const attemptCount = stepState.attemptCount

            try {
              const result = await fn()
              await this.setStepResult(stepState.stepId, result)
              return result
            } catch (error: any) {
              // Record the error (marks step as failed)
              await this.setStepError(stepState.stepId, error)

              // Check if we should retry
              if (attemptCount < retries) {
                // Create a new pending retry attempt (copies metadata from failed step)
                await this.createRetryAttempt(stepState.stepId)

                // Schedule orchestrator to retry after delay
                await this.scheduleOrchestratorRetry(runId, retryDelay)

                // Pause workflow - orchestrator will replay and pick up new attempt
                throw new WorkflowAsyncException(runId, stepName)
              }

              // No more retries, fail the workflow
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

          // Check if step already exists
          let stepState: StepState
          try {
            stepState = await this.getStepState(runId, stepName)
          } catch (error: any) {
            // Step doesn't exist - create it (sleep step, no RPC)
            stepState = await this.insertStepState(
              runId,
              stepName,
              '', // No RPC for sleep steps
              { duration }, // Store duration as data
              undefined // No retry options for sleep
            )
          }

          if (stepState.status === 'succeeded') {
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
              'pikkuWorkflowStepSleeper',
              {
                runId,
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

        // Implement workflow.cancel()
        cancel: async (reason?: string): Promise<never> => {
          // Update workflow run status to cancelled
          await this.updateRunStatus(runId, 'cancelled', undefined, {
            message: reason || 'Workflow cancelled by user',
            stack: '',
            code: 'WORKFLOW_CANCELLED',
          })

          // Throw cancellation exception to stop workflow execution
          throw new WorkflowCancelledException(runId, reason)
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

        // Check if it's a WorkflowCancelledException
        if (error instanceof WorkflowCancelledException) {
          // Workflow was cancelled - status already updated, just rethrow
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
   * Handles idempotency, RPC execution, result storage, retry logic, and orchestrator triggering
   */
  public async executeWorkflowStep(
    data: { runId: string; stepName: string; rpcName: string; data: any },
    rpcService: any
  ): Promise<void> {
    // Get step state
    let stepState = await this.getStepState(data.runId, data.stepName)

    // Idempotency - if already succeeded, resume orchestrator and return
    if (stepState.status === 'succeeded') {
      await this.resumeWorkflow(data.runId)
      return
    }

    // Log warning if already running (race condition)
    if (stepState.status === 'running') {
      this.singletonServices?.logger.warn(
        `[WORKFLOW] Step already running (race condition): runId=${data.runId}, stepId=${stepState.stepId}`
      )
      return
    }

    // If status is 'failed', this is a retry - create new attempt history
    if (stepState.status === 'failed') {
      this.singletonServices?.logger.info(
        `[WORKFLOW] Creating retry attempt for step: runId=${data.runId}, stepId=${stepState.stepId}, attemptCount=${stepState.attemptCount}`
      )
      stepState = await this.createRetryAttempt(stepState.stepId)
    }

    // Mark step as running (pending or failed status)
    await this.setStepRunning(stepState.stepId)

    try {
      // Execute RPC with workflow step context
      const result = await rpcService.rpcWithInteraction(
        data.rpcName,
        data.data,
        {
          workflowStep: {
            runId: data.runId,
            stepId: stepState.stepId,
            attemptCount: stepState.attemptCount,
          },
        }
      )

      // Store result and mark succeeded
      await this.setStepResult(stepState.stepId, result)

      // Resume orchestrator to continue workflow
      try {
        await this.resumeWorkflow(data.runId)
      } catch (resumeError: any) {
        this.singletonServices?.logger.error(
          `[WORKFLOW] Failed to resume workflow after step success: ${resumeError.message}`,
          resumeError
        )
        throw resumeError
      }
    } catch (error: any) {
      // Store error and mark failed
      await this.setStepError(stepState.stepId, error)

      const maxAttempts = (stepState.retries ?? 0) + 1
      const retriesExhausted = stepState.attemptCount >= maxAttempts

      if (retriesExhausted) {
        // No more retries - resume orchestrator to mark workflow as failed
        this.singletonServices?.logger.error(
          `[WORKFLOW] Retries exhausted (${stepState.attemptCount}/${maxAttempts}): runId=${data.runId}, stepId=${stepState.stepId}`
        )
        await this.resumeWorkflow(data.runId)
      } else {
        // Queue will retry - the next execution will see 'failed' status and create retry attempt at start
        this.singletonServices?.logger.info(
          `[WORKFLOW] Step failed, queue will retry (${stepState.attemptCount}/${maxAttempts}): runId=${data.runId}, stepId=${stepState.stepId}`
        )
      }

      // Always throw so queue knows the job failed and can retry if needed
      throw error
    }
  }

  /**
   * Orchestrate workflow execution (called by orchestrator)
   * Runs workflow job and handles async exceptions
   */
  public async orchestrateWorkflow(
    data: { runId: string },
    rpcService: any
  ): Promise<void> {
    try {
      // Run workflow job (replays with caching)
      await this.runWorkflowJob(data.runId, rpcService)
    } catch (error: any) {
      // WorkflowAsyncException is not an error - it means we scheduled a step
      if (error.name === 'WorkflowAsyncException') {
        // Workflow paused waiting for step completion
        return
      }

      // WorkflowCancelledException is not an error - workflow was explicitly cancelled
      if (error.name === 'WorkflowCancelledException') {
        // Workflow cancelled - status already updated
        return
      }

      // Real error - mark workflow as failed
      await this.updateRunStatus(data.runId, 'failed', undefined, {
        message: error.message,
        stack: error.stack,
        code: error.code,
      })

      throw error
    }
  }
}
