import type {
  AIThread,
  AIMessage,
  AgentRunRow,
  AgentRunService,
} from '@pikku/core/ai-agent'
import type { Redis } from 'ioredis'

export class RedisAgentRunService implements AgentRunService {
  constructor(
    private redis: Redis,
    private keyPrefix = 'ai'
  ) {}

  private threadKey(threadId: string): string {
    return `${this.keyPrefix}:thread:${threadId}`
  }

  private threadsIndexKey(): string {
    return `${this.keyPrefix}:threads`
  }

  private messagesKey(threadId: string): string {
    return `${this.keyPrefix}:messages:${threadId}`
  }

  private runKey(runId: string): string {
    return `${this.keyPrefix}:run:${runId}`
  }

  private threadRunsKey(threadId: string): string {
    return `${this.keyPrefix}:thread-runs:${threadId}`
  }

  private agentThreadsKey(agentName: string): string {
    return `${this.keyPrefix}:agent-threads:${agentName}`
  }

  async listThreads(options?: {
    agentName?: string
    limit?: number
    offset?: number
  }): Promise<AIThread[]> {
    const { agentName, limit = 50, offset = 0 } = options ?? {}

    let threadIds: string[]

    if (agentName) {
      const allIds = await this.redis.smembers(this.agentThreadsKey(agentName))
      const threadsWithScores: { id: string; score: number }[] = []
      for (const id of allIds) {
        const score = await this.redis.zscore(this.threadsIndexKey(), id)
        if (score) {
          threadsWithScores.push({ id, score: Number(score) })
        }
      }
      threadsWithScores.sort((a, b) => b.score - a.score)
      threadIds = threadsWithScores.map((t) => t.id)
    } else {
      threadIds = await this.redis.zrevrange(this.threadsIndexKey(), 0, -1)
    }

    const paged = threadIds.slice(offset, offset + limit)

    const threads: AIThread[] = []
    for (const id of paged) {
      const thread = await this.getThread(id)
      if (thread) threads.push(thread)
    }

    return threads
  }

  async getThread(threadId: string): Promise<AIThread | null> {
    const data = await this.redis.hgetall(this.threadKey(threadId))
    if (!data.id) return null
    return {
      id: data.id,
      resourceId: data.resourceId!,
      title: data.title || undefined,
      metadata: data.metadata ? JSON.parse(data.metadata) : undefined,
      createdAt: new Date(Number(data.createdAt)),
      updatedAt: new Date(Number(data.updatedAt)),
    }
  }

  async getThreadMessages(threadId: string): Promise<AIMessage[]> {
    const entries = await this.redis.zrange(this.messagesKey(threadId), 0, -1)
    return entries.map((entry) => {
      const msg = JSON.parse(entry)
      return {
        ...msg,
        createdAt: new Date(msg.createdAt),
      }
    })
  }

  async getThreadRuns(threadId: string): Promise<AgentRunRow[]> {
    const runIds = await this.redis.zrevrange(
      this.threadRunsKey(threadId),
      0,
      -1
    )

    const runs: AgentRunRow[] = []
    for (const runId of runIds) {
      const data = await this.redis.hgetall(this.runKey(runId))
      if (!data.runId) continue
      runs.push({
        runId: data.runId,
        agentName: data.agentName!,
        threadId: data.threadId!,
        resourceId: data.resourceId!,
        status: data.status!,
        suspendReason: data.suspendReason || undefined,
        missingRpcs: data.missingRpcs
          ? JSON.parse(data.missingRpcs)
          : undefined,
        usageInputTokens: Number(data.usageInputTokens || 0),
        usageOutputTokens: Number(data.usageOutputTokens || 0),
        usageModel: data.usageModel!,
        createdAt: new Date(Number(data.createdAt)),
        updatedAt: new Date(Number(data.updatedAt)),
      })
    }

    return runs
  }

  async deleteThread(threadId: string): Promise<boolean> {
    const exists = await this.redis.exists(this.threadKey(threadId))
    if (!exists) return false

    const runIds = await this.redis.zrange(this.threadRunsKey(threadId), 0, -1)

    const keysToDelete = [
      this.threadKey(threadId),
      this.messagesKey(threadId),
      this.threadRunsKey(threadId),
    ]

    for (const runId of runIds) {
      const agentName = await this.redis.hget(this.runKey(runId), 'agentName')
      keysToDelete.push(this.runKey(runId))
      if (agentName) {
        await this.redis.srem(this.agentThreadsKey(agentName), threadId)
      }
    }

    await this.redis.zrem(this.threadsIndexKey(), threadId)

    if (keysToDelete.length > 0) {
      await this.redis.del(...keysToDelete)
    }

    return true
  }

  async getDistinctAgentNames(): Promise<string[]> {
    const keys = await this.scanKeys(`${this.keyPrefix}:agent-threads:*`)
    const prefix = `${this.keyPrefix}:agent-threads:`
    return keys.map((k) => k.slice(prefix.length)).sort()
  }

  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = []
    let cursor = '0'
    do {
      const [newCursor, foundKeys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      )
      cursor = newCursor
      keys.push(...foundKeys)
    } while (cursor !== '0')
    return keys
  }
}
