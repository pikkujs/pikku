import type { AgentThread, AgentMessage } from '@pikku/core/agent'
import type {
  AgentRunRow,
  AgentRunService,
} from '@pikku/core/ecosystem/agent'
import type { Db, Collection } from 'mongodb'

// Owner ids are untrusted input to the regex, so metacharacters must not be
// able to widen the prefix match.
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

interface AgentThreadDoc {
  _id: string
  resourceId: string
  title: string | null
  metadata: any | null
  createdAt: Date
  updatedAt: Date
}

interface AgentMessageDoc {
  _id: string
  threadId: string
  role: string
  content: string | null
  createdAt: Date
}

interface AgentToolCallDoc {
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

interface AgentRunDoc {
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
  private threads: Collection<AgentThreadDoc>
  private messages: Collection<AgentMessageDoc>
  private toolCalls: Collection<AgentToolCallDoc>
  private runs: Collection<AgentRunDoc>

  constructor(db: Db) {
    this.threads = db.collection<AgentThreadDoc>('agent_threads')
    this.messages = db.collection<AgentMessageDoc>('agent_message')
    this.toolCalls = db.collection<AgentToolCallDoc>('agent_tool_call')
    this.runs = db.collection<AgentRunDoc>('agent_run')
  }

  async listThreads(options?: {
    agentName?: string
    resourceId?: string
    owners?: string[]
    limit?: number
    offset?: number
  }): Promise<AgentThread[]> {
    const {
      agentName,
      resourceId,
      owners,
      limit = 50,
      offset = 0,
    } = options ?? {}

    // An owners constraint is an authorization boundary, so an empty list must
    // match nothing rather than degrade to "no filter".
    if (owners && owners.length === 0) return []

    let filter: Record<string, any> = {}

    if (resourceId) {
      filter.resourceId = resourceId
    }

    if (owners) {
      filter.$or = owners.flatMap((owner) => [
        { resourceId: owner },
        { resourceId: { $regex: `^${escapeRegExp(owner)}:` } },
      ])
    }

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

  async getThread(threadId: string): Promise<AgentThread | null> {
    const row = await this.threads.findOne({ _id: threadId })
    if (!row) return null
    return this.mapThreadRow(row)
  }

  async getThreadMessages(threadId: string): Promise<AgentMessage[]> {
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

    const messages: AgentMessage[] = []
    for (const row of msgResult) {
      const msg: AgentMessage = {
        id: row._id,
        role: row.role as AgentMessage['role'],
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

  private mapThreadRow(row: AgentThreadDoc): AgentThread {
    return {
      id: row._id,
      resourceId: row.resourceId,
      title: row.title ?? undefined,
      metadata: row.metadata ?? undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }
  }

  private mapRunRow(row: AgentRunDoc): AgentRunRow {
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
