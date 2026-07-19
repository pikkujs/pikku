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
import { createHttpScenarioActors } from '../../services/http-scenario-actors.js'

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
import { runScheduledTask } from '../scheduler/scheduler-runner.js'
import type {
  ApprovalOutcome,
  PikkuScenarioWire,
  StepState,
  StepStatus,
  WorkflowApprovalOptions,
  WorkflowPlannedStep,
  WorkflowRun,
  WorkflowRunMirror,
  WorkflowRunStatus,
  WorkflowRunWire,
  WorkflowStatus,
  WorkflowVersionStatus,
  WorkflowServiceConfig,
  WorkflowStepOptions,
  WorkflowExpectEventuallyOptions,
  WorkflowExpectErrorOptions,
  WorkflowExpectServiceOptions,
} from './workflow.types.js'
import {
  continueGraph,
  executeGraphStep,
  runWorkflowGraph,
  runFromMeta,
} from './graph/graph-runner.js'
import type { WorkflowService } from '../../services/workflow-service.js'
import type { ScenarioActors } from '../../services/scenario-actors-service.js'
import {
  PikkuError,
  addError,
  isExpectedError,
} from '../../errors/error-handler.js'
import { RPCNotFoundError } from '../rpc/rpc-runner.js'
import { ChildWorkflowStartedException } from './graph/graph-runner.js'
import { deriveInvocationId } from './workflow-invocation-id.js'
import {
  buildRunTimeline,
  reconstructStateAt,
  type RunTimeline,
  type ReconstructedRunState,
} from './run-timeline.js'
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
 * Thrown when a step (or the orchestrator) could not be enqueued — the queue
 * itself failed (e.g. pg-boss is momentarily down), NOT the step's own logic.
 * This is transient infrastructure failure: the run is left untouched (the step
 * stays `pending`, the run stays running) and the orchestrator job is rethrown
 * so the queue redelivers it and the workflow replays from its snapshot. Treat
 * it as non-terminal — never mark the run `failed` for it.
 */
