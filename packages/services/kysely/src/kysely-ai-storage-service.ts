import type {
  AIStorageService,
  AIRunStateService,
  CreateRunInput,
} from '@pikku/core/services'
import type { AIThread, AIMessage, AgentRunState } from '@pikku/core/ai-agent'
import { Kysely, sql } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { parseJson } from './kysely-json.js'

export class KyselyAIStorageService
  implements AIStorageService, AIRunStateService
{
  private initialized = false

  constructor(private db: Kysely<KyselyPikkuDB>) {}

  public async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.db.schema
      .createTable('ai_threads')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('resource_id', 'text', (col) => col.notNull())
      .addColumn('title', 'text')
      .addColumn('metadata', 'text')
      .addColumn('created_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .addColumn('updated_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .execute()

    await this.db.schema
      .createIndex('idx_ai_threads_resource')
      .ifNotExists()
      .on('ai_threads')
      .column('resource_id')
      .execute()

    await this.db.schema
      .createTable('ai_message')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('thread_id', 'text', (col) =>
        col.notNull().references('ai_threads.id').onDelete('cascade')
      )
      .addColumn('role', 'text', (col) => col.notNull())
      .addColumn('content', 'text')
      .addColumn('created_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .execute()

    await this.db.schema
      .createIndex('idx_ai_message_thread')
      .ifNotExists()
      .on('ai_message')
      .columns(['thread_id', 'created_at'])
      .execute()

    await this.db.schema
      .createTable('ai_tool_call')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('thread_id', 'text', (col) =>
        col.notNull().references('ai_threads.id').onDelete('cascade')
      )
      .addColumn('message_id', 'text', (col) =>
        col.notNull().references('ai_message.id').onDelete('cascade')
      )
      .addColumn('run_id', 'text')
      .addColumn('tool_name', 'text', (col) => col.notNull())
      .addColumn('args', 'text', (col) => col.notNull().defaultTo('{}'))
      .addColumn('result', 'text')
      .addColumn('approval_status', 'text')
      .addColumn('created_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .execute()

    await this.db.schema
      .createIndex('idx_ai_tool_call_thread')
      .ifNotExists()
      .on('ai_tool_call')
      .column('thread_id')
      .execute()

    await this.db.schema
      .createIndex('idx_ai_tool_call_message')
      .ifNotExists()
      .on('ai_tool_call')
      .column('message_id')
      .execute()

    await this.db.schema
      .createTable('ai_working_memory')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.notNull())
      .addColumn('scope', 'text', (col) => col.notNull())
      .addColumn('data', 'text', (col) => col.notNull())
      .addColumn('updated_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .addPrimaryKeyConstraint('ai_working_memory_pk', ['id', 'scope'])
      .execute()

    await this.db.schema
      .createTable('ai_run')
      .ifNotExists()
      .addColumn('run_id', 'text', (col) => col.primaryKey())
      .addColumn('agent_name', 'text', (col) => col.notNull())
      .addColumn('thread_id', 'text', (col) =>
        col.notNull().references('ai_threads.id').onDelete('cascade')
      )
      .addColumn('resource_id', 'text', (col) => col.notNull())
      .addColumn('status', 'text', (col) => col.notNull().defaultTo('running'))
      .addColumn('suspend_reason', 'text')
      .addColumn('missing_rpcs', 'text')
      .addColumn('usage_input_tokens', 'integer', (col) =>
        col.notNull().defaultTo(0)
      )
      .addColumn('usage_output_tokens', 'integer', (col) =>
        col.notNull().defaultTo(0)
      )
      .addColumn('usage_model', 'text', (col) => col.notNull().defaultTo(''))
      .addColumn('created_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .addColumn('updated_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .execute()

    await this.db.schema
      .createIndex('idx_ai_run_thread')
      .ifNotExists()
      .on('ai_run')
      .columns(['thread_id', 'created_at'])
      .execute()

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

    await this.db
      .insertInto('ai_threads')
      .values({
        id,
        resource_id: resourceId,
        title: options?.title ?? null,
        metadata: JSON.stringify(options?.metadata ?? null),
        created_at: now,
        updated_at: now,
      })
      .execute()

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
    const row = await this.db
      .selectFrom('ai_threads')
      .select([
        'id',
        'resource_id',
        'title',
        'metadata',
        'created_at',
        'updated_at',
      ])
      .where('id', '=', threadId)
      .executeTakeFirst()

    if (!row) {
      throw new Error(`Thread not found: ${threadId}`)
    }

    return {
      id: row.id,
      resourceId: row.resource_id,
      title: row.title ?? undefined,
      metadata: parseJson(row.metadata),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }

  async getThreads(resourceId: string): Promise<AIThread[]> {
    const result = await this.db
      .selectFrom('ai_threads')
      .select([
        'id',
        'resource_id',
        'title',
        'metadata',
        'created_at',
        'updated_at',
      ])
      .where('resource_id', '=', resourceId)
      .orderBy('updated_at', 'desc')
      .execute()

    return result.map((row) => ({
      id: row.id,
      resourceId: row.resource_id,
      title: row.title ?? undefined,
      metadata: parseJson(row.metadata),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }))
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.db.deleteFrom('ai_threads').where('id', '=', threadId).execute()
  }

  async getMessages(
    threadId: string,
    options?: { lastN?: number; cursor?: string }
  ): Promise<AIMessage[]> {
    let msgQuery = this.db
      .selectFrom('ai_message')
      .select(['id', 'role', 'content', 'created_at'])
      .where('thread_id', '=', threadId)

    if (options?.cursor) {
      const cursorRow = await this.db
        .selectFrom('ai_message')
        .select('created_at')
        .where('id', '=', options.cursor)
        .executeTakeFirst()

      if (cursorRow) {
        msgQuery = msgQuery.where('created_at', '<', cursorRow.created_at)
      }
    }

    if (options?.cursor || options?.lastN) {
      const innerResult = await msgQuery
        .orderBy('created_at', 'desc')
        .limit(options?.lastN ?? 50)
        .execute()
      innerResult.reverse()
      var msgResult = innerResult
    } else {
      var msgResult = await msgQuery.orderBy('created_at', 'asc').execute()
    }

    const tcResult = await this.db
      .selectFrom('ai_tool_call')
      .select(['id', 'message_id', 'tool_name', 'args', 'result'])
      .where('thread_id', '=', threadId)
      .orderBy('created_at', 'asc')
      .execute()

    const tcByMessage = new Map<string, (typeof tcResult)[number][]>()
    for (const tc of tcResult) {
      const msgId = tc.message_id
      if (!tcByMessage.has(msgId)) tcByMessage.set(msgId, [])
      tcByMessage.get(msgId)!.push(tc)
    }

    const messages: AIMessage[] = []
    for (const row of msgResult) {
      const msg: AIMessage = {
        id: row.id,
        role: row.role as AIMessage['role'],
        content: row.content ?? undefined,
        createdAt: new Date(row.created_at),
      }

      const tcs = tcByMessage.get(msg.id)
      if (tcs?.length) {
        msg.toolCalls = tcs.map((tc) => ({
          id: tc.id,
          name: tc.tool_name,
          args: parseJson(tc.args) as Record<string, unknown>,
        }))

        const completed = tcs.filter((tc) => tc.result != null)
        if (completed.length) {
          messages.push(msg)
          messages.push({
            id: `tool-results-${msg.id}`,
            role: 'tool',
            toolResults: completed.map((tc) => ({
              id: tc.id,
              name: tc.tool_name,
              result: tc.result!,
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
      await this.db
        .insertInto('ai_message')
        .values(
          nonToolMessages.map((msg) => ({
            id: msg.id,
            thread_id: threadId,
            role: msg.role,
            content: msg.content ?? null,
            created_at: msg.createdAt ?? new Date(),
          }))
        )
        .execute()
    }

    const toolCalls = nonToolMessages.flatMap(
      (msg) => msg.toolCalls?.map((tc) => ({ ...tc, messageId: msg.id })) ?? []
    )
    if (toolCalls.length > 0) {
      await this.db
        .insertInto('ai_tool_call')
        .values(
          toolCalls.map((tc) => ({
            id: tc.id,
            thread_id: threadId,
            message_id: tc.messageId,
            tool_name: tc.name,
            args: JSON.stringify(tc.args),
          }))
        )
        .execute()
    }

    for (const toolMsg of toolMessages) {
      if (!toolMsg.toolResults) continue
      for (const tr of toolMsg.toolResults) {
        await this.db
          .updateTable('ai_tool_call')
          .set({ result: tr.result })
          .where('id', '=', tr.id)
          .execute()
      }
    }

    await this.db
      .updateTable('ai_threads')
      .set({ updated_at: new Date() })
      .where('id', '=', threadId)
      .execute()
  }

  async getWorkingMemory(
    id: string,
    scope: 'resource' | 'thread'
  ): Promise<Record<string, unknown> | null> {
    const row = await this.db
      .selectFrom('ai_working_memory')
      .select('data')
      .where('id', '=', id)
      .where('scope', '=', scope)
      .executeTakeFirst()

    if (!row) return null
    return parseJson(row.data)
  }

  async saveWorkingMemory(
    id: string,
    scope: 'resource' | 'thread',
    data: Record<string, unknown>
  ): Promise<void> {
    await this.db
      .insertInto('ai_working_memory')
      .values({
        id,
        scope,
        data: JSON.stringify(data),
        updated_at: new Date(),
      })
      .onConflict((oc) =>
        oc.columns(['id', 'scope']).doUpdateSet({
          data: JSON.stringify(data),
          updated_at: new Date(),
        })
      )
      .execute()
  }

  async createRun(run: CreateRunInput): Promise<string> {
    const runId = crypto.randomUUID()

    await this.db
      .insertInto('ai_run')
      .values({
        run_id: runId,
        agent_name: run.agentName,
        thread_id: run.threadId,
        resource_id: run.resourceId,
        status: run.status,
        suspend_reason: run.suspendReason ?? null,
        missing_rpcs: run.missingRpcs ? JSON.stringify(run.missingRpcs) : null,
        usage_input_tokens: run.usage.inputTokens,
        usage_output_tokens: run.usage.outputTokens,
        usage_model: run.usage.model,
        created_at: run.createdAt,
        updated_at: run.updatedAt,
      })
      .execute()

    if (run.pendingApprovals?.length) {
      await this.setApprovals(runId, run.pendingApprovals)
    }

    return runId
  }

  async updateRun(
    runId: string,
    updates: Partial<AgentRunState>
  ): Promise<void> {
    const setValues: Record<string, any> = { updated_at: new Date() }

    if (updates.status !== undefined) {
      setValues.status = updates.status
    }
    if (updates.suspendReason !== undefined) {
      setValues.suspend_reason = updates.suspendReason
    }
    if (updates.missingRpcs !== undefined) {
      setValues.missing_rpcs = JSON.stringify(updates.missingRpcs)
    }
    if (updates.usage !== undefined) {
      setValues.usage_input_tokens = updates.usage.inputTokens
      setValues.usage_output_tokens = updates.usage.outputTokens
      setValues.usage_model = updates.usage.model
    }

    await this.db
      .updateTable('ai_run')
      .set(setValues)
      .where('run_id', '=', runId)
      .execute()

    if (updates.pendingApprovals !== undefined) {
      await this.db
        .updateTable('ai_tool_call')
        .set({ approval_status: null, run_id: null })
        .where('run_id', '=', runId)
        .where('approval_status', 'is not', null)
        .execute()

      if (updates.pendingApprovals.length) {
        await this.setApprovals(runId, updates.pendingApprovals)
      }
    }
  }

  async getRun(runId: string): Promise<AgentRunState | null> {
    const row = await this.db
      .selectFrom('ai_run')
      .select([
        'run_id',
        'agent_name',
        'thread_id',
        'resource_id',
        'status',
        'suspend_reason',
        'missing_rpcs',
        'usage_input_tokens',
        'usage_output_tokens',
        'usage_model',
        'created_at',
        'updated_at',
      ])
      .where('run_id', '=', runId)
      .executeTakeFirst()

    if (!row) return null

    const approvals = await this.db
      .selectFrom('ai_tool_call')
      .select(['id', 'tool_name', 'args'])
      .where('run_id', '=', runId)
      .where('approval_status', '=', 'pending')
      .execute()

    return this.mapRunRow(row, approvals)
  }

  async getRunsByThread(threadId: string): Promise<AgentRunState[]> {
    const result = await this.db
      .selectFrom('ai_run')
      .select([
        'run_id',
        'agent_name',
        'thread_id',
        'resource_id',
        'status',
        'suspend_reason',
        'missing_rpcs',
        'usage_input_tokens',
        'usage_output_tokens',
        'usage_model',
        'created_at',
        'updated_at',
      ])
      .where('thread_id', '=', threadId)
      .orderBy('created_at', 'desc')
      .execute()

    const runs: AgentRunState[] = []
    for (const row of result) {
      const approvals = await this.db
        .selectFrom('ai_tool_call')
        .select(['id', 'tool_name', 'args'])
        .where('run_id', '=', row.run_id)
        .where('approval_status', '=', 'pending')
        .execute()
      runs.push(this.mapRunRow(row, approvals))
    }
    return runs
  }

  private async setApprovals(
    runId: string,
    approvals: NonNullable<AgentRunState['pendingApprovals']>
  ): Promise<void> {
    const ids = approvals.map((a) => a.toolCallId)
    if (ids.length === 0) return

    await this.db
      .updateTable('ai_tool_call')
      .set({ approval_status: 'pending', run_id: runId })
      .where('id', 'in', ids)
      .execute()
  }

  private mapRunRow(row: any, approvalRows?: any[]): AgentRunState {
    const pendingApprovals = approvalRows?.length
      ? approvalRows.map((a: any) => ({
          toolCallId: a.id as string,
          toolName: a.tool_name as string,
          args: parseJson(a.args) as unknown,
        }))
      : undefined

    return {
      runId: row.run_id as string,
      agentName: row.agent_name as string,
      threadId: row.thread_id as string,
      resourceId: row.resource_id as string,
      status: row.status as AgentRunState['status'],
      suspendReason: row.suspend_reason as AgentRunState['suspendReason'],
      missingRpcs: parseJson(row.missing_rpcs),
      pendingApprovals,
      usage: {
        inputTokens: Number(row.usage_input_tokens),
        outputTokens: Number(row.usage_output_tokens),
        model: row.usage_model as string,
      },
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    }
  }

  async resolveApproval(
    toolCallId: string,
    status: 'approved' | 'denied'
  ): Promise<void> {
    await this.db
      .updateTable('ai_tool_call')
      .set({ approval_status: status })
      .where('id', '=', toolCallId)
      .execute()
  }

  public async close(): Promise<void> {}
}
