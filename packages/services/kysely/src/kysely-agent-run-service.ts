import type {
  AIThread,
  AIMessage,
  AgentRunRow,
  AgentRunService,
} from '@pikku/core/ai-agent'
import type { Kysely } from 'kysely'
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
      .selectFrom('aiThreads as t')
      .select([
        't.id',
        't.resourceId',
        't.title',
        't.metadata',
        't.createdAt',
        't.updatedAt',
      ])

    if (agentName) {
      query = query.where(
        't.id',
        'in',
        this.db
          .selectFrom('aiRun')
          .select('threadId')
          .where('agentName', '=', agentName)
          .distinct()
      )
    }

    const result = await query
      .orderBy('t.updatedAt', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()

    return result.map((row) => this.mapThreadRow(row))
  }

  async getThread(threadId: string): Promise<AIThread | null> {
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

    if (!row) return null
    return this.mapThreadRow(row)
  }

  async getThreadMessages(threadId: string): Promise<AIMessage[]> {
    const [msgResult, tcResult] = await Promise.all([
      this.db
        .selectFrom('aiMessage')
        .select(['id', 'role', 'content', 'createdAt'])
        .where('threadId', '=', threadId)
        .orderBy('createdAt', 'asc')
        .execute(),
      this.db
        .selectFrom('aiToolCall')
        .select(['id', 'messageId', 'toolName', 'args', 'result'])
        .where('threadId', '=', threadId)
        .orderBy('createdAt', 'asc')
        .execute(),
    ])

    const tcByMessage = new Map<string, (typeof tcResult)[number][]>()
    for (const tc of tcResult) {
      const msgId = tc.messageId
      if (!tcByMessage.has(msgId)) tcByMessage.set(msgId, [])
      tcByMessage.get(msgId)!.push(tc)
    }

    const messages: AIMessage[] = []
    for (const row of msgResult) {
      const msg: AIMessage = {
        id: row.id,
        role: row.role as AIMessage['role'],
        content: row.content ?? undefined,
        createdAt: new Date(row.createdAt as unknown as string),
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

  async getThreadRuns(threadId: string): Promise<AgentRunRow[]> {
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

    return result.map((row) => this.mapRunRow(row))
  }

  async deleteThread(threadId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('aiThreads')
      .where('id', '=', threadId)
      .executeTakeFirst()

    return BigInt(result.numDeletedRows) > 0n
  }

  async getDistinctAgentNames(): Promise<string[]> {
    const result = await this.db
      .selectFrom('aiRun')
      .select('agentName')
      .distinct()
      .orderBy('agentName')
      .execute()

    return result.map((row) => row.agentName)
  }

  private mapThreadRow(row: any): AIThread {
    return {
      id: row.id as string,
      resourceId: row.resourceId as string,
      title: (row.title as string) ?? undefined,
      metadata: parseJson(row.metadata),
      createdAt: new Date(row.createdAt as string),
      updatedAt: new Date(row.updatedAt as string),
    }
  }

  private mapRunRow(row: any): AgentRunRow {
    return {
      runId: row.runId as string,
      agentName: row.agentName as string,
      threadId: row.threadId as string,
      resourceId: row.resourceId as string,
      status: row.status as string,
      errorMessage: (row.errorMessage as string) ?? undefined,
      suspendReason: (row.suspendReason as string) ?? undefined,
      missingRpcs: parseJson(row.missingRpcs),
      usageInputTokens: Number(row.usageInputTokens),
      usageOutputTokens: Number(row.usageOutputTokens),
      usageModel: row.usageModel as string,
      createdAt: new Date(row.createdAt as string),
      updatedAt: new Date(row.updatedAt as string),
    }
  }
}
