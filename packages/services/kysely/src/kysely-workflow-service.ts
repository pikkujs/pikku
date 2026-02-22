import type { SerializedError } from '@pikku/core'
import {
  PikkuWorkflowService,
  type WorkflowRun,
  type WorkflowRunWire,
  type StepState,
  type WorkflowStatus,
} from '@pikku/core/workflow'
import { Kysely, sql } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { KyselyWorkflowRunService } from './kysely-workflow-run-service.js'
import { parseJson } from './kysely-json.js'

export class KyselyWorkflowService extends PikkuWorkflowService {
  private initialized = false
  private runService: KyselyWorkflowRunService

  constructor(private db: Kysely<KyselyPikkuDB>) {
    super()
    this.runService = new KyselyWorkflowRunService(db)
  }

  public async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.db.schema
      .createTable('workflow_runs')
      .ifNotExists()
      .addColumn('workflow_run_id', 'text', (col) =>
        col
          .primaryKey()
          .defaultTo(sql`${sql.raw("'" + crypto.randomUUID() + "'")}`)
      )
      .addColumn('workflow', 'text', (col) => col.notNull())
      .addColumn('status', 'text', (col) => col.notNull())
      .addColumn('input', 'text', (col) => col.notNull())
      .addColumn('output', 'text')
      .addColumn('error', 'text')
      .addColumn('state', 'text', (col) => col.defaultTo('{}'))
      .addColumn('inline', 'boolean', (col) => col.defaultTo(false))
      .addColumn('graph_hash', 'text')
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
      .addColumn('workflow_step_id', 'text', (col) =>
        col
          .primaryKey()
          .defaultTo(sql`${sql.raw("'" + crypto.randomUUID() + "'")}`)
      )
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
      .addColumn('history_id', 'text', (col) =>
        col
          .primaryKey()
          .defaultTo(sql`${sql.raw("'" + crypto.randomUUID() + "'")}`)
      )
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
    workflowName: string,
    input: any,
    inline: boolean,
    graphHash: string,
    wire: WorkflowRunWire
  ): Promise<string> {
    const id = crypto.randomUUID()
    await this.db
      .insertInto('workflow_runs')
      .values({
        workflow_run_id: id,
        workflow: workflowName,
        status: 'running',
        input: JSON.stringify(input),
        inline,
        graph_hash: graphHash,
        wire: JSON.stringify(wire),
      })
      .execute()

    return id
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    return this.runService.getRun(id)
  }

  async updateRunStatus(
    id: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<void> {
    await this.db
      .updateTable('workflow_runs')
      .set({
        status,
        output: output ? JSON.stringify(output) : null,
        error: error ? JSON.stringify(error) : null,
        updated_at: new Date(),
      })
      .where('workflow_run_id', '=', id)
      .execute()
  }

  async insertStepState(
    runId: string,
    stepName: string,
    rpcName: string | null,
    data: any,
    stepOptions?: { retries?: number; retryDelay?: string | number }
  ): Promise<StepState> {
    const stepId = crypto.randomUUID()
    const now = new Date()

    await this.db
      .insertInto('workflow_step')
      .values({
        workflow_step_id: stepId,
        workflow_run_id: runId,
        step_name: stepName,
        rpc_name: rpcName,
        data: data != null ? JSON.stringify(data) : null,
        status: 'pending',
        retries: stepOptions?.retries ?? null,
        retry_delay: stepOptions?.retryDelay?.toString() ?? null,
        created_at: now,
        updated_at: now,
      })
      .execute()

    await this.insertHistoryRecord(stepId, 'pending')

    return {
      stepId,
      status: 'pending',
      result: undefined,
      error: undefined,
      attemptCount: 1,
      retries: stepOptions?.retries,
      retryDelay: stepOptions?.retryDelay?.toString(),
      createdAt: now,
      updatedAt: now,
    }
  }

  async getStepState(runId: string, stepName: string): Promise<StepState> {
    const row = await this.db
      .selectFrom('workflow_step as s')
      .select([
        's.workflow_step_id',
        's.status',
        's.result',
        's.error',
        's.retries',
        's.retry_delay',
        's.created_at',
        's.updated_at',
      ])
      .select((eb) =>
        eb
          .selectFrom('workflow_step_history')
          .select(eb.fn.countAll<number>().as('cnt'))
          .whereRef(
            'workflow_step_history.workflow_step_id',
            '=',
            's.workflow_step_id'
          )
          .as('attempt_count')
      )
      .where('s.workflow_run_id', '=', runId)
      .where('s.step_name', '=', stepName)
      .executeTakeFirst()

    if (!row) {
      throw new Error(
        `Step not found: runId=${runId}, stepName=${stepName}. Use insertStepState to create it.`
      )
    }

    return {
      stepId: row.workflow_step_id,
      status: row.status as StepState['status'],
      result: parseJson(row.result),
      error: parseJson(row.error),
      attemptCount: Number(row.attempt_count),
      retries: row.retries != null ? Number(row.retries) : undefined,
      retryDelay: row.retry_delay ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }

  async getRunHistory(
    runId: string
  ): Promise<Array<StepState & { stepName: string }>> {
    return this.runService.getRunHistory(runId)
  }

  async setStepRunning(stepId: string): Promise<void> {
    await this.db
      .updateTable('workflow_step')
      .set({ status: 'running', updated_at: new Date() })
      .where('workflow_step_id', '=', stepId)
      .execute()

    const latestHistory = await this.db
      .selectFrom('workflow_step_history')
      .select('history_id')
      .where('workflow_step_id', '=', stepId)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst()

    if (latestHistory) {
      await this.db
        .updateTable('workflow_step_history')
        .set({ status: 'running' })
        .where('history_id', '=', latestHistory.history_id)
        .execute()
    }
  }

  async setStepScheduled(stepId: string): Promise<void> {
    await this.db
      .updateTable('workflow_step')
      .set({ status: 'scheduled', updated_at: new Date() })
      .where('workflow_step_id', '=', stepId)
      .execute()
  }

  private async insertHistoryRecord(
    stepId: string,
    status: string,
    result?: any,
    error?: SerializedError
  ): Promise<void> {
    const now = new Date()
    const values: Record<string, any> = {
      history_id: crypto.randomUUID(),
      workflow_step_id: stepId,
      status,
      result: result != null ? JSON.stringify(result) : null,
      error: error != null ? JSON.stringify(error) : null,
      created_at: now,
    }

    const timestampField = this.getTimestampFieldForStatus(status)
    if (timestampField !== 'created_at') {
      values[timestampField] = now
    }

    await this.db
      .insertInto('workflow_step_history')
      .values(values as any)
      .execute()
  }

  private getTimestampFieldForStatus(status: string): string {
    switch (status) {
      case 'running':
        return 'running_at'
      case 'scheduled':
        return 'scheduled_at'
      case 'succeeded':
        return 'succeeded_at'
      case 'failed':
        return 'failed_at'
      default:
        return 'created_at'
    }
  }

  async setStepResult(stepId: string, result: any): Promise<void> {
    const resultJson = JSON.stringify(result)

    await this.db
      .updateTable('workflow_step')
      .set({
        status: 'succeeded',
        result: resultJson,
        error: null,
        updated_at: new Date(),
      })
      .where('workflow_step_id', '=', stepId)
      .execute()

    const latestHistory = await this.db
      .selectFrom('workflow_step_history')
      .select('history_id')
      .where('workflow_step_id', '=', stepId)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst()

    if (latestHistory) {
      await this.db
        .updateTable('workflow_step_history')
        .set({ status: 'succeeded', result: resultJson })
        .where('history_id', '=', latestHistory.history_id)
        .execute()
    }
  }

  async setStepError(stepId: string, error: Error): Promise<void> {
    const serializedError: SerializedError = {
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
    }
    const errorJson = JSON.stringify(serializedError)

    await this.db
      .updateTable('workflow_step')
      .set({
        status: 'failed',
        error: errorJson,
        result: null,
        updated_at: new Date(),
      })
      .where('workflow_step_id', '=', stepId)
      .execute()

    const latestHistory = await this.db
      .selectFrom('workflow_step_history')
      .select('history_id')
      .where('workflow_step_id', '=', stepId)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst()

    if (latestHistory) {
      await this.db
        .updateTable('workflow_step_history')
        .set({ status: 'failed', error: errorJson })
        .where('history_id', '=', latestHistory.history_id)
        .execute()
    }
  }

  async createRetryAttempt(
    stepId: string,
    status: 'pending' | 'running'
  ): Promise<StepState> {
    await this.db
      .updateTable('workflow_step')
      .set({ status, result: null, error: null, updated_at: new Date() })
      .where('workflow_step_id', '=', stepId)
      .execute()

    await this.insertHistoryRecord(stepId, status)

    const row = await this.db
      .selectFrom('workflow_step as s')
      .select([
        's.workflow_step_id',
        's.status',
        's.result',
        's.error',
        's.retries',
        's.retry_delay',
        's.created_at',
        's.updated_at',
      ])
      .select((eb) =>
        eb
          .selectFrom('workflow_step_history')
          .select(eb.fn.countAll<number>().as('cnt'))
          .whereRef(
            'workflow_step_history.workflow_step_id',
            '=',
            's.workflow_step_id'
          )
          .as('attempt_count')
      )
      .where('s.workflow_step_id', '=', stepId)
      .executeTakeFirstOrThrow()

    return {
      stepId: row.workflow_step_id,
      status: row.status as StepState['status'],
      result: parseJson(row.result),
      error: parseJson(row.error),
      attemptCount: Number(row.attempt_count),
      retries: row.retries != null ? Number(row.retries) : undefined,
      retryDelay: row.retry_delay ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }

  async withRunLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return this.db.transaction().execute(async (trx) => {
      await trx
        .selectFrom('workflow_runs')
        .select('workflow_run_id')
        .where('workflow_run_id', '=', id)
        .forUpdate()
        .executeTakeFirst()
      return fn()
    })
  }

  async withStepLock<T>(
    runId: string,
    stepName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    return this.db.transaction().execute(async (trx) => {
      await trx
        .selectFrom('workflow_step')
        .select('workflow_step_id')
        .where('workflow_run_id', '=', runId)
        .where('step_name', '=', stepName)
        .forUpdate()
        .executeTakeFirst()
      return fn()
    })
  }

  async getCompletedGraphState(runId: string): Promise<{
    completedNodeIds: string[]
    failedNodeIds: string[]
    branchKeys: Record<string, string>
  }> {
    const results = await this.db
      .selectFrom('workflow_step as ws')
      .select(['ws.step_name', 'ws.status', 'ws.branch_taken', 'ws.retries'])
      .select((eb) =>
        eb
          .selectFrom('workflow_step_history as h')
          .select(eb.fn.countAll<number>().as('cnt'))
          .whereRef('h.workflow_step_id', '=', 'ws.workflow_step_id')
          .as('attempt_count')
      )
      .where('ws.workflow_run_id', '=', runId)
      .where('ws.status', 'in', ['succeeded', 'failed'])
      .execute()

    const completedNodeIds: string[] = []
    const failedNodeIds: string[] = []
    const branchKeys: Record<string, string> = {}

    for (const row of results) {
      const nodeId = row.step_name

      if (row.status === 'succeeded') {
        completedNodeIds.push(nodeId)
        if (row.branch_taken) {
          branchKeys[nodeId] = row.branch_taken
        }
      } else if (row.status === 'failed') {
        const maxAttempts = (row.retries ?? 0) + 1
        if (Number(row.attempt_count) >= maxAttempts) {
          failedNodeIds.push(nodeId)
        }
      }
    }

    return { completedNodeIds, failedNodeIds, branchKeys }
  }

  async getNodesWithoutSteps(
    runId: string,
    nodeIds: string[]
  ): Promise<string[]> {
    if (nodeIds.length === 0) return []

    const result = await this.db
      .selectFrom('workflow_step')
      .select('step_name')
      .where('workflow_run_id', '=', runId)
      .where('step_name', 'in', nodeIds)
      .execute()

    const existingStepNames = new Set(result.map((r) => r.step_name))
    return nodeIds.filter((id) => !existingStepNames.has(id))
  }

  async getNodeResults(
    runId: string,
    nodeIds: string[]
  ): Promise<Record<string, any>> {
    if (nodeIds.length === 0) return {}

    const result = await this.db
      .selectFrom('workflow_step')
      .select(['step_name', 'result'])
      .where('workflow_run_id', '=', runId)
      .where('step_name', 'in', nodeIds)
      .where('status', '=', 'succeeded')
      .execute()

    const results: Record<string, any> = {}
    for (const row of result) {
      results[row.step_name] = parseJson(row.result)
    }
    return results
  }

  async setBranchTaken(stepId: string, branchKey: string): Promise<void> {
    await this.db
      .updateTable('workflow_step')
      .set({ branch_taken: branchKey, updated_at: new Date() })
      .where('workflow_step_id', '=', stepId)
      .execute()
  }

  async updateRunState(
    runId: string,
    name: string,
    value: unknown
  ): Promise<void> {
    const row = await this.db
      .selectFrom('workflow_runs')
      .select('state')
      .where('workflow_run_id', '=', runId)
      .executeTakeFirst()

    const state: Record<string, unknown> = parseJson(row?.state) ?? {}
    state[name] = value

    await this.db
      .updateTable('workflow_runs')
      .set({ state: JSON.stringify(state), updated_at: new Date() })
      .where('workflow_run_id', '=', runId)
      .execute()
  }

  async getRunState(runId: string): Promise<Record<string, unknown>> {
    const row = await this.db
      .selectFrom('workflow_runs')
      .select('state')
      .where('workflow_run_id', '=', runId)
      .executeTakeFirst()

    if (!row) return {}
    return parseJson(row.state) ?? {}
  }

  async upsertWorkflowVersion(
    name: string,
    graphHash: string,
    graph: any,
    source: string
  ): Promise<void> {
    await this.db
      .insertInto('workflow_versions')
      .values({
        workflow_name: name,
        graph_hash: graphHash,
        graph: JSON.stringify(graph),
        source,
      })
      .onConflict((oc) =>
        oc.columns(['workflow_name', 'graph_hash']).doNothing()
      )
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
