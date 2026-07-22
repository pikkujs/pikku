export interface WebhookGenOutput {
  schemas: string
  functions: string
}

/**
 * Generate the outgoing webhook delivery queue worker.
 *
 * The handler is inlined: it is wired exactly once, so a named export would
 * only be indirection.
 */
export const serializeWebhook = (
  pathToPikkuTypes: string
): WebhookGenOutput => {
  const schemas = `/**
 * Auto-generated outgoing webhook delivery schemas
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { z } from 'zod'

export const WebhookDelivery = z.object({
  url: z.string(),
  event: z.string().optional(),
  body: z.string(),
  headers: z.record(z.string(), z.string()),
  deliveryId: z.string().optional(),
})
`

  const functions = `/**
 * Auto-generated outgoing webhook delivery queue worker
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc, wireQueueWorker } from '${pathToPikkuTypes}'
import { pikkuWebhookWorkerFunc } from '@pikku/core/services'
import { WebhookDelivery } from './webhook.schemas.gen.js'

wireQueueWorker({
  name: 'pikku-outgoing-webhooks',
  tags: ['pikku'],
  func: pikkuSessionlessFunc({
    tags: ['pikku'],
    input: WebhookDelivery,
    func: async (services, data) => pikkuWebhookWorkerFunc(services, data),
  }),
})
`

  return { schemas, functions }
}
