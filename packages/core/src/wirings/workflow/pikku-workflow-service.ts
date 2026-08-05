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
  ApprovalOutcome,
  CoreWorkflow,
  PikkuWorkflowWire,
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
  WorkflowQueueOptions,
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
import type { ScenarioPersonas } from '../../services/personas-service.js'
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
import type {
  GroupConcurrencyConfig,
  JobGroup,
  JobOptions,
  PikkuWorkerConfig,
} from '../queue/queue.types.js'

export const DEFAULT_STEP_RETRIES = 5

export class WorkflowAsyncException extends Error {
  constructor(
    public readonly runId: string,
    public readonly stepName: string
  ) {
    super(`Workflow paused at step: ${stepName}`)
    this.name = 'WorkflowAsyncException'
  }
}

export class WorkflowCancelledException extends Error {
  constructor(
    public readonly runId: string,
    public readonly reason?: string
  ) {
    super(reason || 'Workflow cancelled')
    this.name = 'WorkflowCancelledException'
  }
}

export class WorkflowSuspendedException extends Error {
  constructor(
    public readonly runId: string,
    public readonly reason: string
  ) {
    super(reason || 'Workflow suspended')
    this.name = 'WorkflowSuspendedException'
  }
}

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

export interface RunLifecycleContext {
  runId: string
  run: WorkflowRun
  workflowMeta: any
  workflow: CoreWorkflow
  wire: PikkuWire
  packageName: string | null
}

export interface WorkflowRunEngine {
  inlineStep(
    runId: string,
    logicalStepName: string,
    fn: Function,
    stepOptions?: WorkflowStepOptions,
    data?: any,
    funcName?: string
  ): Promise<any>
  updateRunStatus(
    runId: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<void>
  onChildWorkflowFailed(run: WorkflowRun, error: unknown): Promise<void>
  verifyStepName(stepName: unknown): void
}

export interface WorkflowRunExtension {
  attachRunContext(
    runId: string,
    workflowMeta: any,
    options?: Record<string, any>
  ): Promise<void>
  detachRunContext(runId: string): void
  decorateRunWire(
    wire: PikkuWire,
    context: {
      runId: string
      workflowMeta: any
      workflowWire: PikkuWorkflowWire
    }
  ): void
  decorateWorkflowWire(
    workflowWire: PikkuWorkflowWire,
    context: {
      name: string
      runId: string
      rpcService: any
      addonNamespace?: string | null
    }
  ): void
  onBeforeRunFunc(context: RunLifecycleContext): Promise<void>
  onAfterRunFunc(
    context: RunLifecycleContext,
    outcome: 'completed' | 'failed' | 'interrupted',
    failure: unknown
  ): Promise<void>
}

const WORKFLOW_TERMINAL_STATES: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'cancelled',
])

/** Idle window before a `running` run with nothing in flight is treated as stalled. */
const DEFAULT_STALLED_RUN_MS = 5 * 60_000

/** Runs re-driven per `recoverStalledRuns` call, so one sweep is bounded. */
const DEFAULT_STALLED_RUN_LIMIT = 100

/**
 * How long a step may sit `pending` before the relay assumes its dispatch was
 * lost. This is a bet that no healthy queue takes this long to move a job from
 * `pending` to `running`; set it above the observed p99 of that latency.
 */
const DEFAULT_UNDISPATCHED_STEP_MS = 30_000

/** Steps re-driven per `relayUndispatchedSteps` call, so one tick is bounded. */
const DEFAULT_UNDISPATCHED_STEP_LIMIT = 100

/** First wait before a step already re-dispatched once is re-dispatched again. */
const REDISPATCH_BACKOFF_MS = 30_000

/** Ceiling on the doubling backoff, so a permanently stuck step still gets swept. */
const REDISPATCH_BACKOFF_MAX_MS = 10 * 60_000

/** Bound on the in-process backoff map, so a long-lived process cannot grow it without bound. */
const REDISPATCH_BACKOFF_MAX_ENTRIES = 10_000

const WORKFLOW_POLL_MIN_MS = 10

const WORKFLOW_POLL_FACTOR = 1.6

const WORKFLOW_CHILD_POLL_MAX_MS = 500

type RunContext = {
  activeExecutions: number
  inline?: boolean
  ordinals: Map<string, number>
  lastStep?: string
  replay?: {
    steps?: Map<string, StepState>
    run?: WorkflowRun
  }
}

export abstract class PikkuWorkflowService implements WorkflowService {
  private runExtension?: WorkflowRunExtension

  private runContexts = new Map<string, RunContext>()

  private contextFor(runId: string): RunContext {
    let context = this.runContexts.get(runId)
    if (!context) {
      context = { activeExecutions: 0, ordinals: new Map() }
      this.runContexts.set(runId, context)
    }
    return context
  }

  private releaseContext(runId: string): void {
    const context = this.runContexts.get(runId)
    if (!context) return
    if (context.activeExecutions > 0) return
    this.runContexts.delete(runId)
  }

  private enterExecution(runId: string): RunContext {
    const context = this.contextFor(runId)
    context.activeExecutions++
    return context
  }

  private exitExecution(runId: string): void {
    const context = this.runContexts.get(runId)
    if (!context) return
    if (context.activeExecutions > 0) {
      context.activeExecutions--
    }
    if (context.activeExecutions === 0) {
      context.replay = undefined
      context.ordinals = new Map()
      context.lastStep = undefined
    }
    this.releaseContext(runId)
  }

