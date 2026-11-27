import { PikkuWorkflowService } from './pikku-workflow-service.js'
import { isExpectedError } from '../../errors/error-handler.js'
import {
  WORKFLOW_TERMINAL_STATES,
  isCompensationStepName,
  isStepExecuting,
  isStepLeaseLive,
  STEP_SOURCES,
} from './workflow-constants.js'
import { APPROVAL_STEP_RPC_NAME } from './workflow-approval.js'
import type { PendingApproval } from './workflow-recovery.js'
import type { SerializedError } from '../../errors/serialized-error.js'
import type {
  WorkflowPlannedStep,
  WorkflowQueueOptions,
  WorkflowRunMirror,
  WorkflowRun,
  WorkflowRunService,
  WorkflowRunWire,
  StepState,
  StepStatus,
  WorkflowStatus,
  WorkflowVersionStatus,
  WorkflowRpcStepOptions,
} from './workflow.types.js'

interface InternalStepData {
  rpcName: string | null
  data: any
  stepName: string
}

// knowledge: decisions/internals/the-in-memory-workflow-service-is-inline-only-and-single-process.md
/**
 * A workflow service that keeps runs, steps and state in memory and runs every
 * step inline. For tests and local development: nothing survives a restart, and
 * it does not wire workflow queues or coordinate with another process.
 */
