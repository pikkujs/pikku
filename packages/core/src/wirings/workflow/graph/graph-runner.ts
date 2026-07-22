import {
  type PikkuWorkflowService,
  WorkflowAsyncException,
  WorkflowSuspendedException,
  DEFAULT_STEP_RETRIES,
} from '../pikku-workflow-service.js'
import type { GraphWireState, PikkuGraphWire } from './workflow-graph.types.js'
import { pikkuState, getSingletonServices } from '../../../pikku-state.js'
import type { WorkflowRuntimeMeta, WorkflowRunWire } from '../workflow.types.js'
import { RPCNotFoundError } from '../../rpc/rpc-runner.js'

export class ChildWorkflowStartedException extends Error {
  name = 'ChildWorkflowStartedException'
  constructor(
    public parentRunId: string,
    public stepId: string,
    public childRunId: string
  ) {
    super(`Child workflow started: ${childRunId}`)
  }
}

function buildTemplateRegex(nodeId: string): RegExp | null {
  if (!nodeId.includes('${')) return null
  const escaped = nodeId
    .split(/\$\{[^}]+\}/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.+')
  return new RegExp(`^${escaped}$`)
}

/** Strip a trailing revisit ordinal (`node#2` → `node`); leaves other names as-is. */
function stripInstanceOrdinal(name: string): string {
  const hash = name.lastIndexOf('#')
  if (hash <= 0) return name
  return /^\d+$/.test(name.slice(hash + 1)) ? name.slice(0, hash) : name
}

function remapStepNamesToNodeIds(
  stepNames: string[],
  nodes: Record<string, any>,
  graphName: string
): string[] {
  const templatePatterns = new Map<string, RegExp>()
  for (const nodeId of Object.keys(nodes)) {
    const regex = buildTemplateRegex(nodeId)
    if (regex) templatePatterns.set(nodeId, regex)
  }
  return stepNames.map((name) => {
    if (nodes[name]) return name
    // Revisit instance (`node#N`) maps to its logical node.
    const base = stripInstanceOrdinal(name)
    if (base !== name && nodes[base]) return base
    const matches: string[] = []
    for (const [nodeId, regex] of templatePatterns) {
      if (regex.test(base)) matches.push(nodeId)
    }
    if (matches.length > 1) {
      throw new Error(
        `Workflow graph '${graphName}': ambiguous template node match for '${name}' (${matches.join(', ')})`
      )
    }
    if (matches.length === 1) {
      return matches[0]!
    }
    return name
  })
}

const ENTRY_FROM = '__entry__'

/** Whether `target` can reach `source` over `next` edges — i.e. an edge
 *  source→target closes a cycle (a back-edge), vs a plain forward edge. */
function closesCycle(
  source: string,
  target: string,
  nodes: Record<string, any>
): boolean {
  const seen = new Set<string>()
  const stack = [target]
  while (stack.length) {
    const cur = stack.pop()!
    if (cur === source) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const next of normalizeNodeTargets(nodes[cur]?.next)) stack.push(next)
  }
  return false
}

/**
 * Decide which next steps to fire this tick. Two kinds of edge:
 *  - forward edge → node-once: fire the target only if it has no instance yet,
 *    so converging edges (joins) collapse to a single run (unchanged behavior).
 *  - back-edge (target can reach the source, closing a cycle) → revisit: fire a
 *    fresh ordinal instance (`target#1`, …), edge-once on `from → target` so it
 *    doesn't re-fire every tick. Cycles terminate when branch routing stops
 *    looping back; a node always records the predecessor it was reached from.
 */
