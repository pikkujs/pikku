import {
  type CoreSingletonServices,
  type CoreServices,
  type CoreUserSession,
  type CreateWireServices,
  PikkuWire,
} from '../../types/core.types.js'
import type {
  CoreAIAgent,
  AIAgentInput,
  AIAgentOutput,
  AIAgentToolDef,
  AIAgentMemoryConfig,
  AIMessage,
} from './ai-agent.types.js'
import { pikkuState } from '../../pikku-state.js'
import { runPikkuFunc } from '../../function/function-runner.js'
import {
  PikkuSessionService,
  createMiddlewareSessionWireProps,
} from '../../services/user-session-service.js'
import { randomUUID } from 'crypto'
import type { AIStorageService } from '../../services/ai-storage-service.js'
import type { AIVectorService } from '../../services/ai-vector-service.js'
import type { AIEmbedderService } from '../../services/ai-embedder-service.js'

export type RunAIAgentParams = {
  singletonServices: CoreSingletonServices
  createWireServices?: CreateWireServices<
    CoreSingletonServices,
    CoreServices<CoreSingletonServices>,
    CoreUserSession
  >
}

export const addAIAgent = (agentName: string, agent: CoreAIAgent) => {
  const agentsMeta = pikkuState(null, 'agent', 'agentsMeta')
  const agentMeta = agentsMeta[agentName]
  if (!agentMeta) {
    throw new Error(`AI agent metadata not found for '${agentName}'`)
  }
  const agents = pikkuState(null, 'agent', 'agents')
  if (agents.has(agentName)) {
    throw new Error(`AI agent already exists: ${agentName}`)
  }
  agents.set(agentName, agent)
}

export async function runAIAgent(
  agentName: string,
  input: AIAgentInput,
  params: RunAIAgentParams,
  agentSessionMap?: Map<string, string>
): Promise<AIAgentOutput> {
  const { singletonServices } = params
  const agent = pikkuState(null, 'agent', 'agents').get(agentName)
  if (!agent) {
    throw new Error(`AI agent not found: ${agentName}`)
  }

  const agentRunner = singletonServices.aiAgentRunner
  if (!agentRunner) {
    throw new Error('AIAgentRunnerService not available in singletonServices')
  }

  const { storage, vector, embedder } = resolveMemoryServices(
    agent,
    singletonServices
  )
  const memoryConfig = agent.memory
  const threadId = input.threadId

  if (storage) {
    try {
      await storage.getThread(threadId)
    } catch {
      await storage.createThread(input.resourceId, { threadId })
    }
  }

  let messages: AIMessage[] = []
  if (storage) {
    messages = await storage.getMessages(threadId, {
      lastN: memoryConfig?.lastMessages ?? 20,
    })
  }

  const contextMessages = await loadContextMessages(
    memoryConfig,
    storage,
    vector,
    embedder,
    input
  )

  const userMessage: AIMessage = {
    id: `msg-${randomUUID()}`,
    role: 'user',
    content: input.message,
    createdAt: new Date(),
  }

  const allMessages = [...contextMessages, ...messages, userMessage]
  const trimmedMessages = trimMessages(allMessages)

  const sessionMap = agentSessionMap ?? new Map<string, string>()
  const tools = buildToolDefs(
    agent,
    singletonServices,
    params,
    sessionMap,
    input.resourceId
  )

  const instructions = buildInstructions(agent)

  const agentsMeta = pikkuState(null, 'agent', 'agentsMeta')
  const agentMeta = agentsMeta[agentName]
  const outputSchemaName = agentMeta?.outputSchema
  const outputSchema = outputSchemaName
    ? pikkuState(null, 'misc', 'schemas').get(outputSchemaName)
    : undefined

  const result = await agentRunner.run({
    model: agent.model,
    instructions,
    messages: trimmedMessages,
    tools,
    maxSteps: agent.maxSteps ?? 10,
    toolChoice: agent.toolChoice ?? 'auto',
    outputSchema,
  })

  const responseText = await saveMessages(
    storage,
    threadId,
    input.resourceId,
    memoryConfig,
    userMessage,
    result
  )

  await updateSemanticEmbeddings(
    memoryConfig,
    vector,
    embedder,
    threadId,
    input.resourceId,
    input.message,
    responseText
  )

  return {
    text: responseText,
    object: result.object,
    threadId,
    steps: result.steps,
    usage: result.usage,
  }
}

function resolveMemoryServices(
  agent: CoreAIAgent,
  singletonServices: CoreSingletonServices
): {
  storage: AIStorageService | undefined
  vector: AIVectorService | undefined
  embedder: AIEmbedderService | undefined
} {
  const memoryConfig = agent.memory
  const storage = memoryConfig?.storage
    ? (singletonServices as any)[memoryConfig.storage]
    : singletonServices.aiStorage
  const vector = memoryConfig?.vector
    ? (singletonServices as any)[memoryConfig.vector]
    : singletonServices.aiVector
  const embedder = memoryConfig?.embedder
    ? (singletonServices as any)[memoryConfig.embedder]
    : singletonServices.aiEmbedder
  return { storage, vector, embedder }
}

async function loadContextMessages(
  memoryConfig: AIAgentMemoryConfig | undefined,
  storage: AIStorageService | undefined,
  vector: AIVectorService | undefined,
  embedder: AIEmbedderService | undefined,
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

  if (
    memoryConfig?.semanticRecall !== false &&
    memoryConfig?.semanticRecall &&
    vector &&
    embedder
  ) {
    const queryVectors = await embedder.embed([input.message])
    const similar = await vector.search(queryVectors[0], {
      topK: memoryConfig.semanticRecall.topK ?? 3,
    })
    if (similar.length > 0) {
      const contextTexts = similar
        .map((s) => (s.metadata as any)?.content ?? '')
        .filter(Boolean)
      if (contextTexts.length > 0) {
        contextMessages.push({
          id: `sr-${randomUUID()}`,
          role: 'system',
          content: `Relevant context from past conversations:\n${contextTexts.join('\n---\n')}`,
          createdAt: new Date(),
        })
      }
    }
  }

  return contextMessages
}

