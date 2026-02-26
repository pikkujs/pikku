import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import type { HTTPWiringsMeta } from '@pikku/core/http'
import type { ChannelsMeta } from '@pikku/core/channel'
import type { ScheduledTasksMeta } from '@pikku/core/scheduler'
import type { QueueWorkersMeta } from '@pikku/core/queue'
import type { CLIMeta } from '@pikku/core/cli'
import type {
  MCPResourceMeta,
  MCPToolMeta,
  MCPPromptMeta,
} from '@pikku/core/mcp'
import type { WorkflowsMeta } from '@pikku/core/workflow'
import type {
  TriggerMeta as CoreTriggerMeta,
  TriggerSourceMeta as CoreTriggerSourceMeta,
} from '@pikku/core/trigger'
import type { SecretDefinitionsMeta } from '@pikku/core/secret'
import type { VariableDefinitionsMeta } from '@pikku/core/variable'

export type MiddlewareMeta =
  | { type: 'http'; route: string }
  | { type: 'tag'; tag: string }
  | { type: 'wire'; name: string; inline?: boolean }

export type PermissionMeta =
  | { type: 'http'; route: string }
  | { type: 'tag'; tag: string }
  | { type: 'wire'; name: string; inline?: boolean }

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

export interface FunctionMeta {
  pikkuFuncId: string
  name: string
  sessionless?: boolean
  services: { optimized: boolean; services: string[] }
  inputSchemaName: string | null
  outputSchemaName: string | null
  inputs: string[]
  outputs: string[]
  summary?: string
  description?: string
  tags?: string[]
  errors?: string[]
  middleware?: MiddlewareMeta[]
  permissions?: PermissionMeta[]
  wires?: { optimized: boolean; wires: string[] }
  expose?: boolean
  isDirectFunction: boolean
}

export type FunctionsMeta = Record<string, FunctionMeta>

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
  config?: Record<string, any>
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

export interface AgentMeta {
  name: string
  description?: string
  instructions?: string
  summary?: string
  model?: string
  maxSteps?: number
  toolChoice?: string
  tools?: string[]
  agents?: string[]
  inputSchema?: string | null
  outputSchema?: string | null
  workingMemorySchema?: string | null
  middleware?: MiddlewareMeta[]
  channelMiddleware?: MiddlewareMeta[]
  aiMiddleware?: MiddlewareMeta[]
  permissions?: PermissionMeta[]
  tags?: string[]
  memory?: { storage?: string; lastMessages?: number }
}

export type AgentsMeta = Record<string, AgentMeta>

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
  workflows: Record<string, any>
  triggerMeta: Record<string, TriggerMeta>
  triggerSourceMeta: Record<string, TriggerSourceMeta>
  middlewareGroupsMeta: MiddlewareGroupsMeta
  permissionsGroupsMeta: PermissionsGroupsMeta
  agentsMeta: AgentsMeta
  secretsMeta: SecretDefinitionsMeta
  variablesMeta: VariableDefinitionsMeta
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

export interface MCPMeta {
  resources: MCPResourceMeta
  tools: MCPToolMeta
  prompts: MCPPromptMeta
}

export type RPCMetaRecord = Record<string, string>

export interface ServiceMeta {
  name: string
  summary: string
  description: string
  package: string
  path: string
  version: string
  interface: string
  expandedProperties: Record<string, string>
}

export type ServicesMetaRecord = Record<string, ServiceMeta>

export interface MiddlewareDefinitionMeta {
  services: { optimized: boolean; services: string[] }
  sourceFile: string
  position: number
  exportedName: string | null
  factory?: boolean
  name?: string
  description?: string
  package?: string
}

export interface MiddlewareInstanceMeta {
  definitionId: string
  sourceFile: string
  position: number
  isFactoryCall: boolean
}

export interface GroupMeta {
  exportName: string | null
  sourceFile: string
  position: number
  services: { optimized: boolean; services: string[] }
  count: number
  instanceIds: string[]
  isFactory: boolean
}

export interface MiddlewareGroupsMeta {
  definitions: Record<string, MiddlewareDefinitionMeta>
  instances: Record<string, MiddlewareInstanceMeta>
  httpGroups: Record<string, GroupMeta>
  tagGroups: Record<string, GroupMeta>
}

export interface PermissionDefinitionMeta {
  services: { optimized: boolean; services: string[] }
  sourceFile: string
  position: number
  exportedName: string | null
  factory?: boolean
  name?: string
  description?: string
}

