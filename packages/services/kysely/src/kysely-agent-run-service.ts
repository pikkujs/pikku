import type {
  AIThread,
  AIMessage,
  AgentRunRow,
  AgentRunService,
} from '@pikku/core/ai-agent'
import { Kysely } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { parseJson } from './kysely-json.js'

export class KyselyAgentRunService implements AgentRunService {
  constructor(private db: Kysely<KyselyPikkuDB>) {}

  async listThreads(options?: {
    agentName?: string
    limit?: number
    offset?: number
  }): Promise<AIThread[]> {
    const { agentName, limit = 50, offset = 0 } = options ?? {}

    let query = this.db
      .selectFrom('ai_threads as t')
      .select([
        't.id',
        't.resource_id',
        't.title',
        't.metadata',
        't.created_at',
        't.updated_at',
      ])

    if (agentName) {
      query = query.where(
        't.id',
        'in',
        this.db
          .selectFrom('ai_run')
          .select('thread_id')
          .where('agent_name', '=', agentName)
          .distinct()
      )
    }

    const result = await query
      .orderBy('t.updated_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()

    return result.map((row) => this.mapThreadRow(row))
  }

  async getThread(threadId: string): Promise<AIThread | null> {
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

    if (!row) return null
    return this.mapThreadRow(row)
  }

  async getThreadMessages(threadId: string): Promise<AIMessage[]> {
    const [msgResult, tcResult] = await Promise.all([
      this.db
        .selectFrom('ai_message')
        .select(['id', 'role', 'content', 'created_at'])
        .where('thread_id', '=', threadId)
        .orderBy('created_at', 'asc')
        .execute(),
      this.db
        .selectFrom('ai_tool_call')
        .select(['id', 'message_id', 'tool_name', 'args', 'result'])
        .where('thread_id', '=', threadId)
        .orderBy('created_at', 'asc')
        .execute(),
    ])

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
        createdAt: new Date(row.created_at as unknown as string),
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

  async getThreadRuns(threadId: string): Promise<AgentRunRow[]> {
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

    return result.map((row) => this.mapRunRow(row))
  }

  async deleteThread(threadId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('ai_threads')
      .where('id', '=', threadId)
      .executeTakeFirst()

    return BigInt(result.numDeletedRows) > 0n
  }

  async getDistinctAgentNames(): Promise<string[]> {
    const result = await this.db
      .selectFrom('ai_run')
      .select('agent_name')
      .distinct()
      .orderBy('agent_name')
      .execute()

    return result.map((row) => row.agent_name)
  }

  private mapThreadRow(row: any): AIThread {
    return {
      id: row.id as string,
      resourceId: row.resource_id as string,
      title: (row.title as string) ?? undefined,
      metadata: parseJson(row.metadata),
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    }
  }

  private mapRunRow(row: any): AgentRunRow {
    return {
      runId: row.run_id as string,
      agentName: row.agent_name as string,
      threadId: row.thread_id as string,
      resourceId: row.resource_id as string,
      status: row.status as string,
      suspendReason: (row.suspend_reason as string) ?? undefined,
      missingRpcs: parseJson(row.missing_rpcs),
      usageInputTokens: Number(row.usage_input_tokens),
      usageOutputTokens: Number(row.usage_output_tokens),
      usageModel: row.usage_model as string,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    }
  }
}
