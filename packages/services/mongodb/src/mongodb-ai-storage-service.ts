import type {
  AIStorageService,
  AIRunStateService,
  CreateRunInput,
} from '@pikku/core/services'
import type { AIThread, AIMessage, AgentRunState } from '@pikku/core/ai-agent'
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
  content: any | null
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

interface AIWorkingMemoryDoc {
  id: string
  scope: string
  data: any
  updatedAt: Date
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

export class MongoDBAIStorageService
  implements AIStorageService, AIRunStateService
{
  private initialized = false
  private threads!: Collection<AIThreadDoc>
  private aiMessages!: Collection<AIMessageDoc>
  private toolCalls!: Collection<AIToolCallDoc>
  private workingMemory!: Collection<AIWorkingMemoryDoc>
  private aiRuns!: Collection<AIRunDoc>

  constructor(private db: Db) {}

  public async init(): Promise<void> {
    if (this.initialized) return

    this.threads = this.db.collection<AIThreadDoc>('ai_threads')
    this.aiMessages = this.db.collection<AIMessageDoc>('ai_message')
    this.toolCalls = this.db.collection<AIToolCallDoc>('ai_tool_call')
    this.workingMemory =
      this.db.collection<AIWorkingMemoryDoc>('ai_working_memory')
    this.aiRuns = this.db.collection<AIRunDoc>('ai_run')

    await this.threads.createIndex({ resourceId: 1 })

    await this.aiMessages.createIndex({ threadId: 1, createdAt: 1 })

    await this.toolCalls.createIndex({ threadId: 1 })
    await this.toolCalls.createIndex({ messageId: 1 })

    await this.workingMemory.createIndex({ id: 1, scope: 1 }, { unique: true })

    await this.aiRuns.createIndex({ threadId: 1, createdAt: 1 })

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

    await this.threads.insertOne({
      _id: id,
      resourceId,
      title: options?.title ?? null,
      metadata: options?.metadata ?? null,
      createdAt: now,
      updatedAt: now,
    })

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
    const row = await this.threads.findOne({ _id: threadId })

    if (!row) {
      throw new Error(`Thread not found: ${threadId}`)
    }

    return {
      id: row._id,
      resourceId: row.resourceId,
      title: row.title ?? undefined,
      metadata: row.metadata ?? undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }
  }

  async getThreads(resourceId: string): Promise<AIThread[]> {
    const result = await this.threads
      .find({ resourceId })
      .sort({ updatedAt: -1 })
      .toArray()

    return result.map((row) => ({
      id: row._id,
      resourceId: row.resourceId,
      title: row.title ?? undefined,
      metadata: row.metadata ?? undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }))
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.toolCalls.deleteMany({ threadId })
    await this.aiMessages.deleteMany({ threadId })
    await this.aiRuns.deleteMany({ threadId })
    await this.threads.deleteOne({ _id: threadId })
  }

  async getMessages(
    threadId: string,
    options?: { lastN?: number; cursor?: string }
  ): Promise<AIMessage[]> {
    let filter: Record<string, any> = { threadId }

    if (options?.cursor) {
      const cursorRow = await this.aiMessages.findOne({ _id: options.cursor })
      if (cursorRow) {
        filter.createdAt = { $lt: cursorRow.createdAt }
      }
    }

    let msgResult
    if (options?.cursor || options?.lastN) {
      const innerResult = await this.aiMessages
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(options?.lastN ?? 50)
        .toArray()
      innerResult.reverse()
      msgResult = innerResult
    } else {
      msgResult = await this.aiMessages
        .find(filter)
        .sort({ createdAt: 1 })
        .toArray()
    }

    const tcResult = await this.toolCalls
      .find({ threadId })
      .sort({ createdAt: 1 })
      .toArray()

    const tcByMessage = new Map<string, (typeof tcResult)[number][]>()
    for (const tc of tcResult) {
      const msgId = tc.messageId
      if (!tcByMessage.has(msgId)) tcByMessage.set(msgId, [])
      tcByMessage.get(msgId)!.push(tc)
    }

    const messages: AIMessage[] = []
    for (const row of msgResult) {
      let parsedContent: AIMessage['content'] = row.content ?? undefined
      if (typeof row.content === 'string') {
        try {
          const parsed = JSON.parse(row.content)
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
        id: row._id,
        role: row.role as AIMessage['role'],
        content: parsedContent,
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

  async saveMessages(threadId: string, messages: AIMessage[]): Promise<void> {
    if (messages.length === 0) return

    const toolMessages = messages.filter((m) => m.role === 'tool')
    const nonToolMessages = messages.filter((m) => m.role !== 'tool')

    if (nonToolMessages.length > 0) {
      await this.aiMessages.insertMany(
        nonToolMessages.map((msg) => ({
          _id: msg.id,
          threadId,
          role: msg.role,
          content: msg.content != null ? JSON.stringify(msg.content) : null,
          createdAt: msg.createdAt ?? new Date(),
        }))
      )
    }

    const toolCallDocs = nonToolMessages.flatMap(
      (msg) => msg.toolCalls?.map((tc) => ({ ...tc, messageId: msg.id })) ?? []
    )
    if (toolCallDocs.length > 0) {
      await this.toolCalls.insertMany(
        toolCallDocs.map((tc) => ({
          _id: tc.id,
          threadId,
          messageId: tc.messageId,
          runId: null,
          toolName: tc.name,
          args: tc.args,
          result: null,
          approvalStatus: null,
          approvalType: null,
          agentRunId: null,
          displayToolName: null,
          displayArgs: null,
          createdAt: new Date(),
        }))
      )
    }

    for (const toolMsg of toolMessages) {
      if (!toolMsg.toolResults) continue
      for (const tr of toolMsg.toolResults) {
        await this.toolCalls.updateOne(
          { _id: tr.id },
          { $set: { result: tr.result } }
        )
      }
    }

    await this.threads.updateOne(
      { _id: threadId },
      { $set: { updatedAt: new Date() } }
    )
  }

  async getWorkingMemory(
    id: string,
    scope: 'resource' | 'thread'
  ): Promise<Record<string, unknown> | null> {
    const row = await this.workingMemory.findOne({ id, scope })
    if (!row) return null
    return row.data
  }

  async saveWorkingMemory(
    id: string,
    scope: 'resource' | 'thread',
    data: Record<string, unknown>
  ): Promise<void> {
    await this.workingMemory.updateOne(
      { id, scope },
      {
        $set: {
          data,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          id,
          scope,
        },
      },
      { upsert: true }
    )
  }

  async createRun(run: CreateRunInput): Promise<string> {
    const runId = crypto.randomUUID()

    await this.aiRuns.insertOne({
      _id: runId,
      agentName: run.agentName,
      threadId: run.threadId,
      resourceId: run.resourceId,
      status: run.status,
      errorMessage: run.errorMessage ?? null,
      suspendReason: run.suspendReason ?? null,
      missingRpcs: run.missingRpcs ?? null,
      usageInputTokens: run.usage.inputTokens,
      usageOutputTokens: run.usage.outputTokens,
      usageModel: run.usage.model,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    })

    if (run.pendingApprovals?.length) {
      await this.setApprovals(runId, run.pendingApprovals)
    }

    return runId
  }

  async updateRun(
    runId: string,
    updates: Partial<AgentRunState>
  ): Promise<void> {
    const setValues: Record<string, any> = { updatedAt: new Date() }

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
      setValues.missingRpcs = updates.missingRpcs
    }
    if (updates.usage !== undefined) {
      setValues.usageInputTokens = updates.usage.inputTokens
      setValues.usageOutputTokens = updates.usage.outputTokens
      setValues.usageModel = updates.usage.model
    }

    await this.aiRuns.updateOne({ _id: runId }, { $set: setValues })

    if (updates.pendingApprovals !== undefined) {
      await this.toolCalls.updateMany(
        { runId, approvalStatus: { $ne: null } },
        {
          $set: {
            approvalStatus: null,
            runId: null,
            approvalType: null,
            agentRunId: null,
            displayToolName: null,
            displayArgs: null,
          },
        }
      )

      if (updates.pendingApprovals.length) {
        await this.setApprovals(runId, updates.pendingApprovals)
      }
    }
  }

  async getRun(runId: string): Promise<AgentRunState | null> {
    const row = await this.aiRuns.findOne({ _id: runId })
    if (!row) return null

    const approvals = await this.toolCalls
      .find({ runId, approvalStatus: 'pending' })
      .toArray()

    return this.mapRunRow(row, approvals)
  }

  async getRunsByThread(threadId: string): Promise<AgentRunState[]> {
    const result = await this.aiRuns
      .find({ threadId })
      .sort({ createdAt: -1 })
      .toArray()

    const runs: AgentRunState[] = []
    for (const row of result) {
      const approvals = await this.toolCalls
        .find({ runId: row._id, approvalStatus: 'pending' })
        .toArray()
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
        await this.toolCalls.updateOne(
          { _id: a.toolCallId },
          {
            $set: {
              approvalStatus: 'pending',
              runId,
              approvalType: 'agent-call',
              agentRunId: a.agentRunId,
              displayToolName: a.displayToolName,
              displayArgs: a.displayArgs,
            },
          }
        )
      } else {
        await this.toolCalls.updateOne(
          { _id: a.toolCallId },
          {
            $set: {
              approvalStatus: 'pending',
              runId,
              approvalType: 'tool-call',
            },
          }
        )
      }
    }
  }

  private mapRunRow(row: any, approvalRows?: any[]): AgentRunState {
    const pendingApprovals = approvalRows?.length
      ? approvalRows.map((a: any) => {
          if (a.approvalType === 'agent-call') {
            return {
              type: 'agent-call' as const,
              toolCallId: a._id as string,
              agentName: a.toolName as string,
              agentRunId: a.agentRunId as string,
              displayToolName: a.displayToolName as string,
              displayArgs: a.displayArgs as unknown,
            }
          }
          return {
            type: 'tool-call' as const,
            toolCallId: a._id as string,
            toolName: a.toolName as string,
            args: a.args as unknown,
          }
        })
      : undefined

    return {
      runId: row._id as string,
      agentName: row.agentName as string,
      threadId: row.threadId as string,
      resourceId: row.resourceId as string,
      status: row.status as AgentRunState['status'],
      errorMessage: row.errorMessage ?? undefined,
      suspendReason: row.suspendReason as AgentRunState['suspendReason'],
      missingRpcs: row.missingRpcs ?? undefined,
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
    const tc = await this.toolCalls.findOne({
      _id: toolCallId,
      approvalStatus: 'pending',
    })

    if (!tc || !tc.runId) return null

    const run = await this.getRun(tc.runId)
    if (!run) return null

    let approval: NonNullable<AgentRunState['pendingApprovals']>[number]
    if (tc.approvalType === 'agent-call') {
      approval = {
        type: 'agent-call',
        toolCallId: tc._id,
        agentName: tc.toolName,
        agentRunId: tc.agentRunId!,
        displayToolName: tc.displayToolName!,
        displayArgs: tc.displayArgs as unknown,
      }
    } else {
      approval = {
        type: 'tool-call',
        toolCallId: tc._id,
        toolName: tc.toolName,
        args: tc.args as unknown,
      }
    }

    return { run, approval }
  }

  async resolveApproval(
    toolCallId: string,
    status: 'approved' | 'denied'
  ): Promise<void> {
    await this.toolCalls.updateOne(
      { _id: toolCallId },
      { $set: { approvalStatus: status } }
    )
  }

  public async close(): Promise<void> {}
}