export interface PermissionsGroupsMeta {
  definitions: Record<string, PermissionDefinitionMeta>
  httpGroups: Record<string, GroupMeta>
  tagGroups: Record<string, GroupMeta>
}

export class WiringService {
  private httpMetaCache: HTTPWiringsMeta | null = null
  private channelsMetaCache: ChannelsMeta | null = null
  private schedulerMetaCache: ScheduledTasksMeta | null = null
  private queueMetaCache: QueueWorkersMeta | null = null
  private cliMetaCache: CLIMeta | null = null
  private mcpMetaCache: MCPMeta | null = null
  private rpcMetaCache: RPCMetaRecord | null = null
  private workflowMetaCache: WorkflowsMeta | null = null
  private triggerMetaCache: CoreTriggerMeta | null = null
  private triggerSourceMetaCache: CoreTriggerSourceMeta | null = null
  private functionsMetaCache: FunctionsMeta | null = null
  private servicesMetaCache: ServicesMetaRecord | null = null
  private secretsMetaCache: SecretDefinitionsMeta | null = null
  private variablesMetaCache: VariableDefinitionsMeta | null = null
  private middlewareGroupsMetaCache: MiddlewareGroupsMeta | null = null
  private permissionsGroupsMetaCache: PermissionsGroupsMeta | null = null
  private agentsMetaCache: AgentsMeta | null = null

  constructor(private pikkuMetaPath: string) {}

  clearCache(): void {
    this.httpMetaCache = null
    this.channelsMetaCache = null
    this.schedulerMetaCache = null
    this.queueMetaCache = null
    this.cliMetaCache = null
    this.mcpMetaCache = null
    this.rpcMetaCache = null
    this.workflowMetaCache = null
    this.triggerMetaCache = null
    this.triggerSourceMetaCache = null
    this.functionsMetaCache = null
    this.servicesMetaCache = null
    this.secretsMetaCache = null
    this.variablesMetaCache = null
    this.middlewareGroupsMetaCache = null
    this.permissionsGroupsMetaCache = null
    this.agentsMetaCache = null
  }

  private async readMetaWithFallback(
    dir: string,
    baseName: string
  ): Promise<string | null> {
    const verbosePath = join(
      this.pikkuMetaPath,
      dir,
      `${baseName}-verbose.gen.json`
    )
    try {
      return await readFile(verbosePath, 'utf-8')
    } catch {
      const minimalPath = join(this.pikkuMetaPath, dir, `${baseName}.gen.json`)
      try {
        return await readFile(minimalPath, 'utf-8')
      } catch {
        return null
      }
    }
  }

  /**
   * Read HTTP wirings metadata
   */
  async readHttpMeta(): Promise<HTTPWiringsMeta> {
    if (this.httpMetaCache) {
      return this.httpMetaCache
    }

    const content = await this.readMetaWithFallback(
      'http',
      'pikku-http-wirings-meta'
    )
    this.httpMetaCache = content
      ? JSON.parse(content)
      : {
          get: {},
          post: {},
          put: {},
          delete: {},
          patch: {},
          head: {},
          options: {},
        }
    return this.httpMetaCache!
  }

  /**
   * Read Channel wirings metadata
   */
  async readChannelsMeta(): Promise<ChannelsMeta> {
    if (this.channelsMetaCache) {
      return this.channelsMetaCache
    }

    const content = await this.readMetaWithFallback(
      'channel',
      'pikku-channels-meta'
    )
    this.channelsMetaCache = content ? JSON.parse(content) : {}
    return this.channelsMetaCache!
  }

  /**
   * Read Scheduler wirings metadata
   */
  async readSchedulerMeta(): Promise<ScheduledTasksMeta> {
    if (this.schedulerMetaCache) {
      return this.schedulerMetaCache
    }

    const content = await this.readMetaWithFallback(
      'scheduler',
      'pikku-schedulers-wirings-meta'
    )
    this.schedulerMetaCache = content ? JSON.parse(content) : {}
    return this.schedulerMetaCache!
  }

  /**
   * Read Queue wirings metadata
   */
  async readQueueMeta(): Promise<QueueWorkersMeta> {
    if (this.queueMetaCache) {
      return this.queueMetaCache
    }

    const content = await this.readMetaWithFallback(
      'queue',
      'pikku-queue-workers-wirings-meta'
    )
    this.queueMetaCache = content ? JSON.parse(content) : {}
    return this.queueMetaCache!
  }

