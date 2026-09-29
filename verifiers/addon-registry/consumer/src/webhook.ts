/**
 * The addon declares a webhook source; this app mounts it at /webhooks/ext,
 * runs the addon's receive, and fires its own `ext:ping.sent` trigger.
 */
import { fetch } from '@pikku/core/http'
import {
  IncomingWebhookService,
  InMemoryQueueService,
} from '@pikku/core/services'
import { pikkuState } from '@pikku/core/state'
import { createConfig, createSingletonServices } from './services.js'
import { receivedPings } from './function/ping.trigger.js'

const queueService = new InMemoryQueueService()
pikkuState(null, 'package', 'singletonServices', {
  ...(await createSingletonServices(await createConfig())),
  queueService,
  incomingWebhookService: new IncomingWebhookService(queueService, 1),
})

const response = await fetch(
  new Request('http://localhost/webhooks/ext', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'p1', n: 7 }),
  })
)
if (response.status !== 200) {
  console.error(`✗ /webhooks/ext answered ${response.status}`)
  process.exit(1)
}

const start = Date.now()
while (receivedPings.length === 0 && Date.now() - start < 5000) {
  await new Promise((resolve) => setTimeout(resolve, 10))
}
if (receivedPings.join() !== '7') {
  console.error(`✗ ext:ping.sent fired with ${JSON.stringify(receivedPings)}`)
  process.exit(1)
}
console.log('✓ the addon webhook source delivered to the app trigger')
process.exit(0)
