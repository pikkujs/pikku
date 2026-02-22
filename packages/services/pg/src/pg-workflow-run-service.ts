import type {
  WorkflowRun,
  StepState,
  WorkflowStatus,
  WorkflowRunService,
} from '@pikku/core/workflow'
import postgres from 'postgres'

export class PgWorkflowRunService implements WorkflowRunService {
  constructor(
    private sql: postgres.Sql,
    private schemaName = 'pikku'
  ) {}

  async listRuns(options?: {
    workflowName?: string
    status?: string
    limit?: number
    offset?: number
  }): Promise<WorkflowRun[]> {
    const { workflowName, status, limit = 50, offset = 0 } = options ?? {}

    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (workflowName) {
      conditions.push(`workflow = $${paramIndex++}`)
      params.push(workflowName)
    }

    if (status) {
      conditions.push(`status = $${paramIndex++}`)
      params.push(status)
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    params.push(limit)
    params.push(offset)

    const result = await this.sql.unsafe(
      `SELECT workflow_run_id, workflow, status, input, output, error, inline, graph_hash, wire, created_at, updated_at
       FROM ${this.schemaName}.workflow_runs
       ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    )

    return result.map((row) => this.mapRunRow(row))
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    const result = await this.sql.unsafe(
      `SELECT workflow_run_id, workflow, status, input, output, error, inline, graph_hash, wire, created_at, updated_at
       FROM ${this.schemaName}.workflow_runs
       WHERE workflow_run_id = $1`,
      [id]
    )

    if (result.length === 0) return null
    return this.mapRunRow(result[0]!)
  }

  async getRunSteps(
    runId: string
  ): Promise<
    Array<StepState & { stepName: string; rpcName?: string; data?: any }>
  > {
    const result = await this.sql.unsafe(
      `SELECT
        s.workflow_step_id,
        s.step_name,
        s.rpc_name,
        s.data,
        s.status,
        s.result,
        s.error,
        s.retries,
        s.retry_delay,
        s.created_at,
        s.updated_at,
        (SELECT COUNT(*) FROM ${this.schemaName}.workflow_step_history
         WHERE workflow_step_id = s.workflow_step_id) as attempt_count
      FROM ${this.schemaName}.workflow_step s
      WHERE s.workflow_run_id = $1
      ORDER BY s.created_at ASC`,
      [runId]
    )

    return result.map((row) => ({
      stepId: row.workflow_step_id as string,
      stepName: row.step_name as string,
      rpcName: row.rpc_name as string | undefined,
      data: row.data,
      status: row.status as any,
      result: row.result,
      error: row.error,
      attemptCount: Number(row.attempt_count || 1),
      retries: row.retries ? Number(row.retries) : undefined,
      retryDelay: row.retry_delay ? String(row.retry_delay) : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    }))
  }

  async getRunHistory(
    runId: string
  ): Promise<Array<StepState & { stepName: string }>> {
    const result = await this.sql.unsafe(
      `SELECT
        s.workflow_step_id,
        s.step_name,
        s.retries,
        s.retry_delay,
        h.status,
        h.result,
        h.error,
        h.created_at,
        h.running_at,
        h.scheduled_at,
        h.succeeded_at,
        h.failed_at,
        ROW_NUMBER() OVER (PARTITION BY s.workflow_step_id ORDER BY h.created_at ASC) as attempt_count
      FROM ${this.schemaName}.workflow_step s
      INNER JOIN ${this.schemaName}.workflow_step_history h
        ON s.workflow_step_id = h.workflow_step_id
      WHERE s.workflow_run_id = $1
      ORDER BY h.created_at ASC`,
      [runId]
    )

    return result.map((row) => ({
      stepId: row.workflow_step_id as string,
      stepName: row.step_name as string,
      status: row.status as any,
      result: row.result,
      error: row.error,
      attemptCount: Number(row.attempt_count),
      retries: row.retries ? Number(row.retries) : undefined,
      retryDelay: row.retry_delay ? String(row.retry_delay) : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.created_at as string),
      runningAt: row.running_at
        ? new Date(row.running_at as string)
        : undefined,
      scheduledAt: row.scheduled_at
        ? new Date(row.scheduled_at as string)
        : undefined,
      succeededAt: row.succeeded_at
        ? new Date(row.succeeded_at as string)
        : undefined,
      failedAt: row.failed_at ? new Date(row.failed_at as string) : undefined,
    }))
  }

  async getDistinctWorkflowNames(): Promise<string[]> {
    const result = await this.sql.unsafe(
      `SELECT DISTINCT workflow FROM ${this.schemaName}.workflow_runs ORDER BY workflow`
    )
    return result.map((row) => row.workflow as string)
  }

  async getWorkflowVersion(
    name: string,
    graphHash: string
  ): Promise<{ graph: any; source: string } | null> {
    const result = await this.sql.unsafe(
      `SELECT graph, source
       FROM ${this.schemaName}.workflow_versions
       WHERE workflow_name = $1 AND graph_hash = $2`,
      [name, graphHash]
    )
    if (result.length === 0) return null
    return {
      graph: result[0]!.graph,
      source: result[0]!.source as string,
    }
  }

  async deleteRun(id: string): Promise<boolean> {
    const result = await this.sql.unsafe(
      `DELETE FROM ${this.schemaName}.workflow_runs WHERE workflow_run_id = $1`,
      [id]
    )
    return result.count > 0
  }

  private mapRunRow(row: any): WorkflowRun {
    return {
      id: row.workflow_run_id as string,
      workflow: row.workflow as string,
      status: row.status as WorkflowStatus,
      input: row.input,
      output: row.output,
      error: row.error,
      inline: row.inline as boolean | undefined,
      graphHash: row.graph_hash as string | undefined,
      wire: row.wire ?? { type: 'unknown' },
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    }
  }
}
