import type { SerializedError } from '@pikku/core/errors'
import {
  PikkuWorkflowService,
  WorkflowStepFunctionMismatchError,
  STEP_SOURCES,
} from '@pikku/core/workflow'
import type {
  WorkflowPlannedStep,
  WorkflowServiceOptions,
  WorkflowRun,
  WorkflowRunWire,
  StepState,
  StepStatus,
  WorkflowStatus,
  WorkflowVersionStatus,
  WorkflowRpcStepOptions,
} from '@pikku/core/workflow'
import type { Db, Collection } from 'mongodb'
import { MongoDBWorkflowRunService } from './mongodb-workflow-run-service.js'

interface WorkflowRunDoc {
  _id: string
  workflow: string
  status: string
  input: any
  output: any | null
  error: any | null
  state: Record<string, unknown>
  inline: boolean
  graphHash: string | null
  deterministic?: boolean
  plannedSteps?: WorkflowPlannedStep[]
  wire: any | null
  createdAt: Date
  updatedAt: Date
}

interface WorkflowStepDoc {
  _id: string
  workflowRunId: string
  stepName: string
  rpcName: string | null
  data: any | null
  status: string
  result: any | null
  error: any | null
  childRunId?: string
  branchTaken: string | null
  retries: number | null
  retryDelay: string | null
  timeout?: string | null
  fromStepName?: string | null
  /** The claim that owns the step; every history document carries its own. */
  attempt: number
  leaseExpiresAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

interface WorkflowStepHistoryDoc {
  _id: string
  workflowStepId: string
  attempt: number
  status: string
  result: any | null
  error: any | null
  createdAt: Date
  runningAt: Date | null
  scheduledAt: Date | null
  succeededAt: Date | null
  failedAt: Date | null
}

interface WorkflowVersionDoc {
  workflowName: string
  graphHash: string
  graph: any
  source: string
  status: string
  createdAt: Date
}

const ENCODED_STATE_KEY = '__enc_'

/** Field names cannot hold `.` or `$`, and step names are free text. */
const encodeStateKey = (name: string): string =>
  /^[a-zA-Z0-9_]+$/.test(name) && !name.startsWith(ENCODED_STATE_KEY)
    ? name
    : ENCODED_STATE_KEY + Buffer.from(name, 'utf8').toString('hex')

const decodeStateKey = (key: string): string =>
  key.startsWith(ENCODED_STATE_KEY)
    ? Buffer.from(key.slice(ENCODED_STATE_KEY.length), 'hex').toString('utf8')
    : key

export class MongoDBWorkflowService extends PikkuWorkflowService {
  private initialized = false
  private runService: MongoDBWorkflowRunService
  private runs: Collection<WorkflowRunDoc>
  private steps: Collection<WorkflowStepDoc>
  private stepHistory: Collection<WorkflowStepHistoryDoc>
  private versions: Collection<WorkflowVersionDoc>

  constructor(db: Db, options: WorkflowServiceOptions) {
    super(options)
    this.runService = new MongoDBWorkflowRunService(db)
    this.runs = db.collection<WorkflowRunDoc>('workflow_runs')
    this.steps = db.collection<WorkflowStepDoc>('workflow_step')
    this.stepHistory = db.collection<WorkflowStepHistoryDoc>(
      'workflow_step_history'
    )
    this.versions = db.collection<WorkflowVersionDoc>('workflow_versions')
  }

  public async init(): Promise<void> {
    if (this.initialized) return

    await this.runs.createIndex({ workflow: 1 })
    await this.runs.createIndex({ status: 1 })
    await this.runs.createIndex({ createdAt: -1 })

    await this.steps.createIndex(
      { workflowRunId: 1, stepName: 1 },
      { unique: true }
    )
    await this.steps.createIndex({ workflowRunId: 1 })

    await this.stepHistory.createIndex({ workflowStepId: 1 })
    await this.stepHistory.createIndex({ createdAt: 1 })

    await this.versions.createIndex(
      { workflowName: 1, graphHash: 1 },
      { unique: true }
    )

    this.initialized = true
  }

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
    const id = crypto.randomUUID()
    const now = new Date()

