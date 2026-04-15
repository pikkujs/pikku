import { pikkuState } from '@pikku/core/internal'
import type { MetaService } from '@pikku/core/services'
import type { ChannelMeta as CoreChannelMeta } from '@pikku/core/channel'
import type { WorkflowsMeta } from '@pikku/core/workflow'
import type {
  FunctionsMeta,
  AgentsMeta,
  AgentMeta,
  MiddlewareGroupsMeta,
  PermissionsGroupsMeta,
  MCPMeta,
  RPCMetaRecord,
  ServicesMetaRecord,
  ServiceMeta,
  MiddlewareMeta,
  PermissionMeta,
  FunctionMeta,
  MiddlewareDefinitionMeta,
  MiddlewareInstanceMeta,
  GroupMeta,
  PermissionDefinitionMeta,
} from '@pikku/core/services'

export type {
  FunctionsMeta,
  AgentsMeta,
  AgentMeta,
  MiddlewareGroupsMeta,
  PermissionsGroupsMeta,
  MCPMeta,
  RPCMetaRecord,
  ServicesMetaRecord,
  ServiceMeta,
  MiddlewareMeta,
  PermissionMeta,
  FunctionMeta,
  MiddlewareDefinitionMeta,
  MiddlewareInstanceMeta,
  GroupMeta,
  PermissionDefinitionMeta,
}

export interface WiringRef {
  type: string
  id: string
  name: string
}

export interface FunctionUsedBy {
  transports: WiringRef[]
  jobs: WiringRef[]
  workflows: Array<{ id: string; name: string }>
}

export interface HttpRouteMeta {
  pikkuFuncId: string
  route: string
  method: string
  params?: string[]
  query?: string[]
  summary?: string
  description?: string
  tags?: string[]
  errors?: string[]
  auth?: boolean
  sse?: boolean
  middleware?: MiddlewareMeta[]
  permissions?: PermissionMeta[]
  inputSchemaName?: string
  outputSchemaName?: string
}

export interface CliOptionMeta {
  description: string
  short?: string
  default?: unknown
  choices?: unknown[]
  array?: boolean
  required?: boolean
}

export interface CliPositionalMeta {
  name: string
  required: boolean
  variadic?: boolean
}

export interface CliCommandMeta {
  pikkuFuncId: string
  description?: string
  summary?: string
  parameters?: string
  positionals: CliPositionalMeta[]
  options: Record<string, CliOptionMeta>
  renderName?: string
  subcommands?: Record<string, CliCommandMeta>
  isDefault?: boolean
}

export interface CliProgramMeta {
  wireId: string
  program: string
  description?: string
  commands: Record<string, CliCommandMeta>
  options: Record<string, CliOptionMeta>
  defaultRenderName?: string
}

export interface CliRendererMeta {
  name: string
  exportedName?: string
  filePath: string
  services: { optimized: boolean; services: string[] }
}

export interface ChannelMessageMeta {
  pikkuFuncId: string
  summary?: string
  description?: string
  errors?: string[]
  tags?: string[]
  middleware?: MiddlewareMeta[]
  permissions?: PermissionMeta[]
}

export interface ChannelMeta {
  name: string
  route: string
  params?: string[]
  query?: string[]
  input: string | null
  connect: ChannelMessageMeta | null
  disconnect: ChannelMessageMeta | null
  message: ChannelMessageMeta | null
  messageWirings: Record<string, Record<string, ChannelMessageMeta>>
  summary?: string
  description?: string
  errors?: string[]
  tags?: string[]
  middleware?: MiddlewareMeta[]
  permissions?: PermissionMeta[]
}

export interface QueueWorkerMeta {
  pikkuFuncId: string
  queueName: string
  summary?: string
  description?: string
  tags?: string[]
  middleware?: MiddlewareMeta[]
  permissions?: PermissionMeta[]
  config?: Record<string, unknown>
}

export interface SchedulerTaskMeta {
  pikkuFuncId: string
  name: string
  schedule: string
  summary?: string
  description?: string
  tags?: string[]
  middleware?: MiddlewareMeta[]
  permissions?: PermissionMeta[]
}

export interface RpcMeta {
  pikkuFuncId: string
}

export interface McpItemMeta {
  pikkuFuncId: string
  method: 'resource' | 'tool' | 'prompt'
  name?: string
  wireId?: string
  description?: string
  summary?: string
  tags?: string[]
  errors?: string[]
  uri?: string
  arguments?: Array<{ name: string; description?: string; required?: boolean }>
  middleware?: MiddlewareMeta[]
  permissions?: PermissionMeta[]
  inputSchemaName?: string
  outputSchemaName?: string
}