  /**
   * Read CLI wirings metadata
   */
  async readCliMeta(): Promise<CLIMeta> {
    if (this.cliMetaCache) {
      return this.cliMetaCache
    }

    const content = await this.readMetaWithFallback(
      'cli',
      'pikku-cli-wirings-meta'
    )
    this.cliMetaCache = content
      ? JSON.parse(content)
      : { programs: {}, renderers: {} }
    return this.cliMetaCache!
  }

  /**
   * Read MCP wirings metadata (resources, tools, prompts)
   */
  async readMcpMeta(): Promise<MCPMeta> {
    if (this.mcpMetaCache) {
      return this.mcpMetaCache
    }

    const content = await this.readMetaWithFallback(
      'mcp',
      'pikku-mcp-wirings-meta'
    )
    if (content) {
      const mcpData = JSON.parse(content)
      this.mcpMetaCache = {
        resources: mcpData.resourcesMeta || {},
        tools: mcpData.toolsMeta || {},
        prompts: mcpData.promptsMeta || {},
      }
    } else {
      this.mcpMetaCache = { resources: {}, tools: {}, prompts: {} }
    }
    return this.mcpMetaCache!
  }

  /**
   * Read RPC wirings metadata
   */
  async readRpcMeta(): Promise<RPCMetaRecord> {
    if (this.rpcMetaCache) {
      return this.rpcMetaCache
    }

    const metaPath = join(
      this.pikkuMetaPath,
      'rpc',
      'pikku-rpc-wirings-meta.gen.json'
    )
    try {
      const content = await readFile(metaPath, 'utf-8')
      this.rpcMetaCache = JSON.parse(content)
      return this.rpcMetaCache!
    } catch (error) {
      console.error(
        `Error reading RPC wirings metadata from ${metaPath}:`,
        error
      )
      this.rpcMetaCache = {}
      return this.rpcMetaCache
    }
  }

  /**
   * Read Workflow wirings metadata
   */
  async readWorkflowMeta(): Promise<WorkflowsMeta> {
    if (this.workflowMetaCache) {
      return this.workflowMetaCache
    }

    const metaDir = join(this.pikkuMetaPath, 'workflow', 'meta')
    try {
      const files = await readdir(metaDir)
      const jsonFiles = files.filter((f) => f.endsWith('.gen.json'))
      const verboseFiles = jsonFiles.filter((f) => f.includes('-verbose'))
      const minimalFiles = jsonFiles.filter((f) => !f.includes('-verbose'))
      const verboseNames = new Set(
        verboseFiles.map((f) => f.replace('-verbose.gen.json', ''))
      )
      const filesToRead = [
        ...verboseFiles,
        ...minimalFiles.filter(
          (f) => !verboseNames.has(f.replace('.gen.json', ''))
        ),
      ]

      const result: WorkflowsMeta = {}
      await Promise.all(
        filesToRead.map(async (file) => {
          const filePath = join(metaDir, file)
          const content = await readFile(filePath, 'utf-8')
          const meta = JSON.parse(content)
          result[meta.name] = meta
        })
      )

      this.workflowMetaCache = result
      return this.workflowMetaCache
    } catch (error) {
      console.error(
        `Error reading Workflow wirings metadata from ${metaDir}:`,
        error
      )
      this.workflowMetaCache = {}
      return this.workflowMetaCache
    }
  }

  async readTriggerMeta(): Promise<CoreTriggerMeta> {
    if (this.triggerMetaCache) {
      return this.triggerMetaCache
    }

    const content = await this.readMetaWithFallback(
      'trigger',
      'pikku-trigger-wirings-meta'
    )
    this.triggerMetaCache = content ? JSON.parse(content) : {}
    return this.triggerMetaCache!
  }

  async readTriggerSourceMeta(): Promise<CoreTriggerSourceMeta> {
    if (this.triggerSourceMetaCache) {
      return this.triggerSourceMetaCache
    }

    const content = await this.readMetaWithFallback(
      'trigger',
      'pikku-trigger-sources-meta'
    )
    this.triggerSourceMetaCache = content ? JSON.parse(content) : {}
    return this.triggerSourceMetaCache!
  }

