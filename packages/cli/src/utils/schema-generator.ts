import { createGenerator, RootlessError } from 'ts-json-schema-generator'
import { writeFileInDir } from './file-writer.js'
import { mkdir, writeFile } from 'fs/promises'
import { FunctionsMeta, JSONValue } from '@pikku/core'
import { HTTPWiringsMeta } from '@pikku/core/http'
import { TypesMap, ErrorCode, ZodSchemaRef } from '@pikku/inspector'
import { CLILogger } from '../services/cli-logger.service.js'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { tsImport } from 'tsx/esm/api'

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

/**
 * Convert a JSON Schema to a TypeScript type string.
 * Handles common JSON Schema constructs.
 */
function jsonSchemaToTypeString(schema: Record<string, unknown>): string {
  if (!schema || typeof schema !== 'object') {
    return 'unknown'
  }

  const type = schema.type as string | string[] | undefined

  // Handle enums
  if (schema.enum) {
    const enumValues = schema.enum as unknown[]
    return enumValues
      .map((v) => (typeof v === 'string' ? `"${v}"` : String(v)))
      .join(' | ')
  }

  // Handle const
  if ('const' in schema) {
    const constValue = schema.const
    return typeof constValue === 'string'
      ? `"${constValue}"`
      : String(constValue)
  }

  // Handle anyOf/oneOf
  if (schema.anyOf || schema.oneOf) {
    const variants = (schema.anyOf || schema.oneOf) as Record<string, unknown>[]
    return variants.map((v) => jsonSchemaToTypeString(v)).join(' | ')
  }

  // Handle allOf (intersection)
  if (schema.allOf) {
    const variants = schema.allOf as Record<string, unknown>[]
    return variants.map((v) => jsonSchemaToTypeString(v)).join(' & ')
  }

  // Handle arrays
  if (type === 'array') {
    const items = schema.items as Record<string, unknown> | undefined
    const itemType = items ? jsonSchemaToTypeString(items) : 'unknown'
    return `${itemType}[]`
  }

  // Handle objects
  if (type === 'object') {
    const properties = schema.properties as
      | Record<string, Record<string, unknown>>
      | undefined
    const required = (schema.required as string[]) || []
    const additionalProperties = schema.additionalProperties

    if (!properties && additionalProperties === false) {
      return '{}'
    }

    if (!properties) {
      if (additionalProperties === true || additionalProperties === undefined) {
        return 'Record<string, unknown>'
      }
      if (typeof additionalProperties === 'object') {
        return `Record<string, ${jsonSchemaToTypeString(additionalProperties as Record<string, unknown>)}>`
      }
      return 'Record<string, unknown>'
    }

    const props = Object.entries(properties).map(([key, propSchema]) => {
      const isRequired = required.includes(key)
      const propType = jsonSchemaToTypeString(propSchema)
      return `${key}${isRequired ? '' : '?'}: ${propType}`
    })

    return `{ ${props.join('; ')} }`
  }

  // Handle primitive types
  if (type === 'string') return 'string'
  if (type === 'number' || type === 'integer') return 'number'
  if (type === 'boolean') return 'boolean'
  if (type === 'null') return 'null'

  // Handle union types
  if (Array.isArray(type)) {
    return type.map((t) => jsonSchemaToTypeString({ type: t })).join(' | ')
  }

  return 'unknown'
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
    try {
      schemas[schema] = generator.createSchema(schema) as JSONValue
    } catch (e) {
      // Ignore rootless errors
      if (e instanceof RootlessError) {
        logger.error(
          `[${ErrorCode.SCHEMA_NO_ROOT}] Error generating schema since it has no root: ${schema}`
        )
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

  if (zodLookup.size === 0) {
    return schemas
  }

  // Import zod-to-json-schema from the user's project to match their zod version
  let userZodToJsonSchema: typeof zodToJsonSchema
  try {
    const userModule = await tsImport('zod-to-json-schema', import.meta.url)
    userZodToJsonSchema = userModule.zodToJsonSchema as typeof zodToJsonSchema
  } catch {
    // Fall back to CLI's version
    userZodToJsonSchema = zodToJsonSchema
  }

  for (const [schemaName, ref] of zodLookup.entries()) {
    try {
      // Import the TypeScript file directly using tsx loader
      const module = await tsImport(ref.sourceFile, import.meta.url)

      const zodSchema = module[ref.variableName]
      if (!zodSchema) {
        logger.warn(
          `Could not find exported schema '${ref.variableName}' in ${ref.sourceFile} for ${schemaName}. Available exports: ${Object.keys(module).join(', ')}`
        )
        continue
      }

      const jsonSchema = userZodToJsonSchema(zodSchema, {
        $refStrategy: 'none',
        target: 'jsonSchema7',
      })

      const { $schema, ...schemaWithoutMeta } = jsonSchema as Record<
        string,
        unknown
      >

      schemas[schemaName] = schemaWithoutMeta as JSONValue

      // Generate TypeScript type from JSON Schema
      const tsType = jsonSchemaToTypeString(
        schemaWithoutMeta as Record<string, unknown>
      )
      typesMap.addCustomType(schemaName, tsType, [])

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
      .filter(
        (s): s is string =>
          !!s &&
          !['boolean', 'string', 'number', 'null', 'undefined'].includes(s)
      ),
    ...typesMap.customTypes.keys(),
    ...(additionalTypes || []),
    // Add all zod schema names
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
