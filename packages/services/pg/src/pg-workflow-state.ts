import type { SerializedError } from '@pikku/core'
import {
  WorkflowStateService,
  type WorkflowRun,
  type StepState,
  type WorkflowStatus,
} from '@pikku/core/workflow'
import postgres from 'postgres'
import { randomUUID } from 'crypto'

/**
 * PostgreSQL-based implementation of WorkflowStateService
 *
 * Stores workflow run state and step state in PostgreSQL with row-level locking.
 *
 * @example
 * ```typescript
 * const sql = postgres('postgresql://localhost:5432/pikku')
 * const workflowState = new PgWorkflowStateService(sql, queueService, 'workflows')
 * await workflowState.init()
 * ```
 */
export class PgWorkflowStateService extends WorkflowStateService {
  private sql: postgres.Sql
  private schemaName: string
  private initialized = false
  private ownsConnection: boolean

  /**
   * @param connectionOrConfig - postgres.Sql connection instance or postgres.Options config
   * @param queue - Optional queue service for remote workflow execution
   * @param schemaName - PostgreSQL schema name (default: 'workflows')
   */
  constructor(
    connectionOrConfig: postgres.Sql | postgres.Options<{}>,
    queue?: any,
    schemaName = 'workflows'
  ) {
    super(queue)
    this.schemaName = schemaName

    // Check if it's a postgres.Sql instance or config options
    if (typeof connectionOrConfig === 'function') {
      // It's a postgres.Sql instance
      this.sql = connectionOrConfig as postgres.Sql
      this.ownsConnection = false
    } else {
      // It's a config object
      this.sql = postgres(connectionOrConfig)
      this.ownsConnection = true
    }
  }

  /**
   * Initialize the service by creating the schema and tables if they don't exist
   */
  public async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.sql.unsafe(`
      CREATE SCHEMA IF NOT EXISTS ${this.schemaName};

      CREATE TABLE IF NOT EXISTS ${this.schemaName}.workflow_runs (
        id TEXT PRIMARY KEY,
        workflow TEXT NOT NULL,
        status TEXT NOT NULL,
        input JSONB NOT NULL,
        output JSONB,
        error JSONB,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ${this.schemaName}.workflow_steps (
        run_id TEXT NOT NULL,
        step_name TEXT NOT NULL,
        status TEXT NOT NULL,
        result JSONB,
        error JSONB,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (run_id, step_name),
        FOREIGN KEY (run_id) REFERENCES ${this.schemaName}.workflow_runs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON ${this.schemaName}.workflow_runs(status);
      CREATE INDEX IF NOT EXISTS idx_workflow_steps_status ON ${this.schemaName}.workflow_steps(status);
    `)

    this.initialized = true
  }

  async createRun(workflowName: string, input: any): Promise<string> {
    const id = randomUUID()
    const now = Date.now()

    await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.workflow_runs
        (id, workflow, status, input, created_at, updated_at)
      VALUES
        ($1, $2, $3, $4, $5, $6)`,
      [id, workflowName, 'running', JSON.stringify(input), now, now]
    )

    return id
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    const result = await this.sql.unsafe(
      `SELECT id, workflow, status, input, output, error, created_at, updated_at
      FROM ${this.schemaName}.workflow_runs
      WHERE id = $1`,
      [id]
    )

    if (result.length === 0) {
      return null
    }

    const row = result[0]!
    return {
      id: row.id as string,
      workflow: row.workflow as string,
      status: row.status as WorkflowStatus,
      input: row.input,
      output: row.output,
      error: row.error as SerializedError | undefined,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }
  }

  async updateRunStatus(
    id: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<void> {
    const now = Date.now()

    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.workflow_runs
      SET status = $1, output = $2, error = $3, updated_at = $4
      WHERE id = $5`,
      [
        status,
        output ? JSON.stringify(output) : null,
        error ? JSON.stringify(error) : null,
        now,
        id,
      ]
    )
  }

  async getStepState(runId: string, stepName: string): Promise<StepState> {
    const result = await this.sql.unsafe(
      `SELECT status, result, error, updated_at
      FROM ${this.schemaName}.workflow_steps
      WHERE run_id = $1 AND step_name = $2`,
      [runId, stepName]
    )

    if (result.length === 0) {
      // Step doesn't exist yet - return pending state
      return {
        status: 'pending',
        updatedAt: Date.now(),
      }
    }

    const row = result[0]!
    return {
      status: row.status as any,
      result: row.result,
      error: row.error as SerializedError | undefined,
      updatedAt: Number(row.updated_at),
    }
  }

  async setStepScheduled(runId: string, stepName: string): Promise<void> {
    const now = Date.now()

    await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.workflow_steps
        (run_id, step_name, status, updated_at)
      VALUES
        ($1, $2, $3, $4)
      ON CONFLICT (run_id, step_name)
      DO UPDATE SET status = $3, updated_at = $4`,
      [runId, stepName, 'scheduled', now]
    )
  }

  async setStepResult(
    runId: string,
    stepName: string,
    result: any
  ): Promise<void> {
    const now = Date.now()

    await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.workflow_steps
        (run_id, step_name, status, result, updated_at)
      VALUES
        ($1, $2, $3, $4, $5)
      ON CONFLICT (run_id, step_name)
      DO UPDATE SET status = $3, result = $4, error = NULL, updated_at = $5`,
      [runId, stepName, 'done', JSON.stringify(result), now]
    )
  }

  async setStepError(
    runId: string,
    stepName: string,
    error: Error
  ): Promise<void> {
    const now = Date.now()

    const serializedError: SerializedError = {
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
    }

    await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.workflow_steps
        (run_id, step_name, status, error, updated_at)
      VALUES
        ($1, $2, $3, $4, $5)
      ON CONFLICT (run_id, step_name)
      DO UPDATE SET status = $3, error = $4, result = NULL, updated_at = $5`,
      [runId, stepName, 'error', JSON.stringify(serializedError), now]
    )
  }

  async withRunLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    // Use PostgreSQL advisory lock based on run ID hash
    // Convert UUID to a numeric hash for advisory lock
    const lockId = this.hashStringToInt(id)

    try {
      // Acquire advisory lock (blocks until available)
      await this.sql.unsafe('SELECT pg_advisory_lock($1)', [lockId])

      // Execute function
      return await fn()
    } finally {
      // Release advisory lock
      await this.sql.unsafe('SELECT pg_advisory_unlock($1)', [lockId])
    }
  }

  /**
   * Hash a string to a 32-bit integer for PostgreSQL advisory locks
   */
  private hashStringToInt(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash)
  }

  async close(): Promise<void> {
    if (this.ownsConnection) {
      await this.sql.end()
    }
  }
}
