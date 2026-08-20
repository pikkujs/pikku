import { sql } from 'kysely'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import type { AgentRunState } from '@pikku/core/agent'
import type { AgentRunScore } from '@pikku/core/agent-scorer'
import type {
  AgentRunStateService,
  CreateRunInput,
  SaveScoreInput,
} from '@pikku/core/services'
import type { PendingApproval } from '@pikku/core/agent'
import { requirePikkuSchema } from './schema/index.js'
import { agentSchema } from './schema/agent.schema.js'
import { getRunScores, saveRunScore } from './kysely-agent-run-scores.js'

export class KyselyAgentRunStateService implements AgentRunStateService {
  private initialized = false

  constructor(private db: Kysely<KyselyPikkuDB>) {}

  async init(): Promise<void> {
    if (this.initialized) return
    await requirePikkuSchema(this.db, agentSchema)
    this.initialized = true
  }

  async createRun(run: CreateRunInput): Promise<string> {
    const runId = `run-${crypto.randomUUID()}`
    await this.db
      .insertInto('agentRun')
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
      .updateTable('agentRun')
      .set(values)
      .where('runId', '=', runId)
      .execute()
  }

  async getRun(runId: string): Promise<AgentRunState | null> {
    const row = await this.db
      .selectFrom('agentRun')
      .selectAll()
      .where('runId', '=', runId)
      .executeTakeFirst()
    return row ? this.toRunState(row) : null
  }

  async getRunsByThread(threadId: string): Promise<AgentRunState[]> {
    const rows = await this.db
      .selectFrom('agentRun')
      .selectAll()
      .where('threadId', '=', threadId)
      .orderBy('createdAt', 'desc')
      .execute()
    return rows.map((r) => this.toRunState(r))
  }

  async resolveApproval(
    toolCallId: string,
    status: 'approved' | 'denied'
  ): Promise<boolean> {
    const rows = await this.db
      .selectFrom('agentRun')
      .select(['runId', 'pendingApprovals'])
      .where('status', '=', 'suspended')
      .execute()

    for (const row of rows) {
      let approvals: PendingApproval[] = []
      if (row.pendingApprovals) {
        try {
          approvals = JSON.parse(row.pendingApprovals)
        } catch {
          console.warn(
            `Failed to parse pendingApprovals for run ${row.runId}, treating as empty`
          )
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
        // Compare-and-swap on the list we read: a concurrent approver that got
        // there first has already rewritten it, and this update matches no row.
        const result = await this.db
          .updateTable('agentRun')
          .set(updates as any)
          .where('runId', '=', row.runId)
          .where('status', '=', 'suspended')
          .where('pendingApprovals', '=', row.pendingApprovals)
          .executeTakeFirst()
        return Number(result?.numUpdatedRows ?? 0) > 0
      }
    }
    return false
  }

  async findRunByToolCallId(
    toolCallId: string
  ): Promise<{ run: AgentRunState; approval: PendingApproval } | null> {
    const rows = await this.db
      .selectFrom('agentRun')
      .selectAll()
      .where('status', '=', 'suspended')
      .execute()

    for (const row of rows) {
      let approvals: PendingApproval[] = []
      if (row.pendingApprovals) {
        try {
          approvals = JSON.parse(row.pendingApprovals)
        } catch {
          console.warn(
            `Failed to parse pendingApprovals for run ${row.runId}, treating as empty`
          )
        }
      }
      const approval = approvals.find((a) => a.toolCallId === toolCallId)
      if (approval) {
        return { run: this.toRunState(row), approval }
      }
    }
    return null
  }

  async saveScore(score: SaveScoreInput): Promise<void> {
    await saveRunScore(this.db, score)
  }

  async getScores(runId: string): Promise<AgentRunScore[]> {
    return getRunScores(this.db, runId)
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
