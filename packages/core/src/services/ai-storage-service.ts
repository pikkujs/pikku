import { AIThread, AIMessage } from '../wirings/ai-agent/ai-agent.types.js'

export interface AIStorageService {
  createThread(
    resourceId: string,
    options?: {
      threadId?: string
      title?: string
      metadata?: Record<string, unknown>
    }
  ): Promise<AIThread>

  getThread(threadId: string): Promise<AIThread>

  getThreads(resourceId: string): Promise<AIThread[]>

  deleteThread(threadId: string): Promise<void>

  getMessages(
    threadId: string,
    options?: {
      lastN?: number
      cursor?: string
    }
  ): Promise<AIMessage[]>

  saveMessages(threadId: string, messages: AIMessage[]): Promise<void>

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
