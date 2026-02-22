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
import type {
  PikkuWorkflowWire,
  StepState,
  WorkflowRun,
  WorkflowRunWire,
  WorkflowStatus,
  WorkflowServiceConfig,
  WorkflowStepOptions,
} from './workflow.types.js'
import {
  continueGraph,
  executeGraphStep,
  runWorkflowGraph,
  runFromMeta,
} from './graph/graph-runner.js'
import { WorkflowService } from '../../services/workflow-service.js'
import { PikkuError, addError } from '../../errors/error-handler.js'
import { RPCNotFoundError } from '../rpc/rpc-runner.js'

/**
 * Exception thrown when workflow needs to pause for async step
 */
export class WorkflowAsyncException extends Error {
  constructor(
    public readonly runId: string,
    public readonly stepName: string
  ) {
    super(`Workflow paused at step: ${stepName}`)
    this.name = 'WorkflowAsyncException'
  }
}

/**
 * Exception thrown when workflow is cancelled
 */
export class WorkflowCancelledException extends Error {
  constructor(
    public readonly runId: string,
    public readonly reason?: string
  ) {
    super(reason || 'Workflow cancelled')
    this.name = 'WorkflowCancelledException'
  }
}

/**
 * Exception thrown when workflow is suspended
 */
export class WorkflowSuspendedException extends Error {
  constructor(
    public readonly runId: string,
    public readonly reason: string
  ) {
    super(reason || 'Workflow suspended')
    this.name = 'WorkflowSuspendedException'
  }
}

/**
 * Error class for workflow not found
 */
export class WorkflowNotFoundError extends PikkuError {
  constructor(name: string) {
    super(`Workflow not found: ${name}`)
  }
}
addError(WorkflowNotFoundError, {
  status: 404,
  message: 'Workflow not found.',
})

export class WorkflowRunNotFoundError extends PikkuError {
  constructor(runId: string) {
    super(`Workflow run not found: ${runId}`)
  }
}
addError(WorkflowRunNotFoundError, {
  status: 404,
  message: 'Workflow run not found.',
})

export class WorkflowServiceNotInitialized extends Error {}
export class WorkflowStepNameNotString extends Error {
  constructor(stepName: any) {
    super(`Workflow step name must be a string. Received: ${typeof stepName}`)
  }
}

const WORKFLOW_END_STATES: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'cancelled',
  'suspended',
])

/**
 * Abstract workflow state service
 * Implementations provide pluggable storage backends (SQLite, PostgreSQL, etc.)
 * Combines orchestration and step execution
 */
export abstract class PikkuWorkflowService implements WorkflowService {
  private config: WorkflowServiceConfig | undefined
  private singletonServices: CoreSingletonServices | undefined
  private createWireServices: CreateWireServices | undefined
  private inlineRuns = new Set<string>()

  constructor() {}

  /**
   * Check if a run is executing inline (without queues)
   */
  protected isInline(runId: string): boolean {
    return this.inlineRuns.has(runId)
  }

  /**
   * Register a run as inline (for graph-runner to use)
   */
  public registerInlineRun(runId: string): void {
    this.inlineRuns.add(runId)
  }

  /**
   * Unregister a run from inline tracking
   */
  public unregisterInlineRun(runId: string): void {
    this.inlineRuns.delete(runId)
  }

