/**
 * Aggregate a V8 .heapsnapshot by retained size, so we can name the top
 * retainers in a `pikku all` run rather than guessing from code reading.
 *
 * Usage:
 *   npx tsx benchmarks/analyze-heapsnapshot.ts <file.heapsnapshot> [topN]
 *
 * Retained size needs the dominator tree, not just self_size — a Map with a
 * tiny shallow size can dominate hundreds of MB of ts.Type/AST objects, which
 * is exactly the case we're trying to distinguish here.
 *
 * LIMITATION: reads the snapshot with JSON.parse, so it caps out at Node's
 * ~512MB max string length. A snapshot captured near a 2GB heap limit will not
 * load — capture at a lower --max-old-space-size, or replace the read with a
 * streaming/byte-scanning parser (the nodes/edges arrays are flat numerics).
 */
import { readFileSync } from 'fs'

const file = process.argv[2]
const TOP = parseInt(process.argv[3] ?? '30', 10)
if (!file) {
  console.error('usage: analyze-heapsnapshot.ts <file.heapsnapshot> [topN]')
  process.exit(1)
}

type Snapshot = {
  snapshot: {
    meta: {
      node_fields: string[]
      node_types: any[]
      edge_fields: string[]
      edge_types: any[]
    }
    node_count: number
    edge_count: number
  }
  nodes: number[]
  edges: number[]
  strings: string[]
}

const snap: Snapshot = JSON.parse(readFileSync(file, 'utf8'))
const { node_fields, edge_fields, node_types, edge_types } = snap.snapshot.meta

const NF = node_fields.length
const EF = edge_fields.length
const nodeCount = snap.snapshot.node_count
const nodes = snap.nodes
const edges = snap.edges

const nfType = node_fields.indexOf('type')
const nfName = node_fields.indexOf('name')
const nfSelf = node_fields.indexOf('self_size')
const nfEdgeCount = node_fields.indexOf('edge_count')

const efType = edge_fields.indexOf('type')
const efName = edge_fields.indexOf('name_or_index')
const efTo = edge_fields.indexOf('to_node')

const nodeTypeNames: string[] = node_types[0]
const edgeTypeNames: string[] = edge_types[0]

// firstEdge[i] = index into `edges` (in edge units) where node i's edges start
const firstEdge = new Uint32Array(nodeCount + 1)
{
  let acc = 0
  for (let i = 0; i < nodeCount; i++) {
    firstEdge[i] = acc
    acc += nodes[i * NF + nfEdgeCount]!
  }
  firstEdge[nodeCount] = acc
}

const selfSize = new Float64Array(nodeCount)
for (let i = 0; i < nodeCount; i++) selfSize[i] = nodes[i * NF + nfSelf]!

function nodeLabel(i: number): string {
  const t = nodeTypeNames[nodes[i * NF + nfType]!]!
  const n = snap.strings[nodes[i * NF + nfName]!] ?? ''
  if (t === 'object' || t === 'closure' || t === 'native') return n || `(${t})`
  return `(${t})`
}

// ── BFS from root to get traversal order + parents ───────────────────────────
// Weak/shortcut edges don't retain, so they're excluded from the dominator calc.
function retains(edgeTypeName: string): boolean {
  return edgeTypeName !== 'weak' && edgeTypeName !== 'shortcut'
}

const ROOT = 0
const order: number[] = []
const visited = new Uint8Array(nodeCount)
const queue = new Int32Array(nodeCount)
let qh = 0
let qt = 0
queue[qt++] = ROOT
visited[ROOT] = 1
while (qh < qt) {
  const u = queue[qh++]!
  order.push(u)
  for (let e = firstEdge[u]!; e < firstEdge[u + 1]!; e++) {
    if (!retains(edgeTypeNames[edges[e * EF + efType]!]!)) continue
    const v = edges[e * EF + efTo]! / NF
    if (!visited[v]) {
      visited[v] = 1
      queue[qt++] = v
    }
  }
}

