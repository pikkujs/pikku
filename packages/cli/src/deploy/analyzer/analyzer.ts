/**
 * Provider-agnostic deployment analyzer.
 *
 * Pure synchronous transformation: InspectorState -> DeploymentManifest.
 * No I/O, no dynamic imports, no provider references.
 */

import type { InspectorState, SerializedWorkflowGraph } from '@pikku/inspector'
import type { FunctionMeta } from '@pikku/core'
import type { ChannelMeta } from '@pikku/core/channel'
import type { HTTPWiringsMeta } from '@pikku/core/http'

import type {
  DeploymentManifest,
  DeploymentUnit,
  DeploymentUnitRole,
  ServiceRequirement,
  ServiceCapability,
  HttpRouteInfo,
  QueueDefinition,
  ScheduledTaskDefinition,
  ChannelDefinition,
  AgentDefinition,
  MCPEndpointDefinition,
  WorkflowDefinition,
  WorkflowStepDefinition,
  SecretDeclaration,
  VariableDeclaration,
} from './manifest.js'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AnalyzerOptions {
  projectId: string
}

/**
 * Analyzes an InspectorState and produces a provider-agnostic DeploymentManifest.
 * This is a pure, synchronous transformation with no side effects.
 */
export function analyzeDeployment(
  state: InspectorState,
  options: AnalyzerOptions
): DeploymentManifest {
  const claimed = new Set<string>()
  const units: DeploymentUnit[] = []
  const queues: QueueDefinition[] = []
  const scheduledTasks: ScheduledTaskDefinition[] = []
  const channels: ChannelDefinition[] = []
  const agents: AgentDefinition[] = []
  const mcpEndpoints: MCPEndpointDefinition[] = []
  const workflows: WorkflowDefinition[] = []

  const functionsMeta = state.functions.meta
  const httpMeta = state.http.meta

  // ----- Priority 1: expose: true -> individual http unit per function -----
  for (const [funcId, funcMeta] of entries(functionsMeta)) {
    if (!funcMeta.expose) continue
    const routes = collectHttpRoutes(httpMeta, funcId)
    units.push(
      makeUnit({
        name: toKebab(funcId),
        role: 'http',
        functionIds: [funcId],
        funcMeta,
        httpRoutes: routes,
        tags: funcMeta.tags,
      })
    )
    claimed.add(funcId)
  }

  // ----- Priority 2: remote: true -> individual rpc unit per function -----
  for (const [funcId, funcMeta] of entries(functionsMeta)) {
    if (!funcMeta.remote || claimed.has(funcId)) continue
    units.push(
      makeUnit({
        name: toKebab(funcId),
        role: 'rpc',
        functionIds: [funcId],
        funcMeta,
        tags: funcMeta.tags,
      })
    )
    claimed.add(funcId)
  }

  // ----- Priority 3: Agents -> one agent unit per agent -----
  for (const [agentName, agentMeta] of entries(state.agents.agentsMeta)) {
    const toolIds = (agentMeta.tools ?? []).filter((id) => !claimed.has(id))
    const subAgentNames = agentMeta.agents ?? []
    const allFuncIds = [...toolIds]

    const mergedServices = mergeServicesForIds(allFuncIds, functionsMeta)
    const unitName = `agent-${toKebab(agentName)}`

    units.push({
      name: unitName,
      role: 'agent',
      functionIds: allFuncIds,
      services: mergedServices,
      dependsOn: subAgentNames.map((sa) => `agent-${toKebab(sa)}`),
      httpRoutes: [],
      tags: agentMeta.tags ?? [],
    })

    agents.push({
      name: agentMeta.name,
      unitName,
      toolFunctionIds: toolIds,
      subAgentNames,
      model: agentMeta.model,
    })

    for (const id of allFuncIds) claimed.add(id)
  }

  // ----- Priority 4: MCP -> single mcp unit -----
  const mcpToolIds = values(state.mcpEndpoints.toolsMeta)
    .map((t) => t.pikkuFuncId)
    .filter((id) => !claimed.has(id))
  const mcpResourceIds = values(state.mcpEndpoints.resourcesMeta)
    .map((r) => r.pikkuFuncId)
    .filter((id) => !claimed.has(id))
  const mcpPromptIds = values(state.mcpEndpoints.promptsMeta)
    .map((p) => p.pikkuFuncId)
    .filter((id) => !claimed.has(id))

  // Also include functions explicitly marked mcp: true that aren't yet claimed
  for (const [funcId, funcMeta] of entries(functionsMeta)) {
    if (
      funcMeta.mcp &&
      !claimed.has(funcId) &&
      !mcpToolIds.includes(funcId) &&
      !mcpResourceIds.includes(funcId) &&
      !mcpPromptIds.includes(funcId)
    ) {
      mcpToolIds.push(funcId)
    }
  }

  const allMcpIds = [...mcpToolIds, ...mcpResourceIds, ...mcpPromptIds]
  if (allMcpIds.length > 0) {
    const unitName = 'mcp-server'
    const mergedServices = mergeServicesForIds(allMcpIds, functionsMeta)
    const allTags = collectTags(allMcpIds, functionsMeta)

    units.push({
      name: unitName,
      role: 'mcp',
      functionIds: allMcpIds,
      services: mergedServices,
      dependsOn: [],
      httpRoutes: [],
      tags: allTags,
    })

    mcpEndpoints.push({
      unitName,
      toolFunctionIds: mcpToolIds,
      resourceFunctionIds: mcpResourceIds,
      promptFunctionIds: mcpPromptIds,
    })

    for (const id of allMcpIds) claimed.add(id)
  }

  // ----- Priority 5: Channels -> one channel unit per channel -----
  for (const [channelName, channelMeta] of entries(state.channels.meta)) {
    const funcIds = collectChannelFunctionIds(channelMeta).filter(
      (id) => !claimed.has(id)
    )
    if (funcIds.length === 0) continue

    const unitName = `channel-${toKebab(channelName)}`
    const mergedServices = mergeServicesForIds(funcIds, functionsMeta)

    units.push({
      name: unitName,
      role: 'channel',
      functionIds: funcIds,
      services: mergedServices,
      dependsOn: [],
      httpRoutes: [],
      tags: channelMeta.tags ?? [],
    })

    channels.push({
      name: channelMeta.name,
      route: channelMeta.route,
      unitName,
      functionIds: funcIds,
    })

    for (const id of funcIds) claimed.add(id)
  }

  // ----- Priority 6: Queue workers -> one queue-consumer unit per queue -----
  for (const [queueName, queueMeta] of entries(state.queueWorkers.meta)) {
    const funcId = queueMeta.pikkuFuncId
    if (claimed.has(funcId)) continue

    const funcMeta = functionsMeta[funcId]
    const unitName = `queue-${toKebab(queueName)}`

    units.push(
      makeUnit({
        name: unitName,
        role: 'queue-consumer',
        functionIds: [funcId],
        funcMeta,
        tags: funcMeta?.tags,
      })
    )

    queues.push({
      name: queueMeta.name ?? queueName,
      consumerUnit: unitName,
      consumerFunctionId: funcId,
    })

    claimed.add(funcId)
  }

  // ----- Priority 7: Schedulers -> one scheduled unit per task -----
  for (const [schedName, schedMeta] of entries(state.scheduledTasks.meta)) {
    const funcId = schedMeta.pikkuFuncId
    if (claimed.has(funcId)) continue

    const funcMeta = functionsMeta[funcId]
    const unitName = `cron-${toKebab(schedName)}`

    units.push(
      makeUnit({
        name: unitName,
        role: 'scheduled',
        functionIds: [funcId],
        funcMeta,
        tags: funcMeta?.tags,
      })
    )

    scheduledTasks.push({
      name: schedMeta.name,
      schedule: schedMeta.schedule,
      unitName,
      functionId: funcId,
    })

    claimed.add(funcId)
  }

  // ----- Priority 8 & 9: Workflows -----
  buildWorkflows(
    state.workflows.graphMeta,
    functionsMeta,
    claimed,
    units,
    workflows
  )

  // ----- Secrets -----
  const secrets: SecretDeclaration[] = state.secrets.definitions.map((s) => ({
    secretId: s.secretId,
    displayName: s.displayName,
    description: s.description,
  }))

  // ----- Variables -----
  const variables: VariableDeclaration[] = state.variables.definitions.map(
    (v) => ({
      variableId: v.variableId,
      displayName: v.displayName,
      description: v.description,
    })
  )

  return {
    projectId: options.projectId,
    manifestVersion: 1,
    units,
    queues,
    scheduledTasks,
    channels,
    agents,
    mcpEndpoints,
    workflows,
    secrets,
    variables,
  }
}

