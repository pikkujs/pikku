import { z } from 'zod'
import { wireTriggerWebhookSource } from '../../.pikku/addon/trigger/index.js'
import { pingWebhookReceive } from './ping-receive.function.js'

wireTriggerWebhookSource({
  name: 'ping',
  events: { 'ping.sent': z.object({ n: z.number() }) },
  receive: pingWebhookReceive,
})
