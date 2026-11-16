import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku/setup'
import { LocalSecretService, LocalVariablesService } from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import type { RequiredSingletonServices } from '#pikku/pikku-services.gen.js'

/** Same as the in-process bench: a logger that discards, so the cost measured is the framework's and not console I/O. */
const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

/**
 * The standalone entry's base logger is a ConsoleLogger. The in-process bench logs into a function that discards, so the same is done
 * here: console output is silenced (BENCH_QUIET=0 turns that off) and the measurement is the framework, not terminal I/O.
 */
if (process.env.BENCH_QUIET !== '0') {
  console.info = console.debug = console.warn = () => {}
}

export const createConfig = pikkuConfig(async () => ({}))

export const createSingletonServices = pikkuServices(
  async (config, existingServices): Promise<RequiredSingletonServices> => {
    const variables = existingServices?.variables || new LocalVariablesService()
    const secrets =
      existingServices?.secrets || new LocalSecretService(variables)
    // `existingServices.logger` is the runtime's telemetry logger (a wrapper at LE/L3); keep it, wrap nothing else.
    const logger = existingServices?.logger || noopLogger
    const schema = new CFWorkerSchemaService(logger as any)
    return {
      ...existingServices,
      config,
      secrets,
      logger,
      variables,
      schema,
    } as RequiredSingletonServices
  }
)

export const createWireServices = pikkuWireServices(async () => ({}))
