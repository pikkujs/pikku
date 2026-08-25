import type {
  PikkuRawWire,
  CoreUserSession,
  GetCredential,
} from '../../types/core.types.js'
import type {
  CoreAgent,
  AgentInput,
  AgentToolDef,
  AgentContentPart,
  AgentMessage,
  AgentStreamChannel,
  AgentStreamEvent,
  PikkuAgentMiddlewareHooks,
  SessionScope,
} from './agent.types.js'
import type { AgentRunnerParams } from '../../services/agent-runner-service.js'
import { PikkuError } from '../../errors/error-handler.js'
import {
  checkAuthPermissions,
  runPermissions,
  type PermissionWire,
} from '../../permissions.js'
import { AIProviderNotConfiguredError } from '../../errors/errors.js'
import { ForbiddenError, MissingSessionError } from '../../errors/errors.js'
import { verifyScopes } from '../../scopes.js'
import { pikkuState, getSingletonServices } from '../../pikku-state.js'
import { createMiddlewareSessionWireProps } from '../../services/user-session-service.js'
import type { SessionService } from '../../services/user-session-service.js'
import { randomUUID } from './agent-utils.js'
import { awaitPendingInterruptNote } from './agent-interrupt.js'
import { streamAgent } from './agent-stream.js'
import { runAgent } from './agent-runner.js'
import {
  resolveNamespace,
  ContextAwareRPCService,
} from '../../wirings/rpc/rpc-runner.js'
import { getOrCreatePackageSingletonServices } from '../../wirings/addon/addon-runner.js'
import {
  resolveMemoryServices,
  loadContextMessages,
  trimMessages,
} from './agent-memory.js'
import { resolveModelConfig } from './agent-model-config.js'

export type RunAgentParams = {
  sessionService?: SessionService<CoreUserSession>
  /** Credential accessor for the current request — used to read per-user overrides (e.g. AI_API_KEY). */
  getCredential?: GetCredential
  /** Ephemeral owner identity minted for a sessionless request; never client-supplied, never reused across requests. */
  anonymousOwnerResourceId?: string
}

export function resolveSessionPrincipal(
  params: RunAgentParams,
  sessionScope: SessionScope | undefined
): string | undefined {
  const session = params.sessionService?.get()
  if ((sessionScope ?? 'user') === 'org') {
    if (!session?.orgId) {
      throw new ForbiddenError(
        'This agent is org-scoped but the session has no organization'
      )
    }
    return session.orgId
  }
  return session?.userId
}

export function resolveOwnerResourceId(
  params: RunAgentParams,
  sessionScope: SessionScope | undefined,
  requestedResourceId: string
): string {
  const principal = resolveSessionPrincipal(params, sessionScope)

  if (!principal) {
    params.anonymousOwnerResourceId ??= `anon-${randomUUID()}`
    return params.anonymousOwnerResourceId
  }

  if (
    requestedResourceId === principal ||
    requestedResourceId.startsWith(`${principal}:`)
  ) {
    return requestedResourceId
  }
  return `${principal}:${requestedResourceId}`
}

export function assertResourcePrincipalOwner(
  params: RunAgentParams,
  sessionScope: SessionScope | undefined,
  storedResourceId: string,
  kind: 'thread' | 'run'
): void {
  const principal = resolveSessionPrincipal(params, sessionScope)
  if (!principal || !isOwnedByPrincipal(storedResourceId, principal)) {
    throw new ForbiddenError(`Not authorized to access this ${kind}`)
  }
}

export function agentSessionScope(agentName: string): SessionScope {
  return resolveAgent(agentName).agent.sessionScope ?? 'user'
}

export function assertResourceOwner(
  ownerResourceId: string,
  storedResourceId: string,
  kind: 'thread' | 'run'
): void {
  if (storedResourceId !== ownerResourceId) {
    throw new ForbiddenError(`Not authorized to access this ${kind}`)
  }
}

export function sessionPrincipals(
  session: { userId?: string; orgId?: string } | undefined
): string[] {
  return [session?.userId, session?.orgId].filter(
    (principal): principal is string => Boolean(principal)
  )
}

