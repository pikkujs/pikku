import type { SerializedError } from '@pikku/core/errors'
import type {
  StepState,
  WorkflowRunMirror,
  WorkflowRunWire,
  WorkflowStatus,
  WorkflowPlannedStep,
  WorkflowVersionStatus,
} from '@pikku/core/workflow'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { ensurePikkuSchema } from './schema/index.js'
import { workflowSchema } from './schema/workflow.schema.js'

/**
 * Kysely-backed `WorkflowRunMirror`.
 *
 * Forwards executor writes to the same `workflow_runs` / `workflow_step` /
 * `workflow_step_history` / `workflow_versions` tables that
 * `KyselyWorkflowService` uses, so a `KyselyWorkflowRunService` reading
 * those tables will see runs driven by any executor (Cloudflare Durable
 * Object, Redis, MongoDB, in-memory) — not just kysely-driven runs.
 *
 * Errors thrown here are caught by the executor's `safeMirror` wrapper
 * and logged, so a mirror outage cannot break a running workflow.
 */
export class KyselyWorkflowMirror implements WorkflowRunMirror {
  private initialized = false

  constructor(protected db: Kysely<KyselyPikkuDB>) {}

  /**
   * Create the underlying tables if none of them exist yet.
   *
   * Safe to call from either the mirror or `KyselyWorkflowService.init()` —
   * both apply the same `workflowSchema`, and `ensurePikkuSchema` is a no-op
   * once the tables are there. A database holding only *part* of the schema
   * throws rather than filling in the rest: something else owns those tables,
   * and boot is not where that gets reconciled.
   */
  public async init(): Promise<void> {
    if (this.initialized) return
    await ensurePikkuSchema(this.db, workflowSchema)
    this.initialized = true
  }

