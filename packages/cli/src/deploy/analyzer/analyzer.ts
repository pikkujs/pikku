/**
 * Project analyzer.
 *
 * Reads Pikku codegen metadata from a project's `.pikku/` directory and
 * produces a DeploymentManifest describing every Worker, Queue, Cron Trigger,
 * and other Cloudflare resource the project requires.
 */

import { readFile, readdir, access } from 'node:fs/promises'
import { join, basename } from 'node:path'

import type {
  DeploymentManifest,
  WorkerSpec,
  QueueSpec,
  CronTriggerSpec,
  ChannelSpec,
  Binding,
} from './manifest.js'

import type { FunctionsMeta } from '@pikku/core'
import type {
  ChannelsMeta,
  ChannelMeta,
} from '@pikku/core/wirings/channel/channel.types.js'
import type { ScheduledTasksMeta } from '@pikku/core/wirings/scheduler/scheduler.types.js'
import type {
  MCPToolMeta,
  MCPResourceMeta,
  MCPPromptMeta,
} from '@pikku/core/wirings/mcp/mcp.types.js'
import type { AIAgentMeta } from '@pikku/core/wirings/ai-agent/ai-agent.types.js'
import type { SecretDefinitionsMeta } from '@pikku/core/wirings/secret/secret.types.js'
import type { VariableDefinitionsMeta } from '@pikku/core/wirings/variable/variable.types.js'
import type { CommonWireMeta } from '@pikku/core'

// HTTP wirings: { [method]: { [route]: CommonWireMeta & { route, method, params? } } }
type HttpRouteMeta = CommonWireMeta & {
  route: string
  method: string
  params?: string[]
}
type HttpWiringsMeta = Record<string, Record<string, HttpRouteMeta>>

// Queue workers: { [queueName]: CommonWireMeta & { name? } }
type QueueWorkersMeta = Record<string, CommonWireMeta & { name?: string }>

// Workflow meta from individual JSON files
interface WorkflowNodeMeta {
  nodeId: string
  label?: string
  flow: string
  rpcName?: string
  [key: string]: unknown
}
interface WorkflowMeta {
  pikkuFuncId: string
  name: string
  nodes: Record<string, WorkflowNodeMeta>
}

// ---------------------------------------------------------------------------
// File reading helpers
// ---------------------------------------------------------------------------

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  if (!(await fileExists(path))) {
    return null
  }
  const raw = await readFile(path, 'utf-8')
  return JSON.parse(raw) as T
}

// ---------------------------------------------------------------------------
// Metadata loaders
// ---------------------------------------------------------------------------

interface ProjectMetadata {
  functions: FunctionsMeta
  http: HttpWiringsMeta
  queueWorkers: QueueWorkersMeta
  schedulers: ScheduledTasksMeta
  agents: { agentsMeta: AIAgentMeta }
  mcp: {
    toolsMeta: MCPToolMeta
    resourcesMeta: MCPResourceMeta
    promptsMeta: MCPPromptMeta
  }
  channels: ChannelsMeta
  workflows: WorkflowMeta[]
  secrets: SecretDefinitionsMeta
  variables: VariableDefinitionsMeta
}

async function loadWorkflows(pikkuDir: string): Promise<WorkflowMeta[]> {
  const workflowMetaDir = join(pikkuDir, 'workflow', 'meta')
  if (!(await fileExists(workflowMetaDir))) {
    return []
  }

  const entries = await readdir(workflowMetaDir)
  // Only read non-verbose files (the verbose ones duplicate the same data with extras)
  const metaFiles = entries.filter(
    (f) => f.endsWith('.gen.json') && !f.includes('-verbose')
  )

  const results: WorkflowMeta[] = []
  for (const file of metaFiles) {
    const meta = await readJsonFile<WorkflowMeta>(join(workflowMetaDir, file))
    if (meta) {
      results.push(meta)
    }
  }
  return results
}