function planGraphTransitions(
  nodes: Record<string, any>,
  instances: Array<{ stepName: string; status: string; fromStepName?: string }>,
  branchByStep: Record<string, string>,
  entryNodeIds: string[],
  graphName: string
): {
  toFire: Array<{ logical: string; instanceKey: string; fromStepName?: string }>
  hasInFlight: boolean
  blockedWaiting: boolean
} {
  const toLogical = (name: string) =>
    remapStepNamesToNodeIds([name], nodes, graphName)[0]!

  const countByLogical: Record<string, number> = {}
  const consumed = new Set<string>()
  for (const inst of instances) {
    const logical = toLogical(inst.stepName)
    countByLogical[logical] = (countByLogical[logical] ?? 0) + 1
    consumed.add(`${inst.fromStepName ?? ENTRY_FROM}->${logical}`)
  }

  const completed = instances.filter((i) => i.status === 'succeeded')
  const completedLogical = new Set(completed.map((i) => toLogical(i.stepName)))

  // Available edges: entry edges + each completed instance's resolved `next`.
  const edges: Array<{
    from?: string
    fromKey: string
    fromLogical?: string
    target: string
  }> = []
  for (const entryId of entryNodeIds) {
    edges.push({ fromKey: ENTRY_FROM, target: entryId })
  }
  for (const inst of completed) {
    const fromLogical = toLogical(inst.stepName)
    const node = nodes[fromLogical]
    if (!node?.next) continue
    for (const target of resolveNextFromConfig(
      node.next,
      branchByStep[inst.stepName]
    )) {
      edges.push({
        from: inst.stepName,
        fromKey: inst.stepName,
        fromLogical,
        target,
      })
    }
  }

  const toFire: Array<{
    logical: string
    instanceKey: string
    fromStepName?: string
  }> = []
  let blockedWaiting = false
  for (const edge of edges) {
    const target = edge.target
    const edgeKey = `${edge.fromKey}->${target}`
    if (consumed.has(edgeKey)) continue
    const visits = countByLogical[target] ?? 0
    const isBackEdge =
      edge.fromLogical !== undefined &&
      closesCycle(edge.fromLogical, target, nodes)
    // Forward edge into an already-started node = a join; node-once.
    if (!isBackEdge && visits > 0) {
      consumed.add(edgeKey)
      continue
    }
    if (!areDependenciesSatisfied(nodes[target] ?? {}, completedLogical)) {
      blockedWaiting = true
      continue
    }
    toFire.push({
      logical: target,
      instanceKey: visits === 0 ? target : `${target}#${visits}`,
      fromStepName: edge.from,
    })
    countByLogical[target] = visits + 1
    consumed.add(edgeKey)
  }

  return {
    toFire,
    hasInFlight: instances.some((i) => i.status !== 'succeeded'),
    blockedWaiting,
  }
}

function remapBranchKeys(
  branchKeys: Record<string, string>,
  nodes: Record<string, any>,
  graphName: string
): Record<string, string> {
  const templatePatterns = new Map<string, RegExp>()
  for (const nodeId of Object.keys(nodes)) {
    const regex = buildTemplateRegex(nodeId)
    if (regex) templatePatterns.set(nodeId, regex)
  }
  if (templatePatterns.size === 0) return branchKeys
  const remapped: Record<string, string> = {}
  for (const [key, value] of Object.entries(branchKeys)) {
    let mappedKey = key
    if (!nodes[key]) {
      const matches: string[] = []
      for (const [nodeId, regex] of templatePatterns) {
        if (regex.test(key)) matches.push(nodeId)
      }
      if (matches.length > 1) {
        throw new Error(
          `Workflow graph '${graphName}': ambiguous template branch key match for '${key}' (${matches.join(', ')})`
        )
      }
      if (matches.length === 1) {
        mappedKey = matches[0]!
      }
    }
    remapped[mappedKey] = value
  }
  return remapped
}

function isDataRef(value: unknown): value is { $ref: string; path?: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$ref' in value &&
    typeof (value as any).$ref === 'string'
  )
}

interface TemplateValue {
  $template: {
    parts: string[]
    expressions: Array<{ $ref: string; path?: string }>
  }
}

function isTemplate(value: unknown): value is TemplateValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$template' in value &&
    typeof (value as any).$template === 'object'
  )
}

