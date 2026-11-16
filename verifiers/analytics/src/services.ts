import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku/setup'
import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import type { RequiredSingletonServices } from '#pikku/pikku-services.gen.js'
import {
  createAnalyticsSinks,
  type AnalyticsEventSink,
  type AnalyticsRecord,
} from '#pikku/analytics'

/** What the wire handed on, in the order the invocation flushed it. */
export const collectedAnalytics: AnalyticsRecord[][] = []

const collectingAnalyticsService: AnalyticsEventSink = {
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

    const analyticsSinks =
      existingServices?.analyticsSinks ?? createAnalyticsSinks()
    analyticsSinks.add(collectingAnalyticsService, {
      page_viewed: true,
      checkout_completed: true,
      profile_renamed: true,
    })

    return {
      config,
      secrets,
      logger,
      variables,
      schema,
      analyticsSinks,
    }
  }
)

export const createWireServices = pikkuWireServices(async () => {
  return {}
})