  /**
   * Read Functions metadata
   */
  async readFunctionsMeta(): Promise<FunctionsMeta> {
    if (this.functionsMetaCache) {
      return this.functionsMetaCache
    }

    const content = await this.readMetaWithFallback(
      'function',
      'pikku-functions-meta'
    )
    this.functionsMetaCache = content ? JSON.parse(content) : {}
    return this.functionsMetaCache!
  }

  async readMiddlewareGroupsMeta(): Promise<MiddlewareGroupsMeta> {
    if (this.middlewareGroupsMetaCache) {
      return this.middlewareGroupsMetaCache
    }

    const content = await this.readMetaWithFallback(
      'middleware',
      'pikku-middleware-groups-meta'
    )
    this.middlewareGroupsMetaCache = content
      ? JSON.parse(content)
      : { definitions: {}, instances: {}, httpGroups: {}, tagGroups: {} }
    return this.middlewareGroupsMetaCache!
  }

  async readPermissionsGroupsMeta(): Promise<PermissionsGroupsMeta> {
    if (this.permissionsGroupsMetaCache) {
      return this.permissionsGroupsMetaCache
    }

    const content = await this.readMetaWithFallback(
      'permissions',
      'pikku-permissions-groups-meta'
    )
    this.permissionsGroupsMetaCache = content
      ? JSON.parse(content)
      : { definitions: {}, httpGroups: {}, tagGroups: {} }
    return this.permissionsGroupsMetaCache!
  }

