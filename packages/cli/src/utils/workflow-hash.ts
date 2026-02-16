import type { SerializedWorkflowGraph } from '@pikku/inspector'
import type { FunctionsMeta } from '@pikku/core'
import { parseVersionedId } from '@pikku/core'
import { canonicalJSON, hashString } from './hash.js'

export function computeStepHashes(
  graph: SerializedWorkflowGraph,
  functionsMeta: FunctionsMeta
): void {
  for (const node of Object.values(graph.nodes)) {
    if (!('rpcName' in node) || typeof node.rpcName !== 'string') {
      continue
    }
    const rpcName: string = node.rpcName
    let meta = functionsMeta[rpcName]
    if (!meta) {
      const { baseName } = parseVersionedId(rpcName)
      meta = functionsMeta[baseName]
    }
    ;(node as Record<string, unknown>).stepHash = hashString(
      `${node.nodeId}:${meta?.contractHash ?? ''}`,
      12
    )
  }
}

export function computeGraphHash(graph: SerializedWorkflowGraph): string {
  const structural: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(graph)) {
    if (
      key === 'name' ||
      key === 'pikkuFuncId' ||
      key === 'description' ||
      key === 'tags' ||
      key === 'graphHash'
    ) {
      continue
    }
    structural[key] = value
  }
  return hashString(canonicalJSON(structural), 12)
}
