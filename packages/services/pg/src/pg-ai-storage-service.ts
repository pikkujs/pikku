import type {
  AIStorageService,
  AIRunStateService,
  CreateRunInput,
} from '@pikku/core/services'
import type { AIThread, AIMessage, AgentRunState } from '@pikku/core/ai-agent'
import postgres from 'postgres'
import { validateSchemaName } from './schema.js'

export class PgAIStorageService implements AIStorageService, AIRunStateService {
  private sql: postgres.Sql
  private schemaName: string
  private initialized = false
  private ownsConnection: boolean

  constructor(
    connectionOrConfig: postgres.Sql | postgres.Options<{}>,
    schemaName = 'pikku'
  ) {
    validateSchemaName(schemaName)
    this.schemaName = schemaName

    if (typeof connectionOrConfig === 'function') {
      this.sql = connectionOrConfig as postgres.Sql
      this.ownsConnection = false
    } else {
      this.sql = postgres(connectionOrConfig)
      this.ownsConnection = true
    }
  }

  public async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.sql.unsafe(`
      CREATE SCHEMA IF NOT EXISTS ${this.schemaName};

      CREATE TABLE IF NOT EXISTS ${this.schemaName}.ai_threads (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL,
        title TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_ai_threads_resource
        ON ${this.schemaName}.ai_threads (resource_id);

      CREATE TABLE IF NOT EXISTS ${this.schemaName}.ai_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES ${this.schemaName}.ai_threads(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT,
        tool_calls JSONB,
        tool_results JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_ai_messages_thread
        ON ${this.schemaName}.ai_messages (thread_id, created_at);

      CREATE TABLE IF NOT EXISTS ${this.schemaName}.ai_working_memory (
        id TEXT NOT NULL,
        scope TEXT NOT NULL,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (id, scope)
      );

      CREATE TABLE IF NOT EXISTS ${this.schemaName}.ai_run (
        run_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        agent_name TEXT NOT NULL,
        thread_id TEXT NOT NULL REFERENCES ${this.schemaName}.ai_threads(id) ON DELETE CASCADE,
        resource_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        suspend_reason TEXT,
        missing_rpcs JSONB,
        usage_input_tokens INTEGER NOT NULL DEFAULT 0,
        usage_output_tokens INTEGER NOT NULL DEFAULT 0,
        usage_model TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_ai_run_thread
        ON ${this.schemaName}.ai_run (thread_id, created_at);

      CREATE TABLE IF NOT EXISTS ${this.schemaName}.ai_run_approval (
        tool_call_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES ${this.schemaName}.ai_run(run_id) ON DELETE CASCADE,
        tool_name TEXT NOT NULL,
        args JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_ai_run_approval_run
        ON ${this.schemaName}.ai_run_approval (run_id);
    `)

