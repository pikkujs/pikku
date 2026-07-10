import type { ParsedWorkflow, ParsedNode } from './types.js'
import { isAbsorbedRole } from './parse-n8n.js'

export type NextValue = string | string[] | Record<string, string[]>

export interface NodeTopology {
  next?: NextValue
  onError?: string | string[]
  /** nodeId of the (first) predecessor — resolves `$json` references. */
  predecessorNodeId?: string
}

export interface Topology {
  /** Main-flow nodes that become graph nodes, in declaration order. */
  graphNodes: ParsedNode[]
  /** Per graph nodeId: next/onError/predecessor. */
  byNodeId: Record<string, NodeTopology>
  entryNodeIds: string[]
  nameToNodeId: Record<string, string>
}

/** Nodes that participate in the executable graph (exclude trigger/tool/config). */
function isGraphNode(node: ParsedNode): boolean {
  if (node.disabled) return false
  if (node.role === 'trigger' || node.role === 'agentTool') return false
  if (isAbsorbedRole(node.role)) return false
  return true
}

export function buildTopology(parsed: ParsedWorkflow): Topology {
  const nameToNodeId: Record<string, string> = {}
  for (const node of parsed.nodes) nameToNodeId[node.name] = node.nodeId

  const graphNodes = parsed.nodes.filter(isGraphNode)
  const graphNodeIds = new Set(graphNodes.map((n) => n.nodeId))

  const byNodeId: Record<string, NodeTopology> = {}
  for (const node of graphNodes) byNodeId[node.nodeId] = {}

  const hasIncoming = new Set<string>()

  for (const [sourceName, ports] of Object.entries(parsed.connections)) {
    const sourceId = nameToNodeId[sourceName]
    const mainSlots = ports.main ?? []

    // Map slot targets → graph nodeIds (dropping non-graph targets).
    const slotTargets = mainSlots.map((slot) =>
      (slot ?? [])
        .map((t) => nameToNodeId[t.node])
        .filter((id): id is string => !!id && graphNodeIds.has(id))
    )

    // Record predecessors for `$json` resolution (target ← source). Only
    // graph-node sources qualify — a trigger predecessor leaves `$json`
    // resolving to the implicit 'trigger' input.
    const sourceIsGraphNode = !!sourceId && graphNodeIds.has(sourceId)
    for (const targets of slotTargets) {
      for (const targetId of targets) {
        hasIncoming.add(targetId)
        const topo = byNodeId[targetId]
        if (topo && !topo.predecessorNodeId && sourceIsGraphNode) {
          topo.predecessorNodeId = sourceId
        }
      }
    }

    // Only wire `next` from graph-node sources (trigger→X edges are dropped,
    // leaving X as an entry node).
    if (!sourceId || !graphNodeIds.has(sourceId)) continue
    const topo = byNodeId[sourceId]!

    const nonEmpty = slotTargets.filter((s) => s.length > 0)
    if (nonEmpty.length === 0) {
      // no outgoing
    } else if (slotTargets.length === 1) {
      const targets = slotTargets[0]!
      topo.next = targets.length === 1 ? targets[0]! : targets
    } else {
      // Multiple output slots → branching. Key by slot index (IF => 0/1).
      const record: Record<string, string[]> = {}
      slotTargets.forEach((targets, i) => {
        if (targets.length > 0) record[String(i)] = targets
      })
      topo.next = record
    }
  }

  const entryNodeIds = graphNodes
    .map((n) => n.nodeId)
    .filter((id) => !hasIncoming.has(id))

  return { graphNodes, byNodeId, entryNodeIds, nameToNodeId }
}