function getWorkflowMeta(name: string): WorkflowRuntimeMeta | undefined {
  const rootMeta = pikkuState(null, 'workflows', 'meta')
  if (rootMeta[name]) return rootMeta[name]

  const colonIndex = name.indexOf(':')
  if (colonIndex !== -1) {
    const namespace = name.substring(0, colonIndex)
    const localName = name.substring(colonIndex + 1)
    const addons = pikkuState(null, 'addons', 'packages')
    const pkgConfig = addons?.get(namespace)
    if (pkgConfig) {
      const addonMeta = pikkuState(pkgConfig.package, 'workflows', 'meta')
      if (addonMeta?.[localName]) return addonMeta[localName]
    }
  }

  return undefined
}

function resolveNextFromConfig(next: unknown, branchKey?: string): string[] {
  if (!next) return []

  if (typeof next === 'string') return [next]
  if (Array.isArray(next)) return next

  if (typeof next === 'object' && next !== null) {
    if (!branchKey || !(branchKey in next)) return []
    const branchNext = (next as Record<string, string | string[]>)[branchKey]!
    return Array.isArray(branchNext) ? branchNext : [branchNext]
  }

  return []
}

function getValueAtPath(obj: any, path: string): any {
  if (!path) return obj
  const parts = path.split('.')
  let current = obj
  for (const part of parts) {
    if (current == null) return undefined
    current = current[part]
  }
  return current
}

function resolveTemplate(
  template: TemplateValue,
  nodeResults: Record<string, any>
): string {
  const { parts, expressions } = template.$template
  let result = ''
  for (let i = 0; i < parts.length; i++) {
    result += parts[i]
    if (i < expressions.length) {
      const expr = expressions[i]!
      const nodeResult = nodeResults[expr.$ref]
      const value = expr.path
        ? getValueAtPath(nodeResult, expr.path)
        : nodeResult
      result += String(value ?? '')
    }
  }
  return result
}

function resolveValue(value: unknown, nodeResults: Record<string, any>): any {
  if (isDataRef(value)) {
    if (value.$ref === '$item') {
      return value
    }
    const source = nodeResults[value.$ref]
    return value.path ? getValueAtPath(source, value.path) : source
  }
  if (isTemplate(value)) {
    return resolveTemplate(value, nodeResults)
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, nodeResults))
  }
  if (typeof value === 'object' && value !== null) {
    const resolved: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) {
      resolved[k] = resolveValue(v, nodeResults)
    }
    return resolved
  }
  return value
}

function resolveSerializedInput(
  input: Record<string, unknown> | undefined,
  nodeResults: Record<string, any>
): Record<string, any> {
  if (!input || Object.keys(input).length === 0) return {}

  const resolved: Record<string, any> = {}
  for (const [key, value] of Object.entries(input)) {
    resolved[key] = resolveValue(value, nodeResults)
  }
  return resolved
}

function collectReferencedNodeIds(value: unknown, nodeIds: string[]): void {
  if (isDataRef(value)) {
    nodeIds.push(value.$ref)
  } else if (isTemplate(value)) {
    for (const expr of value.$template.expressions) {
      nodeIds.push(expr.$ref)
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collectReferencedNodeIds(item, nodeIds)
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const v of Object.values(value)) {
      collectReferencedNodeIds(v, nodeIds)
    }
  }
}

function extractReferencedNodeIds(
  input: Record<string, unknown> | undefined
): string[] {
  if (!input) return []
  const nodeIds: string[] = []
  for (const value of Object.values(input)) {
    collectReferencedNodeIds(value, nodeIds)
  }
  return [...new Set(nodeIds)]
}

const IGNORED_REFS = new Set(['trigger', '$item', 'unknown'])

function normalizeNodeTargets(value: unknown): string[] {
  if (!value) return []
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string')
  if (typeof value === 'object') {
    const targets: string[] = []
    for (const branchTarget of Object.values(
      value as Record<string, unknown>
    )) {
      targets.push(...normalizeNodeTargets(branchTarget))
    }
    return targets
  }
  return []
}

