import type {
  AgentRunState,
  PendingApproval,
} from '../wirings/ai-agent/ai-agent.types.js'

export type CreateRunInput = Omit<AgentRunState, 'runId'>

export interface AIRunStateService {
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
}
