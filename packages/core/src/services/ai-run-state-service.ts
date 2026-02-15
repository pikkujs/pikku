import { AgentRunState } from '../wirings/ai-agent/ai-agent.types.js'

export interface AIRunStateService {
  createRun(run: AgentRunState): Promise<void>
  updateRun(runId: string, updates: Partial<AgentRunState>): Promise<void>
  getRun(runId: string): Promise<AgentRunState | null>
  getRunsByThread(threadId: string): Promise<AgentRunState[]>
}
