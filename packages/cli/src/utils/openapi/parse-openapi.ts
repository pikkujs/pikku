/**
 * Parses OpenAPI YAML/JSON specs, resolves $ref pointers, and produces a normalized IR.
 */
import { readFile } from 'fs/promises'
import { parse as parseYAML } from 'yaml'

import type { OpenAPISchema } from './zod-codegen.js'

export interface ErrorResponse {
  statusCode: number
  description: string
}

export interface SecuritySchemeInfo {
  type: 'oauth2' | 'http' | 'apiKey'
  scheme?: string
  bearerFormat?: string
  name?: string
  in?: string
  flows?: {
    authorizationUrl?: string
    tokenUrl?: string
    scopes?: Record<string, string>
  }
}

export interface ParsedSpec {
  info: { title: string; version: string; description?: string }
  baseUrl: string
  authType: 'bearer' | 'oauth2' | 'apiKey' | 'none'
  operations: ParsedOperation[]
  componentSchemas: Record<string, OpenAPISchema>
  securitySchemes: Record<string, SecuritySchemeInfo>
  tagDescriptions: Record<string, string>
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
  headerParams: ParsedParam[]
  requestBody?: OpenAPISchema
  requestBodyDescription?: string
  requestBodyRequired?: boolean
  responseSchema?: OpenAPISchema
  responseDescription?: string
  errorResponses: ErrorResponse[]
  deprecated: boolean
}

export interface ParsedParam {
  name: string
  required: boolean
  schema: OpenAPISchema
  description?: string
  example?: unknown
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
  const securitySchemes = extractSecuritySchemes(doc)
  const tagDescriptions = extractTagDescriptions(doc)

  // Extract component schemas
  const componentSchemas: Record<string, OpenAPISchema> = {}
  if (doc.components?.schemas) {
    for (const [name, schema] of Object.entries(doc.components.schemas)) {
      componentSchemas[name] = schema as OpenAPISchema
    }
  }

  // Extract operations (skip deprecated)
  const operations: ParsedOperation[] = []
  if (doc.paths) {
    for (const [path, pathItem] of Object.entries(
      doc.paths as Record<string, any>
    )) {
      // Shared parameters at the path level
      const sharedParams: any[] = pathItem.parameters ?? []

      for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
        const op = pathItem[method]
        if (!op) continue

        // Skip deprecated operations
        if (op.deprecated === true) continue

        const allParams: any[] = [...sharedParams, ...(op.parameters ?? [])]

        const body = op.requestBody

        operations.push({
          operationId: op.operationId,
          method,
          path,
          summary: op.summary,
          description: op.description,
          tags: op.tags ?? [],
          pathParams: extractParams(allParams, 'path'),
          queryParams: extractParams(allParams, 'query'),
          headerParams: extractParams(allParams, 'header'),
          requestBody: extractRequestBody(op),
          requestBodyDescription: body?.description,
          requestBodyRequired: body?.required,
          responseSchema: extractResponseSchema(op),
          responseDescription: extractResponseDescription(op),
          errorResponses: extractErrorResponses(op),
          deprecated: false,
        })
      }
    }
  }

  return {
    info,
    baseUrl,
    authType,
    operations,
    componentSchemas,
    securitySchemes,
    tagDescriptions,
  }
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

function extractParams(
  params: any[],
  location: 'path' | 'query' | 'header'
): ParsedParam[] {
  return params
    .filter((p) => p.in === location)
    .map((p) => ({
      name: p.name,
      required: p.required ?? location === 'path',
      schema: (p.schema ?? { type: 'string' }) as OpenAPISchema,
      description: p.description,
      example: p.example,
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

function extractErrorResponses(op: any): ErrorResponse[] {
  const responses = op.responses
  if (!responses) return []

  const errors: ErrorResponse[] = []
  for (const [code, resp] of Object.entries(responses) as [string, any][]) {
    const statusCode = parseInt(code, 10)
    if (isNaN(statusCode)) continue
    if (statusCode >= 400) {
      errors.push({
        statusCode,
        description: resp.description ?? `Error ${statusCode}`,
      })
    }
  }
  return errors
}

function extractSecuritySchemes(doc: any): Record<string, SecuritySchemeInfo> {
  const raw = doc.components?.securitySchemes ?? doc.securityDefinitions ?? {}
  const result: Record<string, SecuritySchemeInfo> = {}

  for (const [name, scheme] of Object.entries(raw) as [string, any][]) {
    const info: SecuritySchemeInfo = {
      type: scheme.type === 'http' ? 'http' : scheme.type,
    }

    if (scheme.type === 'http') {
      info.scheme = scheme.scheme
      info.bearerFormat = scheme.bearerFormat
    }

    if (scheme.type === 'apiKey') {
      info.name = scheme.name
      info.in = scheme.in
    }

    if (scheme.type === 'oauth2') {
      // Extract flows — prefer authorizationCode, then implicit, then clientCredentials
      const flows = scheme.flows ?? {}
      const flow =
        flows.authorizationCode ??
        flows.implicit ??
        flows.clientCredentials ??
        flows.password

      if (flow) {
        info.flows = {
          authorizationUrl: flow.authorizationUrl,
          tokenUrl: flow.tokenUrl,
          scopes: flow.scopes,
        }
      }
    }

    result[name] = info
  }

  return result
}

function extractTagDescriptions(doc: any): Record<string, string> {
  const result: Record<string, string> = {}
  if (Array.isArray(doc.tags)) {
    for (const tag of doc.tags) {
      if (tag.name && tag.description) {
        result[tag.name] = tag.description
      }
    }
  }
  return result
}