  public setServices(
    singletonServices: CoreSingletonServices,
    createWireServices: CreateWireServices | undefined,
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
      sleeperRPCName: workflow?.sleeperRPCName ?? 'pikkuWorkflowSleeper',
    }
  }

  public async registerWorkflowVersions(): Promise<void> {
    const allMeta = pikkuState(null, 'workflows', 'meta')
    for (const [name, meta] of Object.entries(allMeta)) {
      if (!meta.graphHash) continue
      await this.upsertWorkflowVersion(name, meta.graphHash, meta, meta.source)
    }
  }

  abstract createRun(
    workflowName: string,
    input: any,
    inline: boolean,
    graphHash: string,
    wire: WorkflowRunWire
  ): Promise<string>

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
  // Workflow Graph Methods
  // ============================================================================

  /**
   * Get completed graph state (lightweight - no results)
   * @param runId - Run ID
   * @returns Completed node IDs and their branch keys
   */
  abstract getCompletedGraphState(runId: string): Promise<{
    completedNodeIds: string[]
    failedNodeIds: string[]
    branchKeys: Record<string, string>
  }>

  /**
   * Filter candidate nodes to only those without existing steps
   * @param runId - Run ID
   * @param nodeIds - Candidate node IDs to check
   * @returns Node IDs that don't have a step yet
   */
  abstract getNodesWithoutSteps(
    runId: string,
    nodeIds: string[]
  ): Promise<string[]>

  /**
   * Get results for specific nodes
   * @param runId - Run ID
   * @param nodeIds - Node IDs to fetch results for
   * @returns Map of nodeId to result
   */
  abstract getNodeResults(
    runId: string,
    nodeIds: string[]
  ): Promise<Record<string, any>>

  /**
   * Set the branch key for a graph node step
   * @param stepId - Step ID
   * @param branchKey - Branch key selected by graph.branch()
   */
  abstract setBranchTaken(stepId: string, branchKey: string): Promise<void>

  /**
   * Update a state variable in the workflow run's state
   * @param runId - Run ID
   * @param name - Variable name
   * @param value - Value to store
   */
  abstract updateRunState(
    runId: string,
    name: string,
    value: unknown
  ): Promise<void>

  /**
   * Get the entire state object for a workflow run
   * @param runId - Run ID
   * @returns The state object with all variables
   */
  abstract getRunState(runId: string): Promise<Record<string, unknown>>

  abstract upsertWorkflowVersion(
    name: string,
    graphHash: string,
    graph: any,
    source: string
  ): Promise<void>

  abstract getWorkflowVersion(
    name: string,
    graphHash: string
  ): Promise<{ graph: any; source: string } | null>

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

  public async queueStepWorker(
    runId: string,
    stepName: string,
    rpcName: string,
    data: any
  ): Promise<void> {
    const queueService = this.verifyQueueService()
    await queueService.add(this.getConfig().stepWorkerQueueName, {
      runId,
      stepName,
      rpcName,
      data,
    })
  }

  /**
   * Execute a workflow sleep step completion
   * Sets the step result to null and resumes the workflow
   * @param data - Sleeper input data
   */
  public async executeWorkflowSleepCompleted(
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
   * Automatically detects workflow type (DSL or graph) from meta and executes accordingly
   * @param options.inline - If true, execute workflow directly without queue service
   * @param options.startNode - Starting node ID for graph workflows (from wire config)
   */
  public async startWorkflow<I>(
    name: string,
    input: I,
    rpcService: any,
    options: { inline?: boolean; startNode?: string; wire: WorkflowRunWire }
  ): Promise<{ runId: string }> {
    // Check meta to determine workflow type
    const meta = pikkuState(null, 'workflows', 'meta')
    const workflowMeta = meta[name]

    if (!workflowMeta) {
      throw new WorkflowNotFoundError(name)
    }

    // Check if this is a graph workflow (source === 'graph')
    if (workflowMeta.source === 'graph') {
      const shouldInline =
        options?.inline || !this.singletonServices?.queueService
      return runWorkflowGraph(
        this,
        name,
        input,
        rpcService,
        shouldInline,
        options?.startNode,
        options?.wire
      )
    }

    // DSL workflow - check registration exists
    const registrations = pikkuState(null, 'workflows', 'registrations')
    const workflow = registrations.get(name)

    if (!workflow) {
      throw new WorkflowNotFoundError(name)
    }

    if (!workflowMeta.graphHash) {
      throw new Error(`Missing workflow graphHash for '${name}'`)
    }

    const runId = await this.createRun(
      name,
      input,
      options?.inline ?? false,
      workflowMeta.graphHash,
      options.wire
    )

    if (options?.inline) {
      this.inlineRuns.add(runId)
    }

    if (options?.inline || !this.singletonServices?.queueService) {
      this.runWorkflowJob(runId, rpcService)
        .catch(() => {})
        .finally(() => {
          if (options?.inline) {
            this.inlineRuns.delete(runId)
          }
        })
    } else {
      await this.resumeWorkflow(runId)
    }

    return { runId }
  }

  public async runToCompletion<I>(
    name: string,
    input: I,
    rpcService: any,
    options?: { pollIntervalMs?: number; wire?: WorkflowRunWire }
  ): Promise<any> {
    const pollInterval = options?.pollIntervalMs ?? 1000
    const { runId } = await this.startWorkflow(name, input, rpcService, {
      inline: true,
      wire: options?.wire ?? { type: 'internal' },
    })
    while (true) {
      const run = await this.getRun(runId)
      if (!run) {
        throw new WorkflowRunNotFoundError(runId)
      }
      if (WORKFLOW_END_STATES.has(run.status)) {
        if (run.status === 'failed') {
          throw new Error(run.error?.message || 'Workflow failed')
        }
        if (run.status === 'cancelled') {
          throw new Error('Workflow was cancelled')
        }
        return run.output
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval))
    }
  }

  public async runWorkflowJob(runId: string, rpcService: any): Promise<void> {
    const run = await this.getRun(runId)
    if (!run) {
      throw new WorkflowRunNotFoundError(runId)
    }

    const meta = pikkuState(null, 'workflows', 'meta')
    const workflowMeta = meta[run.workflow]

    if (
      run.graphHash &&
      workflowMeta?.graphHash &&
      run.graphHash !== workflowMeta.graphHash
    ) {
      await this.runVersionMismatchFallback(run, workflowMeta, rpcService)
      return
    }

    if (workflowMeta?.source === 'graph') {
      await continueGraph(this, runId, run.workflow)
      return
    }

    const registrations = pikkuState(null, 'workflows', 'registrations')
    const workflow = registrations.get(run.workflow)
    if (!workflow) {
      throw new WorkflowNotFoundError(run.workflow)
    }

    await this.withRunLock(runId, async () => {
      const workflowWire = this.createWorkflowWire(
        run.workflow,
        runId,
        rpcService
      )
      const wire: PikkuWire = { workflow: workflowWire }
      try {
        const result = await runPikkuFunc(
          'workflow',
          workflowMeta.name,
          workflowMeta.pikkuFuncId,
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
          throw error
        }

        if (error instanceof WorkflowCancelledException) {
          await this.updateRunStatus(runId, 'cancelled', undefined, {
            message: error.message || 'Workflow cancelled',
            stack: '',
            code: 'WORKFLOW_CANCELLED',
          })
          throw error
        }

        if (error instanceof WorkflowSuspendedException) {
          await this.updateRunStatus(runId, 'suspended', undefined, {
            message: error.message || 'Workflow suspended',
            stack: '',
            code: 'WORKFLOW_SUSPENDED',
          })
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

  private async runVersionMismatchFallback(
    run: WorkflowRun,
    currentMeta: { source: string },
    rpcService: any
  ): Promise<void> {
    const source = currentMeta.source

    if (source === 'complex') {
      await this.updateRunStatus(run.id, 'failed', undefined, {
        message: `Workflow '${run.workflow}' definition changed. Complex workflows with inline steps cannot be migrated.`,
        stack: '',
        code: 'VERSION_CONFLICT',
      })
      return
    }

    const version = await this.getWorkflowVersion(run.workflow, run.graphHash!)
    if (!version) {
      await this.updateRunStatus(run.id, 'failed', undefined, {
        message: `Workflow '${run.workflow}' version '${run.graphHash}' not found. Cannot resume with changed definition.`,
        stack: '',
        code: 'VERSION_NOT_FOUND',
      })
      return
    }

    await runFromMeta(this, run.id, version.graph, rpcService)
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

      if (stepState.status === 'pending') {
        // Mark pending step as running before execution
        await this.setStepRunning(stepState.stepId)
      }

      try {
        let result: any

        const run = await this.getRun(runId)
        if (!run) {
          throw new Error(`Workflow run not found: ${runId}`)
        }

        const meta = pikkuState(null, 'workflows', 'meta')
        const workflowMeta = meta[run.workflow]

        if (workflowMeta?.nodes && stepName in workflowMeta.nodes) {
          result = await executeGraphStep(
            this,
            rpcService,
            runId,
            stepState.stepId,
            stepName,
            rpcName,
            data,
            run.workflow
          )
        } else {
          result = await rpcService.rpcWithWire(rpcName, data, {
            workflowStep: {
              runId,
              stepId: stepState.stepId,
              attemptCount: stepState.attemptCount,
            },
          })
        }

        // Store result and mark succeeded
        await this.setStepResult(stepState.stepId, result)

        // Resume orchestrator to continue workflow
        await this.resumeWorkflow(runId)
      } catch (error: any) {
        if (error instanceof RPCNotFoundError) {
          await this.setStepError(stepState.stepId, error)
          await this.updateRunStatus(runId, 'suspended', undefined, {
            message: `RPC '${rpcName}' not found. Deploy the missing function and resume.`,
            code: 'RPC_NOT_FOUND',
          })
          return
        }

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
        error.name === 'WorkflowCancelledException' ||
        error.name === 'WorkflowSuspendedException'
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
    } catch {
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

    // Enqueue step worker (unless inline mode)
    if (!this.isInline(runId) && this.singletonServices!.queueService) {
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
      // Pause workflow - step will callback when done
      throw new WorkflowAsyncException(runId, stepName)
    } else {
      // Inline or no queue service - execute locally with retry loop
      const retries = stepOptions?.retries ?? 0
      const retryDelay = stepOptions?.retryDelay
      let currentStepState = stepState

      while (true) {
        try {
          await this.setStepRunning(currentStepState.stepId)
          const result = await rpcService.rpcWithWire(rpcName, data, {
            workflowStep: {
              runId,
              stepId: currentStepState.stepId,
              attemptCount: currentStepState.attemptCount,
            },
          })
          await this.setStepResult(currentStepState.stepId, result)
          return result
        } catch (error: any) {
          if (error instanceof RPCNotFoundError) {
            await this.updateRunStatus(runId, 'suspended', undefined, {
              message: `RPC '${rpcName}' not found. Deploy the missing function and resume.`,
              code: 'RPC_NOT_FOUND',
            })
            throw error
          }

          // Record the error (marks step as failed)
          await this.setStepError(currentStepState.stepId, error)

          // Check if we should retry
          if (currentStepState.attemptCount < retries) {
            // Create a new pending retry attempt
            currentStepState = await this.createRetryAttempt(
              currentStepState.stepId,
              'pending'
            )

            // Wait for retry delay if specified
            if (retryDelay) {
              await new Promise((resolve) =>
                setTimeout(resolve, getDurationInMilliseconds(retryDelay))
              )
            }
            // Continue loop to retry
          } else {
            // No more retries, fail the workflow
            throw error
          }
        }
      }
    }
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
    } catch {
      // Step doesn't exist - create it (inline, no RPC)
      stepState = await this.insertStepState(
        runId,
        stepName,
        null,
        null,
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
    let currentStepState = stepState

    // Check if we're running inline (in-memory) or remote (queue-based)
    if (this.isInline(runId)) {
      // Inline mode - execute with retry loop
      while (true) {
        try {
          await this.setStepRunning(currentStepState.stepId)
          const result = await fn()
          await this.setStepResult(currentStepState.stepId, result)
          return result
        } catch (error: any) {
          // Record the error (marks step as failed)
          await this.setStepError(currentStepState.stepId, error)

          // Check if we should retry
          if (currentStepState.attemptCount < retries) {
            // Create a new pending retry attempt
            currentStepState = await this.createRetryAttempt(
              currentStepState.stepId,
              'pending'
            )

            // Wait for retry delay if specified
            if (retryDelay) {
              await new Promise((resolve) =>
                setTimeout(resolve, getDurationInMilliseconds(retryDelay))
              )
            }
            // Continue loop to retry
          } else {
            // No more retries, fail the workflow
            throw error
          }
        }
      }
    } else {
      // Remote mode - use queue-based retry
      try {
        await this.setStepRunning(currentStepState.stepId)
        const result = await fn()
        await this.setStepResult(currentStepState.stepId, result)
        return result
      } catch (error: any) {
        // Record the error (marks step as failed)
        await this.setStepError(currentStepState.stepId, error)

        // Check if we should retry
        if (currentStepState.attemptCount < retries) {
          // Create a new pending retry attempt (copies metadata from failed step)
          await this.createRetryAttempt(currentStepState.stepId, 'pending')

          // Schedule orchestrator to retry after delay
          await this.scheduleOrchestratorRetry(runId, retryDelay)

          // Pause workflow - orchestrator will replay and pick up new attempt
          throw new WorkflowAsyncException(runId, stepName)
        }

        // No more retries, fail the workflow
        throw error
      }
    }
  }

  private async sleepStep(runId: string, stepName: string, duration: number) {
    // Check if step already exists
    let stepState: StepState
    try {
      stepState = await this.getStepState(runId, stepName)
    } catch {
      // Step doesn't exist - create it (sleep step, no RPC)
      stepState = await this.insertStepState(runId, stepName, null, {
        duration,
      })
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

    // Check if inline mode or no scheduler service
    if (!this.isInline(runId) && this.singletonServices!.schedulerService) {
      // Remote mode - schedule sleep via scheduler service
      await this.singletonServices!.schedulerService.scheduleRPC(
        duration,
        this.getConfig().sleeperRPCName,
        {
          runId,
          stepId: stepState.stepId,
        }
      )
      // Pause workflow - sleep will callback when done
      throw new WorkflowAsyncException(runId, stepName)
    } else {
      // Inline mode - use setTimeout with actual duration
      await new Promise((resolve) =>
        setTimeout(resolve, getDurationInMilliseconds(duration))
      )
      await this.setStepResult(stepState.stepId, null)
      return
    }
  }

  private getSuspendStepName(reason: string): string {
    if (!reason) {
      return '__workflow_suspend'
    }
    return '__workflow_suspend'
  }

  private async suspendStep(runId: string, reason: string): Promise<void> {
    const stepName = this.getSuspendStepName(reason)
    await this.withStepLock(runId, stepName, async () => {
      let stepState: StepState
      try {
        stepState = await this.getStepState(runId, stepName)
      } catch {
        stepState = await this.insertStepState(
          runId,
          stepName,
          'pikkuWorkflowSuspend',
          {
            reason,
          }
        )
      }
      if (!stepState.stepId) {
        stepState = await this.insertStepState(
          runId,
          stepName,
          'pikkuWorkflowSuspend',
          {
            reason,
          }
        )
      }

      if (stepState.status === 'succeeded') {
        return
      }

      if (stepState.status === 'pending') {
        await this.setStepRunning(stepState.stepId)
      }

      await this.setStepResult(stepState.stepId, {
        reason,
        suspendedAt: new Date().toISOString(),
      })
      throw new WorkflowSuspendedException(runId, reason)
    })
  }

  private createWorkflowWire(
    name: string,
    runId: string,
    rpcService: any
  ): PikkuWorkflowWire {
    const workflowWire: PikkuWorkflowWire = {
      name,
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

      suspend: async (reason: string) => {
        await this.suspendStep(runId, reason || 'Workflow suspended')
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