function buildInstructions(agent: CoreAIAgent): string {
  const baseInstructions = Array.isArray(agent.instructions)
    ? agent.instructions.join('\n')
    : agent.instructions

  return agent.agents?.length
    ? baseInstructions +
        '\n\nWhen calling a sub-agent, provide a short session name that describes the task. ' +
        'Use the same session name to continue a previous conversation with that agent. ' +
        'Use a new session name for a new independent task.'
    : baseInstructions
}

async function saveMessages(
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
          id: `msg-${randomUUID()}`,
          role: 'assistant',
          toolCalls: step.toolCalls.map((tc) => ({
            id: `tc-${randomUUID()}`,
            name: tc.name,
            args: tc.args,
          })),
          createdAt: new Date(),
        })
        newMessages.push({
          id: `msg-${randomUUID()}`,
          role: 'tool',
          toolResults: step.toolCalls.map((tc) => ({
            id: `tr-${randomUUID()}`,
            name: tc.name,
            result: tc.result,
          })),
          createdAt: new Date(),
        })
      }
    }

    newMessages.push({
      id: `msg-${randomUUID()}`,
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

async function updateSemanticEmbeddings(
  memoryConfig: AIAgentMemoryConfig | undefined,
  vector: AIVectorService | undefined,
  embedder: AIEmbedderService | undefined,
  threadId: string,
  resourceId: string,
  message: string,
  responseText: string
): Promise<void> {
  if (
    memoryConfig?.semanticRecall !== false &&
    memoryConfig?.semanticRecall &&
    vector &&
    embedder
  ) {
    const textsToEmbed = [message, responseText].filter(Boolean)
    const vectors = await embedder.embed(textsToEmbed)
    await vector.upsert(
      vectors.map((v, i) => ({
        id: `embed-${randomUUID()}`,
        vector: v,
        metadata: {
          threadId,
          resourceId,
          content: textsToEmbed[i],
        },
      }))
    )
  }
}

function buildToolDefs(
  agent: CoreAIAgent,
  singletonServices: CoreSingletonServices,
  params: RunAIAgentParams,
  agentSessionMap: Map<string, string>,
  resourceId: string
): AIAgentToolDef[] {
  const tools: AIAgentToolDef[] = []

  if (agent.tools?.length) {
    const functionMeta = pikkuState(null, 'function', 'meta')
    const schemas = pikkuState(null, 'misc', 'schemas')

    for (const toolName of agent.tools) {
      const rpcMeta = pikkuState(null, 'rpc', 'meta')
      const pikkuFuncId = rpcMeta[toolName]
      if (!pikkuFuncId) {
        singletonServices.logger.warn(
          `AI agent tool '${toolName}' not found in RPC registry`
        )
        continue
      }

      const fnMeta = functionMeta[pikkuFuncId]
      const inputSchemaName = fnMeta?.inputSchemaName
      const inputSchema = inputSchemaName ? schemas.get(inputSchemaName) : {}

      tools.push({
        name: toolName,
        description: fnMeta?.description || fnMeta?.title || toolName,
        inputSchema: inputSchema || {},
        execute: async (toolInput: unknown) => {
          const sessionService = new PikkuSessionService()
          const wire: PikkuWire = {
            ...createMiddlewareSessionWireProps(sessionService),
          }
          const result = await runPikkuFunc(
            'agent',
            `tool:${toolName}`,
            pikkuFuncId,
            {
              singletonServices,
              createWireServices: params.createWireServices,
              data: () => toolInput,
              wire,
              sessionService,
            }
          )
          return result
        },
      })
    }
  }

  if (agent.agents?.length) {
    const agentsMeta = pikkuState(null, 'agent', 'agentsMeta')

    for (const subAgentName of agent.agents) {
      const subMeta = agentsMeta[subAgentName]
      if (!subMeta) {
        singletonServices.logger.warn(
          `Sub-agent '${subAgentName}' not found in agent registry`
        )
        continue
      }

      tools.push({
        name: subAgentName,
        description: subMeta.description,
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            session: {
              type: 'string',
              description: 'Short session label for thread continuity',
            },
          },
          required: ['message', 'session'],
        },
        execute: async (toolInput: unknown) => {
          const { message, session } = toolInput as {
            message: string
            session: string
          }
          const sessionKey = `${subAgentName}::${session}`
          let threadId = agentSessionMap.get(sessionKey)
          if (!threadId) {
            threadId = `${subAgentName}-${session}-${Date.now()}`
            agentSessionMap.set(sessionKey, threadId)
          }
          const result = await runAIAgent(
            subAgentName,
            { message, threadId, resourceId },
            params,
            agentSessionMap
          )
          return result.object ?? result.text
        },
      })
    }
  }

  return tools
}

function trimMessages(
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

function parseWorkingMemory(text: string): Record<string, unknown> | null {
  const match = text.match(/<working_memory>([\s\S]*?)<\/working_memory>/)
  if (!match) return null
  try {
    return JSON.parse(match[1].trim())
  } catch {
    return null
  }
}

function stripWorkingMemoryTags(text: string): string {
  return text.replace(/<working_memory>[\s\S]*?<\/working_memory>/g, '').trim()
}

export const getAIAgents = () => {
  return pikkuState(null, 'agent', 'agents')
}

export const getAIAgentsMeta = () => {
  return pikkuState(null, 'agent', 'agentsMeta')
}
