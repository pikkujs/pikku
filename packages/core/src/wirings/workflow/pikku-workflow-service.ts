import { getSingletonServices, pikkuState } from '../../pikku-state.js'
import { getDurationInMilliseconds } from '../../time-utils.js'
import {
  buildWorkflowWire,
  invokeStepRpc,
  type StepRpcArgs,
} from './workflow-wire.js'
import type { CoreUserSession } from '../../types/core.types.js'
import type { SerializedError } from '../../errors/serialized-error.js'
import type {
  GroupConcurrencyConfig,
  JobGroup,
  JobOptions,
} from '../queue/queue.types.js'
import type {
  ApprovalOutcome,
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
  WorkflowRecoveryOptions,
  WorkflowServiceConfig,
  WorkflowStepOptions,
  WorkflowRpcStepOptions,
} from './workflow.types.js'
import { continueGraph, runWorkflowGraph } from './graph/graph-runner.js'
import type { WorkflowService } from '../../services/workflow-service.js'
import type { ScenarioVirtualUsers } from '../../services/virtual-users-service.js'
import { PikkuMissingMetaError } from '../../errors/errors.js'
import type { PikkuRPC } from '../rpc/rpc-types.js'
import { approvalDeciderFrom } from './workflow-approval-policy.js'
import {
  buildRunTimeline,
  reconstructStateAt,
  type RunTimeline,
  type ReconstructedRunState,
} from './run-timeline.js'
import {
  DEFAULT_STEP_RETRIES,
  RUN_LEASE_RETRY_MS,
  WORKFLOW_CHILD_POLL_MAX_MS,
  WORKFLOW_END_STATES,
  WORKFLOW_POLL_FACTOR,
  WORKFLOW_POLL_MIN_MS,
  WORKFLOW_TERMINAL_STATES,
  WORKFLOW_CANCEL_CHECK_MS,
  RUN_STATUS_SOURCES,
  STEP_SOURCES,
  isRunCancelled,
  NO_COMPENSATE_STATE_PREFIX,
  isRunSettled,
  isRunStopped,
} from './workflow-constants.js'
import {
  WorkflowAsyncException,
  WorkflowCancelledException,
  WorkflowDispatchException,
  WorkflowNotFoundError,
  WorkflowRunNotFoundError,
  WorkflowStepNameNotString,
  WorkflowStepSupersededError,
} from './workflow-errors.js'
import type {
  ReplayPass,
  RunContext,
  WorkflowRunEngine,
  WorkflowRunExtension,
} from './workflow-run-engine.types.js'
import { resolveWorkflowMeta } from './workflow-meta-resolver.js'
import { storeWorkflowVersion } from './workflow-version-store.js'
import {
  jobGroupFor,
  orchestratorQueueName,
  requireQueueService,
  resolveWorkflowConfig,
  stepDispatchTarget,
  stepJobOptions,
  stepWorkerQueueName,
} from './workflow-queue-routing.js'
import { wireWorkflowQueueWorkers } from './workflow-queue-wiring.js'
import {
  approvalStepNameFor,
  evaluateApprovalStep,
  recordApprovalDecision,
  type ApprovalStore,
} from './workflow-approval.js'
import { createApprovalStore } from './workflow-approval-store.js'
import { recordSuspension, suspendStepNameFor } from './workflow-suspend.js'
import {
  claimStepByReadThenWrite,
  settleUnclaimableStep,
  type StepClaimStore,
  warnStepAttemptsExhausted,
  warnStepRerun,
} from './workflow-step-claim.js'
import { holdWorkflowLease, nullWhenStepHeld } from './workflow-run-lease.js'
import type { LeaseService } from '../../services/lease-service.js'
import { runOutput, summarizeRunStatus } from './workflow-run-status.js'
import { writeRunMirror } from './workflow-run-mirror.js'
import { runningStepLease, stepLeaseMsForQueue } from './workflow-step-lease.js'
import { leaseRenewalIntervalMs } from '../../services/lease-service.js'
import { unlessSuperseded } from './workflow-step-retry.js'
import {
  holdInlineRpcStep,
  retriesFailedRpcStep,
} from './workflow-inline-rpc-step.js'
import { orchestrateRun } from './workflow-orchestrate.js'
import {
  openStepAttempt,
  rpcStepTimeout,
  assertNoClosureTimeout,
  trackStepCancel,
  type StepAttempt,
  waitUnlessCancelled,
} from './workflow-step-signal.js'
import {
  runQueuedStep,
  type QueuedStepHost,
  wakeWhileStepLeased,
} from './workflow-queued-step.js'
import {
  announceCreatedRun,
  handBackSettledChildren,
  isParkedOnChild,
} from './workflow-child-step.js'
import { runDslWorkflowPass } from './workflow-dsl-pass.js'
import { withRunTrace } from './workflow-run-trace.js'
import {
  settleStoppedRun,
  failRunOrUnwind,
  cancelAndUnwind,
  createUnwindHost,
  type CompensationApi,
} from './workflow-compensation.js'
import { throwIfLeaseLost } from './workflow-lost-lease.js'
import {
  endFailedInlineRun,
  runInlineToItsEnd,
} from './workflow-inline-pickup.js'
import { RunUnwinds, type RunUnwindHost } from './workflow-unwind-lease.js'
import {
  createCompensationApi,
  createRunUnwindHost,
  type CompensationService,
} from './workflow-compensation-host.js'
import { WorkflowStepWrites } from './workflow-step-writes.js'
import {
  recordedStepError,
  runClosureStep,
  type ClosureStepHost,
} from './workflow-closure-step.js'
import type { WorkflowAwaitedStep } from './workflow-queue-workers.js'
import { OpenSteps } from './workflow-open-steps.js'
import { PassSteps, inPass, stepsInPass } from './workflow-pass-steps.js'
import { runSleepStep, type SleepStepHost } from './workflow-sleep-step.js'
import { runVersionMismatchFallback } from './workflow-version-fallback.js'
import {
  WorkflowRecovery,
  type ScheduledStep,
  type PendingApproval,
  type StalledSweepOptions,
  type UndispatchedSweepOptions,
  type WorkflowRecoveryPass,
} from './workflow-recovery.js'

