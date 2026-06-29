import type { FunctionsMeta } from '@pikku/core'
import { isVersionedId, formatVersionedId, parseVersionedId } from '@pikku/core'
import type { SerializedWorkflowGraph } from './workflow-graph.types.js'
import { canonicalJSON, hashString } from '../../hash.js'
import { convertDslToGraph } from './convert-dsl-to-graph.js'
import type { InspectorState } from '../../../types.js'

export function finalizeWorkflows(state: InspectorState): void {
  const { workflows, functions } = state
  const functionsMeta = functions.meta

  for (const [name, meta] of Object.entries(workflows.meta)) {
    const graph = convertDslToGraph(name, meta)
    stampVersionsOnGraph(graph, functionsMeta)
    computeStepHashes(graph, functionsMeta)
    graph.graphHash = computeGraphHash(graph)
    workflows.graphMeta[name] = graph
  }

  for (const graph of Object.values(workflows.graphMeta)) {
    if (graph.graphHash) {
      continue
    }
    stampVersionsOnGraph(graph, functionsMeta)
    computeStepHashes(graph, functionsMeta)
    graph.graphHash = computeGraphHash(graph)
  }
}

function stampVersionsOnGraph(
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

function computeStepHashes(
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

function computeGraphHash(graph: SerializedWorkflowGraph): string {
  return hashString(
    canonicalJSON({
      source: graph.source,
      context: graph.context,
      nodes: graph.nodes,
      entryNodeIds: graph.entryNodeIds,
    }),
    12
  )
}