async function loadProjectMetadata(pikkuDir: string): Promise<ProjectMetadata> {
  const [
    functions,
    http,
    queueWorkers,
    schedulers,
    agents,
    mcp,
    channels,
    workflows,
    secrets,
    variables,
  ] = await Promise.all([
    readJsonFile<FunctionsMeta>(
      join(pikkuDir, 'function', 'pikku-functions-meta-verbose.gen.json')
    ).then((r) => r ?? {}),
    readJsonFile<HttpWiringsMeta>(
      join(pikkuDir, 'http', 'pikku-http-wirings-meta.gen.json')
    ).then((r) => r ?? {}),
    readJsonFile<QueueWorkersMeta>(
      join(pikkuDir, 'queue', 'pikku-queue-workers-wirings-meta.gen.json')
    ).then((r) => r ?? {}),
    readJsonFile<ScheduledTasksMeta>(
      join(pikkuDir, 'scheduler', 'pikku-schedulers-wirings-meta.gen.json')
    ).then((r) => r ?? {}),
    readJsonFile<{ agentsMeta: AIAgentMeta }>(
      join(pikkuDir, 'agent', 'pikku-agent-wirings-meta.gen.json')
    ).then((r) => r ?? { agentsMeta: {} }),
    readJsonFile<{
      toolsMeta: MCPToolMeta
      resourcesMeta: MCPResourceMeta
      promptsMeta: MCPPromptMeta
    }>(join(pikkuDir, 'mcp', 'pikku-mcp-wirings-meta.gen.json')).then(
      (r) => r ?? { toolsMeta: {}, resourcesMeta: {}, promptsMeta: {} }
    ),
    readJsonFile<ChannelsMeta>(
      join(pikkuDir, 'channel', 'pikku-channels-meta.gen.json')
    ).then((r) => r ?? {}),
    loadWorkflows(pikkuDir),
    readJsonFile<SecretDefinitionsMeta>(
      join(pikkuDir, 'secrets', 'pikku-secrets-meta.gen.json')
    ).then((r) => r ?? {}),
    readJsonFile<VariableDefinitionsMeta>(
      join(pikkuDir, 'variables', 'pikku-variables-meta.gen.json')
    ).then((r) => r ?? {}),
  ])

  return {
    functions,
    http,
    queueWorkers,
    schedulers,
    agents,
    mcp,
    channels,
    workflows,
    secrets,
    variables,
  }
}

// ---------------------------------------------------------------------------
// Worker name helpers
// ---------------------------------------------------------------------------

/**
 * Converts a camelCase or PascalCase function ID into a kebab-case worker name.
 */
