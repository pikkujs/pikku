import type {
  WorkflowRun,
  StepState,
  WorkflowStatus,
  WorkflowRunService,
} from '@pikku/core/workflow'
import type { Kysely } from 'kysely'
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
      .selectFrom('workflowRuns')
      .select([
        'workflowRunId',
        'workflow',
        'status',
        'input',
        'output',
        'error',
        'inline',
        'graphHash',
        'deterministic',
        'plannedSteps',
        'wire',
        'createdAt',
        'updatedAt',
      ])

    if (workflowName) {
      query = query.where('workflow', '=', workflowName)
    }

    if (status) {
      query = query.where('status', '=', status as WorkflowStatus)
    }

    const result = await query
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()

    return result.map((row) => this.mapRunRow(row))
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    const row = await this.db
      .selectFrom('workflowRuns')
      .select([
        'workflowRunId',
        'workflow',
        'status',
        'input',
        'output',
        'error',
        'inline',
        'graphHash',
        'deterministic',
        'plannedSteps',
        'wire',
        'createdAt',
        'updatedAt',
      ])
      .where('workflowRunId', '=', id)
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
      .selectFrom('workflowStep as s')
      .select([
        's.workflowStepId',
        's.stepName',
        's.rpcName',
        's.data',
        's.status',
        's.result',
        's.error',
        's.childRunId',
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
      .orderBy('s.createdAt', 'asc')
      .execute()

    return result.map((row) => ({
      stepId: row.workflowStepId,
      stepName: row.stepName,
      rpcName: row.rpcName ?? undefined,
      data: parseJson(row.data),
      status: row.status as StepState['status'],
      result: parseJson(row.result),
      error: parseJson(row.error),
      childRunId: row.childRunId ?? undefined,
      attemptCount: Number(row.attemptCount || 1),
      retries: row.retries != null ? Number(row.retries) : undefined,
      retryDelay: row.retryDelay ?? undefined,
      createdAt: new Date(row.createdAt as unknown as string),
      updatedAt: new Date(row.updatedAt as unknown as string),
    }))
  }

  async getRunHistory(
    runId: string
  ): Promise<Array<StepState & { stepName: string }>> {
    const result = await this.db
      .selectFrom('workflowStep as s')
      .innerJoin(
        'workflowStepHistory as h',
        'h.workflowStepId',
        's.workflowStepId'
      )
      .select([
        's.workflowStepId',
        's.stepName',
        's.retries',
        's.retryDelay',
        'h.status',
        'h.result',
        'h.error',
        'h.createdAt',
        'h.runningAt',
        'h.scheduledAt',
        'h.succeededAt',
        'h.failedAt',
      ])
      .where('s.workflowRunId', '=', runId)
      .orderBy('h.createdAt', 'asc')
      .execute()

    let attemptCounters: Record<string, number> = {}
    return result.map((row) => {
      const stepId = row.workflowStepId
      attemptCounters[stepId] = (attemptCounters[stepId] ?? 0) + 1

      return {
        stepId,
        stepName: row.stepName,
        status: row.status as StepState['status'],
        result: parseJson(row.result),
        error: parseJson(row.error),
        attemptCount: attemptCounters[stepId]!,
        retries: row.retries != null ? Number(row.retries) : undefined,
        retryDelay: row.retryDelay ?? undefined,
        createdAt: new Date(row.createdAt as unknown as string),
        updatedAt: new Date(row.createdAt as unknown as string),
        runningAt: row.runningAt
          ? new Date(row.runningAt as unknown as string)
          : undefined,
        scheduledAt: row.scheduledAt
          ? new Date(row.scheduledAt as unknown as string)
          : undefined,
        succeededAt: row.succeededAt
          ? new Date(row.succeededAt as unknown as string)
          : undefined,
        failedAt: row.failedAt
          ? new Date(row.failedAt as unknown as string)
          : undefined,
      }
    })
  }

  async getDistinctWorkflowNames(): Promise<string[]> {
    const result = await this.db
      .selectFrom('workflowRuns')
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
      .selectFrom('workflowVersions')
      .select(['graph', 'source'])
      .where('workflowName', '=', name)
      .where('graphHash', '=', graphHash)
      .executeTakeFirst()

    if (!row) return null
    return {
      graph: parseJson(row.graph),
      source: row.source,
    }
  }

  async getAIGeneratedWorkflows(
    agentName?: string
  ): Promise<Array<{ workflowName: string; graphHash: string; graph: any }>> {
    let query = this.db
      .selectFrom('workflowVersions')
      .select(['workflowName', 'graphHash', 'graph'])
      .where('source', '=', 'dynamic-workflow')
      .where('status', '=', 'active')
    if (agentName) {
      query = query.where('workflowName', 'like', `ai:${agentName}:%`)
    }
    const rows = await query.execute()
    return rows.map((row) => ({
      workflowName: row.workflowName,
      graphHash: row.graphHash,
      graph: parseJson(row.graph),
    }))
  }

  async deleteRun(id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('workflowRuns')
      .where('workflowRunId', '=', id)
      .executeTakeFirst()

    return BigInt(result.numDeletedRows) > 0n
  }

  private mapRunRow(row: any): WorkflowRun {
    return {
      id: row.workflowRunId as string,
      workflow: row.workflow as string,
      status: row.status as WorkflowStatus,
      input: parseJson(row.input),
      output: parseJson(row.output),
      error: parseJson(row.error),
      inline: row.inline as boolean | undefined,
      graphHash: row.graphHash as string | undefined,
      deterministic: row.deterministic as boolean | undefined,
      plannedSteps: parseJson(row.plannedSteps),
      wire: parseJson(row.wire) ?? { type: 'unknown' },
      createdAt: new Date(row.createdAt as string),
      updatedAt: new Date(row.updatedAt as string),
    }
  }
}
