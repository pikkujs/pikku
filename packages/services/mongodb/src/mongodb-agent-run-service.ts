import type {
  AIThread,
  AIMessage,
  AgentRunRow,
  AgentRunService,
} from '@pikku/core/ai-agent'
import type { Db, Collection } from 'mongodb'

interface AIThreadDoc {
  _id: string
  resourceId: string
  title: string | null
  metadata: any | null
  createdAt: Date
  updatedAt: Date
}

interface AIMessageDoc {
  _id: string
  threadId: string
  role: string
  content: string | null
  createdAt: Date
}

interface AIToolCallDoc {
  _id: string
  threadId: string
  messageId: string
  runId: string | null
  toolName: string
  args: any
  result: string | null
  approvalStatus: string | null
  approvalType: string | null
  agentRunId: string | null
  displayToolName: string | null
  displayArgs: any | null
  createdAt: Date
}

interface AIRunDoc {
  _id: string
  agentName: string
  threadId: string
  resourceId: string
  status: string
  errorMessage: string | null
  suspendReason: string | null
  missingRpcs: any | null
  usageInputTokens: number
  usageOutputTokens: number
  usageModel: string
  createdAt: Date
  updatedAt: Date
}

export class MongoDBAgentRunService implements AgentRunService {
  private threads: Collection<AIThreadDoc>
  private messages: Collection<AIMessageDoc>
  private toolCalls: Collection<AIToolCallDoc>
  private runs: Collection<AIRunDoc>

  constructor(db: Db) {
    this.threads = db.collection<AIThreadDoc>('ai_threads')
    this.messages = db.collection<AIMessageDoc>('ai_message')
    this.toolCalls = db.collection<AIToolCallDoc>('ai_tool_call')
    this.runs = db.collection<AIRunDoc>('ai_run')
  }

  async listThreads(options?: {
    agentName?: string
    limit?: number
    offset?: number
  }): Promise<AIThread[]> {
    const { agentName, limit = 50, offset = 0 } = options ?? {}

    let filter: Record<string, any> = {}

    if (agentName) {
      const threadIds = await this.runs.distinct('threadId', {
        agentName,
      })
      filter._id = { $in: threadIds }
    }

    const result = await this.threads
      .find(filter)
      .sort({ updatedAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray()

    return result.map((row) => this.mapThreadRow(row))
  }

  async getThread(threadId: string): Promise<AIThread | null> {
    const row = await this.threads.findOne({ _id: threadId })
    if (!row) return null
    return this.mapThreadRow(row)
  }

  async getThreadMessages(threadId: string): Promise<AIMessage[]> {
    const [msgResult, tcResult] = await Promise.all([
      this.messages.find({ threadId }).sort({ createdAt: 1 }).toArray(),
      this.toolCalls.find({ threadId }).sort({ createdAt: 1 }).toArray(),
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
        id: row._id,
        role: row.role as AIMessage['role'],
        content: row.content ?? undefined,
        createdAt: new Date(row.createdAt),
      }

      const tcs = tcByMessage.get(msg.id)
      if (tcs?.length) {
        msg.toolCalls = tcs.map((tc) => ({
          id: tc._id,
          name: tc.toolName,
          args: tc.args as Record<string, unknown>,
        }))

        const completed = tcs.filter((tc) => tc.result != null)
        if (completed.length) {
          messages.push(msg)
          messages.push({
            id: `tool-results-${msg.id}`,
            role: 'tool',
            toolResults: completed.map((tc) => ({
              id: tc._id,
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
    const result = await this.runs
      .find({ threadId })
      .sort({ createdAt: -1 })
      .toArray()

    return result.map((row) => this.mapRunRow(row))
  }

  async deleteThread(threadId: string): Promise<boolean> {
    await this.toolCalls.deleteMany({ threadId })
    await this.messages.deleteMany({ threadId })
    await this.runs.deleteMany({ threadId })
    const result = await this.threads.deleteOne({ _id: threadId })
    return result.deletedCount > 0
  }

  async getDistinctAgentNames(): Promise<string[]> {
    const result = await this.runs.distinct('agentName')
    return result.sort()
  }

  private mapThreadRow(row: AIThreadDoc): AIThread {
    return {
      id: row._id,
      resourceId: row.resourceId,
      title: row.title ?? undefined,
      metadata: row.metadata ?? undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }
  }

  private mapRunRow(row: AIRunDoc): AgentRunRow {
    return {
      runId: row._id,
      agentName: row.agentName,
      threadId: row.threadId,
      resourceId: row.resourceId,
      status: row.status,
      errorMessage: row.errorMessage ?? undefined,
      suspendReason: row.suspendReason ?? undefined,
      missingRpcs: row.missingRpcs ?? undefined,
      usageInputTokens: Number(row.usageInputTokens),
      usageOutputTokens: Number(row.usageOutputTokens),
      usageModel: row.usageModel,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }
  }
}
