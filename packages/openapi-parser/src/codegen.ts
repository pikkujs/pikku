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
  snakeToCamel,
  type ZodCodegenContext,
} from './zod-codegen.js'
import {
  generateOperationNames,
  detectCommonPrefix,
  type NamedOperation,
} from './naming.js'
import {
  authHeaderValue,
  DelegatedLoginSchema,
  type AuthConfig,
} from './auth-config.js'

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
  credential?: 'apikey' | 'bearer' | 'basic' | 'oauth2'
  mcp?: boolean
  camelCase?: boolean
  /** Operator-supplied auth overrides (custom header, delegated login). */
  authConfig?: AuthConfig
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

const inTemplate = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Turn an operationId like `contactsControllerGetContacts` (or snake/kebab
 * variants) into a readable phrase — split camel/snake/kebab into words, drop
 * noise segments ("controller"), and capitalize. Returns undefined if nothing
 * usable remains.
 */
function humanizeOperationId(operationId?: string): string | undefined {
  if (!operationId) return undefined
  const words = operationId
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w && w.toLowerCase() !== 'controller')
  if (words.length === 0) return undefined
  return capitalize(words.join(' ').toLowerCase())
}

/**
 * A description for the generated function (and its MCP tool). Prefers the
 * spec's `description`, then `summary`; when a spec omits both (common), a
 * synthesized description is still emitted so no function — and no MCP tool —
 * ships description-less: a humanized operationId, else "METHOD /path".
 */
