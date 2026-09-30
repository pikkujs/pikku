/**
 * Parses OpenAPI YAML/JSON specs, resolves $ref pointers, and produces a normalized IR.
 */
import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import { parse as parseYAML } from 'yaml'

import type { OpenAPISchema } from './zod-codegen.js'

export interface ErrorResponse {
  statusCode: number
  description: string
}

export interface SecuritySchemeInfo {
  type: 'oauth2' | 'http' | 'apiKey' | 'openIdConnect'
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
  serverUrls: string[]
  authType: AuthType
  operations: ParsedOperation[]
  componentSchemas: Record<string, OpenAPISchema>
  securitySchemes: Record<string, SecuritySchemeInfo>
  tagDescriptions: Record<string, string>
}

export type AuthType = 'bearer' | 'oauth2' | 'apiKey' | 'basic' | 'none'

export interface ParseOptions {
  /** Sent with the request when the spec is fetched from a URL. */
  headers?: Record<string, string>
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
  requestBodyMediaType?: string
  responseSchema?: OpenAPISchema
  responseMediaType?: string
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
 * Read and parse an OpenAPI spec from a file path or an http(s) URL.
 * JSON and YAML are both accepted, whatever the extension.
 */
export async function parseOpenAPISpec(
  source: string,
  options: ParseOptions = {}
): Promise<ParsedSpec> {
  const isUrl = /^https?:\/\//i.test(source)
  const content = isUrl
    ? await fetchSpec(source, options.headers ?? {})
    : await readFile(source, 'utf-8')
  const doc: any = content.trimStart().startsWith('{')
    ? JSON.parse(content)
    : parseYAML(content)

  // Validate spec version
  const specVersion = doc.openapi ?? doc.swagger
  if (!specVersion) {
    throw new Error(
      'Not a valid OpenAPI/Swagger spec: missing "openapi" or "swagger" version field.'
    )
  }
  const major = String(specVersion).split('.')[0]
  if (major !== '2' && major !== '3') {
    throw new Error(
      `Unsupported spec version "${specVersion}". Only OpenAPI 3.x and Swagger 2.x are supported.`
    )
  }

  // Resolve all $ref pointers in-place
  resolveRefs(doc, doc)

  const info = {
    title: doc.info?.title ?? 'Unknown API',
    version: doc.info?.version ?? '1.0.0',
    description: doc.info?.description,
  }

  const serverUrls = extractServerUrls(doc, isUrl ? source : undefined)
  const baseUrl = serverUrls[0] ?? ''
  const authType = detectAuthType(doc)
  const securitySchemes = extractSecuritySchemes(doc)
  const tagDescriptions = extractTagDescriptions(doc)

  // Extract component schemas (OpenAPI 3.x: components.schemas, Swagger 2.x: definitions)
  const componentSchemas: Record<string, OpenAPISchema> = {}
  const rawSchemas = doc.components?.schemas ?? doc.definitions ?? {}
  for (const [name, schema] of Object.entries(rawSchemas)) {
    componentSchemas[name] = schema as OpenAPISchema
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

        // OpenAPI 3.x: op.requestBody, Swagger 2.x: parameters[].in === 'body'
        const body3 = op.requestBody
        const body2 = allParams.find((p: any) => p.in === 'body')
        const body = extractRequestBody(op, allParams, doc)
        const response = extractResponse(op, doc)

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
          requestBody: body?.schema,
          requestBodyMediaType: body?.mediaType,
          requestBodyDescription: body3?.description ?? body2?.description,
          requestBodyRequired:
            body3?.required ?? body2?.required ?? body?.required,
          responseSchema: response?.schema,
          responseMediaType: response?.mediaType,
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
    serverUrls,
    authType,
    operations,
    componentSchemas,
    securitySchemes,
    tagDescriptions,
  }
}

/** Recursively resolve $ref pointers in-place, with cycle detection */
function resolveRefs(node: any, root: any, visited?: Set<any>): any {
  if (node === null || typeof node !== 'object') return node

  const seen = visited ?? new Set<any>()
  if (seen.has(node)) return node
  seen.add(node)

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      node[i] = resolveRefs(node[i], root, seen)
    }
    return node
  }

  if (typeof node.$ref === 'string') {
    const resolved = resolveRefPath(node.$ref, root)
    if (resolved && typeof resolved === 'object') {
      // Merge any sibling properties (like description overrides)
      const { $ref, ...siblings } = node
      const result = { ...resolved, ...siblings }
      // Don't recurse into the merged result — it shares structure with
      // the original resolved object and may be circular
      return result
    }
    return node
  }

  for (const key of Object.keys(node)) {
    node[key] = resolveRefs(node[key], root, seen)
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

async function fetchSpec(
  url: string,
  headers: Record<string, string>
): Promise<string> {
  const response = await fetch(url, { headers })
  if (!response.ok) {
    const hint =
      response.status === 401 || response.status === 403
        ? ' — the spec needs credentials; pass them with --openapi-header "NAME: value"'
        : ''
    throw new Error(
      `Could not fetch the spec from ${url}: HTTP ${response.status}${hint}`
    )
  }
  return response.text()
}

const trimSlash = (url: string) => url.replace(/\/+$/, '')

function resolveServerUrl(server: any, specUrl?: string): string | undefined {
  if (typeof server?.url !== 'string' || !server.url) return undefined
  const url = server.url.replace(
    /\{([^}]+)\}/g,
    (match: string, name: string) => server.variables?.[name]?.default ?? match
  )
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return trimSlash(url)
  if (specUrl) return trimSlash(new URL(url, specUrl).toString())
  return trimSlash(url)
}

