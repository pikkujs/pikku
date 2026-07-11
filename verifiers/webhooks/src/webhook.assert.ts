import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { after, before, beforeEach, describe, test } from 'node:test'

import '../.pikku/pikku-bootstrap.gen.js'
import type { WebhookService } from '@pikku/core/services'
import { createConfig, createSingletonServices } from './services.js'
import { startMockReceiver, type MockReceiver } from './mock-receiver.js'

const SIGNING_KEY = 'verifier-signing-key'

let webhookService: WebhookService
let receiver: MockReceiver

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number = 5000
): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for webhook delivery')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 250))

before(async () => {
  process.env.WEBHOOK_SIGNING_KEY = SIGNING_KEY
  const config = await createConfig()
  const singletonServices = await createSingletonServices(config)
  assert.ok(
    singletonServices.webhookService,
    'webhookService must be registered as a singleton service'
  )
  webhookService = singletonServices.webhookService
  receiver = await startMockReceiver()
})

after(async () => {
  await receiver.stop()
})

beforeEach(() => {
  receiver.received.length = 0
})

describe('outgoing webhook delivery (scaffolded pikku-webhooks queue worker)', () => {
  test('delivers a POST with the payload and a valid X-Pikku-Signature', async () => {
    receiver.respondWith([200])

    await webhookService.send({
      url: receiver.url,
      event: 'user.created',
      data: { id: 'u1', name: 'Ada' },
    })

    await waitFor(() => receiver.received.length === 1)
    const request = receiver.received[0]!
    assert.equal(request.method, 'POST')
    assert.deepEqual(JSON.parse(request.body), { id: 'u1', name: 'Ada' })
    assert.equal(request.headers['content-type'], 'application/json')
    assert.equal(request.headers['x-pikku-event'], 'user.created')

    const expectedSignature =
      'sha256=' +
      createHmac('sha256', SIGNING_KEY).update(request.body).digest('hex')
    assert.equal(request.headers['x-pikku-signature'], expectedSignature)
  })

  test('retries with backoff on non-2xx until the delivery succeeds', async () => {
    receiver.respondWith([500, 500, 200])

    await webhookService.send({
      url: receiver.url,
      data: { attempt: 'retry-path' },
      retries: 3,
      retryDelay: 1,
    })

    await waitFor(() => receiver.received.length === 3)
    await settle()
    assert.equal(
      receiver.received.length,
      3,
      'should stop retrying once a 2xx is returned'
    )
    const bodies = receiver.received.map((request) => JSON.parse(request.body))
    assert.deepEqual(bodies[0], bodies[2], 'payload is identical on retries')
  })

  test('stops after retries are exhausted', async () => {
    receiver.respondWith([500, 500, 500, 500])

    await webhookService.send({
      url: receiver.url,
      data: { attempt: 'exhaustion' },
      retries: 1,
      retryDelay: 1,
    })

    await waitFor(() => receiver.received.length === 2)
    await settle()
    assert.equal(
      receiver.received.length,
      2,
      'retries: 1 means exactly two attempts'
    )
  })
})
