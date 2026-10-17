import type {
  AgentRunState,
  PendingApproval,
} from '../wirings/agent/agent.types.js'
import type { AgentRunScore } from '../wirings/agent-scorer/agent-scorer.types.js'

/** A run as it is first recorded; the store assigns the `runId`. */
export type CreateRunInput = Omit<AgentRunState, 'runId'>

/** A scorer's grade as it is saved; the store stamps `createdAt`. */
export type SaveScoreInput = Omit<AgentRunScore, 'createdAt'>

/**
 * Persists agent runs between steps, so a run that stops for a tool approval
 * can be resumed later, possibly by another process. Implementations must make
 * {@link AgentRunStateService.resolveApproval} atomic: it is what stops one
 * approval from executing a tool twice.
 */
export interface AgentRunStateService {
  createRun(run: CreateRunInput): Promise<string>
  updateRun(runId: string, updates: Partial<AgentRunState>): Promise<void>
  getRun(runId: string): Promise<AgentRunState | null>
  getRunsByThread(threadId: string): Promise<AgentRunState[]>
  /**
   * Claims an approval: removes it from the run's pending list and records the
   * decision, as one atomic step. Returns whether THIS caller made the claim —
   * concurrent approvals of the same tool call produce exactly one `true`, and
   * only that caller may run the tool.
   */
  resolveApproval(
    toolCallId: string,
    status: 'approved' | 'denied'
  ): Promise<boolean>
  findRunByToolCallId(
    toolCallId: string
  ): Promise<{ run: AgentRunState; approval: PendingApproval } | null>
  /**
   * Record one scorer's grade of a finished run. A run accumulates one row per
   * scorer, and a scorer may grade the same run more than once — a retried job
   * appends rather than replaces, so a re-grade never silently overwrites the
   * grade that was acted on.
   */
  saveScore(score: SaveScoreInput): Promise<void>
  getScores(runId: string): Promise<AgentRunScore[]>
}
