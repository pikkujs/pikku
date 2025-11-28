import type {
  GraphNodeConfig,
  WorkflowGraphDefinition,
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
export function findEntryNodeId(
  graph: Record<string, GraphNodeConfig>
): string {
  const entryNodes = Object.keys(graph).filter(
    (nodeId) => !hasIncomingEdges(graph, nodeId)
  )
  return entryNodes[0] || 'entry'
}

/**
 * Evaluate a node's input callback to resolve refs at runtime.
 * Returns the resolved input mapping with RefValues.
 */
export function evaluateNodeInput(
  node: GraphNodeConfig
): Record<string, unknown | RefValue> {
  if (!node.input) return {}

  const ref = (nodeId: string, path?: string): RefValue =>
    createRef(nodeId, path)

  return node.input(ref)
}

/**
 * Get all registered workflow graphs.
 * Delegates to wire-workflow-graph registry.
 */
export function getRegisteredGraphs(): Map<
  string,
  WorkflowGraphDefinition<any>
> {
  return getAllWorkflowGraphs()
}

/**
 * Generate a visual representation of the graph (for CLI display)
 */
export function generateGraphVisualization(
  definition: WorkflowGraphDefinition<any>
): string {
  const lines: string[] = []
  lines.push(`Workflow Graph: ${definition.name}`)
  lines.push('─'.repeat(40))

  // Show triggers
  if (definition.triggers.http) {
    lines.push(
      `Trigger: HTTP ${definition.triggers.http.method.toUpperCase()} ${definition.triggers.http.route}`
    )
  }
  if (definition.triggers.queue) {
    lines.push(`Trigger: Queue ${definition.triggers.queue}`)
  }
  lines.push('')

  // Show nodes
  const entryNodeId = findEntryNodeId(definition.graph)
  lines.push('Nodes:')
  for (const [nodeId, node] of Object.entries(definition.graph)) {
    const typedNode = node as GraphNodeConfig
    const isEntry = nodeId === entryNodeId
    const prefix = isEntry ? '► ' : '  '
    lines.push(`${prefix}${nodeId} -> ${getRpcName(typedNode)}`)

    // Show next
    if (typedNode.next) {
      if (typeof typedNode.next === 'string') {
        lines.push(`    next: ${typedNode.next}`)
      } else if (Array.isArray(typedNode.next)) {
        lines.push(`    next: [${typedNode.next.join(', ')}] (parallel)`)
      } else {
        const branches = Object.entries(typedNode.next)
          .map(([k, v]) => `${k}:${Array.isArray(v) ? `[${v.join(',')}]` : v}`)
          .join(', ')
        lines.push(`    next: {${branches}} (branching)`)
      }
    }

    // Show error handler
    if (typedNode.onError) {
      const errorNodes = Array.isArray(typedNode.onError)
        ? typedNode.onError.join(', ')
        : typedNode.onError
      lines.push(`    onError: ${errorNodes}`)
    }
  }

  return lines.join('\n')
}