export function isOwnedByPrincipal(
  storedResourceId: string,
  principal: string
): boolean {
  return (
    storedResourceId === principal ||
    storedResourceId.startsWith(`${principal}:`)
  )
}

export function threadOwnerConstraint(
  session: { userId?: string; orgId?: string } | undefined
): string[] {
  return sessionPrincipals(session)
}

export function canAccessThread(
  storedResourceId: string,
  session: { userId?: string; orgId?: string } | undefined
): boolean {
  const principals = sessionPrincipals(session)
  if (principals.length === 0) return false
  return principals.some((principal) =>
    isOwnedByPrincipal(storedResourceId, principal)
  )
}

/**
 * An agent call with the fields nobody supplied left out.
 *
 * Omitted rather than passed as `undefined`, because an explicit `undefined`
 * overrides the agent's own declared default with nothing — a request that
 * names no model would silently unset the one the agent declares.
 *
 * Shared by the scaffolded `run` and `stream` routes, which receive the same
 * input and differ only in what they do with the reply. `agentName` is not part
 * of it: both callers pass that separately, because `rpc.agent.run` and
 * `rpc.agent.stream` take it as their first argument and type the rest
 * against it.
 */
export const agentCallOptions = (input: AgentInput): AgentInput => ({
  message: input.message,
  threadId: input.threadId,
  resourceId: input.resourceId,
  ...(input.attachments ? { attachments: input.attachments } : {}),
  ...(input.model ? { model: input.model } : {}),
  ...(input.temperature !== undefined
    ? { temperature: input.temperature }
    : {}),
  ...(input.context ? { context: input.context } : {}),
})

export type StreamAgentOptions = {
  requiresToolApproval?: 'all' | 'explicit' | false
  onRunCreated?: (runId: string) => void
}

export const APPROVAL_REQUIRED: unique symbol = Symbol(
  'pikku.ai.approvalRequired'
)

/**
 * In-process brand proving a credential request was produced by pikku itself and
 * not by tool output an attacker can influence. Never serialized — a value that
 * has crossed a JSON boundary has lost the brand and is treated as untrusted.
 */
export const CREDENTIAL_REQUIRED: unique symbol = Symbol(
  'pikku.ai.credentialRequired'
)

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
  channel: AgentStreamChannel
  options?: StreamAgentOptions
  delegateState?: { delegated: boolean }
}

