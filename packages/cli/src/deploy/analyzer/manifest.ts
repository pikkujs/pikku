/**
 * Provider-agnostic deployment manifest types.
 *
 * Core principle: one function = one deployment unit.
 * Gateways (MCP, agents, channels, workflow orchestrators)
 * don't bundle function code — they dispatch via RPC.
 */

/** What kind of deployment entry */
export type DeploymentUnitRole =
  | 'function'
  | 'mcp'
  | 'agent'
  | 'channel'
  | 'workflow'
  | 'workflow-step'

/** What handlers a unit needs to export */
export type DeploymentHandler =
  | { type: 'fetch'; routes: HttpRouteInfo[] }
  | { type: 'queue'; queueName: string }
  | { type: 'scheduled'; schedule: string; taskName: string }

/** Abstract infrastructure capability */
export type ServiceCapability =
  | 'database'
  | 'object-storage'
  | 'queue'
  | 'kv'
  | 'ai-model'
  | 'ai-storage'
  | 'scheduler'
  | 'workflow-state'
  | 'credential-store'

export interface ServiceRequirement {
  capability: ServiceCapability
  /** Original service name from code (e.g. 'kysely', 'contentService') */
  sourceServiceName: string
}

export interface HttpRouteInfo {
  method: string
  route: string
  pikkuFuncId: string
}

export interface DeploymentUnit {
  name: string
  role: DeploymentUnitRole
  /** Deploy target: serverless (CF Worker / Lambda) or server (container) */
  target: 'serverless' | 'server'
  /** Functions bundled in this unit (for function/workflow-step units) */
  functionIds: string[]
  services: ServiceRequirement[]
  /** Other unit names this unit calls via RPC / service bindings */
  dependsOn: string[]
  /** What runtime handlers this unit needs to export */
  handlers: DeploymentHandler[]
  tags: string[]
  /** SHA-256 of final bundled artifact (set by build pipeline) */
  bundleHash?: string
  /** Final bundle size in bytes (set by build pipeline) */
  bundleSizeBytes?: number
  /** SHA-256 of sorted external package map (set by build pipeline) */
  externalPackagesHash?: string
  /** External runtime dependencies used by this unit (set by build pipeline) */
  externalPackages?: Record<string, string>
}

export interface QueueDefinition {
  name: string
  consumerUnit: string
  consumerFunctionId: string
}

export interface ScheduledTaskDefinition {
  name: string
  schedule: string
  unitName: string
  functionId: string
}

export interface ChannelDefinition {
  name: string
  route: string
  unitName: string
  functionIds: string[]
}

export interface AgentDefinition {
  name: string
  unitName: string
  toolFunctionIds: string[]
  subAgentNames: string[]
  model: string
}

export interface MCPEndpointDefinition {
  unitName: string
  toolFunctionIds: string[]
  resourceFunctionIds: string[]
  promptFunctionIds: string[]
}

export interface WorkflowStepDefinition {
  name: string
  inline: boolean
  functionId?: string
  unitName?: string
}

export interface WorkflowDefinition {
  name: string
  pikkuFuncId: string
  orchestratorUnit: string
  steps: WorkflowStepDefinition[]
}

export interface SecretDeclaration {
  secretId: string
  displayName: string
  description?: string
}

export interface VariableDeclaration {
  variableId: string
  displayName: string
  description?: string
}

export interface DeploymentManifest {
  projectId: string
  manifestVersion: 1
  units: DeploymentUnit[]
  queues: QueueDefinition[]
  scheduledTasks: ScheduledTaskDefinition[]
  channels: ChannelDefinition[]
  agents: AgentDefinition[]
  mcpEndpoints: MCPEndpointDefinition[]
  workflows: WorkflowDefinition[]
  secrets: SecretDeclaration[]
  variables: VariableDeclaration[]
}
