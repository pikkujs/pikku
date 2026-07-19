export type FlowTimelineKind =
  | 'rpc'
  | 'eventual'
  | 'parallel'
  | 'fanout'
  | 'other'

export interface FlowTimelineNode {
  nodeId: string
  kind: FlowTimelineKind
  title: string
  actor?: string
  rpcName?: string
  args?: Record<string, unknown>
  expectEventually?: boolean
}

interface RawNode {
  nodeId: string
  flow?: string
  rpcName?: string
  actor?: string
  input?: Record<string, unknown>
  expectEventually?: boolean
  branches?: unknown[]
  next?: string
}

const isStructuralBranch = (node: RawNode): boolean =>
  node.flow === 'branch' &&
  (!node.branches || node.branches.length === 0) &&
  !node.rpcName

const kindOf = (node: RawNode): FlowTimelineKind => {
  if (node.flow === 'parallel') return 'parallel'
  if (node.flow === 'fanout') return 'fanout'
  if (node.rpcName) return node.expectEventually ? 'eventual' : 'rpc'
  return 'other'
}

const titleOf = (node: RawNode): string => {
  if (/^step_\d+$/.test(node.nodeId)) return node.rpcName ?? node.nodeId
  return node.nodeId
}

export function buildFlowTimeline(
  nodes: Record<string, RawNode> | undefined,
  entryNodeIds?: string[]
): FlowTimelineNode[] {
  if (!nodes) return []
  const ordered: RawNode[] = []
  const visited = new Set<string>()

  const walk = (startId?: string) => {
    let current = startId
    while (current && nodes[current] && !visited.has(current)) {
      visited.add(current)
      ordered.push(nodes[current])
      current = nodes[current].next
    }
  }

  const roots =
    entryNodeIds && entryNodeIds.length > 0
      ? entryNodeIds
      : [Object.keys(nodes)[0]]
  for (const root of roots) walk(root)
  for (const id of Object.keys(nodes)) {
    if (!visited.has(id)) walk(id)
  }

  // scenarios are always void, so the compiled trailing return node is noise
  return ordered
    .filter((node) => !isStructuralBranch(node) && node.flow !== 'return')
    .map((node) => ({
      nodeId: node.nodeId,
      kind: kindOf(node),
      title: titleOf(node),
      actor: node.actor,
      rpcName: node.rpcName,
      args: node.input,
      expectEventually: node.expectEventually,
    }))
}

export function summarizeArgs(input?: Record<string, unknown>): string {
  if (!input) return ''
  const parts = Object.entries(input).map(([key, value]) => {
    if (value && typeof value === 'object' && '$ref' in value) {
      const ref = value as { $ref?: string; path?: string }
      const path = [ref.$ref, ref.path].filter(Boolean).join('.')
      return `${key}: ${path}`
    }
    return `${key}: ${JSON.stringify(value)}`
  })
  return parts.join(', ')
}
