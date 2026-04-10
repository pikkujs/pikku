import { pikkuSessionlessFunc } from '#pikku'
import {
  resolveToolMeta,
  formatSchemaType,
} from '../utils/resolve-tool-meta.js'

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

function getFunctionSchema(rpcName: string): {
  input: { properties: Record<string, any>; required: string[] } | null
  output: { properties: Record<string, any> } | null
} {
  const resolved = resolveToolMeta(rpcName)
  if (!resolved) return { input: null, output: null }
  const { fnMeta, schemas } = resolved

  let input: { properties: Record<string, any>; required: string[] } | null =
    null
  if (fnMeta.inputSchemaName) {
    const schema = schemas.get(fnMeta.inputSchemaName)
    if (schema?.properties) {
      input = { properties: schema.properties, required: schema.required ?? [] }
    }
  }

  let output: { properties: Record<string, any> } | null = null
  if (fnMeta.outputSchemaName) {
    const schema = schemas.get(fnMeta.outputSchemaName)
    if (schema?.properties) {
      output = { properties: schema.properties }
    }
  }

  return { input, output }
}

function getSourceOutputType(
  ref: string,
  path: string,
  nodes: Record<string, any>
): string | null {
  if (ref === 'trigger') return null
  const sourceNode = nodes[ref]
  if (!sourceNode?.rpcName) return null
  const { output } = getFunctionSchema(sourceNode.rpcName)
  if (!output?.properties) return null
  const prop = output.properties[path]
  return prop?.type ?? null
}

function isTypeCompatible(sourceType: string, targetType: string): boolean {
  if (sourceType === targetType) return true
  if (targetType === 'string') return false
  if (targetType === 'number' && sourceType === 'integer') return true
  return false
}

function validateInputWiring(
  nodeId: string,
  node: any,
  allNodeIds: Set<string>,
  nodes: Record<string, any>
): string[] {
  const errors: string[] = []
  const rpcName = node.rpcName
  const { input: inputSchema } = getFunctionSchema(rpcName)
  if (!inputSchema) return errors

  const { properties, required } = inputSchema
  const nodeInput = node.input ?? {}

  for (const field of required) {
    if (!(field in nodeInput)) {
      const fieldType = formatSchemaType(properties[field])
      errors.push(
        `Node '${nodeId}' (${rpcName}): missing required input field '${field}' (type: ${fieldType}). ` +
          `Add it as a static value or wire it with {"$ref": "trigger"|"<nodeId>", "path": "<field>"}.`
      )
    }
  }

  for (const [field, value] of Object.entries(nodeInput)) {
    if (!(field in properties)) {
      errors.push(
        `Node '${nodeId}' (${rpcName}): input field '${field}' does not exist on this function. ` +
          `Available fields: ${Object.keys(properties).join(', ')}.`
      )
      continue
    }

    if (
      value &&
      typeof value === 'object' &&
      '$ref' in (value as Record<string, unknown>)
    ) {
      const ref = (value as any).$ref
      const path = (value as any).path
      if (ref !== 'trigger' && !allNodeIds.has(ref)) {
        errors.push(
          `Node '${nodeId}' (${rpcName}): input '${field}' references unknown source '${ref}'. ` +
            `Use "trigger" for workflow input or a valid node ID: ${[...allNodeIds].join(', ')}.`
        )
        continue
      }
      if (!path) {
        errors.push(
          `Node '${nodeId}' (${rpcName}): input '${field}' has a $ref but is missing 'path'. ` +
            `Specify which output field to extract, e.g. {"$ref": "${ref}", "path": "fieldName"}.`
        )
        continue
      }

      if (ref !== 'trigger') {
        const sourceNode = nodes[ref]
        if (sourceNode?.rpcName) {
          const { output: sourceOutput } = getFunctionSchema(sourceNode.rpcName)
          if (sourceOutput?.properties && !(path in sourceOutput.properties)) {
            errors.push(
              `Node '${nodeId}' (${rpcName}): input '${field}' wires from ${ref}.${path}, but '${sourceNode.rpcName}' does not output '${path}'. ` +
                `Available output fields: ${Object.keys(sourceOutput.properties).join(', ')}.`
            )
            continue
          }

          const sourceType = getSourceOutputType(ref, path, nodes)
          const targetType = properties[field]?.type
          if (
            sourceType &&
            targetType &&
            !isTypeCompatible(sourceType, targetType)
          ) {
            errors.push(
              `Node '${nodeId}' (${rpcName}): input '${field}' expects type '${targetType}' but ${ref}.${path} outputs type '${sourceType}'. ` +
                `Either use a different source field or add a conversion step.`
            )
          }
        }
      }
    }
  }

  return errors
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
      errors.push(`Node '${nodeId}' is missing 'rpcName'.`)
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

    errors.push(...validateInputWiring(nodeId, node, nodeIds, nodes))
  }

  return errors
}

export const validateDynamicWorkflow = pikkuSessionlessFunc<
  { nodes: Record<string, any>; functionNames: string[] },
  { valid: boolean; errors: string[]; entryNodeIds: string[] }
>({
  description:
    'Validates a workflow graph for structural correctness and input schema compliance',
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
