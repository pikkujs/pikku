/**
 * Generates addon files from a parsed OpenAPI spec.
 * Returns Record<string, string> compatible with getAddonFiles output.
 */
import type {
  ParsedSpec,
  ParsedOperation,
  ErrorResponse,
} from './parse-openapi.js'
import {
  schemaToZod,
  schemaVarName,
  sanitizeTypeName,
  createContext,
  type ZodCodegenContext,
} from './zod-codegen.js'
import {
  generateOperationNames,
  detectCommonPrefix,
  type NamedOperation,
} from './naming.js'

interface AddonVars {
  name: string
  camelName: string
  pascalName: string
  screamingName: string
  displayName: string
  description: string
}

interface CodegenFlags {
  oauth: boolean
  secret: boolean
  mcp?: boolean
}

function safeKey(key: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key)
}

const GENERIC_SUMMARIES = new Set([
  'index',
  'show',
  'create',
  'update',
  'destroy',
  'delete',
  'list',
])

/** Map from HTTP status code to pikku error class name */
const STATUS_TO_ERROR: Record<number, string> = {
  400: 'BadRequestError',
  401: 'UnauthorizedError',
  403: 'ForbiddenError',
  404: 'NotFoundError',
  405: 'MethodNotAllowedError',
  409: 'ConflictError',
  422: 'UnprocessableContentError',
  429: 'TooManyRequestsError',
  500: 'InternalServerError',
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function humanDescription(parsed: ParsedOperation): string | undefined {
  const description = parsed.description?.trim()
  if (description && !GENERIC_SUMMARIES.has(description.toLowerCase())) {
    return capitalize(description)
  }
  return undefined
}

function getErrorClassesForResponses(
  errorResponses: ErrorResponse[]
): string[] {
  const classes: string[] = []
  for (const err of errorResponses) {
    const cls = STATUS_TO_ERROR[err.statusCode]
    if (cls && !classes.includes(cls)) {
      classes.push(cls)
    }
  }
  return classes
}

export function generateAddonFromOpenAPI(
  spec: ParsedSpec,
  vars: AddonVars,
  flags: CodegenFlags
): Record<string, string> {
  const files: Record<string, string> = {}
  const { name } = vars

  // Build context for Zod codegen with component schema refs
  const schemaRefs = new Map<string, string>()
  for (const schemaName of Object.keys(spec.componentSchemas)) {
    schemaRefs.set(schemaName, schemaVarName(schemaName))
  }
  const ctx = createContext(schemaRefs)

  // Generate operation names
  const paths = spec.operations.map((op) => op.path)
  const commonPrefix = detectCommonPrefix(paths)
  const namedOps = generateOperationNames(
    spec.operations.map((op) => ({
      method: op.method,
      path: op.path,
      operationId: op.operationId,
    })),
    commonPrefix
  )

  // Pair named operations with their parsed data
  const opPairs: Array<{ named: NamedOperation; parsed: ParsedOperation }> =
    namedOps.map((named, i) => ({ named, parsed: spec.operations[i] }))

  // Generate types file with shared schemas (only if there are any)
  if (Object.keys(spec.componentSchemas).length > 0) {
    files[`src/${name}.types.ts`] = generateTypesFile(spec, ctx)
  }

  // Generate function files
  const functionExports: string[] = []
  for (const { named, parsed } of opPairs) {
    const funcCtx = createContext(schemaRefs)
    const funcCode = generateFunctionFile(
      named,
      parsed,
      vars,
      funcCtx,
      spec,
      flags
    )
    files[`src/functions/${named.functionName}.function.ts`] = funcCode
    functionExports.push(named.functionName)
  }

  // Generate index.ts with all exports
  files['src/index.ts'] = generateIndexFile(functionExports)

  // Generate typed API service class with route map
  files[`src/${name}-api.service.ts`] = generateServiceFile(
    spec,
    opPairs,
    vars,
    flags
  )

  // Generate variable file for BASE_URL
  files[`src/${name}.variable.ts`] = generateVariableFile(spec, vars)

  return files
}

function generateTypesFile(spec: ParsedSpec, ctx: ZodCodegenContext): string {
  const lines: string[] = []
  lines.push("import { z } from 'zod'")
  lines.push('')
  lines.push(`// Shared schemas from ${spec.info.title} v${spec.info.version}`)
  lines.push('')

  for (const [name, schema] of Object.entries(spec.componentSchemas)) {
    const varName = schemaVarName(name)
    const zodCode = schemaToZod(schema, ctx)
    lines.push(`export const ${varName} = ${zodCode}`)
    lines.push(
      `export type ${sanitizeTypeName(name)} = z.infer<typeof ${varName}>`
    )
    lines.push('')
  }

  return lines.join('\n')
}

function generateFunctionFile(
  named: NamedOperation,
  parsed: ParsedOperation,
  vars: AddonVars,
  ctx: ZodCodegenContext,
  spec: ParsedSpec,
  flags: CodegenFlags
): string {
  const lines: string[] = []
  const { camelName } = vars

  // Tag description as file header
  if (parsed.tags.length > 0) {
    const tag = parsed.tags[0]
    const tagDesc = spec.tagDescriptions[tag]
    if (tagDesc) {
      lines.push(`// ${tag} — ${tagDesc}`)
      lines.push('')
    }
  }

  const hasInput =
    parsed.pathParams.length > 0 ||
    parsed.queryParams.length > 0 ||
    parsed.headerParams.length > 0 ||
    parsed.requestBody

  const pascalName =
    named.functionName.charAt(0).toUpperCase() + named.functionName.slice(1)
  const inputName = `${pascalName}Input`
  const outputName = `${pascalName}Output`

  // Determine error imports needed
  const errorClasses = getErrorClassesForResponses(parsed.errorResponses)

  const needsZod = hasInput || !!parsed.responseSchema
  if (needsZod) {
    lines.push("import { z } from 'zod'")
  }
  lines.push("import { pikkuSessionlessFunc } from '#pikku'")

  if (errorClasses.length > 0) {
    lines.push(
      `import { ${errorClasses.join(', ')} } from '@pikku/core/errors'`
    )
  }

  lines.push('')

  // Build Input schema (exported for pikku schema discovery)
  if (hasInput) {
    const inputCode = buildInputSchema(parsed, ctx)
    lines.push(`export const ${inputName} = ${inputCode}`)
    lines.push('')
  }

  // Build Output schema (exported for pikku schema discovery)
  if (parsed.responseSchema) {
    const outputCode = buildOutputSchema(parsed.responseSchema, ctx)
    lines.push(`export const ${outputName} = ${outputCode}`)
    lines.push('')
  }

  const description = humanDescription(parsed)
  const method = parsed.method.toUpperCase()

  const funcConfig: string[] = []
  if (description) {
    funcConfig.push(`  description: ${JSON.stringify(description)},`)
  }
  if (hasInput) funcConfig.push(`  input: ${inputName},`)
  if (parsed.responseSchema) {
    funcConfig.push(`  output: ${outputName},`)
  }

  if (errorClasses.length > 0) {
    funcConfig.push(`  errors: [${errorClasses.join(', ')}],`)
  }

  if (flags.mcp) {
    funcConfig.push('  mcp: true,')
  }

  const funcParams = hasInput ? `{ ${camelName} }, data` : `{ ${camelName} }`

  const returnCast = parsed.responseSchema ? ' as any' : ''
  funcConfig.push(
    `  func: async (${funcParams}) => {`,
    `    return ${camelName}.call(${JSON.stringify(method)}, ${JSON.stringify(parsed.path)}${hasInput ? ', data' : ''})${returnCast}`,
    '  },'
  )

  lines.push(`export const ${named.functionName} = pikkuSessionlessFunc({`)
  lines.push(funcConfig.join('\n'))
  lines.push('})')
  lines.push('')

  return lines.join('\n')
}

function buildInputSchema(
  parsed: ParsedOperation,
  ctx: ZodCodegenContext
): string {
  const props: string[] = []

  for (const param of parsed.pathParams) {
    props.push(formatParamProp(param, ctx))
  }

  for (const param of parsed.queryParams) {
    props.push(formatParamProp(param, ctx))
  }

  for (const param of parsed.headerParams) {
    props.push(formatParamProp(param, ctx))
  }

  if (parsed.requestBody) {
    if (parsed.requestBody.properties) {
      const requiredSet = new Set(parsed.requestBody.required ?? [])
      for (const [key, propSchema] of Object.entries(
        parsed.requestBody.properties
      )) {
        // Skip readOnly properties from input
        if (propSchema.readOnly) continue
        const isOptional = !requiredSet.has(key)
        const zodCode = schemaToZod(propSchema, ctx, { optional: isOptional })
        props.push(`  ${safeKey(key)}: ${zodCode},`)
      }
    } else {
      const bodyZod = schemaToZod(parsed.requestBody, ctx)
      props.push(`  body: ${bodyZod},`)
    }
  }

  return `z.object({\n${props.join('\n')}\n})`
}

function formatParamProp(
  param: {
    name: string
    required: boolean
    schema: any
    description?: string
    example?: unknown
  },
  ctx: ZodCodegenContext
): string {
  const zodCode = schemaToZod(param.schema, ctx, { optional: !param.required })

  let descParts: string[] = []
  if (param.description) descParts.push(param.description)
  if (param.example !== undefined)
    descParts.push(`Example: ${JSON.stringify(param.example)}`)

  const desc =
    descParts.length > 0
      ? `${zodCode}.describe(${JSON.stringify(descParts.join('. '))})`
      : zodCode

  return `  ${safeKey(param.name)}: ${desc},`
}

function buildOutputSchema(schema: any, ctx: ZodCodegenContext): string {
  // For output schemas, filter out writeOnly properties
  if (schema.properties) {
    const filteredProps: Record<string, any> = {}
    for (const [key, propSchema] of Object.entries(schema.properties) as [
      string,
      any,
    ][]) {
      if (!propSchema.writeOnly) {
        filteredProps[key] = propSchema
      }
    }
    const filteredSchema = { ...schema, properties: filteredProps }
    return schemaToZod(filteredSchema, ctx)
  }
  return schemaToZod(schema, ctx)
}

function generateIndexFile(functionExports: string[]): string {
  const lines: string[] = []
  for (const name of functionExports) {
    lines.push(`export { ${name} } from './functions/${name}.function.js'`)
  }
  lines.push('')
  return lines.join('\n')
}

interface RouteInfo {
  path: string[]
  query: string[]
  headers: string[]
  errors?: Record<number, string>
}

function generateServiceFile(
  spec: ParsedSpec,
  opPairs: Array<{ named: NamedOperation; parsed: ParsedOperation }>,
  vars: AddonVars,
  flags: CodegenFlags
): string {
  const { name, pascalName, screamingName, displayName } = vars
  const lines: string[] = []

  // Always import all error classes used in the switch statement
  const allErrorClasses = new Set<string>(Object.values(STATUS_TO_ERROR))

  if (flags.oauth) {
    lines.push("import { OAuth2Client } from '@pikku/core/oauth2'")
    lines.push(
      "import type { TypedSecretService } from '#pikku/secrets/pikku-secrets.gen.js'"
    )
  } else if (flags.secret) {
    lines.push(
      `import type { ${pascalName}Secrets } from './${name}.secret.js'`
    )
  }

  if (allErrorClasses.size > 0) {
    lines.push(
      `import { ${[...allErrorClasses].sort().join(', ')} } from '@pikku/core/errors'`
    )
  }

  lines.push(
    `import type { TypedVariablesService } from '#pikku/variables/pikku-variables.gen.js'`
  )
  lines.push('')

  if (flags.oauth) {
    // Use OAuth2 details from spec if available
    const oauthScheme = Object.values(spec.securitySchemes).find(
      (s) => s.type === 'oauth2'
    )
    const authUrl =
      oauthScheme?.flows?.authorizationUrl ??
      'https://example.com/oauth2/authorize'
    const tokenUrl =
      oauthScheme?.flows?.tokenUrl ?? 'https://example.com/oauth2/token'
    const scopes = oauthScheme?.flows?.scopes
      ? Object.keys(oauthScheme.flows.scopes)
      : ['read', 'write']

    lines.push(`export const ${screamingName}_OAUTH2_CONFIG = {`)
    lines.push(`  tokenSecretId: '${screamingName}_TOKENS',`)
    lines.push(`  authorizationUrl: ${JSON.stringify(authUrl)},`)
    lines.push(`  tokenUrl: ${JSON.stringify(tokenUrl)},`)
    lines.push(`  scopes: ${JSON.stringify(scopes)},`)
    lines.push('}')
    lines.push('')
  }

  // Generate route map from parsed operations
  const routes: Record<string, RouteInfo> = {}
  for (const { parsed } of opPairs) {
    const key = `${parsed.method.toUpperCase()} ${parsed.path}`
    const route: RouteInfo = {
      path: parsed.pathParams.map((p) => p.name),
      query: parsed.queryParams.map((p) => p.name),
      headers: parsed.headerParams.map((p) => p.name),
    }
    if (parsed.errorResponses.length > 0) {
      route.errors = {}
      for (const err of parsed.errorResponses) {
        route.errors[err.statusCode] = err.description
      }
    }
    routes[key] = route
  }

  lines.push(
    `const ROUTES: Record<string, { path: string[], query: string[], headers: string[], errors?: Record<number, string> }> = ${JSON.stringify(routes, null, 2)}`
  )
  lines.push('')

  // Class declaration
  lines.push(`export class ${pascalName}Service {`)
  lines.push('  private baseUrl: string')

  if (flags.oauth) {
    lines.push('  private oauth: OAuth2Client')
    lines.push('')
    lines.push(
      `  constructor(secrets: TypedSecretService, variables: TypedVariablesService) {`
    )
    lines.push(
      `    this.baseUrl = variables.get('${screamingName}_BASE_URL') as string`
    )
    lines.push('    this.oauth = new OAuth2Client(')
    lines.push(`      ${screamingName}_OAUTH2_CONFIG,`)
    lines.push(`      '${screamingName}_APP_CREDENTIALS',`)
    lines.push('      secrets')
    lines.push('    )')
    lines.push('  }')
  } else if (flags.secret) {
    lines.push('')
    lines.push(
      `  constructor(private creds: ${pascalName}Secrets, variables: TypedVariablesService) {`
    )
    lines.push(
      `    this.baseUrl = variables.get('${screamingName}_BASE_URL') as string`
    )
    lines.push('  }')
  } else {
    lines.push('')
    lines.push(`  constructor(variables: TypedVariablesService) {`)
    lines.push(
      `    this.baseUrl = variables.get('${screamingName}_BASE_URL') as string`
    )
    lines.push('  }')
  }

  lines.push('')

  // call() method — splits data into path/query/headers/body using route map
  lines.push('  async call<T>(')
  lines.push("    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',")
  lines.push('    path: string,')
  lines.push('    data?: Record<string, unknown>')
  lines.push('  ): Promise<T> {')
  lines.push('    const route = ROUTES[`${method} ${path}`]')
  lines.push('    let endpoint = path')
  lines.push('    let body: Record<string, unknown> | undefined')
  lines.push('    const query: Record<string, string> = {}')
  lines.push('    const headers: Record<string, string> = {')
  lines.push("      'Content-Type': 'application/json',")
  lines.push('    }')
  lines.push('')
  lines.push('    if (data && route) {')
  lines.push('      // Interpolate path params')
  lines.push('      for (const param of route.path) {')
  lines.push('        if (data[param] !== undefined) {')
  lines.push(
    '          endpoint = endpoint.replace(`{${param}}`, String(data[param]))'
  )
  lines.push('        }')
  lines.push('      }')
  lines.push('      // Extract query params')
  lines.push('      for (const param of route.query) {')
  lines.push('        if (data[param] !== undefined) {')
  lines.push('          query[param] = String(data[param])')
  lines.push('        }')
  lines.push('      }')
  lines.push('      // Extract header params')
  lines.push('      for (const param of route.headers) {')
  lines.push('        if (data[param] !== undefined) {')
  lines.push('          headers[param] = String(data[param])')
  lines.push('        }')
  lines.push('      }')
  lines.push('      // Everything else goes into body')
  lines.push(
    '      const pathQueryHeaders = new Set([...route.path, ...route.query, ...route.headers])'
  )
  lines.push('      const remaining = Object.fromEntries(')
  lines.push(
    '        Object.entries(data).filter(([k]) => !pathQueryHeaders.has(k))'
  )
  lines.push('      )')
  lines.push('      if (Object.keys(remaining).length > 0) {')
  lines.push('        body = remaining')
  lines.push('      }')
  lines.push('    }')
  lines.push('')
  lines.push('    const url = new URL(`${this.baseUrl}${endpoint}`)')
  lines.push('    for (const [key, value] of Object.entries(query)) {')
  lines.push('      url.searchParams.set(key, value)')
  lines.push('    }')
  lines.push('')

  if (flags.oauth) {
    lines.push(
      '    const response = await this.oauth.request(url.toString(), {'
    )
    lines.push('      method,')
    lines.push('      headers,')
    lines.push('      body: body ? JSON.stringify(body) : undefined,')
    lines.push('    })')
  } else if (flags.secret) {
    // Use apiKey details from spec if available
    const apiKeyScheme = Object.values(spec.securitySchemes).find(
      (s) => s.type === 'apiKey'
    )
    if (apiKeyScheme?.name && apiKeyScheme?.in === 'header') {
      lines.push(
        `    headers[${JSON.stringify(apiKeyScheme.name)}] = this.creds.apiKey`
      )
    } else {
      lines.push('    headers.Authorization = `Bearer ${this.creds.apiKey}`')
    }
    lines.push('')
    lines.push('    const response = await fetch(url.toString(), {')
    lines.push('      method,')
    lines.push('      headers,')
    lines.push('      body: body ? JSON.stringify(body) : undefined,')
    lines.push('    })')
  } else {
    lines.push('    const response = await fetch(url.toString(), {')
    lines.push('      method,')
    lines.push('      headers,')
    lines.push('      body: body ? JSON.stringify(body) : undefined,')
    lines.push('    })')
  }

  lines.push('')
  lines.push('    if (!response.ok) {')
  lines.push('      const errorText = await response.text()')
  lines.push(
    '      const errorMessage = route?.errors?.[response.status] ?? errorText'
  )
  lines.push('      switch (response.status) {')
  lines.push('        case 400: throw new BadRequestError(errorMessage)')
  lines.push('        case 401: throw new UnauthorizedError(errorMessage)')
  lines.push('        case 403: throw new ForbiddenError(errorMessage)')
  lines.push('        case 404: throw new NotFoundError(errorMessage)')
  lines.push('        case 405: throw new MethodNotAllowedError(errorMessage)')
  lines.push('        case 409: throw new ConflictError(errorMessage)')
  lines.push(
    '        case 422: throw new UnprocessableContentError(errorMessage)'
  )
  lines.push('        case 429: throw new TooManyRequestsError(errorMessage)')
  lines.push('        case 500: throw new InternalServerError(errorMessage)')
  lines.push(
    `        default: throw new Error(\`${displayName} API error (\${response.status}): \${errorText}\`)`
  )
  lines.push('      }')
  lines.push('    }')
  lines.push('')
  lines.push('    const text = await response.text()')
  lines.push('    if (!text) return {} as T')
  lines.push('    return JSON.parse(text) as T')
  lines.push('  }')

  lines.push('}')
  lines.push('')

  return lines.join('\n')
}

function generateVariableFile(spec: ParsedSpec, vars: AddonVars): string {
  const { camelName, screamingName, displayName } = vars
  const serverUrls = spec.serverUrls.length > 0 ? spec.serverUrls : []
  const defaultUrl = serverUrls[0]

  const lines: string[] = []
  lines.push("import { z } from 'zod'")
  lines.push("import { wireVariable } from '@pikku/core/variable'")
  lines.push('')

  const schemaVarName = `${camelName}BaseUrlSchema`

  const urlsLiteral = serverUrls.map((u) => JSON.stringify(u)).join(', ')
  lines.push(
    `export const ${schemaVarName} = z.enum([${urlsLiteral}]).default(${JSON.stringify(defaultUrl)})`
  )

  lines.push('')
  lines.push(`wireVariable({`)
  lines.push(`  name: '${screamingName}_BASE_URL',`)
  lines.push(`  displayName: '${displayName} Base URL',`)
  lines.push(`  description: 'The base URL for the ${displayName} API.',`)
  lines.push(`  variableId: '${screamingName}_BASE_URL',`)
  lines.push(`  schema: ${schemaVarName},`)
  lines.push(`})`)
  lines.push('')

  return lines.join('\n')
}
