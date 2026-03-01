/**
 * Parses OpenAPI YAML/JSON specs, resolves $ref pointers, and produces a normalized IR.
 */
import { readFile } from 'fs/promises'
import { parse as parseYAML } from 'yaml'

import type { OpenAPISchema } from './zod-codegen.js'

export interface ParsedSpec {
  info: { title: string; version: string; description?: string }
  baseUrl: string
  authType: 'bearer' | 'oauth2' | 'apiKey' | 'none'
  operations: ParsedOperation[]
  componentSchemas: Record<string, OpenAPISchema>
}

export interface ParsedOperation {
  operationId?: string
  method: string
  path: string
  summary?: string
  description?: string
  tags: string[]
  pathParams: ParsedParam[]
  queryParams: ParsedParam[]
  requestBody?: OpenAPISchema
  responseSchema?: OpenAPISchema
  responseDescription?: string
}

export interface ParsedParam {
  name: string
  required: boolean
  schema: OpenAPISchema
  description?: string
}

/**
 * Read and parse an OpenAPI spec from a file path.
 * Supports both YAML (.yaml, .yml) and JSON (.json) files.
 */
export async function parseOpenAPISpec(filePath: string): Promise<ParsedSpec> {
  const content = await readFile(filePath, 'utf-8')

  let doc: any
  if (filePath.endsWith('.json')) {
    doc = JSON.parse(content)
  } else {
    doc = parseYAML(content)
  }

  // Resolve all $ref pointers in-place
  resolveRefs(doc, doc)

  const info = {
    title: doc.info?.title ?? 'Unknown API',
    version: doc.info?.version ?? '1.0.0',
    description: doc.info?.description,
  }

  const baseUrl = extractBaseUrl(doc)
  const authType = detectAuthType(doc)

  // Extract component schemas
  const componentSchemas: Record<string, OpenAPISchema> = {}
  if (doc.components?.schemas) {
    for (const [name, schema] of Object.entries(doc.components.schemas)) {
      componentSchemas[name] = schema as OpenAPISchema
    }
  }

  // Extract operations
  const operations: ParsedOperation[] = []
  if (doc.paths) {
    for (const [path, pathItem] of Object.entries(doc.paths as Record<string, any>)) {
      // Shared parameters at the path level
      const sharedParams: any[] = pathItem.parameters ?? []

      for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
        const op = pathItem[method]
        if (!op) continue

        const allParams: any[] = [...sharedParams, ...(op.parameters ?? [])]

        operations.push({
          operationId: op.operationId,
          method,
          path,
          summary: op.summary,
          description: op.description,
          tags: op.tags ?? [],
          pathParams: extractParams(allParams, 'path'),
          queryParams: extractParams(allParams, 'query'),
          requestBody: extractRequestBody(op),
          responseSchema: extractResponseSchema(op),
          responseDescription: extractResponseDescription(op),
        })
      }
    }
  }

  return { info, baseUrl, authType, operations, componentSchemas }
}

/** Recursively resolve $ref pointers in-place */
function resolveRefs(node: any, root: any): any {
  if (node === null || typeof node !== 'object') return node

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      node[i] = resolveRefs(node[i], root)
    }
    return node
  }

  if (typeof node.$ref === 'string') {
    const resolved = resolveRefPath(node.$ref, root)
    if (resolved && typeof resolved === 'object') {
      // Merge any sibling properties (like description overrides)
      const { $ref, ...siblings } = node
      const result = { ...resolved, ...siblings }
      // Don't recurse infinitely — mark as resolved
      return result
    }
    return node
  }

  for (const key of Object.keys(node)) {
    node[key] = resolveRefs(node[key], root)
  }

  return node
}

function resolveRefPath(ref: string, root: any): any {
  if (!ref.startsWith('#/')) return undefined
  const parts = ref.slice(2).split('/')
  let current = root
  for (const part of parts) {
    const decoded = part.replace(/~1/g, '/').replace(/~0/g, '~')
    if (current == null || typeof current !== 'object') return undefined
    current = current[decoded]
  }
  return current
}

function extractBaseUrl(doc: any): string {
  // OpenAPI 3.x
  if (doc.servers && doc.servers.length > 0) {
    return doc.servers[0].url ?? ''
  }
  // Swagger 2.x
  if (doc.host) {
    const scheme = doc.schemes?.[0] ?? 'https'
    const basePath = doc.basePath ?? ''
    return `${scheme}://${doc.host}${basePath}`
  }
  return ''
}

function detectAuthType(doc: any): 'bearer' | 'oauth2' | 'apiKey' | 'none' {
  const securitySchemes =
    doc.components?.securitySchemes ?? doc.securityDefinitions ?? {}

  for (const scheme of Object.values(securitySchemes) as any[]) {
    if (scheme.type === 'oauth2') return 'oauth2'
    if (scheme.type === 'http' && scheme.scheme === 'bearer') return 'bearer'
    if (scheme.type === 'apiKey') return 'apiKey'
  }

  return 'none'
}

function extractParams(params: any[], location: 'path' | 'query'): ParsedParam[] {
  return params
    .filter((p) => p.in === location)
    .map((p) => ({
      name: p.name,
      required: p.required ?? location === 'path',
      schema: (p.schema ?? { type: 'string' }) as OpenAPISchema,
      description: p.description,
    }))
}

function extractRequestBody(op: any): OpenAPISchema | undefined {
  const body = op.requestBody
  if (!body) return undefined

  const content = body.content
  if (!content) return undefined

  // Prefer JSON
  const jsonContent = content['application/json']
  if (jsonContent?.schema) return jsonContent.schema as OpenAPISchema

  // Fallback to first content type
  const firstKey = Object.keys(content)[0]
  if (firstKey && content[firstKey]?.schema) {
    return content[firstKey].schema as OpenAPISchema
  }

  return undefined
}

function extractResponseDescription(op: any): string | undefined {
  const responses = op.responses
  if (!responses) return undefined
  for (const code of ['200', '201', '202']) {
    const resp = responses[code]
    if (resp?.description) return resp.description
  }
  return undefined
}

function extractResponseSchema(op: any): OpenAPISchema | undefined {
  const responses = op.responses
  if (!responses) return undefined

  // Look for 2xx responses in order of preference
  for (const code of ['200', '201', '202', '204']) {
    const resp = responses[code]
    if (!resp) continue

    const content = resp.content
    if (!content) continue

    const jsonContent = content['application/json']
    if (jsonContent?.schema) return jsonContent.schema as OpenAPISchema

    const firstKey = Object.keys(content)[0]
    if (firstKey && content[firstKey]?.schema) {
      return content[firstKey].schema as OpenAPISchema
    }
  }

  // Fallback: any 2xx
  for (const [code, resp] of Object.entries(responses) as [string, any][]) {
    if (code.startsWith('2') && resp.content) {
      const jsonContent = resp.content['application/json']
      if (jsonContent?.schema) return jsonContent.schema as OpenAPISchema
    }
  }

  return undefined
}
