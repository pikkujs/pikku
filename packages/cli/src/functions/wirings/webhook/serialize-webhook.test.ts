import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeWebhook } from './serialize-webhook.js'

describe('serializeWebhook', () => {
  test('wires the pikku-webhooks queue worker around the core delivery function', () => {
    const output = serializeWebhook('./pikku-types.gen.js')
    assert.ok(
      output.includes('wireQueueWorker'),
      'expected wireQueueWorker to be imported and called'
    )
    assert.ok(
      output.includes("name: 'pikku-webhooks'"),
      'expected a queue worker for the pikku-webhooks queue'
    )
    assert.ok(
      output.includes('pikkuWebhookWorkerFunc'),
      'expected the worker to delegate to the core pikkuWebhookWorkerFunc'
    )
    assert.ok(
      output.includes('@pikku/core/services'),
      'expected the core worker function to be imported from @pikku/core/services'
    )
    assert.ok(output.includes("tags: ['pikku']"))
  })

  test('imports the wiring helpers from the generated pikku types path', () => {
    const output = serializeWebhook('./pikku-types.gen.js')
    assert.ok(output.includes("from './pikku-types.gen.js'"))
    assert.ok(
      !output.includes('wireHTTP'),
      'outgoing webhooks have no HTTP surface'
    )
  })

  test('validates the job payload with a zod input schema, not generics', () => {
    const output = serializeWebhook('./pikku-types.gen.js')
    assert.ok(output.includes("from 'zod'"))
    assert.ok(output.includes('input: WebhookDeliverySchema'))
    assert.ok(
      !/pikkuSessionlessFunc</.test(output),
      'schema-based functions must not also pass type generics'
    )
  })
})
