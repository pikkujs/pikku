import type { JSONSchema7 } from 'json-schema'
import type { HTTPWiringsMeta } from '../wirings/http/http.types.js'
import type { ChannelsMeta } from '../wirings/channel/channel.types.js'
import type { ScheduledTasksMeta } from '../wirings/scheduler/scheduler.types.js'
import type { QueueWorkersMeta } from '../wirings/queue/queue.types.js'
import type { CLIMeta } from '../wirings/cli/cli.types.js'
import type {
  MCPResourceMeta,
  MCPToolMeta,
  MCPPromptMeta,
} from '../wirings/mcp/mcp.types.js'
import type { WorkflowsMeta } from '../wirings/workflow/workflow.types.js'
import type {
  TriggerMeta,
  TriggerSourceMeta,
} from '../wirings/trigger/trigger.types.js'
import type { SecretDefinitionsMeta } from '../wirings/secret/secret.types.js'
import type { CredentialDefinitionsMeta } from '../wirings/credential/credential.types.js'
import type { VariableDefinitionsMeta } from '../wirings/variable/variable.types.js'
import type {
  FunctionMeta,
  FunctionsMeta,
  MiddlewareMetadata,
  PermissionMetadata,
} from '../types/core.types.js'
import type { AIAgentMeta } from '../wirings/ai-agent/ai-agent.types.js'

// Re-export core types for consumers
export type {
  FunctionMeta,
  FunctionsMeta,
  MiddlewareMetadata as MiddlewareMeta,
  PermissionMetadata as PermissionMeta,
}
export type AgentsMeta = AIAgentMeta
export type AgentMeta = AIAgentMeta[string]

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

/**
 * Abstraction over .pikku metadata file access.
 * All paths are relative to the .pikku root directory.
 *
 * Node.js uses LocalMetaService (filesystem).
 * Cloudflare uses an R2/KV implementation.
 */
export interface MetaService {
  /** Base path for local filesystem implementations. Undefined for remote/non-local implementations. */
  readonly basePath?: string
  /** Read a file's content by relative path. Returns null if not found. */
  readFile(relativePath: string): Promise<string | null>
  /** List files in a directory by relative path. Returns empty array if not found. */
  readDir(relativePath: string): Promise<string[]>

  // -- Typed metadata accessors --

  getHttpMeta(): Promise<HTTPWiringsMeta>
  getChannelsMeta(): Promise<ChannelsMeta>
  getSchedulerMeta(): Promise<ScheduledTasksMeta>
  getQueueMeta(): Promise<QueueWorkersMeta>
  getCliMeta(): Promise<CLIMeta>
  getMcpMeta(): Promise<MCPMeta>
  getRpcMeta(): Promise<RPCMetaRecord>
  getWorkflowMeta(): Promise<WorkflowsMeta>
  getTriggerMeta(): Promise<TriggerMeta>
  getTriggerSourceMeta(): Promise<TriggerSourceMeta>
  getFunctionsMeta(): Promise<FunctionsMeta>
  getMiddlewareGroupsMeta(): Promise<MiddlewareGroupsMeta>
  getPermissionsGroupsMeta(): Promise<PermissionsGroupsMeta>
  getAgentsMeta(): Promise<AgentsMeta>
  getSecretsMeta(): Promise<SecretDefinitionsMeta>
  getCredentialsMeta(): Promise<CredentialDefinitionsMeta>
  getVariablesMeta(): Promise<VariableDefinitionsMeta>
  getServicesMeta(): Promise<ServicesMetaRecord>

  getSchema(schemaName: string): Promise<JSONSchema7 | null>
  getSchemas(schemaNames: string[]): Promise<Record<string, JSONSchema7 | null>>

  clearCache(): void
}

/**
 * Node.js filesystem implementation of MetaService.
 * Reads .gen.json files from a local .pikku directory.
 */
export class LocalMetaService implements MetaService {
  public readonly basePath: string

  private httpMetaCache: HTTPWiringsMeta | null = null
  private channelsMetaCache: ChannelsMeta | null = null
  private schedulerMetaCache: ScheduledTasksMeta | null = null
  private queueMetaCache: QueueWorkersMeta | null = null
  private cliMetaCache: CLIMeta | null = null
  private mcpMetaCache: MCPMeta | null = null
  private rpcMetaCache: RPCMetaRecord | null = null
  private workflowMetaCache: WorkflowsMeta | null = null
  private triggerMetaCache: TriggerMeta | null = null
  private triggerSourceMetaCache: TriggerSourceMeta | null = null
  private functionsMetaCache: FunctionsMeta | null = null
  private servicesMetaCache: ServicesMetaRecord | null = null
  private secretsMetaCache: SecretDefinitionsMeta | null = null
  private credentialsMetaCache: CredentialDefinitionsMeta | null = null
  private variablesMetaCache: VariableDefinitionsMeta | null = null
  private middlewareGroupsMetaCache: MiddlewareGroupsMeta | null = null
  private permissionsGroupsMetaCache: PermissionsGroupsMeta | null = null
  private agentsMetaCache: AgentsMeta | null = null
  private schemaCache = new Map<string, JSONSchema7>()

