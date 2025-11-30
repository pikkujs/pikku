import type { PikkuWorkflowService } from '../pikku-workflow-service.js'
import type {
  GraphNodeConfig,
  RefValue,
  RefFn,
  NextConfig,
  GraphWireState,
  PikkuGraphWire,
  WorkflowGraphDefinition,
} from './workflow-graph.types.js'
import { createRef, isRef } from './workflow-graph.types.js'
import { pikkuState } from '../../../pikku-state.js'

/**
 * Add a workflow graph to the system
 * This is called by the generated workflow wirings
 */
export const addWorkflowGraph = (
  workflowName: string,
  graphResult: { graph: Record<string, GraphNodeConfig<string>>; wires?: any }
) => {
  // Get workflow metadata from inspector
  const meta = pikkuState(null, 'workflows', 'meta')
  const workflowMeta = meta[workflowName]
  if (!workflowMeta) {
    throw new Error(
      `Workflow metadata not found for '${workflowName}'. Make sure to run the CLI to generate metadata.`
    )
  }

  // Store workflow graph definition in state
  const registrations = pikkuState(null, 'workflows', 'graphRegistrations')
  registrations.set(workflowName, {
    name: workflowName,
    wires: graphResult.wires || {},
    graph: graphResult.graph,
  })
}

/**
 * Get a registered workflow graph by name
 */
export function getWorkflowGraph(
  name: string
): WorkflowGraphDefinition<any> | undefined {
  const registrations = pikkuState(null, 'workflows', 'graphRegistrations')
  return registrations.get(name)
}

/**
 * Resolve next config to array of node IDs
 * For branching (Record), uses the branch key from step
 */
function resolveNextFromConfig(
  next: NextConfig<string> | undefined,
  branchKey?: string
): string[] {
  if (!next) return []

  if (typeof next === 'string') return [next]
  if (Array.isArray(next)) return next

  // Record (branching) - use branch key set by graph.branch()
  if (!branchKey || !(branchKey in next)) return []

  const branchNext = next[branchKey]
  return Array.isArray(branchNext) ? branchNext : [branchNext]
}

/**
 * Template value - represents a string template with variable interpolation
 */
interface TemplateValue {
  $template: {
    parts: string[]
    expressions: Array<{ $ref: string; path?: string }>
  }
}

/**
 * Check if a value is a template
 */
function isTemplate(value: unknown): value is TemplateValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$template' in value &&
    typeof (value as any).$template === 'object'
  )
}

/**
 * Create a template function for use in input callbacks
 */
function createTemplate(templateStr: string, refs: RefValue[]): TemplateValue {
  const parts: string[] = []
  const expressions: Array<{ $ref: string; path?: string }> = []

  const regex = /\$(\d+)/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(templateStr)) !== null) {
    parts.push(templateStr.slice(lastIndex, match.index))
    const refIndex = parseInt(match[1]!, 10)
    const refValue = refs[refIndex]
    if (refValue) {
      expressions.push({ $ref: refValue.nodeId, path: refValue.path })
    } else {
      expressions.push({ $ref: 'unknown' })
    }
    lastIndex = regex.lastIndex
  }
  parts.push(templateStr.slice(lastIndex))

  return { $template: { parts, expressions } }
}

/**
 * Evaluate a node's input callback to get the input mapping
 */
function evaluateInputCallback(
  node: GraphNodeConfig
): Record<string, unknown | RefValue | TemplateValue> {
  if (!node.input) return {}

  const ref: RefFn<string> = (targetNodeId: string, path?: string) =>
    createRef(targetNodeId, path)

  const template = (templateStr: string, refs: RefValue[]) =>
    createTemplate(templateStr, refs)

  // Call with both ref and template - input callback may accept 1 or 2 params
  return (node.input as any)(ref, template)
}

/**
 * Extract node IDs referenced in an input mapping (including from templates)
 */
function extractReferencedNodeIds(
  inputMapping: Record<string, unknown | RefValue | TemplateValue>
): string[] {
  const nodeIds: string[] = []
  for (const value of Object.values(inputMapping)) {
    if (isRef(value)) {
      nodeIds.push(value.nodeId)
    } else if (isTemplate(value)) {
      for (const expr of value.$template.expressions) {
        nodeIds.push(expr.$ref)
      }
    }
  }
  return [...new Set(nodeIds)]
}

