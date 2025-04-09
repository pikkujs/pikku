import { Logger } from './services/logger.js'
import { SchemaService } from './services/schema-service.js'
import { UnprocessableContentError } from './errors/errors.js'
import { pikkuState } from './pikku-state.js'

/**
 * Adds a schema to the global schemas map.
 * @param name - The name of the schema.
 * @param value - The schema value.
 * @ignore
 */
export const addSchema = (name: string, value: any) => {
  pikkuState('misc', 'schemas').set(name, value)
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
  const schemas = pikkuState('misc', 'schemas')
  for (const [name, schema] of schemas) {
    schemaService.compileSchema(name, schema)
  }
  validateAllSchemasLoaded(logger, schemaService)
}

const validateAllSchemasLoaded = (
  logger: Logger,
  schemaService: SchemaService
) => {
  const routesMeta = pikkuState('http', 'meta')
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

export const coerceTopLevelDataFromSchema = (schemaName: string, data: any) => {
  const schema = pikkuState('misc', 'schemas').get(schemaName)
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
  data: any
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
    const schema = pikkuState('misc', 'schemas').get(schemaName)
    await schemaService.compileSchema(schemaName, schema)
    await schemaService.validateSchema(schemaName, data)
  }
}
