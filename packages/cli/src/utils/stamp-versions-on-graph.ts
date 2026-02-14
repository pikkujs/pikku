import type { SerializedWorkflowGraph } from '@pikku/inspector'
import type { FunctionsMeta } from '@pikku/core'
import { isVersionedId, formatVersionedId, parseVersionedId } from '@pikku/core'

export function stampVersionsOnGraph(
  graph: SerializedWorkflowGraph,
  functionsMeta: FunctionsMeta
): void {
  for (const node of Object.values(graph.nodes)) {
    if (!('rpcName' in node) || typeof node.rpcName !== 'string') {
      continue
    }

    if (isVersionedId(node.rpcName)) {
      continue
    }

    const meta = functionsMeta[node.rpcName]
    if (meta?.version !== undefined) {
      node.rpcName = formatVersionedId(node.rpcName, meta.version)
    } else {
      const latestVersion = findLatestVersion(node.rpcName, functionsMeta)
      if (latestVersion > 0) {
        node.rpcName = formatVersionedId(node.rpcName, latestVersion)
      }
    }
  }
}

function findLatestVersion(
  baseName: string,
  functionsMeta: FunctionsMeta
): number {
  let max = 0
  for (const id of Object.keys(functionsMeta)) {
    const parsed = parseVersionedId(id)
    if (parsed.baseName === baseName && parsed.version !== null) {
      max = Math.max(max, parsed.version)
    }
  }
  return max
}
