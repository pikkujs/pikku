import type { SerializedError } from '@pikku/core'
import {
  PikkuWorkflowService,
  type WorkflowRun,
  type WorkflowRunWire,
  type StepState,
  type WorkflowStatus,
  type WorkflowVersionStatus,
} from '@pikku/core/workflow'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { KyselyWorkflowRunService } from './kysely-workflow-run-service.js'
import { parseJson } from './kysely-json.js'

export class KyselyWorkflowService extends PikkuWorkflowService {
  private initialized = false
  private runService: KyselyWorkflowRunService

  constructor(protected db: Kysely<KyselyPikkuDB>) {
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
    workflowName: string,
    input: any,
    inline: boolean,
    graphHash: string,
    wire: WorkflowRunWire
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
        wire: wire ? JSON.stringify(wire) : null,
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
        createdAt: now,
        updatedAt: now,
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
      .selectFrom('workflowStep as s')
      .select([
        's.workflowStepId',
        's.status',
        's.result',
        's.error',
        's.retries',
        's.retryDelay',
        's.createdAt',
        's.updatedAt',
      ])
      .select((eb) =>
        eb
          .selectFrom('workflowStepHistory')
          .select(eb.fn.countAll<number>().as('cnt'))
          .whereRef(
            'workflowStepHistory.workflowStepId',
            '=',
            's.workflowStepId'
          )
          .as('attemptCount')
      )
      .where('s.workflowRunId', '=', runId)
      .where('s.stepName', '=', stepName)
      .executeTakeFirst()

    if (!row) {
      throw new Error(
        `Step not found: runId=${runId}, stepName=${stepName}. Use insertStepState to create it.`
      )
    }

    return {
      stepId: row.workflowStepId,
      status: row.status as StepState['status'],
      result: parseJson(row.result),
      error: parseJson(row.error),
      attemptCount: Number(row.attemptCount),
      retries: row.retries != null ? Number(row.retries) : undefined,
      retryDelay: row.retryDelay ?? undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }
  }

  async getRunHistory(
    runId: string
  ): Promise<Array<StepState & { stepName: string }>> {
    return this.runService.getRunHistory(runId)
  }

  async setStepRunning(stepId: string): Promise<void> {
    await this.db
      .updateTable('workflowStep')
      .set({ status: 'running', updatedAt: new Date() })
      .where('workflowStepId', '=', stepId)
      .execute()

    const latestHistory = await this.db
      .selectFrom('workflowStepHistory')
      .select('historyId')
      .where('workflowStepId', '=', stepId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .executeTakeFirst()

    if (latestHistory) {
      await this.db
        .updateTable('workflowStepHistory')
        .set({ status: 'running' })
        .where('historyId', '=', latestHistory.historyId)
        .execute()
    }
  }

  async setStepScheduled(stepId: string): Promise<void> {
    await this.db
      .updateTable('workflowStep')
      .set({ status: 'scheduled', updatedAt: new Date() })
      .where('workflowStepId', '=', stepId)
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
      historyId: crypto.randomUUID(),
      workflowStepId: stepId,
      status,
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

  async setStepChildRunId(stepId: string, childRunId: string): Promise<void> {
    await this.db
      .updateTable('workflowStep')
      .set({
        childRunId: childRunId,
        updatedAt: new Date(),
      })
      .where('workflowStepId', '=', stepId)
      .execute()
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

    const latestHistory = await this.db
      .selectFrom('workflowStepHistory')
      .select('historyId')
      .where('workflowStepId', '=', stepId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .executeTakeFirst()

    if (latestHistory) {
      await this.db
        .updateTable('workflowStepHistory')
        .set({ status: 'succeeded', result: resultJson })
        .where('historyId', '=', latestHistory.historyId)
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
      .updateTable('workflowStep')
      .set({
        status: 'failed',
        error: errorJson,
        result: null,
        updatedAt: new Date(),
      })
      .where('workflowStepId', '=', stepId)
      .execute()

    const latestHistory = await this.db
      .selectFrom('workflowStepHistory')
      .select('historyId')
      .where('workflowStepId', '=', stepId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .executeTakeFirst()

    if (latestHistory) {
      await this.db
        .updateTable('workflowStepHistory')
        .set({ status: 'failed', error: errorJson })
        .where('historyId', '=', latestHistory.historyId)
        .execute()
    }
  }

  async createRetryAttempt(
    stepId: string,
    status: 'pending' | 'running'
  ): Promise<StepState> {
    await this.db
      .updateTable('workflowStep')
      .set({ status, result: null, error: null, updatedAt: new Date() })
      .where('workflowStepId', '=', stepId)
      .execute()

    await this.insertHistoryRecord(stepId, status)

    const row = await this.db
      .selectFrom('workflowStep as s')
      .select([
        's.workflowStepId',
        's.status',
        's.result',
        's.error',
        's.retries',
        's.retryDelay',
        's.createdAt',
        's.updatedAt',
      ])
      .select((eb) =>
        eb
          .selectFrom('workflowStepHistory')
          .select(eb.fn.countAll<number>().as('cnt'))
          .whereRef(
            'workflowStepHistory.workflowStepId',
            '=',
            's.workflowStepId'
          )
          .as('attemptCount')
      )
      .where('s.workflowStepId', '=', stepId)
      .executeTakeFirstOrThrow()

    return {
      stepId: row.workflowStepId,
      status: row.status as StepState['status'],
      result: parseJson(row.result),
      error: parseJson(row.error),
      attemptCount: Number(row.attemptCount),
      retries: row.retries != null ? Number(row.retries) : undefined,
      retryDelay: row.retryDelay ?? undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }
  }

  async withRunLock<T>(_id: string, fn: () => Promise<T>): Promise<T> {
    return fn()
  }

  async withStepLock<T>(
    _runId: string,
    _stepName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    return fn()
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

  async getNodesWithoutSteps(
    runId: string,
    nodeIds: string[]
  ): Promise<string[]> {
    if (nodeIds.length === 0) return []

    const result = await this.db
      .selectFrom('workflowStep')
      .select('stepName')
      .where('workflowRunId', '=', runId)
      .where('stepName', 'in', nodeIds)
      .execute()

    const existingStepNames = new Set(result.map((r) => r.stepName))
    return nodeIds.filter((id) => !existingStepNames.has(id))
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

    const state: Record<string, unknown> = parseJson(row?.state) ?? {}
    state[name] = value

    await this.db
      .updateTable('workflowRuns')
      .set({ state: JSON.stringify(state), updatedAt: new Date() })
      .where('workflowRunId', '=', runId)
      .execute()
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

  async upsertWorkflowVersion(
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

  async getWorkflowVersion(
    name: string,
    graphHash: string
  ): Promise<{ graph: any; source: string } | null> {
    return this.runService.getWorkflowVersion(name, graphHash)
  }

  async getAIGeneratedWorkflows(
    agentName?: string
  ): Promise<Array<{ workflowName: string; graphHash: string; graph: any }>> {
    return this.runService.getAIGeneratedWorkflows(agentName)
  }

  async close(): Promise<void> {}
}