    this.initialized = true
  }

  async createThread(
    resourceId: string,
    options?: {
      threadId?: string
      title?: string
      metadata?: Record<string, unknown>
    }
  ): Promise<AIThread> {
    const id = options?.threadId ?? crypto.randomUUID()
    const now = new Date()

    await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.ai_threads (id, resource_id, title, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        resourceId,
        options?.title ?? null,
        JSON.stringify(options?.metadata ?? null),
        now,
        now,
      ]
    )

    return {
      id,
      resourceId,
      title: options?.title,
      metadata: options?.metadata,
      createdAt: now,
      updatedAt: now,
    }
  }

  async getThread(threadId: string): Promise<AIThread> {
    const result = await this.sql.unsafe(
      `SELECT id, resource_id, title, metadata, created_at, updated_at
       FROM ${this.schemaName}.ai_threads
       WHERE id = $1`,
      [threadId]
    )

    if (result.length === 0) {
      throw new Error(`Thread not found: ${threadId}`)
    }

    const row = result[0]!
    return {
      id: row.id as string,
      resourceId: row.resource_id as string,
      title: row.title as string | undefined,
      metadata: row.metadata as Record<string, unknown> | undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    }
  }

  async getThreads(resourceId: string): Promise<AIThread[]> {
    const result = await this.sql.unsafe(
      `SELECT id, resource_id, title, metadata, created_at, updated_at
       FROM ${this.schemaName}.ai_threads
       WHERE resource_id = $1
       ORDER BY updated_at DESC`,
      [resourceId]
    )

    return result.map((row) => ({
      id: row.id as string,
      resourceId: row.resource_id as string,
      title: row.title as string | undefined,
      metadata: row.metadata as Record<string, unknown> | undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    }))
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.sql.unsafe(
      `DELETE FROM ${this.schemaName}.ai_threads WHERE id = $1`,
      [threadId]
    )
  }

  async getMessages(
    threadId: string,
    options?: { lastN?: number; cursor?: string }
  ): Promise<AIMessage[]> {
    let query: string
    let params: any[]

    if (options?.cursor) {
      query = `SELECT id, role, content, tool_calls, tool_results, created_at
               FROM ${this.schemaName}.ai_messages
               WHERE thread_id = $1 AND created_at < (
                 SELECT created_at FROM ${this.schemaName}.ai_messages WHERE id = $2
               )
               ORDER BY created_at DESC
               LIMIT $3`
      params = [threadId, options.cursor, options.lastN ?? 50]
    } else if (options?.lastN) {
      query = `SELECT id, role, content, tool_calls, tool_results, created_at
               FROM ${this.schemaName}.ai_messages
               WHERE thread_id = $1
               ORDER BY created_at DESC
               LIMIT $2`
      params = [threadId, options.lastN]
    } else {
      query = `SELECT id, role, content, tool_calls, tool_results, created_at
               FROM ${this.schemaName}.ai_messages
               WHERE thread_id = $1
               ORDER BY created_at ASC`
      params = [threadId]
    }

    const result = await this.sql.unsafe(query, params)

    const messages = result.map((row) => ({
      id: row.id as string,
      role: row.role as AIMessage['role'],
      content: row.content as string | undefined,
      toolCalls:
        typeof row.tool_calls === 'string'
          ? JSON.parse(row.tool_calls)
          : (row.tool_calls as AIMessage['toolCalls']),
      toolResults:
        typeof row.tool_results === 'string'
          ? JSON.parse(row.tool_results)
          : (row.tool_results as AIMessage['toolResults']),
      createdAt: new Date(row.created_at as string),
    }))

    if (options?.cursor || options?.lastN) {
      messages.reverse()
    }

    return messages
  }

  async saveMessages(threadId: string, messages: AIMessage[]): Promise<void> {
    if (messages.length === 0) return

    const values = messages
      .map((_, i) => {
        const base = i * 7
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`
      })
      .join(', ')

    const params = messages.flatMap((msg) => [
      msg.id,
      threadId,
      msg.role,
      msg.content ?? null,
      msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
      msg.toolResults ? JSON.stringify(msg.toolResults) : null,
      msg.createdAt ?? new Date(),
    ])

    await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.ai_messages (id, thread_id, role, content, tool_calls, tool_results, created_at)
       VALUES ${values}`,
      params
    )

    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.ai_threads SET updated_at = now() WHERE id = $1`,
      [threadId]
    )
  }

  async getWorkingMemory(
    id: string,
    scope: 'resource' | 'thread'
  ): Promise<Record<string, unknown> | null> {
    const result = await this.sql.unsafe(
      `SELECT data FROM ${this.schemaName}.ai_working_memory
       WHERE id = $1 AND scope = $2`,
      [id, scope]
    )

    if (result.length === 0) return null
    return result[0]!.data as Record<string, unknown>
  }

  async saveWorkingMemory(
    id: string,
    scope: 'resource' | 'thread',
    data: Record<string, unknown>
  ): Promise<void> {
    await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.ai_working_memory (id, scope, data, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (id, scope) DO UPDATE SET data = $3, updated_at = now()`,
      [id, scope, JSON.stringify(data)]
    )
  }

  async createRun(run: CreateRunInput): Promise<string> {
    const result = await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.ai_run
       (agent_name, thread_id, resource_id, status, suspend_reason, missing_rpcs,
        usage_input_tokens, usage_output_tokens, usage_model, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING run_id`,
      [
        run.agentName,
        run.threadId,
        run.resourceId,
        run.status,
        run.suspendReason ?? null,
        run.missingRpcs ? JSON.stringify(run.missingRpcs) : null,
        run.usage.inputTokens,
        run.usage.outputTokens,
        run.usage.model,
        run.createdAt,
        run.updatedAt,
      ]
    )

    const runId = result[0]!.run_id as string

    if (run.pendingApprovals?.length) {
      await this.insertApprovals(runId, run.pendingApprovals)
    }

    return runId
  }

  async updateRun(
    runId: string,
    updates: Partial<AgentRunState>
  ): Promise<void> {
    const setClauses: string[] = ['updated_at = now()']
    const params: any[] = []
    let paramIdx = 1

    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIdx++}`)
      params.push(updates.status)
    }
    if (updates.suspendReason !== undefined) {
      setClauses.push(`suspend_reason = $${paramIdx++}`)
      params.push(updates.suspendReason)
    }
    if (updates.missingRpcs !== undefined) {
      setClauses.push(`missing_rpcs = $${paramIdx++}`)
      params.push(JSON.stringify(updates.missingRpcs))
    }
    if (updates.usage !== undefined) {
      setClauses.push(`usage_input_tokens = $${paramIdx++}`)
      params.push(updates.usage.inputTokens)
      setClauses.push(`usage_output_tokens = $${paramIdx++}`)
      params.push(updates.usage.outputTokens)
      setClauses.push(`usage_model = $${paramIdx++}`)
      params.push(updates.usage.model)
    }

    params.push(runId)
    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.ai_run SET ${setClauses.join(', ')} WHERE run_id = $${paramIdx}`,
      params
    )

    if (updates.pendingApprovals !== undefined) {
      await this.sql.unsafe(
        `DELETE FROM ${this.schemaName}.ai_run_approval WHERE run_id = $1`,
        [runId]
      )
      if (updates.pendingApprovals.length) {
        await this.insertApprovals(runId, updates.pendingApprovals)
      }
    }
  }

  async getRun(runId: string): Promise<AgentRunState | null> {
    const result = await this.sql.unsafe(
      `SELECT run_id, agent_name, thread_id, resource_id, status,
              suspend_reason, missing_rpcs,
              usage_input_tokens, usage_output_tokens,
              usage_model, created_at, updated_at
       FROM ${this.schemaName}.ai_run WHERE run_id = $1`,
      [runId]
    )
    if (result.length === 0) return null

    const approvals = await this.sql.unsafe(
      `SELECT tool_call_id, tool_name, args, status
       FROM ${this.schemaName}.ai_run_approval
       WHERE run_id = $1 AND status = 'pending'`,
      [runId]
    )

    return this.mapRunRow(result[0]!, approvals)
  }

  async getRunsByThread(threadId: string): Promise<AgentRunState[]> {
    const result = await this.sql.unsafe(
      `SELECT run_id, agent_name, thread_id, resource_id, status,
              suspend_reason, missing_rpcs,
              usage_input_tokens, usage_output_tokens,
              usage_model, created_at, updated_at
       FROM ${this.schemaName}.ai_run WHERE thread_id = $1
       ORDER BY created_at DESC`,
      [threadId]
    )

    const runs: AgentRunState[] = []
    for (const row of result) {
      const approvals = await this.sql.unsafe(
        `SELECT tool_call_id, tool_name, args, status
         FROM ${this.schemaName}.ai_run_approval
         WHERE run_id = $1 AND status = 'pending'`,
        [row.run_id]
      )
      runs.push(this.mapRunRow(row, approvals))
    }
    return runs
  }

  private async insertApprovals(
    runId: string,
    approvals: NonNullable<AgentRunState['pendingApprovals']>
  ): Promise<void> {
    const values = approvals
      .map((_, i) => {
        const base = i * 4
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`
      })
      .join(', ')

    const params = approvals.flatMap((a) => [
      a.toolCallId,
      runId,
      a.toolName,
      JSON.stringify(a.args),
    ])

    await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.ai_run_approval (tool_call_id, run_id, tool_name, args)
       VALUES ${values}`,
      params
    )
  }

  private mapRunRow(row: any, approvalRows?: any[]): AgentRunState {
    const pendingApprovals = approvalRows?.length
      ? approvalRows.map((a: any) => ({
          toolCallId: a.tool_call_id as string,
          toolName: a.tool_name as string,
          args: a.args as unknown,
        }))
      : undefined

    return {
      runId: row.run_id as string,
      agentName: row.agent_name as string,
      threadId: row.thread_id as string,
      resourceId: row.resource_id as string,
      status: row.status as AgentRunState['status'],
      suspendReason: row.suspend_reason as AgentRunState['suspendReason'],
      missingRpcs: row.missing_rpcs as string[] | undefined,
      pendingApprovals,
      usage: {
        inputTokens: row.usage_input_tokens as number,
        outputTokens: row.usage_output_tokens as number,
        model: row.usage_model as string,
      },
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    }
  }

  public async close(): Promise<void> {
    if (this.ownsConnection) {
      await this.sql.end()
    }
  }
}