export const resolveAgent = (
  agentName: string
): { agent: CoreAgent; packageName: string | null; resolvedName: string } => {
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

export async function assertAgentAuthorized(
  agent: CoreAgent,
  params: RunAgentParams,
  packageName: string | null
): Promise<void> {
  const session = params.sessionService
    ? await params.sessionService.get()
    : undefined

  if (agent.auth === true && !session) {
    throw new MissingSessionError('Authentication required')
  }

  verifyScopes(agent.scopes, session)

  const singletonServices = getSingletonServices()
  const wire = params.sessionService
    ? createMiddlewareSessionWireProps(params.sessionService)
    : { session: undefined }

  await runPermissions({
    funcPermissions: agent.permissions,
    services: singletonServices,
    wire: wire as PermissionWire,
    data: {},
    packageName,
    label: 'agent',
  })
}

export async function buildInstructions(
  agentName: string,
  packageName: string | null
): Promise<string> {
  const meta = pikkuState(packageName, 'agent', 'agentsMeta')[agentName]
  const parts: string[] = []
  if (meta?.role) parts.push(meta.role)
  if (meta?.personality) parts.push(meta.personality)
  if (meta?.goal) parts.push(meta.goal)
  let instructions = parts.join('\n\n')

  if (meta?.tools?.length || meta?.workflows?.length) {
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

  return instructions
}

export type ScopedChannel = AgentStreamChannel & {
  approvals: Array<{
    toolCallId: string
    toolName: string
    args: unknown
    reason?: string
    runId: string
  }>
}

export function createScopedChannel(
  parent: AgentStreamChannel,
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
    send: (event: AgentStreamEvent) => {
      if (event.type === 'done') return
      if (event.type === 'approval-request') {
        capturedApprovals.push({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          ...(event.reason !== undefined ? { reason: event.reason } : {}),
          runId: event.runId,
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
        parent.send({ ...event, agent: agentName, session } as AgentStreamEvent)
      } else {
        parent.send(event)
      }
    },
    setState: (s) => parent.setState(s),
    getState: () => parent.getState(),
    clearState: () => parent.clearState(),
    remote: (funcName: string, data?: unknown) => parent.remote(funcName, data),
  }
}

export function buildSubAgentRunInput(
  message: string,
  threadId: string,
  resourceId: string,
  parentContext?: string
): { message: string; threadId: string; resourceId: string; context?: string } {
  return { message, threadId, resourceId, context: parentContext }
}

export async function buildToolDefs(
  params: RunAgentParams,
  agentSessionMap: Map<string, string>,
  resourceId: string,
  agentName: string,
  packageName: string | null,
  streamContext?: StreamContext,
  agentMiddlewares?: PikkuAgentMiddlewareHooks[],
  agentMode?: 'delegate' | 'supervise',
  parentContext?: string
): Promise<{ tools: AgentToolDef[]; missingRpcs: string[] }> {
  const singletonServices = getSingletonServices()
  const tools: AgentToolDef[] = []
  const missingRpcs: string[] = []
  const approvalPolicy =
    streamContext?.options?.requiresToolApproval ?? 'explicit'

  const meta = pikkuState(packageName, 'agent', 'agentsMeta')[agentName]
  if (!meta) return { tools, missingRpcs }

  /**
   * A tool's description is what the model is told it does, and the main thing
   * it chooses between tools on. It does not survive into the meta registered at
   * boot: `description` is classed as a verbose field, so the bundled copy has
   * it stripped and `fnMeta.description` is always undefined — every tool was
   * being offered under its own bare name regardless of what its author wrote.
   *
   * `getFunctionsMeta` reads the verbose file and falls back to the minimal one,
   * recovering the authored description wherever the generated `.pikku`
   * directory is readable. Where it is not — no `metaService`, or a deployment
   * shipping only the stripped copy — tools fall back to their name, which is
   * what they did before this lookup existed.
   */
  const describedFunctions = await singletonServices.metaService
    ?.getFunctionsMeta()
    .catch(() => undefined)

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

      if (fnMeta.permissions?.length) {
        if (!session) continue
        const funcConfig = pikkuFuncId
          ? pikkuState(resolvedPkg, 'function', 'functions').get(pikkuFuncId)
          : undefined
        const allowed = await checkAuthPermissions(
          funcConfig?.permissions,
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

      let approvalDescriptionFn:
        ((input: unknown) => Promise<string>) | undefined
      if (needsApproval && pikkuFuncId) {
        const funcConfig = pikkuState(resolvedPkg, 'function', 'functions').get(
          pikkuFuncId
        )
        if (funcConfig?.approvalDescription) {
          const descFn = funcConfig.approvalDescription
          const capturedPkg = resolvedPkg
          const capturedAddonConfig = resolved?.addonConfig
          const capturedNamespace = toolName.includes(':')
            ? toolName.slice(0, toolName.indexOf(':'))
            : null
          approvalDescriptionFn = async (input: unknown) => {
            let services = singletonServices
            if (capturedPkg) {
              const addonInstance = capturedNamespace
                ? {
                    namespace: capturedNamespace,
                    secretOverrides: capturedAddonConfig?.secretOverrides,
                    variableOverrides: capturedAddonConfig?.variableOverrides,
                    credentialOverrides:
                      capturedAddonConfig?.credentialOverrides,
                    secretGrants: capturedAddonConfig?.secretGrants,
                    credentialGrants: capturedAddonConfig?.credentialGrants,
                    globalSecrets: capturedAddonConfig?.globalSecrets,
                    globalCredentials: capturedAddonConfig?.globalCredentials,
                  }
                : undefined
              services = await getOrCreatePackageSingletonServices(
                capturedPkg,
                singletonServices,
                addonInstance
              )
            }
            return descFn(services, input)
          }
        }
      }

      tools.push({
        name: toolName.replaceAll('@', '_').replaceAll(':', '__'),
        description:
          describedFunctions?.[pikkuFuncId]?.description ||
          fnMeta?.description ||
          toolName,
        inputSchema,
        needsApproval: needsApproval || undefined,
        approvalDescriptionFn,
        readonly: fnMeta?.readonly || undefined,
        execute: async (toolInput: unknown) => {
          const wire: PikkuRawWire = params.sessionService
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

      if (subMeta.permissions?.length) {
        if (!session) continue
        const subAgent = pikkuState(null, 'agent', 'agents').get(subAgentName)
        const allowed = await checkAuthPermissions(
          subAgent?.permissions,
          session,
          singletonServices
        )
        if (!allowed) continue
      }

      tools.push({
        name: subAgentName,
        description: subMeta.description,
        forwardsApproval: true,
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
            const effectiveChannel = isDelegate
              ? subChannel
              : {
                  ...subChannel,
                  send: (event: AgentStreamEvent) => {
                    if (
                      event.type === 'text-delta' ||
                      event.type === 'reasoning-delta'
                    )
                      return
                    subChannel.send(event)
                  },
                }
            const resultText = await streamAgent(
              subAgentName,
              buildSubAgentRunInput(
                message,
                threadId,
                resourceId,
                parentContext
              ),
              effectiveChannel,
              params,
              agentSessionMap,
              streamContext.options
            )
            if (subChannel.approvals.length > 0) {
              return {
                [APPROVAL_REQUIRED]: true,
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

          const result = await runAgent(
            subAgentName,
            buildSubAgentRunInput(message, threadId, resourceId, parentContext),
            params,
            agentSessionMap
          )
          if (
            result.status === 'suspended' &&
            result.pendingApprovals?.length
          ) {
            return {
              [APPROVAL_REQUIRED]: true,
              __approvalRequired: true,
              toolName: subAgentName,
              args: toolInput,
              agentRunId: result.runId,
              subApprovals: result.pendingApprovals.map((a) => ({
                toolCallId: a.toolCallId,
                toolName: a.toolName,
                args: a.args,
                reason: a.reason,
                runId: a.runId,
              })),
            }
          }
          return result.object ?? result.text
        },
      })
    }
  }

  const metaWorkflows = meta.workflows
  if (metaWorkflows?.length) {
    const workflowMetaMap = pikkuState(null, 'workflows', 'meta')
    const functionMeta = pikkuState(null, 'function', 'meta')
    const schemas = pikkuState(null, 'misc', 'schemas')

    for (const workflowName of metaWorkflows) {
      const wfMeta = workflowMetaMap[workflowName]
      if (!wfMeta) {
        missingRpcs.push(workflowName)
        continue
      }

      const inputSchemaName = wfMeta.pikkuFuncId
        ? functionMeta[wfMeta.pikkuFuncId]?.inputSchemaName
        : undefined
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

      tools.push({
        name: workflowName,
        description: wfMeta.description || workflowName,
        inputSchema,
        execute: async (toolInput: unknown) => {
          const workflowService = singletonServices.workflowService
          if (!workflowService) {
            throw new Error(
              `workflowService is not configured — cannot run workflow tool '${workflowName}'`
            )
          }
          const wire: PikkuRawWire = params.sessionService
            ? { ...createMiddlewareSessionWireProps(params.sessionService) }
            : {}
          const rpcService = new ContextAwareRPCService(
            singletonServices,
            wire,
            { sessionService: params.sessionService }
          )
          return workflowService.runToCompletion(
            workflowName,
            toolInput,
            rpcService,
            { wire: { type: 'internal' } }
          )
        },
      })
    }
  }

  for (const tool of tools) {
    const originalExecute = tool.execute
    tool.execute = async (toolInput: unknown) => {
      try {
        return await originalExecute(toolInput)
      } catch (err: any) {
        if (err?.payload?.error === 'missing_credential') {
          return {
            [CREDENTIAL_REQUIRED]: true,
            __credentialRequired: true,
            ...err.payload,
          }
        }
        singletonServices.logger.error(
          `AI agent tool '${tool.name}' threw during execute()`,
          err
        )
        throw err
      }
    }
  }

  const hasToolHooks = agentMiddlewares?.some(
    (mw) => mw.beforeToolCall || mw.afterToolCall
  )
  if (hasToolHooks) {
    for (const tool of tools) {
      const originalExecute = tool.execute
      tool.execute = async (toolInput: unknown) => {
        const toolCallId = randomUUID()
        let args = (toolInput ?? {}) as Record<string, unknown>

        for (const mw of agentMiddlewares!) {
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

        for (let i = agentMiddlewares!.length - 1; i >= 0; i--) {
          const mw = agentMiddlewares![i]
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
  input: AgentInput,
  params: RunAgentParams,
  agentSessionMap: Map<string, string>,
  streamContext?: StreamContext
) {
  const singletonServices = getSingletonServices()
  const { agent, packageName, resolvedName } = resolveAgent(agentName)

  await assertAgentAuthorized(agent, params, packageName)

  let agentRunner = singletonServices.agentRunner
  if (!agentRunner) {
    throw new AIProviderNotConfiguredError()
  }

  if (params.getCredential && agentRunner.withApiKey) {
    const aiCredential = await params.getCredential<{ apiKey: string }>(
      'AI_API_KEY'
    )
    if (aiCredential?.apiKey?.trim()) {
      agentRunner = agentRunner.withApiKey(aiCredential.apiKey)
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
    let thread: Awaited<ReturnType<typeof storage.getThread>> | null = null
    try {
      thread = await storage.getThread(threadId)
    } catch {
      thread = null
    }
    if (thread) {
      assertResourceOwner(input.resourceId, thread.resourceId, 'thread')
    } else {
      await storage.createThread(input.resourceId, { threadId })
    }
  }

  let messages: AgentMessage[] = []
  if (storage) {
    // knowledge: decisions/internals/agent-context-waits-for-a-tool-result-still-being-written.md
    await awaitPendingInterruptNote(threadId)
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

  const userContent: AgentMessage['content'] = input.attachments?.length
    ? [
        // knowledge: decisions/internals/an-empty-text-part-is-omitted-from-an-agent-message.md
        ...(input.message
          ? [{ type: 'text' as const, text: input.message }]
          : []),
        ...input.attachments.map(
          (a) =>
            ({
              type: a.type,
              data: a.data,
              url: a.url,
              mediaType: a.mediaType,
              ...(a.filename ? { filename: a.filename } : {}),
            }) as AgentContentPart
        ),
      ]
    : input.message

  const userMessage: AgentMessage = {
    id: randomUUID(),
    role: 'user',
    content: userContent,
    createdAt: new Date(),
  }

  const allMessages = [...contextMessages, ...messages, userMessage]
  const trimmedMessages = trimMessages(allMessages)

  const agentMiddlewares: PikkuAgentMiddlewareHooks[] =
    agent.agentMiddleware ?? []

  const { tools, missingRpcs } = await buildToolDefs(
    params,
    agentSessionMap,
    input.resourceId,
    resolvedName,
    packageName,
    streamContext,
    agentMiddlewares,
    agent.agentMode,
    input.context
  )

  let instructions = await buildInstructions(resolvedName, packageName)
  if (input.context) {
    instructions = `${instructions}\n\nCurrent context (use these identifiers directly in tool calls — do not ask the user for them):\n${input.context}`
  }

  const resolved = resolveModelConfig(resolvedName, agent)

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

  const runnerParams: AgentRunnerParams = {
    model: resolved.model,
    temperature: resolved.temperature,
    instructions,
    messages: trimmedMessages,
    tools,
    maxSteps: 1,
    toolChoice: agent.toolChoice ?? 'auto',
    providerOptions: agent.providerOptions,
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