  constructor(basePath: string) {
    this.basePath = basePath
  }

  async readFile(relativePath: string): Promise<string | null> {
    try {
      const { readFile } = await import('node:fs/promises')
      const { join } = await import('node:path')
      return await readFile(join(this.basePath, relativePath), 'utf-8')
    } catch {
      return null
    }
  }

  async readDir(relativePath: string): Promise<string[]> {
    try {
      const { readdir } = await import('node:fs/promises')
      const { join } = await import('node:path')
      return await readdir(join(this.basePath, relativePath))
    } catch {
      return []
    }
  }

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
    this.credentialsMetaCache = null
    this.variablesMetaCache = null
    this.middlewareGroupsMetaCache = null
    this.permissionsGroupsMetaCache = null
    this.agentsMetaCache = null
    this.schemaCache.clear()
  }

  // -- Private helpers --

  private async readMetaJson<T>(
    dir: string,
    baseName: string
  ): Promise<string | null> {
    const verbose = await this.readFile(`${dir}/${baseName}-verbose.gen.json`)
    if (verbose) return verbose
    const minimal = await this.readFile(`${dir}/${baseName}.gen.json`)
    if (minimal) return minimal
    return null
  }

  // -- Typed metadata accessors --

  async getHttpMeta(): Promise<HTTPWiringsMeta> {
    if (this.httpMetaCache) return this.httpMetaCache

    const content = await this.readMetaJson('http', 'pikku-http-wirings-meta')
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

  async getChannelsMeta(): Promise<ChannelsMeta> {
    if (this.channelsMetaCache) return this.channelsMetaCache

    const content = await this.readMetaJson('channel', 'pikku-channels-meta')
    this.channelsMetaCache = content ? JSON.parse(content) : {}
    return this.channelsMetaCache!
  }

  async getSchedulerMeta(): Promise<ScheduledTasksMeta> {
    if (this.schedulerMetaCache) return this.schedulerMetaCache

    const content = await this.readMetaJson(
      'scheduler',
      'pikku-schedulers-wirings-meta'
    )
    this.schedulerMetaCache = content ? JSON.parse(content) : {}
    return this.schedulerMetaCache!
  }

  async getQueueMeta(): Promise<QueueWorkersMeta> {
    if (this.queueMetaCache) return this.queueMetaCache

    const content = await this.readMetaJson(
      'queue',
      'pikku-queue-workers-wirings-meta'
    )
    this.queueMetaCache = content ? JSON.parse(content) : {}
    return this.queueMetaCache!
  }

  async getCliMeta(): Promise<CLIMeta> {
    if (this.cliMetaCache) return this.cliMetaCache

    const content = await this.readMetaJson('cli', 'pikku-cli-wirings-meta')
    this.cliMetaCache = content
      ? JSON.parse(content)
      : { programs: {}, renderers: {} }
    return this.cliMetaCache!
  }

  async getMcpMeta(): Promise<MCPMeta> {
    if (this.mcpMetaCache) return this.mcpMetaCache

    const content = await this.readMetaJson('mcp', 'pikku-mcp-wirings-meta')
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

  async getRpcMeta(): Promise<RPCMetaRecord> {
    if (this.rpcMetaCache) return this.rpcMetaCache

    try {
      const content = await this.readFile('rpc/pikku-rpc-wirings-meta.gen.json')
      this.rpcMetaCache = content ? JSON.parse(content) : {}
      return this.rpcMetaCache!
    } catch (error) {
      console.error('Error reading RPC wirings metadata:', error)
      this.rpcMetaCache = {}
      return this.rpcMetaCache
    }
  }

  async getWorkflowMeta(): Promise<WorkflowsMeta> {
    if (this.workflowMetaCache) return this.workflowMetaCache

    try {
      const files = await this.readDir('workflow/meta')
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
          const content = await this.readFile(`workflow/meta/${file}`)
          if (content) {
            const meta = JSON.parse(content)
            result[meta.name] = meta
          }
        })
      )

      this.workflowMetaCache = result
      return this.workflowMetaCache
    } catch (error) {
      console.error('Error reading Workflow wirings metadata:', error)
      this.workflowMetaCache = {}
      return this.workflowMetaCache
    }
  }

  async getTriggerMeta(): Promise<TriggerMeta> {
    if (this.triggerMetaCache) return this.triggerMetaCache

    const content = await this.readMetaJson(
      'trigger',
      'pikku-trigger-wirings-meta'
    )
    this.triggerMetaCache = content ? JSON.parse(content) : {}
    return this.triggerMetaCache!
  }

  async getTriggerSourceMeta(): Promise<TriggerSourceMeta> {
    if (this.triggerSourceMetaCache) return this.triggerSourceMetaCache

    const content = await this.readMetaJson(
      'trigger',
      'pikku-trigger-sources-meta'
    )
    this.triggerSourceMetaCache = content ? JSON.parse(content) : {}
    return this.triggerSourceMetaCache!
  }

  async getFunctionsMeta(): Promise<FunctionsMeta> {
    if (this.functionsMetaCache) return this.functionsMetaCache

    const content = await this.readMetaJson('function', 'pikku-functions-meta')
    this.functionsMetaCache = content ? JSON.parse(content) : {}
    return this.functionsMetaCache!
  }

  async getMiddlewareGroupsMeta(): Promise<MiddlewareGroupsMeta> {
    if (this.middlewareGroupsMetaCache) return this.middlewareGroupsMetaCache

    const content = await this.readMetaJson(
      'middleware',
      'pikku-middleware-groups-meta'
    )
    this.middlewareGroupsMetaCache = content
      ? JSON.parse(content)
      : { definitions: {}, instances: {}, httpGroups: {}, tagGroups: {} }
    return this.middlewareGroupsMetaCache!
  }

  async getPermissionsGroupsMeta(): Promise<PermissionsGroupsMeta> {
    if (this.permissionsGroupsMetaCache) return this.permissionsGroupsMetaCache

    const content = await this.readMetaJson(
      'permissions',
      'pikku-permissions-groups-meta'
    )
    this.permissionsGroupsMetaCache = content
      ? JSON.parse(content)
      : { definitions: {}, httpGroups: {}, tagGroups: {} }
    return this.permissionsGroupsMetaCache!
  }

  async getAgentsMeta(): Promise<AgentsMeta> {
    if (this.agentsMetaCache) return this.agentsMetaCache

    const content = await this.readMetaJson('agent', 'pikku-agent-wirings-meta')
    if (content) {
      const parsed = JSON.parse(content)
      this.agentsMetaCache = parsed.agentsMeta || parsed
    } else {
      this.agentsMetaCache = {}
    }
    return this.agentsMetaCache!
  }

  async getSecretsMeta(): Promise<SecretDefinitionsMeta> {
    if (this.secretsMetaCache) return this.secretsMetaCache

    const content = await this.readFile('secrets/pikku-secrets-meta.gen.json')
    this.secretsMetaCache = content ? JSON.parse(content) : {}
    return this.secretsMetaCache!
  }

  async getCredentialsMeta(): Promise<CredentialDefinitionsMeta> {
    if (this.credentialsMetaCache) return this.credentialsMetaCache

    const content = await this.readFile(
      'credentials/pikku-credentials-meta.gen.json'
    )
    this.credentialsMetaCache = content ? JSON.parse(content) : {}
    return this.credentialsMetaCache!
  }

  async getVariablesMeta(): Promise<VariableDefinitionsMeta> {
    if (this.variablesMetaCache) return this.variablesMetaCache

    const content = await this.readFile(
      'variables/pikku-variables-meta.gen.json'
    )
    this.variablesMetaCache = content ? JSON.parse(content) : {}
    return this.variablesMetaCache!
  }

  async getServicesMeta(): Promise<ServicesMetaRecord> {
    if (this.servicesMetaCache) return this.servicesMetaCache

    try {
      const files = await this.readDir('services')
      const jsonFiles = files.filter((f) => f.endsWith('.gen.json'))

      const result: ServicesMetaRecord = {}
      await Promise.all(
        jsonFiles.map(async (file) => {
          const content = await this.readFile(`services/${file}`)
          if (content) {
            const meta: ServiceMeta = JSON.parse(content)
            result[meta.name] = meta
          }
        })
      )

      this.servicesMetaCache = result
      return this.servicesMetaCache
    } catch (error) {
      console.error('Error reading Services metadata:', error)
      this.servicesMetaCache = {}
      return this.servicesMetaCache
    }
  }

  async getSchema(schemaName: string): Promise<JSONSchema7 | null> {
    if (this.schemaCache.has(schemaName)) {
      return this.schemaCache.get(schemaName)!
    }

    if (!/^[a-zA-Z0-9_\-\.]+$/.test(schemaName)) {
      return null
    }

    try {
      const content = await this.readFile(
        `schemas/schemas/${schemaName}.schema.json`
      )
      if (!content) return null
      const schema = JSON.parse(content) as JSONSchema7
      this.schemaCache.set(schemaName, schema)
      return schema
    } catch (error) {
      console.error(`Error reading schema ${schemaName}:`, error)
      return null
    }
  }

  async getSchemas(
    schemaNames: string[]
  ): Promise<Record<string, JSONSchema7 | null>> {
    const results: Record<string, JSONSchema7 | null> = {}
    await Promise.all(
      schemaNames.map(async (name) => {
        results[name] = await this.getSchema(name)
      })
    )
    return results
  }
}