/** The workflow engine; subclasses supply storage. Leases serialise runs and step claims over a shared store. */
export abstract class PikkuWorkflowService
  extends WorkflowStepWrites
  implements WorkflowService
{
  private runExtension?: WorkflowRunExtension

  private runContexts = new Map<string, RunContext>()

  private readonly unwinds = new RunUnwinds()

  private readonly openSteps = new OpenSteps()

  private contextFor(runId: string): RunContext {
    let context = this.runContexts.get(runId)
    if (!context) {
      context = { activeExecutions: 0, pass: { ordinals: new Map() } }
      this.runContexts.set(runId, context)
    }
    return context
  }

  private releaseContext(runId: string): void {
    const context = this.runContexts.get(runId)
    if (!context) return
    if (context.activeExecutions > 0) return
    if (context.stepCancels?.size) return
    this.runContexts.delete(runId)
  }

  /** `releaseContext`, keeping a run still registered as inline. */
  private releaseIdleContext(runId: string): void {
    if (this.runContexts.get(runId)?.inline === undefined) {
      this.releaseContext(runId)
    }
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
      context.pass = { ordinals: new Map() }
    }
    this.releaseContext(runId)
  }

  protected get logger() {
    return getSingletonServices()?.logger
  }

  private readonly lostStepLog = {
    logger: () => this.logger,
    traceparent: (runId: string) => this.getRunTraceparent(runId),
  }

  protected mirror?: WorkflowRunMirror

  /**
   * Serialises orchestration passes over a run and claims on a step. A service
   * whose state no other process can reach — in-memory, a Durable Object —
   * has no competitor to exclude, overrides both locks and passes none.
   */
  protected readonly leaseService?: LeaseService

  /** `false` on a host that gives its steps no abort signal. */
  protected readonly stepSignals: boolean = true

  /** The longest a running step takes to see a cancel from another process. */
  protected cancelCheckIntervalMs = WORKFLOW_CANCEL_CHECK_MS

  protected readonly queueStrategy: 'per-workflow' | 'shared-groups'
  protected readonly queueConcurrency: number
  protected readonly queueGroupConcurrency: number | GroupConcurrencyConfig

  constructor(
    options: {
      wireQueues?: boolean
      mirror?: WorkflowRunMirror
      leaseService?: LeaseService
    } & WorkflowQueueOptions = {}
  ) {
    super()
    const wireQueues = options.wireQueues ?? true
    this.mirror = options.mirror
    this.leaseService = options.leaseService
    this.queueStrategy = options.queueStrategy ?? 'per-workflow'
    this.queueConcurrency = options.queueConcurrency ?? 20
    this.queueGroupConcurrency = options.queueGroupConcurrency ?? 2
    if (wireQueues) {
      this.wireQueueWorkers()
    }
  }

  protected async mirrored<T>(
    write: () => Promise<T>,
    mirror: (mirror: WorkflowRunMirror, written: T) => Promise<void>
  ): Promise<T> {
    const written = await write()
    await writeRunMirror(
      this.mirror,
      () => this.logger,
      (target) => mirror(target, written)
    )
    return written
  }

  public wireQueueWorkers(): void {
    wireWorkflowQueueWorkers({
      strategy: this.queueStrategy,
      concurrency: this.queueConcurrency,
      groupConcurrency: this.queueGroupConcurrency,
      getLogger: () => this.logger,
    })
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
    wire = withRunTrace(wire)
    await storeWorkflowVersion(this, workflowName, graphHash)
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
    return summarizeRunStatus(run, await this.getRunHistory(id))
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

  abstract getRunSteps(
    runId: string
  ): Promise<
    Array<StepState & { stepName: string; rpcName?: string; data?: any }>
  >

  /**
   * Move a run to `status` from a status that may precede it, reporting whether
   * it did. A refused write changes nothing.
   */
  public async updateRunStatus(
    id: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<boolean> {
    return this.transitionRunStatus(
      id,
      RUN_STATUS_SOURCES[status],
      status,
      output,
      error
    )
  }

  /** `updateRunStatus`, applied only while the run is in one of `from`. */
  public async transitionRunStatus(
    id: string,
    from: readonly WorkflowStatus[],
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<boolean> {
    const applied = await this.mirrored(
      () => this.transitionRunStatusImpl(id, from, status, output, error),
      async (mirror, written) => {
        if (written) await mirror.updateRunStatus(id, status, output, error)
      }
    )
    if (!applied) return false
    if (isRunCancelled({ status, error })) {
      this.runContexts.get(id)?.stepCancels?.forEach((cancel) => cancel())
    }
    if (WORKFLOW_TERMINAL_STATES.has(status)) {
      this.runExtension?.detachRunContext(id)
      this.releaseContext(id)
    }
    return true
  }

  /**
   * Set the run's status, only while its current one is in `from`, and report
   * whether it did. The check and the write must be one atomic operation.
   */
  protected abstract transitionRunStatusImpl(
    id: string,
    from: readonly WorkflowStatus[],
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<boolean>

  public async insertStepState(
    runId: string,
    stepName: string,
    rpcName: string | null,
    data: any,
    stepOptions?: WorkflowRpcStepOptions,
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
    stepOptions?: WorkflowRpcStepOptions,
    fromStepName?: string
  ): Promise<StepState>

  abstract getStepState(runId: string, stepName: string): Promise<StepState>

  /**
   * One orchestration pass under the run's lease; never waits (see
   * `holdWorkflowLease`). `fn` is given the signal that aborts if this pass
   * loses the lease. A store whose lease is a pass-through gives none.
   */
  async withRunLease<T>(
    id: string,
    fn: (lost?: AbortSignal) => Promise<T>
  ): Promise<T> {
    return holdWorkflowLease(this, this.leaseService, `workflow-run:${id}`, fn)
  }

  /** `fn` under one step's lease; never waits (see `holdWorkflowLease`). */
  async withStepLock<T>(
    runId: string,
    stepName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const key = `workflow-step:${runId}:${stepName}`
    return holdWorkflowLease(this, this.leaseService, key, fn)
  }

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
      /** Set by a store that records step leases; see `runningStepLease`. */
      leaseExpiresAt?: Date
    }>
  >

  abstract getNodeResults(
    runId: string,
    nodeIds: string[]
  ): Promise<Record<string, any>>

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
    await this.enqueueOrchestration(runId, workflowName)
  }

  private async enqueueOrchestration(
    runId: string,
    workflowName?: string,
    delay?: number,
    awaitedStep?: WorkflowAwaitedStep
  ): Promise<void> {
    await this.addOrchestratorJob(
      runId,
      workflowName,
      {
        ...this.resolveStepJobOptions(),
        ...(delay !== undefined ? { delay } : {}),
      },
      awaitedStep
    )
  }

  private async addOrchestratorJob(
    runId: string,
    workflowName: string | undefined,
    options: JobOptions,
    awaitedStep?: WorkflowAwaitedStep
  ): Promise<void> {
    const queueService = requireQueueService()
    const run = await this.getRunIdentity(runId)
    workflowName ??= run?.workflow
    await queueService.add(
      this.getOrchestratorQueueName(workflowName),
      awaitedStep ? { runId, awaitedStep } : { runId },
      {
        ...options,
        group: this.getJobGroup(workflowName),
        traceparent: run?.wire?.traceparent,
      }
    )
  }

  /** Ask for the run to be looked at again after a wait, where there is a queue. */
  private async wakeLater(
    runId: string,
    delay = RUN_LEASE_RETRY_MS,
    awaitedStep?: WorkflowAwaitedStep
  ): Promise<void> {
    if (!getSingletonServices()?.queueService) return
    await this.enqueueOrchestration(runId, undefined, delay, awaitedStep)
  }

  /**
   * Ids of runs that are stalled: `running` or `compensating`, with no step
   * something is expected to complete (`scheduled`, `suspended`, `running` or
   * `cancelling` under a live lease, or parked on an unsettled child run), and no step activity
   * since `before`.
   *
   * A lapsed lease is a dispatch that died, so it holds nothing out of the
   * sweep. Nor does a `running` step with no lease and no child run: that is
   * work inside an orchestration pass, whose owner is the run's lease, which the
   * sweep checks before it touches the run.
   *
   * Returns nothing by default, for a store that cannot express the query.
   */
  protected async findStalledRunIds(
    _before: Date,
    _limit: number
  ): Promise<string[]> {
    return []
  }

  /**
   * Runs holding a step `pending` since before `before`. A store overriding it
   * needs an atomic `claimStepForExecution` (see `sweepUndispatchedSteps`).
   */
  protected async findUndispatchedSteps(
    _before: Date,
    _limit: number
  ): Promise<Array<{ runId: string; stepId: string }>> {
    return []
  }

  /**
   * Steps parked on `scheduled` on a `running` or `compensating` run, oldest first, a page at a time.
   * Returns nothing by default, for a store whose runs die with the process.
   */
  protected async findScheduledSteps(
    _limit: number,
    _offset: number
  ): Promise<ScheduledStep[]> {
    return []
  }

  /**
   * The open approval gates of `suspended` runs untouched since `before`, oldest
   * first, a page at a time. Returns nothing by default, for a store that cannot
   * express the query.
   */
  protected async findPendingApprovals(
    _before: Date,
    _limit: number,
    _offset: number
  ): Promise<PendingApproval[]> {
    return []
  }

  private readonly recovery = new WorkflowRecovery({
    findPendingApprovals: (...args) => this.findPendingApprovals(...args),
    getRunState: (runId) => this.getRunState(runId),
    handBackSettledChildren: (runId) => handBackSettledChildren(this, runId),
    leases: () => this.leaseService,
    listStepStates: (runId) => this.listStepStates(runId),
    withRunLease: (runId, fn) => this.withRunLease(runId, fn),
    findStalledRunIds: (before, limit) => this.findStalledRunIds(before, limit),
    findUndispatchedSteps: this.findUndispatchedSteps.bind(this),
    findScheduledSteps: this.findScheduledSteps.bind(this),
    resumeWorkflow: (runId) => this.resumeWorkflow(runId),
    wakeSleep: this.executeWorkflowSleepCompleted.bind(this),
    rearmSleep: this.scheduleSleep.bind(this),
    queueStepWorker: (...args) => this.queueStepWorker(...args),
  })

  /** One recovery pass, for a host driving it from a scheduled task. */
  public recoverWorkflows(options?: WorkflowRecoveryPass): Promise<void> {
    return this.recovery.recover(options)
  }

  /** Sweep now and on an interval, once the queue is consuming. */
  public startRecovery(options?: WorkflowRecoveryOptions | false): void {
    this.recovery.start(options)
  }

  public stopRecovery(): void {
    this.recovery.stop()
  }

  /** Re-drive runs whose next move was lost. */
  public recoverStalledRuns(options?: StalledSweepOptions) {
    return this.recovery.recoverStalledRuns(options)
  }

  /** Re-drive steps whose dispatch was lost. Not self-starting. */
  public relayUndispatchedSteps(options?: UndispatchedSweepOptions) {
    return this.recovery.relayUndispatchedSteps(options)
  }

  protected resolveStepJobOptions(
    stepOptions?: WorkflowStepOptions
  ): JobOptions {
    return stepJobOptions(stepOptions)
  }

  public async queueStepWorker(
    runId: string,
    stepName: string,
    rpcName: string,
    data: any,
    stepOptions?: WorkflowStepOptions,
    fromStepName?: string
  ): Promise<void> {
    await requireQueueService().add(
      this.getStepWorkerQueueName(rpcName),
      { runId, stepName, rpcName, data, fromStepName },
      {
        ...this.resolveStepJobOptions(stepOptions),
        group: this.getJobGroup(rpcName),
        traceparent: await this.getRunTraceparent(runId),
      }
    )
  }

  public async executeWorkflowSleepCompleted(
    runId: string,
    stepId: string
  ): Promise<void> {
    await this.completeSleep(stepId)
    await this.resumeWorkflow(runId)
  }

  /**
   * A timer can fire for a sleep that is already over, or one a stopped run
   * settled another way. The run is resumed all the same.
   */
  private async completeSleep(stepId: string): Promise<void> {
    await unlessSuperseded(() =>
      this.setStepResult(stepId, null, undefined, STEP_SOURCES.unsettled)
    )
  }

  protected async scheduleOrchestratorRetry(
    runId: string,
    retryDelay?: number | string,
    workflowName?: string
  ): Promise<void> {
    await this.addOrchestratorJob(
      runId,
      workflowName,
      retryDelay ? { delay: getDurationInMilliseconds(retryDelay) } : {}
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
    const target = await stepDispatchTarget(rpcName, stepName, () =>
      this.isInline(runId)
    )
    if (target === 'inline') {
      return false
    }
    try {
      await this.queueStepWorker(
        runId,
        stepName,
        rpcName,
        data,
        stepOptions,
        fromStepName
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
      { runId, stepId },
      undefined,
      await this.getRunTraceparent(runId)
    )
    return true
  }

  public setRunExtension<T extends WorkflowRunExtension>(
    create: (engine: WorkflowRunEngine) => T
  ): T {
    const engine: WorkflowRunEngine = {
      inlineStep: this.inlineStep.bind(this),
      updateRunStatus: this.updateRunStatus.bind(this),
      transitionRunStatus: this.transitionRunStatus.bind(this),
      onChildWorkflowFailed: this.onChildWorkflowFailed.bind(this),
      verifyStepName: this.verifyStepName.bind(this),
      getRunTraceparent: this.getRunTraceparent.bind(this),
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
    rpcService: PikkuRPC,
    options?: {
      inline?: boolean
      startNode?: string
      virtualUsers?: ScenarioVirtualUsers
      /**
       * Awaited before the run starts. A run it stops never starts, and one it
       * throws for is failed without starting.
       */
      onRunCreated?: (runId: string) => void | Promise<void>
    }
  ): Promise<{ runId: string }> {
    wire = {
      ...wire,
      traceparent: wire?.traceparent ?? rpcService?.traceparent,
    }
    const resolved = resolveWorkflowMeta(name)
    const workflowMeta = resolved?.meta
    const packageName = resolved?.packageName ?? null

    if (!workflowMeta) {
      throw new WorkflowNotFoundError(name)
    }

    if (workflowMeta.source === 'graph') {
      // A caller-supplied startNode must be one of the graph's declared entry
      // nodes. startWorkflow is the boundary the public
      // `/workflow/:name/graph/:nodeId` route and triggers enter through, so
      // without this a request could name any dependency-free node — one whose
      // input reads only `trigger` — and fire its RPC directly with
      // attacker-chosen data, skipping every upstream eligibility, validation or
      // approval node. (Internal resume/replay drives runWorkflowGraph directly
      // and is unaffected.)
      if (
        options?.startNode &&
        !(workflowMeta.entryNodeIds ?? []).includes(options.startNode)
      ) {
        throw new Error(
          `Workflow graph '${name}': '${options.startNode}' is not a declared entry node`
        )
      }
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
        workflowMeta,
        options?.onRunCreated
      )
    }

    if (!workflowMeta.graphHash) {
      throw new Error(`Missing workflow graphHash for '${name}'`)
    }

    const shouldInline =
      options?.inline || !getSingletonServices()?.queueService

    // A queued run needs only the meta; the orchestrator's unit runs it.
    const registrations = pikkuState(packageName, 'workflows', 'registrations')
    if (shouldInline && !registrations.get(resolved?.resolvedName ?? name)) {
      throw new WorkflowNotFoundError(name)
    }

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

    if (
      options?.onRunCreated &&
      !(await announceCreatedRun(this, runId, options.onRunCreated))
    ) {
      return { runId }
    }

    await this.runExtension?.attachRunContext(runId, workflowMeta, options)

    if (shouldInline) {
      this.registerInlineRun(runId)
      try {
        await this.runInlineToItsEnd(runId, rpcService)
      } catch (error: any) {
        await endFailedInlineRun(
          {
            getRun: (id) => this.getRun(id),
            markFailedUnlessUnwound: (...args) =>
              this.markFailedUnlessUnwound(...args),
          },
          runId,
          name,
          wire,
          error
        )
      } finally {
        this.unregisterInlineRun(runId)
        this.runExtension?.detachRunContext(runId)
      }
    } else {
      await this.resumeWorkflow(runId)
    }

    return { runId }
  }

  private runInlineToItsEnd(runId: string, rpcService: PikkuRPC) {
    return runInlineToItsEnd(
      {
        getRun: (id) => this.getRun(id),
        wake: (id) => this.wakeLater(id),
        logger: () => this.logger,
        runJob: () => this.runWorkflowJob(runId, rpcService),
        unwind: () =>
          this.withRunLease(runId, async (leaseLost) => {
            const host = this.unwindHost(rpcService)
            await this.unwinds.drive(host, runId, true, leaseLost)
          }),
      },
      runId
    )
  }

  public async runToCompletion<I>(
    name: string,
    input: I,
    rpcService: PikkuRPC,
    options?: { pollIntervalMs?: number; wire?: WorkflowRunWire }
  ): Promise<any> {
    const { runId } = await this.startWorkflow(
      name,
      input,
      options?.wire ?? { type: 'internal' },
      rpcService,
      { inline: true }
    )
    return runOutput(
      await this.awaitRunEnd(runId, options?.pollIntervalMs ?? 1000)
    )
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

  private async beginReplay(runId: string): Promise<ReplayPass> {
    const context = this.enterExecution(runId)
    const pass: ReplayPass = { ordinals: new Map(), started: new PassSteps() }
    context.pass = pass
    context.replay = {}
    const steps = await this.listStepStates(runId)
    if (steps) {
      pass.steps = new Map(steps.map((step) => [step.stepName, step]))
    }
    return pass
  }

  private endReplay(runId: string): void {
    this.exitExecution(runId)
  }

  private passOf(runId: string, pass?: ReplayPass): ReplayPass {
    return pass ?? this.contextFor(runId).pass
  }

  private async loadOrCreateStep(
    runId: string,
    stepName: string,
    create: () => Promise<StepState>,
    snapshot?: Map<string, StepState>
  ): Promise<StepState> {
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

  public async getRunIdentity(runId: string): Promise<WorkflowRun | null> {
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

  /** The trace every hop of the run stays on. */
  public async getRunTraceparent(runId: string): Promise<string | undefined> {
    return (await this.getRunIdentity(runId))?.wire?.traceparent
  }

  /** Warn that a step lost its worker and is running again, as `attempt`. */
  public logStepRerun(runId: string, stepName: string, attempt: number) {
    return warnStepRerun(this.lostStepLog, runId, stepName, attempt)
  }

  /** Warn that a step lost its worker with no attempts left, and failed. */
  public async logStepAttemptsExhausted(
    runId: string,
    stepName: string,
    attempts: number
  ): Promise<void> {
    await warnStepAttemptsExhausted(this.lostStepLog, runId, stepName, attempts)
  }

  private nextStepKey(pass: ReplayPass, logicalStepName: string): string {
    const ordinal = pass.ordinals.get(logicalStepName) ?? 0
    pass.ordinals.set(logicalStepName, ordinal + 1)
    const stepName =
      ordinal === 0 ? logicalStepName : `${logicalStepName}#${ordinal}`
    pass.lastStep = stepName
    return stepName
  }

  public async runWorkflowJob(
    runId: string,
    rpcService: PikkuRPC
  ): Promise<void> {
    const pass = await this.beginReplay(runId)
    try {
      await this.runWorkflowJobInner(runId, rpcService, pass)
    } finally {
      this.endReplay(runId)
    }
  }

  private async runWorkflowJobInner(
    runId: string,
    rpcService: PikkuRPC,
    pass: ReplayPass
  ): Promise<void> {
    const run = await this.getRunIdentity(runId)
    if (!run) {
      throw new WorkflowRunNotFoundError(runId)
    }
    if (isRunSettled(run.status)) return

    if (run.status === 'compensating') {
      await this.unwinds.drive(this.unwindHost(rpcService), runId, false)
      return
    }

    const resolved = resolveWorkflowMeta(run.workflow)
    const workflowMeta = resolved?.meta
    const pkgName = resolved?.packageName ?? null

    if (
      run.graphHash &&
      workflowMeta?.graphHash &&
      run.graphHash !== workflowMeta.graphHash
    ) {
      await this.runUnderLease(runId, rpcService, (leaseLost) =>
        runVersionMismatchFallback(
          this,
          run,
          workflowMeta,
          rpcService,
          leaseLost
        )
      )
      return
    }

    if (workflowMeta?.source === 'graph') {
      // Two passes over one graph each plan from the state they read, so both
      // can fire the same next node; the run lease keeps them one at a time,
      // exactly as it does for a DSL run's replay.
      await this.runUnderLease(runId, rpcService, async (leaseLost) => {
        await continueGraph(
          this,
          runId,
          run.workflow,
          undefined,
          rpcService,
          leaseLost
        )
        const updatedRun = await this.getRun(runId)
        throwIfLeaseLost(leaseLost)
        if (updatedRun?.status === 'completed') {
          await this.onChildWorkflowCompleted(updatedRun, updatedRun.output)
        } else if (updatedRun?.status === 'cancelled') {
          await this.onChildWorkflowFailed(
            updatedRun,
            new Error(updatedRun.error?.message || 'Child workflow failed')
          )
        }
      })
      return
    }

    const registrations = pikkuState(pkgName, 'workflows', 'registrations')
    if (!workflowMeta) {
      throw new PikkuMissingMetaError(
        `Missing generated metadata for workflow '${run.workflow}'`
      )
    }

    const workflow = registrations.get(resolved?.resolvedName ?? run.workflow)
    if (!workflow) {
      throw new WorkflowNotFoundError(run.workflow)
    }

    await this.runUnderLease(runId, rpcService, (leaseLost) => {
      pass.leaseLost = leaseLost
      return runDslWorkflowPass(
        {
          leaseLost,
          steps: pass.started!,
          workflowWire: (addonNs) =>
            this.wireFor(run.workflow, runId, rpcService, addonNs, pass),
          extension: this.runExtension,
          updateRunStatus: (status, output, error) =>
            this.updateRunStatus(runId, status, output, error),
          settleIfStopped: () =>
            this.settleStoppedRun(runId, rpcService, true, leaseLost),
          onChildCompleted: (result) =>
            this.onChildWorkflowCompleted(run, result),
          onChildFailed: (error) => this.onChildWorkflowFailed(run, error),
          failOrUnwind: (error) =>
            this.failOrUnwind(run, error, rpcService, true, leaseLost),
        },
        run,
        workflowMeta,
        workflow,
        pkgName
      )
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
    await unlessSuperseded(() => this.setStepResult(parentStepId, result))
    await this.resumeWorkflow(parentRunId)
  }

  public notifyChildWorkflowFailed(
    childRun: WorkflowRun,
    error: Error
  ): Promise<void> {
    return this.onChildWorkflowFailed(childRun, error)
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
    await unlessSuperseded(() => this.setStepError(parentStepId, error))
    await this.resumeWorkflow(parentRunId)
  }

  public async executeWorkflowStep(
    runId: string,
    stepName: string,
    rpcName: string,
    data: any,
    rpcService: PikkuRPC
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
    } catch (error) {
      // A newer claim owns the step and its outcome; this dispatch's is dropped.
      if (!(error instanceof WorkflowStepSupersededError)) throw error
      this.logger?.warn(error.message)
    } finally {
      this.exitExecution(runId)
    }
  }

  /**
   * Take sole ownership of a step before it runs, returning the state to run
   * under — or `null` when another dispatch already owns it.
   *
   * Dispatch is at-least-once by design: the relay re-dispatches steps it
   * believes were dropped, and a queue can redeliver a job it already handed
   * out. This is the one place that keeps a duplicate dispatch from becoming a
   * second execution of a side-effecting step, so it is only as strong as the
   * exclusion it is built on: here, the step's lease on the app's
   * `leaseService`. A store able to express the decision as one conditional
   * write should override this rather than reach for a lock, which is what
   * `@pikku/kysely` does with a status-guarded `UPDATE`.
   *
   * Ownership is held for `leaseMs` rather than forever. A dispatch that
   * dies mid-step leaves the step `running` with nothing to complete it, and an
   * unconditional rejection of `running` would then wedge it beyond the reach
   * of both this claim and the stalled-run sweep.
   */
  private get stepClaimStore(): StepClaimStore {
    return {
      getStepState: (...args) => this.getStepState(...args),
      getRun: (id) => this.getRun(id),
      claimStepStatus: (...args) => this.claimStepStatus(...args),
      setStepRunning: (...args) => this.setStepRunning(...args),
      setStepError: (...args) => this.setStepError(...args),
      refreshStepLease: (...args) => this.refreshStepLease(...args),
      createRetryAttempt: (...args) => this.createRetryAttempt(...args),
      resumeWorkflow: (runId) => this.resumeWorkflow(runId),
      logStepRerun: (...args) => this.logStepRerun(...args),
      logStepAttemptsExhausted: (...args) =>
        this.logStepAttemptsExhausted(...args),
    }
  }

  /** See `settleUnclaimableStep`: every claim starts here. */
  protected settleUnclaimableStep(
    runId: string,
    stepName: string,
    stepState: StepState,
    leaseMs: number
  ): Promise<boolean> {
    return settleUnclaimableStep(
      this.stepClaimStore,
      runId,
      stepName,
      stepState,
      leaseMs
    )
  }

  protected async claimStepForExecution(
    runId: string,
    stepName: string,
    rpcName: string,
    leaseMs: number
  ): Promise<StepState | null> {
    return nullWhenStepHeld(() =>
      this.withStepLock(runId, stepName, () =>
        claimStepByReadThenWrite(
          this.stepClaimStore,
          runId,
          stepName,
          rpcName,
          leaseMs
        )
      )
    )
  }

  private executeWorkflowStepInner(
    runId: string,
    stepName: string,
    rpcName: string,
    data: any,
    rpcService: PikkuRPC
  ): Promise<void> {
    return runQueuedStep(
      this.queuedStepHost,
      runId,
      stepName,
      rpcName,
      data,
      rpcService
    )
  }

  private get queuedStepHost(): QueuedStepHost {
    return {
      service: this,
      logger: () => this.logger,
      leaseMs: (rpcName) =>
        stepLeaseMsForQueue(this.getStepWorkerQueueName(rpcName)),
      claim: (...args) => this.claimStepForExecution(...args),
      openAttempt: (runId, forward, leaseMs) =>
        this.openStepAttempt(
          runId,
          forward,
          Math.min(this.cancelCheckIntervalMs, leaseRenewalIntervalMs(leaseMs))
        ),
      invoke: (...args) => this.invokeStepRpc(...args),
      wake: (runId, awaitedStep, delayMs) =>
        this.wakeLater(runId, delayMs, awaitedStep),
    }
  }

  private openStepAttempt(
    runId: string,
    forward: boolean,
    cancelCheckMs: number,
    leaseLost?: AbortSignal
  ): StepAttempt | undefined {
    if (!this.stepSignals) return undefined
    return openStepAttempt({
      ...this.stepAttemptSource(runId, cancelCheckMs, leaseLost),
      forward,
    })
  }

  private stepAttemptSource(
    runId: string,
    cancelCheckMs: number,
    leaseLost: AbortSignal | undefined
  ) {
    return {
      runId,
      cancelCheckMs,
      leaseLost,
      readRun: () => this.getRun(runId),
      logger: () => this.logger,
      onCancel: (cancel: () => void) =>
        trackStepCancel(this.contextFor(runId), cancel, () =>
          this.releaseIdleContext(runId)
        ),
    }
  }

  /**
   * The signal of one attempt of a step run in-process. `leaseLost` is the
   * signal of the run lease the calling pass holds, if it holds one.
   */
  public openInlineStepAttempt(
    runId: string,
    forward: boolean,
    leaseLost?: AbortSignal
  ): StepAttempt | undefined {
    return this.openStepAttempt(
      runId,
      forward,
      this.cancelCheckIntervalMs,
      leaseLost
    )
  }

  /**
   * A wait a pass sits out itself, a sleep or a `retryDelay`. It ends early once
   * the run is cancelled, resolving `true`, or the pass's run lease is lost.
   */
  public waitUnlessCancelled(
    runId: string,
    ms: number,
    leaseLost?: AbortSignal
  ): Promise<boolean> {
    return waitUnlessCancelled(
      this.stepAttemptSource(runId, this.cancelCheckIntervalMs, leaseLost),
      ms
    )
  }

  /** `awaitedStep` is set on the wake sent for a step whose worker lost it. */
  public async orchestrateWorkflow(
    runId: string,
    rpcService: PikkuRPC,
    awaitedStep?: WorkflowAwaitedStep
  ): Promise<void> {
    await orchestrateRun(
      {
        runJob: () => this.runWorkflowJob(runId, rpcService),
        requeue: (delay) =>
          this.enqueueOrchestration(runId, undefined, delay, awaitedStep),
        markFailedUnlessUnwound: (error) =>
          this.markFailedUnlessUnwound(runId, error),
        wakeWhileStepLeased: (step) =>
          wakeWhileStepLeased(this.queuedStepHost, runId, step),
      },
      runId,
      awaitedStep
    )
  }

  private invokeStepRpc(...args: StepRpcArgs): Promise<any> {
    return invokeStepRpc(this, ...args)
  }

  /** A host that cannot time a step throws here, for a replayed step too. */
  protected assertStepTimeoutSupported(
    _stepName: string,
    _timeout: string | number | undefined
  ): void {}

  private async rpcStep(
    runId: string,
    logicalStepName: string,
    rpcName: string,
    data: any,
    rpcService: PikkuRPC,
    stepOptions?: WorkflowRpcStepOptions,
    boundPass?: ReplayPass
  ): Promise<any> {
    const pass = this.passOf(runId, boundPass)
    throwIfLeaseLost(pass.leaseLost)
    const timeout = rpcStepTimeout(logicalStepName, rpcName, stepOptions)
    this.assertStepTimeoutSupported(logicalStepName, timeout)
    const fromStepName = pass.lastStep
    const stepName = this.nextStepKey(pass, logicalStepName)
    const resolvedStepOptions: WorkflowRpcStepOptions = {
      retries: stepOptions?.retries ?? DEFAULT_STEP_RETRIES,
      retryDelay: stepOptions?.retryDelay,
      timeout,
      virtualUser: stepOptions?.virtualUser,
    }
    const stepState = await this.loadOrCreateStep(
      runId,
      stepName,
      async () => {
        if (stepOptions?.compensate === false) {
          await this.updateRunState(
            runId,
            `${NO_COMPENSATE_STATE_PREFIX}${stepName}`,
            true
          )
        }
        return this.insertStepState(
          runId,
          stepName,
          rpcName,
          data,
          resolvedStepOptions,
          fromStepName
        )
      },
      pass.steps
    )
    throwIfLeaseLost(pass.leaseLost)

    if (stepState.status === 'succeeded') {
      return stepState.result
    }

    const retries = resolvedStepOptions.retries ?? this.getConfig().retries
    if (
      stepState.status === 'failed' &&
      !(await retriesFailedRpcStep(this.closureStepHost, runId, stepName, {
        stepState,
        retries,
        rpcName,
        virtualUser: resolvedStepOptions.virtualUser,
      }))
    ) {
      throw recordedStepError(stepName, stepState)
    }

    if (stepState.status === 'scheduled') {
      throw new WorkflowAsyncException(runId, stepName)
    }

    const lease = runningStepLease(stepState)
    if (
      lease === 'held' ||
      (isParkedOnChild(stepState) && !(await this.isInline(runId)))
    ) {
      throw new WorkflowAsyncException(runId, stepName)
    }

    const dispatched = resolvedStepOptions.virtualUser
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
      if (lease !== 'lapsed') {
        await this.setStepScheduled(stepState.stepId)
      }
      throw new WorkflowAsyncException(runId, stepName)
    }

    return holdInlineRpcStep(
      {
        service: this,
        openSteps: this.openSteps,
        invoke: (...args) => this.invokeStepRpc(...args),
        awaitChildEnd: (id) => this.awaitRunEnd(id, WORKFLOW_CHILD_POLL_MAX_MS),
      },
      {
        runId,
        stepName,
        stepState,
        rpcName,
        data,
        rpcService,
        options: resolvedStepOptions,
        retries,
        leaseLost: pass.leaseLost,
      }
    )
  }

  protected async inlineStep(
    runId: string,
    logicalStepName: string,
    fn: Function,
    stepOptions?: WorkflowStepOptions,
    data: any = null,
    rpcName: string | null = null,
    boundPass?: ReplayPass
  ): Promise<any> {
    const pass = this.passOf(runId, boundPass)
    throwIfLeaseLost(pass.leaseLost)
    assertNoClosureTimeout(logicalStepName, stepOptions)
    const fromStepName = pass.lastStep
    const stepName = this.nextStepKey(pass, logicalStepName)
    const stepState = await this.loadOrCreateStep(
      runId,
      stepName,
      () =>
        this.insertStepState(
          runId,
          stepName,
          rpcName,
          data,
          stepOptions,
          fromStepName
        ),
      pass.steps
    )

    return runClosureStep(
      this.closureStepHost,
      runId,
      stepName,
      stepState,
      fn,
      stepOptions?.retries ?? this.getConfig().retries,
      stepOptions?.retryDelay ?? this.getConfig().retryDelay,
      pass.leaseLost
    )
  }

  private get closureStepHost(): ClosureStepHost {
    return {
      openSteps: this.openSteps,
      isInline: (runId) => this.isInline(runId),
      throwIfRunStopped: (runId) => this.throwIfRunStopped(runId),
      waitUnlessCancelled: (...args) => this.waitUnlessCancelled(...args),
      updateRunState: (...args) => this.updateRunState(...args),
      setStepRunning: (...args) => this.setStepRunning(...args),
      setStepResult: (...args) => this.setStepResult(...args),
      setStepError: (...args) => this.setStepError(...args),
      createRetryAttempt: (...args) => this.createRetryAttempt(...args),
      logStepRerun: (...args) => this.logStepRerun(...args),
      logStepAttemptsExhausted: (...args) =>
        this.logStepAttemptsExhausted(...args),
      scheduleOrchestratorRetry: (...args) =>
        this.scheduleOrchestratorRetry(...args),
    }
  }

  private async sleepStep(
    runId: string,
    logicalStepName: string,
    duration: number,
    boundPass?: ReplayPass
  ) {
    const pass = this.passOf(runId, boundPass)
    throwIfLeaseLost(pass.leaseLost)
    const fromStepName = pass.lastStep
    const stepName = this.nextStepKey(pass, logicalStepName)
    const stepState = await this.loadOrCreateStep(
      runId,
      stepName,
      () =>
        this.insertStepState(
          runId,
          stepName,
          null,
          { duration },
          undefined,
          fromStepName
        ),
      pass.steps
    )

    await runSleepStep(
      this.sleepStepHost,
      runId,
      stepName,
      stepState,
      duration,
      pass.leaseLost
    )
  }

  private get sleepStepHost(): SleepStepHost {
    return {
      scheduleSleep: (...args) => this.scheduleSleep(...args),
      setStepScheduled: (stepId) => this.setStepScheduled(stepId),
      waitUnlessCancelled: (...args) => this.waitUnlessCancelled(...args),
      completeSleep: (stepId) => this.completeSleep(stepId),
    }
  }

  private async suspendStep(
    runId: string,
    reason: string,
    boundPass?: ReplayPass
  ): Promise<void> {
    const pass = this.passOf(runId, boundPass)
    throwIfLeaseLost(pass.leaseLost)
    const fromStepName = pass.lastStep
    const suspendStepName = this.nextStepKey(pass, suspendStepNameFor(reason))
    await this.withStepLock(runId, suspendStepName, () =>
      recordSuspension(
        this.approvalStore,
        runId,
        reason,
        suspendStepName,
        fromStepName
      )
    )
  }

  private get approvalStore(): ApprovalStore {
    return createApprovalStore(this, {
      logger: () => this.logger,
      enqueueWake: (...args) => this.enqueueOrchestration(...args),
    })
  }

  public async approveStep(
    runId: string,
    reason: string,
    decision: unknown,
    session?: CoreUserSession
  ): Promise<void> {
    return recordApprovalDecision(
      this.approvalStore,
      runId,
      reason,
      decision,
      approvalDeciderFrom(session)
    )
  }

  private async approvalStep(
    runId: string,
    reason: string,
    options: WorkflowApprovalOptions,
    boundPass?: ReplayPass
  ): Promise<ApprovalOutcome<unknown>> {
    const pass = this.passOf(runId, boundPass)
    throwIfLeaseLost(pass.leaseLost)
    const fromStepName = pass.lastStep
    const approvalStepName = this.nextStepKey(pass, approvalStepNameFor(reason))
    return await this.withStepLock(runId, approvalStepName, () =>
      evaluateApprovalStep(
        this.approvalStore,
        runId,
        reason,
        approvalStepName,
        fromStepName,
        options
      )
    )
  }

  public createWorkflowWire(
    name: string,
    runId: string,
    rpcService: PikkuRPC,
    addonNamespace?: string | null
  ): PikkuWorkflowWire {
    return this.wireFor(name, runId, rpcService, addonNamespace)
  }

  /** A wire whose steps belong to `boundPass`, when one is given. */
  private wireFor(
    name: string,
    runId: string,
    rpcService: PikkuRPC,
    addonNamespace?: string | null,
    boundPass?: ReplayPass
  ): PikkuWorkflowWire {
    const steps = stepsInPass(boundPass?.started, runId, {
      getRun: () => this.getRun(runId),
      verifyStepName: (stepName) => this.verifyStepName(stepName),
      rpcStep: (stepName, rpcName, data, options) =>
        this.rpcStep(
          runId,
          stepName,
          rpcName,
          data,
          rpcService,
          options,
          boundPass
        ),
      inlineStep: (stepName, fn, options) =>
        this.inlineStep(
          runId,
          stepName,
          fn,
          options,
          undefined,
          undefined,
          boundPass
        ),
      sleepStep: (stepName, ms) =>
        this.sleepStep(runId, stepName, ms, boundPass),
      suspendStep: (reason) => this.suspendStep(runId, reason, boundPass),
      approvalStep: (reason, options) =>
        this.approvalStep(runId, reason, options, boundPass),
    })
    const workflowWire = buildWorkflowWire(name, runId, addonNamespace, steps)
    this.runExtension?.decorateWorkflowWire(workflowWire, {
      name,
      runId,
      rpcService,
      addonNamespace,
      inlineStep: (id, stepName, fn, options, data, rpcName) =>
        inPass(boundPass?.started, id, stepName, () =>
          this.inlineStep(id, stepName, fn, options, data, rpcName, boundPass)
        ),
    })
    return workflowWire
  }

  private get compensationService(): CompensationService {
    return {
      service: this,
      unwinds: this.unwinds,
      logger: () => this.logger,
      wake: (runId) => this.wakeLater(runId),
      loadStep: (...args) => this.loadOrCreateStep(...args),
      dispatchStep: (...args) => this.dispatchStep(...args),
      invoke: (...args) => this.invokeStepRpc(...args),
      notifyParent: (run, error) => this.onChildWorkflowFailed(run, error),
    }
  }

  private unwindHost(rpcService: PikkuRPC): RunUnwindHost {
    return createRunUnwindHost(this.compensationService, rpcService)
  }

  private runUnderLease(
    runId: string,
    rpcService: PikkuRPC,
    pass: (leaseLost?: AbortSignal) => Promise<void>
  ): Promise<void> {
    return this.unwinds.runPass(this.unwindHost(rpcService), runId, pass)
  }

  private compensationApi(
    rpcService: PikkuRPC,
    leasedRunId?: string,
    leaseLost?: AbortSignal
  ): CompensationApi {
    return createCompensationApi(
      this.compensationService,
      rpcService,
      leasedRunId,
      leaseLost
    )
  }

  /**
   * `leaseHeld` says the caller is already inside `withRunLease` for this run,
   * and `leaseLost` is the signal it was given there.
   */
  public async failOrUnwind(
    run: WorkflowRun,
    error: Error & { code?: string },
    rpcService: PikkuRPC,
    leaseHeld = false,
    leaseLost?: AbortSignal
  ): Promise<'unwinding' | 'finished' | 'failed'> {
    const api = this.compensationApi(
      rpcService,
      leaseHeld ? run.id : undefined,
      leaseLost
    )
    return failRunOrUnwind(api, run, error, () =>
      this.onChildWorkflowFailed(run, error)
    )
  }

  /** Ends a run's body at its next inline attempt once the run has been stopped. */
  public async throwIfRunStopped(runId: string): Promise<void> {
    if (isRunStopped((await this.getRun(runId))?.status ?? '')) {
      throw new WorkflowCancelledException(runId)
    }
  }

  /** `leaseHeld` and `leaseLost` as in `failOrUnwind`. */
  public settleStoppedRun(
    runId: string,
    rpcService: PikkuRPC,
    leaseHeld = false,
    leaseLost?: AbortSignal
  ): Promise<WorkflowStatus | undefined> {
    return settleStoppedRun(
      this.compensationApi(
        rpcService,
        leaseHeld ? runId : undefined,
        leaseLost
      ),
      runId
    )
  }

  /** Stops an unfinished run, children first, and unwinds what it completed. */
  public async cancelRun(
    runId: string,
    rpcService: PikkuRPC,
    reason?: string
  ): Promise<WorkflowStatus | undefined> {
    const api = this.compensationApi(rpcService)
    return cancelAndUnwind(api, createUnwindHost(api), runId, reason)
  }

  protected async markFailedUnlessUnwound(
    runId: string,
    error: SerializedError
  ): Promise<void> {
    await this.updateRunStatus(runId, 'failed', undefined, error)
  }

  protected verifyStepName(stepName: string) {
    if (typeof stepName !== 'string') {
      throw new WorkflowStepNameNotString(stepName)
    }
  }

  private getConfig(): WorkflowServiceConfig {
    return resolveWorkflowConfig()
  }

  protected getOrchestratorQueueName(workflowName?: string): string {
    return orchestratorQueueName(this.queueStrategy, workflowName)
  }

  protected getStepWorkerQueueName(rpcName?: string): string {
    return stepWorkerQueueName(this.queueStrategy, rpcName)
  }

  protected getJobGroup(id?: string): JobGroup | undefined {
    return jobGroupFor(this.queueStrategy, id)
  }
}