/**
 * Resolve a template value using node results
 */
function resolveTemplate(
  template: TemplateValue,
  nodeResults: Record<string, any>
): string {
  const { parts, expressions } = template.$template
  let result = ''
  for (let i = 0; i < parts.length; i++) {
    result += parts[i]
    if (i < expressions.length) {
      const expr = expressions[i]
      const nodeResult = nodeResults[expr.$ref]
      const value = expr.path
        ? getValueAtPath(nodeResult, expr.path)
        : nodeResult
      result += String(value ?? '')
    }
  }
  return result
}

/**
 * Resolve input mapping using node results
 */
function resolveInputMapping(
  inputMapping: Record<string, unknown | RefValue | TemplateValue>,
  nodeResults: Record<string, any>
): Record<string, any> {
  const resolved: Record<string, any> = {}

  for (const [key, value] of Object.entries(inputMapping)) {
    if (isRef(value)) {
      const nodeResult = nodeResults[value.nodeId]
      resolved[key] = value.path
        ? getValueAtPath(nodeResult, value.path)
        : nodeResult
    } else if (isTemplate(value)) {
      resolved[key] = resolveTemplate(value, nodeResults)
    } else {
      resolved[key] = value
    }
  }

  return resolved
}

/**
 * Get value at a dot-notation path from an object
 */
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

/**
 * Get the RPC name from a graph node's func
 * Supports both function references (func.name) and string RPC names
 */
function getRpcName(node: GraphNodeConfig): string {
  const func = node.func as any
  // If func is a string, use it directly as the RPC name
  if (typeof func === 'string') {
    return func
  }
  // Otherwise, it's a function reference - use its name
  return func?.name || 'unknown'
}

/**
 * Queue a graph node for execution
 */
async function queueGraphNode(
  workflowService: PikkuWorkflowService,
  runId: string,
  _graphName: string,
  nodeId: string,
  rpcName: string,
  input: any
): Promise<void> {
  // Step name convention: node:<nodeId>
  // Graph name is stored as the workflow name on the run
  await workflowService.insertStepState(
    runId,
    `node:${nodeId}`,
    rpcName,
    input,
    { retries: 3 }
  )
  await workflowService.resumeWorkflow(runId)
}

/**
 * Continue graph execution
 * Non-blocking - finds pending nodes, resolves inputs, queues them for execution
 */
export async function continueGraph(
  workflowService: PikkuWorkflowService,
  runId: string,
  graphName: string
): Promise<void> {
  const definition = getWorkflowGraph(graphName)
  if (!definition) {
    throw new Error(`Workflow graph '${graphName}' not found`)
  }

  const graph = definition.graph

  // Get completed node IDs + branch keys (lightweight, no results)
  const { completedNodeIds, branchKeys } =
    await workflowService.getCompletedGraphState(runId)

  // Find candidate next nodes from completed nodes
  const candidateNodes: string[] = []

  for (const nodeId of completedNodeIds) {
    const node = graph[nodeId]
    if (!node?.next) continue

    const nextNodes = resolveNextFromConfig(node.next, branchKeys[nodeId])
    candidateNodes.push(...nextNodes)
  }

  if (candidateNodes.length === 0 && completedNodeIds.length > 0) {
    // No more nodes to run - graph complete
    await workflowService.updateRunStatus(runId, 'completed')
    return
  }

  // Filter to only nodes that don't have a step yet
  const nodesToQueue = await workflowService.getNodesWithoutSteps(
    runId,
    candidateNodes
  )

  // Queue each node for execution
  for (const nodeId of nodesToQueue) {
    const node = graph[nodeId]
    if (!node) continue

    // Evaluate input callback to get the mapping
    const inputMapping = evaluateInputCallback(node)

    // Only fetch results for nodes referenced in this node's input
    const referencedNodeIds = extractReferencedNodeIds(inputMapping)
    const nodeResults = await workflowService.getNodeResults(
      runId,
      referencedNodeIds
    )

    const resolvedInput = resolveInputMapping(inputMapping, nodeResults)
    const rpcName = getRpcName(node)

    await queueGraphNode(
      workflowService,
      runId,
      graphName,
      nodeId,
      rpcName,
      resolvedInput
    )
  }
}

