import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku/setup'
import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import {
  getDeclaredAnalyticsEvents,
  type AnalyticsEventSink,
  type AnalyticsRecord,
} from '@pikku/core/analytics'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import type { RequiredSingletonServices } from '#pikku/pikku-services.gen.js'

export const delivered: AnalyticsRecord[] = []

const warehouse: AnalyticsEventSink = {
  write: async (batch) => void delivered.push(...batch),
}

export const createConfig = pikkuConfig(async () => ({}))

/**
 * Registers the sink the way a platform contributor does: for every event the
 * app declares, read from runtime state rather than from a meta file on disk.
 */
export const createSingletonServices = pikkuServices(
  async (config, existingServices): Promise<RequiredSingletonServices> => {
    const variables = existingServices?.variables || new LocalVariablesService()
    const secrets =
      existingServices?.secrets || new LocalSecretService(variables)
    const logger = existingServices?.logger || new ConsoleLogger()
    const schema = new CFWorkerSchemaService(logger)

    existingServices!.analyticsSinks!.add(
      warehouse,
      Object.fromEntries(
        getDeclaredAnalyticsEvents().map((name) => [name, true])
      )
    )

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

export const createWireServices = pikkuWireServices(async () => {
  return {}
})
