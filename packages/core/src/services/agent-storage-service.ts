import type { AgentThread, AgentMessage } from '../wirings/agent/agent.types.js'

/**
 * Agent memory: conversation threads, their messages, and working memory kept
 * per thread or per resource (usually the user).
 *
 * The agent runner reads the last messages of a thread before each run and
 * saves the new ones after it. This service does not check access; callers that
 * expose threads to users should check ownership first (see `canAccessThread`).
 */
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
