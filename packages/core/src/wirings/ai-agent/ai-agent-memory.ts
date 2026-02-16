import { randomUUID } from 'crypto'
import type { CoreSingletonServices } from '../../types/core.types.js'
import type {
  CoreAIAgent,
  AIAgentMemoryConfig,
  AIAgentInput,
  AIMessage,
} from './ai-agent.types.js'
import type { AIStorageService } from '../../services/ai-storage-service.js'
import type { Logger } from '../../services/logger.js'
import type { SchemaService } from '../../services/schema-service.js'

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

export function deepMergeWorkingMemory(
  existing: Record<string, unknown>,
  updates: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...existing }
  for (const key of Object.keys(updates)) {
    const value = updates[key]
    if (value === null) {
      delete result[key]
    } else if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMergeWorkingMemory(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      )
    } else {
      result[key] = value
    }
  }
  return result
}

export function buildWorkingMemoryPrompt(
  currentState: Record<string, unknown> | null,
  jsonSchema?: Record<string, unknown>
): string {
  const parts: string[] = []

  if (jsonSchema?.properties) {
    const props = jsonSchema.properties as Record<
      string,
      { type?: string; description?: string }
    >
    const fieldLines = Object.entries(props).map(([name, def]) => {
      const type = def.type ?? 'unknown'
      const desc = def.description ? ` - ${def.description}` : ''
      return `  - ${name} (${type})${desc}`
    })
    if (fieldLines.length > 0) {
      parts.push(`Working memory fields:\n${fieldLines.join('\n')}`)
    }
  }

  if (currentState && Object.keys(currentState).length > 0) {
    parts.push(`Current working memory:\n${JSON.stringify(currentState)}`)
  } else {
    parts.push('Current working memory: (empty)')
  }

  parts.push(
    'When you learn new information, output a partial JSON update in <working_memory> tags. ' +
      'Only include changed fields. Set a field to null to delete it.'
  )

  return parts.join('\n\n')
}

export async function loadContextMessages(
  memoryConfig: AIAgentMemoryConfig | undefined,
  storage: AIStorageService | undefined,
  input: AIAgentInput,
  workingMemoryJsonSchema?: Record<string, unknown>
): Promise<AIMessage[]> {
  const contextMessages: AIMessage[] = []

  if (memoryConfig?.workingMemory && storage) {
    const workingMem = await storage.getWorkingMemory(input.threadId, 'thread')
    const prompt = buildWorkingMemoryPrompt(workingMem, workingMemoryJsonSchema)
    contextMessages.push({
      id: `wm-${randomUUID()}`,
      role: 'system',
      content: prompt,
      createdAt: new Date(),
    })
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
  },
  options?: {
    workingMemoryJsonSchema?: Record<string, unknown>
    workingMemorySchemaName?: string | null
    logger?: Logger
    schemaService?: SchemaService
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
        const existing =
          (await storage.getWorkingMemory(threadId, 'thread')) ?? {}
        const merged = deepMergeWorkingMemory(existing, parsed)

        if (options?.schemaService && options?.workingMemorySchemaName) {
          try {
            await options.schemaService.validateSchema(
              options.workingMemorySchemaName,
              merged
            )
          } catch (err) {
            options.logger?.warn(
              `Working memory validation failed: ${err instanceof Error ? err.message : String(err)}`
            )
          }
        }

        await storage.saveWorkingMemory(threadId, 'thread', merged)
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