/**
 * Execute a graph step with wire context.
 * Called by the step worker when executing graph nodes.
 */
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
  }

  try {
    // Execute the RPC with graph wire context
    const result = await rpcService.rpcWithWire(rpcName, data, {
      graph: graphWire,
    })

    // If branch was called, store the branch key
    if (wireState.branchKey) {
      await workflowService.setBranchTaken(stepId, wireState.branchKey)
    }

    return result
  } catch (error) {
    // Check if this node has an onError handler
    const definition = getWorkflowGraph(graphName)
    if (definition) {
      const node = definition.graph[nodeId]
      if (node?.onError) {
        // Route to error handler nodes
        const errorNodes = Array.isArray(node.onError)
          ? node.onError
          : [node.onError]
        for (const errorNodeId of errorNodes) {
          const errorNode = definition.graph[errorNodeId]
          if (errorNode) {
            const errorRpcName = getRpcName(errorNode)
            // Queue error node with the error as input
            await queueGraphNode(
              workflowService,
              runId,
              graphName,
              errorNodeId,
              errorRpcName,
              { error: { message: (error as Error).message } }
            )
          }
        }
        // Don't rethrow - error was handled by routing to error nodes
        return
      }
    }
    // No error handler - rethrow
    throw error
  }
}

/**
 * Handle node completion - re-triggers graph continuation
 */
export async function onGraphNodeComplete(
  workflowService: PikkuWorkflowService,
  runId: string,
  graphName: string
): Promise<void> {
  await continueGraph(workflowService, runId, graphName)
}

/**
 * Execute a graph node inline (without queue)
 */
async function executeGraphNodeInline(
  workflowService: PikkuWorkflowService,
  rpcService: any,
  runId: string,
  graphName: string,
  nodeId: string,
  input: any,
  graph: Record<string, GraphNodeConfig>
): Promise<void> {
  const node = graph[nodeId]
  if (!node) return

  const rpcName = getRpcName(node)
  const stepName = `node:${nodeId}`

  // Insert step state
  const stepState = await workflowService.insertStepState(
    runId,
    stepName,
    rpcName,
    input,
    { retries: 3 }
  )

  await workflowService.setStepRunning(stepState.stepId)

  // Execute with graph wire context
  const wireState: GraphWireState = {}
  const graphWire: PikkuGraphWire = {
    runId,
    graphName,
    nodeId,
    branch: (key: string) => {
      wireState.branchKey = key
    },
  }

  try {
    const result = await rpcService.rpcWithWire(rpcName, input, {
      graph: graphWire,
    })

    // If branch was called, store the branch key
    if (wireState.branchKey) {
      await workflowService.setBranchTaken(
        stepState.stepId,
        wireState.branchKey
      )
    }

    await workflowService.setStepResult(stepState.stepId, result)
  } catch (error) {
    await workflowService.setStepError(stepState.stepId, error as Error)

    // Check if this node has an onError handler
    const definition = getWorkflowGraph(graphName)
    if (definition) {
      const node = definition.graph[nodeId]
      if (node?.onError) {
        // Route to error handler nodes (inline)
        const errorNodes = Array.isArray(node.onError)
          ? node.onError
          : [node.onError]
        await Promise.all(
          errorNodes.map((errorNodeId) =>
            executeGraphNodeInline(
              workflowService,
              rpcService,
              runId,
              graphName,
              errorNodeId,
              { error: { message: (error as Error).message } },
              graph
            )
          )
        )
        return
      }
    }
    // No error handler - rethrow
    throw error
  }
}

/**
 * Continue graph execution inline (without queue)
 * Executes nodes in parallel where possible using Promise.all
 */
