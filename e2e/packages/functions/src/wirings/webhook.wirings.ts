import { wireHTTP } from '#pikku/pikku-types.gen.js'
import { triggerWebhook, webhookSink } from '../functions/webhook.functions.js'

// Enqueues an outgoing webhook (KyselyWebhookService → in-memory queue worker).
wireHTTP({
  route: '/api/webhook/trigger',
  method: 'post',
  auth: false,
  tags: ['e2e', 'webhook'],
  func: triggerWebhook,
})

// Delivery target the trigger points at, so the worker records a delivered attempt.
wireHTTP({
  route: '/api/webhook/sink',
  method: 'post',
  auth: false,
  tags: ['e2e', 'webhook'],
  func: webhookSink,
})
