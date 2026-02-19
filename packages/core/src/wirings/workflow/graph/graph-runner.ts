import type { PikkuWorkflowService } from '../pikku-workflow-service.js'
import type { GraphWireState, PikkuGraphWire } from './workflow-graph.types.js'
import { pikkuState } from '../../../pikku-state.js'
import type { WorkflowRuntimeMeta } from '../workflow.types.js'
import { RPCNotFoundError } from '../../rpc/rpc-runner.js'

function buildTemplateRegex(nodeId: string): RegExp | null {
  if (!nodeId.includes('${')) return null
  const escaped = nodeId
    .split(/\$\{[^}]+\}/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.+')
  return new RegExp(`^${escaped}$`)
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
  if (templatePatterns.size === 0) return stepNames
  return stepNames.map((name) => {
    if (nodes[name]) return name
    const matches: string[] = []
    for (const [nodeId, regex] of templatePatterns) {
      if (regex.test(name)) matches.push(nodeId)
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
  const meta = pikkuState(null, 'workflows', 'meta')
  return meta[name]
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
  input: any
): Promise<void> {
  await workflowService.insertStepState(runId, nodeId, rpcName, input, {
    retries: 0,
  })
  await workflowService.queueStepWorker(runId, nodeId, rpcName, input)
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
    branchKeys: rawBranch,
  } = await workflowService.getCompletedGraphState(runId)
  const completedNodeIds = remapStepNamesToNodeIds(
    rawCompleted,
    nodes,
    graphName
  )
  const completedNodeIdSet = new Set(completedNodeIds)
  const failedNodeIds = remapStepNamesToNodeIds(rawFailed, nodes, graphName)
  const branchKeys = remapBranchKeys(rawBranch, nodes, graphName)

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

  const candidateNodes = new Set<string>()

  for (const nodeId of completedNodeIds) {
    const node = nodes[nodeId]
    if (!node?.next) continue

    const nextNodes = resolveNextFromConfig(node.next, branchKeys[nodeId])
    for (const nextNode of nextNodes) {
      candidateNodes.add(nextNode)
    }
  }

  for (const entryId of meta.entryNodeIds ?? []) {
    candidateNodes.add(entryId)
  }

  if (candidateNodes.size === 0 && completedNodeIds.length > 0) {
    await workflowService.updateRunStatus(runId, 'completed')
    return
  }

  const unstartedNodes = await workflowService.getNodesWithoutSteps(runId, [
    ...candidateNodes,
  ])

  const nodesToQueue = unstartedNodes.filter((nodeId) => {
    const node = nodes[nodeId]
    return node && areDependenciesSatisfied(node, completedNodeIdSet)
  })

  if (nodesToQueue.length === 0) {
    const allRpcNodes = Object.entries(nodes)
      .filter(([_, n]) => n.rpcName)
      .map(([id]) => id)
    const allRpcCompleted = allRpcNodes.every((id) =>
      completedNodeIdSet.has(id)
    )
    if (allRpcCompleted) {
      await workflowService.updateRunStatus(runId, 'completed')
    }
    return
  }

  const run = await workflowService.getRun(runId)
  const triggerInput = run?.input

  for (const nodeId of nodesToQueue) {
    const node = nodes[nodeId]
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
      nodeId,
      node.rpcName,
      resolvedInput
    )
  }
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

  try {
    const result = await rpcService.rpcWithWire(rpcName, data, {
      graph: graphWire,
    })

    if (wireState.branchKey) {
      await workflowService.setBranchTaken(stepId, wireState.branchKey)
    }

    return result
  } catch (error) {
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
              { error: { message: (error as Error).message } }
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
  input: any,
  nodes: Record<string, any>
): Promise<void> {
  const node = nodes[nodeId]
  if (!node) return

  const rpcName = node.rpcName

  const stepState = await workflowService.insertStepState(
    runId,
    nodeId,
    rpcName,
    input,
    { retries: 3 }
  )

  await workflowService.setStepRunning(stepState.stepId)

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

  try {
    const result = await rpcService.rpcWithWire(rpcName, input, {
      graph: graphWire,
    })

    if (wireState.branchKey) {
      await workflowService.setBranchTaken(
        stepState.stepId,
        wireState.branchKey
      )
    }

    await workflowService.setStepResult(stepState.stepId, result)
  } catch (error) {
    if (error instanceof RPCNotFoundError) {
      await workflowService.setStepError(stepState.stepId, error as Error)
      await workflowService.updateRunStatus(runId, 'suspended', undefined, {
        message: `RPC '${rpcName}' not found. Deploy the missing function and resume.`,
        code: 'RPC_NOT_FOUND',
      })
      return
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
            { error: { message: (error as Error).message } },
            nodes
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
      completedNodeIds: rawCompleted,
      failedNodeIds: rawFailed,
      branchKeys: rawBranch,
    } = await workflowService.getCompletedGraphState(runId)
    const completedNodeIds = remapStepNamesToNodeIds(
      rawCompleted,
      nodes,
      graphName
    )
    const completedNodeIdSet = new Set(completedNodeIds)
    const failedNodeIds = remapStepNamesToNodeIds(rawFailed, nodes, graphName)
    const branchKeys = remapBranchKeys(rawBranch, nodes, graphName)

    if (failedNodeIds.length > 0) {
      const failedNode = failedNodeIds[0]!
      await workflowService.updateRunStatus(runId, 'failed', undefined, {
        message: `Graph node '${failedNode}' failed after exhausting retries`,
        stack: '',
        code: 'GRAPH_NODE_FAILED',
      })
      return
    }

    const candidateNodes = new Set<string>()

    for (const nodeId of completedNodeIds) {
      const node = nodes[nodeId]
      if (!node?.next) continue

      const nextNodes = resolveNextFromConfig(node.next, branchKeys[nodeId])
      for (const nextNode of nextNodes) {
        candidateNodes.add(nextNode)
      }
    }

    for (const entryId of entryNodeIds) {
      candidateNodes.add(entryId)
    }

    if (candidateNodes.size === 0 && completedNodeIds.length > 0) {
      await workflowService.updateRunStatus(runId, 'completed')
      return
    }

    const unstartedNodes = await workflowService.getNodesWithoutSteps(runId, [
      ...candidateNodes,
    ])

    const nodesToExecute = unstartedNodes.filter((nodeId) => {
      const node = nodes[nodeId]
      return node && areDependenciesSatisfied(node, completedNodeIdSet)
    })

    if (nodesToExecute.length === 0) {
      if (completedNodeIds.length > 0 && unstartedNodes.length === 0) {
        await workflowService.updateRunStatus(runId, 'completed')
      }
      return
    }

    await Promise.all(
      nodesToExecute.map(async (nodeId) => {
        const node = nodes[nodeId]
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

        await executeGraphNodeInline(
          workflowService,
          rpcService,
          runId,
          graphName,
          nodeId,
          resolvedInput,
          nodes
        )
      })
    )
  }
}

export async function runWorkflowGraph(
  workflowService: PikkuWorkflowService,
  graphName: string,
  triggerInput: any,
  rpcService?: any,
  inline?: boolean,
  startNode?: string
): Promise<{ runId: string }> {
  const meta = getWorkflowMeta(graphName)
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
    meta.graphHash
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
        await workflowService.updateRunStatus(runId, 'failed', undefined, {
          message: (error as Error).message,
          stack: (error as Error).stack || '',
          code: 'GRAPH_NODE_FAILED',
        })
      } finally {
        workflowService.unregisterInlineRun(runId)
      }
    }
    executeInline().catch(() => {})
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
        resolvedInput
      )
    }
    if (inline) {
      workflowService.unregisterInlineRun(runId)
    }
  }

  return { runId }
}