async function continueGraphInline(
  workflowService: PikkuWorkflowService,
  rpcService: any,
  runId: string,
  graphName: string,
  graph: Record<string, GraphNodeConfig>,
  triggerInput: any
): Promise<void> {
  while (true) {
    // Get completed node IDs + branch keys (lightweight, no results)
    const { completedNodeIds, branchKeys } =
      await workflowService.getCompletedGraphState(runId)

    // Find candidate next nodes from completed nodes
    const candidateNodes: string[] = []

    for (const nodeId of completedNodeIds) {
      const node = graph[nodeId]
      if (!node?.next) continue

      const nextNodes = resolveNextFromConfig(node.next, branchKeys[nodeId])
      candidateNodes.push(...nextNodes)
    }

    if (candidateNodes.length === 0 && completedNodeIds.length > 0) {
      // No more nodes to run - graph complete
      await workflowService.updateRunStatus(runId, 'completed')
      return
    }

    // Filter to only nodes that don't have a step yet
    const nodesToExecute = await workflowService.getNodesWithoutSteps(
      runId,
      candidateNodes
    )

    if (nodesToExecute.length === 0) {
      // No more nodes to execute - if we've completed at least one node, we're done
      // This handles branching where only some paths are taken
      if (completedNodeIds.length > 0) {
        await workflowService.updateRunStatus(runId, 'completed')
      }
      return
    }

    // Execute all nodes in parallel
    await Promise.all(
      nodesToExecute.map(async (nodeId) => {
        const node = graph[nodeId]
        if (!node) return

        // Evaluate input callback to get the mapping
        const inputMapping = evaluateInputCallback(node)

        // Only fetch results for nodes referenced in this node's input (excluding trigger)
        const referencedNodeIds = extractReferencedNodeIds(inputMapping).filter(
          (id) => id !== 'trigger'
        )
        const fetchedResults = await workflowService.getNodeResults(
          runId,
          referencedNodeIds
        )

        // Merge fetched results with trigger input
        const nodeResults = { trigger: triggerInput, ...fetchedResults }

        const resolvedInput = resolveInputMapping(inputMapping, nodeResults)

        await executeGraphNodeInline(
          workflowService,
          rpcService,
          runId,
          graphName,
          nodeId,
          resolvedInput,
          graph
        )
      })
    )
  }
}

/**
 * Start a workflow graph execution
 * @param startNode - Optional starting node ID (from wire config). If not provided, uses wires.api from graph definition.
 */
export async function runWorkflowGraph(
  workflowService: PikkuWorkflowService,
  graphName: string,
  triggerInput: any,
  rpcService?: any,
  inline?: boolean,
  startNode?: string
): Promise<{ runId: string }> {
  const definition = getWorkflowGraph(graphName)
  if (!definition) {
    throw new Error(`Workflow graph '${graphName}' not found`)
  }

  // Use startNode from caller if provided, otherwise use wires.api from graph definition
  const apiStartNode = startNode ?? definition.wires?.api
  const entryNodes: string[] = apiStartNode ? [apiStartNode] : []

  if (entryNodes.length === 0) {
    throw new Error(
      `Workflow graph '${graphName}' has no wires.api defined and no startNode was provided`
    )
  }

  const graph = definition.graph
  const runId = await workflowService.createRun(graphName, triggerInput, inline)

  // Register as inline for fast lookup
  if (inline) {
    workflowService.registerInlineRun(runId)
  }

  // Create nodeResults with trigger for resolving entry node inputs
  const triggerNodeResults = { trigger: triggerInput }

  try {
    if (inline && rpcService) {
      // Inline mode - execute entry nodes in parallel
      await Promise.all(
        entryNodes.map(async (nodeId) => {
          const node = graph[nodeId]
          if (!node) return

          // Evaluate and resolve entry node input
          const inputMapping = evaluateInputCallback(node)
          const resolvedInput =
            Object.keys(inputMapping).length > 0
              ? resolveInputMapping(inputMapping, triggerNodeResults)
              : triggerInput

          await executeGraphNodeInline(
            workflowService,
            rpcService,
            runId,
            graphName,
            nodeId,
            resolvedInput,
            graph
          )
        })
      )

      // Continue executing remaining nodes inline
      await continueGraphInline(
        workflowService,
        rpcService,
        runId,
        graphName,
        graph,
        triggerInput
      )
    } else {
      // Queue-based mode
      for (const nodeId of entryNodes) {
        const node = graph[nodeId]
        if (!node) continue

        // Evaluate and resolve entry node input
        const inputMapping = evaluateInputCallback(node)
        const resolvedInput =
          Object.keys(inputMapping).length > 0
            ? resolveInputMapping(inputMapping, triggerNodeResults)
            : triggerInput

        const rpcName = getRpcName(node)
        await queueGraphNode(
          workflowService,
          runId,
          graphName,
          nodeId,
          rpcName,
          resolvedInput
        )
      }
    }

    return { runId }
  } finally {
    // Clean up inline tracking
    if (inline) {
      workflowService.unregisterInlineRun(runId)
    }
  }
}
