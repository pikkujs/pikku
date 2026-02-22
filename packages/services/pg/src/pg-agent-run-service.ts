import type {
  AIThread,
  AIMessage,
  AgentRunRow,
  AgentRunService,
} from '@pikku/core/ai-agent'
import postgres from 'postgres'

export class PgAgentRunService implements AgentRunService {
  constructor(
    private sql: postgres.Sql,
    private schemaName = 'pikku'
  ) {}

  async listThreads(options?: {
    agentName?: string
    limit?: number
    offset?: number
  }): Promise<AIThread[]> {
    const { agentName, limit = 50, offset = 0 } = options ?? {}

    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (agentName) {
      conditions.push(
        `t.id IN (SELECT DISTINCT thread_id FROM ${this.schemaName}.ai_run WHERE agent_name = $${paramIndex++})`
      )
      params.push(agentName)
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    params.push(limit)
    params.push(offset)

    const result = await this.sql.unsafe(
      `SELECT t.id, t.resource_id, t.title, t.metadata, t.created_at, t.updated_at
       FROM ${this.schemaName}.ai_threads t
       ${where}
       ORDER BY t.updated_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    )

    return result.map((row) => this.mapThreadRow(row))
  }

  async getThread(threadId: string): Promise<AIThread | null> {
    const result = await this.sql.unsafe(
      `SELECT id, resource_id, title, metadata, created_at, updated_at
       FROM ${this.schemaName}.ai_threads
       WHERE id = $1`,
      [threadId]
    )

    if (result.length === 0) return null
    return this.mapThreadRow(result[0]!)
  }

  async getThreadMessages(threadId: string): Promise<AIMessage[]> {
    const [msgResult, tcResult] = await Promise.all([
      this.sql.unsafe(
        `SELECT id, role, content, created_at
         FROM ${this.schemaName}.ai_message
         WHERE thread_id = $1
         ORDER BY created_at ASC`,
        [threadId]
      ),
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

  async getThreadRuns(threadId: string): Promise<AgentRunRow[]> {
    const result = await this.sql.unsafe(
      `SELECT run_id, agent_name, thread_id, resource_id, status,
              suspend_reason, missing_rpcs,
              usage_input_tokens, usage_output_tokens,
              usage_model, created_at, updated_at
       FROM ${this.schemaName}.ai_run
       WHERE thread_id = $1
       ORDER BY created_at DESC`,
      [threadId]
    )

    return result.map((row) => this.mapRunRow(row))
  }

  async deleteThread(threadId: string): Promise<boolean> {
    const result = await this.sql.unsafe(
      `DELETE FROM ${this.schemaName}.ai_threads WHERE id = $1`,
      [threadId]
    )
    return result.count > 0
  }

  async getDistinctAgentNames(): Promise<string[]> {
    const result = await this.sql.unsafe(
      `SELECT DISTINCT agent_name FROM ${this.schemaName}.ai_run ORDER BY agent_name`
    )
    return result.map((row) => row.agent_name as string)
  }

  private mapThreadRow(row: any): AIThread {
    return {
      id: row.id as string,
      resourceId: row.resource_id as string,
      title: row.title as string | undefined,
      metadata: row.metadata as Record<string, unknown> | undefined,
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
      suspendReason: row.suspend_reason as string | undefined,
      missingRpcs: row.missing_rpcs as string[] | undefined,
      usageInputTokens: Number(row.usage_input_tokens),
      usageOutputTokens: Number(row.usage_output_tokens),
      usageModel: row.usage_model as string,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    }
  }
}
