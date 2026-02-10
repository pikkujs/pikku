import type {
  SerializedWorkflowGraph,
  SerializedGraphNode,
  FunctionNode,
  DataRef,
  SerializedNext,
} from './workflow-graph.types.js'

/**
 * Convert a RefValue (from runtime) to DataRef (serialized)
 */
function convertRef(ref: { nodeId: string; path?: string }): DataRef {
  return {
    $ref: ref.nodeId,
    path: ref.path,
  }
}

/**
 * Check if a value is a runtime RefValue
 */
function isRefValue(
  value: unknown
): value is { __isRef: true; nodeId: string; path?: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__isRef' in value &&
    (value as any).__isRef === true
  )
}

/**
 * Convert input mapping from runtime format to serialized format
 */
function serializeInputMapping(
  input: Record<string, unknown>
): Record<string, unknown | DataRef> {
  const result: Record<string, unknown | DataRef> = {}

  for (const [key, value] of Object.entries(input)) {
    if (isRefValue(value)) {
      result[key] = convertRef(value)
    } else {
      result[key] = value
    }
  }

  return result
}

/**
 * Convert next config from runtime format to serialized format
 * Runtime uses Record<string, string | string[]> for branching with graph.branch()
 * Serialized uses { conditions: [...], default: ... } for UI-friendly branching
 */
function serializeNext(
  next: string | string[] | Record<string, string | string[]> | undefined
): SerializedNext | undefined {
  if (!next) return undefined

  if (typeof next === 'string') return next
  if (Array.isArray(next)) return next

  // Record format - convert to conditions format
  // For now, treat keys as branch identifiers (from graph.branch())
  // UI can display these as condition labels
  const conditions = Object.entries(next).map(([key, target]) => ({
    expression: key, // The branch key becomes the expression
    target,
  }))

  return { conditions }
}

/**
 * Serialize a workflow graph definition (from runtime) to JSON format
 *
 * @param definition - The runtime definition (with callbacks evaluated)
 * @param rpcNameLookup - Function to get RPC name from a node's func
 */
export function serializeWorkflowGraph(
  definition: {
    name: string
    graph: Record<
      string,
      {
        func: { name?: string }
        input?: (ref: any) => Record<string, unknown>
        next?: string | string[] | Record<string, string | string[]>
        onError?: string | string[]
      }
    >
  },
  options?: {
    description?: string
    tags?: string[]
  }
): SerializedWorkflowGraph {
  const nodes: Record<string, SerializedGraphNode> = {}
  const entryNodeIds: string[] = []

  // Create a ref function that captures refs
  const createRef = (nodeId: string, path?: string) => ({
    __isRef: true as const,
    nodeId,
    path,
  })

  // Track which nodes have incoming edges
  const hasIncomingEdge = new Set<string>()

  // First pass: identify nodes with incoming edges
  for (const [_nodeId, node] of Object.entries(definition.graph)) {
    const next = node.next
    if (!next) continue

    if (typeof next === 'string') {
      hasIncomingEdge.add(next)
    } else if (Array.isArray(next)) {
      next.forEach((n) => hasIncomingEdge.add(n))
    } else {
      for (const targets of Object.values(next)) {
        if (typeof targets === 'string') {
          hasIncomingEdge.add(targets)
        } else {
          targets.forEach((n) => hasIncomingEdge.add(n))
        }
      }
    }
  }

  // Second pass: serialize nodes
  for (const [nodeId, node] of Object.entries(definition.graph)) {
    // Evaluate input callback to get the mapping
    let input: Record<string, unknown | DataRef> = {}
    if (node.input) {
      const rawInput = node.input(createRef)
      input = serializeInputMapping(rawInput)
    }

    // Get RPC name from func
    const rpcName = node.func?.name || 'unknown'

    const funcNode: FunctionNode = {
      nodeId,
      rpcName,
      input,
      next: serializeNext(node.next),
      onError: node.onError,
    }
    nodes[nodeId] = funcNode

    // Entry nodes have no incoming edges
    if (!hasIncomingEdge.has(nodeId)) {
      entryNodeIds.push(nodeId)
    }
  }

  return {
    name: definition.name,
    pikkuFuncId: definition.name, // For graph workflows, pikkuFuncId is the workflow name
    source: 'graph' as const,
    description: options?.description,
    tags: options?.tags,
    nodes,
    entryNodeIds,
  }
}

/**
 * Deserialize a workflow graph from JSON to runtime format
 * This re-hydrates the JSON so it can be executed
 */
export function deserializeWorkflowGraph(serialized: SerializedWorkflowGraph): {
  name: string
  graph: Record<
    string,
    {
      rpcName: string
      input: Record<string, unknown | DataRef>
      next?: SerializedNext
      onError?: string | string[]
    }
  >
  entryNodeIds: string[]
} {
  const graph: Record<
    string,
    {
      rpcName: string
      input: Record<string, unknown | DataRef>
      next?: SerializedNext
      onError?: string | string[]
    }
  > = {}

  for (const [nodeId, node] of Object.entries(serialized.nodes)) {
    // Only include FunctionNode properties (nodes with rpcName)
    if ('rpcName' in node) {
      const funcNode = node as FunctionNode
      graph[nodeId] = {
        rpcName: funcNode.rpcName,
        input: funcNode.input ?? {},
        next: funcNode.next,
        onError: funcNode.onError,
      }
    }
  }

  return {
    name: serialized.name,
    graph,
    entryNodeIds: serialized.entryNodeIds,
  }
}