  async createRun(
    runId: string,
    workflowName: string,
    input: any,
    inline: boolean,
    graphHash: string,
    wire: WorkflowRunWire,
    options?: {
      deterministic?: boolean
      plannedSteps?: WorkflowPlannedStep[]
    }
  ): Promise<void> {
    await this.db
      .insertInto('workflowRuns')
      .values({
        workflowRunId: runId,
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
  }

  async updateRunStatus(
    id: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<void> {
    await this.db
      .updateTable('workflowRuns')
      .set({
        status,
        output: output !== undefined ? JSON.stringify(output) : null,
        error: error !== undefined ? JSON.stringify(error) : null,
        updatedAt: new Date(),
      })
      .where('workflowRunId', '=', id)
      .execute()
  }

  async insertStepState(
    runId: string,
    step: StepState & {
      stepName: string
      rpcName: string | null
      data: any
    }
  ): Promise<void> {
    const now = step.createdAt ?? new Date()

    await this.db
      .insertInto('workflowStep')
      .values({
        workflowStepId: step.stepId,
        workflowRunId: runId,
        stepName: step.stepName,
        rpcName: step.rpcName,
        data: step.data != null ? JSON.stringify(step.data) : null,
        status: step.status,
        retries: step.retries ?? null,
        retryDelay: step.retryDelay?.toString() ?? null,
        fromStepName: step.fromStepName ?? null,
        currentAttempt: 1,
        createdAt: now,
        updatedAt: now,
      })
      .execute()

    await this.insertHistoryRecord(step.stepId, step.status, 1)
  }

  async setStepRunning(stepId: string): Promise<void> {
    await this.updateStepStatus(stepId, 'running')
    await this.appendOrUpdateLatestHistory(stepId, 'running')
  }

  async setStepScheduled(stepId: string): Promise<void> {
    await this.updateStepStatus(stepId, 'scheduled')
  }

  async setStepResult(stepId: string, result: any): Promise<void> {
    const resultJson = JSON.stringify(result)
    await this.db
      .updateTable('workflowStep')
      .set({
        status: 'succeeded',
        result: resultJson,
        error: null,
        updatedAt: new Date(),
      })
      .where('workflowStepId', '=', stepId)
      .execute()
    await this.appendOrUpdateLatestHistory(stepId, 'succeeded', resultJson)
  }

  async setStepChildRunId(stepId: string, childRunId: string): Promise<void> {
    await this.db
      .updateTable('workflowStep')
      .set({ childRunId, updatedAt: new Date() })
      .where('workflowStepId', '=', stepId)
      .execute()
  }

  async setStepError(stepId: string, error: SerializedError): Promise<void> {
    const errorJson = JSON.stringify(error)
    await this.db
      .updateTable('workflowStep')
      .set({
        status: 'failed',
        error: errorJson,
        result: null,
        updatedAt: new Date(),
      })
      .where('workflowStepId', '=', stepId)
      .execute()
    await this.appendOrUpdateLatestHistory(
      stepId,
      'failed',
      undefined,
      errorJson
    )
  }

  async createRetryAttempt(
    failedStepId: string,
    newStep: StepState & { stepName: string }
  ): Promise<void> {
    const previous = await this.db
      .selectFrom('workflowStep')
      .select('currentAttempt')
      .where('workflowStepId', '=', failedStepId)
      .executeTakeFirst()
    const attempt = (previous?.currentAttempt ?? 0) + 1

    await this.db
      .updateTable('workflowStep')
      .set({
        status: newStep.status,
        result: null,
        error: null,
        currentAttempt: attempt,
        updatedAt: new Date(),
      })
      .where('workflowStepId', '=', failedStepId)
      .execute()
    await this.insertHistoryRecord(failedStepId, newStep.status, attempt)
  }

  async setBranchTaken(stepId: string, branchKey: string): Promise<void> {
    await this.db
      .updateTable('workflowStep')
      .set({ branchTaken: branchKey, updatedAt: new Date() })
      .where('workflowStepId', '=', stepId)
      .execute()
  }

  async updateRunState(
    runId: string,
    name: string,
    value: unknown
  ): Promise<void> {
    const row = await this.db
      .selectFrom('workflowRuns')
      .select('state')
      .where('workflowRunId', '=', runId)
      .executeTakeFirst()

    const state: Record<string, unknown> =
      row?.state != null
        ? typeof row.state === 'string'
          ? JSON.parse(row.state)
          : row.state
        : {}
    state[name] = value

    await this.db
      .updateTable('workflowRuns')
      .set({ state: JSON.stringify(state), updatedAt: new Date() })
      .where('workflowRunId', '=', runId)
      .execute()
  }

  async upsertWorkflowVersion(
    name: string,
    graphHash: string,
    graph: any,
    source: string,
    status: WorkflowVersionStatus = 'active'
  ): Promise<void> {
    await this.db
      .insertInto('workflowVersions')
      .values({
        workflowName: name,
        graphHash,
        graph: JSON.stringify(graph),
        source,
        status,
      })
      .onConflict((oc) => oc.columns(['workflowName', 'graphHash']).doNothing())
      .execute()
  }

  async updateWorkflowVersionStatus(
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

  // ─── internals ────────────────────────────────────────────────────

  private async updateStepStatus(
    stepId: string,
    status: StepState['status']
  ): Promise<void> {
    await this.db
      .updateTable('workflowStep')
      .set({ status, updatedAt: new Date() })
      .where('workflowStepId', '=', stepId)
      .execute()
  }

  private async insertHistoryRecord(
    stepId: string,
    status: string,
    attempt: number,
    resultJson?: string | null,
    errorJson?: string | null
  ): Promise<void> {
    const now = new Date()
    const values: Record<string, any> = {
      historyId: crypto.randomUUID(),
      workflowStepId: stepId,
      status,
      attempt,
      result: resultJson ?? null,
      error: errorJson ?? null,
      createdAt: now,
    }
    const tsField = timestampFieldFor(status)
    if (tsField) values[tsField] = now

    await this.db
      .insertInto('workflowStepHistory')
      .values(values as any)
      .execute()
  }

  /**
   * The executor pattern is: `insertStepState` writes a 'pending' history
   * row, then later transitions UPDATE that latest row in place rather
   * than appending a new one — except for retry attempts which append.
   *
   * We mirror the same shape so `KyselyWorkflowRunService.getRunHistory`
   * returns the same sequence the executor would have produced.
   */
  private async appendOrUpdateLatestHistory(
    stepId: string,
    status: string,
    resultJson?: string,
    errorJson?: string
  ): Promise<void> {
    const update: Record<string, any> = { status }
    if (resultJson !== undefined) update.result = resultJson
    if (errorJson !== undefined) update.error = errorJson
    const tsField = timestampFieldFor(status)
    if (tsField) update[tsField] = new Date()

    const result = await this.db
      .updateTable('workflowStepHistory')
      .set(update)
      .where('workflowStepId', '=', stepId)
      // Correlate through the step row rather than sorting this table by
      // createdAt: two attempts can land in the same millisecond, and the
      // step row already knows which attempt is current.
      .where('attempt', '=', (eb) =>
        eb
          .selectFrom('workflowStep')
          .select('currentAttempt')
          .where('workflowStepId', '=', stepId)
      )
      .executeTakeFirst()

    if (Number(result?.numUpdatedRows ?? 0n) === 0) {
      const step = await this.db
        .selectFrom('workflowStep')
        .select('currentAttempt')
        .where('workflowStepId', '=', stepId)
        .executeTakeFirst()
      await this.insertHistoryRecord(
        stepId,
        status,
        step?.currentAttempt ?? 1,
        resultJson,
        errorJson
      )
    }
  }
}

function timestampFieldFor(status: string): string | null {
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
      return null
  }
}
