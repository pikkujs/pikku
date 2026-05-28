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
import type { PikkuAIMiddlewareHooks } from './ai-agent.types.js'

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

export function isWorkingMemoryEnabled(
  memoryConfig: AIAgentMemoryConfig | undefined,
  storage: AIStorageService | undefined
): boolean {
  return !!memoryConfig?.workingMemory && !!storage
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
      'Only include durable facts you have actually derived or the user has confirmed. ' +
      'Do not output templates, placeholders, or narration. ' +
      'Only include changed fields. Leave unknown fields untouched. Set a field to null to delete it.'
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

  const workingMemoryStorage = isWorkingMemoryEnabled(memoryConfig, storage)
    ? storage
    : undefined

  if (workingMemoryStorage) {
    const workingMem = await workingMemoryStorage.getWorkingMemory(
      input.threadId,
      'thread'
    )
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
  userMessage: AIMessage | null | undefined,
  result: {
    text: string
    uiSpec?: unknown
    steps: {
      toolCalls?: {
        name: string
        args: Record<string, unknown>
        result: string
      }[]
    }[]
  }
): Promise<string> {
  const responseText = memoryConfig?.workingMemory
    ? extractWorkingMemory(result.text).cleanedText
    : result.text

  if (storage) {
    const newMessages: AIMessage[] = userMessage ? [userMessage] : []

    for (const step of result.steps) {
      if (step.toolCalls?.length) {
        const toolCallIds = step.toolCalls.map(() => randomUUID())
        newMessages.push({
          id: randomUUID(),
          role: 'assistant',
          toolCalls: step.toolCalls.map((tc, i) => ({
            id: toolCallIds[i],
            name: tc.name,
            args: tc.args,
          })),
          createdAt: new Date(),
        })
        newMessages.push({
          id: randomUUID(),
          role: 'tool',
          toolResults: step.toolCalls.map((tc, i) => ({
            id: toolCallIds[i],
            name: tc.name,
            result: tc.result,
          })),
          createdAt: new Date(),
        })
      }
    }

    const assistantContent =
      result.uiSpec != null
        ? [
            ...(responseText
              ? [{ type: 'text' as const, text: responseText }]
              : []),
            { type: 'generative-ui' as const, spec: result.uiSpec },
          ]
        : responseText

    newMessages.push({
      id: randomUUID(),
      role: 'assistant',
      content: assistantContent || undefined,
      createdAt: new Date(),
    })

    await storage.saveMessages(threadId, newMessages)
  }

  return responseText
}

export function trimMessages(
  messages: AIMessage[],
  maxTokenBudget: number = 100000
): AIMessage[] {
  const sanitized = sanitizeToolMessages(messages)

  let estimatedTokens = 0
  const result: AIMessage[] = []

  for (let i = sanitized.length - 1; i >= 0; i--) {
    const msg = sanitized[i]
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

function sanitizeToolMessages(messages: AIMessage[]): AIMessage[] {
  const result: AIMessage[] = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]

    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      const next = messages[i + 1]
      if (!next || next.role !== 'tool' || !next.toolResults?.length) {
        if (msg.content) {
          result.push({ ...msg, toolCalls: undefined })
        }
        continue
      }

      const toolCallIds = new Set(msg.toolCalls.map((tc) => tc.id))
      const resultIds = new Set(next.toolResults.map((tr) => tr.id))
      const allMatched = [...toolCallIds].every((id) => resultIds.has(id))

      if (!allMatched) {
        if (msg.content) {
          result.push({ ...msg, toolCalls: undefined })
        }
        result.push({
          ...next,
          toolResults:
            next.toolResults.filter((tr) => !toolCallIds.has(tr.id)) ||
            undefined,
        })
        i++
        continue
      }
    }

    result.push(msg)
  }

  return result.filter(
    (m) => m.role !== 'tool' || (m.toolResults && m.toolResults.length > 0)
  )
}

