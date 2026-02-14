import { createHash } from 'crypto'
import type { SerializedWorkflowGraph } from '@pikku/inspector'
import type { FunctionsMeta } from '@pikku/core'
import { parseVersionedId } from '@pikku/core'

function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeys)
  if (obj && typeof obj === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key])
    }
    return sorted
  }
  return obj
}

function hashString(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 12)
}

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
    const parts = [
      node.nodeId,
      rpcName,
      meta?.inputsSchemaHash ?? '',
      meta?.outputsSchemaHash ?? '',
    ]
    ;(node as Record<string, unknown>).stepHash = hashString(parts.join(':'))
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
  return hashString(JSON.stringify(sortKeys(structural)))
}
