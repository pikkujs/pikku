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
  AIStreamChannel,
  AIStreamEvent,
  PikkuAIMiddlewareHooks,
} from './ai-agent.types.js'
import type { AIAgentRunnerParams } from '../../services/ai-agent-runner-service.js'
import { PikkuError } from '../../errors/error-handler.js'
import { pikkuState } from '../../pikku-state.js'
import { runPikkuFunc } from '../../function/function-runner.js'
import {
  combineChannelMiddleware,
  wrapChannelWithMiddleware,
} from '../channel/channel-middleware-runner.js'
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

export type StreamAIAgentOptions = {
  requiresToolApproval?: 'all' | 'explicit' | false
}

export class ToolApprovalRequired extends PikkuError {
  public readonly toolCallId: string
  public readonly toolName: string
  public readonly args: unknown

  constructor(toolCallId: string, toolName: string, args: unknown) {
    super(`Tool '${toolName}' requires approval`)
    this.toolCallId = toolCallId
    this.toolName = toolName
    this.args = args
  }
}

export const addAIAgent = (
  agentName: string,
  agent: CoreAIAgent,
  packageName: string | null = null
) => {
  const agentsMeta = pikkuState(packageName, 'agent', 'agentsMeta')
  const agentMeta = agentsMeta[agentName]
  if (!agentMeta) {
    throw new Error(`AI agent metadata not found for '${agentName}'`)
  }
  const agents = pikkuState(packageName, 'agent', 'agents')
  if (agents.has(agentName)) {
    throw new Error(`AI agent already exists: ${agentName}`)
  }
  agents.set(agentName, agent)
}

type StreamContext = {
  channel: AIStreamChannel
  options?: StreamAIAgentOptions
}

const resolveAgent = (
  agentName: string
): { agent: CoreAIAgent; packageName: string | null; resolvedName: string } => {
  const mainAgent = pikkuState(null, 'agent', 'agents').get(agentName)
  if (mainAgent) {
    return { agent: mainAgent, packageName: null, resolvedName: agentName }
  }

  const colonIndex = agentName.indexOf(':')
  if (colonIndex !== -1) {
    const namespace = agentName.substring(0, colonIndex)
    const localName = agentName.substring(colonIndex + 1)
    const externalPackages = pikkuState(null, 'rpc', 'externalPackages')
    const pkgConfig = externalPackages.get(namespace)
    if (pkgConfig) {
      const extAgent = pikkuState(pkgConfig.package, 'agent', 'agents').get(
        localName
      )
      if (extAgent) {
        return {
          agent: extAgent,
          packageName: pkgConfig.package,
          resolvedName: localName,
        }
      }
    }
  }

  throw new Error(`AI agent not found: ${agentName}`)
}

async function prepareAgentRun(
  agentName: string,
  input: AIAgentInput,
  params: RunAIAgentParams,
  agentSessionMap: Map<string, string>,
  streamContext?: StreamContext
) {
  const { singletonServices } = params
  const { agent, packageName, resolvedName } = resolveAgent(agentName)

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
    id: randomUUID(),
    role: 'user',
    content: input.message,
    createdAt: new Date(),
  }

  const allMessages = [...contextMessages, ...messages, userMessage]
  const trimmedMessages = trimMessages(allMessages)

  const tools = buildToolDefs(
    agent,
    singletonServices,
    params,
    agentSessionMap,
    input.resourceId,
    streamContext
  )

  const instructions = buildInstructions(agent)

  const agentsMeta = pikkuState(packageName, 'agent', 'agentsMeta')
  const meta = agentsMeta[resolvedName]
  const outputSchemaName = meta?.outputSchema
  const outputSchema = outputSchemaName
    ? pikkuState(packageName, 'misc', 'schemas').get(outputSchemaName)
    : undefined

  const runnerParams: AIAgentRunnerParams = {
    model: agent.model,
    instructions,
    messages: trimmedMessages,
    tools,
    maxSteps: agent.maxSteps ?? 10,
    toolChoice: agent.toolChoice ?? 'auto',
    outputSchema,
  }

  return {
    agent,
    packageName,
    resolvedName,
    agentRunner,
    storage,
    vector,
    embedder,
    memoryConfig,
    threadId,
    userMessage,
    runnerParams,
  }
}

