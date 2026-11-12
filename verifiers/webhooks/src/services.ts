import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku/setup'
import {
  ConsoleLogger,
  IncomingWebhookService,
  LocalSecretService,
  LocalVariablesService,
  QueueWebhookService,
} from '@pikku/core/services'
import { InMemoryQueueService } from '@pikku/core/services/in-memory-queue'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import type { RequiredSingletonServices } from '#pikku/pikku-services.gen.js'
import { FileCredentialService } from './file-credential-service.js'

export const createConfig = pikkuConfig(async () => {
  return {
    webhook: {
      retries: 3,
      secret: 'WEBHOOK_SIGNING_KEY',
      // Non-default on purpose, so the verifier proves the header is
      // config-driven rather than hardcoded.
      signatureHeader: 'X-Verifier-Signature',
      // The mock receiver binds 127.0.0.1, which the SSRF guard blocks by
      // default. allowedHosts limits delivery to it; privateHosts is the
      // opt-in that lets it be a private address. One without the other fails.
      allowedHosts: ['127.0.0.1'],
      privateHosts: ['127.0.0.1'],
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
    const credentialService = new FileCredentialService(
      await variables.get('WEBHOOK_SCRATCH_DIR')
    )

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
      incomingWebhookService:
        existingServices?.incomingWebhookService ||
        new IncomingWebhookService(queueService, 1),
      credentialService,
    }
  }
)

export const createWireServices = pikkuWireServices(async () => {
  return {}
})
