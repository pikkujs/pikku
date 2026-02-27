import * as ts from 'typescript'
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

function createProgramWithVirtualFile(
  tsconfig: string,
  virtualFilePath: string,
  virtualFileContent: string
): ts.Program {
  const configPath = resolve(tsconfig)
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  const basePath = dirname(configPath)
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    basePath
  )

  const resolvedVirtualPath = resolve(virtualFilePath)
  const fileNames = [...parsedConfig.fileNames, resolvedVirtualPath]

  const defaultHost = ts.createCompilerHost(parsedConfig.options)
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

  return ts.createProgram(fileNames, parsedConfig.options, customHost)
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

  for (const [schemaName, ref] of schemaLookup.entries()) {
    if (ref.vendor && ref.vendor !== 'zod') {
      throw new Error(
        `Schema '${schemaName}' uses ${ref.vendor} which is not yet supported for JSON Schema generation. ` +
          `Currently only Zod schemas can be converted to JSON Schema. ` +
          `Please use Zod or contribute support for ${ref.vendor}.`
      )
    }

    try {
      const module = await tsImport(ref.sourceFile, import.meta.url)
      const zodSchema = module[ref.variableName]
      if (!zodSchema) {
        logger.warn(
          `Could not find exported schema '${ref.variableName}' in ${ref.sourceFile} for ${schemaName}. Available exports: ${Object.keys(module).join(', ')}`
        )
        continue
      }

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
    } catch (e) {
      logger.warn(
        `Could not convert Zod schema '${schemaName}': ${e instanceof Error ? e.message : e}`
      )
    }
  }

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

  return { ...tsSchemas, ...zodSchemas }
}
