import type { AgentThread, AgentMessage } from '../wirings/agent/agent.types.js'

export interface AgentStorageService {
  createThread(
    resourceId: string,
    options?: {
      threadId?: string
      title?: string
      metadata?: Record<string, unknown>
    }
  ): Promise<AgentThread>

  getThread(threadId: string): Promise<AgentThread>

  getThreads(resourceId: string): Promise<AgentThread[]>

  deleteThread(threadId: string): Promise<void>

  getMessages(
    threadId: string,
    options?: {
      lastN?: number
      cursor?: string
    }
  ): Promise<AgentMessage[]>

  saveMessages(threadId: string, messages: AgentMessage[]): Promise<void>

  getWorkingMemory(
    id: string,
    scope: 'resource' | 'thread'
  ): Promise<Record<string, unknown> | null>

  saveWorkingMemory(
    id: string,
    scope: 'resource' | 'thread',
    data: Record<string, unknown>
  ): Promise<void>
}
