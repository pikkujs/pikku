import type {
  GraphNodeConfig,
  WorkflowGraphDefinition,
  WorkflowGraphMeta,
  WorkflowGraphsMeta,
  SerializedGraphNode,
  SerializedWorkflowGraph,
  InputRef,
  RefValue,
} from './workflow-graph.types.js'
import { createRef } from './workflow-graph.types.js'
import { getAllWorkflowGraphs } from './wire-workflow-graph.js'

/**
 * Get the RPC name from a graph node's func
 */
function getRpcName(node: GraphNodeConfig): string {
  return (node.func as any).name || 'unknown'
}

/**
 * Evaluate a node's input callback to extract refs
 */
function evaluateInputForRefs(node: GraphNodeConfig): InputRef[] {
  if (!node.input) return []

  const refs: InputRef[] = []

  // Create a ref function that captures refs
  const ref = (nodeId: string, path?: string): RefValue => {
    refs.push({ nodeId, path })
    return createRef(nodeId, path)
  }

  // Call the input callback to discover refs
  try {
    node.input(ref)
  } catch {
    // Ignore errors - we just want to capture the refs
  }

  return refs
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
function findEntryNodeId(graph: Record<string, GraphNodeConfig>): string {
  const entryNodes = Object.keys(graph).filter(
    (nodeId) => !hasIncomingEdges(graph, nodeId)
  )
  return entryNodes[0] || 'entry'
}

/**
 * Extract metadata from a workflow graph definition for inspector/CLI use.
 * This is called at build time, not runtime.
 */
export function extractGraphMeta(
  definition: WorkflowGraphDefinition<any>
): WorkflowGraphMeta {
  const nodes: WorkflowGraphMeta['nodes'] = {}

  for (const [nodeId, node] of Object.entries(definition.graph)) {
    const typedNode = node as GraphNodeConfig
    nodes[nodeId] = {
      rpcName: getRpcName(typedNode),
      inputRefs: evaluateInputForRefs(typedNode),
      next: typedNode.next,
      onError: typedNode.onError,
    }
  }

  return {
    workflowName: definition.name,
    triggers: definition.triggers,
    nodes,
    entryNodeId: findEntryNodeId(definition.graph),
  }
}

/**
 * Extract metadata from all registered workflow graphs.
 * This is called at build time by the CLI.
 */
export function extractAllGraphsMeta(): WorkflowGraphsMeta {
  const graphs = getAllWorkflowGraphs()
  const meta: WorkflowGraphsMeta = {}

  for (const [name, definition] of graphs) {
    meta[name] = extractGraphMeta(definition)
  }

  return meta
}

/**
 * Serialize a graph node for storage/transmission.
 * Evaluates the input callback and stores the resolved mapping.
 */
export function serializeGraphNode(
  nodeId: string,
  node: GraphNodeConfig
): SerializedGraphNode {
  // Evaluate input callback
  let input: Record<string, unknown | RefValue> = {}
  if (node.input) {
    const ref = (targetNodeId: string, path?: string): RefValue =>
      createRef(targetNodeId, path)
    input = node.input(ref)
  }

  return {
    nodeId,
    rpcName: getRpcName(node),
    input,
    next: node.next,
    onError: node.onError,
  }
}

/**
 * Serialize a complete workflow graph for storage/transmission.
 */
export function serializeWorkflowGraph(
  definition: WorkflowGraphDefinition<any>
): SerializedWorkflowGraph {
  const nodes: Record<string, SerializedGraphNode> = {}

  for (const [nodeId, node] of Object.entries(definition.graph)) {
    nodes[nodeId] = serializeGraphNode(nodeId, node as GraphNodeConfig)
  }

  return {
    name: definition.name,
    triggers: definition.triggers,
    nodes,
    entryNodeId: findEntryNodeId(definition.graph),
  }
}

/**
 * Generate a visual representation of the graph (for CLI display)
 */
export function generateGraphVisualization(meta: WorkflowGraphMeta): string {
  const lines: string[] = []
  lines.push(`Workflow Graph: ${meta.workflowName}`)
  lines.push('─'.repeat(40))

  // Show triggers
  if (meta.triggers.http) {
    lines.push(
      `Trigger: HTTP ${meta.triggers.http.method.toUpperCase()} ${meta.triggers.http.route}`
    )
  }
  if (meta.triggers.queue) {
    lines.push(`Trigger: Queue ${meta.triggers.queue}`)
  }
  lines.push('')

  // Show nodes
  lines.push('Nodes:')
  for (const [nodeId, node] of Object.entries(meta.nodes)) {
    const isEntry = nodeId === meta.entryNodeId
    const prefix = isEntry ? '► ' : '  '
    lines.push(`${prefix}${nodeId} -> ${node.rpcName}`)

    // Show input refs
    if (node.inputRefs.length > 0) {
      const refs = node.inputRefs
        .map((r) => (r.path ? `${r.nodeId}.${r.path}` : r.nodeId))
        .join(', ')
      lines.push(`    inputs: [${refs}]`)
    }

    // Show next
    if (node.next) {
      if (typeof node.next === 'string') {
        lines.push(`    next: ${node.next}`)
      } else if (Array.isArray(node.next)) {
        lines.push(`    next: [${node.next.join(', ')}] (parallel)`)
      } else {
        const branches = Object.entries(node.next)
          .map(([k, v]) => `${k}:${Array.isArray(v) ? `[${v.join(',')}]` : v}`)
          .join(', ')
        lines.push(`    next: {${branches}} (branching)`)
      }
    }

    // Show error handler
    if (node.onError) {
      const errorNodes = Array.isArray(node.onError)
        ? node.onError.join(', ')
        : node.onError
      lines.push(`    onError: ${errorNodes}`)
    }
  }

  return lines.join('\n')
}
