import { pikkuState } from '../../../pikku-state.js'
import { resolveNamespace } from '../../rpc/rpc-runner.js'

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

function collectRefs(value: unknown, refs: Set<string>): void {
  if (
    typeof value === 'object' &&
    value !== null &&
    '$ref' in value &&
    typeof (value as any).$ref === 'string'
  ) {
    refs.add((value as any).$ref)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, refs)
    return
  }
  if (typeof value === 'object' && value !== null) {
    for (const v of Object.values(value)) collectRefs(v, refs)
  }
}

function resolveToolMeta(toolName: string): {
  fnMeta: any
  schemas: Map<string, any>
} | null {
  const resolved = toolName.includes(':') ? resolveNamespace(toolName) : null

  if (resolved) {
    const fnMeta = pikkuState(resolved.package, 'function', 'meta')[
      resolved.function
    ]
    const schemas = pikkuState(resolved.package, 'misc', 'schemas')
    return fnMeta ? { fnMeta, schemas } : null
  }

  const rpcMeta = pikkuState(null, 'rpc', 'meta')
  const pikkuFuncId = rpcMeta[toolName]
  if (!pikkuFuncId) return null

  const fnMeta = pikkuState(null, 'function', 'meta')[pikkuFuncId]
  const schemas = pikkuState(null, 'misc', 'schemas')
  return fnMeta ? { fnMeta, schemas } : null
}

export function computeEntryNodeIds(nodes: Record<string, any>): string[] {
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

export function validateWorkflowWiring(
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

    if (!node.input) continue

    const refs = new Set<string>()
    collectRefs(node.input, refs)

    for (const ref of refs) {
      if (ref === 'trigger' || ref === '$item') {
        const targetMeta = resolveToolMeta(node.rpcName)
        if (targetMeta?.fnMeta?.inputSchemaName) {
          const targetSchema = targetMeta.schemas.get(
            targetMeta.fnMeta.inputSchemaName
          )
          if (targetSchema?.properties) {
            for (const [field, fieldValue] of Object.entries(
              node.input as Record<string, any>
            )) {
              if (
                typeof fieldValue === 'object' &&
                fieldValue !== null &&
                fieldValue.$ref === ref &&
                !fieldValue.path
              ) {
                const targetType = targetSchema.properties[field]?.type
                if (targetType && targetType !== 'object') {
                  errors.push(
                    `Node '${nodeId}' input field '${field}' expects type '${targetType}', but references the whole ${ref} object without a path. Use { $ref: "${ref}", path: "${field}" } to extract the field.`
                  )
                }
              }
            }
          }
        }
        continue
      }

      if (!nodeIds.has(ref)) {
        errors.push(
          `Node '${nodeId}' references unknown node '${ref}' in input`
        )
        continue
      }

      const sourceNode = nodes[ref]
      if (!sourceNode?.rpcName) continue

      const sourceMeta = resolveToolMeta(sourceNode.rpcName)
      if (!sourceMeta?.fnMeta?.outputSchemaName) continue

      const sourceSchema = sourceMeta.schemas.get(
        sourceMeta.fnMeta.outputSchemaName
      )
      if (!sourceSchema?.properties) continue

      for (const [field, fieldValue] of Object.entries(
        node.input as Record<string, any>
      )) {
        if (
          typeof fieldValue === 'object' &&
          fieldValue !== null &&
          fieldValue.$ref === ref &&
          fieldValue.path
        ) {
          const pathRoot = fieldValue.path.split('.')[0]
          if (
            sourceSchema.properties &&
            !(pathRoot in sourceSchema.properties)
          ) {
            errors.push(
              `Node '${nodeId}' input field '${field}' references path '${fieldValue.path}' but node '${ref}' (${sourceNode.rpcName}) output has no property '${pathRoot}'`
            )
            continue
          }

          const targetMeta = resolveToolMeta(node.rpcName)
          if (!targetMeta?.fnMeta?.inputSchemaName) continue
          const targetSchema = targetMeta.schemas.get(
            targetMeta.fnMeta.inputSchemaName
          )
          if (!targetSchema?.properties?.[field]) continue

          const sourceType = sourceSchema.properties[pathRoot]?.type
          const targetType = targetSchema.properties[field].type
          if (sourceType && targetType && sourceType !== targetType) {
            errors.push(
              `Node '${nodeId}' input field '${field}' expects type '${targetType}', but node '${ref}' output field '${pathRoot}' is type '${sourceType}'`
            )
          }
        }
      }
    }
  }

  return errors
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
