import type { ParsedWorkflow, ParsedNode } from './types.js'
import { isAbsorbedRole } from './parse-n8n.js'

export type NextValue = string | string[] | Record<string, string[]>

export interface NodeTopology {
  next?: NextValue
  onError?: string | string[]
  /** nodeId of the (first) predecessor — resolves `$json` references. */
  predecessorNodeId?: string
  /**
   * All graph-node predecessors, in connection order — the multiple input
   * streams that feed a join node (n8n Merge). `predecessorNodeId` stays the
   * first for `$json` resolution.
   */
  predecessorNodeIds?: string[]
}

export interface Topology {
  /** Main-flow nodes that become graph nodes, in declaration order. */
  graphNodes: ParsedNode[]
  /** Per graph nodeId: next/onError/predecessor. */
  byNodeId: Record<string, NodeTopology>
  entryNodeIds: string[]
  nameToNodeId: Record<string, string>
  /**
   * Rewrite map for references that point at a non-graph node. A No Op is a
   * passthrough, so `$node["NoOp"].json.x` must resolve to the No Op's upstream
   * graph-node data source — or the implicit `trigger` input when the No Op is
   * an entry (fed only by triggers/other noops). Values are terminal nodeIds
   * (`'trigger'` or a graph nodeId), so no further resolution is needed.
   */
  refRewrite: Record<string, string>
}

/** Nodes that participate in the executable graph (exclude trigger/tool/config). */
function isGraphNode(node: ParsedNode): boolean {
  if (node.disabled) return false
  if (node.role === 'trigger' || node.role === 'agentTool') return false
  // No Op nodes are transparent — dropped, with their edges rewired through.
  if (node.role === 'noop') return false
  if (isAbsorbedRole(node.role)) return false
  return true
}

export function buildTopology(parsed: ParsedWorkflow): Topology {
  const nameToNodeId: Record<string, string> = {}
  const roleByNodeId: Record<string, ParsedNode['role']> = {}
  for (const node of parsed.nodes) {
    nameToNodeId[node.name] = node.nodeId
    roleByNodeId[node.nodeId] = node.role
  }

  const graphNodes = parsed.nodes.filter(isGraphNode)
  const graphNodeIds = new Set(graphNodes.map((n) => n.nodeId))

  // No Op nodes are transparent: an edge into one continues on to its own
  // targets (recursively, so chained noops collapse too).
  const noopNames = new Set(
    parsed.nodes.filter((n) => n.role === 'noop').map((n) => n.name)
  )
  function resolveGraphTargets(name: string, seen: Set<string>): string[] {
    const id = nameToNodeId[name]
    if (id && graphNodeIds.has(id)) return [id]
    if (noopNames.has(name) && !seen.has(name)) {
      seen.add(name)
      const out: string[] = []
      for (const slot of parsed.connections[name]?.main ?? []) {
        for (const t of slot ?? []) {
          out.push(...resolveGraphTargets(t.node, seen))
        }
      }
      return out
    }
    return []
  }

  const byNodeId: Record<string, NodeTopology> = {}
  for (const node of graphNodes) byNodeId[node.nodeId] = {}

  const hasIncoming = new Set<string>()

  for (const [sourceName, ports] of Object.entries(parsed.connections)) {
    const sourceId = nameToNodeId[sourceName]
    const mainSlots = ports.main ?? []

    // Map slot targets → graph nodeIds, expanding transparent noops.
    const slotTargets = mainSlots.map((slot) => {
      const ids: string[] = []
      for (const t of slot ?? []) {
        for (const id of resolveGraphTargets(t.node, new Set())) {
          if (!ids.includes(id)) ids.push(id)
        }
      }
      return ids
    })

    // Record predecessors for `$json` resolution (target ← source). Only
    // graph-node sources qualify — a trigger predecessor leaves `$json`
    // resolving to the implicit 'trigger' input.
    const sourceIsGraphNode = !!sourceId && graphNodeIds.has(sourceId)
    for (const targets of slotTargets) {
      for (const targetId of targets) {
        hasIncoming.add(targetId)
        const topo = byNodeId[targetId]
        if (topo && sourceIsGraphNode) {
          if (!topo.predecessorNodeId) topo.predecessorNodeId = sourceId
          ;(topo.predecessorNodeIds ??= []).push(sourceId!)
        }
      }
    }

    // Only wire `next` from graph-node sources (trigger→X edges are dropped,
    // leaving X as an entry node).
    if (!sourceId || !graphNodeIds.has(sourceId)) continue
    const topo = byNodeId[sourceId]!

    // A branch node routes via `graph.branch(key)`, so its `next` must always be
    // a Record keyed by output-slot index — even a single-output Filter, whose
    // key must match so a false result can dead-end instead of always flowing on.
    const isBranch = roleByNodeId[sourceId] === 'branch'
    const nonEmpty = slotTargets.filter((s) => s.length > 0)
    if (nonEmpty.length === 0) {
      // no outgoing
    } else if (!isBranch && slotTargets.length === 1) {
      const targets = slotTargets[0]!
      topo.next = targets.length === 1 ? targets[0]! : targets
    } else {
      // Multiple output slots (or a branch) → key by slot index (IF => 0/1).
      const record: Record<string, string[]> = {}
      slotTargets.forEach((targets, i) => {
        if (targets.length > 0) record[String(i)] = targets
      })
      topo.next = record
    }
  }

  // A branch node passes its input item through unchanged, so `$json` in a node
  // downstream of a branch resolves to the branch's own data source, not the
  // branch's `{ branch }` output. Walk each predecessor back through any branches.
  for (const node of graphNodes) {
    const topo = byNodeId[node.nodeId]!
    let predId = topo.predecessorNodeId
    const seen = new Set<string>()
    while (predId && roleByNodeId[predId] === 'branch' && !seen.has(predId)) {
      seen.add(predId)
      predId = byNodeId[predId]?.predecessorNodeId
    }
    topo.predecessorNodeId = predId
  }

  const entryNodeIds = graphNodes
    .map((n) => n.nodeId)
    .filter((id) => !hasIncoming.has(id))

  // Reverse main adjacency by node name — who feeds each node.
  const mainPredsByName: Record<string, string[]> = {}
  for (const [sourceName, ports] of Object.entries(parsed.connections)) {
    for (const slot of ports.main ?? []) {
      for (const t of slot ?? []) {
        ;(mainPredsByName[t.node] ??= []).push(sourceName)
      }
    }
  }

  // Walk a No Op's main predecessors back to a terminal data source: the first
  // graph-node ancestor, or `trigger` if only triggers/noops feed it.
  function resolveNoopSource(name: string, seen: Set<string>): string {
    for (const predName of mainPredsByName[name] ?? []) {
      const predId = nameToNodeId[predName]
      if (predId && graphNodeIds.has(predId)) return predId
      if (predId && roleByNodeId[predId] === 'trigger') return 'trigger'
      if (noopNames.has(predName) && !seen.has(predName)) {
        seen.add(predName)
        const r = resolveNoopSource(predName, seen)
        if (r) return r
      }
    }
    return 'trigger'
  }

  const refRewrite: Record<string, string> = {}
  for (const node of parsed.nodes) {
    if (node.role === 'noop') {
      refRewrite[node.nodeId] = resolveNoopSource(
        node.name,
        new Set([node.name])
      )
    }
  }

  return { graphNodes, byNodeId, entryNodeIds, nameToNodeId, refRewrite }
}
