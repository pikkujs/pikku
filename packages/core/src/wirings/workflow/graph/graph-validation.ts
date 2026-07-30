function normalizeTargets(value: unknown): string[] {
  if (!value) return []
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string')
  if (typeof value === 'object') {
    const targets: string[] = []
    for (const v of Object.values(value as Record<string, unknown>)) {
      targets.push(...normalizeTargets(v))
    }
    return targets
  }
  return []
}

export function generateMermaidDiagram(
  workflowName: string,
  nodes: Record<string, any>,
  entryNodeIds: string[]
): string {
  const lines: string[] = ['graph TD']

  for (const [nodeId, node] of Object.entries(nodes)) {
    const label = node.rpcName || nodeId
    const isEntry = entryNodeIds.includes(nodeId)
    lines.push(
      `  ${nodeId}${isEntry ? '([' : '['}${label}${isEntry ? '])' : ']'}`
    )

    const nextTargets = normalizeTargets(node.next)
    for (const target of nextTargets) {
      lines.push(`  ${nodeId} --> ${target}`)
    }

    const errorTargets = normalizeTargets(node.onError)
    for (const target of errorTargets) {
      lines.push(`  ${nodeId} -.->|error| ${target}`)
    }
  }

  return lines.join('\n')
}
