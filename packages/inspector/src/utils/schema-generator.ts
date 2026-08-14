import * as ts from 'typescript'
import { createHash } from 'crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs'
import { dirname, join, resolve } from 'path'
import { createGenerator, RootlessError } from 'ts-json-schema-generator'
import { register } from 'tsx/esm/api'
import * as z from 'zod'
import { zodToTs, createAuxiliaryTypeStore } from 'zod-to-ts'
import type { FunctionsMeta } from '@pikku/core/ecosystem/services'
import type { JSONValue } from '@pikku/core/ecosystem/types'
import type { HTTPWiringsMeta } from '@pikku/core/ecosystem/http'
import type { TypesMap } from '../types-map.js'
import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger, InspectorState, SchemaRef } from '../types.js'
import { generateCustomTypes } from './custom-types-generator.js'

const PRIMITIVE_TYPES = new Set([
  'boolean',
  'string',
  'number',
  'null',
  'undefined',
  'void',
  'any',
  'unknown',
  'never',
])

function primitiveTypeToSchema(typeStr: string): JSONValue | null {
  const normalized = typeStr.trim()

  if (
    normalized === 'void' ||
    normalized === 'undefined' ||
    normalized === 'never'
  ) {
    return null
  }

  if (
    normalized === 'boolean' ||
    normalized === 'false | true' ||
    normalized === 'true | false'
  ) {
    return { type: 'boolean' }
  }
  if (normalized === 'true') {
    return { const: true }
  }
  if (normalized === 'false') {
    return { const: false }
  }

  if (normalized === 'string') {
    return { type: 'string' }
  }

  if (normalized === 'number') {
    return { type: 'number' }
  }

  if (normalized === 'null') {
    return { type: 'null' }
  }

  if (normalized === 'any' || normalized === 'unknown') {
    return {}
  }

  return null
}

// Cached state for schema program reuse across inspect() calls
let cachedSchemaProgram: ts.Program | undefined
let cachedParsedConfig: ts.ParsedCommandLine | undefined
let cachedTsconfigPath: string | undefined
let cachedCustomTypesContent: string | undefined
let cachedTSSchemas: Record<string, JSONValue> | undefined
let cachedTSSchemaDeps: SchemaDep[] | undefined

const SCHEMA_CACHE_VERSION = 1

// This package's own version — folded into the cache key so that upgrading
// @pikku/inspector (the channel through which a schema-format change ships)
// auto-invalidates every on-disk cache, without relying on someone remembering
// to bump SCHEMA_CACHE_VERSION. Read once; falls back to the constant if the
// package.json can't be located (e.g. an unexpected bundling layout).
const inspectorVersion: string = (() => {
  try {
    const pkgUrl = new URL('../../package.json', import.meta.url)
    const pkg = JSON.parse(readFileSync(pkgUrl, 'utf-8'))
    return typeof pkg.version === 'string'
      ? pkg.version
      : `v${SCHEMA_CACHE_VERSION}`
  } catch {
    return `v${SCHEMA_CACHE_VERSION}`
  }
})()

// Key the TS-schema cache on everything that affects its output: the generated
// custom-types source, the generator options that change schema shape, and the
// inspector version (schema-format changes ship with a version bump).
function tsSchemaCacheKey(
  customTypesContent: string,
  config: {
    schemasFromTypes?: string[]
    schema?: { additionalProperties?: boolean }
  }
): string {
  return createHash('sha1')
    .update(`v${SCHEMA_CACHE_VERSION}\0`)
    .update(`pkg:${inspectorVersion}\0`)
    .update(`ap:${config.schema?.additionalProperties ? 1 : 0}\0`)
    .update(`ft:${(config.schemasFromTypes ?? []).join(',')}\0`)
    .update(customTypesContent)
    .digest('hex')
}

function schemaCacheFile(cacheDir: string): string {
  return join(cacheDir, 'ts-schemas.json')
}

/** One file the generated schemas were derived from, as of when they were generated. */
export type SchemaDep = { path: string; mtimeMs: number; size: number }