// ---------------------------------------------------------------------------
// Workflow builder
// ---------------------------------------------------------------------------

function buildWorkflows(
  graphMeta: Record<string, SerializedWorkflowGraph>,
  functionsMeta: Record<string, FunctionMeta>,
  claimed: Set<string>,
  units: DeploymentUnit[],
  workflows: WorkflowDefinition[]
): void {
  for (const [_wfName, graph] of entries(graphMeta)) {
    const orchestratorFuncIds: string[] = []
    const steps: WorkflowStepDefinition[] = []

    // If the workflow's own pikkuFuncId isn't claimed, reserve it for the orchestrator
    if (!claimed.has(graph.pikkuFuncId)) {
      orchestratorFuncIds.push(graph.pikkuFuncId)
    }

    for (const [nodeId, node] of Object.entries(graph.nodes)) {
      // Flow control nodes (branch, sleep, return, etc.) don't map to deployable steps
      if ('flow' in node) {
        continue
      }

      // FunctionNode — has rpcName
      if ('rpcName' in node) {
        const isAsync = node.options?.async === true
        const isInline = !isAsync && graph.inline === true

        if (isInline) {
          // Inline step: bundled with orchestrator
          if (!claimed.has(node.rpcName)) {
            orchestratorFuncIds.push(node.rpcName)
          }
          steps.push({
            name: node.stepName ?? nodeId,
            inline: true,
            functionId: node.rpcName,
          })
        } else {
          // Non-inline step: gets its own workflow-step unit
          if (!claimed.has(node.rpcName)) {
            const stepUnitName = `wf-step-${toKebab(node.rpcName)}`
            const stepFuncMeta = functionsMeta[node.rpcName]

            units.push(
              makeUnit({
                name: stepUnitName,
                role: 'workflow-step',
                functionIds: [node.rpcName],
                funcMeta: stepFuncMeta,
                tags: stepFuncMeta?.tags,
              })
            )
            claimed.add(node.rpcName)

            steps.push({
              name: node.stepName ?? nodeId,
              inline: false,
              functionId: node.rpcName,
              unitName: stepUnitName,
            })
          }
        }
      }
    }

    // Build orchestrator unit
    const orchUnitName = `wf-${toKebab(graph.name)}`
    const orchServices = mergeServicesForIds(orchestratorFuncIds, functionsMeta)
    const orchTags = collectTags(orchestratorFuncIds, functionsMeta)

    // Add workflow-state capability since orchestrators need it
    if (!orchServices.some((s) => s.capability === 'workflow-state')) {
      orchServices.push({
        capability: 'workflow-state',
        sourceServiceName: 'workflowService',
      })
    }

    // Add queue capability since orchestrators use queues for step dispatch
    if (!orchServices.some((s) => s.capability === 'queue')) {
      orchServices.push({
        capability: 'queue',
        sourceServiceName: 'queueService',
      })
    }

    const stepUnitNames = steps
      .filter((s) => !s.inline && s.unitName)
      .map((s) => s.unitName!)

    units.push({
      name: orchUnitName,
      role: 'workflow-orchestrator',
      functionIds: orchestratorFuncIds,
      services: orchServices,
      dependsOn: stepUnitNames,
      httpRoutes: [],
      tags: orchTags,
    })

    for (const id of orchestratorFuncIds) claimed.add(id)

    workflows.push({
      name: graph.name,
      pikkuFuncId: graph.pikkuFuncId,
      orchestratorUnit: orchUnitName,
      steps,
    })
  }
}