export class InMemoryWorkflowService
  extends PikkuWorkflowService
  implements WorkflowRunService
{
  /** Its runs live in this process, so nothing else can be working one. */
  protected override readonly openStepsAreAllSteps: boolean = true

  constructor(
    options: WorkflowQueueOptions & { mirror?: WorkflowRunMirror } = {}
  ) {
    super({ ...options, wireQueues: false })
  }

  private sleepTimers = new Set<ReturnType<typeof setTimeout>>()
  private runs = new Map<string, WorkflowRun>()
  private steps = new Map<string, StepState>() // keyed by `${runId}:${stepName}`
  private stepData = new Map<string, InternalStepData>() // keyed by stepId
  private stepHistory = new Map<
    string,
    Array<StepState & { stepName: string }>
  >() // keyed by runId
  private runState = new Map<string, Record<string, unknown>>() // keyed by runId
  private branchKeys = new Map<string, string>() // keyed by stepId
  private workflowVersions = new Map<
    string,
    { graph: any; source: string; status: WorkflowVersionStatus }
  >() // keyed by `${name}:${graphHash}`

  protected async createRunImpl(
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
    const runId = globalThis.crypto.randomUUID()
    const now = new Date()

    const run: WorkflowRun = {
      id: runId,
      workflow: workflowName,
      status: 'running',
      input,
      inline,
      graphHash,
      deterministic: options?.deterministic,
      plannedSteps: options?.plannedSteps,
      wire,
      createdAt: now,
      updatedAt: now,
    }

    this.runs.set(runId, run)
    this.stepHistory.set(runId, [])
    this.runState.set(runId, {})

    if (inline) {
      this.registerInlineRun(runId)
    }

    return runId
  }

  protected override async scheduleSleep(
    runId: string,
    stepId: string,
    duration: number
  ): Promise<boolean> {
    const resume = async () => {
      this.sleepTimers.delete(timer)
      try {
        await this.executeWorkflowSleepCompleted(runId, stepId)
      } catch (error: any) {
        this.logger?.error(
          `Failed to resume workflow sleep for runId ${runId}: ${error?.message ?? error}`
        )
      }
    }
    // Fire-and-forget timer callback: resume catches and logs every error.
    const timer = setTimeout(() => void resume(), duration)
    this.sleepTimers.add(timer)
    return true
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    return this.runs.get(id) || null
  }

  async getRunHistory(
    runId: string
  ): Promise<Array<StepState & { stepName: string }>> {
    return this.stepHistory.get(runId) || []
  }

  protected async transitionRunStatusImpl(
    id: string,
    from: readonly WorkflowStatus[],
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<boolean> {
    const run = this.runs.get(id)
    if (!run || !from.includes(run.status)) return false
    run.status = status
    run.updatedAt = new Date()
    if (output !== undefined) run.output = output
    if (error !== undefined) run.error = error
    return true
  }

  protected async insertStepStateImpl(
    runId: string,
    stepName: string,
    rpcName: string | null,
    data: any,
    stepOptions?: WorkflowRpcStepOptions,
    fromStepName?: string
  ): Promise<StepState> {
    const stepId = globalThis.crypto.randomUUID()
    const now = new Date()

    const step: StepState & { stepName: string } = {
      stepId,
      status: 'pending',
      rpcName,
      attemptCount: 1,
      retries: stepOptions?.retries,
      retryDelay: stepOptions?.retryDelay,
      timeout: stepOptions?.timeout,
      fromStepName,
      createdAt: now,
      updatedAt: now,
      stepName,
    }

    const key = `${runId}:${stepName}`
    this.steps.set(key, step)
    this.stepData.set(stepId, { rpcName, data, stepName })

    // knowledge: decisions/internals/in-memory-workflow-history-aliases-the-live-step-object.md
    const history = this.stepHistory.get(runId) || []
    history.push(step)
    this.stepHistory.set(runId, history)

    return step
  }

  async getStepState(runId: string, stepName: string): Promise<StepState> {
    const key = `${runId}:${stepName}`
    const step = this.steps.get(key)
    if (!step) {
      throw new Error(
        `Step not found: runId=${runId}, stepName=${stepName}. Use insertStepState to create it.`
      )
    }
    return step
  }

  /**
   * The live step `stepId` names, when it is in one of `from` and `attempt`
   * still owns it. A retry is a new step with its own id, so a superseded
   * attempt's id no longer names a live step at all. Nothing awaits between
   * this and the write that follows, which makes the two atomic.
   */
  private writableStep(
    stepId: string,
    from: readonly StepStatus[],
    attempt?: number
  ): StepState | undefined {
    const step = this.liveStep(stepId)
    if (!step || !from.includes(step.status)) return undefined
    if (attempt !== undefined && step.attemptCount !== attempt) return undefined
    return step
  }

  private liveStep(stepId: string): StepState | undefined {
    for (const step of this.steps.values()) {
      if (step.stepId === stepId) return step
    }
    return undefined
  }

  protected async setStepRunningImpl(
    stepId: string,
    from: readonly StepStatus[],
    attempt?: number
  ): Promise<boolean> {
    const step = this.writableStep(stepId, from, attempt)
    if (!step) return false
    step.status = 'running'
    step.runningAt = new Date()
    step.updatedAt = new Date()
    return true
  }

  protected async setStepCancellingImpl(
    stepId: string,
    from: readonly StepStatus[],
    attempt: number
  ): Promise<boolean> {
    const step = this.writableStep(stepId, from, attempt)
    if (!step) return false
    step.status = 'cancelling'
    step.updatedAt = new Date()
    return true
  }

  protected async claimStepStatus(
    seen: StepState,
    from: readonly StepStatus[],
    leaseMs: number
  ): Promise<boolean> {
    const step = this.writableStep(seen.stepId, from, seen.attemptCount)
    if (!step) return false
    if (
      isStepExecuting(step.status) &&
      (step.childRunId != null || isStepLeaseLive(step.leaseExpiresAt))
    ) {
      return false
    }
    step.status = 'running'
    step.leaseExpiresAt = new Date(Date.now() + leaseMs)
    step.updatedAt = new Date()
    return true
  }

  public override async refreshStepLease(
    stepId: string,
    leaseMs: number | null,
    attempt?: number
  ): Promise<boolean> {
    const step = this.writableStep(stepId, STEP_SOURCES.inFlight, attempt)
    if (!step) return false
    step.leaseExpiresAt =
      leaseMs === null ? undefined : new Date(Date.now() + leaseMs)
    return true
  }

  protected async setStepScheduledImpl(
    stepId: string,
    from: readonly StepStatus[]
  ): Promise<boolean> {
    const step = this.writableStep(stepId, from)
    if (!step) return false
    step.status = 'scheduled'
    step.scheduledAt = new Date()
    step.updatedAt = new Date()
    return true
  }

  protected async setStepResultImpl(
    stepId: string,
    result: any,
    attempt: number | undefined,
    from: readonly StepStatus[]
  ): Promise<boolean> {
    const step = this.writableStep(stepId, from, attempt)
    if (!step) return false
    step.status = 'succeeded'
    step.result = result
    step.succeededAt = new Date()
    step.updatedAt = new Date()
    return true
  }

  protected async setStepErrorImpl(
    stepId: string,
    error: Error,
    attempt: number | undefined,
    from: readonly StepStatus[]
  ): Promise<boolean> {
    const step = this.writableStep(stepId, from, attempt)
    if (!step) return false
    step.status = 'failed'
    step.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      expected: isExpectedError(error),
    }
    step.failedAt = new Date()
    step.updatedAt = new Date()
    return true
  }

  protected async setStepChildRunIdImpl(
    stepId: string,
    childRunId: string,
    from: readonly StepStatus[]
  ): Promise<boolean> {
    const step = this.writableStep(stepId, from)
    if (!step) return false
    step.childRunId = childRunId
    step.updatedAt = new Date()
    return true
  }

  protected async createRetryAttemptImpl(
    failedStepId: string,
    status: 'pending' | 'running',
    from: readonly StepStatus[],
    attempt?: number
  ): Promise<StepState | null> {
    let failedStep: StepState | undefined
    let runId: string | undefined
    let stepName: string | undefined

    for (const [key, step] of this.steps.entries()) {
      if (step.stepId === failedStepId) {
        failedStep = step
        const parts = key.split(':')
        runId = parts[0]
        stepName = parts.slice(1).join(':')
        break
      }
    }

    if (!this.stepData.has(failedStepId)) {
      throw new Error(`Step not found: ${failedStepId}`)
    }

    if (
      !runId ||
      !stepName ||
      !this.writableStep(failedStepId, from, attempt)
    ) {
      return null
    }
    failedStep = failedStep!

    const failedStepData = this.stepData.get(failedStepId)
    const newStepId = globalThis.crypto.randomUUID()
    const now = new Date()

    const newStep: StepState & { stepName: string } = {
      stepId: newStepId,
      status,
      rpcName: failedStep.rpcName,
      attemptCount: failedStep.attemptCount + 1,
      retries: failedStep.retries,
      retryDelay: failedStep.retryDelay,
      timeout: failedStep.timeout,
      fromStepName: failedStep.fromStepName,
      createdAt: now,
      updatedAt: now,
      stepName: stepName,
    }

    if (status === 'running') {
      newStep.runningAt = now
    }

    const key = `${runId}:${stepName}`
    this.steps.set(key, newStep)

    if (failedStepData) {
      this.stepData.set(newStepId, { ...failedStepData })
    }

    // knowledge: decisions/internals/in-memory-workflow-history-aliases-the-live-step-object.md
    const history = this.stepHistory.get(runId) || []
    history.push(newStep)
    this.stepHistory.set(runId, history)

    return newStep
  }

  /**
   * Safe to opt in despite the pass-through `withStepLock`: this service wires
   * no queues and runs every step inline in one process, so the relay's
   * redundant dispatch has no second holder to race with. See
   * knowledge: decisions/internals/the-in-memory-workflow-service-is-inline-only-and-single-process.md
   */
  protected async findUndispatchedSteps(
    before: Date,
    limit: number
  ): Promise<Array<{ runId: string; stepId: string }>> {
    const undispatched: Array<{ runId: string; stepId: string }> = []
    for (const [runId, run] of this.runs) {
      if (run.status !== 'running' && run.status !== 'compensating') continue
      for (const step of this.stepHistory.get(runId) ?? []) {
        if (step.status !== 'pending') continue
        if (run.status === 'compensating' && !this.isCompensation(step)) {
          continue
        }
        if (step.updatedAt >= before) continue
        undispatched.push({ runId, stepId: step.stepId })
        if (undispatched.length >= limit) return undispatched
      }
    }
    return undispatched
  }

  private isCompensation({ stepId }: StepState): boolean {
    for (const [key, step] of this.steps) {
      if (step.stepId === stepId) return isCompensationStepName(key)
    }
    return false
  }

  private isExecutingStepHeld(
    runId: string,
    stepName: string,
    { childRunId, leaseExpiresAt }: StepState
  ) {
    if (childRunId === undefined) {
      // With no lease, only a pass in this process can be working it.
      return leaseExpiresAt == null
        ? this.isStepOpen(runId, stepName)
        : isStepLeaseLive(leaseExpiresAt)
    }
    if (leaseExpiresAt != null && isStepLeaseLive(leaseExpiresAt)) return true
    const child = this.runs.get(childRunId)?.status
    return child === undefined || !WORKFLOW_TERMINAL_STATES.has(child)
  }

  /** The latest attempt of each of a run's steps. */
  private latestSteps(runId: string): Array<[string, StepState]> {
    const prefix = `${runId}:`
    return [...this.steps]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, step]) => [key.slice(prefix.length), step])
  }

  protected override async findPendingApprovals(
    before: Date,
    limit: number,
    offset: number
  ): Promise<PendingApproval[]> {
    const pending: PendingApproval[] = []
    for (const [runId, run] of this.runs) {
      if (run.status !== 'suspended' || run.updatedAt >= before) continue
      for (const [key, step] of this.steps) {
        if (!key.startsWith(`${runId}:`)) continue
        if (step.status !== 'running') continue
        if (step.rpcName !== APPROVAL_STEP_RPC_NAME) continue
        if (step.updatedAt >= before) continue
        pending.push({ runId, stepName: key.slice(runId.length + 1) })
      }
    }
    return pending.slice(offset, offset + limit)
  }

  protected async findStalledRunIds(
    before: Date,
    limit: number
  ): Promise<string[]> {
    const stalled: string[] = []
    for (const [runId, run] of this.runs) {
      if (run.status !== 'running' && run.status !== 'compensating') continue
      const steps = this.stepHistory.get(runId) ?? []
      if (
        this.latestSteps(runId).some(
          ([stepName, step]) =>
            // An unwind settles a forward step that was only dispatched.
            (step.status === 'scheduled' &&
              (run.status === 'running' || isCompensationStepName(stepName))) ||
            step.status === 'suspended' ||
            (isStepExecuting(step.status) &&
              this.isExecutingStepHeld(runId, stepName, step))
        )
      ) {
        continue
      }
      const lastActivity = steps.reduce(
        (latest, step) => (step.updatedAt > latest ? step.updatedAt : latest),
        run.updatedAt
      )
      if (lastActivity >= before) continue
      stalled.push(runId)
      if (stalled.length >= limit) break
    }
    return stalled
  }

  async listRuns(options?: {
    workflowName?: string
    status?: string
    limit?: number
    offset?: number
  }): Promise<WorkflowRun[]> {
    let runs = Array.from(this.runs.values())
    if (options?.workflowName) {
      runs = runs.filter((r) => r.workflow === options.workflowName)
    }
    if (options?.status) {
      runs = runs.filter((r) => r.status === options.status)
    }
    runs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    const offset = options?.offset ?? 0
    const limit = options?.limit ?? runs.length
    return runs.slice(offset, offset + limit)
  }

  async getRunSteps(
    runId: string
  ): Promise<
    Array<StepState & { stepName: string; rpcName?: string; data?: any }>
  > {
    const history = this.stepHistory.get(runId) || []
    return history.map((step) => {
      const stepDataEntry = this.stepData.get(step.stepId)
      return {
        ...step,
        rpcName: stepDataEntry?.rpcName ?? undefined,
        data: stepDataEntry?.data,
      }
    })
  }

  async getDistinctWorkflowNames(): Promise<string[]> {
    const names = new Set<string>()
    for (const run of this.runs.values()) {
      names.add(run.workflow)
    }
    return Array.from(names)
  }

  async deleteRun(id: string): Promise<boolean> {
    const existed = this.runs.has(id)
    this.runs.delete(id)
    this.stepHistory.delete(id)
    this.runState.delete(id)
    const prefix = `${id}:`
    for (const key of this.steps.keys()) {
      if (key.startsWith(prefix)) {
        const step = this.steps.get(key)
        if (step) {
          this.stepData.delete(step.stepId)
          this.branchKeys.delete(step.stepId)
        }
        this.steps.delete(key)
      }
    }
    return existed
  }

  async withRunLease<T>(_id: string, fn: () => Promise<T>): Promise<T> {
    // knowledge: decisions/internals/the-in-memory-workflow-service-is-inline-only-and-single-process.md
    return fn()
  }

  async withStepLock<T>(
    _runId: string,
    _stepName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    return fn()
  }

  async close(): Promise<void> {
    for (const timer of this.sleepTimers) {
      clearTimeout(timer)
    }
    this.sleepTimers.clear()
    this.runs.clear()
    this.steps.clear()
    this.stepData.clear()
    this.stepHistory.clear()
    this.runState.clear()
    this.branchKeys.clear()
    this.workflowVersions.clear()
  }

  async getCompletedGraphState(runId: string): Promise<{
    completedNodeIds: string[]
    failedNodeIds: string[]
    branchKeys: Record<string, string>
  }> {
    const completedNodeIds: string[] = []
    const failedNodeIds: string[] = []
    const prefix = `${runId}:`
    for (const [key, step] of this.steps.entries()) {
      if (!key.startsWith(prefix)) continue
      const nodeId = key.substring(prefix.length)
      if (step.status === 'succeeded') {
        completedNodeIds.push(nodeId)
      } else if (step.status === 'failed') {
        const maxAttempts = (step.retries ?? 0) + 1
        if (step.attemptCount >= maxAttempts) {
          failedNodeIds.push(nodeId)
        }
      }
    }

    const branchKeys: Record<string, string> = {}
    for (const [stepId, branchKey] of this.branchKeys.entries()) {
      const stepData = this.stepData.get(stepId)
      if (stepData) {
        branchKeys[stepData.stepName] = branchKey
      }
    }

    return { completedNodeIds, failedNodeIds, branchKeys }
  }

  protected override async listStepStates(
    runId: string
  ): Promise<Array<StepState & { stepName: string }>> {
    const prefix = `${runId}:`
    const steps: Array<StepState & { stepName: string }> = []
    for (const [key, step] of this.steps.entries()) {
      if (!key.startsWith(prefix)) continue
      steps.push({ ...step, stepName: key.substring(prefix.length) })
    }
    return steps
  }

  async getStepInstances(runId: string): Promise<
    Array<{
      stepName: string
      status: StepStatus
      fromStepName?: string
      leaseExpiresAt?: Date
    }>
  > {
    const prefix = `${runId}:`
    const instances: Array<{
      stepName: string
      status: StepStatus
      fromStepName?: string
      leaseExpiresAt?: Date
    }> = []
    for (const [key, step] of this.steps.entries()) {
      if (!key.startsWith(prefix)) continue
      instances.push({
        stepName: key.substring(prefix.length),
        status: step.status,
        fromStepName: step.fromStepName,
        leaseExpiresAt: step.leaseExpiresAt,
      })
    }
    return instances
  }

  async getNodeResults(
    runId: string,
    nodeIds: string[]
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {}
    for (const nodeId of nodeIds) {
      const key = `${runId}:${nodeId}`
      const step = this.steps.get(key)
      if (step?.result !== undefined) {
        results[nodeId] = step.result
      }
    }
    return results
  }

  async setBranchKey(
    runId: string,
    nodeId: string,
    branchKey: string
  ): Promise<void> {
    const key = `${runId}:${nodeId}`
    const step = this.steps.get(key)
    if (step) {
      this.branchKeys.set(step.stepId, branchKey)
    }
  }

  protected async setBranchTakenImpl(
    stepId: string,
    branchKey: string,
    from: readonly StepStatus[]
  ): Promise<boolean> {
    if (!this.writableStep(stepId, from)) return false
    this.branchKeys.set(stepId, branchKey)
    return true
  }

  protected async updateRunStateImpl(
    runId: string,
    name: string,
    value: unknown
  ): Promise<void> {
    const state = this.runState.get(runId) || {}
    state[name] = value
    this.runState.set(runId, state)
  }

  async getRunState(runId: string): Promise<Record<string, unknown>> {
    return this.runState.get(runId) || {}
  }

  protected async upsertWorkflowVersionImpl(
    name: string,
    graphHash: string,
    graph: any,
    source: string,
    status?: WorkflowVersionStatus
  ): Promise<void> {
    this.workflowVersions.set(`${name}:${graphHash}`, {
      graph,
      source,
      status: status ?? 'active',
    })
  }

  protected async updateWorkflowVersionStatusImpl(
    name: string,
    graphHash: string,
    status: WorkflowVersionStatus
  ): Promise<void> {
    const key = `${name}:${graphHash}`
    const version = this.workflowVersions.get(key)
    if (version) {
      version.status = status
    }
  }

  async getWorkflowVersion(
    name: string,
    graphHash: string
  ): Promise<{ graph: any; source: string } | null> {
    const version = this.workflowVersions.get(`${name}:${graphHash}`)
    if (!version) return null
    return { graph: version.graph, source: version.source }
  }
}