function toWorkerName(funcId: string): string {
  return funcId
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

// ---------------------------------------------------------------------------
// HTTP route collection helpers
// ---------------------------------------------------------------------------

function collectHttpRoutesForFunction(
  http: HttpWiringsMeta,
  funcId: string
): string[] {
  const routes: string[] = []
  const methods = [
    'get',
    'post',
    'put',
    'delete',
    'head',
    'patch',
    'options',
  ] as const
  for (const method of methods) {
    const methodRoutes = http[method]
    if (!methodRoutes) continue
    for (const [_path, route] of Object.entries(methodRoutes)) {
      if (route.pikkuFuncId === funcId) {
        routes.push(`${method.toUpperCase()} ${route.route}`)
      }
    }
  }
  return routes
}

// ---------------------------------------------------------------------------
// Manifest builder
// ---------------------------------------------------------------------------

function buildWorkers(meta: ProjectMetadata): WorkerSpec[] {
  const workers: WorkerSpec[] = []
  const claimed = new Set<string>()

  // 1. HTTP-exposed functions -> individual Worker per function
  for (const [funcId, funcMeta] of Object.entries(meta.functions)) {
    if (!funcMeta.expose) continue
    const routes = collectHttpRoutesForFunction(meta.http, funcId)
    const workerName = toWorkerName(funcId)
    const bindings = buildFunctionBindings(funcMeta, meta)

    workers.push({
      name: workerName,
      role: 'http',
      entryPoint: `functions/${funcId}.ts`,
      routes,
      bindings,
      functionIds: [funcId],
    })
    claimed.add(funcId)
  }

  // 2. Remote functions -> Worker with service binding
  for (const [funcId, funcMeta] of Object.entries(meta.functions)) {
    if (!funcMeta.remote || claimed.has(funcId)) continue
    const workerName = toWorkerName(funcId)
    const bindings = buildFunctionBindings(funcMeta, meta)

    workers.push({
      name: workerName,
      role: 'remote',
      entryPoint: `functions/${funcId}.ts`,
      routes: [],
      bindings,
      functionIds: [funcId],
    })
    claimed.add(funcId)
  }

  // 3. MCP tools -> single MCP Worker bundling all tools
  const mcpToolIds = Object.values(meta.mcp.toolsMeta)
    .map((t) => t.pikkuFuncId)
    .filter((id): id is string => id != null && !claimed.has(id))

  // Also include functions explicitly marked with tool: true
  for (const [funcId, funcMeta] of Object.entries(meta.functions)) {
    if (funcMeta.mcp && !claimed.has(funcId) && !mcpToolIds.includes(funcId)) {
      mcpToolIds.push(funcId)
    }
  }

  if (mcpToolIds.length > 0) {
    const allBindings = mergeBindings(
      mcpToolIds.flatMap((id) => {
        const fm = meta.functions[id]
        return fm ? buildFunctionBindings(fm, meta) : []
      })
    )

    workers.push({
      name: 'mcp-tools',
      role: 'mcp',
      entryPoint: 'mcp/server.ts',
      routes: ['POST /mcp'],
      bindings: allBindings,
      functionIds: mcpToolIds,
    })
    for (const id of mcpToolIds) claimed.add(id)
  }

  // 4. Agents -> one Worker per agent (sub-agents bundled)
  for (const [agentName, agentMeta] of Object.entries(meta.agents.agentsMeta)) {
    const agentFuncIds: string[] = []
    if (agentMeta.pikkuFuncId) {
      agentFuncIds.push(agentMeta.pikkuFuncId)
    }
    // Bundle sub-agents
    if (agentMeta.subAgents) {
      for (const subAgent of agentMeta.subAgents) {
        if (!claimed.has(subAgent)) {
          agentFuncIds.push(subAgent)
        }
      }
    }
    // Bundle agent tools
    if (agentMeta.tools) {
      for (const tool of agentMeta.tools) {
        const toolId = typeof tool === 'string' ? tool : tool.pikkuFuncId
        if (!claimed.has(toolId)) {
          agentFuncIds.push(toolId)
        }
      }
    }

    if (agentFuncIds.length === 0) continue

    const allBindings = mergeBindings(
      agentFuncIds.flatMap((id) => {
        const fm = meta.functions[id]
        return fm ? buildFunctionBindings(fm, meta) : []
      })
    )

    const workerName = `agent-${toWorkerName(agentName)}`
    workers.push({
      name: workerName,
      role: 'agent',
      entryPoint: `agents/${agentName}.ts`,
      routes: [],
      bindings: allBindings,
      functionIds: agentFuncIds,
    })
    for (const id of agentFuncIds) claimed.add(id)
  }

  // 5. Queue workers -> Worker as consumer
  for (const [queueName, queueMeta] of Object.entries(meta.queueWorkers)) {
    const funcId = queueMeta.pikkuFuncId
    if (claimed.has(funcId)) continue

    const funcMeta = meta.functions[funcId]
    const bindings = funcMeta ? buildFunctionBindings(funcMeta, meta) : []
    const workerName = toWorkerName(queueName)

    workers.push({
      name: workerName,
      role: 'queue-consumer',
      entryPoint: `functions/${funcId}.ts`,
      routes: [],
      bindings: [...bindings, { type: 'queue', name: queueName, queueName }],
      functionIds: [funcId],
    })
    claimed.add(funcId)
  }

  // 6. Schedulers / cron -> Worker with cron trigger
  for (const [schedName, schedMeta] of Object.entries(meta.schedulers)) {
    const funcId = schedMeta.pikkuFuncId
    if (claimed.has(funcId)) continue

    const funcMeta = meta.functions[funcId]
    const bindings = funcMeta ? buildFunctionBindings(funcMeta, meta) : []
    const workerName = `cron-${toWorkerName(schedName)}`

    workers.push({
      name: workerName,
      role: 'cron',
      entryPoint: `functions/${funcId}.ts`,
      routes: [],
      bindings,
      functionIds: [funcId],
    })
    claimed.add(funcId)
  }

  // 7. Workflows -> orchestrator + step workers
  for (const workflow of meta.workflows) {
    const orchestratorFuncIds: string[] = [workflow.pikkuFuncId]
    const workerName = `wf-${toWorkerName(workflow.name)}`

    for (const [_nodeId, node] of Object.entries(workflow.nodes)) {
      // Inline steps are bundled with the orchestrator
      if (node.flow === 'inline') {
        if (node.rpcName && !claimed.has(node.rpcName)) {
          orchestratorFuncIds.push(node.rpcName)
        }
        continue
      }

      // Return nodes have no function to deploy
      if (node.flow === 'return') continue

      // Non-inline steps with an rpcName become individual step workers
      if (node.rpcName && !claimed.has(node.rpcName)) {
        const stepFuncMeta = meta.functions[node.rpcName]
        const stepBindings = stepFuncMeta
          ? buildFunctionBindings(stepFuncMeta, meta)
          : []
        const stepQueueName = `wf-${toWorkerName(workflow.name)}-${toWorkerName(node.nodeId)}`

        workers.push({
          name: `wf-step-${toWorkerName(node.rpcName)}`,
          role: 'workflow-step',
          entryPoint: `functions/${node.rpcName}.ts`,
          routes: [],
          bindings: [
            ...stepBindings,
            { type: 'queue', name: stepQueueName, queueName: stepQueueName },
          ],
          functionIds: [node.rpcName],
        })
        claimed.add(node.rpcName)
      }
    }

    // Build orchestrator worker
    const orchBindings = mergeBindings(
      orchestratorFuncIds.flatMap((id) => {
        const fm = meta.functions[id]
        return fm ? buildFunctionBindings(fm, meta) : []
      })
    )

    if (!claimed.has(workflow.pikkuFuncId)) {
      workers.push({
        name: workerName,
        role: 'workflow-orchestrator',
        entryPoint: `workflows/${workflow.name}.ts`,
        routes: [],
        bindings: orchBindings,
        functionIds: orchestratorFuncIds,
      })
      claimed.add(workflow.pikkuFuncId)
    }
  }

  return workers
}

// ---------------------------------------------------------------------------
// Binding helpers
// ---------------------------------------------------------------------------

function buildFunctionBindings(
  funcMeta: { services?: { services: string[] }; wires?: { wires: string[] } },
  _meta: ProjectMetadata
): Binding[] {
  const bindings: Binding[] = []
  const services = funcMeta.services?.services ?? []

  // Map well-known services to bindings
  for (const svc of services) {
    if (
      svc === 'kysely' ||
      svc.toLowerCase().includes('database') ||
      svc.toLowerCase().includes('db')
    ) {
      bindings.push({ type: 'd1', name: 'DB', databaseName: 'pikku-runtime' })
    }
    if (
      svc.toLowerCase().includes('content') ||
      svc.toLowerCase().includes('storage') ||
      svc.toLowerCase().includes('backblaze')
    ) {
      bindings.push({
        type: 'r2',
        name: 'STORAGE',
        bucketName: 'project-storage',
      })
    }
  }

  return bindings
}

/**
 * Merges an array of bindings, deduplicating by type + name.
 */
function mergeBindings(bindings: Binding[]): Binding[] {
  const seen = new Map<string, Binding>()
  for (const b of bindings) {
    const key = `${b.type}:${b.name}`
    if (!seen.has(key)) {
      seen.set(key, b)
    }
  }
  return [...seen.values()]
}

// ---------------------------------------------------------------------------
// Queue spec builder
// ---------------------------------------------------------------------------

function buildQueues(
  meta: ProjectMetadata,
  workers: WorkerSpec[]
): QueueSpec[] {
  const queues: QueueSpec[] = []
  const seen = new Set<string>()

  // Queues from queue workers
  for (const [queueName, _queueMeta] of Object.entries(meta.queueWorkers)) {
    const workerName = toWorkerName(queueName)
    if (!seen.has(queueName)) {
      queues.push({ name: queueName, consumerWorker: workerName })
      seen.add(queueName)
    }
  }

  // Queues from workflow step workers (they have queue bindings)
  for (const worker of workers) {
    if (worker.role === 'workflow-step') {
      for (const binding of worker.bindings) {
        if (binding.type === 'queue' && !seen.has(binding.queueName)) {
          queues.push({ name: binding.queueName, consumerWorker: worker.name })
          seen.add(binding.queueName)
        }
      }
    }
  }

  return queues
}

// ---------------------------------------------------------------------------
// Cron trigger builder
// ---------------------------------------------------------------------------

function buildCronTriggers(meta: ProjectMetadata): CronTriggerSpec[] {
  const triggers: CronTriggerSpec[] = []

  for (const [schedName, schedMeta] of Object.entries(meta.schedulers)) {
    triggers.push({
      name: schedName,
      schedule: schedMeta.schedule,
      workerName: `cron-${toWorkerName(schedName)}`,
      functionId: schedMeta.pikkuFuncId,
    })
  }

  return triggers
}

// ---------------------------------------------------------------------------
// Channel builder
// ---------------------------------------------------------------------------

/**
 * Collects all pikkuFuncIds referenced in a channel's messageWirings.
 */
function collectChannelFunctionIds(channelMeta: ChannelMeta): string[] {
  const ids: string[] = []
  const commands = channelMeta.messageWirings?.command
  if (commands) {
    for (const wiring of Object.values(commands)) {
      if (wiring.pikkuFuncId) {
        ids.push(wiring.pikkuFuncId)
      }
    }
  }
  return ids
}

function buildChannels(meta: ProjectMetadata): ChannelSpec[] {
  const channels: ChannelSpec[] = []

  for (const [channelName, channelMeta] of Object.entries(meta.channels)) {
    // Channels don't have a single pikkuFuncId; they reference functions
    // through messageWirings.command entries. Use the first one as primary,
    // or fall back to the channel name.
    const funcIds = collectChannelFunctionIds(channelMeta)
    channels.push({
      name: channelMeta.name ?? channelName,
      functionId: funcIds[0] ?? channelName,
    })
  }

  return channels
}

// ---------------------------------------------------------------------------
// D1 / R2 detection
// ---------------------------------------------------------------------------

function detectD1Databases(
  workers: WorkerSpec[]
): { name: string; migrationsDir: string | null }[] {
  const hasD1 = workers.some((w) => w.bindings.some((b) => b.type === 'd1'))
  if (!hasD1) return []
  return [{ name: 'pikku-runtime', migrationsDir: 'migrations' }]
}

function detectR2Buckets(workers: WorkerSpec[]): { name: string }[] {
  const buckets = new Set<string>()
  for (const worker of workers) {
    for (const binding of worker.bindings) {
      if (binding.type === 'r2') {
        buckets.add(binding.bucketName)
      }
    }
  }
  return [...buckets].map((name) => ({ name }))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AnalyzerOptions {
  projectId?: string
  version?: string
}

/**
 * Analyzes a Pikku project directory and produces a DeploymentManifest.
 *
 * @param projectDir - Root directory of the Pikku project (containing `.pikku/`)
 * @param options - Project ID and version to embed in the manifest
 * @returns A complete DeploymentManifest describing desired Cloudflare state
 */
export async function analyzeProject(
  projectDir: string,
  options?: AnalyzerOptions
): Promise<DeploymentManifest> {
  const pikkuDir = join(projectDir, '.pikku')

  if (!(await fileExists(pikkuDir))) {
    throw new Error(
      `No .pikku directory found at ${pikkuDir}. Run \`pikku all\` first to generate metadata.`
    )
  }

  const meta = await loadProjectMetadata(pikkuDir)
  const workers = buildWorkers(meta)
  const queues = buildQueues(meta, workers)
  const cronTriggers = buildCronTriggers(meta)
  const channels = buildChannels(meta)
  const d1Databases = detectD1Databases(workers)
  const r2Buckets = detectR2Buckets(workers)

  // Collect secret names (the secretId is the env-var-style name)
  const secrets = Object.values(meta.secrets).map((s) => s.secretId)

  // Collect variables as a name -> variableId map
  // The actual values come from the environment at deploy time;
  // here we record the variable IDs the project declares.
  const variables: Record<string, string> = {}
  for (const v of Object.values(meta.variables)) {
    variables[v.variableId] = ''
  }

  return {
    projectId: options?.projectId ?? basename(projectDir),
    version: options?.version ?? '0',
    workers,
    queues,
    d1Databases,
    r2Buckets,
    cronTriggers,
    channels,
    secrets,
    variables,
    containers: [],
  }
}