function validateGraphReferences(
  graphName: string,
  nodes: Record<string, any>,
  entryNodes: string[]
): void {
  const nodeIds = new Set(Object.keys(nodes))

  for (const entryId of entryNodes) {
    if (!nodeIds.has(entryId)) {
      throw new Error(
        `Workflow graph '${graphName}': entry node '${entryId}' is not defined`
      )
    }
  }

  for (const [nodeId, node] of Object.entries(nodes)) {
    const inputRefs = extractReferencedNodeIds(node.input).filter(
      (id) => !IGNORED_REFS.has(id)
    )
    for (const refId of inputRefs) {
      if (!nodeIds.has(refId)) {
        throw new Error(
          `Workflow graph '${graphName}': node '${nodeId}' references unknown node '${refId}' in input`
        )
      }
    }

    const nextTargets = normalizeNodeTargets(node.next)
    for (const nextId of nextTargets) {
      if (!nodeIds.has(nextId)) {
        throw new Error(
          `Workflow graph '${graphName}': node '${nodeId}' routes to unknown node '${nextId}'`
        )
      }
    }

    const errorTargets = normalizeNodeTargets(node.onError)
    for (const errorId of errorTargets) {
      if (!nodeIds.has(errorId)) {
        throw new Error(
          `Workflow graph '${graphName}': node '${nodeId}' onError targets unknown node '${errorId}'`
        )
      }
    }
  }
}

function areDependenciesSatisfied(
  node: { input?: Record<string, unknown> },
  completedNodeIds: Set<string>
): boolean {
  const deps = extractReferencedNodeIds(node.input).filter(
    (id) => !IGNORED_REFS.has(id)
  )
  return deps.every((dep) => completedNodeIds.has(dep))
}

async function queueGraphNode(
  workflowService: PikkuWorkflowService,
  runId: string,
  _graphName: string,
  nodeId: string,
  rpcName: string,
  input: any,
  nodeConfig?: { retries?: number; retryDelay?: string | number },
  fromStepName?: string
): Promise<void> {
  // Default to the workflow-wide retry policy when the node sets none, so the
  // persisted step retries match the queue `attempts` (see resolveStepJobOptions).
  const stepOptions = {
    retries: nodeConfig?.retries ?? DEFAULT_STEP_RETRIES,
    retryDelay: nodeConfig?.retryDelay,
  }
  await workflowService.insertStepState(
    runId,
    nodeId,
    rpcName,
    input,
    stepOptions,
    fromStepName
  )
  await workflowService.queueStepWorker(
    runId,
    nodeId,
    rpcName,
    input,
    stepOptions,
    fromStepName
  )
}

