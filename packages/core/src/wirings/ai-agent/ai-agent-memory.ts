import { randomUUID } from 'crypto'
import type { CoreSingletonServices } from '../../types/core.types.js'
import type {
  CoreAIAgent,
  AIAgentMemoryConfig,
  AIAgentInput,
  AIMessage,
} from './ai-agent.types.js'
import type { AIStorageService } from '../../services/ai-storage-service.js'

export function resolveMemoryServices(
  agent: CoreAIAgent,
  singletonServices: CoreSingletonServices
): {
  storage: AIStorageService | undefined
} {
  const memoryConfig = agent.memory
  const storage = memoryConfig?.storage
    ? (singletonServices as any)[memoryConfig.storage]
    : singletonServices.aiStorage
  return { storage }
}

export async function loadContextMessages(
  memoryConfig: AIAgentMemoryConfig | undefined,
  storage: AIStorageService | undefined,
  input: AIAgentInput
): Promise<AIMessage[]> {
  const contextMessages: AIMessage[] = []

  if (memoryConfig?.workingMemory && storage) {
    const workingMem = await storage.getWorkingMemory(
      input.resourceId,
      'resource'
    )
    if (workingMem) {
      contextMessages.push({
        id: `wm-${randomUUID()}`,
        role: 'system',
        content: `Current working memory:\n${JSON.stringify(workingMem)}\n\nWhen you learn new information about the user, output an updated working memory JSON at the end of your response in <working_memory> tags.`,
        createdAt: new Date(),
      })
    }
  }

  return contextMessages
}

export async function saveMessages(
  storage: AIStorageService | undefined,
  threadId: string,
  resourceId: string,
  memoryConfig: AIAgentMemoryConfig | undefined,
  userMessage: AIMessage,
  result: {
    text: string
    steps: {
      toolCalls?: {
        name: string
        args: Record<string, unknown>
        result: string
      }[]
    }[]
  }
): Promise<string> {
  let responseText = result.text

  if (storage) {
    const newMessages: AIMessage[] = [userMessage]

    for (const step of result.steps) {
      if (step.toolCalls?.length) {
        newMessages.push({
          id: randomUUID(),
          role: 'assistant',
          toolCalls: step.toolCalls.map((tc) => ({
            id: randomUUID(),
            name: tc.name,
            args: tc.args,
          })),
          createdAt: new Date(),
        })
        newMessages.push({
          id: randomUUID(),
          role: 'tool',
          toolResults: step.toolCalls.map((tc) => ({
            id: randomUUID(),
            name: tc.name,
            result: tc.result,
          })),
          createdAt: new Date(),
        })
      }
    }

    newMessages.push({
      id: randomUUID(),
      role: 'assistant',
      content: responseText,
      createdAt: new Date(),
    })

    await storage.saveMessages(threadId, newMessages)

    if (memoryConfig?.workingMemory) {
      const parsed = parseWorkingMemory(responseText)
      if (parsed) {
        await storage.saveWorkingMemory(resourceId, 'resource', parsed)
        responseText = stripWorkingMemoryTags(responseText)
      }
    }
  }

  return responseText
}

export function trimMessages(
  messages: AIMessage[],
  maxTokenBudget: number = 100000
): AIMessage[] {
  let estimatedTokens = 0
  const result: AIMessage[] = []

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    const msgTokens = estimateTokens(msg)
    if (estimatedTokens + msgTokens > maxTokenBudget && result.length > 0) {
      break
    }
    estimatedTokens += msgTokens
    result.unshift(msg)
  }

  if (
    result.length > 0 &&
    result[0].role !== 'user' &&
    result[0].role !== 'system'
  ) {
    const firstUserIdx = result.findIndex(
      (m) => m.role === 'user' || m.role === 'system'
    )
    if (firstUserIdx > 0) {
      return result.slice(firstUserIdx)
    }
  }

  return result
}

function estimateTokens(msg: AIMessage): number {
  let chars = 0
  if (msg.content) chars += msg.content.length
  if (msg.toolCalls) chars += JSON.stringify(msg.toolCalls).length
  if (msg.toolResults) chars += JSON.stringify(msg.toolResults).length
  return Math.ceil(chars / 4)
}

export function parseWorkingMemory(
  text: string
): Record<string, unknown> | null {
  const match = text.match(/<working_memory>([\s\S]*?)<\/working_memory>/)
  if (!match) return null
  try {
    return JSON.parse(match[1].trim())
  } catch {
    return null
  }
}

export function stripWorkingMemoryTags(text: string): string {
  return text.replace(/<working_memory>[\s\S]*?<\/working_memory>/g, '').trim()
}
