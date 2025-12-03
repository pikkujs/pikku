import { createGenerator, RootlessError } from 'ts-json-schema-generator'
import { writeFileInDir } from './file-writer.js'
import { mkdir, writeFile } from 'fs/promises'
import { FunctionsMeta, JSONValue } from '@pikku/core'
import { HTTPWiringsMeta } from '@pikku/core/http'
import { TypesMap, ErrorCode, ZodSchemaRef } from '@pikku/inspector'
import { CLILogger } from '../services/cli-logger.service.js'
import { tsImport } from 'tsx/esm/api'
import * as z from 'zod'
import { zodToTs, createAuxiliaryTypeStore } from 'zod-to-ts'
import {
  createPrinter,
  createSourceFile,
  EmitHint,
  ScriptKind,
  ScriptTarget,
} from 'typescript'

/**
 * Convert a name to a valid JavaScript identifier.
 * Replaces hyphens and other invalid characters with underscores.
 */
function toValidIdentifier(name: string): string {
  // Replace hyphens and dots with underscores
  let result = name.replace(/[-./]/g, '_')
  // If starts with a number, prefix with underscore
  if (/^\d/.test(result)) {
    result = '_' + result
  }
  return result
}

/** Primitive types that don't need schema generation */
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

/** Map TypeScript type strings to JSON Schema. Returns null if no schema should be generated. */
function primitiveTypeToSchema(typeStr: string): JSONValue | null {
  const normalized = typeStr.trim()

  // void/undefined/never mean no data - don't generate a schema
  if (
    normalized === 'void' ||
    normalized === 'undefined' ||
    normalized === 'never'
  ) {
    return null
  }

  // Handle boolean literals
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

  // Handle string
  if (normalized === 'string') {
    return { type: 'string' }
  }

  // Handle number
  if (normalized === 'number') {
    return { type: 'number' }
  }

  // Handle null
  if (normalized === 'null') {
    return { type: 'null' }
  }

  return null
}

export async function generateSchemas(
  logger: CLILogger,
  tsconfig: string,
  typesMap: TypesMap,
  functionMeta: FunctionsMeta,
  httpWiringsMeta: HTTPWiringsMeta,
  additionalTypes?: string[],
  additionalProperties: boolean = false
): Promise<Record<string, JSONValue>> {
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

  // Add additional types from schemasFromTypes config
  if (additionalTypes) {
    for (const type of additionalTypes) {
      schemasSet.add(type)
    }
  }

  const generator = createGenerator({
    tsconfig,
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
    // Skip primitive types - they don't need schema generation
    if (PRIMITIVE_TYPES.has(schema)) {
      return
    }
    try {
      schemas[schema] = generator.createSchema(schema) as JSONValue
    } catch (e) {
      // Handle rootless errors - type aliases that resolve to primitives
      if (e instanceof RootlessError) {
        const customType = typesMap.customTypes.get(schema)
        if (customType) {
          const primitiveSchema = primitiveTypeToSchema(customType.type)
          if (primitiveSchema) {
            schemas[schema] = primitiveSchema
          }
          // If primitiveSchema is null (void/undefined), we just skip - no schema needed
        }
        return
      }
      logger.error(
        `[${ErrorCode.SCHEMA_GENERATION_ERROR}] Error generating schema: ${schema}. Message: ${e.message}`
      )
    }
  })

  return schemas
}

export async function generateZodSchemas(
  logger: CLILogger,
  zodLookup: Map<string, ZodSchemaRef>,
  typesMap: TypesMap
): Promise<Record<string, JSONValue>> {
  const schemas: Record<string, JSONValue> = {}
  const auxiliaryTypeStore = createAuxiliaryTypeStore()
  const printer = createPrinter()
  const fakeSourceFile = createSourceFile(
    'zod-types.ts',
    '',
    ScriptTarget.ESNext,
    false,
    ScriptKind.TS
  )

  for (const [schemaName, ref] of zodLookup.entries()) {
    try {
      const module = await tsImport(ref.sourceFile, import.meta.url)
      const zodSchema = module[ref.variableName]
      if (!zodSchema) {
        logger.warn(
          `Could not find exported schema '${ref.variableName}' in ${ref.sourceFile} for ${schemaName}. Available exports: ${Object.keys(module).join(', ')}`
        )
        continue
      }

      const schema = z.toJSONSchema(zodSchema) as any

      // Remove fields with defaults from the required array
      // Fields with defaults are semantically optional in input validation
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
        EmitHint.Unspecified,
        tsType,
        fakeSourceFile
      )

      typesMap.addCustomType(schemaName, typeText, [])
      logger.info(`• Generated schema from Zod: ${schemaName}`)
    } catch (e) {
      logger.warn(
        `Could not convert Zod schema '${schemaName}': ${e instanceof Error ? e.message : e}`
      )
    }
  }

  return schemas
}

export async function saveSchemas(
  logger: CLILogger,
  schemaParentDir: string,
  schemas: Record<string, JSONValue>,
  typesMap: TypesMap,
  functionsMeta: FunctionsMeta,
  supportsImportAttributes: boolean,
  additionalTypes?: string[],
  zodLookup?: Map<string, ZodSchemaRef>
) {
  await writeFileInDir(
    logger,
    `${schemaParentDir}/register.gen.ts`,
    'export const empty = null;'
  )

  const desiredSchemas = new Set<string>([
    ...Object.values(functionsMeta)
      .map(({ inputs, outputs }) => {
        const types: (string | undefined)[] = []
        if (inputs?.[0]) {
          try {
            types.push(typesMap.getUniqueName(inputs[0]))
          } catch {
            // Skip types not in typesMap - might be a zod schema name
            types.push(inputs[0])
          }
        }
        if (outputs?.[0]) {
          try {
            types.push(typesMap.getUniqueName(outputs[0]))
          } catch {
            // Skip types not in typesMap - might be a zod schema name
            types.push(outputs[0])
          }
        }
        return types
      })
      .flat()
      .filter((s): s is string => !!s && !PRIMITIVE_TYPES.has(s)),
    ...typesMap.customTypes.keys(),
    ...(additionalTypes || []),
    ...(zodLookup ? Array.from(zodLookup.keys()) : []),
  ])

  if (desiredSchemas.size === 0) {
    logger.info(`• Skipping schemas since none found.\x1b[0m`)
    return
  }

  await mkdir(`${schemaParentDir}/schemas`, { recursive: true })
  await Promise.all(
    Object.entries(schemas).map(async ([schemaName, schema]) => {
      if (desiredSchemas.has(schemaName)) {
        await writeFile(
          `${schemaParentDir}/schemas/${schemaName}.schema.json`,
          JSON.stringify(schema),
          'utf-8'
        )
      }
    })
  )

  // Only include schemas that were successfully generated
  const availableSchemas = Array.from(desiredSchemas).filter(
    (schema) => schemas[schema]
  )

  const schemaImports = availableSchemas
    .map((schema) => {
      const identifier = toValidIdentifier(schema)
      return `
import * as ${identifier} from './schemas/${schema}.schema.json' ${supportsImportAttributes ? `with { type: 'json' }` : ''}
addSchema('${schema}', ${identifier})
`
    })
    .join('\n')

  await writeFileInDir(
    logger,
    `${schemaParentDir}/register.gen.ts`,
    `import { addSchema } from '@pikku/core/schema'
${schemaImports}`,
    { logWrite: true }
  )
}
