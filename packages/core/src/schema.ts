import type { Logger } from './services/logger.js'
import type { SchemaService } from './services/schema-service.js'
import {
  MissingSchemaError,
  UnprocessableContentError,
} from './errors/errors.js'
import { pikkuState, getAllPackageStates } from './pikku-state.js'

const schemaKey = (name: string, packageName: string | null): string =>
  packageName ? `${packageName}:${name}` : name

export const addSchema = (
  name: string,
  value: any,
  packageName: string | null = null
) => {
  const schema = value?.default ?? value
  pikkuState(packageName, 'misc', 'schemas').set(name, schema)
}

export const getSchema = (
  name: string,
  packageName: string | null = null
): Record<string, unknown> | undefined => {
  return pikkuState(packageName, 'misc', 'schemas').get(name)
}

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
 * Fills in absent top-level properties from their schema `default`. Applied
 * unconditionally: a default belongs to the schema, not to the transport the
 * call arrived on, and runs before coercion so a defaulted and a supplied
 * value are treated identically from here on. Values are cloned so an object
 * or array default is never shared as one mutable instance across requests.
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

/**
 * Drops object properties whose value is literally `undefined`.
 *
 * JSON Schema has no way to describe such a property, and the validator refuses
 * the whole instance rather than reporting it — `{ a: undefined }` throws
 * "Instances of \"undefined\" type are not supported" instead of validating.
 *
 * That matters because whether a payload can contain one depends on how the
 * call travelled. Over HTTP `JSON.stringify` drops these keys before the
 * request is built, so they never arrive. Dispatched in-process — an inline
 * workflow step calling an RPC — the object is handed over as-is, and
 * `{ retries: data.maybeRetries }` with the field omitted by the caller is
 * enough to kill the step. Normalising here makes the two paths agree, and an
 * explicitly-undefined *required* field now reports as the missing property it
 * is rather than as an internal error.
 *
 * Deliberately not a JSON round-trip: `coerceTopLevelDataFromSchema` puts real
 * `Date` instances on the data first, and stringifying would flatten them back
 * to strings the validator has never been given.
 */
const stripUndefinedValues = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map(stripUndefinedValues) as T
  if (value === null || typeof value !== 'object') return value
  // Only plain objects: a Date, Map or class instance is data, not a bag of
  // properties to be rewritten.
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return value

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, stripUndefinedValues(entry)])
  ) as T
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
    await schemaService.validateSchema(key, stripUndefinedValues(data ?? {}))
  }
}
