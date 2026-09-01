import type { SerializedError } from '@pikku/core/errors'
import {
  PikkuWorkflowService,
  WorkflowStepFunctionMismatchError,
  WorkflowStepLeaseExpiredError,
  isStepLeaseLive,
  leaseAttemptsExhausted,
} from '@pikku/core/workflow'
import type {
  WorkflowPlannedStep,
  WorkflowQueueOptions,
  WorkflowRun,
  WorkflowRunWire,
  StepState,
  StepStatus,
  WorkflowStatus,
  WorkflowVersionStatus,
} from '@pikku/core/workflow'
import { sql, type Kysely } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { KyselyWorkflowRunService } from './kysely-workflow-run-service.js'
import { parseJson } from './kysely-json.js'
import { requirePikkuSchema } from './schema/index.js'
import { workflowSchema } from './schema/workflow.schema.js'

export class KyselyWorkflowService extends PikkuWorkflowService {
  private initialized = false
  private runService: KyselyWorkflowRunService

  constructor(
    protected db: Kysely<KyselyPikkuDB>,
    options: WorkflowQueueOptions = {}
  ) {
    super(options)
    this.runService = new KyselyWorkflowRunService(db)
  }

  public async init(): Promise<void> {
    if (this.initialized) return
    await requirePikkuSchema(this.db, workflowSchema)
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
    await this.db
      .insertInto('workflowRuns')
      .values({
        workflowRunId: id,
        workflow: workflowName,
        status: 'running',
        input: JSON.stringify(input),
        inline,
        graphHash: graphHash ?? null,
        deterministic: options?.deterministic ?? false,
        plannedSteps: options?.plannedSteps
          ? JSON.stringify(options.plannedSteps)
          : null,
        wire: wire ? JSON.stringify(wire) : null,
      })
      .execute()

    return id
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    return this.runService.getRun(id)
  }

