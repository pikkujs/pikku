import type { SerializedError } from '@pikku/core'
import {
  PikkuWorkflowService,
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
 * const workflowService = new PgWorkflowService(sql, 'pikku')
 * await workflowService.init()
 * ```
 */
export class PgWorkflowService extends PikkuWorkflowService {
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
        CREATE TYPE ${this.schemaName}.workflow_status_enum AS ENUM ('running', 'completed', 'failed', 'cancelled');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE ${this.schemaName}.step_status_enum AS ENUM ('pending', 'running', 'scheduled', 'succeeded', 'failed');
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
        state JSONB DEFAULT '{}',
        inline BOOLEAN DEFAULT FALSE,
        graph_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Add inline column if it doesn't exist (for existing tables)
      ALTER TABLE ${this.schemaName}.workflow_runs
        ADD COLUMN IF NOT EXISTS inline BOOLEAN DEFAULT FALSE;

      -- Add state column if it doesn't exist (for existing tables)
      ALTER TABLE ${this.schemaName}.workflow_runs
        ADD COLUMN IF NOT EXISTS state JSONB DEFAULT '{}';

      -- Add graph_hash column if it doesn't exist (for existing tables)
      ALTER TABLE ${this.schemaName}.workflow_runs
        ADD COLUMN IF NOT EXISTS graph_hash TEXT;

      CREATE TABLE IF NOT EXISTS ${this.schemaName}.workflow_step (
        workflow_step_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_run_id UUID NOT NULL,
        step_name TEXT NOT NULL,
        rpc_name TEXT,
        data JSONB,
        status ${this.schemaName}.step_status_enum NOT NULL DEFAULT 'pending',
        result JSONB,
        error JSONB,
        branch_taken TEXT,
        retries INTEGER,
        retry_delay TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (workflow_run_id, step_name),
        FOREIGN KEY (workflow_run_id) REFERENCES ${this.schemaName}.workflow_runs(workflow_run_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ${this.schemaName}.workflow_step_history (
        history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_step_id UUID NOT NULL,
        status ${this.schemaName}.step_status_enum NOT NULL,
        result JSONB,
        error JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        running_at TIMESTAMPTZ,
        scheduled_at TIMESTAMPTZ,
        succeeded_at TIMESTAMPTZ,
        failed_at TIMESTAMPTZ,
        FOREIGN KEY (workflow_step_id) REFERENCES ${this.schemaName}.workflow_step(workflow_step_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ${this.schemaName}.workflow_versions (
        workflow_name TEXT NOT NULL,
        graph_hash TEXT NOT NULL,
        graph JSONB NOT NULL,
        source TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (workflow_name, graph_hash)
      );
    `)

    this.initialized = true
  }

  async createRun(
    workflowName: string,
    input: any,
    inline: boolean,
    graphHash: string
  ): Promise<string> {
    const result = await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.workflow_runs
        (workflow, status, input, inline, graph_hash)
      VALUES
        ($1, $2, $3, $4, $5)
      RETURNING workflow_run_id`,
      [workflowName, 'running', input, inline, graphHash]
    )

    return result[0]!.workflow_run_id
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    const result = await this.sql.unsafe(
      `SELECT workflow_run_id, workflow, status, input, output, error, inline, graph_hash, created_at, updated_at
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
      inline: row.inline as boolean | undefined,
      graphHash: row.graph_hash as string | undefined,
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

  async insertStepState(
    runId: string,
    stepName: string,
    rpcName: string,
    data: any,
    stepOptions?: { retries?: number; retryDelay?: string | number }
  ): Promise<StepState> {
    // Insert into workflow_step table
    const result = await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.workflow_step
        (workflow_run_id, step_name, rpc_name, data, status, retries, retry_delay)
      VALUES ($1, $2, $3, $4, 'pending', $5, $6)
      RETURNING workflow_step_id, status, result, error, retries, retry_delay, created_at, updated_at`,
      [
        runId,
        stepName,
        rpcName,
        data,
        stepOptions?.retries ?? null,
        stepOptions?.retryDelay?.toString() ?? null,
      ]
    )

    const row = result[0]!

    // Insert initial history record
    await this.insertHistoryRecord(row.workflow_step_id as string, 'pending')

    return {
      stepId: row.workflow_step_id as string,
      status: row.status as any,
      result: row.result,
      error: row.error,
      attemptCount: 1, // First attempt (1 history row)
      retries: row.retries ? Number(row.retries) : undefined,
      retryDelay: row.retry_delay ? String(row.retry_delay) : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    }
  }

  async getStepState(runId: string, stepName: string): Promise<StepState> {
    // Get step with attempt count from history table
    const result = await this.sql.unsafe(
      `SELECT
        s.workflow_step_id,
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
      WHERE s.workflow_run_id = $1 AND s.step_name = $2`,
      [runId, stepName]
    )

    if (result.length === 0) {
      throw new Error(
        `Step not found: runId=${runId}, stepName=${stepName}. Use insertStepState to create it.`
      )
    }

    const row = result[0]!
    return {
      stepId: row.workflow_step_id as string,
      status: row.status as any,
      result: row.result,
      error: row.error,
      attemptCount: Number(row.attempt_count),
      retries: row.retries ? Number(row.retries) : undefined,
      retryDelay: row.retry_delay ? String(row.retry_delay) : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    }
  }

  async getRunHistory(
    runId: string
  ): Promise<Array<StepState & { stepName: string }>> {
    // Query from history table to get all attempts for each step in chronological order
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

  async setStepRunning(stepId: string): Promise<void> {
    // Update workflow_step to running
    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.workflow_step
      SET status = 'running', updated_at = now()
      WHERE workflow_step_id = $1`,
      [stepId]
    )

    // Update current history record to running (update in-place)
    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.workflow_step_history
      SET status = 'running'
      WHERE history_id = (
        SELECT history_id
        FROM ${this.schemaName}.workflow_step_history
        WHERE workflow_step_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      )`,
      [stepId]
    )
  }

  async setStepScheduled(stepId: string): Promise<void> {
    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.workflow_step
      SET status = 'scheduled', updated_at = now()
      WHERE workflow_step_id = $1`,
      [stepId]
    )
  }

  private async insertHistoryRecord(
    stepId: string,
    status: string,
    result?: any,
    error?: SerializedError
  ): Promise<void> {
    const now = new Date()
    const timestampField = this.getTimestampFieldForStatus(status)

    await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.workflow_step_history
      (workflow_step_id, status, result, error, ${timestampField})
      VALUES ($1, $2, $3, $4, $5)`,
      [stepId, status, result || null, error || null, now]
    )
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
        // For 'pending' or unknown status, don't set a specific timestamp
        // (created_at will be set by DEFAULT now())
        return 'created_at'
    }
  }

  async setStepResult(stepId: string, result: any): Promise<void> {
    // Update workflow_step to succeeded
    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.workflow_step
      SET status = 'succeeded', result = $1, error = NULL, updated_at = now()
      WHERE workflow_step_id = $2`,
      [result, stepId]
    )

    // Update current history record to succeeded (update in-place)
    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.workflow_step_history
      SET status = 'succeeded', result = $1
      WHERE history_id = (
        SELECT history_id
        FROM ${this.schemaName}.workflow_step_history
        WHERE workflow_step_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      )`,
      [result, stepId]
    )
  }

  async setStepError(stepId: string, error: Error): Promise<void> {
    const serializedError: SerializedError = {
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
    }

    // Update workflow_step to failed
    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.workflow_step
      SET status = 'failed', error = $1, result = NULL, updated_at = now()
      WHERE workflow_step_id = $2`,
      [serializedError, stepId]
    )

    // Update current history record to failed (update in-place)
    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.workflow_step_history
      SET status = 'failed', error = $1
      WHERE history_id = (
        SELECT history_id
        FROM ${this.schemaName}.workflow_step_history
        WHERE workflow_step_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      )`,
      [serializedError, stepId]
    )
  }

  async createRetryAttempt(
    stepId: string,
    status: 'pending' | 'running'
  ): Promise<StepState> {
    // TODO: If status is 'running', we need to set the running_at timestamp in history

    // Reset step to pending for retry (keeps all metadata: rpc_name, data, retries, retry_delay)
    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.workflow_step
      SET status = $1, result = NULL, error = NULL, updated_at = now()
      WHERE workflow_step_id = $2`,
      [status, stepId]
    )

    // Insert NEW history record for retry attempt
    await this.insertHistoryRecord(stepId, status)

    // Return updated state with new attempt count
    return await this.sql
      .unsafe(
        `SELECT
          workflow_step_id,
          status,
          result,
          error,
          retries,
          retry_delay,
          created_at,
          updated_at,
          (SELECT COUNT(*) FROM ${this.schemaName}.workflow_step_history
           WHERE workflow_step_id = $1) as attempt_count
        FROM ${this.schemaName}.workflow_step
        WHERE workflow_step_id = $1`,
        [stepId]
      )
      .then((rows) => {
        const row = rows[0]!
        return {
          stepId: row.workflow_step_id as string,
          status: row.status as any,
          result: row.result,
          error: row.error,
          attemptCount: Number(row.attempt_count),
          retries: row.retries ? Number(row.retries) : undefined,
          retryDelay: row.retry_delay ? String(row.retry_delay) : undefined,
          createdAt: new Date(row.created_at as string),
          updatedAt: new Date(row.updated_at as string),
        }
      })
  }

  private async withLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
    const lockId = this.hashStringToInt(lockKey)
    const reservedConnection = await this.sql.reserve()
    try {
      // Acquire advisory lock (blocks until available)
      await reservedConnection.unsafe('SELECT pg_advisory_lock($1)', [lockId])
      return await fn()
    } finally {
      await reservedConnection.unsafe('SELECT pg_advisory_unlock($1)', [lockId])
      await reservedConnection.release()
    }
  }

  async withRunLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return this.withLock(`run:${id}`, fn)
  }

  async withStepLock<T>(
    runId: string,
    stepName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    return this.withLock(`step:${runId}:${stepName}`, fn)
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

  // ============================================================================
  // Workflow Graph Methods
  // ============================================================================

  async getCompletedGraphState(runId: string): Promise<{
    completedNodeIds: string[]
    failedNodeIds: string[]
    branchKeys: Record<string, string>
  }> {
    const result = await this.sql.unsafe(
      `SELECT step_name, status, branch_taken, attempt_count, retries
       FROM ${this.schemaName}.workflow_step
       WHERE workflow_run_id = $1
         AND status IN ('succeeded', 'failed')
         AND step_name LIKE 'node:%'`,
      [runId]
    )

    const completedNodeIds: string[] = []
    const failedNodeIds: string[] = []
    const branchKeys: Record<string, string> = {}

    for (const row of result) {
      const stepName = row.step_name as string
      const nodeId = stepName.replace(/^node:/, '')

      if (row.status === 'succeeded') {
        completedNodeIds.push(nodeId)
        if (row.branch_taken) {
          branchKeys[nodeId] = row.branch_taken as string
        }
      } else if (row.status === 'failed') {
        const maxAttempts = ((row.retries as number) ?? 0) + 1
        if ((row.attempt_count as number) >= maxAttempts) {
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

    const stepNames = nodeIds.map((id) => `node:${id}`)

    // Find which step names already exist
    const result = await this.sql.unsafe(
      `SELECT step_name
       FROM ${this.schemaName}.workflow_step
       WHERE workflow_run_id = $1
         AND step_name = ANY($2)`,
      [runId, stepNames]
    )

    const existingStepNames = new Set(result.map((r) => r.step_name as string))

    // Return node IDs that don't have steps
    return nodeIds.filter((id) => !existingStepNames.has(`node:${id}`))
  }

  async getNodeResults(
    runId: string,
    nodeIds: string[]
  ): Promise<Record<string, any>> {
    if (nodeIds.length === 0) return {}

    const stepNames = nodeIds.map((id) => `node:${id}`)

    const result = await this.sql.unsafe(
      `SELECT step_name, result
       FROM ${this.schemaName}.workflow_step
       WHERE workflow_run_id = $1
         AND step_name = ANY($2)
         AND status = 'succeeded'`,
      [runId, stepNames]
    )

    const results: Record<string, any> = {}
    for (const row of result) {
      const stepName = row.step_name as string
      const nodeId = stepName.replace(/^node:/, '')
      results[nodeId] = row.result
    }

    return results
  }

  async setBranchTaken(stepId: string, branchKey: string): Promise<void> {
    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.workflow_step
       SET branch_taken = $1, updated_at = now()
       WHERE workflow_step_id = $2`,
      [branchKey, stepId]
    )
  }

  async updateRunState(
    runId: string,
    name: string,
    value: unknown
  ): Promise<void> {
    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.workflow_runs
       SET state = jsonb_set(COALESCE(state, '{}'), $1, $2), updated_at = now()
       WHERE workflow_run_id = $3`,
      [[name], JSON.stringify(value), runId]
    )
  }

  async getRunState(runId: string): Promise<Record<string, unknown>> {
    const result = await this.sql.unsafe(
      `SELECT state FROM ${this.schemaName}.workflow_runs WHERE workflow_run_id = $1`,
      [runId]
    )
    if (result.length === 0) {
      return {}
    }
    return (result[0]!.state as Record<string, unknown>) || {}
  }

  // ============================================================================
  // Version Methods
  // ============================================================================

  async upsertWorkflowVersion(
    name: string,
    graphHash: string,
    graph: any,
    source: string
  ): Promise<void> {
    await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.workflow_versions
        (workflow_name, graph_hash, graph, source)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (workflow_name, graph_hash)
      DO NOTHING`,
      [name, graphHash, graph, source]
    )
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

  async close(): Promise<void> {
    if (this.ownsConnection) {
      await this.sql.end()
    }
  }
}
