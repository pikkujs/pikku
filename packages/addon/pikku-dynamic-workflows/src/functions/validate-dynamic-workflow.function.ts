import { pikkuSessionlessFunc } from '#pikku'

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

function computeEntryNodeIds(nodes: Record<string, any>): string[] {
  const referenced = new Set<string>()
  for (const node of Object.values(nodes)) {
    if (node.next) {
      for (const target of normalizeTargets(node.next)) {
        referenced.add(target)
      }
    }
    if (node.onError) {
      for (const target of normalizeTargets(node.onError)) {
        referenced.add(target)
      }
    }
  }
  return Object.keys(nodes).filter((id) => !referenced.has(id))
}

function validateWorkflowWiring(
  nodes: Record<string, any>,
  toolNames: string[]
): string[] {
  const errors: string[] = []
  const nodeIds = new Set(Object.keys(nodes))
  const toolSet = new Set(toolNames)

  for (const [nodeId, node] of Object.entries(nodes)) {
    if (!node.rpcName) {
      errors.push(`Node '${nodeId}' is missing 'rpcName'`)
      continue
    }

    if (!toolSet.has(node.rpcName)) {
      errors.push(
        `Node '${nodeId}' references unknown tool '${node.rpcName}'. Available tools: ${toolNames.join(', ')}`
      )
      continue
    }

    const nextTargets = normalizeTargets(node.next)
    for (const target of nextTargets) {
      if (!nodeIds.has(target)) {
        errors.push(
          `Node '${nodeId}' routes to unknown node '${target}' in 'next'`
        )
      }
    }

    const errorTargets = normalizeTargets(node.onError)
    for (const target of errorTargets) {
      if (!nodeIds.has(target)) {
        errors.push(
          `Node '${nodeId}' routes to unknown node '${target}' in 'onError'`
        )
      }
    }
  }

  return errors
}

export const validateDynamicWorkflow = pikkuSessionlessFunc<
  { nodes: Record<string, any>; functionNames: string[] },
  { valid: boolean; errors: string[]; entryNodeIds: string[] }
>({
  description: 'Validates a workflow graph for structural correctness',
  func: async ({}, { nodes, functionNames }) => {
    const errors = validateWorkflowWiring(nodes, functionNames)
    const entryNodeIds = computeEntryNodeIds(nodes)

    if (entryNodeIds.length === 0) {
      errors.push(
        'No entry nodes found. Every node is referenced by another node, creating a cycle.'
      )
    }

    return {
      valid: errors.length === 0,
      errors,
      entryNodeIds,
    }
  },
})