function extractServerUrls(doc: any, specUrl?: string): string[] {
  // OpenAPI 3.x
  if (doc.servers && doc.servers.length > 0) {
    return doc.servers
      .map((server: any) => resolveServerUrl(server, specUrl))
      .filter((url: string | undefined): url is string => !!url)
  }
  // Swagger 2.x: host defaults to the one serving the document
  const host = doc.host ?? (specUrl ? new URL(specUrl).host : undefined)
  if (host) {
    const schemes = doc.schemes?.length
      ? doc.schemes
      : specUrl
        ? [new URL(specUrl).protocol.replace(':', '')]
        : ['https']
    const basePath = doc.basePath ?? ''
    return schemes.map((scheme: string) =>
      trimSlash(`${scheme}://${host}${basePath}`)
    )
  }
  return []
}

function detectAuthType(doc: any): AuthType {
  const securitySchemes =
    doc.components?.securitySchemes ?? doc.securityDefinitions ?? {}

  for (const scheme of Object.values(securitySchemes) as any[]) {
    if (scheme.type === 'oauth2') return 'oauth2'
    if (scheme.type === 'http' && scheme.scheme?.toLowerCase() === 'bearer')
      return 'bearer'
    if (scheme.type === 'apiKey') return 'apiKey'
    if (
      scheme.type === 'basic' ||
      (scheme.type === 'http' && scheme.scheme?.toLowerCase() === 'basic')
    )
      return 'basic'
  }

  return 'none'
}

/**
 * Build an OpenAPI schema object from v2-style parameter-level properties
 * (type, enum, items, format, default) that aren't nested under `schema`.
 */
function paramToSchema(p: any): OpenAPISchema {
  const schema: any = { type: p.type ?? 'string' }
  if (p.enum) schema.enum = p.enum
  if (p.items) schema.items = p.items
  if (p.format) schema.format = p.format
  if (p.default !== undefined) schema.default = p.default
  return schema
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
      schema: (p.schema ?? paramToSchema(p)) as OpenAPISchema,
      description: p.description,
      example: p.example,
    }))
}

interface MediaSchema {
  schema: OpenAPISchema
  mediaType: string
  required?: boolean
}

