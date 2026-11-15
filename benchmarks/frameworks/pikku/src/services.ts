import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku/setup'
import { LocalSecretService, LocalVariablesService } from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import type { RequiredSingletonServices } from '#pikku/pikku-services.gen.js'
import { openDb } from '../../shared/db.js'

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

/** Logging is off for the comparison: console output is silenced and the app logs nothing. */
console.info = console.debug = console.warn = () => {}

export const createConfig = pikkuConfig(async () => ({}))

export const createSingletonServices = pikkuServices(
  async (config, existingServices): Promise<RequiredSingletonServices> => {
    const variables = existingServices?.variables || new LocalVariablesService()
    const secrets =
      existingServices?.secrets || new LocalSecretService(variables)
    const logger = existingServices?.logger || noopLogger
    const schema = new CFWorkerSchemaService(logger as any)
    const kysely = openDb(process.env.BENCH_DB!)
    return {
      ...existingServices,
      config,
      secrets,
      logger,
      variables,
      schema,
      kysely,
    } as RequiredSingletonServices
  }
)

export const createWireServices = pikkuWireServices(async () => ({}))