  async readAgentMeta(): Promise<AgentsMeta> {
    if (this.agentsMetaCache) {
      return this.agentsMetaCache
    }

    const content = await this.readMetaWithFallback(
      'agent',
      'pikku-agent-wirings-meta'
    )
    if (content) {
      const parsed = JSON.parse(content)
      this.agentsMetaCache = parsed.agentsMeta || parsed
    } else {
      this.agentsMetaCache = {}
    }
    return this.agentsMetaCache!
  }

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
      variablesMeta,
    ] = await Promise.all([
      this.readFunctionsMeta(),
      this.readHttpMeta(),
      this.readCliMeta(),
      this.readChannelsMeta(),
      this.readQueueMeta(),
      this.readSchedulerMeta(),
      this.readRpcMeta(),
      this.readMcpMeta(),
      this.readWorkflowMeta(),
      this.readTriggerMeta(),
      this.readTriggerSourceMeta(),
      this.readMiddlewareGroupsMeta(),
      this.readPermissionsGroupsMeta(),
      this.readAgentMeta(),
      this.readSecretsMeta(),
      this.readVariablesMeta(),
    ])

    const httpMeta = Object.entries(httpMetaRaw || {}).flatMap(
      ([method, routes]) =>
        Object.entries(routes as Record<string, any>).map(([route, meta]) => ({
          ...meta,
          route,
          method,
        }))
    )
    httpMeta.sort((a: any, b: any) => a.route.localeCompare(b.route))

    const cliMeta = Object.entries(cliMetaRaw.programs || {}).map(
      ([programName, programMeta]) => ({
        ...(programMeta as any),
        wireId: programName,
      })
    )

    const cliRenderers: Record<string, CliRendererMeta> =
      (cliMetaRaw as any).renderers || {}

    const mcpMeta: any[] = []
    if (mcpMetaRaw.resources) {
      for (const item of Object.values<any>(mcpMetaRaw.resources)) {
        mcpMeta.push({ ...item, method: 'resource' })
      }
    }
    if (mcpMetaRaw.tools) {
      for (const item of Object.values<any>(mcpMetaRaw.tools)) {
        mcpMeta.push({ ...item, method: 'tool' })
      }
    }
    if (mcpMetaRaw.prompts) {
      for (const item of Object.values<any>(mcpMetaRaw.prompts)) {
        mcpMeta.push({ ...item, method: 'prompt' })
      }
    }

    const rpcMeta: Record<string, { pikkuFuncId: string }> = {}
    for (const [name, value] of Object.entries(rpcMetaRaw)) {
      rpcMeta[name] = {
        pikkuFuncId:
          typeof value === 'string' ? value : (value as any).pikkuFuncId,
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

    for (const [channelName, channelData] of Object.entries(
      channelsMeta
    ) as any[]) {
      for (const event of ['connect', 'disconnect', 'message']) {
        if (channelData[event]?.pikkuFuncId) {
          getOrCreate(channelData[event].pikkuFuncId).transports.push({
            type: 'channel',
            id: `${channelName}::${event}`,
            name: `${channelName} ${event}`,
          })
        }
      }
      if (channelData.messageWirings) {
        for (const actions of Object.values(
          channelData.messageWirings
        ) as any[]) {
          for (const [actionName, actionData] of Object.entries(
            actions
          ) as any[]) {
            if ((actionData as any)?.pikkuFuncId) {
              getOrCreate((actionData as any).pikkuFuncId).transports.push({
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
          id: item.wireId || item.name,
          name: `${item.method}: ${item.name || item.wireId}`,
        })
      }
    }

    for (const program of cliMeta) {
      const walkCommands = (commands: any, path: string) => {
        if (!commands) return
        for (const [cmdName, cmdData] of Object.entries(commands) as any[]) {
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

    for (const [name, data] of Object.entries(schedulerMeta) as any[]) {
      if (data.pikkuFuncId) {
        getOrCreate(data.pikkuFuncId).jobs.push({
          type: 'scheduler',
          id: name,
          name,
        })
      }
    }

    for (const [name, data] of Object.entries(queueMeta) as any[]) {
      if (data.pikkuFuncId) {
        getOrCreate(data.pikkuFuncId).jobs.push({
          type: 'queue',
          id: name,
          name,
        })
      }
    }

    for (const [name, data] of Object.entries(triggerMeta) as any[]) {
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

    for (const [workflowName, workflowData] of Object.entries(
      workflows
    ) as any[]) {
      const usedBy = functionUsedBy[workflowData.pikkuFuncId]
      if (usedBy) {
        workflowData.wiredTo = {
          transports: usedBy.transports,
          jobs: usedBy.jobs,
        }
      }
    }

    let cliCommandCount = 0
    const countCli = (commands: any) => {
      if (!commands) return
      for (const cmd of Object.values(commands) as any[]) {
        if (cmd.pikkuFuncId) cliCommandCount++
        if (cmd.subcommands) countCli(cmd.subcommands)
      }
    }
    for (const program of cliMeta) {
      countCli(program.commands)
    }

    const counts = {
      functions: Object.values(functions).length,
      workflows: Object.keys(workflows).length,
      httpRoutes: httpMeta.length,
      channels: Object.keys(channelsMeta).length,
      mcpTools: mcpMeta.filter((i: any) => i.method === 'tool').length,
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
      variablesMeta,
      functionUsedBy,
      counts,
    }
  }

  async readServicesMeta(): Promise<ServicesMetaRecord> {
    if (this.servicesMetaCache) {
      return this.servicesMetaCache
    }

    const servicesDir = join(this.pikkuMetaPath, 'services')
    try {
      const files = await readdir(servicesDir)
      const jsonFiles = files.filter((f) => f.endsWith('.gen.json'))

      const result: ServicesMetaRecord = {}
      await Promise.all(
        jsonFiles.map(async (file) => {
          const filePath = join(servicesDir, file)
          const content = await readFile(filePath, 'utf-8')
          const meta: ServiceMeta = JSON.parse(content)
          result[meta.name] = meta
        })
      )

      this.servicesMetaCache = result
      return this.servicesMetaCache
    } catch (error) {
      console.error(
        `Error reading Services metadata from ${servicesDir}:`,
        error
      )
      this.servicesMetaCache = {}
      return this.servicesMetaCache
    }
  }

  async readSecretsMeta(): Promise<SecretDefinitionsMeta> {
    if (this.secretsMetaCache) {
      return this.secretsMetaCache
    }

    const metaPath = join(
      this.pikkuMetaPath,
      'secrets',
      'pikku-secrets-meta.gen.json'
    )
    try {
      const content = await readFile(metaPath, 'utf-8')
      this.secretsMetaCache = JSON.parse(content)
      return this.secretsMetaCache!
    } catch {
      this.secretsMetaCache = {}
      return this.secretsMetaCache
    }
  }

  async readVariablesMeta(): Promise<VariableDefinitionsMeta> {
    if (this.variablesMetaCache) {
      return this.variablesMetaCache
    }

    const metaPath = join(
      this.pikkuMetaPath,
      'variables',
      'pikku-variables-meta.gen.json'
    )
    try {
      const content = await readFile(metaPath, 'utf-8')
      this.variablesMetaCache = JSON.parse(content)
      return this.variablesMetaCache!
    } catch {
      this.variablesMetaCache = {}
      return this.variablesMetaCache
    }
  }

  generateChannelSnippets(
    channelName: string,
    channel: ChannelMeta
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
