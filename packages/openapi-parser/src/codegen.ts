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
  credential?: 'apikey' | 'bearer' | 'oauth2'
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

  const ctx = createContext(sharedSchemaRefs, schemaIdentityMap)

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
    const funcCtx = createContext(schemaRefs, schemaIdentityMap)
    const inlineSchemas = singleSchemasPerOp.get(i) ?? new Set<string>()
    const funcCode = generateFunctionFile(
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
): string {
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
  if (parsed.responseSchema) {
    outputCode = buildOutputSchema(parsed.responseSchema, ctx)
  }

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

  const needsZod = hasInput || !!parsed.responseSchema || inlineSchemas.size > 0
  if (needsZod) {
    lines.push("import { z } from 'zod'")
  }
  lines.push("import { pikkuSessionlessFunc } from '#pikku'")

  if (errorClasses.length > 0) {
    lines.push(
      `import { ${errorClasses.join(', ')} } from '@pikku/core/errors'`
    )
  }

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
      lines.push(
        `import { ${schemaImports.join(', ')} } from '../${name}.types.js'`
      )
    }
  }

  lines.push('')

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
      const inlineCtx = createContext(ctx.schemaRefs, schemaIdentityMap)

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
        lines.push('// Forward declarations for circular references')
        for (const sName of forwardRefs) {
          if (!inlineSchemas.has(sName)) continue
          const varN = schemaVarName(sName)
          const typeN = sanitizeTypeName(sName)
          emittedVarNames.add(varN)
          emittedTypeNames.add(typeN)
          lines.push(`const ${varN}: z.ZodType<any> = z.lazy(() => _${varN})`)
          lines.push('')
        }
      }

      for (const sName of inlineSorted) {
        const varN = schemaVarName(sName)
        emittedVarNames.add(varN)

        const zodCode = generatedCode.get(sName)!

        if (forwardRefs.has(sName)) {
          lines.push(`const _${varN} = ${zodCode}`)
        } else {
          lines.push(`const ${varN} = ${zodCode}`)
        }
        lines.push('')
      }
    }
  }

  // Build Input schema (exported for pikku schema discovery)
  if (hasInput && inputCode) {
    lines.push(`export const ${inputName} = ${inputCode}`)
    lines.push('')
  }

  // Build Output schema (exported for pikku schema discovery)
  if (parsed.responseSchema && outputCode) {
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

  // Bug 3: Avoid duplicate identifier when camelName is 'data' (TS2300)
  const inputParamName = camelName === 'data' ? 'inputData' : 'data'
  const funcParams = hasInput
    ? `{ ${camelName} }, ${inputParamName}`
    : `{ ${camelName} }`

  const returnCast = parsed.responseSchema ? ' as any' : ''
  funcConfig.push(
    `  func: async (${funcParams}) => {`,
    `    return ${camelName}.call(${JSON.stringify(method)}, ${JSON.stringify(parsed.path)}${hasInput ? `, ${inputParamName}` : ''})${returnCast}`,
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

  for (const param of deduplicateParams(parsed.pathParams)) {
    if (!emittedNames.has(param.name)) {
      emittedNames.add(param.name)
      props.push(formatParamProp(param, ctx))
    }
  }

  for (const param of deduplicateParams(parsed.queryParams)) {
    if (!emittedNames.has(param.name)) {
      emittedNames.add(param.name)
      props.push(formatParamProp(param, ctx))
    }
  }

  for (const param of deduplicateParams(parsed.headerParams)) {
    if (!emittedNames.has(param.name)) {
      emittedNames.add(param.name)
      props.push(formatParamProp(param, ctx))
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
  if (param.description)
    descParts.push(param.description.replace(/\*\//g, '* /'))
  if (param.example !== undefined)
    descParts.push(`Example: ${JSON.stringify(param.example)}`)

  const desc =
    descParts.length > 0
      ? `${zodCode}.describe(${JSON.stringify(descParts.join('. '))})`
      : zodCode

  return `  ${safeKey(param.name)}: ${desc},`
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
  const { name, pascalName, screamingName } = vars
  const displayName = vars.displayName.replace(/'/g, '')
  const lines: string[] = []

  // Always import all error classes used in the switch statement
  const allErrorClasses = new Set<string>(Object.values(STATUS_TO_ERROR))

  if (flags.credential && flags.credential !== 'oauth2') {
    // Per-user credential: no special imports needed, creds passed via constructor
  } else if (flags.oauth || flags.credential === 'oauth2') {
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

  if (flags.credential && flags.credential !== 'oauth2') {
    const credField = flags.credential === 'bearer' ? 'token' : 'apiKey'
    lines.push('')
    lines.push(
      `  constructor(private creds: { ${credField}: string }, variables: TypedVariablesService) {`
    )
    lines.push(
      `    this.baseUrl = variables.get('${screamingName}_BASE_URL') as string`
    )
    lines.push('  }')
  } else if (flags.oauth || flags.credential === 'oauth2') {
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

  if (flags.credential && flags.credential !== 'oauth2') {
    // Per-user credential: use creds from wire.getCredentials()
    if (flags.credential === 'bearer') {
      lines.push('    headers.Authorization = `Bearer ${this.creds.token}`')
    } else {
      // apikey: check spec for custom header name
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
    }
    lines.push('')
    lines.push('    const response = await fetch(url.toString(), {')
    lines.push('      method,')
    lines.push('      headers,')
    lines.push('      body: body ? JSON.stringify(body) : undefined,')
    lines.push('    })')
  } else if (flags.oauth || flags.credential === 'oauth2') {
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
  const { camelName, screamingName } = vars
  const displayName = vars.displayName.replace(/'/g, '')
  const serverUrls = spec.serverUrls.length > 0 ? spec.serverUrls : []
  const defaultUrl = serverUrls[0]

  const lines: string[] = []
  lines.push("import { z } from 'zod'")
  lines.push("import { wireVariable } from '@pikku/core/variable'")
  lines.push('')

  const schemaVarName = `${camelName}BaseUrlSchema`

  if (serverUrls.length > 0) {
    const urlsLiteral = serverUrls.map((u) => JSON.stringify(u)).join(', ')
    lines.push(
      `export const ${schemaVarName} = z.enum([${urlsLiteral}]).default(${JSON.stringify(defaultUrl)})`
    )
  } else {
    lines.push(
      `export const ${schemaVarName} = z.string().describe('Base URL for the ${displayName} API')`
    )
  }

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