/**
 * The files a set of generated schemas was actually derived from.
 *
 * The cache key alone cannot answer whether the schemas are stale. It hashes the
 * *synthesized* custom-types source, but a named type — `KnowledgeBundle`,
 * `DbSchema`, anything a function declares as its input or output — appears
 * there only as a name; its definition is resolved out of a project file or a
 * dependency's `.d.ts`. Edit one of those and the key is unchanged, so a stale
 * schema is served for a type that no longer looks like that. The failure is
 * silent and outlives `rm -rf .pikku`, because this cache lives in
 * `node_modules/.cache`.
 *
 * The program is rooted at the virtual file, so its source files are exactly the
 * transitive closure the schemas depend on — nothing wider, nothing missed.
 * Default-lib files are skipped: they change only when TypeScript itself does,
 * which the inspector version in the key already covers.
 */
function fingerprintSchemaDeps(program: ts.Program): SchemaDep[] {
  const deps: SchemaDep[] = []
  for (const sourceFile of program.getSourceFiles()) {
    if (program.isSourceFileDefaultLibrary(sourceFile)) continue
    try {
      const stat = statSync(sourceFile.fileName)
      deps.push({
        path: sourceFile.fileName,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
      })
    } catch {
      // The virtual root has no file on disk. Its content is the custom-types
      // source, which the cache key already hashes.
    }
  }
  return deps
}

/**
 * Whether every file the schemas were derived from is still exactly as it was.
 *
 * mtime-and-size rather than a content hash: this runs on the cache-hit path,
 * where the whole point is to answer in milliseconds without building a TS
 * program. Anything that rewrites a file — a dependency rebuild, a checkout, an
 * edit — moves its mtime, and a missing file reads as changed, so the answer errs
 * toward regenerating.
 */
function schemaDepsUnchanged(deps: unknown): boolean {
  if (!Array.isArray(deps)) return false
  for (const dep of deps as SchemaDep[]) {
    if (!dep || typeof dep.path !== 'string') return false
    try {
      const stat = statSync(dep.path)
      if (stat.mtimeMs !== dep.mtimeMs || stat.size !== dep.size) return false
    } catch {
      return false
    }
  }
  return true
}

export function readDiskTSSchemas(
  logger: InspectorLogger,
  cacheDir: string,
  key: string
): { schemas: Record<string, JSONValue>; deps: SchemaDep[] } | null {
  const file = schemaCacheFile(cacheDir)
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8'))
    if (parsed?.key !== key || !parsed.schemas) return null
    if (!schemaDepsUnchanged(parsed.deps)) {
      logger.debug(
        'Discarding TS-schema cache: a type it was built from changed'
      )
      return null
    }
    return { schemas: parsed.schemas, deps: parsed.deps }
  } catch (e) {
    logger.debug(`Ignoring unreadable TS-schema cache: ${(e as Error).message}`)
  }
  return null
}

export function writeDiskTSSchemas(
  logger: InspectorLogger,
  cacheDir: string,
  key: string,
  schemas: Record<string, JSONValue>,
  deps: SchemaDep[]
): void {
  const file = schemaCacheFile(cacheDir)
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ key, schemas, deps }))
  } catch (e) {
    logger.debug(`Failed to persist TS-schema cache: ${(e as Error).message}`)
  }
}

