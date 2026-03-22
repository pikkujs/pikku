import type {
  AIStorageService,
  AIRunStateService,
  CreateRunInput,
} from '@pikku/core/services'
import type { AIThread, AIMessage, AgentRunState } from '@pikku/core/ai-agent'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { parseJson } from './kysely-json.js'

export class KyselyAIStorageService
  implements AIStorageService, AIRunStateService
{
  private initialized = false

  constructor(private db: Kysely<KyselyPikkuDB>) {}

  private async createIndexSafe(builder: {
    execute(): Promise<void>
  }): Promise<void> {
    try {
      await builder.execute()
    } catch (e: any) {
      // Ignore "index already exists" errors across databases
      // MySQL: ER_DUP_KEYNAME, Postgres: 42P07, SQLite: "already exists"
      if (e?.code === 'ER_DUP_KEYNAME' || e?.errno === 1061) return
      if (e?.code === '42P07') return
      if (e?.message?.includes('already exists')) return
      throw e
    }
  }

  public async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.db.schema
      .createTable('ai_threads')
      .ifNotExists()
      .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
      .addColumn('resource_id', 'varchar(255)', (col) => col.notNull())
      .addColumn('title', 'text')
      .addColumn('metadata', 'text')
      .addColumn('created_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .addColumn('updated_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .execute()

    await this.createIndexSafe(
      this.db.schema
        .createIndex('idx_ai_threads_resource')
        .on('ai_threads')
        .column('resource_id')
    )

    await this.db.schema
      .createTable('ai_message')
      .ifNotExists()
      .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
      .addColumn('thread_id', 'varchar(36)', (col) =>
        col.notNull().references('ai_threads.id').onDelete('cascade')
      )
      .addColumn('role', 'varchar(50)', (col) => col.notNull())
      .addColumn('content', 'text')
      .addColumn('created_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .execute()

    await this.createIndexSafe(
      this.db.schema
        .createIndex('idx_ai_message_thread')
        .on('ai_message')
        .columns(['thread_id', 'created_at'])
    )

    await this.db.schema
      .createTable('ai_tool_call')
      .ifNotExists()
      .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
      .addColumn('thread_id', 'varchar(36)', (col) =>
        col.notNull().references('ai_threads.id').onDelete('cascade')
      )
      .addColumn('message_id', 'varchar(36)', (col) =>
        col.notNull().references('ai_message.id').onDelete('cascade')
      )
      .addColumn('run_id', 'varchar(36)')
      .addColumn('tool_name', 'varchar(255)', (col) => col.notNull())
      .addColumn('args', 'text', (col) => col.notNull())
      .addColumn('result', 'text')
      .addColumn('approval_status', 'varchar(50)')
      .addColumn('approval_type', 'varchar(50)')
      .addColumn('agent_run_id', 'varchar(36)')
      .addColumn('display_tool_name', 'varchar(255)')
      .addColumn('display_args', 'text')
      .addColumn('created_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .execute()

    await this.createIndexSafe(
      this.db.schema
        .createIndex('idx_ai_tool_call_thread')
        .on('ai_tool_call')
        .column('thread_id')
    )

    await this.createIndexSafe(
      this.db.schema
        .createIndex('idx_ai_tool_call_message')
        .on('ai_tool_call')
        .column('message_id')
    )

    await this.db.schema
      .createTable('ai_working_memory')
      .ifNotExists()
      .addColumn('id', 'varchar(255)', (col) => col.notNull())
      .addColumn('scope', 'varchar(50)', (col) => col.notNull())
      .addColumn('data', 'text', (col) => col.notNull())
      .addColumn('updated_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .addPrimaryKeyConstraint('ai_working_memory_pk', ['id', 'scope'])
      .execute()

    await this.db.schema
      .createTable('ai_run')
      .ifNotExists()
      .addColumn('run_id', 'varchar(36)', (col) => col.primaryKey())
      .addColumn('agent_name', 'varchar(255)', (col) => col.notNull())
      .addColumn('thread_id', 'varchar(36)', (col) =>
        col.notNull().references('ai_threads.id').onDelete('cascade')
      )
      .addColumn('resource_id', 'varchar(255)', (col) => col.notNull())
      .addColumn('status', 'varchar(50)', (col) =>
        col.notNull().defaultTo('running')
      )
      .addColumn('error_message', 'text')
      .addColumn('suspend_reason', 'text')
      .addColumn('missing_rpcs', 'text')
      .addColumn('usage_input_tokens', 'integer', (col) =>
        col.notNull().defaultTo(0)
      )
      .addColumn('usage_output_tokens', 'integer', (col) =>
        col.notNull().defaultTo(0)
      )
      .addColumn('usage_model', 'varchar(255)', (col) =>
        col.notNull().defaultTo('')
      )
      .addColumn('created_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .addColumn('updated_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .execute()

    await this.createIndexSafe(
      this.db.schema
        .createIndex('idx_ai_run_thread')
        .on('ai_run')
        .columns(['thread_id', 'created_at'])
    )

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
      .insertInto('aiThreads')
      .values({
        id,
        resourceId: resourceId,
        title: options?.title ?? null,
        metadata: JSON.stringify(options?.metadata ?? null),
        createdAt: now,
        updatedAt: now,
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
      .selectFrom('aiThreads')
      .select([
        'id',
        'resourceId',
        'title',
        'metadata',
        'createdAt',
        'updatedAt',
      ])
      .where('id', '=', threadId)
      .executeTakeFirst()

    if (!row) {
      throw new Error(`Thread not found: ${threadId}`)
    }

    return {
      id: row.id,
      resourceId: row.resourceId,
      title: row.title ?? undefined,
      metadata: parseJson(row.metadata),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }
  }

  async getThreads(resourceId: string): Promise<AIThread[]> {
    const result = await this.db
      .selectFrom('aiThreads')
      .select([
        'id',
        'resourceId',
        'title',
        'metadata',
        'createdAt',
        'updatedAt',
      ])
      .where('resourceId', '=', resourceId)
      .orderBy('updatedAt', 'desc')
      .execute()

    return result.map((row) => ({
      id: row.id,
      resourceId: row.resourceId,
      title: row.title ?? undefined,
      metadata: parseJson(row.metadata),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }))
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.db.deleteFrom('aiThreads').where('id', '=', threadId).execute()
  }

  async getMessages(
    threadId: string,
    options?: { lastN?: number; cursor?: string }
  ): Promise<AIMessage[]> {
    let msgQuery = this.db
      .selectFrom('aiMessage')
      .select(['id', 'role', 'content', 'createdAt'])
      .where('threadId', '=', threadId)

    if (options?.cursor) {
      const cursorRow = await this.db
        .selectFrom('aiMessage')
        .select('createdAt')
        .where('id', '=', options.cursor)
        .executeTakeFirst()

      if (cursorRow) {
        msgQuery = msgQuery.where('createdAt', '<', cursorRow.createdAt)
      }
    }

    let msgResult
    if (options?.cursor || options?.lastN) {
      const innerResult = await msgQuery
        .orderBy('createdAt', 'desc')
        .limit(options?.lastN ?? 50)
        .execute()
      innerResult.reverse()
      msgResult = innerResult
    } else {
      msgResult = await msgQuery.orderBy('createdAt', 'asc').execute()
    }

    const tcResult = await this.db
      .selectFrom('aiToolCall')
      .select(['id', 'messageId', 'toolName', 'args', 'result'])
      .where('threadId', '=', threadId)
      .orderBy('createdAt', 'asc')
      .execute()

    const tcByMessage = new Map<string, (typeof tcResult)[number][]>()
    for (const tc of tcResult) {
      const msgId = tc.messageId
      if (!tcByMessage.has(msgId)) tcByMessage.set(msgId, [])
      tcByMessage.get(msgId)!.push(tc)
    }

    const messages: AIMessage[] = []
    for (const row of msgResult) {
      const rawContent = row.content as string | undefined
      let parsedContent: AIMessage['content'] = rawContent ?? undefined
      if (rawContent) {
        try {
          const parsed = JSON.parse(rawContent)
          if (Array.isArray(parsed)) {
            parsedContent = parsed
          } else if (typeof parsed === 'string') {
            parsedContent = parsed
          }
        } catch {
          // Not JSON, use raw string
        }
      }
      const msg: AIMessage = {
        id: row.id,
        role: row.role as AIMessage['role'],
        content: parsedContent,
        createdAt: new Date(row.createdAt),
      }

      const tcs = tcByMessage.get(msg.id)
      if (tcs?.length) {
        msg.toolCalls = tcs.map((tc) => ({
          id: tc.id,
          name: tc.toolName,
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
              name: tc.toolName,
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
        .insertInto('aiMessage')
        .values(
          nonToolMessages.map((msg) => ({
            id: msg.id,
            threadId: threadId,
            role: msg.role,
            content: msg.content != null ? JSON.stringify(msg.content) : null,
            createdAt: msg.createdAt ?? new Date(),
          }))
        )
        .execute()
    }

    const toolCalls = nonToolMessages.flatMap(
      (msg) => msg.toolCalls?.map((tc) => ({ ...tc, messageId: msg.id })) ?? []
    )
    if (toolCalls.length > 0) {
      await this.db
        .insertInto('aiToolCall')
        .values(
          toolCalls.map((tc) => ({
            id: tc.id,
            threadId: threadId,
            messageId: tc.messageId,
            toolName: tc.name,
            args: JSON.stringify(tc.args),
          }))
        )
        .execute()
    }

    for (const toolMsg of toolMessages) {
      if (!toolMsg.toolResults) continue
      for (const tr of toolMsg.toolResults) {
        await this.db
          .updateTable('aiToolCall')
          .set({ result: tr.result })
          .where('id', '=', tr.id)
          .execute()
      }
    }

    await this.db
      .updateTable('aiThreads')
      .set({ updatedAt: new Date() })
      .where('id', '=', threadId)
      .execute()
  }

  async getWorkingMemory(
    id: string,
    scope: 'resource' | 'thread'
  ): Promise<Record<string, unknown> | null> {
    const row = await this.db
      .selectFrom('aiWorkingMemory')
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
      .insertInto('aiWorkingMemory')
      .values({
        id,
        scope,
        data: JSON.stringify(data),
        updatedAt: new Date(),
      })
      .onConflict((oc) =>
        oc.columns(['id', 'scope']).doUpdateSet({
          data: JSON.stringify(data),
          updatedAt: new Date(),
        })
      )
      .execute()
  }

  async createRun(run: CreateRunInput): Promise<string> {
    const runId = crypto.randomUUID()

    await this.db
      .insertInto('aiRun')
      .values({
        runId: runId,
        agentName: run.agentName,
        threadId: run.threadId,
        resourceId: run.resourceId,
        status: run.status,
        errorMessage: run.errorMessage ?? null,
        suspendReason: run.suspendReason ?? null,
        missingRpcs: run.missingRpcs ? JSON.stringify(run.missingRpcs) : null,
        usageInputTokens: run.usage.inputTokens,
        usageOutputTokens: run.usage.outputTokens,
        usageModel: run.usage.model,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
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
    const setValues: Record<string, unknown> = { updatedAt: new Date() }

    if (updates.status !== undefined) {
      setValues.status = updates.status
    }
    if (updates.errorMessage !== undefined) {
      setValues.errorMessage = updates.errorMessage
    }
    if (updates.suspendReason !== undefined) {
      setValues.suspendReason = updates.suspendReason
    }
    if (updates.missingRpcs !== undefined) {
      setValues.missingRpcs = JSON.stringify(updates.missingRpcs)
    }
    if (updates.usage !== undefined) {
      setValues.usageInputTokens = updates.usage.inputTokens
      setValues.usageOutputTokens = updates.usage.outputTokens
      setValues.usageModel = updates.usage.model
    }

    await this.db
      .updateTable('aiRun')
      .set(setValues)
      .where('runId', '=', runId)
      .execute()

    if (updates.pendingApprovals !== undefined) {
      await this.db
        .updateTable('aiToolCall')
        .set({
          approvalStatus: null,
          runId: null,
          approvalType: null,
          agentRunId: null,
          displayToolName: null,
          displayArgs: null,
        })
        .where('runId', '=', runId)
        .where('approvalStatus', 'is not', null)
        .execute()

      if (updates.pendingApprovals.length) {
        await this.setApprovals(runId, updates.pendingApprovals)
      }
    }
  }

  async getRun(runId: string): Promise<AgentRunState | null> {
    const row = await this.db
      .selectFrom('aiRun')
      .select([
        'runId',
        'agentName',
        'threadId',
        'resourceId',
        'status',
        'errorMessage',
        'suspendReason',
        'missingRpcs',
        'usageInputTokens',
        'usageOutputTokens',
        'usageModel',
        'createdAt',
        'updatedAt',
      ])
      .where('runId', '=', runId)
      .executeTakeFirst()

    if (!row) return null

    const approvals = await this.db
      .selectFrom('aiToolCall')
      .select([
        'id',
        'toolName',
        'args',
        'approvalType',
        'agentRunId',
        'displayToolName',
        'displayArgs',
      ])
      .where('runId', '=', runId)
      .where('approvalStatus', '=', 'pending')
      .execute()

    return this.mapRunRow(row, approvals)
  }

  async getRunsByThread(threadId: string): Promise<AgentRunState[]> {
    const result = await this.db
      .selectFrom('aiRun')
      .select([
        'runId',
        'agentName',
        'threadId',
        'resourceId',
        'status',
        'errorMessage',
        'suspendReason',
        'missingRpcs',
        'usageInputTokens',
        'usageOutputTokens',
        'usageModel',
        'createdAt',
        'updatedAt',
      ])
      .where('threadId', '=', threadId)
      .orderBy('createdAt', 'desc')
      .execute()

    const runs: AgentRunState[] = []
    for (const row of result) {
      const approvals = await this.db
        .selectFrom('aiToolCall')
        .select([
          'id',
          'toolName',
          'args',
          'approvalType',
          'agentRunId',
          'displayToolName',
          'displayArgs',
        ])
        .where('runId', '=', row.runId)
        .where('approvalStatus', '=', 'pending')
        .execute()
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
        await this.db
          .updateTable('aiToolCall')
          .set({
            approvalStatus: 'pending',
            runId: runId,
            approvalType: 'agent-call',
            agentRunId: a.agentRunId,
            displayToolName: a.displayToolName,
            displayArgs: JSON.stringify(a.displayArgs),
          })
          .where('id', '=', a.toolCallId)
          .execute()
      } else {
        await this.db
          .updateTable('aiToolCall')
          .set({
            approvalStatus: 'pending',
            runId: runId,
            approvalType: 'tool-call',
          })
          .where('id', '=', a.toolCallId)
          .execute()
      }
    }
  }

  private mapRunRow(row: any, approvalRows?: any[]): AgentRunState {
    const pendingApprovals = approvalRows?.length
      ? approvalRows.map((a: any) => {
          if (a.approvalType === 'agent-call') {
            return {
              type: 'agent-call' as const,
              toolCallId: a.id as string,
              agentName: a.toolName as string,
              agentRunId: a.agentRunId as string,
              displayToolName: a.displayToolName as string,
              displayArgs: parseJson(a.displayArgs) as unknown,
            }
          }
          return {
            type: 'tool-call' as const,
            toolCallId: a.id as string,
            toolName: a.toolName as string,
            args: parseJson(a.args) as unknown,
          }
        })
      : undefined

    return {
      runId: row.runId as string,
      agentName: row.agentName as string,
      threadId: row.threadId as string,
      resourceId: row.resourceId as string,
      status: row.status as AgentRunState['status'],
      errorMessage: row.errorMessage ?? undefined,
      suspendReason: row.suspendReason as AgentRunState['suspendReason'],
      missingRpcs: parseJson(row.missingRpcs),
      pendingApprovals,
      usage: {
        inputTokens: Number(row.usageInputTokens),
        outputTokens: Number(row.usageOutputTokens),
        model: row.usageModel as string,
      },
      createdAt: new Date(row.createdAt as string),
      updatedAt: new Date(row.updatedAt as string),
    }
  }

  async findRunByToolCallId(toolCallId: string): Promise<{
    run: AgentRunState
    approval: NonNullable<AgentRunState['pendingApprovals']>[number]
  } | null> {
    const tc = await this.db
      .selectFrom('aiToolCall')
      .select([
        'id',
        'toolName',
        'args',
        'runId',
        'approvalType',
        'agentRunId',
        'displayToolName',
        'displayArgs',
      ])
      .where('id', '=', toolCallId)
      .where('approvalStatus', '=', 'pending')
      .executeTakeFirst()

    if (!tc || !tc.runId) return null

    const run = await this.getRun(tc.runId)
    if (!run) return null

    let approval: NonNullable<AgentRunState['pendingApprovals']>[number]
    if (tc.approvalType === 'agent-call') {
      approval = {
        type: 'agent-call',
        toolCallId: tc.id,
        agentName: tc.toolName,
        agentRunId: tc.agentRunId!,
        displayToolName: tc.displayToolName!,
        displayArgs: parseJson(tc.displayArgs) as unknown,
      }
    } else {
      approval = {
        type: 'tool-call',
        toolCallId: tc.id,
        toolName: tc.toolName,
        args: parseJson(tc.args) as unknown,
      }
    }

    return { run, approval }
  }

  async resolveApproval(
    toolCallId: string,
    status: 'approved' | 'denied'
  ): Promise<void> {
    await this.db
      .updateTable('aiToolCall')
      .set({ approvalStatus: status })
      .where('id', '=', toolCallId)
      .execute()
  }

  public async close(): Promise<void> {}
}