export interface TriggerMeta {
  pikkuFuncId: string
  name: string
  summary?: string
  description?: string
  tags?: string[]
  middleware?: MiddlewareMeta[]
  permissions?: PermissionMeta[]
}

export interface TriggerSourceMeta {
  name: string
  pikkuFuncId: string
  packageName?: string
  summary?: string
  description?: string
}

export interface MetaCounts {
  functions: number
  workflows: number
  httpRoutes: number
  channels: number
  mcpTools: number
  schedulers: number
  queues: number
  cliCommands: number
  rpcMethods: number
  triggers: number
  triggerSources: number
  agents: number
  secrets: number
  variables: number
}

export interface PikkuMetaState {
  functions: FunctionMeta[]
  httpMeta: HttpRouteMeta[]
  cliMeta: CliProgramMeta[]
  cliRenderers: Record<string, CliRendererMeta>
  channelsMeta: Record<string, ChannelMeta>
  queueMeta: Record<string, QueueWorkerMeta>
  schedulerMeta: Record<string, SchedulerTaskMeta>
  rpcMeta: Record<string, RpcMeta>
  mcpMeta: McpItemMeta[]
  workflows: WorkflowsMeta
  triggerMeta: Record<string, TriggerMeta>
  triggerSourceMeta: Record<string, TriggerSourceMeta>
  middlewareGroupsMeta: MiddlewareGroupsMeta
  permissionsGroupsMeta: PermissionsGroupsMeta
  agentsMeta: AgentsMeta
  secretsMeta: Record<string, unknown>
  credentialsMeta: Record<string, unknown>
  variablesMeta: Record<string, unknown>
  modelAliases: string[]
}