    await this.runs.insertOne({
      _id: id,
      workflow: workflowName,
      status: 'running',
      input,
      output: null,
      error: null,
      state: {},
      inline,
      graphHash,
      deterministic: options?.deterministic ?? false,
      plannedSteps: options?.plannedSteps ?? [],
      wire,
      createdAt: now,
      updatedAt: now,
    })

    return id
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    return this.runService.getRun(id)
  }

  protected async transitionRunStatusImpl(
    id: string,
    from: readonly WorkflowStatus[],
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<boolean> {
    const moved = await this.runs.updateOne(
      { _id: id, status: { $in: [...from] } },
      {
        $set: {
          status,
          output: output ?? null,
          error: error ?? null,
          updatedAt: new Date(),
        },
      }
    )
    return moved.matchedCount > 0
  }

  protected async insertStepStateImpl(
    runId: string,
    stepName: string,
    rpcName: string | null,
    data: any,
    stepOptions?: WorkflowRpcStepOptions,
    fromStepName?: string
  ): Promise<StepState> {
    const stepId = crypto.randomUUID()
    const now = new Date()

    await this.steps.insertOne({
      _id: stepId,
      workflowRunId: runId,
      stepName,
      rpcName,
      data: data ?? null,
      status: 'pending',
      result: null,
      error: null,
      branchTaken: null,
      retries: stepOptions?.retries ?? null,
      retryDelay: stepOptions?.retryDelay?.toString() ?? null,
      timeout: stepOptions?.timeout?.toString() ?? null,
      fromStepName: fromStepName ?? null,
      attempt: 1,
      createdAt: now,
      updatedAt: now,
    })

    await this.insertHistoryRecord(stepId, 1, 'pending')

    return {
      stepId,
      status: 'pending',
      rpcName,
      result: undefined,
      error: undefined,
      attemptCount: 1,
      retries: stepOptions?.retries,
      retryDelay: stepOptions?.retryDelay?.toString(),
      timeout: stepOptions?.timeout?.toString(),
      fromStepName,
      createdAt: now,
      updatedAt: now,
    }
  }

  async getStepState(runId: string, stepName: string): Promise<StepState> {
    const row = await this.steps.findOne({
      workflowRunId: runId,
      stepName,
    })

    if (!row) {
      throw new Error(
        `Step not found: runId=${runId}, stepName=${stepName}. Use insertStepState to create it.`
      )
    }

    return this.toStepState(row)
  }

  private toStepState(row: WorkflowStepDoc): StepState {
    return {
      stepId: row._id,
      status: row.status as StepState['status'],
      rpcName: row.rpcName ?? null,
      result: row.result ?? undefined,
      error: row.error ?? undefined,
      attemptCount: row.attempt,
      retries: row.retries != null ? Number(row.retries) : undefined,
      retryDelay: row.retryDelay ?? undefined,
      timeout: row.timeout ?? undefined,
      fromStepName: row.fromStepName ?? undefined,
      childRunId: row.childRunId ?? undefined,
      leaseExpiresAt: row.leaseExpiresAt ?? undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }
  }

  async getRunSteps(
    runId: string
  ): Promise<
    Array<StepState & { stepName: string; rpcName?: string; data?: any }>
  > {
    return this.runService.getRunSteps(runId)
  }

  async getRunHistory(
    runId: string
  ): Promise<Array<StepState & { stepName: string }>> {
    return this.runService.getRunHistory(runId)
  }

  protected async setStepRunningImpl(
    stepId: string,
    from: readonly StepStatus[],
    attempt?: number
  ): Promise<boolean> {
    if (
      !(await this.writeStepIfIn(stepId, from, { status: 'running' }, attempt))
    ) {
      return false
    }
    await this.writeLatestHistory(stepId, 'running', {}, attempt)
    return true
  }

  protected async setStepScheduledImpl(
    stepId: string,
    from: readonly StepStatus[]
  ): Promise<boolean> {
    if (!(await this.writeStepIfIn(stepId, from, { status: 'scheduled' }))) {
      return false
    }
    await this.writeLatestHistory(stepId, 'scheduled')
    return true
  }

  /**
   * Update a step only while it is in one of `from` and, with `attempt`, still
   * on that attempt. One filtered update, so the check and the write are atomic.
   */
  private async writeStepIfIn(
    stepId: string,
    from: readonly StepStatus[],
    values: Partial<WorkflowStepDoc>,
    attempt?: number
  ): Promise<boolean> {
    const written = await this.steps.updateOne(
      {
        _id: stepId,
        status: { $in: [...from] },
        ...(attempt === undefined ? {} : { attempt }),
      },
      { $set: { ...values, updatedAt: new Date() } }
    )
    return written.matchedCount > 0
  }

  /**
   * Move one attempt of a step's history to a status — `attempt`, or the
   * newest when it is not given.
   *
   * Finding the newest attempt and then updating it by `_id` was two round
   * trips with a window in between; `findOneAndUpdate` applies the same sort
   * server-side and writes the row it selected, so nothing can move underneath
   * it.
   */
  private async writeLatestHistory(
    stepId: string,
    status: string,
    values: Record<string, unknown> = {},
    attempt?: number
  ): Promise<void> {
    const now = new Date()
    const update: Record<string, unknown> = { status, ...values }
    const timestampField = this.getTimestampFieldForStatus(status)
    if (timestampField !== 'createdAt') {
      update[timestampField] = now
    }

    await this.stepHistory.findOneAndUpdate(
      attempt === undefined
        ? { workflowStepId: stepId }
        : { workflowStepId: stepId, attempt },
      { $set: update as any },
      { sort: { attempt: -1 } }
    )
  }

  private async insertHistoryRecord(
    stepId: string,
    attempt: number,
    status: string,
    result?: any,
    error?: SerializedError
  ): Promise<void> {
    const now = new Date()
    const doc: any = {
      _id: crypto.randomUUID(),
      workflowStepId: stepId,
      attempt,
      status,
      result: result ?? null,
      error: error ?? null,
      createdAt: now,
      runningAt: null,
      scheduledAt: null,
      succeededAt: null,
      failedAt: null,
    }

    const timestampField = this.getTimestampFieldForStatus(status)
    if (timestampField !== 'createdAt') {
      doc[timestampField] = now
    }

    await this.stepHistory.insertOne(doc)
  }

  private getTimestampFieldForStatus(status: string): string {
    switch (status) {
      case 'running':
        return 'runningAt'
      case 'scheduled':
        return 'scheduledAt'
      case 'succeeded':
        return 'succeededAt'
      case 'failed':
        return 'failedAt'
      default:
        return 'createdAt'
    }
  }

  protected async setStepChildRunIdImpl(
    stepId: string,
    childRunId: string,
    from: readonly StepStatus[]
  ): Promise<boolean> {
    return this.writeStepIfIn(stepId, from, { childRunId })
  }

  public override async refreshStepLease(
    stepId: string,
    leaseMs: number | null,
    attempt?: number
  ): Promise<boolean> {
    const renewed = await this.steps.updateOne(
      {
        _id: stepId,
        status: { $in: [...STEP_SOURCES.inFlight] },
        ...(attempt === undefined ? {} : { attempt }),
      },
      {
        $set: {
          leaseExpiresAt:
            leaseMs === null ? null : new Date(Date.now() + leaseMs),
        },
      }
    )
    return renewed.matchedCount > 0
  }

  protected async setStepResultImpl(
    stepId: string,
    result: any,
    attempt: number | undefined,
    from: readonly StepStatus[]
  ): Promise<boolean> {
    const values = { status: 'succeeded' as const, result, error: null }
    if (!(await this.writeStepIfIn(stepId, from, values, attempt))) {
      return false
    }
    await this.writeLatestHistory(stepId, 'succeeded', { result }, attempt)
    return true
  }

  protected async setStepErrorImpl(
    stepId: string,
    error: Error,
    attempt: number | undefined,
    from: readonly StepStatus[]
  ): Promise<boolean> {
    const serializedError: SerializedError = {
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
    }
    const values = {
      status: 'failed' as const,
      error: serializedError,
      result: null,
    }
    if (!(await this.writeStepIfIn(stepId, from, values, attempt))) {
      return false
    }
    await this.writeLatestHistory(
      stepId,
      'failed',
      { error: serializedError },
      attempt
    )
    return true
  }

  protected async createRetryAttemptImpl(
    stepId: string,
    status: 'pending' | 'running',
    from: readonly StepStatus[],
    attempt?: number
  ): Promise<StepState | null> {
    const row = await this.steps.findOneAndUpdate(
      {
        _id: stepId,
        status: { $in: [...from] },
        ...(attempt === undefined ? {} : { attempt }),
      },
      {
        $set: {
          status,
          result: null,
          error: null,
          updatedAt: new Date(),
        },
        $unset: { childRunId: '' },
        $inc: { attempt: 1 },
      },
      { returnDocument: 'after' }
    )
    if (!row) return null

    await this.insertHistoryRecord(stepId, row.attempt, status)
    return this.toStepState(row)
  }

  /**
   * Claim the step with a guarded update and read what it matched: a
   * single-document update is atomic in MongoDB, so two dispatches racing for
   * the same step cannot both proceed.
   *
   * This replaces the read-then-write the base engine does under
   * `withStepLock`: one atomic write needs no lease round-trips around it. The
   * winner then goes through the ordinary transition methods, so history rows
   * see exactly what they saw before.
   *
   * A `running` step is taken back only once its lease has lapsed, and the
   * lease is part of the same guarded update, so two dispatches that read one
   * lapsed lease cannot both take the step.
   */
  protected override async claimStepForExecution(
    runId: string,
    stepName: string,
    rpcName: string,
    leaseMs: number
  ): Promise<StepState | null> {
    const stepState = await this.getStepState(runId, stepName)

    // knowledge: decisions/security/a-step-runs-the-function-the-workflow-dispatched-it-with.md
    if (
      stepState.rpcName !== undefined &&
      stepState.rpcName !== (rpcName ?? null)
    ) {
      throw new WorkflowStepFunctionMismatchError(runId, stepName)
    }

    const { status } = stepState
    if (await this.settleUnclaimableStep(runId, stepName, stepState, leaseMs)) {
      return null
    }

    if (stepState.status === 'failed' || stepState.status === 'running') {
      const reclaimed = await this.mirrored(
        () => this.reclaimStepAttempt(stepState, leaseMs),
        async (mirror, newStep) => {
          if (newStep) {
            await mirror.createRetryAttempt(stepState.stepId, {
              ...newStep,
              stepName,
            })
          }
        }
      )
      // A `failed` step threw, and this is its ordinary retry.
      if (!reclaimed || status !== 'running') return reclaimed
      await this.logStepRerun(runId, stepName, reclaimed.attemptCount)
      return { ...reclaimed, lapsedAttempt: stepState.attemptCount }
    }

    // `pending` or `scheduled`: the claimable statuses left.
    if (
      !(await this.claimStepStatus(stepState, STEP_SOURCES.unclaimed, leaseMs))
    ) {
      return null
    }
    await this.setStepRunning(stepState.stepId, stepState.attemptCount)
    return { ...stepState, status: 'running' }
  }

  /**
   * Take back a failed or lapsed step as a new attempt. The attempt number is
   * advanced by the same guarded update that grants the lease, so the worker
   * it is taken from is fenced out of its step at once.
   */
  private async reclaimStepAttempt(
    stepState: StepState,
    leaseMs: number
  ): Promise<StepState | null> {
    const now = new Date()
    const row = await this.steps.findOneAndUpdate(
      this.claimFilter(stepState, [stepState.status], now),
      {
        $set: {
          status: 'running',
          result: null,
          error: null,
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
          updatedAt: now,
        },
        $unset: { childRunId: '' },
        $inc: { attempt: 1 },
      },
      { returnDocument: 'after' }
    )
    if (!row) return null

    await this.insertHistoryRecord(row._id, row.attempt, 'running')
    return this.toStepState(row)
  }

  protected async claimStepStatus(
    stepState: StepState,
    from: readonly StepStatus[],
    leaseMs: number
  ): Promise<boolean> {
    const now = new Date()
    const claimed = await this.steps.updateOne(
      this.claimFilter(stepState, from, now),
      {
        $set: {
          status: 'running',
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
          updatedAt: now,
        },
      }
    )

    return claimed.matchedCount > 0
  }

  /**
   * A `running` step matches only once its lease has lapsed, and only with no
   * child run: a step parked on a child is the child's to finish.
   */
  private claimFilter(
    stepState: StepState,
    from: readonly StepStatus[],
    now: Date
  ): Record<string, unknown> {
    return {
      _id: stepState.stepId,
      attempt: stepState.attemptCount,
      status: { $in: [...from] },
      ...(from.includes('running')
        ? { leaseExpiresAt: { $lt: now }, childRunId: null }
        : {}),
    }
  }

  async getCompletedGraphState(runId: string): Promise<{
    completedNodeIds: string[]
    failedNodeIds: string[]
    branchKeys: Record<string, string>
  }> {
    const results = await this.steps
      .find({
        workflowRunId: runId,
        status: { $in: ['succeeded', 'failed'] },
      })
      .toArray()

    const completedNodeIds: string[] = []
    const failedNodeIds: string[] = []
    const branchKeys: Record<string, string> = {}

    for (const row of results) {
      const nodeId = row.stepName

      if (row.status === 'succeeded') {
        completedNodeIds.push(nodeId)
        if (row.branchTaken) {
          branchKeys[nodeId] = row.branchTaken
        }
      } else if (row.status === 'failed') {
        const maxAttempts = (row.retries ?? 0) + 1
        if (row.attempt >= maxAttempts) {
          failedNodeIds.push(nodeId)
        }
      }
    }

    return { completedNodeIds, failedNodeIds, branchKeys }
  }

  async getStepInstances(runId: string): Promise<
    Array<{
      stepName: string
      status: StepStatus
      fromStepName?: string
      leaseExpiresAt?: Date
    }>
  > {
    const rows = await this.steps
      .find({ workflowRunId: runId })
      .project({ stepName: 1, status: 1, fromStepName: 1, leaseExpiresAt: 1 })
      .toArray()
    return rows.map((r: any) => ({
      stepName: r.stepName,
      status: r.status as StepStatus,
      fromStepName: r.fromStepName ?? undefined,
      leaseExpiresAt: r.leaseExpiresAt ?? undefined,
    }))
  }

  async getNodeResults(
    runId: string,
    nodeIds: string[]
  ): Promise<Record<string, any>> {
    if (nodeIds.length === 0) return {}

    const result = await this.steps
      .find({
        workflowRunId: runId,
        stepName: { $in: nodeIds },
        status: 'succeeded',
      })
      .toArray()

    const results: Record<string, any> = {}
    for (const row of result) {
      results[row.stepName] = row.result
    }
    return results
  }

  protected async setBranchTakenImpl(
    stepId: string,
    branchKey: string,
    from: readonly StepStatus[]
  ): Promise<boolean> {
    return this.writeStepIfIn(stepId, from, { branchTaken: branchKey })
  }

  protected async updateRunStateImpl(
    runId: string,
    name: string,
    value: unknown
  ): Promise<void> {
    await this.runs.updateOne(
      { _id: runId },
      {
        $set: {
          [`state.${encodeStateKey(name)}`]: value,
          updatedAt: new Date(),
        },
      }
    )
  }

  async getRunState(runId: string): Promise<Record<string, unknown>> {
    const row = await this.runs.findOne(
      { _id: runId },
      { projection: { state: 1 } }
    )
    if (!row) return {}
    return Object.fromEntries(
      Object.entries(row.state ?? {}).map(([key, value]) => [
        decodeStateKey(key),
        value,
      ])
    )
  }

  protected async upsertWorkflowVersionImpl(
    name: string,
    graphHash: string,
    graph: any,
    source: string,
    status?: WorkflowVersionStatus
  ): Promise<void> {
    await this.versions.updateOne(
      { workflowName: name, graphHash },
      {
        $setOnInsert: {
          workflowName: name,
          graphHash,
          graph,
          source,
          status: status ?? 'active',
          createdAt: new Date(),
        },
      },
      { upsert: true }
    )
  }

  protected async updateWorkflowVersionStatusImpl(
    name: string,
    graphHash: string,
    status: WorkflowVersionStatus
  ): Promise<void> {
    await this.versions.updateOne(
      { workflowName: name, graphHash },
      { $set: { status } }
    )
  }

  async getWorkflowVersion(
    name: string,
    graphHash: string
  ): Promise<{ graph: any; source: string } | null> {
    return this.runService.getWorkflowVersion(name, graphHash)
  }

  async close(): Promise<void> {}
}