  protected get logger() {
    return getSingletonServices()?.logger
  }

  protected mirror?: WorkflowRunMirror

  protected readonly queueStrategy: 'per-workflow' | 'shared-groups'
  protected readonly queueConcurrency: number
  protected readonly queueGroupConcurrency: number | GroupConcurrencyConfig

  constructor(
    options: {
      wireQueues?: boolean
      mirror?: WorkflowRunMirror
    } & WorkflowQueueOptions = {}
  ) {
    const wireQueues = options.wireQueues ?? true
    this.mirror = options.mirror
    this.queueStrategy = options.queueStrategy ?? 'per-workflow'
    this.queueConcurrency = options.queueConcurrency ?? 20
    this.queueGroupConcurrency = options.queueGroupConcurrency ?? 2
    if (wireQueues) {
      this.wireQueueWorkers()
    }
  }

  private async mirrored<T>(
    write: () => Promise<T>,
    mirror: (mirror: WorkflowRunMirror, written: T) => Promise<void>
  ): Promise<T> {
    const written = await write()
    if (this.mirror) {
      try {
        await mirror(this.mirror, written)
      } catch (err: any) {
        try {
          this.logger?.warn?.(
            `[pikku] WorkflowRunMirror write failed: ${err?.message ?? err}`
          )
        } catch {
          // knowledge: decisions/internals/workflow-run-mirror-is-never-a-source-of-truth.md
        }
      }
    }
    return written
  }

  public wireQueueWorkers(): void {
    const functions = pikkuState(null, 'function', 'functions')
    const functionsMeta = pikkuState(null, 'function', 'meta')

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
      queueName: string,
      config?: PikkuWorkerConfig
    ) => {
      if (functions.has(funcId)) return
      addFunction(funcId, func as never)
      if (!queueMeta[queueName]) {
        queueMeta[queueName] = { pikkuFuncId: funcId, name: queueName }
      }
      wireQueueWorker({ name: queueName, func, config } as never)
      if (!functionsMeta[funcId]) {
        functionsMeta[funcId] = mkMeta(funcId)
      }
    }

    const sharedGroups = this.queueStrategy === 'shared-groups'
    const sharedQueueConfig: PikkuWorkerConfig | undefined = sharedGroups
      ? {
          batchSize: this.queueConcurrency,
          groupConcurrency: this.queueGroupConcurrency,
        }
      : undefined

    registerWorkflowFunc(
      'pikkuWorkflowOrchestrator',
      { func: pikkuWorkflowOrchestratorFunc },
      'pikku-workflow-orchestrator',
      sharedQueueConfig
    )
    registerWorkflowFunc(
      'pikkuWorkflowStepWorker',
      { func: pikkuWorkflowWorkerFunc },
      'pikku-workflow-step-worker',
      sharedQueueConfig
    )

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

    if (!sharedGroups) {
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
    }

