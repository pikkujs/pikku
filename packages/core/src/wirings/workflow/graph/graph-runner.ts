import type { PikkuWorkflowService } from '../pikku-workflow-service.js'
import type { GraphWireState, PikkuGraphWire } from './workflow-graph.types.js'
import { pikkuState } from '../../../pikku-state.js'
import type { WorkflowRuntimeMeta } from '../workflow.types.js'

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

function resolveSerializedInput(
  input: Record<string, unknown> | undefined,
  nodeResults: Record<string, any>
): Record<string, any> {
  if (!input || Object.keys(input).length === 0) return {}

  const resolved: Record<string, any> = {}
  for (const [key, value] of Object.entries(input)) {
    if (isDataRef(value)) {
      const source = nodeResults[value.$ref]
      resolved[key] = value.path ? getValueAtPath(source, value.path) : source
    } else if (isTemplate(value)) {
      resolved[key] = resolveTemplate(value, nodeResults)
    } else {
      resolved[key] = value
    }
  }
  return resolved
}

function extractReferencedNodeIds(
  input: Record<string, unknown> | undefined
): string[] {
  if (!input) return []
  const nodeIds: string[] = []
  for (const value of Object.values(input)) {
    if (isDataRef(value)) {
      nodeIds.push(value.$ref)
    } else if (isTemplate(value)) {
      for (const expr of value.$template.expressions) {
        nodeIds.push(expr.$ref)
      }
    }
  }
  return [...new Set(nodeIds)]
}

async function queueGraphNode(
  workflowService: PikkuWorkflowService,
  runId: string,
  _graphName: string,
  nodeId: string,
  rpcName: string,
  input: any
): Promise<void> {
  await workflowService.insertStepState(
    runId,
    `node:${nodeId}`,
    rpcName,
    input,
    { retries: 3 }
  )
  await workflowService.resumeWorkflow(runId)
}

export async function continueGraph(
  workflowService: PikkuWorkflowService,
  runId: string,
  graphName: string
): Promise<void> {
  const meta = getWorkflowMeta(graphName)
  if (!meta?.nodes) {
    throw new Error(`Workflow graph meta '${graphName}' not found`)
  }

  const nodes = meta.nodes

  const { completedNodeIds, branchKeys } =
    await workflowService.getCompletedGraphState(runId)

  const candidateNodes: string[] = []

  for (const nodeId of completedNodeIds) {
    const node = nodes[nodeId]
    if (!node?.next) continue

    const nextNodes = resolveNextFromConfig(node.next, branchKeys[nodeId])
    candidateNodes.push(...nextNodes)
  }

  if (candidateNodes.length === 0 && completedNodeIds.length > 0) {
    await workflowService.updateRunStatus(runId, 'completed')
    return
  }

  const nodesToQueue = await workflowService.getNodesWithoutSteps(
    runId,
    candidateNodes
  )

  for (const nodeId of nodesToQueue) {
    const node = nodes[nodeId]
    if (!node) continue

    const referencedNodeIds = extractReferencedNodeIds(node.input).filter(
      (id) => id !== 'trigger'
    )
    const nodeResults = await workflowService.getNodeResults(
      runId,
      referencedNodeIds
    )

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
  stepName: string,
  rpcName: string,
  data: any,
  graphName: string
): Promise<any> {
  const nodeId = stepName.replace(/^node:/, '')
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
        return
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
  const stepName = `node:${nodeId}`

  const stepState = await workflowService.insertStepState(
    runId,
    stepName,
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
  triggerInput: any
): Promise<void> {
  while (true) {
    const { completedNodeIds, branchKeys } =
      await workflowService.getCompletedGraphState(runId)

    const candidateNodes: string[] = []

    for (const nodeId of completedNodeIds) {
      const node = nodes[nodeId]
      if (!node?.next) continue

      const nextNodes = resolveNextFromConfig(node.next, branchKeys[nodeId])
      candidateNodes.push(...nextNodes)
    }

    if (candidateNodes.length === 0 && completedNodeIds.length > 0) {
      await workflowService.updateRunStatus(runId, 'completed')
      return
    }

    const nodesToExecute = await workflowService.getNodesWithoutSteps(
      runId,
      candidateNodes
    )

    if (nodesToExecute.length === 0) {
      if (completedNodeIds.length > 0) {
        await workflowService.updateRunStatus(runId, 'completed')
      }
      return
    }

    await Promise.all(
      nodesToExecute.map(async (nodeId) => {
        const node = nodes[nodeId]
        if (!node) return

        const referencedNodeIds = extractReferencedNodeIds(node.input).filter(
          (id) => id !== 'trigger'
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
  const entryNodes: string[] = startNode ? [startNode] : []

  if (entryNodes.length === 0) {
    throw new Error(`Workflow graph '${graphName}': no startNode was provided`)
  }

  const runId = await workflowService.createRun(graphName, triggerInput, inline)

  if (inline) {
    workflowService.registerInlineRun(runId)
  }

  const triggerNodeResults = { trigger: triggerInput }

  try {
    if (inline && rpcService) {
      await Promise.all(
        entryNodes.map(async (nodeId) => {
          const node = nodes[nodeId]
          if (!node) return

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
        triggerInput
      )
    } else {
      for (const nodeId of entryNodes) {
        const node = nodes[nodeId]
        if (!node) continue

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
    }

    return { runId }
  } finally {
    if (inline) {
      workflowService.unregisterInlineRun(runId)
    }
  }
}
