import { sql } from 'kysely'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import type { AIRunStateService, CreateRunInput } from '@pikku/core/services'
import type { AgentRunState, PendingApproval } from '@pikku/core/ai-agent'

export class KyselyAIRunStateService implements AIRunStateService {
  private initialized = false

  constructor(private db: Kysely<KyselyPikkuDB>) {}

  async init(): Promise<void> {
    if (this.initialized) return

    await this.db.schema
      .createTable('aiRun')
      .ifNotExists()
      .addColumn('runId', 'text', (col) => col.primaryKey())
      .addColumn('agentName', 'text', (col) => col.notNull())
      .addColumn('threadId', 'text', (col) => col.notNull())
      .addColumn('resourceId', 'text', (col) => col.notNull())
      .addColumn('status', 'text', (col) => col.defaultTo('running').notNull())
      .addColumn('errorMessage', 'text')
      .addColumn('suspendReason', 'text')
      .addColumn('missingRpcs', 'text')
      .addColumn('pendingApprovals', 'text')
      .addColumn('usageInputTokens', 'integer', (col) => col.defaultTo(0))
      .addColumn('usageOutputTokens', 'integer', (col) => col.defaultTo(0))
      .addColumn('usageModel', 'text', (col) => col.defaultTo(''))
      .addColumn('createdAt', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .addColumn('updatedAt', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .execute()

    this.initialized = true
  }

  async createRun(run: CreateRunInput): Promise<string> {
    const runId = `run-${crypto.randomUUID()}`
    await this.db
      .insertInto('aiRun')
      .values({
        runId,
        agentName: run.agentName,
        threadId: run.threadId,
        resourceId: run.resourceId,
        status: run.status ?? 'running',
        errorMessage: run.errorMessage ?? null,
        suspendReason: run.suspendReason ?? null,
        missingRpcs: run.missingRpcs ? JSON.stringify(run.missingRpcs) : null,
        usageInputTokens: run.usage?.inputTokens ?? 0,
        usageOutputTokens: run.usage?.outputTokens ?? 0,
        usageModel: run.usage?.model ?? '',
      })
      .execute()
    return runId
  }

  async updateRun(
    runId: string,
    updates: Partial<AgentRunState>
  ): Promise<void> {
    const values: Record<string, unknown> = {
      updatedAt: sql`CURRENT_TIMESTAMP`,
    }
    if (updates.status !== undefined) values.status = updates.status
    if (updates.errorMessage !== undefined)
      values.errorMessage = updates.errorMessage
    if (updates.suspendReason !== undefined)
      values.suspendReason = updates.suspendReason
    if (updates.missingRpcs !== undefined)
      values.missingRpcs = JSON.stringify(updates.missingRpcs)
    if (updates.pendingApprovals !== undefined)
      values.pendingApprovals = JSON.stringify(updates.pendingApprovals)
    if (updates.usage) {
      values.usageInputTokens = updates.usage.inputTokens
      values.usageOutputTokens = updates.usage.outputTokens
      values.usageModel = updates.usage.model
    }

    await this.db
      .updateTable('aiRun')
      .set(values)
      .where('runId', '=', runId)
      .execute()
  }

  async getRun(runId: string): Promise<AgentRunState | null> {
    const row = await this.db
      .selectFrom('aiRun')
      .selectAll()
      .where('runId', '=', runId)
      .executeTakeFirst()
    return row ? this.toRunState(row) : null
  }

  async getRunsByThread(threadId: string): Promise<AgentRunState[]> {
    const rows = await this.db
      .selectFrom('aiRun')
      .selectAll()
      .where('threadId', '=', threadId)
      .orderBy('createdAt', 'desc')
      .execute()
    return rows.map((r) => this.toRunState(r))
  }

  async resolveApproval(
    toolCallId: string,
    status: 'approved' | 'denied'
  ): Promise<void> {
    const rows = await this.db
      .selectFrom('aiRun')
      .select(['runId', 'pendingApprovals' as any])
      .where('status', '=', 'suspended')
      .execute()

    for (const row of rows) {
      let approvals: PendingApproval[] = []
      if (row.pendingApprovals) {
        try {
          approvals = JSON.parse(row.pendingApprovals as string)
        } catch {
          console.warn(`Failed to parse pendingApprovals for run ${row.runId}, treating as empty`)
        }
      }
      const filtered = approvals.filter((a) => a.toolCallId !== toolCallId)
      if (filtered.length !== approvals.length) {
        const updates: Record<string, unknown> = {
          pendingApprovals:
            filtered.length > 0 ? JSON.stringify(filtered) : null,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        }
        if (filtered.length === 0) {
          updates.status = status
        }
        await this.db
          .updateTable('aiRun')
          .set(updates as any)
          .where('runId', '=', row.runId)
          .execute()
        return
      }
    }
  }

  async findRunByToolCallId(
    toolCallId: string
  ): Promise<{ run: AgentRunState; approval: PendingApproval } | null> {
    const rows = await this.db
      .selectFrom('aiRun')
      .selectAll()
      .where('status', '=', 'suspended')
      .execute()

    for (const row of rows) {
      let approvals: PendingApproval[] = []
      if ((row as any).pendingApprovals) {
        try {
          approvals = JSON.parse((row as any).pendingApprovals)
        } catch {
          console.warn(`Failed to parse pendingApprovals for run ${row.runId}, treating as empty`)
        }
      }
      const approval = approvals.find((a) => a.toolCallId === toolCallId)
      if (approval) {
        return { run: this.toRunState(row), approval }
      }
    }
    return null
  }

  private toRunState(row: any): AgentRunState {
    return {
      runId: row.runId,
      agentName: row.agentName,
      threadId: row.threadId,
      resourceId: row.resourceId,
      status: row.status,
      errorMessage: row.errorMessage ?? undefined,
      suspendReason: row.suspendReason ?? undefined,
      missingRpcs: row.missingRpcs ? JSON.parse(row.missingRpcs) : undefined,
      pendingApprovals: row.pendingApprovals
        ? JSON.parse(row.pendingApprovals)
        : undefined,
      usage: {
        inputTokens: row.usageInputTokens ?? 0,
        outputTokens: row.usageOutputTokens ?? 0,
        model: row.usageModel ?? '',
      },
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }
  }
}
