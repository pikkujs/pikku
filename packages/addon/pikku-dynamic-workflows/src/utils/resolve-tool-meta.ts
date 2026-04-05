import { pikkuState } from '@pikku/core/internal'

export function resolveToolMeta(toolName: string): {
  fnMeta: any
  schemas: Map<string, any>
} | null {
  if (toolName.includes(':')) {
    const colonIdx = toolName.indexOf(':')
    const namespace = toolName.substring(0, colonIdx)
    const funcName = toolName.substring(colonIdx + 1)

    const addonsMap = pikkuState(null, 'addons', 'packages')
    let packageName: string | null = null
    for (const [ns, config] of addonsMap) {
      if (ns === namespace) {
        packageName = config.package
        break
      }
    }
    if (!packageName) return null

    const fnMeta = pikkuState(packageName, 'function', 'meta')[funcName]
    const schemas = pikkuState(packageName, 'misc', 'schemas')
    return fnMeta ? { fnMeta, schemas } : null
  }

  const rpcMeta = pikkuState(null, 'rpc', 'meta')
  const pikkuFuncId = rpcMeta[toolName]
  if (!pikkuFuncId) return null

  const fnMeta = pikkuState(null, 'function', 'meta')[pikkuFuncId]
  const schemas = pikkuState(null, 'misc', 'schemas')
  return fnMeta ? { fnMeta, schemas } : null
}

export function formatSchemaType(schema: any, depth = 0): string {
  if (!schema) return 'any'
  if (schema.enum)
    return schema.enum.map((v: any) => JSON.stringify(v)).join(' | ')
  if (schema.type === 'array') {
    const itemType = schema.items
      ? formatSchemaType(schema.items, depth + 1)
      : 'any'
    return `${itemType}[]`
  }
  if (schema.type === 'object' && schema.properties) {
    if (depth > 1) return 'object'
    const fields = Object.entries(schema.properties)
      .map(
        ([k, v]: [string, any]) => `${k}: ${formatSchemaType(v, depth + 1)}`
      )
      .join(', ')
    return `{${fields}}`
  }
  return schema.type || 'any'
}

export function collectOutputPaths(schema: any, prefix = ''): string[] {
  if (!schema?.properties) return []
  const paths: string[] = []
  for (const [key, prop] of Object.entries(schema.properties) as [
    string,
    any,
  ][]) {
    const path = prefix ? `${prefix}.${key}` : key
    if (prop.type === 'object' && prop.properties) {
      paths.push(...collectOutputPaths(prop, path))
    } else {
      paths.push(`${path}: ${prop.type || 'any'}`)
    }
  }
  return paths
}
