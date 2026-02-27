import type { PikkuWire, CoreUserSession } from '../../types/core.types.js'
import type {
  CoreAIAgent,
  AIAgentInput,
  AIAgentToolDef,
  AIMessage,
  AIStreamChannel,
  AIStreamEvent,
} from './ai-agent.types.js'
import type { AIAgentRunnerParams } from '../../services/ai-agent-runner-service.js'
import { PikkuError } from '../../errors/error-handler.js'
import {
  pikkuState,
  getSingletonServices,
  getCreateWireServices,
} from '../../pikku-state.js'
import { runPikkuFunc } from '../../function/function-runner.js'
import { createMiddlewareSessionWireProps } from '../../services/user-session-service.js'
import type { SessionService } from '../../services/user-session-service.js'
import { randomUUID } from 'crypto'

import {
  resolveMemoryServices,
  loadContextMessages,
  trimMessages,
} from './ai-agent-memory.js'
import { resolveModelConfig } from './ai-agent-model-config.js'

export type RunAIAgentParams = {
  sessionService?: SessionService<CoreUserSession>
}

export type StreamAIAgentOptions = {
  requiresToolApproval?: 'all' | 'explicit' | false
}

export class ToolApprovalRequired extends PikkuError {
  public readonly toolCallId: string
  public readonly toolName: string
  public readonly args: unknown
  public readonly reason?: string
  public readonly displayToolName?: string
  public readonly displayArgs?: unknown
  public readonly agentRunId?: string

  constructor(
    toolCallId: string,
    toolName: string,
    args: unknown,
    reason?: string,
    displayToolName?: string,
    displayArgs?: unknown,
    agentRunId?: string
  ) {
    super(`Tool '${displayToolName ?? toolName}' requires approval`)
    this.toolCallId = toolCallId
    this.toolName = toolName
    this.args = args
    this.reason = reason
    this.displayToolName = displayToolName
    this.displayArgs = displayArgs
    this.agentRunId = agentRunId
  }
}

export type StreamContext = {
  channel: AIStreamChannel
  options?: StreamAIAgentOptions
}

