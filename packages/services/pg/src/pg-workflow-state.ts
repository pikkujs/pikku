import type { SerializedError } from '@pikku/core'
import {
  WorkflowStateService,
  type WorkflowRun,
  type StepState,
  type WorkflowStatus,
} from '@pikku/core/workflow'
import postgres from 'postgres'

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
   * @param schemaName - PostgreSQL schema name (default: 'pikku')
   */
  constructor(
    connectionOrConfig: postgres.Sql | postgres.Options<{}>,
    schemaName = 'pikku'
  ) {
    super()
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

      DO $$ BEGIN
        CREATE TYPE ${this.schemaName}.workflow_status_enum AS ENUM ('running', 'completed', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE ${this.schemaName}.step_status_enum AS ENUM ('pending', 'scheduled', 'done', 'error');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      CREATE TABLE IF NOT EXISTS ${this.schemaName}.workflow_runs (
        workflow_run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow TEXT NOT NULL,
        status ${this.schemaName}.workflow_status_enum NOT NULL,
        input JSONB NOT NULL,
        output JSONB,
        error JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS ${this.schemaName}.workflow_step (
        workflow_step_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_run_id UUID NOT NULL,
        step_name TEXT NOT NULL,
        status ${this.schemaName}.step_status_enum NOT NULL DEFAULT 'pending',
        result JSONB,
        error JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (workflow_run_id, step_name, created_at),
        FOREIGN KEY (workflow_run_id) REFERENCES ${this.schemaName}.workflow_runs(workflow_run_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON ${this.schemaName}.workflow_runs(status);
      CREATE INDEX IF NOT EXISTS idx_workflow_step_status ON ${this.schemaName}.workflow_step(status);
    `)

    this.initialized = true
  }

  async createRun(workflowName: string, input: any): Promise<string> {
    const result = await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.workflow_runs
        (workflow, status, input)
      VALUES
        ($1, $2, $3)
      RETURNING workflow_run_id`,
      [workflowName, 'running', input]
    )

    return result[0]!.workflow_run_id
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    const result = await this.sql.unsafe(
      `SELECT workflow_run_id, workflow, status, input, output, error, created_at, updated_at
      FROM ${this.schemaName}.workflow_runs
      WHERE workflow_run_id = $1`,
      [id]
    )

    if (result.length === 0) {
      return null
    }

    const row = result[0]!
    return {
      id: row.workflow_run_id as string,
      workflow: row.workflow as string,
      status: row.status as WorkflowStatus,
      input: row.input,
      output: row.output,
      error: row.error,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    }
  }

  async updateRunStatus(
    id: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<void> {
    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.workflow_runs
      SET status = $1, output = $2, error = $3, updated_at = now()
      WHERE workflow_run_id = $4`,
      [status, output || null, error || null, id]
    )
  }

  async getStepState(runId: string, stepName: string): Promise<StepState> {
    // Get the latest step state
    const result = await this.sql.unsafe(
      `SELECT workflow_step_id, status, result, error, created_at, updated_at
      FROM ${this.schemaName}.workflow_step
      WHERE workflow_run_id = $1 AND step_name = $2
      ORDER BY created_at DESC
      LIMIT 1`,
      [runId, stepName]
    )

    // If no row exists or status is error, create a new pending row
    if (result.length === 0 || result[0]!.status === 'error') {
      const newRow = await this.sql.unsafe(
        `INSERT INTO ${this.schemaName}.workflow_step (workflow_run_id, step_name, status)
        VALUES ($1, $2, 'pending')
        RETURNING workflow_step_id, status, result, error, created_at, updated_at`,
        [runId, stepName]
      )

      const row = newRow[0]!
      return {
        stepId: row.workflow_step_id as string,
        status: row.status as any,
        result: row.result,
        error: row.error,
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string),
      }
    }

    const row = result[0]!
    return {
      stepId: row.workflow_step_id as string,
      status: row.status as any,
      result: row.result,
      error: row.error,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    }
  }

  async setStepScheduled(stepId: string): Promise<void> {
    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.workflow_step
      SET status = 'scheduled', updated_at = now()
      WHERE workflow_step_id = $1`,
      [stepId]
    )
  }

  async setStepResult(stepId: string, result: any): Promise<void> {
    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.workflow_step
      SET status = 'done', result = $1, error = NULL, updated_at = now()
      WHERE workflow_step_id = $2`,
      [result, stepId]
    )
  }

  async setStepError(stepId: string, error: Error): Promise<void> {
    const serializedError: SerializedError = {
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
    }

    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.workflow_step
      SET status = 'error', error = $1, result = NULL, updated_at = now()
      WHERE workflow_step_id = $2`,
      [serializedError, stepId]
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
