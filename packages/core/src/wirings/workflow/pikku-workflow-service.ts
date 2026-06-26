import { runPikkuFunc, addFunction } from '../../function/function-runner.js'
import {
  pikkuWorkflowWorkerFunc,
  pikkuWorkflowOrchestratorFunc,
  pikkuWorkflowSleeperFunc,
} from './workflow-queue-workers.js'
import { wireQueueWorker } from '../queue/queue-runner.js'
import {
  getSingletonServices,
  getCreateWireServices,
  pikkuState,
} from '../../pikku-state.js'
import { getDurationInMilliseconds } from '../../time-utils.js'

const resolveWorkflowMeta = (
  name: string
): { meta: any; packageName: string | null; resolvedName: string } | null => {
  const rootMeta = pikkuState(null, 'workflows', 'meta')
  if (rootMeta[name]) {
    return { meta: rootMeta[name], packageName: null, resolvedName: name }
  }

  const colonIndex = name.indexOf(':')
  if (colonIndex !== -1) {
    const namespace = name.substring(0, colonIndex)
    const localName = name.substring(colonIndex + 1)
    const addons = pikkuState(null, 'addons', 'packages')
    const pkgConfig = addons?.get(namespace)
    if (pkgConfig) {
      const addonMeta = pikkuState(pkgConfig.package, 'workflows', 'meta')
      if (addonMeta?.[localName]) {
        return {
          meta: addonMeta[localName],
          packageName: pkgConfig.package,
          resolvedName: localName,
        }
      }
    }
  }

  return null
}

const toKebab = (s: string) =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
import type { PikkuWire, SerializedError } from '../../types/core.types.js'
import type { QueueService } from '../queue/queue.types.js'
import type {
  PikkuWorkflowWire,
  StepState,
  StepStatus,
  WorkflowPlannedStep,
  WorkflowRun,
  WorkflowRunMirror,
  WorkflowRunStatus,
  WorkflowRunWire,
  WorkflowStatus,
  WorkflowVersionStatus,
  WorkflowServiceConfig,
  WorkflowStepOptions,
} from './workflow.types.js'
import {
  continueGraph,
  executeGraphStep,
  runWorkflowGraph,
  runFromMeta,
} from './graph/graph-runner.js'
import type { WorkflowService } from '../../services/workflow-service.js'
import { PikkuError, addError } from '../../errors/error-handler.js'
import { RPCNotFoundError } from '../rpc/rpc-runner.js'
import { ChildWorkflowStartedException } from './graph/graph-runner.js'
import { deriveInvocationId } from './workflow-invocation-id.js'
import type { JobOptions } from '../queue/queue.types.js'

/**
 * Default number of retries for a workflow step when none is specified. The
 * workflow — not the queue — owns retry policy; a step inherits this unless it
 * sets its own `retries` (including `retries: 0` to opt out entirely). Picked >0
 * so a transient failure (a DB blip, a downstream restart, a deploy) is ridden
 * out by default; safe because every step gets a stable `invocationId` to dedupe on.
 */
export const DEFAULT_STEP_RETRIES = 5

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

