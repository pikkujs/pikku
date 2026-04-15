import type { JSONSchema7 } from 'json-schema'

const schemaTypeToString = (prop: JSONSchema7, required: boolean): string => {
  const types: string[] = []

  if (prop.enum) {
    types.push(prop.enum.map((v) => JSON.stringify(v)).join(' | '))
  } else if (prop.type === 'string') {
    types.push(prop.format ? `string (${prop.format})` : 'string')
  } else if (prop.type === 'number' || prop.type === 'integer') {
    types.push('number')
  } else if (prop.type === 'boolean') {
    types.push('boolean')
  } else if (prop.type === 'array') {
    types.push('[]')
  } else if (prop.type === 'object') {
    types.push('{}')
  } else {
    types.push('unknown')
  }

  if (!required) {
    types.push('undefined')
  }

  return types.join(' | ')
}

const generateExampleBody = (
  schema: JSONSchema7 | null | undefined,
  indent: string
): string | null => {
  if (!schema?.properties) return null

  const requiredSet = new Set(schema.required || [])
  const entries = Object.entries(schema.properties)
    .filter(([, v]) => typeof v === 'object')
    .map(([key, value]) => {
      const prop = value as JSONSchema7
      const isRequired = requiredSet.has(key)
      const typeStr = schemaTypeToString(prop, isRequired)
      return `${indent}  ${key}: /* ${typeStr} */ undefined,`
    })

  if (entries.length === 0) return null
  return `{\n${entries.join('\n')}\n${indent}}`
}

export const generateCurlSnippet = (
  metadata: any,
  inputSchema?: JSONSchema7 | null
): string => {
  const method = (metadata?.method || 'GET').toUpperCase()
  const route = (metadata?.route || '/').replace(/:(\w+)/g, '{$1}')

  const parts = [`curl -X ${method} 'http://localhost:3000${route}'`]

  if (metadata?.auth !== false) {
    parts.push(`  -H 'Authorization: Bearer {token}'`)
  }

  parts.push(`  -H 'Content-Type: application/json'`)

  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const body = generateExampleBody(inputSchema, '  ')
    parts.push(`  -d '${body || '{ }'}'`)
  }

  return parts.join(' \\\n')
}

export const generateFetchSnippet = (
  metadata: any,
  inputSchema?: JSONSchema7 | null
): string => {
  const method = (metadata?.method || 'GET').toUpperCase()
  const route = (metadata?.route || '/').replace(/:(\w+)/g, '{$1}')

  const lines: string[] = [
    `const response = await fetch('http://localhost:3000${route}', {`,
    `  method: '${method}',`,
    `  headers: {`,
  ]

  if (metadata?.auth !== false) {
    lines.push(`    'Authorization': 'Bearer {token}',`)
  }

  lines.push(`    'Content-Type': 'application/json',`)
  lines.push(`  },`)

  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const body = generateExampleBody(inputSchema, '    ')
    lines.push(`  body: JSON.stringify(${body || '{ }'}),`)
  }

  lines.push(`})`)
  lines.push(`const data = await response.json()`)

  return lines.join('\n')
}

export const generatePikkuFetchSnippet = (
  metadata: any,
  inputSchema?: JSONSchema7 | null
): string => {
  const method = (metadata?.method || 'GET').toLowerCase()
  const route = metadata?.route || '/'
  const hasBody = ['post', 'put', 'patch'].includes(method)

  const body = hasBody ? generateExampleBody(inputSchema, '') : null

  const lines: string[] = [
    `import { pikkuFetch } from '.pikku/pikku-fetch.gen'`,
    ``,
    `const result = await pikkuFetch.${method}('${route}'${body ? `, ${body}` : hasBody ? ', { }' : ''})`,
  ]

  return lines.join('\n')
}
