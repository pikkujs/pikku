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
import { checkAuthPermissions } from '../../permissions.js'
import { AIProviderNotConfiguredError } from '../../errors/errors.js'
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
  buildDynamicWorkflowInstructions,
  buildWorkflowTools,
} from './agent-dynamic-workflow.js'
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

export class ToolCredentialRequired extends PikkuError {
  public readonly toolCallId: string
  public readonly toolName: string
  public readonly args: unknown
  public readonly credentialName: string
  public readonly credentialType: 'oauth2' | 'apikey'
  public readonly connectUrl?: string

  constructor(
    toolCallId: string,
    toolName: string,
    args: unknown,
    credentialName: string,
    credentialType: 'oauth2' | 'apikey',
    connectUrl?: string
  ) {
    super(`Tool '${toolName}' requires credential '${credentialName}'`)
    this.toolCallId = toolCallId
    this.toolName = toolName
    this.args = args
    this.credentialName = credentialName
    this.credentialType = credentialType
    this.connectUrl = connectUrl
  }
}

export interface AddonCredentialRequirement {
  credentialName: string
  displayName: string
  addonNamespace: string
  type: 'wire'
  oauth2: boolean
}

/**
 * Given a list of tool names (e.g. ["oauth-api:getProfile"]),
 * returns the wire OAuth credentials required by their addons.
 */
export function getAddonCredentialRequirements(
  toolNames: string[]
): AddonCredentialRequirement[] {
  const requirements = new Map<string, AddonCredentialRequirement>()

  for (const toolName of toolNames) {
    if (!toolName.includes(':')) continue
    const resolved = resolveNamespace(toolName)
    if (!resolved) continue

    const credsMeta = pikkuState(resolved.package, 'package', 'credentialsMeta')
    if (!credsMeta) continue

    for (const [name, meta] of Object.entries(
      credsMeta as Record<string, any>
    )) {
      if (meta.type === 'wire' && meta.oauth2 && !requirements.has(name)) {
        requirements.set(name, {
          credentialName: name,
          displayName: meta.displayName ?? name,
          addonNamespace: toolName.split(':')[0],
          type: 'wire',
          oauth2: true,
        })
      }
    }
  }

  return [...requirements.values()]
}

export type StreamContext = {
  channel: AIStreamChannel
  options?: StreamAIAgentOptions
  delegateState?: { delegated: boolean }
}

export const resolveAgent = (
  agentName: string
): { agent: CoreAIAgent; packageName: string | null; resolvedName: string } => {
  if (!agentName) {
    console.error(
      '[resolveAgent] agentName is undefined/null! Stack:',
      new Error().stack
    )
    throw new Error('resolveAgent called with undefined agentName')
  }
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

export async function buildInstructions(
  agentName: string,
  packageName: string | null
): Promise<string> {
  const meta = pikkuState(packageName, 'agent', 'agentsMeta')[agentName]
  const rawInstructions = meta?.instructions ?? ''
  let instructions = Array.isArray(rawInstructions)
    ? rawInstructions.join('\n')
    : rawInstructions

  if (meta?.tools?.length) {
    instructions +=
      '\n\nTool usage rules:\n' +
      '- Act immediately with the information given. Do NOT ask clarifying questions unless a required field is truly missing.\n' +
      '- Only use fields defined in your tool schemas. Never mention or ask for fields that do not exist.\n' +
      '- Never fill optional fields with placeholder or zero values. Omit them entirely unless the user provides a real value.\n' +
      '- Never stuff unrelated information into the wrong field.\n' +
      '- Keep responses concise.'
  }

  if (meta?.agents?.length) {
    instructions +=
      '\n\nWhen calling a sub-agent, provide a short session name that describes the task. ' +
      'Use the same session name to continue a previous conversation with that agent. ' +
      'Use a new session name for a new independent task. ' +
      'When a request involves multiple actions for the same domain, combine them into a single sub-agent call rather than making separate calls.'
  }

  if (meta?.dynamicWorkflows && meta.tools?.length) {
    instructions += buildDynamicWorkflowInstructions(
      meta.tools,
      meta.dynamicWorkflows
    )
  }

  return instructions
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
        event.type === 'error' ||
        event.type === 'workflow-created'
      ) {
        parent.send({ ...event, agent: agentName, session } as AIStreamEvent)
      } else {
        parent.send(event)
      }
    },
  }
}

