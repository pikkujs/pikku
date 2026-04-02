/**
 * Provider-agnostic deployment analyzer.
 *
 * Core principle: one function = one deployment unit.
 * Each function gets its own unit with all its triggers (HTTP, queue, cron).
 * Gateways (MCP, agents, channels) dispatch to function units via RPC.
 * Workflow orchestrators dispatch to step units via queue or RPC (inline).
 */

import type { InspectorState, SerializedWorkflowGraph } from '@pikku/inspector'
import type { FunctionMeta } from '@pikku/core'
import type { ChannelMeta } from '@pikku/core/channel'
import type { HTTPWiringsMeta } from '@pikku/core/http'

import type {
  DeploymentManifest,
  DeploymentUnit,
  DeploymentHandler,
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

export function analyzeDeployment(
  state: InspectorState,
  options: AnalyzerOptions
): DeploymentManifest {
  const units: DeploymentUnit[] = []
  const queues: QueueDefinition[] = []
  const scheduledTasks: ScheduledTaskDefinition[] = []
  const channels: ChannelDefinition[] = []
  const agents: AgentDefinition[] = []
  const mcpEndpoints: MCPEndpointDefinition[] = []
  const workflows: WorkflowDefinition[] = []

  const functionsMeta = state.functions.meta
  const httpMeta = state.http.meta

  // ── Step 1: Create function units ──────────────────────────────────
  // Each function gets one unit. Collect all its triggers.

  for (const [funcId, funcMeta] of entries(functionsMeta)) {
    // Skip synthetic functions — their routes/queues are handled by gateway units
    if (
      funcId.startsWith('agentRun:') ||
      funcId.startsWith('agentStream:') ||
      funcId.startsWith('agentApprove:') ||
      funcId.startsWith('agentResume:') ||
      funcId.startsWith('workflowStart:') ||
      funcId.startsWith('workflow:') ||
      funcId.startsWith('workflowStatus:') ||
      funcId.startsWith('pikkuWorkflowWorker:') ||
      funcId.startsWith('pikkuWorkflowOrchestrator:')
    ) {
      continue
    }

    const handlers: DeploymentHandler[] = []

    // HTTP routes for this function
    const routes = collectHttpRoutes(httpMeta, funcId)
    if (routes.length > 0) {
      handlers.push({ type: 'fetch', routes })
    }

    // Queue consumer for this function
    for (const [queueName, queueMeta] of entries(state.queueWorkers.meta)) {
      if (queueMeta.pikkuFuncId === funcId) {
        handlers.push({ type: 'queue', queueName: queueMeta.name ?? queueName })
        queues.push({
          name: queueMeta.name ?? queueName,
          consumerUnit: toKebab(funcId),
          consumerFunctionId: funcId,
        })
      }
    }

    // Scheduled task for this function
    for (const [_schedName, schedMeta] of entries(state.scheduledTasks.meta)) {
      if (schedMeta.pikkuFuncId === funcId) {
        handlers.push({
          type: 'scheduled',
          schedule: schedMeta.schedule,
          taskName: schedMeta.name,
        })
        scheduledTasks.push({
          name: schedMeta.name,
          schedule: schedMeta.schedule,
          unitName: toKebab(funcId),
          functionId: funcId,
        })
      }
    }

    // If function has no direct triggers but is exposed or has RPC,
    // it still needs a fetch handler for RPC access
    if (handlers.length === 0 && (funcMeta.expose || funcMeta.remote)) {
      handlers.push({ type: 'fetch', routes: [] })
    }

    // Skip functions with no triggers (they'll be accessed via gateways)
    // unless they're explicitly exposed/remote
    if (handlers.length === 0) {
      continue
    }

    units.push({
      name: toKebab(funcId),
      role: 'function',
      functionIds: [funcId],
      services: collectServicesForFunction(funcMeta),
      dependsOn: [],
      handlers,
      tags: funcMeta.tags ?? [],
    })
  }

  // ── Step 2: Agent gateways ─────────────────────────────────────────
  for (const [agentName, agentMeta] of entries(state.agents.agentsMeta)) {
    const toolIds = agentMeta.tools ?? []
    const subAgentNames = agentMeta.agents ?? []
    const unitName = `agent-${toKebab(agentName)}`

    // Agent gateway depends on its tool function units
    const toolUnitNames = toolIds.map((id) => toKebab(id))
    const subAgentUnitNames = subAgentNames.map((sa) => `agent-${toKebab(sa)}`)

    // Agent needs AI services
    const agentServices: ServiceRequirement[] = [
      { capability: 'ai-model', sourceServiceName: 'aiAgentRunner' },
      { capability: 'ai-storage', sourceServiceName: 'aiStorage' },
    ]

    // Collect HTTP routes for the agent's synthetic functions
    const agentRoutes = [
      ...collectHttpRoutes(httpMeta, `agentRun:${agentName}`),
      ...collectHttpRoutes(httpMeta, `agentStream:${agentName}`),
      ...collectHttpRoutes(httpMeta, `agentApprove:${agentName}`),
      ...collectHttpRoutes(httpMeta, `agentResume:${agentName}`),
    ]

    units.push({
      name: unitName,
      role: 'agent',
      functionIds: [], // No function code bundled
      services: agentServices,
      dependsOn: [...toolUnitNames, ...subAgentUnitNames],
      handlers:
        agentRoutes.length > 0
          ? [{ type: 'fetch', routes: agentRoutes }]
          : [{ type: 'fetch', routes: [] }],
      tags: agentMeta.tags ?? [],
    })

    agents.push({
      name: agentMeta.name,
      unitName,
      toolFunctionIds: toolIds,
      subAgentNames,
      model: agentMeta.model,
    })
  }

  // ── Step 3: MCP gateway ────────────────────────────────────────────
  const mcpToolIds = values(state.mcpEndpoints.toolsMeta).map(
    (t) => t.pikkuFuncId
  )
  const mcpResourceIds = values(state.mcpEndpoints.resourcesMeta).map(
    (r) => r.pikkuFuncId
  )
  const mcpPromptIds = values(state.mcpEndpoints.promptsMeta).map(
    (p) => p.pikkuFuncId
  )

  // Include functions explicitly marked mcp: true
  for (const [funcId, funcMeta] of entries(functionsMeta)) {
    if (
      funcMeta.mcp &&
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
    const mcpFuncUnitNames = allMcpIds.map((id) => toKebab(id))

    units.push({
      name: unitName,
      role: 'mcp',
      functionIds: [], // No function code bundled
      services: [],
      dependsOn: mcpFuncUnitNames,
      handlers: [{ type: 'fetch', routes: [] }],
      tags: collectTags(allMcpIds, functionsMeta),
    })

    mcpEndpoints.push({
      unitName,
      toolFunctionIds: mcpToolIds,
      resourceFunctionIds: mcpResourceIds,
      promptFunctionIds: mcpPromptIds,
    })
  }

  // ── Step 4: Channel gateways ───────────────────────────────────────
  for (const [channelName, channelMeta] of entries(state.channels.meta)) {
    const funcIds = collectChannelFunctionIds(channelMeta)
    if (funcIds.length === 0) continue

    const unitName = `channel-${toKebab(channelName)}`
    const funcUnitNames = funcIds.map((id) => toKebab(id))

    units.push({
      name: unitName,
      role: 'channel',
      functionIds: [], // No function code bundled
      services: [],
      dependsOn: funcUnitNames,
      handlers: [{ type: 'fetch', routes: [] }],
      tags: channelMeta.tags ?? [],
    })

    channels.push({
      name: channelMeta.name,
      route: channelMeta.route,
      unitName,
      functionIds: funcIds,
    })
  }

  // ── Step 5: Workflows ──────────────────────────────────────────────
  buildWorkflows(
    state.workflows.graphMeta,
    functionsMeta,
    httpMeta,
    units,
    workflows
  )

  // ── Step 6: Ensure function units exist for gateway dependencies ───
  // Gateways depend on function units. If a function is only used via
  // a gateway (not directly wired to HTTP/queue/cron), it still needs
  // a unit with a fetch handler for RPC access.
  const existingUnitNames = new Set(units.map((u) => u.name))

  for (const unit of [...units]) {
    for (const dep of unit.dependsOn) {
      if (!existingUnitNames.has(dep)) {
        // Find the function ID for this dependency
        const funcId = fromKebab(dep)
        const funcMeta = functionsMeta[funcId]
        if (funcMeta) {
          units.push({
            name: dep,
            role: 'function',
            functionIds: [funcId],
            services: collectServicesForFunction(funcMeta),
            dependsOn: [],
            handlers: [{ type: 'fetch', routes: [] }],
            tags: funcMeta.tags ?? [],
          })
          existingUnitNames.add(dep)
        }
      }
    }
  }

  // ── Step 7: Assign workflow queue consumers ──
  // Runs after step 6 so all function units exist.
  // Orchestrator queue → orchestrator unit
  // Step queues → function worker (runs function, updates D1, re-queues orchestrator)
  for (const [queueName, queueMeta] of entries(state.queueWorkers.meta)) {
    const funcId = queueMeta.pikkuFuncId
    if (queues.some((q) => q.name === (queueMeta.name ?? queueName))) continue

    if (funcId.startsWith('pikkuWorkflowOrchestrator:')) {
      const wfName = funcId.split(':')[1]
      const orchUnitName = `wf-${toKebab(wfName)}`
      const orchUnit = units.find((u) => u.name === orchUnitName)

      queues.push({
        name: queueMeta.name ?? queueName,
        consumerUnit: orchUnitName,
        consumerFunctionId: funcId,
      })
      if (orchUnit) {
        orchUnit.handlers.push({
          type: 'queue',
          queueName: queueMeta.name ?? queueName,
        })
      }
    } else if (funcId.startsWith('pikkuWorkflowWorker:')) {
      const rpcName = funcId.split(':')[1]
      const funcUnitName = toKebab(rpcName)
      const funcUnit = units.find((u) => u.name === funcUnitName)

      queues.push({
        name: queueMeta.name ?? queueName,
        consumerUnit: funcUnitName,
        consumerFunctionId: funcId,
      })
      if (funcUnit) {
        funcUnit.handlers.push({
          type: 'queue',
          queueName: queueMeta.name ?? queueName,
        })
        // Step workers need D1 for step state and orchestrator queue for resuming
        if (!funcUnit.services.some((s) => s.capability === 'workflow-state')) {
          funcUnit.services.push({
            capability: 'workflow-state',
            sourceServiceName: 'workflowService',
          })
        }
        if (!funcUnit.services.some((s) => s.capability === 'queue')) {
          funcUnit.services.push({
            capability: 'queue',
            sourceServiceName: 'queueService',
          })
        }
      }
    }
  }

  // ── Secrets & Variables ────────────────────────────────────────────
  const secrets: SecretDeclaration[] = state.secrets.definitions.map((s) => ({
    secretId: s.secretId,
    displayName: s.displayName,
    description: s.description,
  }))

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
  httpMeta: HTTPWiringsMeta,
  units: DeploymentUnit[],
  workflows: WorkflowDefinition[]
): void {
  for (const [_wfName, graph] of entries(graphMeta)) {
    const steps: WorkflowStepDefinition[] = []
    const stepUnitNames: string[] = []

    for (const [nodeId, node] of Object.entries(graph.nodes)) {
      if ('flow' in node) continue
      if (!('rpcName' in node)) continue

      const stepUnitName = toKebab(node.rpcName)
      const isAsync = node.options?.async === true
      const isInline = !isAsync && graph.inline === true

      steps.push({
        name: node.stepName ?? nodeId,
        inline: isInline,
        functionId: node.rpcName,
        unitName: stepUnitName,
      })

      stepUnitNames.push(stepUnitName)
    }

    // Build orchestrator unit — no function code, just orchestration
    const orchUnitName = `wf-${toKebab(graph.name)}`
    const orchServices: ServiceRequirement[] = [
      { capability: 'workflow-state', sourceServiceName: 'workflowService' },
      { capability: 'queue', sourceServiceName: 'queueService' },
    ]

    // Collect HTTP routes for the workflow's synthetic functions
    const wfRoutes = [
      ...collectHttpRoutes(httpMeta, `workflowStart:${graph.name}`),
      ...collectHttpRoutes(httpMeta, `workflow:${graph.name}`),
      ...collectHttpRoutes(httpMeta, `workflowStatus:${graph.name}`),
    ]

    units.push({
      name: orchUnitName,
      role: 'workflow',
      functionIds: [], // No function code bundled
      services: orchServices,
      dependsOn: stepUnitNames,
      handlers:
        wfRoutes.length > 0
          ? [{ type: 'fetch', routes: wfRoutes }]
          : [{ type: 'fetch', routes: [] }],
      tags: [],
    })

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
// Naming helpers
// ---------------------------------------------------------------------------

function toKebab(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

function fromKebab(str: string): string {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
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
