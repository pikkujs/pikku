import type { PikkuWire, CoreUserSession } from '../../types/core.types.js'
import type {
  CoreAIAgent,
  AIAgentInput,
  AIAgentToolDef,
  AIContentPart,
  AIMessage,
  AIStreamChannel,
  AIStreamEvent,
  PikkuAIMiddlewareHooks,
} from './ai-agent.types.js'
import type { AIAgentRunnerParams } from '../../services/ai-agent-runner-service.js'
import { PikkuError } from '../../errors/error-handler.js'
import { pikkuState, getSingletonServices } from '../../pikku-state.js'
import { createMiddlewareSessionWireProps } from '../../services/user-session-service.js'
import type { SessionService } from '../../services/user-session-service.js'
import { randomUUID } from 'crypto'
import { streamAIAgent } from './ai-agent-stream.js'
import { runAIAgent } from './ai-agent-runner.js'
import {
  resolveNamespace,
  ContextAwareRPCService,
} from '../../wirings/rpc/rpc-runner.js'

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
  public reason?: string
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
  delegateState?: { delegated: boolean }
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
    const addons = pikkuState(null, 'addons', 'packages')
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
        'Use a new session name for a new independent task. ' +
        'When a request involves multiple actions for the same domain, combine them into a single sub-agent call rather than making separate calls.'
    : baseInstructions
}

export type ScopedChannel = AIStreamChannel & {
  approvals: Array<{
    toolCallId: string
    toolName: string
    args: unknown
    runId: string
  }>
}