    const workflowCount = Object.keys(
      pikkuState(null, 'workflows', 'meta') ?? {}
    ).length
    const perWorkflowQueues = Object.keys(queueMeta).filter((name) =>
      name.startsWith('wf-orchestrator-')
    ).length
    if (workflowCount > 0 && perWorkflowQueues === 0) {
      this.logger?.warn?.(
        `[pikku] ${workflowCount} workflow(s) registered but no per-workflow orchestrator queues were found in queue meta. ` +
          `All workflows will share a single orchestrator queue, where one slow step blocks every other workflow behind it. ` +
          `Check that the generated bootstrap imports the queue-workers meta (pikku-queue-workers-wirings-meta.gen.js).`
      )
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

  protected async isInline(runId: string): Promise<boolean> {
    const context = this.runContexts.get(runId)
    if (context?.inline !== undefined) {
      return context.inline
    }
    const inline = (await this.getRunIdentity(runId))?.inline === true
    if (context) {
      context.inline = inline
    }
    return inline
  }

  public registerInlineRun(runId: string): void {
    this.contextFor(runId).inline = true
  }

  public unregisterInlineRun(runId: string): void {
    const context = this.runContexts.get(runId)
    if (!context) return
    context.inline = undefined
    this.releaseContext(runId)
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
    return this.mirrored(
      () =>
        this.createRunImpl(
          workflowName,
          input,
          inline,
          graphHash,
          wire,
          options
        ),
      (mirror, runId) =>
        mirror.createRun(
          runId,
          workflowName,
          input,
          inline,
          graphHash,
          wire,
          options
        )
    )
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

  abstract getRun(id: string): Promise<WorkflowRun | null>

  async getRunStatus(id: string): Promise<WorkflowRunStatus | null> {
    const run = await this.getRun(id)
    if (!run) return null

    const history = await this.getRunHistory(id)
    const terminalStatuses = new Set(['completed', 'failed', 'cancelled'])

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

  public async getRunTimeline(id: string): Promise<RunTimeline | null> {
    const run = await this.getRun(id)
    if (!run) return null
    return buildRunTimeline(await this.getRunHistory(id))
  }

  public async reconstructRunStateAt(
    id: string,
    at?: number | Date
  ): Promise<ReconstructedRunState | null> {
    const timeline = await this.getRunTimeline(id)
    if (!timeline) return null
    return reconstructStateAt(timeline, at ?? timeline.length - 1)
  }

  abstract getRunHistory(
    runId: string
  ): Promise<Array<StepState & { stepName: string }>>

  public async updateRunStatus(
    id: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<void> {
    await this.mirrored(
      () => this.updateRunStatusImpl(id, status, output, error),
      (mirror) => mirror.updateRunStatus(id, status, output, error)
    )
    if (WORKFLOW_TERMINAL_STATES.has(status)) {
      this.runExtension?.detachRunContext(id)
      this.releaseContext(id)
    }
  }

  protected abstract updateRunStatusImpl(
    id: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<void>

  public async insertStepState(
    runId: string,
    stepName: string,
    rpcName: string | null,
    data: any,
    stepOptions?: WorkflowStepOptions,
    fromStepName?: string
  ): Promise<StepState> {
    return this.mirrored(
      () =>
        this.insertStepStateImpl(
          runId,
          stepName,
          rpcName,
          data,
          stepOptions,
          fromStepName
        ),
      (mirror, step) =>
        mirror.insertStepState(runId, { ...step, stepName, rpcName, data })
    )
  }

  protected abstract insertStepStateImpl(
    runId: string,
    stepName: string,
    rpcName: string | null,
    data: any,
    stepOptions?: WorkflowStepOptions,
    fromStepName?: string
  ): Promise<StepState>

  abstract getStepState(runId: string, stepName: string): Promise<StepState>

  public async setStepRunning(stepId: string): Promise<void> {
    await this.mirrored(
      () => this.setStepRunningImpl(stepId),
      (mirror) => mirror.setStepRunning(stepId)
    )
  }

  protected abstract setStepRunningImpl(stepId: string): Promise<void>

  public async setStepScheduled(stepId: string): Promise<void> {
    await this.mirrored(
      () => this.setStepScheduledImpl(stepId),
      (mirror) => mirror.setStepScheduled(stepId)
    )
  }

  protected abstract setStepScheduledImpl(stepId: string): Promise<void>

  public async setStepResult(stepId: string, result: any): Promise<void> {
    await this.mirrored(
      () => this.setStepResultImpl(stepId, result),
      (mirror) => mirror.setStepResult(stepId, result)
    )
  }

  protected abstract setStepResultImpl(
    stepId: string,
    result: any
  ): Promise<void>

  public async setStepChildRunId(
    stepId: string,
    childRunId: string
  ): Promise<void> {
    await this.mirrored(
      () => this.setStepChildRunIdImpl(stepId, childRunId),
      (mirror) => mirror.setStepChildRunId(stepId, childRunId)
    )
  }

  protected abstract setStepChildRunIdImpl(
    stepId: string,
    childRunId: string
  ): Promise<void>

  public async setStepError(stepId: string, error: Error): Promise<void> {
    await this.mirrored(
      () => this.setStepErrorImpl(stepId, error),
      (mirror) => {
        const serialized: SerializedError = {
          message: error.message,
          stack: error.stack,
          code: (error as any).code,
          expected: isExpectedError(error),
        }
        return mirror.setStepError(stepId, serialized)
      }
    )
  }

  protected abstract setStepErrorImpl(
    stepId: string,
    error: Error
  ): Promise<void>

  public async createRetryAttempt(
    failedStepId: string,
    status: 'pending' | 'running'
  ): Promise<StepState> {
    return this.mirrored(
      () => this.createRetryAttemptImpl(failedStepId, status),
      (mirror, newStep) =>
        mirror.createRetryAttempt(failedStepId, {
          ...newStep,
          stepName: (newStep as any).stepName ?? '',
        })
    )
  }

  protected abstract createRetryAttemptImpl(
    failedStepId: string,
    status: 'pending' | 'running'
  ): Promise<StepState>

  abstract withRunLock<T>(id: string, fn: () => Promise<T>): Promise<T>

  abstract withStepLock<T>(
    runId: string,
    stepName: string,
    fn: () => Promise<T>
  ): Promise<T>

  abstract close(): Promise<void>

  abstract getCompletedGraphState(runId: string): Promise<{
    completedNodeIds: string[]
    failedNodeIds: string[]
    branchKeys: Record<string, string>
  }>

  abstract getStepInstances(runId: string): Promise<
    Array<{
      stepName: string
      status: StepStatus
      fromStepName?: string
    }>
  >

  abstract getNodeResults(
    runId: string,
    nodeIds: string[]
  ): Promise<Record<string, any>>

  public async setBranchTaken(
    stepId: string,
    branchKey: string
  ): Promise<void> {
    await this.mirrored(
      () => this.setBranchTakenImpl(stepId, branchKey),
      (mirror) => mirror.setBranchTaken(stepId, branchKey)
    )
  }

  protected abstract setBranchTakenImpl(
    stepId: string,
    branchKey: string
  ): Promise<void>

  public async updateRunState(
    runId: string,
    name: string,
    value: unknown
  ): Promise<void> {
    await this.mirrored(
      () => this.updateRunStateImpl(runId, name, value),
      (mirror) => mirror.updateRunState(runId, name, value)
    )
  }

  protected abstract updateRunStateImpl(
    runId: string,
    name: string,
    value: unknown
  ): Promise<void>

  abstract getRunState(runId: string): Promise<Record<string, unknown>>

  public async upsertWorkflowVersion(
    name: string,
    graphHash: string,
    graph: any,
    source: string,
    status?: WorkflowVersionStatus
  ): Promise<void> {
    await this.mirrored(
      () =>
        this.upsertWorkflowVersionImpl(name, graphHash, graph, source, status),
      (mirror) =>
        mirror.upsertWorkflowVersion(name, graphHash, graph, source, status)
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
    await this.mirrored(
      () => this.updateWorkflowVersionStatusImpl(name, graphHash, status),
      (mirror) => mirror.updateWorkflowVersionStatus(name, graphHash, status)
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

  public async resumeWorkflow(
    runId: string,
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
      {
        ...this.resolveStepJobOptions(),
        group: this.getJobGroup(workflowName),
      }
    )
  }

  /**
   * Ids of runs that are stalled: still `running`, with no step in a state that
   * something is expected to complete (`running`, `scheduled`, `suspended`),
   * and no step activity since `before`.
   *
   * Returns nothing by default so a store that cannot express the query keeps
   * working unchanged; a store that overrides it gains crash recovery through
   * `recoverStalledRuns`.
   */
  protected async findStalledRunIds(
    _before: Date,
    _limit: number
  ): Promise<string[]> {
    return []
  }

  /**
   * Re-drive runs whose next move was lost, and report which were resumed.
   *
   * Arming a step is two writes to two systems — the step row, then the queue
   * or scheduler job — so a process that dies between them leaves a run that is
   * `running` with nothing in flight. Nothing notices: the run parks on a step
   * that will never complete and never error, so it neither finishes nor fails.
   * (Seen on a `workflow.sleep()`: a deploy restart landed between the sleep
   * step's insert and its timer, parking the run permanently.)
   *
   * Replay is the recovery — `resumeWorkflow` re-orchestrates from persisted
   * step state, and every settled step is memoized, so resuming a run that was
   * not actually stuck costs an orchestration pass and changes nothing. That
   * idempotence is what makes an idle-time heuristic safe here; a run that is
   * legitimately mid-sleep is excluded anyway, since its step is `scheduled`.
   *
   * This is not self-starting. Call it from a scheduled task at whatever
   * interval suits the workload.
   */
  public async recoverStalledRuns(options?: {
    stalledAfterMs?: number
    limit?: number
  }): Promise<{ resumed: string[] }> {
    const before = new Date(
      Date.now() - (options?.stalledAfterMs ?? DEFAULT_STALLED_RUN_MS)
    )
    const runIds = await this.findStalledRunIds(
      before,
      options?.limit ?? DEFAULT_STALLED_RUN_LIMIT
    )
    const resumed: string[] = []
    for (const runId of runIds) {
      try {
        await this.resumeWorkflow(runId)
        resumed.push(runId)
      } catch (err) {
        // One unresumable run must not stop the sweep from recovering the rest.
        getSingletonServices()?.logger?.error(
          `Failed to resume stalled workflow run ${runId}: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
    return { resumed }
  }

  /**
   * Runs holding a step that has sat `pending` since before `before`, paired
   * with the step that flagged them.
   *
   * Returns nothing by default so a store that cannot express the query keeps
   * working unchanged — and, because it does not opt in, gains no re-dispatches
   * either. A store must have an atomic `withStepLock` before overriding this,
   * or no concurrency for one to exclude: the relay makes duplicate dispatch
   * routine, and the claim in `executeWorkflowStepInner` is what keeps a
   * duplicate from becoming a second execution. `kysely-postgres` and
   * `kysely-mysql` qualify on the lock, `in-memory` on being inline and
   * single-process; `mongodb` and `kysely-sqlite` qualify on neither.
   */
  protected async findUndispatchedSteps(
    _before: Date,
    _limit: number
  ): Promise<Array<{ runId: string; stepId: string }>> {
    return []
  }

  /**
   * Re-drive steps whose dispatch was lost, and report which runs were nudged.
   *
   * Arming a step is two writes to two systems: the step row lands `pending`,
   * then a queue or scheduler job is published. Nothing spans both, so a crash
   * in between leaves a durable row that nothing will ever pick up — the run
   * neither finishes nor fails. (Seen on a `workflow.sleep()`: a deploy restart
   * landed between the sleep step's insert and its timer.)
   *
   * The row is the outbox record and this is the relay. Age is the only signal
   * available — a step `pending` because its dispatch was lost is
   * indistinguishable from one whose job is merely still queued — so a step
   * past `undispatchedAfterMs` is re-dispatched regardless, and correctness
   * rests on the claim rather than on the guess being right. A redundant
   * dispatch costs one queue message: the loser reads `running` and returns
   * without invoking anything.
   *
   * Re-dispatches back off per step (doubling from 30s, capped at 10m) so a
   * genuine queue backlog is not amplified by a tick that keeps firing at the
   * steps the backlog is already delaying. The backoff is per process and
   * advisory — losing it on restart costs extra dispatches, never correctness.
   *
   * This is not self-starting. Call it from a scheduled task; ~30s suits a
   * queue whose `pending`→`running` latency is well under that.
   */
  public async relayUndispatchedSteps(options?: {
    undispatchedAfterMs?: number
    limit?: number
  }): Promise<{ redispatched: string[] }> {
    const before = new Date(
      Date.now() -
        (options?.undispatchedAfterMs ?? DEFAULT_UNDISPATCHED_STEP_MS)
    )
    const steps = await this.findUndispatchedSteps(
      before,
      options?.limit ?? DEFAULT_UNDISPATCHED_STEP_LIMIT
    )

    // Backoff is keyed by run, not step, because the run is the unit of
    // re-drive: `resumeWorkflow` replays the whole run and re-dispatches every
    // step still owed a job. Holding off a single step while resuming its run
    // would not suppress anything.
    const now = Date.now()
    const runIds = new Set<string>()
    for (const { runId } of steps) {
      const eligibleAt = this.redispatchBackoff.get(runId)
      if (eligibleAt !== undefined && eligibleAt > now) {
        continue
      }
      this.noteRedispatch(runId, now)
      runIds.add(runId)
    }

    const redispatched: string[] = []
    for (const runId of runIds) {
      try {
        await this.resumeWorkflow(runId)
        redispatched.push(runId)
      } catch (err) {
        // One unresumable run must not stop the tick from relaying the rest.
        getSingletonServices()?.logger?.error(
          `Failed to re-dispatch workflow run ${runId}: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
    return { redispatched }
  }

  /** Advisory, per-process record of when a run may next be re-dispatched. */
  private readonly redispatchBackoff = new Map<string, number>()

  private readonly redispatchDelays = new Map<string, number>()

  private noteRedispatch(runId: string, now: number): void {
    const previous = this.redispatchDelays.get(runId)
    const delay = Math.min(
      previous === undefined ? REDISPATCH_BACKOFF_MS : previous * 2,
      REDISPATCH_BACKOFF_MAX_MS
    )
    // A run that settles is never returned again, so entries are only evicted by
    // this bound — oldest first, which is also least recently re-dispatched.
    if (this.redispatchBackoff.size >= REDISPATCH_BACKOFF_MAX_ENTRIES) {
      const oldest = this.redispatchBackoff.keys().next()
      if (!oldest.done) {
        this.redispatchBackoff.delete(oldest.value)
        this.redispatchDelays.delete(oldest.value)
      }
    }
    this.redispatchDelays.set(runId, delay)
    this.redispatchBackoff.set(runId, now + delay)
  }

  protected resolveStepJobOptions(
    stepOptions?: WorkflowStepOptions
  ): JobOptions {
    const retries = stepOptions?.retries ?? DEFAULT_STEP_RETRIES
    const retryDelay = stepOptions?.retryDelay
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
      { runId, stepName, rpcName, data, fromStepName },
      {
        ...this.resolveStepJobOptions(stepOptions),
        group: this.getJobGroup(rpcName),
      }
    )
  }

  public async executeWorkflowSleepCompleted(
    runId: string,
    stepId: string
  ): Promise<void> {
    await this.setStepResult(stepId, null)
    await this.resumeWorkflow(runId)
  }

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
      {
        ...(retryDelay
          ? { delay: getDurationInMilliseconds(retryDelay) }
          : undefined),
        group: this.getJobGroup(workflowName),
      }
    )
  }

  protected async dispatchStep(
    runId: string,
    stepName: string,
    rpcName: string,
    data: unknown,
    stepOptions?: WorkflowStepOptions,
    fromStepName?: string
  ): Promise<boolean> {
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
        { runId, stepName, rpcName, data, fromStepName },
        {
          ...this.resolveStepJobOptions(stepOptions),
          group: this.getJobGroup(rpcName),
        }
      )
    } catch (cause) {
      throw new WorkflowDispatchException(runId, stepName, { cause })
    }
    return true
  }

  protected async scheduleSleep(
    runId: string,
    stepId: string,
    duration: number | string
  ): Promise<boolean> {
    if (
      (await this.isInline(runId)) ||
      !getSingletonServices()?.schedulerService
    ) {
      return false
    }
    await getSingletonServices()!.schedulerService!.scheduleRPC(
      duration,
      this.getConfig().sleeperRPCName,
      { runId, stepId }
    )
    return true
  }

  public setRunExtension<T extends WorkflowRunExtension>(
    create: (engine: WorkflowRunEngine) => T
  ): T {
    const engine: WorkflowRunEngine = {
      inlineStep: this.inlineStep.bind(this),
      updateRunStatus: this.updateRunStatus.bind(this),
      onChildWorkflowFailed: this.onChildWorkflowFailed.bind(this),
      verifyStepName: this.verifyStepName.bind(this),
    }
    const extension = create(engine)
    this.runExtension = extension
    return extension
  }

  public getRunExtension(): WorkflowRunExtension | undefined {
    return this.runExtension
  }

  public async startWorkflow<I>(
    name: string,
    input: I,
    wire: WorkflowRunWire,
    rpcService: any,
    options?: {
      inline?: boolean
      startNode?: string
      actors?: ScenarioPersonas
      onRunCreated?: (runId: string) => void
    }
  ): Promise<{ runId: string }> {
    const resolved = resolveWorkflowMeta(name)
    const workflowMeta = resolved?.meta
    const packageName = resolved?.packageName ?? null

    if (!workflowMeta) {
      throw new WorkflowNotFoundError(name)
    }

    if (workflowMeta.source === 'graph') {
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

    options?.onRunCreated?.(runId)

    await this.runExtension?.attachRunContext(runId, workflowMeta, options)

    if (shouldInline) {
      this.registerInlineRun(runId)
      try {
        await this.runWorkflowJob(runId, rpcService)
      } catch (error: any) {
        if (
          error.name !== 'WorkflowAsyncException' &&
          error.name !== 'WorkflowCancelledException' &&
          error.name !== 'WorkflowSuspendedException' &&
          error.name !== 'WorkflowDispatchException'
        ) {
          await this.updateRunStatus(runId, 'failed', undefined, {
            name: error.name,
            message: error.message,
            stack: error.stack,
          })
          getSingletonServices()!.logger.error(
            `Workflow ${name} (run ${runId}) failed:`,
            isExpectedError(error) ? error.message : error
          )
          throw error
        }
        if (error.name === 'WorkflowDispatchException') {
          throw error
        }
      } finally {
        this.unregisterInlineRun(runId)
        this.runExtension?.detachRunContext(runId)
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
    const { runId } = await this.startWorkflow(
      name,
      input,
      options?.wire ?? { type: 'internal' },
      rpcService,
      { inline: true }
    )
    const run = await this.awaitRunEnd(runId, options?.pollIntervalMs ?? 1000)
    if (run.status === 'failed') {
      throw new WorkflowRunFailedError(run.error?.message)
    }
    if (run.status === 'cancelled') {
      throw new WorkflowRunCancelledError()
    }
    return run.output
  }

  protected async awaitRunEnd(
    runId: string,
    maxIntervalMs: number
  ): Promise<WorkflowRun> {
    let interval = Math.min(WORKFLOW_POLL_MIN_MS, maxIntervalMs)
    while (true) {
      const run = await this.getRun(runId)
      if (!run) {
        throw new WorkflowRunNotFoundError(runId)
      }
      if (WORKFLOW_END_STATES.has(run.status)) {
        return run
      }
      await this.waitBeforeNextRead(interval)
      interval = Math.min(interval * WORKFLOW_POLL_FACTOR, maxIntervalMs)
    }
  }

  protected async waitBeforeNextRead(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  protected async listStepStates(
    _runId: string
  ): Promise<Array<StepState & { stepName: string }> | null> {
    return null
  }

  private async beginReplay(runId: string): Promise<void> {
    const context = this.enterExecution(runId)
    context.ordinals = new Map()
    context.lastStep = undefined
    context.replay = {}
    const steps = await this.listStepStates(runId)
    if (steps) {
      context.replay.steps = new Map(steps.map((step) => [step.stepName, step]))
    }
  }

  private endReplay(runId: string): void {
    this.exitExecution(runId)
  }

  private async loadOrCreateStep(
    runId: string,
    stepName: string,
    create: () => Promise<StepState>
  ): Promise<StepState> {
    const snapshot = this.runContexts.get(runId)?.replay?.steps
    if (snapshot) {
      const cached = snapshot.get(stepName)
      if (cached) {
        return cached
      }
    } else {
      try {
        return await this.getStepState(runId, stepName)
      } catch {
        // knowledge: decisions/internals/workflow-replay-reads-its-steps-once-and-caches-only-the-immutable-half.md
      }
    }

    let step: StepState
    try {
      step = await create()
    } catch (error) {
      try {
        step = await this.getStepState(runId, stepName)
      } catch {
        throw error
      }
    }
    snapshot?.set(stepName, step)
    return step
  }

  private async getRunIdentity(runId: string): Promise<WorkflowRun | null> {
    const replay = this.runContexts.get(runId)?.replay
    if (replay?.run) {
      return replay.run
    }
    const run = await this.getRun(runId)
    if (run && replay) {
      replay.run = run
    }
    return run
  }

  private lastStepName(runId: string): string | undefined {
    return this.runContexts.get(runId)?.lastStep
  }

  private nextStepKey(runId: string, logicalStepName: string): string {
    const context = this.contextFor(runId)
    const ordinal = context.ordinals.get(logicalStepName) ?? 0
    context.ordinals.set(logicalStepName, ordinal + 1)
    const stepName =
      ordinal === 0 ? logicalStepName : `${logicalStepName}#${ordinal}`
    context.lastStep = stepName
    return stepName
  }

  public async runWorkflowJob(runId: string, rpcService: any): Promise<void> {
    await this.beginReplay(runId)
    try {
      await this.runWorkflowJobInner(runId, rpcService)
    } finally {
      this.endReplay(runId)
    }
  }

  private async runWorkflowJobInner(
    runId: string,
    rpcService: any
  ): Promise<void> {
    const run = await this.getRunIdentity(runId)
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

    if (workflowMeta?.source === 'graph') {
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
        session: rpcService?.wire?.session,
        rpc: rpcService?.wire?.rpc,
      }
      this.runExtension?.decorateRunWire(wire, {
        runId,
        workflowMeta,
        workflowWire,
      })

      const lifecycle: RunLifecycleContext = {
        runId,
        run,
        workflowMeta,
        workflow,
        wire,
        packageName: pkgName,
      }

      let outcome: 'completed' | 'failed' | 'interrupted' = 'completed'
      let failure: any
      try {
        await this.runExtension?.onBeforeRunFunc(lifecycle)

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
        failure = error

        if (error instanceof WorkflowAsyncException) {
          outcome = 'interrupted'
          throw error
        }

        if (error instanceof WorkflowCancelledException) {
          outcome = 'failed'
          await this.updateRunStatus(runId, 'cancelled', undefined, {
            message: error.message || 'Workflow cancelled',
            stack: '',
            code: 'WORKFLOW_CANCELLED',
          })
          await this.onChildWorkflowFailed(run, error)
          throw error
        }

        if (error instanceof WorkflowSuspendedException) {
          outcome = 'interrupted'
          await this.updateRunStatus(runId, 'suspended', undefined, {
            message: error.message || 'Workflow suspended',
            stack: '',
            code: 'WORKFLOW_SUSPENDED',
          })
          throw error
        }

        outcome = 'failed'
        await this.updateRunStatus(runId, 'failed', undefined, {
          message: error.message,
          stack: error.stack,
          code: error.code,
        })
        await this.onChildWorkflowFailed(run, error)

        throw error
      } finally {
        await this.runExtension?.onAfterRunFunc(lifecycle, outcome, failure)
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

  protected async onChildWorkflowFailed(
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

  public async executeWorkflowStep(
    runId: string,
    stepName: string,
    rpcName: string,
    data: any,
    rpcService: any
  ): Promise<void> {
    this.enterExecution(runId)
    try {
      await this.executeWorkflowStepInner(
        runId,
        stepName,
        rpcName,
        data,
        rpcService
      )
    } finally {
      this.exitExecution(runId)
    }
  }

  private async executeWorkflowStepInner(
    runId: string,
    stepName: string,
    rpcName: string,
    data: any,
    rpcService: any
  ): Promise<void> {
    const claimed = await this.withStepLock(runId, stepName, async () => {
      const stepState = await this.getStepState(runId, stepName)
      if (stepState.status === 'succeeded' || stepState.status === 'running') {
        return null
      }
      if (stepState.status === 'failed') {
        return this.createRetryAttempt(stepState.stepId, 'running')
      }
      if (stepState.status === 'pending' || stepState.status === 'scheduled') {
        await this.setStepRunning(stepState.stepId)
      }
      return stepState
    })

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

      const isGraphWorkflow = workflowMeta?.source === 'graph'
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
            rpcService,
            run
          )
        }
      }

      await this.setStepResult(stepState.stepId, result)

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

      await this.setStepError(stepState.stepId, error)

      const maxAttempts = (stepState.retries ?? DEFAULT_STEP_RETRIES) + 1
      const retriesExhausted = stepState.attemptCount >= maxAttempts

      if (retriesExhausted) {
        await this.resumeWorkflow(runId)
      }

      throw error
    }
  }

  public async orchestrateWorkflow(
    runId: string,
    rpcService: any
  ): Promise<void> {
    try {
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

  private async invokeStepRpc(
    runId: string,
    stepName: string,
    stepState: StepState,
    rpcName: string,
    data: any,
    rpcService: any,
    knownRun?: WorkflowRun | null
  ): Promise<any> {
    const run = knownRun ?? (await this.getRunIdentity(runId))
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

        await this.setStepError(currentStepState.stepId, error)

        if (currentStepState.attemptCount < retries) {
          currentStepState = await this.createRetryAttempt(
            currentStepState.stepId,
            'pending'
          )
          if (retryDelay) {
            await new Promise((resolve) =>
              setTimeout(resolve, getDurationInMilliseconds(retryDelay))
            )
          }
        } else {
          throw error
        }
      }
    }
  }

  private async runStepCompensation(
    runId: string,
    stepName: string,
    onErrorRpcName: string,
    rpcService: any,
    error: Error
  ): Promise<void> {
    await this.rpcStep(
      runId,
      `${stepName}:onError`,
      onErrorRpcName,
      { error: { message: error.message } },
      rpcService,
      { retries: 0 }
    )
  }

  private async rpcStep(
    runId: string,
    logicalStepName: string,
    rpcName: string,
    data: any,
    rpcService: any,
    stepOptions?: WorkflowStepOptions
  ): Promise<any> {
    const fromStepName = this.lastStepName(runId)
    const stepName = this.nextStepKey(runId, logicalStepName)
    const resolvedStepOptions: WorkflowStepOptions = {
      retries: stepOptions?.retries ?? DEFAULT_STEP_RETRIES,
      retryDelay: stepOptions?.retryDelay,
      actor: stepOptions?.actor,
      onError: stepOptions?.onError,
    }
    const stepState = await this.loadOrCreateStep(runId, stepName, () =>
      this.insertStepState(
        runId,
        stepName,
        rpcName,
        data,
        resolvedStepOptions,
        fromStepName
      )
    )

    if (stepState.status === 'succeeded') {
      return stepState.result
    }

    if (stepState.status === 'failed') {
      const error = new Error(
        stepState.error?.message ||
          `Step '${stepName}' failed after exhausting all retries`
      )
      if (resolvedStepOptions.onError) {
        await this.runStepCompensation(
          runId,
          stepName,
          resolvedStepOptions.onError,
          rpcService,
          error
        )
      }
      if (stepState.error) {
        Object.assign(error, stepState.error)
      }
      throw error
    }

    if (stepState.status === 'scheduled') {
      throw new WorkflowAsyncException(runId, stepName)
    }

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

    const retries = resolvedStepOptions.retries ?? this.getConfig().retries
    const retryDelay = resolvedStepOptions.retryDelay

    return this.runInlineRetryLoop(
      stepState,
      retries,
      retryDelay,
      async (currentStepState) => {
        if (resolvedStepOptions.actor) {
          return resolvedStepOptions.actor.invoke(rpcName, data)
        }
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
          const childRun = await this.awaitRunEnd(
            childRunId,
            WORKFLOW_CHILD_POLL_MAX_MS
          )
          if (childRun.status === 'failed') {
            throw new Error(childRun.error?.message || 'Sub-workflow failed')
          }
          if (childRun.status === 'cancelled') {
            throw new Error('Sub-workflow was cancelled')
          }
          return childRun.output
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

  protected async inlineStep(
    runId: string,
    logicalStepName: string,
    fn: Function,
    stepOptions?: WorkflowStepOptions,
    data: any = null,
    rpcName: string | null = null
  ): Promise<any> {
    const fromStepName = this.lastStepName(runId)
    const stepName = this.nextStepKey(runId, logicalStepName)
    const stepState = await this.loadOrCreateStep(runId, stepName, () =>
      this.insertStepState(
        runId,
        stepName,
        rpcName,
        data,
        stepOptions,
        fromStepName
      )
    )

    if (stepState.status === 'succeeded') {
      return stepState.result
    }

    const retries = stepOptions?.retries ?? this.getConfig().retries
    const retryDelay = stepOptions?.retryDelay ?? this.getConfig().retryDelay

    if (await this.isInline(runId)) {
      return this.runInlineRetryLoop(stepState, retries, retryDelay, () => fn())
    } else {
      let currentStepState = stepState
      try {
        await this.setStepRunning(currentStepState.stepId)
        const result = await fn()
        await this.setStepResult(currentStepState.stepId, result)
        return result
      } catch (error: any) {
        await this.setStepError(currentStepState.stepId, error)

        if (currentStepState.attemptCount < retries) {
          await this.createRetryAttempt(currentStepState.stepId, 'pending')

          await this.scheduleOrchestratorRetry(runId, retryDelay)

          throw new WorkflowAsyncException(runId, stepName)
        }

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
    const stepState = await this.loadOrCreateStep(runId, stepName, () =>
      this.insertStepState(
        runId,
        stepName,
        null,
        { duration },
        undefined,
        fromStepName
      )
    )

    if (stepState.status === 'succeeded') {
      return
    }

    if (stepState.status === 'scheduled') {
      throw new WorkflowAsyncException(runId, stepName)
    }

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

    await new Promise((resolve) =>
      setTimeout(resolve, getDurationInMilliseconds(duration))
    )
    await this.setStepResult(stepState.stepId, null)
  }

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

  private async scheduleRunWake(runId: string, delay: number): Promise<void> {
    try {
      const queueService = this.verifyQueueService()
      const run = await this.getRun(runId)
      if (!run?.workflow) return
      await queueService.add(
        this.getOrchestratorQueueName(run.workflow),
        { runId },
        {
          ...this.resolveStepJobOptions(),
          delay,
          group: this.getJobGroup(run.workflow),
        }
      )
    } catch (error) {
      this.logger?.warn(
        `Failed to schedule approval expiry wake for run ${runId}; expiry will still resolve on the next replay`,
        error
      )
    }
  }

  private getApprovalStepName(reason: string): string {
    return `__workflow_approval:${reason}`
  }

  private approvalStateKey(stepName: string): string {
    let hex = ''
    for (const byte of new TextEncoder().encode(stepName)) {
      hex += byte.toString(16).padStart(2, '0')
    }
    return `__approval_${hex}`
  }

  public async approveStep(
    runId: string,
    reason: string,
    decision: unknown
  ): Promise<void> {
    const stepName = this.getApprovalStepName(reason)
    const stateKey = this.approvalStateKey(stepName)

    let resolved: StepState | undefined
    try {
      resolved = await this.getStepState(runId, stepName)
    } catch {
      // knowledge: decisions/security/workflow-approval-payloads-are-validated-on-replay-inside-the-workflow.md
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
  ): PikkuWorkflowWire {
    const workflowWire: PikkuWorkflowWire = {
      name,
      runId,
      getRun: async () => (await this.getRun(runId)) as WorkflowRun,

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
      }) as PikkuWorkflowWire['approval'],
    }
    this.runExtension?.decorateWorkflowWire(workflowWire, {
      name,
      runId,
      rpcService,
      addonNamespace,
    })
    return workflowWire
  }

  protected verifyStepName(stepName: string) {
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

  protected getOrchestratorQueueName(workflowName?: string): string {
    if (workflowName && this.queueStrategy !== 'shared-groups') {
      const perWorkflow = `wf-orchestrator-${toKebab(workflowName)}`
      const meta = pikkuState(null, 'queue', 'meta')
      if (meta[perWorkflow]) {
        return perWorkflow
      }
    }
    return this.getConfig().orchestratorQueueName
  }

  protected getStepWorkerQueueName(rpcName?: string): string {
    if (rpcName && this.queueStrategy !== 'shared-groups') {
      const perStep = `wf-step-${toKebab(rpcName)}`
      const meta = pikkuState(null, 'queue', 'meta')
      if (meta[perStep]) {
        return perStep
      }
    }
    return this.getConfig().stepWorkerQueueName
  }

  protected getJobGroup(id?: string): JobGroup | undefined {
    if (!id || this.queueStrategy !== 'shared-groups') {
      return undefined
    }
    return { id, tier: id }
  }
}
