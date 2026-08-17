import type { PikkuWorkflowService } from '../pikku-workflow-service.js'
import {
  WorkflowAsyncException,
  WorkflowSuspendedException,
} from '../workflow-errors.js'
import { DEFAULT_STEP_RETRIES } from '../workflow-constants.js'
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

const FANOUT_INSTANCE = /^(.+)\[(\d+)\]$/

function fanoutInstanceKey(base: string, index: number): string {
  return `${base}[${index}]`
}

function splitFanoutInstance(
  name: string
): { base: string; index: number } | null {
  const match = FANOUT_INSTANCE.exec(name)
  if (!match) return null
  return { base: match[1]!, index: Number(match[2]!) }
}

export function stripInstanceOrdinal(name: string): string {
  const fanout = splitFanoutInstance(name)
  const withoutItem = fanout ? fanout.base : name
  const hash = withoutItem.lastIndexOf('#')
  if (hash <= 0) return withoutItem
  return /^\d+$/.test(withoutItem.slice(hash + 1))
    ? withoutItem.slice(0, hash)
    : withoutItem
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

interface GraphFireInstruction {
  logical: string
  instanceKey: string
  fromStepName?: string
  itemIndex?: number
}

function planGraphTransitions(
  nodes: Record<string, any>,
  instances: Array<{ stepName: string; status: string; fromStepName?: string }>,
  branchByStep: Record<string, string>,
  entryNodeIds: string[],
  graphName: string,
  fanoutWidths: Record<string, number> = {}
): {
  toFire: GraphFireInstruction[]
  hasInFlight: boolean
  blockedWaiting: boolean
} {
  const toLogical = (name: string) =>
    remapStepNamesToNodeIds([name], nodes, graphName)[0]!

  const countByLogical: Record<string, number> = {}
  const instancesByLogical: Record<
    string,
    Array<{ stepName: string; status: string }>
  > = {}
  const consumed = new Set<string>()
  for (const inst of instances) {
    const logical = toLogical(inst.stepName)
    countByLogical[logical] = (countByLogical[logical] ?? 0) + 1
    ;(instancesByLogical[logical] ??= []).push(inst)
    consumed.add(`${inst.fromStepName ?? ENTRY_FROM}->${logical}`)
  }

  const isFanned = (nodeId: string) => Boolean(nodes[nodeId]?.forEach)
  const fanoutComplete = (nodeId: string) => {
    const width = fanoutWidths[nodeId]
    if (width === undefined) return false
    const succeeded = (instancesByLogical[nodeId] ?? []).filter(
      (i) => i.status === 'succeeded'
    ).length
    return succeeded >= width
  }

  const completed = instances.filter((i) => i.status === 'succeeded')
  const completedLogical = new Set<string>()
  for (const inst of completed) {
    const logical = toLogical(inst.stepName)
    if (!isFanned(logical)) completedLogical.add(logical)
  }
  for (const nodeId of Object.keys(fanoutWidths)) {
    if (isFanned(nodeId) && fanoutComplete(nodeId)) completedLogical.add(nodeId)
  }

  const edges: Array<{
    from?: string
    fromKey: string
    fromLogical?: string
    target: string
  }> = []
  for (const entryId of entryNodeIds) {
    edges.push({ fromKey: ENTRY_FROM, target: entryId })
  }
  const fannedEdgesEmitted = new Set<string>()
  for (const inst of completed) {
    const fromLogical = toLogical(inst.stepName)
    const node = nodes[fromLogical]
    if (!node?.next) continue
    let from = inst.stepName
    let branchKey = branchByStep[inst.stepName]
    if (isFanned(fromLogical)) {
      if (!completedLogical.has(fromLogical)) continue
      if (fannedEdgesEmitted.has(fromLogical)) continue
      fannedEdgesEmitted.add(fromLogical)
      from = fromLogical
      branchKey = branchByStep[fromLogical] ?? branchByStep[inst.stepName]
    }
    for (const target of resolveNextFromConfig(node.next, branchKey)) {
      edges.push({ from, fromKey: from, fromLogical, target })
    }
  }
  // A zero-width fanout produces no instances at all, so its outgoing edges
  // have no completed instance to hang off — emit them from the logical node.
  for (const [nodeId, width] of Object.entries(fanoutWidths)) {
    if (width !== 0 || fannedEdgesEmitted.has(nodeId)) continue
    const node = nodes[nodeId]
    if (!node?.next) continue
    fannedEdgesEmitted.add(nodeId)
    for (const target of resolveNextFromConfig(
      node.next,
      branchByStep[nodeId]
    )) {
      edges.push({ from: nodeId, fromKey: nodeId, fromLogical: nodeId, target })
    }
  }

  const toFire: GraphFireInstruction[] = []
  const plannedFanout = new Set<string>()
  let blockedWaiting = false
  for (const edge of edges) {
    const target = edge.target
    const edgeKey = `${edge.fromKey}->${target}`

    if (isFanned(target)) {
      if (plannedFanout.has(target)) continue
      plannedFanout.add(target)
      if (!areDependenciesSatisfied(nodes[target] ?? {}, completedLogical)) {
        blockedWaiting = true
        continue
      }
      const width = fanoutWidths[target]
      if (width === undefined) {
        blockedWaiting = true
        continue
      }
      const existing = instancesByLogical[target] ?? []
      const existingIndexes = new Set(
        existing
          .map((i) => splitFanoutInstance(i.stepName)?.index)
          .filter((index): index is number => index !== undefined)
      )
      const pending: number[] = []
      for (let index = 0; index < width; index++) {
        if (!existingIndexes.has(index)) pending.push(index)
      }
      if (pending.length === 0) continue
      const sequential = nodes[target]?.mode === 'sequential'
      const anyInFlight = existing.some((i) => i.status !== 'succeeded')
      const emit = sequential
        ? anyInFlight
          ? []
          : pending.slice(0, 1)
        : pending
      for (const index of emit) {
        toFire.push({
          logical: target,
          instanceKey: fanoutInstanceKey(target, index),
          fromStepName: edge.from,
          itemIndex: index,
        })
      }
      if (emit.length === 0) blockedWaiting = true
      continue
    }

    if (consumed.has(edgeKey)) continue
    const visits = countByLogical[target] ?? 0
    const isBackEdge =
      edge.fromLogical !== undefined &&
      closesCycle(edge.fromLogical, target, nodes)
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
    typeof (value as { $ref?: unknown }).$ref === 'string'
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
    typeof (value as { $template?: unknown }).$template === 'object'
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
    if (value.$ref === '$item' && !('$item' in nodeResults)) {
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

const FOREACH_MODES = new Set(['parallel', 'sequential'])

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

    if (node.forEach !== undefined) {
      const source = forEachSource(node)
      if (!source) {
        throw new Error(
          `Workflow graph '${graphName}': node '${nodeId}' forEach must reference a node`
        )
      }
      if (!IGNORED_REFS.has(source.$ref) && !nodeIds.has(source.$ref)) {
        throw new Error(
          `Workflow graph '${graphName}': node '${nodeId}' references unknown node '${source.$ref}' in forEach`
        )
      }
      if (node.mode !== undefined && !FOREACH_MODES.has(node.mode)) {
        throw new Error(
          `Workflow graph '${graphName}': node '${nodeId}' has an unknown forEach mode '${node.mode}'`
        )
      }
    } else if (node.mode !== undefined) {
      throw new Error(
        `Workflow graph '${graphName}': node '${nodeId}' sets mode '${node.mode}' without a forEach`
      )
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

function forEachSource(node: {
  forEach?: unknown
}): { $ref: string; path?: string } | undefined {
  return isDataRef(node.forEach) ? node.forEach : undefined
}

function nodeDependencies(node: {
  input?: Record<string, unknown>
  forEach?: unknown
}): string[] {
  const deps = extractReferencedNodeIds(node.input)
  const source = forEachSource(node)
  if (source) deps.push(source.$ref)
  return [...new Set(deps)].filter((id) => !IGNORED_REFS.has(id))
}

function describeValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  return typeof value
}

function resolveForEachItems(
  graphName: string,
  nodeId: string,
  node: { forEach?: unknown },
  nodeResults: Record<string, any>
): unknown[] {
  const source = forEachSource(node)
  if (!source) {
    throw new Error(
      `Workflow graph '${graphName}': node '${nodeId}' has an unusable forEach configuration`
    )
  }
  const raw = nodeResults[source.$ref]
  const value = source.path ? getValueAtPath(raw, source.path) : raw
  if (!Array.isArray(value)) {
    const label = source.path ? `${source.$ref}.${source.path}` : source.$ref
    throw new Error(
      `Workflow graph '${graphName}': node '${nodeId}' forEach source '${label}' resolved to ${describeValue(
        value
      )}, expected an array`
    )
  }
  return value
}

function areDependenciesSatisfied(
  node: { input?: Record<string, unknown>; forEach?: unknown },
  completedNodeIds: Set<string>
): boolean {
  return nodeDependencies(node).every((dep) => completedNodeIds.has(dep))
}

interface GraphResultReader {
  /** Per-item source arrays, keyed by fanned node id, for every ready fanout. */
  fanoutItems: Record<string, unknown[]>
  fanoutWidths: Record<string, number>
  /** Reads node results, aggregating a fanned node into its ordered item array. */
  read: (nodeIds: string[]) => Promise<Record<string, any>>
}

async function createGraphResultReader(
  workflowService: PikkuWorkflowService,
  runId: string,
  graphName: string,
  nodes: Record<string, any>,
  triggerInput: any,
  instances: Array<{ stepName: string; status: string }>
): Promise<GraphResultReader> {
  const succeeded = new Set(
    instances.filter((i) => i.status === 'succeeded').map((i) => i.stepName)
  )
  const fanoutItems: Record<string, unknown[]> = {}
  const fanoutWidths: Record<string, number> = {}
  const resultCache = new Map<string, any>()
  const resolving = new Set<string>()

  const readResult = async (nodeId: string): Promise<any> => {
    if (nodeId === 'trigger') return triggerInput
    if (resultCache.has(nodeId)) return resultCache.get(nodeId)
    if (resolving.has(nodeId)) return undefined
    resolving.add(nodeId)
    try {
      let value: any
      if (nodes[nodeId]?.forEach) {
        const items = await readFanoutItems(nodeId)
        if (items === undefined) return undefined
        const keys = items.map((_, index) => fanoutInstanceKey(nodeId, index))
        if (keys.some((key) => !succeeded.has(key))) return undefined
        const fetched = keys.length
          ? await workflowService.getNodeResults(runId, keys)
          : {}
        value = keys.map((key) => fetched[key])
      } else {
        if (!succeeded.has(nodeId)) return undefined
        const fetched = await workflowService.getNodeResults(runId, [nodeId])
        value = fetched[nodeId]
      }
      resultCache.set(nodeId, value)
      return value
    } finally {
      resolving.delete(nodeId)
    }
  }

  const readFanoutItems = async (
    nodeId: string
  ): Promise<unknown[] | undefined> => {
    if (fanoutItems[nodeId]) return fanoutItems[nodeId]
    const node = nodes[nodeId]
    const source = forEachSource(node)
    if (!source) return undefined
    const sourceValue = await readResult(source.$ref)
    if (sourceValue === undefined) return undefined
    const items = resolveForEachItems(graphName, nodeId, node, {
      [source.$ref]: sourceValue,
    })
    fanoutItems[nodeId] = items
    fanoutWidths[nodeId] = items.length
    return items
  }

  for (const nodeId of Object.keys(nodes)) {
    if (nodes[nodeId]?.forEach) await readFanoutItems(nodeId)
  }

  return {
    fanoutItems,
    fanoutWidths,
    read: async (nodeIds: string[]) => {
      const results: Record<string, any> = {}
      for (const nodeId of nodeIds) {
        const value = await readResult(nodeId)
        if (value !== undefined) results[nodeId] = value
      }
      return results
    },
  }
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
  const triggerInput = currentRun?.input
  const reader = await createGraphResultReader(
    workflowService,
    runId,
    graphName,
    nodes,
    triggerInput,
    instances
  )
  const plan = planGraphTransitions(
    nodes,
    instances,
    branchByStep,
    meta.entryNodeIds ?? [],
    graphName,
    reader.fanoutWidths
  )

  if (plan.toFire.length === 0) {
    if (!plan.hasInFlight && !plan.blockedWaiting) {
      await workflowService.updateRunStatus(runId, 'completed')
    }
    return
  }

  for (const fire of plan.toFire) {
    const node = nodes[fire.logical]
    if (!node?.rpcName) continue

    const referencedNodeIds = extractReferencedNodeIds(node.input).filter(
      (id) => !IGNORED_REFS.has(id)
    )
    const fetchedResults = await reader.read(referencedNodeIds)
    const nodeResults: Record<string, any> = {
      trigger: triggerInput,
      ...fetchedResults,
    }
    if (fire.itemIndex !== undefined) {
      nodeResults['$item'] = reader.fanoutItems[fire.logical]?.[fire.itemIndex]
    }
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
  while (true) {
    const {
      failedNodeIds: rawFailed,
      branchKeys: branchByStep,
      completedNodeIds: rawCompleted,
    } = await workflowService.getCompletedGraphState(runId)
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
    const reader = await createGraphResultReader(
      workflowService,
      runId,
      graphName,
      nodes,
      triggerInput,
      instances
    )
    const plan = planGraphTransitions(
      nodes,
      instances,
      branchByStep,
      entryNodeIds,
      graphName,
      reader.fanoutWidths
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
        const fetchedResults = await reader.read(referencedNodeIds)
        const nodeResults: Record<string, any> = {
          trigger: triggerInput,
          ...fetchedResults,
        }
        if (fire.itemIndex !== undefined) {
          nodeResults['$item'] =
            reader.fanoutItems[fire.logical]?.[fire.itemIndex]
        }
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
    if (executed === 0) return
  }
}

function planEntryFirings(
  graphName: string,
  nodeId: string,
  node: Record<string, any>,
  triggerNodeResults: Record<string, any>,
  triggerInput: any
): Array<{ instanceKey: string; input: any }> {
  if (!node.forEach) {
    const input =
      node.input && Object.keys(node.input).length > 0
        ? resolveSerializedInput(node.input, triggerNodeResults)
        : triggerInput
    return [{ instanceKey: nodeId, input }]
  }

  const items = resolveForEachItems(graphName, nodeId, node, triggerNodeResults)
  const width = node.mode === 'sequential' ? Math.min(items.length, 1) : items.length
  const firings: Array<{ instanceKey: string; input: any }> = []
  for (let index = 0; index < width; index++) {
    firings.push({
      instanceKey: fanoutInstanceKey(nodeId, index),
      input: resolveSerializedInput(node.input, {
        ...triggerNodeResults,
        $item: items[index],
      }),
    })
  }
  return firings
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
  const declaredEntryNodes = meta.entryNodeIds ?? []
  // knowledge: decisions/security/a-graph-run-starts-at-an-entry-node-the-graph-declared.md
  if (startNode && !declaredEntryNodes.includes(startNode)) {
    throw new Error(
      `Workflow graph '${graphName}': '${startNode}' is not an entry node`
    )
  }
  const entryNodes: string[] = startNode ? [startNode] : declaredEntryNodes
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

            const firings = planEntryFirings(
              graphName,
              nodeId,
              node,
              triggerNodeResults,
              triggerInput
            )

            await Promise.all(
              firings.map((firing) =>
                executeGraphNodeInline(
                  workflowService,
                  rpcService,
                  runId,
                  graphName,
                  nodeId,
                  firing.instanceKey,
                  firing.input,
                  nodes
                )
              )
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

      const firings = planEntryFirings(
        graphName,
        nodeId,
        node,
        triggerNodeResults,
        triggerInput
      )

      for (const firing of firings) {
        await queueGraphNode(
          workflowService,
          runId,
          graphName,
          firing.instanceKey,
          node.rpcName,
          firing.input,
          node
        )
      }
    }
    if (inline) {
      workflowService.unregisterInlineRun(runId)
    }
  }

  return { runId }
}
