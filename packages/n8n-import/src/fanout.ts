/**
 * Per-item fan-out lowering.
 *
 * n8n runs every node once per incoming item, so a "read"/"list" node that
 * returns an array implicitly loops its downstream consumers. Pikku's graph is
 * declarative (one value per node, no ambient fan-out), so that edge is lowered
 * into an explicit `graph:map` node: the collection source stays a node, and
 * its single per-item consumer is pulled out of the graph flow and invoked once
 * per element as the map's `child`, with its `$json` references rebound to the
 * per-item `$item`.
 *
 * v1 is deliberately single-hop: it only lowers a collection source feeding
 * exactly one terminal consumer whose sole input is that source. Longer per-item
 * sub-chains are left untouched (and surfaced by the harness) until the child is
 * generalised to a synthesised per-item sub-graph.
 */

import type { NextValue, Topology } from './topology.js'
import type { ParsedNode } from './types.js'
import { nativeSpecFor } from './native-map.js'

export interface FanoutMap {
  /** Synthetic `graph:map` node id inserted between the source and consumer. */
  mapNodeId: string
  /** The collection source whose array output is fanned out over. */
  sourceNodeId: string
  /** The absorbed consumer's nodeId — its input becomes the map's childInput. */
  childNodeId: string
  /** The rpc the map invokes once per item. */
  childRpc: string
  /** The map node's own successor (the consumer's original next), if any. */
  next?: NextValue
}

export interface FanoutPlan {
  maps: FanoutMap[]
  /** Consumer nodeIds pulled out of the graph flow (invoked only as a child). */
  absorbed: Set<string>
  /** Source nodeId → the map node its `next` must be rewritten to. */
  sourceNext: Map<string, string>
}

/** Roles whose node exposes a callable rpc that can be a map child. */
const CHILD_ROLES = new Set([
  'integration',
  'http',
  'native',
  'set',
  'code',
])

function isCollectionSource(node: ParsedNode): boolean {
  return nativeSpecFor(node.typeShort, node.parameters)?.collection === true
}

export function planFanout(topo: Topology): FanoutPlan {
  const plan: FanoutPlan = {
    maps: [],
    absorbed: new Set(),
    sourceNext: new Map(),
  }

  const byId = new Map(topo.graphNodes.map((n) => [n.nodeId, n]))
  const usedIds = new Set(topo.graphNodes.map((n) => n.nodeId))

  for (const source of topo.graphNodes) {
    if (!isCollectionSource(source)) continue

    const tSource = topo.byNodeId[source.nodeId]!
    // Exactly one successor, reached by a plain (non-branch) edge.
    if (typeof tSource.next !== 'string') continue

    const childId = tSource.next
    const child = byId.get(childId)
    if (!child) continue
    if (!CHILD_ROLES.has(child.role)) continue
    if (isCollectionSource(child)) continue

    const tChild = topo.byNodeId[childId]!
    // The consumer's only input stream must be this source…
    const preds = tChild.predecessorNodeIds ?? []
    if (preds.length !== 1 || preds[0] !== source.nodeId) continue
    // …and it must be terminal (single-hop v1 — no downstream to rebind).
    if (tChild.next !== undefined || tChild.onError !== undefined) continue

    let mapNodeId = `${childId}Map`
    let n = 2
    while (usedIds.has(mapNodeId)) mapNodeId = `${childId}Map${n++}`
    usedIds.add(mapNodeId)

    plan.maps.push({
      mapNodeId,
      sourceNodeId: source.nodeId,
      childNodeId: childId,
      childRpc: child.rpcName,
    })
    plan.absorbed.add(childId)
    plan.sourceNext.set(source.nodeId, mapNodeId)
  }

  return plan
}