function pickContent(content: any): MediaSchema | undefined {
  if (!content) return undefined
  const mediaTypes = Object.keys(content)
  const mediaType =
    mediaTypes.find(
      (type) => /[/+]json\b/i.test(type) && content[type]?.schema
    ) ?? mediaTypes.find((type) => content[type]?.schema)
  if (!mediaType) return undefined
  return { schema: content[mediaType].schema as OpenAPISchema, mediaType }
}

function extractRequestBody(
  op: any,
  params: any[],
  doc: any
): MediaSchema | undefined {
  // OpenAPI 3.x: op.requestBody.content[<media type>].schema
  const fromContent = pickContent(op.requestBody?.content)
  if (fromContent) return fromContent

  // Swagger 2.x: parameters[].in === 'body' → schema
  const consumes: string[] = op.consumes ?? doc.consumes ?? []
  const bodyParam = params.find((p: any) => p.in === 'body')
  if (bodyParam?.schema) {
    return {
      schema: bodyParam.schema as OpenAPISchema,
      mediaType: consumes[0] ?? 'application/json',
    }
  }

  // Swagger 2.x: parameters[].in === 'formData' → one object body
  const formParams = params.filter((p: any) => p.in === 'formData')
  if (formParams.length > 0) {
    const properties: Record<string, OpenAPISchema> = {}
    const required: string[] = []
    for (const p of formParams) {
      properties[p.name] = {
        ...paramToSchema(p),
        ...(p.description ? { description: p.description } : {}),
      } as OpenAPISchema
      if (p.required) required.push(p.name)
    }
    return {
      schema: { type: 'object', properties, required } as OpenAPISchema,
      mediaType: consumes.includes('multipart/form-data')
        ? 'multipart/form-data'
        : 'application/x-www-form-urlencoded',
      required: required.length > 0,
    }
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

function extractResponse(op: any, doc: any): MediaSchema | undefined {
  const responses = op.responses
  if (!responses) return undefined
  const produces: string[] = op.produces ?? doc.produces ?? []

  const fromResponse = (resp: any): MediaSchema | undefined => {
    if (!resp) return undefined
    const fromContent = pickContent(resp.content)
    if (fromContent) return fromContent
    if (resp.schema) {
      return {
        schema: resp.schema as OpenAPISchema,
        mediaType:
          produces.find((type) => /[/+]json\b/i.test(type)) ??
          produces[0] ??
          'application/json',
      }
    }
    return undefined
  }

  for (const code of ['200', '201', '202', '204']) {
    const found = fromResponse(responses[code])
    if (found) return found
  }
  for (const [code, resp] of Object.entries(responses) as [string, any][]) {
    if (!code.startsWith('2')) continue
    const found = fromResponse(resp)
    if (found) return found
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
      type: scheme.type === 'basic' ? 'http' : scheme.type,
    }

    if (scheme.type === 'basic') {
      info.scheme = 'basic'
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
      const flows =
        scheme.flows ?? (scheme.flow ? { [scheme.flow]: scheme } : {})
      const flow =
        flows.accessCode ??
        flows.authorizationCode ??
        flows.implicit ??
        flows.clientCredentials ??
        flows.application ??
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

/**
 * Compute a SHA-256 hash of the contract-relevant parts of a parsed spec.
 * Excludes presentation fields (summary, description, tags, operationId)
 * so that only structural API changes produce a different hash.
 */
export function computeContractHash(spec: ParsedSpec): string {
  const contract = {
    operations: spec.operations.map((op) => ({
      method: op.method,
      path: op.path,
      pathParams: op.pathParams.map((p) => ({
        name: p.name,
        required: p.required,
        schema: p.schema,
      })),
      queryParams: op.queryParams.map((p) => ({
        name: p.name,
        required: p.required,
        schema: p.schema,
      })),
      headerParams: op.headerParams.map((p) => ({
        name: p.name,
        required: p.required,
        schema: p.schema,
      })),
      requestBody: op.requestBody,
      requestBodyRequired: op.requestBodyRequired,
      responseSchema: op.responseSchema,
      errorResponses: op.errorResponses,
    })),
    componentSchemas: spec.componentSchemas,
    securitySchemes: spec.securitySchemes,
    serverUrls: spec.serverUrls,
  }

  // Use a cycle-safe JSON serializer since resolved $ref schemas
  // can contain circular object references
  const seen = new WeakSet()
  const json = JSON.stringify(contract, (_key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]'
      seen.add(value)
    }
    return value
  })

  return createHash('sha256').update(json).digest('hex').slice(0, 16)
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

export interface OperationFilter {
  tags?: string[]
  include?: string[]
  exclude?: string[]
}

const globToRegExp = (glob: string) =>
  new RegExp(
    `^${glob
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
    'i'
  )

/**
 * `include` / `exclude` patterns match an operationId, a path, or
 * `METHOD /path`, with `*` as a wildcard.
 */
function matchesAny(op: ParsedOperation, patterns: string[]): boolean {
  const candidates = [
    op.operationId ?? '',
    op.path,
    `${op.method.toUpperCase()} ${op.path}`,
  ]
  return patterns
    .map(globToRegExp)
    .some((pattern) => candidates.some((c) => pattern.test(c)))
}

export function filterOperations(
  spec: ParsedSpec,
  filter: OperationFilter
): ParsedSpec {
  const tags = filter.tags?.map((tag) => tag.toLowerCase())
  const operations = spec.operations.filter(
    (op) =>
      (!tags?.length ||
        op.tags.some((tag) => tags.includes(tag.toLowerCase()))) &&
      (!filter.include?.length || matchesAny(op, filter.include)) &&
      !(filter.exclude?.length && matchesAny(op, filter.exclude))
  )
  return { ...spec, operations }
}

const AUTH_ROUTE =
  /(^|\/)(log-?in|log-?out|sign-?in|sign-?out|auth\w*|token|session|oauth2?)(\/|$)/i

/**
 * Specs served by API explorers often hide every authenticated route until
 * the request carries a key, so a spec that is nearly empty — or holds only
 * its own login route — is a sign the real one was never fetched.
 */
export function specCoverageWarning(spec: ParsedSpec): string | undefined {
  const count = spec.operations.length
  const onlyAuth =
    count > 0 && spec.operations.every((op) => AUTH_ROUTE.test(op.path))
  if (count >= 5 && !onlyAuth) return undefined
  const what = onlyAuth
    ? `only authentication routes (${spec.operations.map((op) => `${op.method.toUpperCase()} ${op.path}`).join(', ')})`
    : `only ${count} operation${count === 1 ? '' : 's'}`
  return `The spec has ${what}. Many APIs publish their full spec only to an authenticated request — fetch it again with credentials (--openapi-header "NAME: value", or the key in the URL's query string if the API reads it there) before generating, or the addon will be missing most of the API.`
}

export interface LoginOperation {
  method: string
  path: string
  tokenPath?: string
}

const TOKEN_KEY =
  /^(access_?token|token|id_?token|jwt|api_?key|session_?token)$/i

function findTokenPath(
  schema: any,
  prefix = '',
  depth = 0
): string | undefined {
  if (!schema || typeof schema !== 'object' || depth > 3) return undefined
  for (const [key, prop] of Object.entries<any>(schema.properties ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key
    if (TOKEN_KEY.test(key)) return path
    const nested = findTokenPath(prop, path, depth + 1)
    if (nested) return nested
  }
  return undefined
}

/** A login route that trades credentials for a token, if the spec has one. */
export function detectLoginOperation(
  spec: ParsedSpec
): LoginOperation | undefined {
  const candidates = spec.operations.filter(
    (op) =>
      op.method === 'post' &&
      /(^|\/)(log-?in|sign-?in|auth(enticate)?|token|sessions?)$/i.test(op.path)
  )
  for (const op of candidates) {
    return {
      method: op.method,
      path: op.path,
      tokenPath: findTokenPath(op.responseSchema),
    }
  }
  return undefined
}
