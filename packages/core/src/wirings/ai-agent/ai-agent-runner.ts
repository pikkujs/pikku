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
  AIMessage,
} from './ai-agent.types.js'
import type {
  CorePikkuFunctionConfig,
  CorePikkuFunctionSessionless,
} from '../../function/functions.types.js'
import { pikkuState } from '../../pikku-state.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import {
  PikkuSessionService,
  createMiddlewareSessionWireProps,
} from '../../services/user-session-service.js'

export type RunAIAgentParams = {
  singletonServices: CoreSingletonServices
  createWireServices?: CreateWireServices<
    CoreSingletonServices,
    CoreServices<CoreSingletonServices>,
    CoreUserSession
  >
}

export const wireAIAgent = <
  PikkuFunctionConfig extends CorePikkuFunctionConfig<
    CorePikkuFunctionSessionless<any, any>
  > = CorePikkuFunctionConfig<CorePikkuFunctionSessionless<any, any>>,
>(
  agent: CoreAIAgent<PikkuFunctionConfig>
) => {
  const agentsMeta = pikkuState(null, 'agent', 'agentsMeta')
  const agentMeta = agentsMeta[agent.name]
  if (!agentMeta) {
    throw new Error(`AI agent metadata not found for '${agent.name}'`)
  }
  if (agent.func && agentMeta.pikkuFuncId) {
    addFunction(agentMeta.pikkuFuncId, agent.func as any)
  }
  const agents = pikkuState(null, 'agent', 'agents')
  if (agents.has(agent.name)) {
    throw new Error(`AI agent already exists: ${agent.name}`)
  }
  agents.set(agent.name, agent)
}

export async function runAIAgent(
  agentName: string,
  input: AIAgentInput,
  params: RunAIAgentParams
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

  let threadId = input.threadId

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

  const contextMessages: AIMessage[] = []

  if (memoryConfig?.workingMemory && storage) {
    const workingMem = await storage.getWorkingMemory(
      input.resourceId,
      'resource'
    )
    if (workingMem) {
      contextMessages.push({
        id: `wm-${Date.now()}`,
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
          id: `sr-${Date.now()}`,
          role: 'system',
          content: `Relevant context from past conversations:\n${contextTexts.join('\n---\n')}`,
          createdAt: new Date(),
        })
      }
    }
  }

  const userMessage: AIMessage = {
    id: `msg-${Date.now()}-user`,
    role: 'user',
    content: input.message,
    createdAt: new Date(),
  }

  const allMessages = [...contextMessages, ...messages, userMessage]
  const trimmedMessages = trimMessages(allMessages)

  const tools = buildToolDefs(agent, singletonServices, params)

  const instructions = Array.isArray(agent.instructions)
    ? agent.instructions.join('\n')
    : agent.instructions

  const result = await agentRunner.run({
    model: agent.model,
    instructions,
    messages: trimmedMessages,
    tools,
    maxSteps: agent.maxSteps ?? 10,
    toolChoice: agent.toolChoice ?? 'auto',
  })

  let responseText = result.text

  if (storage) {
    const newMessages: AIMessage[] = [userMessage]

    for (const step of result.steps) {
      if (step.toolCalls?.length) {
        newMessages.push({
          id: `msg-${Date.now()}-assistant-tc`,
          role: 'assistant',
          toolCalls: step.toolCalls.map((tc) => ({
            id: `tc-${tc.name}-${Date.now()}`,
            name: tc.name,
            args: tc.args,
          })),
          createdAt: new Date(),
        })
        newMessages.push({
          id: `msg-${Date.now()}-tool`,
          role: 'tool',
          toolResults: step.toolCalls.map((tc) => ({
            id: `tr-${tc.name}-${Date.now()}`,
            name: tc.name,
            result: tc.result,
          })),
          createdAt: new Date(),
        })
      }
    }

    newMessages.push({
      id: `msg-${Date.now()}-assistant`,
      role: 'assistant',
      content: responseText,
      createdAt: new Date(),
    })

    await storage.saveMessages(threadId, newMessages)

    if (memoryConfig?.workingMemory) {
      const parsed = parseWorkingMemory(responseText)
      if (parsed) {
        await storage.saveWorkingMemory(input.resourceId, 'resource', parsed)
        responseText = stripWorkingMemoryTags(responseText)
      }
    }
  }

  if (
    memoryConfig?.semanticRecall !== false &&
    memoryConfig?.semanticRecall &&
    vector &&
    embedder
  ) {
    const textsToEmbed = [input.message, responseText].filter(Boolean)
    const vectors = await embedder.embed(textsToEmbed)
    await vector.upsert(
      vectors.map((v, i) => ({
        id: `embed-${Date.now()}-${i}`,
        vector: v,
        metadata: {
          threadId,
          resourceId: input.resourceId,
          content: textsToEmbed[i],
        },
      }))
    )
  }

  return {
    text: responseText,
    threadId,
    steps: result.steps,
    usage: result.usage,
  }
}

function buildToolDefs(
  agent: CoreAIAgent,
  singletonServices: CoreSingletonServices,
  params: RunAIAgentParams
): AIAgentToolDef[] {
  if (!agent.tools?.length) return []

  const functionMeta = pikkuState(null, 'function', 'meta')
  const schemas = pikkuState(null, 'misc', 'schemas')

  return agent.tools
    .map((toolName) => {
      const rpcMeta = pikkuState(null, 'rpc', 'meta')
      const pikkuFuncId = rpcMeta[toolName]
      if (!pikkuFuncId) {
        singletonServices.logger.warn(
          `AI agent tool '${toolName}' not found in RPC registry`
        )
        return null
      }

      const fnMeta = functionMeta[pikkuFuncId]
      const inputSchemaName = fnMeta?.inputSchemaName
      const inputSchema = inputSchemaName ? schemas.get(inputSchemaName) : {}

      const toolDef: AIAgentToolDef = {
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
      }
      return toolDef
    })
    .filter((t): t is AIAgentToolDef => t !== null)
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
