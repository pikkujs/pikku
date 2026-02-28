import type {
  AIRunStateService,
  CreateRunInput,
} from './ai-run-state-service.js'
import type {
  AgentRunState,
  PendingApproval,
} from '../wirings/ai-agent/ai-agent.types.js'

export class InMemoryAIRunStateService implements AIRunStateService {
  private runs = new Map<string, AgentRunState>()
  private counter = 0

  async createRun(run: CreateRunInput): Promise<string> {
    const runId = `run-${++this.counter}-${Date.now()}`
    this.runs.set(runId, { ...run, runId })
    return runId
  }

  async updateRun(
    runId: string,
    updates: Partial<AgentRunState>
  ): Promise<void> {
    const run = this.runs.get(runId)
    if (run) {
      Object.assign(run, updates, { updatedAt: new Date() })
    }
  }

  async getRun(runId: string): Promise<AgentRunState | null> {
    return this.runs.get(runId) ?? null
  }

  async getRunsByThread(threadId: string): Promise<AgentRunState[]> {
    return [...this.runs.values()].filter((r) => r.threadId === threadId)
  }

  async resolveApproval(
    toolCallId: string,
    status: 'approved' | 'denied'
  ): Promise<void> {
    for (const run of this.runs.values()) {
      if (run.pendingApprovals) {
        const approval = run.pendingApprovals.find(
          (a) => a.toolCallId === toolCallId
        )
        if (approval) {
          run.pendingApprovals = run.pendingApprovals.filter(
            (a) => a.toolCallId !== toolCallId
          )
          run.updatedAt = new Date()
          return
        }
      }
    }
  }

  async findRunByToolCallId(
    toolCallId: string
  ): Promise<{ run: AgentRunState; approval: PendingApproval } | null> {
    for (const run of this.runs.values()) {
      if (run.pendingApprovals) {
        const approval = run.pendingApprovals.find(
          (a) => a.toolCallId === toolCallId
        )
        if (approval) {
          return { run, approval }
        }
      }
    }
    return null
  }
}