function createProgramWithVirtualFile(
  logger: InspectorLogger,
  tsconfig: string,
  virtualFilePath: string,
  virtualFileContent: string
): ts.Program {
  const configPath = resolve(tsconfig)

  // Cache the parsed tsconfig — it doesn't change between runs
  if (!cachedParsedConfig || cachedTsconfigPath !== configPath) {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
    const basePath = dirname(configPath)
    cachedParsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      basePath
    )
    cachedTsconfigPath = configPath
    cachedSchemaProgram = undefined
  }

  const resolvedVirtualPath = resolve(virtualFilePath)
  // The virtual file imports every type it references, so it is a complete root
  // on its own and TypeScript pulls in exactly the transitive closure it needs.
  // Rooting at cachedParsedConfig.fileNames instead loaded the whole project
  // (2572 files vs 870 on a real tree) without widening what could be resolved.
  const fileNames = [resolvedVirtualPath]

  const defaultHost = ts.createCompilerHost(cachedParsedConfig.options)
  const customHost: ts.CompilerHost = {
    ...defaultHost,
    getSourceFile(
      fileName,
      languageVersionOrOptions,
      onError,
      shouldCreateNewSourceFile
    ) {
      if (resolve(fileName) === resolvedVirtualPath) {
        return ts.createSourceFile(
          fileName,
          virtualFileContent,
          languageVersionOrOptions
        )
      }
      return defaultHost.getSourceFile(
        fileName,
        languageVersionOrOptions,
        onError,
        shouldCreateNewSourceFile
      )
    },
    fileExists(fileName) {
      if (resolve(fileName) === resolvedVirtualPath) return true
      return defaultHost.fileExists(fileName)
    },
    readFile(fileName) {
      if (resolve(fileName) === resolvedVirtualPath) return virtualFileContent
      return defaultHost.readFile(fileName)
    },
  }

  const startProgram = performance.now()
  const program = ts.createProgram(
    fileNames,
    cachedParsedConfig.options,
    customHost,
    cachedSchemaProgram // reuse previous program for incremental compilation
  )
  cachedSchemaProgram = program
  logger.debug(
    `Created schema program in ${(performance.now() - startProgram).toFixed(0)}ms (${program.getSourceFiles().length} files)`
  )
  return program
}

function generateTSSchemas(
  logger: InspectorLogger,
  tsconfig: string,
  customTypesContent: string,
  typesMap: TypesMap,
  functionMeta: FunctionsMeta,
  httpWiringsMeta: HTTPWiringsMeta,
  additionalTypes?: string[],
  additionalProperties: boolean = false,
  generatedZodSchemas?: Record<string, JSONValue>
): { schemas: Record<string, JSONValue>; deps: SchemaDep[] } {
  const schemasSet = new Set(typesMap.customTypes.keys())
  for (const { inputs, outputs } of Object.values(functionMeta)) {
    const types = [...(inputs || []), ...(outputs || [])]
    for (const type of types) {
      try {
        const uniqueName = typesMap.getUniqueName(type)
        if (uniqueName) {
          schemasSet.add(uniqueName)
        }
      } catch {
        // Skip types not in typesMap (e.g., inline types in generated workflow workers)
      }
    }
  }

  for (const wiringRoutes of Object.values(httpWiringsMeta)) {
    for (const { inputTypes } of Object.values(wiringRoutes)) {
      if (inputTypes?.body) {
        schemasSet.add(inputTypes.body)
      }
      if (inputTypes?.query) {
        schemasSet.add(inputTypes.query)
      }
      if (inputTypes?.params) {
        schemasSet.add(inputTypes.params)
      }
    }
  }

  if (additionalTypes) {
    for (const type of additionalTypes) {
      schemasSet.add(type)
    }
  }

  // Skip ts-json-schema-generator if all schemas are already covered by Zod/primitives.
  // Use generatedZodSchemas (actually converted) rather than schemaLookup (all attempted)
  // so that failed Zod conversions fall through to TS schema generation.
  const uncoveredSchemas = [...schemasSet].filter(
    (s) => !PRIMITIVE_TYPES.has(s) && !generatedZodSchemas?.[s]
  )
  if (uncoveredSchemas.length === 0) {
    return { schemas: {}, deps: [] }
  }
  logger.debug(
    `generateTSSchemas needed for ${uncoveredSchemas.length} types: ${uncoveredSchemas.slice(0, 3).join(', ')}${uncoveredSchemas.length > 3 ? '...' : ''}`
  )

  const virtualFilePath = join(
    dirname(resolve(tsconfig)),
    '__pikku_virtual_types__.ts'
  )
  const program = createProgramWithVirtualFile(
    logger,
    tsconfig,
    virtualFilePath,
    customTypesContent
  )

  const generator = createGenerator({
    tsProgram: program,
    skipTypeCheck: true,
    topRef: false,
    discriminatorType: 'open-api',
    expose: 'export',
    jsDoc: 'extended',
    sortProps: true,
    strictTuples: false,
    encodeRefs: false,
    additionalProperties,
  })
  const schemas: Record<string, JSONValue> = {}

  schemasSet.forEach((schema) => {
    if (PRIMITIVE_TYPES.has(schema)) {
      return
    }
    if (generatedZodSchemas?.[schema]) {
      return
    }
    try {
      schemas[schema] = generator.createSchema(schema) as JSONValue
    } catch (e) {
      if (e instanceof RootlessError) {
        const customType = typesMap.customTypes.get(schema)
        if (customType) {
          const primitiveSchema = primitiveTypeToSchema(customType.type)
          if (primitiveSchema) {
            schemas[schema] = primitiveSchema
          }
        }
        return
      }
      const customType = typesMap.customTypes.get(schema)
      logger.error(
        `[${ErrorCode.SCHEMA_GENERATION_ERROR}] Error generating schema: ${schema}. Message: ${(e as Error).message}. Type info: ${customType ? `type=${customType.type}` : 'not in typesMap'}`
      )
    }
  })

  // Fingerprinted here, while the program is still alive — it is released as soon
  // as the schemas are out of it.
  return { schemas, deps: fingerprintSchemaDeps(program) }
}