// ---------------------------------------------------------------------------
// Service mapping
// ---------------------------------------------------------------------------

const SERVICE_CAPABILITY_MAP: Record<string, ServiceCapability> = {
  kysely: 'database',
  database: 'database',
  db: 'database',
  contentService: 'object-storage',
  content: 'object-storage',
  storage: 'object-storage',
  queueService: 'queue',
  aiAgentRunner: 'ai-model',
  ai: 'ai-model',
  aiStorage: 'ai-storage',
  workflowService: 'workflow-state',
  workflow: 'workflow-state',
  credentialService: 'credential-store',
  credentials: 'credential-store',
  schedulerService: 'scheduler',
}

function mapServiceToRequirement(
  serviceName: string
): ServiceRequirement | null {
  const capability = SERVICE_CAPABILITY_MAP[serviceName]
  if (!capability) return null
  return { capability, sourceServiceName: serviceName }
}

function collectServicesForFunction(
  funcMeta: FunctionMeta | undefined
): ServiceRequirement[] {
  if (!funcMeta?.services?.services) return []

  const requirements: ServiceRequirement[] = []
  const seen = new Set<ServiceCapability>()

  for (const svc of funcMeta.services.services) {
    const req = mapServiceToRequirement(svc)
    if (req && !seen.has(req.capability)) {
      requirements.push(req)
      seen.add(req.capability)
    }
  }

  return requirements
}