  protected async updateRunStatusImpl(
    id: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<void> {
    await this.db
      .updateTable('workflowRuns')
      .set({
        status,
        output: output ? JSON.stringify(output) : null,
        error: error ? JSON.stringify(error) : null,
        updatedAt: new Date(),
      })
      .where('workflowRunId', '=', id)
      .execute()
  }

  protected async insertStepStateImpl(
    runId: string,
    stepName: string,
    rpcName: string | null,
    data: any,
    stepOptions?: { retries?: number; retryDelay?: string | number },
    fromStepName?: string
  ): Promise<StepState> {
    const stepId = crypto.randomUUID()
    const now = new Date()

    await this.db
      .insertInto('workflowStep')
      .values({
        workflowStepId: stepId,
        workflowRunId: runId,
        stepName: stepName,
        rpcName: rpcName,
        data: data != null ? JSON.stringify(data) : null,
        status: 'pending',
        retries: stepOptions?.retries ?? null,
        retryDelay: stepOptions?.retryDelay?.toString() ?? null,
        fromStepName: fromStepName ?? null,
        currentAttempt: 1,
        createdAt: now,
        updatedAt: now,
      })
      .execute()

    await this.insertHistoryRecord(stepId, 'pending', 1)

    return {
      stepId,
      status: 'pending',
      rpcName,
      result: undefined,
      error: undefined,
      attemptCount: 1,
      retries: stepOptions?.retries,
      retryDelay: stepOptions?.retryDelay?.toString(),
      fromStepName,
      createdAt: now,
      updatedAt: now,
    }
  }

  async getStepState(runId: string, stepName: string): Promise<StepState> {
    const row = await this.db
      .selectFrom('workflowStep')
      .select([
        'workflowStepId',
        'status',
        'rpcName',
        'result',
        'error',
        'retries',
        'retryDelay',
        'fromStepName',
        // `current_attempt` is bumped alongside every history insert, so it is
        // already the count this used to aggregate — and reading it keeps the
        // engine's hottest query off a table that grows for the life of the run.
        'currentAttempt',
        'leaseExpiresAt',
        'createdAt',
        'updatedAt',
      ])
      .where('workflowRunId', '=', runId)
      .where('stepName', '=', stepName)
      .executeTakeFirst()

    if (!row) {
      throw new Error(
        `Step not found: runId=${runId}, stepName=${stepName}. Use insertStepState to create it.`
      )
    }

    return {
      stepId: row.workflowStepId,
      status: row.status as StepState['status'],
      rpcName: row.rpcName ?? null,
      result: parseJson(row.result),
      error: parseJson(row.error),
      attemptCount: Number(row.currentAttempt ?? 1),
      retries: row.retries != null ? Number(row.retries) : undefined,
      retryDelay: row.retryDelay ?? undefined,
      fromStepName: row.fromStepName ?? undefined,
      leaseExpiresAt: row.leaseExpiresAt
        ? new Date(row.leaseExpiresAt)
        : undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }
  }

  protected override async listStepStates(
    runId: string
  ): Promise<Array<StepState & { stepName: string }>> {
    const rows = await this.db
      .selectFrom('workflowStep')
      .select([
        'workflowStepId',
        'stepName',
        'status',
        'result',
        'error',
        'retries',
        'retryDelay',
        'fromStepName',
        'currentAttempt',
        'createdAt',
        'updatedAt',
      ])
      .where('workflowRunId', '=', runId)
      .execute()

    return rows.map((row) => ({
      stepId: row.workflowStepId,
      stepName: row.stepName,
      status: row.status as StepState['status'],
      result: parseJson(row.result),
      error: parseJson(row.error),
      attemptCount: Number(row.currentAttempt ?? 1),
      retries: row.retries != null ? Number(row.retries) : undefined,
      retryDelay: row.retryDelay ?? undefined,
      fromStepName: row.fromStepName ?? undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }))
  }

  async getRunHistory(
    runId: string
  ): Promise<Array<StepState & { stepName: string }>> {
    return this.runService.getRunHistory(runId)
  }

  protected async setStepRunningImpl(stepId: string): Promise<void> {
    await this.writeStepTransition(stepId, 'running', {
      runningAt: new Date(),
    })
  }

  public override async refreshStepLease(
    stepId: string,
    expiresAt: Date | null
  ): Promise<void> {
    await this.db
      .updateTable('workflowStep')
      .set({ leaseExpiresAt: expiresAt, updatedAt: new Date() })
      .where('workflowStepId', '=', stepId)
      .execute()
  }

  protected async setStepScheduledImpl(stepId: string): Promise<void> {
    await this.db
      .updateTable('workflowStep')
      .set({ status: 'scheduled', updatedAt: new Date() })
      .where('workflowStepId', '=', stepId)
      .execute()
  }

  /**
   * Move a step and its current history attempt to the same status in one
   * transaction.
   *
   * Both halves matter: a crash between them used to leave the step row saying
   * `succeeded` while its history row still said `running`, which silently
   * corrupts `getRunHistory` and every timeline reconstruction built on it.
   * The history row is targeted by its `attempt` rather than by a `LIMIT 1`
   * over `created_at`, so a retry that lands in the same millisecond as the
   * attempt it replaces still resolves the newer row.
   */
  private async writeStepTransition(
    stepId: string,
    status: StepStatus,
    historyValues: Record<string, unknown>
  ): Promise<void> {
    const now = new Date()
    const stepValues: Record<string, unknown> = { status, updatedAt: now }
    if ('result' in historyValues) stepValues.result = historyValues.result
    if ('error' in historyValues) stepValues.error = historyValues.error
    // A step carries only its latest outcome, so the other half is cleared.
    if (status === 'succeeded') stepValues.error = null
    if (status === 'failed') stepValues.result = null

    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('workflowStep')
        .set({
          ...stepValues,
          // A step that somehow reaches a transition without a live attempt
          // addresses no history row at all, so give it one here. Written as an
          // expression over the row's own column rather than a subquery, which
          // MySQL would reject against the table being updated.
          currentAttempt: sql`coalesce(current_attempt, 1)`,
        } as any)
        .where('workflowStepId', '=', stepId)
        .execute()

      const written = await trx
        .updateTable('workflowStepHistory')
        .set({ status, ...historyValues } as any)
        .where('workflowStepId', '=', stepId)
        // Correlate through the step row rather than a MAX() over this table:
        // MySQL rejects a subquery that reads the table being updated, and a
        // primary-key lookup is cheaper than an aggregate anyway.
        .where('attempt', '=', (eb) =>
          eb
            .selectFrom('workflowStep')
            .select('currentAttempt')
            .where('workflowStepId', '=', stepId)
        )
        .executeTakeFirst()

      // Matching nothing means the attempt has no history row to move, which
      // would commit the step's new status with no record of it — precisely
      // the divergence this transaction exists to prevent. Write the missing
      // row instead of letting the pair drift apart.
      if (Number(written?.numUpdatedRows ?? 0n) === 0) {
        const step = await trx
          .selectFrom('workflowStep')
          .select('currentAttempt')
          .where('workflowStepId', '=', stepId)
          .executeTakeFirst()
        await trx
          .insertInto('workflowStepHistory')
          .values({
            historyId: crypto.randomUUID(),
            workflowStepId: stepId,
            status,
            attempt: step?.currentAttempt ?? 1,
            createdAt: now,
            ...historyValues,
          } as any)
          .execute()
      }
    })
  }

  private async insertHistoryRecord(
    stepId: string,
    status: string,
    attempt: number,
    result?: any,
    error?: SerializedError
  ): Promise<void> {
    const now = new Date()
    const values: Record<string, any> = {
      historyId: crypto.randomUUID(),
      workflowStepId: stepId,
      status,
      attempt,
      result: result != null ? JSON.stringify(result) : null,
      error: error != null ? JSON.stringify(error) : null,
      createdAt: now,
    }

    const timestampField = this.getTimestampFieldForStatus(status)
    if (timestampField !== 'createdAt') {
      values[timestampField] = now
    }

    await this.db
      .insertInto('workflowStepHistory')
      .values(values as any)
      .execute()
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
    childRunId: string
  ): Promise<void> {
    await this.db
      .updateTable('workflowStep')
      .set({
        childRunId: childRunId,
        updatedAt: new Date(),
      })
      .where('workflowStepId', '=', stepId)
      .execute()
  }

  protected async setStepResultImpl(
    stepId: string,
    result: any
  ): Promise<void> {
    await this.writeStepTransition(stepId, 'succeeded', {
      result: JSON.stringify(result),
      succeededAt: new Date(),
    })
  }

  protected async setStepErrorImpl(
    stepId: string,
    error: Error
  ): Promise<void> {
    const serializedError: SerializedError = {
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
    }
    await this.writeStepTransition(stepId, 'failed', {
      error: JSON.stringify(serializedError),
      failedAt: new Date(),
    })
  }

  protected async createRetryAttemptImpl(
    stepId: string,
    status: 'pending' | 'running'
  ): Promise<StepState> {
    // Read before writing: the new attempt number comes from the history this
    // step already has, and the row it reads is the one returned below.
    const previous = await this.db
      .selectFrom('workflowStep')
      .select('currentAttempt')
      .where('workflowStepId', '=', stepId)
      .executeTakeFirst()
    const attempt = (previous?.currentAttempt ?? 0) + 1

    await this.db
      .updateTable('workflowStep')
      .set({
        status,
        result: null,
        error: null,
        currentAttempt: attempt,
        updatedAt: new Date(),
      })
      .where('workflowStepId', '=', stepId)
      .execute()

    await this.insertHistoryRecord(stepId, status, attempt)

    const row = await this.db
      .selectFrom('workflowStep')
      .select([
        'workflowStepId',
        'status',
        'rpcName',
        'result',
        'error',
        'retries',
        'retryDelay',
        'fromStepName',
        'currentAttempt',
        'createdAt',
        'updatedAt',
      ])
      .where('workflowStepId', '=', stepId)
      .executeTakeFirstOrThrow()

    return {
      stepId: row.workflowStepId,
      status: row.status as StepState['status'],
      rpcName: row.rpcName ?? null,
      result: parseJson(row.result),
      error: parseJson(row.error),
      attemptCount: Number(row.currentAttempt ?? 1),
      retries: row.retries != null ? Number(row.retries) : undefined,
      retryDelay: row.retryDelay ?? undefined,
      fromStepName: row.fromStepName ?? undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }
  }

  async withRunLock<T>(_id: string, fn: () => Promise<T>): Promise<T> {
    return fn()
  }

  /**
   * A pass-through, and deliberately so: the one decision that must exclude —
   * claiming a step to execute it — is made by `claimStepForExecution` below as
   * a single conditional write, which needs no lock to be exclusive.
   *
   * What is left are the suspend and approval sections in the engine, where the
   * lock is genuine mutual exclusion rather than a claim. A dialect with a real
   * primitive overrides this to cover them — `kysely-postgres` with
   * `pg_advisory_xact_lock`, `kysely-mysql` with `GET_LOCK`.
   */
  async withStepLock<T>(
    _runId: string,
    _stepName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    return fn()
  }

  /**
   * Claim the step with a status-guarded `UPDATE` and read the affected-row
   * count: the database decides the winner in one statement, so two dispatches
   * racing for the same step cannot both proceed.
   *
   * This replaces the read-then-write the base engine does under `withStepLock`,
   * which is only as exclusive as that lock — and every dialect but Postgres and
   * MySQL inherits a pass-through. A conditional update needs no advisory-lock
   * primitive, so every SQL dialect gets the same guarantee.
   *
   * The winner then goes through the ordinary transition methods, so history
   * rows and the mirror see exactly what they saw before.
   *
   * A `running` step is taken back only once its lease has lapsed, and the
   * lease is part of the same guarded `UPDATE` — checking it here and writing
   * it afterwards would let two dispatches read one lapsed lease and both
   * proceed.
   */
  protected override async claimStepForExecution(
    runId: string,
    stepName: string,
    rpcName: string,
    leaseExpiresAt: Date
  ): Promise<StepState | null> {
    const stepState = await this.getStepState(runId, stepName)

    // knowledge: decisions/security/a-step-runs-the-function-the-workflow-dispatched-it-with.md
    if (
      stepState.rpcName !== undefined &&
      stepState.rpcName !== (rpcName ?? null)
    ) {
      throw new WorkflowStepFunctionMismatchError(runId, stepName)
    }

    if (stepState.status === 'succeeded') {
      return null
    }

    if (stepState.status === 'running') {
      if (isStepLeaseLive(stepState.leaseExpiresAt)) {
        return null
      }
      if (leaseAttemptsExhausted(stepState)) {
        await this.setStepError(
          stepState.stepId,
          new WorkflowStepLeaseExpiredError(
            runId,
            stepName,
            stepState.attemptCount
          )
        )
        return null
      }
    }

    if (stepState.status === 'failed' || stepState.status === 'running') {
      if (
        !(await this.claimStepStatus(
          stepState.stepId,
          [stepState.status],
          leaseExpiresAt
        ))
      ) {
        return null
      }
      return this.createRetryAttempt(stepState.stepId, 'running')
    }

    if (stepState.status === 'pending' || stepState.status === 'scheduled') {
      if (
        !(await this.claimStepStatus(
          stepState.stepId,
          ['pending', 'scheduled'],
          leaseExpiresAt
        ))
      ) {
        return null
      }
      await this.setStepRunning(stepState.stepId)
      return { ...stepState, status: 'running' }
    }

    return stepState
  }

  /**
   * Move a step to `running` under a fresh lease, only if it is still in one of
   * `from`, reporting whether this caller is the one that moved it.
   *
   * Claiming back a `running` step additionally requires its lease to have
   * lapsed. A null lease never matches, which is what keeps a step parked on a
   * child run — running, with no worker on it by design — out of reach.
   */
  private async claimStepStatus(
    stepId: string,
    from: StepStatus[],
    leaseExpiresAt: Date
  ): Promise<boolean> {
    let query = this.db
      .updateTable('workflowStep')
      .set({ status: 'running', leaseExpiresAt, updatedAt: new Date() })
      .where('workflowStepId', '=', stepId)
      .where('status', 'in', from)

    if (from.includes('running')) {
      query = query.where('leaseExpiresAt', '<', new Date())
    }

    const claimed = await query.executeTakeFirst()

    return Number(claimed?.numUpdatedRows ?? 0n) > 0
  }

  async getCompletedGraphState(runId: string): Promise<{
    completedNodeIds: string[]
    failedNodeIds: string[]
    branchKeys: Record<string, string>
  }> {
    const results = await this.db
      .selectFrom('workflowStep as ws')
      .select(['ws.stepName', 'ws.status', 'ws.branchTaken', 'ws.retries'])
      .select((eb) =>
        eb
          .selectFrom('workflowStepHistory as h')
          .select(eb.fn.countAll<number>().as('cnt'))
          .whereRef('h.workflowStepId', '=', 'ws.workflowStepId')
          .as('attemptCount')
      )
      .where('ws.workflowRunId', '=', runId)
      .where('ws.status', 'in', ['succeeded', 'failed'])
      .execute()

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
        if (Number(row.attemptCount) >= maxAttempts) {
          failedNodeIds.push(nodeId)
        }
      }
    }

    return { completedNodeIds, failedNodeIds, branchKeys }
  }

  async getStepInstances(
    runId: string
  ): Promise<
    Array<{ stepName: string; status: StepStatus; fromStepName?: string }>
  > {
    const rows = await this.db
      .selectFrom('workflowStep')
      .select(['stepName', 'status', 'fromStepName'])
      .where('workflowRunId', '=', runId)
      .execute()
    return rows.map((r) => ({
      stepName: r.stepName,
      status: r.status as StepStatus,
      fromStepName: r.fromStepName ?? undefined,
    }))
  }

  async getNodeResults(
    runId: string,
    nodeIds: string[]
  ): Promise<Record<string, any>> {
    if (nodeIds.length === 0) return {}

    const result = await this.db
      .selectFrom('workflowStep')
      .select(['stepName', 'result'])
      .where('workflowRunId', '=', runId)
      .where('stepName', 'in', nodeIds)
      .where('status', '=', 'succeeded')
      .execute()

    const results: Record<string, any> = {}
    for (const row of result) {
      results[row.stepName] = parseJson(row.result)
    }
    return results
  }

  protected async setBranchTakenImpl(
    stepId: string,
    branchKey: string
  ): Promise<void> {
    await this.db
      .updateTable('workflowStep')
      .set({ branchTaken: branchKey, updatedAt: new Date() })
      .where('workflowStepId', '=', stepId)
      .execute()
  }

  /**
   * Merge one key into the run's JSON state, as a single expression evaluated
   * by the database.
   *
   * The SQL is dialect-specific, so subclasses override this rather than the
   * caller. The default is the SQLite form; MySQL and Postgres differ in how
   * they cast a JSON literal.
   *
   * @param path - JSON path to the key, already quoted (`$."key"`)
   * @param json - The value as JSON text
   */
  protected jsonSetState(path: string, json: string) {
    return sql<string>`json_set(coalesce(state, '{}'), ${path}, json(${json}))`
  }

  /**
   * A JSON path for an arbitrary key. State keys are user-supplied (a graph's
   * `setState` name, an approval's hex-encoded reason), so the key is quoted
   * rather than interpolated bare — an unquoted `$.a.b` would silently address
   * a nested path instead of the key literally called `a.b`.
   */
  private jsonPathFor(name: string): string {
    return `$.${JSON.stringify(name)}`
  }

  protected async updateRunStateImpl(
    runId: string,
    name: string,
    value: unknown
  ): Promise<void> {
    // Merged by the database, not read-modify-written in JS: two graph nodes
    // calling setState concurrently used to race, and the later write silently
    // dropped whichever key the earlier one had added.
    await this.db
      .updateTable('workflowRuns')
      .set({
        state: this.jsonSetState(
          this.jsonPathFor(name),
          JSON.stringify(value ?? null)
        ),
        updatedAt: new Date(),
      })
      .where('workflowRunId', '=', runId)
      .execute()
  }

  /**
   * The undispatched-step query, shared by every dialect.
   *
   * It used to be deliberately NOT an override, because this class's
   * `withStepLock` is a pass-through: a subclass inheriting it (kysely-sqlite)
   * had no atomic claim, so the relay's redundant dispatches would have become
   * double executions, and only `kysely-postgres` and `kysely-mysql` opted in
   * on the strength of their real locks. `claimStepForExecution` no longer
   * needs that lock — the claim is a status-guarded `UPDATE`, atomic in every
   * dialect — so the relay is safe here for all of them and the override lives
   * in the base.
   */
  protected override async findUndispatchedSteps(
    before: Date,
    limit: number
  ): Promise<Array<{ runId: string; stepId: string }>> {
    const rows = await this.db
      .selectFrom('workflowStep as s')
      .innerJoin('workflowRuns as r', 'r.workflowRunId', 's.workflowRunId')
      .select(['s.workflowStepId', 's.workflowRunId'])
      .where('s.status', '=', 'pending')
      .where('s.updatedAt', '<', before)
      // Leftover `pending` steps on a settled run are not work; only a live run
      // still has anything to dispatch.
      .where('r.status', '=', 'running')
      .orderBy('s.updatedAt', 'asc')
      .limit(limit)
      .execute()

    return rows.map((row) => ({
      runId: row.workflowRunId,
      stepId: row.workflowStepId,
    }))
  }

  protected async findStalledRunIds(
    before: Date,
    limit: number
  ): Promise<string[]> {
    const rows = await this.db
      .selectFrom('workflowRuns as r')
      .select('r.workflowRunId')
      .where('r.status', '=', 'running')
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom('workflowStep as s')
              .select('s.workflowStepId')
              .whereRef('s.workflowRunId', '=', 'r.workflowRunId')
              .where((eb) =>
                eb.or([
                  eb('s.status', 'in', ['scheduled', 'suspended']),
                  // A `running` step counts as in flight only while someone
                  // still holds it. A lapsed lease is a dispatch that died, and
                  // a null one a step nothing was expected to hand back.
                  eb.and([
                    eb('s.status', '=', 'running'),
                    eb.or([
                      eb('s.leaseExpiresAt', 'is', null),
                      eb('s.leaseExpiresAt', '>', new Date()),
                    ]),
                  ]),
                ])
              )
          )
        )
      )
      // The run row only moves on a status change, so idleness has to hold for
      // the steps too — expressed as "no step touched since `before`" rather
      // than max(updated_at) so it stays one index-friendly NOT EXISTS.
      .where('r.updatedAt', '<', before)
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom('workflowStep as s')
              .select('s.workflowStepId')
              .whereRef('s.workflowRunId', '=', 'r.workflowRunId')
              .where('s.updatedAt', '>=', before)
          )
        )
      )
      .orderBy('r.updatedAt', 'asc')
      .limit(limit)
      .execute()

    return rows.map((row) => row.workflowRunId)
  }

  async getRunState(runId: string): Promise<Record<string, unknown>> {
    const row = await this.db
      .selectFrom('workflowRuns')
      .select('state')
      .where('workflowRunId', '=', runId)
      .executeTakeFirst()

    if (!row) return {}
    return parseJson(row.state) ?? {}
  }

  protected async upsertWorkflowVersionImpl(
    name: string,
    graphHash: string,
    graph: any,
    source: string,
    status?: WorkflowVersionStatus
  ): Promise<void> {
    await this.db
      .insertInto('workflowVersions')
      .values({
        workflowName: name,
        graphHash: graphHash,
        graph: JSON.stringify(graph),
        source,
        status: status ?? 'active',
      })
      .onConflict((oc) => oc.columns(['workflowName', 'graphHash']).doNothing())
      .execute()
  }

  protected async updateWorkflowVersionStatusImpl(
    name: string,
    graphHash: string,
    status: WorkflowVersionStatus
  ): Promise<void> {
    await this.db
      .updateTable('workflowVersions')
      .set({ status })
      .where('workflowName', '=', name)
      .where('graphHash', '=', graphHash)
      .execute()
  }

  async getWorkflowVersion(
    name: string,
    graphHash: string
  ): Promise<{ graph: any; source: string } | null> {
    return this.runService.getWorkflowVersion(name, graphHash)
  }

  async close(): Promise<void> {}
}
