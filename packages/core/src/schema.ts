import { Logger } from './services/logger.js'
import { SchemaService } from './services/schema-service.js'
import { UnprocessableContentError } from './errors/errors.js'
import { pikkuState } from './pikku-state.js'

/**
 * Adds a schema to the schemas map for a specific package.
 * @param name - The name of the schema.
 * @param value - The schema value.
 * @param packageName - The package name (null for main package, '@scope/package' for external packages).
 * @ignore
 */
export const addSchema = (
  name: string,
  value: any,
  packageName: string | null = null
) => {
  pikkuState(packageName, 'misc', 'schemas').set(name, value)
}

/**
 * Retrieves a schema from the schemas map for a specific package.
 * @param name - The name of the schema.
 * @param packageName - The package name (null for main package, '@scope/package' for external packages).
 * @returns The schema value or undefined if not found.
 * @ignore
 */
export const getSchema = (
  name: string,
  packageName: string | null = null
): Record<string, unknown> | undefined => {
  return pikkuState(packageName, 'misc', 'schemas').get(name)
}

/**
 * Loads a schema and compiles it into a validator.
 * @param logger - A logger for logging information.
 */
export const compileAllSchemas = (
  logger: Logger,
  schemaService?: SchemaService
) => {
  if (!schemaService) {
    throw new Error('SchemaService needs to be defined to load schemas')
  }
  const schemas = pikkuState(null, 'misc', 'schemas')
  for (const [name, schema] of schemas) {
    schemaService.compileSchema(name, schema)
  }
  validateAllSchemasLoaded(logger, schemaService)
}

const validateAllSchemasLoaded = (
  logger: Logger,
  schemaService: SchemaService
) => {
  const routesMeta = pikkuState(null, 'http', 'meta')
  const validators = schemaService.getSchemaNames()

  const missingSchemas: string[] = []

  for (const routePaths of Object.values(routesMeta)) {
    for (const meta of Object.values(routePaths)) {
      const inputs = pikkuState(null, 'function', 'meta')[meta.pikkuFuncName]
        ?.inputs
      const input = inputs?.[0]
      if (!input || validators.has(input)) {
        continue
      }
      missingSchemas.push(input)
    }
  }

  if (missingSchemas.length > 0) {
    logger.error(
      `Error: Failed to load schemas:\n.${missingSchemas.join('\n')}`
    )
    logger.error('\tHave you run the schema generation?')
    logger.error('\tnpx @pikku/cli schemas')
  } else {
    logger.info('All schemas loaded')
  }
}

export const coerceTopLevelDataFromSchema = (
  schemaName: string,
  data: any,
  packageName: string | null = null
) => {
  const schema = pikkuState(packageName, 'misc', 'schemas').get(schemaName)
  for (const key in schema.properties) {
    const property = schema.properties[key]
    if (typeof property === 'boolean') {
      continue
    }
    const type = property.type
    if (typeof type === 'boolean') {
      continue
    }
    if (type === 'array' && typeof data[key] === 'string') {
      data[key] = data[key].split(',')
    } else if (type === 'string' && property.format === 'date-time') {
      data[key] = new Date(data[key])
    }
  }
}

export const validateSchema = async (
  logger: Logger,
  schemaService: SchemaService | undefined,
  schemaName: string | undefined | null,
  data: any,
  packageName: string | null = null
) => {
  if (schemaService) {
    if (!schemaName) {
      if (data && (data.length > 0 || Object.keys(data).length > 0)) {
        logger.warn('No schema provided, but data was passed')
        throw new UnprocessableContentError('No data expected')
      } else {
        return
      }
    }
    logger.debug(
      `[validateSchema] Validating schema '${schemaName}' for package '${packageName ?? 'main'}' with data:`,
      JSON.stringify(data)
    )
    const schemas = pikkuState(packageName, 'misc', 'schemas')
    const schema = schemas.get(schemaName)
    if (schema === undefined) {
      const availableSchemas = Array.from(schemas.keys())
      logger.error(
        `Schema '${schemaName}' not found for package '${packageName ?? 'main'}'. Available schemas: ${availableSchemas.join(', ') || '(none)'}`
      )
    } else {
      logger.debug(
        `[validateSchema] Found schema '${schemaName}':`,
        JSON.stringify(schema)
      )
    }
    await schemaService.compileSchema(schemaName, schema)
    await schemaService.validateSchema(schemaName, data)
  }
}