export class WorkflowDispatchException extends Error {
  constructor(
    public readonly runId: string,
    public readonly stepName: string,
    options?: { cause?: unknown }
  ) {
    super(
      `Failed to dispatch workflow step '${stepName}' (run ${runId})`,
      options
    )
    this.name = 'WorkflowDispatchException'
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

export class WorkflowRunCancelledError extends PikkuError {
  constructor() {
    super('Workflow was cancelled')
  }
}
addError(WorkflowRunCancelledError, {
  status: 409,
  message: 'Workflow was cancelled.',
})

/**
 * A decision arrived for an approval gate that has already resolved. The gate
 * caches its outcome as the step result and never re-reads run state, so the
 * decision could not take effect — it is rejected rather than accepted and
 * dropped.
 */
export class WorkflowApprovalResolvedError extends PikkuError {
  public payload: {
    reason: string
    outcome: ApprovalOutcome<unknown>['status']
  }
  constructor(reason: string, outcome: ApprovalOutcome<unknown>['status']) {
    super(`Approval already ${outcome}: ${reason}`)
    this.payload = { reason, outcome }
  }
}
addError(WorkflowApprovalResolvedError, {
  status: 409,
  message: 'Approval has already been resolved.',
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
  // User-flow actors per run: live authenticated clients (cookie jars) are
  // process-local by nature, so they ride this map, never the persisted wire.
  private runActors = new Map<string, ScenarioActors>()

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

  /**
   * Wire the queue-based orchestrator/step/sleeper workers.
   * Subclasses that orchestrate without queues (e.g. Durable Objects) should
   * pass `wireQueues: false` to the base constructor and skip this entirely.
   * Call this explicitly after adding addons dynamically.
   */
  public wireQueueWorkers(): void {
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
      {
        status: StepStatus
        startedAt?: Date
        completedAt?: Date
        attempts: number
      }
    >()
    for (const step of history) {
      const existing = stepMap.get(step.stepName)
      if (!existing || step.updatedAt > existing.completedAt!) {
        stepMap.set(step.stepName, {
          status: step.status,
          startedAt: step.runningAt ?? step.createdAt,
          completedAt: step.succeededAt ?? step.failedAt,
          attempts: step.attemptCount,
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
      attempts: s.attempts,
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
   * Build the run's time-travel event stream from durable history.
   * @param id - Run ID
   * @returns Ordered timeline, or null if the run doesn't exist
   */
  public async getRunTimeline(id: string): Promise<RunTimeline | null> {
    const run = await this.getRun(id)
    if (!run) return null
    return buildRunTimeline(await this.getRunHistory(id))
  }

  /**
   * Reconstruct the run's state at a point in its timeline.
   * @param id - Run ID
   * @param at - A seq index (inclusive) or a Date (inclusive); omit for the
   *             final state.
   * @returns Reconstructed state, or null if the run doesn't exist
   */
  public async reconstructRunStateAt(
    id: string,
    at?: number | Date
  ): Promise<ReconstructedRunState | null> {
    const timeline = await this.getRunTimeline(id)
    if (!timeline) return null
    return reconstructStateAt(timeline, at ?? timeline.length - 1)
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
    stepOptions?: WorkflowStepOptions,
    fromStepName?: string
  ): Promise<StepState> {
    const step = await this.insertStepStateImpl(
      runId,
      stepName,
      rpcName,
      data,
      stepOptions,
      fromStepName
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
    stepOptions?: WorkflowStepOptions,
    fromStepName?: string
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
      expected: isExpectedError(error),
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
   * List every step instance of a run (any status) with its predecessor.
   * Drives bounded graph revisits: the runner counts instances per logical node
   * and treats each `fromStepName → node` as a once-fired transition.
   * @param runId - Run ID
   */
  abstract getStepInstances(runId: string): Promise<
    Array<{
      stepName: string
      status: StepStatus
      fromStepName?: string
    }>
  >

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
    // Carry an explicit retry policy on the orchestrator job too. Orchestrator
    // runs are idempotent (they replay from the snapshot, returning cached step
    // results), so redelivery is always safe — and it's what lets a transient
    // dispatch/infra failure recover: the job is rethrown and retried instead of
    // the run hanging. Passing `attempts` per-job overrides the queue default, so
    // this holds even when the orchestrator queue is configured `retry_limit 0`.
    await queueService.add(
      this.getOrchestratorQueueName(workflowName),
      { runId },
      this.resolveStepJobOptions()
    )
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
    // A concrete retryDelay (15000, '15s') is a fixed backoff; only the literal
    // 'exponential' — or no delay at all — selects exponential.
    const backoff =
      retryDelay !== undefined && retryDelay !== 'exponential'
        ? { type: 'fixed', delay: getDurationInMilliseconds(retryDelay) }
        : retries > 0 || retryDelay === 'exponential'
          ? 'exponential'
          : undefined
    return { attempts: retries + 1, ...(backoff ? { backoff } : {}) }
  }

  public async queueStepWorker(
    runId: string,
    stepName: string,
    rpcName: string,
    data: any,
    stepOptions?: WorkflowStepOptions,
    fromStepName?: string
  ): Promise<void> {
    const queueService = this.verifyQueueService()
    await queueService.add(
      this.getStepWorkerQueueName(rpcName),
      JSON.parse(
        JSON.stringify({ runId, stepName, rpcName, data, fromStepName })
      ),
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
    stepOptions?: WorkflowStepOptions,
    fromStepName?: string
  ): Promise<boolean> {
    // Step execution is decided purely by the function's `workflowQueued` flag
    // (default false). Only a function explicitly marked `workflowQueued: true`
    // dispatches via the queue. If the queue service is not configured that is
    // a hard error — there is no inline fallback.
    const functionsMeta = pikkuState(null, 'function', 'meta')
    const rpcFuncId = pikkuState(null, 'rpc', 'meta')[rpcName]
    const rpcMeta =
      typeof rpcFuncId === 'string' ? functionsMeta[rpcFuncId] : undefined
    const forceQueue = rpcMeta?.workflowQueued === true
    if (!forceQueue) {
      return false
    }
    if (!getSingletonServices()?.queueService) {
      throw new Error(
        `Workflow step '${stepName}' (function '${rpcName}') is marked 'workflowQueued: true' but no queue service is configured.`
      )
    }
    try {
      await getSingletonServices()!.queueService!.add(
        this.getStepWorkerQueueName(rpcName),
        JSON.parse(
          JSON.stringify({ runId, stepName, rpcName, data, fromStepName })
        ),
        this.resolveStepJobOptions(stepOptions)
      )
    } catch (cause) {
      // The queue is down/unreachable — NOT a step failure. Surface it as a
      // transient dispatch error so the caller leaves the step `pending` and the
      // orchestrator job is retried (replayed from snapshot) rather than the run
      // being marked failed. `add` already throws on failure in every adapter.
      throw new WorkflowDispatchException(runId, stepName, { cause })
    }
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

  /** Build HTTP scenario actors for a run started without them; undefined when SCENARIO_ACTOR_SECRET or the API URL is missing */
  private async resolveScenarioActors(): Promise<ScenarioActors | undefined> {
    const services = getSingletonServices()
    const variables = services?.variables
    const metaService = services?.metaService
    if (!variables || !metaService) {
      return undefined
    }
    const secret = await variables.get('SCENARIO_ACTOR_SECRET')
    const apiUrl = await variables.get('API_URL')
    if (!secret || !apiUrl) {
      services?.logger?.warn(
        'A scenario was started without actors but SCENARIO_ACTOR_SECRET / API_URL is not configured — running without actors.'
      )
      return undefined
    }
    const actorsConfig = await metaService.getScenarioActorsMeta()
    if (!actorsConfig || Object.keys(actorsConfig).length === 0) {
      return undefined
    }
    const signInPath =
      (await variables.get('SCENARIO_SIGN_IN_PATH')) ??
      '/api/auth/sign-in/actor'
    const rpcPath = (await variables.get('SCENARIO_RPC_PATH')) ?? '/rpc'
    return createHttpScenarioActors({
      apiUrl,
      secret,
      actors: actorsConfig,
      signInPath,
      rpcPath,
    })
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
    options?: { inline?: boolean; startNode?: string; actors?: ScenarioActors }
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

    const actors =
      options?.actors ??
      (workflowMeta.source === 'scenario'
        ? await this.resolveScenarioActors()
        : undefined)
    if (actors) {
      this.runActors.set(runId, actors)
    }

    if (shouldInline) {
      this.inlineRuns.add(runId)
      try {
        await this.runWorkflowJob(runId, rpcService)
      } catch (error: any) {
        if (
          error.name !== 'WorkflowAsyncException' &&
          error.name !== 'WorkflowCancelledException' &&
          error.name !== 'WorkflowSuspendedException' &&
          // Transient queue failure — leave the run resumable, don't fail it.
          error.name !== 'WorkflowDispatchException'
        ) {
          await this.updateRunStatus(runId, 'failed', undefined, {
            name: error.name,
            message: error.message,
            stack: error.stack,
          })
          // An expected failure (a PikkuError, e.g. a build gate tripping) —
          // its message is the whole story, so don't dump the stack. The
          // `expected` flag survives the step-boundary rehydration that strips
          // the class. Anything else is an uncaught/unexpected error: log it in
          // full so the trace is there to debug.
          getSingletonServices()!.logger.error(
            `Workflow ${name} (run ${runId}) failed:`,
            isExpectedError(error) ? error.message : error
          )
          throw error
        }
        if (error.name === 'WorkflowDispatchException') {
          // Rethrow so the caller (poll loop / starter) sees the transient
          // failure; the run stays running and can be resumed.
          throw error
        }
      } finally {
        this.inlineRuns.delete(runId)
        this.runActors.delete(runId)
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
          throw new WorkflowRunCancelledError()
        }
        return run.output
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval))
    }
  }

  // Per-run, per-replay ordinal counters (runId → stepName → count).
  private stepOrdinals = new Map<string, Map<string, number>>()
  // Previous step key reached in the current DSL walk (runId → stepName), so a
  // new step records where it came from. Rebuilt each replay alongside ordinals.
  private stepLineage = new Map<string, string>()

  private resetStepOrdinals(runId: string): void {
    this.stepOrdinals.set(runId, new Map())
    this.stepLineage.delete(runId)
  }

  /** The step the DSL walk last reached (the predecessor for the next step). */
  private lastStepName(runId: string): string | undefined {
    return this.stepLineage.get(runId)
  }

  /**
   * Physical, replay-stable key for the Nth reach of `logicalStepName` in a run:
   * bare name for the first reach (ordinal 0, unchanged behavior), `name#N` for
   * repeats — so the same literal step name can be invoked multiple times without
   * the rows clobbering. Deterministic given a deterministic DSL body.
   */
  private nextStepKey(runId: string, logicalStepName: string): string {
    let perRun = this.stepOrdinals.get(runId)
    if (!perRun) {
      perRun = new Map()
      this.stepOrdinals.set(runId, perRun)
    }
    const ordinal = perRun.get(logicalStepName) ?? 0
    perRun.set(logicalStepName, ordinal + 1)
    const stepName =
      ordinal === 0 ? logicalStepName : `${logicalStepName}#${ordinal}`
    this.stepLineage.set(runId, stepName)
    return stepName
  }

  public async runWorkflowJob(runId: string, rpcService: any): Promise<void> {
    // Fresh ordinal counters per replay so step keys are deterministic.
    this.resetStepOrdinals(runId)
    try {
      await this.runWorkflowJobInner(runId, rpcService)
    } finally {
      this.stepOrdinals.delete(runId)
    }
  }

  private async runWorkflowJobInner(
    runId: string,
    rpcService: any
  ): Promise<void> {
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
        scenario:
          workflowMeta?.source === 'scenario' ? workflowWire : undefined,
        pikkuUserId: run.wire?.pikkuUserId,
        session: rpcService?.wire?.session,
        rpc: rpcService?.wire?.rpc,
        // User-flow actors registered for this run (see startWorkflow options)
        actors: this.runActors.get(runId),
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
    // Claim the step under the lock ONLY (atomic check-and-mark-running). Do NOT
    // hold the advisory lock — and its pooled connection — across execution: once
    // a step is 'running' the guard below makes any concurrent worker return
    // early, so the work + result persistence run with the lock released. Holding
    // the lock across executeGraphStep (network I/O + more pool queries) let
    // concurrent steps exhaust the connection pool and self-deadlock.
    const claimed = await this.withStepLock(runId, stepName, async () => {
      const stepState = await this.getStepState(runId, stepName)
      // Already succeeded, or already claimed by another worker — nothing to do.
      if (stepState.status === 'succeeded' || stepState.status === 'running') {
        return null
      }
      // A 'failed' status means this is a retry — start a fresh 'running' attempt.
      if (stepState.status === 'failed') {
        return this.createRetryAttempt(stepState.stepId, 'running')
      }
      if (stepState.status === 'pending' || stepState.status === 'scheduled') {
        await this.setStepRunning(stepState.stepId)
      }
      return stepState
    })

    // Nothing to execute: already succeeded, or another worker owns this step.
    if (!claimed) {
      return
    }
    const stepState = claimed

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
      // Map the physical step key back to its logical node: a revisit instance
      // is `node#N` (ordinal), which isn't a literal key in `nodes`.
      let graphNodeId: string | undefined
      if (isGraphWorkflow && workflowMeta?.nodes) {
        if (stepName in workflowMeta.nodes) {
          graphNodeId = stepName
        } else {
          const hash = stepName.lastIndexOf('#')
          const base = hash > 0 ? stepName.slice(0, hash) : undefined
          if (base && base in workflowMeta.nodes) graphNodeId = base
        }
      }
      if (graphNodeId) {
        result = await executeGraphStep(
          this,
          rpcService,
          runId,
          stepState.stepId,
          graphNodeId,
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
              throw new Error(childRun.error?.message || 'Sub-workflow failed')
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
          result = await this.invokeStepRpc(
            runId,
            stepName,
            stepState,
            rpcName,
            data,
            rpcService
          )
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

      if (error.name === 'WorkflowDispatchException') {
        // Transient: the queue was unreachable, not a workflow failure. Leave the
        // run running and rethrow so the orchestrator job is redelivered and the
        // workflow replays from its snapshot. Do NOT mark the run failed.
        getSingletonServices()!.logger.warn(
          `Workflow run ${runId} could not dispatch a step (queue unavailable); leaving run for orchestrator retry`,
          error
        )
        throw error
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

  /**
   * Invoke a step's RPC with the workflow-step wire (step identity + provenance).
   * Identical for the queue executor and the inline executor — the only thing
   * that differs between transports is who calls it, not the call itself.
   */
  private async invokeStepRpc(
    runId: string,
    stepName: string,
    stepState: StepState,
    rpcName: string,
    data: any,
    rpcService: any
  ): Promise<any> {
    // Carry the run's pikkuUserId onto the step wire so authed steps rehydrate their
    // session on the queued path too (the bare job wire lacks it; inline already has it).
    const run = await this.getRun(runId)
    return rpcService.rpcWithWire(rpcName, data, {
      ...(run?.wire?.pikkuUserId ? { pikkuUserId: run.wire.pikkuUserId } : {}),
      workflowStep: {
        runId,
        stepId: stepState.stepId,
        invocationId: deriveInvocationId(runId, stepName),
        attemptCount: stepState.attemptCount,
        fromInvocationId: stepState.fromStepName
          ? deriveInvocationId(runId, stepState.fromStepName)
          : undefined,
      },
    })
  }

  /**
   * Inline (straight-through) step execution with an in-process retry loop —
   * shared by inline RPC steps and inline function steps. Same scaffolding
   * (running → result, or fail → retry-attempt → backoff → retry) wrapped
   * around a step-specific `doWork` body. Stays O(K): no suspend/replay.
   *
   * `onError` is an optional hook for terminal errors that must NOT retry
   * (e.g. RPC-not-found → suspend the run for redeploy). If it throws, the
   * loop exits immediately without recording a step error or retrying.
   */
  private async runInlineRetryLoop(
    stepState: StepState,
    retries: number,
    retryDelay: WorkflowStepOptions['retryDelay'],
    doWork: (currentStepState: StepState) => Promise<any>,
    onError?: (error: any) => Promise<void>
  ): Promise<any> {
    let currentStepState = stepState
    while (true) {
      try {
        await this.setStepRunning(currentStepState.stepId)
        const result = await doWork(currentStepState)
        await this.setStepResult(currentStepState.stepId, result)
        return result
      } catch (error: any) {
        if (onError) await onError(error)

        // Record the error (marks step as failed)
        await this.setStepError(currentStepState.stepId, error)

        if (currentStepState.attemptCount < retries) {
          // Create a new pending retry attempt, then back off if configured.
          currentStepState = await this.createRetryAttempt(
            currentStepState.stepId,
            'pending'
          )
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

  private async rpcStep(
    runId: string,
    logicalStepName: string,
    rpcName: string,
    data: any,
    rpcService: any,
    stepOptions?: WorkflowStepOptions
  ): Promise<any> {
    // Capture the predecessor before nextStepKey advances the lineage to us.
    const fromStepName = this.lastStepName(runId)
    const stepName = this.nextStepKey(runId, logicalStepName)
    // Resolve the retry policy ONCE here so the value persisted on the step
    // (which drives `retriesExhausted`) is the same one the queue dispatch turns
    // into `attempts`. Without this the queue could retry N times while the
    // engine thinks retries are already exhausted (or vice-versa).
    const resolvedStepOptions: WorkflowStepOptions = {
      retries: stepOptions?.retries ?? DEFAULT_STEP_RETRIES,
      retryDelay: stepOptions?.retryDelay,
      actor: stepOptions?.actor,
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
        resolvedStepOptions,
        fromStepName
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

    // Hand off to subclass-overridable transport. Default behavior enqueues
    // via the queue service; DO-style subclasses RPC to a step worker.
    // Dispatch BEFORE marking the step `scheduled`: if the queue is down,
    // dispatchStep throws WorkflowDispatchException and the step stays `pending`,
    // so the orchestrator's next replay re-dispatches it. Marking `scheduled`
    // first would strand the step (replay sees `scheduled`, pauses, never
    // re-enqueues the job that was never created).
    // Actor steps never queue: they are outbound HTTP calls made by the
    // runner itself, and the actor's session lives on this process.
    const dispatched = resolvedStepOptions.actor
      ? false
      : await this.dispatchStep(
          runId,
          stepName,
          rpcName,
          data,
          resolvedStepOptions,
          fromStepName
        )
    if (dispatched) {
      await this.setStepScheduled(stepState.stepId)
      throw new WorkflowAsyncException(runId, stepName)
    }

    // Inline (no transport available) - execute locally with the shared retry
    // loop. The body resolves to a sub-workflow result or a plain RPC result.
    const retries = resolvedStepOptions.retries ?? this.getConfig().retries
    const retryDelay = resolvedStepOptions.retryDelay

    return this.runInlineRetryLoop(
      stepState,
      retries,
      retryDelay,
      async (currentStepState) => {
        // Actor step: send through the actor's authenticated client over the
        // REAL transport. Never falls back to internal dispatch — that would
        // bypass auth and fake a green health check.
        if (resolvedStepOptions.actor) {
          return resolvedStepOptions.actor.invoke(rpcName, data)
        }
        // Check if the name refers to a workflow
        const workflowMeta = pikkuState(null, 'workflows', 'meta')[rpcName]
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
              return childRun.output
            }
            await new Promise((resolve) => setTimeout(resolve, 500))
          }
        }
        return this.invokeStepRpc(
          runId,
          stepName,
          currentStepState,
          rpcName,
          data,
          rpcService
        )
      },
      async (error) => {
        if (error instanceof RPCNotFoundError) {
          await this.updateRunStatus(runId, 'suspended', undefined, {
            message: `RPC '${rpcName}' not found. Deploy the missing function and resume.`,
            code: 'RPC_NOT_FOUND',
          })
          throw error
        }
      }
    )
  }

  private async inlineStep(
    runId: string,
    logicalStepName: string,
    fn: Function,
    stepOptions?: WorkflowStepOptions
  ): Promise<any> {
    const fromStepName = this.lastStepName(runId)
    const stepName = this.nextStepKey(runId, logicalStepName)
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
        stepOptions,
        fromStepName
      )
    }

    if (stepState.status === 'succeeded') {
      // Return cached result
      return stepState.result
    }

    // Execute inline function
    const retries = stepOptions?.retries ?? this.getConfig().retries
    const retryDelay = stepOptions?.retryDelay ?? this.getConfig().retryDelay

    // Check if we're running inline (in-memory) or remote (queue-based)
    if (this.isInline(runId)) {
      // Inline mode - execute with the shared in-process retry loop.
      return this.runInlineRetryLoop(stepState, retries, retryDelay, () => fn())
    } else {
      // Remote mode - single attempt, then suspend for orchestrator-driven retry.
      let currentStepState = stepState
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

  private async sleepStep(
    runId: string,
    logicalStepName: string,
    duration: number
  ) {
    const fromStepName = this.lastStepName(runId)
    const stepName = this.nextStepKey(runId, logicalStepName)
    // Check if step already exists
    let stepState: StepState
    try {
      stepState = await this.getStepState(runId, stepName)
    } catch {
      // Step doesn't exist - create it (sleep step, no RPC)
      stepState = await this.insertStepState(
        runId,
        stepName,
        null,
        { duration },
        undefined,
        fromStepName
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

    // Hand off to subclass-overridable transport. Default behavior schedules
    // a delayed sleeper RPC via the scheduler service; DO-style subclasses
    // override to use native timer primitives (e.g. setAlarm). Schedule BEFORE
    // marking `scheduled` so a scheduler outage leaves the step `pending` for
    // re-scheduling on replay instead of stranding it (see rpcStep).
    let scheduled: boolean
    try {
      scheduled = await this.scheduleSleep(runId, stepState.stepId, duration)
    } catch (cause) {
      throw new WorkflowDispatchException(runId, stepName, { cause })
    }
    if (scheduled) {
      await this.setStepScheduled(stepState.stepId)
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
    const fromStepName = this.lastStepName(runId)
    const suspendStepName = this.nextStepKey(
      runId,
      this.getSuspendStepName(reason)
    )
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
          },
          undefined,
          fromStepName
        )
      }
      if (!stepState.stepId) {
        stepState = await this.insertStepState(
          runId,
          suspendStepName,
          'pikkuWorkflowSuspend',
          {
            reason,
          },
          undefined,
          fromStepName
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

  /**
   * Wake a run later by enqueuing a delayed orchestrator pass. Deliberately NOT
   * {@link scheduleSleep}: that resolves the step it is given, which for an
   * approval would resolve the gate itself. This only nudges the run to replay
   * and re-evaluate — the gate stays the sole judge of its own outcome.
   *
   * Best-effort by design. Expiry is decided from the recorded deadline on
   * replay, so losing this wake costs liveness (the run sits until something
   * else resumes it), never correctness.
   */
  private async scheduleRunWake(runId: string, delay: number): Promise<void> {
    try {
      const queueService = this.verifyQueueService()
      const run = await this.getRun(runId)
      if (!run?.workflow) return
      await queueService.add(
        this.getOrchestratorQueueName(run.workflow),
        { runId },
        { ...this.resolveStepJobOptions(), delay }
      )
    } catch (error) {
      this.logger?.warn(
        `Failed to schedule approval expiry wake for run ${runId}; expiry will still resolve on the next replay`,
        error
      )
    }
  }

  /**
   * Durable step name for an approval gate. Namespaced separately from suspend
   * so the two can't collide, and derived from `reason` for the same reason
   * {@link getSuspendStepName} is: it must be stable across replays.
   */
  private getApprovalStepName(reason: string): string {
    return `__workflow_approval:${reason}`
  }

  /**
   * Run-state key holding an approval gate's record. Hex-encoded because the
   * Mongo backend restricts state keys to `/^[a-zA-Z0-9_]+$/` and a `reason` is
   * arbitrary human text. One key per gate, so two gates resolving concurrently
   * can't clobber each other through a read-modify-write.
   */
  private approvalStateKey(stepName: string): string {
    let hex = ''
    for (const byte of new TextEncoder().encode(stepName)) {
      hex += byte.toString(16).padStart(2, '0')
    }
    return `__approval_${hex}`
  }

  /**
   * Record a decision against an approval gate and wake the run. Called from
   * outside the workflow (an HTTP route, an RPC), so the schema value is NOT in
   * scope here — the payload is stored raw and validated on replay inside the
   * workflow body, which is the only place the schema exists. An invalid payload
   * therefore leaves the gate closed rather than failing the run.
   *
   * `reason` addresses the first reach of that gate. An approval reached more
   * than once under the same reason (e.g. in a loop) gets `#N`-suffixed step
   * rows that this cannot currently target.
   */
  public async approveStep(
    runId: string,
    reason: string,
    decision: unknown
  ): Promise<void> {
    const stepName = this.getApprovalStepName(reason)
    const stateKey = this.approvalStateKey(stepName)

    // A resolved gate returns its cached step result and never re-reads state,
    // so a decision recorded now would be silently discarded — most obviously
    // when it loses the race with expiry. Reject instead, so the approver
    // learns their decision did not land.
    let resolved: StepState | undefined
    try {
      resolved = await this.getStepState(runId, stepName)
    } catch {
      // No step row yet: the run has not reached the gate. Recording a decision
      // ahead of it is legitimate — the gate picks it up on arrival.
    }
    if (resolved?.stepId && resolved.status === 'succeeded') {
      const outcome = resolved.result as ApprovalOutcome<unknown> | undefined
      throw new WorkflowApprovalResolvedError(
        reason,
        outcome?.status ?? 'decided'
      )
    }

    const state = await this.getRunState(runId)
    const record = (state[stateKey] ?? {}) as Record<string, unknown>
    await this.updateRunState(runId, stateKey, {
      ...record,
      decision,
      decidedAt: new Date().toISOString(),
      error: undefined,
    })
    await this.resumeWorkflow(runId)
  }

  private async approvalStep(
    runId: string,
    reason: string,
    options: WorkflowApprovalOptions
  ): Promise<ApprovalOutcome<unknown>> {
    const fromStepName = this.lastStepName(runId)
    const approvalStepName = this.nextStepKey(
      runId,
      this.getApprovalStepName(reason)
    )
    return await this.withStepLock(runId, approvalStepName, async () => {
      let stepState: StepState
      try {
        stepState = await this.getStepState(runId, approvalStepName)
      } catch {
        stepState = await this.insertStepState(
          runId,
          approvalStepName,
          'pikkuWorkflowApproval',
          { reason, expiry: options.expiry },
          undefined,
          fromStepName
        )
      }
      if (!stepState.stepId) {
        stepState = await this.insertStepState(
          runId,
          approvalStepName,
          'pikkuWorkflowApproval',
          { reason, expiry: options.expiry },
          undefined,
          fromStepName
        )
      }

      // Unlike suspend, `succeeded` here means a decision (or expiry) was
      // actually resolved, and the step result IS the return channel.
      if (stepState.status === 'succeeded') {
        return stepState.result as ApprovalOutcome<unknown>
      }

      const stateKey = this.approvalStateKey(approvalStepName)
      let record = ((await this.getRunState(runId))[stateKey] ?? {}) as {
        decision?: unknown
        decidedAt?: string
        expiresAt?: string
        error?: unknown
      }

      if (stepState.status === 'pending') {
        await this.setStepRunning(stepState.stepId)
        // First reach: stamp the deadline and nudge the run awake when it
        // passes. The deadline is what's authoritative — see below.
        if (options.expiry !== undefined && !record.expiresAt) {
          const expiresAt = new Date(
            Date.now() + getDurationInMilliseconds(options.expiry)
          ).toISOString()
          record = { ...record, expiresAt }
          await this.updateRunState(runId, stateKey, record)
          await this.scheduleRunWake(
            runId,
            getDurationInMilliseconds(options.expiry)
          )
        }
      }

      if (record.decision !== undefined) {
        const validation = await options.schema['~standard'].validate(
          record.decision
        )
        if (validation.issues) {
          // Drop the bad decision and re-close the gate, leaving the failure
          // legible to whoever tries next. Failing the run instead would let any
          // caller kill a workflow with a malformed payload.
          await this.updateRunState(runId, stateKey, {
            ...record,
            decision: undefined,
            decidedAt: undefined,
            error: validation.issues.map((issue) => ({
              message: issue.message,
              path: issue.path?.map((segment) =>
                typeof segment === 'object' ? segment.key : segment
              ),
            })),
          })
          throw new WorkflowSuspendedException(runId, reason)
        }
        const outcome: ApprovalOutcome<unknown> = {
          status: 'decided',
          data: validation.value,
        }
        await this.setStepResult(stepState.stepId, outcome)
        return outcome
      }

      // Expiry is decided by comparing against the recorded deadline rather than
      // by the timer having fired, so a duplicate, late, or dropped timer all
      // produce the same answer.
      if (record.expiresAt && Date.now() >= Date.parse(record.expiresAt)) {
        const outcome: ApprovalOutcome<unknown> = { status: 'expired' }
        await this.setStepResult(stepState.stepId, outcome)
        return outcome
      }

      throw new WorkflowSuspendedException(runId, reason)
    })
  }

  public createWorkflowWire(
    name: string,
    runId: string,
    rpcService: any,
    addonNamespace?: string | null
  ): PikkuScenarioWire {
    const workflowWire: PikkuScenarioWire = {
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

      // Durable polling step: invoke an RPC (as an actor when options.as is
      // set) until the predicate passes or `within` elapses. The whole poll is
      // ONE recorded step, so replay returns the cached outcome.
      expectEventually: async (
        stepName: string,
        rpcName: string,
        data: any,
        predicate: (output: any) => boolean,
        options?: WorkflowExpectEventuallyOptions
      ) => {
        this.verifyStepName(stepName)
        const resolvedRpcName =
          addonNamespace && !rpcName.includes(':')
            ? `${addonNamespace}:${rpcName}`
            : rpcName
        const within = getDurationInMilliseconds(options?.within ?? '30s')
        const interval = getDurationInMilliseconds(options?.interval ?? '1s')
        return await this.inlineStep(
          runId,
          stepName,
          async () => {
            const deadline = Date.now() + within
            let last: any
            while (true) {
              last = options?.actor
                ? await options.actor.invoke(resolvedRpcName, data)
                : await rpcService.rpcWithWire(resolvedRpcName, data, {})
              if (predicate(last)) return last
              if (Date.now() + interval > deadline) {
                throw new Error(
                  `[workflow] expectEventually '${stepName}' ('${resolvedRpcName}'` +
                    `${options?.actor ? ` as '${options.actor.name}'` : ''}) did not pass within ${within}ms; ` +
                    `last result: ${JSON.stringify(last)?.slice(0, 300)}`
                )
              }
              await new Promise((resolve) => setTimeout(resolve, interval))
            }
          },
          options
        )
      },

      expectError: async (
        stepName: string,
        rpcName: string,
        data: any,
        options?: WorkflowExpectErrorOptions
      ) => {
        this.verifyStepName(stepName)
        const resolvedRpcName =
          addonNamespace && !rpcName.includes(':')
            ? `${addonNamespace}:${rpcName}`
            : rpcName
        return await this.inlineStep(
          runId,
          stepName,
          async () => {
            let result: any
            try {
              result = options?.actor
                ? await options.actor.invoke(resolvedRpcName, data)
                : await rpcService.rpcWithWire(resolvedRpcName, data, {})
            } catch (e: any) {
              const message = e?.message ?? String(e)
              if (options?.matches) {
                const matched =
                  typeof options.matches === 'string'
                    ? message.includes(options.matches)
                    : options.matches.test(message)
                if (!matched) {
                  throw new Error(
                    `[workflow] expectError '${stepName}' ('${resolvedRpcName}') threw, but the message did not match ${options.matches}: ${message}`
                  )
                }
              }
              return message
            }
            throw new Error(
              `[workflow] expectError '${stepName}' ('${resolvedRpcName}') expected an error but the call succeeded: ${JSON.stringify(result)?.slice(0, 300)}`
            )
          },
          options
        )
      },

      expectService: async (
        stepName: string,
        serviceMethod: string,
        options?: WorkflowExpectServiceOptions
      ) => {
        this.verifyStepName(stepName)
        const [service, method] = serviceMethod.split('.')
        if (!service || !method) {
          throw new Error(
            `[workflow] expectService '${stepName}' needs 'service.method', got '${serviceMethod}'`
          )
        }
        await this.inlineStep(
          runId,
          stepName,
          async () => {
            const rpcName = 'pikkuScenarioGetStubCalls'
            const calls: Array<{
              service: string
              method: string
              args: unknown[]
            }> = options?.actor
              ? await options.actor.invoke(rpcName, { service })
              : await rpcService.rpcWithWire(rpcName, { service }, {})
            const matching = (calls ?? []).filter(
              (c) =>
                c.service === service &&
                c.method === method &&
                (options?.calledWith === undefined ||
                  JSON.stringify(c.args?.[0]) ===
                    JSON.stringify(options.calledWith))
            )
            const expected = options?.times
            const ok =
              expected === undefined
                ? matching.length > 0
                : matching.length === expected
            if (!ok) {
              const seen =
                (calls ?? [])
                  .map(
                    (c) =>
                      `${c.service}.${c.method}(${JSON.stringify(c.args?.[0])?.slice(0, 120) ?? ''})`
                  )
                  .join('\n  ') || '(none)'
              throw new Error(
                `[workflow] expectService '${stepName}' expected ${expected ?? 'at least one'} call(s) to '${serviceMethod}'` +
                  `${options?.calledWith !== undefined ? ` with ${JSON.stringify(options.calledWith)}` : ''}, found ${matching.length}. Recorded:\n  ${seen}`
              )
            }
          },
          options
        )
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

      approval: (async (reason: string, options: WorkflowApprovalOptions) => {
        this.verifyStepName(reason)
        return await this.approvalStep(runId, reason, options)
      }) as PikkuScenarioWire['approval'],

      runScheduledTask: async (taskName: string) => {
        await runScheduledTask({ name: taskName })
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
