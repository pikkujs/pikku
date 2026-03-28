/**
 * Provider-agnostic deployment manifest types.
 *
 * These types describe WHAT needs to be deployed (roles, capabilities,
 * routes, queues, etc.) without referencing HOW or WHERE.
 * A separate provider adapter maps these to concrete infrastructure.
 */

/** What kind of compute a deployment unit needs */
export type DeploymentUnitRole =
  | 'http'
  | 'rpc'
  | 'mcp'
  | 'queue-consumer'
  | 'scheduled'
  | 'agent'
  | 'channel'
  | 'workflow-orchestrator'
  | 'workflow-step'

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
  functionIds: string[]
  services: ServiceRequirement[]
  /** Other unit names this unit depends on / calls */
  dependsOn: string[]
  httpRoutes: HttpRouteInfo[]
  tags: string[]
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
