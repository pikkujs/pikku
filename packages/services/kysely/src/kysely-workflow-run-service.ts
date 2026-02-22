import type {
  WorkflowRun,
  StepState,
  WorkflowStatus,
  WorkflowRunService,
} from '@pikku/core/workflow'
import { Kysely } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { parseJson } from './kysely-json.js'

export class KyselyWorkflowRunService implements WorkflowRunService {
  constructor(private db: Kysely<KyselyPikkuDB>) {}

  async listRuns(options?: {
    workflowName?: string
    status?: string
    limit?: number
    offset?: number
  }): Promise<WorkflowRun[]> {
    const { workflowName, status, limit = 50, offset = 0 } = options ?? {}

    let query = this.db
      .selectFrom('workflow_runs')
      .select([
        'workflow_run_id',
        'workflow',
        'status',
        'input',
        'output',
        'error',
        'inline',
        'graph_hash',
        'created_at',
        'updated_at',
      ])

    if (workflowName) {
      query = query.where('workflow', '=', workflowName)
    }

    if (status) {
      query = query.where('status', '=', status)
    }

    const result = await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()

    return result.map((row) => this.mapRunRow(row))
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    const row = await this.db
      .selectFrom('workflow_runs')
      .select([
        'workflow_run_id',
        'workflow',
        'status',
        'input',
        'output',
        'error',
        'inline',
        'graph_hash',
        'created_at',
        'updated_at',
      ])
      .where('workflow_run_id', '=', id)
      .executeTakeFirst()

    if (!row) return null
    return this.mapRunRow(row)
  }

  async getRunSteps(
    runId: string
  ): Promise<
    Array<StepState & { stepName: string; rpcName?: string; data?: any }>
  > {
    const result = await this.db
      .selectFrom('workflow_step as s')
      .select([
        's.workflow_step_id',
        's.step_name',
        's.rpc_name',
        's.data',
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
      .orderBy('s.created_at', 'asc')
      .execute()

    return result.map((row) => ({
      stepId: row.workflow_step_id,
      stepName: row.step_name,
      rpcName: row.rpc_name ?? undefined,
      data: parseJson(row.data),
      status: row.status as StepState['status'],
      result: parseJson(row.result),
      error: parseJson(row.error),
      attemptCount: Number(row.attempt_count || 1),
      retries: row.retries != null ? Number(row.retries) : undefined,
      retryDelay: row.retry_delay ?? undefined,
      createdAt: new Date(row.created_at as unknown as string),
      updatedAt: new Date(row.updated_at as unknown as string),
    }))
  }

  async getRunHistory(
    runId: string
  ): Promise<Array<StepState & { stepName: string }>> {
    const result = await this.db
      .selectFrom('workflow_step as s')
      .innerJoin(
        'workflow_step_history as h',
        'h.workflow_step_id',
        's.workflow_step_id'
      )
      .select([
        's.workflow_step_id',
        's.step_name',
        's.retries',
        's.retry_delay',
        'h.status',
        'h.result',
        'h.error',
        'h.created_at',
        'h.running_at',
        'h.scheduled_at',
        'h.succeeded_at',
        'h.failed_at',
      ])
      .where('s.workflow_run_id', '=', runId)
      .orderBy('h.created_at', 'asc')
      .execute()

    let attemptCounters: Record<string, number> = {}
    return result.map((row) => {
      const stepId = row.workflow_step_id
      attemptCounters[stepId] = (attemptCounters[stepId] ?? 0) + 1

      return {
        stepId,
        stepName: row.step_name,
        status: row.status as StepState['status'],
        result: parseJson(row.result),
        error: parseJson(row.error),
        attemptCount: attemptCounters[stepId]!,
        retries: row.retries != null ? Number(row.retries) : undefined,
        retryDelay: row.retry_delay ?? undefined,
        createdAt: new Date(row.created_at as unknown as string),
        updatedAt: new Date(row.created_at as unknown as string),
        runningAt: row.running_at
          ? new Date(row.running_at as unknown as string)
          : undefined,
        scheduledAt: row.scheduled_at
          ? new Date(row.scheduled_at as unknown as string)
          : undefined,
        succeededAt: row.succeeded_at
          ? new Date(row.succeeded_at as unknown as string)
          : undefined,
        failedAt: row.failed_at
          ? new Date(row.failed_at as unknown as string)
          : undefined,
      }
    })
  }

  async getDistinctWorkflowNames(): Promise<string[]> {
    const result = await this.db
      .selectFrom('workflow_runs')
      .select('workflow')
      .distinct()
      .orderBy('workflow')
      .execute()

    return result.map((row) => row.workflow)
  }

  async getWorkflowVersion(
    name: string,
    graphHash: string
  ): Promise<{ graph: any; source: string } | null> {
    const row = await this.db
      .selectFrom('workflow_versions')
      .select(['graph', 'source'])
      .where('workflow_name', '=', name)
      .where('graph_hash', '=', graphHash)
      .executeTakeFirst()

    if (!row) return null
    return {
      graph: parseJson(row.graph),
      source: row.source,
    }
  }

  async deleteRun(id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('workflow_runs')
      .where('workflow_run_id', '=', id)
      .executeTakeFirst()

    return BigInt(result.numDeletedRows) > 0n
  }

  private mapRunRow(row: any): WorkflowRun {
    return {
      id: row.workflow_run_id as string,
      workflow: row.workflow as string,
      status: row.status as WorkflowStatus,
      input: parseJson(row.input),
      output: parseJson(row.output),
      error: parseJson(row.error),
      inline: row.inline as boolean | undefined,
      graphHash: row.graph_hash as string | undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    }
  }
}
