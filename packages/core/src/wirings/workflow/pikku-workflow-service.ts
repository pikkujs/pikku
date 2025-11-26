import { runPikkuFunc } from '../../function/function-runner.js'
import { pikkuState } from '../../pikku-state.js'
import { getDurationInMilliseconds } from '../../time-utils.js'
import {
  CoreConfig,
  CoreSingletonServices,
  CreateWireServices,
  PikkuWire,
  SerializedError,
} from '../../types/core.types.js'
import { QueueService } from '../queue/queue.types.js'
import {
  WorkflowAsyncException,
  WorkflowCancelledException,
  WorkflowNotFoundError,
  WorkflowRunNotFound,
} from './workflow-runner.js'
import type {
  PikkuWorkflowWire,
  StepState,
  WorkflowRun,
  WorkflowStatus,
  WorkflowService,
  WorkflowServiceConfig,
  WorkflowStepOptions,
} from './workflow.types.js'
import type {
  WorkflowGraph,
  WorkflowGraphRunState,
  WorkflowGraphExecutionOptions,
} from './workflow-graph.types.js'
import { executeWorkflowGraph } from './workflow-graph-scheduler.js'

export class WorkflowServiceNotInitialized extends Error {}
export class WorkflowStepNameNotString extends Error {
  constructor(stepName: any) {
    super(`Workflow step name must be a string. Received: ${typeof stepName}`)
  }
}

/**
 * Abstract workflow state service
 * Implementations provide pluggable storage backends (SQLite, PostgreSQL, etc.)
 * Combines orchestration and step execution
 */
export abstract class PikkuWorkflowService implements WorkflowService {
  private config: WorkflowServiceConfig | undefined
  private singletonServices: CoreSingletonServices | undefined
  private createWireServices: CreateWireServices | undefined

  constructor() {}

  public setServices(
    singletonServices: CoreSingletonServices,
    createWireServices: CreateWireServices,
    { workflow }: CoreConfig
  ) {
    this.singletonServices = singletonServices
    this.createWireServices = createWireServices
    this.config = {
      retries: workflow?.retries ?? 0,
      retryDelay: workflow?.retryDelay ?? 0,
      orchestratorQueueName:
        workflow?.orchestratorQueueName ?? 'pikku-workflow-orchestrator',
      stepWorkerQueueName:
        workflow?.stepWorkerQueueName ?? 'pikku-workflow-step-worker',
      sleeperRPCName: workflow?.sleeperRPCName ?? 'pikkuWorkflowStepSleeper',
    }
  }

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
    stepOptions?: WorkflowStepOptions
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
  abstract createRetryAttempt(
    failedStepId: string,
    status: 'pending' | 'running'
  ): Promise<StepState>

  /**
   * Execute function within a run lock to prevent concurrent modifications
   * @param id - Run ID
   * @param fn - Function to execute
   * @returns Function result
   */
  abstract withRunLock<T>(id: string, fn: () => Promise<T>): Promise<T>

  /**
   * Execute function within a step lock to prevent concurrent step execution
   * @param runId - Run ID
   * @param stepName - Step name
   * @param fn - Function to execute
   * @returns Function result
   */
  abstract withStepLock<T>(
    runId: string,
    stepName: string,
    fn: () => Promise<T>
  ): Promise<T>

  /**
   * Close any open connections
   */
  abstract close(): Promise<void>

  // ============================================================================
  // Workflow Lifecycle Methods
  // ============================================================================

  /**
   * Resume a paused workflow by triggering the orchestrator
   * @param runId - Run ID
   */
  public async resumeWorkflow(runId: string): Promise<void> {
    const queueService = this.verifyQueueService()
    await queueService.add(this.getConfig().orchestratorQueueName, { runId })
  }