export const resolveAgent = (
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
    const addons = pikkuState(null, 'rpc', 'addons')
    const pkgConfig = addons.get(namespace)
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

export function buildInstructions(
  agentName: string,
  packageName: string | null
): string {
  const meta = pikkuState(packageName, 'agent', 'agentsMeta')[agentName]
  const instructions = meta?.instructions ?? ''
  const baseInstructions = Array.isArray(instructions)
    ? instructions.join('\n')
    : instructions

  return meta?.agents?.length
    ? baseInstructions +
        '\n\nWhen calling a sub-agent, provide a short session name that describes the task. ' +
        'Use the same session name to continue a previous conversation with that agent. ' +
        'Use a new session name for a new independent task.'
    : baseInstructions
}

export type ScopedChannel = AIStreamChannel & {
  approval: {
    toolCallId: string
    toolName: string
    args: unknown
    runId: string
  } | null
}

export function createScopedChannel(
  parent: AIStreamChannel,
  agentName: string,
  session: string
): ScopedChannel {
  let capturedApproval: ScopedChannel['approval'] = null

  return {
    channelId: `${parent.channelId}:${agentName}:${session}`,
    openingData: parent.openingData,
    get state() {
      return parent.state
    },
    get approval() {
      return capturedApproval
    },
    close: () => {},
    send: (event: AIStreamEvent) => {
      if (event.type === 'done') return
      if (event.type === 'approval-request') {
        capturedApproval = {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          runId: (event as any).runId,
        }
        return
      }
      if (
        event.type === 'step-start' ||
        event.type === 'text-delta' ||
        event.type === 'reasoning-delta' ||
        event.type === 'tool-call' ||
        event.type === 'tool-result' ||
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

export function buildToolDefs(
  params: RunAIAgentParams,
  agentSessionMap: Map<string, string>,
  resourceId: string,
  agentName: string,
  packageName: string | null,
  streamContext?: StreamContext
): { tools: AIAgentToolDef[]; missingRpcs: string[] } {
  const singletonServices = getSingletonServices()
  const tools: AIAgentToolDef[] = []
  const missingRpcs: string[] = []
  const approvalPolicy =
    streamContext?.options?.requiresToolApproval ?? 'explicit'

  const meta = pikkuState(packageName, 'agent', 'agentsMeta')[agentName]
  if (!meta) return { tools, missingRpcs }

  const metaTools = meta.tools
  const metaAgents = meta.agents

  if (metaTools?.length) {
    const functionMeta = pikkuState(null, 'function', 'meta')
    const schemas = pikkuState(null, 'misc', 'schemas')

    for (const toolName of metaTools) {
      const rpcMeta = pikkuState(null, 'rpc', 'meta')
      const pikkuFuncId = rpcMeta[toolName]
      if (!pikkuFuncId) {
        missingRpcs.push(toolName)
        continue
      }

      const fnMeta = functionMeta[pikkuFuncId]
      const inputSchemaName = fnMeta?.inputSchemaName
      let inputSchema = inputSchemaName
        ? schemas.get(inputSchemaName)
        : undefined
      if (
        !inputSchema ||
        (typeof inputSchema === 'object' &&
          inputSchema.type === 'object' &&
          !inputSchema.properties)
      ) {
        inputSchema = { type: 'object', properties: {} }
      }

      const needsApproval =
        approvalPolicy === 'all' ||
        (approvalPolicy === 'explicit' && fnMeta?.requiresApproval)

      tools.push({
        name: pikkuFuncId,
        description: fnMeta?.description || fnMeta?.title || toolName,
        inputSchema,
        needsApproval: needsApproval || undefined,
        execute: async (toolInput: unknown) => {
          const wire: PikkuWire = params.sessionService
            ? { ...createMiddlewareSessionWireProps(params.sessionService) }
            : {}
          return runPikkuFunc('agent', `tool:${pikkuFuncId}`, pikkuFuncId, {
            singletonServices,
            createWireServices: getCreateWireServices(),
            data: () => toolInput,
            wire,
            sessionService: params.sessionService,
          })
        },
      })
    }
  }

  if (metaAgents?.length) {
    const allAgentsMeta = pikkuState(null, 'agent', 'agentsMeta')

    for (const subAgentName of metaAgents) {
      const subMeta = allAgentsMeta[subAgentName]
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
            const { streamAIAgent } = await import('./ai-agent-stream.js')
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
            if (subChannel.approval) {
              return {
                __approvalRequired: true,
                toolName: subAgentName,
                args: toolInput,
                displayToolName: subChannel.approval.toolName,
                displayArgs: subChannel.approval.args,
                agentRunId: subChannel.approval.runId,
              }
            }
            channel.send({
              type: 'agent-result',
              agentName: subAgentName,
              session,
              result: null,
            })
            return null
          }

          const { runAIAgent } = await import('./ai-agent-runner.js')
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

  return { tools, missingRpcs }
}

export async function prepareAgentRun(
  agentName: string,
  input: AIAgentInput,
  params: RunAIAgentParams,
  agentSessionMap: Map<string, string>,
  streamContext?: StreamContext
) {
  const singletonServices = getSingletonServices()
  const { agent, packageName, resolvedName } = resolveAgent(agentName)

  const agentRunner = singletonServices.aiAgentRunner
  if (!agentRunner) {
    throw new Error('AIAgentRunnerService not available in singletonServices')
  }

  const { storage } = resolveMemoryServices(agent, singletonServices)
  const memoryConfig = agent.memory
  const threadId = input.threadId

  const agentsMeta = pikkuState(packageName, 'agent', 'agentsMeta')
  const meta = agentsMeta[resolvedName]
  const outputSchemaName = meta?.outputSchema
  const outputSchema = outputSchemaName
    ? pikkuState(packageName, 'misc', 'schemas').get(outputSchemaName)
    : undefined

  const workingMemorySchemaName = meta?.workingMemorySchema ?? null
  const workingMemoryJsonSchema = workingMemorySchemaName
    ? pikkuState(packageName, 'misc', 'schemas').get(workingMemorySchemaName)
    : undefined

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
    input,
    workingMemoryJsonSchema
  )

  const userMessage: AIMessage = {
    id: randomUUID(),
    role: 'user',
    content: input.message,
    createdAt: new Date(),
  }

  const allMessages = [...contextMessages, ...messages, userMessage]
  const trimmedMessages = trimMessages(allMessages)

  const { tools, missingRpcs } = buildToolDefs(
    params,
    agentSessionMap,
    input.resourceId,
    resolvedName,
    packageName,
    streamContext
  )

  const instructions = buildInstructions(resolvedName, packageName)

  const resolved = resolveModelConfig(resolvedName, agent)
  const maxSteps = resolved.maxSteps ?? 10

  const runnerParams: AIAgentRunnerParams = {
    model: resolved.model,
    temperature: resolved.temperature,
    instructions,
    messages: trimmedMessages,
    tools,
    maxSteps: 1,
    toolChoice: agent.toolChoice ?? 'auto',
    outputSchema,
  }

  return {
    agent,
    packageName,
    resolvedName,
    agentRunner,
    storage,
    memoryConfig,
    threadId,
    userMessage,
    runnerParams,
    maxSteps,
    missingRpcs,
    workingMemoryJsonSchema,
    workingMemorySchemaName,
  }
}