export async function streamAIAgent(
  agentName: string,
  input: AIAgentInput,
  channel: AIStreamChannel,
  params: RunAIAgentParams,
  agentSessionMap?: Map<string, string>,
  options?: StreamAIAgentOptions
): Promise<void> {
  const sessionMap = agentSessionMap ?? new Map<string, string>()
  const streamContext: StreamContext = { channel, options }

  const {
    agent,
    packageName,
    resolvedName,
    agentRunner,
    storage,
    vector,
    embedder,
    memoryConfig,
    threadId,
    userMessage,
    runnerParams,
  } = await prepareAgentRun(agentName, input, params, sessionMap, streamContext)

  const runId = `run-${randomUUID()}`
  const { singletonServices } = params
  const aiRunState = singletonServices.aiRunState

  const aiMiddlewares: PikkuAIMiddlewareHooks[] = agent.aiMiddleware ?? []

  let modifiedMessages = runnerParams.messages
  let modifiedInstructions = runnerParams.instructions
  for (const mw of aiMiddlewares) {
    if (mw.modifyInput) {
      const result = await mw.modifyInput(singletonServices, {
        messages: modifiedMessages,
        instructions: modifiedInstructions,
      })
      modifiedMessages = result.messages
      modifiedInstructions = result.instructions
    }
  }
  runnerParams.messages = modifiedMessages
  runnerParams.instructions = modifiedInstructions

  if (aiRunState) {
    await aiRunState.createRun({
      runId,
      agentName,
      threadId,
      resourceId: input.resourceId,
      status: 'running',
      usage: { inputTokens: 0, outputTokens: 0, model: agent.model },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }

  if (storage) {
    await storage.saveMessages(threadId, [userMessage])
  }

  const streamMiddleware = aiMiddlewares
    .filter((mw) => mw.modifyOutputStream)
    .map((mw) => {
      const state: Record<string, unknown> = {}
      const allEvents: AIStreamEvent[] = []
      return async (services: any, event: any, next: any) => {
        allEvents.push(event)
        const result = await mw.modifyOutputStream!(services, {
          event,
          allEvents,
          state,
        })
        if (result != null) await next(result)
      }
    })

  const agentsMeta = pikkuState(packageName, 'agent', 'agentsMeta')
  const meta = agentsMeta[resolvedName]
  const allChannelMiddleware = combineChannelMiddleware(
    'agent',
    `stream:${agentName}`,
    {
      wireInheritedChannelMiddleware: meta?.channelMiddleware,
      wireChannelMiddleware: [
        ...((agent.channelMiddleware as any[]) ?? []),
        ...streamMiddleware,
      ],
    }
  )

  const wrappedChannel =
    allChannelMiddleware.length > 0
      ? (wrapChannelWithMiddleware(
          { channel },
          singletonServices,
          allChannelMiddleware
        ).channel as AIStreamChannel)
      : channel

  const persistingChannel = createPersistingChannel(
    wrappedChannel,
    storage,
    threadId
  )

  try {
    await agentRunner.stream(runnerParams, persistingChannel)

    let outputText = persistingChannel.fullText
    let outputMessages = runnerParams.messages
    for (let i = aiMiddlewares.length - 1; i >= 0; i--) {
      const mw = aiMiddlewares[i]
      if (mw.modifyOutput) {
        const result = await mw.modifyOutput(singletonServices, {
          text: outputText,
          messages: outputMessages,
          usage: { inputTokens: 0, outputTokens: 0 },
        })
        outputText = result.text
        outputMessages = result.messages
      }
    }

    if (storage && memoryConfig?.workingMemory && outputText) {
      const parsed = parseWorkingMemory(outputText)
      if (parsed) {
        await storage.saveWorkingMemory(input.resourceId, 'resource', parsed)
      }
    }

    await updateSemanticEmbeddings(
      memoryConfig,
      vector,
      embedder,
      threadId,
      input.resourceId,
      input.message,
      outputText
    )

    if (aiRunState) {
      await aiRunState.updateRun(runId, { status: 'completed' })
    }
  } catch (err) {
    if (err instanceof ToolApprovalRequired) {
      if (aiRunState) {
        await aiRunState.updateRun(runId, {
          status: 'suspended',
          pendingApprovals: [
            {
              toolCallId: err.toolCallId,
              toolName: err.toolName,
              args: err.args,
            },
          ],
        })
      }
      channel.send({
        type: 'approval-request',
        id: err.toolCallId,
        toolName: err.toolName,
        args: err.args,
      })
      return
    }

    if (aiRunState) {
      await aiRunState.updateRun(runId, { status: 'failed' })
    }
    channel.send({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
    channel.send({ type: 'done' })
  }
}

export async function runAIAgent(
  agentName: string,
  input: AIAgentInput,
  params: RunAIAgentParams,
  agentSessionMap?: Map<string, string>
): Promise<AIAgentOutput> {
  const sessionMap = agentSessionMap ?? new Map<string, string>()

  const {
    agent,
    packageName: _packageName,
    resolvedName: _resolvedName,
    agentRunner,
    storage,
    vector,
    embedder,
    memoryConfig,
    threadId,
    userMessage,
    runnerParams,
  } = await prepareAgentRun(agentName, input, params, sessionMap)

  const { singletonServices } = params
  const aiMiddlewares: PikkuAIMiddlewareHooks[] = agent.aiMiddleware ?? []

  let modifiedMessages = runnerParams.messages
  let modifiedInstructions = runnerParams.instructions
  for (const mw of aiMiddlewares) {
    if (mw.modifyInput) {
      const result = await mw.modifyInput(singletonServices, {
        messages: modifiedMessages,
        instructions: modifiedInstructions,
      })
      modifiedMessages = result.messages
      modifiedInstructions = result.instructions
    }
  }
  runnerParams.messages = modifiedMessages
  runnerParams.instructions = modifiedInstructions

  const result = await agentRunner.run(runnerParams)

  const responseText = await saveMessages(
    storage,
    threadId,
    input.resourceId,
    memoryConfig,
    userMessage,
    result
  )

  let outputText = responseText
  let outputMessages = runnerParams.messages
  for (let i = aiMiddlewares.length - 1; i >= 0; i--) {
    const mw = aiMiddlewares[i]
    if (mw.modifyOutput) {
      const modResult = await mw.modifyOutput(singletonServices, {
        text: outputText,
        messages: outputMessages,
        usage: result.usage,
      })
      outputText = modResult.text
      outputMessages = modResult.messages
    }
  }

  await updateSemanticEmbeddings(
    memoryConfig,
    vector,
    embedder,
    threadId,
    input.resourceId,
    input.message,
    outputText
  )

  return {
    text: outputText,
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

type PersistingChannel = AIStreamChannel & { fullText: string }

function createPersistingChannel(
  parent: AIStreamChannel,
  storage: AIStorageService | undefined,
  threadId: string
): PersistingChannel {
  let fullText = ''
  const channel: PersistingChannel = {
    channelId: parent.channelId,
    openingData: parent.openingData,
    get state() {
      return parent.state
    },
    get fullText() {
      return fullText
    },
    close: () => parent.close(),
    send: (event: AIStreamEvent) => {
      if (storage) {
        switch (event.type) {
          case 'text-delta':
            fullText += event.text
            break
          case 'tool-call':
            storage.saveMessages(threadId, [
              {
                id: randomUUID(),
                role: 'assistant',
                toolCalls: [
                  {
                    id: randomUUID(),
                    name: event.toolName,
                    args: event.args as Record<string, unknown>,
                  },
                ],
                createdAt: new Date(),
              },
            ])
            break
          case 'tool-result':
            storage.saveMessages(threadId, [
              {
                id: randomUUID(),
                role: 'tool',
                toolResults: [
                  {
                    id: randomUUID(),
                    name: event.toolName,
                    result:
                      typeof event.result === 'string'
                        ? event.result
                        : JSON.stringify(event.result),
                  },
                ],
                createdAt: new Date(),
              },
            ])
            break
          case 'done':
            if (fullText) {
              storage.saveMessages(threadId, [
                {
                  id: randomUUID(),
                  role: 'assistant',
                  content: fullText,
                  createdAt: new Date(),
                },
              ])
            }
            break
        }
      }
      parent.send(event)
    },
  }
  return channel
}

function createScopedChannel(
  parent: AIStreamChannel,
  agentName: string,
  session: string
): AIStreamChannel {
  return {
    channelId: `${parent.channelId}:${agentName}:${session}`,
    openingData: parent.openingData,
    get state() {
      return parent.state
    },
    close: () => parent.close(),
    send: (event: AIStreamEvent) => {
      if (event.type === 'done') return
      if (
        event.type === 'text-delta' ||
        event.type === 'reasoning-delta' ||
        event.type === 'tool-call' ||
        event.type === 'tool-result' ||
        event.type === 'approval-request' ||
        event.type === 'usage' ||
        event.type === 'error'
      ) {
        parent.send({ ...event, agent: agentName, session } as AIStreamEvent)
      } else {
        parent.send(event)
      }
    },
  }
}

function buildToolDefs(
  agent: CoreAIAgent,
  singletonServices: CoreSingletonServices,
  params: RunAIAgentParams,
  agentSessionMap: Map<string, string>,
  resourceId: string,
  streamContext?: StreamContext
): AIAgentToolDef[] {
  const tools: AIAgentToolDef[] = []
  const approvalPolicy = streamContext?.options?.requiresToolApproval ?? false

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

      const needsApproval =
        approvalPolicy === 'all' ||
        (approvalPolicy === 'explicit' && fnMeta?.requiresApproval)

      tools.push({
        name: toolName,
        description: fnMeta?.description || fnMeta?.title || toolName,
        inputSchema: inputSchema || {},
        execute: async (toolInput: unknown) => {
          if (needsApproval) {
            throw new ToolApprovalRequired(randomUUID(), toolName, toolInput)
          }
          const sessionService = new PikkuSessionService()
          const wire: PikkuWire = {
            ...createMiddlewareSessionWireProps(sessionService),
          }
          return runPikkuFunc('agent', `tool:${toolName}`, pikkuFuncId, {
            singletonServices,
            createWireServices: params.createWireServices,
            data: () => toolInput,
            wire,
            sessionService,
          })
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

          if (streamContext) {
            const { channel } = streamContext
            channel.send({
              type: 'agent-call',
              agentName: subAgentName,
              session,
              input: message,
            })
            const subChannel = createScopedChannel(
              channel,
              subAgentName,
              session
            )
            await streamAIAgent(
              subAgentName,
              { message, threadId, resourceId },
              subChannel,
              params,
              agentSessionMap,
              streamContext.options
            )
            channel.send({
              type: 'agent-result',
              agentName: subAgentName,
              session,
              result: null,
            })
            return null
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
