import type { Logger } from './services/logger.js'
import type { SchemaService } from './services/schema-service.js'
import {
  MissingSchemaError,
  UnprocessableContentError,
} from './errors/errors.js'
import { pikkuState, getAllPackageStates } from './pikku-state.js'

const schemaKey = (name: string, packageName: string | null): string =>
  packageName ? `${packageName}:${name}` : name

/**
 * Adds a schema to the schemas map for a specific package.
 * @param name - The name of the schema.
 * @param value - The schema value.
 * @param packageName - The package name (null for main package, '@scope/package' for addon packages).
 * @ignore
 */
export const addSchema = (
  name: string,
  value: any,
  packageName: string | null = null
) => {
  const schema = value?.default ?? value
  pikkuState(packageName, 'misc', 'schemas').set(name, schema)
}

/**
 * Retrieves a schema from the schemas map for a specific package.
 * @param name - The name of the schema.
 * @param packageName - The package name (null for main package, '@scope/package' for addon packages).
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
    schemaService = pikkuState(null, 'package', 'singletonServices')?.schema
  }
  if (!schemaService) {
    throw new Error('SchemaService needs to be defined to load schemas')
  }
  for (const [pkgName, packageState] of getAllPackageStates()) {
    const resolvedPkgName = pkgName === '__main__' ? null : pkgName
    for (const [name, schema] of packageState.misc.schemas) {
      schemaService.compileSchema(schemaKey(name, resolvedPkgName), schema)
    }
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
      const inputs = pikkuState(null, 'function', 'meta')[meta.pikkuFuncId]
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

/**
 * Fill in absent top-level properties from their schema `default`.
 *
 * A `default` reaches the generated JSON Schema and keeps the property out of
 * `required`, so omitting it validates — but nothing was ever filling it in.
 * JSON Schema validators are pure by specification and none of the ones Pikku
 * ships with (`@cfworker/json-schema`, and Ajv unless `useDefaults` is set)
 * annotate the instance, so the function received `undefined` for a property
 * its generated type declares as present. That is the worst shape a mismatch
 * can take: validation permits the omission, the type says the value is there,
 * and the body reads `undefined`.
 *
 * Applied unconditionally rather than alongside `coerceTopLevelDataFromSchema`,
 * whose `coerceDataFromSchema` flag is about decoding transport-encoded values
 * (a query string's `"1,2"` into an array). Defaults are a property of the
 * schema, not of how the call arrived, so gating them on that flag would apply
 * them over HTTP and skip them on a direct RPC invocation.
 *
 * Returns the data to use, which is a new object only when defaults had to be
 * added to a nullish input — a call made with no arguments at all still gets
 * them. Values are cloned so an object or array default (`[]`, `{}`) is never
 * shared as one mutable instance across every request.
 */
export const applyDefaultsFromSchema = (
  schemaName: string,
  data: any,
  packageName: string | null = null
) => {
  const schema = pikkuState(packageName, 'misc', 'schemas').get(schemaName)
  if (!schema?.properties) return data

  // A primitive body cannot carry named properties; leave it for the validator
  // to reject rather than reshaping it into something that would pass.
  if (data != null && typeof data !== 'object') return data

  let result = data
  for (const key in schema.properties) {
    const property = schema.properties[key]
    if (typeof property === 'boolean' || !('default' in property)) {
      continue
    }
    // Allocated only once a default is actually found, so a schema without any
    // leaves the caller's data (and its absence) exactly as it was.
    result ??= {}
    if (result[key] === undefined) {
      result[key] = structuredClone(property.default)
    }
  }
  return result
}

export const coerceTopLevelDataFromSchema = (
  schemaName: string,
  data: any,
  packageName: string | null = null
) => {
  const schema = pikkuState(packageName, 'misc', 'schemas').get(schemaName)
  if (!schema?.properties) return
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
    const key = schemaKey(schemaName, packageName)
    const schemas = pikkuState(packageName, 'misc', 'schemas')
    const schema = schemas.get(schemaName)
    if (schema === undefined) {
      const availableSchemas = Array.from(schemas.keys())
      logger.error(
        `Schema '${schemaName}' not found for package '${packageName ?? 'main'}'. Available schemas: ${availableSchemas.join(', ') || '(none)'}`
      )
      throw new MissingSchemaError(
        `Schema '${schemaName}' not found. Ensure schema generation has been run.`
      )
    }
    await schemaService.compileSchema(key, schema)
    await schemaService.validateSchema(key, data ?? {})
  }
}