export class WorkflowRunFailedError extends PikkuError {
  public payload: { message?: string }
  constructor(message?: string) {
    super(`Workflow run failed: ${message ?? 'unknown'}`)
    this.payload = { message }
  }
}
addError(WorkflowRunFailedError, {
  status: 422,
  message: 'Workflow run failed.',
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
  private inlineRuns = new Set<string>()

  protected get logger() {
    return getSingletonServices()?.logger
  }

  protected mirror?: WorkflowRunMirror

  constructor(
    options: { wireQueues?: boolean; mirror?: WorkflowRunMirror } = {}
  ) {
    const wireQueues = options.wireQueues ?? true
    this.mirror = options.mirror
    if (wireQueues) {
      this.wireQueueWorkers()
    }
  }

  private async safeMirror(fn: () => Promise<void>): Promise<void> {
    if (!this.mirror) return
    try {
      await fn()
    } catch (err: any) {
      try {
        this.logger?.warn?.(
          `[pikku] WorkflowRunMirror write failed: ${err?.message ?? err}`
        )
      } catch {
        // logger unavailable (e.g. singleton services not initialized) — swallow
      }
    }
  }

  public rewireQueueWorkers(): void {
    this.wireQueueWorkers()
  }

  /**
   * Wire the queue-based orchestrator/step/sleeper workers.
   * Subclasses that orchestrate without queues (e.g. Durable Objects) should
   * pass `wireQueues: false` to the base constructor and skip this entirely.
   */
  protected wireQueueWorkers(): void {
    const functions = pikkuState(null, 'function', 'functions')
    const functionsMeta = pikkuState(null, 'function', 'meta')

    // Minimal meta for internal workflow functions (satisfies FunctionMeta)
    const mkMeta = (funcId: string) => ({
      pikkuFuncId: funcId,
      sessionless: true,
      functionType: 'helper' as const,
      inputSchemaName: null,
      outputSchemaName: null,
    })

    const queueMeta = pikkuState(null, 'queue', 'meta')

    const registerWorkflowFunc = (
      funcId: string,
      func: { func: unknown },
      queueName: string
    ) => {
      if (functions.has(funcId)) return
      addFunction(funcId, func as never)
      if (!queueMeta[queueName]) {
        queueMeta[queueName] = { pikkuFuncId: funcId, name: queueName }
      }
      wireQueueWorker({ name: queueName, func } as never)
      if (!functionsMeta[funcId]) {
        functionsMeta[funcId] = mkMeta(funcId)
      }
    }

    // Register shared queue workers for monolith deployments
    registerWorkflowFunc(
      'pikkuWorkflowOrchestrator',
      { func: pikkuWorkflowOrchestratorFunc },
      'pikku-workflow-orchestrator'
    )
    registerWorkflowFunc(
      'pikkuWorkflowStepWorker',
      { func: pikkuWorkflowWorkerFunc },
      'pikku-workflow-step-worker'
    )

    // Register per-workflow queue workers (root + addon packages)
    const registerQueueWorkers = (queueMeta: Record<string, any>) => {
      for (const [queueName, meta] of Object.entries(queueMeta)) {
        if (functions.has(meta.pikkuFuncId)) continue
        if (queueName.startsWith('wf-orchestrator-')) {
          registerWorkflowFunc(
            meta.pikkuFuncId,
            { func: pikkuWorkflowOrchestratorFunc },
            queueName
          )
        } else if (queueName.startsWith('wf-step-')) {
          registerWorkflowFunc(
            meta.pikkuFuncId,
            { func: pikkuWorkflowWorkerFunc },
            queueName
          )
        }
      }
    }

    registerQueueWorkers(pikkuState(null, 'queue', 'meta'))

    const addons = pikkuState(null, 'addons', 'packages')
    if (addons) {
      for (const [, addon] of addons) {
        const addonQueueMeta = pikkuState(addon.package, 'queue', 'meta')
        if (addonQueueMeta) {
          registerQueueWorkers(addonQueueMeta)
        }
      }
    }

    if (!functions.has('pikkuWorkflowSleeper')) {
      addFunction('pikkuWorkflowSleeper', {
        func: pikkuWorkflowSleeperFunc,
      })
    }
    if (!functionsMeta.pikkuWorkflowSleeper) {
      functionsMeta.pikkuWorkflowSleeper = mkMeta('pikkuWorkflowSleeper')
    }
  }

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

  public async registerWorkflowVersions(): Promise<void> {
    const allMeta = pikkuState(null, 'workflows', 'meta')
    for (const [name, meta] of Object.entries(allMeta)) {
      if (!meta.graphHash) continue
      await this.upsertWorkflowVersion(name, meta.graphHash, meta, meta.source)
    }
  }

  public async createRun(
    workflowName: string,
    input: any,
    inline: boolean,
    graphHash: string,
    wire: WorkflowRunWire,
    options?: {
      deterministic?: boolean
      plannedSteps?: WorkflowPlannedStep[]
    }
  ): Promise<string> {
    const runId = await this.createRunImpl(
      workflowName,
      input,
      inline,
      graphHash,
      wire,
      options
    )
    await this.safeMirror(() =>
      this.mirror!.createRun(
        runId,
        workflowName,
        input,
        inline,
        graphHash,
        wire,
        options
      )
    )
    return runId
  }

  protected abstract createRunImpl(
    workflowName: string,
    input: any,
    inline: boolean,
    graphHash: string,
    wire: WorkflowRunWire,
    options?: {
      deterministic?: boolean
      plannedSteps?: WorkflowPlannedStep[]
    }
  ): Promise<string>

  /**
   * Get a workflow run by ID
   * @param id - Run ID
   * @returns Workflow run or null if not found
   */
  abstract getRun(id: string): Promise<WorkflowRun | null>

  /**
   * Get minimal workflow run status with step summaries.
   * Used by the public API — the console addon provides the full verbose view.
   */
  async getRunStatus(id: string): Promise<WorkflowRunStatus | null> {
    const run = await this.getRun(id)
    if (!run) return null

    const history = await this.getRunHistory(id)
    const terminalStatuses = new Set(['completed', 'failed', 'cancelled'])

    // Build step summaries from history (latest attempt per step)
    const stepMap = new Map<
      string,
      { status: StepStatus; startedAt?: Date; completedAt?: Date }
    >()
    for (const step of history) {
      const existing = stepMap.get(step.stepName)
      if (!existing || step.updatedAt > existing.completedAt!) {
        stepMap.set(step.stepName, {
          status: step.status,
          startedAt: step.runningAt ?? step.createdAt,
          completedAt: step.succeededAt ?? step.failedAt,
        })
      }
    }

    const steps = [...stepMap.entries()].map(([name, s]) => ({
      name,
      status: s.status,
      duration:
        s.startedAt && s.completedAt
          ? s.completedAt.getTime() - s.startedAt.getTime()
          : undefined,
    }))

    return {
      id: run.id,
      status: run.status,
      startedAt: run.createdAt,
      completedAt: terminalStatuses.has(run.status) ? run.updatedAt : undefined,
      deterministic: run.deterministic,
      plannedSteps: run.plannedSteps,
      steps,
      output: run.status === 'completed' ? run.output : undefined,
      error: run.error
        ? { message: run.error.message ?? 'Unknown error' }
        : undefined,
    }
  }

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
  public async updateRunStatus(
    id: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<void> {
    await this.updateRunStatusImpl(id, status, output, error)
    await this.safeMirror(() =>
      this.mirror!.updateRunStatus(id, status, output, error)
    )
  }

  protected abstract updateRunStatusImpl(
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
  public async insertStepState(
    runId: string,
    stepName: string,
    rpcName: string | null,
    data: any,
    stepOptions?: WorkflowStepOptions
  ): Promise<StepState> {
    const step = await this.insertStepStateImpl(
      runId,
      stepName,
      rpcName,
      data,
      stepOptions
    )
    await this.safeMirror(() =>
      this.mirror!.insertStepState(runId, { ...step, stepName, rpcName, data })
    )
    return step
  }

  protected abstract insertStepStateImpl(
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
  public async setStepRunning(stepId: string): Promise<void> {
    await this.setStepRunningImpl(stepId)
    await this.safeMirror(() => this.mirror!.setStepRunning(stepId))
  }

  protected abstract setStepRunningImpl(stepId: string): Promise<void>

  /**
   * Mark step as scheduled (queued for execution)
   * Updates both workflow_step and workflow_step_history
   * @param stepId - Step ID
   */
  public async setStepScheduled(stepId: string): Promise<void> {
    await this.setStepScheduledImpl(stepId)
    await this.safeMirror(() => this.mirror!.setStepScheduled(stepId))
  }

  protected abstract setStepScheduledImpl(stepId: string): Promise<void>

  /**
   * Store step result and mark as succeeded
   * Updates both workflow_step and workflow_step_history
   * @param stepId - Step ID
   * @param result - Step result
   */
  public async setStepResult(stepId: string, result: any): Promise<void> {
    await this.setStepResultImpl(stepId, result)
    await this.safeMirror(() => this.mirror!.setStepResult(stepId, result))
  }

  protected abstract setStepResultImpl(
    stepId: string,
    result: any
  ): Promise<void>

  /**
   * Set the child workflow run ID on a step
   * @param stepId - Step ID
   * @param childRunId - Child workflow run ID
   */
  public async setStepChildRunId(
    stepId: string,
    childRunId: string
  ): Promise<void> {
    await this.setStepChildRunIdImpl(stepId, childRunId)
    await this.safeMirror(() =>
      this.mirror!.setStepChildRunId(stepId, childRunId)
    )
  }

  protected abstract setStepChildRunIdImpl(
    stepId: string,
    childRunId: string
  ): Promise<void>

  /**
   * Store step error and mark as failed
   * Updates both workflow_step and workflow_step_history
   * @param stepId - Step ID
   * @param error - Error object
   */
  public async setStepError(stepId: string, error: Error): Promise<void> {
    await this.setStepErrorImpl(stepId, error)
    const serialized: SerializedError = {
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
    }
    await this.safeMirror(() => this.mirror!.setStepError(stepId, serialized))
  }

  protected abstract setStepErrorImpl(
    stepId: string,
    error: Error
  ): Promise<void>

  /**
   * Create a new retry attempt for a failed step
   * Inserts new pending step in both workflow_step and workflow_step_history
   * Resets status to 'pending' with new stepId
   * Copies metadata (rpcName, data, retries, retryDelay) from failed attempt
   * @param failedStepId - Failed step ID to copy from
   * @returns New step state for the retry attempt
   */
  public async createRetryAttempt(
    failedStepId: string,
    status: 'pending' | 'running'
  ): Promise<StepState> {
    const newStep = await this.createRetryAttemptImpl(failedStepId, status)
    const stepName = (newStep as any).stepName ?? ''
    await this.safeMirror(() =>
      this.mirror!.createRetryAttempt(failedStepId, {
        ...newStep,
        stepName,
      })
    )
    return newStep
  }

  protected abstract createRetryAttemptImpl(
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
  public async setBranchTaken(
    stepId: string,
    branchKey: string
  ): Promise<void> {
    await this.setBranchTakenImpl(stepId, branchKey)
    await this.safeMirror(() => this.mirror!.setBranchTaken(stepId, branchKey))
  }

  protected abstract setBranchTakenImpl(
    stepId: string,
    branchKey: string
  ): Promise<void>

  /**
   * Update a state variable in the workflow run's state
   * @param runId - Run ID
   * @param name - Variable name
   * @param value - Value to store
   */
  public async updateRunState(
    runId: string,
    name: string,
    value: unknown
  ): Promise<void> {
    await this.updateRunStateImpl(runId, name, value)
    await this.safeMirror(() => this.mirror!.updateRunState(runId, name, value))
  }

  protected abstract updateRunStateImpl(
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

  public async upsertWorkflowVersion(
    name: string,
    graphHash: string,
    graph: any,
    source: string,
    status?: WorkflowVersionStatus
  ): Promise<void> {
    await this.upsertWorkflowVersionImpl(name, graphHash, graph, source, status)
    await this.safeMirror(() =>
      this.mirror!.upsertWorkflowVersion(name, graphHash, graph, source, status)
    )
  }

  protected abstract upsertWorkflowVersionImpl(
    name: string,
    graphHash: string,
    graph: any,
    source: string,
    status?: WorkflowVersionStatus
  ): Promise<void>

  public async updateWorkflowVersionStatus(
    name: string,
    graphHash: string,
    status: WorkflowVersionStatus
  ): Promise<void> {
    await this.updateWorkflowVersionStatusImpl(name, graphHash, status)
    await this.safeMirror(() =>
      this.mirror!.updateWorkflowVersionStatus(name, graphHash, status)
    )
  }

  protected abstract updateWorkflowVersionStatusImpl(
    name: string,
    graphHash: string,
    status: WorkflowVersionStatus
  ): Promise<void>

  abstract getWorkflowVersion(
    name: string,
    graphHash: string
  ): Promise<{ graph: any; source: string } | null>

  abstract getAIGeneratedWorkflows(
    agentName?: string
  ): Promise<Array<{ workflowName: string; graphHash: string; graph: any }>>

  // ============================================================================
  // Workflow Lifecycle Methods
  // ============================================================================

  /**
   * Resume a paused workflow by triggering the orchestrator
   * @param runId - Run ID
   */
  public async resumeWorkflow(
    runId: string,
    workflowName?: string
  ): Promise<void> {
    const queueService = this.verifyQueueService()
    if (!workflowName) {
      const run = await this.getRun(runId)
      workflowName = run?.workflow
    }
    await queueService.add(this.getOrchestratorQueueName(workflowName), {
      runId,
    })
  }

  /**
   * Resolve a step's retry policy into queue job options. The workflow is the
   * sole source of truth for retries: an explicitly-set `retries` (including 0)
   * is always honored, an unset one defaults to {@link DEFAULT_STEP_RETRIES},
   * and we ALWAYS pass `attempts` so the queue can never fall back to its own
   * default — which would re-run a step the workflow said not to retry. Backoff
   * defaults to exponential whenever there's at least one retry, so retries ride
   * out a transient outage instead of firing instantly.
   */
  protected resolveStepJobOptions(
    stepOptions?: WorkflowStepOptions
  ): JobOptions {
    const retries = stepOptions?.retries ?? DEFAULT_STEP_RETRIES
    const retryDelay = stepOptions?.retryDelay
    const backoff =
      typeof retryDelay === 'number'
        ? { type: 'fixed', delay: retryDelay }
        : retryDelay === 'exponential'
          ? 'exponential'
          : retries > 0
            ? 'exponential'
            : undefined
    return { attempts: retries + 1, ...(backoff ? { backoff } : {}) }
  }

  public async queueStepWorker(
    runId: string,
    stepName: string,
    rpcName: string,
    data: any,
    stepOptions?: WorkflowStepOptions
  ): Promise<void> {
    const queueService = this.verifyQueueService()
    await queueService.add(
      this.getStepWorkerQueueName(rpcName),
      JSON.parse(JSON.stringify({ runId, stepName, rpcName, data })),
      this.resolveStepJobOptions(stepOptions)
    )
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
    retryDelay?: number | string,
    workflowName?: string
  ): Promise<void> {
    const queueService = this.verifyQueueService()
    if (!workflowName) {
      const run = await this.getRun(runId)
      workflowName = run?.workflow
    }
    await queueService.add(
      this.getOrchestratorQueueName(workflowName),
      { runId },
      retryDelay ? { delay: getDurationInMilliseconds(retryDelay) } : undefined
    )
  }

  /**
   * Dispatch a workflow step to be executed asynchronously.
   *
   * Default implementation enqueues a step worker job via the queue service.
   * Subclasses with non-queue transports (e.g. Durable Objects) override this
   * to dispatch via their own mechanism (RPC to a step worker, etc.).
   *
   * On return, the workflow is paused via `WorkflowAsyncException` thrown by
   * the caller; the step transport is responsible for calling back into the
   * orchestrator (via `resumeWorkflow` or equivalent) when the step completes.
   *
   * @returns true if dispatch was async (caller should pause), false to fall
   *   through to the inline execution path.
   */
  protected async dispatchStep(
    runId: string,
    stepName: string,
    rpcName: string,
    data: unknown,
    stepOptions?: WorkflowStepOptions
  ): Promise<boolean> {
    // Step execution is decided purely by the function's `inline` flag (default
    // true). Only a function explicitly marked `inline: false` dispatches via
    // the queue. The run-level inline state is intentionally NOT consulted
    // here: default steps run inline even inside a queue-dispatched run, so a
    // normally-started workflow executes its steps in one orchestrator-worker
    // pass instead of one queue round-trip per step.
    const functionsMeta = pikkuState(null, 'function', 'meta')
    const rpcFuncId = pikkuState(null, 'rpc', 'meta')[rpcName]
    const rpcMeta =
      typeof rpcFuncId === 'string' ? functionsMeta[rpcFuncId] : undefined
    const forceQueue = rpcMeta?.inline === false
    if (!forceQueue) {
      return false
    }
    // The function opted out of inline execution (`inline: false`) but no queue
    // service is configured to dispatch it. Fall back to inline so the workflow
    // still progresses, but warn loudly — silently swallowing this hides a real
    // misconfiguration (the step won't get its own worker/retry isolation).
    if (!getSingletonServices()?.queueService) {
      getSingletonServices()?.logger.warn(
        `Workflow step '${stepName}' (function '${rpcName}') is marked 'inline: false' but no queue service is configured — running it inline instead of dispatching to a queue.`
      )
      return false
    }
    await getSingletonServices()!.queueService!.add(
      this.getStepWorkerQueueName(rpcName),
      JSON.parse(JSON.stringify({ runId, stepName, rpcName, data })),
      this.resolveStepJobOptions(stepOptions)
    )
    return true
  }

  /**
   * Schedule a workflow sleep wakeup at the given duration.
   *
   * Default implementation uses the scheduler service to enqueue a delayed
   * sleeper RPC. Subclasses with native timer primitives (e.g. Durable Object
   * alarms) override this to schedule directly without going through queues.
   *
   * @returns true if the wakeup was scheduled remotely (caller should pause),
   *   false to fall through to inline `setTimeout` behavior.
   */
  protected async scheduleSleep(
    runId: string,
    stepId: string,
    duration: number | string
  ): Promise<boolean> {
    if (this.isInline(runId) || !getSingletonServices()?.schedulerService) {
      return false
    }
    await getSingletonServices()!.schedulerService!.scheduleRPC(
      duration,
      this.getConfig().sleeperRPCName,
      { runId, stepId }
    )
    return true
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
    wire: WorkflowRunWire,
    rpcService: any,
    options?: { inline?: boolean; startNode?: string }
  ): Promise<{ runId: string }> {
    // Resolve workflow from static meta (root or addon namespace), then dynamic DB
    const resolved = resolveWorkflowMeta(name)
    let workflowMeta = resolved?.meta
    const packageName = resolved?.packageName ?? null

    if (!workflowMeta) {
      const dynamicWorkflows = await this.getAIGeneratedWorkflows()
      const match = dynamicWorkflows.find((w) => w.workflowName === name)
      if (match?.graph) {
        workflowMeta = match.graph
      }
    }

    if (!workflowMeta) {
      throw new WorkflowNotFoundError(name)
    }

    if (
      workflowMeta.source === 'graph' ||
      workflowMeta.source === 'dynamic-workflow'
    ) {
      const shouldInline =
        options?.inline || !getSingletonServices()?.queueService
      return runWorkflowGraph(
        this,
        name,
        input,
        rpcService,
        shouldInline,
        options?.startNode,
        wire,
        workflowMeta
      )
    }

    // DSL workflow - check registration exists
    const registrations = pikkuState(packageName, 'workflows', 'registrations')
    const workflow = registrations.get(resolved?.resolvedName ?? name)

    if (!workflow) {
      throw new WorkflowNotFoundError(name)
    }

    if (!workflowMeta.graphHash) {
      throw new Error(`Missing workflow graphHash for '${name}'`)
    }

    const shouldInline =
      options?.inline || !getSingletonServices()?.queueService

    const runId = await this.createRun(
      name,
      input,
      shouldInline,
      workflowMeta.graphHash,
      wire,
      {
        deterministic: workflowMeta.deterministic,
        plannedSteps: workflowMeta.plannedSteps,
      }
    )

    if (shouldInline) {
      this.inlineRuns.add(runId)
      try {
        await this.runWorkflowJob(runId, rpcService)
      } catch (error: any) {
        if (
          error.name !== 'WorkflowAsyncException' &&
          error.name !== 'WorkflowCancelledException' &&
          error.name !== 'WorkflowSuspendedException'
        ) {
          await this.updateRunStatus(runId, 'failed', undefined, {
            name: error.name,
            message: error.message,
            stack: error.stack,
          })
          getSingletonServices()!.logger.error(
            `Workflow ${name} (run ${runId}) failed:`,
            error
          )
          throw error
        }
      } finally {
        this.inlineRuns.delete(runId)
      }
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
    const { runId } = await this.startWorkflow(
      name,
      input,
      options?.wire ?? { type: 'internal' },
      rpcService,
      { inline: true }
    )
    while (true) {
      const run = await this.getRun(runId)
      if (!run) {
        throw new WorkflowRunNotFoundError(runId)
      }
      if (WORKFLOW_END_STATES.has(run.status)) {
        if (run.status === 'failed') {
          throw new WorkflowRunFailedError(run.error?.message)
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

    const resolved = resolveWorkflowMeta(run.workflow)
    const workflowMeta = resolved?.meta
    const pkgName = resolved?.packageName ?? null

    if (
      run.graphHash &&
      workflowMeta?.graphHash &&
      run.graphHash !== workflowMeta.graphHash
    ) {
      await this.runVersionMismatchFallback(run, workflowMeta, rpcService)
      return
    }

    if (
      workflowMeta?.source === 'graph' ||
      workflowMeta?.source === 'dynamic-workflow'
    ) {
      await continueGraph(this, runId, run.workflow)
      const updatedRun = await this.getRun(runId)
      if (updatedRun?.status === 'completed') {
        await this.onChildWorkflowCompleted(updatedRun, updatedRun.output)
      } else if (
        updatedRun?.status === 'failed' ||
        updatedRun?.status === 'cancelled'
      ) {
        await this.onChildWorkflowFailed(
          updatedRun,
          new Error(updatedRun.error?.message || 'Child workflow failed')
        )
      }
      return
    }

    if (!workflowMeta) {
      const dynamicWorkflows = await this.getAIGeneratedWorkflows()
      const match = dynamicWorkflows.find(
        (w) => w.workflowName === run.workflow
      )
      if (match?.graph) {
        await continueGraph(this, runId, run.workflow, match.graph)
        const updatedRun = await this.getRun(runId)
        if (updatedRun?.status === 'completed') {
          await this.onChildWorkflowCompleted(updatedRun, updatedRun.output)
        } else if (
          updatedRun?.status === 'failed' ||
          updatedRun?.status === 'cancelled'
        ) {
          await this.onChildWorkflowFailed(
            updatedRun,
            new Error(updatedRun.error?.message || 'Child workflow failed')
          )
        }
        return
      }
    }

    const registrations = pikkuState(pkgName, 'workflows', 'registrations')
    const workflow = registrations.get(resolved?.resolvedName ?? run.workflow)
    if (!workflow) {
      throw new WorkflowNotFoundError(run.workflow)
    }

    await this.withRunLock(runId, async () => {
      const addonNs = run.workflow.includes(':')
        ? run.workflow.substring(0, run.workflow.indexOf(':'))
        : null
      const workflowWire = this.createWorkflowWire(
        run.workflow,
        runId,
        rpcService,
        addonNs
      )
      workflowWire.pikkuUserId = run.wire?.pikkuUserId
      const wire: PikkuWire = {
        workflow: workflowWire,
        pikkuUserId: run.wire?.pikkuUserId,
        session: rpcService.wire?.session,
        rpc: rpcService.wire?.rpc,
      }
      try {
        const result = await runPikkuFunc(
          'workflow',
          workflowMeta.name,
          workflowMeta.pikkuFuncId,
          {
            singletonServices: getSingletonServices()!,
            wire,
            createWireServices: getCreateWireServices(),
            data: () => run.input,
            packageName: pkgName ?? undefined,
          }
        )

        await this.updateRunStatus(runId, 'completed', result)
        await this.onChildWorkflowCompleted(run, result)
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
          await this.onChildWorkflowFailed(run, error)
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
        await this.onChildWorkflowFailed(run, error)

        throw error
      }
    })
  }

  private async onChildWorkflowCompleted(
    childRun: WorkflowRun,
    result: any
  ): Promise<void> {
    const { parentRunId, parentStepId } = childRun.wire ?? {}
    if (!parentRunId || !parentStepId) return

    this.logger?.debug(
      `Child workflow ${childRun.id} completed, updating parent step ${parentStepId}`
    )
    await this.setStepResult(parentStepId, result)
    await this.resumeWorkflow(parentRunId)
  }

  private async onChildWorkflowFailed(
    childRun: WorkflowRun,
    error: Error
  ): Promise<void> {
    const { parentRunId, parentStepId } = childRun.wire ?? {}
    if (!parentRunId || !parentStepId) return

    this.logger?.debug(
      `Child workflow ${childRun.id} failed, updating parent step ${parentStepId}`
    )
    await this.setStepError(parentStepId, error)
    await this.resumeWorkflow(parentRunId)
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

      // Idempotency - if already succeeded, nothing to do
      if (stepState.status === 'succeeded') {
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

      if (stepState.status === 'pending' || stepState.status === 'scheduled') {
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

        const isGraphWorkflow =
          workflowMeta?.source === 'graph' ||
          workflowMeta?.source === 'dynamic-workflow'
        if (
          isGraphWorkflow &&
          workflowMeta?.nodes &&
          stepName in workflowMeta.nodes
        ) {
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
          // Check if rpcName refers to a sub-workflow
          const subWorkflowMeta = meta[rpcName]
          if (subWorkflowMeta) {
            const childWire: WorkflowRunWire = {
              type: 'workflow',
              id: rpcName,
              parentRunId: runId,
              parentStepId: stepState.stepId,
              pikkuUserId: rpcService.wire?.pikkuUserId,
            }
            const shouldInline = !getSingletonServices()?.queueService
            const { runId: childRunId } = await this.startWorkflow(
              rpcName,
              data,
              childWire,
              rpcService,
              { inline: shouldInline }
            )
            await this.setStepChildRunId(stepState.stepId, childRunId)
            if (shouldInline) {
              const childRun = await this.getRun(childRunId)
              if (childRun?.status === 'failed') {
                throw new Error(
                  childRun.error?.message || 'Sub-workflow failed'
                )
              }
              if (childRun?.status === 'cancelled') {
                throw new Error('Sub-workflow was cancelled')
              }
              result = childRun?.output
            } else {
              throw new ChildWorkflowStartedException(
                runId,
                stepState.stepId,
                childRunId
              )
            }
          } else {
            result = await rpcService.rpcWithWire(rpcName, data, {
              workflowStep: {
                runId,
                stepId: stepState.stepId,
                invocationId: deriveInvocationId(runId, stepName),
                attemptCount: stepState.attemptCount,
              },
            })
          }
        }

        // Store result and mark succeeded
        await this.setStepResult(stepState.stepId, result)

        // Resume orchestrator to continue workflow
        await this.resumeWorkflow(runId)
      } catch (error: any) {
        if (error instanceof ChildWorkflowStartedException) {
          this.logger?.debug(
            `Workflow step '${stepName}': child workflow ${error.childRunId} started, waiting for completion`
          )
          return
        }

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

        const maxAttempts = (stepState.retries ?? DEFAULT_STEP_RETRIES) + 1
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
    if (!getSingletonServices()?.queueService) {
      throw new Error(
        'QueueService not configured. Remote workflows require a queue service.'
      )
    }

    return getSingletonServices()!.queueService!
  }

  private async rpcStep(
    runId: string,
    stepName: string,
    rpcName: string,
    data: any,
    rpcService: any,
    stepOptions?: WorkflowStepOptions
  ): Promise<any> {
    // Resolve the retry policy ONCE here so the value persisted on the step
    // (which drives `retriesExhausted`) is the same one the queue dispatch turns
    // into `attempts`. Without this the queue could retry N times while the
    // engine thinks retries are already exhausted (or vice-versa).
    const resolvedStepOptions: WorkflowStepOptions = {
      retries: stepOptions?.retries ?? DEFAULT_STEP_RETRIES,
      retryDelay: stepOptions?.retryDelay,
    }
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
        resolvedStepOptions
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

    // Hand off to subclass-overridable transport. Default behavior enqueues
    // via the queue service; DO-style subclasses RPC to a step worker.
    const dispatched = await this.dispatchStep(
      runId,
      stepName,
      rpcName,
      data,
      resolvedStepOptions
    )
    if (dispatched) {
      throw new WorkflowAsyncException(runId, stepName)
    }

    {
      // Inline (no transport available) - execute locally with retry loop
      const retries = resolvedStepOptions.retries ?? this.getConfig().retries
      const retryDelay = resolvedStepOptions.retryDelay
      let currentStepState = stepState

      while (true) {
        try {
          await this.setStepRunning(currentStepState.stepId)
          // Check if the name refers to a workflow
          const workflowMeta = pikkuState(null, 'workflows', 'meta')[rpcName]
          let result: any
          if (workflowMeta) {
            const childWire = {
              type: 'workflow',
              id: rpcName,
              parentRunId: runId,
              pikkuUserId: rpcService.wire?.pikkuUserId,
            }
            const { runId: childRunId } = await this.startWorkflow(
              rpcName,
              data,
              childWire,
              rpcService,
              { inline: true }
            )
            await this.setStepChildRunId(currentStepState.stepId, childRunId)
            // Poll until child workflow completes
            while (true) {
              const childRun = await this.getRun(childRunId)
              if (!childRun) {
                throw new WorkflowRunNotFoundError(childRunId)
              }
              if (WORKFLOW_END_STATES.has(childRun.status)) {
                if (childRun.status === 'failed') {
                  throw new Error(
                    childRun.error?.message || 'Sub-workflow failed'
                  )
                }
                if (childRun.status === 'cancelled') {
                  throw new Error('Sub-workflow was cancelled')
                }
                result = childRun.output
                break
              }
              await new Promise((resolve) => setTimeout(resolve, 500))
            }
          } else {
            result = await rpcService.rpcWithWire(rpcName, data, {
              workflowStep: {
                runId,
                stepId: currentStepState.stepId,
                invocationId: deriveInvocationId(runId, stepName),
                attemptCount: currentStepState.attemptCount,
              },
            })
          }
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

    // Hand off to subclass-overridable transport. Default behavior schedules
    // a delayed sleeper RPC via the scheduler service; DO-style subclasses
    // override to use native timer primitives (e.g. setAlarm).
    const scheduled = await this.scheduleSleep(
      runId,
      stepState.stepId,
      duration
    )
    if (scheduled) {
      throw new WorkflowAsyncException(runId, stepName)
    }

    // Inline mode - use setTimeout with actual duration
    await new Promise((resolve) =>
      setTimeout(resolve, getDurationInMilliseconds(duration))
    )
    await this.setStepResult(stepState.stepId, null)
  }

  /**
   * Derive the durable step name for a suspend point from its `reason`, so each
   * distinct reason is its own step row — letting one workflow have multiple
   * independent suspends (e.g. wait-for-build, then wait-for-approval), and
   * supporting dynamic reasons in loops (`suspend(`Wait for ${i}`)`) exactly
   * like dynamic `do()` step names. The reason is used raw (it's just a text
   * step name), only namespaced so it can't collide with a `do`/`sleep` step of
   * the same name. Like `do()` / `sleep()`, the reason is the step's stable
   * identity: it MUST be derived deterministically so it's the same every time
   * the workflow replays through that point.
   */
  private getSuspendStepName(reason: string): string {
    return `__workflow_suspend:${reason}`
  }

  private async suspendStep(runId: string, reason: string): Promise<void> {
    const suspendStepName = this.getSuspendStepName(reason)
    await this.withStepLock(runId, suspendStepName, async () => {
      let stepState: StepState
      try {
        stepState = await this.getStepState(runId, suspendStepName)
      } catch {
        stepState = await this.insertStepState(
          runId,
          suspendStepName,
          'pikkuWorkflowSuspend',
          {
            reason,
          }
        )
      }
      if (!stepState.stepId) {
        stepState = await this.insertStepState(
          runId,
          suspendStepName,
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

  public createWorkflowWire(
    name: string,
    runId: string,
    rpcService: any,
    addonNamespace?: string | null
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
          const resolvedRpcName =
            addonNamespace && !rpcNameOrFn.includes(':')
              ? `${addonNamespace}:${rpcNameOrFn}`
              : rpcNameOrFn
          return await this.rpcStep(
            runId,
            stepName,
            resolvedRpcName,
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
        this.verifyStepName(reason)
        await this.suspendStep(runId, reason)
      },
    }
    return workflowWire
  }

  private verifyStepName(stepName: string) {
    if (typeof stepName !== 'string') {
      throw new WorkflowStepNameNotString(stepName)
    }
  }

  private getConfig(): WorkflowServiceConfig {
    const singletonServices = getSingletonServices()
    const workflow = singletonServices.config?.workflow
    return {
      retries: workflow?.retries ?? DEFAULT_STEP_RETRIES,
      retryDelay: workflow?.retryDelay ?? 0,
      orchestratorQueueName:
        workflow?.orchestratorQueueName ?? 'pikku-workflow-orchestrator',
      stepWorkerQueueName:
        workflow?.stepWorkerQueueName ?? 'pikku-workflow-step-worker',
      sleeperRPCName: workflow?.sleeperRPCName ?? 'pikkuWorkflowSleeper',
    }
  }

  /**
   * Get the orchestrator queue name for a specific workflow.
   * Checks queue meta for a per-workflow queue first (e.g. wf-orchestrator-{name}),
   * falls back to the shared orchestrator queue.
   *
   * Reads from `queue.meta` (always populated globally) rather than
   * `queue.registrations` (only populated for queues this unit consumes).
   * In a per-unit deploy the orchestrator unit doesn't consume per-step
   * queues — but it produces to them — so registrations would miss them.
   */
  protected getOrchestratorQueueName(workflowName?: string): string {
    if (workflowName) {
      const perWorkflow = `wf-orchestrator-${toKebab(workflowName)}`
      const meta = pikkuState(null, 'queue', 'meta')
      if (meta[perWorkflow]) {
        return perWorkflow
      }
    }
    return this.getConfig().orchestratorQueueName
  }

  protected getStepWorkerQueueName(rpcName?: string): string {
    if (rpcName) {
      const perStep = `wf-step-${toKebab(rpcName)}`
      const meta = pikkuState(null, 'queue', 'meta')
      if (meta[perStep]) {
        return perStep
      }
    }
    return this.getConfig().stepWorkerQueueName
  }
}
