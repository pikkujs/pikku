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
  /** SHA-256 of sorted exact dependency map (set by build pipeline) */
  exactDependenciesHash?: string
  /** Top-level exact runtime dependency versions for this unit (set by build pipeline) */
  exactDependencies?: Record<string, string>
  /** Top-level exact optional runtime dependency versions for this unit (set by build pipeline) */
  exactOptionalDependencies?: Record<string, string>
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
  /** Hosts this secret may be sent to. Absent means unrestricted. */
  allowedHosts?: string[]
  /** True when some code reads this secret with a statically resolvable key. */
  read?: boolean
}

/** Secret reads whose key the inspector could not resolve, as `file:line:source`. */
export type UnresolvedSecretRead = string

/** A `wireAddon` instance the app exempted from secret or credential scoping. */
export interface UnscopedAddon {
  namespace: string
  package: string
  /** The app's stated reason, from `wireAddon({ globalSecrets | globalCredentials })`. */
  reason: string
}

/** A `wireAddon` instance the app lent named secrets or credentials it never declared. */
export interface GrantedAddon {
  namespace: string
  package: string
  /**
   * The names the addon may now read, as the addon reads them — grants and
   * override keys alike, since scoping is checked before an override renames.
   */
  granted: string[]
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
  /**
   * Reads with a non-literal key. A deployment can only narrow a unit's secret
   * scope to the declared set when this is empty.
   */
  unresolvedSecretReads: UnresolvedSecretRead[]
  /**
   * Addon instances exempted from secret scoping. Every other addon reads only
   * the secrets it declared, so this is the full list of packages that can
   * reach a secret the app never named for them.
   */
  unscopedSecretAddons: UnscopedAddon[]
  /**
   * Addon instances exempted from credential scoping. Every other addon reaches
   * only the credentials it declared, and none can enumerate the app's users.
   */
  unscopedCredentialAddons: UnscopedAddon[]
  /**
   * Addon instances lent named secrets on top of the ones they declared. The
   * other half of the same waiver as `unscopedSecretAddons` — narrower, because
   * the app named the set — so between them a deployment sees every secret an
   * addon can reach that it did not declare for itself.
   */
  grantedSecretAddons: GrantedAddon[]
  /** Addon instances lent named credentials on top of the ones they declared. */
  grantedCredentialAddons: GrantedAddon[]
  variables: VariableDeclaration[]
}
