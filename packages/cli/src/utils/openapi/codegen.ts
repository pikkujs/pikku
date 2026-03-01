/**
 * Generates addon files from a parsed OpenAPI spec.
 * Returns Record<string, string> compatible with getAddonFiles output.
 */
import type { ParsedSpec, ParsedOperation } from './parse-openapi.js'
import {
  schemaToZod,
  schemaVarName,
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
}

const GENERIC_SUMMARIES = new Set([
  'index', 'show', 'create', 'update', 'destroy', 'delete', 'list',
])

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function humanDescription(named: NamedOperation, parsed: ParsedOperation): string {
  if (parsed.responseDescription) {
    return capitalize(parsed.responseDescription)
  }
  const summary = parsed.summary?.trim()
  if (summary && !GENERIC_SUMMARIES.has(summary.toLowerCase())) {
    return capitalize(summary)
  }
  if (parsed.description && !GENERIC_SUMMARIES.has(parsed.description.trim().toLowerCase())) {
    return capitalize(parsed.description.trim())
  }
  const words = named.functionName
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .toLowerCase()
  return capitalize(words)
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
  const opPairs: Array<{ named: NamedOperation; parsed: ParsedOperation }> = namedOps.map(
    (named, i) => ({ named, parsed: spec.operations[i] })
  )

  // Generate types file with shared schemas (only if there are any)
  if (Object.keys(spec.componentSchemas).length > 0) {
    files[`src/${name}.types.ts`] = generateTypesFile(spec, ctx)
  }

  // Generate function files
  const functionExports: string[] = []
  for (const { named, parsed } of opPairs) {
    const funcCtx = createContext(schemaRefs)
    const funcCode = generateFunctionFile(named, parsed, vars, funcCtx)
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

  return files
}

function generateTypesFile(
  spec: ParsedSpec,
  ctx: ZodCodegenContext
): string {
  const lines: string[] = []
  lines.push("import { z } from 'zod'")
  lines.push('')
  lines.push(`// Shared schemas from ${spec.info.title} v${spec.info.version}`)
  lines.push('')

  for (const [name, schema] of Object.entries(spec.componentSchemas)) {
    const varName = schemaVarName(name)
    const zodCode = schemaToZod(schema, ctx)
    lines.push(`export const ${varName} = ${zodCode}`)
    lines.push(`export type ${name} = z.infer<typeof ${varName}>`)
    lines.push('')
  }

  return lines.join('\n')
}

function generateFunctionFile(
  named: NamedOperation,
  parsed: ParsedOperation,
  vars: AddonVars,
  ctx: ZodCodegenContext,
): string {
  const lines: string[] = []
  const { camelName } = vars
  const hasInput =
    parsed.pathParams.length > 0 ||
    parsed.queryParams.length > 0 ||
    parsed.requestBody

  const pascalName = named.functionName.charAt(0).toUpperCase() + named.functionName.slice(1)
  const inputName = `${pascalName}Input`
  const outputName = `${pascalName}Output`

  lines.push("import { z } from 'zod'")
  lines.push("import { pikkuSessionlessFunc } from '#pikku'")
  lines.push('')

  // Build Input schema (exported for pikku schema discovery)
  if (hasInput) {
    const inputCode = buildInputSchema(parsed, ctx)
    lines.push(`export const ${inputName} = ${inputCode}`)
    lines.push('')
  }

  // Build Output schema (exported for pikku schema discovery)
  if (parsed.responseSchema) {
    const outputCode = schemaToZod(parsed.responseSchema, ctx)
    lines.push(`export const ${outputName} = ${outputCode}`)
    lines.push('')
  }

  const description = humanDescription(named, parsed)
  const method = parsed.method.toUpperCase()

  const funcConfig: string[] = []
  funcConfig.push(`  description: ${JSON.stringify(description)},`)
  if (hasInput) funcConfig.push(`  input: ${inputName},`)
  if (parsed.responseSchema) funcConfig.push(`  output: ${outputName},`)

  const funcParams = hasInput
    ? `{ ${camelName} }, data`
    : `{ ${camelName} }`

  const returnCast = parsed.responseSchema ? ' as any' : ''
  funcConfig.push(
    `  func: async (${funcParams}) => {`,
    `    return ${camelName}.call('${method}', '${parsed.path}'${hasInput ? ', data' : ''})${returnCast}`,
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
    const zodCode = schemaToZod(param.schema, ctx, { optional: !param.required })
    const desc = param.description
      ? `${zodCode}.describe(${JSON.stringify(param.description)})`
      : zodCode
    props.push(`  ${param.name}: ${desc},`)
  }

  for (const param of parsed.queryParams) {
    const zodCode = schemaToZod(param.schema, ctx, { optional: !param.required })
    const desc = param.description
      ? `${zodCode}.describe(${JSON.stringify(param.description)})`
      : zodCode
    props.push(`  ${param.name}: ${desc},`)
  }

  if (parsed.requestBody) {
    if (parsed.requestBody.properties) {
      const requiredSet = new Set(parsed.requestBody.required ?? [])
      for (const [key, propSchema] of Object.entries(parsed.requestBody.properties)) {
        const isOptional = !requiredSet.has(key)
        const zodCode = schemaToZod(propSchema, ctx, { optional: isOptional })
        props.push(`  ${key}: ${zodCode},`)
      }
    } else {
      const bodyZod = schemaToZod(parsed.requestBody, ctx)
      props.push(`  body: ${bodyZod},`)
    }
  }

  return `z.object({\n${props.join('\n')}\n})`
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
}

function generateServiceFile(
  spec: ParsedSpec,
  opPairs: Array<{ named: NamedOperation; parsed: ParsedOperation }>,
  vars: AddonVars,
  flags: CodegenFlags
): string {
  const { name, pascalName, screamingName, displayName } = vars
  const lines: string[] = []

  const baseUrl = spec.baseUrl || 'https://api.example.com'

  if (flags.oauth) {
    lines.push("import { OAuth2Client } from '@pikku/core/oauth2'")
    lines.push("import type { TypedSecretService } from '#pikku/secrets/pikku-secrets.gen.js'")
  } else if (flags.secret) {
    lines.push(`import type { ${pascalName}Secrets } from './${name}.secret.js'`)
  }

  lines.push('')
  lines.push(`const BASE_URL = ${JSON.stringify(baseUrl)}`)
  lines.push('')

  if (flags.oauth) {
    lines.push(`export const ${screamingName}_OAUTH2_CONFIG = {`)
    lines.push(`  tokenSecretId: '${screamingName}_TOKENS',`)
    lines.push(`  authorizationUrl: 'https://example.com/oauth2/authorize',`)
    lines.push(`  tokenUrl: 'https://example.com/oauth2/token',`)
    lines.push("  scopes: ['read', 'write'],")
    lines.push('}')
    lines.push('')
  }

  // Generate route map from parsed operations
  const routes: Record<string, RouteInfo> = {}
  for (const { parsed } of opPairs) {
    const key = `${parsed.method.toUpperCase()} ${parsed.path}`
    routes[key] = {
      path: parsed.pathParams.map((p) => p.name),
      query: parsed.queryParams.map((p) => p.name),
    }
  }

  lines.push(`const ROUTES: Record<string, { path: string[], query: string[] }> = ${JSON.stringify(routes, null, 2)}`)
  lines.push('')

  // Class declaration
  lines.push(`export class ${pascalName}Service {`)

  if (flags.oauth) {
    lines.push('  private oauth: OAuth2Client')
    lines.push('')
    lines.push(`  constructor(secrets: TypedSecretService) {`)
    lines.push('    this.oauth = new OAuth2Client(')
    lines.push(`      ${screamingName}_OAUTH2_CONFIG,`)
    lines.push(`      '${screamingName}_APP_CREDENTIALS',`)
    lines.push('      secrets')
    lines.push('    )')
    lines.push('  }')
  } else if (flags.secret) {
    lines.push(`  constructor(private creds: ${pascalName}Secrets) {}`)
  }

  lines.push('')

  // call() method — splits data into path/query/body using route map
  lines.push('  async call<T>(')
  lines.push("    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',")
  lines.push('    path: string,')
  lines.push('    data?: Record<string, unknown>')
  lines.push('  ): Promise<T> {')
  lines.push('    const route = ROUTES[`${method} ${path}`]')
  lines.push('    let endpoint = path')
  lines.push('    let body: Record<string, unknown> | undefined')
  lines.push('    const query: Record<string, string> = {}')
  lines.push('')
  lines.push('    if (data && route) {')
  lines.push('      // Interpolate path params')
  lines.push('      for (const param of route.path) {')
  lines.push('        if (data[param] !== undefined) {')
  lines.push('          endpoint = endpoint.replace(`{${param}}`, String(data[param]))')
  lines.push('        }')
  lines.push('      }')
  lines.push('      // Extract query params')
  lines.push('      for (const param of route.query) {')
  lines.push('        if (data[param] !== undefined) {')
  lines.push('          query[param] = String(data[param])')
  lines.push('        }')
  lines.push('      }')
  lines.push('      // Everything else goes into body')
  lines.push('      const pathAndQuery = new Set([...route.path, ...route.query])')
  lines.push('      const remaining = Object.fromEntries(')
  lines.push('        Object.entries(data).filter(([k]) => !pathAndQuery.has(k))')
  lines.push('      )')
  lines.push('      if (Object.keys(remaining).length > 0) {')
  lines.push('        body = remaining')
  lines.push('      }')
  lines.push('    }')
  lines.push('')
  lines.push('    const url = new URL(`${BASE_URL}${endpoint}`)')
  lines.push('    for (const [key, value] of Object.entries(query)) {')
  lines.push('      url.searchParams.set(key, value)')
  lines.push('    }')
  lines.push('')

  if (flags.oauth) {
    lines.push('    const response = await this.oauth.request(url.toString(), {')
    lines.push('      method,')
    lines.push("      headers: { 'Content-Type': 'application/json' },")
    lines.push('      body: body ? JSON.stringify(body) : undefined,')
    lines.push('    })')
  } else if (flags.secret) {
    lines.push('    const response = await fetch(url.toString(), {')
    lines.push('      method,')
    lines.push('      headers: {')
    lines.push("        'Content-Type': 'application/json',")
    lines.push('        Authorization: `Bearer ${this.creds.apiKey}`,')
    lines.push('      },')
    lines.push('      body: body ? JSON.stringify(body) : undefined,')
    lines.push('    })')
  } else {
    lines.push('    const response = await fetch(url.toString(), {')
    lines.push('      method,')
    lines.push("      headers: { 'Content-Type': 'application/json' },")
    lines.push('      body: body ? JSON.stringify(body) : undefined,')
    lines.push('    })')
  }

  lines.push('')
  lines.push('    if (!response.ok) {')
  lines.push('      const errorText = await response.text()')
  lines.push(`      throw new Error(\`${displayName} API error (\${response.status}): \${errorText}\`)`)
  lines.push('    }')
  lines.push('')
  lines.push('    const text = await response.text()')
  lines.push("    if (!text) return {} as T")
  lines.push('    return JSON.parse(text) as T')
  lines.push('  }')

  lines.push('}')
  lines.push('')

  return lines.join('\n')
}