/**
 * Where the RUNTIME value of a schema lives, given where TypeScript resolved it.
 *
 * A schema imported from a built workspace package resolves to that package's
 * declaration file, and importing a `.d.ts` yields a module with no exports at
 * all — every one of them is a type. The value is in the emitted JS beside it, so
 * that is what gets imported.
 *
 * Falls back to the original path when no sibling JS exists, which keeps the
 * "could not find exported schema" error pointing at the file the developer
 * actually wrote.
 */
export const schemaRuntimeFile = (sourceFile: string): string => {
  const match = /\.d\.([cm]?)ts$/.exec(sourceFile)
  if (!match) return sourceFile
  const emitted = sourceFile.replace(/\.d\.([cm]?)ts$/, '.$1js')
  return existsSync(emitted) ? emitted : sourceFile
}

/**
 * Import all source files in parallel using tsx's register() API.
 *
 * tsx's register() sets up the TypeScript loader once, then all subsequent
 * import() calls reuse that loader. This is dramatically faster than calling
 * tsImport() per-file because tsImport() sets up and tears down a fresh
 * compilation context for each call (~170ms each).
 *
 * With register() + parallel import():
 *   - 71 files: ~350ms total
 *   - vs tsImport loop: ~12,000ms (71 * 170ms)
 *
 * Falls back to serial tsImport() per-file if register() is unavailable.
 */
async function batchImportWithRegister(
  logger: InspectorLogger,
  sourceFiles: string[]
): Promise<Map<string, Record<string, any>> | null> {
  if (sourceFiles.length === 0) return new Map()

  let unregister: (() => void | Promise<void>) | undefined
  try {
    unregister = register()

    const modules = new Map<string, Record<string, any>>()
    const results = await Promise.allSettled(
      sourceFiles.map(async (srcPath) => {
        const mod = await import(srcPath)
        modules.set(srcPath, mod)
      })
    )

    const failures = results.filter((r) => r.status === 'rejected')
    if (failures.length > 0) {
      logger.debug(
        `${failures.length}/${sourceFiles.length} files failed to import via register()`
      )
    }

    return modules
  } catch (e) {
    logger.debug(`tsx register() batch import failed: ${(e as Error).message}`)
    return null
  } finally {
    void Promise.resolve(unregister?.()).catch((e) => {
      logger.debug(`tsx unregister() failed: ${(e as Error).message}`)
    })
  }
}

async function importWithRegister(
  sourceFile: string
): Promise<Record<string, any>> {
  const unregister = register()
  try {
    return await import(sourceFile)
  } finally {
    void Promise.resolve(unregister()).catch(() => {})
  }
}

