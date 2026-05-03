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
  /** Services that can't run serverless — functions using them get target: 'server' */
  serverlessIncompatible?: string[]
}

/**
 * Determine deploy target for a function based on its explicit flag
 * and service compatibility.
 */
function resolveDeployTarget(
  funcMeta: FunctionMeta,
  serverlessIncompatible: Set<string>
): 'serverless' | 'server' {
  // Explicit flag takes priority
  if (funcMeta.deploy === 'serverless') return 'serverless'
  if (funcMeta.deploy === 'server') return 'server'

  // Auto: check if any service is serverless-incompatible
  if (funcMeta.services?.services) {
    for (const svc of funcMeta.services.services) {
      if (serverlessIncompatible.has(svc)) return 'server'
    }
  }

  return 'serverless'
}

export function analyzeDeployment(
  state: InspectorState,
  options: AnalyzerOptions
): DeploymentManifest {
  const serverlessIncompatible = new Set(options.serverlessIncompatible ?? [])
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
    // Skip platform functions — their routes/queues are handled by gateway units
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

    // Skip scaffold catch-all functions — they're bundled into units that need them
    if (
      funcId.startsWith('http:') ||
      funcId === 'agentCaller' ||
      funcId === 'agentStreamCaller' ||
      funcId === 'agentApproveCaller' ||
      funcId === 'agentResumeCaller'
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
          consumerUnit: toSafeKebab(funcId),
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
          unitName: toSafeKebab(funcId),
          functionId: funcId,
        })
      }
    }

    // Exposed/remote functions get concrete routes via the catch-all
    if (funcMeta.expose) {
      const funcName = funcMeta.name ?? funcId
      const rpcRoute = {
        method: 'post',
        route: `/rpc/${funcName}`,
        pikkuFuncId: funcId,
      }
      const fetchHandler = handlers.find(
        (h): h is Extract<DeploymentHandler, { type: 'fetch' }> =>
          h.type === 'fetch'
      )
      if (fetchHandler) {
        fetchHandler.routes.push(rpcRoute)
      } else {
        handlers.push({ type: 'fetch', routes: [rpcRoute] })
      }
    }
    if (funcMeta.remote) {
      const funcName = funcMeta.name ?? funcId
      const remoteRoute = {
        method: 'post',
        route: `/remote/rpc/${funcName}`,
        pikkuFuncId: funcId,
      }
      const fetchHandler = handlers.find(
        (h): h is Extract<DeploymentHandler, { type: 'fetch' }> =>
          h.type === 'fetch'
      )
      if (fetchHandler) {
        fetchHandler.routes.push(remoteRoute)
      } else {
        handlers.push({ type: 'fetch', routes: [remoteRoute] })
      }
    }

    // Skip functions with no triggers (they'll be accessed via gateways)
    // unless they're explicitly exposed/remote
    if (handlers.length === 0) {
      continue
    }

    units.push({
      name: toSafeKebab(funcId),
      role: 'function',
      target: resolveDeployTarget(funcMeta, serverlessIncompatible),
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
    const unitName = `agent-${toSafeKebab(agentName)}`

    // Agent gateway depends on its tool function units
    const toolUnitNames = toolIds.map((id) => toSafeKebab(id))
    const subAgentUnitNames = subAgentNames.map(
      (sa) => `agent-${toSafeKebab(sa)}`
    )

    // Agent needs AI services
    const agentServices: ServiceRequirement[] = [
      { capability: 'ai-model', sourceServiceName: 'aiAgentRunner' },
      { capability: 'ai-storage', sourceServiceName: 'aiStorage' },
    ]

    // Concrete routes for this agent via catch-all
    const agentRoutes = [
      {
        method: 'post',
        route: `/rpc/agent/${agentName}`,
        pikkuFuncId: `agentRun:${agentName}`,
      },
      {
        method: 'post',
        route: `/rpc/agent/${agentName}/stream`,
        pikkuFuncId: `agentStream:${agentName}`,
      },
      {
        method: 'post',
        route: `/rpc/agent/${agentName}/approve`,
        pikkuFuncId: `agentApprove:${agentName}`,
      },
      {
        method: 'post',
        route: `/rpc/agent/${agentName}/resume`,
        pikkuFuncId: `agentResume:${agentName}`,
      },
    ]

    units.push({
      name: unitName,
      role: 'agent',
      target: 'serverless',
      functionIds: [],
      services: agentServices,
      dependsOn: [...toolUnitNames, ...subAgentUnitNames],
      handlers: [{ type: 'fetch', routes: agentRoutes }],
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
    const mcpFuncUnitNames = allMcpIds.map((id) => toSafeKebab(id))

    units.push({
      name: unitName,
      role: 'mcp',
      target: 'serverless',
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

    const unitName = `channel-${toSafeKebab(channelName)}`
    const funcUnitNames = funcIds.map((id) => toSafeKebab(id))

    units.push({
      name: unitName,
      role: 'channel',
      target: 'serverless',
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
    workflows,
    queues
  )

  // ── Step 6: Ensure function units exist for gateway dependencies ───
  // Gateways depend on function units. If a function is only used via
  // a gateway (not directly wired to HTTP/queue/cron), it still needs
  // a unit with a fetch handler for RPC access.
  const existingUnitNames = new Set(units.map((u) => u.name))

  const unitsSnapshot = Array.from(units)
  for (const unit of unitsSnapshot) {
    for (const dep of unit.dependsOn) {
      if (!existingUnitNames.has(dep)) {
        // Find the function ID for this dependency
        const funcId = fromKebab(dep)
        const funcMeta = functionsMeta[funcId]
        if (funcMeta) {
          units.push({
            name: dep,
            role: 'function',
            target: resolveDeployTarget(funcMeta, serverlessIncompatible),
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

  // ── Step 7: Wire queues to their consumer units ──
  // All queues (user-defined + workflow-generated) now have consumerUnit set.
  // Wire the queue handler onto the unit and add workflow services if needed.
  for (const queue of queues) {
    const unit = units.find((u) => u.name === queue.consumerUnit)
    if (!unit) continue

    // Add queue handler if not already present
    const hasQueueHandler = unit.handlers.some(
      (h) => h.type === 'queue' && h.queueName === queue.name
    )
    if (!hasQueueHandler) {
      unit.handlers.push({ type: 'queue', queueName: queue.name })
    }

    // Workflow step workers need D1 for step state + queue for re-queuing orchestrator
    if (queue.consumerFunctionId.startsWith('pikkuWorkflowWorker:')) {
      if (!unit.services.some((s) => s.capability === 'workflow-state')) {
        unit.services.push({
          capability: 'workflow-state',
          sourceServiceName: 'workflowService',
        })
      }
      if (!unit.services.some((s) => s.capability === 'queue')) {
        unit.services.push({
          capability: 'queue',
          sourceServiceName: 'queueService',
        })
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
  _functionsMeta: Record<string, FunctionMeta>,
  _httpMeta: HTTPWiringsMeta,
  units: DeploymentUnit[],
  workflows: WorkflowDefinition[],
  queues: QueueDefinition[]
): void {
  for (const [_wfName, graph] of entries(graphMeta)) {
    const steps: WorkflowStepDefinition[] = []
    const stepUnitNames: string[] = []

    for (const [nodeId, node] of Object.entries(graph.nodes)) {
      if ('flow' in node) continue
      if (!('rpcName' in node)) continue

      const stepUnitName = toSafeKebab(node.rpcName)
      const isAsync = node.options?.async === true
      const isInline = !isAsync && graph.inline === true

      steps.push({
        name: node.stepName ?? nodeId,
        inline: isInline,
        functionId: node.rpcName,
        unitName: stepUnitName,
      })

      // Every step gets its own unit (for log/metric isolation). The
      // dispatch mechanism differs at runtime: async steps consume a
      // dedicated queue; inline steps are invoked via CF dispatch
      // namespace remote-call from the orchestrator.
      stepUnitNames.push(stepUnitName)
    }

    // Build orchestrator unit — no function code, just orchestration
    const orchUnitName = `wf-${toSafeKebab(graph.name)}`
    const orchServices: ServiceRequirement[] = [
      { capability: 'workflow-state', sourceServiceName: 'workflowService' },
      { capability: 'queue', sourceServiceName: 'queueService' },
    ]

    // Concrete routes for this workflow via catch-all
    const wfRoutes = [
      {
        method: 'post',
        route: `/workflow/${graph.name}/start`,
        pikkuFuncId: `workflowStart:${graph.name}`,
      },
      {
        method: 'post',
        route: `/workflow/${graph.name}/run`,
        pikkuFuncId: `workflow:${graph.name}`,
      },
      {
        method: 'get',
        route: `/workflow/${graph.name}/status/:runId`,
        pikkuFuncId: `workflowStatus:${graph.name}`,
      },
      {
        method: 'post',
        route: `/workflow/${graph.name}/graph/:nodeId`,
        pikkuFuncId: `graphStart:${graph.name}`,
      },
    ]

    // Orchestrator queue — the orchestrator consumes from this
    const orchQueueName = `wf-orchestrator-${toSafeKebab(graph.name)}`
    const orchHandlers: DeploymentHandler[] = [
      { type: 'fetch', routes: wfRoutes },
      { type: 'queue', queueName: orchQueueName },
    ]

    units.push({
      name: orchUnitName,
      role: 'workflow',
      target: 'serverless',
      functionIds: [],
      services: orchServices,
      dependsOn: stepUnitNames,
      handlers: orchHandlers,
      tags: [],
    })

    queues.push({
      name: orchQueueName,
      consumerUnit: orchUnitName,
      consumerFunctionId: `pikkuWorkflowOrchestrator:${graph.name}`,
    })

    // Per-step queues — each step function worker consumes its own queue.
    // The step units may not exist yet (created in step 6), so we just
    // create queue definitions here. Step 7 wires them to units.
    for (const step of steps) {
      if (step.inline || !step.functionId) continue
      const stepQueueName = `wf-step-${toSafeKebab(step.functionId)}`

      queues.push({
        name: stepQueueName,
        consumerUnit: toSafeKebab(step.functionId),
        consumerFunctionId: `pikkuWorkflowWorker:${step.functionId}`,
      })
    }

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

export function toSafeKebab(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/[:/\\]/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '')
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
