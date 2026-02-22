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

      CREATE TABLE IF NOT EXISTS ${this.schemaName}.ai_message (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES ${this.schemaName}.ai_threads(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_ai_message_thread
        ON ${this.schemaName}.ai_message (thread_id, created_at);

      CREATE TABLE IF NOT EXISTS ${this.schemaName}.ai_tool_call (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES ${this.schemaName}.ai_threads(id) ON DELETE CASCADE,
        message_id TEXT NOT NULL REFERENCES ${this.schemaName}.ai_message(id) ON DELETE CASCADE,
        run_id TEXT,
        tool_name TEXT NOT NULL,
        args JSONB NOT NULL DEFAULT '{}',
        result TEXT,
        approval_status TEXT,
        approval_type TEXT,
        agent_run_id TEXT,
        display_tool_name TEXT,
        display_args JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_ai_tool_call_thread
        ON ${this.schemaName}.ai_tool_call (thread_id);
      CREATE INDEX IF NOT EXISTS idx_ai_tool_call_message
        ON ${this.schemaName}.ai_tool_call (message_id);

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
    let msgQuery: string
    let msgParams: any[]

    if (options?.cursor) {
      msgQuery = `SELECT * FROM (
                 SELECT id, role, content, created_at
                 FROM ${this.schemaName}.ai_message
                 WHERE thread_id = $1 AND created_at < (
                   SELECT created_at FROM ${this.schemaName}.ai_message WHERE id = $2
                 )
                 ORDER BY created_at DESC
                 LIMIT $3
               ) sub ORDER BY created_at ASC`
      msgParams = [threadId, options.cursor, options.lastN ?? 50]
    } else if (options?.lastN) {
      msgQuery = `SELECT * FROM (
                 SELECT id, role, content, created_at
                 FROM ${this.schemaName}.ai_message
                 WHERE thread_id = $1
                 ORDER BY created_at DESC
                 LIMIT $2
               ) sub ORDER BY created_at ASC`
      msgParams = [threadId, options.lastN]
    } else {
      msgQuery = `SELECT id, role, content, created_at
               FROM ${this.schemaName}.ai_message
               WHERE thread_id = $1
               ORDER BY created_at ASC`
      msgParams = [threadId]
    }

    const [msgResult, tcResult] = await Promise.all([
      this.sql.unsafe(msgQuery, msgParams),
      this.sql.unsafe(
        `SELECT id, message_id, tool_name, args, result
         FROM ${this.schemaName}.ai_tool_call
         WHERE thread_id = $1
         ORDER BY created_at ASC`,
        [threadId]
      ),
    ])

    const tcByMessage = new Map<string, postgres.Row[]>()
    for (const tc of tcResult) {
      const msgId = tc.message_id as string
      if (!tcByMessage.has(msgId)) tcByMessage.set(msgId, [])
      tcByMessage.get(msgId)!.push(tc)
    }

    const messages: AIMessage[] = []
    for (const row of msgResult) {
      const msg: AIMessage = {
        id: row.id as string,
        role: row.role as AIMessage['role'],
        content: row.content as string | undefined,
        createdAt: new Date(row.created_at as string),
      }

      const tcs = tcByMessage.get(msg.id)
      if (tcs?.length) {
        msg.toolCalls = tcs.map((tc) => ({
          id: tc.id as string,
          name: tc.tool_name as string,
          args: (typeof tc.args === 'string'
            ? JSON.parse(tc.args)
            : tc.args) as Record<string, unknown>,
        }))

        const completed = tcs.filter((tc) => tc.result != null)
        if (completed.length) {
          messages.push(msg)
          messages.push({
            id: `tool-results-${msg.id}`,
            role: 'tool',
            toolResults: completed.map((tc) => ({
              id: tc.id as string,
              name: tc.tool_name as string,
              result: tc.result as string,
            })),
            createdAt: msg.createdAt,
          })
          continue
        }
      }

      messages.push(msg)
    }

    return messages
  }

  async saveMessages(threadId: string, messages: AIMessage[]): Promise<void> {
    if (messages.length === 0) return

    const toolMessages = messages.filter((m) => m.role === 'tool')
    const nonToolMessages = messages.filter((m) => m.role !== 'tool')

    if (nonToolMessages.length > 0) {
      const msgValues = nonToolMessages
        .map((_, i) => {
          const base = i * 5
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`
        })
        .join(', ')

      const msgParams = nonToolMessages.flatMap((msg) => [
        msg.id,
        threadId,
        msg.role,
        msg.content ?? null,
        msg.createdAt ?? new Date(),
      ])

      await this.sql.unsafe(
        `INSERT INTO ${this.schemaName}.ai_message (id, thread_id, role, content, created_at)
         VALUES ${msgValues}`,
        msgParams
      )
    }

    const toolCalls = nonToolMessages.flatMap(
      (msg) => msg.toolCalls?.map((tc) => ({ ...tc, messageId: msg.id })) ?? []
    )
    if (toolCalls.length > 0) {
      const tcValues = toolCalls
        .map((_, i) => {
          const base = i * 5
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`
        })
        .join(', ')

      const tcParams = toolCalls.flatMap((tc) => [
        tc.id,
        threadId,
        tc.messageId,
        tc.name,
        JSON.stringify(tc.args),
      ])

      await this.sql.unsafe(
        `INSERT INTO ${this.schemaName}.ai_tool_call (id, thread_id, message_id, tool_name, args)
         VALUES ${tcValues}`,
        tcParams
      )
    }

    for (const toolMsg of toolMessages) {
      if (!toolMsg.toolResults) continue
      for (const tr of toolMsg.toolResults) {
        await this.sql.unsafe(
          `UPDATE ${this.schemaName}.ai_tool_call SET result = $1 WHERE id = $2`,
          [tr.result, tr.id]
        )
      }
    }

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
      await this.setApprovals(runId, run.pendingApprovals)
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
        `UPDATE ${this.schemaName}.ai_tool_call
         SET approval_status = NULL, run_id = NULL,
             approval_type = NULL, agent_run_id = NULL,
             display_tool_name = NULL, display_args = NULL
         WHERE run_id = $1 AND approval_status IS NOT NULL`,
        [runId]
      )
      if (updates.pendingApprovals.length) {
        await this.setApprovals(runId, updates.pendingApprovals)
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
      `SELECT id, tool_name, args, approval_type, agent_run_id, display_tool_name, display_args
       FROM ${this.schemaName}.ai_tool_call
       WHERE run_id = $1 AND approval_status = 'pending'`,
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
        `SELECT id, tool_name, args, approval_type, agent_run_id, display_tool_name, display_args
         FROM ${this.schemaName}.ai_tool_call
         WHERE run_id = $1 AND approval_status = 'pending'`,
        [row.run_id]
      )
      runs.push(this.mapRunRow(row, approvals))
    }
    return runs
  }

  private async setApprovals(
    runId: string,
    approvals: NonNullable<AgentRunState['pendingApprovals']>
  ): Promise<void> {
    for (const a of approvals) {
      if (a.type === 'agent-call') {
        await this.sql.unsafe(
          `UPDATE ${this.schemaName}.ai_tool_call
           SET approval_status = 'pending', run_id = $1,
               approval_type = 'agent-call', agent_run_id = $2,
               display_tool_name = $3, display_args = $4
           WHERE id = $5`,
          [
            runId,
            a.agentRunId,
            a.displayToolName,
            JSON.stringify(a.displayArgs),
            a.toolCallId,
          ]
        )
      } else {
        await this.sql.unsafe(
          `UPDATE ${this.schemaName}.ai_tool_call
           SET approval_status = 'pending', run_id = $1,
               approval_type = 'tool-call'
           WHERE id = $2`,
          [runId, a.toolCallId]
        )
      }
    }
  }

  private mapRunRow(row: any, approvalRows?: any[]): AgentRunState {
    const pendingApprovals = approvalRows?.length
      ? approvalRows.map((a: any) => {
          if (a.approval_type === 'agent-call') {
            return {
              type: 'agent-call' as const,
              toolCallId: a.id as string,
              agentName: a.tool_name as string,
              agentRunId: a.agent_run_id as string,
              displayToolName: a.display_tool_name as string,
              displayArgs: a.display_args as unknown,
            }
          }
          return {
            type: 'tool-call' as const,
            toolCallId: a.id as string,
            toolName: a.tool_name as string,
            args: a.args as unknown,
          }
        })
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

  async findRunByToolCallId(toolCallId: string): Promise<{
    run: AgentRunState
    approval: NonNullable<AgentRunState['pendingApprovals']>[number]
  } | null> {
    const tcResult = await this.sql.unsafe(
      `SELECT tc.id, tc.tool_name, tc.args, tc.run_id,
              tc.approval_type, tc.agent_run_id, tc.display_tool_name, tc.display_args
       FROM ${this.schemaName}.ai_tool_call tc
       WHERE tc.id = $1 AND tc.approval_status = 'pending'`,
      [toolCallId]
    )
    if (tcResult.length === 0) return null

    const tc = tcResult[0]!
    const run = await this.getRun(tc.run_id as string)
    if (!run) return null

    let approval: NonNullable<AgentRunState['pendingApprovals']>[number]
    if (tc.approval_type === 'agent-call') {
      approval = {
        type: 'agent-call',
        toolCallId: tc.id as string,
        agentName: tc.tool_name as string,
        agentRunId: tc.agent_run_id as string,
        displayToolName: tc.display_tool_name as string,
        displayArgs: tc.display_args as unknown,
      }
    } else {
      approval = {
        type: 'tool-call',
        toolCallId: tc.id as string,
        toolName: tc.tool_name as string,
        args: tc.args as unknown,
      }
    }

    return { run, approval }
  }

  async resolveApproval(
    toolCallId: string,
    status: 'approved' | 'denied'
  ): Promise<void> {
    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.ai_tool_call SET approval_status = $1 WHERE id = $2`,
      [status, toolCallId]
    )
  }

  public async close(): Promise<void> {
    if (this.ownsConnection) {
      await this.sql.end()
    }
  }
}
