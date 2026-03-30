import * as ts from 'typescript'
import { dirname, join, resolve } from 'path'
import { createGenerator, RootlessError } from 'ts-json-schema-generator'
import { register, tsImport } from 'tsx/esm/api'
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

  return null
}

// Cached state for schema program reuse across inspect() calls
let cachedSchemaProgram: ts.Program | undefined
let cachedParsedConfig: ts.ParsedCommandLine | undefined
let cachedTsconfigPath: string | undefined
let cachedCustomTypesContent: string | undefined
let cachedTSSchemas: Record<string, JSONValue> | undefined

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
  schemaLookup?: Map<string, SchemaRef>
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

  // Skip ts-json-schema-generator if all schemas are already covered by Zod/primitives
  const uncoveredSchemas = [...schemasSet].filter(
    (s) => !PRIMITIVE_TYPES.has(s) && !schemaLookup?.has(s)
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
    if (schemaLookup?.has(schema)) {
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

  let unregister: (() => void) | undefined
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
    unregister?.()
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

  schemas[schemaName] = schema
  const { node: tsType } = zodToTs(zodSchema, { auxiliaryTypeStore })

  const typeText = printer.printNode(
    ts.EmitHint.Unspecified,
    tsType,
    fakeSourceFile
  )

  typesMap.addCustomType(schemaName, typeText, [])
  logger.debug(`• Generated schema from Zod: ${schemaName}`)
}

async function generateZodSchemas(
  logger: InspectorLogger,
  schemaLookup: Map<string, SchemaRef>,
  typesMap: TypesMap
): Promise<Record<string, JSONValue>> {
  const schemas: Record<string, JSONValue> = {}
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
  console.log(
    `[TIMING] Zod schemas: ${schemaLookup.size} schemas from ${uniqueSourceFiles.length} files`
  )

  const importStart = performance.now()
  const importedModules = await batchImportWithRegister(
    logger,
    uniqueSourceFiles
  )
  console.log(
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
        logger.warn(
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
        logger.warn(
          `Could not convert Zod schema '${schemaName}': ${e instanceof Error ? e.message : e}`
        )
      }
    } else {
      fallbackSchemas.push([schemaName, ref])
    }
  }

  // Fallback: use tsImport for any schemas that batch import couldn't handle
  if (fallbackSchemas.length > 0) {
    logger.debug(
      `Falling back to tsImport for ${fallbackSchemas.length} schema(s)`
    )
    for (const [schemaName, ref] of fallbackSchemas) {
      try {
        const module = await tsImport(ref.sourceFile, import.meta.url)
        const zodSchema = module[ref.variableName]
        if (!zodSchema) {
          logger.warn(
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
        logger.warn(
          `Could not convert Zod schema '${schemaName}': ${e instanceof Error ? e.message : e}`
        )
      }
    }
  }

  console.log(
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

  if (cachedTSSchemas && cachedCustomTypesContent === customTypesContent) {
    logger.debug('Reusing cached TS schemas (types unchanged)')
    return { ...cachedTSSchemas, ...zodSchemas }
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
    state.schemaLookup
  )

  cachedCustomTypesContent = customTypesContent
  cachedTSSchemas = tsSchemas

  return { ...tsSchemas, ...zodSchemas }
}