  /**
   * Execute a workflow sleep step completion
   * Sets the step result to null and resumes the workflow
   * @param data - Sleeper input data
   */
  public async executeWorkflowSleep(
    runId: string,
    stepId: string
  ): Promise<void> {
    await this.setStepResult(stepId, null)
    await this.resumeWorkflow(runId)
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
    const queueService = this.verifyQueueService()
    await queueService.add(
      this.getConfig().orchestratorQueueName,
      { runId },
      retryDelay ? { delay: getDurationInMilliseconds(retryDelay) } : undefined
    )
  }

  /**
   * Start a new workflow run
   */
  public async startWorkflow<I>(
    name: string,
    input: I,
    rpcService: any
  ): Promise<{ runId: string }> {
    const registrations = pikkuState(null, 'workflows', 'registrations')
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
    const run = await this.getRun(runId)
    if (!run) {
      throw new WorkflowRunNotFound(runId)
    }

    const registrations = pikkuState(null, 'workflows', 'registrations')
    const workflow = registrations.get(run.workflow)
    if (!workflow) {
      throw new WorkflowNotFoundError(run.workflow)
    }

    await this.withRunLock(runId, async () => {
      const meta = pikkuState(null, 'workflows', 'meta')
      const workflowMeta = meta[run.workflow]

      const workflowWire = this.createWorkflowWire(
        run.workflow,
        runId,
        rpcService
      )
      const wire: PikkuWire = { workflow: workflowWire }
      try {
        const result = await runPikkuFunc(
          'workflow',
          workflowMeta.workflowName,
          workflowMeta.pikkuFuncName,
          {
            singletonServices: this.singletonServices!,
            wire,
            createWireServices: this.createWireServices,
            data: () => run.input,
          }
        )

        await this.updateRunStatus(runId, 'completed', result)
      } catch (error: any) {
        if (error instanceof WorkflowAsyncException) {
          // Normal - workflow paused for step execution
          throw error
        }

        // Check if it's a WorkflowCancelledException
        if (error instanceof WorkflowCancelledException) {
          // Workflow was cancelled - status already updated, just rethrow
          throw error
        }

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
    runId: string,
    stepName: string,
    rpcName: string,
    data: any,
    rpcService: any
  ): Promise<void> {
    // Use step-level lock to prevent concurrent execution of same step
    await this.withStepLock(runId, stepName, async () => {
      // Get step state
      let stepState = await this.getStepState(runId, stepName)

      // Idempotency - if already succeeded, resume orchestrator and return
      if (stepState.status === 'succeeded') {
        await this.resumeWorkflow(runId)
        return
      }

      // Log warning if already running (race condition)
      if (stepState.status === 'running') {
        return
      }

      // If status is 'failed', this is a retry - create new attempt history
      if (stepState.status === 'failed') {
        stepState = await this.createRetryAttempt(stepState.stepId, 'running')
      }

      if (stepState.status !== 'pending') {
        // Mark step as running (pending or failed status)
        await this.setStepRunning(stepState.stepId)
      }

      try {
        // Execute RPC with workflow step context
        const result = await rpcService.rpcWithWire(rpcName, data, {
          workflowStep: {
            runId,
            stepId: stepState.stepId,
            attemptCount: stepState.attemptCount,
          },
        })

        // Store result and mark succeeded
        await this.setStepResult(stepState.stepId, result)

        // Resume orchestrator to continue workflow
        try {
          await this.resumeWorkflow(runId)
        } catch (resumeError: any) {
          throw resumeError
        }
      } catch (error: any) {
        // Store error and mark failed
        await this.setStepError(stepState.stepId, error)

        const maxAttempts = (stepState.retries ?? 0) + 1
        const retriesExhausted = stepState.attemptCount >= maxAttempts

        if (retriesExhausted) {
          // No more retries - resume orchestrator to mark workflow as failed
          await this.resumeWorkflow(runId)
        }

        // Always throw so queue knows the job failed and can retry if needed
        throw error
      }
    })
  }

  /**
   * Orchestrate workflow execution (called by orchestrator)
   * Runs workflow job and handles async exceptions
   */
  public async orchestrateWorkflow(
    runId: string,
    rpcService: any
  ): Promise<void> {
    try {
      // Run workflow job (replays with caching)
      await this.runWorkflowJob(runId, rpcService)
    } catch (error: any) {
      if (
        error.name === 'WorkflowAsyncException' ||
        error.name === 'WorkflowCancelledException'
      ) {
        return
      }

      await this.updateRunStatus(runId, 'failed', undefined, {
        message: error.message,
        stack: error.stack,
        code: error.code,
      })

      throw error
    }
  }

  // ============================================================================
  // WorkflowGraph Execution
  // ============================================================================

  /**
   * Execute a workflow graph
   *
   * @param graph - The workflow graph definition
   * @param input - Input data for the workflow
   * @param rpcService - RPC service for executing nodes
   * @param options - Execution options
   * @returns The workflow graph run state
   */
  public async executeGraph(
    graph: WorkflowGraph,
    input: unknown,
    rpcService: any,
    options?: WorkflowGraphExecutionOptions
  ): Promise<WorkflowGraphRunState> {
    // Create a unique run ID for tracking
    const runId = `graph-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    try {
      const result = await executeWorkflowGraph(
        graph,
        runId,
        input,
        rpcService,
        options
      )
      return result
    } catch (error: any) {
      // Return failed state
      return {
        runId,
        graph,
        iterations: new Map(),
        completed: new Map(),
        executing: new Set(),
        status: 'failed',
        input,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }

  /**
   * Start a workflow graph run (creates a run record for tracking)
   *
   * @param name - Name for this workflow graph run
   * @param graph - The workflow graph definition
   * @param input - Input data for the workflow
   * @param rpcService - RPC service for executing nodes
   * @param options - Execution options
   * @returns Run ID and execution promise
   */
  public async startGraphWorkflow(
    name: string,
    graph: WorkflowGraph,
    input: unknown,
    rpcService: any,
    options?: WorkflowGraphExecutionOptions
  ): Promise<{ runId: string; result: Promise<WorkflowGraphRunState> }> {
    // Create workflow run in state
    const runId = await this.createRun(name, { graph, input })

    // Execute the graph
    const resultPromise = this.executeGraph(graph, input, rpcService, options)
      .then(async (result) => {
        // Update run status on completion
        if (result.status === 'completed') {
          await this.updateRunStatus(runId, 'completed', result.output)
        } else if (result.status === 'failed') {
          await this.updateRunStatus(runId, 'failed', undefined, {
            message: result.error?.message || 'Graph execution failed',
            stack: result.error?.stack,
          })
        }
        return result
      })
      .catch(async (error) => {
        await this.updateRunStatus(runId, 'failed', undefined, {
          message: error.message,
          stack: error.stack,
        })
        throw error
      })

    return { runId, result: resultPromise }
  }

  private verifyQueueService(): QueueService {
    if (!this.singletonServices?.queueService) {
      throw new Error(
        'QueueService not configured. Remote workflows require a queue service.'
      )
    }

    return this.singletonServices!.queueService
  }

  private async rpcStep(
    runId: string,
    stepName: string,
    rpcName: string,
    data: any,
    rpcService: any,
    stepOptions?: WorkflowStepOptions
  ): Promise<any> {
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
        this.getConfig().stepWorkerQueueName,
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
                : undefined,
        }
      )
    } else {
      // No queue service - execute locally
      const retries = stepOptions?.retries ?? 0
      const retryDelay = stepOptions?.retryDelay
      const attemptCount = stepState.attemptCount

      try {
        const result = await rpcService.rpcWithWire(rpcName, data, {
          workflowStep: {
            runId,
            stepId: stepState.stepId,
            attemptCount: stepState.attemptCount,
          },
        })
        await this.setStepResult(stepState.stepId, result)
        return result
      } catch (error: any) {
        // Record the error (marks step as failed)
        await this.setStepError(stepState.stepId, error)

        // Check if we should retry
        if (attemptCount < retries) {
          // Create a new pending retry attempt (copies metadata from failed step)
          await this.createRetryAttempt(stepState.stepId, 'pending')

          // Schedule orchestrator to retry after delay
          await this.scheduleOrchestratorRetry(runId, retryDelay)

          // Pause workflow - orchestrator will replay and pick up new attempt
          throw new WorkflowAsyncException(runId, stepName)
        }

        // No more retries, fail the workflow
        throw error
      }
    }

    // Pause workflow - step will callback when done
    throw new WorkflowAsyncException(runId, stepName)
  }

  private async inlineStep(
    runId: string,
    stepName: string,
    fn: Function,
    stepOptions?: WorkflowStepOptions
  ): Promise<any> {
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
    const retries = stepOptions?.retries ?? this.getConfig().retries
    const retryDelay = stepOptions?.retryDelay ?? this.getConfig().retryDelay
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
        await this.createRetryAttempt(stepState.stepId, 'pending')

        // Schedule orchestrator to retry after delay
        await this.scheduleOrchestratorRetry(runId, retryDelay)

        // Pause workflow - orchestrator will replay and pick up new attempt
        throw new WorkflowAsyncException(runId, stepName)
      }

      // No more retries, fail the workflow
      throw error
    }
  }

  private async sleepStep(runId: string, stepName: string, duration: number) {
    // Check if step already exists
    let stepState: StepState
    try {
      stepState = await this.getStepState(runId, stepName)
    } catch (error: any) {
      // Step doesn't exist - create it (sleep step, no RPC)
      stepState = await this.insertStepState(
        runId,
        stepName,
        null, // No RPC for sleep steps
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
        this.getConfig().sleeperRPCName,
        {
          runId,
          stepId: stepState.stepId,
        }
      )
    } else {
      // Inline mode - use setTimeout with actual duration
      await new Promise((resolve) =>
        setTimeout(resolve, getDurationInMilliseconds(duration))
      )
      await this.setStepResult(stepState.stepId, null)
      return
    }

    // Pause workflow - sleep will callback when done
    throw new WorkflowAsyncException(runId, stepName)
  }

  private async cancelWorkflow(runId: string, reason?: string) {
    // Update workflow run status to cancelled
    await this.updateRunStatus(runId, 'cancelled', undefined, {
      message: reason || 'Workflow cancelled by user',
      stack: '',
      code: 'WORKFLOW_CANCELLED',
    })

    // Throw cancellation exception to stop workflow execution
    throw new WorkflowCancelledException(runId, reason)
  }

  private createWorkflowWire(
    workflowName: string,
    runId: string,
    rpcService: any
  ): PikkuWorkflowWire {
    const workflowWire: PikkuWorkflowWire = {
      workflowName,
      runId,
      getRun: async () => (await this.getRun(runId)) as WorkflowRun,

      // Implement workflow.do() - RPC form
      do: async (
        stepName: string,
        rpcNameOrFn: any,
        dataOrOptions?: any,
        options?: any
      ) => {
        this.verifyStepName(stepName)
        if (typeof rpcNameOrFn === 'string') {
          return await this.rpcStep(
            runId,
            stepName,
            rpcNameOrFn,
            dataOrOptions,
            rpcService,
            options
          )
        } else {
          return await this.inlineStep(
            runId,
            stepName,
            rpcNameOrFn,
            dataOrOptions
          )
        }
      },

      // Implement workflow.sleep()
      sleep: async (stepName: string, duration: string | number) => {
        this.verifyStepName(stepName)
        await this.sleepStep(
          runId,
          stepName,
          getDurationInMilliseconds(duration)
        )
      },

      // Implement workflow.cancel()
      cancel: async (reason?: string): Promise<void> => {
        await this.cancelWorkflow(runId, reason)
      },
    }
    return workflowWire
  }

  private verifyStepName(stepName: string) {
    if (typeof stepName !== 'string') {
      throw new WorkflowStepNameNotString(stepName)
    }
  }

  private getConfig() {
    if (!this.singletonServices || !this.config) {
      throw new WorkflowServiceNotInitialized()
    }
    return this.config
  }
}
