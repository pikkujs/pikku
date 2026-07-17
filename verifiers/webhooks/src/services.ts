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
      // Non-default on purpose, so the verifier proves the header is
      // config-driven rather than hardcoded.
      signatureHeader: 'X-Verifier-Signature',
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
    const queueService =
      existingServices?.queueService || new InMemoryQueueService()

    return {
      config,
      secrets,
      logger,
      variables,
      schema,
      queueService,
      webhookService:
        existingServices?.webhookService ||
        new QueueWebhookService(queueService),
    }
  }
)

export const createWireServices = pikkuWireServices(async () => {
  return {}
})
