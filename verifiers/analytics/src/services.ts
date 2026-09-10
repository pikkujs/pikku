import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku/setup'
import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import type { RequiredSingletonServices } from '#pikku/pikku-services.gen.js'
import type { AnalyticsRecord, AnalyticsService } from '@pikku/core/analytics'

/**
 * What the wire handed on, in the order the invocation flushed it.
 *
 * A project installs an `AnalyticsService` to decide where events go; this one
 * keeps them so the tests can read what the generated ingest actually accepted.
 */
export const collectedAnalytics: AnalyticsRecord[][] = []

const collectingAnalyticsService: AnalyticsService = {
  async record(event) {
    collectedAnalytics.push([event])
  },
  async write(batch) {
    collectedAnalytics.push(batch)
  },
}

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

    return {
      config,
      secrets,
      logger,
      variables,
      schema,
      analyticsService: collectingAnalyticsService,
    }
  }
)

export const createWireServices = pikkuWireServices(async () => {
  return {}
})