export async function continueGraph(
  workflowService: PikkuWorkflowService,
  runId: string,
  graphName: string,
  overrideMeta?: WorkflowRuntimeMeta
): Promise<void> {
  const meta = overrideMeta ?? getWorkflowMeta(graphName)
  if (!meta?.nodes) {
    throw new Error(`Workflow graph meta '${graphName}' not found`)
  }

  const nodes = meta.nodes
  validateGraphReferences(graphName, nodes, meta.entryNodeIds ?? [])

  const {
    completedNodeIds: rawCompleted,
    failedNodeIds: rawFailed,
    branchKeys: branchByStep,
  } = await workflowService.getCompletedGraphState(runId)
  // Validate step/branch names map to unambiguous nodes (planning keys
  // physically; these calls only surface ambiguous template configs).
  remapStepNamesToNodeIds(rawCompleted, nodes, graphName)
  remapBranchKeys(branchByStep, nodes, graphName)
  const failedNodeIds = remapStepNamesToNodeIds(rawFailed, nodes, graphName)

  if (failedNodeIds.length > 0) {
    const failedNode = failedNodeIds[0]!
    await workflowService.updateRunStatus(runId, 'failed', undefined, {
      message: `Graph node '${failedNode}' failed after exhausting retries`,
      stack: '',
      code: 'GRAPH_NODE_FAILED',
    })
    return
  }

  const currentRun = await workflowService.getRun(runId)
  if (currentRun?.status === 'suspended') {
    return
  }

  const instances = await workflowService.getStepInstances(runId)
  const plan = planGraphTransitions(
    nodes,
    instances,
    branchByStep,
    meta.entryNodeIds ?? [],
    graphName
  )

  if (plan.toFire.length === 0) {
    // Nothing left to fire and nothing running/blocked → the run is done.
    if (!plan.hasInFlight && !plan.blockedWaiting) {
      await workflowService.updateRunStatus(runId, 'completed')
    }
    return
  }

  const run = await workflowService.getRun(runId)
  const triggerInput = run?.input

  for (const fire of plan.toFire) {
    const node = nodes[fire.logical]
    if (!node?.rpcName) continue

    const referencedNodeIds = extractReferencedNodeIds(node.input).filter(
      (id) => !IGNORED_REFS.has(id)
    )
    const fetchedResults = await workflowService.getNodeResults(
      runId,
      referencedNodeIds
    )
    const nodeResults = { trigger: triggerInput, ...fetchedResults }
    const resolvedInput = resolveSerializedInput(node.input, nodeResults)

    await queueGraphNode(
      workflowService,
      runId,
      graphName,
      fire.instanceKey,
      node.rpcName,
      resolvedInput,
      node,
      fire.fromStepName
    )
  }
}

/**
 * Invoke a graph node's RPC with the graph + workflow wires, capturing any
 * branch the node selects and persisting it. Shared by the queued
 * (executeGraphStep) and inline (executeGraphNodeInline) executors so both build
 * the wire and record the branch identically — only their child-workflow and
 * onError handling differs around this call.
 */
async function invokeGraphNodeRpc(
  workflowService: PikkuWorkflowService,
  rpcService: any,
  runId: string,
  stepId: string,
  nodeId: string,
  rpcName: string,
  input: any,
  graphName: string
): Promise<any> {
  const wireState: GraphWireState = {}
  const graphWire: PikkuGraphWire = {
    runId,
    graphName,
    nodeId,
    branch: (key: string) => {
      wireState.branchKey = key
    },
    setState: (name: string, value: unknown) =>
      workflowService.updateRunState(runId, name, value),
    getState: () => workflowService.getRunState(runId),
  }

  const result = await rpcService.rpcWithWire(rpcName, input, {
    graph: graphWire,
    workflow: workflowService.createWorkflowWire(graphName, runId, rpcService),
  })

  if (wireState.branchKey) {
    await workflowService.setBranchTaken(stepId, wireState.branchKey)
  }

  return result
}