export function createScopedChannel(
  parent: AIStreamChannel,
  agentName: string,
  session: string
): ScopedChannel {
  const capturedApprovals: ScopedChannel['approvals'] = []

  return {
    channelId: `${parent.channelId}:${agentName}:${session}`,
    openingData: parent.openingData,
    get state() {
      return parent.state
    },
    get approvals() {
      return capturedApprovals
    },
    close: () => {},
    sendBinary: (data) => parent.sendBinary(data),
    send: (event: AIStreamEvent) => {
      if (event.type === 'done') return
      if (event.type === 'approval-request') {
        capturedApprovals.push({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          runId: (event as any).runId,
        })
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
  streamContext?: StreamContext,
  aiMiddlewares?: PikkuAIMiddlewareHooks[],
  agentMode?: 'delegate' | 'supervise'
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
    for (const toolName of metaTools) {
      let fnMeta: any
      let resolvedPkg: string | null = null
      let schemas: Map<string, any>

      const resolved = toolName.includes(':')
        ? resolveNamespace(toolName)
        : null

      let pikkuFuncId: string | undefined

      if (resolved) {
        resolvedPkg = resolved.package
        pikkuFuncId = resolved.function
        fnMeta = pikkuState(resolvedPkg, 'function', 'meta')[pikkuFuncId]
        schemas = pikkuState(resolvedPkg, 'misc', 'schemas')
      } else {
        const rpcMeta = pikkuState(null, 'rpc', 'meta')
        pikkuFuncId = rpcMeta[toolName]
        if (!pikkuFuncId) {
          missingRpcs.push(toolName)
          continue
        }
        fnMeta = pikkuState(null, 'function', 'meta')[pikkuFuncId]
        schemas = pikkuState(null, 'misc', 'schemas')
      }

      if (!fnMeta) {
        missingRpcs.push(toolName)
        continue
      }

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
        (approvalPolicy === 'explicit' && fnMeta?.approvalRequired)

      // Build approvalDescriptionFn if the function has an approvalDescription configured
      let approvalDescriptionFn:
        | ((input: unknown) => Promise<string>)
        | undefined
      if (needsApproval && pikkuFuncId) {
        const funcConfig = pikkuState(resolvedPkg, 'function', 'functions').get(
          pikkuFuncId
        )
        if (funcConfig?.approvalDescription) {
          const descFn = funcConfig.approvalDescription
          const capturedPkg = resolvedPkg
          approvalDescriptionFn = async (input: unknown) => {
            let services = singletonServices
            if (capturedPkg) {
              const pkgServices = pikkuState(
                capturedPkg,
                'package',
                'singletonServices'
              )
              if (pkgServices) {
                services = pkgServices
              }
            }
            return descFn(services, input)
          }
        }
      }

      tools.push({
        name: toolName.replaceAll(':', '__'),
        description: fnMeta?.description || fnMeta?.title || toolName,
        inputSchema,
        needsApproval: needsApproval || undefined,
        approvalDescriptionFn,
        execute: async (toolInput: unknown) => {
          const wire: PikkuWire = params.sessionService
            ? { ...createMiddlewareSessionWireProps(params.sessionService) }
            : {}
          const rpcService = new ContextAwareRPCService(
            singletonServices,
            wire,
            { sessionService: params.sessionService }
          )
          return rpcService.rpc(toolName, toolInput)
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

          if (streamContext && agentMode !== 'supervise') {
            // Delegate mode (default): sub-agent streams directly to client
            if (streamContext.delegateState) {
              streamContext.delegateState.delegated = true
            }
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
            const resultText = await streamAIAgent(
              subAgentName,
              { message, threadId, resourceId },
              subChannel,
              params,
              agentSessionMap,
              streamContext.options
            )
            if (subChannel.approvals.length > 0) {
              return {
                __approvalRequired: true,
                toolName: subAgentName,
                args: toolInput,
                agentRunId: subChannel.approvals[0].runId,
                subApprovals: subChannel.approvals,
              }
            }
            channel.send({
              type: 'agent-result',
              agentName: subAgentName,
              session,
              result: resultText,
            })
            return resultText
          }

          // Supervise mode (or no stream context): sub-agent runs non-streaming,
          // returns full result to parent for the parent to process
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

  const hasToolHooks = aiMiddlewares?.some(
    (mw) => mw.beforeToolCall || mw.afterToolCall
  )
  if (hasToolHooks) {
    for (const tool of tools) {
      const originalExecute = tool.execute
      tool.execute = async (toolInput: unknown) => {
        const toolCallId = randomUUID()
        let args = (toolInput ?? {}) as Record<string, unknown>

        for (const mw of aiMiddlewares!) {
          if (mw.beforeToolCall) {
            const beforeResult = await mw.beforeToolCall(singletonServices, {
              toolName: tool.name,
              toolCallId,
              args,
            })
            if (beforeResult && 'args' in beforeResult) {
              args = beforeResult.args
            }
          }
        }

        const startTime = Date.now()
        let result: unknown
        let execError: unknown
        try {
          result = await originalExecute(args)
        } catch (err) {
          execError = err
          result = err instanceof Error ? err.message : String(err)
        }
        const durationMs = Date.now() - startTime

        for (let i = aiMiddlewares!.length - 1; i >= 0; i--) {
          const mw = aiMiddlewares![i]
          if (mw.afterToolCall) {
            const afterResult = await mw.afterToolCall(singletonServices, {
              toolName: tool.name,
              toolCallId,
              args,
              result,
              durationMs,
            })
            if (afterResult && 'result' in afterResult) {
              result = afterResult.result
            }
          }
        }

        if (execError) throw execError
        return result
      }
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

  const userContent: AIMessage['content'] = input.attachments?.length
    ? [
        { type: 'text' as const, text: input.message },
        ...input.attachments.map(
          (a) =>
            ({
              type: a.type,
              data: a.data,
              url: a.url,
              mediaType: a.mediaType,
              ...(a.filename ? { filename: a.filename } : {}),
            }) as AIContentPart
        ),
      ]
    : input.message

  const userMessage: AIMessage = {
    id: randomUUID(),
    role: 'user',
    content: userContent,
    createdAt: new Date(),
  }

  const allMessages = [...contextMessages, ...messages, userMessage]
  const trimmedMessages = trimMessages(allMessages)

  const aiMiddlewares: PikkuAIMiddlewareHooks[] = agent.aiMiddleware ?? []

  const { tools, missingRpcs } = buildToolDefs(
    params,
    agentSessionMap,
    input.resourceId,
    resolvedName,
    packageName,
    streamContext,
    aiMiddlewares,
    agent.agentMode
  )

  const instructions = buildInstructions(resolvedName, packageName)

  const resolved = resolveModelConfig(resolvedName, agent)

  // Per-request overrides
  if (input.model) {
    resolved.model = resolveModelConfig(resolvedName, {
      ...agent,
      model: input.model,
    }).model
  }
  if (input.temperature !== undefined) {
    resolved.temperature = input.temperature
  }

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
