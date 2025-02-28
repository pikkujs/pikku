import { Logger } from './services/logger.js'
import { getRoutes } from './http/http-route-runner.js'
import { SchemaService } from './services/schema-service.js'
import { UnprocessableContentError } from './errors/errors.js'

/**
 * Retrieves the global schemas map.
 * @returns A map of schemas.
 */
export const getSchemas = () => {
  if (!global.pikkuSchemas) {
    global.pikkuSchemas = new Map<string, any>()
  }
  return global.pikkuSchemas
}

/**
 * Retrieves a schema from the schemas map.
 * @returns A schema.
 */
export const getSchema = (schemaName: string): any => {
  const schemas = getSchemas()
  const schema = schemas.get(schemaName)
  if (!schema) {
    throw new Error(`Schema not found: ${schemaName}`)
  }
  return schema
}

/**
 * Adds a schema to the global schemas map.
 * @param name - The name of the schema.
 * @param value - The schema value.
 * @ignore
 */
export const addSchema = (name: string, value: any) => {
  getSchemas().set(name, value)
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
  for (const [name, schema] of getSchemas()) {
    schemaService.compileSchema(name, schema)
  }
  validateAllSchemasLoaded(logger, schemaService)
}

const validateAllSchemasLoaded = (
  logger: Logger,
  schemaService: SchemaService
) => {
  const { routesMeta } = getRoutes()
  const validators = schemaService.getSchemaNames()

  const missingSchemas: string[] = []

  for (const route of routesMeta) {
    if (!route.input || validators.has(route.input)) {
      continue
    }
    missingSchemas.push(route.input)
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

export const coerceQueryStringToArray = (schemaName: string, data: any) => {
  const schema = getSchema(schemaName)
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
    }
  }
}

export const validateAndCoerce = (
  logger: Logger,
  schemaService: SchemaService | undefined,
  schemaName: string | undefined | null,
  data: any,
  coerceToArray: boolean
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
    const schema = getSchema(schemaName)
    schemaService.compileSchema(schemaName, schema)
    if (coerceToArray) {
      coerceQueryStringToArray(schemaName, data)
    }
    schemaService.validateSchema(schemaName, data)
  }
}