export async function executeGraphStep(
  workflowService: PikkuWorkflowService,
  rpcService: any,
  runId: string,
  stepId: string,
  nodeId: string,
  rpcName: string,
  data: any,
  graphName: string
): Promise<any> {
  try {
    let result: any

    const subWorkflowMeta = pikkuState(null, 'workflows', 'meta')[rpcName]
    const agentMeta = subWorkflowMeta
      ? undefined
      : pikkuState(null, 'agent', 'agentsMeta')[rpcName]
    if (subWorkflowMeta) {
      const childWire: WorkflowRunWire = {
        type: 'workflow',
        id: rpcName,
        parentRunId: runId,
        parentStepId: stepId,
      }
      const shouldInline = !getSingletonServices()?.queueService
      const { runId: childRunId } = await workflowService.startWorkflow(
        rpcName,
        data,
        childWire,
        rpcService,
        { inline: shouldInline }
      )
      await workflowService.setStepChildRunId(stepId, childRunId)

      if (shouldInline) {
        const childRun = await workflowService.getRun(childRunId)
        if (childRun?.status === 'failed') {
          throw new Error(childRun.error?.message || 'Sub-workflow failed')
        }
        if (childRun?.status === 'cancelled') {
          throw new Error('Sub-workflow was cancelled')
        }
        result = childRun?.output
      } else {
        throw new ChildWorkflowStartedException(runId, stepId, childRunId)
      }
    } else if (agentMeta) {
      const agentRun = await rpcService.agent.run(rpcName, data)
      result = agentRun.result
    } else {
      result = await invokeGraphNodeRpc(
        workflowService,
        rpcService,
        runId,
        stepId,
        nodeId,
        rpcName,
        data,
        graphName
      )
    }

    return result
  } catch (error) {
    if (
      error instanceof WorkflowAsyncException ||
      error instanceof WorkflowSuspendedException
    ) {
      throw error
    }
    if (error instanceof ChildWorkflowStartedException) {
      throw error
    }
    if (error instanceof RPCNotFoundError) {
      await workflowService.updateRunStatus(runId, 'suspended', undefined, {
        message: `RPC '${rpcName}' not found. Deploy the missing function and resume.`,
        code: 'RPC_NOT_FOUND',
      })
      throw error
    }
    const meta = getWorkflowMeta(graphName)
    if (meta?.nodes) {
      const node = meta.nodes[nodeId]
      if (node?.onError) {
        const errorNodes = Array.isArray(node.onError)
          ? node.onError
          : [node.onError]
        for (const errorNodeId of errorNodes) {
          const errorNode = meta.nodes[errorNodeId]
          if (errorNode) {
            await queueGraphNode(
              workflowService,
              runId,
              graphName,
              errorNodeId,
              errorNode.rpcName,
              { error: { message: (error as Error).message } },
              errorNode
            )
          }
        }
        throw error
      }
    }
    throw error
  }
}

export async function onGraphNodeComplete(
  workflowService: PikkuWorkflowService,
  runId: string,
  graphName: string
): Promise<void> {
  await continueGraph(workflowService, runId, graphName)
}

export async function runFromMeta(
  workflowService: PikkuWorkflowService,
  runId: string,
  meta: WorkflowRuntimeMeta,
  _rpcService: any
): Promise<void> {
  await continueGraph(workflowService, runId, meta.name, meta)
}

async function executeGraphNodeInline(
  workflowService: PikkuWorkflowService,
  rpcService: any,
  runId: string,
  graphName: string,
  nodeId: string,
  instanceKey: string,
  input: any,
  nodes: Record<string, any>,
  fromStepName?: string
): Promise<void> {
  const node = nodes[nodeId]
  if (!node) return

  const rpcName = node.rpcName

  // Persist under the physical instance key (node, node#1 … for revisits) and
  // record the predecessor — same as the queued path (queueGraphNode), so an
  // inline graph run stores identical step rows + provenance.
  const stepState = await workflowService.insertStepState(
    runId,
    instanceKey,
    rpcName,
    input,
    { retries: node.retries ?? 0, retryDelay: node.retryDelay },
    fromStepName
  )

  await workflowService.setStepRunning(stepState.stepId)

  try {
    let result: any

    const subWorkflowMeta = pikkuState(null, 'workflows', 'meta')[rpcName]
    const agentMeta = subWorkflowMeta
      ? undefined
      : pikkuState(null, 'agent', 'agentsMeta')[rpcName]
    if (subWorkflowMeta) {
      const childWire: WorkflowRunWire = {
        type: 'workflow',
        id: rpcName,
        parentRunId: runId,
        parentStepId: stepState.stepId,
      }
      const { runId: childRunId } = await workflowService.startWorkflow(
        rpcName,
        input,
        childWire,
        rpcService,
        { inline: true }
      )
      await workflowService.setStepChildRunId(stepState.stepId, childRunId)
      const childRun = await workflowService.getRun(childRunId)
      if (childRun?.status === 'failed') {
        throw new Error(childRun.error?.message || 'Sub-workflow failed')
      }
      if (childRun?.status === 'cancelled') {
        throw new Error('Sub-workflow was cancelled')
      }
      result = childRun?.output
    } else if (agentMeta) {
      const agentRun = await rpcService.agent.run(rpcName, input)
      result = agentRun.result
    } else {
      result = await invokeGraphNodeRpc(
        workflowService,
        rpcService,
        runId,
        stepState.stepId,
        nodeId,
        rpcName,
        input,
        graphName
      )
    }

    await workflowService.setStepResult(stepState.stepId, result)
  } catch (error) {
    if (
      error instanceof WorkflowAsyncException ||
      error instanceof WorkflowSuspendedException
    ) {
      throw error
    }
    if (error instanceof RPCNotFoundError) {
      await workflowService.setStepError(stepState.stepId, error as Error)
      await workflowService.updateRunStatus(runId, 'suspended', undefined, {
        message: `RPC '${rpcName}' not found. Deploy the missing function and resume.`,
        code: 'RPC_NOT_FOUND',
      })
      throw new WorkflowSuspendedException(runId, 'RPC_NOT_FOUND')
    }
    await workflowService.setStepError(stepState.stepId, error as Error)

    if (node?.onError) {
      const errorNodes = Array.isArray(node.onError)
        ? node.onError
        : [node.onError]
      await Promise.all(
        errorNodes.map((errorNodeId: string) =>
          executeGraphNodeInline(
            workflowService,
            rpcService,
            runId,
            graphName,
            errorNodeId,
            errorNodeId,
            { error: { message: (error as Error).message } },
            nodes,
            nodeId
          )
        )
      )
      return
    }
    throw error
  }
}