function humanDescription(parsed: ParsedOperation): string {
  const description = parsed.description?.trim()
  if (description && !GENERIC_SUMMARIES.has(description.toLowerCase())) {
    return capitalize(description)
  }
  const summary = parsed.summary?.trim()
  if (summary && !GENERIC_SUMMARIES.has(summary.toLowerCase())) {
    return capitalize(summary)
  }
  return (
    humanizeOperationId(parsed.operationId) ??
    `${parsed.method.toUpperCase()} ${parsed.path}`
  )
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

/**
 * Collect all component schema names directly referenced by an operation's
 * params, request body, and response schema.
 */
function collectOperationSchemaRefs(
  parsed: ParsedOperation,
  componentNames: Set<string>,
  schemaIdentityMap: Map<object, string>
): Set<string> {
  const refs = new Set<string>()
  const allSchemas: any[] = []

  // Gather all schema objects from this operation
  for (const p of [
    ...parsed.pathParams,
    ...parsed.queryParams,
    ...parsed.headerParams,
  ]) {
    if (p.schema) allSchemas.push(p.schema)
  }
  if (parsed.requestBody) allSchemas.push(parsed.requestBody)
  if (parsed.responseSchema) allSchemas.push(parsed.responseSchema)

  for (const schema of allSchemas) {
    // Check if the schema itself IS a component schema (by object identity).
    // collectSchemaRefs skips the root identity check, so we must do it here.
    if (schema && typeof schema === 'object') {
      const identityName = schemaIdentityMap.get(schema)
      if (identityName && componentNames.has(identityName)) {
        refs.add(identityName)
      }
    }
    for (const ref of collectSchemaRefs(
      schema,
      componentNames,
      schemaIdentityMap
    )) {
      refs.add(ref)
    }
  }
  return refs
}

/**
 * Compute the transitive closure of schema dependencies.
 * Given a set of schema names, expand it to include all schemas they depend on.
 */
function transitiveClosure(
  schemaNames: Set<string>,
  allSchemas: Record<string, any>,
  componentNames: Set<string>,
  schemaIdentityMap: Map<object, string>
): Set<string> {
  const result = new Set<string>()
  const queue = [...schemaNames]
  while (queue.length > 0) {
    const name = queue.pop()!
    if (result.has(name)) continue
    if (!allSchemas[name]) continue
    result.add(name)
    const deps = collectSchemaRefs(
      allSchemas[name],
      componentNames,
      schemaIdentityMap
    )
    for (const dep of deps) {
      if (!result.has(dep)) queue.push(dep)
    }
  }
  return result
}

interface SchemaPartition {
  /** Schemas referenced by 2+ operations — go in the shared types file */
  shared: Set<string>
  /** Map from schema name to the single operation index that uses it */
  single: Map<string, number>
  /** Schemas not referenced by any operation (directly or transitively) */
  unused: Set<string>
}

/**
 * Partition component schemas into shared, single-use, and unused buckets.
 *
 * Algorithm:
 * 1. For each operation, collect its directly referenced component schemas
 * 2. Expand each operation's refs to include transitive deps
 * 3. Count how many operations reference each schema (via transitive closure)
 * 4. Schemas with 2+ operations → shared, 1 operation → single, 0 → unused
 * 5. Single-use schemas whose transitive deps include shared schemas still go
 *    into single-use (the function file will import those shared deps)
 */
function partitionSchemas(
  spec: ParsedSpec,
  schemaIdentityMap: Map<object, string>
): SchemaPartition {
  const componentNames = new Set(Object.keys(spec.componentSchemas))

  // Step 1: Direct refs per operation
  const opDirectRefs: Set<string>[] = spec.operations.map((op) =>
    collectOperationSchemaRefs(op, componentNames, schemaIdentityMap)
  )

  // Step 2: Transitive refs per operation
  const opTransitiveRefs: Set<string>[] = opDirectRefs.map((directRefs) =>
    transitiveClosure(
      directRefs,
      spec.componentSchemas,
      componentNames,
      schemaIdentityMap
    )
  )

  // Step 3: Count how many operations reference each schema
  const refCount = new Map<string, Set<number>>()
  for (let i = 0; i < opTransitiveRefs.length; i++) {
    for (const name of opTransitiveRefs[i]) {
      if (!refCount.has(name)) refCount.set(name, new Set())
      refCount.get(name)!.add(i)
    }
  }

  // Step 4: Partition
  const shared = new Set<string>()
  const single = new Map<string, number>()
  const unused = new Set<string>()

  for (const name of componentNames) {
    const ops = refCount.get(name)
    if (!ops || ops.size === 0) {
      unused.add(name)
    } else if (ops.size === 1) {
      single.set(name, [...ops][0])
    } else {
      shared.add(name)
    }
  }

  // Step 5: If a single-use schema transitively depends on another single-use
  // schema from a DIFFERENT operation, promote both to shared.
  // This handles chains like: OpA → SchemaX → SchemaY ← OpB
  // Also: single-use schemas that depend on other single-use schemas from the
  // same operation stay single-use (they'll be inlined together).
  let changed = true
  while (changed) {
    changed = false
    for (const [name, opIdx] of [...single]) {
      const deps = collectSchemaRefs(
        spec.componentSchemas[name],
        componentNames,
        schemaIdentityMap
      )
      for (const dep of deps) {
        if (single.has(dep) && single.get(dep) !== opIdx) {
          // Dep is single-use but for a different operation — promote both
          shared.add(dep)
          single.delete(dep)
          shared.add(name)
          single.delete(name)
          changed = true
          break
        }
      }
    }
  }

  return { shared, single, unused }
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

  // Build an identity map from resolved schema objects to their component names.
  // After $ref resolution, many references become the same JS object as the
  // component schema (or a spread-copy). This map lets the codegen detect those
  // resolved references by object identity instead of relying on $ref strings.
  const schemaIdentityMap = new Map<object, string>()
  for (const [schemaName, schema] of Object.entries(spec.componentSchemas)) {
    if (schema && typeof schema === 'object') {
      schemaIdentityMap.set(schema, schemaName)
    }
  }

  // Partition schemas: shared (2+ ops), single-use (1 op), unused (0 ops)
  const partition = partitionSchemas(spec, schemaIdentityMap)

  // Build the set of schemas that go in the shared types file:
  // shared schemas + their transitive dependencies
  const componentNames = new Set(Object.keys(spec.componentSchemas))
  const sharedWithDeps = transitiveClosure(
    partition.shared,
    spec.componentSchemas,
    componentNames,
    schemaIdentityMap
  )
  // Any transitive dep of a shared schema that was single-use gets promoted to shared
  for (const name of sharedWithDeps) {
    partition.single.delete(name)
  }

  // Build a reduced componentSchemas for the types file (only shared schemas)
  const sharedComponentSchemas: Record<string, any> = {}
  for (const schemaName of sharedWithDeps) {
    if (spec.componentSchemas[schemaName]) {
      sharedComponentSchemas[schemaName] = spec.componentSchemas[schemaName]
    }
  }

  // schemaRefs for shared types file context — only shared schemas
  const sharedSchemaRefs = new Map<string, string>()
  for (const schemaName of sharedWithDeps) {
    sharedSchemaRefs.set(schemaName, schemaVarName(schemaName))
  }

  const ctx = createContext(sharedSchemaRefs, schemaIdentityMap, {
    camelCase: flags.camelCase,
  })

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
  if (Object.keys(sharedComponentSchemas).length > 0) {
    files[`src/${name}.types.ts`] = generateTypesFile(
      { ...spec, componentSchemas: sharedComponentSchemas },
      ctx,
      schemaIdentityMap
    )
  }

  // Collect single-use schemas per operation index
  const singleSchemasPerOp = new Map<number, Set<string>>()
  for (const [schemaName, opIdx] of partition.single) {
    if (!singleSchemasPerOp.has(opIdx)) singleSchemasPerOp.set(opIdx, new Set())
    singleSchemasPerOp.get(opIdx)!.add(schemaName)
  }
  // Expand single-use schemas to include their transitive deps that are also single-use
  for (const [_opIdx, schemas] of singleSchemasPerOp) {
    const expanded = transitiveClosure(
      schemas,
      spec.componentSchemas,
      componentNames,
      schemaIdentityMap
    )
    // Only keep schemas that are NOT in the shared set
    for (const s of expanded) {
      if (!sharedWithDeps.has(s) && !partition.unused.has(s)) {
        schemas.add(s)
      }
    }
  }

  // Generate function files
  const functionExports: string[] = []
  for (let i = 0; i < opPairs.length; i++) {
    const { named, parsed } = opPairs[i]
    const funcCtx = createContext(schemaRefs, schemaIdentityMap, {
      camelCase: flags.camelCase,
    })
    const inlineSchemas = singleSchemasPerOp.get(i) ?? new Set<string>()
    const { functionFile, schemasFile } = generateFunctionFile(
      named,
      parsed,
      vars,
      funcCtx,
      spec,
      flags,
      inlineSchemas,
      sharedWithDeps,
      schemaIdentityMap
    )
    files[`src/functions/${named.functionName}.function.ts`] = functionFile
    if (schemasFile) {
      files[`src/functions/${named.functionName}.schemas.ts`] = schemasFile
    }
    functionExports.push(named.functionName)
  }

  // Delegated login: emit the upstream authenticate() implementation
  const upstreamAuthExport = flags.authConfig?.delegated
    ? `authenticate${vars.pascalName}Upstream`
    : undefined
  if (flags.authConfig?.delegated) {
    files[`src/${name}-upstream-auth.ts`] = generateUpstreamAuthFile(
      vars,
      flags.authConfig
    )
  }

  // Generate index.ts with all exports
  files['src/index.ts'] = generateIndexFile(functionExports, {
    upstreamAuth: upstreamAuthExport
      ? { name, export: upstreamAuthExport }
      : undefined,
  })

  // Generate typed API service class with route map
  files[`src/${name}-api.service.ts`] = generateServiceFile(
    spec,
    opPairs,
    vars,
    flags
  )

  if (flags.oauth || flags.credential === 'oauth2') {
    files[`src/${name}.credential.ts`] = generateCredentialFile(spec, vars)
  }

  // Generate variable file for BASE_URL
  files[`src/${name}.variable.ts`] = generateVariableFile(spec, vars)

  return files
}

/**
 * Collect all component schema names referenced (directly or via properties/items/allOf/oneOf/anyOf)
 * by a given OpenAPI schema object.
 *
 * After $ref resolution, most $ref strings are gone and replaced by the resolved
 * object (often the same JS identity as the component schema). We detect
 * dependencies both by surviving $ref strings AND by object identity via
 * schemaIdentityMap.
 */
function collectSchemaRefs(
  schema: any,
  componentNames: Set<string>,
  schemaIdentityMap: Map<object, string>
): Set<string> {
  const refs = new Set<string>()
  const visited = new Set<any>()

  function walk(node: any, isRoot: boolean) {
    if (!node || typeof node !== 'object' || visited.has(node)) return
    visited.add(node)

    // Check surviving $ref strings
    if (node.$ref) {
      const refName = node.$ref.split('/').pop()!
      if (componentNames.has(refName)) refs.add(refName)
    }

    // Check if this node IS a known component schema (resolved $ref by identity).
    // Skip this check for the root node (the schema we're analyzing),
    // otherwise we'd match the schema against itself and return early,
    // missing its internal dependencies.
    if (!isRoot) {
      const identityName = schemaIdentityMap.get(node)
      if (identityName && componentNames.has(identityName)) {
        refs.add(identityName)
        // Don't walk into the component schema's internals — those are
        // handled when that schema is processed as a top-level entry.
        return
      }
    }

    if (node.properties) {
      for (const prop of Object.values(node.properties)) walk(prop, false)
    }
    if (node.items) walk(node.items, false)
    if (node.allOf) for (const s of node.allOf) walk(s, false)
    if (node.oneOf) for (const s of node.oneOf) walk(s, false)
    if (node.anyOf) for (const s of node.anyOf) walk(s, false)
    if (
      node.additionalProperties &&
      typeof node.additionalProperties === 'object'
    ) {
      walk(node.additionalProperties, false)
    }
  }

  walk(schema, true)
  return refs
}

/**
 * Topologically sort component schemas so that dependencies come before dependents.
 * Schemas involved in cycles are placed in arbitrary order (cycles are handled via z.lazy).
 */
function topoSortSchemas(
  schemas: Record<string, any>,
  schemaIdentityMap: Map<object, string>
): { sorted: string[]; cyclicEdges: Set<string> } {
  const names = new Set(Object.keys(schemas))
  const deps = new Map<string, Set<string>>()

  const selfRefs = new Set<string>()
  for (const [name, schema] of Object.entries(schemas)) {
    const refNames = collectSchemaRefs(schema, names, schemaIdentityMap)
    if (refNames.has(name)) {
      selfRefs.add(name) // track self-referential schemas
    }
    refNames.delete(name) // remove self-refs from dependency graph
    deps.set(name, refNames)
  }

  const sorted: string[] = []
  const visited = new Set<string>()
  const inStack = new Set<string>()
  const cyclicEdges = new Set<string>() // "child" schemas that are referenced before declaration

  function visit(name: string) {
    if (visited.has(name)) return
    if (inStack.has(name)) {
      // This is a cycle — mark this name as needing z.lazy()
      cyclicEdges.add(name)
      return
    }
    inStack.add(name)
    const children = deps.get(name) ?? new Set()
    for (const child of children) {
      if (names.has(child)) visit(child)
    }
    inStack.delete(name)
    visited.add(name)
    sorted.push(name)
  }

  for (const name of names) {
    visit(name)
  }

  // Self-referential schemas also need z.lazy() forward declarations
  for (const name of selfRefs) {
    cyclicEdges.add(name)
  }
  return { sorted, cyclicEdges }
}

function generateTypesFile(
  spec: ParsedSpec,
  ctx: ZodCodegenContext,
  schemaIdentityMap: Map<object, string>
): string {
  const lines: string[] = []
  lines.push("import { z } from 'zod'")
  lines.push('')
  lines.push(`// Shared schemas from ${spec.info.title} v${spec.info.version}`)
  lines.push('')

  const { sorted, cyclicEdges } = topoSortSchemas(
    spec.componentSchemas,
    schemaIdentityMap
  )

  // Track emitted variable names and type names to deduplicate collisions
  // (e.g. two OpenAPI components that sanitize to the same JS identifier)
  const emittedVarNames = new Set<string>()
  const emittedTypeNames = new Set<string>()

  function deduplicateName(baseName: string, usedSet: Set<string>): string {
    if (!usedSet.has(baseName)) {
      usedSet.add(baseName)
      return baseName
    }
    let counter = 2
    while (usedSet.has(`${baseName}_${counter}`)) {
      counter++
    }
    const deduped = `${baseName}_${counter}`
    usedSet.add(deduped)
    return deduped
  }

  // For schemas that participate in cycles, emit a z.lazy() forward declaration
  // before any schemas are defined, so forward references work.
  if (cyclicEdges.size > 0) {
    lines.push('// Forward declarations for circular references')
    for (const name of cyclicEdges) {
      const varName = deduplicateName(schemaVarName(name), emittedVarNames)
      const typeName = deduplicateName(sanitizeTypeName(name), emittedTypeNames)
      lines.push(
        `export const ${varName}: z.ZodType<any> = z.lazy(() => _${varName})`
      )
      lines.push(`export type ${typeName} = z.infer<typeof ${varName}>`)
      lines.push('')
    }
  }

  // Emit schemas in topological order
  for (const name of sorted) {
    const schema = spec.componentSchemas[name]
    const varName = deduplicateName(schemaVarName(name), emittedVarNames)
    const typeName = deduplicateName(sanitizeTypeName(name), emittedTypeNames)
    // Temporarily remove the current schema from the identity map so that
    // schemaToZod doesn't short-circuit to referencing the variable we're
    // currently defining (which would produce `const XSchema = XSchema`).
    ctx.schemaIdentityMap.delete(schema)
    const zodCode = schemaToZod(schema, ctx)
    // Restore it for subsequent schemas that may reference this one.
    ctx.schemaIdentityMap.set(schema, name)

    if (cyclicEdges.has(name)) {
      // The public variable was already declared above via z.lazy();
      // emit the real implementation with an underscore prefix.
      lines.push(`const _${varName} = ${zodCode}`)
    } else {
      lines.push(`export const ${varName} = ${zodCode}`)
      lines.push(`export type ${typeName} = z.infer<typeof ${varName}>`)
    }
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
  flags: CodegenFlags,
  inlineSchemas: Set<string> = new Set(),
  sharedSchemas: Set<string> = new Set(),
  schemaIdentityMap: Map<object, string> = new Map()
): { functionFile: string; schemasFile?: string } {
  const lines: string[] = []
  const { camelName, name } = vars

  const hasInput =
    parsed.pathParams.length > 0 ||
    parsed.queryParams.length > 0 ||
    parsed.headerParams.length > 0 ||
    parsed.requestBody

  const pascalName =
    named.functionName.charAt(0).toUpperCase() + named.functionName.slice(1)
  const inputName = `${pascalName}Input`
  const outputName = `${pascalName}Output`

  // Pre-generate Zod code to discover which schema refs are used
  let inputCode: string | undefined
  let outputCode: string | undefined
  if (hasInput) {
    inputCode = buildInputSchema(parsed, ctx)
  }
  outputCode = isVagueResponse(parsed)
    ? 'z.unknown()'
    : buildOutputSchema(parsed.responseSchema, ctx)

  // Bug 2: If generated Zod code is too large (> 500 lines), TypeScript
  // can't infer the type (TS7056). Replace with z.any() to stay compilable.
  const LINE_LIMIT = 500
  if (inputCode && inputCode.split('\n').length > LINE_LIMIT) {
    inputCode = 'z.any()'
  }
  if (outputCode && outputCode.split('\n').length > LINE_LIMIT) {
    outputCode = 'z.any()'
  }

  // Tag description as file header
  if (parsed.tags.length > 0) {
    const tag = parsed.tags[0]
    const tagDesc = spec.tagDescriptions[tag]
    if (tagDesc) {
      const cleanDesc = tagDesc
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      lines.push(`// ${tag} — ${cleanDesc}`)
      lines.push('')
    }
  }

  // Determine error imports needed
  const errorClasses = getErrorClassesForResponses(parsed.errorResponses)

  const schemaExports = [
    ...(hasInput && inputCode ? [inputName] : []),
    ...(outputCode ? [outputName] : []),
  ]

  lines.push("import { pikkuSessionlessFunc } from '#pikku/addon/function'")
  if (errorClasses.length > 0) {
    lines.push(
      `import { ${errorClasses.join(', ')} } from '@pikku/core/errors'`
    )
  }
  if (schemaExports.length > 0) {
    lines.push(
      `import { ${schemaExports.join(', ')} } from './${named.functionName}.schemas.js'`
    )
  }
  lines.push('')

  const schemaLines: string[] = ["import { z } from 'zod'"]

  // Import referenced component schemas from the types file.
  // Only import schemas that are in the shared set (not inlined ones).
  // In addition to the refs tracked through usedRefs, scan the generated Zod
  // code for schema variable names that may have been missed (e.g. when
  // a $ref survived resolution in a nested path not covered by usedRefs).
  if (Object.keys(spec.componentSchemas).length > 0) {
    const allGeneratedCode = [inputCode, outputCode].filter(Boolean).join('\n')
    for (const [refName, varName] of ctx.schemaRefs) {
      if (!ctx.usedRefs.has(refName) && allGeneratedCode.includes(varName)) {
        ctx.usedRefs.add(refName)
      }
    }

    const schemaImports = [
      ...new Set(
        [...ctx.usedRefs]
          .filter((refName) => sharedSchemas.has(refName)) // only import shared schemas
          .map((refName) => ctx.schemaRefs.get(refName))
          .filter(Boolean)
      ),
    ].sort()
    if (schemaImports.length > 0) {
      schemaLines.push(
        `import { ${schemaImports.join(', ')} } from '../${name}.types.js'`
      )
    }
  }

  schemaLines.push('')

  // Emit inline (single-use) schema definitions before input/output
  if (inlineSchemas.size > 0) {
    // Build a mini component schemas map for just the inline schemas
    const inlineComponentSchemas: Record<string, any> = {}
    for (const schemaName of inlineSchemas) {
      if (spec.componentSchemas[schemaName]) {
        inlineComponentSchemas[schemaName] = spec.componentSchemas[schemaName]
      }
    }

    if (Object.keys(inlineComponentSchemas).length > 0) {
      // Create a context that knows about both shared (for imports) and inline schemas
      const inlineCtx = createContext(ctx.schemaRefs, schemaIdentityMap, {
        camelCase: flags.camelCase,
      })

      const { sorted, cyclicEdges } = topoSortSchemas(
        inlineComponentSchemas,
        schemaIdentityMap
      )

      // Bug 4: Pre-generate all Zod code and detect forward references.
      // The topological sort may miss dependencies when $ref resolution
      // replaces references with copies (breaking object identity).
      // Scan generated code for variable names that appear before their
      // declaration and promote those to z.lazy() forward declarations.
      const inlineSorted = sorted.filter((s) => inlineSchemas.has(s))
      const generatedCode = new Map<string, string>()
      for (const sName of inlineSorted) {
        const schema = spec.componentSchemas[sName]
        inlineCtx.schemaIdentityMap.delete(schema)
        const zodCode = schemaToZod(schema, inlineCtx)
        inlineCtx.schemaIdentityMap.set(schema, sName)
        generatedCode.set(sName, zodCode)
      }

      // Build a map of variable names to schema names for inline schemas
      const inlineVarToName = new Map<string, string>()
      for (const sName of inlineSorted) {
        inlineVarToName.set(schemaVarName(sName), sName)
      }

      // Detect forward references and self-references: for each schema in order,
      // check if its generated code references a variable that appears later in
      // the sorted list OR references its own variable (self-referential schema).
      const forwardRefs = new Set<string>(cyclicEdges)
      const emittedSoFar = new Set<string>()
      for (const sName of inlineSorted) {
        const code = generatedCode.get(sName)!
        const ownVarN = schemaVarName(sName)
        // Self-reference: schema uses its own variable name in its definition
        if (code.includes(ownVarN)) {
          forwardRefs.add(sName)
        }
        for (const [varN, refName] of inlineVarToName) {
          if (
            refName !== sName &&
            !emittedSoFar.has(refName) &&
            code.includes(varN)
          ) {
            // This schema references another inline schema not yet emitted
            forwardRefs.add(refName)
          }
        }
        emittedSoFar.add(sName)
      }

      const emittedVarNames = new Set<string>()
      const emittedTypeNames = new Set<string>()

      // Forward declarations for cycles and forward references within inline schemas
      if (forwardRefs.size > 0) {
        schemaLines.push('// Forward declarations for circular references')
        for (const sName of forwardRefs) {
          if (!inlineSchemas.has(sName)) continue
          const varN = schemaVarName(sName)
          const typeN = sanitizeTypeName(sName)
          emittedVarNames.add(varN)
          emittedTypeNames.add(typeN)
          schemaLines.push(
            `const ${varN}: z.ZodType<any> = z.lazy(() => _${varN})`
          )
          schemaLines.push('')
        }
      }

      for (const sName of inlineSorted) {
        const varN = schemaVarName(sName)
        emittedVarNames.add(varN)

        const zodCode = generatedCode.get(sName)!

        if (forwardRefs.has(sName)) {
          schemaLines.push(`const _${varN} = ${zodCode}`)
        } else {
          schemaLines.push(`const ${varN} = ${zodCode}`)
        }
        schemaLines.push('')
      }
    }
  }

  // Build Input schema (exported for pikku schema discovery)
  if (hasInput && inputCode) {
    schemaLines.push(`export const ${inputName} = ${inputCode}`)
    schemaLines.push('')
  }

  // Build Output schema (exported for pikku schema discovery)
  if (outputCode) {
    schemaLines.push(`export const ${outputName} = ${outputCode}`)
    schemaLines.push('')
  }

  const description = humanDescription(parsed)
  const method = parsed.method.toUpperCase()

  const funcConfig: string[] = []
  if (description) {
    funcConfig.push(`  description: ${JSON.stringify(description)},`)
  }
  if (hasInput) funcConfig.push(`  input: ${inputName},`)
  funcConfig.push(`  output: ${outputName},`)

  if (errorClasses.length > 0) {
    funcConfig.push(`  errors: [${errorClasses.join(', ')}],`)
  }

  if (flags.mcp) {
    funcConfig.push('  mcp: true,')
  }

  // Bug 3: Avoid duplicate identifier when camelName is 'data' (TS2300)
  const inputParamName = camelName === 'data' ? 'inputData' : 'data'
  const funcParams = hasInput
    ? `{ ${camelName} }, ${inputParamName}`
    : `{ ${camelName} }`

  const returnCast = ' as any'
  funcConfig.push(
    `  func: async (${funcParams}) => {`,
    `    return ${camelName}.call(${JSON.stringify(method)}, ${JSON.stringify(parsed.path)}${hasInput ? `, ${inputParamName}` : ''})${returnCast}`,
    '  },'
  )

  lines.push(`export const ${named.functionName} = pikkuSessionlessFunc({`)
  lines.push(funcConfig.join('\n'))
  lines.push('})')
  lines.push('')

  return {
    functionFile: lines.join('\n'),
    schemasFile: schemaExports.length > 0 ? schemaLines.join('\n') : undefined,
  }
}

function buildInputSchema(
  parsed: ParsedOperation,
  ctx: ZodCodegenContext
): string {
  const props: string[] = []
  // Track which parameter names have been emitted to prevent duplicates.
  // When shared path-level params and operation-level params overlap
  // (e.g. both define "Version"), the later (operation-level) one wins.
  const emittedNames = new Set<string>()

  // Deduplicate params: operation-level params override shared path-level
  // params with the same name. Build deduplicated lists per category.
  function deduplicateParams(params: typeof parsed.pathParams) {
    const seen = new Map<string, (typeof params)[0]>()
    for (const param of params) {
      seen.set(param.name, param) // last wins (operation-level comes after shared)
    }
    return [...seen.values()]
  }

  const useCamel = !!ctx.camelCase

  for (const param of deduplicateParams(parsed.pathParams)) {
    if (!emittedNames.has(param.name)) {
      emittedNames.add(param.name)
      props.push(formatParamProp(param, ctx, useCamel))
    }
  }

  for (const param of deduplicateParams(parsed.queryParams)) {
    if (!emittedNames.has(param.name)) {
      emittedNames.add(param.name)
      props.push(formatParamProp(param, ctx, useCamel))
    }
  }

  for (const param of deduplicateParams(parsed.headerParams)) {
    if (!emittedNames.has(param.name)) {
      emittedNames.add(param.name)
      props.push(formatParamProp(param, ctx, useCamel))
    }
  }

  if (parsed.requestBody) {
    if (parsed.requestBody.properties) {
      const requiredSet = new Set(parsed.requestBody.required ?? [])
      for (const [key, propSchema] of Object.entries(
        parsed.requestBody.properties
      )) {
        // Skip readOnly properties from input
        if (propSchema.readOnly) continue
        // Skip body properties that collide with already-emitted params
        if (emittedNames.has(key)) {
          console.warn(
            `[openapi] Skipping body property '${key}' — collides with path/query/header param`
          )
          continue
        }
        emittedNames.add(key)
        const isOptional = !requiredSet.has(key)
        const zodCode = schemaToZod(propSchema, ctx, { optional: isOptional })
        const outputKey = useCamel ? snakeToCamel(key) : key
        props.push(`  ${safeKey(outputKey)}: ${zodCode},`)
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
  ctx: ZodCodegenContext,
  camelCase = false
): string {
  const zodCode = schemaToZod(param.schema, ctx, { optional: !param.required })

  let descParts: string[] = []
  if (param.description)
    descParts.push(param.description.replace(/\*\//g, '* /'))
  if (param.example !== undefined)
    descParts.push(`Example: ${JSON.stringify(param.example)}`)

  const desc =
    descParts.length > 0
      ? `${zodCode}.describe(${JSON.stringify(descParts.join('. '))})`
      : zodCode

  const outputKey = camelCase ? snakeToCamel(param.name) : param.name
  return `  ${safeKey(outputKey)}: ${desc},`
}

const isBareString = (schema: any) =>
  schema?.type === 'string' &&
  !schema.format &&
  !schema.enum &&
  !schema.pattern &&
  schema.const === undefined

/**
 * A response the spec leaves untyped, or types as a bare string (or a list of
 * them) while serving JSON, carries no shape a caller can rely on: spec
 * generators such as Restler emit exactly that as a placeholder for "some
 * object". `z.unknown()` says so honestly instead of promising a string the
 * API never returns. Text responses keep their string type.
 */
function isVagueResponse(parsed: ParsedOperation): boolean {
  const schema: any = parsed.responseSchema
  if (!schema) return true
  if (parsed.responseMediaType && !/json/i.test(parsed.responseMediaType)) {
    return false
  }
  return (
    isBareString(schema) ||
    (schema.type === 'array' && isBareString(schema.items))
  )
}

function buildOutputSchema(schema: any, ctx: ZodCodegenContext): string {
  // For output schemas, filter out writeOnly properties.
  // Only create a filtered copy if there are actually writeOnly properties,
  // to preserve object identity for schema identity map matching.
  if (schema.properties) {
    const hasWriteOnly = Object.values(schema.properties).some(
      (p: any) => p.writeOnly
    )
    if (hasWriteOnly) {
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
  }
  return schemaToZod(schema, ctx)
}

function generateIndexFile(
  functionExports: string[],
  extras?: { upstreamAuth?: { name: string; export: string } }
): string {
  const lines: string[] = []
  for (const name of functionExports) {
    lines.push(`export { ${name} } from './functions/${name}.function.js'`)
  }
  if (extras?.upstreamAuth) {
    lines.push(
      `export { ${extras.upstreamAuth.export} } from './${extras.upstreamAuth.name}-upstream-auth.js'`
    )
  }
  lines.push('')
  return lines.join('\n')
}

/**
 * Emit `src/<name>-upstream-auth.ts`: a self-contained authenticate() for
 * delegated login. It performs the upstream login call described by the auth
 * config, extracts the token, optionally looks the user up with it, reads
 * identity claims from the decoded JWT payload (base64url, NOT
 * signature-verified — the token was just received over TLS from the login
 * we ourselves performed), the login response or the lookup, and returns an
 * identity object structurally compatible with `@pikku/better-auth`'s
 * `UpstreamIdentity` — without depending on it.
 */
function generateUpstreamAuthFile(
  vars: AddonVars,
  authConfig: AuthConfig
): string {
  const { pascalName } = vars
  const delegated = DelegatedLoginSchema.parse(authConfig.delegated)
  const claims = delegated.claims
  const source = claims.source ?? (delegated.identity ? 'identity' : 'response')
  const namePaths = claims.name
    ? Array.isArray(claims.name)
      ? claims.name
      : [claims.name]
    : []
  const q = (value: unknown) => JSON.stringify(value)
  const fieldName = (credential: 'login' | 'email' | 'password') =>
    q(delegated.fields?.[credential] ?? credential)
  const extraHeaders = Object.entries(authConfig.extraHeaders ?? {})
    .map(([header, value]) => `\n  ${q(header)}: ${q(value)},`)
    .join('')
  const tokenHeader = authHeaderValue(authConfig, 'token')

  const fieldLines: string[] = []
  if (delegated.credentials.includes('login')) {
    fieldLines.push(`  if (login) fields[${fieldName('login')}] = login`)
  }
  if (delegated.credentials.includes('email')) {
    fieldLines.push(
      `  if (credentials.email ?? login) fields[${fieldName('email')}] = (credentials.email ?? login)!`
    )
  }
  if (delegated.credentials.includes('password')) {
    fieldLines.push(
      `  if (credentials.password) fields[${fieldName('password')}] = credentials.password`
    )
  }
  if (delegated.credentials.includes('apiKey')) {
    fieldLines.push(
      `  if (credentials.apiKey) headers[${q(delegated.apiKeyHeader)}] = credentials.apiKey`
    )
  }

  const sendFields = {
    json: `  headers['Content-Type'] = 'application/json'
  const body = Object.keys(fields).length > 0 ? JSON.stringify(fields) : undefined`,
    form: `  headers['Content-Type'] = 'application/x-www-form-urlencoded'
  const body = new URLSearchParams(fields).toString()`,
    query: `  for (const [key, value] of Object.entries(fields)) {
    loginUrl.searchParams.set(key, value)
  }
  const body = undefined`,
  }[delegated.encoding]

  const identityLookup = delegated.identity
    ? `
  const identityResponse = await fetch(\`\${root}${delegated.identity.path}\`, {
    method: ${q(delegated.identity.method.toUpperCase())},
    headers: { ...EXTRA_HEADERS, ${q(tokenHeader.header)}: ${tokenHeader.value} },
  })
  if (!identityResponse.ok) return null
  const identity: unknown = await identityResponse.json()
`
    : ''

  const claimsExpr = {
    jwt: 'decodeJwtPayload(token)',
    response: 'data',
    identity: delegated.identity ? 'identity' : 'data',
  }[source]

  const nameExpr =
    namePaths.length > 0
      ? `[${namePaths.map((p) => `str(pick(claims, ${q(p)}))`).join(', ')}]
    .filter((part): part is string => Boolean(part))
    .join(' ') || login`
      : 'login'

  const roleExpr = !claims.role
    ? 'undefined'
    : delegated.roles
      ? `mapRole(str(pick(claims, ${q(claims.role)})))`
      : `str(pick(claims, ${q(claims.role)}))`

  const expiresAtExpr = delegated.expiresAtPath
    ? `pick(data, ${q(delegated.expiresAtPath)})`
    : source === 'jwt'
      ? `pick(claims, 'exp')`
      : 'undefined'

  return `export interface ${pascalName}UpstreamIdentity {
  externalId: string
  email: string
  syntheticEmail?: boolean
  name?: string
  role?: string
  tenantId?: string
  credential: { token: string; expiresAt?: number; tenantId?: string }
}

export interface ${pascalName}UpstreamCredentials {
  login?: string
  email?: string
  password?: string
  apiKey?: string
}

const EXTRA_HEADERS: Record<string, string> = {${extraHeaders}${extraHeaders ? '\n' : ''}}
${delegated.roles ? `\nconst ROLES: Record<string, string> = ${q(delegated.roles)}\n\nconst mapRole = (value: string | undefined) =>\n  value === undefined ? undefined : ROLES[value]\n` : ''}
const pick = (obj: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<any>(
      (o, key) => (o && typeof o === 'object' ? o[key] : undefined),
      obj
    )

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : typeof value === 'number' ? String(value) : undefined

/** Decode a JWT payload without verifying — see file docblock. */
const decodeJwtPayload = (token: string): unknown => {
  const part = token.split('.')[1]
  if (!part) return undefined
  try {
    const pad = part + '==='.slice((part.length + 3) % 4)
    const bin = atob(pad.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    // Not a decodable JWT — caller treats it as missing claims.
    return undefined
  }
}

const syntheticEmail = (values: Record<string, string>) =>
  ${q(delegated.emailTemplate)}
    .replace(/\\{(\\w+)\\}/g, (_, key: string) =>
      (values[key] ?? '').replace(/[^A-Za-z0-9._+-]/g, '-')
    )
    .toLowerCase()

/**
 * Verify credentials against the upstream ${vars.displayName} login and map
 * its response onto an upstream identity. Returns null when the upstream
 * rejects the credentials; network errors propagate to the caller.
 */
export const authenticate${pascalName}Upstream = async (
  credentials: ${pascalName}UpstreamCredentials,
  baseUrl: string
): Promise<${pascalName}UpstreamIdentity | null> => {
  const root = baseUrl.replace(/\\/+$/, '')
  const login = credentials.login ?? credentials.email
  const headers: Record<string, string> = { ...EXTRA_HEADERS }
  const fields: Record<string, string> = {}
${fieldLines.join('\n')}

  const loginUrl = new URL(\`\${root}${delegated.loginPath}\`)
${sendFields}
  const response = await fetch(loginUrl, {
    method: ${q(delegated.loginMethod.toUpperCase())},
    headers,
    body,
  })
  if (!response.ok) return null

  const data: unknown = await response.json().catch(() => undefined)
  const token = str(pick(data, ${q(delegated.tokenPath)}))
  if (!token) return null
${identityLookup}
  const claims = ${claimsExpr}
  if (!claims) return null

  const externalId = ${claims.externalId ? `str(pick(claims, ${q(claims.externalId)})) ?? login` : 'login'}
  if (!externalId) return null
  const who = login ?? externalId
  const claimedEmail = ${claims.email ? `str(pick(claims, ${q(claims.email)}))` : 'undefined'}
  const email =
    claimedEmail ??
    (who.includes('@')
      ? who.toLowerCase()
      : syntheticEmail({ login: who, externalId, host: new URL(root).host }))
  const name = ${nameExpr}
  const role = ${roleExpr}
  const tenantId = ${claims.tenantId ? `str(pick(claims, ${q(claims.tenantId)}))` : 'undefined'}
  const expiresAtRaw = ${expiresAtExpr}
  const expiresAt = typeof expiresAtRaw === 'number' ? expiresAtRaw : undefined

  return {
    externalId,
    email,
    syntheticEmail: claimedEmail === undefined,
    name,
    role,
    tenantId,
    credential: { token, expiresAt, tenantId },
  }
}
`
}

interface RouteInfo {
  path: string[]
  query: string[]
  headers: string[]
  body?: 'form' | 'multipart'
  errors?: Record<number, string>
}

type CredentialKind = NonNullable<CodegenFlags['credential']>

const CREDENTIAL_SHAPES: Record<CredentialKind, string> = {
  bearer: '{ token: string }',
  apikey: '{ apiKey: string }',
  basic: '{ username: string; password: string }',
  oauth2: '{ accessToken: string }',
}

/** The statement that puts the caller's credential on the request, if any. */
function authHeaderLine(
  spec: ParsedSpec,
  flags: CodegenFlags,
  credential: CredentialKind | 'secret' | undefined
): string | undefined {
  if (!credential) return undefined
  const tokenExpr = {
    bearer: 'this.creds.token',
    apikey: 'this.creds.apiKey',
    secret: 'this.creds.apiKey',
    oauth2: 'this.creds.accessToken',
    basic: undefined,
  }[credential]
  if (!tokenExpr) {
    return 'headers.Authorization = `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(`${this.creds.username}:${this.creds.password}`)))}`'
  }
  if (flags.authConfig?.headerName) {
    const { header, value } = authHeaderValue(flags.authConfig, tokenExpr)
    return `headers[${JSON.stringify(header)}] = ${value}`
  }
  if (credential === 'apikey' || credential === 'secret') {
    const scheme = Object.values(spec.securitySchemes).find(
      (s) => s.type === 'apiKey'
    )
    if (scheme?.name && scheme.in === 'header') {
      return `headers[${JSON.stringify(scheme.name)}] = ${tokenExpr}`
    }
    if (scheme?.name && scheme.in === 'query') {
      return `url.searchParams.set(${JSON.stringify(scheme.name)}, ${tokenExpr})`
    }
  }
  return `headers.Authorization = \`Bearer \${${tokenExpr}}\``
}

function generateServiceFile(
  spec: ParsedSpec,
  opPairs: Array<{ named: NamedOperation; parsed: ParsedOperation }>,
  vars: AddonVars,
  flags: CodegenFlags
): string {
  const { name, camelName, pascalName, screamingName } = vars
  const displayName = vars.displayName.replace(/'/g, '')
  const credential: CredentialKind | 'secret' | undefined =
    flags.credential ??
    (flags.oauth ? 'oauth2' : flags.secret ? 'secret' : undefined)
  const perUser = credential !== undefined && credential !== 'secret'
  const reauth = flags.authConfig?.delegated ? 'sign-in' : 'connect'

  const routes: Record<string, RouteInfo> = {}
  for (const { parsed } of opPairs) {
    const route: RouteInfo = {
      path: parsed.pathParams.map((p) => p.name),
      query: parsed.queryParams.map((p) => p.name),
      headers: parsed.headerParams.map((p) => p.name),
    }
    if (parsed.requestBodyMediaType?.includes('x-www-form-urlencoded')) {
      route.body = 'form'
    } else if (parsed.requestBodyMediaType?.includes('multipart/form-data')) {
      route.body = 'multipart'
    }
    if (parsed.errorResponses.length > 0) {
      route.errors = {}
      for (const err of parsed.errorResponses) {
        route.errors[err.statusCode] = err.description
      }
    }
    routes[`${parsed.method.toUpperCase()} ${parsed.path}`] = route
  }

  const errorClasses = [
    ...new Set([
      ...Object.values(STATUS_TO_ERROR),
      ...(perUser ? ['CredentialRejectedError'] : []),
    ]),
  ].sort()

  const credsParam =
    credential === 'secret'
      ? `private creds: ${pascalName}Secrets, `
      : credential
        ? `private creds: ${CREDENTIAL_SHAPES[credential]}, `
        : ''
  const authLine = authHeaderLine(spec, flags, credential)
  const dataVar = flags.camelCase ? 'rawData' : 'input'
  const extraHeaders = Object.entries(flags.authConfig?.extraHeaders ?? {})
    .map(([h, v]) => `\n      ${JSON.stringify(h)}: ${JSON.stringify(v)},`)
    .join('')
  const unauthorized = perUser
    ? `throw new CredentialRejectedError(${JSON.stringify(camelName)}, ${JSON.stringify(reauth)})`
    : 'throw new UnauthorizedError(errorMessage)'
  const parseJson = flags.camelCase
    ? `const result = JSON.parse(text)
      return (typeof result === 'object' && result !== null && !Array.isArray(result) ? _toCamelCase(result) : result) as T`
    : 'return JSON.parse(text) as T'

  return `${credential === 'secret' ? `import type { ${pascalName}Secrets } from './${name}.secret.js'\n` : ''}import { ${errorClasses.join(', ')} } from '@pikku/core/errors'
import type { TypedVariablesService } from '#pikku/addon/variables/pikku-variables.gen.js'

const ROUTES: Record<string, { path: string[], query: string[], headers: string[], body?: 'form' | 'multipart', errors?: Record<number, string> }> = ${JSON.stringify(routes, null, 2)}
${
  flags.camelCase
    ? `
function _toSnakeCase(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k.replace(/[A-Z]/g, c => \`_\${c.toLowerCase()}\`), v])
  )
}

function _toCamelCase(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k.replace(/[-_]+(.)/g, (_, c) => c.toUpperCase()), v])
  )
}
`
    : ''
}
function _upstreamMessage(text: string): string | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    const plain = text.trim()
    return plain && !plain.startsWith('<') ? plain.slice(0, 200) : undefined
  }
  const body = (parsed ?? {}) as Record<string, unknown>
  const nested = (body.error ?? {}) as Record<string, unknown>
  const found = [nested.message, body.message, body.detail, body.title, body.error_description, body.error].find(
    (value): value is string => typeof value === 'string' && value.trim() !== ''
  )
  return found?.trim().slice(0, 200)
}

export class ${pascalName}Service {
  constructor(${credsParam}private variables: TypedVariablesService) {}

  private async baseUrl(): Promise<string> {
    const baseUrl = await this.variables.get('${screamingName}_BASE_URL')
    if (!baseUrl) {
      throw new Error('${screamingName}_BASE_URL is not set — point it at the ${inTemplate(displayName)} API root')
    }
    return String(baseUrl).replace(/\\/+$/, '')
  }

  async call<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    data?: unknown
  ): Promise<T> {
    const input = data as Record<string, unknown> | undefined${flags.camelCase ? '\n    const rawData = input ? _toSnakeCase(input) : input' : ''}
    const route = ROUTES[\`\${method} \${path}\`]
    let endpoint = path
    let body: Record<string, unknown> | undefined
    const query: Record<string, string> = {}
    const headers: Record<string, string> = {${extraHeaders}
    }

    if (${dataVar} && route) {
      for (const param of route.path) {
        if (${dataVar}[param] !== undefined) {
          endpoint = endpoint.replace(\`{\${param}}\`, encodeURIComponent(String(${dataVar}[param])))
        }
      }
      for (const param of route.query) {
        if (${dataVar}[param] !== undefined) {
          query[param] = String(${dataVar}[param])
        }
      }
      for (const param of route.headers) {
        if (${dataVar}[param] !== undefined) {
          headers[param] = String(${dataVar}[param])
        }
      }
      const pathQueryHeaders = new Set([...route.path, ...route.query, ...route.headers])
      const remaining = Object.fromEntries(
        Object.entries(${dataVar}).filter(([k]) => !pathQueryHeaders.has(k))
      )
      if (Object.keys(remaining).length > 0) {
        body = remaining
      }
    }

    const url = new URL(\`\${await this.baseUrl()}\${endpoint}\`)
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value)
    }
${authLine ? `    ${authLine}\n` : ''}
    let payload: string | FormData | undefined
    if (body && route?.body === 'form') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
      payload = new URLSearchParams(
        Object.entries(body).map(([k, v]) => [k, String(v)])
      ).toString()
    } else if (body && route?.body === 'multipart') {
      const form = new FormData()
      for (const [k, v] of Object.entries(body)) {
        form.append(k, v instanceof Blob ? v : String(v))
      }
      payload = form
    } else if (body) {
      headers['Content-Type'] = 'application/json'
      payload = JSON.stringify(body)
    }

    const response = await fetch(url.toString(), { method, headers, body: payload })

    if (!response.ok) {
      const errorText = await response.text()
      const errorMessage = _upstreamMessage(errorText) ?? route?.errors?.[response.status] ?? \`HTTP \${response.status}\`
      switch (response.status) {
        case 400: throw new BadRequestError(errorMessage)
        case 401: ${unauthorized}
        case 403: throw new ForbiddenError(errorMessage)
        case 404: throw new NotFoundError(errorMessage)
        case 405: throw new MethodNotAllowedError(errorMessage)
        case 409: throw new ConflictError(errorMessage)
        case 422: throw new UnprocessableContentError(errorMessage)
        case 429: throw new TooManyRequestsError(errorMessage)
        case 500: throw new InternalServerError(errorMessage)
        default: throw new Error(\`${inTemplate(displayName)} API error (\${response.status}): \${errorMessage}\`)
      }
    }

    const text = await response.text()
    if (!text) return undefined as T
    if (/json/i.test(response.headers.get('content-type') ?? 'application/json')) {
      ${parseJson}
    }
    try {
      return JSON.parse(text) as T
    } catch {
      return text as T
    }
  }
}
`
}

function generateCredentialFile(spec: ParsedSpec, vars: AddonVars): string {
  const { camelName, screamingName } = vars
  const displayName = vars.displayName.replace(/'/g, '')
  const description = vars.description.replace(/'/g, '')

  const oauthScheme = Object.values(spec.securitySchemes).find(
    (s) => s.type === 'oauth2'
  )
  const authorizationUrl = oauthScheme?.flows?.authorizationUrl
  const tokenUrl = oauthScheme?.flows?.tokenUrl
  const scopes = oauthScheme?.flows?.scopes
    ? Object.keys(oauthScheme.flows.scopes)
    : ['read', 'write']

  const lines: string[] = []
  lines.push("import { z } from 'zod'")
  lines.push("import { defineCredential } from '@pikku/core/credential'")
  lines.push("import { defineSecret } from '@pikku/core/secret'")
  lines.push('')
  lines.push(`export const ${camelName}TokenSchema = z.object({`)
  lines.push('  accessToken: z.string(),')
  lines.push('  refreshToken: z.string().optional(),')
  lines.push('})')
  lines.push('')
  lines.push(`export const ${camelName}OAuthAppSchema = z.object({`)
  lines.push("  clientId: z.string().describe('OAuth2 app client ID'),")
  lines.push("  clientSecret: z.string().describe('OAuth2 app client secret'),")
  lines.push('})')
  lines.push('')

  if (!authorizationUrl || !tokenUrl) {
    lines.push(
      '// TODO: this spec declares no oauth2 flow URLs, so the placeholder(s)'
    )
    lines.push(
      `// below are not real. Replace them with ${displayName}'s endpoints —`
    )
    lines.push('// OAuth will fail against example.com.')
  }

  // oauth2 must stay an inline object literal: the inspector reads it via AST
  // (add-credential.ts) and silently drops a config behind an identifier.
  lines.push('defineCredential({')
  lines.push(`  name: '${camelName}',`)
  lines.push(`  displayName: '${displayName}',`)
  lines.push(`  description: '${description}',`)
  lines.push(`  type: 'wire',`)
  lines.push(`  schema: ${camelName}TokenSchema,`)
  lines.push('  oauth2: {')
  lines.push(`    appCredentialSecretId: '${screamingName}_OAUTH_APP',`)
  lines.push(`    tokenSecretId: '${screamingName}_OAUTH_TOKENS',`)
  lines.push(
    `    authorizationUrl: ${JSON.stringify(authorizationUrl ?? 'https://example.com/oauth2/authorize')},`
  )
  lines.push(
    `    tokenUrl: ${JSON.stringify(tokenUrl ?? 'https://example.com/oauth2/token')},`
  )
  lines.push(`    scopes: ${JSON.stringify(scopes)},`)
  lines.push('  },')
  lines.push('})')
  lines.push('')
  lines.push('defineSecret({')
  lines.push(`  name: '${camelName}OAuthApp',`)
  lines.push(`  displayName: '${displayName} OAuth App',`)
  lines.push(`  description: 'OAuth2 app credentials for ${displayName}',`)
  lines.push(`  secretId: '${screamingName}_OAUTH_APP',`)
  lines.push(`  schema: ${camelName}OAuthAppSchema,`)
  lines.push('})')
  lines.push('')

  return lines.join('\n')
}

function generateVariableFile(spec: ParsedSpec, vars: AddonVars): string {
  const { camelName, screamingName } = vars
  const displayName = vars.displayName.replace(/'/g, '')
  const serverUrls = spec.serverUrls

  const lines: string[] = []
  lines.push("import { z } from 'zod'")
  lines.push("import { defineVariable } from '@pikku/core/variable'")
  lines.push('')

  const schemaVarName = `${camelName}BaseUrlSchema`
  const absolute = serverUrls.filter((url) => /^https?:\/\//i.test(url))
  const describe = [
    `Base URL of the ${displayName} API`,
    ...(absolute.length > 1 ? [`e.g. ${absolute.join(', ')}`] : []),
  ].join(' — ')

  // Any instance of the API can be configured, so the spec's server list is
  // a default, never an allow-list.
  lines.push(
    `export const ${schemaVarName} = z.string().url()${absolute[0] ? `.default(${JSON.stringify(absolute[0])})` : ''}.describe(${JSON.stringify(describe)})`
  )

  lines.push('')
  lines.push(`defineVariable({`)
  lines.push(`  name: '${screamingName}_BASE_URL',`)
  lines.push(`  displayName: '${displayName} Base URL',`)
  lines.push(`  description: 'The base URL for the ${displayName} API.',`)
  lines.push(`  variableId: '${screamingName}_BASE_URL',`)
  lines.push(`  schema: ${schemaVarName},`)
  lines.push(`})`)
  lines.push('')

  return lines.join('\n')
}
