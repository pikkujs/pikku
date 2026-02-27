export const generateCurlSnippet = (metadata: any): string => {
  const method = (metadata?.method || 'GET').toUpperCase()
  const route = (metadata?.route || '/').replace(/:(\w+)/g, '{$1}')

  const parts = [`curl -X ${method} 'http://localhost:3000${route}'`]

  if (metadata?.auth !== false) {
    parts.push(`  -H 'Authorization: Bearer {token}'`)
  }

  parts.push(`  -H 'Content-Type: application/json'`)

  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    parts.push(`  -d '{ }'`)
  }

  return parts.join(' \\\n')
}

export const generateFetchSnippet = (metadata: any): string => {
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
    lines.push(`  body: JSON.stringify({ }),`)
  }

  lines.push(`})`)
  lines.push(`const data = await response.json()`)

  return lines.join('\n')
}

export const generatePikkuFetchSnippet = (metadata: any): string => {
  const funcId = metadata?.pikkuFuncId || 'myFunction'
  const method = (metadata?.method || 'GET').toUpperCase()
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method)

  const lines: string[] = [
    `import { createPikkuFetch } from '.pikku/pikku-fetch.gen'`,
    ``,
    `const api = createPikkuFetch('http://localhost:3000')`,
    `const result = await api.${funcId}(${hasBody ? '{ }' : ''})`,
  ]

  return lines.join('\n')
}