// Predecessors, restricted to reachable nodes
const predHead = new Int32Array(nodeCount).fill(-1)
const predNext: number[] = []
const predNode: number[] = []
for (let u = 0; u < nodeCount; u++) {
  if (!visited[u]) continue
  for (let e = firstEdge[u]!; e < firstEdge[u + 1]!; e++) {
    if (!retains(edgeTypeNames[edges[e * EF + efType]!]!)) continue
    const v = edges[e * EF + efTo]! / NF
    if (!visited[v]) continue
    predNode.push(u)
    predNext.push(predHead[v]!)
    predHead[v] = predNode.length - 1
  }
}

// ── Iterative dominator tree (Cooper-Harvey-Kennedy) ─────────────────────────
const rpoIndex = new Int32Array(nodeCount).fill(-1)
for (let i = 0; i < order.length; i++) rpoIndex[order[i]!] = i

const idom = new Int32Array(nodeCount).fill(-1)
idom[ROOT] = ROOT

function intersect(a: number, b: number): number {
  while (a !== b) {
    while (rpoIndex[a]! > rpoIndex[b]!) a = idom[a]!
    while (rpoIndex[b]! > rpoIndex[a]!) b = idom[b]!
  }
  return a
}

let changed = true
while (changed) {
  changed = false
  for (let i = 1; i < order.length; i++) {
    const u = order[i]!
    let newIdom = -1
    for (let p = predHead[u]!; p !== -1; p = predNext[p]!) {
      const pred = predNode[p]!
      if (idom[pred] === -1) continue
      newIdom = newIdom === -1 ? pred : intersect(newIdom, pred)
    }
    if (newIdom !== -1 && idom[u] !== newIdom) {
      idom[u] = newIdom
      changed = true
    }
  }
}

// ── Retained size: accumulate up the dominator tree, deepest-first ───────────
const retained = new Float64Array(nodeCount)
for (const u of order) retained[u] = selfSize[u]!
for (let i = order.length - 1; i >= 1; i--) {
  const u = order[i]!
  const d = idom[u]!
  if (d !== -1 && d !== u) retained[d]! += retained[u]!
}

// ── Report ───────────────────────────────────────────────────────────────────
const MB = (b: number) => (b / 1024 / 1024).toFixed(1)
const totalHeap = order.reduce((a, u) => a + selfSize[u]!, 0)

console.log(`snapshot:   ${file}`)
console.log(`nodes:      ${nodeCount} (${order.length} reachable)`)
console.log(`total heap: ${MB(totalHeap)} MB\n`)

// By constructor/label — where the bytes actually live
const byLabel = new Map<string, { count: number; self: number }>()
for (const u of order) {
  const k = nodeLabel(u)
  const cur = byLabel.get(k) ?? { count: 0, self: 0 }
  cur.count++
  cur.self += selfSize[u]!
  byLabel.set(k, cur)
}
console.log(`── Top ${TOP} by TOTAL SHALLOW size (where bytes live) ──`)
console.log('        MB    count  constructor')
for (const [k, v] of [...byLabel.entries()]
  .sort((a, b) => b[1].self - a[1].self)
  .slice(0, TOP)) {
  console.log(
    `  ${MB(v.self).padStart(8)}  ${String(v.count).padStart(7)}  ${k}`
  )
}

// Individual dominators — which single objects hold the graph up
console.log(
  `\n── Top ${TOP} individual objects by RETAINED size (who holds it) ──`
)
console.log('        MB  constructor')
const topRetainers = [...order]
  .sort((a, b) => retained[b]! - retained[a]!)
  .filter((u) => u !== ROOT)
  .slice(0, TOP)
for (const u of topRetainers) {
  console.log(`  ${MB(retained[u]!).padStart(8)}  ${nodeLabel(u)}`)
}
