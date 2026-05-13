import type { SerializedError } from '@pikku/core'
import type {
  StepState,
  WorkflowRunMirror,
  WorkflowRunWire,
  WorkflowStatus,
  WorkflowPlannedStep,
  WorkflowVersionStatus,
} from '@pikku/core/workflow'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'

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
   * Create the underlying tables if they don't exist. Safe to call from
   * either the mirror or `KyselyWorkflowService.init()` — schema is the
   * same and uses `ifNotExists`.
   */
  public async init(): Promise<void> {
    if (this.initialized) return

    await this.db.schema
      .createTable('workflow_runs')
      .ifNotExists()
      .addColumn('workflow_run_id', 'text', (col) => col.primaryKey())
      .addColumn('workflow', 'text', (col) => col.notNull())
      .addColumn('status', 'text', (col) => col.notNull())
      .addColumn('input', 'text', (col) => col.notNull())
      .addColumn('output', 'text')
      .addColumn('error', 'text')
      .addColumn('state', 'text', (col) => col.defaultTo('{}'))
      .addColumn('inline', 'boolean', (col) => col.defaultTo(false))
      .addColumn('graph_hash', 'text')
      .addColumn('deterministic', 'boolean', (col) => col.defaultTo(false))
      .addColumn('planned_steps', 'text')
      .addColumn('wire', 'text')
      .addColumn('created_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .addColumn('updated_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .execute()

    await this.db.schema
      .createTable('workflow_step')
      .ifNotExists()
      .addColumn('workflow_step_id', 'text', (col) => col.primaryKey())
      .addColumn('workflow_run_id', 'text', (col) =>
        col
          .notNull()
          .references('workflow_runs.workflow_run_id')
          .onDelete('cascade')
      )
      .addColumn('step_name', 'text', (col) => col.notNull())
      .addColumn('rpc_name', 'text')
      .addColumn('data', 'text')
      .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
      .addColumn('result', 'text')
      .addColumn('error', 'text')
      .addColumn('child_run_id', 'text')
      .addColumn('branch_taken', 'text')
      .addColumn('retries', 'integer')
      .addColumn('retry_delay', 'text')
      .addColumn('created_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .addColumn('updated_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .addUniqueConstraint('workflow_step_run_name_unique', [
        'workflow_run_id',
        'step_name',
      ])
      .execute()

    await this.db.schema
      .createTable('workflow_step_history')
      .ifNotExists()
      .addColumn('history_id', 'text', (col) => col.primaryKey())
      .addColumn('workflow_step_id', 'text', (col) =>
        col
          .notNull()
          .references('workflow_step.workflow_step_id')
          .onDelete('cascade')
      )
      .addColumn('status', 'text', (col) => col.notNull())
      .addColumn('result', 'text')
      .addColumn('error', 'text')
      .addColumn('created_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .addColumn('running_at', 'timestamp')
      .addColumn('scheduled_at', 'timestamp')
      .addColumn('succeeded_at', 'timestamp')
      .addColumn('failed_at', 'timestamp')
      .execute()

    await this.db.schema
      .createTable('workflow_versions')
      .ifNotExists()
      .addColumn('workflow_name', 'text', (col) => col.notNull())
      .addColumn('graph_hash', 'text', (col) => col.notNull())
      .addColumn('graph', 'text', (col) => col.notNull())
      .addColumn('source', 'text', (col) => col.notNull())
      .addColumn('status', 'text', (col) => col.notNull().defaultTo('active'))
      .addColumn('created_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .addPrimaryKeyConstraint('workflow_versions_pk', [
        'workflow_name',
        'graph_hash',
      ])
      .execute()

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
        createdAt: now,
        updatedAt: now,
      })
      .execute()

    await this.insertHistoryRecord(step.stepId, step.status)
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
    await this.db
      .updateTable('workflowStep')
      .set({
        status: newStep.status,
        result: null,
        error: null,
        updatedAt: new Date(),
      })
      .where('workflowStepId', '=', failedStepId)
      .execute()
    await this.insertHistoryRecord(failedStepId, newStep.status)
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
    resultJson?: string | null,
    errorJson?: string | null
  ): Promise<void> {
    const now = new Date()
    const values: Record<string, any> = {
      historyId: crypto.randomUUID(),
      workflowStepId: stepId,
      status,
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
    const latest = await this.db
      .selectFrom('workflowStepHistory')
      .select('historyId')
      .where('workflowStepId', '=', stepId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .executeTakeFirst()

    if (latest) {
      const update: Record<string, any> = { status }
      if (resultJson !== undefined) update.result = resultJson
      if (errorJson !== undefined) update.error = errorJson
      const tsField = timestampFieldFor(status)
      if (tsField) update[tsField] = new Date()
      await this.db
        .updateTable('workflowStepHistory')
        .set(update)
        .where('historyId', '=', latest.historyId)
        .execute()
    } else {
      await this.insertHistoryRecord(stepId, status, resultJson, errorJson)
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
