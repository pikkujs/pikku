import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku/setup'
import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import type { RequiredSingletonServices } from '#pikku/pikku-services.gen.js'

export const createConfig = pikkuConfig(async () => {
  return {}
})

export const createSingletonServices = pikkuServices(
  async (config, existingServices): Promise<RequiredSingletonServices> => {
    const variables = existingServices?.variables || new LocalVariablesService()
    const secrets =
      existingServices?.secrets || new LocalSecretService(variables)
    const logger = new ConsoleLogger()
    const schema = new CFWorkerSchemaService(logger)

    // `telemetryStore` is what the greptime contributor provides, handed on
    // from the platform services. It is not in the generated
    // RequiredSingletonServices (a known contributor typing gap, see the
    // addon's knowledge note), so it is passed on untyped. There is no
    // fallback: without the contributor the function below reports it missing.
    return {
      config,
      secrets,
      logger,
      variables,
      schema,
      ...((existingServices as any)?.telemetryStore
        ? { telemetryStore: (existingServices as any).telemetryStore }
        : {}),
    } as unknown as RequiredSingletonServices
  }
)

export const createWireServices = pikkuWireServices(async () => {
  return {}
})
