import { createGenerator, RootlessError } from 'ts-json-schema-generator'
import { writeFileInDir } from './file-writer.js'
import { mkdir, writeFile } from 'fs/promises'
import { FunctionsMeta, JSONValue } from '@pikku/core'
import { HTTPWiringsMeta } from '@pikku/core/http'
import { TypesMap, ErrorCode, ZodSchemaRef } from '@pikku/inspector'
import { CLILogger } from '../services/cli-logger.service.js'
import { pathToFileURL } from 'url'

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

/**
 * Generate JSON schemas from Zod schema references.
 * Dynamically imports the source files to get the actual Zod schemas,
 * then converts them using zod-to-json-schema.
 */
export async function generateZodSchemas(
  logger: CLILogger,
  zodSchemas: Map<string, ZodSchemaRef>
): Promise<Record<string, JSONValue>> {
  const schemas: Record<string, JSONValue> = {}

  if (zodSchemas.size === 0) {
    return schemas
  }

  // Dynamically import zod-to-json-schema (optional dependency)
  let zodToJsonSchema: any
  try {
    const module = await import('zod-to-json-schema')
    zodToJsonSchema = module.zodToJsonSchema
  } catch {
    logger.warn(
      'zod-to-json-schema is not installed. Skipping Zod schema conversion. Install it with: npm install zod-to-json-schema'
    )
    return schemas
  }

  for (const [schemaName, ref] of zodSchemas.entries()) {
    try {
      // Convert source file path to a compiled JS path
      const compiledPath = ref.sourceFile
        .replace(/\/src\//, '/dist/src/')
        .replace(/\.ts$/, '.js')

      // Import the compiled module to get the Zod schema
      const fileUrl = pathToFileURL(compiledPath).href
      const module = await import(fileUrl)

      const zodSchema = module[ref.variableName]
      if (!zodSchema) {
        logger.warn(
          `Could not find exported schema '${ref.variableName}' in ${compiledPath} for ${schemaName}`
        )
        continue
      }

      // Convert Zod schema to JSON Schema
      const jsonSchema = zodToJsonSchema(zodSchema, {
        $refStrategy: 'none',
        target: 'jsonSchema7',
      })

      // Remove $schema key from output
      const { $schema, ...schemaWithoutMeta } = jsonSchema as Record<
        string,
        unknown
      >

      schemas[schemaName] = schemaWithoutMeta as JSONValue
      logger.info(`• Generated JSON schema from Zod: ${schemaName}`)
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
  zodSchemas?: Map<string, ZodSchemaRef>
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
    ...(zodSchemas ? Array.from(zodSchemas.keys()) : []),
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
    .map(
      (schema) => `
import * as ${schema} from './schemas/${schema}.schema.json' ${supportsImportAttributes ? `with { type: 'json' }` : ''}
addSchema('${schema}', ${schema})
`
    )
    .join('\n')

  await writeFileInDir(
    logger,
    `${schemaParentDir}/register.gen.ts`,
    `import { addSchema } from '@pikku/core/schema'
${schemaImports}`,
    { logWrite: true }
  )
}