async function continueGraphInline(
  workflowService: PikkuWorkflowService,
  rpcService: any,
  runId: string,
  graphName: string,
  nodes: Record<string, any>,
  triggerInput: any,
  entryNodeIds: string[]
): Promise<void> {
  // Drive the run to completion in-process using the SAME planner as the queued
  // path (continueGraph): each loop plans the next wave of transitions, executes
  // them inline (vs queueGraphNode dispatch), then re-plans. Sharing the planner
  // gives the inline path joins, cycle revisits and fromStepName provenance
  // identical to the queue — instead of a second, weaker traversal.
  while (true) {
    const {
      failedNodeIds: rawFailed,
      branchKeys: branchByStep,
      completedNodeIds: rawCompleted,
    } = await workflowService.getCompletedGraphState(runId)
    // Validate step/branch names map to unambiguous nodes (planning keys
    // physically; these calls only surface ambiguous template configs).
    remapStepNamesToNodeIds(rawCompleted, nodes, graphName)
    remapBranchKeys(branchByStep, nodes, graphName)
    const failedNodeIds = remapStepNamesToNodeIds(rawFailed, nodes, graphName)

    if (failedNodeIds.length > 0) {
      const failedNode = failedNodeIds[0]!
      await workflowService.updateRunStatus(runId, 'failed', undefined, {
        message: `Graph node '${failedNode}' failed after exhausting retries`,
        stack: '',
        code: 'GRAPH_NODE_FAILED',
      })
      return
    }

    const run = await workflowService.getRun(runId)
    if (run?.status === 'suspended') {
      return
    }

    const instances = await workflowService.getStepInstances(runId)
    const plan = planGraphTransitions(
      nodes,
      instances,
      branchByStep,
      entryNodeIds,
      graphName
    )

    if (plan.toFire.length === 0) {
      if (!plan.hasInFlight && !plan.blockedWaiting) {
        await workflowService.updateRunStatus(runId, 'completed')
      }
      return
    }

    let executed = 0
    await Promise.all(
      plan.toFire.map(async (fire) => {
        const node = nodes[fire.logical]
        if (!node?.rpcName) return

        const referencedNodeIds = extractReferencedNodeIds(node.input).filter(
          (id) => !IGNORED_REFS.has(id)
        )
        const fetchedResults = await workflowService.getNodeResults(
          runId,
          referencedNodeIds
        )
        const nodeResults = { trigger: triggerInput, ...fetchedResults }
        const resolvedInput = resolveSerializedInput(node.input, nodeResults)

        executed++
        await executeGraphNodeInline(
          workflowService,
          rpcService,
          runId,
          graphName,
          fire.logical,
          fire.instanceKey,
          resolvedInput,
          nodes,
          fire.fromStepName
        )
      })
    )
    // Nothing executable fired (e.g. nodes without an rpcName) → can't progress.
    if (executed === 0) return
  }
}