function processZodSchema(
  schemaName: string,
  zodSchema: any,
  schemas: Record<string, JSONValue>,
  typesMap: TypesMap,
  auxiliaryTypeStore: ReturnType<typeof createAuxiliaryTypeStore>,
  printer: ts.Printer,
  fakeSourceFile: ts.SourceFile,
  logger: InspectorLogger
): void {
  const schema = z.toJSONSchema(zodSchema, {
    unrepresentable: 'any',
    override: ({ zodSchema, jsonSchema }) => {
      if ((zodSchema as any)._zod?.def?.type === 'date') {
        ;(jsonSchema as any).type = 'string'
        ;(jsonSchema as any).format = 'date-time'
      }
    },
  }) as any

  if (schema.required && schema.properties) {
    schema.required = schema.required.filter((fieldName: string) => {
      const prop = schema.properties[fieldName]
      return prop && prop.default === undefined
    })
    if (schema.required.length === 0) {
      delete schema.required
    }
  }

  const { node: tsType } = zodToTs(zodSchema, { auxiliaryTypeStore })

  const typeText = printer.printNode(
    ts.EmitHint.Unspecified,
    tsType,
    fakeSourceFile
  )

  typesMap.addCustomType(schemaName, typeText, [])
  schemas[schemaName] = schema
  logger.debug(`• Generated schema from Zod: ${schemaName}`)
}

async function generateZodSchemas(
  logger: InspectorLogger,
  schemaLookup: Map<string, SchemaRef>,
  typesMap: TypesMap
): Promise<Record<string, JSONValue>> {
  const schemas: Record<string, JSONValue> = {}
  const errors: string[] = []
  const auxiliaryTypeStore = createAuxiliaryTypeStore()
  const printer = ts.createPrinter()
  const fakeSourceFile = ts.createSourceFile(
    'zod-types.ts',
    '',
    ts.ScriptTarget.ESNext,
    false,
    ts.ScriptKind.TS
  )

  // Validate all schemas are zod (or unspecified vendor)
  for (const [schemaName, ref] of schemaLookup.entries()) {
    if (ref.vendor && ref.vendor !== 'zod') {
      throw new Error(
        `Schema '${schemaName}' uses ${ref.vendor} which is not yet supported for JSON Schema generation. ` +
          `Currently only Zod schemas can be converted to JSON Schema. ` +
          `Please use Zod or contribute support for ${ref.vendor}.`
      )
    }
  }

  // Collect unique source files and batch-import them in parallel
  const uniqueSourceFiles = [
    ...new Set(
      [...schemaLookup.values()].map((ref) => schemaRuntimeFile(ref.sourceFile))
    ),
  ]
  logger.debug(
    `[TIMING] Zod schemas: ${schemaLookup.size} schemas from ${uniqueSourceFiles.length} files`
  )

  const importStart = performance.now()
  const importedModules = await batchImportWithRegister(
    logger,
    uniqueSourceFiles
  )
  logger.debug(
    `[TIMING] Batch import: ${(performance.now() - importStart).toFixed(0)}ms`
  )

  const processStart = performance.now()
  // Track schemas that need per-file tsImport fallback
  const fallbackSchemas: [string, SchemaRef][] = []

  for (const [schemaName, ref] of schemaLookup.entries()) {
    const runtimeFile = schemaRuntimeFile(ref.sourceFile)
    const mod = importedModules?.get(runtimeFile)
    if (mod) {
      const zodSchema = mod[ref.variableName]
      if (!zodSchema) {
        errors.push(
          `Could not find exported schema '${ref.variableName}' in ${runtimeFile} for ${schemaName}. Available exports: ${Object.keys(mod).join(', ')}`
        )
        continue
      }
      try {
        processZodSchema(
          schemaName,
          zodSchema,
          schemas,
          typesMap,
          auxiliaryTypeStore,
          printer,
          fakeSourceFile,
          logger
        )
      } catch (e) {
        errors.push(
          `Could not convert Zod schema '${schemaName}': ${e instanceof Error ? e.message : e}`
        )
      }
    } else {
      fallbackSchemas.push([schemaName, ref])
    }
  }

  // Fallback: use a scoped tsx register/import cycle for any schemas that
  // batch import couldn't handle. Avoid tsImport() here because its ESM path
  // can leave loader plumbing alive after failed imports, which prevents the
  // CLI process from exiting on schema errors.
  if (fallbackSchemas.length > 0) {
    logger.debug(
      `Falling back to register() import for ${fallbackSchemas.length} schema(s)`
    )
    for (const [schemaName, ref] of fallbackSchemas) {
      const runtimeFile = schemaRuntimeFile(ref.sourceFile)
      try {
        const module = await importWithRegister(runtimeFile)
        const zodSchema = module[ref.variableName]
        if (!zodSchema) {
          errors.push(
            `Could not find exported schema '${ref.variableName}' in ${runtimeFile} for ${schemaName}. Available exports: ${Object.keys(module).join(', ')}`
          )
          continue
        }
        processZodSchema(
          schemaName,
          zodSchema,
          schemas,
          typesMap,
          auxiliaryTypeStore,
          printer,
          fakeSourceFile,
          logger
        )
      } catch (e) {
        errors.push(
          `Could not convert Zod schema '${schemaName}': ${e instanceof Error ? e.message : e}`
        )
      }
    }
  }

  if (errors.length > 0) {
    for (const message of errors) {
      logger.error(message)
    }
    throw new Error(
      `Schema generation failed for ${errors.length} schema${errors.length === 1 ? '' : 's'}`
    )
  }

  logger.debug(
    `[TIMING] Process schemas: ${(performance.now() - processStart).toFixed(0)}ms (${Object.keys(schemas).length} generated)`
  )
  return schemas
}

