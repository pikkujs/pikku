/**
 * Generate the outgoing webhook delivery queue worker
 */
export const serializeWebhook = (pathToPikkuTypes: string) => {
  return `/**
 * Auto-generated outgoing webhook delivery queue worker
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { z } from 'zod'
import { pikkuSessionlessFunc, wireQueueWorker } from '${pathToPikkuTypes}'
import { pikkuWebhookWorkerFunc } from '@pikku/core/services'

export const WebhookDeliverySchema = z.object({
  url: z.string(),
  event: z.string().optional(),
  body: z.string(),
  headers: z.record(z.string(), z.string()),
})

export const webhookDeliveryHandler = pikkuSessionlessFunc({
  tags: ['pikku'],
  input: WebhookDeliverySchema,
  func: async (services, data) => pikkuWebhookWorkerFunc(services, data),
})

wireQueueWorker({
  name: 'pikku-webhooks',
  tags: ['pikku'],
  func: webhookDeliveryHandler,
})
`
}
