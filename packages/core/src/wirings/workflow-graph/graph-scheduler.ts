import type { PikkuWorkflowService } from '../workflow/pikku-workflow-service.js'
import type {
  GraphNodeConfig,
  RefValue,
  RefFn,
  NextConfig,
  GraphWireState,
} from './workflow-graph.types.js'
import { createRef, isRef } from './workflow-graph.types.js'
import { getWorkflowGraph } from './wire-workflow-graph.js'
import { createGraphWire } from './graph-runner.js'

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
 * Check if a node can be reached from any other node's next config
 * Used to identify entry nodes (nodes with no incoming edges)
 */
function hasIncomingEdges(
  graph: Record<string, GraphNodeConfig>,
  nodeId: string
): boolean {
  for (const node of Object.values(graph)) {
    const next = node.next
    if (!next) continue

    if (typeof next === 'string') {
      if (next === nodeId) return true
    } else if (Array.isArray(next)) {
      if (next.includes(nodeId)) return true
    } else {
      // Record - check all branches
      for (const branchNext of Object.values(next)) {
        if (typeof branchNext === 'string') {
          if (branchNext === nodeId) return true
        } else if (branchNext.includes(nodeId)) {
          return true
        }
      }
    }
  }
  return false
}

/**
 * Find entry nodes (nodes with no incoming edges)
 */
function findEntryNodes(graph: Record<string, GraphNodeConfig>): string[] {
  return Object.keys(graph).filter((nodeId) => !hasIncomingEdges(graph, nodeId))
}

/**
 * Evaluate a node's input callback to get the input mapping
 */
function evaluateInputCallback(
  node: GraphNodeConfig
): Record<string, unknown | RefValue> {
  if (!node.input) return {}

  const ref: RefFn<string> = (targetNodeId: string, path?: string) =>
    createRef(targetNodeId, path)

  return node.input(ref)
}

/**
 * Extract node IDs referenced in an input mapping
 */
function extractReferencedNodeIds(
  inputMapping: Record<string, unknown | RefValue>
): string[] {
  const nodeIds: string[] = []
  for (const value of Object.values(inputMapping)) {
    if (isRef(value)) {
      nodeIds.push(value.nodeId)
    }
  }
  return [...new Set(nodeIds)]
}

/**
 * Resolve input mapping using node results
 */
function resolveInputMapping(
  inputMapping: Record<string, unknown | RefValue>,
  nodeResults: Record<string, any>
): Record<string, any> {
  const resolved: Record<string, any> = {}

  for (const [key, value] of Object.entries(inputMapping)) {
    if (isRef(value)) {
      const nodeResult = nodeResults[value.nodeId]
      resolved[key] = value.path
        ? getValueAtPath(nodeResult, value.path)
        : nodeResult
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
 */
function getRpcName(node: GraphNodeConfig): string {
  return (node.func as any).name || 'unknown'
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
 * Check if a step name is a graph node step
 */
export function isGraphNodeStep(stepName: string): boolean {
  return stepName.startsWith('node:')
}

/**
 * Extract node ID from a graph step name
 */
export function extractNodeId(stepName: string): string {
  return stepName.replace(/^node:/, '')
}

/**
 * Execute a graph step with wire context.
 * Called by the step worker when executing graph nodes.
 *
 * @param workflowService - The workflow service
 * @param rpcService - The RPC service for function execution
 * @param runId - Workflow run ID
 * @param stepId - Step ID
 * @param stepName - Step name (format: node:<nodeId>)
 * @param rpcName - RPC function name
 * @param data - Input data
 * @param graphName - Graph name (workflow name from run)
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
  // Extract nodeId from step name convention: node:<nodeId>
  const nodeId = extractNodeId(stepName)

  // Create mutable state to capture branch selection
  const wireState: GraphWireState = {}

  // Create the graph wire context
  const graphWire = createGraphWire(runId, graphName, nodeId, wireState)

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
 * Start a workflow graph execution
 */
export async function startWorkflowGraph(
  workflowService: PikkuWorkflowService,
  graphName: string,
  triggerInput: any
): Promise<{ runId: string }> {
  const definition = getWorkflowGraph(graphName)
  if (!definition) {
    throw new Error(`Workflow graph '${graphName}' not found`)
  }

  const graph = definition.graph

  // Create workflow run
  const runId = await workflowService.createRun(graphName, triggerInput)

  // Find and queue entry nodes (nodes with no incoming edges)
  const entryNodes = findEntryNodes(graph)

  for (const nodeId of entryNodes) {
    const node = graph[nodeId]
    if (!node) continue

    const rpcName = getRpcName(node)

    // Entry nodes get trigger input directly (no refs to resolve)
    await queueGraphNode(
      workflowService,
      runId,
      graphName,
      nodeId,
      rpcName,
      triggerInput
    )
  }

  return { runId }
}