export async function runWorkflowGraph(
  workflowService: PikkuWorkflowService,
  graphName: string,
  triggerInput: any,
  rpcService?: any,
  inline?: boolean,
  startNode?: string,
  wire?: WorkflowRunWire,
  overrideMeta?: WorkflowRuntimeMeta
): Promise<{ runId: string }> {
  const meta = overrideMeta ?? getWorkflowMeta(graphName)
  if (!meta?.nodes) {
    throw new Error(`Workflow graph '${graphName}' not found`)
  }

  const nodes = meta.nodes
  const entryNodes: string[] = startNode
    ? [startNode]
    : (meta.entryNodeIds ?? [])
  validateGraphReferences(graphName, nodes, entryNodes)

  if (entryNodes.length === 0) {
    throw new Error(
      `Workflow graph '${graphName}': no entry nodes found in meta or startNode`
    )
  }

  const readyEntryNodes = entryNodes.filter((nodeId) => {
    const node = nodes[nodeId]
    return node && areDependenciesSatisfied(node, new Set())
  })

  if (readyEntryNodes.length === 0) {
    throw new Error(
      `Workflow graph '${graphName}': no entry nodes have satisfied dependencies`
    )
  }

  if (!meta.graphHash) {
    throw new Error(`Workflow graph '${graphName}': missing graphHash in meta`)
  }

  const runId = await workflowService.createRun(
    graphName,
    triggerInput,
    inline ?? false,
    meta.graphHash,
    wire ?? { type: 'unknown' },
    {
      deterministic: meta.deterministic,
      plannedSteps: meta.plannedSteps,
    }
  )

  if (inline) {
    workflowService.registerInlineRun(runId)
  }

  const triggerNodeResults = { trigger: triggerInput }

  if (inline && rpcService) {
    const executeInline = async () => {
      try {
        await Promise.all(
          readyEntryNodes.map(async (nodeId) => {
            const node = nodes[nodeId]
            if (!node?.rpcName) return

            const resolvedInput =
              node.input && Object.keys(node.input).length > 0
                ? resolveSerializedInput(node.input, triggerNodeResults)
                : triggerInput

            await executeGraphNodeInline(
              workflowService,
              rpcService,
              runId,
              graphName,
              nodeId,
              nodeId,
              resolvedInput,
              nodes
            )
          })
        )

        await continueGraphInline(
          workflowService,
          rpcService,
          runId,
          graphName,
          nodes,
          triggerInput,
          entryNodes
        )
      } catch (error) {
        if (
          error instanceof WorkflowAsyncException ||
          error instanceof WorkflowSuspendedException
        ) {
          return
        }
        await workflowService.updateRunStatus(runId, 'failed', undefined, {
          message: (error as Error).message,
          stack: (error as Error).stack || '',
          code: 'GRAPH_NODE_FAILED',
        })
      } finally {
        workflowService.unregisterInlineRun(runId)
      }
    }
    await executeInline()
  } else {
    for (const nodeId of readyEntryNodes) {
      const node = nodes[nodeId]
      if (!node?.rpcName) continue

      const resolvedInput =
        node.input && Object.keys(node.input).length > 0
          ? resolveSerializedInput(node.input, triggerNodeResults)
          : triggerInput

      await queueGraphNode(
        workflowService,
        runId,
        graphName,
        nodeId,
        node.rpcName,
        resolvedInput,
        node
      )
    }
    if (inline) {
      workflowService.unregisterInlineRun(runId)
    }
  }

  return { runId }
}