export interface AllMeta extends PikkuMetaState {
  functionUsedBy: Record<string, FunctionUsedBy>
  counts: MetaCounts
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class WiringService {
  constructor(private metaService: MetaService) {}

  async readAllMeta(): Promise<AllMeta> {
    const [
      functions,
      httpMetaRaw,
      cliMetaRaw,
      channelsMeta,
      queueMeta,
      schedulerMeta,
      rpcMetaRaw,
      mcpMetaRaw,
      workflows,
      triggerMeta,
      triggerSourceMeta,
      middlewareGroupsMeta,
      permissionsGroupsMeta,
      agentsMeta,
      secretsMeta,
      credentialsMeta,
      variablesMeta,
    ] = await Promise.all([
      this.metaService.getFunctionsMeta(),
      this.metaService.getHttpMeta(),
      this.metaService.getCliMeta(),
      this.metaService.getChannelsMeta(),
      this.metaService.getQueueMeta(),
      this.metaService.getSchedulerMeta(),
      this.metaService.getRpcMeta(),
      this.metaService.getMcpMeta(),
      this.metaService.getWorkflowMeta(),
      this.metaService.getTriggerMeta(),
      this.metaService.getTriggerSourceMeta(),
      this.metaService.getMiddlewareGroupsMeta(),
      this.metaService.getPermissionsGroupsMeta(),
      this.metaService.getAgentsMeta(),
      this.metaService.getSecretsMeta(),
      this.metaService.getCredentialsMeta(),
      this.metaService.getVariablesMeta(),
    ])

    const httpMeta = Object.entries(httpMetaRaw || {}).flatMap(
      ([method, routes]) =>
        Object.entries(routes as Record<string, unknown>).map(
          ([route, meta]) => ({
            ...(meta as Record<string, unknown>),
            route,
            method,
          })
        )
    ) as HttpRouteMeta[]
    httpMeta.sort((a, b) => a.route.localeCompare(b.route))

    const cliMeta = Object.entries(cliMetaRaw.programs || {}).map(
      ([programName, programMeta]) => ({
        ...(programMeta as Record<string, unknown>),
        wireId: programName,
      })
    ) as CliProgramMeta[]

    const cliRenderers: Record<string, CliRendererMeta> =
      ((cliMetaRaw as unknown as Record<string, unknown>).renderers as Record<
        string,
        CliRendererMeta
      >) || {}

    const mcpMeta: McpItemMeta[] = []
    if (mcpMetaRaw.resources) {
      for (const item of Object.values(mcpMetaRaw.resources)) {
        mcpMeta.push({ ...item, method: 'resource' } as McpItemMeta)
      }
    }
    if (mcpMetaRaw.tools) {
      for (const item of Object.values(mcpMetaRaw.tools)) {
        mcpMeta.push({ ...item, method: 'tool' } as McpItemMeta)
      }
    }
    if (mcpMetaRaw.prompts) {
      for (const item of Object.values(mcpMetaRaw.prompts)) {
        mcpMeta.push({ ...item, method: 'prompt' } as McpItemMeta)
      }
    }

    const rpcMeta: Record<string, RpcMeta> = {}
    for (const [name, value] of Object.entries(rpcMetaRaw)) {
      rpcMeta[name] = {
        pikkuFuncId: value,
      }
    }

    const functionUsedBy: Record<string, FunctionUsedBy> = {}
    const getOrCreate = (funcName: string): FunctionUsedBy => {
      if (!functionUsedBy[funcName]) {
        functionUsedBy[funcName] = { transports: [], jobs: [], workflows: [] }
      }
      return functionUsedBy[funcName]
    }

    for (const route of httpMeta) {
      if (route.pikkuFuncId) {
        getOrCreate(route.pikkuFuncId).transports.push({
          type: 'http',
          id: `${route.method}::${route.route}`,
          name: `${route.method?.toUpperCase()} ${route.route}`,
        })
      }
    }

    for (const [channelName, channelData] of Object.entries(channelsMeta) as [
      string,
      ChannelMeta,
    ][]) {
      for (const event of ['connect', 'disconnect', 'message'] as const) {
        const eventData = channelData[event] as ChannelMessageMeta | null
        if (eventData?.pikkuFuncId) {
          getOrCreate(eventData.pikkuFuncId).transports.push({
            type: 'channel',
            id: `${channelName}::${event}`,
            name: `${channelName} ${event}`,
          })
        }
      }
      if (channelData.messageWirings) {
        for (const actions of Object.values(channelData.messageWirings)) {
          for (const [actionName, actionData] of Object.entries(actions)) {
            if (actionData?.pikkuFuncId) {
              getOrCreate(actionData.pikkuFuncId).transports.push({
                type: 'channel',
                id: `${channelName}::${actionName}`,
                name: `${channelName} ${actionName}`,
              })
            }
          }
        }
      }
    }

    for (const item of mcpMeta) {
      if (item.pikkuFuncId) {
        getOrCreate(item.pikkuFuncId).transports.push({
          type: 'mcp',
          id: item.wireId || item.name || '',
          name: `${item.method}: ${item.name || item.wireId}`,
        })
      }
    }

    for (const program of cliMeta) {
      const walkCommands = (
        commands: Record<string, CliCommandMeta> | undefined,
        path: string
      ) => {
        if (!commands) return
        for (const [cmdName, cmdData] of Object.entries(commands)) {
          const fullPath = path ? `${path} ${cmdName}` : cmdName
          if (cmdData.pikkuFuncId) {
            getOrCreate(cmdData.pikkuFuncId).transports.push({
              type: 'cli',
              id: `${program.wireId}::${fullPath}`,
              name: `${program.wireId} ${fullPath}`,
            })
          }
          if (cmdData.subcommands) walkCommands(cmdData.subcommands, fullPath)
        }
      }
      walkCommands(program.commands, '')
    }

    for (const [name, data] of Object.entries(rpcMeta)) {
      if (data.pikkuFuncId) {
        getOrCreate(data.pikkuFuncId).transports.push({
          type: 'rpc',
          id: name,
          name,
        })
      }
    }

    for (const [name, data] of Object.entries(schedulerMeta)) {
      if (data.pikkuFuncId) {
        getOrCreate(data.pikkuFuncId).jobs.push({
          type: 'scheduler',
          id: name,
          name,
        })
      }
    }

    for (const [name, data] of Object.entries(queueMeta)) {
      if (data.pikkuFuncId) {
        getOrCreate(data.pikkuFuncId).jobs.push({
          type: 'queue',
          id: name,
          name,
        })
      }
    }

    for (const [name, data] of Object.entries(triggerMeta)) {
      if (data.pikkuFuncId) {
        getOrCreate(data.pikkuFuncId).jobs.push({
          type: 'trigger',
          id: name,
          name,
        })
      }
    }

    for (const [agentName, agentData] of Object.entries(agentsMeta) as [
      string,
      AgentMeta,
    ][]) {
      if (agentData.tools) {
        for (const tool of agentData.tools) {
          getOrCreate(tool).transports.push({
            type: 'agent',
            id: agentName,
            name: agentName,
          })
        }
      }
    }

    for (const [_workflowName, workflowData] of Object.entries(workflows) as [
      string,
      Record<string, unknown>,
    ][]) {
      const usedBy = functionUsedBy[workflowData.pikkuFuncId as string]
      if (usedBy) {
        workflowData.wiredTo = {
          transports: usedBy.transports,
          jobs: usedBy.jobs,
        }
      }
    }

    let cliCommandCount = 0
    const countCli = (commands: Record<string, CliCommandMeta> | undefined) => {
      if (!commands) return
      for (const cmd of Object.values(commands)) {
        if (cmd.pikkuFuncId) cliCommandCount++
        if (cmd.subcommands) countCli(cmd.subcommands)
      }
    }
    for (const program of cliMeta) {
      countCli(program.commands)
    }

    let modelAliases: string[] = []
    try {
      const modelsConfig =
        pikkuState(null, 'models', 'config') ?? ({} as Record<string, unknown>)
      modelAliases = Object.keys(
        ((modelsConfig as Record<string, unknown>).models as Record<
          string,
          unknown
        >) ?? {}
      )
    } catch {
      // models config may not be available
    }

    const counts: MetaCounts = {
      functions: Object.values(functions).length,
      workflows: Object.keys(workflows).length,
      httpRoutes: httpMeta.length,
      channels: Object.keys(channelsMeta).length,
      mcpTools: mcpMeta.filter((i) => i.method === 'tool').length,
      schedulers: Object.keys(schedulerMeta).length,
      queues: Object.keys(queueMeta).length,
      cliCommands: cliCommandCount,
      rpcMethods: Object.keys(rpcMeta).length,
      triggers: Object.keys(triggerMeta).length,
      triggerSources: Object.keys(triggerSourceMeta).length,
      agents: Object.keys(agentsMeta).length,
      secrets: Object.keys(secretsMeta).length,
      variables: Object.keys(variablesMeta).length,
    }

    return {
      functions: Object.values(functions),
      httpMeta,
      cliMeta,
      cliRenderers,
      channelsMeta: channelsMeta as unknown as AllMeta['channelsMeta'],
      queueMeta: queueMeta as unknown as AllMeta['queueMeta'],
      schedulerMeta: schedulerMeta as unknown as AllMeta['schedulerMeta'],
      rpcMeta,
      mcpMeta,
      workflows,
      triggerMeta: triggerMeta as unknown as AllMeta['triggerMeta'],
      triggerSourceMeta:
        triggerSourceMeta as unknown as AllMeta['triggerSourceMeta'],
      middlewareGroupsMeta,
      permissionsGroupsMeta,
      agentsMeta,
      secretsMeta,
      credentialsMeta,
      variablesMeta,
      modelAliases,
      functionUsedBy,
      counts,
    }
  }

  generateChannelSnippets(
    channelName: string,
    channel: CoreChannelMeta
  ): ChannelSnippets {
    const route = channel.route
    const categories = Object.entries(channel.messageWirings || {})

    const routeVars = categories
      .map(([cat]) => `const ${cat} = pikkuWS.getRoute('${cat}');`)
      .join('\n')

    const overview = [
      `const ws = new PikkuWebsocket('ws://localhost:3000${route}');`,
      routeVars,
    ]
      .filter(Boolean)
      .join('\n')

    const handlers: Record<string, string> = {}
    if (channel.connect) {
      handlers.connect = `// Connection is established when the WebSocket opens`
    }
    if (channel.disconnect) {
      handlers.disconnect = `ws.close();`
    }
    if (channel.message) {
      handlers.message = `ws.send({ /* message data */ });`
    }

    const actions: Record<string, Record<string, string>> = {}
    for (const [cat, catActions] of categories) {
      actions[cat] = {}
      for (const action of Object.keys(catActions)) {
        actions[cat][action] = [
          `const ${cat} = pikkuWS.getRoute('${cat}');`,
          ``,
          `// Send`,
          `${cat}.send('${action}', { /* data */ });`,
          ``,
          `// Subscribe to responses`,
          `${cat}.subscribe('${action}', (data) => {`,
          `  // handle response`,
          `});`,
        ].join('\n')
      }
    }

    return { overview, handlers, actions }
  }
}

export interface ChannelSnippets {
  overview: string
  handlers: Record<string, string>
  actions: Record<string, Record<string, string>>
}