export async function buildToolDefs(
  params: RunAIAgentParams,
  agentSessionMap: Map<string, string>,
  resourceId: string,
  agentName: string,
  packageName: string | null,
  streamContext?: StreamContext,
  aiMiddlewares?: PikkuAIMiddlewareHooks[],
  agentMode?: 'delegate' | 'supervise'
): Promise<{ tools: AIAgentToolDef[]; missingRpcs: string[] }> {
  const singletonServices = getSingletonServices()
  const tools: AIAgentToolDef[] = []
  const missingRpcs: string[] = []
  const approvalPolicy =
    streamContext?.options?.requiresToolApproval ?? 'explicit'

  const meta = pikkuState(packageName, 'agent', 'agentsMeta')[agentName]
  if (!meta) return { tools, missingRpcs }

  // Get session for permission filtering
  const session = params.sessionService
    ? await params.sessionService.get()
    : null

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

      // Filter out tools the user doesn't have auth for
      if (session && fnMeta.permissions?.length) {
        const allowed = await checkAuthPermissions(
          fnMeta.permissions,
          session,
          singletonServices,
          resolvedPkg
        )
        if (!allowed) continue
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

      // Filter out sub-agents the user doesn't have auth for
      if (session && subMeta.permissions?.length) {
        const allowed = await checkAuthPermissions(
          subMeta.permissions,
          session,
          singletonServices
        )
        if (!allowed) continue
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
            threadId = randomUUID()
            agentSessionMap.set(sessionKey, threadId)
          }

          if (streamContext) {
            const isDelegate = agentMode !== 'supervise'
            if (isDelegate && streamContext.delegateState) {
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
            // In supervise mode, suppress sub-agent text from reaching the client.
            // Approvals still flow through normally.
            const effectiveChannel = isDelegate
              ? subChannel
              : {
                  ...subChannel,
                  send: (event: AIStreamEvent) => {
                    if (
                      event.type === 'text-delta' ||
                      event.type === 'reasoning-delta'
                    )
                      return
                    subChannel.send(event)
                  },
                }
            const resultText = await streamAIAgent(
              subAgentName,
              { message, threadId, resourceId },
              effectiveChannel,
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

          // No stream context: sub-agent runs non-streaming
          const result = await runAIAgent(
            subAgentName,
            { message, threadId, resourceId },
            params,
            agentSessionMap
          )
          if (
            result.status === 'suspended' &&
            result.pendingApprovals?.length
          ) {
            return {
              __approvalRequired: true,
              toolName: subAgentName,
              args: toolInput,
              agentRunId: result.runId,
              subApprovals: result.pendingApprovals.map((a) => ({
                toolCallId: a.toolCallId,
                toolName: a.toolName,
                args: a.args,
                runId: a.runId,
              })),
            }
          }
          return result.object ?? result.text
        },
      })
    }
  }

  if (meta.dynamicWorkflows) {
    const workflowTools = buildWorkflowTools(
      agentName,
      packageName,
      meta.tools ?? [],
      meta.dynamicWorkflows,
      streamContext,
      params.sessionService
    )
    tools.push(...workflowTools)
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
        } catch (err: any) {
          execError = err
          if (err?.payload?.error === 'missing_credential') throw err
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
    throw new AIProviderNotConfiguredError()
  }

  if (agent.dynamicWorkflows && singletonServices.workflowService) {
    const persisted =
      await singletonServices.workflowService.getAIGeneratedWorkflows(
        resolvedName
      )
    const allMeta = pikkuState(null, 'workflows', 'meta')
    for (const wf of persisted) {
      if (!allMeta[wf.workflowName]) {
        allMeta[wf.workflowName] = wf.graph
      }
    }
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

  const { tools, missingRpcs } = await buildToolDefs(
    params,
    agentSessionMap,
    input.resourceId,
    resolvedName,
    packageName,
    streamContext,
    aiMiddlewares,
    agent.agentMode
  )

  const instructions = await buildInstructions(resolvedName, packageName)

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
