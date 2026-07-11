import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku'
import {
  ConsoleLogger,
  InMemoryQueueService,
  LocalSecretService,
  LocalVariablesService,
  QueueWebhookService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import type { RequiredSingletonServices } from '#pikku/pikku-services.gen.js'

export const createConfig = pikkuConfig(async () => {
  return {
    webhook: {
      retries: 3,
      secret: 'WEBHOOK_SIGNING_KEY',
    },
  }
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
      queueService:
        existingServices?.queueService || new InMemoryQueueService(),
      webhookService:
        existingServices?.webhookService || new QueueWebhookService(),
    }
  }
)

export const createWireServices = pikkuWireServices(async () => {
  return {}
})