export async function generateAllSchemas(
  logger: InspectorLogger,
  config: {
    tsconfig: string
    schemasFromTypes?: string[]
    schema?: { additionalProperties?: boolean }
    cacheDir?: string
  },
  state: InspectorState
): Promise<Record<string, JSONValue>> {
  const zodSchemas = await generateZodSchemas(
    logger,
    state.schemaLookup,
    state.functions.typesMap
  )

  const requiredTypes = new Set<string>()
  const customTypesContent = generateCustomTypes(
    state.functions.typesMap,
    requiredTypes
  )

  // Fast path: same process, types unchanged — reuse the in-memory result. The
  // dep check is what makes this correct under `pikku dev`, where the process
  // outlives the edits: the custom-types source is identical whenever a named
  // type changes shape without changing its name.
  if (
    cachedTSSchemas &&
    cachedCustomTypesContent === customTypesContent &&
    schemaDepsUnchanged(cachedTSSchemaDeps)
  ) {
    logger.debug('Reusing cached TS schemas (types unchanged)')
    return { ...cachedTSSchemas, ...zodSchemas }
  }

  // Disk path: a prior `pikku all` left a cache whose key matches the current
  // custom types — load it and skip ts-json-schema-generator (the dominant
  // cold-run cost). Zod schemas are always regenerated (cheap, ~1ms/schema).
  const cacheKey = config.cacheDir
    ? tsSchemaCacheKey(customTypesContent, config)
    : null
  if (config.cacheDir && cacheKey) {
    const disk = readDiskTSSchemas(logger, config.cacheDir, cacheKey)
    if (disk) {
      logger.debug('Reusing on-disk TS schemas (types unchanged across runs)')
      cachedCustomTypesContent = customTypesContent
      cachedTSSchemas = disk.schemas
      cachedTSSchemaDeps = disk.deps
      return { ...disk.schemas, ...zodSchemas }
    }
  }

  const { schemas: tsSchemas, deps: tsSchemaDeps } = generateTSSchemas(
    logger,
    config.tsconfig,
    customTypesContent,
    state.functions.typesMap,
    state.functions.meta,
    state.http.meta,
    config.schemasFromTypes,
    config.schema?.additionalProperties,
    zodSchemas
  )

  // Release the program once the schemas are out of it. It spans the whole
  // tsconfig (~2.5k files, ~600MB on a large tree) and was previously pinned at
  // module scope for the life of the process, so it stacked on top of the main
  // inspector program and pushed `pikku all` past a 2GB heap (#982). The result
  // cache below is what the same-process fast path actually needs; the program
  // only bought incremental reuse on a rebuild, at a cost that dwarfs it.
  cachedSchemaProgram = undefined

  cachedCustomTypesContent = customTypesContent
  cachedTSSchemas = tsSchemas
  cachedTSSchemaDeps = tsSchemaDeps

  if (config.cacheDir && cacheKey) {
    writeDiskTSSchemas(
      logger,
      config.cacheDir,
      cacheKey,
      tsSchemas,
      tsSchemaDeps
    )
  }

  return { ...tsSchemas, ...zodSchemas }
}
