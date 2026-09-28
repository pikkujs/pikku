import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku/setup'
import {
  ConsoleLogger,
  IncomingWebhookService,
  InMemoryQueueService,
  LocalSecretService,
  LocalVariablesService,
  QueueWebhookService,
} from '@pikku/core/services'
import { createHmac, timingSafeEqual } from 'node:crypto'
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
      // The mock receiver binds 127.0.0.1, which the SSRF guard blocks by
      // default; the allowlist is the opt-in escape hatch for internal hosts.
      allowedHosts: ['127.0.0.1'],
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
      incomingWebhookService:
        existingServices?.incomingWebhookService ||
        new IncomingWebhookService(queueService, 1),
      verifyShopSignature: async (body, signature) => {
        const secret = (await secrets.getSecret('SHOP_WEBHOOK_SECRET')).reveal()
        const expected = Buffer.from(
          createHmac('sha256', secret).update(body).digest('hex')
        )
        const given = Buffer.from(signature)
        return (
          expected.length === given.length && timingSafeEqual(expected, given)
        )
      },
    }
  }
)

export const createWireServices = pikkuWireServices(async () => {
  return {}
})