function mergeServicesForIds(
  funcIds: string[],
  functionsMeta: Record<string, FunctionMeta>
): ServiceRequirement[] {
  const seen = new Set<ServiceCapability>()
  const result: ServiceRequirement[] = []

  for (const id of funcIds) {
    for (const req of collectServicesForFunction(functionsMeta[id])) {
      if (!seen.has(req.capability)) {
        result.push(req)
        seen.add(req.capability)
      }
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// HTTP route helpers
// ---------------------------------------------------------------------------

const HTTP_METHODS = [
  'get',
  'post',
  'put',
  'delete',
  'head',
  'patch',
  'options',
] as const

function collectHttpRoutes(
  httpMeta: HTTPWiringsMeta,
  funcId: string
): HttpRouteInfo[] {
  const routes: HttpRouteInfo[] = []

  for (const method of HTTP_METHODS) {
    const methodRoutes = httpMeta[method]
    if (!methodRoutes) continue
    for (const routeMeta of values(methodRoutes)) {
      if (routeMeta.pikkuFuncId === funcId) {
        routes.push({
          method: method.toUpperCase(),
          route: routeMeta.route,
          pikkuFuncId: funcId,
        })
      }
    }
  }

  return routes
}

// ---------------------------------------------------------------------------
// Channel helpers
// ---------------------------------------------------------------------------

function collectChannelFunctionIds(channelMeta: ChannelMeta): string[] {
  const ids: string[] = []
  if (channelMeta.connect?.pikkuFuncId)
    ids.push(channelMeta.connect.pikkuFuncId)
  if (channelMeta.disconnect?.pikkuFuncId)
    ids.push(channelMeta.disconnect.pikkuFuncId)
  if (channelMeta.message?.pikkuFuncId)
    ids.push(channelMeta.message.pikkuFuncId)
  if (channelMeta.messageWirings) {
    for (const commandGroup of values(channelMeta.messageWirings)) {
      for (const wiring of values(commandGroup)) {
        if (wiring.pikkuFuncId) {
          ids.push(wiring.pikkuFuncId)
        }
      }
    }
  }
  return [...new Set(ids)]
}

// ---------------------------------------------------------------------------
// Unit factory
// ---------------------------------------------------------------------------

function makeUnit(params: {
  name: string
  role: DeploymentUnitRole
  functionIds: string[]
  funcMeta: FunctionMeta | undefined
  httpRoutes?: HttpRouteInfo[]
  tags?: string[]
}): DeploymentUnit {
  return {
    name: params.name,
    role: params.role,
    functionIds: params.functionIds,
    services: collectServicesForFunction(params.funcMeta),
    dependsOn: [],
    httpRoutes: params.httpRoutes ?? [],
    tags: params.tags ?? [],
  }
}

// ---------------------------------------------------------------------------
// Naming helpers
// ---------------------------------------------------------------------------

/** Converts camelCase / PascalCase to kebab-case */
function toKebab(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

// ---------------------------------------------------------------------------
// Tag helpers
// ---------------------------------------------------------------------------

function collectTags(
  funcIds: string[],
  functionsMeta: Record<string, FunctionMeta>
): string[] {
  const tags = new Set<string>()
  for (const id of funcIds) {
    const meta = functionsMeta[id]
    if (meta?.tags) {
      for (const tag of meta.tags) tags.add(tag)
    }
  }
  return [...tags]
}

// ---------------------------------------------------------------------------
// Typed iteration helpers
// ---------------------------------------------------------------------------

function entries<V>(record: Record<string, V>): Array<[string, V]> {
  return Object.entries(record) as Array<[string, V]>
}

function values<V>(record: Record<string, V>): V[] {
  return Object.values(record) as V[]
}
