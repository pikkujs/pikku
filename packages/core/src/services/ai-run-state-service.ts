import { AgentRunState } from '../wirings/ai-agent/ai-agent.types.js'

export type CreateRunInput = Omit<AgentRunState, 'runId'>

export interface AIRunStateService {
  createRun(run: CreateRunInput): Promise<string>
  updateRun(runId: string, updates: Partial<AgentRunState>): Promise<void>
  getRun(runId: string): Promise<AgentRunState | null>
  getRunsByThread(threadId: string): Promise<AgentRunState[]>
}
