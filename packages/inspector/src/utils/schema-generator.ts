import * as ts from 'typescript'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { createGenerator, RootlessError } from 'ts-json-schema-generator'
import { register } from 'tsx/esm/api'
import * as z from 'zod'
import { zodToTs, createAuxiliaryTypeStore } from 'zod-to-ts'
import type { FunctionsMeta, JSONValue } from '@pikku/core'
import type { HTTPWiringsMeta } from '@pikku/core/http'
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
    return typeof pkg.version === 'string' ? pkg.version : `v${SCHEMA_CACHE_VERSION}`
  } catch {
    return `v${SCHEMA_CACHE_VERSION}`
  }
})()

// Key the TS-schema cache on everything that affects its output: the generated
// custom-types source, the generator options that change schema shape, and the
// inspector version (schema-format changes ship with a version bump).
function tsSchemaCacheKey(
  customTypesContent: string,
  config: { schemasFromTypes?: string[]; schema?: { additionalProperties?: boolean } }
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

function readDiskTSSchemas(
  logger: InspectorLogger,
  cacheDir: string,
  key: string
): Record<string, JSONValue> | null {
  const file = schemaCacheFile(cacheDir)
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8'))
    if (parsed?.key === key && parsed.schemas) return parsed.schemas
  } catch (e) {
    logger.debug(`Ignoring unreadable TS-schema cache: ${(e as Error).message}`)
  }
  return null
}

function writeDiskTSSchemas(
  logger: InspectorLogger,
  cacheDir: string,
  key: string,
  schemas: Record<string, JSONValue>
): void {
  const file = schemaCacheFile(cacheDir)
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ key, schemas }))
  } catch (e) {
    logger.debug(`Failed to persist TS-schema cache: ${(e as Error).message}`)
  }
}

function createProgramWithVirtualFile(
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
  const fileNames = [...cachedParsedConfig.fileNames, resolvedVirtualPath]

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

  const program = ts.createProgram(
    fileNames,
    cachedParsedConfig.options,
    customHost,
    cachedSchemaProgram // reuse previous program for incremental compilation
  )
  cachedSchemaProgram = program
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
): Record<string, JSONValue> {
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
    return {}
  }
  logger.debug(
    `generateTSSchemas needed for ${uncoveredSchemas.length} types: ${uncoveredSchemas.slice(0, 3).join(', ')}${uncoveredSchemas.length > 3 ? '...' : ''}`
  )

  const virtualFilePath = join(
    dirname(resolve(tsconfig)),
    '__pikku_virtual_types__.ts'
  )
  const program = createProgramWithVirtualFile(
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

  return schemas
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
    ...new Set([...schemaLookup.values()].map((ref) => ref.sourceFile)),
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
    const mod = importedModules?.get(ref.sourceFile)
    if (mod) {
      const zodSchema = mod[ref.variableName]
      if (!zodSchema) {
        errors.push(
          `Could not find exported schema '${ref.variableName}' in ${ref.sourceFile} for ${schemaName}. Available exports: ${Object.keys(mod).join(', ')}`
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
      try {
        const module = await importWithRegister(ref.sourceFile)
        const zodSchema = module[ref.variableName]
        if (!zodSchema) {
          errors.push(
            `Could not find exported schema '${ref.variableName}' in ${ref.sourceFile} for ${schemaName}. Available exports: ${Object.keys(module).join(', ')}`
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

  // Fast path: same process, types unchanged — reuse the in-memory result.
  if (cachedTSSchemas && cachedCustomTypesContent === customTypesContent) {
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
      cachedTSSchemas = disk
      return { ...disk, ...zodSchemas }
    }
  }

  const tsSchemas = generateTSSchemas(
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

  cachedCustomTypesContent = customTypesContent
  cachedTSSchemas = tsSchemas

  if (config.cacheDir && cacheKey) {
    writeDiskTSSchemas(logger, config.cacheDir, cacheKey, tsSchemas)
  }

  return { ...tsSchemas, ...zodSchemas }
}
