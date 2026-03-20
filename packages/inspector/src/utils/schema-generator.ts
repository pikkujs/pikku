import * as ts from 'typescript'
import { statSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { createGenerator, RootlessError } from 'ts-json-schema-generator'
import { tsImport } from 'tsx/esm/api'
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

// Cache for Zod schema results across inspect() calls within the same process
let cachedZodSchemas: Record<string, JSONValue> | undefined
let cachedZodTypesMap: Map<string, string> | undefined
let cachedZodSchemaKey: string | undefined

function computeSchemaLookupKey(schemaLookup: Map<string, SchemaRef>): string {
  const entries: string[] = []
  for (const [name, ref] of schemaLookup.entries()) {
    // Include mtime so watch mode invalidates when files change
    let mtime = ''
    try {
      mtime = String(statSync(ref.sourceFile).mtimeMs)
    } catch {
      // File may not exist yet
    }
    entries.push(`${name}:${ref.sourceFile}:${ref.variableName}:${mtime}`)
  }
  return entries.sort().join('\n')
}

async function generateZodSchemas(
  logger: InspectorLogger,
  schemaLookup: Map<string, SchemaRef>,
  typesMap: TypesMap
): Promise<Record<string, JSONValue>> {
  // Check cache — if schemaLookup entries haven't changed, reuse previous results
  const schemaKey = computeSchemaLookupKey(schemaLookup)
  if (
    cachedZodSchemas &&
    cachedZodTypesMap &&
    cachedZodSchemaKey === schemaKey
  ) {
    logger.debug('Reusing cached Zod schemas (schemaLookup unchanged)')
    // Re-apply the cached typesMap entries
    for (const [name, typeText] of cachedZodTypesMap.entries()) {
      typesMap.addCustomType(name, typeText, [])
    }
    return cachedZodSchemas
  }

  const schemas: Record<string, JSONValue> = {}
  const zodTypesMapEntries = new Map<string, string>()
  const auxiliaryTypeStore = createAuxiliaryTypeStore()
  const printer = ts.createPrinter()
  const fakeSourceFile = ts.createSourceFile(
    'zod-types.ts',
    '',
    ts.ScriptTarget.ESNext,
    false,
    ts.ScriptKind.TS
  )

  // Group schemas by source file to batch imports
  const schemasByFile = new Map<
    string,
    Array<{ schemaName: string; ref: SchemaRef }>
  >()
  for (const [schemaName, ref] of schemaLookup.entries()) {
    if (ref.vendor && ref.vendor !== 'zod') {
      throw new Error(
        `Schema '${schemaName}' uses ${ref.vendor} which is not yet supported for JSON Schema generation. ` +
          `Currently only Zod schemas can be converted to JSON Schema. ` +
          `Please use Zod or contribute support for ${ref.vendor}.`
      )
    }
    const entries = schemasByFile.get(ref.sourceFile)
    if (entries) {
      entries.push({ schemaName, ref })
    } else {
      schemasByFile.set(ref.sourceFile, [{ schemaName, ref }])
    }
  }

  // Import each unique source file once and process all schemas from it
  for (const [sourceFile, entries] of schemasByFile.entries()) {
    let module: Record<string, unknown>
    try {
      module = await tsImport(sourceFile, import.meta.url)
    } catch (e) {
      logger.warn(
        `Could not import ${sourceFile}: ${e instanceof Error ? e.message : e}`
      )
      continue
    }

    for (const { schemaName, ref } of entries) {
      try {
        const zodSchema = module[ref.variableName]
        if (!zodSchema) {
          logger.warn(
            `Could not find exported schema '${ref.variableName}' in ${ref.sourceFile} for ${schemaName}. Available exports: ${Object.keys(module).join(', ')}`
          )
          continue
        }

        const schema = z.toJSONSchema(zodSchema as z.ZodType, {
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
        const { node: tsType } = zodToTs(zodSchema as z.ZodType, {
          auxiliaryTypeStore,
        })

        const typeText = printer.printNode(
          ts.EmitHint.Unspecified,
          tsType,
          fakeSourceFile
        )

        typesMap.addCustomType(schemaName, typeText, [])
        zodTypesMapEntries.set(schemaName, typeText)
        logger.debug(`• Generated schema from Zod: ${schemaName}`)
      } catch (e) {
        logger.warn(
          `Could not convert Zod schema '${schemaName}': ${e instanceof Error ? e.message : e}`
        )
      }
    }
  }

  // Cache results for subsequent inspect() calls
  cachedZodSchemas = schemas
  cachedZodTypesMap = zodTypesMapEntries
  cachedZodSchemaKey = schemaKey

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