function estimateTokens(msg: AIMessage): number {
  let chars = 0
  if (msg.content) {
    if (typeof msg.content === 'string') {
      chars += msg.content.length
    } else {
      for (const part of msg.content) {
        if (part.type === 'text') chars += part.text.length
        else chars += 1000
      }
    }
  }
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

export function extractWorkingMemory(text: string): {
  workingMemory: Record<string, unknown> | null
  cleanedText: string
} {
  const workingMemory = parseWorkingMemory(text)
  return {
    workingMemory,
    cleanedText: workingMemory ? stripWorkingMemoryTags(text) : text,
  }
}

function getPendingWorkingMemoryPrefixLength(text: string): number {
  const prefixes = ['<working_memory>', '</working_memory>']
  const lastLt = text.lastIndexOf('<')
  if (lastLt === -1) return 0

  const suffix = text.slice(lastLt)
  for (const prefix of prefixes) {
    if (prefix.startsWith(suffix)) {
      return suffix.length
    }
  }

  return 0
}

export function stripWorkingMemoryForStreaming(text: string): string {
  let output = ''
  let cursor = 0

  while (cursor < text.length) {
    const openIndex = text.indexOf('<working_memory>', cursor)
    if (openIndex === -1) {
      const tail = text.slice(cursor)
      const pendingPrefixLength = getPendingWorkingMemoryPrefixLength(tail)
      output +=
        pendingPrefixLength > 0 ? tail.slice(0, -pendingPrefixLength) : tail
      return output
    }

    output += text.slice(cursor, openIndex)
    const closeIndex = text.indexOf('</working_memory>', openIndex)
    if (closeIndex === -1) {
      return output
    }

    cursor = closeIndex + '</working_memory>'.length
  }

  return output
}

export function createWorkingMemoryMiddleware(options: {
  storage?: AIStorageService
  threadId: string
  workingMemorySchemaName?: string | null
  logger?: Logger
  schemaService?: SchemaService
}): PikkuAIMiddlewareHooks<{
  rawText?: string
  emittedVisibleText?: string
}> {
  return {
    modifyOutputStream: async (_services, { event, state }) => {
      if (event.type !== 'text-delta') return event

      const rawText = `${state.rawText ?? ''}${event.text}`
      state.rawText = rawText

      const visibleText = stripWorkingMemoryForStreaming(rawText)
      const emittedVisibleText = state.emittedVisibleText ?? ''

      if (!visibleText.startsWith(emittedVisibleText)) {
        state.emittedVisibleText = visibleText
        return { ...event, text: visibleText }
      }

      const delta = visibleText.slice(emittedVisibleText.length)
      state.emittedVisibleText = visibleText
      if (!delta) return null
      return { ...event, text: delta }
    },
    modifyOutput: async (_services, { text, messages, usage }) => {
      const { workingMemory, cleanedText } = extractWorkingMemory(text)
      if (workingMemory && options.storage) {
        const existing =
          (await options.storage.getWorkingMemory(
            options.threadId,
            'thread'
          )) ?? {}
        const merged = deepMergeWorkingMemory(existing, workingMemory)

        let valid = true
        if (options.schemaService && options.workingMemorySchemaName) {
          try {
            await options.schemaService.validateSchema(
              options.workingMemorySchemaName,
              merged
            )
          } catch (err) {
            valid = false
            options.logger?.warn(
              `Working memory validation failed: ${err instanceof Error ? err.message : String(err)}`
            )
          }
        }

        // Only persist when the merged value passes schema validation —
        // saving invalid data would poison subsequent getWorkingMemory reads.
        if (valid) {
          await options.storage.saveWorkingMemory(
            options.threadId,
            'thread',
            merged
          )
        }
      }

      return {
        text: cleanedText,
        messages,
      }
    },
  }
}

export function getWorkingMemoryMiddleware(
  memoryConfig: AIAgentMemoryConfig | undefined,
  storage: AIStorageService | undefined,
  options: {
    threadId: string
    workingMemorySchemaName?: string | null
    logger?: Logger
    schemaService?: SchemaService
  }
): PikkuAIMiddlewareHooks[] {
  if (!isWorkingMemoryEnabled(memoryConfig, storage)) return []

  return [
    createWorkingMemoryMiddleware({
      storage,
      threadId: options.threadId,
      workingMemorySchemaName: options.workingMemorySchemaName,
      logger: options.logger,
      schemaService: options.schemaService,
    }),
  ]
}
