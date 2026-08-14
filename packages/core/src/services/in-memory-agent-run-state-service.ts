import type {
  AgentRunStateService,
  CreateRunInput,
  SaveScoreInput,
} from './agent-run-state-service.js'
import type {
  AgentRunState,
  PendingApproval,
} from '../wirings/agent/agent.types.js'
import type { AgentRunScore } from '../wirings/agent-scorer/agent-scorer.types.js'

export class InMemoryAgentRunStateService implements AgentRunStateService {
  private runs = new Map<string, AgentRunState>()
  private scores = new Map<string, AgentRunScore[]>()
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
  ): Promise<boolean> {
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
          return true
        }
      }
    }
    return false
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

  async saveScore(score: SaveScoreInput): Promise<void> {
    const existing = this.scores.get(score.runId) ?? []
    existing.push({ ...score, createdAt: new Date() })
    this.scores.set(score.runId, existing)
  }

  async getScores(runId: string): Promise<AgentRunScore[]> {
    return [...(this.scores.get(runId) ?? [])]
  }
}
